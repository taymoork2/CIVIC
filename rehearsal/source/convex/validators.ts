import { v, type Infer, type VLiteral, type VUnion } from 'convex/values'

export const fabricDetails = v.object({
  fibers: v.optional(v.array(v.object({ fiber: v.string(), details: v.array(v.string()) }))),
  construction: v.optional(v.array(v.string())),
  finishes: v.optional(v.array(v.string())),
})
import { dryerProgramMode } from './dryerContextValues'
import { catalogBinding } from './catalogValues'
import { careInstructions, washProcesses, dryingProcessContext } from './careInstructions'
import { personalRoutine } from './personalRoutineValues'
import { garmentDecoration, adviceReminder, adviceContext } from './garmentAdviceValues'
import { outcomeResult, outcomeStage } from './outcomeValues'

export const guidanceStage = v.union(v.literal('intent'), v.literal('setup'), v.literal('household'), v.literal('clothes'), v.literal('laundry'))
export const guidanceState = v.object({
  status: v.union(v.literal('not_started'), v.literal('started'), v.literal('completed'), v.literal('dismissed')),
  stage: guidanceStage,
  updatedAt: v.number(),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
})

import {
  applianceTypes,
  availabilityStates,
  bleachAnswers,
  careStatuses,
  colorGroups,
  colorPolicies,
  countUnits,
  dryMethods,
  dyeRunStates,
  smells,
  dryingMethods,
  neededBy,
  dryerHeats,
  drumVolumeUnits,
  dryerPlacements,
  evidenceLevels,
  flagReasons,
  garmentKinds,
  heavyLightMixingPolicies,
  ironSteamAnswers,
  loadSizes,
  machineLocations,
  measureKinds,
  occasions,
  optimizations,
  placements,
  plannerModes,
  soilLevels,
  stainKinds,
  stainChemistries,
  productBleachKinds,
  productCapabilities,
  stages,
  supplyKinds,
  supplyUses,
  washMethods,
  washerClasses,
  wearerKinds,
  type StepPhase,
} from '@washcloset/planner'

/** A union validator over a vocabulary list, so the schema cannot drift from the shared words. */
export function literals<const T extends readonly [string, ...string[]]>(values: T): VUnion<T[number], VLiteral<T[number]>[]> {
  const members = values.map((value) => v.literal(value)) as unknown as [VLiteral<T[number]>, VLiteral<T[number]>, ...VLiteral<T[number]>[]]
  return v.union(...members) as VUnion<T[number], VLiteral<T[number]>[]>
}

export const evidenceLevel = literals(evidenceLevels)
export const washMethod = literals(washMethods)
export const placement = literals(placements)
export const stage = literals(stages)
export const supplyKind = literals(supplyKinds)
export const colorGroup = literals(colorGroups)
export const availability = literals(availabilityStates)
export const applianceType = literals(applianceTypes)
export const careStatus = literals(careStatuses)
export const colorPolicy = literals(colorPolicies)
export const heavyLightMixing = literals(heavyLightMixingPolicies)
export const optimization = literals(optimizations)
export const soilLevel = literals(soilLevels)
export const loadSize = literals(loadSizes)
export const washerClass = literals(washerClasses)
export const measureKind = literals(measureKinds)
export const countUnit = literals(countUnits)
export const dryMethod = literals(dryMethods)
export const dryerHeat = literals(dryerHeats)
/** Stored garment states. "In the wash" and "in the dryer" are derived from the running session, never stored. */
export const textileStatus = literals(['clean', 'dirty', 'hanging', 'needs_dry_clean', 'at_cleaner', 'needs_refresh'])
export type TextileStatus = Infer<typeof textileStatus>
export const garmentKind = literals(garmentKinds)
export const occasion = literals(occasions)
export const flagReason = literals(flagReasons)
export const wearerKind = literals(wearerKinds)
export const machineLocation = literals(machineLocations)
export const supplyUse = literals(supplyUses)
export const ironSteam = literals(ironSteamAnswers)
/** The tag's bleach triangle; omitted when the tag doesn't say. */
export const bleach = literals(bleachAnswers)
export const dyeRun = literals(dyeRunStates)
/** Thrift or hand-me-down, as asked at intake; its presence is the fact, and every part is optional. */
export const preOwned = v.object({ smell: v.optional(literals(smells)), fragile: v.optional(v.boolean()), heatTreat: v.optional(v.boolean()) })
export const plannerMode = literals(plannerModes)
/** A drum volume as the machine's sticker prints it; the about-capacity is derived from it on write. */
export const drumVolume = v.object({ amount: v.number(), unit: literals(drumVolumeUnits) })
export const stainKind = literals(stainKinds)
export const stainChemistry = literals(stainChemistries)
/**
 * An earlier stain treatment: words someone typed, or a treatment the app planned, saw done, and that the
 * following wash rinsed out. Only the second lets the planner offer a different product without asking.
 */
export const treatmentAttempt = v.union(v.string(), v.object({ name: v.string(), supplyId: v.string(), chemistry: v.optional(stainChemistry), washedOut: v.literal(true) }))
export const stainReport = v.object({
  kind: stainKind,
  priorTreatmentAttempts: v.union(v.array(treatmentAttempt), v.literal('unknown')),
})
/**
 * An old, set-in stain recorded at intake as part of how the garment looks: no flag, nothing held up.
 * `reason` and `kind` are what a stain flag would carry if someone later tries treating it.
 */
export const knownStain = v.object({ reason: flagReason, kind: stainKind, recordedAt: v.number() })
/**
 * A stain that went through a wash and is not yet confirmed gone: what it was, what was tried, how many
 * washes it has had, and the last answer to "Stain gone?" (lighter, still there, or worse, which ends home tries). It ends when the stain
 * is gone, is kept as a known mark, or the garment is retired; a wash never ends it silently.
 */
export const stainCheck = v.object({
  reason: flagReason,
  kind: stainKind,
  tried: v.array(treatmentAttempt),
  washes: v.number(),
  washedAt: v.number(),
  answer: v.optional(v.union(v.literal('lighter'), v.literal('still_there'), v.literal('worse'))),
  /**
   * Set while the only answer is one an outcome assessment gave: 'assessment' when it opened the check,
   * 'reopened' when it re-opened one answered gone. Clearing that assessment undoes it; any answer the
   * person gives on the garment drops it.
   */
  openedBy: v.optional(v.union(v.literal('assessment'), v.literal('reopened'))),
})
/** Observations, not a diagnosis or permission to add chemicals. */
export const laundryObservation = v.object({
  problem: literals(['odor', 'oily', 'stiff', 'waxy']),
  timing: literals(['after_wash', 'after_drying', 'during_storage', 'after_wearing', 'unknown']),
  recurring: v.boolean(),
  previousWash: v.optional(v.string()),
})
export const treatmentOutcome = v.object({
  result: outcomeResult,
  checkedWhen: outcomeStage,
  note: v.optional(v.string()),
  recordedAt: v.number(),
  recordedBy: v.string(),
})
export const soakDirections = v.object({
  waterLitres: v.number(),
  minimumMinutes: v.number(),
  maximumMinutes: v.number(),
  maximumTemperatureC: v.number(),
  transfer: v.string(),
})
/** Why, how urgently and by whom a garment was put in the hamper. Cleared by every wash. */
export const textileFlag = v.object({
  /** May be empty (Wash now, Need it). */
  reasons: v.array(flagReason),
  /** Where the stain is, as typed; at most 80 characters. */
  stainNote: v.optional(v.string()),
  stainReport: v.optional(stainReport),
  observation: v.optional(laundryObservation),
  /** The local end of the day it is needed by, in ms. */
  neededBy: v.optional(v.number()),
  /** The principal key of whoever flagged it. */
  flaggedBy: v.string(),
  flaggedAt: v.number(),
})
export type TextileFlag = Infer<typeof textileFlag>
/** What the tag prints about the garment itself, as typed. */
export const textileIdentity = v.object({
  brand: v.optional(v.string()),
  styleNumber: v.optional(v.string()),
  size: v.optional(v.string()),
  rnNumber: v.optional(v.string()),
  barcode: v.optional(v.string()),
})
/** A garment moved into a load: pins with the same group share a load. */
export const loadPin = v.object({ textileId: v.id('textiles'), group: v.number() })
/** A question card the person answered without a label row, for the context it was asked in. */
export const dismissedQuestion = v.object({
  kind: v.union(v.literal('label_row'), v.literal('washer_he')),
  /** The supply id for a label row, the machine id for HE. */
  subjectId: v.string(),
  context: v.object({ soilLevel: v.optional(soilLevel), washerClass: v.optional(washerClass) }),
  answer: v.union(v.literal('label_doesnt_say'), v.literal('depends_on_size'), v.literal('cant_tell')),
})
/** Where a rule's product goes: a washer placement, or the dryer drum for dryer products. Machines keep `placement`. */
export const rulePlacement = literals([...placements, ...dryerPlacements, 'manual'] as const)

/** Where a record came from and how sure the household is of it. */
export const provenance = v.object({ source: v.string(), confidence: evidenceLevel })
export type Provenance = Infer<typeof provenance>

/** A curated evidence candidate; not permission to replace an owner's care label. */
export const catalogCandidate = v.object({
  brandId: v.string(), productId: v.string(), variantId: v.string(), evidenceRevisionId: v.string(),
  source: v.string(), market: v.string(), reviewedAt: v.string(), status: v.literal('candidate'),
})

/** At preparation time; quantities refer to inventory rows, not inferred lifetime tracking. */
export const preparedGarmentContext = v.object({
  decoration: v.optional(garmentDecoration), adviceReminder: v.optional(adviceReminder),
  textileId: v.id('textiles'), name: v.string(), color: v.optional(v.string()),
  ownerPrincipalKey: v.optional(v.string()), firstWashState: v.optional(v.union(v.literal('unwashed'), v.literal('washed'), v.literal('unknown'))),
  dyeRun: v.optional(dyeRun),
  colorGroup: v.optional(v.string()), kind: v.optional(garmentKind), wearerId: v.optional(v.id('wearers')),
  soilLevel: v.optional(soilLevel), stainReport: v.optional(stainReport), observation: v.optional(laundryObservation),
  identity: v.optional(textileIdentity), catalogCandidate: v.optional(catalogCandidate),
  catalogBinding: v.optional(catalogBinding),
  personalRoutine: v.optional(personalRoutine),
  care: v.optional(v.object({ material: v.optional(v.string()), washMethod: v.optional(washMethod),
    maxTemperatureC: v.optional(v.number()), restrictions: v.array(v.string()), instructions: v.optional(careInstructions), status: careStatus, provenance })),
})
export const preparationContext = v.object({ capturedAt: v.number(), garments: v.array(preparedGarmentContext) })

/** The same evidence in the planner's `{ source, status }` spelling, kept inside machine profiles. */
export const evidenceRecord = v.object({ source: v.optional(v.string()), status: evidenceLevel })

export const formulation = v.object({
  name: v.optional(v.string()),
  form: v.optional(v.string()),
  highEfficiencyCompatible: v.optional(v.boolean()),
})

/** A mark printed on a cap or scoop, stored as printed, with the volume the label prints for it if any. */
export const measureMark = v.object({ label: v.string(), amount: v.optional(v.number()), unit: v.optional(v.string()) })
export const supplyMeasure = v.object({ kind: measureKind, marks: v.optional(v.array(measureMark)), countUnit: v.optional(countUnit) })
export type SupplyMeasure = Infer<typeof supplyMeasure>

/** For a `cap` or `scoop` unit, `amount` is the number of fills to `mark`. */
export const dose = v.object({ amount: v.number(), unit: v.string(), mark: v.optional(v.string()), fractionOfMark: v.optional(v.number()), target: v.optional(v.union(v.literal('below'), v.literal('just_below'))), approximate: v.optional(v.boolean()), measurementCue: v.optional(v.union(v.string(), v.null())) })
export const sourceLoadCategory = v.union(v.literal('smaller'), v.literal('standard'), v.literal('larger'), v.literal('normal'))
export const productLoadConfirmation = v.object({ supplyId: v.string(), sourceDigest: v.string(), loadFingerprint: v.string(), colorfastnessChecked: v.boolean(), sourceLoadCategory: v.optional(sourceLoadCategory), ordinaryWashRouteChecked: v.optional(v.boolean()), washContextFingerprint: v.optional(v.string()) })
export type Dose = Infer<typeof dose>

/** What a clothing profile needs of every product used on their clothes; no diagnosis is stored. */
export const wearerRequirements = v.object({
  fragranceFree: v.optional(v.boolean()),
  dyeFree: v.optional(v.boolean()),
  avoidIngredients: v.optional(v.array(v.string())),
  acceptedSupplyIds: v.optional(v.array(v.id('supplies'))),
})
export type WearerRequirements = Infer<typeof wearerRequirements>

/** Label facts, transcribed explicitly; product names are not chemical evidence. */
export const productSafety = v.object({
  sourceContract: v.optional(v.object({ digest: v.string(), mixing: v.optional(v.union(v.literal('no_bleach_or_liquid_softener'), v.literal('regular_detergent_only'))), excludedFibers: v.optional(v.array(v.string())), requireKnownMaterial: v.optional(v.boolean()), requireColorfastness: v.optional(v.boolean()), requireOrdinaryWashRoute: v.optional(v.boolean()), sourceLoadCategories: v.optional(v.array(sourceLoadCategory)) })),
  capabilities: v.optional(v.array(v.object({
    kind: literals(productCapabilities), status: literals(['present', 'absent', 'unknown']),
    variant: v.string(), market: v.string(), formulationRevision: v.string(), source: v.string(), retrievedAt: v.number(),
    scope: literals(['ingredient_disclosure', 'manufacturer_claim', 'explicit_absence']),
  }))),
  bleachKind: literals(productBleachKinds),
  incompatibleSupplyIds: v.array(v.id('supplies')),
  incompatibleMaterials: v.array(v.string()),
  /** Label facts about the pack. Absent means not recorded; none is ever set from the product name. */
  fragrance: v.optional(v.union(v.literal('free'), v.literal('scented'), v.literal('unknown'))),
  dye: v.optional(v.union(v.literal('free'), v.literal('dyed'), v.literal('unknown'))),
  ingredients: v.optional(v.array(v.string())),
  /** Where those facts were read, e.g. `pack_label`. */
  factSource: v.optional(v.string()),
  /** Exact pack/formulation evidence. Generic "enzymes" never establishes lipase. */
  lipase: v.optional(v.object({ status: literals(['present', 'absent', 'unknown']), formulation: v.string(), source: v.string() })),
  /** Exact-pack rinse route. Presoak directions do not establish an automatic-rinse contact time. */
  sanitizing: v.optional(v.object({ route: v.literal('rinse'), minimumContactMinutes: v.number(), formulation: v.string(), source: v.string() })),
  pretreatment: v.optional(v.object({
    stainChemistry: v.optional(stainChemistry),
    stainKinds: v.array(stainKind),
    dose,
    timing: v.string(),
    safeMaterials: v.array(v.string()),
    maximumTemperatureC: v.optional(v.number()),
    maximumPH: v.optional(v.number()),
    soak: v.optional(soakDirections),
  })),
})

export const usedProductContext = v.object({
  capturedAt: v.number(), provenance,
  formulation: v.optional(v.union(v.string(), formulation)),
  safety: v.optional(productSafety), fixtureKey: v.optional(v.string()),
  catalogBinding: v.optional(catalogBinding),
})

/** A dose on the load checklist: the product's marks and the printed volume the mark comes to. */
export const stepDose = v.object({ ...dose.fields, marks: v.optional(v.array(v.string())), equivalent: v.optional(v.object({ amount: v.number(), unit: v.string() })) })

/** The load facts a dose was selected with, kept so the row can be chosen once the person says how full the drum is. */
const doseContextSnapshot = v.object({
  soilLevel: v.union(soilLevel, v.null()),
  unrecordedSoil: v.boolean(),
  applianceType: v.union(v.string(), v.null()),
  machineClasses: v.array(v.string()),
  washerClassKnown: v.boolean(),
  cycles: v.array(v.string()),
  materials: v.array(v.string()),
  /** Set only when the plan had a qualifying water condition; older snapshots have none. */
  waterCondition: v.optional(v.string()),
  freshStain: v.optional(v.boolean()),
})

/** The soft-water dose for a label row (dose plan P2), carried but not shown yet. */
const calculatedDose = v.object({
  dose: stepDose,
  adjustment: v.object({ kind: v.literal('soft_water_half'), sourceIds: v.array(v.string()) }),
})

/** A dose that depends on the load size, settled at the machine from the drum or dryer fullness answer. */
export const atMachine = v.object({
  machine: v.union(v.literal('washer'), v.literal('dryer')),
  context: doseContextSnapshot,
  candidates: v.array(v.object({ size: loadSize, ruleId: v.string(), row: v.union(v.number(), v.null()), rowText: v.union(v.string(), v.null()), dose: stepDose, calculatedDose: v.optional(calculatedDose) })),
  resolvedSize: v.optional(loadSize),
  /** The chosen row's typed `rowText`, for display. */
  lineText: v.optional(v.string()),
})
export type AtMachine = Infer<typeof atMachine>

export const ruleConditions = v.object({
  sourceLoadCategories: v.optional(v.array(sourceLoadCategory)),
  minBulkUnits: v.optional(v.number()),
  maxBulkUnits: v.optional(v.number()),
  cycles: v.optional(v.array(v.string())),
  loadSizes: v.optional(v.array(loadSize)),
  soilLevels: v.optional(v.array(soilLevel)),
  machineClasses: v.optional(v.array(v.string())),
  materials: v.optional(v.array(v.string())),
})
export type RuleConditions = Infer<typeof ruleConditions>

/** The dryer time a held-back wash start is timed from: a drying run or a wash session (`key`), when it ends, and whether the person typed it ("Dryer says"), which only this phone knows. */
export const startLoadBasis = v.object({ key: v.string(), end: v.number(), source: v.union(v.literal('entered'), v.literal('wash'), v.literal('says')) })

/** A dryer's heat button: the heat it gives and the words printed on it. `tempF` is retired: stored rows may still carry it, but nothing reads or writes it; a button's temperature comes from the model's spec sheet. */
export const heatSetting = v.object({ heat: dryerHeat, label: v.string(), tempF: v.optional(v.number()) })

/**
 * A washer's dispensing options. Household-entered machines carry `placements`; the sample
 * fixture carries the manufacturer-style compartments it was written with.
 */
export const dispensingProfile = v.object({
  placements: v.optional(v.array(v.string())),
  compartments: v.optional(v.array(v.union(v.string(), v.object({
    id: v.string(),
    capacity: v.optional(v.number()),
    capacityUnit: v.optional(v.string()),
    release: v.optional(v.string()),
    cycles: v.optional(v.array(v.string())),
    evidence: v.optional(evidenceRecord),
  })))),
  directToDrum: v.optional(v.boolean()),
  centerAgitator: v.optional(v.boolean()),
  downyBall: v.optional(v.boolean()),
  automatic: v.optional(v.boolean()),
  manual: v.optional(v.boolean()),
  release: v.optional(v.string()),
  requiredCycles: v.optional(v.array(v.string())),
  evidence: v.optional(evidenceRecord),
  evidenceConfidence: v.optional(evidenceLevel),
})
export type DispensingProfile = Infer<typeof dispensingProfile>

/** Cycle lengths by cycle name, each with the evidence level of the machine that supplied it. */
export const cycleProfile = v.object({
  cycles: v.record(v.string(), v.object({ durationMinutes: v.number(), confidence: evidenceLevel, mode: v.optional(dryerProgramMode) })),
})
export type CycleProfile = Infer<typeof cycleProfile>
export const startedMachineContext = v.object({
  machineId: v.id('machines'), capturedAt: v.number(), name: v.string(), model: v.optional(v.string()),
  highEfficiency: v.optional(v.boolean()), provenance, telemetry: v.literal(false),
  catalogBinding: v.optional(catalogBinding), applianceType: v.optional(applianceType),
  capacityUnits: v.optional(v.number()), capacityConfidence: v.optional(evidenceLevel),
  cycleProfile: v.optional(cycleProfile), drumVolume: v.optional(drumVolume),
  washProcesses: v.optional(washProcesses),
})
/** Captured at an explicit drying start; settings are recorded facts, never telemetry. */
export const dryingRunContext = v.object({
  version: v.literal(1), capturedAt: v.number(),
  machine: v.optional(v.object({ ...startedMachineContext.fields,
    heatSettings: v.optional(v.array(heatSetting)),
  })),
  load: v.object({ pieceCount: v.number(), bulkUnits: v.number(), fit: v.string() }),
  products: v.array(v.object({ supplyId: v.id('supplies'), name: v.string(),
    amount: v.optional(v.number()), unit: v.optional(v.string()), mark: v.optional(v.string()), fractionOfMark: v.optional(v.number()),
    context: usedProductContext,
  })),
})
/** Recorded time from sanitizer release to draining, for one actual washer program. */
export const rinseContact = v.record(v.string(), v.object({ minutes: v.number(), source: v.string(), placement: v.string(), timing: v.optional(v.string()) }))

const stepPhases = [
  'drum', 'load', 'drum_fullness', 'with_load', 'close', 'dispenser', 'start', 'cycle',
  'hold_out', 'dryer_load', 'dryer_fullness', 'dryer_with_load', 'dryer_start', 'dryer_unload',
] as const satisfies readonly StepPhase[]
export const stepPhase = literals(stepPhases)
export const actionStatus = v.union(v.literal('pending'), v.literal('confirmed'), v.literal('skipped'), v.literal('missed'))
export type ActionStatus = Infer<typeof actionStatus>

const recorded = {
  order: v.number(),
  status: actionStatus,
  recordedAt: v.optional(v.number()),
  recordedBy: v.optional(v.string()),
  /** Exact acknowledged device tap, so recovery cannot record product use twice. */
  receiptId: v.optional(v.string()),
  receiptPayload: v.optional(v.string()),
}

/**
 * A product step on the load checklist. `supplyId` is a supply id, or the planner's stain placeholder.
 * A step whose dose waits for the fullness answer carries `atMachine` and the dose `{ amount: 0, unit: 'at_machine' }`.
 */
export const productRequirement = v.object({ sourceDigest: v.string(), loadFingerprint: v.string(), colorfastnessRequired: v.boolean(), sourceLoadCategories: v.array(v.string()), ordinaryWashRouteRequired: v.optional(v.boolean()), washContextFingerprint: v.optional(v.string()) })
export const treatmentAction = v.object({
  productConfirmation: v.optional(productLoadConfirmation),
  productRequirement: v.optional(productRequirement),
  id: v.string(),
  kind: v.literal('treatment'),
  phase: stepPhase,
  supplyId: v.string(),
  textileId: v.optional(v.string()),
  temperatureC: v.optional(v.union(v.number(), v.null())),
  stage: v.string(),
  placement: v.string(),
  dose: stepDose,
  soak: v.optional(soakDirections),
  soakStarted: v.optional(v.object({ at: v.number(), waterLitres: v.number(), temperatureC: v.number(), productName: v.string(), amount: v.number() })),
  /** The facts about the load that chose the label row, in words. */
  basis: v.optional(v.string()),
  /** Comes back out of the dryer, so confirming it uses nothing up. */
  reusable: v.optional(v.boolean()),
  atMachine: v.optional(atMachine),
  timing: v.union(v.string(), v.null()),
  confidence: evidenceLevel,
  dueAt: v.optional(v.number()),
  windowStartAt: v.optional(v.number()),
  windowEndAt: v.optional(v.number()),
  machineTelemetry: v.boolean(),
  offsetMinutes: v.union(v.number(), v.null()),
  reminderJobId: v.optional(v.string()),
  ...recorded,
})

/** A step a person performs: loading the garments, closing the door, pressing Start, and the drying steps. */
export const taskAction = v.object({
  id: v.string(),
  kind: v.literal('task'),
  task: v.union(
    v.literal('garment_advice'),
    v.literal('care_preparation'),
    v.literal('load'),
    v.literal('drum_fullness'),
    v.literal('close'),
    v.literal('start'),
    v.literal('hold_out'),
    v.literal('dryer_load'),
    v.literal('dryer_fullness'),
    v.literal('dryer_start'),
    v.literal('dryer_unload'),
  ),
  phase: stepPhase,
  title: v.string(),
  detail: v.union(v.string(), v.null()),
  advice: v.optional(adviceContext),
  dueAt: v.optional(v.number()),
  /** The garments a loading or drying step names, with how each one dries when it stays out. */
  garments: v.optional(v.array(v.object({ textileId: v.id('textiles'), method: v.optional(v.string()) }))),
  ...recorded,
})

export const timelineAction = v.union(treatmentAction, taskAction)

/** How a piece is dried, and where that choice came from (see `pieceMethod` in the planner). */
export const dryingMethod = literals(dryingMethods)
export const neededByValue = literals(neededBy)
export const methodSource = v.union(v.literal('label'), v.literal('once'), v.literal('preference'), v.literal('routine'), v.literal('stain'))
export const methodEvidenceValue = v.union(v.literal('allowed'), v.literal('conflict'), v.literal('not_specified'), v.literal('not_established'), v.literal('tag_unknown'))
/** "Remember for this garment": a drying method kept on the garment until "Follow label again". The label is unchanged. */
export const dryingPreference = v.object({ method: dryingMethod, setAt: v.number(), setBy: v.string() })
/** How a piece actually dried, fixed when it started drying, for its wash record and history. */
export const driedWith = v.object({ method: dryingMethod, scope: methodSource, evidence: methodEvidenceValue, label: v.string(), instructions: v.optional(careInstructions), personalRoutine: v.optional(personalRoutine), process: v.optional(dryingProcessContext) })

/** The drying plan a session started with, kept so a finished load still shows how it dried. */
export const dryingSnapshot = v.object({
  status: v.union(v.literal('ready'), v.literal('needs_confirmation'), v.literal('none')),
  dryerId: v.optional(v.id('machines')),
  heat: v.optional(dryerHeat),
  heatLabel: v.optional(v.string()),
  minutes: v.optional(v.number()),
  minutesConfidence: evidenceLevel,
  tumbleTextileIds: v.array(v.id('textiles')),
  heldOut: v.array(v.object({ textileId: v.id('textiles'), method: v.string(), reason: v.string() })),
  /** Whether the tumbling garments were checked against the dryer's capacity; absent on older sessions. */
  fit: v.optional(v.union(v.literal('fits'), v.literal('over'), v.literal('not_checked'))),
})
export type DryingSnapshot = Infer<typeof dryingSnapshot>
export type TreatmentAction = Infer<typeof treatmentAction>
export type TaskAction = Infer<typeof taskAction>
export type TimelineAction = Infer<typeof timelineAction>

export const machineEventDetails = v.object({
  cycle: v.optional(v.union(v.string(), v.null())),
  previousMachineId: v.optional(v.union(v.string(), v.null())),
  note: v.optional(v.string()),
  machineTelemetry: v.boolean(),
})
export type MachineEventDetails = Infer<typeof machineEventDetails>

export const outfitItem = v.object({
  key: v.string(), name: v.string(), color: v.union(v.string(), v.null()),
  colorGroup: v.union(v.string(), v.null()), kind: v.union(garmentKind, v.null()),
  brand: v.union(v.string(), v.null()), wearerId: v.union(v.id('wearers'), v.null()), quantity: v.number(),
})
