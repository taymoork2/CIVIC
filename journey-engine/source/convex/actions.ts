import { v } from 'convex/values'

import { doorLocksDuringCycle, isDryerPhase, washerPrepPhases, markFractionProblem } from '@washcloset/planner'

import type { Doc } from './_generated/dataModel'
import { mutation, type MutationCtx } from './_generated/server'
import { authorize, related } from './access'
import { fail, nonEmpty } from './errors'
import { applyDryerStart, applyMachineStart, clientTime, estimatedWashFinish, recordHistory, settleReminder, unsupportedPreparationActions } from './execution'
import { principalFromAuth } from './principal'
import { internal } from './_generated/api'

/** A measured, label-supported container soak, owned by an accepted pretreatment step. */
export const beginSoak = mutation({
  args: { sessionId: v.id('sessions'), actionId: v.string(), waterLitres: v.number(), temperatureC: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = (await authorize(ctx, 'session.run', { sessionId: args.sessionId })).session
    const timeline = await runningTimeline(ctx, session)
    const index = timeline.actions.findIndex((action) => action.id === args.actionId)
    const action = timeline.actions[index]
    if (action?.kind !== 'treatment' || action.soak === undefined || action.status !== 'pending' || session.machineStartedAt !== undefined) fail('conflict', 'This load has no pending label-supported soak')
    if (action.soakStarted !== undefined) {
      if (action.soakStarted.waterLitres !== args.waterLitres || action.soakStarted.temperatureC !== args.temperatureC) fail('conflict', 'This soak already has recorded measurements')
      return null
    }
    if (!Number.isFinite(args.waterLitres) || args.waterLitres < 0.1 || args.waterLitres > 50 || !Number.isFinite(args.temperatureC) || args.temperatureC < 0 || args.temperatureC > action.soak.maximumTemperatureC) fail('invalid', 'Check measured water volume and the recorded temperature limit')
    if (timeline.actions.some((candidate) => candidate.order < action.order && candidate.status === 'pending')) fail('conflict', 'Finish the earlier preparation step first')
    const [supply] = (await related(ctx, session.householdId, { supplyIds: [action.supplyId] })).supplies as [Doc<'supplies'>]
    const actor = await principalFromAuth(ctx)
    const at = Date.now()
    const amount = action.dose.amount * args.waterLitres / action.soak.waterLitres
    if (!Number.isFinite(amount) || amount <= 0) fail('invalid', 'A measured label dose is required')
    const started = { at, waterLitres: args.waterLitres, temperatureC: args.temperatureC, productName: supply.name, amount }
    const actions = [...timeline.actions]
    actions[index] = { ...action, soakStarted: started, dose: { ...action.dose, amount }, dueAt: at + action.soak.minimumMinutes * 60_000 }
    await ctx.db.patch(timeline._id, { actions, revision: timeline.revision + 1 })
    await ctx.db.insert('usage', { householdId: session.householdId, sessionId: session._id, actionId: action.id, supplyId: supply._id, productName: supply.name, productContext: { capturedAt: Date.now(), provenance: supply.provenance, ...(supply.formulation === undefined ? {} : { formulation: supply.formulation }), ...(supply.safety === undefined ? {} : { safety: supply.safety }), ...(supply.fixtureKey === undefined ? {} : { fixtureKey: supply.fixtureKey }), ...(supply.catalogBinding === undefined ? {} : { catalogBinding: supply.catalogBinding }) }, amount, unit: action.dose.unit, placement: action.placement, usedAt: at, confirmedBy: actor.key })
    for (const minutes of [...new Set([action.soak.minimumMinutes, action.soak.maximumMinutes])]) {
      const dueAt = at + minutes * 60_000
      const reminderId = await ctx.db.insert('reminders', { householdId: session.householdId, sessionId: session._id, actionId: action.id, status: 'scheduled', dueAt })
      const scheduledFunctionId = await ctx.scheduler.runAt(dueAt, internal.reminders.deliver, { reminderId })
      await ctx.db.patch(reminderId, { scheduledFunctionId })
    }
    return null
  },
})

const recordedStatus = v.union(v.literal('confirmed'), v.literal('skipped'), v.literal('missed'))

async function runningTimeline(ctx: MutationCtx, session: Doc<'sessions'>): Promise<Doc<'timelines'>> {
  if (session.status !== 'running') fail('conflict', 'Session is not running')
  const timeline = await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', session._id)).unique()
  if (timeline === null) fail('not_found', 'Execution timeline not found')
  return timeline
}

/**
 * Records one step of a running load. Steps are recorded in the order they happen at the machine:
 * Start needs every earlier step, once a locked door is shut nothing more can be confirmed as added,
 * and nothing is taken out for drying until the wash has finished.
 */
export const recordAction = mutation({
  args: {
    sessionId: v.id('sessions'),
    actionId: v.string(),
    status: recordedStatus,
    usage: v.optional(v.object({
      supplyId: v.id('supplies'),
      amount: v.number(),
      unit: v.string(),
      /** The cap or scoop mark filled to, as printed; `amount` is then the number of fills. */
      mark: v.optional(v.string()),
      fractionOfMark: v.optional(v.number()),
      target: v.optional(v.union(v.literal('below'), v.literal('just_below'))),
      approximate: v.optional(v.boolean()),
      placement: v.string(),
    })),
    /** When the step was done by the phone's clock: a tap queued offline keeps its own time. */
    at: v.optional(v.number()),
    /** At Start: the minutes the washer shows. The wash timer counts from these. */
    minutes: v.optional(v.number()),
    receiptId: v.optional(v.string()),
    expectedTimelineRevision: v.optional(v.number()),
  },
  returns: v.object({ sessionId: v.id('sessions'), actionId: v.string(), status: recordedStatus }),
  handler: async (ctx, args) => {
    nonEmpty(args.actionId, 'actionId')
    if (args.status !== 'confirmed' && args.usage !== undefined) fail('invalid', 'Skipped or missed actions cannot record usage')
    const mark = args.usage?.mark?.trim()
    if (args.usage !== undefined) {
      if (!Number.isFinite(args.usage.amount) || args.usage.amount <= 0) fail('invalid', 'Usage amount must be positive')
      nonEmpty(args.usage.unit, 'Usage unit')
      nonEmpty(args.usage.placement, 'Usage placement')
      if (mark !== undefined && (mark.length === 0 || mark.length > 40)) fail('invalid', 'A mark is the words printed on the cap, up to 40 characters')
      if (mark !== undefined && args.usage.unit !== 'cap' && args.usage.unit !== 'scoop') fail('invalid', 'Only a cap or scoop is filled to a mark')
      const fractionProblem = markFractionProblem({ ...args.usage, mark })
      if (fractionProblem !== null) fail('invalid', fractionProblem)
      if (args.usage.target !== undefined && (args.usage.unit !== 'cap' || mark === undefined || args.usage.amount !== 1 || args.usage.fractionOfMark !== undefined || args.usage.approximate !== undefined)) fail('invalid', 'A qualitative fill target requires one cap mark without a numerical fraction')
      if (args.usage.approximate !== undefined && (args.usage.approximate !== true || args.usage.unit !== 'US_cup' || mark !== undefined || args.usage.fractionOfMark !== undefined)) fail('invalid', 'Record an approximate cup amount without a mark or conversion')
    }

    const session = (await authorize(ctx, 'session.run', { sessionId: args.sessionId })).session
    const actor = await principalFromAuth(ctx)
    if (args.receiptId !== undefined && !/^[a-zA-Z0-9-]{16,100}$/.test(args.receiptId)) fail('invalid', 'Invalid step receipt')
    const receiptPayload = JSON.stringify([args.status, args.at ?? null, args.minutes ?? null, args.usage === undefined ? null : [args.usage.supplyId, args.usage.amount, args.usage.unit, mark ?? null, args.usage.placement, ...(args.usage.fractionOfMark === undefined ? [] : [args.usage.fractionOfMark]), ...(args.usage.target === undefined && args.usage.approximate === undefined ? [] : [args.usage.target ?? null, args.usage.approximate ?? null])]])
    const timeline = await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', session._id)).unique()
    if (timeline === null) fail('not_found', 'Execution timeline not found')
    const actions = [...timeline.actions]
    const index = actions.findIndex((action) => action.id === args.actionId)
    if (index < 0) fail('not_found', 'Action not found')
    const action = actions[index]!
    if (args.receiptId !== undefined && action.receiptId === args.receiptId) {
      if (action.status !== args.status || action.recordedBy !== actor.key || action.receiptPayload !== receiptPayload) fail('conflict', 'This step receipt has different recorded details')
      return { sessionId: session._id, actionId: args.actionId, status: args.status }
    }
    if (session.status !== 'running') fail('conflict', 'Session is not running')
    if (args.expectedTimelineRevision !== undefined && args.expectedTimelineRevision !== timeline.revision) fail('conflict', 'The load steps changed. Review the current step before recording it again.')
    if (action.status !== 'pending') fail('conflict', 'Action is already recorded')
    const isTask = action.kind === 'task'
    const drying = isDryerPhase(action.phase)
    const reusable = action.kind === 'treatment' && action.reusable === true
    if (isTask && drying && args.status === 'missed') fail('invalid', 'A drying step is done or skipped')
    if (isTask && action.task === 'garment_advice' && args.status === 'missed') fail('invalid', 'Optional advice is done or skipped')
    if (isTask && !drying && action.task !== 'garment_advice' && args.status !== 'confirmed') fail('invalid', 'This step can only be marked done')
    if (isTask && args.usage !== undefined) fail('invalid', 'This step has no product to record')
    if (reusable && args.usage !== undefined) fail('invalid', 'This product is reused, so nothing is used up')
    // A dose that goes by how full the drum or dryer is has none until the person says; it can still be left out.
    const waitsFor = action.kind === 'task'
      ? action.task === 'drum_fullness' ? 'drum' : action.task === 'dryer_fullness' ? 'dryer' : null
      : action.atMachine !== undefined && action.atMachine.resolvedSize === undefined ? action.atMachine.machine === 'dryer' ? 'dryer' : 'drum' : null
    if (waitsFor !== null && args.status === 'confirmed') fail('invalid', `Pick how full the ${waitsFor} is first`)
    if (!isTask && !reusable && args.status === 'confirmed' && args.usage === undefined) fail('invalid', 'Confirmed actions require actual usage')
    const isStart = action.kind === 'task' && action.task === 'start'
    if (args.status === 'confirmed' && session.machineStartedAt === undefined && !drying) {
      const machine = timeline.machineId === undefined ? null : await ctx.db.get(timeline.machineId)
      const unsupported = unsupportedPreparationActions(actions, machine)
      if (unsupported.some((candidate) => candidate.id === action.id) || (isStart && unsupported.length > 0)) {
        fail('conflict', 'The washer no longer supports this product’s recorded placement. Resolve the machine setup or leave the product out before starting.')
      }
    }
    if (isStart && actions.some((candidate) => candidate.order < action.order && candidate.status === 'pending' && candidate.phase !== 'cycle')) {
      fail('conflict', 'Record every step before starting the machine')
    }
    if (args.minutes !== undefined && (!isStart || !Number.isInteger(args.minutes) || args.minutes < 1 || args.minutes > 300)) {
      fail('invalid', 'Enter the minutes the machine shows, from 1 to 300')
    }
    if (session.machineStartedAt !== undefined && washerPrepPhases.has(action.phase) && args.status === 'confirmed') {
      const machine = timeline.machineId === undefined ? null : await ctx.db.get(timeline.machineId)
      if (doorLocksDuringCycle(machine)) fail('conflict', 'The door is locked while the machine runs; mark this step missed instead')
    }

    const occurredAt = clientTime(args.at, Date.now())
    if (action.kind === 'treatment' && action.soak !== undefined && args.status === 'confirmed') {
      if (action.soakStarted === undefined) fail('conflict', 'Record the measured water and start this soak first')
      const elapsed = occurredAt - action.soakStarted.at
      if (elapsed < action.soak.minimumMinutes * 60_000) fail('conflict', 'The label’s minimum soak time has not passed')
      if (elapsed > action.soak.maximumMinutes * 60_000) fail('conflict', 'The label’s maximum soak time has passed. Follow its removal directions and review the treatment before proceeding.')
      if (args.usage?.amount !== action.soakStarted.amount || args.usage.unit !== action.dose.unit) fail('conflict', 'Keep the actual measured soak dose')
    }
    let washFinishedAt = session.washFinishedAt
    if (drying) {
      // The server holds the line the screen draws: nothing comes out of the washer mid-cycle.
      if (session.machineStartedAt === undefined) fail('conflict', 'Drying comes after the wash; start the washer first')
      if (washFinishedAt === undefined) {
        const washer = timeline.machineId === undefined ? null : await ctx.db.get(timeline.machineId)
        const finish = await estimatedWashFinish(ctx, session, washer)
        if (finish === null || occurredAt < finish) fail('conflict', 'The wash has not finished yet; say when it finishes first')
        washFinishedAt = occurredAt
      }
      const recordedStart = action.kind === 'task' && action.task === 'dryer_start' && args.status === 'confirmed'
      if (recordedStart && actions.some((candidate) => candidate.order < action.order && candidate.status === 'pending' && isDryerPhase(candidate.phase))) {
        fail('conflict', 'Record every drying step before starting the dryer')
      }
      if (action.kind === 'task' && action.task === 'dryer_unload' && args.status === 'confirmed'
        && !actions.some((candidate) => candidate.kind === 'task' && candidate.task === 'dryer_start' && candidate.status === 'confirmed')) {
        fail('conflict', 'Start the dryer before collecting from it')
      }
    }

    if (args.usage !== undefined) {
      if (action.kind !== 'treatment' || args.usage.supplyId !== action.supplyId || args.usage.placement !== action.placement) fail('invalid', 'Usage must match this step’s product and placement')
      if (action.dose.fractionOfMark !== undefined && args.usage.unit === action.dose.unit && args.usage.fractionOfMark === undefined) fail('invalid', 'Record the fraction of the cap or scoop mark actually used')
      const [supply] = (await related(ctx, session.householdId, { supplyIds: [args.usage.supplyId] })).supplies as [Doc<'supplies'>]
      if (action.soakStarted === undefined) await ctx.db.insert('usage', {
        householdId: session.householdId,
        sessionId: session._id,
        actionId: args.actionId,
        supplyId: supply._id,
        productName: supply.name,
        productContext: { capturedAt: Date.now(), provenance: supply.provenance,
          ...(supply.formulation === undefined ? {} : { formulation: supply.formulation }),
          ...(supply.safety === undefined ? {} : { safety: supply.safety }),
          ...(supply.catalogBinding === undefined ? {} : { catalogBinding: supply.catalogBinding }),
          ...(supply.fixtureKey === undefined ? {} : { fixtureKey: supply.fixtureKey }) },
        amount: args.usage.amount,
        unit: args.usage.unit,
        ...(mark === undefined ? {} : { mark }),
        ...(args.usage.fractionOfMark === undefined ? {} : { fractionOfMark: args.usage.fractionOfMark }),
        ...(args.usage.target === undefined ? {} : { target: args.usage.target }),
        ...(args.usage.approximate === undefined ? {} : { approximate: args.usage.approximate }),
        placement: args.usage.placement,
        usedAt: occurredAt,
        confirmedBy: actor.key,
      })
    }
    await recordHistory(ctx, session, args.actionId, args.status, actor.key, occurredAt)

    actions[index] = { ...action, status: args.status, recordedAt: occurredAt, recordedBy: actor.key,
      ...(args.receiptId === undefined ? {} : { receiptId: args.receiptId, receiptPayload }) }
    const recorded = { ...timeline, actions, revision: timeline.revision + 1 }
    await ctx.db.patch(timeline._id, { actions, revision: recorded.revision, updatedAt: occurredAt })
    await settleReminder(ctx, session._id, args.actionId, args.status === 'confirmed')
    if (washFinishedAt !== session.washFinishedAt) await ctx.db.patch(session._id, { washFinishedAt })
    // Pressing Start on the machine starts the clock for the finish time and any mid-cycle steps;
    // starting the dryer starts the clock for collecting it.
    if (isStart) await applyMachineStart(ctx, session, recorded, occurredAt, undefined, args.minutes)
    if (action.kind === 'task' && action.task === 'dryer_start' && args.status === 'confirmed') {
      await applyDryerStart(ctx, { ...session, washFinishedAt }, recorded, occurredAt)
    }
    return { sessionId: session._id, actionId: args.actionId, status: args.status }
  },
})

/** "Not drying here": every drying step still pending is skipped, so the load can be finished. */
export const skipDrying = mutation({
  args: { sessionId: v.id('sessions') },
  returns: v.object({ sessionId: v.id('sessions'), skipped: v.number() }),
  handler: async (ctx, args) => {
    const session = (await authorize(ctx, 'session.run', { sessionId: args.sessionId })).session
    const timeline = await runningTimeline(ctx, session)
    const pending = timeline.actions.filter((action) => isDryerPhase(action.phase) && action.status === 'pending')
    if (pending.length === 0) return { sessionId: session._id, skipped: 0 }
    const actor = await principalFromAuth(ctx)
    const occurredAt = Date.now()
    const skipped = new Set(pending.map((action) => action.id))
    const actions = timeline.actions.map((action) => (skipped.has(action.id) ? { ...action, status: 'skipped' as const, recordedAt: occurredAt, recordedBy: actor.key } : action))
    for (const action of pending) await recordHistory(ctx, session, action.id, 'skipped', actor.key, occurredAt)
    await ctx.db.patch(timeline._id, { actions, revision: timeline.revision + 1, updatedAt: occurredAt })
    for (const action of pending) await settleReminder(ctx, session._id, action.id, false)
    return { sessionId: session._id, skipped: pending.length }
  },
})
