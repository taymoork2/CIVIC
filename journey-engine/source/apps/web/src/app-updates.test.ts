import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { updateReloadAllowed, watchAppUpdates } from './app-updates'

const connection = { isWebSocketConnected: true, inflightMutations: 0 }
const client = { connectionState: () => connection } as Parameters<typeof updateReloadAllowed>[0]
let documentState: EventTarget & { readyState: string; visibilityState: string; querySelector: ReturnType<typeof vi.fn>; activeElement: { matches: ReturnType<typeof vi.fn> } }
let windowState: EventTarget & { location: { pathname: string; origin: string; reload: ReturnType<typeof vi.fn> }; localStorage: { getItem: ReturnType<typeof vi.fn> }; sessionStorage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn> }; setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout; setInterval: typeof setInterval; clearInterval: typeof clearInterval }
let registration: EventTarget & { waiting: ServiceWorker | null; installing: ServiceWorker | null; active: ServiceWorker | null }
let stop: (() => void) | undefined
const worker = (build: string, state: ServiceWorkerState = 'installed') => Object.assign(new EventTarget(), { scriptURL: `https://test.local/service-worker.js?build=${build}`, state }) as unknown as ServiceWorker

beforeEach(() => {
  vi.useFakeTimers()
  Object.assign(connection, { isWebSocketConnected: true, inflightMutations: 0 })
  documentState = Object.assign(new EventTarget(), { readyState: 'complete', visibilityState: 'visible', querySelector: vi.fn(() => null), activeElement: { matches: vi.fn(() => false) } })
  windowState = Object.assign(new EventTarget(), { location: { pathname: '/closet', origin: 'https://test.local', reload: vi.fn() }, localStorage: { getItem: vi.fn(() => null) }, sessionStorage: { getItem: vi.fn<Storage['getItem']>(() => null), setItem: vi.fn() }, setTimeout, clearTimeout, setInterval, clearInterval })
  registration = Object.assign(new EventTarget(), { waiting: worker('new'), installing: null, active: worker('old', 'activated') })
  vi.stubGlobal('document', documentState)
  vi.stubGlobal('window', windowState)
  vi.stubGlobal('navigator', { onLine: true, serviceWorker: { register: vi.fn(async () => registration) } })
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ build: 'new' }) })))
})
afterEach(() => { stop?.(); stop = undefined; vi.unstubAllGlobals(); vi.useRealTimers() })

test('offline installation waits for initial assets and cancels on unmount', async () => {
  documentState.readyState = 'interactive'
  stop = watchAppUpdates('new', client, vi.fn())
  windowState.dispatchEvent(new Event('focus'))
  await vi.advanceTimersByTimeAsync(61_000)
  expect(fetch).not.toHaveBeenCalled()
  documentState.readyState = 'complete'
  windowState.dispatchEvent(new Event('load'))
  await vi.advanceTimersByTimeAsync(0)
  expect(navigator.serviceWorker.register).toHaveBeenCalledOnce()
  stop()
  windowState.dispatchEvent(new Event('load'))
  await vi.advanceTimersByTimeAsync(61_000)
  expect(navigator.serviceWorker.register).toHaveBeenCalledOnce()
})

test('reload safety blocks tasks, editors, hidden/offline screens, queued writes and unacknowledged steps', () => {
  expect(updateReloadAllowed(client)).toBe(true)
  for (const path of ['/laundry', '/session/123', '/drying', '/onboarding', '/create-account']) {
    windowState.location.pathname = path
    expect(updateReloadAllowed(client)).toBe(false)
  }
  windowState.location.pathname = '/closet'
  for (const change of [
    () => { documentState.visibilityState = 'hidden' },
    () => { Object.assign(navigator, { onLine: false }) },
    () => { connection.inflightMutations = 1 },
    () => { connection.isWebSocketConnected = false },
    () => { documentState.querySelector.mockReturnValue({} as never) },
    () => { documentState.activeElement.matches.mockReturnValue(true) },
    () => { windowState.localStorage.getItem.mockReturnValue(JSON.stringify([{ householdId: 'h', title: 'Step', args: { sessionId: 's', actionId: 'a', receiptId: 'receipt-1234567890', status: 'confirmed', at: 1 } }])) },
  ]) {
    change()
    expect(updateReloadAllowed(client)).toBe(false)
    documentState.visibilityState = 'visible'
    Object.assign(navigator, { onLine: true })
    Object.assign(connection, { isWebSocketConnected: true, inflightMutations: 0 })
    documentState.querySelector.mockReturnValue(null)
    documentState.activeElement.matches.mockReturnValue(false)
    windowState.localStorage.getItem.mockReturnValue(null)
  }
})

test('new builds use uncached version discovery, wait for quiet safe state and reload only once', async () => {
  const ready = vi.fn()
  connection.inflightMutations = 1
  stop = watchAppUpdates('old', client, ready)
  await vi.advanceTimersByTimeAsync(5000)
  expect(fetch).toHaveBeenCalledWith('/app-version.json', expect.objectContaining({ cache: 'no-store', credentials: 'omit' }))
  expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/service-worker.js?build=new', { updateViaCache: 'none' })
  expect(ready).toHaveBeenCalledOnce()
  expect(windowState.location.reload).not.toHaveBeenCalled()
  connection.inflightMutations = 0
  documentState.dispatchEvent(new Event('input'))
  await vi.advanceTimersByTimeAsync(2000)
  expect(windowState.location.reload).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(2000)
  expect(windowState.location.reload).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(5000)
  expect(windowState.location.reload).toHaveBeenCalledOnce()
})

test('current builds and first-install claims do not reload; missing manifests retry on reopen', async () => {
  vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response)
  stop = watchAppUpdates('new', client, vi.fn())
  await vi.advanceTimersByTimeAsync(5000)
  windowState.dispatchEvent(new Event('pageshow'))
  await vi.advanceTimersByTimeAsync(5000)
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(windowState.location.reload).not.toHaveBeenCalled()
})

test('an older cached shell cannot repeat its attempted release, and blocked session storage defers reload', async () => {
  windowState.sessionStorage.getItem.mockReturnValue('new')
  stop = watchAppUpdates('old', client, vi.fn())
  await vi.advanceTimersByTimeAsync(5000)
  expect(windowState.location.reload).not.toHaveBeenCalled()
  windowState.sessionStorage.getItem.mockReturnValue(null)
  windowState.sessionStorage.setItem.mockImplementation(() => { throw new Error('storage blocked') })
  await vi.advanceTimersByTimeAsync(5000)
  expect(windowState.location.reload).not.toHaveBeenCalled()
  windowState.sessionStorage.setItem.mockImplementation(() => undefined)
  await vi.advanceTimersByTimeAsync(1000)
  expect(windowState.sessionStorage.setItem).toHaveBeenLastCalledWith('washcloset:update-reload', 'new')
  expect(windowState.location.reload).toHaveBeenCalledOnce()
})

test('an update is not ready until installation succeeds, then a saved editor can close', async () => {
  registration.waiting = null
  const installing = worker('new', 'installing')
  registration.installing = installing
  const ready = vi.fn()
  documentState.querySelector.mockReturnValue({} as never)
  stop = watchAppUpdates('old', client, ready)
  await vi.advanceTimersByTimeAsync(5000)
  expect(ready).not.toHaveBeenCalled()
  Object.assign(installing, { state: 'installed' })
  installing.dispatchEvent(new Event('statechange'))
  expect(ready).toHaveBeenCalledOnce()
  expect(windowState.location.reload).not.toHaveBeenCalled()
  documentState.querySelector.mockReturnValue(null)
  await vi.advanceTimersByTimeAsync(1000)
  expect(windowState.location.reload).toHaveBeenCalledOnce()
})

test('a timed-out discovery can retry with a fresh signal and cleanup stops all checks', async () => {
  vi.mocked(fetch).mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('timeout')))))
  stop = watchAppUpdates('old', client, vi.fn())
  await vi.advanceTimersByTimeAsync(11_000)
  windowState.dispatchEvent(new Event('online'))
  await vi.advanceTimersByTimeAsync(1000)
  expect(windowState.location.reload).toHaveBeenCalledOnce()
  stop()
  windowState.dispatchEvent(new Event('pageshow'))
  await vi.advanceTimersByTimeAsync(60_000)
  expect(fetch).toHaveBeenCalledTimes(2)
})
