import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { readDeviceState, readIntakeIdentity, writeDeviceState } from './device-state'
import { validBottleIntake, validGarmentIntake, validMachineIntake } from './intake-validation'
import { emptyAddDraft } from '@/closet/add-clothes'
import { newMachineDraft } from '@/household/machine-sheet'
import { newBottleDraft } from '@/products/bottle-sheet'
import { purgePrivateState } from '@/private-state'

let values: Record<string, string>
beforeEach(() => {
  values = {}
  const storage = new Proxy({ getItem: (key: string) => values[key] ?? null, setItem: (key: string, value: string) => { values[key] = value }, removeItem: (key: string) => { delete values[key] } }, { ownKeys: () => Object.keys(values), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) })
  vi.stubGlobal('window', { localStorage: storage })
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
const text = (value: unknown): value is string => typeof value === 'string'

test('intake save identity survives draft updates and remains private to its scope', () => {
  const intake = { key: 'stable-intake-identity', attempted: true }
  expect(writeDeviceState('alice:h1', 'draft', 'cotton', intake)).toBe(true)
  expect(readIntakeIdentity('alice:h1', 'draft')).toEqual(intake)
  expect(readIntakeIdentity('bob:h1', 'draft')).toBeNull()
  expect(readIntakeIdentity('alice:h2', 'draft')).toBeNull()
  expect(writeDeviceState('alice:h1', 'draft', 'cotton blend', intake)).toBe(true)
  expect(readIntakeIdentity('alice:h1', 'draft')).toEqual(intake)
  writeDeviceState('alice:h1', 'draft', null)
  expect(readIntakeIdentity('alice:h1', 'draft')).toBeNull()
})

test('private convenience state is isolated by principal, household and purpose, expires and purges', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-10T00:00:00Z'))
  writeDeviceState('alice:h1', 'search', 'Supima')
  expect(readDeviceState('alice:h1', 'search', text)).toBe('Supima')
  expect(readDeviceState('bob:h1', 'search', text)).toBeNull()
  expect(readDeviceState('alice:h2', 'search', text)).toBeNull()
  expect(readDeviceState('alice:h1', 'draft', text)).toBeNull()
  vi.advanceTimersByTime(24 * 60 * 60 * 1000)
  expect(readDeviceState('alice:h1', 'search', text)).toBeNull()
  writeDeviceState('alice:h1', 'search', 'cotton')
  values['unrelated'] = 'keep'
  purgePrivateState()
  expect(values).toEqual({ unrelated: 'keep' })
})

test('malformed, future and wrong-version state is removed instead of reaching a form', () => {
  for (const raw of ['{', JSON.stringify({ version: 2, at: Date.now(), value: 'cotton' }), JSON.stringify({ version: 1, at: Date.now() + 10000, value: 'cotton' }), JSON.stringify({ version: 1, at: Date.now(), value: {} })]) {
    values['washcloset:private:convenience:["a","search"]'] = raw
    expect(readDeviceState('a', 'search', text)).toBeNull()
    expect(Object.keys(values)).toHaveLength(0)
  }
})

test('blocked and full storage report failure without claiming a recoverable draft', () => {
  expect(writeDeviceState('a', 'draft', 'x'.repeat(40_000))).toBe(false)
  expect(Object.keys(values)).toHaveLength(0)
  vi.stubGlobal('window', { localStorage: { setItem: () => { throw new Error('QuotaExceededError') }, getItem: () => null } })
  expect(writeDeviceState('a', 'draft', 'cotton')).toBe(false)
  expect(readDeviceState('a', 'draft', text)).toBeNull()
})

test('intake guards retain unfinished answers but reject corrupt shapes, photos and credentials', () => {
  const garment = { draft: { ...emptyAddDraft, kind: 'towel', material: '90% cotton, 10% polyester', fabricDetails: { fibers: [{ fiber: 'cotton', details: ['Supima'] }] }, preOwned: { smell: null, fragile: false, heatTreat: false }, additionalColors: [{ colour: 'dark', colorName: 'Navy', count: 1, dyeRun: 'unknown' }] }, step: 'fabric', careStep: 'wash', destination: 'closet', soilChosen: false, carried: false }
  expect(validGarmentIntake(garment)).toBe(true)
  expect(validGarmentIntake({ ...garment, draft: { ...garment.draft, tag: null } })).toBe(false)
  expect(validGarmentIntake({ ...garment, photo: {} })).toBe(false)
  expect(validGarmentIntake({ ...garment, draft: { ...garment.draft, token: 'private' } })).toBe(false)
  const machine = { draft: newMachineDraft({ kind: 'washer', place: 'home' }), step: 'controls' }
  expect(validMachineIntake(machine)).toBe(true)
  expect(validMachineIntake({ ...machine, draft: { ...machine.draft, door: 'front', rinseContact: {}, washProcesses: {}, programMode: 'unknown' } })).toBe(true)
  expect(validMachineIntake({ ...machine, draft: { ...machine.draft, washProcesses: { normal: { programLabel: 'Unconfirmed' } } } })).toBe(false)
  expect(validMachineIntake({ ...machine, draft: { ...machine.draft, heat: [] } })).toBe(false)
  expect(validMachineIntake({ ...machine, draft: { ...machine.draft, kind: 'unknown-kind' } })).toBe(false)
  const bottle = { draft: { ...newBottleDraft(), form: 'liquid', use: 'rinse_sanitizer', pendingMark: '3' }, step: 'measurement' }
  expect(validBottleIntake(bottle)).toBe(true)
  expect(validBottleIntake({ ...bottle, draft: { ...bottle.draft, marks: '3' } })).toBe(false)
  expect(validBottleIntake({ ...bottle, draft: { ...bottle.draft, safety: { bleachKind: 'chlorine' } } })).toBe(false)
  expect(validGarmentIntake({ ...garment, someoneNew: true, newName: 'Lou', correctingReview: true })).toBe(true)
  expect(validMachineIntake({ ...machine, correctingReview: true })).toBe(true)
  expect(validBottleIntake({ ...bottle, correctingReview: true })).toBe(true)
})
