import { getPlan } from './planStorage'
import { type Machine, type Times, cycleTiming, findLoad, timelineActions, mergeRecorded, reminderDueAt, recordedTimes, dryerBusyReason, dryingSnapshot, clientTime, machineDose, plannedWasherClass, sessionWasherName, dryReady, dryerRuns, unsupportedPreparationActions, stepWords, pretreated, withoutDrawerProfile, keepUnchanged, recoveredPreparationLoad } from './executionHelpers'
export { recordedAdditionOffsetMinutes, recordedTimes, dryerBusyReason, clientTime, unsupportedPreparationActions } from './executionHelpers'
import { ConvexError, v, type Infer } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import { washerCost } from './costs'
import { routineCurrent } from './personalRoutineValues'
import { preparedGarmentFacts } from './personalOutcomeContext'

import { doorLocksDuringCycle, careProcessCapacity, careRequiresDetergent, maximumCareFillFraction, checkedWashProcess, washProcessUnmatched, washProcessWording, productLoadFingerprint, productWashContextFingerprint, isDryingMachine, isDryerPhase, machineClasses, plan as runPlanner, planLoadOn, resolveAtMachine, treatmentPhase, washerClass as recordedWasherClass, type LoadOn, type MachineDispensingProfile, type LoadPlan, type PlannerInput } from '@washcloset/planner'

import { internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import { internalMutation, mutation, query, type MutationCtx } from './_generated/server'
import { authorize, loadIdentity, related, visible, type Action, type ReadCtx } from './access'
import { fail, nonEmpty } from './errors'
import { alternateStartable, busyTextiles, canonicalPlannerInput, currentPlanner, loadKind, loadOn, loadStartable, planResult, plannerRule, recordedCycle, releasePlan, sameKindWasher, stepDose, storedPass, storedPlanInput } from './plans'
import { principalFromAuth } from './principal'
import { dose as doseValidator, evidenceLevel, loadSize, machineEventDetails, soilLevel, stepDose as stepDoseValidator, washerClass, type AtMachine, type TaskAction, type TimelineAction } from './validators'






/** The load as it runs on the session's washer: in a room with more than one kind, the steps for that washer's kind. */
export async function sessionLoad(ctx: ReadCtx, session: Doc<'sessions'>, timeline: Doc<'timelines'>): Promise<LoadPlan> {
  if (session.placementRecoveryLoad !== undefined) return session.placementRecoveryLoad as LoadPlan
  if (session.drawerUnusable === true) {
    const load = session.drawerlessLoad as LoadPlan | undefined
    if (load === undefined) fail('conflict', 'Recalculate without the drawer again before starting, or cancel this load and plan again')
    return load
  }
  const stored = await getPlan(ctx, session.planId)
  if (stored === null) fail('not_found', 'Not found')
  const planLoad = findLoad(stored, session.loadId)
  const machineId = timeline.machineId ?? planLoad.machineId
  const load = (machineId === null ? null : loadOn(planLoad, machineId)) ?? planLoad
  if (load.status !== 'ready') fail('conflict', 'Load needs confirmation')
  return load
}









async function scheduleCycleReminders(ctx: MutationCtx, session: Doc<'sessions'>, actions: TimelineAction[]): Promise<TimelineAction[]> {
  const scheduled: TimelineAction[] = []
  for (const action of actions) {
    const dueAt = action.status === 'pending' ? reminderDueAt(action) : undefined
    if (dueAt === undefined || !Number.isFinite(dueAt)) {
      scheduled.push(action)
      continue
    }
    const times = action.kind === 'treatment' && action.soakStarted !== undefined && action.soak !== undefined ? [...new Set([dueAt, action.soakStarted.at + action.soak.maximumMinutes * 60_000])] : [dueAt]
    for (const time of times) {
      const reminderId = await ctx.db.insert('reminders', { householdId: session.householdId, sessionId: session._id, actionId: action.id, status: 'scheduled', dueAt: time })
      const scheduledFunctionId = await ctx.scheduler.runAt(time, internal.reminders.deliver, { reminderId })
      await ctx.db.patch(reminderId, { scheduledFunctionId })
    }
    scheduled.push(action)
  }
  return scheduled
}

export async function machineFor(ctx: ReadCtx, householdId: Id<'households'>, machineId: Id<'machines'> | undefined, plannedMachineId: string | null): Promise<Machine | null> {
  const selectedId = machineId ?? (plannedMachineId === null ? null : ctx.db.normalizeId('machines', plannedMachineId))
  if (selectedId === null) return null
  return (await related(ctx, householdId, { machineIds: [selectedId] })).machines[0]!
}

/** Rebuilds a running load's timeline for new times, keeping what was recorded and re-timing reminders. */
export async function rebuildTimeline(ctx: MutationCtx, session: Doc<'sessions'>, timeline: Doc<'timelines'>, load: LoadPlan, machine: Machine | null, times: Times): Promise<void> {
  await cancelSessionReminders(ctx, session._id)
  const actions = await scheduleCycleReminders(ctx, session, mergeRecorded(timelineActions(load, machine, timeline.drying?.minutes ?? null, times), timeline.actions))
  await ctx.db.patch(timeline._id, { ...(machine === null ? {} : { machineId: machine._id }), actions, revision: timeline.revision + 1, updatedAt: Date.now() })
}


/**
 * Records that the machine is running from `at`: the finish time and any mid-cycle steps are
 * timed from here. Used by the "Start the machine" step and by correcting the start time.
 */
export async function applyMachineStart(
  ctx: MutationCtx,
  session: Doc<'sessions'>,
  timeline: Doc<'timelines'>,
  at: number,
  machineId?: Id<'machines'>,
  /** The minutes the washer showed, when the person read them off it at Start. */
  shownMinutes?: number,
): Promise<{ machine: Machine | null }> {
  const load = await sessionLoad(ctx, session, timeline)
  if (machineId !== undefined) {
    // The steps are the ones for the kind of washer it started on; another kind takes others.
    const stored = await getPlan(ctx, session.planId)
    const planLoad = stored === null ? null : findLoad(stored, session.loadId)
    const current = timeline.machineId ?? planLoad?.machineId ?? null
    if (planLoad !== null && current !== null && loadKind(planLoad, machineId) !== loadKind(planLoad, current)) {
      fail('conflict', 'That washer takes different steps: cancel this load and start it again there')
    }
  }
  const machine = await machineFor(ctx, session.householdId, machineId ?? timeline.machineId, load.machineId)
  if (session.machineStartedAt === undefined) {
    const stored = await getPlan(ctx, session.planId)
    const input = stored?.inputSnapshot as PlannerInput | undefined
    const words = input?.textiles?.filter((piece) => load.textileIds.includes(piece.id ?? '')).map((piece) => piece.care?.instructions) ?? []
    const detergentUsed = timeline.actions.some((action) => {
      if (action.kind !== 'treatment' || action.stage !== 'wash' || action.status !== 'confirmed') return false
      const supply = input?.supplies?.find((entry) => entry.id === action.supplyId)
      return supply !== undefined && (supply.kind === 'detergent' || supply.use === 'detergent' || supply.use === 'pods')
    })
    if (words.some(careRequiresDetergent) && !detergentUsed) fail('conflict', 'This load’s label requires detergent. Confirm its wash-stage detergent step before starting.')
    const sourceActions = timeline.actions.filter((action) => action.kind === 'treatment' && action.status === 'confirmed' && action.productRequirement !== undefined)
    if (stored !== null && sourceActions.length > 0) {
      const current = await canonicalPlannerInput(ctx, session.householdId, session.textileIds, storedPass(stored))
      const fingerprint = productLoadFingerprint((current.textiles ?? []).filter((piece) => load.textileIds.includes(piece.id ?? '')))
      const currentMachine = current.machines?.find((entry) => entry.id === machine?._id)
      for (const action of sourceActions) {
        if (action.kind !== 'treatment' || action.productRequirement === undefined) continue
        const requirement = action.productRequirement
        const supply = current.supplies?.find((entry) => entry.id === action.supplyId)
        if (supply?.sourceContract?.digest !== requirement.sourceDigest || supply.labelEvidence?.status === 'unknown' || fingerprint !== requirement.loadFingerprint) fail('stale', 'The product source or clothes changed. Review and prepare a new recipe before starting.')
        if (requirement.ordinaryWashRouteRequired && (currentMachine === undefined || productWashContextFingerprint(currentMachine, load.cycle, load.temperatureC) !== requirement.washContextFingerprint)) fail('stale', 'The checked product wash route changed. Review and prepare a new recipe before starting.')
      }
    }
  }
  if (session.machineStartedAt === undefined && machine !== null) {
    const stored = await getPlan(ctx, session.planId)
    const input = stored?.inputSnapshot as PlannerInput | undefined
    const words = input?.textiles?.filter((piece) => load.textileIds.includes(piece.id ?? '')).map((piece) => piece.care?.instructions) ?? []
    const facts = { id: machine._id, capacityUnits: machine.capacityUnits, capacityConfidence: machine.capacityConfidence, washProcesses: machine.washProcesses }
    const actual = checkedWashProcess(facts, load.cycle)
    const expectedMachine = input?.machines?.find((entry) => entry.id === machine._id)
    const expected = expectedMachine === undefined ? undefined : checkedWashProcess(expectedMachine, load.cycle)
    if ((actual === undefined ? null : washProcessWording(actual)) !== (expected === undefined ? null : washProcessWording(expected))) fail('stale', 'The checked washer program or options changed. Review and prepare a new recipe before starting.')
    if (words.some((instructions) => washProcessUnmatched(instructions, facts, load.cycle).length > 0) || load.bulkUnits > careProcessCapacity(facts, load.cycle, words, machine.capacityUnits ?? load.capacityUnits)) fail('conflict', 'This washer no longer matches the required care process or fill limit')
    const fill = { small: 0.25, medium: 0.5, large: 0.75, extra_large: 1 }
    if (session.drumFullness !== undefined && fill[session.drumFullness] > maximumCareFillFraction(words, actual)) fail('conflict', 'The recorded drum fill exceeds this load’s label or program limit. Reduce the load before starting.')
  }
  if (session.machineStartedAt === undefined && unsupportedPreparationActions(timeline.actions, machine).length > 0) {
    fail('conflict', 'Resolve the washer’s unsupported product placement before starting')
  }
  const times = { ...recordedTimes(session), machineStartedAt: at, ...(shownMinutes === undefined ? {} : { shownMinutes }) }
  await rebuildTimeline(ctx, session, timeline, load, machine, times)
  // A washer named here is the one it is on, so a load started without its number now has one.
  await ctx.db.patch(session._id, {
    machineStartedAt: at,
    ...(machine === null || session.washerContext?.machineId === machine._id ? {} : {
      washerContext: { machineId: machine._id, capturedAt: Date.now(), name: machine.name,
        ...(machine.model === undefined ? {} : { model: machine.model }),
        ...(machine.highEfficiency === undefined ? {} : { highEfficiency: machine.highEfficiency }),
        ...(machine.catalogBinding === undefined ? {} : { catalogBinding: machine.catalogBinding }),
        ...(machine.applianceType === undefined ? {} : { applianceType: machine.applianceType }),
        ...(machine.capacityUnits === undefined ? {} : { capacityUnits: machine.capacityUnits }),
        ...(machine.capacityConfidence === undefined ? {} : { capacityConfidence: machine.capacityConfidence }),
        ...(machine.cycleProfile === undefined ? {} : { cycleProfile: machine.cycleProfile }),
        ...(machine.washProcesses === undefined ? {} : { washProcesses: machine.washProcesses }),
        ...(machine.drumVolume === undefined ? {} : { drumVolume: machine.drumVolume }),
        provenance: machine.provenance, telemetry: false as const },
    }),
    ...(shownMinutes === undefined ? {} : { cycleMinutesShown: shownMinutes }),
    revision: session.revision + 1,
    ...(machineId !== undefined && session.washerNumberUnknown === true ? { washerNumberUnknown: undefined } : {}),
  })
  await ctx.db.insert('machineExecutionEvents', {
    householdId: session.householdId,
    sessionId: session._id,
    ...(machine === null ? {} : { machineId: machine._id }),
    source: 'manual',
    phase: 'started',
    confidence: 'user-supplied',
    occurredAt: at,
    details: { cycle: load.cycle, machineTelemetry: false },
  })
  return { machine }
}


/** A running wash (other than `exclude`) whose own dryer step started in this dryer and was not unloaded. */
export async function sessionInHomeDryer(ctx: ReadCtx, dryer: Doc<'machines'>, exclude?: Id<'sessions'>): Promise<Id<'sessions'> | null> {
  if (dryer.location === 'shared') return null
  const sessions = await ctx.db.query('sessions').withIndex('by_household_status', (q) => q.eq('householdId', dryer.householdId).eq('status', 'running')).collect()
  for (const session of sessions) {
    if (session._id === exclude || session.dryerStartedAt === undefined) continue
    const timeline = await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', session._id)).unique()
    if ((timeline?.dryerId ?? timeline?.drying?.dryerId) === dryer._id && !timeline!.actions.some((action) => action.phase === 'dryer_unload' && action.status !== 'pending')) return session._id
  }
  return null
}

/**
 * A home dryer holding one of the household's tracked loads: a drying-queue run not checked dry yet,
 * or a running wash whose own dryer step started there and was not unloaded. A shared-room dryer is
 * never checked: the app can't see other people's loads, and a finished one may already be empty.
 */
export async function homeDryerBusy(ctx: ReadCtx, dryer: Doc<'machines'>, exclude?: Id<'sessions'>): Promise<boolean> {
  if (dryer.location === 'shared') return false
  const runs = await ctx.db.query('dryingRuns').withIndex('by_household_status', (q) => q.eq('householdId', dryer.householdId).eq('status', 'running')).collect()
  if (runs.some((run) => run.kind === 'dryer' && run.dryerId === dryer._id)) return true
  return (await sessionInHomeDryer(ctx, dryer, exclude)) !== null
}

/** Records that the dryer is running from `at`: collecting it is due when the minutes one start buys run out. */
export async function applyDryerStart(ctx: MutationCtx, session: Doc<'sessions'>, timeline: Doc<'timelines'>, at: number): Promise<void> {
  if (session.preparationContext?.garments.some((garment) => garment.personalRoutine !== undefined)) fail('conflict', 'Move this wash to the drying queue to follow wash & dry preferences for its selected pieces')
  if (session.preparationContext?.garments.some((garment) => {
    const instructions = garment.care?.instructions
    return instructions !== undefined && instructions.beforeDrying.length + instructions.drying.length + instructions.afterDrying.length > 0
  })) fail('conflict', 'Move this wash to the drying queue to follow its recorded label instructions')
  const homeDryer = timeline.dryerId === undefined ? null : await ctx.db.get(timeline.dryerId)
  if (homeDryer !== null && await homeDryerBusy(ctx, homeDryer, session._id)) fail('conflict', dryerBusyReason(homeDryer.name))
  const load = await sessionLoad(ctx, session, timeline)
  const washer = timeline.machineId === undefined ? null : await ctx.db.get(timeline.machineId)
  const washDoneAt = session.washFinishedAt ?? at
  await rebuildTimeline(ctx, session, timeline, load, washer, { ...recordedTimes(session), washDoneAt, dryerStartedAt: at })
  await ctx.db.patch(session._id, { washFinishedAt: washDoneAt, dryerStartedAt: at, revision: session.revision + 1 })
  await ctx.db.insert('machineExecutionEvents', {
    householdId: session.householdId,
    sessionId: session._id,
    ...(timeline.dryerId === undefined ? {} : { machineId: timeline.dryerId }),
    source: 'manual',
    phase: 'dryer_started',
    confidence: 'user-supplied',
    occurredAt: at,
    details: { cycle: 'timed', machineTelemetry: false },
  })
}

async function cancelScheduled(ctx: MutationCtx, scheduledFunctionId: Id<'_scheduled_functions'> | undefined): Promise<void> {
  if (scheduledFunctionId === undefined) return
  try {
    await ctx.scheduler.cancel(scheduledFunctionId)
  } catch {
    // A reminder that already ran is still marked cancelled in our source of truth.
  }
}

export async function cancelSessionReminders(ctx: MutationCtx, sessionId: Id<'sessions'>): Promise<void> {
  const reminders = await ctx.db.query('reminders').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).collect()
  for (const reminder of reminders) {
    if (reminder.status === 'scheduled' || reminder.status === 'sent') {
      await cancelScheduled(ctx, reminder.scheduledFunctionId)
      await ctx.db.patch(reminder._id, { status: 'cancelled' })
    }
  }
}

/** Cancels the reminder for one step once it is recorded. */
export async function settleReminder(ctx: MutationCtx, sessionId: Id<'sessions'>, actionId: string, confirmed: boolean): Promise<void> {
  const reminders = await ctx.db.query('reminders').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).collect()
  for (const reminder of reminders) {
    if (reminder.actionId !== actionId || (reminder.status !== 'scheduled' && reminder.status !== 'sent')) continue
    await cancelScheduled(ctx, reminder.scheduledFunctionId)
    await ctx.db.patch(reminder._id, { status: confirmed ? 'completed' : 'cancelled' })
  }
}

/** One history event per garment in the load, so each garment's record shows what was done to it. */
export async function recordHistory(ctx: MutationCtx, session: Doc<'sessions'>, actionId: string, status: 'confirmed' | 'skipped' | 'missed', actorKey: string, occurredAt: number): Promise<void> {
  for (const textileId of session.textileIds) {
    const textile = await ctx.db.get(textileId)
    if (textile === null || textile.householdId !== session.householdId) fail('forbidden', 'Forbidden')
    await ctx.db.insert('history', {
      householdId: session.householdId,
      sessionId: session._id,
      textileId: textile._id,
      ownerPrincipalKey: textile.ownerPrincipalKey,
      actionId,
      event: status === 'confirmed' ? 'action_confirmed' : status === 'skipped' ? 'action_skipped' : 'action_missed',
      occurredAt,
      actorPrincipalKey: actorKey,
    })
  }
}

/**
 * A plan may start only while the current planner would make it from the household's current records
 * and the pass it was made with (Wash now, moved clothes, answered questions, products left out).
 */
async function planIsCurrent(ctx: ReadCtx, stored: Doc<'plans'>): Promise<boolean> {
  const textileIds = stored.textileIds ?? []
  if (textileIds.length === 0 || !currentPlanner(stored)) return false
  try {
    return runPlanner(await storedPlanInput(ctx, stored)).inputHash === stored.inputHash
  } catch {
    return false
  }
}


/**
 * The load on the washer the person picked: one in the planned washer's room (never a dryer or an
 * archived washer). Its own kind takes the planned load; another kind takes the load planned for it,
 * only when that kind can take it. The planned load's own checks are left to the caller.
 */
async function loadOnPicked(ctx: ReadCtx, stored: Doc<'plans'>, planLoad: LoadPlan, machine: Machine): Promise<LoadPlan> {
  const planned = await machineFor(ctx, stored.householdId, undefined, planLoad.machineId)
  if (isDryingMachine(machine) || machine.archived === true || (machine.location ?? 'home') !== (planned?.location ?? 'home')) fail('invalid', 'Pick one of the washers in this room')
  // A same-kind sibling added after planning still takes these accepted steps.
  const effective = loadOn(planLoad, machine._id) ?? (planned !== null && sameKindWasher(machine, planned) ? planLoad : null)
  if (effective === null) fail('conflict', 'This load has no steps for that washer')
  if (effective === planLoad) {
    // With one kind planned for the room, any washer beside it gets the planned steps, so it must be that kind.
    if (machine._id !== planLoad.machineId && planLoad.roomMachineIds === undefined && (planned === null || !sameKindWasher(machine, planned))) {
      fail('conflict', 'This load has no steps for that washer')
    }
    return planLoad
  }
  const alternate = planLoad.alternates?.find((entry) => entry.machineId === effective.machineId)
  if (alternate === undefined || !alternateStartable(planResult(stored), planLoad, alternate)) fail('conflict', "That washer can't take this load")
  return effective
}

const startResult = v.object({
  sessionId: v.id('sessions'),
  timelineId: v.optional(v.id('timelines')),
  status: v.union(v.literal('planned'), v.literal('running'), v.literal('completed'), v.literal('cancelled')),
  startedAt: v.optional(v.number()),
  actionCount: v.number(),
})



/**
 * Frees a cancelled session's start key so Start on the same load (which sends the same key)
 * makes a new session. The rewritten key ends in this session's own id, so no other session's
 * key (a client's included) can match it, and the index stays unique.
 */
async function releaseIdempotencyKey(ctx: MutationCtx, session: Doc<'sessions'>): Promise<void> {
  if (session.idempotencyKey.endsWith(`#cancelled:${session._id}`)) return
  await ctx.db.patch(session._id, { idempotencyKey: `${session.idempotencyKey}#cancelled:${session._id}` })
}

export const start = mutation({
  args: {
    planId: v.id('plans'),
    loadId: v.optional(v.string()),
    idempotencyKey: v.string(),
    startedAt: v.optional(v.number()),
    /** When the phone started it (its own clock), for a start queued while offline. */
    at: v.optional(v.number()),
    machineId: v.optional(v.id('machines')),
    /** Started with "No number on it?": the washer stands for its kind, not the one the person is at. */
    numberSkipped: v.optional(v.boolean()),
    /** The load as the plan shows it (its name, number and the day's load count), kept for the summary screens. */
    loadName: v.optional(v.string()),
    loadNumber: v.optional(v.number()),
    loadCount: v.optional(v.number()),
  },
  returns: startResult,
  handler: async (ctx, args) => {
    nonEmpty(args.idempotencyKey, 'idempotencyKey')
    const loadName = args.loadName?.trim()
    if (loadName !== undefined && (loadName === '' || loadName.length > 80)) fail('invalid', 'loadName must be a short name')
    for (const count of [args.loadNumber, args.loadCount]) if (count !== undefined && !(Number.isInteger(count) && count >= 1 && count <= 99)) fail('invalid', 'Load numbers must be small whole numbers')
    const stored = await getPlan(ctx, args.planId)
    if (stored === null) fail('not_found', 'Not found')
    const actor = (await authorize(ctx, 'session.run', { householdId: stored.householdId })).actor
    if (stored.status === 'stale' || stored.status === 'retired') fail('stale', 'Stale plan')
    const existing = await ctx.db
      .query('sessions')
      .withIndex('by_idempotency', (q) => q.eq('householdId', stored.householdId).eq('idempotencyKey', args.idempotencyKey))
      .unique()
    // A cancelled session from before keys were released on cancel: free its key and start afresh.
    if (existing !== null && existing.status === 'cancelled') await releaseIdempotencyKey(ctx, existing)
    else if (existing !== null) {
      const timeline = await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', existing._id)).unique()
      return { sessionId: existing._id, timelineId: timeline?._id, status: existing.status, startedAt: existing.startedAt, actionCount: timeline?.actions.length ?? 0 }
    }
    const planLoad = findLoad(stored, args.loadId)
    const machine = await machineFor(ctx, stored.householdId, args.machineId, planLoad.machineId)
    // In a room with more than one kind of washer, the load takes the steps planned for the kind picked.
    const load = args.machineId === undefined || machine === null ? planLoad : await loadOnPicked(ctx, stored, planLoad, machine)
    if (load === planLoad && !loadStartable(planResult(stored), planLoad)) fail('conflict', 'Load needs confirmation')
    if (!await planIsCurrent(ctx, stored)) fail('stale', 'Stale plan')
    // Preview, confirm at the machine, then start: a recipe confirmed for one washer never starts on another.
    const confirmed = stored.recipeConfirmations?.find((entry) => entry.loadId === planLoad.id)
    if (confirmed === undefined) fail('conflict', 'Confirm the recipe for the washer you are using first')
    const usedMachineId = machine?._id ?? planLoad.machineId ?? null
    if (usedMachineId !== null && usedMachineId !== confirmed.machineId) fail('conflict', 'The recipe was confirmed for another washer; confirm it for this one')
    const loadSessions = await ctx.db.query('sessions').withIndex('by_plan', (q) => q.eq('planId', stored._id)).collect()
    if (loadSessions.some((session) => session.status !== 'cancelled' && session.loadId === load.id)) {
      fail('conflict', 'This load already has a session')
    }
    const textileIds = load.textileIds.map((id) => ctx.db.normalizeId('textiles', id))
    if (textileIds.length === 0 || textileIds.some((id) => id === null)) fail('invalid', 'Load must contain textiles')
    const garments = textileIds as Id<'textiles'>[]
    // A garment can only be in one machine at a time.
    const busy = await busyTextiles(ctx, stored.householdId)
    if (garments.some((textileId) => busy.has(textileId))) fail('conflict', 'Some of these garments are already in a running load')

    const startedAt = args.startedAt ?? clientTime(args.at, Date.now())
    if (!Number.isFinite(startedAt)) fail('invalid', 'startedAt must be finite')
    const dryer = await machineFor(ctx, stored.householdId, undefined, load.drying?.dryerId ?? null)
    const drying = dryingSnapshot(load, dryer)
    const preparedGarments = await Promise.all(garments.map(async (textileId) => {
      const textile = await ctx.db.get(textileId)
      if (textile === null || textile.householdId !== stored.householdId) fail('forbidden', 'Forbidden')
      // Guests deliberately retain no identity/care history when their one-off wash ends.
      if (textile.guest === true) return null
      const care = await ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', textileId)).unique()
      if (textile.personalRoutine !== undefined && !routineCurrent(textile.personalRoutine, care)) fail('conflict', 'Review wash & dry preferences against the changed label first')
      if (textile.personalRoutine?.scope === 'once' && textile.routineWashId !== undefined) fail('conflict', 'This once-only routine already belongs to another wash')
      return preparedGarmentFacts(textile, care)
    }))
    const preparationContext = { capturedAt: Date.now(), garments: preparedGarments.filter((entry) => entry !== null) }
    if (new TextEncoder().encode(JSON.stringify(preparationContext)).byteLength > 800_000) fail('invalid', 'Split these clothes into smaller loads so their complete reviewed care can be preserved')
    const sessionId = await ctx.db.insert('sessions', {
      preparationContext,
      householdId: stored.householdId,
      planId: stored._id,
      loadId: load.id,
      ...(loadName === undefined ? {} : { loadName }),
      ...(args.loadNumber === undefined ? {} : { loadNumber: args.loadNumber }),
      ...(args.loadCount === undefined ? {} : { loadCount: args.loadCount }),
      cycle: load.cycle,
      textileIds: garments,
      startedBy: actor.key,
      planCreatedBy: stored.createdBy,
      idempotencyKey: args.idempotencyKey,
      status: 'running',
      revision: 0,
      startedAt,
      ...(args.numberSkipped === true ? { washerNumberUnknown: true } : {}),
    })
    if (stored.status !== 'used') await ctx.db.patch(stored._id, { status: 'used' })
    for (const garment of preparedGarments) if (garment?.personalRoutine?.scope === 'once') await ctx.db.patch(garment.textileId, { routineWashId: sessionId })
    // At the machine: every step until "Start the machine" is preparation; nothing is timed yet.
    const actions = timelineActions(load, machine, drying?.minutes ?? null, { machineStartedAt: null, washDoneAt: null, dryerStartedAt: null })
    const timelineId = await ctx.db.insert('timelines', {
      householdId: stored.householdId,
      sessionId,
      ...(machine === null ? {} : { machineId: machine._id }),
      ...(dryer === null ? {} : { dryerId: dryer._id }),
      ...(drying === null ? {} : { drying }),
      startedAt,
      actions,
      status: 'pending',
      revision: 0,
      createdAt: Date.now(),
    })
    await ctx.db.insert('machineExecutionEvents', {
      householdId: stored.householdId,
      sessionId,
      ...(machine === null ? {} : { machineId: machine._id }),
      source: 'manual',
      phase: 'preparing',
      confidence: 'user-supplied',
      occurredAt: startedAt,
      details: { cycle: load.cycle, machineTelemetry: false },
    })
    if (machine !== null && machine._id !== planLoad.machineId) {
      await ctx.db.insert('machineExecutionEvents', {
        householdId: stored.householdId,
        sessionId,
        machineId: machine._id,
        source: 'manual',
        phase: 'machine_substitution',
        confidence: 'user-supplied',
        occurredAt: startedAt,
        details: { previousMachineId: planLoad.machineId, machineTelemetry: false },
      })
    }
    return { sessionId, timelineId, status: 'running' as const, startedAt, actionCount: actions.length }
  },
})

/** The load a label line is asked for at the machine: the size the person saw, and the soil and HE it was planned with. */
const fullnessContext = v.object({ loadSize, soilLevel: v.optional(soilLevel), washerClass: v.optional(washerClass) })

const fullnessStep = v.union(
  v.object({ actionId: v.string(), status: v.literal('resolved') }),
  v.object({ actionId: v.string(), status: v.literal('label_row_needed'), supplyId: v.id('supplies'), context: fullnessContext }),
  v.object({
    actionId: v.string(),
    status: v.literal('conflicting_rows'),
    supplyId: v.id('supplies'),
    context: fullnessContext,
    rows: v.array(v.object({ ruleId: v.id('rules'), row: v.union(v.number(), v.null()), rowText: v.union(v.string(), v.null()), dose: doseValidator })),
  }),
  /** The label needs another answer first: for the washer's logo, the washer it is asked about. */
  v.object({
    actionId: v.string(),
    status: v.literal('needs_input'),
    supplyId: v.id('supplies'),
    missing: v.union(v.literal('load_size'), v.literal('washer_class'), v.literal('appliance_type'), v.literal('soil_level')),
    machineId: v.optional(v.id('machines')),
  }),
  /** The fitting line's dose cannot be followed with this product's cap or count: it can only be skipped. */
  v.object({ actionId: v.string(), status: v.literal('invalid_dose'), supplyId: v.id('supplies') }),
)



/**
 * How full the drum (or the dryer) is: the load size for every dose in the load that goes by it.
 * Each step still to do is read against the product's current label lines at that size. A step
 * with one fitting line gets its dose; one with no fitting line, or with two, says so, so the person
 * can answer from the label and pick again. Picking again before Start re-reads the steps still to
 * do, and a step no line fits any more goes back to waiting. Only the dose ever changes.
 */
export const recordDrumFullness = mutation({
  args: { sessionId: v.id('sessions'), machine: v.union(v.literal('washer'), v.literal('dryer')), size: loadSize },
  returns: v.object({ steps: v.array(fullnessStep) }),
  handler: async (ctx, args) => {
    const session = (await authorize(ctx, 'session.run', { sessionId: args.sessionId })).session
    if (session.status !== 'running') fail('conflict', 'Session is not running')
    const timeline = await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', session._id)).unique()
    if (timeline === null) fail('not_found', 'Execution timeline not found')
    const washer = args.machine === 'washer'
    const task = (name: TaskAction['task']) => timeline.actions.find((action): action is TaskAction & { order: number } => action.kind === 'task' && action.task === name)
    const fullness = task(washer ? 'drum_fullness' : 'dryer_fullness')
    if (fullness === undefined) fail('invalid', `Nothing in this load goes by how full the ${washer ? 'drum' : 'dryer'} is`)
    if (washer ? session.machineStartedAt !== undefined : task('dryer_start')?.status === 'confirmed') fail('conflict', `The ${washer ? 'machine' : 'dryer'} has already started`)
    if (fullness.status === 'skipped') fail('conflict', 'Drying here was skipped')
    // The person sees how full it is once the clothes are in: loading comes first, as at the machine.
    // The one exception is a product that goes in the empty drum before the clothes and goes by the
    // size of the load: its dose is read from the person's estimate of the pile, which is then the
    // drum's fullness for the whole load.
    const intoEmptyDrum = washer && timeline.actions.some((action) => action.kind === 'treatment' && action.status === 'pending' && action.phase === 'drum' && action.atMachine?.machine === 'washer')
    if (task(washer ? 'load' : 'dryer_load')?.status !== 'confirmed' && !intoEmptyDrum) fail('conflict', `Put the clothes in the ${washer ? 'drum' : 'dryer'} first`)
    // A washer whose logo was not on record when the load was planned may have been answered since,
    // here at the machine: a step planned without it is read with the washer's current answer.
    const washerRow = washer && timeline.machineId !== undefined ? await ctx.db.get(timeline.machineId) : null
    const answeredClass = washerRow === null ? null : recordedWasherClass(washerRow)

    const rules = await ctx.db.query('rules').withIndex('by_household', (q) => q.eq('householdId', session.householdId)).collect()
    const actions = [...timeline.actions]
    const steps: Infer<typeof fullnessStep>[] = []
    for (const [index, action] of actions.entries()) {
      if (action.kind !== 'treatment' || action.status !== 'pending' || action.atMachine?.machine !== args.machine) continue
      const supplyId = ctx.db.normalizeId('supplies', action.supplyId)
      const supply = supplyId === null ? null : await ctx.db.get(supplyId)
      if (supply === null || supply.householdId !== session.householdId) continue
      const lines = rules.filter((rule) => rule.supplyId === supply._id)
      const planned = action.atMachine
      const atMachine: AtMachine = washerRow !== null && answeredClass !== null && !planned.context.washerClassKnown
        ? { ...planned, context: { ...planned.context, machineClasses: machineClasses(washerRow), washerClassKnown: true } }
        : planned
      const selection = resolveAtMachine(atMachine, lines.map(plannerRule), supply.measure, args.size)
      const { resolvedSize: _size, lineText: _line, ...waiting } = atMachine
      if (selection.kind === 'selected') {
        const lineText = typeof selection.rule.rowText === 'string' ? selection.rule.rowText : undefined
        actions[index] = { ...action, dose: machineDose(selection.dose, supply.measure), atMachine: { ...waiting, resolvedSize: args.size, ...(lineText === undefined ? {} : { lineText }) } }
        steps.push({ actionId: action.id, status: 'resolved' })
        continue
      }
      // Not decided at this size: back to waiting, so it is never confirmed at another size's dose.
      actions[index] = { ...action, dose: { amount: 0, unit: 'at_machine' }, atMachine: waiting }
      const washerClass = washer ? plannedWasherClass(atMachine) : undefined
      const context = {
        loadSize: args.size,
        ...(!washer || selection.soilLevel === null ? {} : { soilLevel: selection.soilLevel }),
        ...(washerClass === undefined ? {} : { washerClass }),
      }
      if (selection.kind === 'none') steps.push({ actionId: action.id, status: 'label_row_needed', supplyId: supply._id, context })
      else if (selection.kind === 'conflict') {
        const fitting = selection.ruleIds.flatMap((ruleId) => lines.filter((rule) => rule._id === ruleId))
        steps.push({ actionId: action.id, status: 'conflicting_rows', supplyId: supply._id, context, rows: fitting.map((rule) => ({ ruleId: rule._id, row: rule.row ?? null, rowText: rule.rowText ?? null, dose: rule.dose })) })
      } else if (selection.kind === 'needs_input') {
        // The washer's logo is asked about this washer; once answered, picking again reads it.
        const asked = selection.missing === 'washer_class' && washerRow !== null ? { machineId: washerRow._id } : {}
        steps.push({ actionId: action.id, status: 'needs_input', supplyId: supply._id, missing: selection.missing, ...asked })
      } else {
        // A line that cannot be followed leaves the step waiting: it can only be left out.
        steps.push({ actionId: action.id, status: 'invalid_dose', supplyId: supply._id })
      }
    }

    const now = Date.now()
    if (fullness.status === 'pending') {
      const actor = await principalFromAuth(ctx)
      actions[actions.findIndex((action) => action.id === fullness.id)] = { ...fullness, status: 'confirmed', recordedAt: now, recordedBy: actor.key }
      await recordHistory(ctx, session, fullness.id, 'confirmed', actor.key, now)
    }
    await ctx.db.patch(timeline._id, { actions, revision: timeline.revision + 1, updatedAt: now })
    await ctx.db.patch(session._id, { ...(washer ? { drumFullness: args.size } : { dryerFullness: args.size }), revision: session.revision + 1 })
    return { steps }
  },
})

/** Corrects when the machine started. Only a recorded start can be corrected; before that, the Start step sets it. */
export const reschedule = mutation({
  args: {
    sessionId: v.id('sessions'),
    startedAt: v.number(),
    machineId: v.optional(v.id('machines')),
  },
  returns: v.object({ sessionId: v.id('sessions'), timelineId: v.id('timelines'), status: v.literal('rescheduled'), startedAt: v.number() }),
  handler: async (ctx, args) => {
    const session = (await authorize(ctx, 'session.run', { sessionId: args.sessionId })).session
    if (session.status !== 'running') fail('conflict', 'Session is not running')
    if (session.machineStartedAt === undefined) fail('conflict', 'The machine has not been started yet')
    if (!Number.isFinite(args.startedAt)) fail('invalid', 'startedAt must be finite')
    const timeline = await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', session._id)).unique()
    if (timeline === null) fail('not_found', 'Execution timeline not found')
    const previousMachineId = timeline.machineId
    const { machine } = await applyMachineStart(ctx, session, timeline, args.startedAt, args.machineId)
    if (machine?._id !== previousMachineId) {
      await ctx.db.insert('machineExecutionEvents', {
        householdId: session.householdId,
        sessionId: session._id,
        ...(machine === null ? {} : { machineId: machine._id }),
        source: 'manual',
        phase: 'machine_substitution',
        confidence: 'user-supplied',
        occurredAt: args.startedAt,
        details: { previousMachineId: previousMachineId ?? null, machineTelemetry: false },
      })
    }
    return { sessionId: session._id, timelineId: timeline._id, status: 'rescheduled' as const, startedAt: args.startedAt }
  },
})

/**
 * Records that the wash has finished, when the person sees it end: early, or when its length was
 * never recorded. Drying steps become possible from here and are re-timed from this moment.
 */
export const washFinished = mutation({
  args: { sessionId: v.id('sessions'), at: v.optional(v.number()) },
  returns: v.object({ sessionId: v.id('sessions'), washFinishedAt: v.number() }),
  handler: async (ctx, args) => {
    const session = (await authorize(ctx, 'session.run', { sessionId: args.sessionId })).session
    if (session.status !== 'running') fail('conflict', 'Session is not running')
    if (session.machineStartedAt === undefined) fail('conflict', 'The machine has not been started yet')
    if (session.washFinishedAt !== undefined) return { sessionId: session._id, washFinishedAt: session.washFinishedAt }
    // A tap queued with no signal keeps the phone's time, held between the start and now.
    const now = Date.now()
    const at = Math.min(now, Math.max(session.machineStartedAt, clientTime(args.at, now)))
    const timeline = await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', session._id)).unique()
    if (timeline === null) fail('not_found', 'Execution timeline not found')
    const machine = timeline.machineId === undefined ? null : await ctx.db.get(timeline.machineId)
    await rebuildTimeline(ctx, session, timeline, await sessionLoad(ctx, session, timeline), machine, { ...recordedTimes(session), washDoneAt: at })
    await ctx.db.patch(session._id, { washFinishedAt: at, revision: session.revision + 1 })
    await ctx.db.insert('machineExecutionEvents', {
      householdId: session.householdId,
      sessionId: session._id,
      ...(machine === null ? {} : { machineId: machine._id }),
      source: 'manual',
      phase: 'wash_finished',
      confidence: 'user-supplied',
      occurredAt: at,
      details: { cycle: session.cycle ?? null, machineTelemetry: false },
    })
    return { sessionId: session._id, washFinishedAt: at }
  },
})

/**
 * "Which dryer?": the dryer the person is at, among the household's dryers, before it starts. The
 * drying plan (heat, minutes, what stays out) is unchanged: siblings share a model and a price.
 */
export const chooseDryer = mutation({
  args: { sessionId: v.id('sessions'), dryerId: v.id('machines') },
  returns: v.object({ sessionId: v.id('sessions'), dryerId: v.id('machines') }),
  handler: async (ctx, args) => {
    const session = (await authorize(ctx, 'session.run', { sessionId: args.sessionId })).session
    if (session.status !== 'running') fail('conflict', 'Session is not running')
    const timeline = await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', session._id)).unique()
    if (timeline === null) fail('not_found', 'Execution timeline not found')
    if (timeline.drying?.status !== 'ready') fail('conflict', 'This load does not dry in a dryer')
    if (timeline.actions.some((action) => action.kind === 'task' && action.task === 'dryer_start' && action.status !== 'pending')) fail('conflict', 'The dryer has already started')
    const dryer = (await related(ctx, session.householdId, { machineIds: [args.dryerId] })).machines[0]!
    if (dryer.applianceType !== 'tumble_dryer' || dryer.archived === true) fail('invalid', 'Pick one of your dryers')
    await ctx.db.patch(timeline._id, { dryerId: dryer._id, dryerChosen: true, revision: timeline.revision + 1, updatedAt: Date.now() })
    await ctx.db.patch(session._id, { revision: session.revision + 1 })
    return { sessionId: session._id, dryerId: dryer._id }
  },
})

export const cancel = mutation({
  args: { sessionId: v.id('sessions') },
  returns: v.object({ sessionId: v.id('sessions'), status: v.literal('cancelled') }),
  handler: async (ctx, args) => {
    const session = (await authorize(ctx, 'session.run', { sessionId: args.sessionId })).session
    if (session.status === 'completed') fail('conflict', 'Session is completed')
    await cancelSessionReminders(ctx, session._id)
    const timeline = await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', session._id)).unique()
    if (timeline !== null && timeline.status === 'pending') {
      await ctx.db.patch(timeline._id, { status: 'cancelled', revision: timeline.revision + 1, updatedAt: Date.now() })
    }
    if (session.status !== 'cancelled') await ctx.db.patch(session._id, { status: 'cancelled', revision: session.revision + 1 })
    for (const textileId of session.textileIds) {
      const textile = await ctx.db.get(textileId)
      if (textile?.routineWashId === session._id) await ctx.db.patch(textileId, { routineWashId: undefined })
    }
    await releaseIdempotencyKey(ctx, session)
    await releasePlan(ctx, session.planId)
    return { sessionId: session._id, status: 'cancelled' as const }
  },
})

/**
 * Machine telemetry from a trusted integration. Internal only: a household member can never
 * write vendor-sourced or verified machine evidence from the browser.
 */
export const recordEvent = internalMutation({
  args: {
    sessionId: v.id('sessions'),
    source: v.union(v.literal('manual'), v.literal('estimated'), v.literal('vendor_api')),
    phase: v.string(),
    confidence: evidenceLevel,
    occurredAt: v.optional(v.number()),
    machineId: v.optional(v.id('machines')),
    details: v.optional(machineEventDetails),
  },
  returns: v.object({ eventId: v.id('machineExecutionEvents'), sessionId: v.id('sessions') }),
  handler: async (ctx, args) => {
    nonEmpty(args.phase, 'phase')
    const session = await ctx.db.get(args.sessionId)
    if (session === null) fail('not_found', 'Not found')
    const machine = await machineFor(ctx, session.householdId, args.machineId, null)
    const occurredAt = args.occurredAt ?? Date.now()
    if (!Number.isFinite(occurredAt)) fail('invalid', 'occurredAt must be finite')
    const eventId = await ctx.db.insert('machineExecutionEvents', {
      householdId: session.householdId,
      sessionId: session._id,
      ...(machine === null ? {} : { machineId: machine._id }),
      source: args.source,
      phase: args.phase.trim(),
      confidence: args.confidence,
      occurredAt,
      details: { ...(args.details ?? {}), machineTelemetry: args.source === 'vendor_api' },
    })
    return { eventId, sessionId: session._id }
  },
})

/** The cycle a session runs, recorded on the session since it started (older sessions read their plan). */
async function sessionCycle(ctx: ReadCtx, session: Doc<'sessions'>): Promise<string> {
  if (session.cycle !== undefined) return session.cycle
  const stored = await getPlan(ctx, session.planId)
  return (stored === null ? undefined : planResult(stored).loads.find((load) => load.id === session.loadId)?.cycle) ?? 'normal'
}

/** When the wash should end by the washer's recorded cycle length; null before Start or without a length. */
export async function estimatedWashFinish(ctx: ReadCtx, session: Doc<'sessions'>, machine: Machine | null): Promise<number | null> {
  if (session.machineStartedAt === undefined) return null
  const timing = cycleTiming(machine, await sessionCycle(ctx, session), session.cycleMinutesShown)
  return timing === null ? null : session.machineStartedAt + timing.durationMs
}





/** Current washer facts, separate from the accepted recipe snapshot. No instructions are inferred. */
export const preparationIssues = query({
  args: { sessionId: v.id('sessions') },
  returns: v.array(v.object({ actionId: v.string(), product: v.string(), washer: v.string(), placement: v.string() })),
  handler: async (ctx, args) => {
    const session = (await authorize(ctx, 'session.read', { sessionId: args.sessionId })).session
    if (session.status !== 'running' || session.machineStartedAt !== undefined) return []
    const timeline = await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', session._id)).unique()
    if (timeline?.machineId === undefined) return []
    const machine = await machineFor(ctx, session.householdId, timeline.machineId, null)
    return Promise.all(unsupportedPreparationActions(timeline.actions, machine).map(async (action) => {
      const supplyId = ctx.db.normalizeId('supplies', action.supplyId)
      const supply = supplyId === null ? null : await ctx.db.get(supplyId)
      return { actionId: action.id, product: supply?.householdId === session.householdId ? supply.name : 'This product', washer: sessionWasherName(session, machine) ?? 'This washer', placement: action.placement }
    }))
  },
})

/** Everything a household member needs to follow and finish one load. */
export const sessionDetail = query({
  args: { sessionId: v.id('sessions') },
  handler: async (ctx, args) => {
    const { session, actor } = await authorize(ctx, 'session.read', { sessionId: args.sessionId })
    const [timeline, reminders, usage, stored, dryingPieces, dried] = await Promise.all([
      ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', session._id)).unique(),
      ctx.db.query('reminders').withIndex('by_session', (q) => q.eq('sessionId', session._id)).collect(),
      ctx.db.query('usage').withIndex('by_session', (q) => q.eq('sessionId', session._id)).collect(),
      getPlan(ctx, session.planId),
      ctx.db.query('dryingPieces').withIndex('by_wash_session', (q) => q.eq('washSessionId', session._id)).collect(),
      ctx.db.query('history').withIndex('by_session', (q) => q.eq('sessionId', session._id)).filter((q) => q.eq(q.field('event'), 'dried')).collect(),
    ])
    // Where each piece is after the wash: its queue row while queued, drying or dry; put away once
    // its "dried" event is written (the row is then gone). Null when it never entered the queue.
    const pieceDrying = new Map<string, 'queued' | 'drying' | 'dry' | 'put_away'>(dried.map((event) => [event.textileId as string, 'put_away']))
    for (const piece of dryingPieces) pieceDrying.set(piece.textileId, piece.status)
    // The soonest running dryer timer among this wash's drying pieces: it makes a dryness check due, never a piece dry.
    const runIds = [...new Set(dryingPieces.flatMap((piece) => piece.status === 'drying' && piece.dryingRunId !== undefined ? [piece.dryingRunId] : []))]
    const runs = await Promise.all(runIds.map((id) => ctx.db.get(id)))
    const checkTimes = runs.flatMap((run) => run !== null && run.kind === 'dryer' && run.status === 'running' && run.minutes !== undefined ? [run.startedAt + run.minutes * 60_000] : [])
    const dryerCheckAt = checkTimes.length === 0 ? null : Math.min(...checkTimes)
    const actions = timeline?.actions ?? []
    const supplyIds = new Set<Id<'supplies'>>(usage.map((use) => use.supplyId))
    for (const action of actions) {
      const id = action.kind === 'treatment' ? ctx.db.normalizeId('supplies', action.supplyId) : null
      if (id !== null) supplyIds.add(id)
    }
    const [textiles, supplies, machine, dryer] = await Promise.all([
      Promise.all(session.textileIds.map((id) => ctx.db.get(id))),
      Promise.all([...supplyIds].map(async (id) => [id as string, await ctx.db.get(id)] as const)),
      timeline?.machineId === undefined ? null : ctx.db.get(timeline.machineId),
      timeline?.dryerId === undefined ? null : ctx.db.get(timeline.dryerId),
    ])
    const supplyName = new Map(supplies.map(([id, supply]) => [id, supply?.name ?? null]))
    const identities = await Promise.all(session.textileIds.map((id) => loadIdentity(ctx, actor.key, id)))
    const identity = new Map(identities.map((row) => [row.textileId as string, row]))
    const cycle = await sessionCycle(ctx, session)
    const timing = cycleTiming(machine, cycle, session.cycleMinutesShown)
    const washFinishAt = timing === null || session.machineStartedAt === undefined ? null : session.machineStartedAt + timing.durationMs
    const drying = timeline?.drying
    const dry = dryReady(drying, session, washFinishAt)
    return {
      cycle,
      machineStartedAt: session.machineStartedAt ?? null,
      cycleMinutes: timing === null ? null : Math.round(timing.durationMs / 60_000),
      doorLocks: doorLocksDuringCycle(machine),
      estimatedFinishAt: washFinishAt,
      finishConfidence: timing?.confidence ?? 'unknown',
      washFinishedAt: session.washFinishedAt ?? null,
      dryerStartedAt: session.dryerStartedAt ?? null,
      /** How full the person said the drum and the dryer are; null until they say. */
      drumFullness: session.drumFullness ?? null,
      dryerFullness: session.dryerFullness ?? null,
      /** When the whole load is done: the dryer's finish when it dries here, else the wash's. */
      estimatedDoneAt: dryerRuns(actions) && dry.readyAt !== null ? dry.readyAt : session.washFinishedAt ?? washFinishAt,
      drying: drying === undefined ? null : {
        status: drying.status,
        dryerId: timeline?.dryerId ?? null,
        /** Whether the person said which dryer they are at; until then a sibling may be asked for. */
        dryerChosen: timeline?.dryerChosen === true,
        dryerName: dryer?.name ?? null,
        heat: drying.heat ?? null,
        heatLabel: drying.heatLabel ?? null,
        minutes: drying.minutes ?? null,
        minutesConfidence: drying.minutesConfidence,
        startedAt: session.dryerStartedAt ?? null,
        readyAt: dry.readyAt,
        readyEstimated: dry.estimated,
        tumbleCount: drying.tumbleTextileIds.length,
        /** `not_checked` when the dryer's capacity is unknown; null on sessions from before it was recorded. */
        fit: drying.fit ?? null,
        heldOut: drying.heldOut.map((held) => ({
          textileId: held.textileId,
          ...identity.get(held.textileId),
          name: identity.get(held.textileId)?.name ?? null,
          color: identity.get(held.textileId)?.color ?? null,
          method: held.method,
          reason: held.reason,
        })),
      },
      sessionId: session._id,
      householdId: session.householdId,
      planId: session.planId,
      planInputHash: stored?.inputHash ?? null,
      idempotencyKey: session.idempotencyKey,
      loadId: session.loadId ?? null,
      status: session.status,
      startedAt: session.startedAt ?? null,
      completedAt: session.completedAt ?? null,
      // The last put-away, once nothing is left in the drying queue: with startedAt, the load's total time.
      putAwayAt: dryingPieces.length === 0 && dried.length > 0 ? Math.max(...dried.map((event) => event.occurredAt)) : null,
      loadName: identities.some((row) => row.private) ? null : session.loadName ?? null,
      loadNumber: session.loadNumber ?? null,
      loadCount: session.loadCount ?? null,
      revision: session.revision,
      timelineRevision: timeline?.revision ?? 0,
      machineName: sessionWasherName(session, machine),
      textiles: session.textileIds.map((textileId, index) => ({
        ...identities[index]!,
        // With name and color, what tells matching pieces apart (garmentKey); optional so fixtures may omit them.
        status: textiles[index]?.status ?? null,
        washCount: textiles[index]?.washCount ?? null,
        // Queued, drying, dry or put away; absent when it never entered the drying queue (optional for fixtures too).
        ...(pieceDrying.has(textileId) ? { drying: pieceDrying.get(textileId)! } : {}),
      })),
      /** When a dryer timer for this wash's drying pieces runs out: a check is due; absent without one (optional for fixtures). */
      ...(dryerCheckAt === null ? {} : { dryerCheckAt }),
      actions: actions.map((action) => ({ ...action, supplyName: action.kind === 'treatment' ? supplyName.get(action.supplyId) ?? null : null, ...(action.kind !== 'treatment' || action.textileId === undefined ? {} : { textileName: identity.get(action.textileId)?.name ?? 'This garment' }) })),
      // Reminders found by session are step reminders, which always name their step.
      reminders: reminders.flatMap((reminder) => reminder.actionId === undefined ? [] : [{ actionId: reminder.actionId, dueAt: reminder.dueAt, status: reminder.status }]),
      usage: usage.map((use) => ({ actionId: use.actionId ?? null, supplyId: use.supplyId, supplyName: use.productName ?? supplyName.get(use.supplyId) ?? null, amount: use.amount, unit: use.unit, mark: use.mark ?? null, ...(use.fractionOfMark === undefined ? {} : { fractionOfMark: use.fractionOfMark }), ...(use.target === undefined ? {} : { target: use.target }), ...(use.approximate === undefined ? {} : { approximate: use.approximate }), placement: use.placement, usedAt: use.usedAt })),
    }
  },
})

/**
 * The washers and dryers this household used most recently, newest first, at most three of each. Only
 * what its own loads recorded: it says nothing about what is free, and a machine used long ago is not listed.
 */
export const recentMachines = query({
  args: { householdId: v.id('households') },
  returns: v.object({ washers: v.array(v.id('machines')), dryers: v.array(v.id('machines')) }),
  handler: async (ctx, args) => {
    await authorize(ctx, 'session.read', { householdId: args.householdId })
    const sessions = await ctx.db.query('sessions').withIndex('by_household', (q) => q.eq('householdId', args.householdId)).order('desc').take(30)
    const events: { at: number; washer?: Id<'machines'>; dryer?: Id<'machines'> }[] = []
    for (const session of sessions) {
      const timeline = await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', session._id)).unique()
      const at = session.startedAt ?? session._creationTime
      if (timeline?.machineId !== undefined) events.push({ at, washer: timeline.machineId })
      const dryer = timeline?.dryerId ?? timeline?.drying?.dryerId
      if (dryer !== undefined && timeline?.dryerChosen === true) events.push({ at: session.dryerStartedAt ?? at, dryer })
    }
    for (const status of ['running', 'done'] as const) {
      for (const run of await ctx.db.query('dryingRuns').withIndex('by_household_status', (q) => q.eq('householdId', args.householdId).eq('status', status)).order('desc').take(20)) {
        if (run.kind === 'dryer' && run.dryerId !== undefined) events.push({ at: run.startedAt, dryer: run.dryerId })
      }
    }
    events.sort((left, right) => right.at - left.at)
    const newest = (pick: (event: (typeof events)[number]) => Id<'machines'> | undefined) => [...new Set(events.flatMap((event) => pick(event) ?? []))].slice(0, 3)
    return { washers: newest((event) => event.washer), dryers: newest((event) => event.dryer) }
  },
})

/** Recent loads with every time Home needs to say what stage each is at, and what finished loads washed and used. */
export const householdSessions = query({
  args: { householdId: v.id('households') },
  handler: async (ctx, args) => {
    const { actor } = await authorize(ctx, 'session.read', { householdId: args.householdId })
    const [recent, running] = await Promise.all([
      ctx.db.query('sessions').withIndex('by_household', q => q.eq('householdId', args.householdId)).order('desc').take(20),
      ctx.db.query('sessions').withIndex('by_household_status', q => q.eq('householdId', args.householdId).eq('status', 'running')).collect(),
    ])
    const sessions = await visible(ctx, actor, [...new Map([...recent, ...running].map(session => [session._id, session])).values()].sort((left, right) => right._creationTime - left._creationTime))
    return Promise.all(sessions.map(async (session) => {
      const timeline = await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', session._id)).unique()
      const actions = timeline?.actions ?? []
      const running = session.status === 'running'
      const washer = running && timeline?.machineId !== undefined ? await ctx.db.get(timeline.machineId) : null
      // Laundry names each running load by its machines: "Washer 2", then "Dryer 1".
      const dryerId = timeline?.dryerId ?? timeline?.drying?.dryerId
      const dryer = running && dryerId !== undefined ? await ctx.db.get(dryerId) : null
      const washFinishAt = running ? await estimatedWashFinish(ctx, session, washer) : null
      // Before Start there is no finish time, only the cycle's recorded length.
      const wash = running ? recordedCycle(washer, await sessionCycle(ctx, session)) : null
      const dry = dryReady(timeline?.drying, session, washFinishAt)
      // Only a finished load lists what it washed and used; a running one is read from its own page.
      const finished = session.status === 'completed' || session.status === 'cancelled'
      const garments = finished
        ? await Promise.all(session.textileIds.map(async (textileId) => {
            const { textileId: _id, ...identity } = await loadIdentity(ctx, actor.key, textileId)
            return identity
          }))
        : []
      const used = finished ? await ctx.db.query('usage').withIndex('by_session', (q) => q.eq('sessionId', session._id)).collect() : []
      const usage = await Promise.all(used.map(async (use) => ({
        supplyName: (await ctx.db.get(use.supplyId))?.name ?? null,
        amount: use.amount,
        unit: use.unit,
        mark: use.mark ?? null,
        ...(use.fractionOfMark === undefined ? {} : { fractionOfMark: use.fractionOfMark }),
        ...(use.target === undefined ? {} : { target: use.target }),
        ...(use.approximate === undefined ? {} : { approximate: use.approximate }),
      })))
      return {
        estimatedFinishAt: washFinishAt,
        washFinishAt,
        washMinutes: wash?.minutes ?? null,
        washConfidence: wash?.confidence ?? 'unknown',
        sessionId: session._id,
        status: session.status,
        loadId: session.loadId ?? null,
        machineName: sessionWasherName(session, washer),
        dryerName: dryer?.name ?? null,
        textileCount: session.textileIds.length,
        textileIds: session.textileIds,
        startedAt: session.startedAt ?? null,
        completedAt: session.completedAt ?? null,
        machineStartedAt: session.machineStartedAt ?? null,
        washFinishedAt: session.washFinishedAt ?? null,
        dryerStartedAt: session.dryerStartedAt ?? null,
        dryMinutes: timeline?.drying?.status === 'ready' ? timeline.drying.minutes ?? null : null,
        dryFinishAt: dry.estimated ? null : dry.readyAt,
        hasDrying: dryerRuns(actions),
        dryerStepRecorded: actions.some((action) => isDryerPhase(action.phase) && action.status === 'confirmed'),
        dryerUnloaded: actions.some((action) => action.phase === 'dryer_unload' && action.status !== 'pending'),
        garments,
        usage,
      }
    }))
  },
})

/** Completed history is paged independently of Home's bounded recent-session feed. */
export const completedHistory = query({
  args: { householdId: v.id('households'), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const { actor } = await authorize(ctx, 'session.read', { householdId: args.householdId })
    const page = await ctx.db.query('sessions').withIndex('by_household_status_completed', q => q.eq('householdId', args.householdId).eq('status', 'completed')).order('desc').paginate({ ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 20) })
    return { ...page, page: await Promise.all(page.page.map(async session => {
      const timeline = await ctx.db.query('timelines').withIndex('by_session', q => q.eq('sessionId', session._id)).unique()
      const washer = timeline?.machineId === undefined ? null : await ctx.db.get(timeline.machineId)
      const garments = await Promise.all(session.textileIds.map(async textileId => {
        const identity = await loadIdentity(ctx, actor.key, textileId)
        return { name: identity.name, color: identity.color }
      }))
      return { sessionId: session._id, status: session.status, completedAt: session.completedAt ?? null,
        machineName: sessionWasherName(session, null), textileCount: session.textileIds.length, garments,
        washPrice: session.machineStartedAt === undefined ? null : washerCost(washer?.householdId === args.householdId ? washer : null).price }
    })) }
  },
})



/** The steps this load would take on another washer in the same room, before it starts. */
async function movedSteps(ctx: ReadCtx, session: Doc<'sessions'>, timeline: Doc<'timelines'>, machine: Machine) {
  const stored = await getPlan(ctx, session.planId)
  if (stored === null) fail('not_found', 'Not found')
  const load = await loadOnPicked(ctx, stored, findLoad(stored, session.loadId), machine)
  const fresh = timelineActions(load, machine, timeline.drying?.minutes ?? null, { machineStartedAt: null, washDoneAt: null, dryerStartedAt: null })
  return { stored, load, actions: fresh.map((action) => pretreated(timeline.actions, action) ?? action) }
}

async function movableSession(ctx: ReadCtx, action: Action, sessionId: Id<'sessions'>) {
  const session = (await authorize(ctx, action, { sessionId: sessionId })).session
  if (session.status !== 'running') fail('conflict', 'This load is not running')
  if (session.machineStartedAt !== undefined) fail('conflict', 'The washer has started; this load stays in it')
  const timeline = await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', session._id)).unique()
  if (timeline === null || timeline.status !== 'pending') fail('conflict', 'This load has no steps to move')
  return { session, timeline }
}

/**
 * "Machine problem? Door won't lock or it won't start": the other washers in the same room, and
 * for the one picked, what changes in the steps. Nothing is assumed free; the person is standing there.
 */
export const moveOptions = query({
  args: { sessionId: v.id('sessions'), machineId: v.optional(v.id('machines')) },
  handler: async (ctx, args) => {
    const { session, timeline } = await movableSession(ctx, 'session.read', args.sessionId)
    const current = timeline.machineId === undefined ? null : await ctx.db.get(timeline.machineId)
    const machines = await ctx.db.query('machines').withIndex('by_household', (q) => q.eq('householdId', session.householdId)).collect()
    const washers = machines.filter((machine) => machine._id !== current?._id && machine.archived !== true && !isDryingMachine(machine)
      && (machine.location ?? 'home') === (current?.location ?? 'home'))
    const picked = args.machineId === undefined ? null : washers.find((machine) => machine._id === args.machineId) ?? null
    let changes: { stage: string; from: string; to: string }[] = []
    let unavailable: string | null = null
    if (picked !== null) {
      try {
        const moved = await movedSteps(ctx, session, timeline, picked)
        const before = timeline.actions.filter((action) => action.kind === 'treatment')
        for (const action of moved.actions) {
          if (action.kind !== 'treatment') continue
          const old = before.find((entry) => entry.kind === 'treatment' && entry.supplyId === action.supplyId && entry.textileId === action.textileId)
          if (old !== undefined && stepWords(old) !== stepWords(action)) changes.push({ stage: action.stage, from: stepWords(old), to: stepWords(action) })
        }
        const order = (actions: readonly TimelineAction[]) => actions.map((action) => action.kind === 'task' ? action.task : action.stage).join(' → ')
        if (order(timeline.actions) !== order(moved.actions)) changes.push({ stage: 'Order', from: order(timeline.actions), to: order(moved.actions) })
      } catch (caught) {
        unavailable = caught instanceof Error ? caught.message : 'That washer can’t take this load'
        changes = []
      }
    }
    return {
      currentName: current?.name ?? null,
      washers: washers.map((machine) => ({ machineId: machine._id, name: machine.name, applianceType: machine.applianceType ?? null })),
      changes,
      unavailable,
    }
  },
})

/**
 * Moves a load that has not started to another washer in the same room: the steps are rebuilt for
 * it and the recipe is confirmed there. Pretreatment stays done; every other step restarts.
 */
export const moveWasher = mutation({
  args: { sessionId: v.id('sessions'), machineId: v.id('machines') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { session, timeline } = await movableSession(ctx, 'session.run', args.sessionId)
    const actor = (await authorize(ctx, 'session.run', { householdId: session.householdId })).actor
    const machine = await machineFor(ctx, session.householdId, args.machineId, null)
    if (machine === null) fail('not_found', 'Not found')
    if (machine._id === timeline.machineId) fail('invalid', 'This load is already on that washer')
    const { stored, load, actions } = await movedSteps(ctx, session, timeline, machine)
    const now = Date.now()
    await ctx.db.patch(timeline._id, { machineId: machine._id, actions, revision: timeline.revision + 1, updatedAt: now })
    // The drawer was the earlier washer's problem: the new washer takes its own steps.
    await ctx.db.patch(session._id, { cycle: load.cycle, drumFullness: undefined, drawerUnusable: undefined, drawerlessLoad: undefined, placementRecoveryLoad: undefined, revision: session.revision + 1 })
    const others = (stored.recipeConfirmations ?? []).filter((entry) => entry.loadId !== session.loadId)
    if (session.loadId !== undefined) {
      await ctx.db.patch(stored._id, { recipeConfirmations: [...others, { loadId: session.loadId, machineId: machine._id, confirmedBy: actor.key, confirmedAt: now }] })
    }
    await ctx.db.insert('machineExecutionEvents', {
      householdId: session.householdId,
      sessionId: session._id,
      machineId: machine._id,
      source: 'manual',
      phase: 'machine_substitution',
      confidence: 'user-supplied',
      occurredAt: now,
      details: { previousMachineId: timeline.machineId ?? null, machineTelemetry: false },
    })
    return null
  },
})



/** Why a load can't be planned without the drawer, in the words a person at the washer needs. */
async function withoutDrawerReason(ctx: ReadCtx, on: Exclude<LoadOn, { status: 'ready' }>): Promise<string> {
  if (on.status === 'too_full') return 'Without the drawer this load no longer fits one wash'
  const ids = [...new Set(on.problems.flatMap((problem) => problem.supplyId === undefined ? [] : [problem.supplyId]))]
  const names = (await Promise.all(ids.map(async (id) => {
    const supplyId = ctx.db.normalizeId('supplies', id)
    return supplyId === null ? null : (await ctx.db.get(supplyId))?.name ?? null
  }))).filter((name): name is string => name !== null)
  return names.length === 0 ? 'Without the drawer this load can’t be planned' : `Without the drawer there is no place for ${names.join(', ')}`
}

/**
 * The load re-planned for `washer` as if it had no drawer, by the planner's own no-compartment
 * rules (a wash product goes in the drum, a rinse product by hand where the lid opens, bleach and
 * anything with nowhere to go block). Fails with the reason when the load can't be planned that way.
 */
async function planWithoutDrawer(ctx: ReadCtx, stored: Doc<'plans'>, current: LoadPlan, washer: Machine): Promise<LoadPlan> {
  const textileIds = stored.textileIds ?? []
  if (textileIds.length === 0) fail('conflict', 'This load has no garments to plan')
  const input = await canonicalPlannerInput(ctx, stored.householdId, textileIds, storedPass(stored))
  const planned = {
    ...input,
    machines: (input.machines ?? []).map((machine) => machine.id === washer._id ? { ...machine, dispensing: withoutDrawerProfile(washer.dispensingProfile) as MachineDispensingProfile } : machine),
  }
  const on = planLoadOn(planned, current, washer._id)
  if (on.status !== 'ready') fail('conflict', await withoutDrawerReason(ctx, on))
  return { ...current, treatments: on.load.treatments }
}



const recoveryPlacement = v.union(v.literal('direct_to_drum'), v.literal('downy_ball'))
export type RecoveryPlacement = Infer<typeof recoveryPlacement>
const recoveryOption = v.object({ placement: recoveryPlacement, label: v.string(), dose: v.union(stepDoseValidator, v.null()), timing: v.union(v.string(), v.null()), unavailable: v.union(v.string(), v.null()) })

/** Read the missing placement against the accepted session, rather than replacing its other steps. */
async function preparationRecoveryContext(ctx: ReadCtx, session: Doc<'sessions'>, timeline: Doc<'timelines'>, actionId: string) {
  const washer = await machineFor(ctx, session.householdId, timeline.machineId, null)
  if (washer === null) return null
  const action = unsupportedPreparationActions(timeline.actions, washer).find((entry) => entry.id === actionId)
  if (action === undefined) return null
  const stored = await getPlan(ctx, session.planId)
  if (stored === null) fail('not_found', 'Plan not found')
  const current = await sessionLoad(ctx, session, timeline)
  const matches = current.treatments.flatMap((step, index) => step.supplyId === action.supplyId && step.stage === action.stage && step.placement === action.placement && step.textileId === action.textileId ? [index] : [])
  if (matches.length !== 1) fail('conflict', 'Review this recipe before changing its placement')
  const input = await canonicalPlannerInput(ctx, session.householdId, session.textileIds, storedPass(stored))
  return { washer, stored, current, input, action, actionTimeline: timeline.actions, treatmentIndex: matches[0]! }
}

export type RecoveryContext = NonNullable<Awaited<ReturnType<typeof preparationRecoveryContext>>>


/** The choices are recalculated from current records. A resolved or started issue has no choices. */
export const preparationRecoveryOptions = query({
  args: { sessionId: v.id('sessions'), actionId: v.string() },
  returns: v.array(recoveryOption),
  handler: async (ctx, args) => {
    const session = (await authorize(ctx, 'session.read', { sessionId: args.sessionId })).session
    if (session.status !== 'running' || session.machineStartedAt !== undefined) return []
    const timeline = await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', session._id)).unique()
    if (timeline === null) return []
    const context = await preparationRecoveryContext(ctx, session, timeline, args.actionId)
    if (context === null) return []
    return (['direct_to_drum', 'downy_ball'] as const).map((placement) => {
      const label = placement === 'direct_to_drum' ? 'Add it by hand' : 'Use a dispensing ball'
      try {
        const recovered = recoveredPreparationLoad(context, session, placement)
        const step = recovered.load.treatments[context.treatmentIndex]!
        return { placement, label: placement === 'direct_to_drum' && treatmentPhase(step, context.washer) === 'cycle' ? 'Add it by hand during the cycle' : label, dose: stepDose(step), timing: recovered.timing, unavailable: null }
      } catch (caught) {
        if (!(caught instanceof ConvexError)) throw caught
        return { placement, label, dose: null, timing: null, unavailable: (caught.data as { message: string }).message }
      }
    })
  },
})

/** Accept one product's recovery atomically; keep the usable drawer and already recorded steps. */
export const recoverPreparationPlacement = mutation({
  args: { sessionId: v.id('sessions'), actionId: v.string(), placement: recoveryPlacement },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { session, timeline } = await movableSession(ctx, 'session.run', args.sessionId)
    const actor = (await authorize(ctx, 'session.run', { householdId: session.householdId })).actor
    const context = await preparationRecoveryContext(ctx, session, timeline, args.actionId)
    if (context === null) fail('stale', 'This placement no longer needs recovery. Check the current preparation steps.')
    const { load } = recoveredPreparationLoad(context, session, args.placement)
    const actions = keepUnchanged(timeline.actions, timelineActions(load, context.washer, timeline.drying?.minutes ?? null, { machineStartedAt: null, washDoneAt: null, dryerStartedAt: null }))
    const now = Date.now()
    await ctx.db.patch(timeline._id, { actions, revision: timeline.revision + 1, updatedAt: now })
    await ctx.db.patch(session._id, { placementRecoveryLoad: load, revision: session.revision + 1 })
    if (session.loadId !== undefined) {
      const others = (context.stored.recipeConfirmations ?? []).filter((entry) => entry.loadId !== session.loadId)
      await ctx.db.patch(context.stored._id, { recipeConfirmations: [...others, { loadId: session.loadId, machineId: context.washer._id, confirmedBy: actor.key, confirmedAt: now }] })
    }
    await ctx.db.insert('machineExecutionEvents', { householdId: session.householdId, sessionId: session._id, machineId: context.washer._id, source: 'manual', phase: 'placement_recovered', confidence: 'user-supplied', occurredAt: now, details: { note: `${context.action.supplyId}: ${args.placement}`, machineTelemetry: false } })
    return null
  },
})

/** This load's steps with the washer's drawer taken away, before the washer starts. */
async function drawerlessSteps(ctx: ReadCtx, session: Doc<'sessions'>, timeline: Doc<'timelines'>) {
  const stored = await getPlan(ctx, session.planId)
  if (stored === null) fail('not_found', 'Not found')
  const planLoad = findLoad(stored, session.loadId)
  const washer = await machineFor(ctx, session.householdId, timeline.machineId, planLoad.machineId)
  if (washer === null) fail('not_found', 'This load has no washer recorded')
  const load = await planWithoutDrawer(ctx, stored, loadOn(planLoad, washer._id) ?? planLoad, washer)
  const fresh = timelineActions(load, washer, timeline.drying?.minutes ?? null, { machineStartedAt: null, washDoneAt: null, dryerStartedAt: null })
  return { stored, load, washer, actions: keepUnchanged(timeline.actions, fresh) }
}

/**
 * "Machine problem: Drawer is stuck or missing": what would change in this load's steps if it were
 * re-planned as if the washer had no drawer. Nothing changes until `withoutDrawer` is called.
 */
export const withoutDrawerPreview = query({
  args: { sessionId: v.id('sessions') },
  handler: async (ctx, args) => {
    const { session, timeline } = await movableSession(ctx, 'session.read', args.sessionId)
    let changes: { stage: string; from: string; to: string }[] = []
    let unavailable: string | null = null
    try {
      const { actions } = await drawerlessSteps(ctx, session, timeline)
      const before = timeline.actions.filter((action) => action.kind === 'treatment')
      for (const action of actions) {
        if (action.kind !== 'treatment') continue
        const old = before.find((entry) => entry.kind === 'treatment' && entry.supplyId === action.supplyId && entry.textileId === action.textileId)
        if (old !== undefined && stepWords(old) !== stepWords(action)) changes.push({ stage: action.stage, from: stepWords(old), to: stepWords(action) })
      }
      const order = (steps: readonly TimelineAction[]) => steps.map((action) => action.kind === 'task' ? action.task : action.stage).join(' → ')
      if (order(timeline.actions) !== order(actions)) changes.push({ stage: 'Order', from: order(timeline.actions), to: order(actions) })
    } catch (caught) {
      unavailable = caught instanceof Error ? caught.message : 'This load can’t be planned without the drawer'
      changes = []
    }
    return { changes, unavailable }
  },
})

/**
 * Re-plans a load that has not started as if its washer had no drawer, and confirms that recipe for
 * the session. Steps whose product and place did not change keep their status; the others restart.
 * Pretreatment stays done. Later rebuilds (the machine start, the wash ending) keep the no-drawer steps.
 */
export const withoutDrawer = mutation({
  args: { sessionId: v.id('sessions') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { session, timeline } = await movableSession(ctx, 'session.run', args.sessionId)
    const actor = (await authorize(ctx, 'session.run', { householdId: session.householdId })).actor
    const { stored, load, washer, actions } = await drawerlessSteps(ctx, session, timeline)
    const now = Date.now()
    await ctx.db.patch(timeline._id, { actions, revision: timeline.revision + 1, updatedAt: now })
    // The fullness answer is read again when its step restarts.
    const fullnessKept = actions.some((action) => action.kind === 'task' && action.task === 'drum_fullness' && action.status !== 'pending')
    await ctx.db.patch(session._id, { cycle: load.cycle, drawerUnusable: true, drawerlessLoad: load, placementRecoveryLoad: undefined, revision: session.revision + 1, ...(fullnessKept ? {} : { drumFullness: undefined }) })
    if (session.loadId !== undefined) {
      const others = (stored.recipeConfirmations ?? []).filter((entry) => entry.loadId !== session.loadId)
      await ctx.db.patch(stored._id, { recipeConfirmations: [...others, { loadId: session.loadId, machineId: washer._id, confirmedBy: actor.key, confirmedAt: now }] })
    }
    await ctx.db.insert('machineExecutionEvents', {
      householdId: session.householdId,
      sessionId: session._id,
      machineId: washer._id,
      source: 'manual',
      phase: 'drawer_unusable',
      confidence: 'user-supplied',
      occurredAt: now,
      details: { cycle: load.cycle, note: 'Recalculated without the drawer', machineTelemetry: false },
    })
    return null
  },
})
