import { expect, test } from 'vitest'
import { garmentKey } from '@washcloset/planner'
import { api } from './_generated/api'
import { intakeHousehold, joinHousehold, keyOf, newBackend, signedIn } from './harness.testing'

test('pages retain whole groups, search beyond the loaded page, and keep owner/tag counts global', async () => {
  const t = newBackend(), as = signedIn(t, 'browse-owner')
  const home = await intakeHousehold(as)
  await as.mutation(api.inventory.trashTextiles, { textileIds: [home.shirt, home.towel, home.sweater] })
  const wearer = await as.mutation(api.inventory.createWearer, { householdId: home.householdId, name: 'Ellis', kind: 'adult' })
  for (let i = 0; i < 87; i++) await as.mutation(api.inventory.createTextiles, {
    householdId: home.householdId, name: `Item ${Math.max(0, i - 2)}`, quantity: i < 3 ? 20 : 1,
    wearerId: wearer, kind: 't_shirt', colorGroup: 'dark', material: i === 86 ? 'Supima cotton' : 'cotton',
    status: 'clean', tags: i === 86 ? ['Holiday'] : [],
  })
  const args = { householdId: home.householdId, search: '', section: 'all' as const, tags: [] }
  const first = await as.query(api.inventoryBrowse.page, { ...args, paginationOpts: { cursor: null, numItems: 40 } })
  expect(new Set(first.page.map(garmentKey)).size).toBe(40)
  expect(first.page.filter(piece => piece.name === 'Item 0')).toHaveLength(60)
  expect(first.isDone).toBe(false)
  const second = await as.query(api.inventoryBrowse.page, { ...args, paginationOpts: { cursor: first.continueCursor, numItems: 40 } })
  const last = await as.query(api.inventoryBrowse.page, { ...args, paginationOpts: { cursor: second.continueCursor, numItems: 40 } })
  expect(last.isDone).toBe(true)
  const pieces = [...first.page, ...second.page, ...last.page]
  expect(new Set(pieces.map(piece => piece.textileId)).size).toBe(144)
  expect(pieces).toHaveLength(144)
  const summary = await as.query(api.inventoryBrowse.summary, args)
  expect(summary).toMatchObject({ total: 144, matched: 144, groups: 85, tags: ['Holiday'], counts: { ready: 144 } })
  expect(summary.people.find(person => person.wearerId === wearer)?.count).toBe(144)
  for (const search of ['Supima', 'Holiday', 'Item 84']) {
    const result = await as.query(api.inventoryBrowse.page, { ...args, search, paginationOpts: { cursor: null, numItems: 40 } })
    expect(result.page.map(piece => piece.name)).toEqual(['Item 84'])
  }
  expect((await as.query(api.inventoryBrowse.summary, { ...args, search: 'Ellis' })).matched).toBe(144)
  expect((await as.query(api.inventoryBrowse.page, { ...args, tags: ['Holiday'], paginationOpts: { cursor: null, numItems: 40 } })).page).toHaveLength(1)
  const deep = await as.query(api.inventoryBrowse.group, { householdId: home.householdId, textileId: last.page.at(-1)!.textileId })
  expect(deep.map(piece => piece.name)).toEqual(['Item 84'])
  const selected = [first.page[0]!.textileId, second.page[0]!.textileId]
  await as.mutation(api.inventory.bulkUpdateTextiles, { textileIds: selected, addTags: ['Chosen'] })
  expect((await as.query(api.inventoryBrowse.summary, { ...args, tags: ['Chosen'] })).matched).toBe(2)
  // Re-query an established range after a deletion and an insertion; offsets cannot shift the next page.
  await as.mutation(api.inventory.trashTextiles, { textileIds: [first.page[0]!.textileId] })
  await as.mutation(api.inventory.createTextiles, { householdId: home.householdId, name: 'New arrival', quantity: 1, material: 'cotton', colorGroup: 'light', status: 'clean' })
  const stable = await as.query(api.inventoryBrowse.page, { ...args, paginationOpts: { cursor: null, endCursor: first.continueCursor, numItems: 40 } })
  const remainder = await as.query(api.inventoryBrowse.page, { ...args, paginationOpts: { cursor: stable.continueCursor, numItems: 100 } })
  const tail = await as.query(api.inventoryBrowse.page, { ...args, paginationOpts: { cursor: remainder.continueCursor, numItems: 40 } })
  expect(new Set([...stable.page, ...remainder.page, ...tail.page].map(piece => piece.textileId)).size).toBe(144)
  expect((await as.query(api.inventory.list, { householdId: home.householdId, textileIds: [] })).textiles).toEqual([])
  expect((await as.query(api.inventory.list, { householdId: home.householdId, activeOnly: true })).textiles).toEqual([])
  expect((await as.query(api.closet.today, { householdId: home.householdId, summaryOnly: true })).ready).toEqual([])
  const preview = await as.query(api.inventoryBrowse.readyPreview, { householdId: home.householdId })
  expect(preview).toHaveLength(6)
  expect(preview[0]?.count).toBe(59)
  expect(preview.every(group => group.textile.status === 'clean' && group.textile.inLoad === null)).toBe(true)
})

test('paged counts, search, deep links and explicit reads respect private and foreign records', async () => {
  const t = newBackend(), owner = signedIn(t, 'browse-private-owner')
  const home = await intakeHousehold(owner)
  const member = await joinHousehold(t, owner, home.householdId, 'browse-member', 'Sam')
  const wearerId = await member.mutation(api.inventory.createWearer, { householdId: home.householdId, name: 'Sam', kind: 'adult' })
  await member.mutation(api.inventory.updateWearer, { wearerId, principalKey: await keyOf(member) })
  await owner.mutation(api.inventory.updateTextile, { textileId: home.shirt, wearerId, name: 'Secret shirt', status: 'clean' })
  await member.mutation(api.inventory.setPrivacy, { textileIds: [home.shirt], private: true })
  const args = { householdId: home.householdId, search: 'Secret', section: 'all' as const, tags: [] }
  expect((await owner.query(api.inventoryBrowse.summary, args)).matched).toBe(0)
  expect((await owner.query(api.inventoryBrowse.page, { ...args, paginationOpts: { cursor: null, numItems: 40 } })).page).toEqual([])
  expect(await owner.query(api.inventoryBrowse.group, { householdId: home.householdId, textileId: home.shirt })).toEqual([])
  expect((await owner.query(api.inventoryBrowse.readyPreview, { householdId: home.householdId })).some(group => group.textile.textileId === home.shirt)).toBe(false)
  expect((await member.query(api.inventoryBrowse.summary, args)).matched).toBe(1)
  expect((await member.query(api.inventoryBrowse.readyPreview, { householdId: home.householdId })).some(group => group.textile.textileId === home.shirt)).toBe(true)
  const outsider = signedIn(t, 'browse-outsider')
  const other = await intakeHousehold(outsider)
  await expect(outsider.query(api.inventoryBrowse.summary, args)).rejects.toThrow('Forbidden')
  await expect(outsider.query(api.inventoryBrowse.readyPreview, { householdId: home.householdId })).rejects.toThrow('Forbidden')
  await expect(owner.query(api.inventory.list, { householdId: home.householdId, textileIds: [other.shirt] })).rejects.toThrow('Forbidden')
  expect(await owner.query(api.inventoryBrowse.group, { householdId: home.householdId, textileId: other.shirt })).toEqual([])
})
