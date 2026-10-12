import { expect, test } from 'vitest'

import { hangingDay, startLoadReminderCall } from '@/laundry/laundry-day'
import { dayPlanText } from '@/copy-laundry'
import type { HubState, NextStep } from '@/home/hub-state'

test('hanging garments count, and All dry clears them from the loads that hung them', () => {
  const sessions = [
    { sessionId: 'a', status: 'completed', textileIds: ['t1', 't2'], completedAt: 2 },
    { sessionId: 'b', status: 'completed', textileIds: ['t1'], completedAt: 5 },
  ] as never
  const textiles = [
    { textileId: 't1', status: 'hanging', guest: false },
    { textileId: 't2', status: 'hanging', guest: false },
    { textileId: 't3', status: 'hanging', guest: false },
    { textileId: 't4', status: 'hanging', guest: true },
    { textileId: 't5', status: 'clean', guest: false },
  ] as never
  // t1's latest load is b; t3 came from a load no longer listed, so it is counted but not cleared here.
  expect(hangingDay(textiles, sessions)).toEqual({ count: 3, sessionIds: ['b', 'a'] })
})

test('a day strip order line is one string, with or without its minutes', () => {
  expect(dayPlanText.orderLine('Load 1 of 4', 'Whites', { minutes: 'wash ~45 min, dry ~65 min', sources: 'your washer’s time; your dryer’s time' }))
    .toBe('Load 1 of 4: Whites · wash ~45 min, dry ~65 min (your washer’s time; your dryer’s time)')
  expect(dayPlanText.orderLine('Load 2 of 4', 'Darks', null)).toBe('Load 2 of 4: Darks')
})

test('a held start asks for its reminder with its dryer time, and the reminder is cancelled the moment the hold goes', () => {
  const step = { number: 3, planId: 'p1', loadId: 'l3', washMinutes: 50, washSource: 'recorded', wait: 0, at: 1_000, waitNow: 40, dryerKey: 'r1', dryerEnd: 5_000, dryerSource: 'entered' } as NextStep
  const next = { planId: 'p1', number: 3, count: 3, ready: true } as never
  const running = (held: NextStep | undefined, planNext: unknown = next) => ({ kind: 'running', rows: [], next: planNext, ...(held === undefined ? {} : { step: held }) }) as unknown as HubState
  expect(startLoadReminderCall(running(step))).toEqual({ remind: { planId: 'p1', loadId: 'l3', at: 1_000, basis: { key: 'r1', end: 5_000, source: 'entered' } } })
  // "Dryer says" made the wash start now: no hold, so the waiting reminder goes.
  expect(startLoadReminderCall(running({ ...step, at: null }))).toEqual({ cancel: 'p1' })
  expect(startLoadReminderCall(running(undefined))).toEqual({ cancel: 'p1' })
  expect(startLoadReminderCall({ kind: 'pass', ...(next as object), step: { ...step, at: null } } as unknown as HubState)).toEqual({ cancel: 'p1' })
  // Nothing to say about a plan that is not there, or a screen that is not the day's wash step.
  expect(startLoadReminderCall(running(step, null))).toBeNull()
  expect(startLoadReminderCall({ kind: 'finished' } as unknown as HubState)).toBeNull()
  expect(startLoadReminderCall(undefined)).toBeNull()
  // A step without a dryer time to hold it to still reminds, with no basis to check.
  expect(startLoadReminderCall(running({ ...step, dryerKey: null }))).toEqual({ remind: { planId: 'p1', loadId: 'l3', at: 1_000 } })
})
