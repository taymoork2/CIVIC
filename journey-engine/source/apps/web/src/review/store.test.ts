import { expect, test } from 'vitest'
import { applyReviewMutation, reviewClient, seedReview, type ReviewConfig } from './store'

const config = (condition: ReviewConfig['condition'] = 'normal'): ReviewConfig => ({ scenario: 'intake.pack.final', persona: 'single', role: 'owner', condition, theme: 'light', textScale: 1, width: 393 })
const memory = () => {
  const rows = new Map<string, string>()
  return { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key, value) }, removeItem: (key: string) => { rows.delete(key) } } as Storage
}
test('a simulated failed save retains data and can retry the same edit; persisted records survive a fresh client', async () => {
  const storage = memory()
  const client = reviewClient(config('save-error'), storage)
  const piece = client.getData().textiles[0]!
  await expect(client.mutate('inventory:updateTextile', { textileId: piece.textileId, name: 'Changed synthetic tee' })).rejects.toThrow('Review save failure')
  expect(client.getData().textiles[0]!.name).toBe(piece.name)
  client.retryWrites()
  await client.mutate('inventory:updateTextile', { textileId: piece.textileId, name: 'Changed synthetic tee' })
  expect(reviewClient(config('save-error'), storage).getData().textiles[0]!.name).toBe('Changed synthetic tee')
})
test('blocked storage never acknowledges an edit or publishes a partial in-memory save', async () => {
  const storage = memory()
  storage.setItem = () => { throw new Error('Storage full') }
  const client = reviewClient(config(), storage)
  const piece = client.getData().textiles[0]!
  await expect(client.mutate('inventory:updateTextile', { textileId: piece.textileId, name: 'Lost edit' })).rejects.toThrow('Storage full')
  expect(client.getData().textiles[0]!.name).toBe(piece.name)
})
test('basic intake does not inherit specimen capacity or product directions', () => {
  const data = seedReview(config())
  expect(() => applyReviewMutation(data, 'inventory:createMachines', { count: -1 })).toThrow('quantity')
  expect(() => applyReviewMutation(data, 'inventory:createTextiles', { quantity: 6, colors: [{ quantity: -2 }, { quantity: 8 }] })).toThrow('quantity')
  const [machineId] = applyReviewMutation(data, 'inventory:createMachines', { name: 'Basic washer', count: 1, applianceType: 'front_load_washer', location: 'home' }) as string[]
  expect(data.machines.find((machine) => machine.machineId === machineId)!.capacityUnits).toBeNull()
  const supplyId = applyReviewMutation(data, 'inventory:createSupply', { name: 'Basic product', kind: 'chemical', use: 'detergent' })
  const supply = data.supplies.find((supply) => supply.supplyId === supplyId)!
  expect(supply.rules).toEqual([])
  expect(supply.safety).toBeUndefined()
  expect(data.saved.appliance).toEqual([machineId])
  expect(data.saved.product).toEqual([supplyId])
})
test('an unreadable persisted dataset is preserved and cannot acknowledge a write', async () => {
  const storage = memory()
  storage.setItem('laundered-review:v2:single:owner:normal', '{broken')
  const client = reviewClient(config(), storage)
  expect(client.loadError).toContain('could not be loaded')
  await expect(client.mutate('inventory:createWearer', { name: 'Someone' })).rejects.toThrow('could not be loaded')
  expect(storage.getItem('laundered-review:v2:single:owner:normal')).toBe('{broken')
  client.restart()
  expect(reviewClient(config(), storage).loadError).toBeUndefined()
})
test('review refuses real household ids, unimplemented mutations and household writes by the simulated member', async () => {
  const client = reviewClient(config(), memory())
  await expect(client.mutate('inventory:createWearer', { householdId: 'real-household', name: 'Someone' })).rejects.toThrow('non-synthetic')
  await expect(client.mutate('unknown:erase', {})).rejects.toThrow('not simulated')
  const member = reviewClient({ ...config(), role: 'member' }, memory())
  await expect(member.mutate('inventory:updateSupply', { supplyId: member.getData().supplies[0]!.supplyId, name: 'Changed' })).rejects.toThrow('synthetic member')
  expect(member.getData().textiles.every((piece) => !piece.canChangePrivacy)).toBe(true)
})
