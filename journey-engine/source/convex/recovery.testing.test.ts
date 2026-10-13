import { afterEach, expect, test, vi } from 'vitest'
import { api, internal } from './_generated/api'
import { intakeHousehold, issuer, keyOf, newBackend, signedIn } from './harness.testing'

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })

test('relocated accounts keep their captured identity while other issuers and outsiders stay isolated', async () => {
  const t = newBackend()
  const owner = signedIn(t, 'restored-owner')
  const home = await intakeHousehold(owner)
  const before = await keyOf(owner)
  vi.stubEnv('CONVEX_SITE_URL', 'http://localhost:3231')
  vi.stubEnv('WASHCLOSET_PRINCIPAL_ISSUER', issuer)
  const restored = signedIn(t, 'restored-owner', { issuer: 'http://localhost:3231' })
  expect(await restored.query(api.principal.current, {})).toBe(before)
  expect((await restored.query(api.inventory.list, { householdId: home.householdId })).textiles.length).toBeGreaterThan(0)
  await expect(signedIn(t, 'outsider', { issuer: 'http://localhost:3231' }).query(api.inventory.list, { householdId: home.householdId })).rejects.toThrow('Forbidden')
  await expect(t.query(api.inventory.list, { householdId: home.householdId })).rejects.toThrow('Unauthenticated')
  expect(await signedIn(t, 'restored-owner', { issuer: 'http://other-provider' }).query(api.principal.current, {})).not.toBe(before)
})

test('restore reconstruction is gated, idempotent and preserves cancelled/sent reminders and revoked access', async () => {
  vi.useFakeTimers()
  const t = newBackend()
  const owner = signedIn(t, 'restore-timers')
  const home = await intakeHousehold(owner)
  const principal = await keyOf(owner)
  const now = Date.now()
  await t.run(async (ctx) => {
    await ctx.db.patch(home.shirt, { status: 'dirty', flag: { flaggedBy: principal, flaggedAt: now, reasons: ['food'] } })
    for (const status of ['scheduled', 'sent', 'cancelled'] as const) await ctx.db.insert('reminders', {
      householdId: home.householdId, kind: 'urgent_flag', status, dueAt: now + 60_000,
      recipientPrincipalKey: principal, textileIds: [home.shirt], flagKey: `${principal}:${now}`,
    })
    await ctx.db.insert('reminders', { householdId: home.householdId, kind: 'urgent_flag', status: 'scheduled', dueAt: now,
      recipientPrincipalKey: 'revoked-account', textileIds: [home.shirt], flagKey: `${principal}:${now}` })
  })
  await expect(t.mutation(internal.reminders.reconstruct, {})).rejects.toThrow('isolated rehearsal')
  vi.stubEnv('WASHCLOSET_RECOVERY_MODE', 'rehearsal')
  expect(await t.mutation(internal.reminders.reconstruct, {})).toEqual({ scheduled: 1, alreadyScheduled: 0, cancelled: 1 })
  expect(await t.mutation(internal.reminders.reconstruct, {})).toEqual({ scheduled: 0, alreadyScheduled: 1, cancelled: 0 })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  const state = await t.run(async (ctx) => ({ reminders: await ctx.db.query('reminders').collect(), deliveries: await ctx.db.query('pushDeliveries').collect() }))
  expect(state.reminders.map((row) => row.status)).toEqual(['sent', 'sent', 'cancelled', 'cancelled'])
  expect(state.deliveries).toEqual([])
})
