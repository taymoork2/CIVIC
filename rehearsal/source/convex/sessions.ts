import { v } from 'convex/values'
import { isDryer, isDryerPhase, isHangingDryer, labelFromCeiling, stainReasons, treatmentChemistry, tumbleCeiling, type PlannerInput } from '@washcloset/planner'

import type { Doc, Id } from './_generated/dataModel'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { authorize, loadIdentity } from './access'
import { fail, nonEmpty } from './errors'
import { cancelSessionReminders } from './execution'
import { queuedPieceMayHangOnce } from './hangRule'
import { deletePhotoRows } from './photos'
import { invalidatePlans, loadOn, planResult, plannerCare, releasePlan } from './plans'
import { principalFromAuth } from './principal'
import { ownAssessments } from './outcomeAssessments'

/**
 * Whether a stain went into this wash, as the planner judges it: a stain report, a stain reason, or a stain
 * check still open from an earlier wash (it is not gone until someone says so, whatever the piece was washed for).
 */
function hadStain(textile: Doc<'textiles'>): boolean {
  return textile.stainCheck !== undefined || textile.flag?.stainReport !== undefined || (textile.flag?.reasons ?? []).some((reason) => (stainReasons as readonly string[]).includes(reason))
}

/** The stain check a wash leaves: the same stain, everything tried so far plus this wash's treatments, one more wash, no answer yet. */
type Attempt = NonNullable<Doc<'textiles'>['stainCheck']>['tried'][number]
const attemptKey = (entry: Attempt) => typeof entry === 'string' ? entry : `${entry.supplyId}:${entry.chemistry ?? ''}`

function nextStainCheck(textile: Doc<'textiles'>, tried: readonly Attempt[], now: number): NonNullable<Doc<'textiles'>['stainCheck']> {
  const reason = textile.flag?.reasons.find((entry) => (stainReasons as readonly string[]).includes(entry)) ?? textile.stainCheck?.reason ?? 'stain_other'
  const before = textile.flag?.stainReport?.priorTreatmentAttempts
  const prior = textile.stainCheck?.tried ?? (Array.isArray(before) ? before : [])
  const all = new Map([...prior, ...tried].map((entry) => [attemptKey(entry), entry]))
  return { reason, kind: textile.flag?.stainReport?.kind ?? textile.stainCheck?.kind ?? 'unknown', tried: [...all.values()], washes: (textile.stainCheck?.washes ?? 0) + 1, washedAt: now }
}

/**
 * Whether a washed garment hangs to dry: when drying held it out, when the load dried nothing in the
 * dryer, when its drying was never confirmed, or when nothing says it was dried at all (no drying plan,
 * or the dryer steps were skipped). Clothes leave a washer wet, so this fails closed to hanging.
 */
function hangs(timeline: Doc<'timelines'> | null | undefined, textileId: Id<'textiles'>): boolean {
  const drying = timeline?.drying
  if (drying === undefined) return true
  if (timeline!.actions.some((action) => action.phase === 'dryer_start' && action.status === 'skipped')) return true
  return drying.status === 'none' || drying.status === 'needs_confirmation' || drying.heldOut.some((held) => held.textileId === textileId)
}

/**
 * A guest's garment is not kept: it goes with its care record, any photos, and the step rows the
 * load recorded for it, so no history of a guest remains.
 */
export async function deleteGuest(ctx: MutationCtx, textile: Doc<'textiles'>): Promise<void> {
  const care = await ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', textile._id)).collect()
  const photos = await ctx.db.query('carePhotos').withIndex('by_textile', (q) => q.eq('textileId', textile._id)).collect()
  const history = await ctx.db.query('history').withIndex('by_textile', (q) => q.eq('textileId', textile._id)).collect()
  await deletePhotoRows(ctx, photos)
  for (const row of [...care, ...history]) await ctx.db.delete(row._id)
  await ctx.db.delete(textile._id)
}

/** What the load summary says, read back from the history of a load completed earlier. */
async function completedSummary(ctx: MutationCtx, sessionId: Id<'sessions'>) {
  const history = await ctx.db.query('history').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).collect()
  const washed = history.filter((event) => event.event === 'washed').length
  const hanging = history.filter((event) => event.event === 'hung').length
  return { ready: washed - hanging, hanging, guests: [] }
}

/** Recent finished loads for one garment; household membership is checked through the garment. */
export const washRecordsForTextile = query({
  args: { textileId: v.id('textiles') },
  handler: async (ctx, args) => {
    await authorize(ctx, 'textile.read', { textileId: args.textileId })
    const actor = await principalFromAuth(ctx.auth)
    const records = await ctx.db.query('washRecords').withIndex('by_textile', (q) => q.eq('textileId', args.textileId)).order('desc').take(20)
    return Promise.all(records.map(async ({ outcome: _unusedFixtureOutcome, ...record }) => ({ ...record, assessments: await ownAssessments(ctx, record._id, actor.key) })))
  },
})

/**
 * One finished wash as a history entry, shared by a garment's record and a load's record. Only the
 * reader's own outcome assessments are attached: another member's reports stay private to them.
 */
async function washEntry(ctx: QueryCtx, record: Doc<'washRecords'>, readerKey: string) {
  const assessments = await ownAssessments(ctx, record._id, readerKey)
  return { at: record.completedAt, washerName: record.washerName, cycle: record.cycle, drying: record.drying, recordId: record._id as Id<'washRecords'> | undefined, observation: record.observation, products: record.products,
    ...(assessments.length === 0 ? {} : { assessments }),
    ...(record.activityContext?.garment?.personalRoutine === undefined ? {} : { personalRoutine: record.activityContext.garment.personalRoutine }) }
}

/**
 * One garment's record for its drawer: the drying label as recorded, a remembered drying preference,
 * recorded drying equipment, and its history (finished washes with how each dried, and preference
 * changes), newest first.
 */
export const garmentRecord = query({
  args: { textileId: v.id('textiles') },
  handler: async (ctx, args) => {
    const textile = (await authorize(ctx, 'textile.read', { textileId: args.textileId })).textile
    const actor = await principalFromAuth(ctx.auth)
    const care = await ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', textile._id)).unique()
    const label = labelFromCeiling(tumbleCeiling({ id: textile._id, bulkUnits: 1, care: plannerCare(care) as never, material: care?.material ?? null }))
    const machines = await ctx.db.query('machines').withIndex('by_household', (q) => q.eq('householdId', textile.householdId)).collect()
    const active = machines.filter((machine) => machine.archived !== true)
    const washes = await ctx.db.query('washRecords').withIndex('by_textile', (q) => q.eq('textileId', textile._id)).order('desc').take(20)
    const events = (await ctx.db.query('history').withIndex('by_textile', (q) => q.eq('textileId', textile._id)).order('desc').take(60))
      .filter((event) => event.event === 'drying_preference' || event.event === 'personal_routine')
    return {
      label,
      preference: textile.dryingPreference?.method ?? null,
      ...(textile.personalRoutine?.settings.dry === undefined ? {} : { hasRoutineDry: true }),
      equipment: { tumble: active.some(isDryer), heated_hanging: active.some(isHangingDryer) },
      washes: await Promise.all(washes.map((record) => washEntry(ctx, record, actor.key))),
      preferenceChanges: events.filter((event) => event.event === 'drying_preference').map((event) => ({ at: event.occurredAt, method: typeof event.details?.method === 'string' ? event.details.method : null })),
      ...(events.some((event) => event.event === 'personal_routine') ? { routineChanges: events.filter((event) => event.event === 'personal_routine').map((event) => ({ at: event.occurredAt,
        text: typeof event.details?.choices === 'string' ? `Wash & dry preferences (${event.details.scope === 'once' ? 'this wash only' : 'remembered'}): ${event.details.choices}` : event.details?.expiredRevision === undefined ? 'Following the label again; remembered drying departure cleared' : 'This wash-only routine ended after put-away' })) } : {}),
    }
  },
})

/**
 * What one finished load recorded, piece by piece: each washed garment's wash entry (the same shape a
 * garment's history uses) with its name and color. Each record stays its own entry, so pieces that look
 * alike are never merged; guests keep no records. Null until the load is completed.
 */
export const loadRecord = query({
  args: { sessionId: v.id('sessions') },
  handler: async (ctx, args) => {
    const session = (await authorize(ctx, 'session.read', { sessionId: args.sessionId })).session
    if (session.status !== 'completed') return null
    const actor = await principalFromAuth(ctx.auth)
    const records = await ctx.db.query('washRecords').withIndex('by_session', (q) => q.eq('sessionId', session._id)).collect()
    const pieces = await Promise.all(records.filter((record) => record.householdId === session.householdId).map(async (record) => {
      const identity = await loadIdentity(ctx, actor.key, record.textileId)
      const wash = await washEntry(ctx, record, actor.key)
      return { ...identity, wash: identity.private ? { ...wash, observation: undefined, personalRoutine: undefined } : wash }
    }))
    return { sessionId: session._id, completedAt: session.completedAt ?? null, pieces }
  },
})

/**
 * Completion records washing only; actual product use is written once, by confirmed actions. Each
 * garment ends ready or hanging to dry, washed; guests' garments are summarized and then deleted.
 */
export const complete = mutation({
  args: {
    sessionId: v.id('sessions'),
    planInputHash: v.string(),
    idempotencyKey: v.string(),
  },
  returns: v.object({
    status: v.union(v.literal('completed'), v.literal('already_completed')),
    sessionId: v.id('sessions'),
    /** Household garments now ready, and hanging to dry; guests are listed apart. */
    ready: v.number(),
    hanging: v.number(),
    guests: v.array(v.object({ name: v.string(), hanging: v.boolean() })),
  }),
  handler: async (ctx, args) => {
    nonEmpty(args.planInputHash, 'planInputHash')
    nonEmpty(args.idempotencyKey, 'idempotencyKey')

    const session = (await authorize(ctx, 'session.run', { sessionId: args.sessionId })).session
    const actor = await principalFromAuth(ctx.auth)
    // Checked before the key: cancelling releases the session's start key.
    if (session.status === 'cancelled') fail('conflict', 'Session is cancelled')
    if (session.idempotencyKey !== args.idempotencyKey) fail('conflict', 'Idempotency key mismatch')
    if (session.status === 'completed') return { status: 'already_completed' as const, sessionId: session._id, ...await completedSummary(ctx, session._id) }
    const summary = await completeWash(ctx, session, actor.key, 'finish')
    return { status: 'completed' as const, sessionId: session._id, ...summary }
  },
})

/**
 * Ends a wash and writes its records. `finish`: each garment ends ready or hanging, by the session's
 * own drying steps. `queue`: the washer is done and every garment is wet; household garments join
 * the drying queue with the washer they came out of (dryer loads are planned there, apart from wash
 * loads), and the session's own dryer steps are skipped. Guests' garments are summarized and deleted.
 */
export async function completeWash(ctx: MutationCtx, session: Doc<'sessions'>, actorKey: string, mode: 'finish' | 'queue') {
    const actor = { key: actorKey }
    const plan = await ctx.db.get(session.planId)
    if (plan === null || plan.householdId !== session.householdId) fail('not_found', 'Not found')
    // The session is bound to its plan by id. The hash is not compared: an answer given at the machine
    // re-reads the plan in place, so a Finish queued offline before it carries the plan's earlier hash.

    const timeline = await ctx.db
      .query('timelines')
      .withIndex('by_session', (q) => q.eq('sessionId', session._id))
      .unique()
    // Queued for drying: the session's own dryer steps give way to the drying queue.
    const queuing = mode === 'queue'
    if (!queuing && session.preparationContext?.garments.some((garment) => garment.personalRoutine !== undefined)) fail('conflict', 'Move this wash to the drying queue to follow wash & dry preferences through put-away')
    if (!queuing && session.preparationContext?.garments.some((garment) => {
      const instructions = garment.care?.instructions
      return instructions !== undefined && instructions.beforeDrying.length + instructions.drying.length + instructions.afterDrying.length > 0
    })) fail('conflict', 'Move this wash to the drying queue to follow its recorded label instructions before drying and removal')
    if (queuing && timeline !== null && timeline.actions.some((action) => action.status === 'pending' && isDryerPhase(action.phase))) {
      timeline.actions = timeline.actions.map((action) => action.status === 'pending' && isDryerPhase(action.phase) ? { ...action, status: 'skipped' } as typeof action : action)
      await ctx.db.patch(timeline._id, { actions: timeline.actions })
    }
    if (timeline !== null && timeline.actions.some((action) => action.status === 'pending')) {
      fail('conflict', 'Pending actions must be confirmed, skipped, or missed')
    }
    const planned = planResult(plan).loads.find((load) => load.id === session.loadId)
    if (planned === undefined) fail('not_found', 'Load not found')
    const load = (timeline?.machineId === undefined ? null : loadOn(planned, timeline.machineId)) ?? planned
    const washer = timeline?.machineId === undefined ? null : await ctx.db.get(timeline.machineId)
    const dryer = timeline?.dryerId === undefined ? null : await ctx.db.get(timeline.dryerId)
    const uses = await ctx.db.query('usage').withIndex('by_session', (q) => q.eq('sessionId', session._id)).collect()
    const supplies = new Map(await Promise.all([...new Set(uses.map((use) => use.supplyId))].map(async (id) => [id, (await ctx.db.get(id))?.name ?? 'Product'] as const)))
    const actionsById = new Map(timeline?.actions.map((action) => [action.id, action]) ?? [])
    const soakNames = new Map(timeline?.actions.flatMap((action) => action.kind === 'treatment' && action.soakStarted !== undefined ? [[action.id, action.soakStarted.productName] as const] : []) ?? [])
    const dryerStarted = timeline?.actions.some((action) => action.kind === 'task' && action.task === 'dryer_start' && action.status === 'confirmed') === true
    const textileIds = new Set<string>()
    const now = Date.now()
    let ready = 0
    let hanging = 0
    const guests: { name: string; hanging: boolean }[] = []
    for (const textileId of session.textileIds) {
      if (textileIds.has(textileId)) fail('invalid', 'Session contains duplicate textiles')
      textileIds.add(textileId)
      const textile = await ctx.db.get(textileId)
      if (textile === null || textile.householdId !== session.householdId) fail('forbidden', 'Forbidden')
      const hung = queuing || hangs(timeline, textile._id)
      if (textile.guest === true) {
        guests.push({ name: textile.name, hanging: hung })
        // A guest's piece queued for drying stays until it is put away, then goes; it keeps no history.
        if (queuing) {
          await ctx.db.patch(textile._id, { status: 'hanging', statusSince: now })
          await ctx.db.insert('dryingPieces', { householdId: session.householdId, textileId: textile._id, washSessionId: session._id, washerName: washer?.name ?? 'Washer', status: 'queued', ...(hadStain(textile) ? { stained: true } : {}), queuedAt: now })
        } else await deleteGuest(ctx, textile)
        continue
      }
      const tumbled = !hung && dryerStarted && timeline?.drying?.tumbleTextileIds.includes(textile._id) === true
      const held = timeline?.drying?.heldOut.find((entry) => entry.textileId === textile._id)
      const garmentContext = session.preparationContext?.garments.find((entry) => entry.textileId === textile._id)
      const appliedProducts = uses.filter((use) => {
        const action = actionsById.get(use.actionId ?? '')
        if (action?.kind === 'treatment' && action.textileId !== undefined && action.textileId !== textile._id) return false
        return (action === undefined || !isDryerPhase(action.phase)) || tumbled
      })
      await ctx.db.insert('washRecords', {
        activityContext: { version: 2, independentWashId: session._id, quantity: 1,
          plannerVersion: plan.plannerVersion, planInputHash: plan.inputHash,
          ...(session.preparationContext === undefined ? {} : { preparedAt: session.preparationContext.capturedAt }),
          ...(garmentContext === undefined ? {} : { garment: garmentContext }),
          ...(session.washerContext === undefined ? {} : { washer: session.washerContext }),
          load: { pieceCount: session.textileIds.length, bulkUnits: load.bulkUnits,
            ...(load.soilLevel == null ? {} : { soilLevel: load.soilLevel }),
            ...(session.drumFullness === undefined ? {} : { drumFullness: session.drumFullness }),
          },
          ...(session.machineStartedAt === undefined ? {} : { machineStartedAt: session.machineStartedAt }),
          ...(session.cycleMinutesShown === undefined ? {} : { cycleMinutesShown: session.cycleMinutesShown }),
          products: appliedProducts.map((use) => ({ supplyId: use.supplyId, usedAt: use.usedAt, amount: use.amount, unit: use.unit, placement: use.placement,
            ...(use.mark === undefined ? {} : { mark: use.mark }),
            ...(use.fractionOfMark === undefined ? {} : { fractionOfMark: use.fractionOfMark }),
            ...(use.target === undefined ? {} : { target: use.target }),
            ...(use.approximate === undefined ? {} : { approximate: use.approximate }),
            ...(use.actionId === undefined ? {} : { actionId: use.actionId }),
            ...(actionsById.get(use.actionId ?? '') === undefined ? {} : { phase: actionsById.get(use.actionId ?? '')!.phase, status: actionsById.get(use.actionId ?? '')!.status }),
            ...(use.productContext === undefined ? {} : { context: use.productContext }) })),
          treatments: timeline?.actions.flatMap((action) => action.kind !== 'treatment' || action.textileId !== undefined && action.textileId !== textile._id ? [] : [{ actionId: action.id,
            supplyId: action.supplyId, phase: action.phase, placement: action.placement,
            dose: { amount: action.dose.amount, unit: action.dose.unit, ...(action.dose.mark === undefined ? {} : { mark: action.dose.mark }), ...(action.dose.fractionOfMark === undefined ? {} : { fractionOfMark: action.dose.fractionOfMark }), ...(action.dose.target === undefined ? {} : { target: action.dose.target }), ...(action.dose.approximate === undefined ? {} : { approximate: action.dose.approximate }) }, status: action.status,
            ...(action.productRequirement === undefined ? {} : { productRequirement: action.productRequirement }),
            ...(action.productConfirmation === undefined ? {} : { productConfirmation: action.productConfirmation }),
            ...(action.reusable === undefined ? {} : { reusable: action.reusable }), ...(action.recordedAt === undefined ? {} : { recordedAt: action.recordedAt }),
          }]) ?? [],
          advice: timeline?.actions.flatMap((action) => action.kind !== 'task' || action.advice === undefined || action.garments?.some((piece) => piece.textileId === textile._id) !== true ? [] : [{ actionId: action.id, advice: action.advice, status: action.status,
            ...(action.recordedAt === undefined ? {} : { recordedAt: action.recordedAt }),
          }]) ?? [],
          ...((plan.inputSnapshot as Partial<PlannerInput>).washGoals === undefined ? {} : { washGoals: [...(plan.inputSnapshot as PlannerInput).washGoals!] }),
          ...(load.productRecommendations === undefined ? {} : { recommendationPolicies: [...new Set(load.productRecommendations.map((decision) => decision.policyVersion))].sort() }),
        },
        householdId: session.householdId,
        textileId: textile._id,
        sessionId: session._id,
        completedAt: now,
        washerName: session.washerContext?.name ?? washer?.name ?? null,
        cycle: load.cycle,
        plannedTemperatureC: load.temperatureC,
        ...(textile.flag?.observation === undefined ? {} : { observation: textile.flag.observation }),
        soaks: timeline?.actions.flatMap((action) => action.kind === 'treatment' && action.textileId === textile._id && action.soakStarted !== undefined && action.soak !== undefined && action.status !== 'pending' ? [{ productName: action.soakStarted.productName, startedAt: action.soakStarted.at, waterLitres: action.soakStarted.waterLitres, temperatureC: action.soakStarted.temperatureC, amount: action.soakStarted.amount, unit: action.dose?.unit ?? 'ml', minimumMinutes: action.soak.minimumMinutes, maximumMinutes: action.soak.maximumMinutes, transfer: action.soak.transfer, status: action.status }] : []) ?? [],
        drying: queuing ? { outcome: 'queued' } : tumbled ? {
          outcome: 'tumble_dried',
          ...(dryer === null ? {} : { dryerName: dryer.name }),
          ...(timeline?.drying?.heat === undefined ? {} : { heat: timeline.drying.heat }),
          ...(timeline?.drying?.minutes === undefined ? {} : { minutes: timeline.drying.minutes }),
        } : { outcome: 'left_hanging', ...(held === undefined ? {} : { method: held.method }) },
        products: appliedProducts.map((use) => ({
          name: use.productName ?? soakNames.get(use.actionId ?? '') ?? supplies.get(use.supplyId) ?? 'Product',
          amount: use.amount,
          unit: use.unit,
          ...(use.mark === undefined ? {} : { mark: use.mark }),
          ...(use.fractionOfMark === undefined ? {} : { fractionOfMark: use.fractionOfMark }),
          ...(use.target === undefined ? {} : { target: use.target }),
          ...(use.approximate === undefined ? {} : { approximate: use.approximate }),
          placement: use.placement,
        })),
      })
      // A stain is never cleared silently: it waits for "Stain gone?" with what this wash tried.
      // Each is recorded with its product and chemistry, so a second try can choose something different.
      const treated = timeline?.actions.flatMap((action): Attempt[] => {
        if (action.kind !== 'treatment' || action.textileId !== textile._id || action.status !== 'confirmed') return []
        const step = load.treatments.find((entry) => entry.textileId === textile._id && entry.supplyId === action.supplyId)
        const chemistry = step === undefined ? undefined : treatmentChemistry(plan.inputSnapshot as PlannerInput, step)
        return [{ name: soakNames.get(action.id) ?? supplies.get(action.supplyId as Id<'supplies'>) ?? 'A pretreatment', supplyId: action.supplyId, ...(chemistry === undefined ? {} : { chemistry }), washedOut: true }]
      }) ?? []
      // Washed: no longer soiled, flagged or worn; soil is recorded afresh the next time it needs a wash.
      await ctx.db.patch(textile._id, {
        status: hung ? 'hanging' : 'clean',
        soilLevel: undefined,
        flag: undefined,
        ...(hadStain(textile) ? { stainCheck: nextStainCheck(textile, treated, now) } : {}),
        wearsSinceClean: undefined,
        lastCleanedAt: now,
        statusSince: now,
        washCount: textile.washCount + 1,
        firstWash: false,
        ...(textile.dyeRun === 'new' ? { dyeRun: 'unknown' as const } : {}),
      })
      const event = { householdId: session.householdId, sessionId: session._id, textileId: textile._id, ownerPrincipalKey: textile.ownerPrincipalKey, occurredAt: now, actorPrincipalKey: actor.key }
      await ctx.db.insert('history', { ...event, event: 'washed' })
      if (hung) await ctx.db.insert('history', { ...event, event: 'hung' })
      if (hung) hanging += 1
      else ready += 1
      if (queuing) {
        const pieceId = await ctx.db.insert('dryingPieces', {
          householdId: session.householdId,
          textileId: textile._id,
          washSessionId: session._id,
          washerName: washer?.name ?? 'Washer',
          status: 'queued',
          ...(hadStain(textile) ? { stained: true } : {}),
          queuedAt: now,
        })
        // Laundry day "Wash now, hang to dry": a rack or line this time only, by the same rule as
        // "Hang them". A dry-flat piece, one set to dry flat, or one with label drying steps keeps its own way.
        const piece = plan.hangTextileIds?.includes(textile._id) === true ? await ctx.db.get(pieceId) : null
        if (piece !== null && await queuedPieceMayHangOnce(ctx, piece, session)) await ctx.db.patch(pieceId, { method: 'rack_line' })
      }
    }

    await cancelSessionReminders(ctx, session._id)

    if (timeline !== null) {
      await ctx.db.patch(timeline._id, { status: 'completed', revision: timeline.revision + 1 })
    }
    await ctx.db.patch(session._id, {
      status: 'completed',
      completedAt: now,
      revision: session.revision + 1,
    })
    // A washed garment is no longer a first wash, which changes color-separation planning. A plan under
    // way keeps its loads still to start while they come out the same; open plans are made again.
    await invalidatePlans(ctx, session.householdId, { dosesOnly: true })
    // Every load of the plan started and none still running: nothing is left to start, so it is released.
    const planSessions = (await ctx.db.query('sessions').withIndex('by_plan', (q) => q.eq('planId', plan._id)).collect()).filter((entry) => entry.status !== 'cancelled')
    const loads = planResult(plan).loads
    if (planSessions.every((entry) => entry.status !== 'running') && loads.every((load) => planSessions.some((entry) => (entry.loadId ?? loads[0]!.id) === load.id))) {
      const current = await ctx.db.get(plan._id)
      if (current?.status === 'used') await ctx.db.patch(plan._id, { status: 'stale' })
    }
    await releasePlan(ctx, session.planId)
    return { ready, hanging, guests }
}
