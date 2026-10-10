import assert from 'node:assert/strict'

import { fillsGap, fitDay, learnedWash, nextStart, orderLoads, planDay, sharedStarts, type DayLoad, type FitLoad } from './pass-order.ts'

const minute = 60_000
const at = (hour: number, min = 0) => Date.UTC(2026, 9, 6, hour, min)

// Order: urgent first, two-run tumble loads before one-run, air-dry last; no minutes needed.
assert.deepEqual(orderLoads([
  { id: 'hang', urgent: false, dryerRuns: 0 },
  { id: 'tees', urgent: false, dryerRuns: 1 },
  { id: 'towels', urgent: false, dryerRuns: 2 },
  { id: 'sweaty', urgent: true, dryerRuns: 1 },
  { id: 'jeans', urgent: false, dryerRuns: 1 },
]), ['sweaty', 'towels', 'tees', 'jeans', 'hang'])
assert.deepEqual(orderLoads([{ id: 'stain', urgent: true, dryerRuns: 0 }, { id: 'darks', urgent: false, dryerRuns: 1 }]), ['stain', 'darks'], 'an urgent air-dry stain load still goes first')

// nextStart joins the steps at or under the limit; otherwise the wash ends when the dryer does.
assert.deepEqual(nextStart(at(9, 55), at(11), 50, 30), { at: at(9, 55), wait: 15 })
assert.deepEqual(nextStart(at(9, 55), at(11), 50, 15), { at: at(9, 55), wait: 15 }, 'a wait exactly at the limit is joined')
const held = nextStart(at(9, 55), at(11), 50, 0)
assert.equal(held.at, at(10, 10))
assert.ok(held.at + 50 * minute >= at(11), 'a held-back wash never ends before the dryer')
assert.deepEqual(nextStart(at(9), null, 50, 30), { at: at(9), wait: 0 }, 'no dryer run: start now')
assert.deepEqual(nextStart(at(9), at(9, 30), 50, 0), { at: at(9), wait: 0 }, 'the dryer ends first: start now, no wait')

// Dryer overrun: the dryer runs 20 minutes past its estimate. The held-back wash waits at most the limit.
const overrun = nextStart(at(10), at(11, 30), 50, 30)
assert.equal(overrun.at, at(10, 40))
assert.ok(at(11, 50) - (overrun.at + 50 * minute) <= 30 * minute)
// Re-timed from what the dryer says at 10:30 ("40 min"): the start moves with it.
assert.equal(nextStart(at(10, 30), at(10, 30) + 40 * minute, 50, 0).at, at(10, 30), 'the dryer ends before the wash would: start now')
assert.equal(nextStart(at(10), at(10, 30) + 80 * minute, 50, 0).at, at(11), 'a longer typed time holds the start back further')
// Short wash: it ends 10 minutes early, so it waits 10 minutes, within the limit.
assert.ok(at(11, 30) - (overrun.at + 40 * minute) <= 30 * minute)

// Washer gap: only an air-dry load that fits, is hung on the held-back start's trip, and never with the rack full.
assert.equal(fillsGap(40, 30, 5, 30, false), true)
assert.equal(fillsGap(40, 30, 5, 0, false), false, 'it would wait past the limit')
assert.equal(fillsGap(30, 30, 5, 30, false), false, 'it does not fit with its hanging')
assert.equal(fillsGap(40, 30, 5, 30, true), false, 'never when the rack is full')
assert.equal(fillsGap(90, 30, 5, 30, false), false, 'a long gap would leave it wet past the limit')

// Worked example 5.4: catch-up day, top-loader home, start 9:00.
const fixture: DayLoad[] = [
  { id: 'delicates', urgent: false, dryerRuns: 0, washMinutes: 30, dryMinutes: 0 },
  { id: 'towels', urgent: false, dryerRuns: 1, washMinutes: 50, dryMinutes: 65 },
  { id: 'jeans', urgent: false, dryerRuns: 1, washMinutes: 50, dryMinutes: 65 },
  { id: 'sports', urgent: true, dryerRuns: 1, washMinutes: 50, dryMinutes: 65 },
  { id: 'darks', urgent: false, dryerRuns: 1, washMinutes: 50, dryMinutes: 65 },
  { id: 'lights', urgent: false, dryerRuns: 1, washMinutes: 50, dryMinutes: 65 },
]
const joined = planDay(fixture, at(9), { waitLimit: 30, move: 5, rackFull: false })
assert.deepEqual(joined.steps.map((step) => step.id), ['sports', 'towels', 'jeans', 'darks', 'lights', 'delicates'])
assert.equal(joined.end, at(15, 40))
assert.equal(joined.trips, 8)
assert.equal(joined.waited, 60)
assert.deepEqual(joined.steps.map((step) => step.wait), [0, 15, 15, 15, 15, 0])
assert.equal(joined.steps[1]!.washStart, at(9, 55))
assert.equal(joined.steps[1]!.dryStart, at(11, 5))

const heldBack = planDay(fixture, at(9), { waitLimit: 0, move: 5, rackFull: false })
assert.equal(heldBack.end, at(15, 40))
assert.equal(heldBack.trips, 12)
assert.equal(heldBack.waited, 0, 'no planned wait beyond the move')
assert.deepEqual(heldBack.steps.slice(1, 5).map((step) => step.washStart), [at(10, 10), at(11, 20), at(12, 30), at(13, 40)])

// Washing the delicates first ends later: order by plan alone costs time.
const delicatesFirst = planDay(fixture.map((load) => load.id === 'delicates' ? { ...load, urgent: true } : load), at(9), { waitLimit: 30, move: 5, rackFull: false })
assert.ok(delicatesFirst.end > joined.end)

// A gap the air-dry load fits is filled; the day saves a trip. With the rack full it is not.
const gapDay: DayLoad[] = [
  { id: 'a', urgent: false, dryerRuns: 1, washMinutes: 30, dryMinutes: 90 },
  { id: 'b', urgent: false, dryerRuns: 1, washMinutes: 30, dryMinutes: 90 },
  { id: 'hang', urgent: false, dryerRuns: 0, washMinutes: 30, dryMinutes: 0 },
]
const filled = planDay(gapDay, at(9), { waitLimit: 30, move: 5, rackFull: false })
const notFilled = planDay(gapDay, at(9), { waitLimit: 30, move: 5, rackFull: true })
assert.deepEqual(filled.steps.map((step) => step.id), ['a', 'hang', 'b'])
assert.deepEqual(notFilled.steps.map((step) => step.id), ['a', 'b', 'hang'])
assert.ok(filled.trips < notFilled.trips)
assert.ok(filled.steps.every((step) => step.wait <= 30))

console.log('pass order checks passed')

// Shared room (design 11): 3 free washers, 1 free dryer, 3 tumble loads and an air-dry load: one tumble load plus the air-dry one.
const room = [
  { id: 'sweaty', urgent: true, dryerRuns: 1 },
  { id: 'towels', urgent: false, dryerRuns: 2 },
  { id: 'tees', urgent: false, dryerRuns: 1 },
  { id: 'hang', urgent: false, dryerRuns: 0 },
]
assert.deepEqual(sharedStarts(room, 3, 1), ['sweaty', 'hang'])
assert.deepEqual(sharedStarts(room, 1, 3), ['sweaty'], 'never more washes than free washers')
assert.deepEqual(sharedStarts(room, 3, 3), ['sweaty', 'towels', 'tees'], 'in order while washers last')
assert.deepEqual(sharedStarts(room, 2, 0), ['hang'], 'no free dryer: only an air-dry load starts')
assert.deepEqual(sharedStarts([], 3, 3), [])

// fitDay (design 6.1): the 5.4 day with the long minutes, start 9:00.
const fitLoads: FitLoad[] = fixture.map((load) => ({ ...load, mayHang: true }))
const day = { waitLimit: 30, move: 5 }
const lastEnds = (fit: ReturnType<typeof fitDay>, until: number) => {
  assert.ok(fit.timed)
  const kept = fit.today.map((id) => { const load = fixture.find((entry) => entry.id === id)!; return fit.hang.includes(id) ? { ...load, dryerRuns: 0, dryMinutes: 0 } : load })
  assert.ok(planDay(kept, at(9), { ...day, rackFull: true }).end + 5 * minute <= until, 'the last run ends before Home until, plus the move')
}
const allFit = fitDay(fitLoads, at(9), at(21), 1, day)
assert.ok(allFit.timed)
assert.deepEqual(allFit.today, ['sports', 'towels', 'jeans', 'darks', 'lights', 'delicates'])
assert.equal(allFit.end, at(15, 40))
assert.deepEqual([allFit.hang, allFit.roll, allFit.hangNow], [[], [], []])
// Home until 3 pm: the lights' dryer run would end about 3:40, so they wash now and hang; the rack is then full, so the delicates roll.
const early = fitDay(fitLoads, at(9), at(15), 1, day)
assert.ok(early.timed)
assert.deepEqual(early.hang, ['lights'])
assert.deepEqual(early.roll, ['delicates'])
lastEnds(early, at(15))
assert.ok(early.end <= at(14, 55))
// A rack for two takes the delicates too.
const twoRacks = fitDay(fitLoads, at(9), at(15), 2, day)
assert.ok(twoRacks.timed)
assert.deepEqual(twoRacks.roll, [])
lastEnds(twoRacks, at(15))
// No rack room, or lights that may not hang: they roll to tomorrow.
const noRack = fitDay(fitLoads, at(9), at(15), 0, day)
assert.ok(noRack.timed)
assert.deepEqual(noRack.roll, ['lights', 'delicates'])
const noHang = fitDay(fitLoads.map((load) => load.id === 'lights' ? { ...load, mayHang: false } : load), at(9), at(15), 1, day)
assert.ok(noHang.timed)
assert.deepEqual(noHang.roll, ['lights'])
assert.deepEqual(noHang.today.at(-1), 'delicates', 'the air-dry load still fits after the dryer loads')
lastEnds(noHang, at(15))
// Low priority goes first: Home until 1 pm keeps the urgent load and rolls the later ones.
const midday = fitDay(fitLoads.map((load) => ({ ...load, mayHang: false })), at(9), at(13), 1, day)
assert.ok(midday.timed)
assert.deepEqual(midday.today, ['sports', 'towels', 'delicates'])
assert.deepEqual(midday.roll, ['jeans', 'darks', 'lights'])
lastEnds(midday, at(13))
// Urgent loads that do not fit never roll silently: "Hang them to dry now; wash first tomorrow".
const late = fitDay(fitLoads.map((load) => ({ ...load, mayHang: false })), at(9), at(10), 1, day)
assert.ok(late.timed)
assert.deepEqual(late.hangNow, ['sports'])
assert.deepEqual(late.today, ['delicates'], 'a short air-dry wash still fits')
assert.equal(orderLoads(fitLoads.filter((load) => [...late.hangNow, ...late.roll].includes(load.id)))[0], 'sports', 'it goes first the next day')
// If its wash fits but not its dryer run, "wash now, hang to dry" comes first.
const washHang = fitDay(fitLoads, at(9), at(10), 1, day)
assert.ok(washHang.timed)
assert.deepEqual([washHang.today, washHang.hang, washHang.hangNow], [['sports'], ['sports'], []])
// Without minutes: the load count only, no fit.
assert.deepEqual(fitDay([...fitLoads, { id: 'new', urgent: false, dryerRuns: 1, washMinutes: 50, dryMinutes: null, mayHang: true }], at(9), at(21), 1, day), { timed: false, count: 7 })
assert.deepEqual(fitDay([{ id: 'w', urgent: false, dryerRuns: 0, washMinutes: null, dryMinutes: null, mayHang: true }], at(9), at(21), 1, day), { timed: false, count: 1 })
// A dryer already busy until 10:30 pushes the day back.
assert.equal(planDay(fixture.filter((load) => load.id === 'towels'), at(9), { ...day, rackFull: true, dryerFreeAt: at(11) }).end, at(12, 10), 'the towels wait for the busy dryer')
// A load still in the washer holds the next wash back: the day is fitted from the machines as they are now.
const lastLoad = fixture.filter((load) => load.id === 'towels')
assert.equal(planDay(lastLoad, at(9), { ...day, rackFull: true }).steps[0]!.washStart, at(9), 'a free washer starts now')
assert.equal(planDay(lastLoad, at(9), { ...day, rackFull: true, washerFreeAt: at(9, 40) }).steps[0]!.washStart, at(9, 40), 'a wash running until 9:40 delays the next')
assert.equal(planDay(lastLoad, at(9), { ...day, rackFull: true, washerFreeAt: at(8) }).steps[0]!.washStart, at(9), 'a washer free in the past is free now')
const busyWasher = fitDay(fitLoads, at(9), at(13), 1, { ...day, washerFreeAt: at(10, 30) })
assert.ok(busyWasher.timed && midday.timed)
assert.ok(busyWasher.today.length < midday.today.length, 'a late first wash rolls a load that no longer fits before Home until')
lastEnds(busyWasher, at(13))

// Wash learning (design 10): the median of every tap, each capped at the program time plus 15.
assert.equal(learnedWash([47, 47], 47), null, 'not before 3 washes')
assert.deepEqual(learnedWash([40, 47, 55], 47), { minutes: 47, count: 3 })
assert.equal(learnedWash([40, 40, 47], 47)!.minutes, 40, 'early taps move it down')
assert.equal(learnedWash([47, 60, 60], 47)!.minutes, 60, 'late taps move it up')
assert.equal(learnedWash([47, 47, 180], 47)!.minutes, 47, 'one forgotten load does not drag it')
assert.equal(learnedWash([45, 47, 50, 300], 47)!.minutes, 49, 'the forgotten load counts only as program plus 15')
assert.equal(learnedWash([30, 35, 400], null)!.minutes, 35, 'no program time: no cap, still the median')
console.log('fit and learning checks passed')
