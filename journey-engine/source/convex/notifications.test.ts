import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import { intakeHousehold, joinHousehold, keyOf, newBackend, signedIn } from './harness.testing'
import { principalFromAuth } from './principal'

test('subscriptions are principal/device scoped and revocable', async () => {
  const t = newBackend()
  const as = signedIn(t, 'notification-test-user')
  const key = await as.run((ctx) => principalFromAuth(ctx.auth).then((principal) => principal.key as string))

  const first = await as.mutation(api.notifications.subscribe, { deviceId: 'phone', endpointHash: 'hash-a' })
  const same = await as.mutation(api.notifications.subscribe, { deviceId: 'phone', endpointHash: 'hash-a' })
  expect(same).toEqual(first)
  expect(await t.run(async (ctx) => (await ctx.db.query('notificationSubscriptions').collect()).length)).toBe(1)

  await as.mutation(api.notifications.subscribe, { deviceId: 'phone', endpointHash: 'hash-b' })
  const subscriptions = await t.run((ctx) => ctx.db.query('notificationSubscriptions').collect())
  expect(subscriptions[0]).toMatchObject({ principalKey: key, deviceId: 'phone', endpointHash: 'hash-a', revokedAt: expect.any(Number) })
  expect(subscriptions[1]).toMatchObject({ principalKey: key, deviceId: 'phone', endpointHash: 'hash-b' })
  expect(subscriptions[1]!.revokedAt).toBeUndefined()
  await expect(as.mutation(api.notifications.revoke, { deviceId: 'phone' })).resolves.toMatchObject({ revoked: 1 })
  await expect(as.mutation(api.notifications.revokeAll, {})).resolves.toMatchObject({ revoked: 0 })
  await expect(t.mutation(api.notifications.subscribe, { deviceId: 'phone', endpointHash: 'hash-c' })).rejects.toThrow('Unauthenticated')
})

describeAlerts()

function describeAlerts() {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  test('flag heads-ups are read and marked shown by their recipient only, named by the flagger\'s wearer', async () => {
    const t = newBackend()
    const owner = signedIn(t, 'alert-owner')
    const home = await intakeHousehold(owner)
    const sam = await joinHousehold(t, owner, home.householdId, 'alert-sam', 'Samuel')
    const neededBy = Date.now() + 3_600_000
    await sam.mutation(api.closet.flagDirty, { textileIds: [home.shirt, home.towel], reasons: ['food'], soilLevel: 'heavy', neededBy })
    // Nothing is shown before delivery.
    expect(await owner.query(api.notifications.flagAlerts, { householdId: home.householdId })).toEqual([])
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const [alert] = await owner.query(api.notifications.flagAlerts, { householdId: home.householdId })
    expect(alert).toEqual({ reminderId: expect.any(String), flaggerName: 'Samuel', itemName: 'White tee', count: 2, neededBy })
    const wearer = await owner.mutation(api.inventory.createWearer, { householdId: home.householdId, name: 'Sam', kind: 'child' })
    await sam.mutation(api.inventory.updateWearer, { wearerId: wearer, principalKey: await keyOf(sam) })
    expect((await owner.query(api.notifications.flagAlerts, { householdId: home.householdId }))[0]!.flaggerName).toBe('Sam')

    expect(await sam.query(api.notifications.flagAlerts, { householdId: home.householdId })).toEqual([])
    await expect(sam.mutation(api.notifications.markAlertShown, { reminderId: alert!.reminderId })).rejects.toThrow('Forbidden')
    await expect(signedIn(t, 'alert-outsider').query(api.notifications.flagAlerts, { householdId: home.householdId })).rejects.toThrow('Forbidden')
    await owner.mutation(api.notifications.markAlertShown, { reminderId: alert!.reminderId })
    expect(await owner.query(api.notifications.flagAlerts, { householdId: home.householdId })).toEqual([])
    expect(await t.run((ctx) => ctx.db.get(alert!.reminderId))).toMatchObject({ status: 'completed', shownAt: expect.any(Number) })
  })
}
