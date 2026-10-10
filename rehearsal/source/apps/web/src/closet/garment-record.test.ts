import { expect, test } from 'vitest'

import { careHistoryEntries, dryingLine, type GarmentRecord } from '@/closet/garment-record'

test('drying history names the method, its scope and what the label says, never calling a choice safe', () => {
  expect(dryingLine({ outcome: 'left_hanging', method: 'heated_hanging', dryerName: 'Drying cabinet', scope: 'once', evidence: 'not_established', label: 'do_not_tumble_dry' }))
    .toBe("Dried with Drying cabinet (this time only) · compatibility not established by label (Don't tumble dry)")
  expect(dryingLine({ outcome: 'left_hanging', method: 'heated_hanging', scope: 'preference', evidence: 'not_established', label: 'tumble_dry' }))
    .toBe('Dried in the heated hanging dryer (your preference) · compatibility not established by label (Dryer)')
  expect(dryingLine({ outcome: 'tumble_dried', method: 'tumble', dryerName: 'Dryer 4', heat: 'low', minutes: 40, scope: 'once', evidence: 'conflict', label: 'do_not_tumble_dry' }))
    .toBe("Dried with Dryer 4 (this time only) · differs from label (Don't tumble dry)")
  expect(dryingLine({ outcome: 'left_hanging', method: 'flat', scope: 'once', evidence: 'not_specified', label: 'tumble_dry' }))
    .toBe('Dried flat (this time only) · not specified by label (Dryer)')
  expect(dryingLine({ outcome: 'tumble_dried', method: 'tumble', dryerName: 'Dryer 4', heat: 'low', minutes: 40, scope: 'label', evidence: 'allowed', label: 'tumble_dry' }))
    .toBe('Tumble dried in Dryer 4 · Low heat · 40 min')
  expect(dryingLine({ outcome: 'left_hanging', method: 'heated_hanging', dryerName: 'Drying cabinet', scope: 'label' })).toBe('Dried with Drying cabinet')
  expect(dryingLine({ outcome: 'left_hanging', method: 'air_dry' })).toBe('Hung to dry')
  expect(dryingLine({ outcome: 'queued' })).toBe('Waiting to dry')
  // A mid-run check: tumbled, then hung; a missed check is a plain mark, not a damage claim.
  expect(dryingLine({ outcome: 'left_hanging', method: 'rack_line', scope: 'once', evidence: 'not_specified', label: 'tumble_dry', tumbledMinutes: 25, dryerName: 'Dryer 4' })).toBe('Tumbled 25 min in Dryer 4, then hung')
  expect(dryingLine({ outcome: 'tumble_dried', method: 'tumble', dryerName: 'Dryer 4', heat: 'low', minutes: 50, scope: 'label', evidence: 'allowed', label: 'tumble_dry', checkMissed: true }))
    .toBe('Tumble dried in Dryer 4 · Low heat · 50 min · early check missed')
})

test('care history entries run newest first and carry washer, drying, products, observation and the reader\'s assessment', () => {
  const record: GarmentRecord = {
    label: 'tumble_dry', preference: 'flat', equipment: { tumble: true, heated_hanging: false },
    washes: [
      { at: 3_000, recordId: undefined, washerName: 'Washer 2', cycle: 'delicate', drying: { outcome: 'left_hanging', method: 'flat', scope: 'once', evidence: 'not_specified', label: 'tumble_dry' },
        products: [{ name: 'Gentle detergent', amount: 30, unit: 'ml', placement: 'drawer' }],
        observation: { problem: 'odor', timing: 'after_drying', recurring: true },
        assessments: [{ assessmentId: 'a1' as never, dimension: 'odor', checkedWhen: 'after_drying', result: 'improved', revision: 1, recordedAt: 3_100 }] },
      { at: 1_000, recordId: undefined, observation: undefined, washerName: null, cycle: 'normal', drying: { outcome: 'left_hanging', method: 'air_dry' }, products: [] },
    ],
    preferenceChanges: [{ at: 2_000, method: 'flat' }],
  }
  const entries = careHistoryEntries(record, 'imperial')
  expect(entries.map((entry) => entry.at)).toEqual([3_000, 2_000, 1_000])
  expect(entries[0]!.facts!.map((fact) => `${fact.label}: ${String(fact.value).slice(0, 12)}`)).toEqual(['Washed: Delicate', 'Dried: Dried flat (', 'Used: Gentle deter'])
  expect(entries[0]!.place).toBe('Washer 2')
  expect(entries[0]!.notes).toHaveLength(2)
  expect(entries[0]!.lines).toEqual([
    'Washed in Washer 2 · Delicate',
    'Dried flat (this time only) · not specified by label (Dryer)',
    expect.stringMatching(/^Used: Gentle detergent · /),
    'Noticed: odor · after drying · recurring',
    expect.stringMatching(/^Your result: /),
  ])
  expect(entries[1]!.lines).toEqual(['Drying preference changed to Lay flat'])
  expect(entries[2]!.lines).toEqual(['Washed · Normal', 'Hung to dry'])
  expect(entries[2]!.facts!.map((fact) => fact.value)).toEqual(['Normal', 'Hung'])
})
