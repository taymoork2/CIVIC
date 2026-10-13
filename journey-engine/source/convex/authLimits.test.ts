import { afterEach, expect, test, vi } from 'vitest'
import { internal } from './_generated/api'
import { newBackend } from './harness.testing'
import { authOptions } from './auth'

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

test('auth consumption counts concurrent requests atomically and resets after the window', async () => {
  vi.useFakeTimers()
  const t = newBackend(), args = { key: 'synthetic|/sign-in/email', window: 10, max: 3 }
  const results = await Promise.all(Array.from({ length: 12 }, () => t.mutation(internal.authLimits.consume, args)))
  expect(results.filter(result => result.allowed)).toHaveLength(3)
  expect(results.filter(result => !result.allowed).every(result => result.retryAfter === 10)).toBe(true)
  expect((await t.query(internal.authLimits.get, { key: args.key }))?.count).toBe(3)
  vi.advanceTimersByTime(10_001)
  expect(await t.mutation(internal.authLimits.consume, args)).toEqual({ allowed: true, retryAfter: null })
  expect((await t.query(internal.authLimits.get, { key: args.key }))?.count).toBe(1)
})

test('auth limits default on, exempt public keys, ignore untrusted IP headers and expose atomic consume', async () => {
  const t = newBackend()
  await t.run(async ctx => {
    const options = authOptions(ctx)
    expect(options.rateLimit?.enabled).toBe(true)
    expect(options.rateLimit?.customRules?.['/convex/jwks']).toBe(false)
    expect(options.advanced?.ipAddress?.ipAddressHeaders).toEqual([])
    const storage = options.rateLimit!.customStorage!
    await storage.set('synthetic|/test', { key: 'synthetic|/test', count: 2, lastRequest: Date.now() })
    expect((await storage.get('synthetic|/test'))?.count).toBe(2)
    expect(await storage.consume!('synthetic|/test', { window: 10, max: 2 })).toMatchObject({ allowed: false })
  })
  vi.stubEnv('WASHCLOSET_AUTH_RATE_LIMIT', 'disabled')
  await t.run(async ctx => { expect(authOptions(ctx).rateLimit?.enabled).toBe(false) })
})
