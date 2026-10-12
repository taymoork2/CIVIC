import { v } from 'convex/values'
import { dryerShare, midRunCheck, dryerSupplyKinds, dryerSupplyUse, isKnit, garmentKey, dryerTimeSuggestion, fitInDryer, isDryer, isHangingDryer, kindBulkUnits, labelFromCeiling, methodEvidence, pieceMethod, planDryerLoads, tumbleCeiling, chooseDryerSetting, documentedHeatSettings, dryerHeats, type DryerHeat, type DryingMethod, type QueuedPiece } from '@washcloset/planner'
import { careProcessRequirements, dryingProcessUnmatched, materialCareProblem, type DryingProcessContext } from '@washcloset/planner'

import type { Doc, Id } from './_generated/dataModel'
import { mutation, query, type MutationCtx } from './_generated/server'
import { authorize, loadIdentity, related, type Action, type ReadCtx } from './access'
import { fail } from './errors'
import { clientTime, dryerBusyReason, homeDryerBusy, sessionInHomeDryer } from './execution'
import { canonicalPlannerInput, invalidatePlans, plannerCare } from './plans'
import { dryerHeat, dryingMethod, neededByValue } from './validators'
import { completeWash, deleteGuest } from './sessions'
import { completeGuidance } from './households'
import { careInstructionRevision, dryingInstructionToken, dryingProcessContext } from './careInstructions'
import { routineCurrent, routineLabelHash } from './personalRoutineValues'
import { expireOnceRoutine } from './personalRoutines'
import { recordedDryerProgram, startingDryerContext, startingDryerSuggestion } from './dryerContext'
import { mayHangOnce, pieceFacts, type PieceFacts } from './hangRule'
import { planCreator, runEnd, scheduleReminder } from './reminders'

/**
 * The drying queue: washed pieces wait here after their washer, dryer loads are planned from them
 * apart from wash loads, and each piece keeps the washer it came out of until it is put away.
 * Nothing here reserves a dryer; in a shared room the person enters the dryer they are loading.
 */

const heatRank = (heat: string): number => dryerHeats.indexOf(heat as DryerHeat)

/** A dryer's recorded capacity, or null when it is unknown: never treated as unlimited. */
function dryerCapacity(dryer: Doc<'machines'>): number | null {
  if (dryer.capacityConfidence === 'unknown') return null
  return typeof dryer.capacityUnits === 'number' && dryer.capacityUnits > 0 ? dryer.capacityUnits : null
}


/** Its heat comes from the person's My routine, not the tag. */
const routineHeat = (facts: PieceFacts) => facts.ceiling !== facts.labelCeiling && 'maxHeat' in facts.ceiling

/** Read a wash snapshot once, even when many of its physical pieces share this queue. */
async function factsForPieces(ctx: ReadCtx, pieces: readonly Doc<'dryingPieces'>[]): Promise<PieceFacts[]> {
  const ids = [...new Set(pieces.map((piece) => piece.washSessionId))]
  const sessions = new Map(await Promise.all(ids.map(async (id) => [id, await ctx.db.get(id)] as const)))
  return Promise.all(pieces.map((piece) => pieceFacts(ctx, piece, sessions.get(piece.washSessionId) ?? null)))
}

/** How a piece starts drying, fixed for its wash record: the method, where it came from, what the label says. */
function driedWith(facts: PieceFacts, method: DryingMethod, process?: DryingProcessContext): NonNullable<Doc<'dryingPieces'>['dried']> {
  const scope = facts.choice.method === method && facts.choice.source !== null ? facts.choice.source : 'once'
  return { method, scope, evidence: methodEvidence(method, facts.label), label: facts.label, ...(process === undefined ? {} : { process }), ...(facts.instructions === undefined ? {} : { instructions: facts.instructions }), ...(scope !== 'routine' || facts.routine === undefined ? {} : { personalRoutine: facts.routine }) }
}

function checkDryingInstructions(facts: readonly PieceFacts[], pieceIds: readonly string[], acknowledged: boolean | undefined, token: string | undefined, method: DryingMethod | undefined, process?: DryingProcessContext): void {
  if (facts.some((fact) => fact.routineNeedsReview)) fail('conflict', 'Wash & dry preferences need review after a label change. Choose a drying method for this event using the current label limits.')
  const unresolved = facts.flatMap((fact) => dryingProcessUnmatched(fact.instructions, method ?? fact.choice.method ?? '', process))
  if (unresolved.length > 0) fail('conflict', `A required drying setting is not yet matched to a supported process: ${[...new Set(unresolved)].join('; ')}`)
  if (facts.some((fact) => careProcessRequirements(fact.instructions, 'drying').requirements.some((entry) => entry.kind === 'drip_dry') && !fact.noSpinRecorded)) fail('conflict', 'Drip drying requires this wash’s recorded no-spin process; a later label or method change cannot establish it')
  if (facts.some((fact) => (fact.instructions?.beforeDrying.length ?? 0) + (fact.instructions?.drying.length ?? 0) > 0)) {
    if (acknowledged !== true) fail('conflict', 'Follow the recorded label preparation before starting drying')
    if (token !== dryingInstructionToken(facts.map((fact, index) => ({ id: pieceIds[index]!, instructions: fact.instructions })))) fail('conflict', 'The label wording changed. Review the current drying instructions again.')
  }
}

function queuedPiece(piece: Doc<'dryingPieces'>, facts: PieceFacts): QueuedPiece {
  return {
    id: piece._id,
    bulkUnits: facts.bulkUnits,
    maxHeat: 'maxHeat' in facts.ceiling ? facts.ceiling.maxHeat : null,
    ...('maxHeat' in facts.ceiling ? {} : { hold: facts.ceiling }),
    source: piece.washerName,
    method: facts.choice.method,
    ...(piece.ownLoad === true ? { own: true } : {}),
    ...(piece.need === undefined ? {} : { need: piece.need }),
    ...(routineHeat(facts) ? { routine: true } : {}),
  }
}

async function householdPiece(ctx: ReadCtx, action: Action, pieceId: Id<'dryingPieces'>, householdId?: Id<'households'>): Promise<Doc<'dryingPieces'>> {
  const piece = await ctx.db.get(pieceId)
  if (piece === null) fail('not_found', 'That piece is no longer in the drying queue')
  if (householdId !== undefined && piece.householdId !== householdId) fail('forbidden', 'Forbidden')
  await authorize(ctx, action, { householdId: piece.householdId })
  return piece
}

/** Puts one washed piece's record right once it dried: in which dryer, at what heat, or air dried. */
async function recordDried(ctx: MutationCtx, piece: Doc<'dryingPieces'>, run: Doc<'dryingRuns'>, checkedAt: number, checkedBy: string, early?: { readonly minutes: number }): Promise<void> {
  const record = await ctx.db.query('washRecords').withIndex('by_textile_session', (q) => q.eq('textileId', piece.textileId).eq('sessionId', piece.washSessionId)).unique()
  if (record === null) return
  const how = piece.dried === undefined ? {} : { method: piece.dried.method, scope: piece.dried.scope, evidence: piece.dried.evidence, label: piece.dried.label, ...(piece.dried.process === undefined ? {} : { process: piece.dried.process }), ...(piece.dried.instructions === undefined ? {} : { instructions: piece.dried.instructions }), ...(piece.dried.personalRoutine === undefined ? {} : { personalRoutine: piece.dried.personalRoutine }) }
  const activity = run.activityContext === undefined ? {} : { activityContext: {
    version: 1 as const, runId: run._id, start: run.activityContext,
    displayedStarts: [...(run.earlier ?? []), { startedAt: run.startedAt, ...(run.minutes === undefined ? {} : { minutes: run.minutes }) }],
    checkedAt, checkedBy, recordedAt: Date.now(), telemetry: false as const,
  } }
  // Taken out before the end: the minutes it actually tumbled, not the run's.
  const tumbled = early?.minutes ?? (run.minutes === undefined ? undefined : run.minutes + (run.earlier ?? []).reduce((total, start) => total + start.minutes, 0))
  const missed = run.midCheck?.missed === true && run.midCheck.pieceIds.includes(piece._id) ? { checkMissed: true } : {}
  const first = piece.tumbledFirst
  await ctx.db.patch(record._id, {
    drying: run.kind === 'dryer'
      ? { outcome: 'tumble_dried', ...how, ...activity, ...missed, ...(run.dryerName === undefined ? {} : { dryerName: run.dryerName }), ...(run.heat === undefined ? {} : { heat: run.heat }), ...(tumbled === undefined ? {} : { minutes: tumbled }), ...(run.durationSuggestion === undefined ? {} : { durationSuggestion: run.durationSuggestion }), ...(run.products === undefined || run.products.length === 0 ? {} : { products: run.products.map((product) => product.name) }) }
      // Hung at a mid-run check: "tumbled N min, then hung", with the dryer it tumbled in.
      : first !== undefined ? { outcome: 'left_hanging', method: run.method ?? 'rack_line', ...how, ...activity, tumbledMinutes: first.minutes, ...(first.dryerName === undefined ? {} : { dryerName: first.dryerName }), ...(first.heat === undefined ? {} : { heat: first.heat }) }
      : { outcome: 'left_hanging', method: run.method ?? 'rack_line', ...how, ...activity, ...(run.dryerName === undefined ? {} : { dryerName: run.dryerName }) },
  })
}

function dryingContext(machine: Doc<'machines'> | null, facts: readonly PieceFacts[], fit: string,
  products: NonNullable<Doc<'dryingRuns'>['activityContext']>['products'] = []): NonNullable<Doc<'dryingRuns'>['activityContext']> {
  const capturedAt = Date.now()
  return { version: 1, capturedAt, products,
    load: { pieceCount: facts.length, bulkUnits: facts.reduce((total, fact) => total + fact.bulkUnits, 0), fit },
    ...(machine === null ? {} : { machine: { machineId: machine._id, capturedAt, name: machine.name,
      provenance: machine.provenance, telemetry: false,
      ...(machine.model === undefined ? {} : { model: machine.model }),
      ...(machine.highEfficiency === undefined ? {} : { highEfficiency: machine.highEfficiency }),
      ...(machine.catalogBinding === undefined ? {} : { catalogBinding: machine.catalogBinding }),
      ...(machine.applianceType === undefined ? {} : { applianceType: machine.applianceType }),
      ...(machine.heatSettings === undefined ? {} : { heatSettings: machine.heatSettings }),
      ...(machine.capacityUnits === undefined ? {} : { capacityUnits: machine.capacityUnits }),
      ...(machine.capacityConfidence === undefined ? {} : { capacityConfidence: machine.capacityConfidence }),
      ...(machine.cycleProfile === undefined ? {} : { cycleProfile: machine.cycleProfile }),
      ...(machine.drumVolume === undefined ? {} : { drumVolume: machine.drumVolume }),
    } }),
  }
}

/**
 * "Move to drying queue": the washer has finished, and its pieces join the drying queue with that
 * washer's name. Repeated taps (or a retry queued offline) never queue the same wash twice.
 */
export const queueFromWasher = mutation({
  args: { sessionId: v.id('sessions'), at: v.optional(v.number()) },
  returns: v.object({ queued: v.number(), already: v.boolean() }),
  handler: async (ctx, args) => {
    const { session, actor } = await authorize(ctx, 'session.run', { sessionId: args.sessionId })
    const existing = await ctx.db.query('dryingPieces').withIndex('by_wash_session', (q) => q.eq('washSessionId', session._id)).collect()
    if (session.status === 'completed') return { queued: existing.length, already: true }
    if (session.status !== 'running') fail('conflict', 'This wash is not running')
    if (session.machineStartedAt === undefined) fail('conflict', 'Start the washer first')
    if (session.washFinishedAt === undefined) await ctx.db.patch(session._id, { washFinishedAt: clientTime(args.at, Date.now()) })
    await completeWash(ctx, (await ctx.db.get(session._id))!, actor.key, 'queue')
    const queued = await ctx.db.query('dryingPieces').withIndex('by_wash_session', (q) => q.eq('washSessionId', session._id)).collect()
    return { queued: queued.length, already: false }
  },
})

/** The dryer sharing line (design 8.2): counted both ways, offered only when it saves a run; absent otherwise. */
function shareLine(waiting: readonly { readonly piece: Doc<'dryingPieces'>; readonly facts: PieceFacts; readonly queued: QueuedPiece }[], capacityUnits: number | null) {
  const knit = new Set(waiting.filter((row) => isKnit(row.facts.textile?.kind)).map((row) => row.piece._id as string))
  const share = dryerShare(waiting.map((row) => row.queued), { capacityUnits, knit })
  return share === null ? {} : { share }
}

/**
 * The queue and its planned dryer loads. `combine`: "All on low heat". `capacityUnits`: the dryer
 * the loads are planned for in a shared room (null: capacity unknown, fit not checked); at home the
 * one home dryer's own capacity is used.
 */
export const queue = query({
  args: { householdId: v.id('households'), combine: v.optional(v.boolean()), capacityUnits: v.optional(v.union(v.number(), v.null())) },
  handler: async (ctx, args) => {
    const viewer = (await authorize(ctx, 'session.read', { householdId: args.householdId })).actor
    /** Routine owners as per-response ordinals: groups split by owner without exposing anyone's key. */
    const routineOwners = new Map<string, number>()
    const routineOwner = (key: string) => routineOwners.get(key) ?? routineOwners.set(key, routineOwners.size).get(key)!
    const pieces = await ctx.db.query('dryingPieces').withIndex('by_household', (q) => q.eq('householdId', args.householdId)).collect()
    const household = await ctx.db.get(args.householdId)
    const machines = await ctx.db.query('machines').withIndex('by_household', (q) => q.eq('householdId', args.householdId)).collect()
    const dryers = machines.filter((machine) => machine.archived !== true && isDryer(machine)).sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))
    const hangingDryers = machines.filter((machine) => machine.archived !== true && isHangingDryer(machine)).sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))
    const homeDryers = dryers.filter((dryer) => dryer.location !== 'shared')
    const homeDryer = homeDryers.length === 1 && dryers.every((dryer) => dryer.location !== 'shared') ? homeDryers[0]! : null
    const capacities = [...new Set(dryers.map(dryerCapacity).filter((capacity): capacity is number => capacity !== null))].sort((left, right) => left - right)
    const capacityUnits = homeDryer !== null ? dryerCapacity(homeDryer) : args.capacityUnits === undefined ? capacities.at(-1) ?? null : args.capacityUnits

    pieces.sort((left, right) => left.queuedAt - right.queuedAt || left._creationTime - right._creationTime)
    const facts = await factsForPieces(ctx, pieces)
    const identities = new Map(await Promise.all(pieces.map(async (piece) => [piece._id, await loadIdentity(ctx, viewer.key, piece.textileId)] as const)))
    const rows = pieces.map((piece, index) => ({ piece, facts: facts[index]!, queued: queuedPiece(piece, facts[index]!) }))
    const waiting = rows.filter((row) => row.piece.status === 'queued')
    const runs = await ctx.db.query('dryingRuns').withIndex('by_household_status', (q) => q.eq('householdId', args.householdId).eq('status', 'running')).collect()
    const view = (row: (typeof rows)[number]) => {
      const instructions = row.piece.dried === undefined ? row.facts.instructions : row.piece.dried.instructions
      return {
        pieceId: row.piece._id,
        ...identities.get(row.piece._id)!,
        kind: identities.get(row.piece._id)?.private ? null : row.facts.textile?.kind ?? null,
        colorGroup: identities.get(row.piece._id)?.private ? null : row.facts.textile?.colorGroup ?? null,
        /** A guest's garment never groups with a household one that looks the same. */
        ...(row.facts.textile?.guest === true ? { guest: true } : {}),
        washerName: row.piece.washerName,
        status: row.piece.status,
        /** When it came out of the washer into the queue: wet since about then until it dries. */
        queuedAt: row.piece.queuedAt,
        own: row.piece.ownLoad === true,
        need: row.piece.need ?? null,
        /** The drying label as recorded; never changed by a choice. */
        label: row.facts.label,
        ...(instructions === undefined ? {} : { instructions, instructionRevision: careInstructionRevision(instructions) }),
        ...(row.facts.noSpinRecorded ? { noSpinRecorded: true } : {}),
        method: row.facts.choice.method,
        source: row.facts.choice.source,
        ...(row.facts.stained ? { stained: true } : {}),
        evidence: row.facts.choice.evidence,
        ...(row.facts.routine?.settings.dry === undefined ? {} : { routine: row.facts.routine.settings.dry, labelMaxHeat: 'maxHeat' in row.facts.labelCeiling ? row.facts.labelCeiling.maxHeat : null }),
        ...(row.facts.textile?.personalRoutine === undefined ? {} : { routineRevision: row.facts.textile.routineRevision ?? 0, routineLabelHash: row.facts.labelHash, routineOwner: routineOwner(row.facts.textile.ownerPrincipalKey) }),
        ...(row.facts.routineNeedsReview ? { routineNeedsReview: true } : {}),
        preference: row.facts.preference,
        dried: row.piece.dried ?? null,
        maxHeat: row.queued.maxHeat,
        hold: row.queued.hold?.method ?? null,
        bulkUnits: row.facts.bulkUnits,
        dryingRunId: row.piece.dryingRunId ?? null,
        driedIn: row.piece.driedIn ?? null,
      }
    }
    return {
      pieces: rows.map(view),
      plan: planDryerLoads(waiting.map((row) => row.queued), { combine: args.combine === true, capacityUnits }),
      ...shareLine(waiting, capacityUnits),
      capacityUnits,
      capacities,
      homeDryerId: homeDryer?._id ?? null,
      /** Loads the household's rack or line holds, as asked (design 5.6); absent until asked. */
      ...(household?.planning?.day?.rackLoads === undefined ? {} : { rackLoads: household.planning.day.rackLoads }),
      /** A running wash whose own dryer step is still in the home dryer: pages without session rows see it busy too. */
      homeDryerSessionId: homeDryer === null ? null : await sessionInHomeDryer(ctx, homeDryer),
      hangingDryers: hangingDryers.map((machine) => ({ machineId: machine._id, name: machine.name })),
      /** Recorded dryer equipment, which a tumble or heated hanging choice needs. */
      equipment: { tumble: dryers.length > 0, heated_hanging: hangingDryers.length > 0 },
      dryers: dryers.map((dryer) => ({
        machineId: dryer._id,
        name: dryer.name,
        location: dryer.location ?? null,
        capacityUnits: dryerCapacity(dryer),
        heatSettings: documentedHeatSettings(dryer.model, dryer.heatSettings ?? []),
        pricePerStart: dryer.pricePerStart ?? null,
        ...(dryer.blockMinutes === undefined ? {} : { blockMinutes: dryer.blockMinutes }),
        ...(dryer.capacityConfidence === undefined ? {} : { capacityConfidence: dryer.capacityConfidence }),
        ...(dryer.cycleProfile?.cycles.timed === undefined ? {} : { programTime: dryer.cycleProfile.cycles.timed }),
      })),
      runs: await Promise.all(runs.sort((left, right) => left.startedAt - right.startedAt).map(async (run) => ({
        runId: run._id,
        kind: run.kind,
        dryerId: run.dryerId ?? null,
        /** The viewer asked "Wait for the dryer": a reminder for them at this run's current end. */
        reminded: (await ctx.db.query('reminders').withIndex('by_drying_run', (q) => q.eq('dryingRunId', run._id)).collect())
          .some((reminder) => reminder.status !== 'cancelled' && reminder.dueAt === runEnd(run) && reminder.recipientPrincipalKey === viewer.key),
        method: run.method ?? null,
        dryerName: run.dryerName ?? null,
        heatLabel: run.heatLabel ?? null,
        startedAt: run.startedAt,
        minutes: run.minutes ?? null,
        /** The mid-run check still to do (design 8.4), or one that was missed; absent otherwise. */
        ...(run.midCheck === undefined || run.midCheck.checkedAt !== undefined ? {}
          : { check: { at: run.midCheck.checkAt, atMinute: run.midCheck.atMinute, pieceIds: run.midCheck.pieceIds, reasons: run.midCheck.reasons, missed: run.midCheck.missed === true } }),
        pieceIds: rows.filter((row) => row.piece.dryingRunId === run._id && row.piece.status === 'drying').map((row) => row.piece._id),
      }))),
    }
  },
})

/** Applicable context for the pieces actually fitting this dryer; caller-private outcome influence. */
export const durationContext = query({
  args: { householdId: v.id('households'), dryerId: v.id('machines'), pieceIds: v.array(v.id('dryingPieces')), heat: v.optional(dryerHeat), productIds: v.optional(v.array(v.id('supplies'))) },
  handler: async (ctx, args) => {
    const actor = (await authorize(ctx, 'session.read', { householdId: args.householdId })).actor
    const dryer = await ctx.db.get(args.dryerId)
    if (dryer === null || dryer.householdId !== args.householdId || dryer.archived === true || !isDryer(dryer)) fail('invalid', 'Pick a dryer')
    if (args.pieceIds.length === 0 || args.pieceIds.length > 96 || new Set(args.pieceIds).size !== args.pieceIds.length) fail('invalid', 'Pick up to 96 pieces going in')
    const pieces = await Promise.all(args.pieceIds.map((id) => householdPiece(ctx, 'session.read', id, args.householdId)))
    if (pieces.some((piece) => piece.status !== 'queued')) return null
    const facts = await factsForPieces(ctx, pieces)
    const context = await startingDryerContext(ctx, dryer, pieces, args.heat ?? null,
      facts.map((fact, index) => ({ textileId: pieces[index]!.textileId, labelHash: fact.labelHash, bulkUnits: fact.bulkUnits })), args.productIds ?? [])
    return startingDryerSuggestion(ctx, args.householdId, actor.key, dryer, pieces, context)
  },
})

/**
 * One queued piece: "Own dryer load" / "Merge back", "Needed by", and "Change drying method". A method
 * applies "This time only" (it ends when the piece is put away) or, with `remember`, is kept on the
 * garment until "Follow label again". `method: null` goes back to the preference or label. The
 * drying label is never edited and no choice is declared safe; washing and bleach rules are untouched.
 */
export const setPiece = mutation({
  args: {
    pieceId: v.id('dryingPieces'),
    /** A displayed garment group; legacy callers still change just pieceId. */
    pieceIds: v.optional(v.array(v.id('dryingPieces'))),
    own: v.optional(v.boolean()),
    need: v.optional(v.union(neededByValue, v.null())),
    method: v.optional(v.union(dryingMethod, v.null())),
    remember: v.optional(v.boolean()),
    followLabel: v.optional(v.boolean()),
    expectedRoutineRevision: v.optional(v.number()),
    expectedLabelHash: v.optional(v.string()),
    /** Older clients: "Air dry" is a rack or line this time only. */
    air: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const piece = await householdPiece(ctx, 'session.run', args.pieceId)
    const actor = (await authorize(ctx, 'session.run', { householdId: piece.householdId })).actor
    const ids = [...new Set(args.pieceIds ?? [args.pieceId])]
    if (!ids.includes(args.pieceId)) fail('invalid', 'The garment group must include the selected piece')
    if (ids.length > 96) fail('invalid', 'Choose up to 96 pieces')
    const pieces = await Promise.all(ids.map((id) => householdPiece(ctx, 'session.run', id, piece.householdId)))
    for (const entry of pieces) {
      if (entry.status !== 'queued') fail('conflict', 'Only queued pieces can be changed')
      if (entry.washerName !== piece.washerName) fail('invalid', 'Choose pieces of the same garment from the same washer')
    }
    // Matching pieces are separate garments: one group shares the garment identity and the label.
    const textileIds = [...new Set(pieces.map((entry) => entry.textileId))]
    const textiles = await Promise.all(textileIds.map(async (id) => {
      const textile = await ctx.db.get(id)
      if (textile === null) fail('not_found', 'Not found')
      return textile
    }))
    if (new Set(textiles.map((textile) => garmentKey(textile))).size > 1) fail('invalid', 'Choose pieces of the same garment from the same washer')
    if (pieces.length > 1) await sameDryingLabel(ctx, pieces)
    const method = args.air === undefined ? args.method : args.air ? 'rack_line' : null
    if (args.followLabel === true) {
      const otherPieces = await ctx.db.query('dryingPieces').withIndex('by_household', (q) => q.eq('householdId', piece.householdId)).collect()
      // Every member is checked before any is changed, so the group follows its label together or not at all.
      for (const textile of textiles) {
        await authorize(ctx, 'routine.clear', { householdId: piece.householdId, subjects: [textile.ownerPrincipalKey] })
        const care = await ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', textile._id)).unique()
        if (args.expectedRoutineRevision !== (textile.routineRevision ?? 0) || args.expectedLabelHash !== routineLabelHash(care)) fail('conflict', 'The label or routine changed. Review it again.')
        if (otherPieces.some((entry) => entry.textileId === textile._id && entry.status !== 'queued')) fail('conflict', 'Wait until this garment is put away')
      }
      for (const textile of textiles) {
        const revision = (textile.routineRevision ?? 0) + 1
        await ctx.db.patch(textile._id, { personalRoutine: undefined, routineWashId: undefined, routineRevision: revision, dryingPreference: undefined })
        await ctx.db.insert('history', { householdId: textile.householdId, textileId: textile._id, ownerPrincipalKey: textile.ownerPrincipalKey,
          event: 'personal_routine', occurredAt: Date.now(), actorPrincipalKey: actor.key, details: { follows: 'label', revision, clearedDryingPreference: true } })
      }
      for (const entry of pieces) await ctx.db.patch(entry._id, { method: undefined, air: undefined })
      await invalidatePlans(ctx, piece.householdId)
      return null
    }
    if (args.remember === true) {
      if (method === undefined || method === null) fail('invalid', 'Choose the method to remember')
      for (const textileId of textileIds) await rememberMethod(ctx, textileId, method, actor.key)
    }
    for (const entry of pieces) await ctx.db.patch(entry._id, {
      ...(args.own === undefined ? {} : { ownLoad: args.own ? true : undefined }),
      ...(args.need === undefined ? {} : { need: args.need ?? undefined }),
      ...(method === undefined ? {} : { method: args.remember === true || method === null ? undefined : method, air: undefined }),
    })
    return null
  },
})

/**
 * A group choice covers what its label says only when every member's label says the same: the
 * drying label, its heat ceiling and the recorded drying instructions. Otherwise each piece is chosen alone.
 */
async function sameDryingLabel(ctx: ReadCtx, pieces: readonly Doc<'dryingPieces'>[]): Promise<void> {
  const facts = await factsForPieces(ctx, pieces)
  const labels = new Set(facts.map((fact) => JSON.stringify([fact.label, fact.labelCeiling, fact.instructions === undefined ? null : careInstructionRevision(fact.instructions)])))
  if (labels.size > 1) fail('conflict', 'These pieces have different care labels. Choose a drying method for each one.')
}

/**
 * "Remember for this garment" (a method) or "Follow label again" (null). A method the label itself
 * leads to is the label, so nothing is kept. History records the change; the label stays as it is.
 */
async function rememberMethod(ctx: MutationCtx, textileId: Id<'textiles'>, method: DryingMethod | null, actorKey: string): Promise<void> {
  await authorize(ctx, 'textile.edit', { textileId })
  const textile = await ctx.db.get(textileId)
  if (textile === null) fail('not_found', 'Not found')
  const care = await ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', textileId)).unique()
  const label = labelFromCeiling(tumbleCeiling({ id: textileId, bulkUnits: 1, care: plannerCare(care) as never, material: care?.material ?? null }))
  const keep = method !== null && methodEvidence(method, label) !== 'allowed' ? method : null
  if ((textile.dryingPreference?.method ?? null) === keep) return
  const now = Date.now()
  await ctx.db.patch(textile._id, { dryingPreference: keep === null ? undefined : { method: keep, setAt: now, setBy: actorKey } })
  await ctx.db.insert('history', {
    householdId: textile.householdId, textileId: textile._id, ownerPrincipalKey: textile.ownerPrincipalKey,
    event: 'drying_preference', occurredAt: now, actorPrincipalKey: actorKey,
    details: keep === null ? { follows: 'label', label } : { method: keep, label, evidence: methodEvidence(keep, label) },
  })
}

/** The garment drawer's "Drying preference": change it, or "Follow label again" with `method: null`. */
export const setDryingPreference = mutation({
  args: {
    textileId: v.id('textiles'),
    /** Matching garments shown as one row; every one must share the garment identity and its label. */
    textileIds: v.optional(v.array(v.id('textiles'))),
    method: v.union(dryingMethod, v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ids = [...new Set(args.textileIds ?? [args.textileId])]
    if (!ids.includes(args.textileId)) fail('invalid', 'The garment group must include the selected garment')
    if (ids.length > 96) fail('invalid', 'Choose up to 96 garments')
    const textiles = await Promise.all(ids.map((id) => ctx.db.get(id)))
    const first = textiles[0]
    if (textiles.some((textile) => textile === null || textile.trashedAt !== undefined)) fail('not_found', 'Not found')
    const actor = (await authorize(ctx, 'textile.edit', { householdId: first!.householdId, uses: { textileIds: ids } })).actor
    if (textiles.some((textile) => textile!.householdId !== first!.householdId)) fail('forbidden', 'Forbidden')
    if (new Set(textiles.map((textile) => garmentKey(textile!))).size > 1) fail('invalid', 'Choose matching garments')
    if (textiles.length > 1) {
      // The same comparison as a queued group: the drying label, its heat ceiling and the recorded instructions.
      const labels = await Promise.all(textiles.map(async (textile) => {
        const care = await ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', textile!._id)).unique()
        const ceiling = tumbleCeiling({ id: textile!._id, bulkUnits: 1, care: plannerCare(care) as never, material: care?.material ?? null })
        return JSON.stringify([labelFromCeiling(ceiling), ceiling, care?.instructions === undefined ? null : careInstructionRevision(care.instructions)])
      }))
      if (new Set(labels).size > 1) fail('conflict', 'These garments have different care labels. Choose a drying preference for each one.')
    }
    for (const textile of textiles) await rememberMethod(ctx, textile!._id, args.method, actor.key)
    return null
  },
})

/**
 * The dryer products that could go in with these pieces, each with the label's dose or why it stays
 * out. A dryer sheet is optional and never added by default.
 */
export const dryerProducts = query({
  args: { householdId: v.id('households'), pieceIds: v.array(v.id('dryingPieces')) },
  handler: async (ctx, args) => {
    await authorize(ctx, 'supply.read', { householdId: args.householdId })
    const pieces = (await Promise.all(args.pieceIds.map((id) => ctx.db.get(id)))).filter((piece): piece is Doc<'dryingPieces'> => piece !== null && piece.householdId === args.householdId)
    return dryerProductUses(ctx, args.householdId, pieces)
  },
})

async function dryerProductUses(ctx: ReadCtx, householdId: Id<'households'>, pieces: readonly Doc<'dryingPieces'>[]) {
  const input = await canonicalPlannerInput(ctx, householdId, [...new Set(pieces.map((piece) => piece.textileId))], { mode: 'normal', loadPins: [], dismissedQuestions: [], excludedSupplyIds: [] })
  const garments = (input.textiles ?? []).map((textile) => ({ id: textile.id, bulkUnits: textile.bulkUnits ?? 1, care: textile.care, material: textile.material ?? null, requirements: textile.requirements ?? null }))
  return (input.supplies ?? []).filter((supply) => (dryerSupplyKinds as readonly string[]).includes(supply.kind ?? '')).map((supply) => {
    const use = dryerSupplyUse(supply, garments as never, input, 'dryer')
    const dose = use.treatment?.dose
    return {
      supplyId: supply.id as Id<'supplies'>,
      name: supply.name ?? '',
      kind: supply.kind ?? null,
      usable: use.treatment !== undefined,
      omission: use.omission?.cause ?? null,
      dose: dose === undefined || dose.unit === 'at_machine' ? null : { amount: dose.amount, unit: dose.unit, mark: dose.mark ?? null, ...(dose.fractionOfMark === undefined ? {} : { fractionOfMark: dose.fractionOfMark }) },
      atMachine: dose?.unit === 'at_machine',
    }
  })
}

/** A dryer_done reminder for `recipient` at the run's current end, unless that person already has one waiting for that time. */
async function remindAtEnd(ctx: MutationCtx, run: Doc<'dryingRuns'>, recipient: string): Promise<void> {
  const dueAt = runEnd(run)
  if (dueAt === null) return
  const existing = await ctx.db.query('reminders').withIndex('by_drying_run', (q) => q.eq('dryingRunId', run._id)).collect()
  if (existing.some((reminder) => reminder.kind === 'dryer_done' && reminder.status === 'scheduled' && reminder.dueAt === dueAt && reminder.recipientPrincipalKey === recipient)) return
  await scheduleReminder(ctx, { householdId: run.householdId, kind: 'dryer_done', dryingRunId: run._id, dueAt, recipientPrincipalKey: recipient })
}

/**
 * "Wait for the dryer": a reminder when this dryer run's timer runs out. A restart for damp pieces
 * moves it to the new end. Only a timed dryer run has an end to remind at.
 */
export const remindWhenDone = mutation({
  args: { runId: v.id('dryingRuns') },
  returns: v.object({ dueAt: v.number() }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (run === null) fail('not_found', 'Not found')
    const actor = (await authorize(ctx, 'session.run', { householdId: run.householdId })).actor
    const dueAt = runEnd(run)
    if (run.status !== 'running' || run.kind !== 'dryer' || dueAt === null) fail('conflict', 'This dryer is not running on a timer')
    await remindAtEnd(ctx, run, actor.key)
    return { dueAt }
  },
})

/**
 * "Hang them" while the dryer is busy: of these queued pieces, the ones whose drying may switch to a
 * rack or line this time go on one, and the rest keep waiting for the dryer. Left waiting: a piece
 * whose label says dry flat, one set to dry another way, and one with recorded label drying steps
 * (those are answered on the drying page, where they can be read).
 */
export const hangWhileDryerBusy = mutation({
  /** `washSessionId`: every piece of that wash still queued, for "Hang them" from the load itself. */
  args: { householdId: v.id('households'), pieceIds: v.optional(v.array(v.id('dryingPieces'))), washSessionId: v.optional(v.id('sessions')), at: v.optional(v.number()) },
  returns: v.object({ hung: v.array(v.id('dryingPieces')), waiting: v.array(v.id('dryingPieces')) }),
  handler: async (ctx, args) => {
    const actor = (await authorize(ctx, 'session.run', { householdId: args.householdId })).actor
    const fromWash = args.washSessionId === undefined ? [] : (await ctx.db.query('dryingPieces').withIndex('by_wash_session', (q) => q.eq('washSessionId', args.washSessionId!)).collect())
      .filter((piece) => piece.householdId === args.householdId && piece.status === 'queued').map((piece) => piece._id)
    const pieces = await Promise.all([...new Set([...(args.pieceIds ?? []), ...fromWash])].map((id) => householdPiece(ctx, 'session.run', id, args.householdId)))
    if (pieces.length === 0 || pieces.some((piece) => piece.status !== 'queued')) fail('conflict', 'Some of these pieces are no longer queued')
    const facts = await factsForPieces(ctx, pieces)
    const hung = pieces.filter((_, index) => mayHangOnce(facts[index]!))
    if (hung.length === 0) fail('conflict', 'None of these can hang. They wait for the dryer')
    const hungFacts = facts.filter(mayHangOnce)
    const runId = await ctx.db.insert('dryingRuns', {
      householdId: args.householdId, kind: 'air', method: 'rack_line', startedAt: clientTime(args.at, Date.now()), status: 'running', startedBy: actor.key,
      activityContext: dryingContext(null, hungFacts, 'not_checked'),
    })
    for (const [index, piece] of hung.entries()) {
      const fact = hungFacts[index]!
      const once = { ...fact, choice: { method: 'rack_line' as const, source: 'once' as const, evidence: methodEvidence('rack_line', fact.label) } }
      await ctx.db.patch(piece._id, { method: 'rack_line', status: 'drying', dryingRunId: runId, dried: driedWith(once, 'rack_line') })
    }
    return { hung: hung.map((piece) => piece._id), waiting: pieces.filter((piece) => !hung.includes(piece)).map((piece) => piece._id) }
  },
})

/**
 * "I've started Dryer 4": the dryer the person entered at the machine takes the pieces that fit its
 * recorded capacity, in order, and the rest stay queued. An unknown capacity takes them all, with its
 * fit not checked. No piece goes in hotter than its label allows; the dryer's own button words for the
 * hottest setting every piece allows are kept. A piece tumbling without a label heat (for example a
 * do-not-tumble label tumbled this time) is never given an assumed heat: the person chooses `heat`
 * from the dryer's settings. Dryer products go in only on their label's dose and never by default.
 */
export const startDryer = mutation({
  args: {
    householdId: v.id('households'),
    pieceIds: v.array(v.id('dryingPieces')),
    dryerId: v.id('machines'),
    minutes: v.number(),
    heat: v.optional(dryerHeat),
    productIds: v.optional(v.array(v.id('supplies'))),
    labelInstructionsAcknowledged: v.optional(v.boolean()),
    labelInstructionsToken: v.optional(v.string()),
    at: v.optional(v.number()),
  },
  returns: v.object({ runId: v.id('dryingRuns'), going: v.array(v.id('dryingPieces')), staying: v.array(v.id('dryingPieces')), fit: v.string() }),
  handler: async (ctx, args) => {
    const actor = (await authorize(ctx, 'session.run', { householdId: args.householdId })).actor
    if (!Number.isInteger(args.minutes) || args.minutes < 1 || args.minutes > 300) fail('invalid', 'Enter the minutes the dryer shows')
    if (args.pieceIds.length === 0 || new Set(args.pieceIds).size !== args.pieceIds.length) fail('invalid', 'Pick the pieces going in')
    const dryer = await ctx.db.get(args.dryerId)
    if (dryer === null || dryer.householdId !== args.householdId || dryer.archived === true || !isDryer(dryer)) fail('invalid', 'Pick a dryer')
    if (await homeDryerBusy(ctx, dryer)) fail('conflict', dryerBusyReason(dryer.name))
    const pieces = await Promise.all(args.pieceIds.map((id) => householdPiece(ctx, 'session.run', id, args.householdId)))
    if (pieces.some((piece) => piece.status !== 'queued')) fail('conflict', 'Some of these pieces are no longer queued')
    const facts = await factsForPieces(ctx, pieces)
    if (facts.some((fact) => fact.stained)) fail('conflict', 'A stained piece is here. Let it air dry and check the stain is gone before using the dryer')
    if (facts.some((fact) => fact.choice.method !== 'tumble')) fail('conflict', 'A piece here is set to dry another way; change its drying method first')
    const labelled = facts.map((fact) => ('maxHeat' in fact.ceiling ? fact.ceiling.maxHeat : null))
    const ceiling = labelled.some((heat) => heat !== null) ? Math.min(...labelled.filter((heat): heat is DryerHeat => heat !== null).map(heatRank)) : Infinity
    const settings = documentedHeatSettings(dryer.model, dryer.heatSettings ?? []).sort((left, right) => heatRank(left.heat) - heatRank(right.heat))
    const unheated = labelled.some((heat) => heat === null)
    let setting: (typeof settings)[number] | undefined
    if (unheated) {
      if (args.heat === undefined) fail('invalid', 'Choose a heat setting yourself; the label does not set one for some of these pieces')
      if (heatRank(args.heat) > ceiling) fail('conflict', 'That heat is hotter than another piece here allows')
      setting = settings.find((entry) => entry.heat === args.heat)
      if (setting === undefined) fail('invalid', 'Pick one of this dryer\'s settings')
    } else {
      const chosen = chooseDryerSetting(settings.filter((entry) => heatRank(entry.heat) <= ceiling), dryerHeats[ceiling] ?? 'high')
      setting = chosen?.setting
      if (setting === undefined) fail('conflict', 'This dryer has no setting low enough for these pieces')
    }
    const materialProblem = facts.map((fact) => materialCareProblem(fact.material, { dryMethod: 'tumble_dry', dryHeat: setting.heat })).find((problem) => problem !== null)
    if (materialProblem) fail('conflict', materialProblem)
    const fit = fitInDryer(pieces.map((piece, index) => ({ id: piece._id, bulkUnits: facts[index]!.bulkUnits })), dryerCapacity(dryer))
    const going = new Set<string>(fit.going)
    checkDryingInstructions(facts.filter((_, index) => going.has(pieces[index]!._id)), pieces.filter((piece) => going.has(piece._id)).map((piece) => piece._id), args.labelInstructionsAcknowledged, args.labelInstructionsToken, 'tumble')
    const products: NonNullable<Doc<'dryingRuns'>['products']> = []
    const productContexts: NonNullable<Doc<'dryingRuns'>['activityContext']>['products'] = []
    if (args.productIds !== undefined && args.productIds.length > 0) {
      const uses = await dryerProductUses(ctx, args.householdId, pieces.filter((piece) => going.has(piece._id)))
      for (const productId of new Set(args.productIds)) {
        const use = uses.find((entry) => entry.supplyId === productId)
        if (use === undefined) fail('invalid', 'That is not one of this household\'s dryer products')
        if (!use.usable) fail('conflict', `${use.name} stays out of this load`)
        products.push({ name: use.name, ...(use.dose === null ? {} : { amount: use.dose.amount, unit: use.dose.unit }) })
        const [supply] = (await related(ctx, args.householdId, { supplyIds: [productId] })).supplies as [Doc<'supplies'>]
        productContexts.push({ supplyId: supply._id, name: supply.name,
          ...(use.dose === null ? {} : { amount: use.dose.amount, unit: use.dose.unit, ...(use.dose.mark === null ? {} : { mark: use.dose.mark }), ...(use.dose.fractionOfMark === undefined ? {} : { fractionOfMark: use.dose.fractionOfMark }) }),
          context: { capturedAt: Date.now(), provenance: supply.provenance,
            ...(supply.formulation === undefined ? {} : { formulation: supply.formulation }),
            ...(supply.safety === undefined ? {} : { safety: supply.safety }),
            ...(supply.fixtureKey === undefined ? {} : { fixtureKey: supply.fixtureKey }),
            ...(supply.catalogBinding === undefined ? {} : { catalogBinding: supply.catalogBinding }),
          },
        })
      }
    }
    const startedAt = clientTime(args.at, Date.now())
    const goingPieces = pieces.filter((piece) => going.has(piece._id))
    const goingFacts = facts.filter((_, index) => going.has(pieces[index]!._id))
    const context = await startingDryerContext(ctx, dryer, goingPieces, setting.heat,
      goingFacts.map((fact, index) => ({ textileId: goingPieces[index]!.textileId, labelHash: fact.labelHash, bulkUnits: fact.bulkUnits })), args.productIds ?? [])
    const suggestion = await startingDryerSuggestion(ctx, args.householdId, actor.key, dryer, goingPieces, context)
    // The early check for pieces that shouldn't tumble the whole run (design 8.4), at about half the minutes set.
    const check = midRunCheck(goingPieces.map((piece, index) => {
      const fact = goingFacts[index]!
      return { id: piece._id, bulkUnits: fact.bulkUnits, kind: fact.textile?.kind ?? null, labelHeat: 'maxHeat' in fact.labelCeiling ? fact.labelCeiling.maxHeat : null,
        routine: routineHeat(fact) }
    }), args.minutes)
    const midCheck = check === null ? undefined : { checkAt: startedAt + check.atMinute * 60_000, atMinute: check.atMinute, pieceIds: check.pieceIds as Id<'dryingPieces'>[], reasons: [...check.reasons] }
    const legacy = dryerTimeSuggestion(recordedDryerProgram(dryer))
    const durationSuggestion = suggestion.mode === 'unknown'
      ? legacy.minutes === null ? undefined : { version: 1 as const, minutes: legacy.minutes, basis: 'recorded_program' as const, source: dryer.provenance.source }
      : { version: 2 as const, minutes: suggestion.minutes, baselineMinutes: suggestion.baselineMinutes, basis: suggestion.basis,
        mode: suggestion.mode, source: dryer.provenance.source, contextKey: suggestion.contextKey, independentWashes: suggestion.independentWashes }
    const runId = await ctx.db.insert('dryingRuns', {
      householdId: args.householdId, kind: 'dryer', dryerId: dryer._id, dryerName: dryer.name, heat: setting.heat, heatLabel: setting.label,
      startedAt, minutes: args.minutes, status: 'running', startedBy: actor.key, method: 'tumble',
      activityContext: dryingContext(dryer, facts.filter((_, index) => going.has(pieces[index]!._id)), fit.fit, productContexts),
      ...(durationSuggestion === undefined ? {} : { durationSuggestion }),
      ...(unheated ? { heatChosen: true } : {}), ...(products.length === 0 ? {} : { products }),
      ...(midCheck === undefined ? {} : { midCheck }),
    })
    // A reminder at the check: the lock screen says only that a laundry step needs attention.
    if (midCheck !== undefined) await scheduleReminder(ctx, { householdId: args.householdId, kind: 'dryer_check', dryingRunId: runId, dueAt: midCheck.checkAt, recipientPrincipalKey: await planCreator(ctx, goingPieces, actor.key) })
    for (const [index, piece] of pieces.entries()) {
      if (going.has(piece._id)) await ctx.db.patch(piece._id, { status: 'drying', dryingRunId: runId, dried: driedWith(facts[index]!, 'tumble') })
    }
    return { runId, going: fit.going as Id<'dryingPieces'>[], staying: fit.staying as Id<'dryingPieces'>[], fit: fit.fit }
  },
})

/**
 * "Start drying on a rack or line", "Lay flat to dry", or "Start <heated hanging dryer>": no timer is
 * recorded, so the person checks when it feels dry. A heated hanging dryer must be recorded to use it.
 */
export const startAirDry = mutation({
  args: {
    householdId: v.id('households'),
    pieceIds: v.array(v.id('dryingPieces')),
    method: v.optional(v.union(v.literal('rack_line'), v.literal('flat'), v.literal('heated_hanging'))),
    process: v.optional(dryingProcessContext),
    machineId: v.optional(v.id('machines')),
    labelInstructionsAcknowledged: v.optional(v.boolean()),
    labelInstructionsToken: v.optional(v.string()),
    at: v.optional(v.number()),
  },
  returns: v.id('dryingRuns'),
  handler: async (ctx, args) => {
    const actor = (await authorize(ctx, 'session.run', { householdId: args.householdId })).actor
    if (args.pieceIds.length === 0) fail('invalid', 'Pick the pieces to air dry')
    const pieces = await Promise.all([...new Set(args.pieceIds)].map((id) => householdPiece(ctx, 'session.run', id, args.householdId)))
    if (pieces.some((piece) => piece.status !== 'queued')) fail('conflict', 'Some of these pieces are no longer queued')
    const facts = await factsForPieces(ctx, pieces)
    checkDryingInstructions(facts, pieces.map((piece) => piece._id), args.labelInstructionsAcknowledged, args.labelInstructionsToken, args.method, args.process)
    const methods = new Set(facts.map((fact) => fact.choice.method))
    if (methods.has(null)) fail('conflict', 'A piece here has no drying method yet; choose one first')
    if (methods.has('tumble')) fail('conflict', 'A piece here is set to tumble dry')
    if (args.method !== undefined && (methods.size !== 1 || !methods.has(args.method))) fail('conflict', 'These pieces are set to dry different ways')
    let hanging: Doc<'machines'> | null = null
    if (methods.has('heated_hanging')) {
      if (args.machineId === undefined) fail('invalid', 'Pick the heated hanging dryer')
      hanging = await ctx.db.get(args.machineId)
      if (hanging === null || hanging.householdId !== args.householdId || hanging.archived === true || !isHangingDryer(hanging)) fail('invalid', 'Pick a recorded heated hanging dryer')
    }
    const runId = await ctx.db.insert('dryingRuns', {
      householdId: args.householdId, kind: 'air', startedAt: clientTime(args.at, Date.now()), status: 'running', startedBy: actor.key,
      activityContext: dryingContext(hanging, facts, 'not_checked'),
      ...(args.method === undefined ? {} : { method: args.method }),
      ...(hanging === null ? {} : { dryerId: hanging._id, dryerName: hanging.name }),
    })
    for (const [index, piece] of pieces.entries()) {
      await ctx.db.patch(piece._id, { status: 'drying', dryingRunId: runId, dried: driedWith(facts[index]!, facts[index]!.choice.method!, args.process) })
    }
    return runId
  },
})

/**
 * "Is it dry?", piece by piece: dry pieces wait to be put away; damp ones keep drying. A dryer needs
 * the extra minutes it shows for the damp ones. The run ends when nothing in it is still damp.
 * Before a dryer's planned end it is a mid-run check (design 8.4): no extra minutes, the run's time is
 * left alone, and `hangPieceIds` come out to hang on a rack or line while the rest keep tumbling.
 */
export const checkDry = mutation({
  args: { runId: v.id('dryingRuns'), dryPieceIds: v.array(v.id('dryingPieces')), hangPieceIds: v.optional(v.array(v.id('dryingPieces'))), extraMinutes: v.optional(v.number()), at: v.optional(v.number()), labelInstructionsAcknowledged: v.optional(v.boolean()) },
  returns: v.object({ dry: v.number(), damp: v.number(), hung: v.number() }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (run === null) fail('not_found', 'Not found')
    const actor = (await authorize(ctx, 'session.run', { householdId: run.householdId })).actor
    const checkedAt = clientTime(args.at, Date.now())
    const inRun = (await ctx.db.query('dryingPieces').withIndex('by_run', (q) => q.eq('dryingRunId', run._id)).collect()).filter((piece) => piece.status === 'drying')
    const dryIds = new Set<string>(args.dryPieceIds)
    const hangIds = new Set<string>(args.hangPieceIds ?? [])
    if ([...dryIds, ...hangIds].some((id) => !inRun.some((piece) => piece._id === id))) fail('conflict', 'That piece is not drying here')
    if ([...hangIds].some((id) => dryIds.has(id))) fail('invalid', 'A piece is either dry or hung')
    const end = run.kind === 'dryer' ? runEnd(run) : null
    const early = end !== null && checkedAt < end
    if (hangIds.size > 0 && !early) fail('conflict', 'Pieces are hung only at a check before the dryer ends')
    const out = inRun.filter((piece) => dryIds.has(piece._id) || hangIds.has(piece._id))
    if (out.some((piece) => (piece.dried?.instructions?.afterDrying.length ?? 0) > 0) && args.labelInstructionsAcknowledged !== true) fail('conflict', 'Follow the recorded label removal and handling instructions before marking these pieces dry')
    const damp = inRun.filter((piece) => !dryIds.has(piece._id) && !hangIds.has(piece._id))
    if (run.kind === 'dryer' && !early && damp.length > 0 && (args.extraMinutes === undefined || !Number.isInteger(args.extraMinutes) || args.extraMinutes < 1 || args.extraMinutes > 300)) {
      fail('invalid', 'Enter the minutes for the damp pieces')
    }
    // The first look at or after the end, with a mid-run check never done: recorded as missed, nothing more.
    const midCheck = run.midCheck === undefined ? undefined : early ? { ...run.midCheck, checkedAt } : run.midCheck.checkedAt === undefined ? { ...run.midCheck, missed: true } : run.midCheck
    const current = midCheck === undefined ? run : { ...run, midCheck }
    const tumbled = Math.max(1, Math.round((checkedAt - run.startedAt) / 60_000) + (run.earlier ?? []).reduce((total, start) => total + start.minutes, 0))
    const hung = inRun.filter((piece) => hangIds.has(piece._id))
    // Pieces taken out while others keep tumbling, or hung: a mid-run removal. Everything dry early just ends the run.
    const removal = early && (damp.length > 0 || hung.length > 0)
    for (const piece of inRun.filter((entry) => dryIds.has(entry._id))) {
      await ctx.db.patch(piece._id, { status: 'dry', ...(run.dryerName !== undefined ? { driedIn: run.dryerName } : {}) })
      await recordDried(ctx, piece, current, checkedAt, actor.key, removal ? { minutes: tumbled } : undefined)
    }
    if (hung.length > 0) {
      // Not `startAirDry`: these pieces are in the dryer, not queued, and were set to tumble. One-time hang for this wash.
      const facts = await factsForPieces(ctx, hung)
      const airId = await ctx.db.insert('dryingRuns', {
        householdId: run.householdId, kind: 'air', method: 'rack_line', startedAt: checkedAt, status: 'running', startedBy: actor.key,
        activityContext: dryingContext(null, facts, 'not_checked'),
      })
      for (const [index, piece] of hung.entries()) {
        const fact = facts[index]!
        const once = { ...fact, choice: { method: 'rack_line' as const, source: 'once' as const, evidence: methodEvidence('rack_line', fact.label) } }
        await ctx.db.patch(piece._id, { method: 'rack_line', dryingRunId: airId, dried: driedWith(once, 'rack_line'),
          tumbledFirst: { runId: run._id, minutes: tumbled, ...(run.dryerName === undefined ? {} : { dryerName: run.dryerName }), ...(run.heat === undefined ? {} : { heat: run.heat }) } })
      }
    }
    const earlyChecks = removal ? { earlyChecks: [...(run.earlyChecks ?? []), { at: checkedAt, dry: dryIds.size, hung: hung.length, left: damp.length }] } : {}
    if (damp.length === 0) await ctx.db.patch(run._id, { status: 'done', ...earlyChecks, ...(midCheck === undefined ? {} : { midCheck }) })
    else if (early) await ctx.db.patch(run._id, { ...earlyChecks, ...(midCheck === undefined ? {} : { midCheck }) })
    else if (run.kind === 'dryer') {
      const earlier = [...(run.earlier ?? []), ...(run.minutes === undefined ? [] : [{ startedAt: run.startedAt, minutes: run.minutes }])]
      await ctx.db.patch(run._id, { startedAt: checkedAt, minutes: args.extraMinutes, earlier, ...(midCheck === undefined ? {} : { midCheck }) })
      // Each reminder asked for the old end follows the run to its new one, for the person who asked.
      const asked = await ctx.db.query('reminders').withIndex('by_drying_run', (q) => q.eq('dryingRunId', run._id)).collect()
      const askers = new Set(asked.filter((reminder) => reminder.kind === 'dryer_done' && reminder.status !== 'cancelled' && reminder.recipientPrincipalKey !== undefined).map((reminder) => reminder.recipientPrincipalKey!))
      for (const asker of askers) await remindAtEnd(ctx, (await ctx.db.get(run._id))!, asker)
    }
    return { dry: dryIds.size, damp: damp.length, hung: hung.length }
  },
})

/** "Put away 3 pieces": partial is fine. Each goes back to ready; the rest stay in "Dry, to put away". */
export const putAway = mutation({
  args: { householdId: v.id('households'), pieceIds: v.array(v.id('dryingPieces')) },
  returns: v.object({ putAway: v.number() }),
  handler: async (ctx, args) => {
    const actor = (await authorize(ctx, 'session.run', { householdId: args.householdId })).actor
    const now = Date.now()
    let count = 0
    const washedSessions = new Set<Id<'sessions'>>()
    for (const pieceId of new Set(args.pieceIds)) {
      const piece = await householdPiece(ctx, 'session.run', pieceId, args.householdId)
      if (piece.status !== 'dry') fail('conflict', 'Only a dry piece can be put away')
      washedSessions.add(piece.washSessionId)
      const textile = await ctx.db.get(piece.textileId)
      if (textile !== null && textile.householdId === piece.householdId && textile.guest === true) {
        await ctx.db.delete(piece._id)
        await deleteGuest(ctx, textile)
        count += 1
        continue
      }
      if (textile !== null && textile.householdId === piece.householdId && textile.status === 'hanging') {
        await ctx.db.patch(textile._id, { status: 'clean', statusSince: now })
        await ctx.db.insert('history', {
          householdId: textile.householdId, sessionId: piece.washSessionId, textileId: textile._id, ownerPrincipalKey: textile.ownerPrincipalKey,
          event: 'dried', occurredAt: now, actorPrincipalKey: actor.key, details: {
            washer: piece.washerName,
            ...(piece.driedIn === undefined ? { airDried: true } : { dryer: piece.driedIn }),
            ...(piece.tumbledFirst === undefined ? {} : { tumbledMinutes: piece.tumbledFirst.minutes, ...(piece.tumbledFirst.dryerName === undefined ? {} : { dryer: piece.tumbledFirst.dryerName }) }),
            ...(piece.dried === undefined ? {} : { method: piece.dried.method, scope: piece.dried.scope, evidence: piece.dried.evidence, label: piece.dried.label }),
          },
        })
      }
      await ctx.db.delete(piece._id)
      if (textile !== null) await expireOnceRoutine(ctx, textile, piece.washSessionId)
      count += 1
    }
    const remaining = await ctx.db.query('dryingPieces').withIndex('by_household', (q) => q.eq('householdId', args.householdId)).collect()
    if (count > 0 && [...washedSessions].some((id) => !remaining.some((piece) => piece.washSessionId === id))) {
      await completeGuidance(ctx, args.householdId, actor.key, now)
    }
    return { putAway: count }
  },
})
