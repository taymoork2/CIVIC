import { expect, test } from 'vitest'
import { laundryPace, readyForLaundry } from './laundry-workspace'
import type { Textile } from '@/household/inventory-types'

test('closet choices are actual ready pieces, excluding guests and active care', () => {
  const piece = { textileId: 'ready', status: 'clean', guest: false, inLoad: null }
  const rows = [piece, { ...piece, textileId: 'guest', guest: true }, { ...piece, textileId: 'washing', inLoad: 'session' }, { ...piece, textileId: 'dirty', status: 'dirty' }] as unknown as Textile[]
  expect(readyForLaundry(rows).map(item => item.textileId)).toEqual(['ready'])
})

test('pace describes a preference with an optional local-time aim, never a promised finish', () => {
  const now = new Date(2026, 9, 10, 9).getTime()
  expect(laundryPace(undefined, now)).toBe('All today')
  expect(laundryPace({ pace: 'spread', loadsPerDay: 1 }, now)).toBe('1 load a day')
  expect(laundryPace({ pace: 'all', finishBy: '18:30' }, now)).toContain('aim to finish by')
})
