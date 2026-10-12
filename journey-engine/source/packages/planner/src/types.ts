import type { CareProcessBinding, WashProcess } from './care-process.ts'
import type { DryingPlan } from './drying.ts'
import type { GarmentDecoration, GarmentAdvice } from './garment-advice.ts'
import type { PreOwnedFacts } from './pre-owned.ts'
import type { CapabilityEvidence, BenefitDecision, WashGoal } from './product-benefits.ts'
import type { PersonalPlannerGuidance, PersonalPlannerInput } from './personal-planner.ts'
import type { CalculatedDose } from './rules.ts'
import type { BleachAnswer, ColorGroup, EvidenceLevel, HeavyLightMixing, LoadSize, MeasureKind, PlannerMode, SoilLevel, WashMethod, WasherClass, WearerKind } from './vocabulary.ts'
import type { ProductSourceContract, ProductLoadConfirmation } from './product-contract.ts'
import type { plannerVersion, productBleachKinds } from './index.ts'

export type PlannerVersion = typeof plannerVersion

export type JsonPrimitive = string | number | boolean | null

export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[]

export type JsonObject = { readonly [key: string]: JsonValue }

export interface EvidenceRecord {
  readonly status?: EvidenceLevel
  readonly confidence?: EvidenceLevel | { readonly level: EvidenceLevel }
  readonly provenance?: string | { readonly sourceRef?: string; readonly revision?: string }
  readonly source?: string
  readonly revision?: string
  readonly labelText?: string
  readonly [key: string]: unknown
}

/** Stored wash methods plus the legacy `hand` spelling older evidence may carry. */
export type CareWashMethod = WashMethod | 'hand'

export type BulkClass = 'very_light' | 'light' | 'medium' | 'bulky' | 'very_bulky'

export interface CareRestrictionEvidence {
  readonly area?: string
  readonly instruction?: string
  readonly [key: string]: unknown
}

export interface CareEvidence {
  readonly instructions?: AdditionalCareInstructions
  readonly washMethod?: CareWashMethod
  readonly method?: CareWashMethod
  readonly washTemperatureC?: number | null
  readonly maxTemperatureC?: number | null
  readonly cycle?: string | null
  readonly requiredCycle?: string | null
  readonly restrictions?: readonly (string | CareRestrictionEvidence)[]
  /** The label's drying symbol: one of `dryMethods`. */
  readonly dryMethod?: string | null
  /** The hottest dryer heat the label allows, one of `dryerHeats`; unset on a tumble-dry label means any heat. */
  readonly dryHeat?: string | null
  /** The label's bleach triangle, one of `bleachAnswers`; unset when the tag doesn't say. */
  readonly bleach?: BleachAnswer | null
  readonly status?: 'confirmed' | 'needs_confirmation'
  readonly unknown?: boolean | { readonly reason?: string; readonly detail?: string | null }
  readonly unsupportedTreatment?: boolean
  readonly evidence?: EvidenceRecord | null
  readonly [key: string]: unknown
}

export type OwnerReference = string | { readonly id?: string; readonly principalId?: string; readonly [key: string]: unknown }

/** Required label wording, distinct from optional household advice. Unmatched settings block. */
export interface AdditionalCareInstructions {
  readonly washingRequirements?: readonly CareProcessBinding[]
  readonly dryingRequirements?: readonly CareProcessBinding[]
  readonly source: string
  readonly symbolSystem?: string
  readonly preparation: readonly string[]
  readonly washing: readonly string[]
  readonly beforeDrying: readonly string[]
  readonly drying: readonly string[]
  readonly afterDrying: readonly string[]
  readonly ironing: readonly string[]
  readonly maximumSoakMinutes?: number
  readonly professionalDry?: { readonly permission: 'allowed' | 'not_allowed' | 'unknown'; readonly wording: string }
  readonly professionalWet?: { readonly permission: 'allowed' | 'not_allowed' | 'unknown'; readonly wording: string }
}

export interface TextileEvidence {
  readonly kind?: string | null
  readonly decoration?: GarmentDecoration
  readonly adviceReminder?: boolean
  /** Thrift or hand-me-down: what the owner recorded at intake, with the washes so far. */
  readonly preOwned?: PreOwnedFacts
  readonly id?: string
  readonly textileId?: string
  readonly instanceId?: string
  readonly owner?: OwnerReference
  readonly ownerId?: string
  readonly care?: CareEvidence | null
  /** Explicit owner acceptance, separately reviewed against the current label by the adapter. */
  readonly personalRoutine?: {
    readonly revision: number
    readonly valid: boolean
    readonly missingLabelAccepted: boolean
    readonly wash?: { readonly method: 'machine' | 'hand_wash'; readonly cycle: string; readonly maximumTemperatureC: number }
  }
  readonly color?: string | null
  readonly colorGroup?: ColorGroup
  readonly firstWash?: boolean
  readonly firstWashState?: 'unwashed' | 'washed' | 'unknown'
  readonly dyeRun?: import('./vocabulary.ts').DyeRun
  /** Existing named-garment grouping, supplied by the inventory adapter rather than guessed. */
  readonly dyeRunGroup?: string
  readonly bulkUnits?: number
  readonly bulkClass?: BulkClass
  readonly material?: string | null
  /** How dirty this garment is, one of `soilLevels`; unset when not recorded. */
  readonly soilLevel?: string | null
  readonly stainReport?: StainReport | null
  readonly stain?: StainReport | null
  readonly compatibleSupplyIds?: readonly string[]
  readonly incompatibleSupplyIds?: readonly string[]
  /** Who wears it, from the wearer's name tag. */
  readonly wearerKind?: WearerKind
  /** The wearer's clothing-profile product requirements; they apply to every product stage. */
  readonly requirements?: ProfileRequirements | null
  /**
   * Where a flagged stain is, in the person's words. Never read as a stain kind: nothing is
   * pre-treated from it, and the garment is kept out of the dryer so heat cannot set what is left.
   */
  readonly stainNote?: string
  /** A guest's garment, washed once and not kept. */
  readonly guest?: boolean
  readonly [key: string]: unknown
}

export type StainKind =
  | 'protein'
  | 'blood'
  | 'dairy'
  | 'egg'
  | 'tannin'
  | 'coffee'
  | 'tea'
  | 'wine'
  | 'fruit'
  | 'oil_grease'
  | 'oil'
  | 'grease'
  | 'starch_sauce'
  | 'starch'
  | 'sauce'
  | 'dye_ink_transfer'
  | 'dye'
  | 'ink'
  | 'transfer'
  | 'rust_mineral'
  | 'rust'
  | 'mineral'
  | 'combination'
  | 'unknown'

export interface StainReport {
  readonly instanceId?: string
  readonly kind: StainKind
  readonly age?: string | null
  readonly freshness?: string | null
  readonly priorTreatmentAttempts?: readonly unknown[] | null | 'unknown'
  readonly priorTreatments?: readonly unknown[] | null | 'unknown'
  readonly location?: string | null
  readonly provenance?: EvidenceRecord | null
  readonly confidence?: EvidenceLevel
}

export interface FormulationEvidence {
  readonly name?: string
  readonly form?: string
  readonly concentration?: number
  readonly concentrationUnit?: string
  readonly highEfficiencyCompatible?: boolean
  readonly [key: string]: unknown
}

export interface SupplyPackage {
  readonly revision?: string
  readonly amount?: number
  readonly unit?: string
  readonly [key: string]: unknown
}

/** A mark printed on a cap or scoop, with the volume the label prints for it when it prints one. */
export interface MeasureMark {
  readonly label: string
  readonly amount?: number
  readonly unit?: string
}

export interface SupplyMeasurement {
  readonly kind?: MeasureKind | string
  readonly unit?: string
  readonly marks?: readonly (string | MeasureMark)[]
  readonly countUnit?: string
  readonly [key: string]: unknown
}

export interface Dose {
  /** For a `cap` or `scoop` dose, the number of fills to `mark`. */
  readonly amount: number
  readonly unit: string
  /** The printed mark the product is filled to, verbatim. */
  readonly mark?: string | null
  /** Fraction of the printed fill level; never used to infer a fraction of its volume. */
  readonly fractionOfMark?: number
  readonly target?: 'below' | 'just_below'
  readonly approximate?: boolean
  readonly measurementCue?: string | null
}

export type ApplicationStage = 'prewash' | 'wash' | 'rinse' | 'postwash' | string

export type DispensingPlacement =
  | 'detergent_compartment'
  | 'softener_compartment'
  | 'bleach_compartment'
  | 'direct_to_drum'
  | 'center_agitator'
  | 'downy_ball'
  | 'automatic'
  | 'manual'

/** Any placement text a label may carry; the shared `Placement` vocabulary is the subset a household stores. */
export type AnyPlacement = DispensingPlacement | string

export interface ApplicationConditions {
  readonly sourceLoadCategories?: readonly import('./product-contract.ts').SourceLoadCategory[]
  readonly minBulkUnits?: number
  readonly maxBulkUnits?: number
  /** Legacy single size; read as `loadSizes: [loadSize]`. */
  readonly loadSize?: string
  readonly loadSizes?: readonly string[]
  readonly cycles?: readonly string[]
  readonly machineClasses?: readonly string[]
  readonly materials?: readonly string[]
  readonly soilLevels?: readonly string[]
  readonly odorLevels?: readonly string[]
  readonly waterConditions?: readonly string[]
  readonly [key: string]: unknown
}

export type StainChemistry =
  | 'protease'
  | 'lipase'
  | 'oxygen_bleach'
  | 'surfactant'
  | 'chlorine_bleach'
  | 'rust_remover'

export interface ApplicationRule {
  readonly soak?: TreatmentStep['soak']
  readonly id: string
  /** The label-directions row the rule was transcribed from; an or-row gives two rules one row. */
  readonly row?: number
  /** The row's line exactly as the person typed it off the label; never composed from app words. */
  readonly rowText?: string
  readonly supplyId?: string
  readonly productId?: string
  readonly supported?: boolean
  readonly labelBacked?: boolean
  readonly evidence?: EvidenceRecord | null
  readonly dose?: Dose | number
  readonly doseAmount?: number
  readonly doseUnit?: string
  readonly measurementCue?: string | null
  readonly stage?: ApplicationStage
  readonly placement?: AnyPlacement
  readonly timing?: string
  readonly stainChemistry?: StainChemistry
  readonly stainKinds?: readonly StainKind[]
  readonly safeMaterials?: readonly string[]
  readonly maximumTemperatureC?: number
  readonly maximumPH?: number
  readonly conditions?: ApplicationConditions
  readonly incompatibleSupplyIds?: readonly string[]
  readonly incompatibleMaterials?: readonly string[]
  readonly sharedCompartmentCompatible?: boolean
  readonly [key: string]: unknown
}

/** Product kinds the planner understands; the stored `SupplyKind` vocabulary maps onto these. */
export type PlannerSupplyKind =
  | 'chemical_consumable'
  | 'single_use_consumable'
  | 'detergent'
  | 'softener'
  | 'bleach'
  | 'sanitizer'
  | 'scent_booster'
  | 'dispenser'
  | 'accessory'
  | 'dryer_sheet'
  | 'wool_dryer_ball'
  | 'other'

export interface SupplyItem {
  readonly sourceContract?: ProductSourceContract
  readonly capabilities?: readonly CapabilityEvidence[]
  readonly sanitizing?: { readonly route: 'rinse'; readonly minimumContactMinutes: number; readonly formulation: string; readonly source: string }
  readonly lipase?: { readonly status: 'present' | 'absent' | 'unknown'; readonly formulation: string; readonly source: string }
  readonly id: string
  readonly brand?: string
  readonly product?: string
  readonly name?: string
  readonly kind?: PlannerSupplyKind
  /** The product's use ('detergent', 'pods', 'softener', ...); a detergent or pods product is one of the load's detergent choices. */
  readonly use?: string
  readonly labelEvidence?: EvidenceRecord | null
  readonly label?: EvidenceRecord | null
  readonly formulation?: FormulationEvidence | null
  readonly formulationEvidence?: EvidenceRecord | null
  readonly form?: string
  readonly concentration?: number
  readonly concentrationUnit?: string
  readonly package?: SupplyPackage | null
  readonly packageRevision?: string
  readonly measurement?: SupplyMeasurement | null
  readonly measuringUnit?: string
  readonly measuringMarks?: readonly string[]
  readonly owner?: OwnerReference
  readonly ownerId?: string
  readonly provenance?: EvidenceRecord | null
  readonly instructionProvenance?: EvidenceRecord | null
  readonly evidence?: EvidenceRecord | null
  readonly stainChemistry?: StainChemistry
  readonly chemistry?: StainChemistry
  readonly bleachKind?: typeof productBleachKinds[number]
  /** Contents as read off the pack; absent is unknown. Never read from the product name. */
  readonly fragrance?: 'free' | 'scented' | 'unknown'
  readonly dye?: 'free' | 'dyed' | 'unknown'
  readonly ingredients?: readonly string[]
  readonly incompatibleSupplyIds?: readonly string[]
  readonly applicationRules?: readonly ApplicationRule[]
  readonly compatibleTextileIds?: readonly string[]
  readonly incompatibleTextileIds?: readonly string[]
  readonly compatibleMaterials?: readonly string[]
  readonly incompatibleMaterials?: readonly string[]
  readonly highEfficiencyCompatible?: boolean
  readonly unitPrice?: number
  /** Where and when the product goes, from what it is for, for a dose decided at the machine before any row is saved. */
  readonly defaults?: { readonly stage: string; readonly placement: string; readonly timing: string }
  readonly [key: string]: unknown
}

export interface MachineDispensingProfile {
  readonly mechanisms?: readonly DispensingMechanism[]
  readonly placements?: readonly AnyPlacement[]
  readonly supportedPlacements?: readonly AnyPlacement[]
  readonly compartments?: readonly (string | MachineCompartment)[]
  readonly directToDrum?: boolean
  readonly centerAgitator?: boolean
  readonly downyBall?: boolean
  readonly automatic?: boolean
  readonly manual?: boolean
  readonly release?: DispensingRelease
  readonly releaseMode?: DispensingRelease
  readonly automaticRelease?: boolean
  readonly manualRelease?: boolean
  readonly requiredCycles?: readonly string[]
  readonly cycleOptions?: readonly string[]
  readonly requiredCycleOptions?: readonly string[]
  readonly evidence?: EvidenceRecord | null
  readonly confidence?: EvidenceLevel
  readonly evidenceConfidence?: EvidenceLevel
  readonly compartmentCapacity?: number
  readonly compartmentCapacities?: Readonly<Record<string, number>>
  readonly sharedCompartmentConflicts?: readonly {
    readonly placement: AnyPlacement
    readonly supplyIds: readonly string[]
  }[]
  readonly [key: string]: unknown
}

export type DispensingMechanism =
  | 'compartment'
  | 'direct_to_drum'
  | 'center_agitator'
  | 'downy_ball'
  | 'automatic'
  | 'manual'

export type DispensingRelease = 'automatic' | 'manual' | 'unknown'

export interface MachineCompartment {
  readonly id: string
  readonly capacity?: number
  readonly capacityUnit?: string
  readonly release?: DispensingRelease
  readonly cycles?: readonly string[]
  readonly evidence?: EvidenceRecord | null
  readonly [key: string]: unknown
}

export interface MachineEvidence {
  readonly washProcesses?: Readonly<Record<string, WashProcess>>
  readonly rinseContact?: Readonly<Record<string, { readonly minutes: number; readonly source: string; readonly placement: string; readonly timing?: string }>>
  readonly id: string
  readonly modelId?: string
  readonly modelNumber?: string
  readonly name?: string
  readonly applianceType?: 'top_load_washer' | 'front_load_washer' | string
  readonly capacityUnits?: number
  readonly capacity?: number
  readonly capacityMassKg?: number
  readonly capacityConfidence?: EvidenceLevel
  readonly evidence?: EvidenceRecord | null
  readonly doorLocksDuringCycle?: boolean
  /** 'shared' for a washer in a shared laundry room; unset is a washer at home. */
  readonly location?: string
  /** HE as recorded from the plate or manual; unset is unknown. */
  readonly highEfficiency?: boolean
  /** A dryer's heat buttons, each with the words printed on it. */
  readonly heatSettings?: readonly { readonly heat: string; readonly label: string; readonly tempF?: number }[]
  readonly available?: boolean
  readonly availability?: 'available' | 'in_use' | 'reserved' | 'offline' | 'unknown'
  readonly cycles?: readonly string[]
  readonly supportedCycles?: readonly string[]
  readonly cycleOptions?: readonly string[]
  readonly requiredCycleOptions?: readonly string[]
  readonly dispensing?: MachineDispensingProfile | null
  readonly dispensingProfile?: MachineDispensingProfile | null
  readonly [key: string]: unknown
}

export type WasherPricing =
  | { readonly type: 'flat_per_start'; readonly price: number }
  | { readonly type: 'cycle_based'; readonly prices: Readonly<Record<string, number>> }

export interface PlannerPricing {
  readonly currency?: string
  readonly washer?: WasherPricing
  readonly washerPricing?: WasherPricing
  readonly dryer?: WasherPricing
  readonly supplyUnitPrices?: Readonly<Record<string, number>>
  readonly [key: string]: unknown
}

export interface PlannerPolicy {
  readonly colorPolicy?: 'separate' | 'allow' | 'separate_first_wash'
  readonly firstWashColorSeparation?: boolean
  readonly heavyLightMixing?: HeavyLightMixing
  readonly requireVerifiedEvidence?: boolean
  readonly allowMachineSubstitution?: boolean
  readonly [key: string]: unknown
}

export interface PlannerPreferences {
  readonly optimization?: 'protect_clothes' | 'balanced' | 'cheapest'
  readonly objective?: 'protect_clothes' | 'balanced' | 'cheapest'
  readonly colorPolicy?: 'separate' | 'allow' | 'separate_first_wash'
  readonly heavyLightMixing?: HeavyLightMixing
  readonly preferredMachineId?: string
  readonly preferredDryerId?: string
  readonly fewerLoads?: boolean
  /** Wash baby clothes on their own; unset is on. */
  readonly babySeparate?: boolean
  readonly [key: string]: unknown
}

/** The person's arrangement of loads: pinned garments with the same group share a load. */
export interface LoadPin {
  readonly textileId: string
  readonly group: number
}

/** Which hard care veto keeps a garment out of the washer; `restriction` when only the label's words say so. */
export type CareVeto = 'hand_wash' | 'dry_clean_only' | 'do_not_wash' | 'restriction'

/** Why a pin could not be honoured: a hard rule the move would break. */
export type PinRefusalCause = 'care_cycle' | 'capacity' | CareVeto | 'care_unknown'

export type DismissedAnswer = 'label_doesnt_say' | 'depends_on_size' | 'cant_tell'

/**
 * A question answered without saving anything, for this pass only: a label row the label does not
 * give or that depends on how full the drum is, or a washer whose HE logo the person can't find.
 * `subjectId` is the product for `label_row` and the washer for `washer_he`.
 */
export interface DismissedQuestion {
  readonly kind: 'label_row' | 'washer_he'
  readonly subjectId: string
  readonly context: { readonly soilLevel?: SoilLevel; readonly washerClass?: WasherClass }
  readonly answer: DismissedAnswer
}

export interface PlannerInput {
  readonly productLoadConfirmations?: readonly ProductLoadConfirmation[]
  /** Caller-private derived summaries; never persist these in a shared household plan. */
  readonly personalSuggestions?: PersonalPlannerInput
  /** Optional additions are chosen explicitly; shelf ownership is not a choice. */
  readonly optionalSupplyIds?: readonly string[]
  readonly washGoals?: readonly WashGoal[]
  readonly textiles?: readonly TextileEvidence[]
  readonly garments?: readonly TextileEvidence[]
  readonly supplies?: readonly SupplyItem[]
  readonly applicationRules?: readonly ApplicationRule[]
  /** Washers. A tumble dryer found here is planned as a dryer, never as a washer. */
  readonly machines?: readonly MachineEvidence[]
  readonly dryers?: readonly MachineEvidence[]
  readonly pricing?: PlannerPricing
  readonly policy?: PlannerPolicy
  readonly preferences?: PlannerPreferences
  readonly selectedMachineId?: string
  readonly waterCondition?: string
  readonly odorLevel?: string
  /** Normal planning, or Wash now; unset is normal. */
  readonly mode?: PlannerMode
  readonly loadPins?: readonly LoadPin[]
  readonly dismissedQuestions?: readonly DismissedQuestion[]
  /** Products left out of this pass. */
  readonly excludedSupplyIds?: readonly string[]
  /** The detergent this pass chose; every load uses one detergent, this one when it fits. */
  readonly detergentId?: string
  /** A person's label-backed pretreatment choice for each stained piece; not a completed step. */
  readonly pretreatmentChoices?: readonly { readonly textileId: string; readonly supplyId: string }[]
  /**
   * Internal, set only by `planLoadOn`: a step whose label row was written for another kind of
   * washer moves to where this washer takes it, and no alternates are planned.
   */
  readonly adaptPlacements?: true
  readonly [key: string]: unknown
}

export type DecisionReasonCode =
  | 'care_prohibition'
  | 'care_compatibility'
  | 'needs_confirmation'
  | 'product_restriction'
  | 'dye_first_wash_risk'
  | 'capacity_limit'
  | 'dose_rule_selected'
  | 'machine_placement'
  | 'shared_compartment_conflict'
  | 'machine_substitution'
  | 'drying_decision'
  | 'cost_calculated'
  | 'ownership_preserved'
  | 'preference_applied'
  | 'product_left_out'
  | 'pin_refused'
  | 'preference_overridden'

export interface DecisionReason {
  readonly id: string
  readonly code: DecisionReasonCode
  readonly priority: number
  readonly textileIds: readonly string[]
  readonly loadId?: string
  readonly supplyId?: string
  readonly machineId?: string
  readonly details: Readonly<Record<string, JsonValue>>
}

export interface TreatmentStep {
  readonly productConfirmation?: ProductLoadConfirmation
  readonly productRequirement?: { readonly sourceDigest: string; readonly loadFingerprint: string; readonly colorfastnessRequired: boolean; readonly sourceLoadCategories: readonly string[]; readonly ordinaryWashRouteRequired?: boolean; readonly washContextFingerprint?: string }
  readonly soak?: { readonly waterLitres: number; readonly minimumMinutes: number; readonly maximumMinutes: number; readonly maximumTemperatureC: number; readonly transfer: string }
  readonly textileId?: string
  readonly order?: number
  readonly supplyId: string
  readonly dose: Dose
  readonly measurementCue: string | null
  readonly stage: ApplicationStage
  readonly placement: AnyPlacement
  readonly timing: string | null
  readonly rationale: string
  readonly source: string
  readonly confirmation: 'confirmed' | 'needs_confirmation'
  readonly temperatureC?: number | null
  readonly isolated?: boolean
  readonly preventDrying?: boolean
  readonly ruleId?: string
  /** The facts about the load that chose the label row, in words; null when the row fits any load. */
  readonly basis?: string | null
  /** Every mark on the product's cap or scoop, for a dose read from a mark. */
  readonly marks?: readonly string[]
  /** The printed volume a mark dose comes to, only when the label prints one. */
  readonly equivalent?: { readonly amount: number; readonly unit: string } | null
  /** Taken back out after use, so nothing is consumed. */
  readonly reusable?: boolean
  /** Set when the dose depends on how full the drum or dryer is; `dose` is then `{ amount: 0, unit: 'at_machine' }`. */
  readonly atMachine?: AtMachine
  /** The soft-water dose for this row (dose plan P2). Not shown yet: `dose` stays the label dose. */
  readonly calculatedDose?: CalculatedDose
}

/** A dose on a checklist: every mark on the product's cap and the printed volume, when there are any. */
export interface StepDose extends Dose {
  readonly marks?: readonly string[]
  readonly equivalent?: { readonly amount: number; readonly unit: string }
}

/** The load facts a dose was read with, so the row can be chosen once the size is known. */
export interface DoseContextSnapshot {
  readonly soilLevel: SoilLevel | null
  readonly unrecordedSoil: boolean
  readonly applianceType: string | null
  readonly machineClasses: readonly string[]
  readonly washerClassKnown: boolean
  readonly cycles: readonly string[]
  readonly materials: readonly string[]
  /** Set only when the planner input had a qualifying water condition. */
  readonly waterCondition?: string
  /** Set only when a garment in the load had a fresh stain. */
  readonly freshStain?: boolean
}

/** A size the drum could be that the label gives a dose for. */
export interface AtMachineCandidate {
  readonly size: LoadSize
  readonly ruleId: string
  readonly row: number | null
  readonly rowText: string | null
  readonly dose: StepDose
  /** The soft-water dose for this row (dose plan P2). Not shown yet. */
  readonly calculatedDose?: CalculatedDose
}

/**
 * A dose chosen at the machine from the person's answer to how full the drum (or dryer) is.
 * No candidates: the person said the label depends on the size, and the row is asked there.
 */
export interface AtMachine {
  readonly machine: 'washer' | 'dryer'
  readonly context: DoseContextSnapshot
  readonly candidates: readonly AtMachineCandidate[]
  readonly resolvedSize?: LoadSize
  /** The chosen row's typed line, for display. */
  readonly lineText?: string
}

export interface OwnerAssignment {
  readonly textileId: string
  readonly ownerId: string
}

export interface LoadPlan {
  readonly personalSuggestions?: PersonalPlannerGuidance
  /** Withheld from optional suggestions, still inspectable for an explicit choice/reassessment. */
  readonly withheldProductRecommendations?: readonly BenefitDecision[]
  readonly garmentAdvice?: readonly GarmentAdvice[]
  readonly productRecommendations?: readonly BenefitDecision[]
  readonly labelPreparation?: readonly { readonly textileIds: readonly string[]; readonly wording: string }[]
  readonly id: string
  readonly textileIds: readonly string[]
  readonly owners: readonly OwnerAssignment[]
  readonly bulkUnits: number
  /** The packing capacity: the washer's recorded size, or about a default one when it was skipped. */
  readonly capacityUnits: number
  readonly machineId: string | null
  readonly machineModelId: string | null
  readonly cycle: string
  /** The coolest maximum among the garments; a garment with none recorded counts as cold (30 °C). */
  readonly temperatureC: number | null
  readonly treatments: readonly TreatmentStep[]
  readonly status: 'ready' | 'needs_confirmation'
  /** Always null: a dose's size is never estimated, only read off the drum at the machine. */
  readonly loadSize: LoadSize | null
  /** The heaviest soil level recorded on the load's garments. */
  readonly soilLevel: SoilLevel | null
  readonly washerClass: WasherClass | null
  /** Null when the household records no dryer. */
  readonly drying: DryingPlan | null
  /** Set only in a shared room with more than one kind of washer: the washers of this load's own kind. */
  readonly roomMachineIds?: readonly string[]
  /** Set only with `roomMachineIds`: the same load planned on each other kind of washer in the room. */
  readonly alternates?: readonly LoadAlternate[]
  /** Set when the household has a detergent: the one this load uses and every detergent that could be switched to. */
  readonly detergent?: LoadDetergent
}

/** The single detergent a load uses, with every detergent left in this pass and whether it fits the load. */
export interface LoadDetergent {
  readonly chosenId: string | null
  readonly options: readonly { readonly supplyId: string; readonly fits: boolean; readonly cause?: string }[]
}

/** Why another kind of washer can't take a load as planned, from the blocking reason's details. */
export interface AlternateProblem {
  readonly cause: string
  readonly supplyId?: string
}

/** A load planned on another kind of washer in the same room; the lowest id stands for the kind. */
export interface LoadAlternate {
  readonly labelPreparation?: LoadPlan['labelPreparation']
  readonly machineId: string
  readonly machineIds: readonly string[]
  readonly applianceType: string | null
  readonly washerClass: WasherClass | null
  readonly capacityUnits: number
  readonly cycle: string
  readonly temperatureC: number | null
  /** The steps on that kind of washer; empty unless it can take the load. */
  readonly treatments: readonly TreatmentStep[]
  readonly status: 'ready' | 'too_full' | 'blocked'
  readonly problems: readonly AlternateProblem[]
}

/** A load planned on one washer: ready with its steps, too full for it, or blocked with why. */
export type LoadOn =
  | { readonly status: 'ready'; readonly load: LoadPlan }
  | { readonly status: 'too_full' }
  | { readonly status: 'blocked'; readonly problems: readonly AlternateProblem[] }

export interface Exclusion {
  readonly textileId: string
  readonly reasonIds: readonly string[]
  readonly reasonCodes: readonly DecisionReasonCode[]
}

export interface PlanCost {
  readonly currency: string
  readonly washer: number
  readonly dryer: number
  readonly supplies: number
  readonly total: number
}

export interface PlanExplanation {
  readonly reasonId: string
  readonly code: DecisionReasonCode
  readonly text: string
}

export interface PlanResult {
  readonly plannerVersion: PlannerVersion
  readonly mode: PlannerMode
  /** The canonicalized input the plan was computed from; `inputHash` is its SHA-256. */
  readonly inputSnapshot: PlannerInput
  readonly inputHash: string
  readonly status: 'ready' | 'needs_confirmation'
  readonly loads: readonly LoadPlan[]
  readonly exclusions: readonly Exclusion[]
  readonly cost: PlanCost
  readonly warnings: readonly string[]
  readonly reasons: readonly DecisionReason[]
  readonly explanations: readonly PlanExplanation[]
}

export type ReasonDraft = Omit<DecisionReason, 'id'> & { readonly key: string }

export type Item = { readonly source: TextileEvidence; readonly id: string; readonly ownerId: string; readonly bulkUnits: number; readonly soil: SoilLevel | null }

export type WorkingLoad = {
  id: string
  items: Item[]
  machine: MachineEvidence
  treatments: TreatmentStep[]
  status: 'ready' | 'needs_confirmation'
  drying: DryingPlan | null
  detergent?: LoadDetergent
  /** Formed from the person's pins, so its soft rules were set aside as arranged. */
  pinned: boolean
  /** Light and dark garments share it against the colour rule, so it washes cold. */
  coldOnly: boolean
}

export type ExclusionDraft = { readonly textileId: string; readonly reasonKeys: string[] }

/** Washers in one room that take the same steps; the lowest id stands for them all. */
export interface RoomClass {
  readonly key: string
  readonly machineIds: readonly string[]
  readonly representative: MachineEvidence
}

/** A treatment the app itself planned and recorded as done, then washed out by the wash that followed. */
export interface WashedOutTreatment {
  readonly name: string
  readonly supplyId: string
  readonly chemistry?: StainChemistry
  readonly washedOut: true
}

export type BleachKind = 'chlorine' | 'oxygen'

/** A clothing profile's product requirements; no diagnosis is needed or kept. */
export interface ProfileRequirements {
  readonly fragranceFree?: boolean
  readonly dyeFree?: boolean
  readonly avoidIngredients?: readonly string[]
  readonly acceptedSupplyIds?: readonly string[]
}
