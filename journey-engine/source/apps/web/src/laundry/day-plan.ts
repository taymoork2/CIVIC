import { fitDay, planDay, type DayFit, type DayOptions, type DecisionReason, type FitLoad } from '@washcloset/planner'

import type { Textile } from '@/household/inventory-types'

/**
 * Laundry day modes (design 6): "All today" and "Spread out", one tap each. Pure: which loads go today,
 * which two loads could go together, and when the rest is done. Nothing here is stored as a schedule;
 * every day is planned again from the hamper.
 */

const day = 24 * 60 * 60_000

/** Midnight at the start of `time`'s day, on this phone. */
export function startOfDay(time: number): number {
  const date = new Date(time)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** Today at "HH:MM" (an `<input type="time">` value) on this phone; null for anything else. */
export function todayAt(value: string, now: number): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (match === null) return null
  const date = new Date(now)
  date.setHours(Number(match[1]), Number(match[2]), 0, 0)
  return date.getTime()
}

/** The end-of-day limit without a "Home until" answer today: 9 pm (design 6.2). */
export const defaultHomeUntil = '21:00'
/** Loads a day when spread out, until the household says (owner decision 5). */
export const defaultLoadsPerDay = 2

const dried = new Set(['line_dry', 'drip_dry', 'dry_flat'])
const stainReasons = new Set(['food', 'mud_grass', 'stain_other'])

export const stained = (textile: Pick<Textile, 'flag'> & Partial<Pick<Textile, 'knownStain'>>): boolean =>
  textile.knownStain !== undefined || textile.flag?.stainReport !== undefined || (textile.flag?.reasons.some((reason) => stainReasons.has(reason)) ?? false)

/**
 * When a piece must be washed by: its "needed by", a day earlier when it hangs, lies flat or is stained,
 * since it does not dry in a dryer run ("wash today so it can dry overnight"). Null without a date.
 */
export function pieceNeededBy(textile: Pick<Textile, 'flag' | 'care'> & Partial<Pick<Textile, 'knownStain'>>): number | null {
  const neededBy = textile.flag?.neededBy
  if (neededBy === undefined) return null
  return dried.has(textile.care?.dryMethod ?? '') || stained(textile) ? neededBy - day : neededBy
}

/** Every tumble piece may go on a rack this time: none must lie flat, none has drying steps to read first. */
export function mayHang(textiles: readonly Pick<Textile, 'care'>[]): boolean {
  return textiles.every((textile) => textile.care?.dryMethod !== 'dry_flat'
    && (textile.care?.instructions === undefined || textile.care.instructions.beforeDrying.length + textile.care.instructions.drying.length + textile.care.instructions.afterDrying.length === 0))
}

export type DayCandidate = {
  readonly id: string
  /** Damp, sweaty, smelly, baby mess, a fresh stain, or needed by tomorrow (`urgentFlag`). */
  readonly urgent: boolean
  /** The soonest `pieceNeededBy` of its pieces. */
  readonly neededBy: number | null
  readonly wearerIds: readonly string[]
  /** How full its washer is, 0 to 1. */
  readonly fullness: number
}

/**
 * "Spread out": today's loads (design 6.2). Urgent loads and loads needed by tomorrow always go; then
 * the soonest "needed by", then the picked person's loads (only offered with 2+ wearers), then the
 * fullest, to the day's count. ponytail: picks whole planned loads, not pieces, so a person's day can
 * carry someone else's pieces in the same load; pick pieces if families ask for half-full person loads.
 */
export function spreadDay(loads: readonly DayCandidate[], perDay: number, now: number, wearerId: string | null = null): string[] {
  const endOfTomorrow = startOfDay(now) + 2 * day
  const must = loads.filter((load) => load.urgent || (load.neededBy !== null && load.neededBy < endOfTomorrow))
  const mine = (load: DayCandidate) => wearerId !== null && load.wearerIds.includes(wearerId) ? 0 : 1
  const rest = loads.filter((load) => !must.includes(load))
    .sort((left, right) => (left.neededBy ?? Infinity) - (right.neededBy ?? Infinity) || mine(left) - mine(right) || right.fullness - left.fullness)
  return [...must, ...rest.slice(0, Math.max(0, perDay - must.length))].map((load) => load.id)
}

/** The day the rest is done, at `perDay` loads a day from tomorrow: midnight of that day. */
export function restBy(rest: number, perDay: number, now: number): number {
  return startOfDay(now) + Math.ceil(rest / Math.max(1, perDay)) * day
}

/** A planned load as the "could go together" check reads it (planner `LoadPlan`). */
export type TogetherLoad = {
  readonly id: string
  readonly textileIds: readonly string[]
  readonly machineId: string | null
  readonly cycle: string
  readonly temperatureC: number | null
  readonly bulkUnits: number
  readonly capacityUnits: number
  readonly drying: { readonly dryerId: string | null; readonly heat: string | null; readonly bulkUnits: number; readonly capacityUnits: number | null } | null
}

/** Only these preferences start a load that could be undone (design 6.1): soil, and heavy kept from light. */
const preferenceSplits = new Set(['soil_separation', 'heavy_light_mixing_avoidance'])
/** A load started for any of these is a care, dye or capacity split, never offered. */
const careSplits = new Set(['care_compatibility', 'dye_first_wash_risk', 'capacity_limit', 'pin_refused'])

/**
 * "2 small loads could go together" (design 6.1): a load the planner started only because of a
 * preference, and another on the same washer, program and temperature that both fit in one wash and one
 * dryer run at one heat. Never across care limits or a dye risk in either load, colours that must stay
 * apart (`clash`, any two pieces of the two loads), stained pieces or pieces the person placed. The pair
 * (kept, joined) or null; never preselected.
 */
export function couldGoTogether(loads: readonly TogetherLoad[], reasons: readonly Pick<DecisionReason, 'code' | 'details' | 'loadId'>[], left: (textileId: string) => boolean,
  clash: (one: string, other: string) => boolean = () => false): readonly [string, string] | null {
  const own = (load: TogetherLoad) => reasons.filter((reason) => reason.loadId === load.id)
  const open = (load: TogetherLoad) => !load.textileIds.some(left)
  const careSplit = (load: TogetherLoad) => own(load).some((reason) => careSplits.has(reason.code))
  const colours = (one: TogetherLoad, other: TogetherLoad) => one.textileIds.some((id) => other.textileIds.some((otherId) => clash(id, otherId)))
  const dryerFits = (one: TogetherLoad, other: TogetherLoad) => one.drying === null && other.drying === null
    || (one.drying !== null && other.drying !== null && one.drying.dryerId === other.drying.dryerId && one.drying.heat === other.drying.heat && one.drying.capacityUnits !== null
      && one.drying.bulkUnits + other.drying.bulkUnits <= one.drying.capacityUnits)
  for (const load of loads) {
    const why = own(load)
    if (!why.some((reason) => reason.code === 'preference_applied' && preferenceSplits.has(String(reason.details.cause))) || careSplit(load) || !open(load)) continue
    const partner = loads.find((other) => other !== load && open(other) && !careSplit(other) && !colours(load, other) && other.machineId === load.machineId && other.cycle === load.cycle && other.temperatureC === load.temperatureC
      && other.bulkUnits + load.bulkUnits <= Math.min(other.capacityUnits, load.capacityUnits) && dryerFits(other, load))
    if (partner !== undefined) return [partner.id, load.id]
  }
  return null
}

const lights = new Set(['white', 'very_light', 'light'])
const darks = new Set(['dark', 'black', 'saturated'])

/**
 * Two pieces that never wash together when offered "together": light with dark, a piece whose dye runs
 * with anything, and a new piece of medium or darker with another colour. Stricter than the planner,
 * which lets a person's own pin mix colours as a caution; this offer is the app's own idea (design 6.1).
 */
export function coloursClash(one: Pick<Textile, 'colorGroup'> & { readonly dyeRun?: string }, other: Pick<Textile, 'colorGroup'> & { readonly dyeRun?: string }): boolean {
  const group = (piece: typeof one) => piece.colorGroup ?? 'unknown'
  // Recorded running dye washes only with its own dye group, which this offer does not check: never.
  if (one.dyeRun === 'bleeds' || other.dyeRun === 'bleeds') return true
  const mayRun = (piece: typeof one) => piece.dyeRun === 'new' && !lights.has(group(piece))
  if ((mayRun(one) || mayRun(other)) && (group(one) !== group(other) || group(one) === 'unknown')) return true
  return lights.has(group(one)) && darks.has(group(other)) || lights.has(group(other)) && darks.has(group(one))
}

/** Pins that put `join`'s pieces in `keep`'s load and leave every other load as it is (`frozenPins`). */
export function togetherPins(loads: readonly Pick<TogetherLoad, 'id' | 'textileIds'>[], keep: string, join: string): { readonly textileId: string; readonly group: number }[] {
  const group = loads.findIndex((load) => load.id === keep) + 1
  return loads.flatMap((load, index) => load.textileIds.map((textileId) => ({ textileId, group: load.id === join ? group : index + 1 })))
}

/**
 * Where each load of a picked day goes, as the names the strip shows: rolled to tomorrow, washed now
 * and hung, or hung now because it will not fit. A load is exactly one of these. `late` are the loads
 * the live refit no longer fits; they win over what the pick said, since a load that will not fit
 * today cannot also be washed now to hang.
 */
export function dayLists(pick: { readonly rolled: readonly string[]; readonly hangNow: readonly string[] }, late: readonly string[] = []): { readonly rolled: string[]; readonly hangNow: string[] } {
  const rolled = [...new Set([...late, ...pick.rolled])]
  const hangNow = [...new Set(pick.hangNow)].filter((name) => !rolled.includes(name))
  return { rolled, hangNow }
}

/**
 * What is left of a picked day, from what the machines are doing now (design 6.1, invariant 13). Worked
 * out again on every render, so a first wash that starts late or an extended dryer moves the end and rolls
 * the loads that no longer fit before "Home until": the end the pick promised is never kept. `loads` are
 * the loads still to start, with the long minutes; `options` carry when the washer and dryer are free.
 * Null when a load has no minutes: there is no clock then (invariant 11).
 */
export function remainingDay(loads: readonly FitLoad[], now: number, until: number | null, rack: number, options: Omit<DayOptions, 'rackFull'>): {
  readonly plan: ReturnType<typeof planDay>
  readonly end: number
  /** Set when the day no longer ends, with the move, before `until`: hanging is not offered again here. */
  readonly refit: Extract<DayFit, { timed: true }> | null
} | null {
  if (loads.length === 0 || loads.some((load) => load.washMinutes === null || (load.dryerRuns > 0 && load.dryMinutes === null))) return null
  const plan = planDay(loads.map((load) => ({ ...load, washMinutes: load.washMinutes!, dryMinutes: load.dryMinutes ?? 0 })), now, { ...options, rackFull: true })
  const end = Math.max(plan.end, options.dryerFreeAt ?? 0)
  const fit = until === null || end + options.move * 60_000 <= until ? null : fitDay(loads.map((load) => ({ ...load, mayHang: false })), now, until, rack, options)
  return { plan, end, refit: fit?.timed === true ? fit : null }
}
