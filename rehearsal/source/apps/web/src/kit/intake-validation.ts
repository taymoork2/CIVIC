import { dyeRunStates, garmentKinds, normalizeFabricDetails, smells, soilLevels } from '@washcloset/planner'
import type { AddDraft } from '@/closet/add-clothes'
import type { MachineDraft } from '@/household/machine-sheet'
import type { BottleDraft } from '@/products/bottle-sheet'
import { colourWords } from '@/copy'

type Guard = (value: unknown) => boolean
const text: Guard = (value) => typeof value === 'string' && value.length <= 1000
const number: Guard = (value) => typeof value === 'number' && Number.isFinite(value)
const boolean: Guard = (value) => typeof value === 'boolean'
const oneOf = (values: readonly unknown[]): Guard => (value) => values.includes(value)
const optional = (guard: Guard): Guard => (value) => value === undefined || guard(value)
const nullable = (guard: Guard): Guard => (value) => value === null || guard(value)
const array = (guard: Guard, max = 30): Guard => (value) => Array.isArray(value) && value.length <= max && value.every(guard)
const object = (fields: Record<string, Guard>): Guard => (value) => typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).every((key) => Object.hasOwn(fields, key)) && Object.entries(fields).every(([key, guard]) => guard((value as Record<string, unknown>)[key]))
const colour = nullable(oneOf(Object.keys(colourWords)))
const colourDraft = object({ colour, colorName: text, count: number, dyeRun: nullable(oneOf(dyeRunStates)) })
const fabric: Guard = (value) => {
  try { normalizeFabricDetails(value as AddDraft['fabricDetails']); return value === undefined || typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).every((key) => ['fibers', 'construction', 'finishes'].includes(key)) }
  catch { return false }
}
const addDraft = object({
  whose: nullable((value) => value === 'shared' || object({ wearerId: text })(value)), kind: nullable(oneOf(garmentKinds)),
  colour, colorName: text, dyeRun: nullable(oneOf(dyeRunStates)),
  preOwned: optional(object({ smell: nullable(oneOf(smells)), fragile: boolean, heatTreat: boolean })),
  stain: nullable(oneOf(['none', 'food', 'grease', 'ink', 'other'])), stainAge: nullable(oneOf(['new', 'set_in'])),
  material: nullable(text), fabricDetails: optional(fabric), additionalColors: optional(array(colourDraft, 19)), sameCareInstructions: optional(boolean),
  tag: object({ method: nullable(oneOf(['machine', 'hand_wash', 'do_not_wash', 'dry_clean_only', 'no_tag'])), dots: oneOf([0, 1, 2, 3, 4]), bars: oneOf([0, 1, 2]), maxTemperatureC: optional(number), washWithLikeColors: optional(boolean), bleach: nullable(oneOf(['any', 'none', 'non_chlorine', 'unknown'])), dryer: nullable(oneOf(['tumble', 'low', 'medium', 'high', 'no_heat', 'no_tumble', 'unknown'])), natural: nullable(oneOf(['line', 'flat', 'drip'])), iron: oneOf(['low', 'medium', 'high', 'no', 'unknown', 'allowed']), steamPermission: optional(oneOf(['allowed', 'not_allowed', 'unknown'])) }),
  count: number, soil: oneOf(soilLevels), name: nullable(text), article: optional(nullable(text)), nameFromSearch: optional(boolean), occasions: nullable(array(text)), tags: optional(array(text)),
  identity: object({ brand: text, size: text, styleNumber: text, rnNumber: text, barcode: text }),
})

export type GarmentIntake = { draft: AddDraft; step: string; careStep: 'wash' | 'bleach' | 'dry'; destination: 'closet' | 'hamper'; soilChosen: boolean; carried: boolean; someoneNew?: boolean; newName?: string; correctingReview?: boolean }
const garment = object({ draft: addDraft, step: oneOf(['type', 'whose', 'details', 'fabric', 'color', 'origin', 'dye', 'care', 'label', 'stain', 'final']), careStep: oneOf(['wash', 'bleach', 'dry']), destination: oneOf(['closet', 'hamper']), soilChosen: boolean, carried: boolean, someoneNew: optional(boolean), newName: optional(text), correctingReview: optional(boolean) })
export const validGarmentIntake = (value: unknown): value is GarmentIntake => garment(value)

/** Optional evidence tasks start after the basic record saves, and are never recovered as confirmed evidence. */
const machine = object({ draft: object({ place: nullable(oneOf(['home', 'shared'])), kind: nullable(oneOf(['washer', 'dryer', 'hanging'])), door: nullable(oneOf(['front', 'top'])), he: nullable(oneOf(['yes', 'no', 'not_sure'])), slots: array(oneOf(['detergent_compartment', 'softener_compartment', 'bleach_compartment'])), price: text, block: text, minutes: text, programMode: optional(oneOf(['fixed', 'sensor', 'unknown'])), rinseContact: optional(object({})), washProcesses: optional(object({})), heat: object({ no_heat: text, delicate: text, low: text, medium: text, high: text }), name: text, model: text, volume: text, named: boolean, count: number }), step: oneOf(['type', 'controls', 'identity', 'review']), correctingReview: optional(boolean) })
export const validMachineIntake = (value: unknown): value is { draft: MachineDraft; step: 'type' | 'controls' | 'identity' | 'review'; correctingReview?: boolean } => machine(value)
export const previousMachineDraftNames = ['any', 'washer', 'dryer', 'hanging'].flatMap((type) => ['any', 'home', 'shared'].map((location) => `machine-intake:${type}:${location}`))
const bottle = object({ draft: object({ form: nullable(oneOf(['liquid', 'powder', 'pods', 'sheets', 'beads', 'balls', 'dispenser'])), use: nullable(oneOf(['detergent', 'softener', 'booster', 'sanitizer', 'rinse_sanitizer', 'scent_booster', 'dryer_sheet', 'dryer_ball'])), name: text, marks: array(text, 12), pendingMark: optional(text) }), step: oneOf(['form', 'purpose', 'identity', 'measurement', 'review']), correctingReview: optional(boolean) })
export const validBottleIntake = (value: unknown): value is { draft: BottleDraft; step: 'form' | 'purpose' | 'identity' | 'measurement' | 'review'; correctingReview?: boolean } => bottle(value)
