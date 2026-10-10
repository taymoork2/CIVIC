import type { CareEvidence } from './index.ts'
import { careForbidsSoaking, careMethod } from './care.ts'
import { materialFibers } from './product-contract.ts'
import type { GarmentAdvice, PreOwnedTip } from './garment-advice.ts'

/**
 * Pre-owned clothes (thrift, hand-me-down). Every step here is optional advice or a hand-wash
 * routing; a care label always wins and a kill threshold never overrides it.
 *
 * Sources: wash before wearing (Oregon State Extension, PNW 757); bed bugs die in a dryer at 122 F
 * or more for 20 to 30 minutes and do not die in the washer (UMN Extension, Penn State Extension,
 * EPA); freezer at 0 F for 3 days (UMN, EPA); sealed bag for 2 weeks for lice (CDC); dye is unknown
 * until one wash proves it, so wash with like colors and look at the rinse water (Iowa State
 * Extension 2019; ACI laundry basics); musty: oxygen-bleach soak of 3 to 6 hours at the product's
 * label dose, which wool, silk and leather cannot take (OxiClean maker page), and badly mildewed
 * fabric may be beyond repair (Missouri Extension GH5928); smoke: several washes, air dry between,
 * no softener until the smell is gone (UGA Extension, textiles); vintage or weak pieces: hand wash
 * or a cleaner (UGA Extension, heirlooms; NPS Conserve O Gram 16/2). Evidence for anything smarter
 * about a missing tag is thin (DLI care labels), so it keeps today's cautious default.
 */
export const smells = ['musty', 'smoke', 'perfume'] as const
export type Smell = (typeof smells)[number]
export interface PreOwnedFacts {
  readonly smell?: Smell
  /** Thin or damaged: hand wash or a cleaner, never the machine; age alone does not set this fact. */
  readonly fragile?: boolean
  /** The owner chose to heat-treat before washing; only ever offered when the tag allows high heat. */
  readonly heatTreat?: boolean
  /** Washes so far, set by the adapter; the one-time steps stop after the first. */
  readonly washes?: number
}

/** Whether the tag allows the dryer's high heat: a tumble-dry label with the high-heat dots or no heat limit. */
export function tagAllowsHighHeat(care: CareEvidence | null | undefined): boolean {
  return care?.dryMethod === 'tumble_dry' && (care.dryHeat === undefined || care.dryHeat === null || care.dryHeat === 'high')
}

/** Fibers an oxygen-bleach soak must never reach, even in a blend ("50% cotton 50% wool"). */
const noSoakFiber = /\b(wool|silk|cashmere|merino|angora|alpaca|mohair|camel|down|leather|suede)\b/i

/** Cotton, linen, polyester and nylon (no wool, silk or leather in the blend) with a machine label that allows non-chlorine bleach and soaking. */
export function mayOxygenSoak(material: string | null | undefined, care: CareEvidence | null | undefined): boolean {
  const fibers = materialFibers(material)
  return fibers !== null && fibers.every((fiber) => ['cotton', 'linen', 'polyester', 'nylon'].includes(fiber)) && !noSoakFiber.test(material ?? '') && careMethod(care) === 'machine'
    && (care?.bleach === 'any' || care?.bleach === 'non_chlorine') && !careForbidsSoaking(care)
}

/** A vintage, thin or damaged pre-owned piece: left out of machine loads for hand washing or a cleaner. */
export const preOwnedHandWash = (facts: PreOwnedFacts | undefined): boolean => facts?.fragile === true

type Item = { readonly id: string; readonly material?: string | null; readonly care?: CareEvidence | null; readonly preOwned?: PreOwnedFacts; /** A stain report, stain note or open stain check: heat would set it. */ readonly stained?: boolean }
type Tip = Omit<GarmentAdvice, 'textileIds' | 'policyVersion'>

function tips(item: Item): Tip[] {
  const facts = item.preOwned
  if (facts === undefined) return []
  const first = (facts.washes ?? 0) === 0
  const tip = (id: PreOwnedTip, action: string, reason: string, source: string): Tip => ({ tipId: id, scope: id, action, reason, source })
  const out: Tip[] = []
  if (first) out.push(tip('pre_owned_rinse', 'Check the rinse water (first wash)', 'The dye on a pre-owned piece is unknown until one wash proves it. It washes with like colors; look at the rinse water, and if it runs colored, wash it alone next time.', 'Iowa State Extension (2019); ACI laundry basics'))
  // Heat sets a stain: while one is on the piece, the heat treatment waits and the no-heat ways are offered.
  if (first && facts.heatTreat === true && item.stained === true) {
    out.push(tip('pre_owned_heat', 'Heat treatment waits: there is a stain', 'Dryer heat would set the stain. Use the freezer (0 F for 3 days), a sealed bag (2 weeks for lice) or a cleaner instead, or heat-treat once the stain is gone.', 'UMN Extension; EPA; CDC'))
  } else if (first && facts.heatTreat === true && tagAllowsHighHeat(item.care)) {
    out.push(tip('pre_owned_heat', 'Heat-treat first: dryer on high, 20 to 30 minutes (optional)', 'A dryer at 122 F or more for 20 to 30 minutes kills bed bugs; washing alone does not. Use the dryer before the wash, only because this tag allows high heat.', 'UMN Extension; Penn State Extension; EPA'))
  }
  if (first && facts.smell === 'musty') {
    // The care record's soak limit wins over the product's 3 to 6 hours.
    const limit = item.care?.instructions?.maximumSoakMinutes
    const soakFor = limit !== undefined && limit < 360 ? `up to ${limit} minutes (the label’s limit)` : 'for 3 to 6 hours'
    out.push(mayOxygenSoak(item.material, item.care) && (limit === undefined || limit > 0)
      ? tip('pre_owned_musty', `Soak in oxygen bleach ${soakFor} first (optional)`, 'Follow the oxygen-bleach product’s label for the dose, and never leave it longer than the time above. Badly mildewed fabric may be beyond repair.', 'OxiClean maker guidance; Missouri Extension GH5928')
      : tip('pre_owned_musty_skip', 'Musty: skip the oxygen-bleach soak', 'This piece is not soaked: wool, silk, leather, dry-clean-only, an unrecorded fabric, or a label that does not allow non-chlorine bleach or soaking. Air it out before washing, or ask a cleaner. Badly mildewed fabric may be beyond repair.', 'OxiClean maker guidance; Missouri Extension GH5928'))
  }
  // ponytail: tipped for the first three washes; a "smell gone" answer would stop it sooner.
  if (facts.smell === 'smoke' && (facts.washes ?? 0) < 3) {
    out.push(tip('pre_owned_smoke', 'Smoke: wash again and air dry between', 'Smoke can take several washes. Air dry between washes and leave out fabric softener until the smell is gone.', 'UGA Extension, textiles'))
  }
  return out
}

/** The pre-owned steps for a load's garments: one per kind and wording, so a stain or a soak limit never takes another garment's text. */
export function preOwnedAdvice(items: readonly Item[], policyVersion: string): GarmentAdvice[] {
  const groups = new Map<string, GarmentAdvice>()
  for (const item of items) for (const entry of tips(item)) {
    const key = `${entry.scope}\n${entry.action}`
    groups.set(key, { ...entry, policyVersion, textileIds: [...(groups.get(key)?.textileIds ?? []), item.id] })
  }
  return [...groups.values()].map((tip) => ({ ...tip, textileIds: [...new Set(tip.textileIds)].sort() }))
}
