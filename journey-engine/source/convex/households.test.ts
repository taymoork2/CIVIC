import { expect, test } from 'vitest'

import { api } from './_generated/api'
import { newBackend, signedIn } from './harness.testing'
import { principalFromAuth } from './principal'

test('onboarding creates one stable principal membership and joins only with an owner invite', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'onboarding-test-user')
  const other = signedIn(t, 'other-user')
  const third = signedIn(t, 'third-user')
  const ownerKey = await owner.run((ctx) => principalFromAuth(ctx).then((principal) => principal.key as string))

  const created = await owner.mutation(api.households.createHousehold, { displayName: 'Pat', name: 'Home' })
  expect(created).toMatchObject({ name: 'Home', role: 'owner' })
  const stored = await t.run(async (ctx) => ({ principals: await ctx.db.query('principals').collect(), memberships: await ctx.db.query('memberships').collect() }))
  expect(stored.principals).toEqual([expect.objectContaining({ principalKey: ownerKey })])
  expect(stored.memberships).toHaveLength(1)
  await expect(owner.mutation(api.households.createHousehold, { name: 'Second home' })).rejects.toThrow('already belongs')
  await expect(owner.query(api.households.onboardingStatus, {})).resolves.toMatchObject({
    principalKey: ownerKey,
    displayName: 'Pat',
    households: [{ name: 'Home', role: 'owner' }],
  })

  await expect(other.mutation(api.households.joinWithInvite, { code: 'AAAA-BBBB-CCCC-DDDD' })).rejects.toThrow('couldn’t find that code')
  const invite = await owner.mutation(api.households.createInvite, { householdId: created.householdId })
  expect(await owner.query(api.households.pendingInvites, { householdId: created.householdId })).toEqual([{ inviteId: invite.inviteId, name: 'Invite link', expiresAt: invite.expiresAt }])
  expect(invite.code).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/)
  expect(JSON.stringify(await t.run((ctx) => ctx.db.query('householdInvites').collect()))).not.toContain(invite.code.replaceAll('-', ''))
  await expect(other.mutation(api.households.joinWithInvite, { code: invite.code.toLowerCase() })).resolves.toMatchObject({ name: 'Home', role: 'member' })
  expect(await t.run(async (ctx) => (await ctx.db.query('memberships').collect()).length)).toBe(2)

  // Single use; members cannot invite; outsiders cannot see the roster.
  await expect(third.mutation(api.households.joinWithInvite, { code: invite.code })).rejects.toThrow('already used')
  await expect(other.mutation(api.households.createInvite, { householdId: created.householdId })).rejects.toThrow('Forbidden')
  await expect(third.query(api.households.members, { householdId: created.householdId })).rejects.toThrow('Forbidden')

  const roster = await owner.query(api.households.members, { householdId: created.householdId })
  const member = roster.find((entry) => !entry.isYou)!
  const self = roster.find((entry) => entry.isYou)!
  await expect(other.mutation(api.households.removeMember, { membershipId: self.membershipId })).rejects.toThrow('Forbidden')
  await expect(owner.mutation(api.households.removeMember, { membershipId: self.membershipId })).rejects.toThrow('last owner')
  await owner.mutation(api.households.removeMember, { membershipId: member.membershipId })
  await expect(other.query(api.households.members, { householdId: created.householdId })).rejects.toThrow('Forbidden')
})

test('an invite stops working once it expires', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'onboarding-test-user')
  const { householdId } = await owner.mutation(api.households.createHousehold, { name: 'Home' })
  const invite = await owner.mutation(api.households.createInvite, { householdId })
  await t.run(async (ctx) => {
    for (const row of await ctx.db.query('householdInvites').collect()) await ctx.db.patch(row._id, { expiresAt: Date.now() - 1 })
  })
  await expect(signedIn(t, 'late-user').mutation(api.households.joinWithInvite, { code: invite.code })).rejects.toThrow('This code expired on')
})

test('leaving revokes household access but preserves clothing profiles and clothes for a return visit', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'parent')
  const child = signedIn(t, 'college-student')
  const { householdId } = await owner.mutation(api.households.createHousehold, { name: 'Home' })
  const invite = await owner.mutation(api.households.createInvite, { householdId })
  await child.mutation(api.households.joinWithInvite, { code: invite.code, displayName: 'Alex' })
  const wearerId = await child.mutation(api.inventory.createWearer, { householdId, name: 'Alex', kind: 'adult' })
  const [textileId] = await child.mutation(api.inventory.createTextiles, { householdId, name: 'College hoodie', wearerId, kind: 'sweater', quantity: 1 })
  const membership = (await child.query(api.households.members, { householdId })).find((member) => member.isYou)!
  await child.mutation(api.households.removeMember, { membershipId: membership.membershipId })
  await expect(child.query(api.inventory.list, { householdId })).rejects.toThrow('Forbidden')
  expect((await owner.query(api.inventory.list, { householdId })).textiles).toContainEqual(expect.objectContaining({ textileId, wearerId }))
  const returnInvite = await owner.mutation(api.households.createInvite, { householdId })
  await child.mutation(api.households.joinWithInvite, { code: returnInvite.code })
  const inventory = await child.query(api.inventory.list, { householdId })
  expect(inventory.wearers).toContainEqual(expect.objectContaining({ wearerId, name: 'Alex' }))
  expect(inventory.textiles).toContainEqual(expect.objectContaining({ textileId, wearerId }))
})

test('first run creates the people it washes for with the household, and links the one who is you', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'first-run-user')
  const ownerKey = await owner.run((ctx) => principalFromAuth(ctx).then((principal) => principal.key as string))
  const { householdId } = await owner.mutation(api.households.createHousehold, {
    displayName: 'Pat',
    name: 'Pat’s home',
    washPlace: 'shared',
    wearers: [{ name: ' Pat ', kind: 'adult', self: true }, { name: 'Baby', kind: 'baby' }],
  })
  const wearers = await t.run((ctx) => ctx.db.query('wearers').collect())
  expect(wearers.map(({ householdId: id, name, kind, principalKey }) => ({ id, name, kind, principalKey }))).toEqual([
    { id: householdId, name: 'Pat', kind: 'adult', principalKey: ownerKey },
    { id: householdId, name: 'Baby', kind: 'baby', principalKey: undefined },
  ])
  const roster = await owner.query(api.households.members, { householdId })
  expect(roster).toEqual([expect.objectContaining({ isYou: true, wearerId: wearers[0]!._id })])
  expect(roster[0]).not.toHaveProperty('principalKey')
  expect((await owner.query(api.households.onboardingStatus, {})).households[0]).toMatchObject({ washPlace: 'shared', firstHamperNotePending: true })
  await expect(signedIn(t, 'stranger').mutation(api.households.acknowledgeFirstHamper, { householdId })).rejects.toThrow('Forbidden')
  await owner.mutation(api.households.acknowledgeFirstHamper, { householdId })
  expect((await owner.query(api.households.onboardingStatus, {})).households[0]?.firstHamperNotePending).toBe(false)

  // A bad list creates nothing at all: no household without its people.
  const other = signedIn(t, 'first-run-other')
  await expect(other.mutation(api.households.createHousehold, { name: 'Home', wearers: [{ name: 'A', kind: 'adult', self: true }, { name: 'B', kind: 'adult', self: true }] })).rejects.toThrow('Only one')
  await expect(other.mutation(api.households.createHousehold, { name: 'Home', wearers: [{ name: '  ', kind: 'adult' }] })).rejects.toThrow('must not be empty')
  await expect(other.mutation(api.households.createHousehold, { name: 'Home', wearers: Array.from({ length: 13 }, () => ({ name: 'Kid', kind: 'child' as const })) })).rejects.toThrow('Too many')
  await expect(other.query(api.households.onboardingStatus, {})).resolves.toMatchObject({ households: [] })
  expect(await t.run(async (ctx) => (await ctx.db.query('households').collect()).length)).toBe(1)
})

test('an invite for a person links the joiner to that closet and starts their first-run choices', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'parent')
  const teen = signedIn(t, 'teen')
  const { householdId } = await owner.mutation(api.households.createHousehold, { name: 'Home', wearers: [{ name: 'Pat', kind: 'adult', self: true }, { name: 'Sam', kind: 'child' }, { name: 'Baby', kind: 'baby' }] })
  const wearers = await t.run((ctx) => ctx.db.query('wearers').collect())
  const [pat, sam, baby] = wearers
  const [shirt] = await owner.mutation(api.inventory.createTextiles, { householdId, wearerId: sam!._id, name: 'Sam’s shirt', quantity: 1, status: 'clean' })
  await owner.mutation(api.closet.markWorn, { textileIds: [shirt!] })
  const before = await t.run(async (ctx) => ({ textile: await ctx.db.get(shirt!), history: await ctx.db.query('history').withIndex('by_textile', (q) => q.eq('textileId', shirt!)).collect() }))
  expect(before.history.length).toBeGreaterThan(0)
  const elsewhere = await signedIn(t, 'other-owner').mutation(api.households.createHousehold, { name: 'Other', wearers: [{ name: 'Kim', kind: 'adult' }] })
  const kim = (await t.run((ctx) => ctx.db.query('wearers').collect())).find((wearer) => wearer.householdId === elsewhere.householdId)!

  // Owner only; the person must be here, unlinked and able to hold an account.
  await expect(teen.mutation(api.households.createInvite, { householdId, wearerId: sam!._id })).rejects.toThrow('Forbidden')
  await expect(owner.mutation(api.households.createInvite, { householdId, wearerId: pat!._id })).rejects.toThrow('already has an account')
  await expect(owner.mutation(api.households.createInvite, { householdId, wearerId: baby!._id })).rejects.toThrow('baby')
  await expect(owner.mutation(api.households.createInvite, { householdId, wearerId: kim._id })).rejects.toThrow('isn’t in this household')

  // A newer invite for the same person replaces the earlier one.
  const first = await owner.mutation(api.households.createInvite, { householdId, wearerId: sam!._id })
  const invite = await owner.mutation(api.households.createInvite, { householdId, wearerId: sam!._id })
  await expect(teen.query(api.households.invitePreview, { code: first.code })).resolves.toEqual({ status: 'unknown' })
  const preview = await teen.query(api.households.invitePreview, { code: invite.code })
  expect(preview).toMatchObject({ status: 'valid', wearerName: 'Sam' })
  expect(Object.keys(preview).sort()).toEqual(['expiresAt', 'householdName', 'inviterName', 'role', 'status', 'wearerName'])

  await expect(teen.mutation(api.households.joinWithInvite, { code: invite.code })).resolves.toMatchObject({ role: 'member', linked: true })
  const teenKey = await teen.run((ctx) => principalFromAuth(ctx).then((principal) => principal.key as string))
  expect((await t.run((ctx) => ctx.db.get(sam!._id)))?.principalKey).toBe(teenKey)
  expect(await t.run(async (ctx) => ({ textile: await ctx.db.get(shirt!), history: await ctx.db.query('history').withIndex('by_textile', (q) => q.eq('textileId', shirt!)).collect() }))).toEqual(before)
  expect((await teen.query(api.households.onboardingStatus, {})).households[0]?.guidance).toMatchObject({ status: 'started', stage: 'intent' })
})

test('joining still works when the person was claimed meanwhile, and old invites carry no person', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'parent')
  const { householdId } = await owner.mutation(api.households.createHousehold, { name: 'Home', wearers: [{ name: 'Sam', kind: 'child' }] })
  const sam = (await t.run((ctx) => ctx.db.query('wearers').collect()))[0]!
  const invite = await owner.mutation(api.households.createInvite, { householdId, wearerId: sam._id })
  await t.run((ctx) => ctx.db.patch(sam._id, { principalKey: 'someone-else' }))
  const late = signedIn(t, 'late')
  await expect(late.query(api.households.invitePreview, { code: invite.code })).resolves.toMatchObject({ status: 'valid', wearerName: null })
  await expect(late.mutation(api.households.joinWithInvite, { code: invite.code })).resolves.toMatchObject({ role: 'member', linked: false })
  expect((await t.run((ctx) => ctx.db.get(sam._id)))?.principalKey).toBe('someone-else')

  const plain = await owner.mutation(api.households.createInvite, { householdId })
  const guest = signedIn(t, 'guest')
  await expect(guest.query(api.households.invitePreview, { code: plain.code })).resolves.toMatchObject({ status: 'valid', wearerName: null })
  const joined = await guest.mutation(api.households.joinWithInvite, { code: plain.code })
  expect(joined).not.toHaveProperty('linked')
  expect((await guest.query(api.households.onboardingStatus, {})).households[0]?.guidance).toMatchObject({ stage: 'intent' })
})

test('a member who leaves can be invited back to their own closet', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'parent')
  const student = signedIn(t, 'student')
  const { householdId } = await owner.mutation(api.households.createHousehold, { name: 'Home', wearers: [{ name: 'Pat', kind: 'adult', self: true }, { name: 'Sam', kind: 'child' }] })
  const sam = (await t.run((ctx) => ctx.db.query('wearers').collect())).find((wearer) => wearer.name === 'Sam')!
  const invite = await owner.mutation(api.households.createInvite, { householdId, wearerId: sam._id })
  await student.mutation(api.households.joinWithInvite, { code: invite.code })
  expect((await owner.query(api.households.members, { householdId })).find((row) => !row.isYou)?.wearerId).toBe(sam._id)
  const membership = (await t.run((ctx) => ctx.db.query('memberships').collect())).find((row) => row.role === 'member')!

  await student.mutation(api.households.removeMember, { membershipId: membership._id })
  expect((await t.run((ctx) => ctx.db.get(sam._id)))?.principalKey).toBeUndefined()
  expect(await owner.query(api.households.members, { householdId })).toHaveLength(1)
  const again = await owner.mutation(api.households.createInvite, { householdId, wearerId: sam._id })
  await expect(student.mutation(api.households.joinWithInvite, { code: again.code })).resolves.toMatchObject({ linked: true })
})

test('roster linkage follows the principal and household, never a matching name', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'row-owner')
  const { householdId } = await owner.mutation(api.households.createHousehold, { displayName: 'Same name', name: 'Home' })
  await owner.mutation(api.inventory.createWearer, { householdId, name: 'Same name', kind: 'adult' })
  expect((await owner.query(api.households.members, { householdId }))[0]?.wearerId).toBeNull()
  const linked = await owner.mutation(api.inventory.createWearer, { householdId, name: 'Different name', kind: 'adult', self: true })
  expect((await owner.query(api.households.members, { householdId }))[0]?.wearerId).toBe(linked)
  await expect(signedIn(t, 'row-outsider').query(api.households.members, { householdId })).rejects.toThrow('Forbidden')
})

test('pending invites survive refresh without revealing codes; cancelling and removing revoke access', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'pending-owner')
  const outsider = signedIn(t, 'pending-outsider')
  const { householdId } = await owner.mutation(api.households.createHousehold, { name: 'Home' })
  const wearerId = await owner.mutation(api.inventory.createWearer, { householdId, name: 'Sam', kind: 'adult' })
  const [shirt] = await owner.mutation(api.inventory.createTextiles, { householdId, wearerId, name: 'Sam shirt', quantity: 1 })
  const invite = await owner.mutation(api.households.createInvite, { householdId, wearerId })
  expect(await owner.query(api.households.pendingInvites, { householdId })).toEqual([{ inviteId: invite.inviteId, name: 'Sam', wearerId, expiresAt: invite.expiresAt }])
  await expect(outsider.query(api.households.pendingInvites, { householdId })).rejects.toThrow('Forbidden')
  await expect(outsider.mutation(api.households.cancelInvite, { wearerId })).rejects.toThrow('Forbidden')
  const memberCode = await owner.mutation(api.households.createInvite, { householdId })
  const member = signedIn(t, 'pending-member')
  await member.mutation(api.households.joinWithInvite, { code: memberCode.code })
  await expect(member.mutation(api.households.cancelInvite, { wearerId })).rejects.toThrow('Forbidden')
  await expect(member.mutation(api.households.cancelInvite, { inviteId: invite.inviteId })).rejects.toThrow('Forbidden')
  await owner.mutation(api.households.cancelInvite, { wearerId })
  await owner.mutation(api.households.cancelInvite, { wearerId })
  expect(await owner.query(api.households.pendingInvites, { householdId })).toEqual([])
  expect(await t.run((ctx) => ctx.db.get(wearerId))).not.toBeNull()
  await expect(outsider.mutation(api.households.joinWithInvite, { code: invite.code })).rejects.toThrow('couldn’t find')
  const again = await owner.mutation(api.households.createInvite, { householdId, wearerId })
  await owner.mutation(api.inventory.removeWearer, { wearerId })
  expect(await t.run((ctx) => ctx.db.get(wearerId))).toBeNull()
  const kept = await t.run((ctx) => ctx.db.get(shirt!))
  expect(kept).toMatchObject({ name: 'Sam shirt' })
  expect(kept).not.toHaveProperty('wearerId')
  expect(await owner.query(api.households.pendingInvites, { householdId })).toEqual([])
  await expect(outsider.mutation(api.households.joinWithInvite, { code: again.code })).rejects.toThrow('couldn’t find')
})

test('named invitations do not create profiles and cancellation removes only that invitation', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'independent-owner')
  const outsider = signedIn(t, 'independent-outsider')
  const { householdId } = await owner.mutation(api.households.createHousehold, { name: 'Home' })
  const first = await owner.mutation(api.households.createInvite, { householdId, name: ' Sam ' })
  const second = await owner.mutation(api.households.createInvite, { householdId, name: 'Sam' })
  expect(await t.run((ctx) => ctx.db.query('wearers').collect())).toEqual([])
  expect(await owner.query(api.households.pendingInvites, { householdId })).toEqual([
    { inviteId: first.inviteId, name: 'Sam', expiresAt: first.expiresAt },
    { inviteId: second.inviteId, name: 'Sam', expiresAt: second.expiresAt },
  ])
  await expect(outsider.mutation(api.households.cancelInvite, { inviteId: first.inviteId })).rejects.toThrow('Forbidden')
  const other = await outsider.mutation(api.households.createHousehold, { name: 'Elsewhere' })
  await expect(outsider.mutation(api.households.createInvite, { householdId: other.householdId, replacesInviteId: first.inviteId })).rejects.toThrow('isn’t in this household')
  const replacement = await owner.mutation(api.households.createInvite, { householdId, replacesInviteId: first.inviteId })
  await expect(outsider.query(api.households.invitePreview, { code: first.code })).resolves.toEqual({ status: 'unknown' })
  await owner.mutation(api.households.cancelInvite, { inviteId: replacement.inviteId })
  await owner.mutation(api.households.cancelInvite, { inviteId: replacement.inviteId })
  expect(await owner.query(api.households.pendingInvites, { householdId })).toEqual([{ inviteId: second.inviteId, name: 'Sam', expiresAt: second.expiresAt }])
  await expect(owner.mutation(api.households.createInvite, { householdId, name: ' ' })).rejects.toThrow('must not be empty')
  await expect(owner.mutation(api.households.createInvite, { householdId, name: 'x'.repeat(61) })).rejects.toThrow('too long')
  const joiner = signedIn(t, 'independent-joiner')
  await joiner.mutation(api.households.joinWithInvite, { code: second.code })
  expect(await owner.query(api.households.pendingInvites, { householdId })).toEqual([])
  await expect(owner.mutation(api.households.cancelInvite, { inviteId: second.inviteId })).rejects.toThrow('already accepted')
  expect(await t.run((ctx) => ctx.db.query('wearers').collect())).toEqual([])
})

test('accepted and expired person invites are not pending and cannot cancel accepted members', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'accepted-owner')
  const { householdId } = await owner.mutation(api.households.createHousehold, { name: 'Home' })
  const wearerId = await owner.mutation(api.inventory.createWearer, { householdId, name: 'Sam', kind: 'adult' })
  const invite = await owner.mutation(api.households.createInvite, { householdId, wearerId })
  await t.run(async (ctx) => { for (const row of await ctx.db.query('householdInvites').collect()) await ctx.db.patch(row._id, { expiresAt: Date.now() - 1 }) })
  expect(await owner.query(api.households.pendingInvites, { householdId })).toEqual([])
  const again = await owner.mutation(api.households.createInvite, { householdId, wearerId })
  await signedIn(t, 'accepted-member').mutation(api.households.joinWithInvite, { code: again.code })
  expect(await owner.query(api.households.pendingInvites, { householdId })).toEqual([])
  await expect(owner.mutation(api.households.cancelInvite, { wearerId })).rejects.toThrow('They have joined')
  await expect(owner.mutation(api.inventory.removeWearer, { wearerId })).rejects.toThrow('Remove household access')
  expect(await t.run((ctx) => ctx.db.get(wearerId))).not.toBeNull()
})
