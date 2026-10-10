import { expect, test } from 'vitest'

import { dryerBlocks, displayDose, displayTemperature, doseParts, formatDose, localeUnitSystem, localizeTemperatures, localizeVolumes, storedAmount, storedTemperature, type DoseParts } from '@/kit/units'

test('the device region picks the unit system', () => {
  expect(localeUnitSystem('en-US')).toBe('imperial')
  expect(localeUnitSystem('en')).toBe('imperial')
  expect(localeUnitSystem('es-US')).toBe('imperial')
  expect(localeUnitSystem('en-GB')).toBe('metric')
  expect(localeUnitSystem('en-CA')).toBe('metric')
  expect(localeUnitSystem('not a locale')).toBe('metric')
})

test('native approximate and uncalibrated actual-use corrections retain the recorded amount', () => {
  expect(doseParts({ amount: 0.25, unit: 'US_cup', approximate: true }, 'imperial').spoken).toBe('Approximately ¼ US cup')
  expect(doseParts({ amount: 0.5, unit: 'US_cup', approximate: true }, 'imperial').spoken).toBe('Approximately 0.5 US cup')
  expect(doseParts({ amount: 0.5, unit: 'dispenser' }, 'imperial').spoken).toBe('Half the dispenser (capacity not calibrated)')
  expect(doseParts({ amount: 1, unit: 'dispenser' }, 'imperial').spoken).toBe('1 dispenser (capacity not calibrated)')
})

test('doses show in US units without changing what the label stored', () => {
  expect(displayDose(30, 'ml', 'imperial')).toEqual({ amount: 1, unit: 'fl oz' })
  expect(displayDose(120, 'ml', 'imperial')).toEqual({ amount: 4.1, unit: 'fl oz' })
  expect(displayDose(35, 'g', 'imperial')).toEqual({ amount: 1.2, unit: 'oz' })
  expect(displayDose(1, 'pod', 'imperial')).toEqual({ amount: 1, unit: 'pod' })
  expect(displayDose(2, 'fl oz', 'metric')).toEqual({ amount: 59, unit: 'ml' })
  expect(formatDose(60, 'ml', 'metric')).toBe('60 ml')
})

test('an amount typed in shown units is stored in the label unit', () => {
  expect(storedAmount(1, 'ml', 'imperial')).toBe(29.6)
  expect(storedAmount(28, 'ml', 'metric')).toBe(28)
  expect(storedAmount(59, 'fl oz', 'metric')).toBe(2)
})

test('temperatures show in °F and are stored in °C', () => {
  expect(displayTemperature(30, 'imperial')).toBe('86 °F')
  expect(displayTemperature(40, 'metric')).toBe('40 °C')
  expect(storedTemperature(86, 'imperial')).toBe(30)
  expect(localizeTemperatures('normal cycle, 30 °C', 'imperial')).toBe('normal cycle, 86 °F')
})

test('label wording shows its volumes and weights in the shown units', () => {
  expect(localizeVolumes('measure 60 ml', 'imperial')).toBe('measure 2 fl oz')
  expect(localizeVolumes('one 35 g scoop', 'imperial')).toBe('one 1.2 oz scoop')
  expect(localizeVolumes('fill to line 2', 'imperial')).toBe('fill to line 2')
  expect(localizeVolumes('measure 60 ml', 'metric')).toBe('measure 60 ml')
})

const printed = (parts: DoseParts) => parts.tokens.map((token) => token.text).join('')

test('a cap mark leads as printed, its digits as figures and its words as words', () => {
  for (const system of ['metric', 'imperial'] as const) {
    const line = doseParts({ amount: 1, unit: 'cap', mark: 'Line 2' }, system)
    expect(line).toMatchObject({ kind: 'mark', lead: 'Fill the cap to', unitWord: null })
    expect(line.tokens).toEqual([{ text: 'Line ', figure: false }, { text: '2', figure: true }])
  }
  expect(doseParts({ amount: 1, unit: 'cap', mark: 'Large/heavily soiled' }, 'imperial').tokens).toEqual([{ text: 'Large/heavily soiled', figure: false }])
  expect(doseParts({ amount: 1, unit: 'scoop', mark: '3' }, 'metric')).toMatchObject({ lead: 'Fill the scoop to', tokens: [{ text: '3', figure: true }] })
})

test('a mark is never converted, even when it names a volume', () => {
  const parts = doseParts({ amount: 1, unit: 'cap', mark: '30 mL' }, 'imperial')
  expect(printed(parts)).toBe('30 mL')
  expect(parts.tokens).toEqual([{ text: '30', figure: true }, { text: ' mL', figure: false }])
  expect(parts.secondary).toBeNull()
})

test("the numeric equivalent is secondary, only from a printed volume, in this device's units", () => {
  const dose = { amount: 1, unit: 'cap', mark: 'Line 2', equivalent: { amount: 30, unit: 'ml' } }
  expect(doseParts(dose, 'imperial').secondary).toBe('≈ 1 fl oz')
  expect(doseParts(dose, 'metric').secondary).toBe('≈ 30 ml')
  expect(doseParts({ amount: 1, unit: 'cap', mark: 'Line 2' }, 'imperial').secondary).toBeNull()
  expect(doseParts({ amount: 1, unit: 'cap', mark: 'Line 2', equivalent: null }, 'imperial').secondary).toBeNull()
  expect(doseParts(dose, 'imperial').spoken).toBe('Fill the cap to line 2, about 1 fl oz')
})

test('more than one fill leads with the count of fills', () => {
  const twice = doseParts({ amount: 2, unit: 'cap', mark: 'Line 1' }, 'metric')
  expect(printed(twice)).toBe('2 × Line 1')
  expect(twice.tokens[0]).toEqual({ text: '2 × ', figure: true })
  expect(twice.spoken).toBe('Fill the cap to line 1, twice')
  expect(printed(doseParts({ amount: 1.5, unit: 'cap', mark: 'Line 1' }, 'metric'))).toBe('1½ × Line 1')
})

test('a partial fill names its fraction and never displays a scaled volume', () => {
  for (const system of ['metric', 'imperial'] as const) {
    const parts = doseParts({ amount: 1, unit: 'cap', mark: 'Bar 1', fractionOfMark: 0.8, equivalent: { amount: 39, unit: 'ml' } }, system)
    expect(printed(parts)).toBe('4/5 of Bar 1')
    expect(parts.spoken).toBe('Fill the cap to 4/5 of bar 1')
    expect(parts.secondary).toBeNull()
  }
  expect(printed(doseParts({ amount: 2, unit: 'scoop', mark: 'Line 2', fractionOfMark: 0.5 }, 'imperial'))).toBe('2 × 1/2 of Line 2')
})

test('counts are whole laundry items, named in the singular or plural and never converted', () => {
  expect(doseParts({ amount: 2, unit: 'sheet' }, 'imperial')).toMatchObject({ kind: 'count', tokens: [{ text: '2', figure: true }], unitWord: 'sheets', spoken: '2 sheets' })
  expect(doseParts({ amount: 1, unit: 'sheet' }, 'imperial')).toMatchObject({ kind: 'count', unitWord: 'sheet' })
  expect(doseParts({ amount: 3, unit: 'balls' }, 'metric')).toMatchObject({ kind: 'count', unitWord: 'balls' })
  expect(doseParts({ amount: 1, unit: 'pod' }, 'metric')).toMatchObject({ kind: 'count', unitWord: 'pod' })
})

test('a measured amount converts as before, and a cap without a mark reads as caps', () => {
  expect(doseParts({ amount: 30, unit: 'ml' }, 'metric')).toMatchObject({ kind: 'amount', lead: null, tokens: [{ text: '30', figure: true }], unitWord: 'ml', secondary: null })
  expect(doseParts({ amount: 30, unit: 'ml' }, 'imperial')).toMatchObject({ kind: 'amount', tokens: [{ text: '1', figure: true }], unitWord: 'fl oz' })
  expect(doseParts({ amount: 120, unit: 'ml' }, 'imperial').tokens[0]!.text).toBe('4.1')
  expect(doseParts({ amount: 1, unit: 'cap' }, 'imperial')).toMatchObject({ kind: 'amount', tokens: [{ text: '1', figure: true }], unitWord: 'cap' })
  expect(doseParts({ amount: 2, unit: 'cap', mark: '  ' }, 'imperial')).toMatchObject({ kind: 'amount', unitWord: 'caps' })
})

test('a dryer that sells time shows blocks and price from known minutes, and never invents either', () => {
  const dryer = { blockMinutes: 16, pricePerStart: 0.5 }
  expect(dryerBlocks(30, dryer)).toEqual({ blocks: 2, price: 1 })
  expect(dryerBlocks(32, dryer)).toEqual({ blocks: 2, price: 1 })
  expect(dryerBlocks(33, dryer)).toEqual({ blocks: 3, price: 1.5 })
  expect(dryerBlocks(null, dryer)).toBeNull()
  expect(dryerBlocks(0, dryer)).toBeNull()
  // Per-start pricing and a missing price are not blocks.
  expect(dryerBlocks(30, { blockMinutes: null, pricePerStart: 0.5 })).toBeNull()
  expect(dryerBlocks(30, { pricePerStart: 0.5 })).toBeNull()
  expect(dryerBlocks(30, { blockMinutes: 16, pricePerStart: null })).toBeNull()
})
