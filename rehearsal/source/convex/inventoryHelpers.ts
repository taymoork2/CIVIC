import { type Infer } from 'convex/values'
import { dryerProgramMode } from './dryerContextValues'
import { applianceTypes, washProcessProblem, nativeDoseProblem, countUnits, doseProblem, dryerHeats, dryerSupplyKinds, isDryer, isDryingMachine, machineRole, loadSizes, measureProblem, occasions, normalizeClothingTags, soilLevels, unitsPerCuFt, unitsPerLitre, useDirections, washerClasses, type DryerHeat, type LoadSize, type Occasion, type Placement, type SoilLevel, type SupplyUse } from '@washcloset/planner'
import { type Doc } from './_generated/dataModel'
import { fail } from './errors'
import { washProcesses, type CareInstructions } from './careInstructions'
import { applianceType, availability, bleach, colorGroup, dryMethod, dyeRun, drumVolume, rinseContact, ironSteam, placement, soilLevel, textileIdentity, washMethod, type CycleProfile, type Dose, type Provenance, type RuleConditions, type SupplyMeasure } from './validators'
import type { TagAnswers } from './inventory'

export function text(value: string, field: string, max = 120): string {
  const normalized = value.trim()
  if (normalized.length === 0) fail('invalid', `${field} must not be empty`)
  if (normalized.length > max) fail('invalid', `${field} is too long`)
  return normalized
}

export function optionalText(value: string | undefined, field: string, max = 120): string | undefined {
  if (value === undefined || value.trim().length === 0) return undefined
  return text(value, field, max)
}

export function positive(value: number, field: string, max: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > max) fail('invalid', `${field} must be between 0 and ${max}`)
  return value
}

export function cycleName(value: string): string {
  const normalized = text(value, 'Cycle', 40).toLowerCase().replace(/[\s-]+/g, '_')
  if (!/^[a-z0-9_]+$/.test(normalized)) fail('invalid', 'Cycle must use letters, numbers, and underscores')
  return normalized
}

/** The values a list names, once each, in vocabulary order, so equal conditions store (and hash) the same. */
function inVocabularyOrder<Value extends string>(values: readonly Value[] | undefined, vocabulary: readonly Value[]): Value[] | undefined {
  if (values === undefined || values.length === 0) return undefined
  return vocabulary.filter((value) => values.includes(value))
}

/**
 * Validates stored evidence. The sanitized development fixture is never real-world evidence,
 * so its source cannot be re-labelled with any confidence other than unknown.
 */
export function provenance(value: Provenance): Provenance {
  const source = text(value.source, 'Evidence source', 200)
  if (/sanitized[-_ ]?fixture/i.test(source) && value.confidence !== 'unknown') {
    fail('invalid', 'Fixture evidence cannot be claimed as verified household evidence')
  }
  return { source, confidence: value.confidence }
}

export type TextileFields = { name?: string; color?: string; colorGroup?: Doc<'textiles'>['colorGroup']; bulkUnits?: number; firstWash?: boolean; dyeRun?: Doc<'textiles'>['dyeRun'] }

export function textileFields(args: TextileFields): Partial<Doc<'textiles'>> {
  return {
    ...(args.name === undefined ? {} : { name: text(args.name, 'Name') }),
    ...(args.color === undefined ? {} : { color: optionalText(args.color, 'Color', 60) }),
    ...(args.colorGroup === undefined ? {} : { colorGroup: args.colorGroup }),
    ...(args.bulkUnits === undefined ? {} : { bulkUnits: positive(args.bulkUnits, 'Bulk', 10) }),
    ...(args.firstWash === undefined ? {} : { firstWash: args.firstWash }),
    ...(args.dyeRun === undefined ? {} : { dyeRun: args.dyeRun }),
  }
}

/** Occasions as stored: each once, in vocabulary order. An empty list is kept: it means "none", not the kind's default. */
export function occasionsFrom(values: readonly Occasion[]): Occasion[] {
  return occasions.filter((entry) => values.includes(entry))
}

export function tagsFrom(values: readonly string[]): string[] {
  try { return normalizeClothingTags(values) }
  catch (error) { return fail('invalid', error instanceof Error ? error.message : 'Invalid tags') }
}

export type TextileIdentity = Infer<typeof textileIdentity>

/** What the tag prints, each field trimmed; nothing typed is no identity at all. */
export function identityFrom(identity: TextileIdentity): TextileIdentity | undefined {
  const fields = {
    brand: optionalText(identity.brand, 'Brand', 80),
    styleNumber: optionalText(identity.styleNumber, 'Style or item number', 80),
    size: optionalText(identity.size, 'Size', 40),
    rnNumber: optionalText(identity.rnNumber, 'RN', 40),
    barcode: optionalText(identity.barcode, 'Barcode', 80),
  }
  const typed = Object.entries(fields).filter(([, value]) => value !== undefined)
  return typed.length === 0 ? undefined : Object.fromEntries(typed) as TextileIdentity
}

// ---- Care ------------------------------------------------------------------

export type CareFields = {
  material?: string
  fabricDetails?: Doc<'care'>['fabricDetails']
  washMethod: NonNullable<Doc<'care'>['washMethod']>
  cycle?: string
  maxTemperatureC?: number
  restrictions: readonly string[]
  instructions?: CareInstructions
  dryMethod?: Doc<'care'>['dryMethod']
  dryHeat?: DryerHeat
  ironSteam?: Doc<'care'>['ironSteam']
  ironHeat?: Doc<'care'>['ironHeat']
  steamPermission?: Doc<'care'>['steamPermission']
  bleach?: Doc<'care'>['bleach']
}

/** Tag taps count as read at once (owner answer 1); they are never `verified`. */
export const tagEvidence: Provenance = { source: 'tag_taps', confidence: 'observed' }

/** Numeric label limits survive edits to other care answers without rounding up to a dot. */
export function tagCare(tag: TagAnswers): CareFields {
  if (tag.maxTemperatureC !== undefined) positive(tag.maxTemperatureC, 'Maximum temperature', 95)
  const { washWithLikeColors, ...symbols } = tag
  return { ...symbols, restrictions: washWithLikeColors ? ['Wash with like colors'] : [] }
}

/**
 * The soil level a garment keeps after a change. Soil is recorded only while a garment needs a
 * wash: a clean garment has none. `null` clears it; omitted keeps what is recorded.
 */
export function nextSoil(textile: Doc<'textiles'>, status: Doc<'textiles'>['status'], soil: Doc<'textiles'>['soilLevel'] | null | undefined): Doc<'textiles'>['soilLevel'] {
  if (status === 'clean') {
    if (soil !== undefined && soil !== null) fail('invalid', 'Only a garment that needs a wash has a soil level')
    return undefined
  }
  return soil === undefined ? textile.soilLevel : soil ?? undefined
}

/** Ingredient names as typed from a label or a list: trimmed, de-duplicated by case, in the order given. */
export function ingredientList(values: readonly string[], field: string): string[] {
  if (values.length > 60) fail('invalid', 'List at most 60 ingredients')
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const name = text(value, field, 80)
    if (!seen.has(name.toLowerCase())) { seen.add(name.toLowerCase()); out.push(name) }
  }
  return out
}

// ---- Supplies and application rules ---------------------------------------

type Formulation = { name?: string; form?: string; highEfficiencyCompatible?: boolean }

export function formulation(value: Formulation | undefined): Formulation | undefined {
  if (value === undefined) return undefined
  const name = optionalText(value.name, 'Formulation', 80)
  const form = optionalText(value.form, 'Form', 40)
  if (name === undefined && form === undefined) return undefined
  return { name, form, highEfficiencyCompatible: value.highEfficiencyCompatible }
}

export function dryerKind(kind: Doc<'supplies'>['kind']): boolean {
  return (dryerSupplyKinds as readonly string[]).includes(kind)
}

/** A measure as printed, with each mark's words trimmed; refused in plain words when it cannot be followed. */
export function measureFrom(measure: SupplyMeasure): SupplyMeasure {
  const problem = measureProblem(measure)
  if (problem !== null) fail('invalid', problem)
  return {
    kind: measure.kind,
    ...(measure.marks === undefined || measure.marks.length === 0 ? {} : {
      marks: measure.marks.map((mark) => ({ label: mark.label.trim(), ...(mark.amount === undefined ? {} : { amount: mark.amount }), ...(mark.unit === undefined ? {} : { unit: mark.unit }) })),
    }),
    ...(measure.countUnit === undefined ? {} : { countUnit: measure.countUnit }),
  }
}

const markUnits = new Set(['cap', 'scoop'])

/**
 * A dose a label rule may store. A dose read from a cap, scoop or count follows the product's
 * measure exactly as the directions editor does; a printed amount (ml, g) stays as it always was.
 */
export function doseFrom(measure: SupplyMeasure | undefined, dose: { amount: number; unit: string; mark?: string; fractionOfMark?: number; target?: 'below' | 'just_below'; approximate?: boolean; measurementCue?: string }): Dose {
  const nativeProblem = nativeDoseProblem(dose)
  if (nativeProblem !== null) fail('invalid', nativeProblem)
  const unit = text(dose.unit, 'Dose unit', 20)
  const mark = optionalText(dose.mark, 'Mark', 40)
  const measurementCue = optionalText(dose.measurementCue, 'Measurement cue', 120)
  const measured = measure !== undefined && (unit === measure.kind || unit === measure.countUnit)
  if (mark !== undefined || markUnits.has(unit) || measured) {
    if (measure === undefined) fail('invalid', `Record the marks on the ${unit} first`)
    const problem = doseProblem(measure, { ...dose, unit, mark })
    if (problem !== null) fail('invalid', problem)
  } else {
    positive(dose.amount, 'Dose', 10_000)
    if ((countUnits as readonly string[]).includes(unit) && !Number.isInteger(dose.amount)) fail('invalid', 'A counted dose is a whole number')
  }
  const printed = mark === undefined ? undefined : measure?.marks?.find((entry) => entry.label.trim().toLowerCase() === mark.toLowerCase())?.label
  if (dose.fractionOfMark !== undefined && printed === undefined) fail('invalid', 'A fraction needs a recorded cap or scoop mark')
  return { amount: dose.amount, unit, ...(printed === undefined ? {} : { mark: printed }), ...(dose.fractionOfMark === undefined ? {} : { fractionOfMark: dose.fractionOfMark }), ...(dose.target === undefined ? {} : { target: dose.target }), ...(dose.approximate === undefined ? {} : { approximate: dose.approximate }), ...(measurementCue === undefined ? {} : { measurementCue }) }
}

/** The measure change is refused while a rule still fills to a mark it would remove. */
export function assertMarksKept(measure: SupplyMeasure, rules: readonly Doc<'rules'>[]): void {
  for (const rule of rules) {
    if (rule.dose.mark === undefined && !markUnits.has(rule.dose.unit)) continue
    const problem = doseProblem(measure, rule.dose)
    if (problem !== null) fail('conflict', `The label directions still use ${rule.dose.mark === undefined ? `the ${rule.dose.unit}` : `"${rule.dose.mark}"`}; change the directions first`)
  }
}

/** What a product is for decides what kind of product it is; the two cannot disagree. */
export function assertUseFits(use: SupplyUse | undefined, kind: Doc<'supplies'>['kind']): void {
  if (use !== undefined && useDirections(use, []).kind !== kind) fail('invalid', 'That kind of product does not match what it is for')
}

export function materialList(values: readonly string[]): string[] {
  if (values.length > 25) fail('invalid', 'List at most 25 materials')
  return [...new Set(values.map((value) => text(value, 'Material', 60)))].sort()
}

export function chemistryLimit(value: number | undefined, maximum: number, field: string): number | undefined {
  if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > maximum)) fail('invalid', `${field} must be between 0 and ${maximum}`)
  return value
}

/** Label taps count as read at once (owner answer 1); they are never `verified`. */
export const labelEvidence: Provenance = { source: 'label_taps', confidence: 'observed' }

export type RowShape = { sizes: readonly LoadSize[]; soils: readonly SoilLevel[]; join: 'or' | 'and'; classes: readonly string[] }

const sameList = (left: readonly string[], right: readonly string[]) => left.length === right.length && left.every((entry) => right.includes(entry))

export function sameShape(left: RowShape, right: RowShape): boolean {
  // How sizes and soils join matters only when a row has both.
  const joined = (shape: RowShape) => (shape.sizes.length > 0 && shape.soils.length > 0 ? shape.join : 'and')
  return sameList(left.sizes, right.sizes) && sameList(left.soils, right.soils) && joined(left) === joined(right) && sameList(left.classes, right.classes)
}

type LabelDose = { amount: number; unit: string; mark?: string | number | null; fractionOfMark?: number; target?: string; approximate?: boolean }

export const sameDose = (left: LabelDose, right: LabelDose) => left.amount === right.amount && left.unit === right.unit && (left.mark ?? null) === (right.mark ?? null)
  && (left.fractionOfMark ?? 1) === (right.fractionOfMark ?? 1) && left.target === right.target && (left.approximate ?? false) === (right.approximate ?? false)

/** A stored row's conditions, rebuilt from its rules: an or-row's rules each carry one side. */
export function storedShape(rules: readonly Doc<'rules'>[]): RowShape {
  const sizes = new Set<LoadSize>()
  const soils = new Set<SoilLevel>()
  const classes = new Set<string>()
  let split = false
  for (const rule of rules) {
    const { loadSizes: ruleSizes = [], soilLevels: ruleSoils = [], machineClasses = [] } = rule.conditions
    ruleSizes.forEach((size) => sizes.add(size))
    ruleSoils.forEach((soil) => soils.add(soil))
    machineClasses.forEach((entry) => classes.add(entry))
    split ||= (ruleSizes.length === 0) !== (ruleSoils.length === 0)
  }
  return { sizes: [...sizes], soils: [...soils], join: split && sizes.size > 0 && soils.size > 0 ? 'or' : 'and', classes: [...classes] }
}

const machineClassVocabulary: readonly string[] = [...washerClasses, ...applianceTypes]

/** Conditions as stored: each list once, in vocabulary order; empty lists mean no condition. */
export function conditionsFrom(conditions: RuleConditions, dryerProduct: boolean): RuleConditions {
  const unknownClass = conditions.machineClasses?.find((entry) => !machineClassVocabulary.includes(entry))
  if (unknownClass !== undefined) fail('invalid', `"${unknownClass}" is not a washer class or machine type`)
  const machineClasses = inVocabularyOrder(conditions.machineClasses, machineClassVocabulary)
  const soils = inVocabularyOrder(conditions.soilLevels, soilLevels)
  if (dryerProduct && (soils !== undefined || machineClasses?.some((entry) => (washerClasses as readonly string[]).includes(entry)))) {
    fail('invalid', 'Dryer product labels do not dose by soil level or washer class')
  }
  const sizes = inVocabularyOrder(conditions.loadSizes, loadSizes)
  return {
    ...(conditions.sourceLoadCategories === undefined ? {} : { sourceLoadCategories: conditions.sourceLoadCategories }),
    ...(conditions.minBulkUnits === undefined ? {} : { minBulkUnits: positive(conditions.minBulkUnits, 'Minimum load', 50) }),
    ...(conditions.maxBulkUnits === undefined ? {} : { maxBulkUnits: positive(conditions.maxBulkUnits, 'Maximum load', 50) }),
    ...(conditions.cycles === undefined || conditions.cycles.length === 0 ? {} : { cycles: [...new Set(conditions.cycles.map(cycleName))].sort() }),
    ...(sizes === undefined ? {} : { loadSizes: sizes }),
    ...(soils === undefined ? {} : { soilLevels: soils }),
    ...(machineClasses === undefined ? {} : { machineClasses }),
    ...(conditions.materials === undefined ? {} : { materials: materialList(conditions.materials) }),
  }
}

type DrumVolume = NonNullable<Doc<'machines'>['drumVolume']>

type MachineArgs = {
  name?: string
  model?: string
  applianceType?: Doc<'machines'>['applianceType']
  highEfficiency?: boolean | null
  /** A stored row may still carry the retired `tempF`; it is accepted and dropped. */
  heatSettings?: { heat: DryerHeat; label: string }[]
  capacityUnits?: number
  capacityConfidence?: Doc<'machines'>['capacityConfidence']
  supportedCycles?: string[]
  placements?: Placement[]
  cycleMinutes?: Record<string, number>
  cycleModes?: Record<string, Infer<typeof dryerProgramMode>>
  rinseContact?: Doc<'machines'>['rinseContact']
  washProcesses?: Doc<'machines'>['washProcesses']
  availability?: Doc<'machines'>['pool']
  location?: Doc<'machines'>['location']
  pricePerStart?: number
  blockMinutes?: number
  drumVolume?: DrumVolume | null
  archived?: boolean
  provenance?: Provenance
}

const drumVolumeRange: Record<DrumVolume['unit'], { min: number; max: number; unitsEach: number; words: string }> = {
  cu_ft: { min: 0.5, max: 12, unitsEach: unitsPerCuFt, words: 'cu. ft.' },
  l: { min: 15, max: 350, unitsEach: unitsPerLitre, words: 'litres' },
}

/**
 * The drum volume as typed, with the about-capacity it packs loads by: to the nearest half unit, and
 * only ever an estimate. It never sizes a dose.
 */
function drumCapacity(volume: DrumVolume): Pick<Doc<'machines'>, 'drumVolume' | 'capacityUnits' | 'capacityConfidence'> {
  const range = drumVolumeRange[volume.unit]
  if (!Number.isFinite(volume.amount) || volume.amount < range.min || volume.amount > range.max) {
    fail('invalid', `A drum is between ${range.min} and ${range.max} ${range.words}`)
  }
  return { drumVolume: { amount: volume.amount, unit: volume.unit }, capacityUnits: Math.round(volume.amount * range.unitsEach * 2) / 2, capacityConfidence: 'estimated' }
}

/** A dryer's heat buttons, coolest first, each heat once, with its printed words. A temperature is never stored: the planner reads it from the model's spec sheet. */
function heatSettingsFrom(settings: readonly { heat: DryerHeat; label: string }[]): { heat: DryerHeat; label: string }[] {
  return dryerHeats.flatMap((heat) => {
    const matching = settings.filter((setting) => setting.heat === heat)
    if (matching.length > 1) fail('invalid', 'List each heat setting once')
    return matching.map((setting) => ({ heat, label: text(setting.label, 'Heat setting words', 24) }))
  })
}

/** The minutes one payment buys: a whole number of minutes, up to two hours. */
function blockMinutesFrom(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 120) fail('invalid', 'Minutes per payment must be a whole number from 1 to 120')
  return value
}

export function machineFields(args: MachineArgs, existing: Doc<'machines'> | null): Partial<Doc<'machines'>> {
  // Washer and dryer records carry different facts, and a preferred washer must stay a washer.
  if (existing !== null && args.applianceType !== undefined && machineRole({ applianceType: args.applianceType }) !== machineRole(existing)) {
    fail('conflict', 'A washer cannot become a dryer, or a dryer a washer; add it as a new machine')
  }
  const applianceType = { applianceType: args.applianceType ?? existing?.applianceType }
  const dryer = isDryer(applianceType)
  if (isDryingMachine(applianceType) && args.highEfficiency !== undefined && args.highEfficiency !== null) fail('invalid', 'HE is recorded for washers only')
  if (!dryer && args.heatSettings !== undefined) fail('invalid', 'Heat settings are recorded for dryers only')
  if (!isDryingMachine(applianceType) && args.blockMinutes !== undefined) fail('invalid', 'Minutes per payment are recorded for dryers only')
  if (args.drumVolume !== undefined && args.capacityUnits !== undefined) fail('invalid', 'Give the drum volume or a capacity, not both')
  const evidence = args.provenance === undefined ? existing?.provenance : provenance(args.provenance)
  const fields: Partial<Doc<'machines'>> = {
    ...(existing !== null && (args.model !== undefined && optionalText(args.model, 'Model', 80) !== existing.model || args.applianceType !== undefined && args.applianceType !== existing.applianceType) ? { catalogBinding: undefined } : {}),
    ...(args.name === undefined ? {} : { name: text(args.name, 'Machine name') }),
    ...(args.model === undefined ? {} : { model: optionalText(args.model, 'Model', 80) }),
    ...(args.applianceType === undefined ? {} : { applianceType: args.applianceType }),
    ...(args.highEfficiency === undefined ? {} : { highEfficiency: args.highEfficiency ?? undefined }),
    ...(args.heatSettings === undefined ? {} : { heatSettings: heatSettingsFrom(args.heatSettings) }),
    ...(args.capacityUnits === undefined ? {} : { capacityUnits: positive(args.capacityUnits, 'Capacity', 50) }),
    ...(args.capacityConfidence === undefined ? {} : { capacityConfidence: args.capacityConfidence }),
    ...(args.supportedCycles === undefined ? {} : { supportedCycles: [...new Set(args.supportedCycles.map(cycleName))] }),
    ...(args.availability === undefined ? {} : { pool: args.availability }),
    ...(args.location === undefined ? {} : { location: args.location }),
    ...(args.pricePerStart === undefined ? {} : { pricePerStart: positive(args.pricePerStart, 'Price per start', 100) }),
    ...(args.blockMinutes === undefined ? {} : { blockMinutes: blockMinutesFrom(args.blockMinutes) }),
    ...(args.drumVolume === undefined ? {} : args.drumVolume === null
      ? { drumVolume: undefined, capacityUnits: undefined, capacityConfidence: undefined }
      : drumCapacity(args.drumVolume)),
    ...(args.archived === undefined ? {} : { archived: args.archived }),
    ...(args.provenance === undefined || evidence === undefined ? {} : { provenance: evidence }),
  }
  if (evidence !== undefined && (args.placements !== undefined || args.provenance !== undefined)) {
    // Dispensing evidence is the machine's own evidence; an unknown machine has unknown placements.
    // A dryer has no dispenser, so it keeps only the evidence.
    const placements = isDryingMachine(applianceType) ? undefined : args.placements ?? existing?.dispensingProfile.placements ?? []
    fields.dispensingProfile = {
      ...(placements === undefined ? {} : { placements: [...new Set(placements)] }),
      evidence: { source: evidence.source, status: evidence.confidence },
      evidenceConfidence: evidence.confidence,
    }
  }
  if (args.cycleModes !== undefined && (!dryer || args.cycleMinutes === undefined || evidence === undefined || !['observed', 'verified'].includes(evidence.confidence)
    || Object.keys(args.cycleModes).some((cycle) => args.cycleMinutes?.[cycle] === undefined))) fail('invalid', 'Record checked dryer program modes together with their program times')
  if (evidence !== undefined && args.cycleMinutes !== undefined) {
    if (dryer && Object.keys(args.cycleMinutes).some((cycle) => cycle !== 'timed')) fail('invalid', 'A dryer records only the minutes one start buys')
    const cycles: CycleProfile['cycles'] = {}
    for (const [cycle, minutes] of Object.entries(args.cycleMinutes)) {
      cycles[cycleName(cycle)] = { durationMinutes: positive(minutes, 'Cycle duration', 300), confidence: evidence.confidence,
        ...(args.cycleModes?.[cycle] === undefined ? {} : { mode: args.cycleModes[cycle] }) }
    }
    fields.cycleProfile = { cycles }
  }
  if (args.rinseContact !== undefined) {
    if (isDryingMachine(applianceType)) fail('invalid', 'Rinse contact time belongs to a washer program')
    if (Object.keys(args.rinseContact).length > 20) fail('invalid', 'Record at most 20 washer programs')
    if (Object.values(args.rinseContact).some((contact) => !['softener_compartment', 'direct_to_drum', 'center_agitator', 'downy_ball'].includes(contact.placement)
      || contact.placement === 'direct_to_drum' && !contact.timing?.trim())) fail('invalid', 'Record the sanitizer release placement and any by-hand addition timing')
    fields.rinseContact = Object.fromEntries(Object.entries(args.rinseContact).map(([cycle, contact]) => [cycleName(cycle), {
      minutes: positive(contact.minutes, 'Rinse contact time', 300), source: text(contact.source, 'Rinse contact source', 300),
      placement: text(contact.placement, 'Rinse release placement', 80),
      ...(contact.timing === undefined ? {} : { timing: text(contact.timing, 'Rinse release timing', 300) }),
    }]))
  } else if (existing !== null && (args.model !== undefined && args.model !== existing.model || args.applianceType !== undefined && args.applianceType !== existing.applianceType)) {
    fields.rinseContact = undefined
  }
  const identityChanged = existing !== null && (args.model !== undefined && args.model !== existing.model || args.applianceType !== undefined && args.applianceType !== existing.applianceType)
  if (identityChanged && (args.cycleMinutes === undefined || args.provenance === undefined)) fields.cycleProfile = undefined
  if (identityChanged) fields.washProcesses = undefined
  else if (args.washProcesses !== undefined) {
    if (isDryingMachine(applianceType)) fail('invalid', 'Wash process settings belong to a washer')
    if (Object.keys(args.washProcesses).length > 20) fail('invalid', 'Record at most 20 washer programs')
    const supported = args.supportedCycles ?? existing?.supportedCycles ?? []
    fields.washProcesses = Object.fromEntries(Object.entries(args.washProcesses).map(([cycle, process]) => {
      if (!supported.includes(cycle) || washProcessProblem(process) !== null) fail('invalid', 'Record checked settings for a supported washer program')
      return [cycleName(cycle), { ...process, source: text(process.source, 'Program settings source', 300), programLabel: text(process.programLabel, 'Checked program and options', 160) }]
    }))
  } else if (args.supportedCycles !== undefined && existing?.washProcesses !== undefined) {
    fields.washProcesses = Object.fromEntries(Object.entries(existing.washProcesses).filter(([cycle]) => args.supportedCycles!.includes(cycle)))
  }
  return fields
}

/** The most identical machines one entry adds: a shared room's row of washers or dryers. */
export const maxMachinesLikeIt = 24

/** Sibling names: the name alone for one machine, else "{name} 1…n" in order. */
export function siblingNames(name: string, count: number): string[] {
  const base = text(name, 'Machine name', 116)
  return count === 1 ? [base] : Array.from({ length: count }, (_, index) => `${base} ${index + 1}`)
}

export function siblingCount(count: number): number {
  if (!Number.isInteger(count) || count < 1 || count > maxMachinesLikeIt) fail('invalid', `How many like it must be between 1 and ${maxMachinesLikeIt}`)
  return count
}

export function wholeDays(value: number, field: string, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) fail('invalid', `${field} must be between ${min} and ${max} days`)
  return value
}
