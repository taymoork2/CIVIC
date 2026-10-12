import type { Dose, MachineEvidence, SupplyItem, TextileEvidence } from './index.ts'
import { sha256 } from './hash.ts'
import { namedFiber } from './fabric-details.ts'

export const sourceLoadCategories = ['smaller', 'standard', 'larger', 'normal'] as const
export type SourceLoadCategory = typeof sourceLoadCategories[number]

/** Reviewed restrictions remain attached to the product, including supplies added later. */
export interface ProductSourceContract {
  readonly digest: string
  readonly mixing?: 'no_bleach_or_liquid_softener' | 'regular_detergent_only'
  readonly excludedFibers?: readonly string[]
  readonly requireKnownMaterial?: boolean
  readonly requireColorfastness?: boolean
  readonly requireOrdinaryWashRoute?: boolean
  readonly sourceLoadCategories?: readonly SourceLoadCategory[]
}

/** A person's check of this product and this exact load; source acceptance never supplies it. */
export interface ProductLoadConfirmation {
  readonly supplyId: string
  readonly sourceDigest: string
  readonly loadFingerprint: string
  readonly colorfastnessChecked: boolean
  readonly sourceLoadCategory?: SourceLoadCategory
  readonly ordinaryWashRouteChecked?: boolean
  readonly washContextFingerprint?: string
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

/** Share this function with the execution adapter; edits to garment facts invalidate a check. */
export function productLoadFingerprint(textiles: readonly TextileEvidence[]): string {
  return sha256(canonical([...textiles].sort((a, b) => canonical(a).localeCompare(canonical(b)))))
}

/** Binds route inspection to the recorded washer/program/options and planned temperature. */
export function productWashContextFingerprint(machine: MachineEvidence, cycle: string, temperatureC: number | null): string {
  return sha256(canonical({ machine, cycle, temperatureC }))
}

/** Known constituent fibers only: one unknown word keeps restricted products unconfirmed. */
export function materialFibers(material: string | null | undefined): string[] | null {
  const value = material?.trim().toLowerCase()
  if (!value || /\b(unknown|unspecified|other)\b/.test(value)) return null
  const normalized = value.split(/[,/;]\s*/u).map((part) => {
    const name = part.replace(/^\d+(?:\.\d+)?%\s*/u, '')
    return namedFiber(name)?.fiber ?? part
  }).join(', ')
  const words = normalized.split(/[^a-z]+/).filter(Boolean)
  const aliases: Record<string, string> = { cashmere: 'wool', merino: 'wool', mohair: 'wool', angora: 'wool', alpaca: 'wool', camel: 'wool', suede: 'leather', polyamide: 'nylon', spandex: 'elastane', viscose: 'rayon' }
  const fibers = ['cotton', 'linen', 'polyester', 'nylon', 'elastane', 'rayon', 'lyocell', 'modal', 'hemp', 'acrylic', 'acetate', 'triacetate', 'cupro', 'ramie', 'polypropylene', 'silk', 'wool', 'leather', 'down']
  const noise = ['blend', 'blends', 'and', 'with', 'fiber', 'fibers', 'fabric', 'organic', 'combed', 'recycled', 'jersey', 'knit', 'woven', 'pure']
  if (words.some((word) => !fibers.includes(aliases[word] ?? word) && !noise.includes(word))) return null
  const found = [...new Set(words.map((word) => aliases[word] ?? word).filter((word) => fibers.includes(word)))]
  return found.length === 0 ? null : found
}

export function sourceMaterialAllowed(contract: ProductSourceContract, material: string | null | undefined): boolean {
  const fibers = materialFibers(material)
  if (fibers === null) return !contract.requireKnownMaterial && !contract.excludedFibers?.length
  return !(contract.excludedFibers ?? []).some((fiber) => (materialFibers(fiber) ?? [fiber.trim().toLowerCase()]).some((excluded) => fibers.includes(excluded)))
}

function sourceMixingAllows(contract: ProductSourceContract | undefined, other: SupplyItem): boolean {
  if (contract?.mixing === undefined) return true
  const chemical = ['chemical_consumable', 'single_use_consumable', 'detergent', 'softener', 'bleach', 'sanitizer', 'scent_booster'].includes(other.kind ?? '')
  if (!chemical) return true
  const affirmativeBleach = other.capabilities?.some((fact) => fact.kind === 'oxygen_bleaching' && fact.status === 'present') || ['oxygen_bleach', 'chlorine_bleach'].includes(other.chemistry ?? other.stainChemistry ?? '')
  if (affirmativeBleach) return false
  if (contract.mixing === 'regular_detergent_only') return ['detergent', 'pods'].includes(other.use ?? '') && other.bleachKind === 'none'
  if (other.bleachKind === undefined || other.bleachKind === 'unknown' || other.bleachKind !== 'none') return false
  if (other.use === 'softener' || other.kind === 'softener') {
    const form = other.form ?? other.formulation?.form
    return form !== undefined && form !== 'liquid' && form !== 'unknown'
  }
  return true
}

export function sourceMixingConflict(left: SupplyItem, right: SupplyItem): boolean {
  return !sourceMixingAllows(left.sourceContract, right) || !sourceMixingAllows(right.sourceContract, left)
}

/** Native qualifiers are executable dose semantics, never inferred calibration. */
export function nativeDoseProblem(dose: Pick<Dose, 'amount' | 'unit' | 'mark' | 'fractionOfMark' | 'target' | 'approximate'>): string | null {
  if (dose.target !== undefined && (!['below', 'just_below'].includes(dose.target) || dose.unit !== 'cap' || !dose.mark || dose.amount !== 1 || dose.fractionOfMark !== undefined || dose.approximate !== undefined)) return 'A qualitative target needs one cap mark and cannot have a numerical fraction or approximation.'
  if (dose.approximate !== undefined && (dose.approximate !== true || dose.unit !== 'US_cup' || dose.amount !== 0.25 || dose.mark !== undefined || dose.fractionOfMark !== undefined)) return 'The supported approximate source dose is ¼ US cup without a mark or conversion.'
  if (dose.unit === 'US_cup' && dose.approximate !== true) return 'Keep the source cup dose approximate.'
  if (dose.unit === 'dispenser' && (dose.amount !== 0.5 || dose.mark !== undefined || dose.fractionOfMark !== undefined || dose.target !== undefined || dose.approximate !== undefined)) return 'The source specifies half an uncalibrated dispenser.'
  return null
}

export function nativeDoseText(dose: Pick<Dose, 'amount' | 'unit' | 'mark' | 'target' | 'approximate'>): string | null {
  if (dose.target !== undefined && dose.mark) return `Fill cap ${dose.target === 'just_below' ? 'just below' : 'below'} ${dose.mark}`
  if (dose.unit === 'US_cup' && dose.approximate) return `Approximately ${dose.amount === 0.25 ? '¼' : dose.amount} US ${dose.amount <= 1 ? 'cup' : 'cups'}`
  if (dose.unit === 'dispenser') return `${dose.amount === 0.5 ? 'Half the dispenser' : `${dose.amount} ${dose.amount === 1 ? 'dispenser' : 'dispensers'}`} (capacity not calibrated)`
  return null
}
