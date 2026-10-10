import { afterEach, expect, test, vi } from 'vitest'
import { api, internal } from './_generated/api'
import { intakeHousehold, joinHousehold, keyOf, newBackend, signedIn } from './harness.testing'
import { stepRecipient } from './reminders'
import { pushLifetimeMs, validPushEndpoint, validPushKeys } from './pushPolicy'

const keys = { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) }
const endpoint = 'https://fcm.googleapis.com/fcm/send/synthetic'
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

test('subscriptions reject local and deceptive endpoint hosts and malformed encryption keys', async () => {
  expect(validPushEndpoint(endpoint)).toBe(true)
  for (const value of ['http://fcm.googleapis.com/push', 'https://127.0.0.1/push', 'https://fcm.googleapis.com.evil.test/push', 'https://user:pass@fcm.googleapis.com/push']) expect(validPushEndpoint(value)).toBe(false)
  expect(validPushKeys(keys)).toBe(true)
  const as = signedIn(newBackend(), 'push-user')
  await expect(as.mutation(api.notifications.subscribe, { deviceId: 'phone', endpointHash: 'hash', endpoint: 'https://localhost/push', keys })).rejects.toThrow('Invalid push subscription')
  await expect(as.mutation(api.notifications.subscribe, { deviceId: 'phone', endpointHash: 'hash', endpoint, keys: { ...keys, auth: 'bad' } })).rejects.toThrow('Invalid push subscription')
})

test('a browser endpoint changes ownership when another account enables notifications', async () => {
  const t = newBackend()
  const first = signedIn(t, 'first')
  const second = signedIn(t, 'second')
  await first.mutation(api.notifications.subscribe, { deviceId: 'phone', endpointHash: 'hash', endpoint, keys })
  await second.mutation(api.notifications.subscribe, { deviceId: 'phone', endpointHash: 'hash', endpoint, keys })
  expect(await first.query(api.notifications.deviceSubscription, { deviceId: 'phone' })).toBe(false)
  expect(await second.query(api.notifications.deviceSubscription, { deviceId: 'phone' })).toBe(true)
})

async function queued() {
  const t = newBackend()
  const as = signedIn(t, 'push-owner')
  const home = await intakeHousehold(as)
  const principal = await keyOf(as)
  const { subscriptionId } = await as.mutation(api.notifications.subscribe, { deviceId: 'phone', endpointHash: 'hash', endpoint, keys })
  const now = Date.now()
  const ids = await t.run(async (ctx) => {
    await ctx.db.patch(home.shirt, { status: 'dirty', flag: { flaggedBy: principal, flaggedAt: now, reasons: ['food'] } })
    const reminderId = await ctx.db.insert('reminders', { householdId: home.householdId, kind: 'urgent_flag', status: 'sent', dueAt: now, recipientPrincipalKey: principal, textileIds: [home.shirt], flagKey: `${principal}:${now}` })
    const deliveryId = await ctx.db.insert('pushDeliveries', { reminderId, subscriptionId, status: 'queued', attempts: 0 })
    return { reminderId, deliveryId }
  })
  return { t, as, home, ...ids }
}

test('claim validates current access, expiry, flag state and revocation before sending', async () => {
  for (const change of ['access', 'expiry', 'flag', 'device'] as const) {
    const { t, as, home, reminderId, deliveryId } = await queued()
    if (change === 'device') await as.mutation(api.notifications.revoke, { deviceId: 'phone' })
    await t.run(async (ctx) => {
      if (change === 'expiry') await ctx.db.patch(reminderId, { dueAt: Date.now() - pushLifetimeMs - 1 })
      if (change === 'flag') await ctx.db.patch(home.shirt, { flag: undefined })
      if (change === 'access') {
        const members = await ctx.db.query('memberships').withIndex('by_household', (q) => q.eq('householdId', home.householdId)).collect()
        for (const member of members) await ctx.db.delete(member._id)
      }
    })
    expect(await t.mutation(internal.pushDelivery.claim, { deliveryId })).toBeNull()
    expect(await t.run((ctx) => ctx.db.get(deliveryId))).toMatchObject({ status: 'cancelled', attempts: 0 })
  }
})

test('one claim wins; accepted delivery is not replayed and an expired endpoint is revoked', async () => {
  const { t, as, deliveryId } = await queued()
  const first = await t.mutation(internal.pushDelivery.claim, { deliveryId })
  expect(first).toMatchObject({ endpoint, url: '/laundry', attempt: 1 })
  expect(await t.mutation(internal.pushDelivery.claim, { deliveryId })).toBeNull()
  await t.mutation(internal.pushDelivery.finish, { deliveryId, attempt: 1, result: 'expired' })
  expect(await as.query(api.notifications.deviceSubscription, { deviceId: 'phone' })).toBe(false)
  expect(await t.mutation(internal.pushDelivery.claim, { deliveryId })).toBeNull()
})

test('delivery retries are bounded and an accepted send is not replayed', async () => {
  const { t, deliveryId } = await queued()
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const delivery = await t.mutation(internal.pushDelivery.claim, { deliveryId })
    expect(delivery?.attempt).toBe(attempt)
    await t.mutation(internal.pushDelivery.finish, { deliveryId, attempt, result: 'failed' })
  }
  expect(await t.mutation(internal.pushDelivery.claim, { deliveryId })).toBeNull()
  const other = await queued()
  await other.t.mutation(internal.pushDelivery.claim, { deliveryId: other.deliveryId })
  await other.t.mutation(internal.pushDelivery.finish, { deliveryId: other.deliveryId, attempt: 1, result: 'sent' })
  expect(await other.t.mutation(internal.pushDelivery.claim, { deliveryId: other.deliveryId })).toBeNull()
})

test('the sender produces a decryptable, authenticated push and records provider acceptance without a real request', async () => {
  const { t, deliveryId } = await queued()
  const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
  const browserKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const serverKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const browserPublic = encode(new Uint8Array(await crypto.subtle.exportKey('raw', browserKeys.publicKey)))
  const serverPublic = encode(new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey)))
  const serverPrivate = (await crypto.subtle.exportKey('jwk', serverKeys.privateKey)).d!
  vi.stubEnv('WEB_PUSH_PUBLIC_KEY', serverPublic)
  vi.stubEnv('WEB_PUSH_PRIVATE_KEY', serverPrivate)
  vi.stubEnv('WEB_PUSH_SUBJECT', 'mailto:synthetic@example.invalid')
  await t.run(async (ctx) => {
    const delivery = (await ctx.db.get(deliveryId))!
    await ctx.db.patch(delivery.subscriptionId, { keys: { p256dh: browserPublic, auth: keys.auth } })
  })
  const fetch = vi.fn(async () => new Response(null, { status: 201 }))
  vi.stubGlobal('fetch', fetch)
  await t.action(internal.push.send, { deliveryId })
  expect(fetch).toHaveBeenCalledOnce()
  const [destination, request] = fetch.mock.calls[0] as unknown as [string, RequestInit]
  expect(destination).toBe(endpoint)
  expect(request.redirect).toBe('error')
  expect((request.headers as Record<string, string>)['content-encoding']).toBe('aes128gcm')
  expect(new TextDecoder().decode(request.body as Uint8Array)).not.toContain('laundry step')
  // Independently receive the RFC 8291 message using the synthetic browser's private key.
  // Merely checking that ciphertext lacks readable text would also accept an unusable message.
  const bytes = new Uint8Array(request.body as Uint8Array)
  const salt = bytes.slice(0, 16)
  expect(new DataView(bytes.buffer).getUint32(16)).toBeGreaterThan(bytes.length - 21 - bytes[20]!)
  expect(bytes[20]).toBe(65)
  const senderPublic = bytes.slice(21, 21 + bytes[20]!)
  const sender = await crypto.subtle.importKey('raw', senderPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: sender }, browserKeys.privateKey, 256)
  const text = new TextEncoder()
  const decode = (value: string) => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (letter) => letter.charCodeAt(0))
  const derive = async (input: ArrayBuffer, salt: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, bits: number) => {
    const key = await crypto.subtle.importKey('raw', input, 'HKDF', false, ['deriveBits'])
    return crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bits)
  }
  const info = Uint8Array.from([...text.encode('WebPush: info\0'), ...decode(browserPublic), ...senderPublic])
  const material = await derive(shared, decode(keys.auth), info, 256)
  const contentKey = await derive(material, salt, text.encode('Content-Encoding: aes128gcm\0'), 128)
  const nonce = await derive(material, salt, text.encode('Content-Encoding: nonce\0'), 96)
  const aes = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, bytes.slice(21 + bytes[20]!)))
  let delimiter = plain.length - 1
  while (delimiter >= 0 && plain[delimiter] === 0) delimiter -= 1
  expect(plain[delimiter]).toBe(2)
  expect(JSON.parse(new TextDecoder().decode(plain.slice(0, delimiter)))).toEqual({
    title: 'A Laundered Closet', body: 'A laundry step needs your attention.', tag: `laundry-${(await t.run((ctx) => ctx.db.get(deliveryId)))!.reminderId}`, url: '/laundry',
  })
  // RFC 8292: authenticate the actual outgoing token, including its intended push service.
  const authorization = (request.headers as Record<string, string>).authorization
  expect(authorization).toMatch(/^vapid t=/)
  expect(authorization).toContain(`k=${serverPublic}`)
  const token = authorization!.match(/t=([^,]+)/)![1]!
  const [header, claims, signature] = token.split('.') as [string, string, string]
  expect(JSON.parse(new TextDecoder().decode(decode(header)))).toMatchObject({ alg: 'ES256' })
  expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, serverKeys.publicKey, decode(signature), text.encode(`${header}.${claims}`))).toBe(true)
  const verified = JSON.parse(new TextDecoder().decode(decode(claims)))
  expect(verified).toMatchObject({ aud: new URL(endpoint).origin, sub: 'mailto:synthetic@example.invalid' })
  expect(verified.exp).toBeGreaterThan(Date.now() / 1000)
  expect(verified.exp).toBeLessThanOrEqual(Math.ceil(Date.now() / 1000) + 24 * 60 * 60)
  expect(await t.run((ctx) => ctx.db.get(deliveryId))).toMatchObject({ status: 'sent', attempts: 1, sentAt: expect.any(Number) })
  await t.action(internal.push.send, { deliveryId })
  expect(fetch).toHaveBeenCalledOnce()
})

test('a step reminder goes to whoever asked, else the plan creator, else whoever started the wash', () => {
  const session = { planCreatedBy: 'creator', startedBy: 'starter' }
  expect(stepRecipient({}, session)).toBe('creator')
  expect(stepRecipient({}, { startedBy: 'starter' })).toBe('starter')
  expect(stepRecipient({ recipientPrincipalKey: 'asker' }, session)).toBe('asker')
})

test('a step reminder is pushed to the plan creator, else to whoever started the wash', async () => {
  vi.stubEnv('WEB_PUSH_PUBLIC_KEY', 'public'); vi.stubEnv('WEB_PUSH_PRIVATE_KEY', 'private'); vi.stubEnv('WEB_PUSH_SUBJECT', 'mailto:synthetic@example.invalid')
  for (const hasCreator of [true, false]) {
    const t = newBackend()
    const starter = signedIn(t, 'starter')
    const home = await intakeHousehold(starter)
    const creator = await joinHousehold(t, starter, home.householdId, 'creator', 'Sam')
    const [starterKey, creatorKey] = [await keyOf(starter), await keyOf(creator)]
    const starterSub = (await starter.mutation(api.notifications.subscribe, { deviceId: 'phone', endpointHash: 'a', endpoint, keys })).subscriptionId
    const creatorSub = (await creator.mutation(api.notifications.subscribe, { deviceId: 'phone', endpointHash: 'b', endpoint: `${endpoint}2`, keys })).subscriptionId
    const now = Date.now()
    const reminderId = await t.run(async (ctx) => {
      const planId = await ctx.db.insert('plans', { householdId: home.householdId, createdBy: creatorKey, plannerVersion: 'test', inputHash: 'test', inputSnapshot: {}, result: {}, status: 'used', createdAt: now })
      const sessionId = await ctx.db.insert('sessions', { householdId: home.householdId, planId, textileIds: [home.shirt], startedBy: starterKey, ...(hasCreator ? { planCreatedBy: creatorKey } : {}), idempotencyKey: 'step', status: 'running', revision: 0 })
      await ctx.db.insert('timelines', { householdId: home.householdId, sessionId, startedAt: now, status: 'pending', revision: 0, createdAt: now,
        actions: [{ id: 'start', kind: 'task', task: 'start', phase: 'start', title: 'Press Start', detail: null, order: 0, status: 'pending' }] })
      return await ctx.db.insert('reminders', { householdId: home.householdId, sessionId, actionId: 'start', status: 'sent', dueAt: now })
    })
    await t.mutation(internal.pushDelivery.enqueue, { reminderId })
    const deliveries = await t.run((ctx) => ctx.db.query('pushDeliveries').collect())
    expect(deliveries.map((delivery) => delivery.subscriptionId)).toEqual([hasCreator ? creatorSub : starterSub])
  }
})
