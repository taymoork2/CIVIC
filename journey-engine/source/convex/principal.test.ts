import type { Auth, UserIdentity } from 'convex/server'
import { expect, test } from 'vitest'

import { api } from './_generated/api'
import { intakeHousehold, issuer as testIssuer, newBackend, signedIn } from './harness.testing'
import { removePrincipalData } from './identity'
import { principalFromAuth, principalKey, principalKeyFor, requirePrincipal, type AuthenticatedPrincipal } from './principal'

const issuer = 'http://localhost:3000'
const subject = 'better-auth-user-local'

function localAuth(overrides: Partial<UserIdentity> | null = {}): Auth {
  return {
    getUserIdentity: async () =>
      overrides === null ? null : { issuer, subject, tokenIdentifier: `${issuer}|${subject}`, ...overrides },
  }
}

test('stored principal keys keep their exact derivation', async () => {
  // Every membership, person, and photo is keyed by this value; changing the algorithm orphans them.
  expect(await principalKeyFor(issuer, subject)).toBe('principal:v1:8467db71fbe1438767065f5d9a63db57a19f505ad432a2c008709f05be3501a1')
  expect(await principalKeyFor(issuer, subject)).toBe((await principalFromAuth(localAuth())).key)
})

test('maps only an authenticated issuer and subject to an opaque stable key', async () => {
  const first = await principalFromAuth(localAuth())
  const restored = await principalFromAuth(localAuth())
  const otherIssuer = await principalFromAuth(localAuth({ issuer: `${issuer}/other` }))
  const otherSubject = await principalFromAuth(localAuth({ subject: `${subject}-other` }))

  expect(first.key).toBe(restored.key)
  expect(first.key).not.toBe(otherIssuer.key)
  expect(first.key).not.toBe(otherSubject.key)
  expect(first.key).not.toContain(issuer)
  expect(first.key).not.toContain(subject)
  expect(first.key).toMatch(/^principal:v1:[a-f0-9]{64}$/)
  await expect(principalFromAuth(localAuth(null))).rejects.toThrow('Unauthenticated')
  await expect(principalFromAuth(localAuth({ issuer: '' }))).rejects.toThrow('issuer and subject')
})

test('authorization accepts only an authenticated internal principal', async () => {
  const t = newBackend()
  const as = signedIn(t, subject)
  const actor = await principalFromAuth(localAuth({ issuer: testIssuer }))

  await expect(as.query(api.principal.current, {})).resolves.toBe(actor.key)
  expect(() => requirePrincipal(actor, actor.key)).not.toThrow()
  expect(() => requirePrincipal(actor, principalKey('another-principal'))).toThrow('Forbidden')
  expect(() => requirePrincipal({ issuer, subject, tokenIdentifier: `${issuer}|${subject}` } as unknown as AuthenticatedPrincipal, actor.key)).toThrow('authenticated internal principal')
})

test('deleting an account ends household access for its still-valid token', async () => {
  const t = newBackend()
  const as = signedIn(t, 'leaving-user')
  const home = await intakeHousehold(as)
  const stayer = signedIn(t, 'staying-user')
  const invite = await as.mutation(api.households.createInvite, { householdId: home.householdId })
  await stayer.mutation(api.households.joinWithInvite, { code: invite.code })
  await as.mutation(api.notifications.subscribe, { deviceId: 'phone', endpointHash: 'hash' })
  const key = await as.run((ctx) => principalFromAuth(ctx.auth).then((principal) => principal.key as string))

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
