import { expect, test } from 'vitest'

import { api } from './_generated/api'
import { authorize, authorizeKey, related, rules, visible, type Action, type Rule } from './access'
import { joinHousehold, keyOf, label, newBackend, signedIn } from './harness.testing'

/** Today's rules, written out so a change to the policy table has to change this list too. */
const today: Record<Exclude<Action, 'textile.privacy'>, Rule> = {
  'household.read': 'member', 'textile.read': 'member', 'session.read': 'member', 'plan.read': 'member',
  'supply.read': 'member', 'people.read': 'member', 'feedback.read': 'owner',
  'household.edit': 'member', 'membership.editOwn': 'member', 'place.edit': 'owner',
  'textile.add': 'member', 'textile.edit': 'member', 'textile.trash': 'member', 'photo.edit': 'member',
  'outfit.edit': 'member', 'session.run': 'member', 'plan.edit': 'member',
  'machine.add': 'member', 'machine.edit': 'member', 'supply.add': 'member', 'supply.edit': 'member',
  'people.add': 'member', 'people.edit': 'member', 'people.link': 'selfOrOwner', 'people.invite': 'owner',
  'people.remove': 'selfOrOwner', 'feedback.send': 'member', 'feedback.manage': 'owner', 'fixture.seed': 'member',
  'routine.set': 'self', 'routine.clear': 'self', 'reminder.dismiss': 'self',
}

/** The words a refusal of each self action keeps from before the access module. */
const selfRefusals: Partial<Record<Action, string>> = {
  'routine.set': 'Choose only your own pieces in this household',
  'routine.clear': 'Only the owner can remove this garment’s routine',
}

test('every action keeps today’s rule: members, owners only, self or an owner, or self', async () => {
  expect(rules).toEqual({ ...today, 'textile.privacy': 'closetOwner' })
  const t = newBackend()
  const owner = signedIn(t, 'policy-owner')
  const { householdId } = await owner.mutation(api.households.createHousehold, { name: 'Home' })
  const member = await joinHousehold(t, owner, householdId, 'policy-member', 'Sam')
  const outsider = signedIn(t, 'policy-outsider')
  await outsider.mutation(api.households.createHousehold, { name: 'Elsewhere' })
  const [ownerKey, memberKey] = [await keyOf(owner), await keyOf(member)]

  for (const action of Object.keys(today) as (keyof typeof today)[]) {
    const as = (caller: typeof owner, subjects?: string[]) => caller.run((ctx) => authorize(ctx, action, { householdId, ...(subjects === undefined ? {} : { subjects }) }))
    if (today[action] === 'self') {
      // Only the row's own person, owners included; anyone else's row, or no row, is refused.
      const refusal = selfRefusals[action] ?? 'Forbidden'
      await expect(as(member, [memberKey]), action).resolves.toMatchObject({ actor: { key: memberKey } })
      await expect(as(owner, [ownerKey]), action).resolves.toMatchObject({ actor: { key: ownerKey } })
      await expect(as(owner, [memberKey]), action).rejects.toThrow(refusal)
      await expect(as(member, [memberKey, ownerKey]), action).rejects.toThrow(refusal)
      await expect(as(member, []), action).rejects.toThrow(refusal)
      await expect(as(member), action).rejects.toThrow(refusal)
      await expect(as(outsider, [await keyOf(outsider)]), action).rejects.toThrow('Forbidden')
      continue
    }
    await expect(as(owner, [memberKey]), action).resolves.toMatchObject({ actor: { key: ownerKey }, membership: { role: 'owner' } })
    await expect(as(outsider, []), action).rejects.toThrow('Forbidden')
    if (today[action] === 'member') await expect(as(member), action).resolves.toMatchObject({ membership: { role: 'member' } })
    if (today[action] === 'owner') await expect(as(member, [memberKey]), action).rejects.toThrow('Forbidden')
    if (today[action] === 'selfOrOwner') {
      await expect(as(member, [memberKey]), action).resolves.toMatchObject({ actor: { key: memberKey } })
      await expect(as(member, [memberKey, ownerKey]), action).rejects.toThrow(action === 'people.link' ? 'Only that person or an owner can link them' : 'Forbidden')
      await expect(as(member), action).rejects.toThrow()
    }
  }

  const textileId = await owner.mutation(api.inventory.createTextile, { householdId, name: 'Tee', color: 'White', colorGroup: 'light' })
  await expect(member.run((ctx) => authorize(ctx, 'textile.edit', { textileId }))).resolves.toMatchObject({ textile: { _id: textileId } })
  await expect(outsider.run((ctx) => authorize(ctx, 'textile.read', { textileId }))).rejects.toThrow('Forbidden')
  await t.run((ctx) => ctx.db.patch(textileId, { trashedAt: Date.now() }))
  await expect(owner.run((ctx) => authorize(ctx, 'textile.read', { textileId }))).rejects.toThrow('Not found')
})

test('visible returns rows unchanged today', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'visible-owner')
  const { householdId } = await owner.mutation(api.households.createHousehold, { name: 'Home', wearers: [{ name: 'Pat', kind: 'adult' }] })
  await owner.mutation(api.inventory.createTextile, { householdId, name: 'Tee', color: 'White', colorGroup: 'light' })
  await owner.run(async (ctx) => {
    const { actor } = await authorize(ctx, 'textile.read', { householdId })
    for (const table of ['textiles', 'wearers', 'sessions'] as const) {
      const rows = await ctx.db.query(table).collect()
      expect(await visible(ctx, actor, rows)).toStrictEqual(rows)
    }
  })
})

test.each(['helper', 'guest'] as const)('%s is denied every action, including self actions and signed links', async (role) => {
  const t = newBackend()
  const owner = signedIn(t, `closed-${role}`)
  const { householdId } = await owner.mutation(api.households.createHousehold, { name: 'Home' })
  const principalKey = await keyOf(owner)
  await t.run(async (ctx) => {
    const membership = await ctx.db.query('memberships').withIndex('by_household', (q) => q.eq('householdId', householdId)).unique()
    await ctx.db.patch(membership!._id, { role })
  })
  for (const action of Object.keys(rules) as Action[]) {
    await expect(owner.run((ctx) => authorize(ctx, action, { householdId, subjects: [principalKey] })), action).rejects.toThrow('Forbidden')
    expect(await t.run((ctx) => authorizeKey(ctx, principalKey, action, { householdId, subjects: [principalKey] })), action).toBeNull()
  }
})

test('what an action uses must be of the target household, refused as before', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'uses-owner')
  const { householdId } = await owner.mutation(api.households.createHousehold, { name: 'Home' })
  const outsider = signedIn(t, 'uses-outsider')
  const { householdId: elsewhere } = await outsider.mutation(api.households.createHousehold, { name: 'Elsewhere' })
  const supply = (as: typeof owner, id: typeof householdId) => as.mutation(api.inventory.createSupply, { householdId: id, name: 'Soap', kind: 'chemical', use: 'detergent', safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] }, provenance: label('bottle') })
  const textile = (as: typeof owner, id: typeof householdId) => as.mutation(api.inventory.createTextile, { householdId: id, name: 'Tee', color: 'White', colorGroup: 'light' })
  const [ours, theirs] = [await supply(owner, householdId), await supply(outsider, elsewhere)]
  const [tee, theirTee] = [await textile(owner, householdId), await textile(outsider, elsewhere)]
  const machine = await outsider.mutation(api.inventory.createMachine, { householdId: elsewhere, name: 'Their washer', applianceType: 'top_load_washer', location: 'home', capacityConfidence: 'unknown', provenance: label('plate') })

  await expect(owner.run((ctx) => authorize(ctx, 'plan.read', { householdId, uses: { supplyIds: [ours], textileIds: [tee] } })))
    .resolves.toMatchObject({ used: { supplies: [{ _id: ours }], textiles: [{ _id: tee }], machines: [] } })
  for (const uses of [{ supplyIds: [theirs] }, { textileIds: [theirTee] }, { machineIds: [machine] }, { supplyIds: ['not-an-id'] }]) {
    await expect(owner.run((ctx) => authorize(ctx, 'plan.read', { householdId, uses })), JSON.stringify(uses)).rejects.toThrow('Forbidden')
  }
  // The membership check comes first: an outsider is refused whatever the rows.
  await expect(outsider.run((ctx) => authorize(ctx, 'plan.read', { householdId, uses: { supplyIds: [ours] } }))).rejects.toThrow('Forbidden')
  // A row that is gone is refused the same way.
  await t.run((ctx) => ctx.db.delete(ours))
  await expect(t.run((ctx) => related(ctx, householdId, { supplyIds: [ours] }))).rejects.toThrow('Forbidden')
})
