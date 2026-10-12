import { colorGroups, flagReasons, garmentKinds, loadSizes, occasions } from '@washcloset/planner'
import { expect, test } from 'vitest'

import { colorDisplay, colorWord, colourExamples, colourHint, colourWord, colourWords, countWord, cycleWord, dayWord, drumPictures, flagReasonWords, kindWords, loadSizeWords, monthWord, noWearerWords, occasionWords, shortMonthWord, soilButtonWords, soilSentenceWords, statusWords, temperatureWord } from './copy'
import { assertPlainCopy, readableText } from '@/kit/test-copy'

const at = (month: number, day: number, year = 2026, hour = 12) => new Date(year, month - 1, day, hour).getTime()
// A Sunday afternoon.
const now = at(9, 27, 2026, 15)

test('soil, size and drum words', () => {
  expect(soilButtonWords).toEqual({ light: 'A little', normal: 'Normal', heavy: 'Very dirty' })
  expect(soilSentenceWords).toEqual({ light: 'lightly worn', normal: 'normal', heavy: 'very dirty' })
  expect(Object.keys(loadSizeWords)).toEqual([...loadSizes])
  expect(loadSizeWords.extra_large).toBe('extra large')
  expect(drumPictures.map((picture) => [picture.word, picture.size])).toEqual([
    ['A quarter', 'small'], ['Half', 'medium'], ['Three quarters', 'large'], ['Full', 'extra_large'],
  ])
})

test('temperatures and cycles as words, and nothing for what has no word', () => {
  expect([30, 40, 50, 60].map(temperatureWord)).toEqual(['Cold', 'Warm', 'Hot', 'Very hot'])
  expect(temperatureWord(null)).toBeNull()
  expect(temperatureWord(undefined)).toBeNull()
  expect(temperatureWord(20)).toBe('Cold')
  expect(temperatureWord(95)).toBe('Very hot')
  expect(['normal', 'delicate', 'permanent_press', 'heavy_duty', 'quick'].map(cycleWord)).toEqual(['Normal', 'Delicate', 'Permanent press', 'Heavy duty', 'Quick'])
  expect(cycleWord('eco_40_60')).toBeNull()
  expect(cycleWord(null)).toBeNull()
})

test('every kind, occasion, reason and status has a word', () => {
  expect(Object.keys(kindWords)).toEqual([...garmentKinds])
  expect(Object.keys(occasionWords)).toEqual([...occasions])
  expect(occasionWords.lounge).toBe('Lounge')
  expect(Object.keys(flagReasonWords)).toEqual([...flagReasons])
  expect(statusWords).toEqual({ clean: 'Ready', dirty: 'Waiting to wash', hanging: 'Hanging to dry', needs_dry_clean: 'Needs dry cleaning', at_cleaner: 'At the cleaner', needs_refresh: 'Needs a refresh' })
  expect(noWearerWords).toBe('Shared (towels, sheets)')
})

test('the colour swatches store their groups, and every stored group reads as a swatch', () => {
  expect(Object.entries(colourWords)).toEqual([
    ['white', 'White'], ['light', 'Light'], ['saturated', 'Bright'], ['medium', 'Medium'], ['dark', 'Dark'], ['black', 'Black'], ['unknown', 'Mixed'],
  ])
  for (const group of colorGroups) expect(Object.values(colourWords)).toContain(colourWord(group))
  expect(colourWord('very_light')).toBe('Light')
  expect(colourWord(null)).toBe('Mixed')
})

test('each swatch has one line of examples, in the same spelling as the hint above them', () => {
  expect(colourExamples).toEqual({
    white: 'White, off-white, cream, ivory',
    light: 'Pastels, light gray, heather, beige',
    saturated: 'Red, orange, hot pink, bright blue or green',
    medium: 'Mid gray, khaki, tan, muted colors',
    dark: 'Navy, charcoal, brown, burgundy, dark denim',
    black: 'Black and faded black',
    unknown: 'Stripes, prints, color blocks',
  })
  expect(Object.keys(colourExamples)).toEqual(Object.keys(colourWords))
  expect(colourHint).toBe('Pick the color that covers most of it.')
  for (const line of [...Object.values(colourExamples), colourHint]) expect(line).not.toMatch(/colour|grey/i)
})

test('days read relative to today, weekdays within six days, dates beyond', () => {
  expect(dayWord(at(9, 27, 2026, 23), now)).toBe('today')
  expect(dayWord(at(9, 28, 2026, 1), now)).toBe('tomorrow')
  expect(dayWord(at(9, 26), now)).toBe('yesterday')
  expect(dayWord(at(9, 29), now)).toBe('Tue')
  expect(dayWord(at(10, 3), now)).toBe('Sat')
  expect(dayWord(at(10, 4), now)).toBe('Oct 4')
  expect(dayWord(at(9, 22), now)).toBe('Tue')
  expect(dayWord(at(9, 12), now)).toBe('Sep 12')
})

test('months say the year only when it is not this one', () => {
  expect(monthWord(at(6, 3), now)).toBe('June')
  expect(monthWord(at(6, 3, 2025), now)).toBe('June 2025')
  expect(shortMonthWord(at(6, 3))).toBe('Jun')
  expect(countWord(1, 'laundry item')).toBe('1 laundry item')
  expect(countWord(3, 'laundry item')).toBe('3 laundry items')
})

test('the plain-copy check reads text and spoken labels, not class names', () => {
  expect(() => assertPlainCopy('<p class="rule-capacity">3 ready</p>')).not.toThrow()
  expect(() => assertPlainCopy('<p>Load units: 4</p>')).toThrow(/load unit/i)
  expect(() => assertPlainCopy('<p>An HE washer</p>')).toThrow(/HE/)
  expect(() => assertPlainCopy('<button aria-label="Evidence">x</button>')).toThrow(/Evidence/)
  expect(() => assertPlainCopy('<svg aria-label="high-efficiency logo"><text>he</text></svg> Where&#x27;s the stain?')).not.toThrow()
  expect(() => assertPlainCopy({ textContent: 'Tag observed' })).toThrow(/observed/)
  expect(readableText('<p>Worn&nbsp;3×</p><input placeholder="Left knee"/>')).toBe('Worn 3× Left knee')
})

test('a stored Grey displays as en-US Gray, keeping case; other colors are untouched', () => {
  expect(colorWord('Grey')).toBe('Gray')
  expect(colorWord('Heather grey')).toBe('Heather gray')
  expect(colorWord('GREY')).toBe('GRAY')
  expect(colorWord('Greyhound blue')).toBe('Greyhound blue')
  expect(colorWord('Navy')).toBe('Navy')
  expect(colorDisplay({ color: 'Grey', colorGroup: 'medium' })).toBe('Gray')
  expect(colorDisplay({ color: null, colorGroup: 'medium' })).toBe(colourWord('medium'))
})
