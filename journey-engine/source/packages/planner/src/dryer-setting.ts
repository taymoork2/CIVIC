import { documentedHeatTempF } from './fixture-catalog.ts'
import { heatRank, type DryerHeat } from './vocabulary.ts'

/** Hottest exhaust air a one-dot (low) tag allows: ISO 3758 / GINETEX, 60 C. */
export const lowHeatLimitF = 140

export interface DryerButton {
  readonly heat: DryerHeat
  readonly label: string
  /** The model's documented temperature for this button; never a typed or stored value. */
  readonly tempF?: number
}

/**
 * A dryer's buttons with their temperatures from the exact model's spec sheet. A button's
 * temperature is never typed or stored: any such value is dropped, and an unknown model has none.
 */
export function documentedHeatSettings<Button extends { readonly heat: string; readonly tempF?: number | undefined }>(
  model: string | undefined,
  buttons: readonly Button[],
): (Omit<Button, 'tempF'> & { readonly tempF?: number })[] {
  return buttons.map(({ tempF: _stored, ...button }) => {
    const tempF = documentedHeatTempF(model, button.heat)
    return tempF === undefined ? button : { ...button, tempF }
  })
}

/** `cooler`: the delicate button stands in for low; `unverified`: low is used though it may run hotter than the tag allows. */
export type DryerSettingNote = 'cooler' | 'unverified'

/** Hottest exhaust air a two-dot (medium) tag allows: ISO 3758 / GINETEX, 80 C. */
export const mediumHeatLimitF = 176

const limitF = (maxHeat: string): number => maxHeat === 'low' ? lowHeatLimitF : maxHeat === 'medium' ? mediumHeatLimitF : Infinity

/**
 * The one place a dryer button is chosen for a heat ceiling: the hottest button at or under it. A
 * button whose printed temperature is over the tag's limit is never used, whatever its name (a "low"
 * tag is a temperature, not a button's name). A low ceiling gets the low button only when its
 * temperature is known and at most 140 F; otherwise the coolest heated button that is not known to be
 * too hot, else low with a note. A button's label is never remapped to a heat.
 */
export function chooseDryerSetting<Button extends { readonly heat: string; readonly tempF?: number | undefined }>(
  buttons: readonly Button[],
  maxHeat: string,
): { readonly setting: Button; readonly note: DryerSettingNote | null } | undefined {
  const ceiling = heatRank(maxHeat)
  const limit = limitF(maxHeat)
  const sorted = buttons
    .filter((button) => heatRank(button.heat) >= 0 && heatRank(button.heat) <= ceiling && (button.tempF === undefined || button.tempF <= limit))
    .sort((left, right) => heatRank(left.heat) - heatRank(right.heat))
  const top = sorted.at(-1)
  if (top === undefined) return undefined
  if (maxHeat !== 'low') return { setting: top, note: null }
  if (top.heat !== 'low') return { setting: top, note: top.heat === 'delicate' && buttons.some((button) => button.heat === 'low') ? 'cooler' : null }
  if (top.tempF !== undefined) return { setting: top, note: null }
  const cooler = sorted.find((button) => button.heat === 'delicate')
  return cooler === undefined ? { setting: top, note: 'unverified' } : { setting: cooler, note: 'cooler' }
}
