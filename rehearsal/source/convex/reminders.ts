import { v } from 'convex/values'

import { internalMutation, type MutationCtx, type QueryCtx } from './_generated/server'
import { internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import { authorizeKey } from './access'

declare const process: { readonly env: Readonly<Record<string, string | undefined>> }

/** When a dryer run's current timer runs out; a restart for damp pieces moves it. */
export const runEnd = (run: Pick<Doc<'dryingRuns'>, 'startedAt' | 'minutes'>): number | null => run.minutes === undefined ? null : run.startedAt + run.minutes * 60_000

/**
 * Whether a reminder without a session still stands, and for whom. `dryer_done`: its run is still
 * running and still ends when the reminder is due (a restart for damp pieces makes a new one).
 * `dryer_check`: its run is still running and its mid-run check is still to do.
 * `start_load`: its plan is current and the load has no session yet. Null for other kinds.
 */
export async function sessionlessRecipient(ctx: Pick<QueryCtx, 'db'>, reminder: Doc<'reminders'>): Promise<string | null> {
  if (reminder.kind === 'dryer_done') {
    const run = reminder.dryingRunId === undefined ? null : await ctx.db.get(reminder.dryingRunId)
    if (run === null || run.householdId !== reminder.householdId || run.status !== 'running' || runEnd(run) !== reminder.dueAt) return null
    // Whoever asked; a reminder saved before askers were recorded goes to the run's plan creator.
    return reminder.recipientPrincipalKey ?? await planCreator(ctx, await ctx.db.query('dryingPieces').withIndex('by_run', (q) => q.eq('dryingRunId', run._id)).collect(), run.startedBy)
  }
  if (reminder.kind === 'dryer_check') {
    const run = reminder.dryingRunId === undefined ? null : await ctx.db.get(reminder.dryingRunId)
    if (run === null || run.householdId !== reminder.householdId || run.status !== 'running' || run.midCheck?.checkAt !== reminder.dueAt || run.midCheck.checkedAt !== undefined) return null
    return reminder.recipientPrincipalKey ?? run.startedBy
  }
  if (reminder.kind === 'start_load') {
    const plan = reminder.planId === undefined ? null : await ctx.db.get(reminder.planId)
    if (plan === null || plan.householdId !== reminder.householdId || plan.status === 'stale' || plan.status === 'retired' || reminder.loadId === undefined) return null
    const sessions = await ctx.db.query('sessions').withIndex('by_plan_load_status', (q) => q.eq('planId', plan._id).eq('loadId', reminder.loadId)).collect()
    if (sessions.some((session) => session.status !== 'cancelled')) return null
    // Held back from a dryer time: it stands only while that time does.
    if (reminder.basis !== undefined && !await timingBasisHolds(ctx, reminder, reminder.basis)) return null
    return reminder.recipientPrincipalKey ?? null
  }
  return null
}

/**
 * Who a dryer run's reminders go to: whoever created the laundry plan its pieces were washed from,
 * when that is one person; otherwise `fallback`, whoever started the run.
 */
export async function planCreator(ctx: Pick<QueryCtx, 'db'>, pieces: readonly Pick<Doc<'dryingPieces'>, 'washSessionId'>[], fallback: string): Promise<string> {
  const creators = new Set<string>()
  for (const sessionId of new Set(pieces.map((piece) => piece.washSessionId))) {
    const session = await ctx.db.get(sessionId)
    // A plan is released once its loads are done; the session keeps who created it.
    const creator = session === null ? undefined : session.planCreatedBy ?? (await ctx.db.get(session.planId))?.createdBy
    if (creator === undefined) return fallback
    creators.add(creator)
  }
  return creators.size === 1 ? [...creators][0]! : fallback
}

/**
 * Whether the dryer time a held-back start was timed from still holds: the run is still running and
 * still ends then (an extension or a restart moves it), or the wash is still in its dryer and its
 * dryer time still ends then. A time the person typed ("Dryer says") lives only on their phone, so
 * it stands while the dryer it was typed for is still running.
 */
async function timingBasisHolds(ctx: Pick<QueryCtx, 'db'>, reminder: Doc<'reminders'>, basis: NonNullable<Doc<'reminders'>['basis']>): Promise<boolean> {
  const runId = ctx.db.normalizeId('dryingRuns', basis.key)
  if (runId !== null) {
    const run = await ctx.db.get(runId)
    return run !== null && run.householdId === reminder.householdId && run.status === 'running' && (basis.source === 'says' || runEnd(run) === basis.end)
  }
  const sessionId = ctx.db.normalizeId('sessions', basis.key)
  const session = sessionId === null ? null : await ctx.db.get(sessionId)
  if (session === null || session.householdId !== reminder.householdId || session.status !== 'running' || session.dryerStartedAt === undefined) return false
  const timeline = await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', session._id)).unique()
  if (timeline?.actions.some((action) => action.phase === 'dryer_unload' && action.status !== 'pending')) return false
  const minutes = timeline?.drying?.status === 'ready' ? timeline.drying.minutes : undefined
  return basis.source === 'says' || (minutes !== undefined && session.dryerStartedAt + minutes * 60_000 === basis.end)
}

/** A new reminder, delivered at `dueAt` or at once when that has passed. */
export async function scheduleReminder(ctx: MutationCtx, fields: Omit<Doc<'reminders'>, '_id' | '_creationTime' | 'status' | 'scheduledFunctionId'>): Promise<void> {
  await schedule(ctx, await ctx.db.insert('reminders', { ...fields, status: 'scheduled' }), fields.dueAt)
}

/** Schedules delivery at `dueAt`, or at once when that has passed. */
async function schedule(ctx: MutationCtx, reminderId: Id<'reminders'>, dueAt: number): Promise<void> {
  const scheduledFunctionId = await ctx.scheduler.runAt(Math.max(Date.now(), dueAt), internal.reminders.deliver, { reminderId })
  await ctx.db.patch(reminderId, { scheduledFunctionId })
}

/** Sends a due reminder that still stands, else cancels it. */
async function settle(ctx: MutationCtx, reminder: Doc<'reminders'>, stands: boolean): Promise<null> {
  await ctx.db.patch(reminder._id, { status: stands ? 'sent' : 'cancelled' })
  if (stands) await ctx.scheduler.runAfter(0, internal.pushDelivery.enqueue, { reminderId: reminder._id })
  return null
}

/** Who a running wash's step reminder goes to: whoever asked for it, else the plan's creator, else whoever started the wash. */
export const stepRecipient = (reminder: Pick<Doc<'reminders'>, 'recipientPrincipalKey'>, session: Pick<Doc<'sessions'>, 'planCreatedBy' | 'startedBy'>): string | undefined =>
  reminder.recipientPrincipalKey ?? session.planCreatedBy ?? session.startedBy

export const sessionless = (reminder: Doc<'reminders'>) => reminder.kind === 'dryer_done' || reminder.kind === 'dryer_check' || reminder.kind === 'start_load'

/** Admin-only isolated drill: recreate native schedules excluded from snapshots, without sends. */
export const reconstruct = internalMutation({
  args: {},
  returns: v.object({ scheduled: v.number(), alreadyScheduled: v.number(), cancelled: v.number() }),
  handler: async (ctx) => {
    if (process.env.WASHCLOSET_RECOVERY_MODE !== 'rehearsal') throw new Error('Recovery requires isolated rehearsal mode')
    let scheduled = 0, alreadyScheduled = 0, cancelled = 0
    for (const reminder of await ctx.db.query('reminders').collect()) {
      // A snapshot never authorizes replaying a sent, completed or cancelled notification.
      if (reminder.status !== 'scheduled') continue
      if (reminder.scheduledFunctionId !== undefined) {
        const existing = await ctx.db.system.get(reminder.scheduledFunctionId)
        if (existing?.state.kind === 'pending' || existing?.state.kind === 'inProgress') {
          alreadyScheduled++
          continue
        }
      }
      let valid = false
      if (reminder.kind === 'urgent_flag') {
        const at = Number(reminder.flagKey?.slice(reminder.flagKey.lastIndexOf(':') + 1))
        const items = await Promise.all((reminder.textileIds ?? []).map((id) => ctx.db.get(id)))
        const member = reminder.recipientPrincipalKey === undefined ? null : await authorizeKey(ctx, reminder.recipientPrincipalKey, 'household.read', { householdId: reminder.householdId })
        valid = member !== null && items.some((item) => item !== null && item.householdId === reminder.householdId && item.trashedAt === undefined && item.status === 'dirty' && item.flag?.flaggedAt === at)
      } else if (sessionless(reminder)) {
        valid = await sessionlessRecipient(ctx, reminder) !== null
      } else if (reminder.sessionId !== undefined) {
        const session = await ctx.db.get(reminder.sessionId)
        const timeline = await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', reminder.sessionId!)).unique()
        const recipient = session === null ? undefined : stepRecipient(reminder, session)
        const member = recipient === undefined ? null : await authorizeKey(ctx, recipient, 'household.read', { householdId: reminder.householdId })
        valid = session !== null && session.householdId === reminder.householdId && session.status === 'running'
          && member !== null && timeline?.actions.some((action) => action.id === reminder.actionId && action.status === 'pending') === true
      }
      if (!valid) {
        await ctx.db.patch(reminder._id, { status: 'cancelled', scheduledFunctionId: undefined })
        cancelled++
        continue
      }
      await schedule(ctx, reminder._id, reminder.dueAt)
      scheduled++
    }
    return { scheduled, alreadyScheduled, cancelled }
  },
})

/**
 * Marks a due reminder as sent. A step reminder only prompts: the person still records the step
 * themselves. An urgent-flag heads-up is sent while the flag still stands, and cancelled otherwise.
 */
export const deliver = internalMutation({
  args: { reminderId: v.id('reminders') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const reminder = await ctx.db.get(args.reminderId)
    if (reminder === null || reminder.status !== 'scheduled') return null
    if (reminder.kind === 'urgent_flag') {
      // The flag key is "{flaggedBy}:{flaggedAt}"; principal keys contain colons, the time does not.
      const flaggedAt = Number(reminder.flagKey?.slice(reminder.flagKey.lastIndexOf(':') + 1))
      const textiles = await Promise.all((reminder.textileIds ?? []).map((textileId) => ctx.db.get(textileId)))
      return settle(ctx, reminder, textiles.some((textile) => textile !== null && textile.trashedAt === undefined && textile.status === 'dirty' && textile.flag?.flaggedAt === flaggedAt))
    }
    if (sessionless(reminder)) return settle(ctx, reminder, await sessionlessRecipient(ctx, reminder) !== null)
    // Only a step reminder is delivered here; it always carries its session.
    if (reminder.sessionId === undefined) return null
    const session = await ctx.db.get(reminder.sessionId)
    if (session === null || session.status !== 'running') {
      await ctx.db.patch(reminder._id, { status: 'cancelled' })
      return null
    }
    const timeline = await ctx.db
      .query('timelines')
      .withIndex('by_session', (q) => q.eq('sessionId', session._id))
      .unique()
    const action = timeline?.actions.find((candidate) => candidate.id === reminder.actionId)
    if (action === undefined || action.status !== 'pending') {
      await ctx.db.patch(reminder._id, { status: action?.status === 'confirmed' ? 'completed' : 'cancelled' })
      return null
    }
    return settle(ctx, reminder, true)
  },
})
