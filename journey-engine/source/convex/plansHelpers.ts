import { type Infer } from 'convex/values'
import { evidenceLevel, inferredDryMethod, isDryingMachine, plannerVersion, sha256, stainReasons, washerClassKey, type ApplicationRule, type DecisionReason, type DryMethod, type EvidenceLevel, type LoadAlternate, type LoadPlan, type PlanResult, type PlannerMode, type PlannerSupplyKind, type SoilLevel, type StainReason, type TreatmentStep, type WasherClass, type ProfileRequirements } from '@washcloset/planner'
import type { Doc, Id } from './_generated/dataModel'
import { fail } from './errors'
import { dismissedQuestion, loadPin, type Provenance, type TextileFlag, type TreatmentAction } from './validators'

/** Reusable accessories treat nothing; dryer products reach the planner, which keeps them out of the washer. */
export const plannerSupplyKinds: Partial<Record<Doc<'supplies'>['kind'], PlannerSupplyKind>> = {
  chemical: 'chemical_consumable',
  single_use: 'single_use_consumable',
  dispensing_device: 'dispenser',
  dryer_sheet: 'dryer_sheet',
  wool_dryer_ball: 'wool_dryer_ball',
}

export const availabilityForPlanner = new Set(['available', 'in_use', 'reserved', 'offline'])

export function evidence(provenance: Provenance | undefined) {
  return provenance === undefined ? null : { source: provenance.source, status: evidenceLevel(provenance.confidence) }
}

export function formulation(value: Doc<'supplies'>['formulation']) {
  if (value === undefined) return undefined
  return typeof value === 'string' ? { name: value } : value
}

/**
 * The drying method on record. Care stored before `dryMethod` existed may still carry the
 * "Do not tumble dry" restriction, which is read as the method it states; nothing else is inferred.
 */
export function recordedDryMethod(care: Pick<Doc<'care'>, 'dryMethod' | 'restrictions'>): { method: DryMethod | undefined; inferred: boolean } {
  if (care.dryMethod !== undefined) return { method: care.dryMethod, inferred: false }
  const inferred = inferredDryMethod(care.restrictions)
  return inferred === null ? { method: undefined, inferred: false } : { method: inferred, inferred: true }
}

/** A recorded cycle length in minutes and how sure the household is of it; null when none is recorded. */
export function recordedCycle(machine: Doc<'machines'> | null, cycle: string): { minutes: number; confidence: EvidenceLevel } | null {
  const entry = machine?.cycleProfile?.cycles[cycle]
  if (entry === undefined || !Number.isFinite(entry.durationMinutes) || entry.durationMinutes < 0) return null
  return { minutes: entry.durationMinutes, confidence: entry.confidence }
}

/** A planned dose as the checklist stores it: the printed mark, the product's marks and a printed volume only when there are some. */
export function stepDose(step: TreatmentStep): TreatmentAction['dose'] {
  return {
    amount: step.dose.amount,
    unit: step.dose.unit,
    ...(typeof step.dose.mark === 'string' ? { mark: step.dose.mark } : {}),
    ...(step.dose.fractionOfMark === undefined ? {} : { fractionOfMark: step.dose.fractionOfMark }),
    ...(step.dose.target === undefined ? {} : { target: step.dose.target }),
    ...(step.dose.approximate === undefined ? {} : { approximate: step.dose.approximate }),
    ...(step.measurementCue === null || step.measurementCue === undefined ? {} : { measurementCue: step.measurementCue }),
    ...(step.marks === undefined || step.marks.length === 0 ? {} : { marks: [...step.marks] }),
    ...(step.equivalent === null || step.equivalent === undefined ? {} : { equivalent: { amount: step.equivalent.amount, unit: step.equivalent.unit } }),
  }
}

/** The selection in canonical order, so the same garments always make the same plan and hash. */
export function canonicalSelection(selectedTextileIds: readonly Id<'textiles'>[]): Id<'textiles'>[] {
  const unique = [...new Set(selectedTextileIds)]
  if (unique.length !== selectedTextileIds.length || unique.length === 0) fail('invalid', 'Select at least one textile')
  return unique.sort()
}

export function selectionKey(textileIds: readonly Id<'textiles'>[]): string {
  return sha256(textileIds.join(','))
}

/**
 * What a pass sends with every recompute on top of the selection: Wash now, the person's arrangement
 * of loads, the questions answered without a label row, and the products left out.
 */
export type PlanPass = {
  productLoadConfirmations?: import('@washcloset/planner').ProductLoadConfirmation[]
  optionalSupplyIds?: Id<'supplies'>[]
  washGoals?: import('@washcloset/planner').WashGoal[]
  mode: PlannerMode
  loadPins: Infer<typeof loadPin>[]
  dismissedQuestions: Infer<typeof dismissedQuestion>[]
  excludedSupplyIds: Id<'supplies'>[]
  /** The detergent this pass chose; unset lets the planner pick the first that fits each load. */
  detergentId?: Id<'supplies'>
  /** Choosing a product adds a recipe step; execution records completion separately. */
  pretreatmentChoices?: { textileId: Id<'textiles'>; supplyId: Id<'supplies'> }[]
}

/** The pass a plan was made with, read back from its input snapshot. */
export function storedPass(stored: Doc<'plans'>): PlanPass {
  const snapshot = stored.inputSnapshot as Partial<PlanPass> & { mode?: unknown }
  return {
    ...(snapshot.productLoadConfirmations === undefined ? {} : { productLoadConfirmations: snapshot.productLoadConfirmations }),
    mode: snapshot.mode === 'rush' ? 'rush' : 'normal',
    loadPins: snapshot.loadPins ?? [],
    dismissedQuestions: snapshot.dismissedQuestions ?? [],
    excludedSupplyIds: snapshot.excludedSupplyIds ?? [],
    pretreatmentChoices: snapshot.pretreatmentChoices ?? [],
    // Old recipes retain their existing product selection; only new passes start empty.
    optionalSupplyIds: snapshot.optionalSupplyIds ?? [...new Set(planResult(stored).loads.flatMap((load) => load.treatments.map((step) => step.supplyId as Id<'supplies'>)))],
    washGoals: snapshot.washGoals ?? ['ordinary'],
    ...(snapshot.detergentId === undefined ? {} : { detergentId: snapshot.detergentId }),
  }
}

/** A stored rule as the planner reads it. */
export function plannerRule(rule: Doc<'rules'>): ApplicationRule {
  return {
    id: rule._id,
    supplyId: rule.supplyId,
    ...(rule.row === undefined ? {} : { row: rule.row }),
    ...(rule.rowText === undefined ? {} : { rowText: rule.rowText }),
    conditions: rule.conditions,
    dose: rule.dose,
    stage: rule.stage,
    placement: rule.placement,
    timing: rule.timing,
    incompatibleSupplyIds: rule.incompatibleSupplyIds,
    incompatibleMaterials: rule.incompatibleMaterials,
    sharedCompartmentCompatible: rule.sharedCompartmentCompatible,
    maximumTemperatureC: rule.maximumTemperatureC,
    stainChemistry: rule.stainChemistry,
    stainKinds: rule.stainKinds,
    safeMaterials: rule.safeMaterials,
    maximumPH: rule.maximumPH,
    evidence: evidence(rule.provenance),
  } as ApplicationRule
}

/** Placements a washer supports, whether recorded as a list or as compartments and flags. */
export function machinePlacements(profile: Doc<'machines'>['dispensingProfile']): string[] {
  if (profile.placements !== undefined) return profile.placements
  return [
    ...(profile.compartments ?? []).map((compartment) => (typeof compartment === 'string' ? compartment : compartment.id)),
    ...(profile.directToDrum === true ? ['direct_to_drum'] : []),
    ...(profile.centerAgitator === true ? ['center_agitator'] : []),
    ...(profile.downyBall === true ? ['downy_ball'] : []),
  ]
}

/**
 * The placements `useDirections` reads: the household's preferred washer, else its first washer, among
 * the washers in use. The planner input and a product's first label row both read it, so they agree.
 */
export function washerPlacements(machines: readonly Doc<'machines'>[], preferredMachineId: Id<'machines'> | undefined): string[] {
  const washers = machines.filter((machine) => machine.archived !== true && !isDryingMachine(machine))
  const washer = washers.find((machine) => machine._id === preferredMachineId) ?? washers[0]
  return washer === undefined ? [] : machinePlacements(washer.dispensingProfile)
}

/** The flag's stain words, as the flag sheet's chips name them. */
export const stainWords: Record<StainReason, string> = { food: 'food or drink', mud_grass: 'grass or mud', baby_mess: 'spit-up or diaper', stain_other: 'other stain' }

/** Where a flagged stain is: its reason words and the person's note; absent when no stain reason was flagged. */
export function flaggedStain(flag: TextileFlag | undefined): string | undefined {
  const stains = (flag?.reasons ?? []).filter((reason): reason is StainReason => (stainReasons as readonly string[]).includes(reason))
  if (stains.length === 0) return undefined
  return [...stains.map((reason) => stainWords[reason]), ...(flag?.stainNote === undefined ? [] : [flag.stainNote])].join(', ')
}

/**
 * The planner input for a selection and its pass, read fresh from the household's records. Values
 * added since the first planner are spread in only when recorded: the canonical form turns
 * `undefined` into `null`, which would change the hash of a plan whose records did not change.
 */
/** A garment's care record as the planner reads it; no record needs confirmation. */
export function plannerCare(care: Doc<'care'> | null) {
  if (care === null) return { status: 'needs_confirmation' as const }
  const dryMethod = recordedDryMethod(care).method
  return {
    washMethod: care.washMethod,
    cycle: care.cycle,
    maxTemperatureC: care.maxTemperatureC,
    restrictions: care.restrictions,
    ...(care.instructions === undefined ? {} : { instructions: care.instructions }),
    ...(dryMethod === undefined ? {} : { dryMethod }),
    ...(care.dryHeat === undefined ? {} : { dryHeat: care.dryHeat }),
    ...(care.bleach === undefined ? {} : { bleach: care.bleach }),
    status: care.status,
    evidence: evidence(care.provenance),
  }
}

/** A clothing profile's product requirements, when recorded; they apply to every product stage. */
export function profileRequirements(wearer: Doc<'wearers'>): { requirements?: ProfileRequirements } {
  const requirements = (wearer as Doc<'wearers'> & { requirements?: { fragranceFree?: boolean; dyeFree?: boolean; avoidIngredients?: string[]; acceptedSupplyIds?: Id<'supplies'>[] } }).requirements
  if (requirements === undefined) return {}
  return { requirements: { ...requirements, ...(requirements.acceptedSupplyIds === undefined ? {} : { acceptedSupplyIds: requirements.acceptedSupplyIds.map(String) }) } }
}

/** What the pack says it contains, as recorded; absent stays unknown and nothing is read from the name. */
export function packContents(supply: Doc<'supplies'>): { fragrance?: 'free' | 'scented' | 'unknown'; dye?: 'free' | 'dyed' | 'unknown'; ingredients?: string[] } {
  const safety = supply.safety as (NonNullable<Doc<'supplies'>['safety']> & { fragrance?: 'free' | 'scented' | 'unknown'; dye?: 'free' | 'dyed' | 'unknown'; ingredients?: string[] }) | undefined
  return {
    ...(safety?.fragrance === undefined ? {} : { fragrance: safety.fragrance }),
    ...(safety?.dye === undefined ? {} : { dye: safety.dye }),
    ...(safety?.ingredients === undefined ? {} : { ingredients: safety.ingredients }),
  }
}

/** The planner output as stored: everything but the input snapshot, which the plan row keeps once. */
export type StoredPlanResult = Omit<PlanResult, 'inputSnapshot'>

/** The schema keeps the planner output as a planner document; this is where it is typed. */
export function planResult(stored: Doc<'plans'>): StoredPlanResult {
  return stored.result as StoredPlanResult
}

const blockingCodes = new Set(['needs_confirmation', 'product_restriction'])

/**
 * Reasons that stop one load from starting: its own confirmation needs, and any
 * household-wide evidence gap (a reason naming no textiles). Garments excluded
 * elsewhere in the plan do not block a load they are not part of.
 */
export function loadBlockers(result: StoredPlanResult, load: LoadPlan): DecisionReason[] {
  const loadTextiles = new Set<string>(load.textileIds)
  return result.reasons.filter((reason) =>
    blockingCodes.has(reason.code)
    && (reason.textileIds.length === 0 || reason.loadId === load.id || reason.textileIds.some((id) => loadTextiles.has(id))))
}

export function loadStartable(result: StoredPlanResult, load: LoadPlan): boolean {
  return load.status === 'ready' && loadBlockers(result, load).length === 0
}

/** The row a problem sits under: the garment, product or washer whose record caused it. */
export type BlockedItemSource = { kind: 'garment' | 'product' | 'washer'; id: string }

/**
 * One problem with a load (or with a garment the plan left out), attributed to its source row.
 * 'confirm' is a fact nobody has recorded yet; 'conflict' is a recorded fact that rules the plan out.
 * `blocking` is false only for a conflict the planner already worked around (a product left out of
 * the load), which is shown but does not stop the load from starting.
 */
export type BlockedItem = {
  reasonId: string
  source: BlockedItemSource
  kind: 'confirm' | 'conflict'
  blocking: boolean
  textileIds?: string[]
  supplyIds?: string[]
}

const idList = (value: unknown): string[] => Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []

/** Causes where a recorded fact rules the plan out; every other blocker is a fact still to confirm. */
const conflictCauses = new Set([
  'care_label_prohibition', 'pre_owned_fragile', 'no_compatible_supply', 'garment_product_conflict', 'chemical_combination_conflict', 'shared_compartment_conflict',
  'stain_care_conflict', 'product_material_conflict', 'product_temperature_conflict', 'unsupported_machine_cycle', 'unsupported_machine_placement',
  'locked_door_mid_cycle', 'textile_exceeds_all_machine_capacity', 'load_capacity', 'no_gentle_cycle', 'tag_forbids_bleach',
  'profile_requirement_conflict',
])

const confirmCodes = new Set(['needs_confirmation', 'care_compatibility'])

/** Causes the washer's record answers or causes. */
const washerCauses = new Set(['insufficient_machine_evidence', 'unsupported_machine_cycle', 'unsupported_machine_placement', 'locked_door_mid_cycle', 'shared_compartment_conflict', 'load_capacity', 'no_gentle_cycle'])

const washerInputs = new Set(['washer_class', 'load_size', 'appliance_type'])

/** Causes about one garment's own record, even when a product is named beside it. */
const garmentCauses = new Set(['unknown_care', 'care_label_prohibition', 'pre_owned_fragile', 'unknown_stain_report', 'stain_care_conflict', 'unsupported_stain_chemistry', 'stain_needs_cleaner', 'stain_retry_unavailable', 'pretreatment_choice_needed', 'textile_exceeds_all_machine_capacity', 'unknown_cycle', 'protein_fiber_enzyme', 'protein_fiber_enzyme_unknown'])

/** Product causes with no product id to name: no products at all, or a product the planner names by id elsewhere. */
const productCauses = new Set(['insufficient_product_evidence', 'product_safety_needed', 'no_compatible_supply', 'garment_product_conflict', 'chemical_combination_conflict'])

/**
 * A plan reason as items under the rows that caused it: one per product, per garment or one for the
 * washer. Never empty, so no blocker is lost; a reason naming nothing falls back to the most specific
 * id it has (its washer, the load's washer, else the reason itself).
 */
export function reasonItems(reason: DecisionReason, loadMachineId: string | null, blocking: boolean): BlockedItem[] {
  const cause = typeof reason.details.cause === 'string' ? reason.details.cause : ''
  const kind: BlockedItem['kind'] = conflictCauses.has(cause) || !confirmCodes.has(reason.code) ? 'conflict' : 'confirm'
  const supplyIds = [...new Set([...(reason.supplyId === undefined ? [] : [reason.supplyId]), ...idList(reason.details.supplyIds)])].sort()
  const flagged = cause === 'tag_forbids_bleach' ? [...idList(reason.details.noBleachIds), ...idList(reason.details.nonChlorineIds)].sort() : []
  const textileIds = flagged.length > 0 ? flagged : [...reason.textileIds]
  const item = (source: BlockedItemSource, textiles: readonly string[] = textileIds): BlockedItem => ({
    reasonId: reason.id,
    source,
    kind,
    blocking,
    ...(textiles.length === 0 ? {} : { textileIds: [...textiles] }),
    ...(supplyIds.length === 0 ? {} : { supplyIds }),
  })
  const machineId = reason.machineId ?? loadMachineId
  const garments = (ids: readonly string[]) => ids.map((id) => item({ kind: 'garment', id }, [id]))
  if (cause === 'dose_input_needed' && reason.details.missing === 'soil_level') {
    const unrecorded = idList(reason.details.unrecordedTextileIds)
    if (unrecorded.length > 0 || textileIds.length > 0) return garments(unrecorded.length > 0 ? unrecorded : textileIds)
  }
  const washerCause = washerCauses.has(cause) || cause === 'dose_input_needed' && washerInputs.has(String(reason.details.missing))
  if (washerCause && machineId !== null) return [item({ kind: 'washer', id: machineId })]
  if (garmentCauses.has(cause) && textileIds.length > 0) return garments(textileIds)
  if (supplyIds.length > 0) return supplyIds.map((id) => item({ kind: 'product', id }))
  if (textileIds.length > 0) return garments(textileIds)
  const product = productCauses.has(cause)
  if (!product && machineId !== null) return [item({ kind: 'washer', id: machineId })]
  return [item({ kind: product ? 'product' : 'washer', id: reason.id })]
}

/**
 * The problems to show on one load: every reason that blocks it, then each conflict the planner
 * worked around by leaving a product out of it (shown, not blocking).
 */
export function loadBlockedItems(result: StoredPlanResult, load: LoadPlan): BlockedItem[] {
  const blocking = loadBlockers(result, load).flatMap((reason) => reasonItems(reason, load.machineId, true))
  const workedAround = result.reasons
    .filter((reason) => reason.code === 'product_left_out' && reason.loadId === load.id && reason.details.cause === 'tag_forbids_bleach')
    .flatMap((reason) => reasonItems(reason, load.machineId, false))
  return [...blocking, ...workedAround]
}

/**
 * Problems that sit on no load: the reasons each garment left out of every load was left out for
 * (care, product restrictions, capacity), and blockers that reach no load (a household-wide gap
 * when nothing could be planned). Each garment's item names that garment alone.
 */
export function excludedBlockedItems(result: StoredPlanResult): BlockedItem[] {
  const loaded = new Set(result.loads.flatMap((load) => load.textileIds))
  const reached = new Set(result.loads.flatMap((load) => loadBlockers(result, load).map((reason) => reason.id)))
  const byId = new Map(result.reasons.map((reason) => [reason.id, reason]))
  const items: BlockedItem[] = []
  const seen = new Set<string>()
  for (const exclusion of result.exclusions) {
    if (loaded.has(exclusion.textileId)) continue
    for (const reasonId of exclusion.reasonIds) {
      const reason = byId.get(reasonId)
      if (reason === undefined) continue
      seen.add(reasonId)
      const one = { ...reason, textileIds: [exclusion.textileId] }
      items.push(...reasonItems(one, null, blockingCodes.has(reason.code)))
    }
  }
  for (const reason of result.reasons) {
    if (!blockingCodes.has(reason.code) || reached.has(reason.id) || seen.has(reason.id)) continue
    items.push(...reasonItems(reason, null, true))
  }
  return items
}

/** The other kind of washer in the load's room that `machineId` belongs to, if any. */
function alternateFor(load: LoadPlan, machineId: string): LoadAlternate | undefined {
  return load.alternates?.find((alternate) => alternate.machineIds.includes(machineId))
}

/**
 * The load as it runs on one washer. A load with only one kind of washer in its room (a washer at
 * home, or a room of siblings) takes the same steps on any of them, as before. In a room with more
 * than one kind, the load's own kind takes its planned steps, another kind takes the steps planned
 * for it, and a washer outside the room has none (null).
 */
export function loadOn(load: LoadPlan, machineId: string): LoadPlan | null {
  if (load.roomMachineIds === undefined || machineId === load.machineId || load.roomMachineIds.includes(machineId)) return load
  const alternate = alternateFor(load, machineId)
  if (alternate === undefined) return null
  return {
    ...load,
    machineId: alternate.machineId,
    cycle: alternate.cycle,
    temperatureC: alternate.temperatureC,
    treatments: alternate.treatments,
    washerClass: alternate.washerClass,
    capacityUnits: alternate.capacityUnits,
    labelPreparation: alternate.labelPreparation,
    status: alternate.status === 'ready' ? 'ready' : 'needs_confirmation',
  }
}

/** Which kind of washer a load runs on: 'base' for its own kind, else the id that stands for the other kind. */
export function loadKind(load: LoadPlan, machineId: string): string | null {
  if (load.roomMachineIds === undefined || machineId === load.machineId || load.roomMachineIds.includes(machineId)) return 'base'
  return alternateFor(load, machineId)?.machineId ?? null
}

/**
 * Whether the load may start on another kind of washer in its room: that kind can take it, and
 * nothing household-wide is still unanswered. Reasons about the load on its own planned washer
 * (a slot, a cycle or a door it lacks) are left out; the alternate was planned without them.
 */
export function alternateStartable(result: StoredPlanResult, load: LoadPlan, alternate: LoadAlternate): boolean {
  if (alternate.status !== 'ready') return false
  const ownWashers = new Set<string>([...(load.machineId === null ? [] : [load.machineId]), ...(load.roomMachineIds ?? [])])
  return loadBlockers(result, load).every((reason) => reason.loadId === load.id || (reason.machineId !== undefined && ownWashers.has(reason.machineId)))
}

/**
 * Whether `machine` is another washer of the planned washer's kind in the same place (a sibling at
 * home or in a one-kind room), which takes the planned steps unchanged. A washer of another kind
 * never does, even when the planner could not use it and so planned no steps for it.
 */
export function sameKindWasher(machine: Doc<'machines'>, planned: Doc<'machines'>): boolean {
  return !isDryingMachine(machine)
    && machine.archived !== true
    && machine.householdId === planned.householdId
    && (machine.location ?? 'home') === (planned.location ?? 'home')
    && washerClassKey(machine) === washerClassKey(planned)
    && JSON.stringify(Object.entries(machine.washProcesses ?? {}).sort()) === JSON.stringify(Object.entries(planned.washProcesses ?? {}).sort())
}

/** The other washers of the planned washer's kind beside it, for a load planned with one kind in its room. */
export function washerSiblings(machines: readonly Doc<'machines'>[], load: LoadPlan): string[] {
  const planned = machines.find((machine) => machine._id === load.machineId)
  if (planned === undefined || load.roomMachineIds !== undefined) return []
  return machines.filter((machine) => machine._id !== planned._id && sameKindWasher(machine, planned)).map((machine) => machine._id as string).sort()
}

/**
 * The washers a load may start on now, by its plan alone: its own kind when it is startable, and
 * each other kind in its room that can take it. Empty when none can. A load planned with one kind
 * in its room lists its planned washer and `siblings`, the other washers of that kind beside it.
 */
export function startableMachineIds(result: StoredPlanResult, load: LoadPlan, siblings: readonly string[] = []): string[] {
  const own = load.machineId !== null && loadStartable(result, load) ? [load.machineId, ...(load.roomMachineIds ?? siblings)] : []
  const others = (load.alternates ?? []).filter((alternate) => alternateStartable(result, load, alternate)).flatMap((alternate) => alternate.machineIds)
  return [...new Set([...own, ...others])]
}

/** A plan the current planner made; older plans read as stale and never start. */
export function currentPlanner(stored: Doc<'plans'>): boolean {
  return stored.plannerVersion === plannerVersion
}

/** A load as the washer sees it: its garments, machine, cycle, heat and dryer. Doses are not part of it. */
export function loadShape(load: LoadPlan): string {
  return JSON.stringify([load.id, [...load.textileIds].sort(), load.machineId, load.cycle, load.temperatureC, load.drying?.dryerId ?? null])
}

export type QuestionKind = 'care_unknown' | 'dry_clean_only' | 'soil_level' | 'washer_he' | 'product_safety' | 'product_load_confirmation' | 'label_row' | 'conflicting_rows'

/** Cards are asked in this order. */
export const questionOrder: readonly QuestionKind[] = ['care_unknown', 'dry_clean_only', 'soil_level', 'washer_he', 'product_safety', 'product_load_confirmation', 'label_row', 'conflicting_rows']

/** The load facts a label question was asked for; a fact the load does not have is absent. */
export type QuestionContext = { soilLevel?: SoilLevel; washerClass?: WasherClass }

function stringDetail(reason: DecisionReason, name: string): string | null {
  const value = reason.details[name]
  return typeof value === 'string' ? value : null
}

/** The soil and HE a label question was asked for, each only when the load has it. */
export function labelContext(reason: DecisionReason): QuestionContext {
  const soilLevel = stringDetail(reason, 'soilLevel') as SoilLevel | null
  const washerClass = stringDetail(reason, 'washerClass') as WasherClass | null
  return { ...(soilLevel === null ? {} : { soilLevel }), ...(washerClass === null ? {} : { washerClass }) }
}
