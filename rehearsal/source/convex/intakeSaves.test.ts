import { expect, test } from 'vitest'
import { api } from './_generated/api'
import { intakeHousehold, joinHousehold, keyOf, label, newBackend, signedIn } from './harness.testing'
import { removePrincipalData } from './identity'

test('concurrent multicolor saves and a lost response return the same complete batch', async () => {
  const t = newBackend(), owner = signedIn(t, 'intake-pack')
  const home = await intakeHousehold(owner)
  const args = { householdId: home.householdId, name: 'Pack', quantity: 3, sameCareInstructions: true, intakeKey: 'pack-save-identity', colors: [
    { name: 'Black briefs', color: 'Black', colorGroup: 'dark' as const, quantity: 2 },
    { name: 'Blue briefs', color: 'Blue', colorGroup: 'dark' as const, quantity: 1 },
  ] }
  const [first, second] = await Promise.all([owner.mutation(api.inventory.createTextiles, args), owner.mutation(api.inventory.createTextiles, args)])
  expect(second).toEqual(first)
  // Retry after the caller has lost the successful result, including reordered object properties.
  expect(await owner.mutation(api.inventory.createTextiles, { ...args, colors: args.colors.map(({ quantity, ...color }) => ({ quantity, ...color })) })).toEqual(first)
  expect((await owner.query(api.inventory.list, { householdId: home.householdId })).textiles.filter(piece => first.includes(piece.textileId))).toHaveLength(3)
  await expect(owner.mutation(api.inventory.createTextiles, { ...args, name: 'Changed pack' })).rejects.toThrow('already saved with different answers')
  expect(await t.run(ctx => ctx.db.query('intakeSaves').collect())).toHaveLength(1)
})

test('appliance, product and inline person retries do not create another record', async () => {
  const t = newBackend(), owner = signedIn(t, 'intake-equipment')
  const home = await intakeHousehold(owner)
  const machine = { householdId: home.householdId, name: 'Shared washers', count: 5, provenance: label('Synthetic controls'), intakeKey: 'machine-save-identity' }
  const product = { householdId: home.householdId, name: 'Synthetic detergent', kind: 'chemical' as const, provenance: label('Synthetic label'), intakeKey: 'product-save-identity' }
  const person = { householdId: home.householdId, name: 'New person', kind: 'adult' as const, intakeKey: 'person-save-identity' }
  for (const save of [() => owner.mutation(api.inventory.createMachines, machine), () => owner.mutation(api.inventory.createSupply, product), () => owner.mutation(api.inventory.createWearer, person)]) {
    const [first, second] = await Promise.all([save(), save()])
    expect(second).toEqual(first)
    expect(await save()).toEqual(first)
  }
  expect(await t.run(ctx => ctx.db.query('intakeSaves').collect())).toHaveLength(3)
  await expect(owner.mutation(api.inventory.createMachines, { ...machine, count: 6 })).rejects.toThrow('different answers')
  await expect(owner.mutation(api.inventory.createSupply, { ...product, name: 'Other product' })).rejects.toThrow('different answers')
  await expect(owner.mutation(api.inventory.createWearer, { ...person, name: 'Other person' })).rejects.toThrow('different answers')
})

test('failed intake rolls back the receipt and permits corrected retry', async () => {
  const t = newBackend(), owner = signedIn(t, 'intake-rollback')
  const home = await intakeHousehold(owner)
  const args = { householdId: home.householdId, name: 'Tee', quantity: 0, intakeKey: 'rollback-save-identity' }
  await expect(owner.mutation(api.inventory.createTextiles, args)).rejects.toThrow('between 1 and 20')
  expect(await t.run(ctx => ctx.db.query('intakeSaves').collect())).toHaveLength(0)
  expect(await owner.mutation(api.inventory.createTextiles, { ...args, quantity: 1 })).toHaveLength(1)
})

test('receipts are isolated by account and household, require current permission, and are erased on account deletion', async () => {
  const t = newBackend(), owner = signedIn(t, 'intake-owner')
  const home = await intakeHousehold(owner)
  const args = { householdId: home.householdId, name: 'Owner tee', quantity: 1, intakeKey: 'shared-save-identity' }
  const ownerIds = await owner.mutation(api.inventory.createTextiles, args)
  const member = await joinHousehold(t, owner, home.householdId, 'intake-member', 'Member')
  const memberIds = await member.mutation(api.inventory.createTextiles, args)
  expect(memberIds).not.toEqual(ownerIds)
  await expect(signedIn(t, 'intake-outsider').mutation(api.inventory.createTextiles, args)).rejects.toThrow('Forbidden')
  const other = await intakeHousehold(signedIn(t, 'intake-other'))
  await expect(owner.mutation(api.inventory.createTextiles, { ...args, householdId: other.householdId })).rejects.toThrow('Forbidden')
  await expect(owner.mutation(api.inventory.createTextiles, { ...args, intakeKey: 'x' })).rejects.toThrow('Invalid intake')
  const memberKey = await keyOf(member)
  await t.run(ctx => removePrincipalData(ctx, memberKey))
  await expect(member.mutation(api.inventory.createTextiles, args)).rejects.toThrow('Forbidden')
  expect((await t.run(ctx => ctx.db.query('intakeSaves').collect())).map(row => row.principalKey)).toEqual([await keyOf(owner)])
})
