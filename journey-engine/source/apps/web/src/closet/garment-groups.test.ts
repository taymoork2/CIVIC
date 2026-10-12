import { expect, test } from 'vitest'

import { garmentKey, garmentStatuses, groupGarments, matchingGroups, type GroupableCare, type GroupableGarment } from '@/closet/garment-groups'
import { statusWords } from '@/copy'
import type { Textile } from '@/household/inventory-types'

// The wardrobe's own rows group without mapping.
const _inventoryRowsGroup: GroupableGarment = {} as Textile

const care = (overrides: Partial<GroupableCare> = {}): GroupableCare => ({
  material: 'Cotton',
  washMethod: 'machine',
  cycle: 'normal',
  maxTemperatureC: 30,
  restrictions: ['Do not bleach'],
  dryMethod: 'tumble_dry',
  dryHeat: 'low',
  status: 'confirmed',
  ...overrides,
})

let next = 0
const garment = (overrides: Partial<GroupableGarment> = {}): GroupableGarment => ({
  textileId: `t${(next += 1)}`,
  name: 'Raglan tee',
  color: 'White',
  colorGroup: 'white',
  status: 'dirty',
  inLoad: null,
  washCount: 0,
  care: care(),
  ...overrides,
})

test('identical garments share a key however their name and colour were typed', () => {
  expect(garmentKey({ name: ' Raglan  Tee ', color: 'White ' })).toBe(garmentKey({ name: 'raglan tee', color: 'white' }))
  expect(garmentKey({ name: 'Raglan tee', color: 'White' })).not.toBe(garmentKey({ name: 'Raglan tee', color: 'Grey' }))
  expect(garmentKey({ name: 'Raglan tee', color: null })).toBe(garmentKey({ name: 'Raglan tee' }))
  expect(garmentKey({ name: 'Underwear', color: null, colorGroup: 'black' })).not.toBe(garmentKey({ name: 'Underwear', color: null, colorGroup: 'white' }))
  expect(garmentKey({ name: 'Raglan tee', color: 'White', guest: true })).not.toBe(garmentKey({ name: 'Raglan tee', color: 'White' }))
})

test('groups keep first-seen order and different colours apart', () => {
  const groups = groupGarments([
    garment({ name: 'Raglan tee', color: 'White ' }),
    garment({ name: 'Hoodie', color: 'Grey' }),
    garment({ name: 'raglan tee', color: 'white' }),
    garment({ name: 'Raglan tee', color: 'Black' }),
  ])
  expect(groups.map((group) => [group.name, group.color, group.members.length])).toEqual([
    ['Raglan tee', 'White ', 2],
    ['Hoodie', 'Grey', 1],
    ['Raglan tee', 'Black', 1],
  ])
})

test('a group counts dirty, in-load and waiting garments and its wash-count range', () => {
  const [group] = groupGarments([
    garment({ washCount: 2 }),
    garment({ washCount: 5, inLoad: 's1' }),
    garment({ washCount: 3, status: 'clean' }),
    garment({ washCount: 4 }),
  ])
  expect(group).toMatchObject({ dirty: 3, inLoad: 1, waiting: 2, washCounts: { min: 2, max: 5 }, careSame: true, careConfirmed: true, needLabel: 0 })
})

test('care that would wash or dry differently splits the group, evidence alone does not', () => {
  expect(groupGarments([garment(), garment({ care: care({ maxTemperatureC: 40 }) })])[0]!.careSame).toBe(false)
  expect(groupGarments([garment(), garment({ care: care({ dryHeat: 'medium' }) })])[0]!.careSame).toBe(false)
  expect(groupGarments([garment(), garment({ care: null })])[0]).toMatchObject({ careSame: false, careConfirmed: false, needLabel: 1 })
  expect(groupGarments([garment(), garment({ care: care({ status: 'needs_confirmation' }) })])[0]).toMatchObject({ careSame: true, careConfirmed: false, needLabel: 1 })
  expect(groupGarments([garment(), garment({ care: care({ restrictions: [' do not bleach'] }) })])[0]!.careSame).toBe(true)
})

test('an older "Do not tumble dry" restriction reads the same as the drying method it implies', () => {
  const recorded = care({ restrictions: [], dryMethod: 'do_not_tumble_dry', dryHeat: null })
  const legacy = care({ restrictions: ['Do not tumble dry'], dryMethod: 'do_not_tumble_dry', dryHeat: null })
  expect(groupGarments([garment({ care: recorded }), garment({ care: legacy })])[0]!.careSame).toBe(true)
  // A heat only matters when the garment tumbles.
  expect(groupGarments([garment({ care: care({ dryMethod: 'line_dry', dryHeat: 'low' }) }), garment({ care: care({ dryMethod: 'line_dry', dryHeat: null }) })])[0]!.careSame).toBe(true)
})

test('a group counts every stored status and its most wears since washed', () => {
  expect([...garmentStatuses].sort()).toEqual(Object.keys(statusWords).sort())
  const [group] = groupGarments([
    garment({ status: 'clean', wearsSinceClean: 2 }),
    garment({ status: 'clean' }),
    garment({ status: 'hanging' }),
    garment({ status: 'needs_dry_clean' }),
    garment({ status: 'at_cleaner' }),
    garment({ status: 'needs_refresh', wearsSinceClean: 1 }),
    garment({ status: 'dirty' }),
  ])
  expect(group!.statuses).toEqual({ clean: 2, dirty: 1, hanging: 1, needs_dry_clean: 1, at_cleaner: 1, needs_refresh: 1 })
  expect(group!.wornMost).toBe(2)
  expect(groupGarments([garment()])[0]!.wornMost).toBe(0)
})

test('an older Grey record matches a Gray one, in the name and the color', () => {
  expect(garmentKey({ name: 'Grey T-shirt', color: 'Grey' })).toBe(garmentKey({ name: 'Gray T-shirt', color: 'Gray' }))
  expect(garmentKey({ name: 'Greyhound tee', color: 'Gray' })).not.toBe(garmentKey({ name: 'Grayhound tee', color: 'Gray' }))
})

test('matching pieces become one group with every member, split only by what differs on the screen', () => {
  const pieces = [
    { id: 'a', name: 'White T-shirt', color: 'White', washer: 'Front-loader' },
    { id: 'b', name: 'white t-shirt', color: 'white', washer: 'Front-loader' },
    { id: 'c', name: 'White T-shirt', color: 'White', washer: 'Top-loader' },
    { id: 'd', name: 'White T-shirt', color: 'White', guest: true, washer: 'Front-loader' },
  ]
  const groups = matchingGroups(pieces, (piece) => piece, (piece) => piece.washer)
  expect(groups.map((group) => group.members.map((piece) => piece.id))).toEqual([['a', 'b'], ['c'], ['d']])
  expect(groups[0]!.first.id).toBe('a')
  expect(matchingGroups(pieces.slice(0, 3), (piece) => piece).map((group) => group.members.length)).toEqual([3])
})
