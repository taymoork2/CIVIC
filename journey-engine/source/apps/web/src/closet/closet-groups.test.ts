import { garmentKinds } from '@washcloset/planner'
import { expect, test } from 'vitest'

import { closetRails, closetState, effectiveOccasions, groupNotWornSince, kindHeading, kindHeadings, notWornSince, type ClosetGarment } from '@/closet/closet-groups'
import type { Textile } from '@/household/inventory-types'

// The inventory's own rows hang on the rails without mapping.
const _inventoryRowsHang: ClosetGarment = {} as Textile

const day = 86_400_000
const now = new Date(2026, 8, 27, 15).getTime()

let next = 0
const garment = (overrides: Partial<ClosetGarment> = {}): ClosetGarment => ({
  textileId: `t${(next += 1)}`,
  name: 'Navy tee',
  color: 'Navy',
  colorGroup: 'dark',
  kind: 't_shirt',
  wearerId: 'sam',
  occasions: null,
  status: 'clean',
  inLoad: null,
  wearsSinceClean: 0,
  guest: false,
  lastWornAt: now - day,
  lastCleanedAt: null,
  createdAt: now - 200 * day,
  ...overrides,
})

test('every kind sits under exactly one heading, in the Closet order', () => {
  expect(kindHeadings.map((entry) => entry.heading)).toEqual(['Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Sleepwear', 'Underwear & socks', 'Sport', 'Baby', 'Towels & bedding', 'Other'])
  for (const kind of garmentKinds) expect(kindHeadings.filter((entry) => (entry.kinds as readonly string[]).includes(kind))).toHaveLength(1)
  expect(kindHeading('suit')).toBe('Outerwear')
  expect(kindHeading('socks')).toBe('Underwear & socks')
  expect(kindHeading(null)).toBe('Other')
  expect(kindHeading('cape')).toBe('Other')
})

test('legacy occasions reflect explicit tags and are never inferred from type', () => {
  expect(effectiveOccasions({ occasions: ['dressy'], kind: 'suit' })).toEqual(['dressy'])
  expect(effectiveOccasions({ occasions: null, kind: 'suit' })).toEqual([])
  expect(effectiveOccasions({ occasions: null, kind: 'pajamas' })).toEqual([])
  expect(effectiveOccasions({ occasions: ['work'], kind: 'suit', tags: [] })).toEqual([])
  expect(effectiveOccasions({ occasions: [], kind: 'suit' })).toEqual([])
  expect(effectiveOccasions({ occasions: null, kind: 't_shirt' })).toEqual([])
  expect(effectiveOccasions({ occasions: null, kind: null })).toEqual([])
})

test('type and multiple tags filter independently within the selected wearer', () => {
  const shirt = garment({ tags: ['Work', 'Trip to Kyoto'] })
  const pants = garment({ kind: 'pants', tags: ['Work'] })
  const otherPerson = garment({ wearerId: 'alex', tags: ['Work', 'Trip to Kyoto'] })
  const rows = [shirt, pants, otherPerson]
  const ids = (filter: Parameters<typeof closetRails>[2]) => closetRails(rows, ['sam', 'alex'], filter, now, 90).flatMap((rail) => rail.sections.flatMap((section) => section.tiles.flatMap((tile) => tile.members.map((member) => member.textileId))))
  expect(ids({ wearerId: 'sam', kind: 't_shirt' })).toEqual([shirt.textileId])
  expect(ids({ wearerId: 'sam', tags: ['work', 'Trip to Kyoto'] })).toEqual([shirt.textileId])
  expect(ids({ wearerId: 'sam', kind: 'pants', tags: ['Trip to Kyoto'] })).toEqual([])
})

test('a garment in a running load is in the wash whatever its stored state', () => {
  expect(closetState({ status: 'clean', inLoad: null })).toBe('ready')
  expect(closetState({ status: 'dirty', inLoad: 's1' })).toBe('in_wash')
  expect(closetState({ status: 'hanging', inLoad: null })).toBe('hanging')
})

test('not worn since counts from the last wear, then the last clean, then when it was added', () => {
  const days = 90
  expect(notWornSince({ lastWornAt: now - 90 * day, lastCleanedAt: now, createdAt: 0 }, now, days)).toBe(now - 90 * day)
  expect(notWornSince({ lastWornAt: now - 89 * day, lastCleanedAt: null, createdAt: 0 }, now, days)).toBeNull()
  expect(notWornSince({ lastWornAt: null, lastCleanedAt: now - 100 * day, createdAt: 0 }, now, days)).toBe(now - 100 * day)
  expect(notWornSince({ lastWornAt: null, lastCleanedAt: null, createdAt: now - 120 * day }, now, days)).toBe(now - 120 * day)
  // A newly added garment never worn or washed is not marked.
  expect(notWornSince({ lastWornAt: null, lastCleanedAt: null, createdAt: now - 3 * day }, now, days)).toBeNull()
  // The household's own number of days.
  expect(notWornSince({ lastWornAt: now - 40 * day, lastCleanedAt: null, createdAt: 0 }, now, 30)).toBe(now - 40 * day)
})

test('a tile is marked only when every member qualifies, from the latest date', () => {
  const old = { lastWornAt: now - 200 * day, lastCleanedAt: null, createdAt: 0 }
  const older = { lastWornAt: now - 300 * day, lastCleanedAt: null, createdAt: 0 }
  const recent = { lastWornAt: now - 2 * day, lastCleanedAt: null, createdAt: 0 }
  expect(groupNotWornSince([old, older], now, 90)).toBe(now - 200 * day)
  expect(groupNotWornSince([old, recent], now, 90)).toBeNull()
  expect(groupNotWornSince([], now, 90)).toBeNull()
})

test('rails: one per person then shared, identical garments in one state share a tile, under kind headings', () => {
  const rails = closetRails([
    garment({ name: 'Jeans', kind: 'pants' }),
    garment(),
    garment({ name: 'navy tee ', color: 'navy', wearsSinceClean: 2 }),
    garment({ status: 'dirty' }),
    garment({ status: 'dirty', inLoad: 's1' }),
    garment({ name: 'Bath towel', kind: 'towel', wearerId: null, colorGroup: 'white' }),
    garment({ name: 'Old wearer tee', wearerId: 'gone' }),
    garment({ name: 'Guest shirt', wearerId: null, guest: true }),
    garment({ name: 'Pyjamas', kind: 'pajamas', wearerId: 'alex' }),
  ], ['alex', 'sam'], {}, now, 90)
  expect(rails.map((rail) => [rail.wearerId, rail.ready, rail.total])).toEqual([['alex', 1, 1], ['sam', 3, 5], [null, 2, 2]])
  const sam = rails[1]!
  expect(sam.sections.map((section) => section.heading)).toEqual(['Tops', 'Bottoms'])
  expect(sam.sections[0]!.tiles.map((tile) => [tile.name, tile.state, tile.members.length, tile.wornMost])).toEqual([
    ['Navy tee', 'ready', 2, 2],
    ['Navy tee', 'dirty', 1, 0],
    ['Navy tee', 'in_wash', 1, 0],
  ])
  // Guests never hang; a gone wearer's clothes hang on the shared rail.
  expect(rails[2]!.sections.flatMap((section) => section.tiles.map((tile) => tile.name))).toEqual(['Old wearer tee', 'Bath towel'])
})

test('rails follow the wearer and occasion filters and mark only ready tiles as not worn', () => {
  const garments = [
    garment({ name: 'Blazer', kind: 'suit', tags: ['Work'], lastWornAt: now - 120 * day }),
    garment({ name: 'Blazer', kind: 'suit', tags: ['Work'], status: 'at_cleaner', lastWornAt: now - 120 * day }),
    garment({ name: 'Tee', occasions: ['work'] }),
    garment({ name: 'Gym top', kind: 'workout' }),
    garment({ name: 'Work shirt', kind: 'shirt', wearerId: 'alex', occasions: ['work'] }),
  ]
  const work = closetRails(garments, ['alex', 'sam'], { occasion: 'work', wearerId: 'sam' }, now, 90)
  expect(work).toHaveLength(1)
  const tiles = work[0]!.sections.flatMap((section) => section.tiles)
  expect(tiles.map((tile) => [tile.name, tile.state, tile.notWornSince])).toEqual([
    ['Tee', 'ready', null],
    ['Blazer', 'ready', now - 120 * day],
    ['Blazer', 'at_cleaner', null],
  ])
})
