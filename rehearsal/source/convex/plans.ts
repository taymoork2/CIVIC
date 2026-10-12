import { getPlan, readPlanDocuments, writePlanDocuments, erasePlanDocuments } from './planStorage'
import { plannerSupplyKinds, availabilityForPlanner, evidence, formulation, recordedCycle, stepDose, canonicalSelection, selectionKey, type PlanPass, storedPass, plannerRule, washerPlacements, stainWords, flaggedStain, plannerCare, profileRequirements, packContents, planResult, loadBlockers, loadStartable, loadBlockedItems, excludedBlockedItems, washerSiblings, startableMachineIds, currentPlanner, loadShape, type QuestionKind, questionOrder, type QuestionContext, labelContext } from './plansHelpers'
export { recordedDryMethod, recordedCycle, stepDose, canonicalSelection, selectionKey, type PlanPass, storedPass, plannerRule, machinePlacements, washerPlacements, stainWords, plannerCare, type StoredPlanResult, planResult, loadBlockers, loadStartable, type BlockedItemSource, type BlockedItem, reasonItems, loadBlockedItems, excludedBlockedItems, loadOn, loadKind, alternateStartable, sameKindWasher, startableMachineIds, currentPlanner } from './plansHelpers'
import { v } from 'convex/values'
import { routineCurrent } from './personalRoutineValues'
import { erasePersonalGuidance } from './personalPlanStorage'

import { garmentKey, isDryer, isDryingMachine, learnedWash, kindBulkUnits, plan, plannerVersion, useDirections, type LoadPlan, type PlanResult, type PlannerInput, type PlannerMode, type StainReason, type SupplyUse, type TreatmentStep } from '@washcloset/planner'

import type { Doc, Id } from './_generated/dataModel'
import { scheduleReminder } from './reminders'
import { mutation, query, type MutationCtx } from './_generated/server'
import { authorize, loadIdentity, related, type ReadCtx } from './access'
import { fail, nonEmpty } from './errors'
import { dismissedQuestion, loadPin, plannerMode, productLoadConfirmation, startLoadBasis, type Dose, type SupplyMeasure, type TreatmentAction } from './validators'
import { qualifyingWaterCondition } from './waterHardness'







/** Garments in a running load, each with its session: a garment can only be in one machine at a time. */
export async function busyTextiles(ctx: ReadCtx, householdId: Id<'households'>): Promise<Map<Id<'textiles'>, Id<'sessions'>>> {
  const running = await ctx.db
    .query('sessions')
    .withIndex('by_household_status', (q) => q.eq('householdId', householdId).eq('status', 'running'))
    .collect()
  return new Map(running.flatMap((session) => session.textileIds.map((textileId) => [textileId, session._id] as const)))
}














export async function canonicalPlannerInput(
  ctx: ReadCtx,
  householdId: Id<'households'>,
  selectedTextileIds: readonly Id<'textiles'>[],
  pass: PlanPass,
): Promise<PlannerInput> {
  const textileIds = canonicalSelection(selectedTextileIds)
  const textiles = await Promise.all(
    textileIds.map(async (textileId) => {
      const textile = await ctx.db.get(textileId)
      if (textile === null || textile.householdId !== householdId || textile.trashedAt !== undefined) fail('forbidden', 'Forbidden')
      const care = await ctx.db
        .query('care')
        .withIndex('by_textile', (q) => q.eq('textileId', textile._id))
        .unique()
      const wearer = textile.wearerId === undefined ? null : await ctx.db.get(textile.wearerId)
      // About-bulk only packs loads; a dose's size is read off the drum.
      const bulkUnits = textile.bulkUnits ?? (textile.kind === undefined ? undefined : kindBulkUnits[textile.kind])
      // An open stain check is a stain until someone says it is gone: it holds the piece out of dryer heat.
      const stainNote = flaggedStain(textile.flag) ?? (textile.stainCheck === undefined ? undefined : stainWords[textile.stainCheck.reason as StainReason] ?? stainWords.stain_other)
      return {
        id: textile._id,
        ownerId: textile.ownerPrincipalKey,
        material: care?.material ?? null,
        color: textile.color ?? null,
        colorGroup: textile.colorGroup,
        ...(textile.dyeRun === undefined ? {} : { dyeRun: textile.dyeRun, dyeRunGroup: garmentKey(textile) }),
        ...(textile.preOwned === undefined ? {} : { preOwned: { ...textile.preOwned, washes: textile.washCount } }),
        firstWash: textile.firstWash,
        ...(textile.firstWash === undefined ? { firstWashState: textile.washCount > 0 ? 'washed' as const : 'unknown' as const } : {}),
        ...(textile.kind === undefined ? {} : { kind: textile.kind }),
        ...(bulkUnits === undefined ? {} : { bulkUnits }),
        ...(textile.soilLevel === undefined ? {} : { soilLevel: textile.soilLevel }),
        ...(wearer === null || wearer.householdId !== householdId ? {} : { wearerKind: wearer.kind, ...profileRequirements(wearer) }),
        ...(stainNote === undefined ? {} : { stainNote }),
        ...(textile.flag?.stainReport === undefined ? {} : { stainReport: textile.flag.stainReport }),
        ...(textile.guest === true ? { guest: true } : {}),
        care: plannerCare(care),
        ...(textile.decoration === undefined ? {} : { decoration: textile.decoration }),
        ...(textile.adviceReminder === undefined ? {} : { adviceReminder: textile.adviceReminder.enabled }),
        ...(textile.personalRoutine === undefined ? {} : { personalRoutine: {
          ...textile.personalRoutine.settings, revision: textile.personalRoutine.revision,
          scope: textile.personalRoutine.scope, labelHash: textile.personalRoutine.labelHash,
          valid: routineCurrent(textile.personalRoutine, care), missingLabelAccepted: textile.personalRoutine.missingLabelAccepted,
        } }),
      }
    }),
  )
  const [household, supplies, rules, machines] = await Promise.all([
    ctx.db.get(householdId),
    ctx.db.query('supplies').withIndex('by_household', (q) => q.eq('householdId', householdId)).collect(),
    ctx.db.query('rules').withIndex('by_household', (q) => q.eq('householdId', householdId)).collect(),
    ctx.db.query('machines').withIndex('by_household', (q) => q.eq('householdId', householdId)).collect(),
  ])
  const planning = household?.planning ?? {}
  const active = machines.filter((machine) => machine.archived !== true)
  const washers = active.filter((machine) => !isDryingMachine(machine))
  const dryers = active.filter(isDryer)
  const placements = washerPlacements(washers, planning.preferredMachineId)
  const sourceDigests = new Map(await Promise.all(supplies.filter((supply) => supply.safety?.sourceContract !== undefined).map(async (supply) => [supply._id, supply.catalogBinding === undefined ? undefined : (await ctx.db.get(supply.catalogBinding.revisionId))?.digest] as const)))
  const sourceWashContextRequired = supplies.some((supply) => supply.archived !== true && pass.optionalSupplyIds?.includes(supply._id) && supply.safety?.sourceContract?.requireOrdinaryWashRoute === true)

  return {
    ...(!pass.productLoadConfirmations?.length ? {} : { productLoadConfirmations: pass.productLoadConfirmations }),
    textiles,
    supplies: supplies
      .filter((supply) => supply.archived !== true && plannerSupplyKinds[supply.kind] !== undefined)
      .map((supply) => {
        const defaults = supply.use === undefined ? null : useDirections(supply.use, placements)
        return {
          id: supply._id,
          name: supply.name,
          kind: plannerSupplyKinds[supply.kind],
          ...(supply.use === undefined ? {} : { use: supply.use }),
          formulation: formulation(supply.formulation),
          ...(supply.safety?.capabilities === undefined ? {} : { capabilities: supply.safety.capabilities }),
          ...(supply.safety?.lipase === undefined ? {} : { lipase: supply.safety.lipase }),
          ...(supply.safety?.sanitizing === undefined ? {} : { sanitizing: supply.safety.sanitizing }),
          labelEvidence: supply.safety?.sourceContract !== undefined && sourceDigests.get(supply._id) !== supply.safety.sourceContract.digest ? { source: supply.provenance?.source, status: 'unknown' as const } : evidence(supply.provenance),
          bleachKind: supply.safety?.bleachKind ?? (supply.kind === 'chemical' || supply.kind === 'single_use' ? 'unknown' : undefined),
          ...packContents(supply),
          incompatibleSupplyIds: supply.safety?.incompatibleSupplyIds,
          incompatibleMaterials: supply.safety?.incompatibleMaterials,
          ...(supply.safety?.sourceContract === undefined ? {} : { sourceContract: supply.safety.sourceContract }),
          ...(supply.measure === undefined ? {} : { measurement: supply.measure }),
          ...(defaults === null ? {} : { defaults: { stage: defaults.stage, placement: defaults.placement, timing: defaults.timing } }),
          applicationRules: [
            ...rules.filter((rule) => rule.supplyId === supply._id).map(plannerRule),
            ...(supply.safety?.pretreatment === undefined ? [] : [{
              ...supply.safety.pretreatment,
              id: `${supply._id}:pretreatment`, supplyId: supply._id,
              stage: 'prewash', placement: 'manual',
              evidence: evidence(supply.provenance),
              incompatibleSupplyIds: supply.safety.incompatibleSupplyIds,
              incompatibleMaterials: supply.safety.incompatibleMaterials,
            }]),
          ],
        }
      }),
    machines: washers.map((machine) => ({
      ...(!sourceWashContextRequired ? {} : { sourceWashContext: { cycleProfile: machine.cycleProfile ?? null } }),
      id: machine._id,
      name: machine.name,
      modelId: machine.model,
      applianceType: machine.applianceType,
      capacityUnits: machine.capacityUnits,
      capacityConfidence: machine.capacityConfidence,
      supportedCycles: machine.supportedCycles,
      ...(machine.rinseContact === undefined ? {} : { rinseContact: machine.rinseContact }),
      ...(machine.washProcesses === undefined ? {} : { washProcesses: machine.washProcesses }),
      availability: availabilityForPlanner.has(machine.pool) ? machine.pool : undefined,
      dispensing: machine.dispensingProfile,
      ...(machine.highEfficiency === undefined ? {} : { highEfficiency: machine.highEfficiency }),
      // Only a shared room adds the field, so a washer at home plans from the same input as before.
      ...(machine.location === 'shared' ? { location: 'shared' } : {}),
      evidence: evidence(machine.provenance),
    })),
    ...(dryers.length === 0 ? {} : {
      dryers: dryers.map((dryer) => ({
        id: dryer._id,
        name: dryer.name,
        applianceType: 'tumble_dryer',
        ...(dryer.model === undefined ? {} : { modelId: dryer.model }),
        ...(dryer.capacityUnits === undefined ? {} : { capacityUnits: dryer.capacityUnits }),
        ...(dryer.capacityConfidence === undefined ? {} : { capacityConfidence: dryer.capacityConfidence }),
        ...(availabilityForPlanner.has(dryer.pool) ? { availability: dryer.pool } : {}),
        heatSettings: dryer.heatSettings ?? [],
        evidence: evidence(dryer.provenance),
      })),
    }),
    // Color protection follows garment history; the retired household switch cannot bypass it.
    policy: { colorPolicy: 'separate_first_wash', heavyLightMixing: planning.heavyLightMixing },
    preferences: {
      optimization: planning.optimization,
      preferredMachineId: planning.preferredMachineId,
      ...(planning.preferredDryerId === undefined ? {} : { preferredDryerId: planning.preferredDryerId }),
      ...(planning.babySeparate === false ? { babySeparate: false } : {}),
    },
    pricing: {
      currency: planning.currency ?? 'USD',
      ...(planning.washerPricePerStart === undefined ? {} : { washer: { type: 'flat_per_start', price: planning.washerPricePerStart } }),
      ...(planning.dryerPricePerStart === undefined ? {} : { dryer: { type: 'flat_per_start', price: planning.dryerPricePerStart } }),
    },
    // Water counts only while it qualifies as soft (dose plan P2); other households keep the input they
    // had. Whether soft still holds depends on the time, so setWater schedules a re-plan when it ends.
    ...(qualifyingWaterCondition(planning.water, Date.now()) === 'soft' ? { waterCondition: 'soft' } : {}),
    ...(pass.mode === 'rush' ? { mode: 'rush' } : {}),
    optionalSupplyIds: [...(pass.optionalSupplyIds ?? [])].sort(),
    washGoals: [...(pass.washGoals ?? ['ordinary'])].sort(),
    ...(pass.loadPins.length === 0 ? {} : { loadPins: pass.loadPins }),
    ...(pass.dismissedQuestions.length === 0 ? {} : { dismissedQuestions: pass.dismissedQuestions }),
    ...(pass.detergentId === undefined ? {} : { detergentId: pass.detergentId }),
    ...((pass.pretreatmentChoices?.length ?? 0) === 0 ? {} : { pretreatmentChoices: pass.pretreatmentChoices }),
    // A product that ran out is left out like one left out this time, until it is restocked.
    ...((ranOut) => ranOut.length === 0 ? {} : { excludedSupplyIds: ranOut })([...new Set([...pass.excludedSupplyIds, ...supplies.filter((supply) => supply.archived !== true && supply.ranOutAt !== undefined).map((supply) => supply._id)])]),
  } as PlannerInput
}





















async function referencedBySession(ctx: MutationCtx, planId: Id<'plans'>): Promise<boolean> {
  return (await ctx.db.query('sessions').withIndex('by_plan', (q) => q.eq('planId', planId)).first()) !== null
}


/**
 * The planner input a stored plan is checked and re-read against: the household's current records,
 * except the garments of a load already under way, which keep the facts the plan was made with. A
 * finished wash (no longer a first wash, no soil) so never re-plans the loads still to start; any
 * change to those loads' own garments, products or machines still does.
 */
export async function storedPlanInput(ctx: ReadCtx, stored: Doc<'plans'>): Promise<PlannerInput> {
  stored = await readPlanDocuments(ctx, stored)
  const input = await canonicalPlannerInput(ctx, stored.householdId, stored.textileIds ?? [], storedPass(stored))
  const loads = planResult(stored).loads
  const sessions = await ctx.db.query('sessions').withIndex('by_plan', (q) => q.eq('planId', stored._id)).collect()
  // A session without a load id is a one-load plan's only load.
  const underWay = new Set(sessions.filter((session) => session.status !== 'cancelled')
    .flatMap((session) => loads.find((load) => load.id === (session.loadId ?? loads[0]?.id))?.textileIds ?? []))
  if (underWay.size === 0) return input
  const planned = new Map(((stored.inputSnapshot as PlannerInput).textiles ?? []).map((textile) => [textile.id, textile]))
  return { ...input, textiles: (input.textiles ?? []).map((textile) => textile.id !== undefined && underWay.has(textile.id) ? planned.get(textile.id) ?? textile : textile) }
}

/**
 * Re-reads a plan already under way from the household's current records. It is kept, with the
 * new doses and questions, only while every load stays as it was; otherwise it cannot be kept.
 * A load that already has a session keeps the steps it started with: its session reads them back
 * from here at each step, so an answer that blocks or reorders its products cannot strand it.
 */
async function refreshedUsedPlan(ctx: MutationCtx, stored: Doc<'plans'>): Promise<boolean> {
  if (!currentPlanner(stored) || stored.textileIds === undefined || stored.textileIds.length === 0) return false
  stored = await readPlanDocuments(ctx, stored)
  let fresh: PlanResult
  try {
    fresh = plan(await storedPlanInput(ctx, stored))
  } catch {
    return false
  }
  const sessions = await ctx.db.query('sessions').withIndex('by_plan', (q) => q.eq('planId', stored._id)).collect()
  // A session without a load id is a one-load plan's only load.
  const underWay = new Set(sessions.filter((session) => session.status !== 'cancelled').map((session) => session.loadId ?? fresh.loads[0]?.id))
  // A load under way keeps its stored steps, so only the loads still to start must come out the same.
  const before = planResult(stored).loads.map((load) => underWay.has(load.id) ? load.id : loadShape(load))
  const after = fresh.loads.map((load) => underWay.has(load.id) ? load.id : loadShape(load))
  if (before.length !== after.length || before.some((shape, index) => shape !== after[index])) return false
  const { inputSnapshot, ...rest } = fresh
  const result = { ...rest, loads: fresh.loads.map((load, index) => (underWay.has(load.id) ? planResult(stored).loads[index]! : load)) }
  await writePlanDocuments(ctx, stored._id, { inputSnapshot, result })
  await ctx.db.patch(stored._id, { inputHash: result.inputHash })
  return true
}

/**
 * Any change to planner inputs makes every outstanding plan unusable, including one whose first
 * load already started. Stale plans stay readable, so an open plan can say it changed; the next
 * recompute clears them away.
 *
 * `dosesOnly` is for answers that can only change doses, such as a label line or a washer's HE
 * logo given at the machine, and for a finished wash: a plan already under way is re-read in place,
 * so "Load 2 of 4" stays and its later loads use the answer. It still goes stale if a load still to
 * start comes out different.
 */
export async function invalidatePlans(ctx: MutationCtx, householdId: Id<'households'>, options: { dosesOnly?: boolean } = {}): Promise<void> {
  for (const status of ['ready', 'needs_confirmation', 'used'] as const) {
    const plans = await ctx.db
      .query('plans')
      .withIndex('by_household_status', (q) => q.eq('householdId', householdId).eq('status', status))
      .collect()
    for (const stored of plans) {
      if (status === 'used' && options.dosesOnly === true && await refreshedUsedPlan(ctx, stored)) continue
      await ctx.db.patch(stored._id, { status: 'stale' })
    }
  }
}

/**
 * Removes a plan nobody needs any more. A plan a session still refers to is retired instead:
 * kept so that session can be shown, but out of the stale set so cleanup never rescans it.
 */
async function discardPlan(ctx: MutationCtx, stored: Doc<'plans'>): Promise<void> {
  await erasePersonalGuidance(ctx, { planId: stored._id })
  if (await referencedBySession(ctx, stored._id)) {
    // Out of the selection index too, so repeated selections never rescan old plans.
    if (stored.status !== 'retired') await ctx.db.patch(stored._id, { status: 'retired', selectionKey: undefined })
  } else {
    await erasePlanDocuments(ctx, stored._id)
    await ctx.db.delete(stored._id)
  }
}

/**
 * Deletes a retired or stale plan once no running session needs it. Finished sessions keep
 * their own record; their plan was only needed while the load could still change.
 */
export async function releasePlan(ctx: MutationCtx, planId: Id<'plans'>): Promise<void> {
  const stored = await ctx.db.get(planId)
  if (stored === null || (stored.status !== 'retired' && stored.status !== 'stale')) return
  const sessions = await ctx.db.query('sessions').withIndex('by_plan', (q) => q.eq('planId', planId)).collect()
  if (sessions.every((session) => session.status !== 'running')) {
    await erasePersonalGuidance(ctx, { planId })
    await erasePlanDocuments(ctx, planId)
    await ctx.db.delete(planId)
  }
}

/**
 * Checks what a pass sends: bounded lists, whole load numbers, and only this household's garments,
 * products and machines. Only things in the hamper can be planned.
 */
async function checkedPass(
  ctx: ReadCtx,
  householdId: Id<'households'>,
  textileIds: readonly Id<'textiles'>[],
  args: { mode?: PlannerMode; loadPins?: PlanPass['loadPins']; dismissedQuestions?: PlanPass['dismissedQuestions']; excludedSupplyIds?: PlanPass['excludedSupplyIds']; detergentId?: Id<'supplies'>; pretreatmentChoices?: PlanPass['pretreatmentChoices']; optionalSupplyIds?: PlanPass['optionalSupplyIds']; washGoals?: PlanPass['washGoals']; productLoadConfirmations?: PlanPass['productLoadConfirmations'] },
): Promise<PlanPass> {
  const pass: PlanPass = {
    mode: args.mode ?? 'normal',
    loadPins: args.loadPins ?? [],
    dismissedQuestions: args.dismissedQuestions ?? [],
    excludedSupplyIds: args.excludedSupplyIds ?? [],
    optionalSupplyIds: [...new Set(args.optionalSupplyIds ?? [])].sort(),
    washGoals: [...new Set<import('@washcloset/planner').WashGoal>(args.washGoals ?? ['ordinary'])].sort(),
    pretreatmentChoices: [...(args.pretreatmentChoices ?? [])].sort((left, right) => left.textileId.localeCompare(right.textileId)),
    ...(args.detergentId === undefined ? {} : { detergentId: args.detergentId }),
    ...(!args.productLoadConfirmations?.length ? {} : { productLoadConfirmations: [...args.productLoadConfirmations].sort((a, b) => `${a.supplyId}:${a.loadFingerprint}`.localeCompare(`${b.supplyId}:${b.loadFingerprint}`)) }),
  }
  if (pass.loadPins.length > 400) fail('invalid', 'Too many moves')
  if (pass.dismissedQuestions.length > 50) fail('invalid', 'Too many answered questions')
  if (pass.excludedSupplyIds.length > 50) fail('invalid', 'Too many products left out')
  if ((pass.optionalSupplyIds?.length ?? 0) > 50) fail('invalid', 'Too many optional products selected')
  const productChecks = pass.productLoadConfirmations ?? []
  if (productChecks.length > 250) fail('invalid', 'Too many product load checks')
  if (new Set(productChecks.map((check) => `${check.supplyId}:${check.loadFingerprint}`)).size !== productChecks.length) fail('invalid', 'Check each product once per load')
  for (const check of productChecks) {
    if (![check.sourceDigest, check.loadFingerprint, ...(check.washContextFingerprint === undefined ? [] : [check.washContextFingerprint])].every((value) => /^[a-f0-9]{64}$/.test(value))) fail('invalid', 'Review the current product and load before confirming')
    await related(ctx, householdId, { supplyIds: [check.supplyId] })
  }
  const choices = pass.pretreatmentChoices ?? []
  if (choices.length > 250) fail('invalid', 'Too many pretreatment choices')
  if (new Set(choices.map((choice) => choice.textileId)).size !== choices.length) fail('invalid', 'Choose one pretreatment per piece')
  if (pass.loadPins.some((pin) => !Number.isInteger(pin.group) || pin.group < 1 || pin.group > 99)) fail('invalid', 'A load number must be a whole number from 1 to 99')

  const own = (row: { householdId: Id<'households'> } | null) => {
    if (row !== null && row.householdId !== householdId) fail('forbidden', 'Forbidden')
  }
  for (const textileId of textileIds) {
    const textile = await ctx.db.get(textileId)
    if (textile === null || textile.householdId !== householdId || textile.trashedAt !== undefined) fail('forbidden', 'Forbidden')
    if (textile.status !== 'dirty') fail('invalid', 'Only laundry items in the hamper can be washed')
  }
  // A pin for a garment no longer selected is ignored by the planner, and may name one since removed.
  const selected = new Set<string>(textileIds)
  if (choices.some((choice) => !selected.has(choice.textileId))) fail('invalid', 'Choose pretreatment only for selected pieces')
  for (const textileId of new Set(pass.loadPins.map((pin) => pin.textileId))) {
    if (!selected.has(textileId)) own(await ctx.db.get(textileId))
  }
  for (const question of pass.dismissedQuestions) {
    const subject = question.kind === 'label_row' ? ctx.db.normalizeId('supplies', question.subjectId) : ctx.db.normalizeId('machines', question.subjectId)
    const row = subject === null ? null : await ctx.db.get(subject)
    if (row === null) fail('invalid', 'That question is about something not in this household')
    own(row)
  }
  for (const supplyId of new Set([...pass.excludedSupplyIds, ...(pass.optionalSupplyIds ?? []), ...choices.map((choice) => choice.supplyId), ...(pass.detergentId === undefined ? [] : [pass.detergentId])])) {
    const supply = await ctx.db.get(supplyId)
    if (supply === null) fail('not_found', 'Not found')
    own(supply)
  }
  return pass
}

export const recompute = mutation({
  args: {
    householdId: v.id('households'),
    selectedTextileIds: v.array(v.id('textiles')),
    clientInputHash: v.string(),
    mode: v.optional(plannerMode),
    loadPins: v.optional(v.array(loadPin)),
    dismissedQuestions: v.optional(v.array(dismissedQuestion)),
    excludedSupplyIds: v.optional(v.array(v.id('supplies'))),
    optionalSupplyIds: v.optional(v.array(v.id('supplies'))),
    washGoals: v.optional(v.array(v.union(v.literal('ordinary'), v.literal('dull_grey'), v.literal('visible_stain'), v.literal('suspected_color_transfer'), v.literal('faded_dye'), v.literal('odor'), v.literal('feel'), v.literal('fragrance')))),
    detergentId: v.optional(v.id('supplies')),
    pretreatmentChoices: v.optional(v.array(v.object({ textileId: v.id('textiles'), supplyId: v.id('supplies') }))),
    productLoadConfirmations: v.optional(v.array(productLoadConfirmation)),
  },
  returns: v.object({
    status: v.union(v.literal('ready'), v.literal('needs_confirmation')),
    recomputed: v.literal(true),
    stale: v.boolean(),
    clientInputHash: v.string(),
    inputHash: v.string(),
    planId: v.id('plans'),
  }),
  handler: async (ctx, args) => {
    nonEmpty(args.clientInputHash, 'clientInputHash')
    const actor = (await authorize(ctx, 'plan.edit', { householdId: args.householdId })).actor
    const textileIds = canonicalSelection(args.selectedTextileIds)
    const key = selectionKey(textileIds)
    const pass = await checkedPass(ctx, args.householdId, textileIds, args)
    const input = await canonicalPlannerInput(ctx, args.householdId, textileIds, pass)
    const { inputSnapshot, ...result } = plan(input)

    // One current plan per selection. Planning the same garments with the same pass from the same
    // records again (another household member, or a second tap) returns that plan instead of replacing it,
    // so a load already running from it keeps its plan. A plan from an older planner is replaced.
    const previous = await ctx.db
      .query('plans')
      .withIndex('by_household_selection', (q) => q.eq('householdId', args.householdId).eq('selectionKey', key))
      .collect()
    const finished = async (stored: Doc<'plans'>) => (await ctx.db.query('sessions').withIndex('by_plan', (q) => q.eq('planId', stored._id)).collect()).some((session) => session.status === 'completed')
    let same: Doc<'plans'> | undefined
    // A plan with a finished wash keeps its loads still to start, but its washed garments planned again are a new plan.
    for (const stored of previous) {
      if (stored.inputHash === result.inputHash && currentPlanner(stored) && stored.status !== 'stale' && stored.status !== 'retired' && !await finished(stored)) { same = stored; break }
    }
    if (same !== undefined) {
      return { status: result.status, recomputed: true as const, stale: result.inputHash !== args.clientInputHash, clientInputHash: args.clientInputHash, inputHash: result.inputHash, planId: same._id }
    }
    const hangTextileIds = new Set<Id<'textiles'>>()
    for (const stored of previous) {
      if (stored.status === 'retired' || await finished(stored)) continue
      for (const textileId of stored.hangTextileIds ?? []) hangTextileIds.add(textileId)
    }
    // Otherwise the new plan replaces the previous one for these garments, and plans that went
    // stale since the last recompute are cleared away.
    const stale = await ctx.db
      .query('plans')
      .withIndex('by_household_status', (q) => q.eq('householdId', args.householdId).eq('status', 'stale'))
      .collect()
    const discarded = new Set<string>()
    for (const stored of [...previous, ...stale]) {
      if (stored.status === 'retired' || discarded.has(stored._id)) continue
      discarded.add(stored._id)
      await discardPlan(ctx, stored)
    }

    const planId = await ctx.db.insert('plans', {
      householdId: args.householdId,
      createdBy: actor.key,
      plannerVersion: result.plannerVersion,
      inputHash: result.inputHash,
      selectionKey: key,
      textileIds,
      ...(hangTextileIds.size === 0 ? {} : { hangTextileIds: [...hangTextileIds] }),
      inputSnapshot: {},
      result: {},
      ...(pass.mode === 'rush' ? { mode: 'rush' as const } : {}),
      status: result.status,
      createdAt: Date.now(),
    })
    await writePlanDocuments(ctx, planId, { inputSnapshot, result })
    return {
      status: result.status,
      recomputed: true as const,
      stale: result.inputHash !== args.clientInputHash,
      clientInputHash: args.clientInputHash,
      inputHash: result.inputHash,
      planId,
    }
  },
})

/**
 * A plan with each load's start state, the pass it was made with, and the machines its loads use.
 * Null when the plan was replaced; stale when its inputs or the planner changed.
 */
export const get = query({
  args: { planId: v.id('plans') },
  handler: async (ctx, args) => {
    const stored = await getPlan(ctx, args.planId)
    if (stored === null) return null
    const { actor } = await authorize(ctx, 'plan.read', { householdId: stored.householdId })
    const result = planResult(stored)
    const sessions = await ctx.db.query('sessions').withIndex('by_plan', (q) => q.eq('planId', stored._id)).collect()
    // A garment already in a running load (from any plan) cannot start in another.
    const busy = await busyTextiles(ctx, stored.householdId)
    const status = currentPlanner(stored) ? stored.status : 'stale'
    // Plans made before selections were stored cannot be re-checked at start, so they never start.
    const checkable = stored.textileIds !== undefined && status !== 'stale' && status !== 'retired'
    const machineIds = new Set(result.loads.flatMap((load) => [load.machineId, load.drying?.dryerId ?? null]))
    const household = await ctx.db.query('machines').withIndex('by_household', (q) => q.eq('householdId', stored.householdId)).collect()
    const machines = household.filter((machine) => machineIds.has(machine._id))
    const pieceIds = stored.textileIds ?? [...new Set(result.loads.flatMap((load) => load.textileIds))].flatMap((id) => ctx.db.normalizeId('textiles', id) ?? [])
    const privatePieces = (await Promise.all(pieceIds.map((id) => loadIdentity(ctx, actor.key, id)))).filter((row) => row.private)
    return {
      ...(privatePieces.length === 0 ? {} : { privatePieces }),
      loadStates: result.loads.map((load) => {
        const session = sessions.find((candidate) => candidate.loadId === load.id && candidate.status !== 'cancelled')
        const free = checkable && session === undefined && !load.textileIds.some((id) => busy.has(id as Id<'textiles'>))
        return {
          loadId: load.id,
          /** The planned washer can start it now. */
          startable: free && loadStartable(result, load),
          /** The washers "Which washer?" may start this load on: its own kind when startable, and each other kind that can take it. */
          startableMachineIds: free ? startableMachineIds(result, load, washerSiblings(household, load)) : [],
          blockingReasonIds: loadBlockers(result, load).map((reason) => reason.id),
          /** Each blocker (and each worked-around conflict) under the garment, product or washer that caused it. */
          blockedItems: loadBlockedItems(result, load),
          sessionId: session?._id ?? null,
          /** The washer whose recipe was confirmed for this load; null until someone confirms. Nothing has started. */
          confirmedMachineId: stored.recipeConfirmations?.find((entry) => entry.loadId === load.id)?.machineId ?? null,
        }
      }),
      planId: stored._id,
      householdId: stored.householdId,
      status,
      plannerVersion: stored.plannerVersion,
      inputHash: stored.inputHash,
      /** The garments the plan was made for, so it can be planned again from the same selection. */
      textileIds: stored.textileIds ?? null,
      /** The pass it was made with, so a reload can plan again with the same answers and moves. */
      pass: storedPass(stored),
      machines: machines.map((machine) => ({
        machineId: machine._id,
        name: machine.name,
        location: machine.location ?? null,
        pricePerStart: machine.pricePerStart ?? null,
        blockMinutes: machine.blockMinutes ?? null,
        applianceType: machine.applianceType ?? null,
      })),
      createdAt: stored.createdAt,
      /** Problems on no load: why each garment left out of every load was left out, and blockers no load carries. */
      excludedItems: excludedBlockedItems(result),
      result,
    }
  },
})

/**
 * "Confirm recipe for Washer 3": records the washer a person is at for one load and that they read
 * its recipe. It starts nothing and reserves nothing; Chemistry follows, and only "I've started"
 * runs the wash. A load with problems can be confirmed, but not started. Confirming again on
 * another washer replaces the first.
 */
export const confirmRecipe = mutation({
  args: { planId: v.id('plans'), loadId: v.string(), machineId: v.id('machines') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const stored = await getPlan(ctx, args.planId)
    if (stored === null) fail('not_found', 'Not found')
    const actor = (await authorize(ctx, 'plan.edit', { householdId: stored.householdId })).actor
    if (!currentPlanner(stored) || stored.status === 'stale' || stored.status === 'retired') fail('stale', 'Stale plan')
    if (!planResult(stored).loads.some((load) => load.id === args.loadId)) fail('not_found', 'No such load')
    const machine = (await related(ctx, stored.householdId, { machineIds: [args.machineId] })).machines[0]!
    if (machine.archived === true || isDryingMachine(machine)) fail('invalid', 'Pick a washer')
    const sessions = await ctx.db.query('sessions').withIndex('by_plan', (q) => q.eq('planId', stored._id)).collect()
    if (sessions.some((session) => session.loadId === args.loadId && session.status !== 'cancelled')) fail('conflict', 'This load already has a session')
    const others = (stored.recipeConfirmations ?? []).filter((entry) => entry.loadId !== args.loadId)
    await ctx.db.patch(stored._id, { recipeConfirmations: [...others, { loadId: args.loadId, machineId: machine._id, confirmedBy: actor.key, confirmedAt: Date.now() }] })
    return null
  },
})

/**
 * Laundry day "Wash now, hang to dry" (design 6.1): these pieces of the plan go on a rack this time, so
 * their loads come back with no dryer run and their wash ends in the drying queue as rack or line.
 */
export const hangOnce = mutation({
  args: { planId: v.id('plans'), textileIds: v.array(v.id('textiles')) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const stored = await getPlan(ctx, args.planId)
    if (stored === null) fail('not_found', 'Not found')
    await authorize(ctx, 'plan.edit', { householdId: stored.householdId })
    const planned = new Set(planResult(stored).loads.flatMap((load) => load.textileIds))
    if (args.textileIds.some((id) => !planned.has(id))) fail('invalid', 'Choose pieces of this plan')
    await ctx.db.patch(stored._id, { hangTextileIds: [...new Set([...(stored.hangTextileIds ?? []), ...args.textileIds])] })
    return null
  },
})

/** One treatment step as the switch preview shows it: the product, where it goes and how much. */
type PreviewStep = { supplyId: Id<'supplies'>; name: string; stage: string; placement: string; dose: TreatmentAction['dose']; atMachine: boolean }

/**
 * "Switch detergent": what a load's recipe would change if the pass used this detergent instead,
 * from planning the same garments again with it. Null when it can't be told (the plan predates
 * stored selections, the load comes out different, or the product can't be planned).
 * Nothing is saved and nothing is substituted.
 */
export const detergentPreview = query({
  args: { planId: v.id('plans'), loadId: v.string(), supplyId: v.id('supplies') },
  handler: async (ctx, args) => {
    const stored = await getPlan(ctx, args.planId)
    if (stored === null) return null
    await authorize(ctx, 'plan.read', { householdId: stored.householdId, uses: { supplyIds: [args.supplyId] } })
    if (stored.textileIds === undefined) return null
    const before = planResult(stored).loads.find((load) => load.id === args.loadId)
    if (before === undefined) return null
    const fresh = plan(await canonicalPlannerInput(ctx, stored.householdId, stored.textileIds, { ...storedPass(stored), detergentId: args.supplyId }))
    const after = fresh.loads.find((load) => load.id === args.loadId)
    if (after === undefined || after.textileIds.join() !== before.textileIds.join() || after.detergent?.chosenId !== args.supplyId) return null
    const names = new Map((await ctx.db.query('supplies').withIndex('by_household', (q) => q.eq('householdId', stored.householdId)).collect()).map((row) => [row._id as string, row.name]))
    const steps = (load: LoadPlan): PreviewStep[] => load.treatments.filter((step) => step.textileId === undefined).map((step) => ({
      supplyId: step.supplyId as Id<'supplies'>,
      name: names.get(step.supplyId) ?? step.supplyId,
      stage: step.stage,
      placement: step.placement,
      dose: stepDose(step),
      atMachine: step.atMachine !== undefined,
    }))
    const was = steps(before)
    const now = steps(after)
    const same = (left: PreviewStep, right: PreviewStep) => left.stage === right.stage && left.placement === right.placement && left.dose.amount === right.dose.amount && left.dose.unit === right.dose.unit && left.dose.mark === right.dose.mark && (left.dose.fractionOfMark ?? 1) === (right.dose.fractionOfMark ?? 1) && left.dose.target === right.dose.target && left.dose.approximate === right.dose.approximate && left.atMachine === right.atMachine
    // A step only on one side is a swap or an addition; a product on both sides with another dose or place changed.
    const changes = [
      ...was.filter((step) => !now.some((other) => other.supplyId === step.supplyId)).map((step) => ({ stage: step.stage, from: step, to: now.find((other) => other.stage === step.stage && !was.some((old) => old.supplyId === other.supplyId)) ?? null })),
      ...now.filter((step) => !was.some((other) => other.supplyId === step.supplyId) && !was.some((old) => old.stage === step.stage && !now.some((other) => other.supplyId === old.supplyId))).map((step) => ({ stage: step.stage, from: null, to: step })),
      ...now.flatMap((step) => {
        const old = was.find((other) => other.supplyId === step.supplyId)
        return old === undefined || same(old, step) ? [] : [{ stage: step.stage, from: old, to: step }]
      }),
    ]
    return { changes }
  },
})




/** A plain question the plan needs answered, from its stored reasons; the web never reads reason codes. */
export type Question = {
  kind: QuestionKind
  /** `subjectId` is the product for a label row and the washer for HE; a dismissal sends the key back. */
  key: { kind: QuestionKind; subjectId: string; context: QuestionContext }
  /** The garments the card is about (care, dry clean, soil). */
  subjectIds: string[]
  context: QuestionContext & { loadId?: string; stage?: 'washer' | 'dryer' }
  product?: { supplyId: Id<'supplies'>; name: string; use: SupplyUse | null; measure: SupplyMeasure | null; safety?: Doc<'supplies'>['safety'] }
  machine?: { machineId: Id<'machines'>; name: string }
  productCheck?: NonNullable<TreatmentStep['productRequirement']> & { cycle: string; temperatureC: number | null }
  rows?: { ruleId: Id<'rules'>; row: number | null; rowText: string | null; dose: Dose }[]
}



/**
 * The question cards for a plan, one per garment for care and dry cleaning, one per load for soil,
 * one per washer for HE, and one per product and context for label rows. Every other reason gives no
 * card; its garments or products stay in "Not in these loads".
 */
export const questions = query({
  args: { planId: v.id('plans') },
  handler: async (ctx, args): Promise<Question[]> => {
    const stored = await getPlan(ctx, args.planId)
    if (stored === null) return []
    await authorize(ctx, 'plan.read', { householdId: stored.householdId })
    const result = planResult(stored)
    const supply = async (id: string | undefined) => {
      const supplyId = id === undefined ? null : ctx.db.normalizeId('supplies', id)
      const row = supplyId === null ? null : await ctx.db.get(supplyId)
      return row === null || row.householdId !== stored.householdId ? null : row
    }
    const product = async (id: string | undefined): Promise<Pick<Question, 'product'>> => {
      const row = await supply(id)
      return row === null ? {} : { product: { supplyId: row._id, name: row.name, use: row.use ?? null, measure: row.measure ?? null, ...(row.safety === undefined ? {} : { safety: row.safety }) } }
    }

    const cards = new Map<string, Question>()
    const add = (card: Question) => {
      const id = JSON.stringify([card.key.kind, card.key.subjectId, card.key.context.soilLevel ?? null, card.key.context.washerClass ?? null, ...(card.kind === 'product_load_confirmation' ? [card.productCheck?.loadFingerprint, card.productCheck?.washContextFingerprint] : [])])
      if (!cards.has(id)) cards.set(id, card)
    }
    for (const reason of result.reasons) {
      const cause = reason.details.cause
      const missing = reason.details.missing
      const loadId = reason.loadId === undefined ? {} : { loadId: reason.loadId }
      if (reason.code === 'needs_confirmation' && cause === 'unknown_care') {
        for (const textileId of reason.textileIds) add({ kind: 'care_unknown', key: { kind: 'care_unknown', subjectId: textileId, context: {} }, subjectIds: [textileId], context: {} })
      } else if (reason.code === 'care_prohibition' && reason.details.method === 'dry_clean_only') {
        for (const textileId of reason.textileIds) add({ kind: 'dry_clean_only', key: { kind: 'dry_clean_only', subjectId: textileId, context: {} }, subjectIds: [textileId], context: {} })
      } else if (reason.code === 'needs_confirmation' && cause === 'dose_input_needed' && missing === 'soil_level' && reason.loadId !== undefined) {
        const unrecorded = reason.details.unrecordedTextileIds
        const subjectIds = Array.isArray(unrecorded) ? unrecorded.filter((id): id is string => typeof id === 'string') : []
        add({ kind: 'soil_level', key: { kind: 'soil_level', subjectId: reason.loadId, context: {} }, subjectIds, context: { loadId: reason.loadId }, ...await product(reason.supplyId) })
      } else if (reason.code === 'needs_confirmation' && cause === 'dose_input_needed' && missing === 'washer_class' && reason.machineId !== undefined) {
        const machineId = ctx.db.normalizeId('machines', reason.machineId)
        const machine = machineId === null ? null : await ctx.db.get(machineId)
        add({
          kind: 'washer_he',
          key: { kind: 'washer_he', subjectId: reason.machineId, context: {} },
          subjectIds: [],
          context: { ...loadId, stage: 'washer' },
          ...await product(reason.supplyId),
          ...(machine === null || machine.householdId !== stored.householdId ? {} : { machine: { machineId: machine._id, name: machine.name } }),
        })
      } else if (reason.code === 'needs_confirmation' && cause === 'product_safety_needed' && reason.supplyId !== undefined) {
        add({ kind: 'product_safety', key: { kind: 'product_safety', subjectId: reason.supplyId, context: {} }, subjectIds: [], context: loadId, ...await product(reason.supplyId) })
      } else if (reason.code === 'needs_confirmation' && cause === 'product_load_confirmation' && reason.supplyId !== undefined) {
        const load = result.loads.find((entry) => entry.id === reason.loadId)
        const requirement = load?.treatments.find((entry) => entry.supplyId === reason.supplyId)?.productRequirement
        if (load !== undefined && requirement !== undefined) add({ kind: 'product_load_confirmation', key: { kind: 'product_load_confirmation', subjectId: reason.supplyId, context: {} }, subjectIds: [...load.textileIds], context: { ...loadId, stage: 'washer' }, ...await product(reason.supplyId), productCheck: { ...requirement, cycle: load.cycle, temperatureC: load.temperatureC } })
      } else if ((reason.code === 'needs_confirmation' || reason.code === 'drying_decision') && cause === 'label_row_needed' && reason.supplyId !== undefined) {
        const stage = reason.details.stage === 'dryer' ? 'dryer' : 'washer'
        const context = labelContext(reason)
        add({ kind: 'label_row', key: { kind: 'label_row', subjectId: reason.supplyId, context }, subjectIds: [], context: { ...loadId, ...context, stage }, ...await product(reason.supplyId) })
      } else if (reason.code === 'needs_confirmation' && cause === 'conflicting_dose_rules' && reason.supplyId !== undefined) {
        const ruleIds = Array.isArray(reason.details.ruleIds) ? reason.details.ruleIds.filter((id): id is string => typeof id === 'string') : []
        const rules = await Promise.all(ruleIds.map(async (id) => {
          const ruleId = ctx.db.normalizeId('rules', id)
          const rule = ruleId === null ? null : await ctx.db.get(ruleId)
          return rule === null || rule.householdId !== stored.householdId ? [] : [{ ruleId: rule._id, row: rule.row ?? null, rowText: rule.rowText ?? null, dose: rule.dose }]
        }))
        const context = labelContext(reason)
        add({ kind: 'conflicting_rows', key: { kind: 'conflicting_rows', subjectId: reason.supplyId, context }, subjectIds: [], context: { ...loadId, ...context, stage: 'washer' }, ...await product(reason.supplyId), rows: rules.flat() })
      }
    }
    return [...cards.values()].sort((left, right) => questionOrder.indexOf(left.kind) - questionOrder.indexOf(right.kind))
  },
})

/**
 * The newest plan with a load still to start, for Home: what to take down to the laundry room.
 * Read from stored plans only; a plan from an older planner, or a stale one, is never offered.
 */
/**
 * "Start load N at about 11:20" at home (design 9.1): one server reminder for the plan's held-back
 * wash, so a closed tab still hears it. Calling it again with a new time (the dryer said otherwise)
 * moves it; the same time and basis keep it. It stands only while the load has no session and the dryer
 * time it was held back from still holds (`basis`, checked again on delivery). Home washers only:
 * in a shared room nothing is held back (design 11).
 */
export const remindStartLoad = mutation({
  args: { planId: v.id('plans'), loadId: v.string(), at: v.number(), basis: v.optional(startLoadBasis) },
  returns: v.object({ dueAt: v.number() }),
  handler: async (ctx, args) => {
    const plan = await getPlan(ctx, args.planId)
    if (plan === null) fail('not_found', 'Not found')
    await authorize(ctx, 'plan.edit', { householdId: plan.householdId })
    const load = planResult(plan).loads.find((entry) => entry.id === args.loadId)
    if (load === undefined || plan.status === 'stale' || plan.status === 'retired') fail('conflict', 'This load is no longer in the plan')
    const washerId = load.machineId === null ? null : ctx.db.normalizeId('machines', load.machineId)
    const washer = washerId === null ? null : await ctx.db.get(washerId)
    if (washer?.location === 'shared') fail('conflict', 'Start times are only for a washer at home')
    const started = await ctx.db.query('sessions').withIndex('by_plan_load_status', (q) => q.eq('planId', plan._id).eq('loadId', args.loadId)).collect()
    if (started.some((session) => session.status !== 'cancelled')) fail('conflict', 'This load has started')
    const pending = (await ctx.db.query('reminders').withIndex('by_plan', (q) => q.eq('planId', plan._id)).collect())
      .filter((reminder) => reminder.kind === 'start_load' && reminder.status === 'scheduled')
    const sameBasis = (reminder: Doc<'reminders'>) => reminder.basis?.key === args.basis?.key && reminder.basis?.end === args.basis?.end && reminder.basis?.source === args.basis?.source
    if (pending.some((reminder) => reminder.loadId === args.loadId && reminder.dueAt === args.at && sameBasis(reminder))) return { dueAt: args.at }
    await cancelStartLoadReminders(ctx, pending)
    await scheduleReminder(ctx, { householdId: plan.householdId, kind: 'start_load', planId: plan._id, loadId: args.loadId, dueAt: args.at, recipientPrincipalKey: plan.createdBy, ...(args.basis === undefined ? {} : { basis: args.basis }) })
    return { dueAt: args.at }
  },
})

async function cancelStartLoadReminders(ctx: MutationCtx, reminders: readonly Doc<'reminders'>[]): Promise<void> {
  for (const reminder of reminders) {
    if (reminder.scheduledFunctionId !== undefined) await ctx.scheduler.cancel(reminder.scheduledFunctionId)
    await ctx.db.patch(reminder._id, { status: 'cancelled' })
  }
}

/**
 * The hold is gone ("Dryer says" turned "Next at about 11:20" into "Start now", or the dryer was
 * emptied): the plan's waiting start reminder is cancelled, so it never calls for a start that is
 * already due. Nothing waiting is not an error.
 */
export const cancelStartLoadReminder = mutation({
  args: { planId: v.id('plans') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const plan = await getPlan(ctx, args.planId)
    if (plan === null) fail('not_found', 'Not found')
    await authorize(ctx, 'plan.edit', { householdId: plan.householdId })
    const pending = (await ctx.db.query('reminders').withIndex('by_plan', (q) => q.eq('planId', plan._id)).collect())
      .filter((reminder) => reminder.kind === 'start_load' && reminder.status === 'scheduled')
    await cancelStartLoadReminders(ctx, pending)
    return null
  },
})

/**
 * Wash minutes from the household's own taps, by washer and program: started to "washer done" (or the
 * move into the dryer). Read from the last 100 finished washes; nothing is stored. ponytail: computed on
 * each read; store it per washer and program like the dryer context if households grow past that.
 */
async function washTaps(ctx: ReadCtx, householdId: Id<'households'>): Promise<Map<string, number[]>> {
  const sessions = await ctx.db.query('sessions').withIndex('by_household_status', (q) => q.eq('householdId', householdId).eq('status', 'completed')).order('desc').take(100)
  const taps = new Map<string, number[]>()
  for (const session of sessions) {
    const machineId = session.washerContext?.machineId
    if (machineId === undefined || session.cycle === undefined || session.machineStartedAt === undefined || session.washFinishedAt === undefined) continue
    const minutes = (session.washFinishedAt - session.machineStartedAt) / 60_000
    if (minutes <= 0) continue
    const key = `${machineId}:${session.cycle}`
    taps.set(key, [...(taps.get(key) ?? []), minutes])
  }
  return taps
}

export const upNext = query({
  args: { householdId: v.id('households') },
  handler: async (ctx, args) => {
    const { actor } = await authorize(ctx, 'plan.read', { householdId: args.householdId })
    const candidates = (await Promise.all((['ready', 'needs_confirmation', 'used'] as const).map((status) => ctx.db
      .query('plans')
      .withIndex('by_household_status', (q) => q.eq('householdId', args.householdId).eq('status', status))
      .collect())))
      .flat()
      .filter(currentPlanner)
      .sort((left, right) => right.createdAt - left.createdAt || right._creationTime - left._creationTime)
    for (const candidate of candidates) {
      const stored = await readPlanDocuments(ctx, candidate)
      const result = planResult(stored)
      const sessions = await ctx.db.query('sessions').withIndex('by_plan', (q) => q.eq('planId', stored._id)).collect()
      const sessionFor = (loadId: string) => sessions.find((session) => session.loadId === loadId && session.status !== 'cancelled')
      if (result.loads.every((load) => sessionFor(load.id) !== undefined)) continue

      const [busy, machines, supplies] = await Promise.all([
        busyTextiles(ctx, args.householdId),
        ctx.db.query('machines').withIndex('by_household', (q) => q.eq('householdId', args.householdId)).collect(),
        ctx.db.query('supplies').withIndex('by_household', (q) => q.eq('householdId', args.householdId)).collect(),
      ])
      const machine = (id: string | null | undefined) => machines.find((entry) => entry._id === id) ?? null
      const supplyName = (id: string) => supplies.find((entry) => entry._id === id)?.name ?? null
      const tapped = await washTaps(ctx, args.householdId)
      const blockerTextileIds = [...new Set(result.loads.flatMap((load) => loadBlockedItems(result, load)
        .filter((item) => item.blocking && item.source.kind === 'garment').map((item) => item.source.id)))]
      const blockerTextiles = new Map(await Promise.all(blockerTextileIds.map(async (id) => {
        const textileId = ctx.db.normalizeId('textiles', id)
        const textile = textileId === null ? null : await ctx.db.get(textileId)
        return [id, textile?.householdId === args.householdId ? (await loadIdentity(ctx, actor.key, textile._id)).name : null] as const
      })))
      const treatment = (step: TreatmentStep) => ({
        supplyId: step.supplyId,
        supplyName: supplyName(step.supplyId),
        dose: stepDose(step),
        placement: step.placement,
        stage: step.stage,
        basis: step.basis ?? null,
        reusable: step.reusable === true,
        confirmation: step.confirmation,
      })
      return {
        planId: stored._id,
        createdAt: stored.createdAt,
        status: stored.status,
        cost: result.cost,
        loads: result.loads.map((load) => {
          const session = sessionFor(load.id)
          const washer = machine(load.machineId)
          const free = stored.textileIds !== undefined && session === undefined && !load.textileIds.some((id) => busy.has(id as Id<'textiles'>))
          const wash = recordedCycle(washer, load.cycle)
          // A load the day plan said to wash now and hang has no dryer run this time.
          const hung = load.textileIds.length > 0 && load.textileIds.every((id) => stored.hangTextileIds?.includes(id as Id<'textiles'>) === true)
          const drying = hung ? null : load.drying ?? null
          const dryer = drying === null ? null : machine(drying.dryerId)
          const dry = recordedCycle(dryer, 'timed')
          return {
            loadId: load.id,
            machineName: washer?.name ?? null,
            cycle: load.cycle,
            washMinutes: wash?.minutes ?? null,
            washConfidence: wash?.confidence ?? 'unknown',
            /** From the household's own taps on this washer and program, after 3 washes (design 10). */
            washLearned: load.machineId === null ? null : learnedWash(tapped.get(`${load.machineId}:${load.cycle}`) ?? [], wash?.minutes ?? null),
            loadSize: load.loadSize ?? null,
            soilLevel: load.soilLevel ?? null,
            textileIds: load.textileIds,
            /** Current named sources and reason facts; clients translate codes rather than showing planner prose. */
            blockers: loadBlockedItems(result, load).filter((item) => item.blocking).flatMap((item) => {
              const reason = result.reasons.find((entry) => entry.id === item.reasonId)
              return reason === undefined ? [] : [{
                source: item.source.kind,
                name: item.source.kind === 'product' ? supplyName(item.source.id) : item.source.kind === 'washer' ? machine(item.source.id)?.name ?? null : blockerTextiles.get(item.source.id) ?? null,
                code: reason.code,
                details: reason.details,
              }]
            }),
            /** The planned washer can start it now. */
            startable: free && loadStartable(result, load),
            /** The washers "Which washer?" may start this load on. */
            startableMachineIds: free ? startableMachineIds(result, load, washerSiblings(machines, load)) : [],
            sessionId: session?._id ?? null,
            treatments: load.treatments.map(treatment),
            dryer: drying === null ? null : {
              status: drying.status,
              name: dryer?.name ?? null,
              heatLabel: drying.heatLabel,
              minutes: dry?.minutes ?? null,
              minutesConfidence: dry?.confidence ?? 'unknown',
              tumbleCount: drying.tumbleTextileIds.length,
              fit: drying.fit,
              heldOutCount: drying.heldOut.length,
              treatments: drying.treatments.map(treatment),
            },
          }
        }),
      }
    }
    return null
  },
})
