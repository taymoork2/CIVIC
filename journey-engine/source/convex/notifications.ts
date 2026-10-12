import { v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { authorize, visible } from './access'
import { fail, nonEmpty } from './errors'
import { principalFromAuth } from './principal'
import { validPushEndpoint, validPushKeys } from './pushPolicy'

declare const process: { readonly env: Readonly<Record<string, string | undefined>> }

export const pushConfiguration = query({
  args: {},
  returns: v.union(v.null(), v.object({ publicKey: v.string() })),
  handler: async (ctx) => {
    await principalFromAuth(ctx.auth)
    const publicKey = process.env.WEB_PUSH_PUBLIC_KEY
    return publicKey && process.env.WEB_PUSH_PRIVATE_KEY && process.env.WEB_PUSH_SUBJECT ? { publicKey } : null
  },
})

export const deviceSubscription = query({
  args: { deviceId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const actor = await principalFromAuth(ctx.auth)
    const subscriptions = await ctx.db.query('notificationSubscriptions').withIndex('by_device', (q) => q.eq('principalKey', actor.key).eq('deviceId', args.deviceId)).collect()
    return subscriptions.some((entry) => entry.revokedAt === undefined && entry.endpoint !== undefined && entry.keys !== undefined)
  },
})

export const subscribe = mutation({
  args: { deviceId: v.string(), endpointHash: v.string(), endpoint: v.optional(v.string()), keys: v.optional(v.object({ p256dh: v.string(), auth: v.string() })) },
  returns: v.object({ subscriptionId: v.id('notificationSubscriptions'), deviceId: v.string() }),
  handler: async (ctx, args) => {
    nonEmpty(args.deviceId, 'deviceId')
    nonEmpty(args.endpointHash, 'endpointHash')
    const actor = await principalFromAuth(ctx.auth)
    if (args.deviceId.length > 120 || args.endpointHash.length > 120) fail('invalid', 'Invalid device subscription')
    if ((args.endpoint === undefined) !== (args.keys === undefined) || (args.endpoint !== undefined && (!validPushEndpoint(args.endpoint) || !validPushKeys(args.keys!)))) fail('invalid', 'Invalid push subscription')
    const existing = await ctx.db
      .query('notificationSubscriptions')
      .withIndex('by_device', (q) => q.eq('principalKey', actor.key).eq('deviceId', args.deviceId))
      .collect()
    const active = existing.find((subscription) => subscription.revokedAt === undefined)
    if (active !== undefined && active.endpointHash === args.endpointHash && active.endpoint === args.endpoint && active.keys?.p256dh === args.keys?.p256dh && active.keys?.auth === args.keys?.auth) return { subscriptionId: active._id, deviceId: args.deviceId }
    // A browser endpoint belongs to one signed-in account at a time, even on shared devices.
    if (args.endpoint !== undefined) {
      const all = await ctx.db.query('notificationSubscriptions').withIndex('by_endpoint', (q) => q.eq('endpoint', args.endpoint)).collect()
      for (const subscription of all) {
        if (subscription.endpoint === args.endpoint && subscription.revokedAt === undefined) await ctx.db.patch(subscription._id, { revokedAt: Date.now(), endpoint: undefined, keys: undefined })
      }
    }
    const now = Date.now()
    for (const subscription of existing) {
      if (subscription.revokedAt === undefined) await ctx.db.patch(subscription._id, { revokedAt: now, endpoint: undefined, keys: undefined })
    }
    const subscriptionId = await ctx.db.insert('notificationSubscriptions', {
      principalKey: actor.key,
      deviceId: args.deviceId,
      endpointHash: args.endpointHash,
      ...(args.endpoint === undefined ? {} : { endpoint: args.endpoint, keys: args.keys }),
      createdAt: now,
    })
    return { subscriptionId, deviceId: args.deviceId }
  },
})

export const revoke = mutation({
  args: { deviceId: v.string() },
  returns: v.object({ deviceId: v.string(), revoked: v.number() }),
  handler: async (ctx, args) => {
    nonEmpty(args.deviceId, 'deviceId')
    const actor = await principalFromAuth(ctx.auth)
    const subscriptions = await ctx.db
      .query('notificationSubscriptions')
      .withIndex('by_device', (q) => q.eq('principalKey', actor.key).eq('deviceId', args.deviceId))
      .collect()
    const revokedAt = Date.now()
    let revoked = 0
    for (const subscription of subscriptions) {
      if (subscription.revokedAt === undefined) {
        await ctx.db.patch(subscription._id, { revokedAt, endpoint: undefined, keys: undefined })
        revoked += 1
      }
    }
    return { deviceId: args.deviceId, revoked }
  },
})

export const revokeAll = mutation({
  args: {},
  returns: v.object({ revoked: v.number() }),
  handler: async (ctx) => {
    const actor = await principalFromAuth(ctx.auth)
    const subscriptions = await ctx.db
      .query('notificationSubscriptions')
      .withIndex('by_principal', (q) => q.eq('principalKey', actor.key))
      .collect()
    const revokedAt = Date.now()
    let revoked = 0
    for (const subscription of subscriptions) {
      if (subscription.revokedAt === undefined) {
        await ctx.db.patch(subscription._id, { revokedAt, endpoint: undefined, keys: undefined })
        revoked += 1
      }
    }
    return { revoked }
  },
})

/**
 * The caller's urgent-flag heads-ups that were delivered and not shown yet. The web shows each one
 * (a system notification, or a toast) and then marks it shown.
 */
export const flagAlerts = query({
  args: { householdId: v.id('households') },
  handler: async (ctx, args) => {
    const actor = (await authorize(ctx, 'household.read', { householdId: args.householdId })).actor
    const sent = await ctx.db
      .query('reminders')
      .withIndex('by_recipient_status', (q) => q.eq('recipientPrincipalKey', actor.key).eq('status', 'sent'))
      .collect()
    const alerts = sent.filter((reminder) => reminder.householdId === args.householdId && reminder.kind === 'urgent_flag' && reminder.shownAt === undefined)
    if (alerts.length === 0) return []
    const wearers = await ctx.db.query('wearers').withIndex('by_household', (q) => q.eq('householdId', args.householdId)).collect()
    const shown = await Promise.all(alerts.map(async (reminder) => {
      const flaggedBy = reminder.flaggedBy
      const person = flaggedBy === undefined ? null : await ctx.db.query('people').withIndex('by_principal_key', (q) => q.eq('principalKey', flaggedBy)).unique()
      const textiles = await Promise.all((reminder.textileIds ?? []).map((textileId) => ctx.db.get(textileId)))
      const active = await visible(ctx, actor, textiles.flatMap((textile) => textile !== null && textile.householdId === args.householdId && textile.trashedAt === undefined ? [textile] : []))
      if (active.length === 0) return null
      return {
        reminderId: reminder._id,
        flaggerName: wearers.find((wearer) => flaggedBy !== undefined && wearer.principalKey === flaggedBy)?.name ?? person?.displayName ?? null,
        itemName: active[0]?.name ?? null,
        count: active.length,
        neededBy: reminder.neededBy ?? null,
      }
    }))
    return shown.filter((alert) => alert !== null)
  },
})

/** The recipient's device showed the heads-up: it is done. */
export const markAlertShown = mutation({
  args: { reminderId: v.id('reminders') },
  returns: v.null(),
  handler: async (ctx, args) => {
    await principalFromAuth(ctx.auth)
    const reminder = await ctx.db.get(args.reminderId)
    if (reminder === null) fail('not_found', 'Not found')
    if (reminder.kind !== 'urgent_flag') fail('forbidden', 'Forbidden')
    await authorize(ctx, 'reminder.dismiss', { householdId: reminder.householdId, subjects: reminder.recipientPrincipalKey === undefined ? [] : [reminder.recipientPrincipalKey] })
    await ctx.db.patch(reminder._id, { shownAt: Date.now(), status: 'completed' })
    return null
  },
})
