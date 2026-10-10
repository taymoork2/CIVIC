import { expect, test } from 'vitest'

import { aboutTime, dryingFacts, earlyChecks, homeDryer, hubBlockView, hubRows, hubState, machineOccupancy, nextLoad, phoneTimer, rackFull, rackRoom, runningRowLine, washTime, dryTime, satWetLong, urgentFlag, type DaySession, type DayPlan, type HubInputs } from '@/home/hub-state'
import { homeDockStep } from '@/home/home-dock'
import { homeHeroView } from '@/home/home-hero'
import { clockTime } from '@/kit/ui'

const minute = 60_000
const now = new Date(2026, 8, 27, 15).getTime()

const session = (overrides: Partial<DaySession> = {}): DaySession => ({
  sessionId: 's1',
  status: 'running',
  machineName: 'Washer 2',
  dryerName: null,
  machineStartedAt: now - 10 * minute,
  washFinishAt: now + 24 * minute,
  washFinishedAt: null,
  dryerStartedAt: null,
  dryMinutes: null,
  hasDrying: true,
  dryerStepRecorded: false,
  dryerUnloaded: false,
  ...overrides,
})

const inputs = (overrides: Partial<HubInputs> = {}): HubInputs => ({
  hamper: { count: 0, loads: null },
  plan: null,
  sessions: [],
  hanging: { count: 0, sessionIds: [] },
  ...overrides,
})

test('Home, the dock and the laundry action agree when the selected day has no time left', () => {
  const plan: DayPlan = { planId: 'day-end', loads: [{ loadId: 'late', sessionId: null, startable: true, textileIds: ['tee'], washMinutes: 30, dryer: { minutes: 40, tumbleCount: 1, fit: 'one_run' } }] }
  const dayUntil = now + 5 * minute
  const state = hubState(inputs({ plan, drying: homeDrying(), dayUntil }), now)
  expect(state).toMatchObject({ kind: 'pass', ready: false, dayDeferred: true })
  expect(state).not.toHaveProperty('step')
  expect(hubBlockView(state).button).not.toMatch(/start/i)
  expect(homeDockStep(state)?.button).not.toMatch(/start/i)
  expect(homeHeroView(state, { garmentGroups: 1, pieces: 1, only: null }, now).title).toContain('tomorrow')
  expect(hubState(inputs({ plan, drying: { ...homeDrying(), homeDryerId: null }, dayUntil }), now)).toMatchObject({ kind: 'pass', ready: true })
  expect(hubState(inputs({ plan: { ...plan, loads: [{ ...plan.loads[0]!, washMinutes: null }] }, drying: homeDrying(), dayUntil }), now)).toMatchObject({ kind: 'pass', ready: true })
})

test('a shared room\'s "pool" grouping word never reaches the band or dock', () => {
  const state = hubState(inputs({ sessions: [session({ machineName: 'Speed Queen front-loader pool' })] }), now)
  expect(state.kind).toBe('running')
  if (state.kind !== 'running') return
  expect(state.rows[0]!.machine).toBe('Speed Queen front-loader')
})

test('nothing anywhere is the empty hub, and the dock stays away', () => {
  const state = hubState(inputs(), now)
  expect(state).toEqual({ kind: 'empty' })
  expect(hubBlockView(state)).toMatchObject({ title: 'Add what needs washing', button: 'Add dirty clothes', target: { to: 'add' } })
})

test('the hamper says how much and about how many washes, never guessing the count', () => {
  expect(hubBlockView(hubState(inputs({ hamper: { count: 38, loads: 4 } }), now))).toMatchObject({ title: '38 laundry items · about 4 washes', button: 'Plan laundry', target: { to: 'make_loads' } })
  expect(hubBlockView(hubState(inputs({ hamper: { count: 1, loads: null } }), now)).title).toBe('1 laundry item')
})

test('an open plan comes back as its first unstarted load, ahead of the hamper', () => {
  const plan = { planId: 'p1', loads: [{ sessionId: 'done', startable: false }, { sessionId: null, startable: true }, { sessionId: null, startable: true }] }
  expect(nextLoad(plan)).toEqual({ planId: 'p1', number: 2, count: 3, ready: true, dryerRuns: 0, timed: false, spent: false })
  const state = hubState(inputs({ plan, hamper: { count: 12, loads: 2 } }), now)
  expect(hubBlockView(state)).toMatchObject({ title: 'Load 2 of 3 is ready', button: 'Start', target: { to: 'plan', planId: 'p1' } })
  // A load that is not startable yet says so rather than offering Start.
  const waiting = hubState(inputs({ plan: { planId: 'p1', loads: [{ sessionId: null, startable: false }] } }), now)
  expect(hubBlockView(waiting)).toMatchObject({ title: 'Load 1 of 1 is waiting', button: 'Carry on' })
  // Every load started: the plan is done with.
  expect(nextLoad({ planId: 'p1', loads: [{ sessionId: 's1', startable: false }] })).toBeNull()
})

test('the next-load dose retains the native below-line instruction', () => {
  const load = { sessionId: null, startable: true, treatments: [{ supplyName: 'Tide', dose: { amount: 1, unit: 'cap', mark: 'Bar 2', target: 'below' as const } }] }
  expect(nextLoad({ planId: 'native', loads: [load] })?.dose).toBe('Tide · Fill cap below Bar 2')
})

test('the next-load dose retains a partial fill instead of naming a full mark', () => {
  const load = { sessionId: null, startable: true, treatments: [{ supplyName: 'Tide', dose: { amount: 2, unit: 'cap', mark: 'Bar 1', fractionOfMark: 0.8 } }] }
  expect(nextLoad({ planId: 'partial', loads: [load] })?.dose).toBe('Tide · Fill the cap to 4/5 of bar 1, twice')
  expect(nextLoad({ planId: 'partial', loads: [{ ...load, startable: false }] })?.dose).toBeUndefined()
})

test('running loads list soonest first, the unknown time last, and the next load of the plan rides along', () => {
  const plan = { planId: 'p1', loads: [{ sessionId: 's1', startable: false }, { sessionId: null, startable: true }] }
  const sessions = [
    session({ sessionId: 'late', machineName: 'Washer 1', washFinishAt: now + 40 * minute }),
    session({ sessionId: 'unknown', machineName: 'Washer 3', washFinishAt: null }),
    session({ sessionId: 'soon', machineName: 'Washer 2', washFinishAt: now + 5 * minute }),
    session({ sessionId: 'old', status: 'completed' }),
  ]
  const state = hubState(inputs({ sessions, plan, hamper: { count: 5, loads: 1 } }), now)
  expect(state.kind).toBe('running')
  if (state.kind !== 'running') return
  expect(state.rows.map((row) => row.sessionId)).toEqual(['soon', 'late', 'unknown'])
  expect(state.next).toEqual({ planId: 'p1', number: 2, count: 2, ready: true, dryerRuns: 0, timed: false, spent: true })
  expect(hubBlockView(state)).toMatchObject({ title: '3 loads running', button: 'See the steps', target: { to: 'session', sessionId: 'soon' } })
})

test('a load in the dryer is named by the dryer and its dry time', () => {
  const state = hubState(inputs({ sessions: [session({ dryerName: 'Dryer 1', dryerStartedAt: now - 5 * minute, dryMinutes: 45, washFinishedAt: now - 6 * minute })] }), now)
  expect(state).toMatchObject({ kind: 'running', rows: [{ machine: 'Dryer 1', stage: 'drying', doneAt: now + 40 * minute }] })
  expect(hubBlockView(state).title).toBe('Dryer 1 · Drying')
})

test('dryer timer expiry asks for a check throughout Home without asserting physical dryness', () => {
  const state = hubState(inputs({ sessions: [session({ dryerName: 'Dryer 1', dryerStartedAt: now - 45 * minute, dryMinutes: 45, washFinishedAt: now - 46 * minute })] }), now)
  expect(state.kind).toBe('finished')
  expect(hubBlockView(state)).toMatchObject({ title: 'Dryer 1 · Check dryness', reason: 'Check whether the pieces are dry.', button: 'Check dryness', target: { to: 'session', sessionId: 's1' } })
  expect(JSON.stringify(state)).not.toContain('"status":"completed"')
})

test('a finished wash comes first and says where the clothes go next', () => {
  const sessions = [session({ sessionId: 'running' }), session({ sessionId: 'washed', machineName: 'Washer 4', washFinishAt: now - minute })]
  const state = hubState(inputs({ sessions }), now)
  expect(state).toMatchObject({ kind: 'finished', row: { sessionId: 'washed' }, toDryer: true, rows: [{ sessionId: 'running' }] })
  expect(hubBlockView(state)).toMatchObject({ title: 'Washer 4 is done · move them to a dryer', button: 'Next step', target: { to: 'session', sessionId: 'washed' } })
  // No dryer here: take them out to hang.
  const hang = hubState(inputs({ sessions: [session({ hasDrying: false, washFinishedAt: now - minute })] }), now)
  expect(hubBlockView(hang).title).toBe('Washer 2 is done · take them out')
})

test('laundry items hanging to dry ask All dry once nothing else needs doing', () => {
  const state = hubState(inputs({ hanging: { count: 7, sessionIds: ['s9'] } }), now)
  expect(hubBlockView(state)).toMatchObject({ title: '7 laundry items drying · All dry?', button: 'All dry', target: { to: 'all_dry', sessionIds: ['s9'] } })
  // The hamper is the bigger job.
  expect(hubState(inputs({ hanging: { count: 7, sessionIds: ['s9'] }, hamper: { count: 2, loads: 1 } }), now).kind).toBe('hamper')
})

test('every running load says when it is done and the phone timer to set, never a guessed time', () => {
  const doneAt = now + 34 * minute
  expect(runningRowLine({ sessionId: 's1', machine: 'Washer 2', stage: 'washing', doneAt }, now)).toEqual({ what: 'Washer 2 · Washing', when: `done at ${clockTime(doneAt)}`, timer: 'Set a phone timer: 34 min' })
  expect(runningRowLine({ sessionId: 's1', machine: 'Washer 2', stage: 'washing', doneAt: null }, now)).toEqual({ what: 'Washer 2 · Washing', when: null, timer: null })
  expect(phoneTimer(now + 30_001, now)).toBe('Set a phone timer: 1 min')
  expect(phoneTimer(now + 75 * minute, now)).toBe('Set a phone timer: 1 h 15 min')
  expect(phoneTimer(now, now)).toBeNull()
})

// ---- Wash done, dryer busy (dryer-sharing design, section 7) ------------------------------

const homeDrying = (overrides: Partial<NonNullable<HubInputs['drying']>> = {}): NonNullable<HubInputs['drying']> => ({ runs: [], wet: { count: 0, tumble: 0, since: null }, homeDryerId: 'd1', ...overrides })
const dryerRun = (minutesAgo: number, minutes: number | null, extra: Partial<NonNullable<HubInputs['drying']>['runs'][number]> = {}) => ({ runId: 'r1', kind: 'dryer' as const, dryerId: 'd1', dryerName: 'Dryer 1', method: 'tumble', startedAt: now - minutesAgo * minute, minutes, ...extra })
const washed = session({ sessionId: 'w2', machineName: 'Washer 1', washFinishAt: now - 2 * minute })
const twoLoads = { planId: 'p1', loads: [{ sessionId: 'w1', startable: false }, { sessionId: 'w2', startable: false }, { sessionId: null, startable: true }] }

test('a wash done while the home dryer runs a drying-queue load says the dryer is busy, never "move them to a dryer"', () => {
  const state = hubState(inputs({ sessions: [washed], plan: twoLoads, drying: homeDrying({ runs: [dryerRun(20, 60)] }) }), now)
  expect(state).toMatchObject({ kind: 'finished', toDryer: true, wait: { dryer: { kind: 'busy', name: 'Dryer 1', until: now + 40 * minute, runId: 'r1' }, rackFull: false, smell: false, next: 3 } })
  const until = clockTime(aboutTime(now + 40 * minute))
  expect(hubBlockView(state)).toMatchObject({ title: `Dryer busy until about ${until}`, reason: 'Hang them, or wait for the dryer. Start load 3 after this one is in the dryer.', button: 'Hang or wait', target: { to: 'session', sessionId: 'w2' } })
  expect(JSON.stringify(hubBlockView(state))).not.toContain('move them to a dryer')
})

test('a load in the home dryer from its own wash steps also makes the dryer busy', () => {
  const drying = session({ sessionId: 'w1', dryerName: 'Dryer 1', dryerStartedAt: now - 5 * minute, dryMinutes: 45, washFinishedAt: now - 6 * minute })
  const state = hubState(inputs({ sessions: [drying, washed], drying: homeDrying() }), now)
  expect(state).toMatchObject({ kind: 'finished', row: { sessionId: 'w2' }, wait: { dryer: { kind: 'busy', until: now + 40 * minute, target: { to: 'session', sessionId: 'w1' } } } })
})

test('a done dryer and a done wash: take the dryer load out first, then move the wash in', () => {
  const state = hubState(inputs({ sessions: [washed], drying: homeDrying({ runs: [dryerRun(70, 60)] }) }), now)
  expect(hubBlockView(state)).toMatchObject({ title: 'Take out Dryer 1 first', reason: 'Then move the washed load in.', button: 'Check dryness', target: { to: 'drying' } })
  // In the dryer through its own wash steps: the dryer load's page.
  const inSession = session({ sessionId: 'w1', dryerName: 'Dryer 1', dryerStartedAt: now - 50 * minute, dryMinutes: 45, washFinishedAt: now - 51 * minute })
  expect(hubBlockView(hubState(inputs({ sessions: [inSession, washed], drying: homeDrying() }), now))).toMatchObject({ title: 'Take out Dryer 1 first', target: { to: 'session', sessionId: 'w1' } })
})

test('a busy dryer with no known time asks whether it is free', () => {
  const unknown = session({ sessionId: 'w1', dryerName: 'Dryer 1', dryerStartedAt: now - 5 * minute, dryMinutes: null, washFinishedAt: now - 6 * minute })
  expect(hubBlockView(hubState(inputs({ sessions: [unknown, washed], drying: homeDrying() }), now)).title).toBe('Is the dryer free?')
})

test('a full rack takes "Hang them" away; a free dryer says move it now', () => {
  const full = homeDrying({ runs: [dryerRun(20, 60), { runId: 'air', kind: 'air', dryerId: null, dryerName: null, method: 'rack_line', startedAt: now - 30 * minute, minutes: null }] })
  expect(rackFull(full)).toBe(true)
  expect(hubBlockView(hubState(inputs({ sessions: [washed], drying: full }), now)).reason).toBe('Rack full · wait for the dryer.')
  expect(hubState(inputs({ sessions: [washed], drying: homeDrying() }), now)).toMatchObject({ kind: 'finished', wait: { dryer: { kind: 'free' } } })
  expect(hubBlockView(hubState(inputs({ sessions: [washed], drying: homeDrying() }), now)).title).toBe('Washer 1 is done · move them to a dryer')
})

test('dryer times are rounded to 5 minutes and say "about"', () => {
  expect(aboutTime(now + 42 * minute)).toBe(now + 40 * minute)
  expect(aboutTime(now + 43 * minute)).toBe(now + 45 * minute)
  const state = hubState(inputs({ sessions: [washed], drying: homeDrying({ runs: [dryerRun(20, 63)] }) }), now)
  expect(hubBlockView(state).title).toBe(`Dryer busy until about ${clockTime(now + 45 * minute)}`)
})

test('the smell check comes after about six hours wet, or once the load sat overnight, and not before', () => {
  expect(satWetLong(now - 5 * 60 * minute, now)).toBe(false)
  expect(satWetLong(now - 6 * 60 * minute, now)).toBe(true)
  const lateNight = new Date(2026, 8, 26, 23, 30).getTime()
  expect(satWetLong(lateNight, new Date(2026, 8, 27, 7, 0).getTime())).toBe(true)
  expect(satWetLong(null, now)).toBe(false)
  const old = session({ sessionId: 'w2', machineName: 'Washer 1', washFinishAt: now - 7 * 60 * minute })
  expect(hubBlockView(hubState(inputs({ sessions: [old], drying: homeDrying({ runs: [dryerRun(20, 60)] }) }), now)).reason).toBe('It sat wet a long time. Smell it; rewash if it smells musty.')
})

test('washed pieces in the drying queue stay on the hub: busy at home holds the next wash; a shared room keeps it and never calls a dryer free', () => {
  const plan = { planId: 'p1', loads: [{ sessionId: 'w1', startable: false }, { sessionId: null, startable: true }] }
  const home = hubState(inputs({ plan, drying: homeDrying({ runs: [dryerRun(20, 60)], wet: { count: 4, tumble: 4, since: now - 3 * minute } }) }), now)
  expect(home).toMatchObject({ kind: 'wet', count: 4, wait: { dryer: { kind: 'busy' }, next: 2 } })
  expect(hubBlockView(home)).toMatchObject({ title: `Dryer busy until about ${clockTime(aboutTime(now + 40 * minute))}`, button: 'Hang or wait', target: { to: 'drying' } })
  const shared = hubState(inputs({ plan, drying: { runs: [dryerRun(20, 60, { dryerName: 'Dryer 7', dryerId: 'd7' })], wet: { count: 4, tumble: 4, since: now - 3 * minute }, homeDryerId: null } }), now)
  expect(shared).toMatchObject({ kind: 'wet', wait: { dryer: null }, next: { number: 2 } })
  expect(hubBlockView(shared)).toMatchObject({ title: '4 washed pieces waiting to dry', reason: 'Load them into a dryer, or hang them.', button: 'Dry them', target: { to: 'drying' } })
  expect(JSON.stringify(hubBlockView(shared))).not.toMatch(/free|available/i)
})

test('a due mid-run check is the next step, naming the pieces; before it is due, or once missed, it is not', () => {
  const run = (at: number, missed = false) => dryerRun(25, 50, { runId: 'run7', dryerName: 'Dryer 7', dryerId: 'd7', check: { at, missed, names: 'Blue tee, Gray polo' } })
  const shared = (runs: ReturnType<typeof run>[]) => hubState(inputs({ drying: { runs, wet: { count: 0, tumble: 0, since: null }, homeDryerId: null } }), now)
  const due = shared([run(now - minute)])
  expect(due).toMatchObject({ kind: 'dryer_check', runId: 'run7', name: 'Dryer 7', early: 'Blue tee, Gray polo' })
  // "Take them out" opens that run's check, not the drying plan.
  expect(hubBlockView(due)).toMatchObject({ title: 'Take out the Blue tee, Gray polo now', reason: 'Dryer 7 keeps going for the rest.', button: 'Take them out', target: { to: 'drying', run: 'run7' } })
  expect(homeHeroView(due, { garmentGroups: 1 } as never, now)).toMatchObject({ title: 'Take out the Blue tee, Gray polo now', mark: { text: 'Check now' }, primary: { target: { to: 'drying', run: 'run7' } } })
  expect(shared([run(now + 5 * minute)]).kind, 'not due yet').toBe('empty')
  expect(shared([run(now - minute, true)]).kind, 'missed').toBe('empty')
  // dryingFacts names the pieces from the queue.
  const facts = dryingFacts({ runs: [{ runId: 'r1', kind: 'dryer', dryerId: 'd7', dryerName: 'Dryer 7', method: 'tumble', startedAt: now, minutes: 50, check: { at: now, missed: false, pieceIds: ['a', 'b', 'c'] } }],
    pieces: [{ pieceId: 'a', name: 'Blue tee', status: 'drying', queuedAt: now }, { pieceId: 'b', name: 'Blue tee', status: 'drying', queuedAt: now }, { pieceId: 'c', name: 'Gray polo', status: 'drying', queuedAt: now }], homeDryerId: null })
  expect(facts.runs[0]!.check).toEqual({ at: now, missed: false, names: 'Blue tee, Gray polo' })
})

test('a running dryer\'s early check is listed from the moment it starts, until it is done or missed, soonest first', () => {
  const run = (id: string, at: number, extra = {}) => dryerRun(5, 50, { runId: id, dryerName: `Dryer ${id}`, dryerId: id, check: { at, missed: false, names: 'Blue tee' }, ...extra })
  const facts = dryingFacts({ runs: [], pieces: [], homeDryerId: null })
  expect(earlyChecks(undefined)).toEqual([])
  expect(earlyChecks({ ...facts, runs: [run('b', now + 20 * minute), run('a', now + 10 * minute), run('m', now + 5 * minute, { check: { at: now, missed: true, names: 'Blue tee' } }), dryerRun(5, 50, { runId: 'n' })] }))
    .toEqual([{ runId: 'a', dryer: 'Dryer a', names: 'Blue tee', at: now + 10 * minute, startedAt: now - 5 * minute }, { runId: 'b', dryer: 'Dryer b', names: 'Blue tee', at: now + 20 * minute, startedAt: now - 5 * minute }])
})

test('a drying-queue dryer whose time is up asks for a dryness check, in a shared room too', () => {
  const state = hubState(inputs({ drying: { runs: [dryerRun(70, 64, { dryerName: 'Dryer 7', dryerId: 'd7' })], wet: { count: 0, tumble: 0, since: null }, homeDryerId: null } }), now)
  expect(state).toMatchObject({ kind: 'dryer_check', runId: 'r1', name: 'Dryer 7', doneAt: now - 6 * minute })
  expect(hubBlockView(state)).toMatchObject({ title: 'Dryer 7 · Check dryness', button: 'Check dryness', target: { to: 'drying', run: 'r1' } })
  // Still running: no step of its own.
  expect(hubState(inputs({ drying: { runs: [dryerRun(10, 64, { dryerName: 'Dryer 7', dryerId: 'd7' })], wet: { count: 0, tumble: 0, since: null }, homeDryerId: null } }), now).kind).toBe('empty')
})

// ---- Order and hold-back (dryer-sharing design, sections 5 and 9.1) -----------------------

const tumble = (minutes: number | null = 65) => ({ minutes, tumbleCount: 4, fit: 'fits' })

test('the next load is picked in wash order and numbered in it: urgent first, air-dry last, loads under way before the rest', () => {
  const plan: DayPlan = { planId: 'p1', loads: [
    { loadId: 'hang', sessionId: null, startable: true, textileIds: ['silk'], dryer: null },
    { loadId: 'jeans', sessionId: null, startable: true, textileIds: ['jeans'], dryer: tumble() },
    { loadId: 'kit', sessionId: null, startable: true, textileIds: ['kit'], dryer: tumble() },
  ] }
  expect(nextLoad(plan)).toMatchObject({ number: 1, loadId: 'jeans' })
  const urgent = nextLoad(plan, undefined, new Set(['kit']))
  expect(urgent).toMatchObject({ number: 1, loadId: 'kit' })
  expect(urgent?.loads?.map((load) => load.loadId)).toEqual(['kit', 'jeans', 'hang'])
  expect(urgent?.loads?.map((load) => load.number)).toEqual([1, 2, 3])
  // The air-dry load started first anyway: it keeps number 1, and the hub never offers load 3 while load 2 waits.
  const started = nextLoad({ planId: 'p1', loads: plan.loads.map((load) => load.loadId === 'hang' ? { ...load, sessionId: 's1', startable: false } : load) })
  expect(started).toMatchObject({ number: 2, loadId: 'jeans' })
  expect(started?.loads?.map((load) => load.number)).toEqual([2, 3])
})

test('what cannot wait: damp, sweaty, smelly, baby mess, fresh stains and needed by tomorrow; worn alone can wait', () => {
  for (const reason of ['wet', 'sweat', 'smell', 'baby_mess', 'food', 'mud_grass', 'stain_other']) expect(urgentFlag({ reasons: [reason] }, now)).toBe(true)
  expect(urgentFlag({ reasons: ['worn'] }, now)).toBe(false)
  expect(urgentFlag({ reasons: [], stainReport: { kind: 'unknown' } }, now)).toBe(true)
  expect(urgentFlag({ reasons: [], neededBy: new Date(2026, 8, 28, 23, 59).getTime() }, now)).toBe(true)
  expect(urgentFlag({ reasons: [], neededBy: new Date(2026, 9, 3).getTime() }, now)).toBe(false)
  expect(urgentFlag(null, now)).toBe(false)
})

const nextPlan = (washMinutes: number | null, dryer = tumble()): DayPlan => ({ planId: 'p1', loads: [
  { loadId: 'l1', sessionId: 'w2', startable: false, washMinutes: 50, dryer },
  { loadId: 'l2', sessionId: null, startable: true, textileIds: ['towel'], washMinutes, dryer },
] })
const washedForDryer = session({ sessionId: 'w2', machineName: 'Washer 1', washFinishAt: now - 2 * minute, dryMinutes: 65 })

test('moving a wash into the free home dryer joins the next wash to the trip and says its wait', () => {
  // Moved by now + 5; dryer ends now + 70; a 50-minute wash ends now + 60: it may wait about 10 min.
  const state = hubState(inputs({ sessions: [washedForDryer], plan: nextPlan(55), drying: homeDrying() }), now)
  expect(state).toMatchObject({ kind: 'finished', step: { number: 2, at: null, wait: 10, washMinutes: 55 } })
  expect(hubBlockView(state)).toMatchObject({ title: 'Move them to the dryer, then start load 2', reason: 'Load 2 · about 55 min · it may wait about 10 min for the dryer', target: { to: 'session', sessionId: 'w2' } })
})

test('a wash that would wait longer than 30 minutes is held back to end with the dryer, at an "about" time', () => {
  const state = hubState(inputs({ sessions: [washedForDryer], plan: nextPlan(30), drying: homeDrying() }), now)
  // Dryer ends now + 70; a 30-minute wash then starts at now + 40.
  expect(state).toMatchObject({ kind: 'finished', step: { at: now + 40 * minute, wait: 0 } })
  expect(hubBlockView(state)).toMatchObject({ title: 'Move them to the dryer', reason: `Then start load 2 at about ${clockTime(aboutTime(now + 40 * minute))}, so it’s done when the dryer is.` })
})

test('with the home dryer busy and the washer free: start now within the limit, else "Start load N at about"', () => {
  const inDryer = (minutesAgo: number, minutes: number) => homeDrying({ runs: [dryerRun(minutesAgo, minutes)] })
  // A drying-queue run is not a running load: the plan's next load carries the step. Dryer ends now + 40.
  const now50 = hubState(inputs({ sessions: [], plan: nextPlan(50), drying: inDryer(20, 60) }), now)
  expect(now50).toMatchObject({ kind: 'pass', step: { at: null, wait: 0, dryerKey: 'r1' } })
  expect(hubBlockView(now50)).toMatchObject({ title: 'Start load 2 now', reason: 'Load 2 · about 50 min', button: 'Start' })
  const heldQueue = hubState(inputs({ sessions: [], plan: nextPlan(50), drying: inDryer(20, 120) }), now)
  expect(hubBlockView(heldQueue)).toMatchObject({ title: `Start load 2 at about ${clockTime(aboutTime(now + 50 * minute))}`,
    reason: `Load 2 · about 50 min · done when the dryer is, at about ${clockTime(aboutTime(now + 100 * minute))}. Starting now, it would wait about 50 min for the dryer.`, button: 'Start' })
  const drySession = session({ sessionId: 'w1', dryerName: 'Dryer 1', dryerStartedAt: now - 20 * minute, dryMinutes: 120, washFinishedAt: now - 21 * minute })
  const held = hubState(inputs({ sessions: [drySession], plan: { planId: 'p1', loads: [{ loadId: 'l1', sessionId: 'w1', startable: false }, { loadId: 'l2', sessionId: null, startable: true, washMinutes: 50, dryer: tumble() }] }, drying: homeDrying() }), now)
  // Dryer ends now + 100; a 50-minute wash would wait 50: held to now + 50.
  expect(held).toMatchObject({ kind: 'running', step: { at: now + 50 * minute, dryerKey: 'w1' } })
  const words = hubBlockView(held)
  expect(words.title).toBe('Dryer 1 · Drying')
  const soon = hubState(inputs({ sessions: [drySession], plan: { planId: 'p1', loads: [{ loadId: 'l1', sessionId: 'w1', startable: false }, { loadId: 'l2', sessionId: null, startable: true, washMinutes: 80, dryer: tumble() }] }, drying: homeDrying() }), now)
  expect(soon).toMatchObject({ kind: 'running', step: { at: null, wait: 20 } })
  expect(hubBlockView(soon)).toMatchObject({ title: 'Start load 2 now', reason: 'Load 2 · about 80 min · it may wait about 20 min for the dryer', button: 'Start', target: { to: 'plan', planId: 'p1' } })
})

test('"Dryer says" re-times the held-back start from what the dryer shows', () => {
  const drySession = session({ sessionId: 'w1', dryerName: 'Dryer 1', dryerStartedAt: now - 20 * minute, dryMinutes: 120, washFinishedAt: now - 21 * minute })
  const plan: DayPlan = { planId: 'p1', loads: [{ loadId: 'l1', sessionId: 'w1', startable: false }, { loadId: 'l2', sessionId: null, startable: true, washMinutes: 50, dryer: tumble() }] }
  const later = hubState(inputs({ sessions: [drySession], plan, drying: homeDrying(), dryerSays: { key: 'w1', end: now + 130 * minute } }), now)
  expect(later).toMatchObject({ kind: 'running', step: { at: now + 80 * minute, dryerEnd: now + 130 * minute } })
  // Typed for another dryer, or already past: ignored.
  expect(hubState(inputs({ sessions: [drySession], plan, drying: homeDrying(), dryerSays: { key: 'other', end: now + 130 * minute } }), now)).toMatchObject({ step: { at: now + 50 * minute } })
})

test('no clock without minutes: nothing is asked or guessed, at home or in a shared room', () => {
  const missing = hubState(inputs({ sessions: [washedForDryer], plan: nextPlan(null), drying: homeDrying() }), now)
  expect(missing).toMatchObject({ kind: 'finished' })
  expect('step' in missing).toBe(false)
  expect(hubBlockView(missing).title).toBe('Washer 1 is done · move them to a dryer')
  const unknown = { planId: 'p1', loads: [{ loadId: 'l2', sessionId: null, startable: true, washMinutes: null, dryer: tumble(null) }] }
  expect(hubState(inputs({ plan: unknown, drying: homeDrying() }), now)).toMatchObject({ kind: 'pass', timed: false })
  expect(hubState(inputs({ plan: unknown, drying: homeDrying() }), now)).not.toHaveProperty('askTimes')
  expect(hubState(inputs({ plan: unknown, drying: { runs: [], wet: { count: 0, tumble: 0, since: null }, homeDryerId: null } }), now)).not.toHaveProperty('askTimes')
})

test('a later load with no minutes means no step and no clock time anywhere (invariant 11)', () => {
  const plan: DayPlan = { planId: 'p1', loads: [
    { loadId: 'l1', sessionId: 'w2', startable: false, washMinutes: 50, dryer: tumble() },
    { loadId: 'l2', sessionId: null, startable: true, textileIds: ['towel'], washMinutes: 55, dryer: tumble() },
    { loadId: 'l3', sessionId: null, startable: true, textileIds: ['jeans'], washMinutes: null, dryer: tumble() },
  ] }
  const finished = hubState(inputs({ sessions: [washedForDryer], plan, drying: homeDrying() }), now)
  expect('step' in finished).toBe(false)
  const busy = hubState(inputs({ plan, drying: homeDrying({ runs: [dryerRun(20, 120)] }) }), now)
  expect('step' in busy).toBe(false)
  expect(JSON.stringify([hubBlockView(finished), hubBlockView(busy)])).not.toMatch(/about \d/)
})

test('an air-dry next load is never timed against the dryer', () => {
  const state = hubState(inputs({ plan: nextPlan(50, { minutes: null, tumbleCount: 0, fit: 'fits' }), drying: homeDrying({ runs: [dryerRun(20, 120)] }) }), now)
  expect(state.kind).toBe('pass')
  expect('step' in state).toBe(false)
  expect(hubBlockView(state).title).toBe('Load 2 of 2 is ready')
})

test('a wash\'s own dryer step the server reports makes the home dryer busy on pages without session rows', () => {
  const facts = dryingFacts({ runs: [], pieces: [{ status: 'queued', queuedAt: now, method: 'flat' }, { status: 'queued', queuedAt: now, method: 'tumble' }], homeDryerId: 'd1', homeDryerSessionId: 's9', dryers: [{ machineId: 'd1', name: 'Dryer 1' }] })
  expect(facts.wet).toEqual({ count: 2, tumble: 1, since: now })
  expect(homeDryer([], facts, now)).toEqual({ kind: 'busy', name: 'Dryer 1', until: null, runId: null, reminded: false, target: { to: 'session', sessionId: 's9' } })
})

test('a first shared-room start from Home or the dock goes through "What\'s free right now?" on the Laundry tab', () => {
  const plan: DayPlan = { planId: 'p1', loads: [
    { loadId: 'jeans', sessionId: null, startable: true, textileIds: ['jeans'], dryer: tumble() },
    { loadId: 'towels', sessionId: null, startable: true, textileIds: ['towels'], dryer: tumble() },
  ] }
  const shared = { runs: [], wet: { count: 0, tumble: 0, since: null }, homeDryerId: null }
  const asked = hubState(inputs({ plan, drying: shared, sharedStart: { entry: null, washers: 12 } }), now)
  expect(asked).toMatchObject({ kind: 'pass', askFree: true })
  expect(hubBlockView(asked).target).toEqual({ to: 'laundry' })
  expect(homeDockStep(asked).target).toEqual({ to: 'laundry' })
  expect(homeHeroView(asked, { garmentGroups: 2, pieces: 2, only: null }, now).primary?.target).toEqual({ to: 'laundry' })
  // Answered or skipped, one washer, or one load: straight to the plan, as before.
  for (const sharedStart of [{ entry: { planId: 'p1', done: true as const }, washers: 12 }, { entry: null, washers: 1 }]) {
    const state = hubState(inputs({ plan, drying: shared, sharedStart }), now)
    expect('askFree' in state).toBe(false)
    expect(homeDockStep(state).target).toEqual({ to: 'plan', planId: 'p1' })
  }
  const one = hubState(inputs({ plan: { planId: 'p1', loads: plan.loads.slice(0, 1) }, drying: shared, sharedStart: { entry: null, washers: 12 } }), now)
  expect(homeDockStep(one).target).toEqual({ to: 'plan', planId: 'p1' })
})

test('wash times by purpose: the learned median replaces the program only past 10 minutes; short holds back, long fits the day', () => {
  expect(washTime({ washMinutes: 47, washLearned: null })).toEqual({ minutes: 47, short: 47, long: 47, source: 'recorded' })
  expect(washTime({ washMinutes: 47, washLearned: { minutes: 52, count: 4 } })).toEqual({ minutes: 47, short: 47, long: 52, source: 'recorded' })
  expect(washTime({ washMinutes: 47, washLearned: { minutes: 62, count: 5 } })).toEqual({ minutes: 62, short: 47, long: 62, source: 'learned', count: 5 })
  expect(washTime({ washMinutes: null, washLearned: { minutes: 40, count: 3 } })).toMatchObject({ minutes: 40, source: 'learned' })
  expect(washTime({ washMinutes: null })).toBeNull()
  expect(dryTime({ dryer: tumble(60) })).toEqual({ minutes: 60, long: 70, source: 'recorded' })
  expect(dryTime({ dryer: tumble(null) })).toBeNull()
  // The "Next" line says where a learned time came from, and a learned wash alone gives the plan a clock.
  const learned = hubState(inputs({ plan: { planId: 'p1', loads: [{ loadId: 'l2', sessionId: null, startable: true, washMinutes: null, washLearned: { minutes: 40, count: 3 }, dryer: tumble(60) }] }, drying: homeDrying() }), now)
  expect(learned).toMatchObject({ kind: 'pass', timed: true, washMinutes: 40, washSource: 'learned', washCount: 3 })
  expect(learned).not.toHaveProperty('askTimes')
})

test('the rack holds what the household said, one load until asked', () => {
  const air = dryerRun(10, null, { kind: 'air', method: 'rack_line', dryerId: null, dryerName: null })
  expect(rackRoom({ runs: [], wet: { count: 0, tumble: 0, since: null }, homeDryerId: null })).toBe(1)
  expect(rackFull({ runs: [air], wet: { count: 0, tumble: 0, since: null }, homeDryerId: null })).toBe(true)
  expect(rackRoom({ runs: [air], wet: { count: 0, tumble: 0, since: null }, homeDryerId: null, rackLoads: 3 })).toBe(2)
  expect(dryingFacts({ runs: [], pieces: [], homeDryerId: null, rackLoads: 2 }).rackLoads).toBe(2)
})

test('what the machines are doing now sets when the washer and the dryer are free for the rest of the day', () => {
  const free = (sessions: DaySession[], drying: NonNullable<HubInputs['drying']> = homeDrying(), says?: HubInputs['dryerSays']) => {
    const rows = hubRows(hubState(inputs({ sessions, drying, ...(says === undefined ? {} : { dryerSays: says }) }), now))
    return machineOccupancy(rows, homeDryer(rows, drying, now, says), now)
  }
  expect(free([])).toEqual({ washerFreeAt: now, dryerFreeAt: null })
  // Washing until now + 24, then moved to the free dryer (5 min) for 65 + 10 minutes.
  expect(free([session({ dryMinutes: 65 })])).toEqual({ washerFreeAt: now + 29 * minute, dryerFreeAt: now + 29 * minute + 75 * minute })
  // A late first wash moves both: the headline cannot keep the finish the pick promised.
  expect(free([session({ dryMinutes: 65, washFinishAt: now + 54 * minute })])).toEqual({ washerFreeAt: now + 59 * minute, dryerFreeAt: now + 59 * minute + 75 * minute })
  // The dryer is busy until now + 40 (a queue run): the wash waits to move in.
  expect(free([session({ dryMinutes: 65 })], homeDrying({ runs: [dryerRun(20, 60)] }))).toEqual({ washerFreeAt: now + 45 * minute, dryerFreeAt: now + 45 * minute + 75 * minute })
  // An air-dry wash only holds the washer, and the trip to hang it.
  expect(free([session({ hasDrying: false })])).toEqual({ washerFreeAt: now + 29 * minute, dryerFreeAt: null })
  // Extended dryer: the run's end moves, and so does the dryer's.
  expect(free([], homeDrying({ runs: [dryerRun(20, 60)] }))).toEqual({ washerFreeAt: now, dryerFreeAt: now + 40 * minute })
  expect(free([], homeDrying({ runs: [dryerRun(20, 90)] }))).toEqual({ washerFreeAt: now, dryerFreeAt: now + 70 * minute })
  // "Dryer says" re-times the dryer it was typed for.
  expect(free([], homeDrying({ runs: [dryerRun(20, 60)] }), { key: 'r1', end: now + 130 * minute })).toEqual({ washerFreeAt: now, dryerFreeAt: now + 130 * minute })
  // A load already done in the washer waits to move: the dryer takes it now and the washer is free after the move.
  expect(free([session({ sessionId: 'w3', washFinishAt: now - 2 * minute, dryMinutes: 65 })])).toEqual({ washerFreeAt: now + 5 * minute, dryerFreeAt: now + 5 * minute + 75 * minute })
  // A done dryer still holds its load until someone empties it.
  expect(free([], homeDrying({ runs: [dryerRun(70, 60)] }))).toEqual({ washerFreeAt: now, dryerFreeAt: now + 5 * minute })
})

test('a held-back start says which dryer time it is timed from', () => {
  const plan: DayPlan = { planId: 'p1', loads: [{ loadId: 'l1', sessionId: 'w1', startable: false }, { loadId: 'l2', sessionId: null, startable: true, washMinutes: 50, dryer: tumble() }] }
  const drySession = session({ sessionId: 'w1', dryerName: 'Dryer 1', dryerStartedAt: now - 20 * minute, dryMinutes: 120, washFinishedAt: now - 21 * minute })
  expect(hubState(inputs({ sessions: [drySession], plan, drying: homeDrying() }), now)).toMatchObject({ step: { dryerKey: 'w1', dryerSource: 'wash' } })
  expect(hubState(inputs({ sessions: [drySession], plan, drying: homeDrying(), dryerSays: { key: 'w1', end: now + 130 * minute } }), now)).toMatchObject({ step: { dryerKey: 'w1', dryerSource: 'says' } })
  expect(hubState(inputs({ plan, drying: homeDrying({ runs: [dryerRun(20, 120)] }) }), now)).toMatchObject({ step: { dryerKey: 'r1', dryerSource: 'entered' } })
})
