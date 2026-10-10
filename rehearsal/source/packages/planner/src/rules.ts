import type { AtMachine, AtMachineCandidate, ApplicationRule, DismissedAnswer, DismissedQuestion, Dose, DoseContextSnapshot, MeasureMark, PlannerInput, StepDose, SupplyItem, SupplyMeasurement } from './index.ts'
import { ruleEvidenceUsable } from './evidence.ts'
import { markFractionProblem } from './mark-fraction.ts'
import { nativeDoseProblem, type SourceLoadCategory } from './product-contract.ts'
import { applianceTypes, countUnits, loadSizes, soilLevels, washerClasses, type LoadSize, type SoilLevel, type WasherClass } from './vocabulary.ts'

/**
 * A load size by quarters of a recorded capacity: up to a quarter is small, up to half medium,
 * up to three quarters large, beyond that extra large. The planner never doses by it: the size
 * a dose uses comes only from the person's answer at the machine (`resolveAtMachine`).
 */
export function loadSizeFor(bulkUnits: number, capacityUnits: number | null): LoadSize | null {
  if (capacityUnits === null || !Number.isFinite(capacityUnits) || capacityUnits <= 0 || !Number.isFinite(bulkUnits)) return null
  // Compare 4 × bulk with multiples of capacity so quarter boundaries are exact.
  const quarters = 4 * bulkUnits
  if (quarters <= capacityUnits) return 'small'
  if (quarters <= 2 * capacityUnits) return 'medium'
  if (quarters <= 3 * capacityUnits) return 'large'
  return 'extra_large'
}

/** Inputs a person can supply when a label row depends on them; the order is the order they are asked. */
export type MissingInput = 'load_size' | 'washer_class' | 'appliance_type' | 'soil_level'
const missingOrder: readonly MissingInput[] = ['load_size', 'washer_class', 'appliance_type', 'soil_level']

export type DoseContext = {
  readonly sourceLoadCategory?: SourceLoadCategory
  /** Always null for a dose: rows keyed on load units are legacy and ignored. */
  readonly bulkUnits: number | null
  /** Null until the person says how full the drum is; the planner tries every size. */
  readonly loadSize: LoadSize | null
  /** The heaviest soil level recorded on the load's garments. */
  readonly soilLevel: SoilLevel | null
  /** Some garment in the load has no soil level recorded. */
  readonly unrecordedSoil: boolean
  readonly applianceType: string | null
  readonly machineClasses: readonly string[]
  readonly washerClassKnown: boolean
  readonly cycles: ReadonlySet<string>
  readonly materials: ReadonlySet<string>
  readonly odorLevel: string | null
  readonly waterCondition: string | null
  /** Some garment in the load has a fresh stain (a stain report, a stain note or an open stain check). */
  readonly freshStain?: boolean
}

/** What is wrong with a selected rule's dose. `malformed` is an unusable amount or unit. */
export type DoseProblem = 'malformed' | 'mark_missing' | 'mark_unknown' | 'count_fraction'

export type RuleSelection = (
  | { readonly kind: 'selected'; readonly rule: ApplicationRule; readonly dose: Dose; readonly basis: string | null; readonly specificity: number }
  | { readonly kind: 'none' }
  | { readonly kind: 'needs_input'; readonly missing: MissingInput; readonly ruleIds: readonly string[] }
  | { readonly kind: 'conflict'; readonly ruleIds: readonly string[] }
  | { readonly kind: 'invalid_dose'; readonly ruleId: string; readonly problem: DoseProblem }
) & {
  /** The soil level the label was read with: the recorded heaviest, or normal assumed for unrecorded garments. */
  readonly soilLevel: SoilLevel | null
  readonly soilAssumed: boolean
}

type Verdict = 'match' | 'mismatch' | MissingInput
type Evaluation = { readonly rule: ApplicationRule; readonly mismatch: boolean; readonly unknown: readonly MissingInput[]; readonly specificity: number }

const soilRank = (level: SoilLevel): number => soilLevels.indexOf(level)

export function heavierSoil(left: SoilLevel | null, right: SoilLevel | null): SoilLevel | null {
  if (left === null) return right
  if (right === null) return left
  return soilRank(left) >= soilRank(right) ? left : right
}

export function soilLevelOf(value: unknown): SoilLevel | null {
  return typeof value === 'string' && (soilLevels as readonly string[]).includes(value) ? value as SoilLevel : null
}

/** The rules a product's label contributes, whether passed with the product or alongside it. */
export function rulesForSupply(supply: SupplyItem, input: PlannerInput): ApplicationRule[] {
  return [...(input.applicationRules ?? []), ...(supply.applicationRules ?? [])]
    .filter((rule) => (rule.supplyId ?? rule.productId ?? supply.id) === supply.id)
}

/** A row keyed on load units, from before sizes were read off the drum. No label tap makes one. */
function legacyBulkRule(rule: ApplicationRule): boolean {
  return rule.conditions?.minBulkUnits !== undefined || rule.conditions?.maxBulkUnits !== undefined
}

function candidateRule(rule: ApplicationRule): boolean {
  return rule.supported !== false && rule.labelBacked !== false && ruleEvidenceUsable(rule) && !legacyBulkRule(rule)
}

/**
 * Unrecorded garments count as normal soil only when the label has a normal-soil row; otherwise
 * their soil stays unknown. A recorded heavy garment makes the load heavy whatever the rest are.
 */
function effectiveSoil(candidates: readonly ApplicationRule[], ctx: DoseContext): SoilLevel | null {
  if (!ctx.unrecordedSoil) return ctx.soilLevel
  if (ctx.soilLevel === 'heavy') return 'heavy'
  const normalRow = candidates.some((rule) => rule.conditions?.soilLevels?.includes('normal') === true)
  return normalRow ? heavierSoil(ctx.soilLevel, 'normal') : null
}

function sizeVerdict(rule: ApplicationRule, ctx: DoseContext): Verdict | null {
  const conditions = rule.conditions
  const sizes = conditions?.loadSizes ?? (typeof conditions?.loadSize === 'string' ? [conditions.loadSize] : undefined)
  if (sizes === undefined) return null
  if (sizes.length === 0) return 'mismatch'
  if (ctx.loadSize === null) return 'load_size'
  return sizes.includes(ctx.loadSize) ? 'match' : 'mismatch'
}

/** Every value the load has must be one the label names; a load with none of that fact matches. */
function everyVerdict(list: readonly string[] | undefined, values: ReadonlySet<string>): Verdict | null {
  if (list === undefined) return null
  if (list.length === 0) return 'mismatch'
  return [...values].every((value) => list.includes(value)) ? 'match' : 'mismatch'
}

function machineVerdict(list: readonly string[] | undefined, ctx: DoseContext): Verdict | null {
  if (list === undefined) return null
  if (list.length === 0) return 'mismatch'
  if (ctx.machineClasses.some((entry) => list.includes(entry))) return 'match'
  if (!ctx.washerClassKnown && list.some((entry) => (washerClasses as readonly string[]).includes(entry))) return 'washer_class'
  if (ctx.applianceType === null && list.some((entry) => (applianceTypes as readonly string[]).includes(entry))) return 'appliance_type'
  return 'mismatch'
}

function soilVerdict(list: readonly string[] | undefined, soil: SoilLevel | null): Verdict | null {
  if (list === undefined) return null
  if (list.length === 0) return 'mismatch'
  if (soil === null) return 'soil_level'
  return list.includes(soil) ? 'match' : 'mismatch'
}

/** Odor and water have no question to answer them, so an unstated value is a mismatch, never a question. */
function statedVerdict(list: readonly string[] | undefined, value: string | null): Verdict | null {
  if (list === undefined) return null
  return value !== null && list.includes(value) ? 'match' : 'mismatch'
}

function evaluate(rule: ApplicationRule, ctx: DoseContext, soil: SoilLevel | null): Evaluation {
  const conditions = rule.conditions
  const verdicts = [
    conditions?.sourceLoadCategories === undefined ? null : ctx.sourceLoadCategory !== undefined && conditions.sourceLoadCategories.includes(ctx.sourceLoadCategory) ? 'match' : 'mismatch',
    sizeVerdict(rule, ctx),
    everyVerdict(conditions?.cycles, ctx.cycles),
    everyVerdict(conditions?.materials, ctx.materials),
    machineVerdict(conditions?.machineClasses, ctx),
    soilVerdict(conditions?.soilLevels, soil),
    statedVerdict(conditions?.odorLevels, ctx.odorLevel),
    statedVerdict(conditions?.waterConditions, ctx.waterCondition),
  ].filter((verdict): verdict is Verdict => verdict !== null)
  const excluded = rule.incompatibleMaterials !== undefined && [...ctx.materials].some((material) => rule.incompatibleMaterials!.includes(material))
  return {
    rule,
    mismatch: excluded || verdicts.includes('mismatch'),
    unknown: missingOrder.filter((missing) => verdicts.includes(missing)),
    specificity: verdicts.length,
  }
}

/**
 * How many facts about the load a rule keys on. Load size (named sizes, minimum and maximum
 * bulk) is one fact; so is each other condition. Incompatible materials only exclude.
 */
export function ruleSpecificity(rule: ApplicationRule): number {
  const conditions = rule.conditions
  if (!conditions) return 0
  const size = conditions.loadSizes !== undefined || conditions.loadSize !== undefined || conditions.minBulkUnits !== undefined || conditions.maxBulkUnits !== undefined
  return [size, conditions.cycles, conditions.materials, conditions.machineClasses, conditions.soilLevels, conditions.odorLevels, conditions.waterConditions]
    .filter((entry) => entry !== undefined && entry !== false).length
}

function rawDose(rule: ApplicationRule): { amount: unknown; unit: unknown; mark: unknown } {
  if (typeof rule.dose === 'object' && rule.dose !== null) return { amount: rule.dose.amount, unit: rule.dose.unit, mark: rule.dose.mark }
  return { amount: typeof rule.dose === 'number' ? rule.dose : rule.doseAmount, unit: rule.doseUnit, mark: undefined }
}

/** Label instructions and safety limits must agree before equivalent rows can be collapsed. */
function instruction(rule: ApplicationRule): string {
  const { amount, unit, mark } = rawDose(rule)
  const fraction = typeof rule.dose === 'object' && rule.dose !== null ? rule.dose.fractionOfMark ?? 1 : 1
  const native = typeof rule.dose === 'object' && rule.dose !== null ? [rule.dose.target ?? null, rule.dose.approximate ?? null] : []
  return JSON.stringify([amount ?? null, unit ?? null, typeof mark === 'string' ? mark.trim().toLowerCase() : null, fraction, native, rule.placement ?? null, rule.stage ?? null, rule.timing ?? null,
    [...(rule.incompatibleSupplyIds ?? [])].sort(), rule.incompatibleMaterials?.map((material) => material.trim().toLowerCase()).sort() ?? [],
    rule.safeMaterials?.map((material) => material.trim().toLowerCase()).sort() ?? null, rule.maximumTemperatureC ?? null, rule.maximumPH ?? null, rule.sharedCompartmentCompatible ?? null,
  ])
}

/** Two rows that tell a person to do exactly the same thing. */
export function sameInstruction(left: ApplicationRule, right: ApplicationRule): boolean {
  return instruction(left) === instruction(right)
}

type Decision = { readonly kind: 'selected'; readonly entry: Evaluation } | { readonly kind: 'conflict'; readonly ruleIds: readonly string[] } | { readonly kind: 'none' }

function decide(entries: readonly Evaluation[]): Decision {
  if (entries.length === 0) return { kind: 'none' }
  const best = Math.max(...entries.map((entry) => entry.specificity))
  const top = entries.filter((entry) => entry.specificity === best).sort((left, right) => left.rule.id.localeCompare(right.rule.id))
  if (new Set(top.map((entry) => instruction(entry.rule))).size > 1) return { kind: 'conflict', ruleIds: top.map((entry) => entry.rule.id) }
  return { kind: 'selected', entry: top[0]! }
}

function sameDecision(left: Decision, right: Decision): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind === 'selected' && right.kind === 'selected') return instruction(left.entry.rule) === instruction(right.entry.rule)
  return true
}

const markUnits = new Set(['cap', 'scoop'])

export function sameMark(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

/** The marks printed on the product's cap or scoop, exactly as printed. */
export function markLabels(measurement?: SupplyMeasurement | null): string[] {
  return (measurement?.marks ?? [])
    .map((mark) => typeof mark === 'string' ? mark : mark?.label)
    .filter((label): label is string => typeof label === 'string' && label.trim().length > 0)
}

function checkDose(rule: ApplicationRule, measurement?: SupplyMeasurement | null): { readonly dose: Dose } | { readonly problem: DoseProblem } {
  const { amount, unit, mark } = rawDose(rule)
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || typeof unit !== 'string' || unit.length === 0) return { problem: 'malformed' }
  const namedMark = typeof mark === 'string' && mark.trim().length > 0 ? mark : null
  if (markUnits.has(unit) && namedMark === null) return { problem: 'mark_missing' }
  if (namedMark !== null) {
    const labels = markLabels(measurement)
    if (labels.length > 0 && !labels.some((label) => sameMark(label, namedMark))) return { problem: 'mark_unknown' }
  }
  if ((countUnits as readonly string[]).includes(unit) && !Number.isInteger(amount)) return { problem: 'count_fraction' }
  if (typeof rule.dose === 'object' && rule.dose !== null && markFractionProblem(rule.dose) !== null) return { problem: 'malformed' }
  if (typeof rule.dose === 'object' && rule.dose !== null && nativeDoseProblem(rule.dose) !== null) return { problem: 'malformed' }
  if (typeof rule.dose === 'object' && rule.dose !== null) return { dose: rule.dose }
  return { dose: { amount, unit } }
}

/** A rule's dose when it can be followed as written; marks must be on the product's cap or scoop. */
export function ruleDose(rule: ApplicationRule, measurement?: SupplyMeasurement | null): Dose | null {
  const checked = checkDose(rule, measurement)
  return 'dose' in checked ? checked.dose : null
}

/** A dose read from a printed mark, as opposed to a measured amount. */
export function markDose(dose: Dose): boolean {
  return markUnits.has(dose.unit) && typeof dose.mark === 'string' && dose.mark.trim().length > 0
}

/** The printed volume a mark dose comes to, only when the label prints one for that mark. */
export function doseEquivalent(dose: Dose, measurement?: SupplyMeasurement | null): { amount: number; unit: string } | null {
  if (dose.target !== undefined || dose.approximate) return null
  if (!markDose(dose)) return null
  if (dose.fractionOfMark !== undefined && dose.fractionOfMark !== 1) return null
  const printed = (measurement?.marks ?? []).find((mark): mark is MeasureMark => typeof mark === 'object' && mark !== null && sameMark(mark.label, dose.mark!))
  if (printed === undefined || typeof printed.amount !== 'number' || !Number.isFinite(printed.amount) || printed.amount <= 0) return null
  if (typeof printed.unit !== 'string' || printed.unit.length === 0) return null
  return { amount: printed.amount * dose.amount, unit: printed.unit }
}

export const sizeWords: Record<LoadSize, string> = { small: 'small', medium: 'medium', large: 'large', extra_large: 'extra large' }
const soilWords: Record<SoilLevel, string> = { light: 'light soil', normal: 'normal soil', heavy: 'heavy soil' }
const classWords: Record<string, string> = { he: 'HE washer', standard: 'standard washer', top_load_washer: 'top-loader', front_load_washer: 'front-loader', tumble_dryer: 'dryer' }

/** The facts about this load that chose the rule, in words; null when the rule applies to any load. */
export function doseBasis(rule: ApplicationRule, ctx: DoseContext, soil: SoilLevel | null = ctx.soilLevel, soilAssumed = false): string | null {
  const conditions = rule.conditions
  if (!conditions) return null
  const parts: string[] = []
  if ((conditions.loadSizes !== undefined || conditions.loadSize !== undefined) && ctx.loadSize !== null) parts.push(`${sizeWords[ctx.loadSize]} load`)
  if (conditions.soilLevels !== undefined && soil !== null) parts.push(`${soilWords[soil]}${soilAssumed ? ' (assumed)' : ''}`)
  if (conditions.machineClasses !== undefined) {
    parts.push(...ctx.machineClasses.filter((entry) => conditions.machineClasses!.includes(entry)).map((entry) => classWords[entry] ?? entry))
  }
  if (conditions.cycles !== undefined) parts.push(...[...ctx.cycles].sort().map((cycle) => `${cycle.replaceAll('_', ' ')} cycle`))
  if (conditions.materials !== undefined) parts.push(...[...ctx.materials].sort())
  if (conditions.odorLevels !== undefined && ctx.odorLevel !== null) parts.push(`${ctx.odorLevel} odor`)
  if (conditions.waterConditions !== undefined && ctx.waterCondition !== null) parts.push(`${ctx.waterCondition} water`)
  return parts.length === 0 ? null : parts.join(', ')
}

/**
 * The one dose for this product and load, or why there is none. Deterministic and fail-closed:
 * - Rules whose conditions contradict the load drop out; the most specific that remain win.
 * - Winners that differ in dose, placement, stage or timing are a conflict: more than one label
 *   row fits, and the planner asks rather than choosing (so it never silently under-doses).
 * - A rule that depends on something unknown asks for it only when the answer could change
 *   the outcome; otherwise the unknown is ignored.
 * - Rows keyed on load units are legacy and never chosen.
 */
export function selectRule(rules: readonly ApplicationRule[], ctx: DoseContext, measurement?: SupplyMeasurement | null): RuleSelection {
  const candidates = rules.filter(candidateRule)
  const soilLevel = effectiveSoil(candidates, ctx)
  const soil = { soilLevel, soilAssumed: soilLevel !== null && soilLevel !== ctx.soilLevel }
  const evaluated = candidates.map((rule) => evaluate(rule, ctx, soilLevel)).filter((entry) => !entry.mismatch)
  const full = evaluated.filter((entry) => entry.unknown.length === 0)
  const partial = evaluated.filter((entry) => entry.unknown.length > 0).sort((left, right) => left.rule.id.localeCompare(right.rule.id))
  const baseline = decide(full)
  const changers = partial.filter((entry) => !sameDecision(baseline, decide([...full, entry])))
  if (changers.length > 0) {
    const missing = missingOrder.find((input) => changers.some((entry) => entry.unknown.includes(input)))!
    return { kind: 'needs_input', missing, ruleIds: changers.map((entry) => entry.rule.id), ...soil }
  }
  if (baseline.kind === 'none') return { kind: 'none', ...soil }
  if (baseline.kind === 'conflict') return { kind: 'conflict', ruleIds: baseline.ruleIds, ...soil }
  const { rule, specificity } = baseline.entry
  const checked = checkDose(rule, measurement)
  if ('problem' in checked) return { kind: 'invalid_dose', ruleId: rule.id, problem: checked.problem, ...soil }
  return { kind: 'selected', rule, dose: checked.dose, basis: doseBasis(rule, ctx, soilLevel, soil.soilAssumed), specificity, ...soil }
}

export type CoverageGrid = {
  readonly sizes: readonly LoadSize[]
  readonly soils: readonly (SoilLevel | null)[]
  readonly classes: readonly (WasherClass | null)[]
}

export type CoverageCell = {
  readonly size: LoadSize
  readonly soil: SoilLevel | null
  readonly washerClass: WasherClass | null
  readonly selection: RuleSelection
}

/**
 * What a label's rows give for each load size, soil level and washer class, so an editor can say
 * which loads a label covers, which ask, and where two rows disagree. A null soil is a load whose
 * garments have no soil recorded; a null class is a washer whose HE status is not recorded.
 */
export function doseCoverage(rules: readonly ApplicationRule[], measurement: SupplyMeasurement | null | undefined, grid: CoverageGrid): CoverageCell[] {
  return grid.sizes.flatMap((size) => grid.soils.flatMap((soil) => grid.classes.map((washerClass): CoverageCell => ({
    size,
    soil,
    washerClass,
    selection: selectRule(rules, {
      bulkUnits: null,
      loadSize: size,
      soilLevel: soil,
      unrecordedSoil: soil === null,
      applianceType: null,
      machineClasses: washerClass === null ? [] : [washerClass],
      washerClassKnown: washerClass !== null,
      cycles: new Set(),
      materials: new Set(),
      odorLevel: null,
      waterCondition: null,
    }, measurement),
  }))))
}

/**
 * The dose for a step decided at the machine, once the person says how full the drum or dryer is:
 * the product's current rows read with the load facts stored at plan time and that size.
 */
export function resolveAtMachine(atMachine: AtMachine, rules: readonly ApplicationRule[], measurement: SupplyMeasurement | null | undefined, size: LoadSize): RuleSelection {
  const { context } = atMachine
  return selectRule(rules, {
    bulkUnits: null,
    loadSize: size,
    soilLevel: context.soilLevel,
    unrecordedSoil: context.unrecordedSoil,
    applianceType: context.applianceType,
    machineClasses: context.machineClasses,
    washerClassKnown: context.washerClassKnown,
    cycles: new Set(context.cycles),
    materials: new Set(context.materials),
    odorLevel: null,
    // The water at plan time: a row keyed on soft water must stay chosen when the drum fullness is picked.
    waterCondition: context.waterCondition ?? null,
  }, measurement)
}

/** The placeholder dose of a step whose dose is chosen at the machine. */
export const atMachineDose: Dose = { amount: 0, unit: 'at_machine' }

/** The facts a dose was read with, kept on a step so the row can be chosen at the machine. */
export function doseContextSnapshot(ctx: DoseContext): DoseContextSnapshot {
  return {
    soilLevel: ctx.soilLevel,
    unrecordedSoil: ctx.unrecordedSoil,
    applianceType: ctx.applianceType,
    machineClasses: [...ctx.machineClasses],
    washerClassKnown: ctx.washerClassKnown,
    cycles: [...ctx.cycles].sort(),
    materials: [...ctx.materials].sort(),
    // Spread only when set, so snapshots stored before water was kept read the same.
    ...(ctx.waterCondition === null ? {} : { waterCondition: ctx.waterCondition }),
    ...(ctx.freshStain === true ? { freshStain: true } : {}),
  }
}

/** A selected dose as a checklist shows it: every mark on the cap and the printed volume, when there are any. */
export function stepDose(dose: Dose, measurement?: SupplyMeasurement | null): StepDose {
  const plain: StepDose = {
    amount: dose.amount,
    unit: dose.unit,
    ...(typeof dose.mark === 'string' ? { mark: dose.mark } : {}),
    ...(dose.fractionOfMark === undefined ? {} : { fractionOfMark: dose.fractionOfMark }),
    ...(dose.target === undefined ? {} : { target: dose.target }),
    ...(dose.approximate === undefined ? {} : { approximate: dose.approximate }),
    ...(typeof dose.measurementCue === 'string' ? { measurementCue: dose.measurementCue } : {}),
  }
  if (!markDose(dose)) return plain
  const equivalent = doseEquivalent(dose, measurement)
  return { ...plain, marks: markLabels(measurement), ...(equivalent === null ? {} : { equivalent }) }
}

const mlPer: Readonly<Record<string, number>> = { ml: 1, 'fl oz': 29.5735 }
const volumeMl = (amount: unknown, unit: unknown): number | null =>
  typeof amount === 'number' && Number.isFinite(amount) && amount > 0 && typeof unit === 'string' && mlPer[unit.trim().toLowerCase()] !== undefined ? amount * mlPer[unit.trim().toLowerCase()]! : null

/** The only adjustment: LG USA says to use half the detergent maker's amount in soft water [S24]. */
export type DoseAdjustment = { readonly kind: 'soft_water_half'; readonly sourceIds: readonly string[] }
export type CalculatedDose = { readonly dose: StepDose; readonly adjustment: DoseAdjustment }
/** Why the label amount stands, in gate order. */
export type LabelDoseReason =
  | 'water_not_soft' | 'label_has_water_rows' | 'not_measured_detergent' | 'soil_not_light_or_normal'
  | 'fresh_stain' | 'more_than_one_fill' | 'row_volume_unknown' | 'no_mark_between'

/**
 * The soft-water dose for a selected label row, or why the label amount stands. Gates, in order:
 * soft water; the label has no water-hardness rows of its own (one adjustment only); a measured
 * liquid or powder detergent, never pods, weight or count; every piece's soil recorded light or
 * normal; no fresh stain; one fill of the row with a known volume (a "below" row is bounded by its
 * named whole mark; a fraction of a mark has no known volume); then the lowest whole printed mark with a known volume at or
 * above half and strictly below the row. Never below half, never stacked.
 */
export function calculatedDose(dose: Dose, rules: readonly ApplicationRule[], ctx: DoseContext, supply: SupplyItem): { readonly kind: 'calculated' } & CalculatedDose | { readonly kind: 'label'; readonly reason: LabelDoseReason } {
  const label = (reason: LabelDoseReason) => ({ kind: 'label' as const, reason })
  if (ctx.waterCondition !== 'soft') return label('water_not_soft')
  if (rules.some((rule) => rule.conditions?.waterConditions !== undefined)) return label('label_has_water_rows')
  const detergent = (supply.use === 'detergent' || supply.kind === 'detergent') && supply.use !== 'pods'
  if (!detergent || !['cap', 'scoop', 'ml', 'fl oz'].includes(dose.unit)) return label('not_measured_detergent')
  if (ctx.unrecordedSoil || (ctx.soilLevel !== 'light' && ctx.soilLevel !== 'normal')) return label('soil_not_light_or_normal')
  if (ctx.freshStain === true) return label('fresh_stain')
  const known = (supply.measurement?.marks ?? [])
    .filter((mark): mark is MeasureMark => typeof mark === 'object' && mark !== null && typeof mark.label === 'string' && mark.label.trim().length > 0)
    .flatMap((mark) => { const ml = volumeMl(mark.amount, mark.unit); return ml === null ? [] : [{ mark, ml }] })
  let rowMl: number | null
  if (markDose(dose)) {
    // Owner default: a line that says more than one fill keeps the label amount.
    if (dose.amount !== 1) return label('more_than_one_fill')
    // A fraction of a fill height is not that fraction of the volume, so the row has no known volume.
    if (dose.fractionOfMark !== undefined && dose.fractionOfMark !== 1) return label('row_volume_unknown')
    rowMl = known.find((entry) => sameMark(entry.mark.label, dose.mark!))?.ml ?? null
  } else {
    rowMl = volumeMl(dose.amount, dose.unit)
  }
  if (rowMl === null) return label('row_volume_unknown')
  const unit = markUnits.has(dose.unit) ? dose.unit : supply.measurement?.kind
  if (typeof unit !== 'string' || !markUnits.has(unit)) return label('no_mark_between')
  const half = rowMl / 2
  const pick = known.filter((entry) => entry.ml >= half && entry.ml < rowMl!).sort((left, right) => left.ml - right.ml)[0]
  if (pick === undefined) return label('no_mark_between')
  return { kind: 'calculated', dose: stepDose({ amount: 1, unit, mark: pick.mark.label }, supply.measurement), adjustment: { kind: 'soft_water_half', sourceIds: ['S24'] } }
}

type Selected = Extract<RuleSelection, { kind: 'selected' }>

/**
 * A product's dose for a load whose size is not known until the person looks in the drum. The
 * label is read once for each size the drum could be:
 * - a row that needs an answer (HE first, then appliance type or soil) asks, as a size never can;
 * - every size gives the same instruction: the dose is known now;
 * - no size has a row, or every size fits the same clashing rows: that holds for any size;
 * - any size reads a dose that cannot be followed: it is refused;
 * - otherwise the dose depends on the size, and is chosen at the machine from the sizes that have one.
 */
export type SizedDose = (
  | { readonly kind: 'resolved'; readonly selection: Selected }
  | { readonly kind: 'needs_input'; readonly selection: Extract<RuleSelection, { kind: 'needs_input' }> }
  | { readonly kind: 'conflict'; readonly selection: Extract<RuleSelection, { kind: 'conflict' }> }
  | { readonly kind: 'invalid_dose'; readonly selection: Extract<RuleSelection, { kind: 'invalid_dose' }> }
  | { readonly kind: 'none' }
  /** `rule` stands for all of the product's rows: they share where and when it goes. */
  | { readonly kind: 'at_machine'; readonly rule: ApplicationRule | null; readonly candidates: readonly AtMachineCandidate[] }
) & {
  /** The soil level the label was read with, the same for every size. */
  readonly soilLevel: SoilLevel | null
}

export function doseBySize(rules: readonly ApplicationRule[], ctx: DoseContext, measurement?: SupplyMeasurement | null): SizedDose {
  const table = loadSizes.map((size) => ({ size, selection: selectRule(rules, { ...ctx, bulkUnits: null, loadSize: size }, measurement) }))
  const selections = table.map((entry) => entry.selection)
  const soilLevel = selections[0]!.soilLevel
  const asking = selections.filter((selection): selection is Extract<RuleSelection, { kind: 'needs_input' }> => selection.kind === 'needs_input')
  const needsInput = asking.find((selection) => selection.missing === 'washer_class') ?? asking[0]
  if (needsInput !== undefined) return { kind: 'needs_input', selection: needsInput, soilLevel }
  const selected = selections.filter((selection): selection is Selected => selection.kind === 'selected')
  if (selected.length === selections.length && selected.every((selection) => sameInstruction(selection.rule, selected[0]!.rule))) {
    const first = selected[0]!
    // No size was known, so the facts that chose the row are everything but the size.
    return { kind: 'resolved', selection: { ...first, basis: doseBasis(first.rule, { ...ctx, loadSize: null }, first.soilLevel, first.soilAssumed) }, soilLevel }
  }
  if (selections.every((selection) => selection.kind === 'none')) return { kind: 'none', soilLevel }
  const conflicts = selections.filter((selection): selection is Extract<RuleSelection, { kind: 'conflict' }> => selection.kind === 'conflict')
  const sameConflict = conflicts.length === selections.length && conflicts.every((selection) => JSON.stringify(selection.ruleIds) === JSON.stringify(conflicts[0]!.ruleIds))
  if (sameConflict) return { kind: 'conflict', selection: conflicts[0]!, soilLevel }
  const invalid = selections.find((selection): selection is Extract<RuleSelection, { kind: 'invalid_dose' }> => selection.kind === 'invalid_dose')
  if (invalid !== undefined) return { kind: 'invalid_dose', selection: invalid, soilLevel }
  const candidates = table.flatMap(({ size, selection }): AtMachineCandidate[] => selection.kind === 'selected'
    ? [{ size, ruleId: selection.rule.id, row: selection.rule.row ?? null, rowText: typeof selection.rule.rowText === 'string' ? selection.rule.rowText : null, dose: stepDose(selection.dose, measurement) }]
    : [])
  const conflictRuleId = conflicts[0]?.ruleIds[0]
  const rule = selected[0]?.rule ?? rules.find((entry) => entry.id === conflictRuleId) ?? null
  return { kind: 'at_machine', rule, candidates, soilLevel }
}

/**
 * How the person answered a question they were asked for this pass, if they did. Contexts match
 * exactly, an absent soil or HE only an absent one; an HE answer is about the washer alone.
 */
export function dismissedAnswer(
  input: PlannerInput,
  kind: DismissedQuestion['kind'],
  subjectId: string,
  context: { readonly soilLevel: SoilLevel | null; readonly washerClass: WasherClass | null },
): DismissedAnswer | null {
  const match = (input.dismissedQuestions ?? []).find((entry) => entry.kind === kind
    && entry.subjectId === subjectId
    && (kind === 'washer_he' || (entry.context?.soilLevel ?? null) === context.soilLevel && (entry.context?.washerClass ?? null) === context.washerClass))
  return match?.answer ?? null
}

/** Products the person left out of this pass. */
export function excludedSupply(input: PlannerInput, supplyId: string): boolean {
  return (input.excludedSupplyIds ?? []).includes(supplyId)
}
