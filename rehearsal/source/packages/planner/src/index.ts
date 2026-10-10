import type { JsonValue, BulkClass, CareEvidence, TextileEvidence, StainKind, StainReport, Dose, StainChemistry, ApplicationRule, SupplyItem, MachineDispensingProfile, DispensingMechanism, MachineEvidence, WasherPricing, PlannerPolicy, PlannerPreferences, CareVeto, PinRefusalCause, PlannerInput, DecisionReasonCode, DecisionReason, TreatmentStep, LoadPlan, AlternateProblem, LoadAlternate, LoadOn, PlanExplanation, PlanResult, ReasonDraft, Item, WorkingLoad, ExclusionDraft, RoomClass, WashedOutTreatment, BleachKind, ProfileRequirements } from './types.ts'
export type { PlannerVersion, JsonPrimitive, JsonValue, JsonObject, EvidenceRecord, CareWashMethod, BulkClass, CareRestrictionEvidence, CareEvidence, OwnerReference, AdditionalCareInstructions, TextileEvidence, StainKind, StainReport, FormulationEvidence, SupplyPackage, MeasureMark, SupplyMeasurement, Dose, ApplicationStage, DispensingPlacement, AnyPlacement, ApplicationConditions, StainChemistry, ApplicationRule, PlannerSupplyKind, SupplyItem, MachineDispensingProfile, DispensingMechanism, DispensingRelease, MachineCompartment, MachineEvidence, WasherPricing, PlannerPricing, PlannerPolicy, PlannerPreferences, LoadPin, CareVeto, PinRefusalCause, DismissedAnswer, DismissedQuestion, PlannerInput, DecisionReasonCode, DecisionReason, TreatmentStep, StepDose, DoseContextSnapshot, AtMachineCandidate, AtMachine, OwnerAssignment, LoadPlan, LoadDetergent, AlternateProblem, LoadAlternate, LoadOn, Exclusion, PlanCost, PlanExplanation, PlanResult, RoomClass, WashedOutTreatment, ProfileRequirements } from './types.ts'
import { canonicalize, sha256, stableJson } from './hash.ts'
export { sha256, stableJson } from './hash.ts'
import { careCheckedUnknown, careForbidsSoaking, careMethod, careProhibited, careRestrictionText, careSeparation, careUnknown } from './care.ts'
import { materialCareProblem } from './material-care.ts'
export { materialCareProblem } from './material-care.ts'
import { firstWashSeparation, recordedFirstWash } from './conditional-separation.ts'
import { careProcessCapacity, careProcessRequirements, careProductAllowed, careRequiresDetergent, checkedWashProcess, washProcessUnmatched, washProcessWording } from './care-process.ts'
import { planDrying, type DryingPlan } from './drying.ts'
import { garmentAdvice, garmentAdvicePolicyVersion } from './garment-advice.ts'
import { preOwnedAdvice, preOwnedHandWash } from './pre-owned.ts'
import { productBenefit } from './product-benefits.ts'
import { applyPersonalPlannerInput, canonicalPersonalPlannerInput } from './personal-planner.ts'
import { evidencePolicy, evidenceStatus, isRecord, ruleEvidenceUsable, supplyLabelUsable } from './evidence.ts'
import { adaptedPlacement, addedByHandMidCycle, doorLocksDuringCycle, machineCapacity, machineClasses, placementsOf, washerClass, washerClassKey } from './physical.ts'
import { atMachineDose, calculatedDose, dismissedAnswer, doseBySize, doseContextSnapshot, doseEquivalent, excludedSupply, heavierSoil, markDose, markLabels, ruleDose, ruleSpecificity, rulesForSupply, soilLevelOf, type CalculatedDose, type DoseContext, type RuleSelection } from './rules.ts'
import { cycleGentleness, defaultPackingUnits, dryerSupplyKinds, isDryer, isDryingMachine, type BleachAnswer, type ColorGroup, type SoilLevel } from './vocabulary.ts'

export * from './vocabulary.ts'
export * from './care-process.ts'
export { firstWashSeparation, recordedFirstWash, type FirstWashSeparationRequirement, type FirstWashFacts } from './conditional-separation.ts'
export * from './clothing-tags.ts'
export * from './fabric-details.ts'
export * from './product-benefits.ts'
export * from './personal-suggestions.ts'
export * from './personal-planner.ts'
export * from './personal-outcomes.ts'
export * from './garment-advice.ts'
export * from './pre-owned.ts'
export * from './pass-order.ts'
export { fractionOfMarkText, markFractionProblem } from './mark-fraction.ts'
export { outfitGroupKey } from './outfits.ts'
export { evidencePolicy, evidenceStatus, ruleEvidenceUsable } from './evidence.ts'
export {
  adaptedPlacement,
  doorLocksDuringCycle,
  dryerPhases,
  isDryerPhase,
  labelTreatmentPhase,
  machineCapacity,
  machineClasses,
  phaseOrder,
  placementsOf,
  treatmentPhase,
  washerClass,
  washerClassKey,
  washerPrepPhases,
} from './physical.ts'
export type { Direction, DispensingFacts, MachineDoor, MachineFacts, StepPhase, TreatmentPhase, TreatmentTiming, WasherShape } from './physical.ts'
export { atMachineDose, calculatedDose, doseBasis, doseCoverage, doseEquivalent, loadSizeFor, markLabels, resolveAtMachine, ruleDose, ruleSpecificity, selectRule } from './rules.ts'
export type { CalculatedDose, CoverageCell, CoverageGrid, DoseAdjustment, DoseContext, LabelDoseReason, DoseProblem, MissingInput, RuleSelection, SizedDose } from './rules.ts'
export { chooseDryerSetting, documentedHeatSettings, lowHeatLimitF, type DryerSettingNote } from './dryer-setting.ts'
export { planDrying, dryerFit, dryerSupplyUse, dryerTimeSuggestion, tumbleCeiling, type DryerFit } from './drying.ts'
export * from './dryer-loads.ts'
export type { DryingHoldOut, DryingLoadInput, DryingNote, DryingOmission, DryingOmissionCause, DryingOptions, DryingPlan, HoldOutMethod, HoldOutReason } from './drying.ts'
export { compileDirections, directionsCoverage, doseProblem, measureProblem, rowTextFor } from './directions.ts'
export type { CompiledRule, CompileResult, DirectionsCell, DirectionsRow, DirectionsTable, SupplyMeasure } from './directions.ts'

export const plannerVersion = 'planner-v2.22' as const











export const stainKinds = ['protein', 'tannin', 'oil_grease', 'starch_sauce', 'dye_ink_transfer', 'rust_mineral', 'combination', 'unknown'] as const
export const stainChemistries = ['protease', 'lipase', 'oxygen_bleach', 'surfactant', 'chlorine_bleach', 'rust_remover'] as const
export const productBleachKinds = ['none', 'oxygen', 'chlorine', 'unknown'] as const






export { nativeDoseProblem, nativeDoseText, productLoadFingerprint, productWashContextFingerprint, sourceLoadCategories, sourceMaterialAllowed, sourceMixingConflict } from './product-contract.ts'
export type { ProductSourceContract, ProductLoadConfirmation, SourceLoadCategory } from './product-contract.ts'
import { materialFibers, productLoadFingerprint, productWashContextFingerprint, sourceMaterialAllowed, sourceMixingConflict, type ProductSourceContract, type ProductLoadConfirmation } from './product-contract.ts'









































const reasonPriority: Record<DecisionReasonCode, number> = {
  care_prohibition: 10,
  care_compatibility: 10,
  needs_confirmation: 20,
  product_restriction: 30,
  dye_first_wash_risk: 40,
  capacity_limit: 50,
  dose_rule_selected: 60,
  machine_placement: 61,
  shared_compartment_conflict: 62,
  machine_substitution: 63,
  drying_decision: 64,
  product_left_out: 66,
  cost_calculated: 70,
  ownership_preserved: 80,
  pin_refused: 85,
  preference_applied: 90,
  preference_overridden: 91,
}




function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}





function itemId(textile: TextileEvidence, fallback: number): string {
  const value = textile.id ?? textile.textileId ?? textile.instanceId
  if (typeof value === 'string' && value.length > 0) return value
  return `unidentified-${fallback + 1}`
}

function ownerId(textile: TextileEvidence): string {
  if (typeof textile.ownerId === 'string' && textile.ownerId.length > 0) return textile.ownerId
  if (typeof textile.owner === 'string' && textile.owner.length > 0) return textile.owner
  if (isRecord(textile.owner)) {
    const value = textile.owner.id ?? textile.owner.principalId
    if (typeof value === 'string' && value.length > 0) return value
  }
  return 'unknown-owner'
}

function bulkUnits(textile: TextileEvidence): number {
  if (typeof textile.bulkUnits === 'number' && Number.isFinite(textile.bulkUnits) && textile.bulkUnits > 0) return textile.bulkUnits
  const byClass: Record<BulkClass, number> = { very_light: 0.75, light: 1, medium: 1.5, bulky: 2.5, very_bulky: 3.5 }
  return textile.bulkClass ? byClass[textile.bulkClass] : 1
}

function colorGroup(textile: TextileEvidence): ColorGroup {
  if (textile.colorGroup) return textile.colorGroup
  const color = textile.color?.toLowerCase() ?? ''
  if (!color) return 'unknown'
  if (/white|ivory|cream|natural|oatmeal|sand|light|heather/.test(color)) return 'light'
  if (/black|onyx|charcoal|navy|dark|ink/.test(color)) return color.includes('black') || color.includes('onyx') ? 'black' : 'dark'
  if (/red|blue|green|purple|orange|saturated/.test(color)) return 'saturated'
  return 'medium'
}

function firstWash(textile: TextileEvidence): boolean {
  return textile.firstWash === true || textile.firstWashState === 'unwashed' || textile.firstWashState === 'unknown'
}

function isDryerSupply(supply: SupplyItem): boolean {
  return (dryerSupplyKinds as readonly string[]).includes(supply.kind ?? '')
}

/** Equipment and dryer products need only a read label; a chemical also needs its formulation. */
function supplyEvidenceSufficient(supply: SupplyItem): boolean {
  const formulation = supply.formulation ?? supply.formulationEvidence
  return supplyLabelUsable(supply)
    && (supply.kind === 'accessory' || isDryerSupply(supply) || formulation !== null && formulation !== undefined && evidenceStatus(supply.formulationEvidence) !== 'unknown')
}

/**
 * Missing evidence is unknown evidence: the machine must carry its own provenance and a cycle list.
 * A size is optional (loads then pack by `defaultPackingUnits`), but a recorded one must say how it is known.
 */
function machineEvidenceSufficient(machine: MachineEvidence): boolean {
  return (machineCapacity(machine) === null || evidencePolicy.machineUsable(machine.capacityConfidence))
    && evidencePolicy.machineUsable(evidenceStatus(machine.evidence))
    && machineCycles(machine) !== null
}

/**
 * How much a washer takes when grouping garments into loads: its recorded size, or about a default
 * size when the person skipped it. It only packs loads; a dose's size comes from the drum at the machine.
 */
export function packingCapacity(machine: MachineEvidence): number {
  return machineCapacity(machine) ?? defaultPackingUnits
}


/**
 * The washer classes in a machine's room, in representative id order. A shared room is every usable
 * washer at the same shared location; a washer at home is a room of its own class.
 */
export function roomClasses(usableMachines: readonly MachineEvidence[], machine: MachineEvidence): RoomClass[] {
  const shared = machine.location === 'shared'
  const classKey = (entry: MachineEvidence) => stableJson([washerClassKey(entry), entry.washProcesses ?? null])
  const ownKey = classKey(machine)
  const room = [machine, ...usableMachines.filter((candidate) => candidate.id !== machine.id
    && candidate.location === machine.location
    && (shared || classKey(candidate) === ownKey))]
  const byKey = new Map<string, MachineEvidence[]>()
  for (const candidate of room) {
    const key = classKey(candidate)
    byKey.set(key, [...(byKey.get(key) ?? []), candidate])
  }
  return [...byKey.entries()].map(([key, members]) => {
    const sorted = [...members].sort((left, right) => left.id.localeCompare(right.id))
    return { key, machineIds: sorted.map((member) => member.id), representative: sorted[0]! }
  }).sort((left, right) => left.representative.id.localeCompare(right.representative.id))
}

function machineProfile(machine: MachineEvidence): MachineDispensingProfile | null {
  return machine.dispensing ?? machine.dispensingProfile ?? null
}

/** A dispensing profile counts unless it says its evidence is unknown; an undocumented profile is the machine's own claim. */
function dispensingEvidenceKnown(profile: MachineDispensingProfile): boolean {
  return profile.confidence !== 'unknown'
    && profile.evidenceConfidence !== 'unknown'
    && profile.evidence !== null
    && evidenceStatus(profile.evidence) !== 'unknown'
}

function machineCycles(machine: MachineEvidence): readonly string[] | null {
  return machine.supportedCycles
    ?? machine.cycles
    ?? machine.cycleOptions
    ?? machine.requiredCycleOptions
    ?? machineProfile(machine)?.cycleOptions
    ?? machineProfile(machine)?.requiredCycleOptions
    ?? machineProfile(machine)?.requiredCycles
    ?? null
}

function placementSupported(machine: MachineEvidence, placement: string): boolean {
  // A profile cannot override this device's non-HE requirement; unknown class needs confirmation.
  if ((placement === 'downy_ball' || placement === 'downy-ball') && washerClass(machine) !== 'standard') return false
  const profile = machineProfile(machine)
  if (!profile || !dispensingEvidenceKnown(profile)) return false
  if (placement === 'unknown') return false
  const release = profile.release ?? profile.releaseMode
  if ((placement === 'automatic' || placement === 'automatic_release') && release === 'unknown') return false
  if ((placement === 'manual' || placement === 'manual_release') && release === 'unknown') return false
  const placements = profile.placements ?? profile.supportedPlacements
  if (placements?.includes(placement)) return true
  if (profile.mechanisms?.includes(placement as DispensingMechanism)) return true
  if ((placement === 'direct_to_drum' || placement === 'drum') && profile.directToDrum === true) return true
  if ((placement === 'center_agitator' || placement === 'agitator') && profile.centerAgitator === true) return true
  if ((placement === 'downy_ball' || placement === 'downy-ball') && profile.downyBall === true) return true
  if ((placement === 'automatic' || placement === 'automatic_release') && (profile.automatic === true || profile.automaticRelease === true)) return true
  if ((placement === 'manual' || placement === 'manual_release') && (profile.manual === true || profile.manualRelease === true)) return true
  return (profile.compartments ?? []).some((compartment) => {
    if (typeof compartment === 'string') return compartment === placement
    return compartment.id === placement
      && compartment.release !== 'unknown'
      && compartment.evidence !== null
      && (compartment.evidence === undefined || evidenceStatus(compartment.evidence) !== 'unknown')
  })
}

function careCycle(item: Item): string {
  if (item.source.personalRoutine?.valid && item.source.personalRoutine.wash) return item.source.personalRoutine.wash.cycle
  return item.source.care?.requiredCycle ?? item.source.care?.cycle ?? 'normal'
}

function careTemperature(item: Item): number | null {
  if (item.source.personalRoutine?.valid && item.source.personalRoutine.wash) return item.source.personalRoutine.wash.maximumTemperatureC
  return recordedCareTemperature(item)
}

/** Treatment permission is never broadened by a wash-setting departure. */
function recordedCareTemperature(item: Item): number | null {
  const care = item.source.care
  return care?.maxTemperatureC ?? care?.washTemperatureC ?? null
}

/** An unknown maximum temperature washes cold. */
const coldC = 30

function stainNoted(item: Item): boolean {
  return typeof item.source.stainNote === 'string' && item.source.stainNote.trim().length > 0
}

function stainReport(item: Item): StainReport | null {
  return item.source.stainReport ?? item.source.stain ?? null
}

function canonicalStainKind(value: unknown): StainKind | null {
  if (typeof value !== 'string') return null
  if (['protein', 'blood', 'dairy', 'egg'].includes(value)) return 'protein'
  if (['tannin', 'coffee', 'tea', 'wine', 'fruit'].includes(value)) return 'tannin'
  if (['oil_grease', 'oil', 'grease'].includes(value)) return 'oil_grease'
  if (['starch_sauce', 'starch', 'sauce'].includes(value)) return 'starch_sauce'
  if (['dye_ink_transfer', 'dye', 'ink', 'transfer'].includes(value)) return 'dye_ink_transfer'
  if (['rust_mineral', 'rust', 'mineral'].includes(value)) return 'rust_mineral'
  if (value === 'combination' || value === 'unknown') return value
  return null
}

function stainKind(item: Item): StainKind | null {
  return canonicalStainKind(stainReport(item)?.kind)
}


/**
 * The earlier treatments when every one is a washed-out record the app made itself; null when any is free
 * text, unknown or missing, which still needs the person to confirm what may be mixed.
 */
function washedOutAttempts(report: StainReport): readonly WashedOutTreatment[] | null {
  const attempts = report.priorTreatmentAttempts
  if (!Array.isArray(attempts) || attempts.length === 0 || Array.isArray(report.priorTreatments) && report.priorTreatments.length > 0 || report.priorTreatments === null || report.priorTreatments === 'unknown') return null
  return attempts.every((entry) => typeof entry === 'object' && entry !== null && (entry as WashedOutTreatment).washedOut === true && typeof (entry as WashedOutTreatment).supplyId === 'string')
    ? attempts as readonly WashedOutTreatment[] : null
}

/**
 * The second-attempt chemistries for each stain kind, in the sourced order. Chlorine, ammonia and vinegar
 * are never offered after an earlier product (NMSU C-502: "Do not mix stain removers"; rinse between).
 * - protein: a longer enzyme presoak, then a rewash with an oxygen bleach safe for the fabric (Texas A&M L-5199; ACI stain guide).
 * - tannin: an oxygen-bleach soak, or an enzyme presoak for older stains (ACI coffee/tea; OxiClean soak directions).
 * - oil: a heavier detergent rub, then the hottest wash the label allows (Texas A&M L-5199); lipase only with its recorded formulation.
 * - starch or sauce: detergent worked in, then a rewash with an oxygen bleach safe for the fabric (ACI tomato sauce and chocolate).
 * - rust: a fabric rust remover again, used as its label says (Texas A&M L-5199); here only a different product.
 * - dye or ink: none. The kind does not tell dye from ink, and ink may never come out and washing can set it
 *   (Texas A&M L-5199), so a second try goes to the cleaner.
 */
const retryChemistries: Partial<Record<StainKind, readonly StainChemistry[]>> = {
  protein: ['protease', 'oxygen_bleach'],
  tannin: ['oxygen_bleach', 'protease'],
  oil_grease: ['lipase', 'surfactant'],
  starch_sauce: ['surfactant', 'oxygen_bleach'],
  rust_mineral: ['rust_remover'],
}

/**
 * How many home washes a stain gets on this fabric before a cleaner is the safer next step. No source sets a
 * number, so these are conservative defaults:
 * - cotton, linen, polyester, nylon: one more try (2), as stains often need treating more than once (Texas A&M L-5199).
 * - wool, silk and other animal fibers, rayon, and dry-clean-only: no home retry (1). Dry-clean-only goes to a
 *   professional (Texas A&M L-5199; NMSU C-502), so do fragile fabrics (DLI home stain guide); wool and silk take
 *   no bleach or enzymes (OxiClean and Persil packs), and rayon is weak when wet (thin: a rug and upholstery source).
 * - any other or unrecorded fabric: no home retry (1) until the fabric is recorded.
 */
export function stainWashLimit(material: string | null | undefined, washMethod: string | null | undefined): 1 | 2 {
  const fibers = materialFibers(material)
  return !stainCleanerFirst(material, washMethod) && fibers !== null && fibers.every((fiber) => ['cotton', 'linen', 'polyester', 'nylon'].includes(fiber)) ? 2 : 1
}

/** Whether a cleaner is the first choice for a stain that stayed: fragile or protein fibers, and dry-clean-only pieces. */
export function stainCleanerFirst(material: string | null | undefined, washMethod: string | null | undefined): boolean {
  return washMethod === 'dry_clean_only' || proteinFiber(material) || /rayon|viscose/i.test(material ?? '')
}

/** The stain chemistry a planned treatment step uses, from its product's recorded rule. */
export function treatmentChemistry(input: Pick<PlannerInput, 'supplies'>, step: Pick<TreatmentStep, 'supplyId' | 'ruleId'>): StainChemistry | undefined {
  const supply = input.supplies?.find((entry) => entry.id === step.supplyId)
  if (supply === undefined) return undefined
  const rule = supply.applicationRules?.find((entry) => entry.id === step.ruleId)
  return stainChemistry(rule?.stainChemistry) ?? supplyStainChemistry(supply)
}

function stainNeedsConfirmation(item: Item): boolean {
  const report = stainReport(item)
  if (!report || report.kind === 'unknown' || report.kind === 'combination') return report?.kind !== undefined
  if (washedOutAttempts(report) !== null) return false
  return report.priorTreatmentAttempts === undefined && report.priorTreatments === undefined
    || report.priorTreatmentAttempts === null || report.priorTreatmentAttempts === 'unknown'
    || report.priorTreatments === null || report.priorTreatments === 'unknown'
    // Recorded free text does not establish that an earlier treatment can safely be mixed.
    || Array.isArray(report.priorTreatmentAttempts) && report.priorTreatmentAttempts.length > 0
    || Array.isArray(report.priorTreatments) && report.priorTreatments.length > 0
}

function stainChemistry(value: unknown): StainChemistry | undefined {
  return value === 'protease' || value === 'lipase' || value === 'oxygen_bleach' || value === 'surfactant' || value === 'chlorine_bleach' || value === 'rust_remover'
    ? value
    : undefined
}

function supplyStainChemistry(supply: SupplyItem): StainChemistry | undefined {
  const explicit = stainChemistry(supply.stainChemistry ?? supply.chemistry)
  if (explicit) return explicit
  const ruleChemistry = supply.applicationRules?.map((rule) => stainChemistry(rule.stainChemistry)).find((value): value is StainChemistry => value !== undefined)
  if (ruleChemistry) return ruleChemistry
  return undefined
}


/**
 * Use recorded label classification, never marketing names. Generic consumables need review.
 */
function supplyBleach(supply: SupplyItem): BleachKind | 'unknown' | null {
  if (supply.bleachKind !== undefined) return supply.bleachKind === 'none' ? null : supply.bleachKind
  const explicit = stainChemistry(supply.stainChemistry ?? supply.chemistry)
    ?? supply.applicationRules?.map((rule) => stainChemistry(rule.stainChemistry)).find((value): value is StainChemistry => value !== undefined)
  if (explicit === 'oxygen_bleach') return 'oxygen'
  if (explicit === 'chlorine_bleach') return 'chlorine'
  if (['bleach', 'chemical_consumable', 'single_use_consumable', 'scent_booster'].includes(supply.kind ?? '')) return 'unknown'
  return null
}

/**
 * Whether a garment's bleach triangle forbids this kind of bleach: crossed out forbids both, two
 * lines forbid chlorine. Care that fails closed (the tag was checked and said nothing) forbids both,
 * regardless of what any one row on it happened to answer.
 */
function tagForbidsBleach(item: Item, bleach: BleachKind): boolean {
  if (failSafeCare(item)) return true
  const answer = item.source.care?.bleach
  return answer === 'none' || answer === 'non_chlorine' && bleach === 'chlorine'
}

const isDetergent = (supply: SupplyItem): boolean => supply.use === 'detergent' || supply.use === 'pods' || supply.kind === 'detergent'

/** Whether a detergent can go in this load, and the reason it cannot: the checks its step makes before dosing. */
function detergentFit(supply: SupplyItem, items: readonly Item[]): { readonly fits: boolean; readonly cause?: string } {
  if (items.some((item) => !careProductAllowed(item.source.care?.instructions, supply))) return { fits: false, cause: 'garment_product_conflict' }
  const enzyme = proteinFiberCause(supply, items)
  if (enzyme !== null) return { fits: false, cause: enzyme }
  const bleach = supplyBleach(supply)
  if (bleach === 'unknown') return { fits: false, cause: 'product_safety_needed' }
  const required = requirementCheck(supply, items.map((item) => item.source.requirements))
  if (required.status !== 'ok') return { fits: false, cause: required.status === 'conflict' ? 'profile_requirement_conflict' : 'profile_requirement_unknown' }
  if (bleach !== null && items.some((item) => tagForbidsBleach(item, bleach))) return { fits: false, cause: 'tag_forbids_bleach' }
  return { fits: true }
}

function pretreatmentRule(rule: ApplicationRule, supply: SupplyItem): boolean {
  return rule.placement === 'manual' && (rule.stainChemistry !== undefined || rule.stainKinds !== undefined || supplyStainChemistry(supply) !== undefined)
}

function isStainSupply(supply: SupplyItem): boolean {
  return supply.applicationRules?.some((rule) => pretreatmentRule(rule, supply)) === true
}

/** With labelKind, the rule's own label must name this stain kind: a retry's cross-kind chemistry needs that, not just the research order. */
function stainRule(supply: SupplyItem, item: Item, chemistry: StainChemistry, labelKind = false): ApplicationRule | null {
  const kind = stainKind(item)
  return [...(supply.applicationRules ?? [])]
    .filter((rule) => pretreatmentRule(rule, supply))
    .filter((rule) => (rule.supplyId ?? rule.productId ?? supply.id) === supply.id)
    .filter((rule) => rule.supported !== false && rule.labelBacked !== false && ruleEvidenceUsable(rule))
    .filter((rule) => stainChemistry(rule.stainChemistry ?? supplyStainChemistry(supply)) === chemistry)
    .filter(() => chemistry !== 'lipase' || supply.lipase?.status === 'present' && supply.lipase.formulation.trim().length > 0 && supply.lipase.source.trim().length > 0)
    .filter((rule) => rule.soak === undefined || !careForbidsSoaking(item.source.care) && !/wool|silk/i.test(item.source.material ?? ''))
    .filter((rule) => {
      const soak = rule.soak
      if (soak === undefined) return true
      const maximum = item.source.care?.instructions?.maximumSoakMinutes
      if (maximum !== undefined && (!Number.isFinite(maximum) || maximum < soak.minimumMinutes)) return false
      return recordedCareTemperature(item) !== null && [soak.waterLitres, soak.minimumMinutes, soak.maximumMinutes, soak.maximumTemperatureC].every(Number.isFinite)
        && soak.waterLitres > 0 && soak.minimumMinutes > 0 && soak.maximumMinutes >= soak.minimumMinutes && soak.maximumTemperatureC > 0 && soak.transfer.trim().length > 0
        && ['ml', 'g'].includes(ruleDose(rule, supply.measurement)?.unit ?? '')
    })
    .filter((rule) => rule.stainKinds === undefined ? !labelKind : kind !== null && rule.stainKinds.some((entry) => canonicalStainKind(entry) === kind))
    .filter((rule) => materialsAllow(item.source.material, rule.conditions?.materials))
    .filter((rule) => materialsAllow(item.source.material, rule.safeMaterials, rule.incompatibleMaterials))
    .sort((left, right) => ruleSpecificity(right) - ruleSpecificity(left) || left.id.localeCompare(right.id))[0] ?? null
}

function delicateMaterial(material: string | null | undefined): boolean {
  return /wool|silk|down/i.test(material ?? '')
}

/** Wool, silk and other animal fibers are protein, which protease (a common detergent enzyme) breaks down. */
function proteinFiber(material: string | null | undefined): boolean {
  return /wool|silk|cashmere|merino|angora|alpaca|mohair|camel|down/i.test(material ?? '')
}

/** A product's recorded protease: absent only on an explicit record; anything unrecorded counts as unknown. */
function proteaseRecord(supply: SupplyItem): 'present' | 'absent' | 'unknown' {
  const fact = supply.capabilities?.find((entry) => entry.kind === 'protease')
  return fact?.status === 'present' || fact?.status === 'absent' ? fact.status : 'unknown'
}

/** Why a product may not touch a protein fiber in this load, or null: protease present, or not recorded. */
function proteinFiberCause(supply: SupplyItem, items: readonly Item[]): 'protein_fiber_enzyme' | 'protein_fiber_enzyme_unknown' | null {
  if (!items.some((item) => proteinFiber(item.source.material))) return null
  const protease = proteaseRecord(supply)
  return protease === 'absent' ? null : protease === 'present' ? 'protein_fiber_enzyme' : 'protein_fiber_enzyme_unknown'
}

function careAllowsStain(item: Item, chemistry: StainChemistry, rule: ApplicationRule | null): boolean {
  const careText = careRestrictionText(item.source.care)
  const material = item.source.material ?? ''
  if (/(do not bleach|no bleach|non[- ]bleachable)/.test(careText) && (chemistry === 'oxygen_bleach' || chemistry === 'chlorine_bleach')) return false
  if (chemistry === 'oxygen_bleach' && tagForbidsBleach(item, 'oxygen') || chemistry === 'chlorine_bleach' && tagForbidsBleach(item, 'chlorine')) return false
  if (chemistry === 'chlorine_bleach' && (stainKind(item) === 'protein' || stainKind(item) === 'rust_mineral' || delicateMaterial(material))) return false
  if (stainKind(item) === 'oil_grease' && recordedCareTemperature(item) === null) return false
  if (rule?.maximumTemperatureC !== undefined && recordedCareTemperature(item) !== null && rule.maximumTemperatureC > recordedCareTemperature(item)!) return false
  if (delicateMaterial(material)) {
    if (chemistry === 'protease' && !(rule?.safeMaterials ?? rule?.conditions?.materials)?.some((entry) => entry.trim().toLowerCase() === material.trim().toLowerCase())) return false
    if (rule?.maximumPH !== undefined && rule.maximumPH > 8) return false
    if (rule?.maximumTemperatureC !== undefined && rule.maximumTemperatureC > 30) return false
  }
  return true
}

function requiredStainChemistry(kind: StainKind): StainChemistry | null {
  switch (kind) {
    case 'protein': return 'protease'
    case 'tannin': return 'oxygen_bleach'
    case 'oil_grease':
    case 'starch_sauce': return 'surfactant'
    case 'dye_ink_transfer': return 'oxygen_bleach'
    case 'rust_mineral': return 'rust_remover'
    default: return null
  }
}

function isDyeStain(item: Item): boolean {
  return stainKind(item) === 'dye_ink_transfer'
}

function needsMatchingDyeRunGroup(item: Item): boolean {
  if (item.source.dyeRun === 'bleeds') return true
  const group = colorGroup(item.source)
  return item.source.dyeRun === 'new' && (group === 'medium' || group === 'dark' || group === 'black' || group === 'saturated')
}

function careGroupingConflict(left: Item, right: Item): 'wash_alone' | 'like_colors' | null {
  const leftRule = careSeparation(left.source.care, left.source)
  const rightRule = careSeparation(right.source.care, right.source)
  if (leftRule === 'wash_alone' || rightRule === 'wash_alone') return 'wash_alone'
  if (leftRule === 'like_colors' || rightRule === 'like_colors') {
    const leftColor = colorGroup(left.source)
    const rightColor = colorGroup(right.source)
    // ponytail: exact recorded color match; use structured hue/shade facts if broader matching is needed.
    const leftName = left.source.color?.trim().toLowerCase()
    const rightName = right.source.color?.trim().toLowerCase()
    if (leftColor === 'unknown' || rightColor === 'unknown' || leftColor !== rightColor || !leftName || leftName !== rightName) return 'like_colors'
  }
  return null
}

function colorConflict(left: Item, right: Item, policy: PlannerPolicy, preferences: PlannerPreferences): boolean {
  // Recorded running dye is not cleared by a wash or by an ordinary color-mixing preference.
  if (needsMatchingDyeRunGroup(left) || needsMatchingDyeRunGroup(right)) {
    const group = left.source.dyeRunGroup
    if (typeof group !== 'string' || group.length === 0 || group !== right.source.dyeRunGroup) return true
  }
  const colorPolicy = preferences.colorPolicy ?? policy.colorPolicy ?? 'separate_first_wash'
  if (colorPolicy === 'allow') return false
  const leftColor = colorGroup(left.source)
  const rightColor = colorGroup(right.source)
  const lightAndDark = (leftColor === 'white' || leftColor === 'very_light' || leftColor === 'light') && (rightColor === 'dark' || rightColor === 'black' || rightColor === 'saturated')
    || (rightColor === 'white' || rightColor === 'very_light' || rightColor === 'light') && (leftColor === 'dark' || leftColor === 'black' || leftColor === 'saturated')
  return lightAndDark && (colorPolicy === 'separate' || firstWash(left.source) || firstWash(right.source) || left.source.dyeRun === 'unknown' || right.source.dyeRun === 'unknown')
}

/** Heavily soiled garments redeposit soil on lightly soiled ones; normal and unrecorded mix with either. */
function soilConflict(left: Item, right: Item): boolean {
  return left.soil === 'heavy' && right.soil === 'light' || left.soil === 'light' && right.soil === 'heavy'
}

/** A baby's garments and anyone else's. */
function babyConflict(left: Item, right: Item): boolean {
  return (left.source.wearerKind === 'baby') !== (right.source.wearerKind === 'baby')
}

function totalBulk(items: readonly Item[]): number {
  return items.reduce((total, item) => total + item.bulkUnits, 0)
}

/** Care that was checked and came back unusable: this garment washes fail-closed instead of waiting. */
function failSafeCare(item: Item): boolean {
  if (item.source.personalRoutine?.valid && item.source.personalRoutine.wash) return false
  return careCheckedUnknown(item.source.care)
}

/** The gentlest cycle a washer actually offers, for a garment whose care fails closed: delicate first, then permanent press, then normal, whatever the machine supports. */
function gentlestSupportedCycle(machine: MachineEvidence): string {
  const supported = machineCycles(machine)
  if (supported === null || supported.length === 0) return 'normal'
  return cycleGentleness.find((cycle) => supported.includes(cycle)) ?? supported[0]!
}

/** The cycle every confirmed-care garment already in `items` shares; null while they are all fail-closed and take whatever the group settles on. */
function requiredCycleOf(items: readonly Item[]): string | null {
  const known = items.find((item) => !failSafeCare(item))
  return known === undefined ? null : careCycle(known)
}

/** Whether `item` may share a load with `items`: a fail-closed garment takes any cycle, so it never conflicts. */
function cycleGroupable(items: readonly Item[], item: Item): boolean {
  if (failSafeCare(item)) return true
  const required = requiredCycleOf(items)
  return required === null || required === careCycle(item)
}

function loadCanAccept(load: WorkingLoad, item: Item, policy: PlannerPolicy, preferences: PlannerPreferences, separateSoil: boolean, separateBaby: boolean, packUnits: (machine: MachineEvidence) => number): boolean {
  if (load.items.length === 0) return true
  if (load.items.some((existing) => careGroupingConflict(existing, item) !== null)) return false
  if (isDyeStain(item) || load.items.some(isDyeStain)) return false
  if (!cycleGroupable(load.items, item)) return false
  if (colorConflict(load.items[0]!, item, policy, preferences) || load.items.some((existing) => colorConflict(existing, item, policy, preferences))) return false
  const mixing = preferences.heavyLightMixing ?? policy.heavyLightMixing ?? 'allow_if_cost_saving'
  if (mixing === 'avoid' && load.items.some((existing) => (existing.bulkUnits >= 2.5) !== (item.bulkUnits >= 2.5))) return false
  if (separateSoil && load.items.some((existing) => soilConflict(existing, item))) return false
  if (separateBaby && load.items.some((existing) => babyConflict(existing, item))) return false
  const items = [...load.items, item]
  const cycle = items.some(failSafeCare) ? gentlestSupportedCycle(load.machine) : careCycle(items[0]!)
  return totalBulk(items) <= careProcessCapacity(load.machine, cycle, items.map((entry) => entry.source.care?.instructions), packUnits(load.machine))
}

function careVeto(care: CareEvidence | null | undefined): CareVeto {
  const method = careMethod(care)
  if (method === 'hand' || method === 'hand_wash') return 'hand_wash'
  if (method === 'dry_clean_only' || method === 'do_not_wash') return method
  return 'restriction'
}

function gentleness(cycle: string): number {
  return (cycleGentleness as readonly string[]).indexOf(cycle)
}

function materialsAllow(material: string | null | undefined, allowed?: readonly string[], forbidden?: readonly string[]): boolean {
  if (allowed === undefined && !forbidden?.length) return true
  const value = material?.trim().toLowerCase()
  if (!value) return false
  const fibers = materialFibers(value)
  if (fibers === null) return false
  if (forbidden?.some((entry) => entry.trim().toLowerCase() === value || (materialFibers(entry) ?? []).some((fiber) => fibers.includes(fiber)))) return false
  const permitted = new Set(allowed?.flatMap((entry) => { const recorded = materialFibers(entry); return recorded?.length === 1 ? recorded : [] }))
  return allowed === undefined || allowed.some((entry) => entry.trim().toLowerCase() === value) || fibers.every((fiber) => permitted.has(fiber))
}


/**
 * Whether a product meets every wearer's requirements in a load, from the pack's recorded contents
 * only: `conflict` when a recorded fact breaks one, `unknown` when the needed fact isn't recorded.
 * A product the wearer accepted on their profile passes. `needs` names what was checked.
 */
export function requirementCheck(supply: Pick<SupplyItem, 'id' | 'fragrance' | 'dye' | 'ingredients'>, requirements: readonly (ProfileRequirements | null | undefined)[]): { readonly status: 'ok' | 'conflict' | 'unknown'; readonly needs: readonly string[] } {
  let status: 'ok' | 'conflict' | 'unknown' = 'ok'
  const needs = new Set<string>()
  const worse = (next: 'conflict' | 'unknown') => { if (status !== 'conflict') status = next }
  for (const entry of requirements) {
    if (entry === null || entry === undefined || entry.acceptedSupplyIds?.includes(supply.id) === true) continue
    if (entry.fragranceFree === true) {
      needs.add('fragrance_free')
      if (supply.fragrance === 'scented') worse('conflict')
      else if (supply.fragrance !== 'free') worse('unknown')
    }
    if (entry.dyeFree === true) {
      needs.add('dye_free')
      if (supply.dye === 'dyed') worse('conflict')
      else if (supply.dye !== 'free') worse('unknown')
    }
    const avoid = (entry.avoidIngredients ?? []).map((name) => name.trim().toLowerCase()).filter((name) => name.length > 0)
    if (avoid.length > 0) {
      needs.add('avoid_ingredients')
      const recorded = (supply.ingredients ?? []).map((name) => name.trim().toLowerCase())
      if (recorded.length === 0) worse('unknown')
      else if (recorded.some((name) => avoid.some((bad) => name.includes(bad)))) worse('conflict')
    }
  }
  return { status, needs: [...needs].sort() }
}

function supplyCompatible(supply: SupplyItem, item: Item): boolean {
  if (supply.sourceContract !== undefined && !sourceMaterialAllowed(supply.sourceContract, item.source.material)) return false
  if (supply.compatibleTextileIds && !supply.compatibleTextileIds.includes(item.id ?? item.source.id ?? item.source.textileId ?? item.source.instanceId ?? '')) return false
  if (supply.incompatibleTextileIds?.includes(item.id)) return false
  return materialsAllow(item.source.material, supply.compatibleMaterials, supply.incompatibleMaterials)
}

function machineSupportsCycle(machine: MachineEvidence, cycle: string): boolean {
  const cycles = machineCycles(machine)
  return cycles !== null && cycles.includes(cycle)
}

const holdOutWords: Record<string, string> = { line_dry: 'hang to dry', dry_flat: 'dry flat', drip_dry: 'drip dry', do_not_tumble_dry: 'do not tumble dry' }
const omissionWords: Record<string, string> = {
  insufficient_product_evidence: 'its label is not confirmed',
  no_rule: 'no confirmed dryer dose on its label fits this load',
  needs_input: 'its label needs a detail about this load that is not recorded',
  conflict: 'more than one row of its label fits this load, with different doses',
  invalid_dose: 'its label dose cannot be followed as recorded',
  garment_restriction: 'a garment in the load must not have fabric softener or dryer sheets',
  profile_requirement: 'it does not meet a wearer’s product requirements',
  profile_requirement_unknown: 'its pack is not recorded as meeting a wearer’s product requirements',
  left_out: 'it was left out this time',
}

function idList(value: JsonValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function doseExplanation(reason: DecisionReason, ids: string): string | null {
  const supply = reason.supplyId ?? 'this product'
  const machine = reason.machineId ?? 'this washer'
  const cause = reason.details.cause
  if (cause === 'label_row_needed') return `${supply}'s label has no saved line for this load; read it off the label.`
  if (cause === 'dose_input_needed') {
    const missing = reason.details.missing
    if (missing === 'soil_level') {
      const unrecorded = idList(reason.details.unrecordedTextileIds)
      return `Say how dirty ${unrecorded.length > 0 ? unrecorded.join(', ') : ids} ${unrecorded.length === 1 ? 'is' : 'are'}: ${supply}'s label doses by soil level.`
    }
    if (missing === 'washer_class') return `${supply}'s label doses HE and standard washers differently; record whether ${machine} is HE on the Household page.`
    if (missing === 'load_size') return `${machine} has no recorded capacity, so ${supply}'s load-size rows can't be chosen.`
    if (missing === 'appliance_type') return `${supply}'s label doses by washer type; record whether ${machine} is a top- or front-loader on the Household page.`
    return `${supply}'s label needs a detail about this load that is not recorded.`
  }
  if (cause === 'conflicting_dose_rules') return `More than one row of ${supply}'s label directions fits this load, with different doses; check the rows on the Household page.`
  if (cause === 'invalid_dose') {
    if (reason.details.problem === 'mark_missing') return `${supply}'s dose is measured with a cap or scoop but names no mark on it; fix the directions on the Household page.`
    if (reason.details.problem === 'count_fraction') return `${supply}'s dose counts part of a pod, sheet or tablet; fix the directions on the Household page.`
    return `${supply}'s dose names a mark that is not on its cap; fix the directions on the Household page.`
  }
  return null
}

function dryingExplanation(reason: DecisionReason, ids: string): string {
  const dryer = reason.machineId ?? 'the dryer'
  switch (reason.details.cause) {
    case 'no_dryer': return 'No dryer is recorded; this load will be hung to dry.'
    case 'dryer_evidence': return 'No dryer has confirmed evidence and heat settings; this load will be hung to dry.'
    case 'held_out':
      if (reason.details.reason === 'stain') return `Kept out of the dryer: ${ids} (a stain was noted or treated, and dryer heat would set what is left; hang it and check the stain first).`
      return `Kept out of the dryer: ${ids} (${holdOutWords[String(reason.details.method)] ?? 'care label'}).`
    case 'drying_unknown': return `${ids} have no drying instructions on record; they stay out of the dryer.`
    case 'heat_unavailable': return `${dryer} has no heat setting low enough for ${ids}.`
    case 'dryer_capacity': return `The garments that may tumble dry exceed ${dryer}'s capacity; confirm or split before drying.`
    case 'product_omitted': return `${reason.supplyId ?? 'A dryer product'} is left out of the dryer (${omissionWords[String(reason.details.omission)] ?? 'not confirmed'}).`
    case 'label_row_needed': return `${reason.supplyId ?? 'A dryer product'} has no saved line on its label for this dryer load; it stays out of the dryer until one is read.`
    default: return 'This load will be hung to dry.'
  }
}

function explanationFor(reason: DecisionReason): string {
  const ids = reason.textileIds.length > 0 ? reason.textileIds.join(', ') : 'the selected laundry'
  const cause = reason.details.cause
  switch (reason.code) {
    case 'care_prohibition': return `Excluded ${ids}: the supplied care evidence prohibits machine washing.`
    case 'care_compatibility':
      if (cause === 'label_separation') return `Separated ${ids}: the care label says ${reason.details.instruction === 'wash_alone' ? 'wash alone' : 'wash with like colors'}.`
      if (cause === 'unknown_cycle') return `Excluded ${ids} from Wash now: the care cycle ${String(reason.details.cycle)} can't be compared for gentleness.`
      if (cause === 'no_gentle_cycle') return `Excluded ${ids} from Wash now: ${reason.machineId ?? 'the washer'} has no ${String(reason.details.cycle)} cycle.`
      return `Separated ${ids}: their care-cycle requirements are not compatible.`
    case 'needs_confirmation':
      if (cause === 'unmatched_label_requirement') return `Excluded ${ids}: this required label setting is not yet matched to a supported process: ${idList(reason.details.instructions).join('; ')}.`
      if (cause === 'unknown_care') return `Excluded ${ids}: care evidence is unknown or incomplete and needs confirmation.`
      if (cause === 'insufficient_product_evidence') return 'Product label or formulation evidence is insufficient; confirm the product before use.'
      if (cause === 'product_safety_needed') return 'Read this product’s label to confirm whether it contains bleach before using it.'
      if (cause === 'protein_fiber_enzyme') return 'This product contains protease, an enzyme that breaks down wool and silk; use a wool-safe detergent for this load.'
      if (cause === 'protein_fiber_enzyme_unknown') return 'Wool and silk need a detergent without protease; record from this product’s label whether it has enzymes, or use a wool-safe detergent.'
      if (cause === 'profile_requirement_conflict') return 'This product does not meet a wearer’s product requirements.'
      if (cause === 'profile_requirement_unknown') return 'Check this product’s pack against a wearer’s product requirements before using it.'
      if (cause === 'product_material_conflict') return 'Confirm the garment material and this product’s label restrictions before using it.'
      if (cause === 'product_temperature_conflict') return 'The planned wash exceeds this product’s recorded maximum temperature.'
      if (cause === 'sanitizer_contact_time') return 'The exact pack’s rinse contact time and this washer program must be checked before using sanitizer. Leave it out if those facts are unavailable.'
      if (cause === 'unknown_stain_report') return 'The stain type or earlier treatment needs review before adding another product.'
      if (cause === 'stain_care_conflict') return 'The stain treatment conflicts with the garment’s care instructions.'
      if (cause === 'unsupported_stain_chemistry') return 'No confirmed label-backed treatment fits this stain and garment.'
      if (cause === 'stain_needs_cleaner') return 'Nothing else safe for this stain and fabric is left to try at home; a cleaner is the safest next step.'
      if (cause === 'stain_retry_unavailable') return 'None of the products on record is a safe different try for this stain; a cleaner is safest, or add a product whose label covers it.'
      if (cause === 'pretreatment_choice_needed') return 'Choose the recorded pretreatment for this stain before adding it to the recipe.'
      if (cause === 'chemical_combination_conflict') return 'The recorded label warnings prohibit combining these products, including pretreatments.'
      if (cause === 'insufficient_machine_evidence') return 'Machine capacity or model evidence is insufficient; confirm the machine before use.'
      if (cause === 'unsupported_treatment') return `Treatment for ${ids} is unsupported by a verified application rule.`
      if (cause === 'unsupported_machine_placement') return `Machine placement for ${ids} is unsupported by verified machine evidence.`
      if (cause === 'locked_door_mid_cycle') return `This washer's door locks during the cycle, so ${reason.supplyId ?? 'this product'} can't be added by hand in the rinse. Use a dispenser slot instead.`
      return doseExplanation(reason, ids) ?? `Confirmation is required before automatically processing ${ids}.`
    case 'product_restriction': return `Excluded ${ids}: the supplied product evidence is incompatible with these textiles.`
    case 'dye_first_wash_risk': return cause === 'dye_run_observation' ? `Separated ${ids}: the recorded dye-run precaution keeps these garments with matching pieces only.` : `Separated ${ids}: first-wash dye-transfer risk is higher across the selected color groups.`
    case 'capacity_limit': return `Separated ${ids}: the available machine capacity would otherwise be exceeded.`
    case 'dose_rule_selected': return `Selected a verified dose rule for ${reason.supplyId ?? 'the treatment product'}.`
    case 'machine_placement': return `Placed ${reason.supplyId ?? 'the treatment'} using the verified machine placement.`
    case 'shared_compartment_conflict': return `The selected treatments share a compartment with an unresolved compatibility conflict.`
    case 'machine_substitution': return `Substituted machine ${reason.machineId ?? 'selection'} to preserve the verified capacity or treatment mechanism.`
    case 'drying_decision': return dryingExplanation(reason, ids)
    case 'cost_calculated': return `Calculated washer cost for ${reason.details.loadCount ?? 'the planned'} load(s).`
    case 'ownership_preserved': return `Preserved textile ownership for ${ids}.`
    case 'product_left_out':
      if (cause === 'label_doesnt_say') return `${reason.supplyId ?? 'A product'} is left out of this load: its label gives no dose for it.`
      if (cause === 'needs_detergent') return `${reason.supplyId ?? 'A product'} is left out of this load: its label says to use it with detergent, and this load has none.`
      if (cause === 'cant_tell_he') return `${reason.supplyId ?? 'A product'} is left out of this load: its label doses HE and standard washers differently, and the washer's HE status is not known.`
      if (cause === 'tag_forbids_bleach') {
        const tags = [[idList(reason.details.noBleachIds), 'do not bleach'], [idList(reason.details.nonChlorineIds), 'non-chlorine bleach only']] as const
        const why = tags.filter(([textileIds]) => textileIds.length > 0).map(([textileIds, words]) => `${textileIds.join(', ')}'s tag says ${words}`)
        return `No ${reason.supplyId ?? 'bleach'}: ${why.join('; ')}.`
      }
      return `${reason.supplyId ?? 'A product'} is left out of this load for this pass.`
    case 'pin_refused': return `Could not put ${ids} in group ${String(reason.details.group)} (${String(cause)}): the move would break a hard rule, so it stays where it was.`
    case 'preference_overridden':
      if (cause === 'color_mixed') return `Light and dark garments share a load as arranged (${idList(reason.details.textileIds).join(', ')}); it washes cold.`
      if (cause === 'soil_mixed') return `Heavily and lightly soiled garments share a load as arranged (${idList(reason.details.textileIds).join(', ')}).`
      if (cause === 'baby_mixed') return `Baby clothes share a load with others as arranged (${idList(reason.details.textileIds).join(', ')}).`
      return `${ids} share a load against a sorting preference, as arranged.`
    case 'preference_applied':
      if (cause === 'baby_separation') return `Kept baby clothes in their own load (${ids}), as the household prefers.`
      if (cause === 'soil_separation') return `Kept heavily and lightly soiled garments in separate loads (${ids}); it takes no extra washer start.`
      if (cause === 'soil_mixed') return `${ids} share a load across soil levels: keeping heavily and lightly soiled garments apart would take another washer start. The load is dosed for its heaviest soil.`
      if (cause === 'care_fail_safe') return `${ids} wash cold on the gentlest cycle this washer offers, with no bleach and no dryer: the tag doesn't say.`
      return `Applied the selected laundry preference to ${ids}.`
  }
}

function explanationsFromReasons(reasons: readonly DecisionReason[]): readonly PlanExplanation[] {
  return reasons.map((reason) => ({ reasonId: reason.id, code: reason.code, text: explanationFor(reason) }))
}

function heaviestSoil(items: readonly Item[]): SoilLevel | null {
  return items.reduce<SoilLevel | null>((heaviest, item) => heavierSoil(heaviest, item.soil), null)
}

/** Heavy first and light last, so sorting by soil fills loads with like garments; ids keep the order stable. */
function soilOrder(item: Item): number {
  return item.soil === 'heavy' ? 0 : item.soil === 'light' ? 2 : 1
}

function priceFor(pricing: WasherPricing | undefined, cycle: string): number {
  if (pricing?.type === 'flat_per_start') return pricing.price
  if (pricing?.type === 'cycle_based') return pricing.prices[cycle] ?? 0
  return 0
}

/** Why a product has no dose for this load, as the reason's details. */
function blockedDoseDetails(selection: RuleSelection, load: WorkingLoad): Record<string, JsonValue> {
  switch (selection.kind) {
    case 'needs_input': return {
      cause: 'dose_input_needed',
      missing: selection.missing,
      ruleIds: [...selection.ruleIds],
      ...(selection.missing === 'soil_level' ? { unrecordedTextileIds: load.items.filter((item) => item.soil === null).map((item) => item.id).sort() } : {}),
    }
    case 'conflict': return { cause: 'conflicting_dose_rules', ruleIds: [...selection.ruleIds] }
    case 'invalid_dose': return selection.problem === 'malformed'
      ? { cause: 'unsupported_treatment', ruleId: selection.ruleId }
      : { cause: 'invalid_dose', ruleId: selection.ruleId, problem: selection.problem }
    case 'selected': return { cause: 'unsupported_treatment', ruleId: selection.rule.id }
    case 'none': return { cause: 'unsupported_treatment' }
  }
}

/** Blocking reason codes that keep a load off a washer in `planLoadOn`. */
const loadOnBlockingCodes: readonly DecisionReasonCode[] = ['needs_confirmation', 'capacity_limit', 'product_restriction']

/**
 * The load planned on one washer alone: its garments pinned together, steps moved to where that
 * washer takes them, and the dose rows for that kind of washer. Ready only when it stays one load
 * with the same cycle and temperature and nothing to confirm.
 */
export function planLoadOn(request: PlannerInput, load: LoadPlan, machineId: string): LoadOn {
  const { personalSuggestions: _personalSuggestions, ...input } = request
  const textileIds = new Set(load.textileIds)
  const textiles = (input.textiles ?? input.garments ?? []).flatMap((source, index) => {
    const id = itemId(source, index)
    return textileIds.has(id) ? [source.id === id ? source : { ...source, id }] : []
  })
  const result = plan({
    ...input,
    textiles,
    machines: (input.machines ?? []).filter((machine) => machine.id === machineId || isDryer(machine)),
    preferences: { ...input.preferences, preferredMachineId: machineId },
    loadPins: load.textileIds.map((textileId) => ({ textileId, group: 1 })),
    adaptPlacements: true,
  })
  const blocking = result.reasons.filter((reason) => loadOnBlockingCodes.includes(reason.code) && reason.textileIds.some((id) => textileIds.has(id)))
  const only = result.loads.length === 1 ? result.loads[0]! : null
  if (only !== null && only.status === 'ready' && blocking.length === 0 && only.cycle === load.cycle && only.temperatureC === load.temperatureC
    && only.textileIds.join('\n') === [...load.textileIds].sort().join('\n')) {
    return { status: 'ready', load: only }
  }
  if (result.loads.length > 1 || blocking.some((reason) => reason.code === 'capacity_limit')) return { status: 'too_full' }
  const problems = new Map<string, AlternateProblem>()
  for (const reason of blocking) {
    const cause = typeof reason.details.cause === 'string' ? reason.details.cause : reason.code
    // A problem between products (two that cannot share a slot) is named once for each of them.
    const pair = reason.supplyId === undefined && Array.isArray(reason.details.supplyIds) ? reason.details.supplyIds.filter((id): id is string => typeof id === 'string') : []
    for (const supplyId of pair.length > 0 ? pair : [reason.supplyId]) {
      problems.set(stableJson([cause, supplyId ?? null]), { cause, ...(supplyId === undefined ? {} : { supplyId }) })
    }
  }
  // A load-wide problem that a product's own problem already names adds nothing.
  const named = [...problems.values()].filter((problem) => problem.supplyId !== undefined || ![...problems.values()].some((other) => other.cause === problem.cause && other.supplyId !== undefined))
  return { status: 'blocked', problems: named.sort((left, right) => left.cause.localeCompare(right.cause) || (left.supplyId ?? '').localeCompare(right.supplyId ?? '')) }
}

/** A load on another kind of washer in its room, planned on the washer that stands for that kind. */
function loadAlternate(input: PlannerInput, load: LoadPlan, entry: RoomClass): LoadAlternate {
  const { representative } = entry
  const on = planLoadOn(input, load, representative.id)
  return {
    machineId: representative.id,
    machineIds: entry.machineIds,
    applianceType: typeof representative.applianceType === 'string' && representative.applianceType.length > 0 ? representative.applianceType : null,
    washerClass: washerClass(representative),
    capacityUnits: packingCapacity(representative),
    cycle: load.cycle,
    temperatureC: load.temperatureC,
    treatments: on.status === 'ready' ? on.load.treatments : [],
    ...(on.status !== 'ready' || on.load.labelPreparation === undefined ? {} : { labelPreparation: on.load.labelPreparation }),
    status: on.status,
    problems: on.status === 'blocked' ? on.problems : [],
  }
}

export function plan(request: PlannerInput): PlanResult {
  // Internal alternate planning receives only evidence/choices, never a comparison bound to another load.
  const { personalSuggestions: requestedPersonalSuggestions, ...input } = request
  const personal = requestedPersonalSuggestions === undefined ? undefined : canonicalPersonalPlannerInput(requestedPersonalSuggestions)
  const canonicalInput = deepFreeze(canonicalize(personal === undefined ? input : { ...input, personalSuggestions: personal }, true) as PlannerInput)
  const inputHash = sha256(stableJson(canonicalInput))
  const reasonDrafts = new Map<string, ReasonDraft>()
  const exclusions: ExclusionDraft[] = []
  const addReason = (
    code: DecisionReasonCode,
    textileIds: readonly string[],
    details: Record<string, JsonValue> = {},
    extras: Pick<DecisionReason, 'loadId' | 'supplyId' | 'machineId'> = {},
  ): string => {
    const sortedTextileIds = [...textileIds].sort()
    const key = stableJson({ code, textileIds: sortedTextileIds, details, ...extras })
    if (!reasonDrafts.has(key)) reasonDrafts.set(key, { key, code, priority: reasonPriority[code], textileIds: sortedTextileIds, details: canonicalize(details) as Record<string, JsonValue>, ...extras })
    return key
  }
  const exclude = (textileId: string, reasonKey: string): void => {
    const existing = exclusions.find((entry) => entry.textileId === textileId)
    if (existing) existing.reasonKeys.push(reasonKey)
    else exclusions.push({ textileId, reasonKeys: [reasonKey] })
  }

  const textiles = [...(input.textiles ?? input.garments ?? [])]
    .map((source, index): Item => ({ source, id: itemId(source, index), ownerId: ownerId(source), bulkUnits: bulkUnits(source), soil: soilLevelOf(source.soilLevel) }))
    .sort((left, right) => left.id.localeCompare(right.id))
  const supplies = [...(input.supplies ?? [])].sort((left, right) => left.id.localeCompare(right.id))
  const recordedMachines = [...(input.machines ?? [])].sort((left, right) => left.id.localeCompare(right.id))
  const machines = recordedMachines.filter((machine) => !isDryingMachine(machine))
  const dryers = [...new Map([...(input.dryers ?? []), ...recordedMachines.filter(isDryer)].map((dryer) => [dryer.id, dryer])).values()]
    .sort((left, right) => left.id.localeCompare(right.id))
  const policy = input.policy ?? {}
  const preferences = input.preferences ?? {}

  const usableMachines = machines.filter((machine) => machine.available !== false && machine.availability !== 'offline' && machine.availability !== 'unknown' && machineEvidenceSufficient(machine))
  if (usableMachines.length === 0) addReason('needs_confirmation', [], { cause: 'insufficient_machine_evidence' })

  // Dispensers and dryer products are never washer treatments, so they neither dose nor block a wash.
  const washerTreatment = (supply: SupplyItem): boolean => supply.kind !== 'dispenser' && !isDryerSupply(supply)
  const usableSupplies = supplies.filter(supplyEvidenceSufficient)
  const treatmentSupplies = usableSupplies.filter(washerTreatment)
  const requested = (supply: SupplyItem) => isDetergent(supply) || input.optionalSupplyIds?.includes(supply.id) === true
  const generalSupplies = treatmentSupplies.filter((supply) => requested(supply) && (!isStainSupply(supply) || supply.applicationRules?.some((rule) => !pretreatmentRule(rule, supply))))
  // A chosen treatment product without sufficient evidence must block, not silently drop out of every load,
  // unless the person left it out of this pass (or it ran out): then it is simply not used.
  const unverifiedTreatmentSupplies = supplies.filter((supply) => washerTreatment(supply) && (requested(supply) || input.pretreatmentChoices?.some((choice) => choice.supplyId === supply.id)) && !supplyEvidenceSufficient(supply) && !excludedSupply(input, supply.id))
  for (const supply of unverifiedTreatmentSupplies) addReason('needs_confirmation', [], { cause: 'insufficient_product_evidence' }, { supplyId: supply.id })
  const chosenPretreatment = treatmentSupplies.some((supply) => !excludedSupply(input, supply.id) && input.pretreatmentChoices?.some((choice) => choice.supplyId === supply.id))
  if (generalSupplies.length === 0 && !chosenPretreatment && unverifiedTreatmentSupplies.length === 0) addReason('needs_confirmation', [], { cause: 'insufficient_product_evidence' })

  const rush = input.mode === 'rush'
  // Baby clothes wash on their own unless the household switched it off; Wash now sets it aside, with a caution.
  const babyRule = preferences.babySeparate !== false
  const separateBaby = babyRule && !rush

  // Hard care vetoes hold in both modes, and no pin moves a garment past one.
  const vetoes = new Map<string, PinRefusalCause>()
  const eligibleItems: Item[] = []
  for (const item of textiles) {
    const routine = item.source.personalRoutine
    const wash = routine?.valid ? routine.wash : undefined
    const unmatchedInstructions = [...careProcessRequirements(item.source.care?.instructions, 'washing').unresolved, ...firstWashSeparation(item.source.care, item.source).unresolved]
    if (routine !== undefined && (!routine.valid || wash !== undefined && (!Number.isFinite(wash.maximumTemperatureC) || wash.maximumTemperatureC < 1 || wash.maximumTemperatureC > 95 || !['normal', 'permanent_press', 'delicate'].includes(wash.cycle)))) {
      vetoes.set(item.id, 'care_unknown')
      exclude(item.id, addReason('needs_confirmation', [item.id], { cause: 'routine_review_required' }))
    } else if (preOwnedHandWash(item.source.preOwned) && wash === undefined && !careProhibited(item.source.care)) {
      // A vintage, thin or damaged pre-owned piece never gets the default cycle: hand wash or a cleaner.
      vetoes.set(item.id, 'hand_wash')
      exclude(item.id, addReason('care_prohibition', [item.id], { cause: 'pre_owned_fragile', method: 'hand_wash' }))
    } else if (wash?.method === 'hand_wash' || wash === undefined && careProhibited(item.source.care)) {
      const method = careVeto(item.source.care)
      vetoes.set(item.id, wash?.method === 'hand_wash' ? 'hand_wash' : method)
      exclude(item.id, addReason('care_prohibition', [item.id], { cause: wash === undefined ? 'care_label_prohibition' : 'personal_hand_wash', method: wash?.method === 'hand_wash' ? 'hand_wash' : method }))
    } else if (materialCareProblem(item.source.material, item.source.care) !== null || materialCareProblem(item.source.material, { washMethod: wash?.method, cycle: wash?.cycle, maxTemperatureC: wash?.maximumTemperatureC }) !== null) {
      vetoes.set(item.id, 'care_unknown')
      exclude(item.id, addReason('needs_confirmation', [item.id], { cause: 'unknown_care' }))
    } else if (careUnknown(item.source.care) && !(wash?.method === 'machine' && routine?.missingLabelAccepted)) {
      vetoes.set(item.id, 'care_unknown')
      exclude(item.id, addReason('needs_confirmation', [item.id], { cause: 'unknown_care' }))
    } else if (unmatchedInstructions.length > 0) {
      vetoes.set(item.id, 'care_unknown')
      exclude(item.id, addReason('needs_confirmation', [item.id], { cause: 'unmatched_label_requirement', instructions: [...new Set(unmatchedInstructions)] }))
    } else {
      eligibleItems.push(item)
      if (wash !== undefined) addReason('preference_applied', [item.id], { cause: 'personal_routine', revision: routine!.revision, washMethod: wash.method, cycle: wash.cycle, maximumTemperatureC: wash.maximumTemperatureC })
    }
  }

  const preferredMachineId = preferences.preferredMachineId ?? input.selectedMachineId
  let baseMachine = usableMachines.find((machine) => machine.id === preferredMachineId) ?? usableMachines[0] ?? null
  if (preferredMachineId && baseMachine?.id !== preferredMachineId && usableMachines.length > 0) {
    addReason('machine_substitution', [], { cause: 'preferred_machine_unavailable', requestedMachineId: preferredMachineId }, { machineId: baseMachine.id })
  }

  // A shared room with more than one kind of washer packs to its smallest kind, so any load fits whichever washer is free.
  const room = baseMachine === null ? [] : roomClasses(usableMachines, baseMachine)
  const roomLimit = room.length >= 2 ? Math.min(...room.map((entry) => packingCapacity(entry.representative))) : undefined
  const packUnits = (machine: MachineEvidence): number => machine.id === baseMachine?.id && roomLimit !== undefined ? Math.min(packingCapacity(machine), roomLimit) : packingCapacity(machine)

  let placed: { readonly item: Item; readonly machine: MachineEvidence }[] = []
  const activeGeneralSupplies = generalSupplies.filter((supply) => !excludedSupply(input, supply.id))
  for (const item of eligibleItems) {
    const compatibleSupplies = activeGeneralSupplies.filter((supply) => supplyCompatible(supply, item) && (!item.source.compatibleSupplyIds || item.source.compatibleSupplyIds.includes(supply.id)))
    // Each restriction names the active products it is about, so the conflict can sit under the product that caused it.
    if (compatibleSupplies.length !== activeGeneralSupplies.length) {
      const supplyIds = activeGeneralSupplies.filter((supply) => !compatibleSupplies.includes(supply)).map((supply) => supply.id)
      exclude(item.id, addReason('product_restriction', [item.id], { cause: 'no_compatible_supply', supplyIds }))
      continue
    }
    const conflicting = compatibleSupplies.filter((supply) => item.source.incompatibleSupplyIds?.includes(supply.id) === true).map((supply) => supply.id)
    if (conflicting.length > 0) {
      exclude(item.id, addReason('product_restriction', [item.id], { cause: 'garment_product_conflict', supplyIds: conflicting }))
      continue
    }
    // Wool and silk never meet protease, or a product not known to be free of it: the piece waits for a wool-safe
    // detergent while the rest of the load goes ahead. It is held only when every chosen detergent fails.
    const detergents = activeGeneralSupplies.filter(isDetergent)
    const enzymeCauses = detergents.map((supply) => proteinFiberCause(supply, [item]))
    if (detergents.length > 0 && enzymeCauses.every((cause) => cause !== null)) {
      const cause = enzymeCauses.includes('protein_fiber_enzyme') ? 'protein_fiber_enzyme' : 'protein_fiber_enzyme_unknown'
      const supplyIds = detergents.filter((_, index) => enzymeCauses[index] === cause).map((supply) => supply.id)
      exclude(item.id, addReason('product_restriction', [item.id], { cause, supplyIds }))
      continue
    }
    if (!baseMachine) continue
    const fitsProcess = (candidate: MachineEvidence) => {
      const cycle = failSafeCare(item) ? gentlestSupportedCycle(candidate) : careCycle(item)
      return washProcessUnmatched(item.source.care?.instructions, candidate, cycle).length === 0
        && item.bulkUnits <= careProcessCapacity(candidate, cycle, [item.source.care?.instructions], packingCapacity(candidate))
    }
    const itemMachine = fitsProcess(baseMachine) ? baseMachine : usableMachines.filter(fitsProcess).sort((left, right) => packingCapacity(left) - packingCapacity(right) || left.id.localeCompare(right.id))[0]
    if (!itemMachine) {
      const process = careProcessRequirements(item.source.care?.instructions, 'washing').requirements.length > 0 || careProcessRequirements(item.source.care?.instructions, 'drying').requirements.some((entry) => entry.kind === 'drip_dry')
      exclude(item.id, addReason(process ? 'needs_confirmation' : 'capacity_limit', [item.id], { cause: process ? 'unmatched_label_requirement' : 'textile_exceeds_all_machine_capacity', instructions: [...(item.source.care?.instructions?.washing ?? []), ...(item.source.care?.instructions?.drying ?? [])] }))
      continue
    }
    if (itemMachine.id !== baseMachine.id) addReason('machine_substitution', [item.id], { cause: 'capacity_fit' }, { machineId: itemMachine.id })
    placed.push({ item, machine: itemMachine })
  }

  // Wash now: one gentle cycle for everything. A cycle with no known gentleness, or one the washer lacks, keeps its garments out.
  // A fail-closed garment has no preference of its own; it takes whatever the rest of the pile settles on, or the washer's gentlest when the whole pile is fail-closed.
  let rushCycle: string | null = null
  if (rush) {
    for (const { item } of placed.filter((entry) => !failSafeCare(entry.item) && gentleness(careCycle(entry.item)) === -1)) {
      exclude(item.id, addReason('care_compatibility', [item.id], { cause: 'unknown_cycle', cycle: careCycle(item) }))
    }
    placed = placed.filter((entry) => failSafeCare(entry.item) || gentleness(careCycle(entry.item)) !== -1)
    while (placed.length > 0 && baseMachine !== null) {
      const known = placed.filter((entry) => !failSafeCare(entry.item))
      const cycle = known.length > 0
        ? known.map((entry) => careCycle(entry.item)).sort((left, right) => gentleness(left) - gentleness(right))[0]!
        : gentlestSupportedCycle(baseMachine)
      if (machineSupportsCycle(baseMachine, cycle)) {
        rushCycle = cycle
        break
      }
      const needing = known.length > 0 ? known.filter((entry) => careCycle(entry.item) === cycle).map((entry) => entry.item.id) : placed.map((entry) => entry.item.id)
      if (needing.length === 0) break
      const key = addReason('care_compatibility', needing, { cause: 'no_gentle_cycle', cycle }, { machineId: baseMachine.id })
      needing.forEach((textileId) => exclude(textileId, key))
      placed = placed.filter((entry) => !needing.includes(entry.item.id))
    }
  }
  // Every Wash now load washes at the coolest maximum among all its garments; an unknown maximum counts as cold.
  const rushTemperatureC = rush ? Math.min(...placed.map(({ item }) => careTemperature(item) ?? coldC)) : null
  if (!rush) placed.sort((left, right) => soilOrder(left.item) - soilOrder(right.item))

  const newLoad = (loads: WorkingLoad[], machine: MachineEvidence, items: Item[] = [], pinned = false): WorkingLoad => {
    const created: WorkingLoad = { id: `load-${String(loads.length + 1).padStart(3, '0')}`, items, machine, treatments: [], status: 'ready', drying: null, pinned, coldOnly: false }
    loads.push(created)
    return created
  }

  // The person's pins: each garment joins the last of its groups that the hard rules allow, so a refused move stays where it was.
  const pins = rush ? [] : input.loadPins ?? []
  for (const pin of pins) {
    const veto = vetoes.get(pin.textileId)
    if (veto !== undefined) addReason('pin_refused', [pin.textileId], { cause: veto, group: pin.group })
  }
  const placedById = new Map(placed.map((entry) => [entry.item.id, entry]))
  const pinEntries = new Map<string, { readonly group: number; readonly index: number }[]>()
  pins.forEach((pin, index) => {
    if (placedById.has(pin.textileId)) pinEntries.set(pin.textileId, [...(pinEntries.get(pin.textileId) ?? []), { group: pin.group, index }])
  })
  const pinOrder = [...pinEntries.entries()]
    .sort(([, left], [, right]) => Number(left.length > 1) - Number(right.length > 1) || left.at(-1)!.index - right.at(-1)!.index)
  const groups = new Map<number, { readonly machine: MachineEvidence; readonly items: Item[] }>()
  const pinnedIds = new Set<string>()
  const joinGroup = (item: Item, machine: MachineEvidence, groupNumber: number): Record<string, JsonValue> | null => {
    const group = groups.get(groupNumber)
    if (group === undefined) {
      groups.set(groupNumber, { machine, items: [item] })
      return null
    }
    const instruction = group.items.map((existing) => careGroupingConflict(existing, item)).find((rule) => rule !== null)
    if (instruction !== undefined) return { cause: 'restriction', instruction, group: groupNumber }
    if (!cycleGroupable(group.items, item)) {
      const loadCycle = requiredCycleOf(group.items) ?? careCycle(item)
      return { cause: 'care_cycle', group: groupNumber, loadCycle, loadTemperatureC: Math.min(...group.items.map((entry) => careTemperature(entry) ?? coldC)) }
    }
    const combined = [...group.items, item]
    const cycle = combined.some(failSafeCare) ? gentlestSupportedCycle(group.machine) : careCycle(combined[0]!)
    if (totalBulk(combined) > careProcessCapacity(group.machine, cycle, combined.map((entry) => entry.source.care?.instructions), packUnits(group.machine))) return { cause: 'capacity', group: groupNumber }
    group.items.push(item)
    return null
  }
  for (const [textileId, entries] of pinOrder) {
    const { item, machine } = placedById.get(textileId)!
    for (const entry of [...entries].reverse()) {
      const refusal = joinGroup(item, machine, entry.group)
      if (refusal === null) {
        pinnedIds.add(textileId)
        break
      }
      addReason('pin_refused', [textileId], refusal)
    }
  }
  const pinnedGroups = [...groups.entries()].sort(([left], [right]) => left - right).map(([, group]) => group)

  type ReasonCall = Parameters<typeof addReason>
  const mixing = preferences.heavyLightMixing ?? policy.heavyLightMixing ?? 'allow_if_cost_saving'
  const formLoads = (separateSoil: boolean): { readonly loads: WorkingLoad[]; readonly reasons: ReasonCall[] } => {
    const loads: WorkingLoad[] = []
    const reasons: ReasonCall[] = []
    for (const group of pinnedGroups) newLoad(loads, group.machine, [...group.items], true)
    for (const { item, machine: itemMachine } of placed.filter((entry) => !pinnedIds.has(entry.item.id))) {
      let load = loads.find((candidate) => candidate.machine.id === itemMachine.id && loadCanAccept(candidate, item, policy, preferences, separateSoil, separateBaby, packUnits))
      if (!load) {
        const capacityBlockedLoad = loads.find((candidate) => candidate.machine.id === itemMachine.id
          && candidate.items.length > 0
          && candidate.items.every((existing) => careGroupingConflict(existing, item) === null)
          && cycleGroupable(candidate.items, item)
          && !colorConflict(candidate.items[0]!, item, policy, preferences)
          && candidate.items.every((existing) => !colorConflict(existing, item, policy, preferences))
          && mixing !== 'avoid'
          && !(separateSoil && candidate.items.some((existing) => soilConflict(existing, item)))
          && !(separateBaby && candidate.items.some((existing) => babyConflict(existing, item)))
          && totalBulk(candidate.items) + item.bulkUnits > packUnits(candidate.machine))
        if (capacityBlockedLoad) {
          reasons.push(['capacity_limit', [item.id], { cause: 'load_capacity' }, { loadId: capacityBlockedLoad.id, machineId: capacityBlockedLoad.machine.id }])
        }
        const created = newLoad(loads, itemMachine)
        load = created
        const others = loads.filter((candidate) => candidate !== created)
        const instruction = others.flatMap((candidate) => candidate.items.map((existing) => careGroupingConflict(existing, item))).find((rule) => rule !== null)
        if (instruction !== undefined) reasons.push(['care_compatibility', [item.id], { cause: 'label_separation', instruction }, { loadId: created.id }])
        if (others.some((candidate) => candidate.items.some((existing) => colorConflict(existing, item, policy, preferences)))) {
          const observedRun = others.some((candidate) => candidate.items.some((existing) => colorConflict(existing, item, policy, preferences) && (needsMatchingDyeRunGroup(existing) || needsMatchingDyeRunGroup(item))))
          reasons.push(['dye_first_wash_risk', [item.id], { cause: observedRun ? 'dye_run_observation' : 'color_separation' }, { loadId: created.id }])
        }
        if ((isDyeStain(item) || others.some((candidate) => candidate.items.some(isDyeStain))) && others.some((candidate) => candidate.items.length > 0)) {
          reasons.push(['dye_first_wash_risk', [item.id], { cause: 'stain_isolation' }, { loadId: created.id }])
        }
        if (mixing === 'avoid' && others.some((candidate) => candidate.items.some((existing) => (existing.bulkUnits >= 2.5) !== (item.bulkUnits >= 2.5)))) {
          reasons.push(['preference_applied', [item.id], { cause: 'heavy_light_mixing_avoidance' }, { loadId: created.id }])
        }
        if (others.some((candidate) => !cycleGroupable(candidate.items, item))) {
          reasons.push(['care_compatibility', [item.id], { cause: 'cycle_separation' }, { loadId: created.id }])
        }
        if (separateSoil && others.some((candidate) => candidate.items.some((existing) => soilConflict(existing, item)))) {
          reasons.push(['preference_applied', [item.id], { cause: 'soil_separation' }, { loadId: created.id }])
        }
        // Started only because baby clothes wash on their own: another load would have taken it otherwise.
        if (separateBaby && others.some((candidate) => candidate.machine.id === itemMachine.id && loadCanAccept(candidate, item, policy, preferences, separateSoil, false, packUnits))) {
          reasons.push(['preference_applied', [item.id], { cause: 'baby_separation' }, { loadId: created.id }])
        }
      }
      load.items.push(item)
    }
    return { loads, reasons }
  }

  // Wash now relaxes soft preferences, while recorded wash-alone/like-color instructions still apply.
  const formRushLoads = (): WorkingLoad[] => {
    const loads: WorkingLoad[] = []
    for (const { item, machine: itemMachine } of placed) {
      const shareable = loads.filter((candidate) => candidate.machine.id === itemMachine.id && !isDyeStain(item) && !candidate.items.some(isDyeStain)
        && candidate.items.every((existing) => careGroupingConflict(existing, item) === null))
      let load = shareable.find((candidate) => {
        const items = [...candidate.items, item]
        return totalBulk(items) <= careProcessCapacity(candidate.machine, rushCycle ?? gentlestSupportedCycle(candidate.machine), items.map((entry) => entry.source.care?.instructions), packUnits(candidate.machine))
      })
      if (!load) {
        if (shareable.length > 0) addReason('capacity_limit', [item.id], { cause: 'load_capacity' }, { loadId: shareable.at(-1)!.id, machineId: itemMachine.id })
        load = newLoad(loads, itemMachine)
        const instruction = loads.filter((candidate) => candidate !== load).flatMap((candidate) => candidate.items.map((existing) => careGroupingConflict(existing, item))).find((rule) => rule !== null)
        if (instruction !== undefined) addReason('care_compatibility', [item.id], { cause: 'label_separation', instruction }, { loadId: load.id })
        if (loads.some((candidate) => candidate !== load && candidate.items.length > 0) && (isDyeStain(item) || loads.some((candidate) => candidate.items.some(isDyeStain)))) {
          addReason('dye_first_wash_risk', [item.id], { cause: 'stain_isolation' }, { loadId: load.id })
        }
      }
      load.items.push(item)
    }
    return loads
  }

  // Soft rules set aside by the person's pins or by Wash now: each mix is a caution, and a colour mix washes cold.
  const cautionSoftRules = (load: WorkingLoad, items: readonly Item[]): void => {
    const involved = (conflict: (left: Item, right: Item) => boolean): string[] => [...new Set(items.flatMap((left, index) => items.slice(index + 1).flatMap((right) => conflict(left, right) ? [left.id, right.id] : [])))].sort()
    const mixes: readonly (readonly [string, readonly string[]])[] = [
      ['color_mixed', involved((left, right) => colorConflict(left, right, policy, preferences))],
      ['soil_mixed', involved(soilConflict)],
      ['baby_mixed', babyRule ? involved(babyConflict) : []],
    ]
    for (const [cause, textileIds] of mixes) {
      if (textileIds.length > 0) addReason('preference_overridden', load.items.map((item) => item.id), { cause, textileIds: [...textileIds] }, { loadId: load.id })
    }
    load.coldOnly = mixes[0]![1].length > 0
  }

  let workingLoads: WorkingLoad[]
  if (rush) {
    workingLoads = formRushLoads()
    for (const load of workingLoads) cautionSoftRules(load, load.items)
  } else {
    // Heavily and lightly soiled garments go in separate loads when that takes no extra washer start.
    const mixedSoil = formLoads(false)
    const soilsDiffer = placed.some(({ item }) => item.soil === 'heavy') && placed.some(({ item }) => item.soil === 'light')
    const separatedSoil = soilsDiffer ? formLoads(true) : null
    const formed = separatedSoil !== null && separatedSoil.loads.length <= mixedSoil.loads.length ? separatedSoil : mixedSoil
    for (const call of formed.reasons) addReason(...call)
    workingLoads = formed.loads
    if (soilsDiffer && formed === mixedSoil) {
      // Only garments the planner placed; a pinned mix is the person's, with its own caution.
      const planned = (load: WorkingLoad): boolean => load.items.some((item) => !pinnedIds.has(item.id) && load.items.some((other) => soilConflict(item, other)))
      for (const load of workingLoads.filter(planned)) {
        addReason('preference_applied', load.items.map((item) => item.id), { cause: 'soil_mixed' }, { loadId: load.id })
      }
    }
    for (const load of workingLoads.filter((candidate) => candidate.pinned)) cautionSoftRules(load, load.items.filter((item) => pinnedIds.has(item.id)))
  }
  // A load with any fail-closed garment runs at the gentlest cycle its washer offers: always at least as gentle as any recorded cycle already in the load.
  const loadCycle = (load: WorkingLoad): string => rushCycle ?? (load.items.some(failSafeCare) ? gentlestSupportedCycle(load.machine) : careCycle(load.items[0]!))
  const loadTemperatureC = (load: WorkingLoad): number => Math.min(rushTemperatureC ?? Math.min(...load.items.map((item) => careTemperature(item) ?? coldC)), load.coldOnly ? coldC : Infinity)

  for (const load of workingLoads) {
    const failSafeIds = load.items.filter(failSafeCare).map((item) => item.id)
    if (failSafeIds.length > 0) addReason('preference_applied', failSafeIds, { cause: 'care_fail_safe' }, { loadId: load.id })
  }

  const doseContext = (load: WorkingLoad, machine: MachineEvidence): DoseContext => ({
    // The size is read off the drum at the machine, never estimated from the garments.
    bulkUnits: null,
    loadSize: null,
    soilLevel: heaviestSoil(load.items),
    unrecordedSoil: load.items.some((item) => item.soil === null),
    applianceType: typeof machine.applianceType === 'string' && machine.applianceType.length > 0 ? machine.applianceType : null,
    machineClasses: machineClasses(machine),
    washerClassKnown: washerClass(machine) !== null,
    cycles: new Set([loadCycle(load)]),
    materials: new Set(load.items.map((item) => item.source.material).filter((material): material is string => typeof material === 'string')),
    odorLevel: typeof input.odorLevel === 'string' ? input.odorLevel : null,
    waterCondition: typeof input.waterCondition === 'string' ? input.waterCondition : null,
    freshStain: load.items.some((item) => stainReport(item) !== null || stainNoted(item)),
  })

  for (const load of workingLoads) {
    let machine = load.machine
    const cycle = loadCycle(load)
    if (!machineSupportsCycle(machine, cycle)) {
      const alternative = usableMachines.find((candidate) => candidate.id !== machine.id && machineSupportsCycle(candidate, cycle) && packingCapacity(candidate) >= load.items.reduce((total, item) => total + item.bulkUnits, 0))
      if (alternative) {
        machine = alternative
        load.machine = alternative
        addReason('machine_substitution', load.items.map((item) => item.id), { cause: 'cycle_support' }, { loadId: load.id, machineId: alternative.id })
      } else {
        const key = addReason('needs_confirmation', load.items.map((item) => item.id), { cause: 'unsupported_machine_cycle' }, { loadId: load.id, machineId: machine.id })
        load.status = 'needs_confirmation'
        load.items.forEach((item) => exclude(item.id, key))
      }
    }

    // The rule each product's step follows, for the combination checks below.
    const chosenRules = new Map<string, ApplicationRule>()
    const stainRules = new Map<string, ApplicationRule>()
    // Steps that stand in for a dose the label does not give; they have no placement to check.
    const placeholders = new Set<TreatmentStep>()
    // One detergent per load: the chosen one when it fits, else the first that does, else the first left in.
    const detergentOptions = generalSupplies
      .filter((supply) => isDetergent(supply) && !excludedSupply(input, supply.id))
      .sort((left, right) => Number(right.id === input.detergentId) - Number(left.id === input.detergentId) || left.id.localeCompare(right.id))
      .map((supply) => ({ supplyId: supply.id, ...detergentFit(supply, load.items) }))
    const chosenDetergentId = (detergentOptions.find((option) => option.fits) ?? detergentOptions[0])?.supplyId ?? null
    if (detergentOptions.length > 0) load.detergent = { chosenId: chosenDetergentId, options: detergentOptions.map(({ supplyId, fits, cause }) => ({ supplyId, fits, ...(cause === undefined ? {} : { cause }) })) }
    for (const supply of generalSupplies) {
      const itemIds = load.items.map((item) => item.id)
      const onLoad = { loadId: load.id, supplyId: supply.id, machineId: machine.id }
      // Left out for this pass: no step, and the garments still wash.
      const leaveOut = (details: Record<string, JsonValue>): void => {
        addReason('product_left_out', itemIds, details, onLoad)
      }
      const block = (details: Record<string, JsonValue>, rule?: ApplicationRule, dose?: Dose): void => {
        const key = addReason('needs_confirmation', itemIds, details, onLoad)
        load.status = 'needs_confirmation'
        const step: TreatmentStep = { supplyId: supply.id, dose: dose ?? { amount: 0, unit: 'unknown' }, measurementCue: rule?.measurementCue ?? null, stage: rule?.stage ?? 'wash', placement: rule?.placement ?? 'unknown', timing: rule?.timing ?? null, rationale: 'A dose read from the product label is required before automatic treatment.', source: supply.labelEvidence?.source ?? supply.label?.source ?? 'verified-product-label', confirmation: 'needs_confirmation' }
        if (rule?.placement === undefined) placeholders.add(step)
        load.treatments.push(step)
        load.items.forEach((item) => exclude(item.id, key))
      }
      if (excludedSupply(input, supply.id)) {
        leaveOut({ cause: 'left_out' })
        continue
      }
      // Another detergent is this load's: no step and no reason.
      if (isDetergent(supply) && supply.id !== chosenDetergentId) continue
      // Scent beads add scent only; their label says to use them with detergent.
      if (supply.use === 'scent_booster' && chosenDetergentId === null) {
        leaveOut({ cause: 'needs_detergent' })
        continue
      }
      if (load.items.some((item) => !careProductAllowed(item.source.care?.instructions, supply))) {
        leaveOut({ cause: 'garment_product_conflict' })
        if (isDetergent(supply)) block({ cause: 'garment_product_conflict' })
        continue
      }
      // Protease on wool or silk is never guessed safe: the detergent blocks the load, an extra stays out.
      const enzyme = proteinFiberCause(supply, load.items)
      if (enzyme !== null) {
        leaveOut({ cause: enzyme })
        if (isDetergent(supply)) block({ cause: enzyme })
        continue
      }
      // A garment whose bleach triangle forbids this bleach keeps it out of the garment's whole load.
      const bleach = supplyBleach(supply)
      if (bleach === 'unknown') {
        block({ cause: 'product_safety_needed' })
        continue
      }
      // A wearer's product requirements: no override; a conflict or an unknown fact blocks this product.
      const required = requirementCheck(supply, load.items.map((item) => item.source.requirements))
      if (required.status !== 'ok') {
        block({ cause: required.status === 'conflict' ? 'profile_requirement_conflict' : 'profile_requirement_unknown', needs: [...required.needs] })
        continue
      }
      const forbidding = bleach === null ? [] : load.items.filter((item) => tagForbidsBleach(item, bleach))
      if (bleach !== null && forbidding.length > 0) {
        const tagged = (answer: BleachAnswer) => forbidding.filter((item) => item.source.care?.bleach === answer).map((item) => item.id).sort()
        leaveOut({ cause: 'tag_forbids_bleach', bleach, noBleachIds: tagged('none'), nonChlorineIds: tagged('non_chlorine') })
        continue
      }
      const rules = rulesForSupply(supply, input).filter((rule) => !pretreatmentRule(rule, supply))
      const contract = supply.sourceContract
      const fingerprint = contract === undefined ? null : productLoadFingerprint(load.items.map((item) => item.source))
      const productCheck = input.productLoadConfirmations?.find((check) => check.supplyId === supply.id && check.sourceDigest === contract?.digest && check.loadFingerprint === fingerprint)
      const washContext = contract?.requireOrdinaryWashRoute ? { ordinaryWashRouteRequired: true, washContextFingerprint: productWashContextFingerprint(machine, cycle, loadTemperatureC(load)) } : {}
      if (contract !== undefined) {
        if (load.items.some((item) => !sourceMaterialAllowed(contract, item.source.material))) {
          block({ cause: 'product_material_conflict' })
          continue
        }
        if (contract.requireColorfastness && productCheck?.colorfastnessChecked !== true || contract.sourceLoadCategories !== undefined && !contract.sourceLoadCategories.includes(productCheck?.sourceLoadCategory as import('./product-contract.ts').SourceLoadCategory) || contract.requireOrdinaryWashRoute && (productCheck?.ordinaryWashRouteChecked !== true || productCheck.washContextFingerprint !== washContext.washContextFingerprint)) {
          block({ cause: 'product_load_confirmation', sourceDigest: contract.digest, loadFingerprint: fingerprint!, colorfastnessRequired: contract.requireColorfastness === true, sourceLoadCategories: [...(contract.sourceLoadCategories ?? [])], ordinaryWashRouteRequired: contract.requireOrdinaryWashRoute === true, washContextFingerprint: washContext.washContextFingerprint ?? null })
          const last = load.treatments.length - 1
          load.treatments[last] = { ...load.treatments[last]!, productRequirement: { sourceDigest: contract.digest, loadFingerprint: fingerprint!, colorfastnessRequired: contract.requireColorfastness === true, sourceLoadCategories: [...(contract.sourceLoadCategories ?? [])], ...washContext } }
          continue
        }
      }
      const ctx = { ...doseContext(load, machine), ...(productCheck?.sourceLoadCategory === undefined ? {} : { sourceLoadCategory: productCheck.sourceLoadCategory }) }
      const sourceRules = rules.filter((rule) => rule.conditions?.sourceLoadCategories === undefined || productCheck?.sourceLoadCategory !== undefined && rule.conditions.sourceLoadCategories.includes(productCheck.sourceLoadCategory))
      const sized = doseBySize(sourceRules, ctx, supply.measurement)
      const context = { soilLevel: sized.soilLevel, washerClass: washerClass(machine) }
      const doseDetails = { soilLevel: context.soilLevel, washerClass: context.washerClass }

      // Where and when the product goes, and its dose: read now, or chosen at the machine.
      let direction: Pick<ApplicationRule, 'placement' | 'stage' | 'timing' | 'measurementCue'>
      let dose: Dose
      let chosen: Pick<TreatmentStep, 'ruleId' | 'basis' | 'marks' | 'equivalent' | 'atMachine' | 'calculatedDose'>
      const calculated = (selected: Dose): { calculatedDose?: CalculatedDose } => {
        const result = calculatedDose(selected, sourceRules, ctx, supply)
        return result.kind === 'calculated' ? { calculatedDose: { dose: result.dose, adjustment: result.adjustment } } : {}
      }
      let rule: ApplicationRule | null = null
      if (sized.kind === 'needs_input') {
        const heUnreadable = sized.selection.kind === 'needs_input' && sized.selection.missing === 'washer_class' && dismissedAnswer(input, 'washer_he', machine.id, context) === 'cant_tell'
        if (heUnreadable) leaveOut({ cause: 'cant_tell_he' })
        else block({ ...blockedDoseDetails(sized.selection, load), ...doseDetails })
        continue
      } else if (sized.kind === 'conflict' || sized.kind === 'invalid_dose') {
        const { selection } = sized
        block({ ...blockedDoseDetails(selection, load), ...doseDetails }, selection.kind === 'invalid_dose' ? rules.find((entry) => entry.id === selection.ruleId) : undefined)
        continue
      } else if (sized.kind === 'none') {
        const answer = dismissedAnswer(input, 'label_row', supply.id, context)
        if (answer === 'label_doesnt_say') {
          leaveOut({ cause: 'label_doesnt_say', ...doseDetails })
          continue
        }
        if (answer !== 'depends_on_size') {
          block({ cause: 'label_row_needed', stage: 'washer', ...doseDetails })
          continue
        }
        // The person said the label goes by how full the drum is, so the row is asked at the machine.
        const defaults = supply.defaults ?? rules.find((entry) => entry.placement !== undefined)
        if (defaults?.placement === undefined) {
          block({ cause: 'unsupported_treatment', ...doseDetails })
          continue
        }
        direction = { placement: defaults.placement, stage: defaults.stage, timing: defaults.timing }
        dose = atMachineDose
        chosen = { atMachine: { machine: 'washer', context: doseContextSnapshot(ctx), candidates: [] } }
      } else if (sized.kind === 'resolved') {
        const { selection } = sized
        if (!selection.rule.placement) {
          block({ ...blockedDoseDetails(selection, load), ...doseDetails }, selection.rule, selection.dose)
          continue
        }
        rule = selection.rule
        direction = rule
        dose = selection.dose
        chosen = {
          ruleId: rule.id,
          basis: selection.basis,
          ...(markDose(dose) ? { marks: markLabels(supply.measurement), equivalent: doseEquivalent(dose, supply.measurement) } : {}),
          ...calculated(dose),
        }
      } else {
        if (!sized.rule?.placement) {
          block({ cause: 'unsupported_treatment', ...doseDetails }, sized.rule ?? undefined)
          continue
        }
        // The dose depends on how full the drum is: the person says so at the machine, and the load is ready now.
        rule = sized.rule
        direction = rule
        dose = atMachineDose
        chosen = { atMachine: { machine: 'washer', context: doseContextSnapshot(ctx), candidates: sized.candidates.map((candidate) => ({ ...candidate, ...calculated(candidate.dose) })) } }
      }
      const applicableRules = chosen.atMachine === undefined ? (rule === null ? [] : [rule]) : rules.filter((entry) => entry.id === rule?.id || chosen.atMachine!.candidates.some((candidate) => candidate.ruleId === entry.id))
      if (applicableRules.some((entry) => load.items.some((item) => !materialsAllow(item.source.material, entry.safeMaterials, entry.incompatibleMaterials)))) {
        block({ cause: 'product_material_conflict' }, rule ?? undefined)
        continue
      }
      if (applicableRules.some((entry) => entry.maximumTemperatureC !== undefined && loadTemperatureC(load) > entry.maximumTemperatureC)) {
        block({ cause: 'product_temperature_conflict' }, rule ?? undefined)
        continue
      }
      if (rule !== null) chosenRules.set(supply.id, { ...rule, incompatibleSupplyIds: [...new Set(applicableRules.flatMap((entry) => entry.incompatibleSupplyIds ?? []))] })

      if (input.adaptPlacements) {
        // A row written for another kind of washer: the step moves to where this washer takes it.
        const adapted = adaptedPlacement(placementsOf(machine), direction, doorLocksDuringCycle(machine))
        if (adapted !== null) direction = adapted
      }
      const placement = direction.placement!
      if (!placementSupported(machine, placement)) {
        const alternative = usableMachines.find((candidate) => candidate.id !== machine.id && placementSupported(candidate, placement) && packingCapacity(candidate) >= load.items.reduce((total, item) => total + item.bulkUnits, 0))
        if (alternative) {
          machine = alternative
          load.machine = alternative
          addReason('machine_substitution', itemIds, { cause: 'placement_support' }, { loadId: load.id, supplyId: supply.id, machineId: alternative.id })
        } else {
          const key = addReason('needs_confirmation', itemIds, { cause: 'unsupported_machine_placement' }, { loadId: load.id, supplyId: supply.id, machineId: machine.id })
          load.status = 'needs_confirmation'
          load.items.forEach((item) => exclude(item.id, key))
        }
      }
      const measurementCue = dose.measurementCue ?? direction.measurementCue ?? null
      const source = rule?.evidence?.source ?? supply.instructionProvenance?.source ?? supply.labelEvidence?.source ?? supply.label?.source ?? 'verified-product-label'
      if (doorLocksDuringCycle(machine) && addedByHandMidCycle(direction)) {
        const key = addReason('needs_confirmation', itemIds, { cause: 'locked_door_mid_cycle', placement }, { loadId: load.id, supplyId: supply.id, machineId: machine.id })
        load.status = 'needs_confirmation'
        load.items.forEach((item) => exclude(item.id, key))
        load.treatments.push({ supplyId: supply.id, dose, measurementCue, stage: direction.stage ?? 'rinse', placement, timing: direction.timing ?? null, rationale: 'The door locks during the cycle, so this cannot be added by hand mid-cycle.', source, confirmation: 'needs_confirmation', ...chosen })
        continue
      }
      const confirmed = placementSupported(machine, placement)
      const confirmation = confirmed ? 'confirmed' : 'needs_confirmation'
      const rationale = chosen.atMachine === undefined ? `Apply ${supply.id} using the label-backed rule.` : `Apply ${supply.id} at the label's dose for how full the drum is.`
      load.treatments.push({ supplyId: supply.id, dose, measurementCue, stage: direction.stage ?? 'wash', placement, timing: direction.timing ?? null, rationale, source, confirmation, ...chosen })
      if (chosen.atMachine === undefined) addReason('dose_rule_selected', itemIds, { cause: 'verified_rule', ruleId: rule!.id, ...doseDetails }, { loadId: load.id, supplyId: supply.id })
      addReason('machine_placement', itemIds, { cause: 'verified_placement', placement }, { loadId: load.id, supplyId: supply.id, machineId: machine.id })
    }

    let stainOrder = 0
    for (const item of load.items) {
      const report = stainReport(item)
      if (!report) continue
      const source = report.provenance?.source ?? 'stain-report'
      const kind = report.kind
      const required = kind === undefined ? null : requiredStainChemistry(kind)
      // A second try after a washed-out treatment: a different product, preferring a chemistry not yet tried, and
      // only on a fabric that allows one more home try; never the same product again.
      const tried = washedOutAttempts(report)
      const retryAllowed = tried === null || stainWashLimit(item.source.material, careMethod(item.source.care)) > 1
      const triedChemistries = new Set(tried?.map((entry) => entry.chemistry))
      const retryKinds = kind === undefined ? undefined : retryChemistries[kind]
      // A retry chemistry other than the kind's own needs a label that names this stain kind.
      const ruleFor = (supply: SupplyItem, chemistry: StainChemistry) => stainRule(supply, item, chemistry,
        tried !== null && chemistry !== required && !(kind === 'oil_grease' && chemistry === 'lipase'))
      const chemistryFor = (supply: SupplyItem): StainChemistry | null => tried === null
        ? kind === 'oil_grease' && stainRule(supply, item, 'lipase') !== null ? 'lipase' : required
        : (retryKinds ?? []).find((chemistry) => {
          const candidate = ruleFor(supply, chemistry)
          return candidate !== null && careAllowsStain(item, chemistry, candidate)
        }) ?? null
      const choice = input.pretreatmentChoices?.find((entry) => entry.textileId === item.id)
      const candidates = required === null || !retryAllowed ? [] : treatmentSupplies
        .filter((supply) => !excludedSupply(input, supply.id) && supplyBleach(supply) !== 'unknown' && isStainSupply(supply) && supplyCompatible(supply, item) && requirementCheck(supply, [item.source.requirements]).status === 'ok')
        .filter((supply) => !tried?.some((entry) => entry.supplyId === supply.id))
        .filter((supply) => {
          const chemistry = chemistryFor(supply)
          const candidate = chemistry === null ? null : ruleFor(supply, chemistry)
          return candidate !== null && careAllowsStain(item, chemistry!, candidate) && ruleDose(candidate, supply.measurement) !== null && candidate.placement === 'manual'
        })
        .sort((left, right) => Number(triedChemistries.has(chemistryFor(left)!)) - Number(triedChemistries.has(chemistryFor(right)!))
          || Number(ruleFor(right, chemistryFor(right)!)?.soak !== undefined) - Number(ruleFor(left, chemistryFor(left)!)?.soak !== undefined)
          || left.id.localeCompare(right.id))
      // A stale or unsupported choice cannot authorize a treatment. Offer a compatible suggestion
      // instead, requiring a fresh choice; never silently substitute a different product.
      const selectedSupply = candidates.find((supply) => supply.id === choice?.supplyId) ?? candidates[0]
      const selectedChemistry = selectedSupply ? chemistryFor(selectedSupply) : required
      const rule = selectedSupply && selectedChemistry ? ruleFor(selectedSupply, selectedChemistry) : null
      const dose = rule ? ruleDose(rule, selectedSupply?.measurement) : null
      const sourceText = rule?.evidence?.source ?? selectedSupply?.labelEvidence?.source ?? selectedSupply?.label?.source ?? source
      const unknown = stainNeedsConfirmation(item) || required === null
      // The fabric or the stain allows no home retry, or it does but no product on the shelf is a safe different try.
      const noRetry = !unknown && tried !== null && selectedSupply === undefined
      const needsCleaner = noRetry && (!retryAllowed || retryKinds === undefined)
      const careConflict = !unknown && !noRetry && !careAllowsStain(item, selectedChemistry ?? required!, rule)
      const supported = !unknown && !noRetry && !careConflict && selectedSupply !== undefined && rule !== null && dose !== null && rule.placement !== undefined
      const confirmation = supported && choice?.supplyId === selectedSupply?.id
      if (confirmation) stainRules.set(item.id, rule!)
      const stainReason = !confirmation ? addReason('needs_confirmation', [item.id], {
        cause: unknown ? 'unknown_stain_report' : needsCleaner ? 'stain_needs_cleaner' : noRetry ? 'stain_retry_unavailable' : careConflict ? 'stain_care_conflict' : supported ? 'pretreatment_choice_needed' : 'unsupported_stain_chemistry',
        kind: kind ?? 'unknown',
        chemistry: required ?? 'unknown',
        source: sourceText,
        confirmation: 'needs_confirmation',
      }, { loadId: load.id, supplyId: selectedSupply?.id, machineId: machine.id }) : null
      if (stainReason !== null) {
        load.status = 'needs_confirmation'
        exclude(item.id, stainReason)
      }
      load.treatments.push({
        textileId: item.id,
        ...(rule?.soak === undefined ? {} : { soak: { ...rule.soak, maximumMinutes: Math.min(rule.soak.maximumMinutes, item.source.care?.instructions?.maximumSoakMinutes ?? Infinity), maximumTemperatureC: Math.min(rule.soak.maximumTemperatureC, recordedCareTemperature(item) ?? 0, rule.maximumTemperatureC ?? Infinity) } }),
        ...(rule === null ? {} : { ruleId: rule.id }),
        order: stainOrder++,
        supplyId: selectedSupply?.id ?? 'stain-confirmation',
        dose: dose ?? { amount: 0, unit: 'unknown' },
        measurementCue: dose?.measurementCue ?? rule?.measurementCue ?? null,
        stage: 'prewash',
        placement: rule?.placement ?? 'manual',
        timing: [tried === null ? '' : 'Rinse out the earlier product well first; never mix the two.', kind === 'protein' ? 'Cold rinse first.' : kind === 'tannin' ? 'Cool rinse first.' : '', rule?.timing ?? 'Before wash; confirm first.', rule?.soak === undefined ? '' : `Label basis: ${dose?.amount} ${dose?.unit} per ${rule.soak.waterLitres} L; measure container water during Preparation. ${rule.soak.minimumMinutes}–${Math.min(rule.soak.maximumMinutes, item.source.care?.instructions?.maximumSoakMinutes ?? Infinity)} minutes. ${rule.soak.transfer}`].filter(Boolean).join(' '),
        rationale: confirmation
          ? `Treat ${kind} stain on ${item.id} using the verified label-backed ${selectedChemistry} rule.`
          : supported ? 'Choose this recorded pretreatment to add it to the recipe; treatment is still to be done during Preparation.'
            : 'Stain chemistry, prior treatment, label evidence, or garment compatibility needs confirmation before use.',
        source: sourceText,
        confirmation: confirmation ? 'confirmed' : 'needs_confirmation',
        temperatureC: kind === 'protein' || kind === 'tannin' || kind === 'oil_grease' ? Math.min(kind === 'protein' ? 20 : kind === 'tannin' ? 30 : recordedCareTemperature(item) ?? 30, recordedCareTemperature(item) ?? Infinity, rule?.maximumTemperatureC ?? Infinity) : null,
        isolated: kind === 'dye_ink_transfer' ? true : undefined,
        preventDrying: kind === 'oil_grease' ? true : undefined,
      })
      if (confirmation) addReason('dose_rule_selected', [item.id], { cause: 'verified_stain_rule', ruleId: rule!.id, stainKind: kind }, { loadId: load.id, supplyId: selectedSupply!.id })
    }

    const selectedRule = (supplyId: string): ApplicationRule | null => chosenRules.get(supplyId) ?? null
    for (let left = 0; left < load.treatments.length; left += 1) {
      for (let right = left + 1; right < load.treatments.length; right += 1) {
        const first = load.treatments[left]!
        const second = load.treatments[right]!
        const firstRule = first.textileId === undefined ? selectedRule(first.supplyId) : stainRules.get(first.textileId)
        const secondRule = second.textileId === undefined ? selectedRule(second.supplyId) : stainRules.get(second.textileId)
        const chemicallyIncompatible = firstRule?.incompatibleSupplyIds?.includes(second.supplyId) || secondRule?.incompatibleSupplyIds?.includes(first.supplyId)
          || sourceMixingConflict(supplies.find((supply) => supply.id === first.supplyId) ?? { id: first.supplyId }, supplies.find((supply) => supply.id === second.supplyId) ?? { id: second.supplyId })
          || supplies.find((supply) => supply.id === first.supplyId)?.incompatibleSupplyIds?.includes(second.supplyId)
          || supplies.find((supply) => supply.id === second.supplyId)?.incompatibleSupplyIds?.includes(first.supplyId)
        if (chemicallyIncompatible) {
          const pair = [...new Set([first.supplyId, second.supplyId])].sort()
          // A product whose pretreatment step and wash step clash names itself alone.
          const key = addReason('needs_confirmation', load.items.map((item) => item.id), { cause: 'chemical_combination_conflict', supplyIds: [first.supplyId, second.supplyId].sort() }, { loadId: load.id, ...(pair.length === 1 ? { supplyId: pair[0]! } : {}) })
          load.status = 'needs_confirmation'
          load.items.forEach((item) => exclude(item.id, key))
        }
        if (first.textileId !== undefined || second.textileId !== undefined) continue
        if (first.placement !== second.placement) continue
        // Products poured into the drum share no slot: those for the wash mix in the wash water, which
        // drains before the rinse. Only two poured into the rinse water share it.
        const inWashWater = (step: TreatmentStep) => step.stage === 'wash' || step.stage === 'prewash'
        if (first.placement === 'direct_to_drum' && (inWashWater(first) || inWashWater(second))) continue
        const explicitlyCompatible = firstRule?.sharedCompartmentCompatible === true && secondRule?.sharedCompartmentCompatible === true
        const profileConflict = machineProfile(machine)?.sharedCompartmentConflicts?.some((conflict) => conflict.placement === first.placement && conflict.supplyIds.includes(first.supplyId) && conflict.supplyIds.includes(second.supplyId)) ?? false
        if (!explicitlyCompatible || profileConflict || chemicallyIncompatible) {
          // A load planned on another kind of washer names the two products, so the room can say which cannot share.
          const details = { cause: 'shared_compartment_conflict', placement: first.placement, ...(input.adaptPlacements === true ? { supplyIds: [first.supplyId, second.supplyId].sort() } : {}) }
          const key = addReason('needs_confirmation', load.items.map((item) => item.id), details, { loadId: load.id })
          addReason('shared_compartment_conflict', load.items.map((item) => item.id), details, { loadId: load.id })
          load.status = 'needs_confirmation'
          load.items.forEach((item) => exclude(item.id, key))
        }
      }
    }
    // A later product can change the washer; source-route checks bind the final wash context.
    load.treatments = load.treatments.map((treatment) => {
      const contract = supplies.find((entry) => entry.id === treatment.supplyId)?.sourceContract
      if (contract === undefined) return treatment
      const loadFingerprint = productLoadFingerprint(load.items.map((item) => item.source))
      const washContext = contract.requireOrdinaryWashRoute ? { ordinaryWashRouteRequired: true, washContextFingerprint: productWashContextFingerprint(machine, loadCycle(load), loadTemperatureC(load)) } : {}
      const productRequirement = { sourceDigest: contract.digest, loadFingerprint, colorfastnessRequired: contract.requireColorfastness === true, sourceLoadCategories: [...(contract.sourceLoadCategories ?? [])], ...washContext }
      const check = input.productLoadConfirmations?.find((entry) => entry.supplyId === treatment.supplyId && entry.sourceDigest === contract.digest && entry.loadFingerprint === loadFingerprint)
      if (contract.requireOrdinaryWashRoute && (check?.ordinaryWashRouteChecked !== true || check.washContextFingerprint !== washContext.washContextFingerprint)) {
        const key = addReason('needs_confirmation', load.items.map((item) => item.id), { cause: 'product_load_confirmation', sourceDigest: contract.digest, loadFingerprint, colorfastnessRequired: contract.requireColorfastness === true, sourceLoadCategories: [...(contract.sourceLoadCategories ?? [])], ordinaryWashRouteRequired: true, washContextFingerprint: washContext.washContextFingerprint! }, { loadId: load.id, supplyId: treatment.supplyId, machineId: machine.id })
        load.status = 'needs_confirmation'
        load.items.forEach((item) => exclude(item.id, key))
        return { ...treatment, productRequirement, confirmation: 'needs_confirmation' }
      }
      return { ...treatment, productRequirement, ...(check === undefined ? {} : { productConfirmation: check }) }
    })
    // A later product can move the load to another washer. Check contact against the
    // final machine and program, never the machine used earlier in product selection.
    load.treatments = load.treatments.map((treatment) => {
      if (treatment.confirmation !== 'confirmed') return treatment
      const supply = supplies.find((entry) => entry.id === treatment.supplyId)
      if (supply === undefined || !(supply.kind === 'sanitizer' || supply.use === 'sanitizer' || supply.use === 'rinse_sanitizer' || supply.sanitizing !== undefined)) return treatment
      const required = supply.sanitizing
      const contact = machine.rinseContact?.[loadCycle(load)]
      const timingKey = (value: string | null | undefined) => value?.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!]+$/, '') ?? ''
      const sameRelease = contact?.placement === treatment.placement
        && (treatment.placement !== 'direct_to_drum' && treatment.placement !== 'manual'
          || timingKey(contact?.timing) !== '' && timingKey(contact?.timing) === timingKey(treatment.timing))
      if (required?.route === 'rinse' && treatment.stage === 'rinse'
        && Number.isFinite(required.minimumContactMinutes) && required.minimumContactMinutes > 0
        && required.formulation.trim() && required.source.trim()
        && sameRelease && contact !== undefined && Number.isFinite(contact.minutes) && contact.minutes >= required.minimumContactMinutes && contact.source.trim()) return treatment
      const key = addReason('needs_confirmation', load.items.map((item) => item.id), { cause: 'sanitizer_contact_time', requiredMinutes: required?.minimumContactMinutes ?? null, recordedMinutes: contact?.minutes ?? null }, { loadId: load.id, supplyId: supply.id, machineId: machine.id })
      load.status = 'needs_confirmation'
      load.items.forEach((item) => exclude(item.id, key))
      return { ...treatment, confirmation: 'needs_confirmation', rationale: 'The exact pack’s rinse contact time has not been established for this washer program.' }
    })
    const unsupportedTreatments = load.treatments.filter((treatment) => !(treatment.textileId !== undefined && treatment.placement === 'manual') && !placeholders.has(treatment) && !placementSupported(machine, treatment.placement))
    if (!machineSupportsCycle(machine, cycle) || unsupportedTreatments.length > 0) {
      const key = addReason('needs_confirmation', load.items.map((item) => item.id), { cause: machineSupportsCycle(machine, cycle) ? 'unsupported_machine_placement' : 'unsupported_machine_cycle' }, { loadId: load.id, machineId: machine.id })
      load.status = 'needs_confirmation'
      load.treatments = load.treatments.map((treatment) => !machineSupportsCycle(machine, cycle) || unsupportedTreatments.includes(treatment) ? { ...treatment, confirmation: 'needs_confirmation' } : treatment)
      load.items.forEach((item) => exclude(item.id, key))
    }
    const totalBulk = load.items.reduce((total, item) => total + item.bulkUnits, 0)
    const processUnmatched = load.items.flatMap((item) => washProcessUnmatched(item.source.care?.instructions, machine, loadCycle(load)))
    if (load.items.some((item) => careRequiresDetergent(item.source.care?.instructions)) && !load.treatments.some((step) => {
      const supply = supplies.find((entry) => entry.id === step.supplyId)
      return step.stage === 'wash' && step.confirmation === 'confirmed' && supply !== undefined && isDetergent(supply)
    })) processUnmatched.push('required_detergent')
    const prohibitedTreatments = load.treatments.filter((step) => {
      const supply = supplies.find((entry) => entry.id === step.supplyId)
      return supply !== undefined && load.items.some((item) => !careProductAllowed(item.source.care?.instructions, supply))
    })
    if (processUnmatched.length > 0 || prohibitedTreatments.length > 0) {
      const key = addReason('needs_confirmation', load.items.map((item) => item.id), { cause: 'unmatched_label_requirement', instructions: [...new Set(processUnmatched)], supplyIds: prohibitedTreatments.map((step) => step.supplyId) }, { loadId: load.id, machineId: machine.id })
      load.status = 'needs_confirmation'
      load.items.forEach((item) => exclude(item.id, key))
      load.treatments = load.treatments.map((step) => prohibitedTreatments.includes(step) ? { ...step, confirmation: 'needs_confirmation' } : step)
    }
    if (totalBulk > careProcessCapacity(machine, loadCycle(load), load.items.map((item) => item.source.care?.instructions), packingCapacity(machine))) {
      const key = addReason('capacity_limit', load.items.map((item) => item.id), { cause: 'load_capacity' }, { loadId: load.id, machineId: machine.id })
      load.status = 'needs_confirmation'
      load.items.forEach((item) => exclude(item.id, key))
    }
    addReason('ownership_preserved', load.items.map((item) => item.id), { cause: 'owner_assignments' }, { loadId: load.id })

    const { drying, notes } = planDrying({
      id: load.id,
      items: load.items.map((item) => ({ id: item.id, bulkUnits: item.bulkUnits, care: item.source.care, material: item.source.material ?? null, stained: stainReport(item) !== null || stainNoted(item), requirements: item.source.requirements ?? null })),
      ...(preferences.preferredDryerId === undefined ? {} : { preferredDryerId: preferences.preferredDryerId }),
    }, input, dryers, supplies, { rush })
    load.drying = drying
    for (const note of notes) {
      addReason('drying_decision', note.textileIds, {
        cause: note.cause,
        ...(note.method === undefined ? {} : { method: note.method }),
        ...(note.reason === undefined ? {} : { reason: note.reason }),
        ...(note.omission === undefined ? {} : { omission: note.omission }),
        ...(note.missing === undefined ? {} : { missing: note.missing }),
        ...(note.stage === undefined ? {} : { stage: note.stage }),
      }, { loadId: load.id, ...(note.supplyId === undefined ? {} : { supplyId: note.supplyId }), ...(note.machineId === undefined ? {} : { machineId: note.machineId }) })
    }
  }

  const plannedLoads: LoadPlan[] = workingLoads.map((load) => {
    const bulk = load.items.reduce((total, item) => total + item.bulkUnits, 0)
    const advice = [...garmentAdvice(load.items.map((item) => ({ ...item.source, id: item.id }))), ...preOwnedAdvice(load.items.map((item) => ({ id: item.id, material: item.source.material, care: item.source.care, stained: stainReport(item) !== null || stainNoted(item), ...(item.source.preOwned === undefined ? {} : { preOwned: item.source.preOwned }) })), garmentAdvicePolicyVersion)]
    const preparation = new Map<string, string[]>()
    for (const item of load.items) for (const wording of item.source.care?.instructions?.preparation ?? []) {
      preparation.set(wording, [...(preparation.get(wording) ?? []), item.id])
    }
    const process = checkedWashProcess(load.machine, loadCycle(load))
    if (process !== undefined) preparation.set(washProcessWording(process), load.items.map((item) => item.id))
    for (const item of load.items) for (const binding of item.source.care?.instructions?.washingRequirements ?? []) {
      if (binding.checked && (binding.requirements.some((entry) => entry.kind !== 'wash_alone_first_wash') || recordedFirstWash(item.source) === true)) preparation.set(binding.wording, [...new Set([...(preparation.get(binding.wording) ?? []), item.id])])
    }
    return {
      id: load.id,
      ...(advice.length === 0 ? {} : { garmentAdvice: advice }),
      textileIds: load.items.map((item) => item.id).sort(),
      ...(preparation.size === 0 ? {} : { labelPreparation: [...preparation].sort(([a], [b]) => a.localeCompare(b)).map(([wording, textileIds]) => ({ wording, textileIds: textileIds.sort() })) }),
      owners: load.items.map((item) => ({ textileId: item.id, ownerId: item.ownerId })).sort((left, right) => left.textileId.localeCompare(right.textileId)),
      bulkUnits: bulk,
      // A lone garment bulkier than the room's smallest kind is weighed against its own washer.
      capacityUnits: careProcessCapacity(load.machine, loadCycle(load), load.items.map((item) => item.source.care?.instructions), bulk > packUnits(load.machine) ? packingCapacity(load.machine) : packUnits(load.machine)),
      machineId: load.machine.id,
      machineModelId: load.machine.modelId ?? load.machine.modelNumber ?? null,
      cycle: loadCycle(load),
      temperatureC: loadTemperatureC(load),
      treatments: [...load.treatments].sort((left, right) => (left.stage === 'prewash' ? 0 : 1) - (right.stage === 'prewash' ? 0 : 1) || (left.textileId === undefined ? 1 : 0) - (right.textileId === undefined ? 1 : 0) || (left.textileId ?? '').localeCompare(right.textileId ?? '') || (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER) || left.supplyId.localeCompare(right.supplyId)),
      status: load.status,
      loadSize: null,
      soilLevel: heaviestSoil(load.items),
      washerClass: washerClass(load.machine),
      drying: load.drying,
      ...(load.detergent === undefined ? {} : { detergent: load.detergent }),
      productRecommendations: supplies.filter((supply) => washerTreatment(supply) && !isDetergent(supply) && supply.kind !== 'accessory').map((supply) => {
        const bleach = supplyBleach(supply)
        const requirements = requirementCheck(supply, load.items.map((item) => item.source.requirements))
        const prohibited = requirements.status === 'conflict'
          || bleach !== null && bleach !== 'unknown' && load.items.some((item) => tagForbidsBleach(item, bleach))
          || load.items.some((item) => !supplyCompatible(supply, item) || item.source.incompatibleSupplyIds?.includes(supply.id))
        const confirmed = load.treatments.some((step) => step.supplyId === supply.id && step.confirmation === 'confirmed') && load.status === 'ready'
        return productBenefit(supply, { goals: input.washGoals ?? ['ordinary'], detergent: supplies.find((entry) => entry.id === load.detergent?.chosenId), compatibility: prohibited ? 'excluded' : confirmed ? 'allowed' : 'unknown' })
      }),
    }
  })
  // In a shared room with more than one kind of washer, each load is also planned on every other kind.
  const loads = input.adaptPlacements ? plannedLoads : plannedLoads.map((load, index): LoadPlan => {
    const classes = roomClasses(usableMachines, workingLoads[index]!.machine)
    const own = classes.find((entry) => entry.machineIds.includes(load.machineId ?? ''))
    if (classes.length < 2 || own === undefined) return load
    return { ...load, roomMachineIds: own.machineIds, alternates: classes.filter((entry) => entry !== own).map((entry) => loadAlternate(input, load, entry)) }
  })
  const washerPricing = input.pricing?.washer ?? input.pricing?.washerPricing
  const washerCost = loads.reduce((total, load) => total + priceFor(washerPricing, load.cycle), 0)
  // One dryer start per load that is ready to tumble; the timed cycle is what a coin dryer sells.
  const dryerCost = loads.reduce((total, load) => total + (load.drying?.status === 'ready' ? priceFor(input.pricing?.dryer, 'timed') : 0), 0)
  const consumed = loads.flatMap((load) => [...load.treatments, ...(load.drying?.status === 'ready' ? load.drying.treatments.filter((step) => step.reusable !== true) : [])])
  const supplyCost = consumed.reduce((total, treatment) => total + (input.pricing?.supplyUnitPrices?.[treatment.supplyId] ?? supplies.find((supply) => supply.id === treatment.supplyId)?.unitPrice ?? 0) * treatment.dose.amount, 0)
  if (loads.length > 0) addReason('cost_calculated', loads.flatMap((load) => load.textileIds), { cause: 'washer_and_supply_pricing', loadCount: loads.length })
  const sortedReasons = [...reasonDrafts.values()].sort((left, right) => left.priority - right.priority || left.code.localeCompare(right.code) || left.key.localeCompare(right.key))
  const finalReasons = sortedReasons.map(({ key: _key, ...reason }, index) => deepFreeze({ ...reason, id: `reason-${String(index + 1).padStart(3, '0')}` }))
  const finalReasonIds = new Map(sortedReasons.map((reason, index) => [reason.key, finalReasons[index]!.id]))
  const finalExclusions = exclusions.sort((left, right) => left.textileId.localeCompare(right.textileId)).map((entry) => {
    const keys = [...new Set(entry.reasonKeys)].sort((left, right) => (finalReasonIds.get(left) ?? '').localeCompare(finalReasonIds.get(right) ?? ''))
    return { textileId: entry.textileId, reasonIds: keys.map((key) => finalReasonIds.get(key)!).filter(Boolean), reasonCodes: keys.map((key) => sortedReasons.find((reason) => reason.key === key)!.code) }
  })
  const explanations = explanationsFromReasons(finalReasons)
  const warningCodes = new Set<DecisionReasonCode>(['care_prohibition', 'care_compatibility', 'needs_confirmation', 'product_restriction', 'dye_first_wash_risk', 'capacity_limit', 'shared_compartment_conflict'])
  const warnings = explanations.filter((explanation) => warningCodes.has(explanation.code)).map((explanation) => explanation.text)
  const result: PlanResult = {
    plannerVersion,
    mode: input.mode === 'rush' ? 'rush' : 'normal',
    inputSnapshot: canonicalInput,
    inputHash,
    status: finalReasons.some((reason) => reason.code === 'needs_confirmation' || reason.code === 'product_restriction') ? 'needs_confirmation' : 'ready',
    loads: deepFreeze(personal === undefined ? loads : applyPersonalPlannerInput(loads, personal,
      sha256(stableJson(canonicalize(input, true))))),
    exclusions: deepFreeze(finalExclusions),
    cost: deepFreeze({ currency: input.pricing?.currency ?? 'USD', washer: washerCost, dryer: dryerCost, supplies: supplyCost, total: washerCost + dryerCost + supplyCost }),
    warnings: deepFreeze(warnings),
    reasons: deepFreeze(finalReasons),
    explanations: deepFreeze(explanations),
  }
  return deepFreeze(result)
}
