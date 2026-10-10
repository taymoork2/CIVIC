import type { ApplicationRule, MeasureMark } from './index.ts'
import { markFractionProblem } from './mark-fraction.ts'
import { nativeDoseProblem } from './product-contract.ts'
import { doseCoverage, sameMark, sizeWords, type CoverageCell, type CoverageGrid } from './rules.ts'
import {
  countUnits,
  dryerPlacements,
  dryerSupplyKinds,
  loadSizes,
  measureKinds,
  measuredUnits,
  placements,
  soilLevels,
  washerClasses,
  washerStages,
  type CountUnit,
  type LoadSize,
  type MeasureKind,
  type SoilLevel,
  type WasherClass,
} from './vocabulary.ts'

/** How a product is measured, as its packaging shows it. */
export type SupplyMeasure = {
  readonly kind: MeasureKind
  readonly marks?: readonly MeasureMark[]
  readonly countUnit?: CountUnit
}

export type DirectionsCell = {
  /** The label's column: HE or standard washers. Absent when the label has one column for all washers. */
  readonly machineClass?: WasherClass
  readonly amount: number
  readonly unit: string
  readonly mark?: string
  readonly fractionOfMark?: number
  readonly target?: 'below' | 'just_below'
  readonly approximate?: boolean
}

export type DirectionsRow = {
  readonly sourceLoadCategories?: readonly import('./product-contract.ts').SourceLoadCategory[]
  /** The row's heading as printed, when the person typed it. */
  readonly rowText?: string
  readonly loadSizes?: readonly LoadSize[]
  readonly soilLevels?: readonly SoilLevel[]
  /** With both sizes and soils: `or` is "large OR heavily soiled", `and` (the default) needs both. */
  readonly join?: 'or' | 'and'
  readonly cells: readonly DirectionsCell[]
}

/** A product label's directions table, transcribed row by row. */
export type DirectionsTable = {
  readonly measure: SupplyMeasure
  readonly stage: string
  readonly placement: string
  readonly timing: string
  readonly rows: readonly DirectionsRow[]
}

export type CompiledRule = {
  /** 1-based row of the table; an or-row compiles to two rules with the same row. */
  readonly row: number
  readonly rowText?: string
  readonly conditions: { readonly loadSizes?: LoadSize[]; readonly soilLevels?: SoilLevel[]; readonly machineClasses?: WasherClass[]; readonly sourceLoadCategories?: import('./product-contract.ts').SourceLoadCategory[] }
  readonly dose: DirectionsCell
  readonly stage: string
  readonly placement: string
  readonly timing: string
}

export type CompileResult = { readonly ok: true; readonly rules: CompiledRule[] } | { readonly ok: false; readonly error: string }

const markKinds = new Set<string>(['cap', 'scoop'])
const includes = (list: readonly string[], value: unknown): boolean => typeof value === 'string' && list.includes(value)

/** What is wrong with a measure, in plain words, or null. */
export function measureProblem(measure: SupplyMeasure): string | null {
  if (!includes(measureKinds, measure.kind)) return 'Choose how the product is measured.'
  const marks = measure.marks ?? []
  if (markKinds.has(measure.kind)) {
    if (marks.length < 1 || marks.length > 12) return `A ${measure.kind} needs between 1 and 12 marks.`
    if (measure.countUnit !== undefined) return `A ${measure.kind} has marks, not a count.`
  } else if (marks.length > 0) {
    return 'Only a cap or a scoop has marks.'
  }
  if (measure.kind === 'count' && !includes(countUnits, measure.countUnit)) return 'Say what is counted: pods, sheets, balls or tablets.'
  if (measure.kind !== 'count' && measure.countUnit !== undefined) return 'Only a counted product has a count unit.'
  const seen: string[] = []
  for (const mark of marks) {
    const label = typeof mark?.label === 'string' ? mark.label.trim() : ''
    if (label.length === 0 || label.length > 40) return 'Each mark needs its printed words, up to 40 characters.'
    if (seen.some((other) => sameMark(other, label))) return `The mark "${label}" is listed twice.`
    seen.push(label)
    const volume = mark.amount !== undefined || mark.unit !== undefined
    if (volume && !(typeof mark.amount === 'number' && Number.isFinite(mark.amount) && mark.amount > 0 && includes(measuredUnits, mark.unit))) {
      return `The printed volume for "${label}" needs an amount and a unit (ml, fl oz, g or oz).`
    }
  }
  return null
}

/** What is wrong with one dose against the product's measure, in plain words, or null. */
export function doseProblem(measure: SupplyMeasure, dose: { readonly amount: number; readonly unit: string; readonly mark?: string | null; readonly fractionOfMark?: number; readonly target?: 'below' | 'just_below'; readonly approximate?: boolean }): string | null {
  if (typeof dose.amount !== 'number' || !Number.isFinite(dose.amount)) return 'Each dose needs an amount.'
  const fractionProblem = markFractionProblem(dose)
  if (fractionProblem !== null) return fractionProblem
  const nativeProblem = nativeDoseProblem(dose)
  if (nativeProblem !== null) return nativeProblem
  const mark = typeof dose.mark === 'string' && dose.mark.trim().length > 0 ? dose.mark : null
  if (markKinds.has(measure.kind)) {
    if (dose.unit !== measure.kind) return `This product is measured with its ${measure.kind}.`
    if (mark === null) return `Say which mark on the ${measure.kind} to fill to.`
    if (!(measure.marks ?? []).some((entry) => sameMark(entry.label, mark))) return `"${mark}" is not a mark on the ${measure.kind}.`
    if (dose.amount < 0.5 || dose.amount > 4 || !Number.isInteger(dose.amount * 2)) return 'Fills go from a half to 4, in halves.'
    return null
  }
  if (mark !== null) return 'Only a cap or a scoop dose names a mark.'
  if (['US_cup', 'dispenser'].includes(dose.unit)) return measure.kind === 'amount' ? null : 'A native cup or dispenser dose needs a printed amount measure.'
  if (measure.kind === 'count') {
    if (dose.unit !== measure.countUnit) return `This product is counted in ${measure.countUnit ?? 'units'}.`
    if (!Number.isInteger(dose.amount) || dose.amount < 1 || dose.amount > 12) return 'A counted dose is a whole number from 1 to 12.'
    return null
  }
  if (!includes(measuredUnits, dose.unit)) return 'A printed amount is in ml, fl oz, g or oz.'
  if (dose.amount <= 0) return 'A dose must be more than zero.'
  return null
}

function ordered<Value extends string>(values: readonly Value[] | undefined, vocabulary: readonly Value[]): Value[] | undefined | null {
  if (values === undefined || values.length === 0) return undefined
  if (values.some((value) => !vocabulary.includes(value))) return null
  return vocabulary.filter((value) => values.includes(value))
}

function columns(row: DirectionsRow): string {
  return row.cells.map((cell) => cell.machineClass ?? '').sort().join(',')
}

const soilWords: Record<SoilLevel, string> = { light: 'lightly soiled', normal: 'normal soil', heavy: 'heavily soiled' }
const capitalized = (text: string): string => text.replace(/^./, (first) => first.toUpperCase())

/** A heading for a row the person did not type, from its conditions: "Large / heavily soiled". */
export function rowTextFor(row: Pick<DirectionsRow, 'loadSizes' | 'soilLevels' | 'join'>): string {
  const sizes = loadSizes.filter((size) => row.loadSizes?.includes(size))
  const soils = soilLevels.filter((soil) => row.soilLevels?.includes(soil))
  const contiguous = sizes.length > 1 && loadSizes.indexOf(sizes.at(-1)!) - loadSizes.indexOf(sizes[0]!) === sizes.length - 1
  const sizeText = sizes.length === 0 ? null : contiguous ? `${sizeWords[sizes[0]!]}–${sizeWords[sizes.at(-1)!]}` : sizes.map((size) => sizeWords[size]).join(' or ')
  const soilText = soils.length === 0 ? null : soils.map((soil) => soilWords[soil]).join(' or ')
  if (sizeText !== null && soilText !== null) return capitalized(row.join === 'or' ? `${sizeText} / ${soilText}` : `${sizeText}, ${soilText}`)
  return capitalized(sizeText ?? soilText ?? 'any load')
}

/**
 * The rules a directions table stands for, or why it cannot be saved. Deterministic, so Convex
 * stores exactly what an editor previews. An or-row becomes one rule per branch sharing the row;
 * rows are never rewritten into each other, so a load two rows fit asks rather than being guessed.
 */
export function compileDirections(table: DirectionsTable, supplyKind: string): CompileResult {
  const fail = (error: string): CompileResult => ({ ok: false, error })
  const measured = measureProblem(table.measure)
  if (measured !== null) return fail(measured)
  if (table.rows.length < 1 || table.rows.length > 8) return fail('Directions have between 1 and 8 rows.')
  const dryerProduct = includes(dryerSupplyKinds, supplyKind)
  if (dryerProduct && (table.stage !== 'dry' || !includes(dryerPlacements, table.placement))) return fail('A dryer product goes in the dryer drum.')
  if (!dryerProduct && (!includes(washerStages, table.stage) || !includes(placements, table.placement))) return fail('Choose where the product goes in the washer and when.')
  if (typeof table.timing !== 'string' || table.timing.trim().length === 0) return fail('Say when the product goes in.')
  if (new Set(table.rows.map(columns)).size > 1) return fail('Every row needs the same columns.')
  if (table.rows.filter((row) => !row.loadSizes?.length && !row.soilLevels?.length && !row.sourceLoadCategories?.length).length > 1) return fail('Only one row can apply to every load.')

  const rules: CompiledRule[] = []
  for (const [index, row] of table.rows.entries()) {
    if (row.sourceLoadCategories !== undefined && (row.sourceLoadCategories.length === 0 || row.sourceLoadCategories.some((category) => !['smaller', 'standard', 'larger', 'normal'].includes(category)) || row.loadSizes !== undefined)) return fail('Keep source load categories separate from application load sizes.')
    const number = index + 1
    const sizes = ordered(row.loadSizes, loadSizes)
    const soils = ordered(row.soilLevels, soilLevels)
    if (sizes === null || soils === null) return fail(`Row ${number} names a load size or soil level the app does not know.`)
    if (dryerProduct && soils !== undefined) return fail('Dryer product labels do not dose by soil level.')
    const classes = row.cells.map((cell) => cell.machineClass)
    if (row.cells.length === 0) return fail(`Row ${number} needs a dose.`)
    if (classes.some((entry) => entry !== undefined && !includes(washerClasses, entry))) return fail(`Row ${number} has a column the app does not know.`)
    if (classes.includes(undefined) && row.cells.length > 1 || new Set(classes).size !== classes.length) return fail(`Row ${number} has a column twice.`)
    if (dryerProduct && classes.some((entry) => entry !== undefined)) return fail('Dryer product labels do not have HE and standard columns.')
    const rowText = typeof row.rowText === 'string' && row.rowText.trim().length > 0 ? row.rowText.trim() : undefined
    const sets = sizes !== undefined && soils !== undefined && row.join === 'or'
      ? [{ loadSizes: sizes }, { soilLevels: soils }]
      : [{ ...(sizes === undefined ? {} : { loadSizes: sizes }), ...(soils === undefined ? {} : { soilLevels: soils }) }]
    const cells = [...row.cells].sort((left, right) => washerClasses.indexOf(left.machineClass ?? 'he') - washerClasses.indexOf(right.machineClass ?? 'he'))
    for (const cell of cells) {
      const problem = doseProblem(table.measure, cell)
      if (problem !== null) return fail(`Row ${number}: ${problem}`)
      const mark = typeof cell.mark === 'string' && cell.mark.trim().length > 0
        ? (table.measure.marks ?? []).find((entry) => sameMark(entry.label, cell.mark!))!.label.trim()
        : undefined
      for (const conditions of sets) {
        rules.push({
          row: number,
          ...(rowText === undefined ? {} : { rowText }),
          conditions: { ...conditions, ...(row.sourceLoadCategories === undefined ? {} : { sourceLoadCategories: [...row.sourceLoadCategories] }), ...(cell.machineClass === undefined ? {} : { machineClasses: [cell.machineClass] }) },
          dose: { amount: cell.amount, unit: cell.unit, ...(mark === undefined ? {} : { mark }), ...(cell.fractionOfMark === undefined ? {} : { fractionOfMark: cell.fractionOfMark }), ...(cell.target === undefined ? {} : { target: cell.target }), ...(cell.approximate === undefined ? {} : { approximate: cell.approximate }) },
          stage: table.stage,
          placement: table.placement,
          timing: table.timing.trim(),
        })
      }
    }
  }
  return { ok: true, rules }
}

/**
 * What compiled directions give across the grid, for an editor's coverage line: which loads they
 * cover, which ask for a missing fact, and where two rows fit with different doses.
 */
export function directionsCoverage(rules: readonly CompiledRule[], measure: SupplyMeasure, grid: CoverageGrid): CoverageCell[] {
  const asRules: ApplicationRule[] = rules.map((rule, index) => ({
    id: `row-${rule.row}-${String(index + 1).padStart(2, '0')}`,
    row: rule.row,
    conditions: rule.conditions,
    dose: rule.dose,
    stage: rule.stage,
    placement: rule.placement,
    timing: rule.timing,
    evidence: { status: 'verified' },
  }))
  return doseCoverage(asRules, measure, grid)
}
