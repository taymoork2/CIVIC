import { expect, test } from 'vitest'

import { afterWashStage, afterWashStages, loadNextAction, sessionStage, sessionStages, stageReached, type PieceDrying, type StageFacts } from '@/laundry/session-stage'

const minute = 60_000
const started = 1_000_000
const washEnds = started + 35 * minute

const facts = (overrides: Partial<StageFacts> = {}): StageFacts => ({
  status: 'running',
  machineStartedAt: started,
  washFinishAt: washEnds,
  washFinishedAt: null,
  dryerStartedAt: null,
  dryMinutes: 45,
  hasDrying: true,
  dryerStepRecorded: false,
  dryerUnloaded: false,
  ...overrides,
})

test('a load moves from preparing through the wash', () => {
  expect(sessionStage(facts({ machineStartedAt: null, washFinishAt: null }), started).stage).toBe('preparing')
  expect(sessionStage(facts(), washEnds - minute).stage).toBe('washing')
  expect(sessionStage(facts(), washEnds).stage).toBe('wash_done')
  expect(sessionStage(facts({ status: 'completed' }), washEnds).stage).toBe('finished')
  expect(sessionStage(facts({ status: 'cancelled', machineStartedAt: null }), started).stage).toBe('finished')
})

test('an unknown finish keeps the wash going until someone says it finished', () => {
  const unknown = facts({ washFinishAt: null })
  expect(sessionStage(unknown, started + 10 * 60 * minute).stage).toBe('washing')
  expect(sessionStage({ ...unknown, washFinishedAt: started + 30 * minute }, started + 31 * minute).stage).toBe('wash_done')
})

test('a finish recorded early, or a recorded drying step, ends the wash before its time', () => {
  const early = sessionStage(facts({ washFinishedAt: washEnds - 5 * minute }), washEnds - 4 * minute)
  expect(early).toMatchObject({ stage: 'wash_done', washReadyAt: washEnds - 5 * minute, dryReadyAt: washEnds + 40 * minute, dryEstimated: true })
  expect(sessionStage(facts({ dryerStepRecorded: true }), washEnds - 10 * minute).stage).toBe('wash_done')
})

test('the dryer timer makes a check due without recording unloading or completion', () => {
  const dryerStartedAt = washEnds + 5 * minute
  const running = facts({ dryerStartedAt, dryerStepRecorded: true })
  expect(sessionStage(running, dryerStartedAt + 44 * minute).stage).toBe('drying')
  expect(sessionStage(running, dryerStartedAt + 45 * minute).stage).toBe('dry')
  expect(running.dryerUnloaded).toBe(false)
  expect(running.status).toBe('running')
  expect(sessionStage({ ...running, dryerUnloaded: true }, dryerStartedAt + minute).stage).toBe('dry')
  // Without recorded minutes the dryer is running until it is collected.
  expect(sessionStage({ ...running, dryMinutes: null }, dryerStartedAt + 10 * 60 * minute).stage).toBe('drying')
})

test('the dry time is estimated from the wash before the dryer starts and re-based once it does', () => {
  expect(sessionStage(facts(), started)).toMatchObject({ washReadyAt: washEnds, dryReadyAt: washEnds + 45 * minute, dryEstimated: true, doneAt: washEnds + 45 * minute })
  const dryerStartedAt = washEnds + 12 * minute
  expect(sessionStage(facts({ dryerStartedAt }), dryerStartedAt)).toMatchObject({ dryReadyAt: dryerStartedAt + 45 * minute, dryEstimated: false, doneAt: dryerStartedAt + 45 * minute })
  expect(sessionStage(facts({ washFinishAt: null }), started)).toMatchObject({ washReadyAt: null, dryReadyAt: null, doneAt: null })
})

test('a load that hangs to dry is done when the wash is', () => {
  const hanging = facts({ hasDrying: false, dryMinutes: null })
  expect(sessionStage(hanging, started)).toMatchObject({ dryReadyAt: null, dryEstimated: false, doneAt: washEnds })
  expect(sessionStage(hanging, washEnds).stage).toBe('wash_done')
})

test('stages only move forward', () => {
  expect(stageReached('drying', 'wash_done')).toBe(true)
  expect(stageReached('washing', 'wash_done')).toBe(false)
  expect(stageReached('preparing', 'washing')).toBe(false)
})

const pieces = (...drying: (PieceDrying | undefined)[]) => drying.map((entry) => entry === undefined ? {} : { drying: entry })

test('after the wash a load is as far along as its least advanced piece', () => {
  const at = washEnds
  expect(afterWashStage({ pieces: pieces('queued', 'drying', 'dry'), dryerCheckAt: null }, at)).toBe('queued_to_dry')
  expect(afterWashStage({ pieces: pieces('drying', 'dry', 'put_away'), dryerCheckAt: null }, at)).toBe('pieces_drying')
  expect(afterWashStage({ pieces: pieces('dry', 'put_away'), dryerCheckAt: null }, at)).toBe('to_put_away')
  expect(afterWashStage({ pieces: pieces('put_away', undefined), dryerCheckAt: null }, at)).toBe('put_away')
  // Nothing entered the drying queue: there is no stage after the wash.
  expect(afterWashStage({ pieces: pieces(undefined, undefined), dryerCheckAt: null }, at)).toBeNull()
})

test('a run-out dryer timer only makes a check due; no elapsed time marks a piece dry or put away', () => {
  const checkAt = washEnds + 45 * minute
  const drying = { pieces: pieces('drying', 'drying'), dryerCheckAt: checkAt }
  expect(afterWashStage(drying, checkAt - minute)).toBe('pieces_drying')
  expect(afterWashStage(drying, checkAt)).toBe('check_due')
  for (const later of [checkAt + minute, checkAt + 24 * 60 * minute, checkAt + 365 * 24 * 60 * minute]) {
    expect(afterWashStage(drying, later)).toBe('check_due')
  }
  // Air drying has no timer: it stays drying until someone says the pieces are dry.
  expect(afterWashStage({ pieces: pieces('drying'), dryerCheckAt: null }, checkAt + 24 * 60 * minute)).toBe('pieces_drying')
  // A timer never moves queued pieces on, either.
  expect(afterWashStage({ pieces: pieces('queued', 'drying'), dryerCheckAt: checkAt }, checkAt + minute)).toBe('queued_to_dry')
})

test('every stage maps to exactly one next action', () => {
  const stages = [...sessionStages, ...afterWashStages]
  expect(new Set(stages).size).toBe(stages.length)
  for (const stage of stages) {
    const action = loadNextAction(stage)
    expect(action.label.length).toBeGreaterThan(0)
    expect(['session', 'drying']).toContain(action.target)
    expect(loadNextAction(stage)).toEqual(action)
  }
  expect(loadNextAction('check_due')).toEqual({ label: 'Check dryness', target: 'drying' })
  expect(loadNextAction('to_put_away')).toEqual({ label: 'See what to put away', target: 'drying' })
  expect(loadNextAction('washing')).toEqual({ label: 'Open load', target: 'session' })
})
