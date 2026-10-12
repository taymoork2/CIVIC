import { fitDay, orderLoads, planDay, type FitLoad } from '@washcloset/planner'
import { describe, expect, test } from 'vitest'

import { coloursClash, couldGoTogether, dayLists, pieceNeededBy, remainingDay, restBy, spreadDay, startOfDay, todayAt, togetherPins, type DayCandidate, type TogetherLoad } from '@/laundry/day-plan'

const hour = 60 * 60_000
const day = 24 * hour
const nine = new Date(2026, 9, 6, 9, 0).getTime()
const options = { waitLimit: 30, move: 5 }

/**
 * A big family's hamper (design 12.3): 12 loads from 4 wearers on one washer and one dryer. Times are
 * the long figures (wash 50, dryer 65 + 10). Two urgent loads, Dad's hang-dry shirts needed in two days,
 * everything else by fullness.
 */
type Fixture = DayCandidate & FitLoad & { readonly washMinutes: number; readonly dryMinutes: number }
const load = (id: string, wearer: string, extra: Partial<Fixture> = {}): Fixture => ({ id, urgent: false, neededBy: null, wearerIds: [wearer], fullness: 0.8, dryerRuns: 1, washMinutes: 50, dryMinutes: 75, mayHang: true, ...extra })
const hamper: Fixture[] = [
  load('kid-sports', 'kid', { urgent: true, fullness: 0.5 }),
  load('baby-mess', 'baby', { urgent: true, fullness: 0.3 }),
  load('dad-shirts', 'dad', { dryerRuns: 0, dryMinutes: 0, neededBy: nine + 2 * day - day, fullness: 0.4 }),
  load('towels', 'shared', { dryerRuns: 2, fullness: 1 }),
  load('mom-darks', 'mom', { fullness: 0.9 }),
  load('mom-lights', 'mom', { fullness: 0.6 }),
  load('dad-jeans', 'dad', { fullness: 0.95 }),
  load('kid-tees', 'kid', { fullness: 0.7 }),
  load('kid-school', 'kid', { fullness: 0.85 }),
  load('baby-bodysuits', 'baby', { fullness: 0.5 }),
  load('sheets', 'shared', { fullness: 1 }),
  load('mom-delicates', 'mom', { dryerRuns: 0, dryMinutes: 0, washMinutes: 30, fullness: 0.3 }),
]

/** Days of one plan mode until the hamper is empty: the loads washed each day (cycles per day). */
function days(pick: (rest: readonly Fixture[], now: number) => readonly string[]): string[][] {
  let rest = [...hamper]
  const out: string[][] = []
  for (let index = 0; rest.length > 0 && index < 14; index++) {
    const now = nine + index * day
    const today = pick(rest, now)
    out.push([...today])
    rest = rest.filter((entry) => !today.includes(entry.id))
  }
  return out
}

describe('a 12-load, 4-wearer hamper on one washer and one dryer', () => {
  test('All today fits what ends before 9 pm and rolls the rest, urgent first', () => {
    const recorded = days((rest, now) => {
      const fit = fitDay(rest, now, todayAt('21:00', now)!, 1, options)
      if (!fit.timed) throw new Error('timed')
      expect(fit.hangNow).toEqual([])
      const kept = rest.filter((entry) => fit.today.includes(entry.id)).map((entry) => fit.hang.includes(entry.id) ? { ...entry, dryerRuns: 0, dryMinutes: 0 } : entry)
      expect(planDay(kept, now, { ...options, rackFull: true }).end + 5 * 60_000).toBeLessThanOrEqual(todayAt('21:00', now)!)
      return fit.today
    })
    // Cycles per day: about 13 to 15 hours of dryer time cannot finish in one day (design 6.1), and a
    // one-load rack takes one air-dry load a day, so the delicates wait a third day.
    expect(recorded.map((today) => today.length)).toEqual([8, 3, 1])
    expect(recorded[2]).toEqual(['mom-delicates'])
    expect(recorded[0]!.slice(0, 2)).toEqual(['kid-sports', 'baby-mess'])
    expect(recorded.flat().sort()).toEqual(hamper.map((entry) => entry.id).sort())
  })

  test('Spread out at 2 a day: urgent and needed-soon loads always go, then the fullest; each day ends by 9 pm', () => {
    const recorded = days((rest, now) => {
      const chosen = spreadDay(rest, 2, now)
      const fit = fitDay(rest.filter((entry) => chosen.includes(entry.id)), now, todayAt('21:00', now)!, 1, options)
      if (!fit.timed) throw new Error('timed')
      return fit.today
    })
    expect(recorded.map((today) => today.length)).toEqual([3, 2, 2, 2, 2, 1])
    expect(new Set(recorded[0])).toEqual(new Set(['kid-sports', 'baby-mess', 'dad-shirts']))
    expect(recorded[1]).toEqual(['towels', 'sheets'])
    expect(restBy(12 - 3, 2, nine)).toBe(startOfDay(nine) + 5 * day)
  })

  test('a person day puts that person’s loads ahead of fuller ones; urgent ones from anyone still go', () => {
    const rest = hamper.filter((entry) => !entry.urgent && entry.id !== 'dad-shirts')
    expect(spreadDay(rest, 2, nine, 'mom')).toEqual(['mom-darks', 'mom-lights'])
    expect(spreadDay(hamper, 3, nine, 'mom')).toEqual(['kid-sports', 'baby-mess', 'dad-shirts'])
  })
})

describe('Spread out', () => {
  test('an air-dry or stained piece needed the day after tomorrow counts a day early, a tumble piece does not', () => {
    const neededBy = nine + 2 * day
    const flag = { reasons: [], neededBy }
    expect(pieceNeededBy({ flag, care: { dryMethod: 'line_dry' } } as never)).toBe(neededBy - day)
    expect(pieceNeededBy({ flag: { ...flag, reasons: ['food'] }, care: { dryMethod: 'tumble_dry' } } as never)).toBe(neededBy - day)
    expect(pieceNeededBy({ flag, care: { dryMethod: 'tumble_dry' } } as never)).toBe(neededBy)
    expect(pieceNeededBy({ flag: null, care: null } as never)).toBeNull()
    const candidates: DayCandidate[] = [
      { id: 'full', urgent: false, neededBy: null, wearerIds: [], fullness: 1 },
      { id: 'hang-soon', urgent: false, neededBy: neededBy - day, wearerIds: [], fullness: 0.2 },
    ]
    expect(spreadDay(candidates, 1, nine)).toEqual(['hang-soon'])
  })

  test('a second load that would end after the day limit is not planned', () => {
    const late = nine + 10 * hour
    const two = hamper.filter((entry) => entry.id === 'towels' || entry.id === 'sheets')
    const fit = fitDay(two, late, todayAt('21:00', late)!, 1, options)
    expect(fit.timed && fit.today).toEqual(['towels'])
    expect(fit.timed && fit.roll).toEqual(['sheets'])
  })

  test('urgent loads that do not fit go first the next day', () => {
    const fit = fitDay(hamper, nine + 11 * hour, todayAt('21:00', nine)!, 0, options)
    expect(fit.timed && fit.hangNow).toEqual(['kid-sports', 'baby-mess'])
    expect(fit.timed && fit.today).toEqual([])
    expect(orderLoads(hamper.filter((entry) => fit.timed && [...fit.roll, ...fit.hangNow].includes(entry.id))).slice(0, 2)).toEqual(['kid-sports', 'baby-mess'])
  })
})

describe('2 small loads could go together', () => {
  const base = (id: string, extra: Partial<TogetherLoad> = {}): TogetherLoad => ({ id, textileIds: [`${id}-1`], machineId: 'washer', cycle: 'normal', temperatureC: 40, bulkUnits: 4, capacityUnits: 10,
    drying: { dryerId: 'dryer', heat: 'high', bulkUnits: 4, capacityUnits: 10 }, ...extra })
  const soil = { code: 'preference_applied' as const, details: { cause: 'soil_separation' }, loadId: 'b' }
  const none = () => false

  test('only for a load split by soil or heavy and light that fits one wash and one dryer run', () => {
    expect(couldGoTogether([base('a'), base('b')], [soil], none)).toEqual(['a', 'b'])
    expect(couldGoTogether([base('a'), base('b')], [{ ...soil, details: { cause: 'heavy_light_mixing_avoidance' } }], none)).toEqual(['a', 'b'])
    expect(couldGoTogether([base('a'), base('b')], [], none)).toBeNull()
  })

  test('never across care, dye, capacity, stained or placed pieces', () => {
    expect(couldGoTogether([base('a'), base('b')], [soil, { code: 'care_compatibility', details: { cause: 'cycle_separation' }, loadId: 'b' }], none)).toBeNull()
    expect(couldGoTogether([base('a'), base('b')], [soil, { code: 'dye_first_wash_risk', details: { cause: 'color_separation' }, loadId: 'b' }], none)).toBeNull()
    expect(couldGoTogether([base('a'), base('b')], [{ ...soil, details: { cause: 'baby_separation' } }], none)).toBeNull()
    expect(couldGoTogether([base('a', { bulkUnits: 7 }), base('b')], [soil], none)).toBeNull()
    expect(couldGoTogether([base('a', { drying: { dryerId: 'dryer', heat: 'high', bulkUnits: 7, capacityUnits: 10 } }), base('b')], [soil], none)).toBeNull()
    expect(couldGoTogether([base('a', { drying: { dryerId: 'dryer', heat: 'high', bulkUnits: 1, capacityUnits: null } }), base('b', { drying: { dryerId: 'dryer', heat: 'high', bulkUnits: 1, capacityUnits: null } })], [soil], none)).toBeNull()
    expect(couldGoTogether([base('a', { cycle: 'delicate' }), base('b')], [soil], none)).toBeNull()
    expect(couldGoTogether([base('a'), base('b')], [soil], (id) => id === 'a-1')).toBeNull()
  })

  test('never with a darks partner, a partner split for care or dye, or two dryer heats', () => {
    // b was started by a light piece kept from heavy pieces; a holds darks on the same washer and program.
    const colours = new Map([['a-1', { colorGroup: 'dark' }], ['b-1', { colorGroup: 'white' }], ['c-1', { colorGroup: 'white' }]])
    const clash = (one: string, other: string) => coloursClash(colours.get(one)!, colours.get(other)!)
    const heavy = { ...soil, details: { cause: 'heavy_light_mixing_avoidance' } }
    expect(couldGoTogether([base('a'), base('b')], [heavy], none, clash)).toBeNull()
    expect(couldGoTogether([base('a'), base('c'), base('b')], [heavy], none, clash)).toEqual(['c', 'b'])
    expect(couldGoTogether([base('a'), base('b')], [soil, { code: 'dye_first_wash_risk', details: { cause: 'color_separation' }, loadId: 'a' }], none)).toBeNull()
    expect(couldGoTogether([base('a'), base('b')], [soil, { code: 'care_compatibility', details: { cause: 'cycle_separation' }, loadId: 'a' }], none)).toBeNull()
    expect(couldGoTogether([base('a', { drying: { dryerId: 'dryer', heat: 'low', bulkUnits: 4, capacityUnits: 10 } }), base('b')], [soil], none)).toBeNull()
  })

  test('colours that clash: light with dark, and running dye with another colour', () => {
    expect(coloursClash({ colorGroup: 'white' }, { colorGroup: 'black' })).toBe(true)
    expect(coloursClash({ colorGroup: 'medium' }, { colorGroup: 'white' })).toBe(false)
    expect(coloursClash({ colorGroup: 'medium', dyeRun: 'bleeds' }, { colorGroup: 'medium' })).toBe(true)
    expect(coloursClash({ colorGroup: 'dark', dyeRun: 'new' }, { colorGroup: 'dark' })).toBe(false)
    expect(coloursClash({ colorGroup: 'dark', dyeRun: 'new' }, { colorGroup: 'medium' })).toBe(true)
  })

  test('together pins put the joined load’s pieces in the kept one and freeze the rest', () => {
    const loads = [{ id: 'a', textileIds: ['a1'] }, { id: 'c', textileIds: ['c1'] }, { id: 'b', textileIds: ['b1', 'b2'] }]
    expect(togetherPins(loads, 'a', 'b')).toEqual([{ textileId: 'a1', group: 1 }, { textileId: 'c1', group: 2 }, { textileId: 'b1', group: 1 }, { textileId: 'b2', group: 1 }])
  })
})

describe('dayLists', () => {
  test('a load is rolled to tomorrow or washed now and hung, never both', () => {
    // The live refit says Whites no longer fits today, though the pick had it hang: it rolls.
    expect(dayLists({ rolled: ['Darks'], hangNow: ['Whites', 'Towels'] }, ['Whites'])).toEqual({ rolled: ['Whites', 'Darks'], hangNow: ['Towels'] })
    // A stored pick that already names a load in two lists keeps it in one.
    expect(dayLists({ rolled: ['Whites'], hangNow: ['Whites', 'Darks'] })).toEqual({ rolled: ['Whites'], hangNow: ['Darks'] })
  })
})

describe('the rest of a picked day follows the machines, not the pick', () => {
  const two = (washMinutes: number | null = 50): FitLoad[] => ['first', 'second'].map((id) => ({ id, urgent: false, dryerRuns: 1, washMinutes, dryMinutes: 75, mayHang: false }))
  const until = nine + 4 * hour
  const planned = remainingDay(two(), nine, until, 1, options)!

  test('on time, the end stands and nothing rolls', () => {
    expect(planned.refit).toBeNull()
    expect(planned.end).toBe(planned.plan.end)
  })

  test('a first wash that starts late moves the end and rolls what no longer fits before Home until', () => {
    const late = remainingDay(two(), nine, until, 1, { ...options, washerFreeAt: nine + 90 * 60_000 })!
    expect(late.end).toBeGreaterThan(planned.end)
    expect(late.refit?.today).toEqual(['first'])
    expect(late.refit?.roll).toEqual(['second'])
  })

  test('an extended dryer does the same, and a dryer still busy past the end counts as the end', () => {
    const extended = remainingDay(two(), nine, until, 1, { ...options, dryerFreeAt: nine + 90 * 60_000 })!
    expect(extended.end).toBeGreaterThan(planned.end)
    expect(extended.refit?.roll).toEqual(['second'])
    const air = remainingDay([{ id: 'air', urgent: false, dryerRuns: 0, washMinutes: 30, dryMinutes: null, mayHang: false }], nine, until, 1, { ...options, dryerFreeAt: nine + 5 * hour })!
    expect(air.end).toBe(nine + 5 * hour)
  })

  test('without a load\'s minutes there is no clock', () => {
    expect(remainingDay(two(null), nine, until, 1, options)).toBeNull()
    expect(remainingDay([], nine, until, 1, options)).toBeNull()
  })
})
