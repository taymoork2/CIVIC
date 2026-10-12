import { v } from 'convex/values'
import { internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import { internalMutation, type MutationCtx } from './_generated/server'
import { pushLifetimeMs, validPushEndpoint } from './pushPolicy'
import { authorizeKey } from './access'
import { sessionless, sessionlessRecipient, stepRecipient } from './reminders'

declare const process: { readonly env: Readonly<Record<string, string | undefined>> }

/** Recheck both the recipient's access and the still-pending step before every network attempt. */
async function recipient(ctx: MutationCtx, reminder: Doc<'reminders'>): Promise<string | null> {
  if (reminder.status !== 'sent' || Date.now() > reminder.dueAt + pushLifetimeMs) return null
  let principal = reminder.recipientPrincipalKey
  if (reminder.kind === 'urgent_flag') {
    const flaggedAt = Number(reminder.flagKey?.slice(reminder.flagKey.lastIndexOf(':') + 1))
    const textiles = await Promise.all((reminder.textileIds ?? []).map((id) => ctx.db.get(id)))
    if (!textiles.some((item) => item !== null && item.householdId === reminder.householdId && item.trashedAt === undefined && item.status === 'dirty' && item.flag?.flaggedAt === flaggedAt)) return null
  } else if (sessionless(reminder)) {
    principal = await sessionlessRecipient(ctx, reminder) ?? undefined
  } else {
    if (reminder.sessionId === undefined) return null
    const session = await ctx.db.get(reminder.sessionId)
    if (session === null || session.status !== 'running' || session.householdId !== reminder.householdId) return null
    const timeline = await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', session._id)).unique()
    if (!timeline?.actions.some((action) => action.id === reminder.actionId && action.status === 'pending')) return null
    principal = stepRecipient(reminder, session)
  }
  if (principal === undefined) return null
  return await authorizeKey(ctx, principal, 'household.read', { householdId: reminder.householdId }) === null ? null : principal
}

export const enqueue = internalMutation({
  args: { reminderId: v.id('reminders') },
  returns: v.null(),
  handler: async (ctx, { reminderId }) => {
    if (process.env.WASHCLOSET_RECOVERY_MODE === 'rehearsal') return null
    if (!process.env.WEB_PUSH_PUBLIC_KEY || !process.env.WEB_PUSH_PRIVATE_KEY || !process.env.WEB_PUSH_SUBJECT) return null
    const reminder = await ctx.db.get(reminderId)
    const principal = reminder === null ? null : await recipient(ctx, reminder)
    if (principal === null) return null
    const existing = await ctx.db.query('pushDeliveries').withIndex('by_reminder', (q) => q.eq('reminderId', reminderId)).collect()
    const subscriptions = await ctx.db.query('notificationSubscriptions').withIndex('by_principal', (q) => q.eq('principalKey', principal)).collect()
    for (const subscription of subscriptions) {
      if (subscription.revokedAt !== undefined || subscription.endpoint === undefined || subscription.keys === undefined || existing.some((delivery) => delivery.subscriptionId === subscription._id)) continue
      const deliveryId = await ctx.db.insert('pushDeliveries', { reminderId, subscriptionId: subscription._id, status: 'queued', attempts: 0 })
      await ctx.scheduler.runAfter(0, internal.push.send, { deliveryId })
    }
    return null
  },
})

export const claim = internalMutation({
  args: { deliveryId: v.id('pushDeliveries') },
  returns: v.union(v.null(), v.object({ endpoint: v.string(), keys: v.object({ p256dh: v.string(), auth: v.string() }), tag: v.string(), url: v.string(), ttl: v.number(), attempt: v.number() })),
  handler: async (ctx, { deliveryId }) => {
    if (process.env.WASHCLOSET_RECOVERY_MODE === 'rehearsal') return null
    const delivery = await ctx.db.get(deliveryId)
    if (delivery === null || delivery.status === 'sent' || delivery.status === 'cancelled') return null
    if (delivery.status === 'sending' && Date.now() - (delivery.lastAttemptAt ?? 0) < 60_000) return null
    const reminder = await ctx.db.get(delivery.reminderId)
    const principal = reminder === null ? null : await recipient(ctx, reminder)
    const subscription = await ctx.db.get(delivery.subscriptionId)
    if (principal === null || subscription === null || subscription.principalKey !== principal || subscription.revokedAt !== undefined || subscription.endpoint === undefined || subscription.keys === undefined || !validPushEndpoint(subscription.endpoint) || delivery.attempts >= 3) {
      await ctx.db.patch(deliveryId, { status: 'cancelled' })
      return null
    }
    const attempt = delivery.attempts + 1
    await ctx.db.patch(deliveryId, { status: 'sending', attempts: attempt, lastAttemptAt: Date.now() })
    // A crashed action can be retried after its lease. The same notification tag replaces duplicates.
    await ctx.scheduler.runAfter(60_000, internal.push.send, { deliveryId })
    return { endpoint: subscription.endpoint, keys: subscription.keys, tag: `laundry-${delivery.reminderId}`, url: reminder!.kind === 'dryer_done' || reminder!.kind === 'dryer_check' ? '/drying' : reminder!.sessionId === undefined ? '/laundry' : `/session/${reminder!.sessionId}`, ttl: Math.max(1, Math.floor((reminder!.dueAt + pushLifetimeMs - Date.now()) / 1000)), attempt }
  },
})

export const finish = internalMutation({
  args: { deliveryId: v.id('pushDeliveries'), attempt: v.number(), result: v.union(v.literal('sent'), v.literal('failed'), v.literal('expired')) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId)
    if (delivery === null || delivery.status !== 'sending' || delivery.attempts !== args.attempt) return null
    await ctx.db.patch(delivery._id, { status: args.result === 'expired' ? 'cancelled' : args.result, ...(args.result === 'sent' ? { sentAt: Date.now() } : {}) })
    if (args.result === 'expired') {
      const subscription = await ctx.db.get(delivery.subscriptionId)
      if (subscription !== null) await ctx.db.patch(subscription._id, { revokedAt: Date.now(), endpoint: undefined, keys: undefined })
    }
    return null
  },
})
