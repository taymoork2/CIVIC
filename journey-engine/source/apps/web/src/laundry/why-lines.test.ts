import { afterEach, beforeEach, expect, test } from 'vitest'

import { markWhySeen, whyKey, whyLine, whySeen } from '@/laundry/why-lines'

class MemoryStorage {
  private readonly values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

let storage: MemoryStorage
beforeEach(() => {
  storage = new MemoryStorage()
  ;(globalThis as any).window = { localStorage: storage }
})
afterEach(() => { delete (globalThis as any).window })

test('a drum-before-the-clothes step gets a sourced reason naming the product', () => {
  const line = whyLine({ phase: 'drum', stage: 'wash', placement: 'direct_to_drum', supplyName: 'Tide' })
  expect(line).not.toBeNull()
  expect(line!.text).toContain('Tide')
  expect(line!.text).toContain('empty tub')
  expect(line!.source).toBe('Machine manual')
})

test('a rinse product added mid-cycle gets its own reason; other steps get none', () => {
  const line = whyLine({ phase: 'cycle', stage: 'rinse', placement: 'direct_to_drum', supplyName: 'Lysol' })
  expect(line).not.toBeNull()
  expect(line!.text).toBe('Lysol only in the rinse: detergent in the wash works against it.')
  expect(line!.source).toBe('Product label')
  // A dispenser step at the ordinary wash stage is not a moment worth teaching.
  expect(whyLine({ phase: 'dispenser', stage: 'wash', placement: 'detergent_compartment', supplyName: 'Tide' })).toBeNull()
  // A rinse product still going in before Start (a locked door adapted it) is not a mid-cycle add.
  expect(whyLine({ phase: 'with_load', stage: 'rinse', placement: 'softener_compartment', supplyName: 'Downy' })).toBeNull()
  // With no product name on record, the line still reads in plain words.
  expect(whyLine({ phase: 'drum', stage: 'wash', placement: 'direct_to_drum', supplyName: null })!.text).toContain('This product')
})

test('a why-line opens by itself only the first time a product meets a machine kind on this device', () => {
  const key = whyKey('tide', false)
  expect(whySeen(key)).toBe(false)
  markWhySeen(key)
  expect(whySeen(key)).toBe(true)
  // A different door (machine kind) is its own first time, even for the same product.
  expect(whySeen(whyKey('tide', true))).toBe(false)
  // Marking twice does not duplicate or error.
  markWhySeen(key)
  expect(whySeen(key)).toBe(true)
})

test('a blocked or absent localStorage never breaks the check: it just always opens', () => {
  ;(globalThis as any).window = { get localStorage(): Storage { throw new Error('blocked') } }
  expect(whySeen('anything')).toBe(false)
  expect(() => markWhySeen('anything')).not.toThrow()
  delete (globalThis as any).window
  expect(whySeen('anything')).toBe(false)
  expect(() => markWhySeen('anything')).not.toThrow()
})
