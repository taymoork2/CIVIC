import { expect, test } from 'vitest'
import { api } from './_generated/api'
import { newBackend, signedIn, intakeHousehold, joinHousehold } from './harness.testing'
import { removePrincipalData } from './identity'
import { keyOf } from './harness.testing'

test('outfit wear commits once, preserves a lost-response retry after clear, and rejects stale or unavailable outfits atomically', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'atomic-outfit')
  const { householdId } = await intakeHousehold(owner)
  const partner = await joinHousehold(t, owner, householdId, 'atomic-partner', 'Sam')
  const tees = await owner.mutation(api.inventory.createTextiles, { householdId, name: 'White tee', quantity: 3, status: 'clean' })
  const pants = await owner.mutation(api.inventory.createTextiles, { householdId, name: 'Jeans', quantity: 1, status: 'clean' })
  const args = { householdId, wearerId: null, date: new Date().toISOString().slice(0, 10) }
  const save = () => owner.mutation(api.outfits.save, { ...args, items: [{ textileId: tees[0]!, quantity: 2 }, { textileId: pants[0]!, quantity: 1 }] })
  await save()
  const pick = (await owner.query(api.outfits.today, args))[0]!
  const request = { ...args, planId: pick.planId, signature: pick.signature, timeZone: 'UTC' }
  await t.run(ctx => ctx.db.patch(pants[0]!, { status: 'dirty' }))
  await expect(owner.mutation(api.outfits.wear, request)).rejects.toThrow('no longer ready')
  expect(await t.run(ctx => ctx.db.query('history').collect())).toEqual([])
  expect(await t.run(ctx => ctx.db.query('intakeSaves').collect())).toEqual([])
  await t.run(ctx => ctx.db.patch(pants[0]!, { status: 'clean' }))
  await t.run(ctx => ctx.db.patch(pants[0]!, { private: true }))
  expect((await partner.query(api.outfits.today, args))[0]).toMatchObject({ signature: '', wearRecorded: false, items: [{ name: 'White tee' }] })
  await expect(partner.mutation(api.outfits.wear, request)).rejects.toThrow('Forbidden')
  await expect(partner.mutation(api.outfits.wear, { ...request, signature: 'a'.repeat(64) })).rejects.toThrow('Forbidden')
  expect(await t.run(ctx => ctx.db.query('history').collect())).toEqual([])
  await t.run(ctx => ctx.db.patch(pants[0]!, { private: false }))
  await expect(owner.mutation(api.outfits.wear, { ...request, timeZone: 'Invalid/Zone' })).rejects.toThrow('time zone')
  await expect(owner.mutation(api.outfits.wear, { ...request, date: '2026-01-01' })).rejects.toThrow('another day')
  const stranger = signedIn(t, 'outfit-stranger')
  await expect(stranger.mutation(api.outfits.wear, request)).rejects.toThrow('Forbidden')
  await owner.mutation(api.outfits.save, { ...args, items: [{ textileId: tees[0]!, quantity: 1 }] })
  await expect(owner.mutation(api.outfits.wear, request)).rejects.toThrow('changed')
  await save()
  await owner.mutation(api.outfits.wear, request)
  await owner.mutation(api.outfits.wear, request)
  await partner.mutation(api.outfits.wear, request)
  expect((await owner.query(api.outfits.today, args))[0]!.wearRecorded).toBe(true)
  expect((await t.run(ctx => ctx.db.query('history').collect())).filter(row => row.event === 'worn')).toHaveLength(3)
  expect((await t.run(ctx => ctx.db.query('textiles').collect())).reduce((n, piece) => n + (piece.wearsSinceClean ?? 0), 0)).toBe(3)
  await owner.mutation(api.outfits.save, { ...args, items: [] })
  await t.run(async ctx => { for (const id of [...tees, ...pants]) await ctx.db.patch(id, { lastWornAt: undefined, wearsSinceClean: 0 }) })
  // The first response was lost, the plan was cleared, and washing reset the counters.
  await owner.mutation(api.outfits.wear, request)
  expect((await t.run(ctx => ctx.db.query('history').collect())).filter(row => row.event === 'worn')).toHaveLength(3)
  expect((await t.run(ctx => ctx.db.query('textiles').collect())).reduce((n, piece) => n + (piece.wearsSinceClean ?? 0), 0)).toBe(0)
  const principalKey = await keyOf(owner)
  await t.run(ctx => removePrincipalData(ctx, principalKey))
  expect((await t.run(ctx => ctx.db.query('intakeSaves').collect())).every(row => row.principalKey !== principalKey)).toBe(true)
})

test('all 400 pieces in the largest saved outfit wear together without 200-piece batches', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'large-outfit')
  const { householdId } = await intakeHousehold(owner)
  const choices = []
  for (let i = 0; i < 20; i++) {
    const ids = await owner.mutation(api.inventory.createTextiles, { householdId, name: `Style ${i}`, quantity: 20, status: 'clean' })
    choices.push({ textileId: ids[0]!, quantity: 20 })
  }
  const args = { householdId, wearerId: null, date: new Date().toISOString().slice(0, 10) }
  await owner.mutation(api.outfits.save, { ...args, items: choices })
  const pick = (await owner.query(api.outfits.today, args))[0]!
  const request = { ...args, planId: pick.planId, signature: pick.signature, timeZone: 'UTC' }
  await owner.mutation(api.outfits.wear, request)
  await owner.mutation(api.outfits.wear, request)
  expect((await t.run(ctx => ctx.db.query('history').collect())).filter(row => row.event === 'worn')).toHaveLength(400)
  expect((await t.run(ctx => ctx.db.query('textiles').collect())).filter(row => row.wearsSinceClean === 1)).toHaveLength(400)
})

test('daily outfits save matching quantities with attribution, expire by date, and never record wear', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'outfit-owner')
  const { householdId } = await intakeHousehold(owner)
  const member = await joinHousehold(t, owner, householdId, 'outfit-member', 'Sam')
  const ids = await owner.mutation(api.inventory.createTextiles, { householdId, name: 'Undershirt', color: 'White', kind: 't_shirt', quantity: 5, status: 'clean' })
  const args = { householdId, wearerId: null, date: '2026-09-30' }
  await owner.mutation(api.outfits.save, { ...args, items: [{ textileId: ids[0]!, quantity: 2 }] })
  expect((await owner.query(api.outfits.today, args))[0]).toMatchObject({ isYou: true, items: [{ name: 'Undershirt', quantity: 2 }] })
  expect((await member.query(api.outfits.today, args))[0]).toMatchObject({ isYou: false, authorName: 'Pat' })
  expect(await owner.query(api.outfits.today, { ...args, date: '2026-10-01' })).toEqual([])
  expect(await t.run((ctx) => ctx.db.query('history').collect())).toEqual([])
  expect((await t.run((ctx) => ctx.db.get(ids[0]!)))?.status).toBe('clean')
  // An indistinguishable representative can leave the closet: the choice remains a style quantity.
  await t.run(async (ctx) => { await ctx.db.delete(ids[0]!) })
  await owner.mutation(api.outfits.save, { ...args, items: [{ textileId: ids[1]!, quantity: 2 }] })
  expect((await t.run((ctx) => ctx.db.query('dailyOutfits').collect())).length).toBe(1)
  await expect(owner.mutation(api.outfits.save, { ...args, items: [{ textileId: ids[1]!, quantity: 5 }] })).rejects.toThrow('no longer ready')
  await expect(owner.mutation(api.outfits.save, { ...args, items: [{ textileId: ids[1]!, quantity: 1.5 }] })).rejects.toThrow('1–20')
  await expect(owner.mutation(api.outfits.save, { ...args, items: [{ textileId: ids[1]!, quantity: 1 }, { textileId: ids[2]!, quantity: 1 }] })).rejects.toThrow('once')
  await expect(owner.query(api.outfits.today, { ...args, date: '2026-02-30' })).rejects.toThrow('calendar date')
  const key = await keyOf(owner)
  await t.run((ctx) => removePrincipalData(ctx, key))
  expect(await t.run((ctx) => ctx.db.query('dailyOutfits').collect())).toEqual([])
})

test('outfits reject foreign, guest, trashed, dirty and busy clothes; removing a member clears their plan', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'owner')
  const { householdId, shirt } = await intakeHousehold(owner)
  const member = await joinHousehold(t, owner, householdId, 'member', 'Sam')
  const stranger = signedIn(t, 'stranger')
  const other = await intakeHousehold(stranger)
  const [ready] = await owner.mutation(api.inventory.createTextiles, { householdId, name: 'Tee', quantity: 1, status: 'clean' })
  const args = { householdId, wearerId: null, date: '2026-09-30' }
  const choose = (textileId: typeof shirt) => owner.mutation(api.outfits.save, { ...args, items: [{ textileId, quantity: 1 }] })
  await expect(stranger.query(api.outfits.today, args)).rejects.toThrow('Forbidden')
  await expect(choose(other.shirt)).rejects.toThrow('this household')
  await expect(choose(shirt)).rejects.toThrow('no longer ready')
  await t.run((ctx) => ctx.db.patch(ready!, { guest: true }))
  await expect(choose(ready!)).rejects.toThrow('no longer in your closet')
  await t.run((ctx) => ctx.db.patch(ready!, { guest: false, trashedAt: Date.now() }))
  await expect(choose(ready!)).rejects.toThrow('no longer in your closet')
  await t.run(async (ctx) => {
    await ctx.db.patch(ready!, { trashedAt: undefined })
    const planId = await ctx.db.insert('plans', { householdId, createdBy: 'test', plannerVersion: 'test', inputHash: 'test', inputSnapshot: {}, result: {}, status: 'used', createdAt: Date.now() })
    await ctx.db.insert('sessions', { householdId, planId, textileIds: [ready!], startedBy: 'test', idempotencyKey: 'outfit', status: 'running', revision: 0 })
  })
  await expect(choose(ready!)).rejects.toThrow('no longer ready')
  await t.run(async (ctx) => { for (const session of await ctx.db.query('sessions').collect()) await ctx.db.delete(session._id) })
  await member.mutation(api.outfits.save, { ...args, items: [{ textileId: ready!, quantity: 1 }] })
  const membership = (await owner.query(api.households.members, { householdId })).find((person) => person.displayName === 'Sam')!
  await owner.mutation(api.households.removeMember, { membershipId: membership.membershipId })
  expect(await t.run((ctx) => ctx.db.query('dailyOutfits').collect())).toEqual([])
})

test('personal and partner picks coexist for the same wearer and authors can only change their own pick', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'personal')
  const { householdId } = await intakeHousehold(owner)
  const partner = await joinHousehold(t, owner, householdId, 'partner', 'Sam')
  const wearerId = await owner.mutation(api.inventory.createWearer, { householdId, name: 'Pat', kind: 'adult', self: true })
  const otherWearer = await owner.mutation(api.inventory.createWearer, { householdId, name: 'Child', kind: 'child' })
  const [tee] = await owner.mutation(api.inventory.createTextiles, { householdId, wearerId, name: 'White tee', quantity: 2, status: 'clean' })
  const [pants] = await owner.mutation(api.inventory.createTextiles, { householdId, wearerId, name: 'Jeans', quantity: 1, status: 'clean' })
  const args = { householdId, wearerId, date: '2026-09-30' }
  await owner.mutation(api.outfits.save, { ...args, items: [{ textileId: tee!, quantity: 1 }] })
  await partner.mutation(api.outfits.save, { ...args, items: [{ textileId: pants!, quantity: 1 }] })
  expect(await owner.query(api.outfits.today, args)).toEqual(expect.arrayContaining([
    expect.objectContaining({ isYou: true, authorName: 'Pat', items: [expect.objectContaining({ name: 'White tee' })] }),
    expect.objectContaining({ isYou: false, authorName: 'Sam', items: [expect.objectContaining({ name: 'Jeans' })] }),
  ]))
  await expect(partner.mutation(api.outfits.save, { ...args, wearerId: otherWearer, items: [{ textileId: tee!, quantity: 1 }] })).rejects.toThrow('person’s closet')
  await partner.mutation(api.outfits.save, { ...args, items: [] })
  expect((await owner.query(api.outfits.today, args)).map((pick) => pick.authorName)).toEqual(['Pat'])
  await owner.mutation(api.inventory.updateWearer, { wearerId, principalKey: null })
  await owner.mutation(api.inventory.removeWearer, { wearerId })
  expect(await t.run((ctx) => ctx.db.query('dailyOutfits').collect())).toEqual([])
})
