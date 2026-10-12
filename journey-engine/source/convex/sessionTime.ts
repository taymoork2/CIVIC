import { v } from 'convex/values'

import { mutation } from './_generated/server'
import { authorize } from './access'
import { fail } from './errors'
import { machineFor, rebuildTimeline, recordedTimes, sessionLoad } from './execution'
import { recordedCycle } from './plans'

/** The most one "Add time" may add: the washer's own display never offers more than a couple of hours. */
const maxAddedMinutes = 120

/**
 * "Add time" on a running wash: the machine still has minutes to go, so the wash's length grows by
 * what the person adds. The shown length becomes the minutes already on the timer (the minutes the
 * washer showed at Start, else the recorded cycle length) plus these; the finish time and any
 * mid-cycle step due times are worked out again from it.
 */
export const addMinutes = mutation({
  args: { sessionId: v.id('sessions'), minutes: v.number() },
  returns: v.object({ sessionId: v.id('sessions'), cycleMinutesShown: v.number() }),
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.minutes) || args.minutes < 1 || args.minutes > maxAddedMinutes) fail('invalid', `Add between 1 and ${maxAddedMinutes} minutes`)
    const session = (await authorize(ctx, 'session.run', { sessionId: args.sessionId })).session
    if (session.status !== 'running') fail('conflict', 'Session is not running')
    if (session.machineStartedAt === undefined) fail('conflict', 'The machine has not been started yet')
    if (session.washFinishedAt !== undefined) fail('conflict', 'The wash has already finished')
    const timeline = await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', session._id)).unique()
    if (timeline === null) fail('not_found', 'Execution timeline not found')
    const load = await sessionLoad(ctx, session, timeline)
    const machine = await machineFor(ctx, session.householdId, timeline.machineId, load.machineId)
    // With no length on record at all, the time already gone is the base: the timer then ends `minutes` from now.
    const base = session.cycleMinutesShown
      ?? recordedCycle(machine, session.cycle ?? load.cycle)?.minutes
      ?? Math.max(0, Math.ceil((Date.now() - session.machineStartedAt) / 60_000))
    const shown = Math.round((base + args.minutes) * 100) / 100
    await rebuildTimeline(ctx, session, timeline, load, machine, { ...recordedTimes(session), shownMinutes: shown })
    await ctx.db.patch(session._id, { cycleMinutesShown: shown, revision: session.revision + 1 })
    return { sessionId: session._id, cycleMinutesShown: shown }
  },
})
