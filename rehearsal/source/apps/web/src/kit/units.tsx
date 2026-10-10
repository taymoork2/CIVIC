import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { fractionOfMarkText, nativeDoseText } from '@washcloset/planner'
import { doseText } from '@/copy'

/**
 * Units are a display choice on each device. Doses are stored as the label printed them and
 * temperatures in °C; people in the US see fl oz, oz, and °F without anything being re-stored.
 */
export type UnitSystem = 'metric' | 'imperial'
export type UnitChoice = 'auto' | UnitSystem

const storageKey = 'washcloset:prefs:units'
const imperialRegions = new Set(['US', 'LR', 'MM'])
const mlPerFluidOunce = 29.5735
const gramsPerOunce = 28.3495

/** The system the device's own language and region imply: US English reads fl oz and °F. */
export function localeUnitSystem(locale: string): UnitSystem {
  try {
    const region = new Intl.Locale(locale).maximize().region
    return region !== undefined && imperialRegions.has(region) ? 'imperial' : 'metric'
  } catch {
    return 'metric'
  }
}

function readChoice(): UnitChoice {
  try {
    const stored = window.localStorage.getItem(storageKey)
    return stored === 'metric' || stored === 'imperial' ? stored : 'auto'
  } catch {
    return 'auto'
  }
}

const UnitContext = createContext<{ system: UnitSystem; choice: UnitChoice; setChoice: (choice: UnitChoice) => void }>({
  system: 'metric',
  choice: 'auto',
  setChoice: () => undefined,
})

export function UnitsProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<UnitChoice>('auto')
  const [localeSystem, setLocaleSystem] = useState<UnitSystem>('metric')
  const setChoice = (next: UnitChoice) => {
    setChoiceState(next)
    try {
      if (next === 'auto') window.localStorage.removeItem(storageKey)
      else window.localStorage.setItem(storageKey, next)
    } catch {
      // Blocked storage keeps the choice for this visit only.
    }
  }
  useEffect(() => {
    setChoiceState(readChoice())
    setLocaleSystem(localeUnitSystem(navigator.language))
    const sync = (event: StorageEvent) => { if (event.key === storageKey) setChoiceState(readChoice()) }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  return <UnitContext.Provider value={{ system: choice === 'auto' ? localeSystem : choice, choice, setChoice }}>{children}</UnitContext.Provider>
}

export function useUnits() {
  return useContext(UnitContext)
}

/** Fixed visual-fixture units without reading or persisting the person's device preference. */
export function PreviewUnits({ children, system = 'metric' }: { children: ReactNode; system?: UnitSystem }) {
  return <UnitContext.Provider value={{ system, choice: system, setChoice: () => undefined }}>{children}</UnitContext.Provider>
}

const roundTo = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places

/** A dose as this device shows it. Counted units (pods, caps, scoops, sheets) never change. */
export function displayDose(amount: number, unit: string, system: UnitSystem): { amount: number; unit: string } {
  const normalized = unit.trim().toLowerCase()
  if (system === 'imperial' && normalized === 'ml') return { amount: roundTo(amount / mlPerFluidOunce, 1), unit: 'fl oz' }
  if (system === 'imperial' && normalized === 'g') return { amount: roundTo(amount / gramsPerOunce, 1), unit: 'oz' }
  if (system === 'metric' && normalized === 'fl oz') return { amount: Math.round(amount * mlPerFluidOunce), unit: 'ml' }
  if (system === 'metric' && normalized === 'oz') return { amount: Math.round(amount * gramsPerOunce), unit: 'g' }
  return { amount, unit }
}

/** Converts an amount a person typed in the shown unit back to the unit the dose is stored in. */
export function storedAmount(shownAmount: number, storedUnit: string, system: UnitSystem): number {
  const shown = displayDose(1, storedUnit, system)
  if (shown.unit === storedUnit) return shownAmount
  const factor = storedUnit.trim().toLowerCase() === 'ml' ? mlPerFluidOunce : storedUnit.trim().toLowerCase() === 'g' ? gramsPerOunce
    : storedUnit.trim().toLowerCase() === 'fl oz' ? 1 / mlPerFluidOunce : 1 / gramsPerOunce
  return roundTo(shownAmount * factor, 1)
}

export function formatDose(amount: number, unit: string, system: UnitSystem): string {
  const shown = displayDose(amount, unit, system)
  return `${shown.amount} ${shown.unit}`
}

export function temperatureUnit(system: UnitSystem): '°F' | '°C' {
  return system === 'imperial' ? '°F' : '°C'
}

/** A stored °C value in the shown scale, whole degrees. */
export function shownTemperature(celsius: number, system: UnitSystem): number {
  return system === 'imperial' ? Math.round(celsius * 9 / 5 + 32) : celsius
}

export function displayTemperature(celsius: number, system: UnitSystem): string {
  return `${shownTemperature(celsius, system)} ${temperatureUnit(system)}`
}

/** A typed temperature in the shown scale, back to the stored °C. */
export function storedTemperature(shown: number, system: UnitSystem): number {
  return system === 'imperial' ? Math.round((shown - 32) * 5 / 9) : shown
}

/** Whole numbers plain, halves as a fraction, anything else to one decimal: how a cap is read. */
function fillsText(amount: number): string {
  if (Number.isInteger(amount)) return String(amount)
  if (Number.isInteger(amount * 2)) return `${Math.floor(amount) === 0 ? '' : Math.floor(amount)}½`
  return amount.toFixed(1)
}

const markUnits = new Set(['cap', 'scoop'])
const countWords: Record<string, [one: string, many: string]> = {
  spray: ['spray', 'sprays'],
  pod: ['pod', 'pods'],
  sheet: ['sheet', 'sheets'],
  ball: ['ball', 'balls'],
  tablet: ['tablet', 'tablets'],
}
const markRuns = /\d+(?:[.,/]\d+)*[½¼¾⅓⅔⅛]?|[½¼¾⅓⅔⅛]/g

export type DoseToken = { readonly text: string; readonly figure: boolean }

/**
 * A dose split for printing. A cap or scoop dose leads with the mark exactly as the cap prints it,
 * its digit runs set as figures and everything else as words; a count is a whole number of things;
 * anything else is a measured amount in this device's units.
 */
export type DoseParts = {
  readonly kind: 'mark' | 'count' | 'amount'
  readonly lead: string | null
  readonly tokens: readonly DoseToken[]
  readonly unitWord: string | null
  /** The printed volume the mark comes to, in this device's units; never estimated. */
  readonly secondary: string | null
  readonly spoken: string
}

export type DoseLike = {
  readonly target?: 'below' | 'just_below'
  readonly approximate?: boolean
  readonly amount: number
  readonly unit: string
  readonly mark?: string | null
  readonly fractionOfMark?: number
  readonly equivalent?: { readonly amount: number; readonly unit: string } | null
}

/** The count unit a dose is in, reading "pods" as "pod"; null for anything that is not counted. */
export function countedUnit(unit: string): string | null {
  const normalized = unit.trim().toLowerCase()
  const singular = normalized in countWords ? normalized : normalized.endsWith('s') ? normalized.slice(0, -1) : normalized
  return singular in countWords ? singular : null
}

/** A mark split into digit runs and word runs, kept verbatim so joining them gives the printed mark back. */
export function markTokens(mark: string): DoseToken[] {
  const tokens: DoseToken[] = []
  let index = 0
  for (const match of mark.matchAll(markRuns)) {
    if (match.index > index) tokens.push({ text: mark.slice(index, match.index), figure: false })
    tokens.push({ text: match[0], figure: true })
    index = match.index + match[0].length
  }
  if (index < mark.length) tokens.push({ text: mark.slice(index), figure: false })
  return tokens
}

export function doseParts(dose: DoseLike, system: UnitSystem): DoseParts {
  const native = nativeDoseText(dose)
  if (native !== null) return { kind: dose.target === undefined ? 'amount' : 'mark', lead: null, tokens: [{ text: native, figure: false }], unitWord: null, secondary: null, spoken: native }
  const unit = dose.unit.trim().toLowerCase()
  const mark = typeof dose.mark === 'string' ? dose.mark.trim() : ''
  if (markUnits.has(unit) && mark.length > 0) {
    const lead = doseText.fillTo(unit)
    const fills = dose.amount === 1 ? [] : [{ text: `${fillsText(dose.amount)} × `, figure: true }]
    const fraction = dose.fractionOfMark === undefined || dose.fractionOfMark === 1 ? '' : `${fractionOfMarkText(dose.fractionOfMark)} of `
    const volume = fraction !== '' || dose.equivalent == null ? null : formatDose(dose.equivalent.amount, dose.equivalent.unit, system)
    const times = dose.amount === 1 ? '' : dose.amount === 2 ? doseText.twice : doseText.times(dose.amount)
    const spokenMark = mark.charAt(0).toLowerCase() + mark.slice(1)
    return {
      kind: 'mark',
      lead,
      tokens: [...fills, ...markTokens(fraction + mark)],
      unitWord: null,
      secondary: volume === null ? null : `≈ ${volume}`,
      spoken: `${lead} ${fraction}${spokenMark}${times}${volume === null ? '' : doseText.about(volume)}`,
    }
  }
  const counted = countedUnit(unit)
  if (counted !== null) {
    const word = countWords[counted]![dose.amount === 1 ? 0 : 1]
    const figure = fillsText(dose.amount)
    return { kind: 'count', lead: null, tokens: [{ text: figure, figure: true }], unitWord: word, secondary: null, spoken: `${figure} ${word}` }
  }
  const shown = displayDose(dose.amount, dose.unit, system)
  const figure = Number.isInteger(shown.amount) ? String(shown.amount) : shown.amount.toFixed(1)
  // A cap or scoop without a mark is an older record: "1 cap", "2 caps".
  const word = markUnits.has(shown.unit) && shown.amount !== 1 ? `${shown.unit}s` : shown.unit
  return { kind: 'amount', lead: null, tokens: [{ text: figure, figure: true }], unitWord: word, secondary: null, spoken: `${figure} ${word}` }
}

/** Label wording such as "measure 60 ml", with its volumes and weights in the shown units. */
export function localizeVolumes(text: string, system: UnitSystem): string {
  return text
    .replace(/(\d+(?:\.\d+)?)\s?(ml|g)\b/gi, (_match, value: string, unit: string) => formatDose(Number(value), unit.toLowerCase(), system))
    .replace(/(\d+(?:\.\d+)?)\s?(fl\.? oz)\b/gi, (_match, value: string) => formatDose(Number(value), 'fl oz', system))
}

/** Server-written text such as "normal cycle, 30 °C", in the shown scale. */
export function localizeTemperatures(text: string, system: UnitSystem): string {
  return system === 'metric' ? text : text.replace(/(-?\d+(?:\.\d+)?)\s?°C/g, (_match, value: string) => displayTemperature(Number(value), system))
}

export const money = (amount: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)

/**
 * A dryer that sells time in blocks ($0.50 for 16 minutes): how many blocks `minutes` takes and what
 * they cost. Null for a dryer priced per start, a dryer with no price, or without minutes: none is invented.
 */
export function dryerBlocks(minutes: number | null | undefined, dryer: { readonly blockMinutes?: number | null; readonly pricePerStart: number | null }): { readonly blocks: number; readonly price: number } | null {
  if (minutes == null || !(minutes > 0) || dryer.blockMinutes == null || !(dryer.blockMinutes > 0) || dryer.pricePerStart === null) return null
  const blocks = Math.ceil(minutes / dryer.blockMinutes)
  return { blocks, price: Math.round(blocks * dryer.pricePerStart * 100) / 100 }
}
