/**
 * Wash order and hold-back for one washer and one dryer (docs/plans/2026-10-06-dryer-sharing-design.md,
 * sections 5.1 to 5.3). Pure; the plan's loads and their ids are not changed, only the order they are
 * offered in and when the next one should start. Times are ms, durations minutes.
 */

const minute = 60_000

export type PassLoad = {
  readonly id: string
  /** Damp, sweaty, smelly, baby mess, a fresh stain, or needed by tomorrow. */
  readonly urgent: boolean
  /** Dryer runs its tumble pieces need: 0 for an air-dry load (stain loads too), 2 when they do not fit one run. */
  readonly dryerRuns: number
}

/**
 * Urgent first, then tumble loads with two-run loads first, air-dry last (the last dry time is pure
 * tail). Needs no minutes. Equal loads keep plan order. With one wash time and one dry time for every
 * load this is the same order Johnson's rule gives, so there is no Johnson code here.
 */
export function orderLoads(loads: readonly PassLoad[]): string[] {
  const rank = (load: PassLoad) => (load.urgent ? 0 : 3) + (load.dryerRuns === 0 ? 2 : load.dryerRuns > 1 ? 0 : 1)
  return [...loads].sort((left, right) => rank(left) - rank(right)).map((load) => load.id)
}

/**
 * When to start the next wash. As soon as the washer is free, unless the load would then wait longer
 * than the wait limit for the dryer; then it is held back so it ends when the dryer does. `wait` is
 * the expected wait in minutes for a start now, 0 when held back. Use a short wash time (5.3).
 */
export function nextStart(washerFreeAt: number, dryerEndAt: number | null, shortWash: number, waitLimit: number): { readonly at: number; readonly wait: number } {
  const end = washerFreeAt + shortWash * minute
  if (dryerEndAt === null || end >= dryerEndAt) return { at: washerFreeAt, wait: 0 }
  const wait = (dryerEndAt - end) / minute
  return wait <= waitLimit ? { at: washerFreeAt, wait } : { at: dryerEndAt - shortWash * minute, wait: 0 }
}

/**
 * A shared room (design 11): which washes to start now, given what the person says is free. Takes
 * `ordered` loads in `orderLoads` order and starts them while washers last, at most one tumble load
 * per free dryer; air-dry loads need no dryer. No hold-back and no clock: the app can't see the room.
 */
export function sharedStarts(ordered: readonly PassLoad[], washersFree: number, dryersFree: number): string[] {
  const picked: string[] = []
  let tumble = 0
  for (const load of ordered) {
    if (picked.length >= washersFree) break
    if (load.dryerRuns > 0) {
      if (tumble >= dryersFree) continue
      tumble += 1
    }
    picked.push(load.id)
  }
  return picked
}

/**
 * Whether an air-dry load fits a held-back washer gap: it washes, waits at most the limit, and is hung
 * on the same trip that starts the held-back wash, so it saves its own hanging trip. Never when the rack
 * is full.
 */
export function fillsGap(gap: number, airWash: number, move: number, waitLimit: number, rackFull: boolean): boolean {
  return !rackFull && airWash + move <= gap && gap - airWash - move <= waitLimit
}

export type DayLoad = PassLoad & { readonly washMinutes: number; readonly dryMinutes: number }
/** `dryerFreeAt`: when a load already in the dryer (or about to be) leaves it. `washerFreeAt`: when the washer can take the next wash, while a load is still in it; absent or past is now. */
export type DayOptions = { readonly waitLimit: number; readonly move: number; readonly rackFull: boolean; readonly dryerFreeAt?: number | null; readonly washerFreeAt?: number | null }
export type DayStep = { readonly id: string; readonly washStart: number; readonly washEnd: number; readonly dryStart: number | null; readonly dryEnd: number | null; readonly wait: number }

/**
 * A day on one washer and one dryer from `start`, in `orderLoads` order, with the hold-back and gap
 * fill. A trip is each time someone has to be at the machines; a move (about `move` minutes) is not
 * waiting. `waited` is planned wet minutes beyond the move. Everything assumes the estimates hold.
 */
export function planDay(loads: readonly DayLoad[], start: number, options: DayOptions): { readonly steps: readonly DayStep[]; readonly end: number; readonly trips: number; readonly waited: number } {
  const { waitLimit, move, rackFull } = options
  const byId = new Map(loads.map((load) => [load.id, load]))
  const remaining = orderLoads(loads).map((id) => byId.get(id)!)
  const steps: DayStep[] = []
  const trips = new Set<number>([start])
  let washerFree = Math.max(start, options.washerFreeAt ?? start)
  let lastTrip = start
  let dryerEnd: number | null = options.dryerFreeAt ?? null
  while (remaining.length > 0) {
    const load = remaining.shift()!
    if (load.dryerRuns === 0) {
      const washEnd = washerFree + load.washMinutes * minute
      steps.push({ id: load.id, washStart: washerFree, washEnd, dryStart: null, dryEnd: null, wait: 0 })
      trips.add(washEnd)
      lastTrip = washEnd
      washerFree = washEnd + move * minute
      continue
    }
    const timing = nextStart(washerFree, dryerEnd, load.washMinutes, waitLimit)
    let arrive = timing.at === washerFree ? lastTrip : timing.at
    const gap = (timing.at - washerFree) / minute
    const air = remaining.findIndex((other) => other.dryerRuns === 0)
    if (air >= 0 && gap > 0 && fillsGap(gap, remaining[air]!.washMinutes, move, waitLimit, rackFull)) {
      const filler = remaining.splice(air, 1)[0]!
      const washEnd = washerFree + filler.washMinutes * minute
      arrive = timing.at - move * minute
      steps.push({ id: filler.id, washStart: washerFree, washEnd, dryStart: null, dryEnd: null, wait: (arrive - washEnd) / minute })
    }
    trips.add(arrive)
    const washEnd = timing.at + load.washMinutes * minute
    const moveAt = Math.max(washEnd, dryerEnd ?? washEnd)
    const dryStart = moveAt + move * minute
    const end = dryStart + (load.dryerRuns * load.dryMinutes + (load.dryerRuns - 1) * move) * minute
    steps.push({ id: load.id, washStart: timing.at, washEnd, dryStart, dryEnd: end, wait: (moveAt - washEnd) / minute })
    trips.add(moveAt)
    lastTrip = moveAt
    washerFree = dryStart
    dryerEnd = end
  }
  if (dryerEnd !== null) trips.add(dryerEnd)
  const end = Math.max(start, ...steps.map((step) => step.dryEnd ?? step.washEnd))
  return { steps, end, trips: trips.size, waited: steps.reduce((sum, step) => sum + step.wait, 0) }
}

/** A load for `fitDay`: minutes may be missing (no clock then); `mayHang` when every tumble piece may go on a rack this time. */
export type FitLoad = PassLoad & { readonly washMinutes: number | null; readonly dryMinutes: number | null; readonly mayHang: boolean }

/**
 * What fits one day on one washer and one dryer (design 6.1, invariant 13). `today`: loads to wash, in
 * order; `hang`: of those, tumble loads washed now and hung because their dryer run would end too late;
 * `roll`: loads for tomorrow, lowest priority first to go; `hangNow`: urgent loads that do not fit, for
 * "Hang them to dry now; wash first tomorrow" (invariant 12). Without minutes: the count only.
 */
export type DayFit =
  | { readonly timed: false; readonly count: number }
  | { readonly timed: true; readonly today: readonly string[]; readonly hang: readonly string[]; readonly roll: readonly string[]; readonly hangNow: readonly string[]; readonly end: number }

/**
 * Fits the day greedily in `orderLoads` order: a load stays when the whole day still ends, plus the move,
 * by `homeUntil`, so no dryer runs while nobody is home. Pass the long wash and dryer minutes (design 10),
 * so an estimate that is off ends the day early, not late. `rack`: free rack or line loads; every
 * air-dry and hung load takes one. ponytail: greedy, not an exhaustive best fit; fine for one washer and
 * one dryer where loads look alike.
 */
export function fitDay(loads: readonly FitLoad[], start: number, homeUntil: number, rack: number, options: Omit<DayOptions, 'rackFull'>): DayFit {
  if (loads.some((load) => load.washMinutes === null || (load.dryerRuns > 0 && load.dryMinutes === null))) return { timed: false, count: loads.length }
  const byId = new Map(loads.map((load) => [load.id, load]))
  const day = (load: FitLoad, hang = false): DayLoad => ({ id: load.id, urgent: load.urgent, dryerRuns: hang ? 0 : load.dryerRuns, washMinutes: load.washMinutes!, dryMinutes: hang ? 0 : load.dryMinutes ?? 0 })
  const kept: DayLoad[] = []
  const hang: string[] = []
  const roll: string[] = []
  const hangNow: string[] = []
  let racks = rack
  const fits = (load: DayLoad) => planDay([...kept, load], start, { ...options, rackFull: true }).end + options.move * minute <= homeUntil
  for (const id of orderLoads(loads)) {
    const load = byId.get(id)!
    const air = load.dryerRuns === 0
    if ((!air || racks > 0) && fits(day(load))) {
      kept.push(day(load))
      if (air) racks -= 1
    } else if (!air && load.mayHang && racks > 0 && fits(day(load, true))) {
      kept.push(day(load, true))
      hang.push(id)
      racks -= 1
    } else (load.urgent ? hangNow : roll).push(id)
  }
  const planned = planDay(kept, start, { ...options, rackFull: true })
  return { timed: true, today: planned.steps.map((step) => step.id), hang, roll, hangNow, end: planned.end }
}

/**
 * The wash time learned from taps (design 10): after 3 washes on one washer and program, the median of
 * all of them, each capped at the program time plus 15 minutes so one forgotten load can't drag it. A
 * "Moved it" tap runs long and a late "Started" tap short; both count. Null before 3.
 */
export function learnedWash(minutes: readonly number[], programMinutes: number | null): { readonly minutes: number; readonly count: number } | null {
  if (minutes.length < 3) return null
  const capped = minutes.map((value) => programMinutes === null ? value : Math.min(value, programMinutes + 15)).sort((left, right) => left - right)
  const middle = capped.length / 2
  const median = capped.length % 2 === 1 ? capped[Math.floor(middle)]! : (capped[middle - 1]! + capped[middle]!) / 2
  return { minutes: Math.round(median), count: minutes.length }
}
