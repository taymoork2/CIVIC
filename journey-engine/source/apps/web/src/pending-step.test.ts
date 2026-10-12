import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Id } from '@convex/_generated/dataModel'
import { clearPendingStep, pendingSteps, savePendingStep } from './pending-step'
import { purgePrivateState } from './private-state'

let data: Map<string, string>
beforeEach(() => {
  data = new Map()
  const localStorage = {
    get length() { return data.size }, key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key),
  }
  vi.stubGlobal('window', { localStorage: new Proxy(localStorage, { ownKeys: () => [...data.keys()], getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }), set: (target, key, value) => Reflect.set(target, key, value, target) }) })
})
afterEach(() => vi.unstubAllGlobals())
const args = { sessionId: 's1' as Id<'sessions'>, actionId: 'a1', status: 'confirmed' as const, at: 100, minutes: 40, expectedTimelineRevision: 2 }

test('an offline product tap preserves the actual fraction of its printed mark', () => {
  const usage = { supplyId: 'p1' as Id<'supplies'>, amount: 1, unit: 'cap', mark: 'Bar 1', fractionOfMark: 0.8, placement: 'detergent_compartment' }
  savePendingStep('h1', 'Add detergent', { ...args, usage })
  expect(pendingSteps('h1', 's1')[0]?.args.usage).toEqual(usage)
})

test.each([
  { amount: 1, unit: 'cap', mark: 'Bar 2', target: 'below' as const },
  { amount: 0.25, unit: 'cup', approximate: true },
])('saved product taps retain native qualifiers across reloads: %j', (dose) => {
  const usage = { supplyId: 'p1' as Id<'supplies'>, placement: 'drum_before_clothes', ...dose }
  const saved = savePendingStep('h1', 'Add detergent', { ...args, usage })!
  expect(saved.args.usage).toEqual(usage)
  expect(pendingSteps('h1', 's1')[0]?.args.usage).toEqual(usage)
})

test('a saved tap keeps its time and receipt across reloads, scoped to the current household and load', () => {
  const saved = savePendingStep('h1', 'Press Start', { ...args, token: 'never-store' } as typeof args)!
  expect(pendingSteps('h1', 's1')).toEqual([saved])
  expect(pendingSteps('h2', 's1')).toEqual([])
  expect(pendingSteps('h1', 's2')).toEqual([])
  expect([...data.values()].join()).not.toContain('never-store')
  expect(savePendingStep('h1', 'Press Start', saved.args)?.args).toEqual(saved.args)
  expect(pendingSteps('h1', 's1')).toHaveLength(1)
  clearPendingStep(saved.args.receiptId)
  expect(pendingSteps('h1', 's1')).toEqual([])
})

test('full or blocked storage refuses the new tap without evicting unacknowledged steps', () => {
  for (let i = 0; i < 30; i++) expect(savePendingStep('h1', 'Step', { ...args, actionId: `a${i}` })).not.toBeNull()
  expect(savePendingStep('h1', 'Extra', args)).toBeNull()
  expect(pendingSteps('h1', 's1')).toHaveLength(30)
  window.localStorage.setItem = () => { throw new Error('quota') }
  expect(savePendingStep('h1', 'Step', { ...args, receiptId: pendingSteps('h1', 's1')[0]!.args.receiptId })).toBeNull()
})

test('sign-out/access-loss purge clears pending taps and malformed storage never produces a tap', () => {
  savePendingStep('h1', 'Press Start', args)
  purgePrivateState()
  expect(pendingSteps('h1', 's1')).toEqual([])
  data.set('washcloset:private:pending-steps', '[{"args":{"receiptId":"no"}}]')
  expect(pendingSteps('h1', 's1')).toEqual([])
})
