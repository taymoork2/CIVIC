import { afterEach, expect, test, vi } from 'vitest'
import { clearPushDevice } from './push-settings'

const mutation = vi.hoisted(() => vi.fn(async () => null))
vi.mock('convex/browser', () => ({ ConvexHttpClient: class { setAuth() {} mutation = mutation } }))
vi.mock('@/convex-url', () => ({ convexUrl: () => 'https://synthetic.convex.cloud' }))
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); mutation.mockClear() })

test.each(['default', 'denied'])('sign-out skips browser push cleanup with %s permission but still revokes the device', async permission => {
  const getRegistration = vi.fn(() => new Promise(() => {}))
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration } })
  vi.stubGlobal('window', { Notification: { permission } })
  vi.stubGlobal('Notification', { permission })
  vi.stubGlobal('localStorage', { getItem: () => 'synthetic-device' })
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ token: 'synthetic-token' }) })))
  await clearPushDevice()
  expect(getRegistration).not.toHaveBeenCalled()
  expect(mutation).toHaveBeenCalledWith(expect.anything(), { deviceId: 'synthetic-device' })
})

test('sign-out unsubscribes a permitted browser before revoking its device', async () => {
  const unsubscribe = vi.fn(async () => true)
  const getRegistration = vi.fn(async () => ({ pushManager: { getSubscription: async () => ({ unsubscribe }) } }))
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration } })
  vi.stubGlobal('window', { Notification: { permission: 'granted' } })
  vi.stubGlobal('Notification', { permission: 'granted' })
  vi.stubGlobal('localStorage', { getItem: () => null })
  await clearPushDevice()
  expect(unsubscribe).toHaveBeenCalledOnce()
  expect(mutation).not.toHaveBeenCalled()
})
