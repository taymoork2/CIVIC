import { expect, test } from 'vitest'

import { classifyWater, type HouseholdWater, type WaterAnswers } from '@convex/waterHardness'
import { readingOk, reportYearOk, waterStatus } from '@/household/water-sheet'

const now = Date.UTC(2026, 9, 6)
const day = 24 * 60 * 60 * 1000
const saved = (answers: WaterAnswers): HouseholdWater => ({ ...answers, ...classifyWater(answers, answers.setAt) })
const oakland = { zip: '94611', utility: 'ebmud', area: 'oakland', setAt: now } as const

test('a soft reading the planner would not count says so and asks to test again', () => {
  expect(waterStatus(saved({ ...oakland, source: 'strip', reading: { value: 2, unit: 'gpg' } }), now)).toEqual({ title: 'Soft' })
  expect(waterStatus(saved({ ...oakland, source: 'strip', reading: { value: 2, unit: 'gpg' } }), now + 31 * day))
    .toEqual({ title: 'Soft, not counted', note: 'Your water can change with the season. Test again.' })
  expect(waterStatus(saved({ ...oakland, source: 'utility_report', reading: { value: 40, unit: 'mg_l', reportYear: 2026 } }), now).note).toMatch(/season/)
  expect(waterStatus(saved({ zip: '10001', utility: 'not_listed', source: 'utility_report', reading: { value: 40, unit: 'mg_l', reportYear: 2023 }, setAt: now }), now).note).toMatch(/too old/)
  // A lookup whose report has gone stale shows what the planner reads now, not the band saved then.
  expect(waterStatus(saved({ ...oakland, area: 'danville', zip: '94526', source: 'lookup' }), Date.UTC(2027, 5, 1))).toEqual({ title: 'Not known' })
})

test('the sheet accepts only readings and report years the server saves', () => {
  expect(readingOk(117, 'gpg')).toBe(true)
  expect(readingOk(118, 'gpg')).toBe(false)
  expect(readingOk(2000, 'mg_l')).toBe(true)
  expect(readingOk(2001, 'mg_l')).toBe(false)
  expect(readingOk(-1, 'mg_l')).toBe(false)
  expect(reportYearOk('1990', now)).toBe(true)
  expect(reportYearOk('1989', now)).toBe(false)
  expect(reportYearOk('2026', now)).toBe(true)
  expect(reportYearOk('2027', now)).toBe(false)
})
