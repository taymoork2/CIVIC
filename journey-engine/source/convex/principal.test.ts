import { expect, test } from 'vitest'

import { api, components } from './_generated/api'
import { authIdentity, intakeHousehold, issuer as testIssuer, newBackend, signedIn } from './harness.testing'
import { removePrincipalData } from './identity'
import { principalFromAuth, principalKey, principalKeyFor, requirePrincipal, type AuthenticatedPrincipal } from './principal'

const issuer = 'http://localhost:3000'
const subject = 'better-auth-user-local'

test('stored principal keys keep their exact derivation', async () => {
  // Every membership, person, and photo is keyed by this value; changing the algorithm orphans them.
  expect(await principalKeyFor(issuer, subject)).toBe('principal:v1:8467db71fbe1438767065f5d9a63db57a19f505ad432a2c008709f05be3501a1')
  await expect(principalKeyFor('', subject)).rejects.toThrow('issuer and subject')
})

test('maps only an authenticated issuer and subject to an opaque stable key', async () => {
  const t = newBackend()
  const as = signedIn(t, subject)
  const actor = (caller: typeof as) => caller.run(ctx => principalFromAuth(ctx))
  const first = await actor(as)
  const restored = await actor(signedIn(t, subject))
  const otherIssuer = await actor(signedIn(t, subject, { issuer: `${issuer}/other` }))
  const otherSubject = await actor(signedIn(t, `${subject}-other`))

  expect(first.key).toBe(restored.key)
  expect(first.key).not.toBe(otherIssuer.key)
  expect(first.key).not.toBe(otherSubject.key)
  expect(first.key).not.toContain(issuer)
  expect(first.key).not.toContain(subject)
  expect(first.key).toMatch(/^principal:v1:[a-f0-9]{64}$/)
  await expect(t.query(api.principal.current, {})).rejects.toThrow('Unauthenticated')
  await expect(actor(signedIn(t, subject, { issuer: '' }))).rejects.toThrow('issuer and subject')
})

test('authorization accepts only an authenticated internal principal', async () => {
  const t = newBackend()
  const as = signedIn(t, subject)
  const key = await as.run(async ctx => {
    const actor = await principalFromAuth(ctx)
    expect(() => requirePrincipal(actor, actor.key)).not.toThrow()
    expect(() => requirePrincipal(actor, principalKey('another-principal'))).toThrow('Forbidden')
    expect(() => requirePrincipal({ issuer, subject, tokenIdentifier: `${issuer}|${subject}` } as unknown as AuthenticatedPrincipal, actor.key)).toThrow('authenticated internal principal')
    return actor.key
  })
  expect(key).toBe(await principalKeyFor(testIssuer, (await authIdentity(t, subject)).subject))
  await expect(as.query(api.principal.current, {})).resolves.toBe(key)
})

test('deleting an account ends household access for its still-valid token', async () => {
  const t = newBackend()
  const as = signedIn(t, 'leaving-user')
  const home = await intakeHousehold(as)
  const stayer = signedIn(t, 'staying-user')
  const invite = await as.mutation(api.households.createInvite, { householdId: home.householdId })
  await stayer.mutation(api.households.joinWithInvite, { code: invite.code })
  await as.mutation(api.notifications.subscribe, { deviceId: 'phone', endpointHash: 'hash' })
  const key = await as.run((ctx) => principalFromAuth(ctx).then((principal) => principal.key as string))

  await expect(as.query(api.inventory.list, { householdId: home.householdId })).resolves.toBeDefined()
  expect(await t.run((ctx) => removePrincipalData(ctx, key))).toEqual({ removedMemberships: 1 })
  await expect(as.query(api.inventory.list, { householdId: home.householdId })).rejects.toThrow('Forbidden')
  await expect(stayer.query(api.inventory.list, { householdId: home.householdId })).resolves.toBeDefined()
  const left = await t.run(async (ctx) => ({
    people: (await ctx.db.query('people').collect()).filter((row) => row.principalKey === key),
    principals: (await ctx.db.query('principals').collect()).filter((row) => row.principalKey === key),
    subscriptions: (await ctx.db.query('notificationSubscriptions').collect()).filter((row) => row.principalKey === key),
  }))
  expect(left).toEqual({ people: [], principals: [], subscriptions: [] })
})

test.each(['revoked', 'expired', 'deleted-user'] as const)('%s auth denies retained JWT reads and writes', async state => {
  const t = newBackend(), as = signedIn(t, state)
  const home = await intakeHousehold(as)
  const identity = await authIdentity(t, state)
  const where = [{ field: '_id' as const, value: String(identity.sessionId) }]
  if (state === 'expired') await t.mutation(components.betterAuth.adapter.updateOne, { input: { model: 'session', where, update: { expiresAt: Date.now() - 1 } } })
  else await t.mutation(components.betterAuth.adapter.deleteOne, { input: { model: state === 'revoked' ? 'session' : 'user', where: state === 'revoked' ? where : [{ field: '_id', value: identity.subject }] } })
  await expect(as.query(api.inventory.list, { householdId: home.householdId })).rejects.toThrow('Unauthenticated')
  await expect(as.mutation(api.inventory.createTextile, { householdId: home.householdId, name: 'Must not save' })).rejects.toThrow('Unauthenticated')
  await expect(as.mutation(api.households.createHousehold, { name: 'Must not recreate account' })).rejects.toThrow('Unauthenticated')
  expect(await t.run(ctx => ctx.db.query('textiles').collect())).toHaveLength(3)
})
