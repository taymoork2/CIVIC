import { expect, test } from 'vitest'

import { getFunctionName } from 'convex/server'
import { createElement } from 'react'

import { api } from '@/api'
import { sessionStage } from '@/laundry/session-stage'
import { renderToStaticMarkup } from '@/test/markup'
import { MachineStepPresenter, ReviewStep, preparationBackStep, acceptedStepFeedback, chooseDryerLocally, LoadSummaryView, sessionOrigin, type LoadRecord, type PieceLink, currentStep, recordLocally, runningPhase, stageFacts, stepActions, TimerCard, stepToDoNow, washFinishedLocally, wrongWasher, wrongWasherVisible, type Action, type Detail } from '@/laundry/session-view'

test('preparation Back visits earlier recorded instructions before returning to the recipe', () => {
  expect(preparationBackStep(0, null)).toBeNull()
  expect(preparationBackStep(3, null)).toBe(2)
  expect(preparationBackStep(3, 2)).toBe(1)
  expect(preparationBackStep(3, 0)).toBeNull()
})

test('preparation shows one planned dose; completed review substitutes the actual dose without a guessed cap', () => {
  const action: Action = { id: 'dose', kind: 'treatment', phase: 'drum', order: 1, supplyId: 'liquid', supplyName: 'Fragrance-free liquid', dose: { amount: 25, unit: 'ml' }, placement: 'direct_to_drum', stage: 'wash', timing: null, confidence: 'verified', status: 'pending' }
  const facts = { doorLocks: false, cycle: 'normal', cycleMinutes: null, washerName: 'Washer', drying: null }
  const planned = renderToStaticMarkup(createElement(MachineStepPresenter, { action, facts, titleId: 'dose', progress: '2 of 5', primary: { label: 'Done', onClick: () => {} }, canRecord: true, error: null, textileName: () => '', rememberExplanation: false }))
  expect(planned).toContain('Pour into the empty drum')
  expect(planned).not.toContain('Pour 25')
  expect(planned.match(/class="dose-figure row"/g)).toHaveLength(1)
  expect(planned).toContain('empty-drum.webp')
  expect(planned).not.toContain('cup-fill')
  const review = renderToStaticMarkup(createElement(ReviewStep, { action: { ...action, status: 'confirmed' }, actualUsage: { amount: 30, unit: 'ml', mark: null }, facts, progress: '2 of 5', drumFullness: null, onNext: () => {}, rememberExplanation: false }))
  expect(review).toContain('30 ml')
  expect(review).not.toContain('25 ml')
  expect(review).not.toContain('cup-fill')
})

const step = (id: string, phase: string, order: number, status = 'pending') => ({ id, phase, order, status })

// A front-loader with a mid-cycle step on a machine that allows it, then the dryer.
const actions = [
  step('dryer', 'dryer_load', 6),
  step('drawer', 'dispenser', 2),
  step('load', 'load', 0),
  step('close', 'close', 1),
  step('start', 'start', 3),
  step('rinse', 'cycle', 4),
  step('hang', 'hold_out', 5),
]

const recorded = (ids: string[]) => actions.map((action) => (ids.includes(action.id) ? { ...action, status: 'confirmed' } : action))

test('the first pending step in physical order is in hand before Start', () => {
  expect(currentStep(actions, 'preparing')?.id).toBe('load')
  expect(currentStep(recorded(['load', 'close']), 'preparing')?.id).toBe('drawer')
})

test('mid-cycle steps wait for the machine to start', () => {
  expect(currentStep(recorded(['load', 'close', 'drawer', 'start']), 'preparing')).toBeNull()
  expect(currentStep(recorded(['load', 'close', 'drawer', 'start']), 'washing')?.id).toBe('rinse')
})

test('drying steps are not in hand until the wash is done', () => {
  const washed = recorded(['load', 'close', 'drawer', 'start', 'rinse'])
  expect(currentStep(washed, 'washing')).toBeNull()
  expect(currentStep(washed, 'wash_done')?.id).toBe('hang')
  expect(currentStep(recorded(['load', 'close', 'drawer', 'start', 'rinse', 'hang']), 'drying')?.id).toBe('dryer')
})

test('a finished load has no step in hand', () => {
  expect(currentStep(actions, 'finished')).toBeNull()
})

test('the screen stays on for a step in hand, not while a mid-cycle step waits for its time', () => {
  const now = 1_000_000
  expect(stepToDoNow(null, now)).toBe(false)
  expect(stepToDoNow({ phase: 'close' }, now)).toBe(true)
  expect(stepToDoNow({ phase: 'cycle', dueAt: now + 60_000 }, now)).toBe(false)
  expect(stepToDoNow({ phase: 'cycle', dueAt: now }, now)).toBe(true)
  expect(stepToDoNow({ phase: 'cycle' }, now)).toBe(true)
})

/** A local store holding one session's detail, as Convex's optimistic updates see it. */
function storeWith(detail: Record<string, unknown>) {
  let value: unknown = detail
  const store = { getQuery: () => value, setQuery: (_query: unknown, _args: unknown, next: unknown) => { value = next }, getAllQueries: () => [] }
  return { store: store as unknown as Parameters<typeof recordLocally>[0], read: () => value as Record<string, unknown> & { actions: Array<{ id: string; status: string }> } }
}

const liveDetail = (overrides: Record<string, unknown> = {}) => ({
  machineStartedAt: null,
  estimatedFinishAt: null,
  estimatedDoneAt: null,
  cycleMinutes: 40,
  dryerStartedAt: null,
  drying: { status: 'ready', minutes: 50, startedAt: null, readyAt: null },
  actions: [
    { id: 'close', kind: 'task', task: 'close', status: 'pending' },
    { id: 'start', kind: 'task', task: 'start', status: 'pending' },
    { id: 'dry', kind: 'task', task: 'dryer_start', status: 'pending' },
  ],
  ...overrides,
})

const sessionId = 's1' as Parameters<typeof recordLocally>[1]['sessionId']

test('a step recorded with no signal shows as done at once', () => {
  const { store, read } = storeWith(liveDetail())
  recordLocally(store, { sessionId, actionId: 'close', status: 'confirmed', at: 5 })
  expect(read().actions.map((action) => action.status)).toEqual(['confirmed', 'pending', 'pending'])
  expect(read().machineStartedAt).toBeNull()
})

test('Start queued offline runs its clock from the phone\'s time, with the cycle length on record and nothing guessed', () => {
  const at = 1_000_000
  const timed = storeWith(liveDetail())
  recordLocally(timed.store, { sessionId, actionId: 'start', status: 'confirmed', at })
  expect(timed.read()).toMatchObject({ machineStartedAt: at, estimatedFinishAt: at + 40 * 60_000 })
  const untimed = storeWith(liveDetail({ cycleMinutes: null }))
  recordLocally(untimed.store, { sessionId, actionId: 'start', status: 'confirmed', at })
  expect(untimed.read()).toMatchObject({ machineStartedAt: at, estimatedFinishAt: null })
  const dryer = storeWith(liveDetail())
  recordLocally(dryer.store, { sessionId, actionId: 'dry', status: 'confirmed', at })
  expect(dryer.read()).toMatchObject({ dryerStartedAt: at, drying: { startedAt: at, readyAt: at + 50 * 60_000 } })
})

test('a step already recorded is left as the server has it', () => {
  const { store, read } = storeWith(liveDetail({ actions: [{ id: 'close', kind: 'task', task: 'close', status: 'skipped' }] }))
  recordLocally(store, { sessionId, actionId: 'close', status: 'confirmed', at: 5 })
  expect(read().actions[0]!.status).toBe('skipped')
})

const washing = (overrides: Record<string, unknown> = {}) => liveDetail({
  status: 'running',
  machineStartedAt: 1_000,
  actions: [
    { id: 'start', kind: 'task', task: 'start', phase: 'start', order: 0, status: 'confirmed' },
    { id: 'dry', kind: 'task', task: 'dryer_start', phase: 'dryer_start', order: 1, status: 'pending' },
  ],
  washFinishedAt: null,
  ...overrides,
})

test('"It finished" tapped with no signal moves the load on to the dryer at once, timed from the tap', () => {
  const at = 1_000_000
  const { store, read } = storeWith(washing())
  washFinishedLocally(store, { sessionId, at })
  const detail = read() as unknown as Parameters<typeof stageFacts>[0]
  expect(detail).toMatchObject({ washFinishedAt: at, estimatedDoneAt: at + 50 * 60_000, drying: { readyAt: at + 50 * 60_000 } })
  const stage = sessionStage(stageFacts(detail), at).stage
  expect(stage).toBe('wash_done')
  expect(currentStep(detail.actions, stage)?.phase).toBe('dryer_start')
})

test('"It finished" leaves a wash already said to be finished, or not yet started, as the server has it', () => {
  const finished = storeWith(washing({ washFinishedAt: 5_000 }))
  washFinishedLocally(finished.store, { sessionId, at: 9_000 })
  expect(finished.read().washFinishedAt).toBe(5_000)
  const idle = storeWith(washing({ machineStartedAt: null }))
  washFinishedLocally(idle.store, { sessionId, at: 9_000 })
  expect(idle.read().washFinishedAt).toBeNull()
})

test('the dryer tapped in "Which dryer?" shows as chosen at once, by its own name', () => {
  let detail: unknown = liveDetail({ householdId: 'h1', drying: { status: 'ready', minutes: 50, dryerId: 'd1', dryerChosen: false, dryerName: 'Dryer 1' } })
  const inventory = { machines: [{ machineId: 'd1', name: 'Dryer 1' }, { machineId: 'd2', name: 'Dryer 2' }] }
  const store = {
    getQuery: (query: unknown) => (getFunctionName(query as never) === getFunctionName(api.inventory.list) ? inventory : detail),
    setQuery: (_query: unknown, _args: unknown, next: unknown) => { detail = next },
    getAllQueries: () => [],
  } as unknown as Parameters<typeof chooseDryerLocally>[0]
  chooseDryerLocally(store, { sessionId, dryerId: 'd2' as Parameters<typeof chooseDryerLocally>[1]['dryerId'] })
  expect(detail).toMatchObject({ drying: { dryerId: 'd2', dryerChosen: true, dryerName: 'Dryer 2' } })
})

// ---- "Wrong washer?" (W3) -------------------------------------------------------------------

test('"Wrong washer?" is offered only before the machine is confirmed started', () => {
  expect(wrongWasherVisible(null)).toBe(true)
  expect(wrongWasherVisible(1234)).toBe(false)
})

test('a successful cancel navigates back to the pass; a refusal leaves its message up and stays', async () => {
  const events: string[] = []
  await wrongWasher(async () => ({ sessionId: 's1', status: 'cancelled' as const }), { navigated: () => events.push('navigated') })
  expect(events).toEqual(['navigated'])

  // useConvexCall's own contract: a refusal resolves to undefined and leaves its message in `.error`,
  // which the caller already renders next to the button, so nothing here navigates away.
  events.length = 0
  await wrongWasher(async () => undefined, { navigated: () => events.push('navigated') })
  expect(events).toEqual([])
})

const feedbackAction = (id: string, phase: string, order: number, status: Action['status'] = 'pending', extra: Partial<Action> = {}): Action => ({
  id, kind: 'task', task: phase as Action['task'], phase, order, title: id, detail: null,
  supplyId: '', supplyName: null, dose: null, stage: '', placement: '', timing: null, confidence: 'verified', status, ...extra,
})
const feedbackDetail = (overrides: Partial<Detail> = {}) => ({
  sessionId, status: 'running', machineStartedAt: null, estimatedFinishAt: null, washFinishedAt: null,
  dryerStartedAt: null, drying: null, actions: [feedbackAction('Clothes are in', 'load', 0, 'confirmed'), feedbackAction('Close the door', 'close', 1)],
  ...overrides,
} as Detail)
const receipt = (actionId: string, status: 'confirmed' | 'skipped' | 'missed' = 'confirmed') => ({ sessionId, actionId, status, receiptId: 'acknowledged-tap' })

test('optimistic completion and reload do not earn accepted-step feedback without an acknowledgment', () => {
  expect(acceptedStepFeedback(feedbackDetail(), null, 0)).toBeNull()
  expect(acceptedStepFeedback(feedbackDetail(), receipt('Close the door'), 0)).toBeNull()
  expect(acceptedStepFeedback(feedbackDetail(), { ...receipt('Clothes are in'), sessionId: 'another-load' as typeof sessionId }, 0)).toBeNull()
  expect(acceptedStepFeedback(feedbackDetail({ status: 'cancelled' }), receipt('Clothes are in'), 0)).toBeNull()
})

test('an accepted step names the actual next task, without guessing an appliance phase', () => {
  expect(acceptedStepFeedback(feedbackDetail(), receipt('Clothes are in'), 0)).toEqual({ recorded: 'Recorded: Clothes are in.', next: 'Next: Close the door.', target: 'task' })
})

test('left-out and missed feedback cannot read as confirmation or survive a conflicting record', () => {
  for (const status of ['skipped', 'missed'] as const) {
    const detail = feedbackDetail({ actions: [feedbackAction('Detergent', 'dispenser', 0, status), feedbackAction('Press Start', 'start', 1)] })
    expect(acceptedStepFeedback(detail, receipt('Detergent', status), 0)?.recorded).toBe(`${status === 'skipped' ? 'Left out' : 'Marked missed'}: Detergent.`)
    expect(acceptedStepFeedback(detail, receipt('Detergent'), 0)).toBeNull()
  }
})

test('accepted Start hands off to its recorded timer and a timed by-hand task waits for its own due time', () => {
  const now = 1_000_000
  const detail = feedbackDetail({ machineStartedAt: now, estimatedFinishAt: now + 40 * 60_000,
    actions: [feedbackAction('Press Start', 'start', 0, 'confirmed'), feedbackAction('Add recorded product by hand', 'cycle', 1, 'pending', { dueAt: now + 20 * 60_000 })] })
  const feedback = acceptedStepFeedback(detail, receipt('Press Start'), now)
  expect(feedback?.target).toBe('timer')
  expect(feedback?.next).toContain('Timer: 40 min left.')
  // The screen clock may still precede the newly acknowledged server start.
  expect(acceptedStepFeedback(detail, receipt('Press Start'), now - 999)?.next).toContain('Timer: 40 min left.')
  expect(feedback?.next).toContain('Next: Add recorded product by hand at ')
  expect(feedback?.next).not.toMatch(/spinning|rinsing/i)
  expect(acceptedStepFeedback({ ...detail, estimatedFinishAt: null }, receipt('Press Start'), now)?.next).toContain('No finish time is recorded. Check the machine.')
})

test('starting a dryer points to its timer rather than declaring pending pieces ready to collect', () => {
  const now = 1_000_000
  const detail = feedbackDetail({ machineStartedAt: now - 40 * 60_000, washFinishedAt: now, dryerStartedAt: now,
    drying: { status: 'ready', minutes: 45, readyAt: now + 45 * 60_000 } as Detail['drying'],
    actions: [feedbackAction('Start the dryer', 'dryer_start', 0, 'confirmed'), feedbackAction('Collect from the dryer', 'dryer_unload', 1)] })
  expect(acceptedStepFeedback(detail, receipt('Start the dryer'), now)).toEqual({ recorded: 'Recorded: Start the dryer.', next: 'Timer: 45 min left.', target: 'timer' })
  expect(acceptedStepFeedback(detail, receipt('Start the dryer'), now + 45 * 60_000)?.next).toBe('Time is up. Check whether the pieces are dry.')
  expect(detail.actions[1]!.status).toBe('pending')
})

test('finished washing with only dryer steps remaining points to the independent drying queue', () => {
  const detail = feedbackDetail({ machineStartedAt: 1, washFinishedAt: 100,
    actions: [feedbackAction('Add by hand', 'cycle', 0, 'confirmed'), feedbackAction('Start the dryer', 'dryer_start', 1)] })
  expect(acceptedStepFeedback(detail, receipt('Add by hand'), 100)?.next).toBe('Next: move these pieces to the drying queue.')
})

test.each([
  // [case, action, context, options, recovery]
  ['wash detergent while preparing', { kind: 'treatment', phase: 'dispenser', stage: 'wash' }, { isDetergent: true }, ['amount', 'skip'], ['switch', 'problem']],
  ['wash detergent with no planned load', { kind: 'treatment', phase: 'dispenser', stage: 'wash' }, { isDetergent: true, hasLoad: false }, ['amount', 'skip'], ['problem']],
  ['rinse product mid-cycle', { kind: 'treatment', phase: 'cycle', stage: 'rinse' }, {}, ['amount', 'skip', 'missed'], ['problem']],
  ['product in the empty drum', { kind: 'treatment', phase: 'drum', stage: 'wash' }, {}, ['amount', 'skip'], ['problem']],
  ['pretreatment', { kind: 'treatment', phase: 'drum', stage: 'pretreat' }, {}, ['amount', 'skip'], []],
  ['reusable dispensing ball', { kind: 'treatment', phase: 'with_load', stage: 'rinse', reusable: true }, {}, ['skip'], ['problem']],
  ['loading the clothes', { kind: 'task', task: 'load', phase: 'load' }, {}, [], ['problem']],
  ['pressing Start', { kind: 'task', task: 'start', phase: 'start' }, {}, [], ['problem']],
  ['closing the door', { kind: 'task', task: 'close', phase: 'close' }, {}, [], []],
  ['a dryer step', { kind: 'task', task: 'dryer_start', phase: 'dryer_start' }, {}, ['skip'], []],
  ['paused mid-cycle product: no missed either', { kind: 'treatment', phase: 'cycle', stage: 'rinse' }, { paused: true }, [], ['problem']],
  ['read-only copy keeps options, loses recovery', { kind: 'treatment', phase: 'dispenser', stage: 'wash' }, { readOnly: true, isDetergent: true }, ['amount', 'skip'], []],
  ['after preparation: no recovery', { kind: 'treatment', phase: 'cycle', stage: 'rinse' }, { preparing: false }, ['amount', 'skip', 'missed'], []],
] as const)('step actions: %s', (_name, action, context, options, recovery) => {
  const result = stepActions(action as Parameters<typeof stepActions>[0], { paused: false, readOnly: false, preparing: true, isDetergent: false, hasLoad: true, ...context })
  expect(result).toEqual({ options, recovery })
})

test('a confirmed wash finish is a static record: no countdown, no bar, and the page says Washed, not Drying', () => {
  const at = new Date(2026, 9, 5, 15, 42).getTime()
  const finished = feedbackDetail({ machineStartedAt: at - 40 * 60_000, estimatedFinishAt: at + 60_000, washFinishedAt: at, cycleMinutes: 41, finishConfidence: 'observed',
    actions: [feedbackAction('Start the dryer', 'dryer_start', 0)] })
  const html = renderToStaticMarkup(createElement(TimerCard, { detail: finished, now: at + 30_000, washer: 'Synthetic washer' }))
  expect(html).toContain('Finished')
  expect(html).toContain('at 3:42')
  expect(html).not.toMatch(/\d+ min/)
  expect(html).not.toContain('Time is up')
  expect(html).not.toContain('progressbar')
  const stage = sessionStage(stageFacts(finished), at + 30_000).stage
  expect(stage).toBe('wash_done')
  expect(runningPhase(finished, stage, finished.actions[0]!)).toBe('washed')
  // The timer running out confirms nothing; a dryer already running is drying.
  expect(runningPhase({ washFinishedAt: null, dryerStartedAt: null }, 'wash_done', null)).toBe('washing')
  expect(runningPhase({ washFinishedAt: at, dryerStartedAt: at + 1 }, 'drying', null)).toBe('drying')
})

const tee = (id: string, drying?: 'queued' | 'drying' | 'dry' | 'put_away') => ({ textileId: id as never, name: 'T-shirt', color: 'White', status: 'clean' as const, washCount: 3, ...(drying === undefined ? {} : { drying }) })
const finishedLoad = (textiles: ReturnType<typeof tee>[]) => ({ status: 'completed' as const, machineName: 'Washer 3', cycle: 'delicate', completedAt: 1_000, usage: [], doorLocks: true, textiles })
const pieceLink: PieceLink = (textileId, label, children) => createElement('a', { href: `/closet?item=${textileId}&tab=history`, 'aria-label': label }, children)
const summary = (textiles: ReturnType<typeof tee>[], record?: LoadRecord) => renderToStaticMarkup(createElement(LoadSummaryView, {
  detail: finishedLoad(textiles), record, now: 60_000, system: 'imperial', back: createElement('a', { href: '/me', 'aria-label': 'Back to Me' }), footer: 'Back to Me', pieceLink,
}))

test('a finished wash with pieces still drying or waiting to be put away is not called complete', () => {
  expect(summary([tee('a', 'queued'), tee('b', 'dry')])).toContain('Waiting to dry')
  const drying = summary([tee('a', 'drying'), tee('b', 'drying')])
  expect(drying).toContain('Drying')
  expect(drying).not.toContain('Load complete')
  expect(summary([tee('a', 'dry')])).toContain('To put away')
  expect(summary([tee('a', 'put_away')])).toContain('Load complete')
  // A run-out dryer timer asks for a check; the pieces are still not called dry or complete.
  const due = renderToStaticMarkup(createElement(LoadSummaryView, { detail: { ...finishedLoad([tee('a', 'drying')]), dryerCheckAt: 30_000 }, record: undefined, now: 60_000, system: 'imperial', back: null, footer: null, pieceLink }))
  expect(due).toContain('Check dryness')
  expect(due).not.toContain('Load complete')
})

test('a done load with a kept name says it by name, with its total time when both times are known', () => {
  const render = (extra: object, textiles = [tee('a', 'put_away')]) => renderToStaticMarkup(createElement(LoadSummaryView, { detail: { ...finishedLoad(textiles), ...extra }, record: undefined, now: 60_000, system: 'imperial', back: null, footer: null, pieceLink }))
  const named = render({ loadName: 'Whites', startedAt: 0, putAwayAt: 72 * 60_000 })
  expect(named).toContain('Whites, done.')
  expect(named).toContain('1 piece washed, dried and put away · 1 h 12 min')
  expect(named).not.toContain('finished')
  // Without a name or both times the old wording stands.
  const old = render({ startedAt: 0, putAwayAt: null })
  expect(old).toContain('Load complete')
  expect(old).toContain('finished')
})

test('opening a completed load receipt has a static acknowledgement and no replayed celebration', () => {
  const html = summary([tee('a', 'put_away')])
  expect(html).toContain('data-completion-mark')
  expect(html).not.toContain('animate-')
  expect(html).not.toContain('stroke-dasharray')
})

test('the completed load groups matching pieces by drying state and names its washer and cycle', () => {
  const html = summary([tee('a', 'dry'), tee('b', 'dry'), tee('c', 'put_away')])
  expect(html).toContain('T-shirt, White ×2')
  expect(html).toContain('Dry, to put away')
  expect(html).toContain('Put away')
  expect(html).toContain('Washer 3 · Delicate cycle')
})

test('each piece of the load links to its own History, without private observations or assessments', () => {
  const wash = { at: 1_000, washerName: 'Washer 3', cycle: 'delicate', drying: { outcome: 'air_dried' }, recordId: undefined, products: [],
    observation: { problem: 'pilling', timing: 'after_wash', recurring: false }, assessments: [{ dimension: 'overall', result: 'good', checkedWhen: 'after_wash' }] }
  const record = { sessionId: 's', completedAt: 1_000, pieces: [{ textileId: 'a', name: 'T-shirt', color: 'White', wash }, { textileId: 'g', name: 'Scarf', guest: true, wash }] } as unknown as LoadRecord
  const html = summary([tee('a', 'put_away')], record)
  expect(html).toContain('Back in the closet')
  expect(html).toContain('href="/closet?item=a&amp;tab=history"')
  expect(html).toContain('aria-label="T-shirt, White: open history"')
  expect(html).not.toContain('item=g')
  expect(html).not.toContain('Noticed')
  expect(html).not.toContain('Your result')
})

test('a load with every piece put away is a done moment with a receipt and one row per piece, not a stack of lists', () => {
  const html = summary([tee('a', 'put_away'), tee('b', 'put_away')])
  expect(html).toContain('Load complete')
  expect(html).toContain('2 pieces washed, dried and put away')
  expect(html).toContain('aria-label="How it was cared for"')
  expect(html).toContain('Back in the closet')
  expect(html).toContain('T-shirt, White ×2')
  for (const retired of ['What went in', 'Pieces in this load', 'In this load']) expect(html).not.toContain(retired)
})

test('Back from a load returns to the page that opened it, else Laundry', () => {
  expect(sessionOrigin('me')).toEqual({ label: 'Back to Me', to: '/me' })
  expect(sessionOrigin('closet')).toEqual({ label: 'Back to Closet', to: '/closet' })
  expect(sessionOrigin(undefined)).toEqual({ label: 'Back to Laundry', to: '/laundry' })
})
