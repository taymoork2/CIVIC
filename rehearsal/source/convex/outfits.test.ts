import { expect, test } from 'vitest'
import { api } from './_generated/api'
import { newBackend, signedIn, intakeHousehold, joinHousehold } from './harness.testing'
import { removePrincipalData } from './identity'
import { keyOf } from './harness.testing'

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
