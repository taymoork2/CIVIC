import { expect, test } from 'vitest'

import { bandOf, classifyWater, ebmudForZip, qualifyingWaterCondition, softUntil, type HouseholdWater, type WaterAnswers } from './waterHardness'

const now = Date.UTC(2026, 9, 6)
const day = 24 * 60 * 60 * 1000
const ebmudIn = (area: string): WaterAnswers => ({ zip: '94596', utility: 'ebmud', area, source: 'lookup', setAt: now })
const saved = (answers: WaterAnswers): HouseholdWater => ({ ...answers, ...classifyWater(answers, answers.setAt) })

test('USGS bands go by the maximum: 60 soft, 61 moderately hard, 121 hard, 181 very hard', () => {
  expect([60, 61, 120, 121, 180, 181].map(bandOf)).toEqual(['soft', 'moderate', 'moderate', 'hard', 'hard', 'very_hard'])
})

test('EBMUD as a whole is not soft; only a town no harder plant can serve is', () => {
  expect(classifyWater(ebmudIn('not_sure'), now)).toEqual({ band: 'hard', mgL: 160 })
  expect(classifyWater(ebmudIn('walnut_creek'), now)).toEqual({ band: 'soft', mgL: 27 })
  expect(classifyWater(ebmudIn('orinda'), now)).toEqual({ band: 'soft', mgL: 40 })
  expect(qualifyingWaterCondition(saved(ebmudIn('danville')), now)).toBe('soft')
})

test('a town Upper San Leandro or Sobrante can serve takes that plant: hard or moderately hard, never soft', () => {
  for (const town of ['oakland', 'piedmont', 'castro_valley', 'hayward']) expect(classifyWater(ebmudIn(town), now)).toEqual({ band: 'hard', mgL: 160 })
  expect(classifyWater(ebmudIn('richmond'), now)).toEqual({ band: 'moderate', mgL: 98 })
  expect(qualifyingWaterCondition(saved(ebmudIn('oakland')), now)).toBeUndefined()
})

test('a town the unmapped San Pablo plant may serve stays not known', () => {
  expect(classifyWater(ebmudIn('berkeley'), now).band).toBe('unknown')
})

test('a well, an unlisted bill, an unmatched ZIP and an unknown area are not known', () => {
  expect(classifyWater({ ...ebmudIn('orinda'), utility: 'well' }, now).band).toBe('unknown')
  expect(classifyWater({ ...ebmudIn('orinda'), utility: 'not_listed' }, now).band).toBe('unknown')
  expect(classifyWater({ ...ebmudIn('orinda'), zip: '10001' }, now).band).toBe('unknown')
  expect(classifyWater({ ...ebmudIn('orinda'), area: undefined }, now).band).toBe('unknown')
  expect(ebmudForZip('94611')).toBe('only')
  expect(ebmudForZip('94596')).toBe('partly')
  expect(ebmudForZip('10001')).toBeNull()
})

test('a report older than last year’s edition stops qualifying', () => {
  const later = Date.UTC(2027, 5, 1)
  expect(classifyWater(ebmudIn('orinda'), later).band).toBe('unknown')
  expect(qualifyingWaterCondition(saved(ebmudIn('orinda')), later)).toBeUndefined()
})

test('an override always wins, in either direction', () => {
  expect(classifyWater({ ...ebmudIn('orinda'), source: 'strip', reading: { value: 6, unit: 'gpg' } }, now)).toEqual({ band: 'moderate', mgL: 102 })
  expect(classifyWater({ ...ebmudIn('oakland'), source: 'strip', reading: { value: 3, unit: 'gpg' } }, now)).toEqual({ band: 'soft', mgL: 51 })
  expect(classifyWater({ ...ebmudIn('orinda'), source: 'utility_report', reading: { value: 200, unit: 'mg_l' } }, now)).toEqual({ band: 'very_hard', mgL: 200 })
  expect(classifyWater({ ...ebmudIn('orinda'), source: 'unknown' }, now).band).toBe('unknown')
})

test('a softener without a strip reading is not known; with one it counts for six months', () => {
  expect(classifyWater({ ...ebmudIn('oakland'), source: 'softener' }, now).band).toBe('unknown')
  const softened = saved({ ...ebmudIn('oakland'), source: 'softener', reading: { value: 1, unit: 'gpg' } })
  expect(qualifyingWaterCondition(softened, now + 180 * day)).toBe('soft')
  expect(qualifyingWaterCondition(softened, now + 181 * day)).toBeUndefined()
})

test('where a harder plant can serve, a soft strip counts for 30 days and a report value never does', () => {
  const strip = saved({ ...ebmudIn('oakland'), source: 'strip', reading: { value: 40, unit: 'mg_l' } })
  expect(qualifyingWaterCondition(strip, now + 30 * day)).toBe('soft')
  expect(qualifyingWaterCondition(strip, now + 31 * day)).toBeUndefined()
  expect(qualifyingWaterCondition(saved({ ...strip, area: 'orinda' }), now + 400 * day)).toBeUndefined() // the report is stale by then
  expect(qualifyingWaterCondition(saved({ ...strip, area: 'orinda' }), now + 31 * day)).toBe('soft')
  const report = (reportYear?: number): WaterAnswers => ({ ...strip, source: 'utility_report', reading: { value: 40, unit: 'mg_l', ...(reportYear === undefined ? {} : { reportYear }) } })
  expect(qualifyingWaterCondition(saved(report(2026)), now)).toBeUndefined()
  expect(qualifyingWaterCondition(saved({ ...report(2025), utility: 'not_listed' }), now)).toBe('soft')
})

test('a water report number counts only with its year, and not once older than last year’s edition', () => {
  const report = (reportYear?: number): HouseholdWater => saved({ zip: '10001', utility: 'not_listed', source: 'utility_report', reading: { value: 40, unit: 'mg_l', ...(reportYear === undefined ? {} : { reportYear }) }, setAt: now })
  expect(qualifyingWaterCondition(report(), now)).toBeUndefined()
  expect(qualifyingWaterCondition(report(2025), Date.UTC(2026, 11, 31))).toBe('soft')
  expect(qualifyingWaterCondition(report(2025), Date.UTC(2027, 0, 1))).toBeUndefined()
})

test('softUntil is the moment soft stops qualifying: report age, a 30-day strip, a 6-month softener strip', () => {
  const nextYear = Date.UTC(2027, 0, 1)
  expect(softUntil(saved(ebmudIn('orinda')), now), 'a lookup lasts until the 2025 report is too old').toBe(nextYear)
  expect(qualifyingWaterCondition(saved(ebmudIn('orinda')), nextYear - 1)).toBe('soft')
  const strip = saved({ ...ebmudIn('oakland'), source: 'strip', reading: { value: 2, unit: 'gpg' } })
  expect(softUntil(strip, now), 'a strip where a harder plant can serve').toBe(now + 30 * day + 1)
  expect(qualifyingWaterCondition(strip, now + 30 * day)).toBe('soft')
  const softAreaStrip = saved({ ...ebmudIn('orinda'), source: 'strip', reading: { value: 2, unit: 'gpg' } })
  expect(softUntil(softAreaStrip, now), 'a strip in a soft area holds while the report does').toBe(nextYear)
  expect(softUntil(saved({ ...ebmudIn('oakland'), source: 'softener', reading: { value: 1, unit: 'gpg' } }), now)).toBe(now + 180 * day + 1)
  expect(softUntil(saved({ ...ebmudIn('orinda'), utility: 'not_listed', source: 'utility_report', reading: { value: 30, unit: 'mg_l', reportYear: 2026 } }), now)).toBe(Date.UTC(2028, 0, 1))
  expect(softUntil(saved(ebmudIn('oakland')), now), 'not soft: nothing to end').toBeUndefined()
  expect(softUntil(undefined, now)).toBeUndefined()
})
