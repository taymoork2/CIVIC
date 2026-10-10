import { expect, test } from 'vitest'

import serviceWorkerSource from '../public/service-worker.js?raw'

type Policy = (request: { method: string; url: string; mode?: string; headers: { get(name: string): string | null } }, origin: string) => 'asset' | 'shell' | null
type Storable = (response: { status: number; type: string; headers: { get(name: string): string | null } }) => boolean
type Worker = {
  cachePolicy: Policy
  storable: Storable
  shellAssets: (html: string) => string[]
  loadedAssets: (urls: unknown, origin: string) => string[]
  withTimeout: <T>(promise: Promise<T>, ms: number) => Promise<T | null>
  pushDestination: (value: unknown) => string
}

// Evaluate the worker with a stand-in global scope to reach its pure cache policy.
function loadWorker() {
  const module = { exports: {} as Worker }
  const self = { location: { href: 'https://washcloset.test/service-worker.js?build=test', origin: 'https://washcloset.test' }, addEventListener() {} }
  new Function('self', 'module', 'caches', serviceWorkerSource)(self, module, {})
  return module.exports
}

const headers = (values: Record<string, string> = {}) => ({ get: (name: string) => values[name.toLowerCase()] ?? null })
const request = (url: string, extra: { method?: string; mode?: string; headers?: Record<string, string> } = {}) => ({ method: extra.method ?? 'GET', url, mode: extra.mode, headers: headers(extra.headers) })

test('notification destinations stay within laundry and use no supplied lock-screen names', async () => {
  const { pushDestination } = loadWorker()
  expect(pushDestination('/session/abc123')).toBe('/session/abc123')
  for (const value of ['https://evil.test', '//evil.test', '/account', '/laundry?token=private', null]) expect(pushDestination(value)).toBe('/laundry')
  const handlers: Record<string, (event: any) => void> = {}
  const notices: unknown[] = []
  const self = { location: { href: 'https://washcloset.test/service-worker.js', origin: 'https://washcloset.test' }, addEventListener(name: string, handler: (event: any) => void) { handlers[name] = handler }, registration: { async showNotification(title: string, options: unknown) { notices.push({ title, options }) } } }
  new Function('self', 'module', 'caches', serviceWorkerSource)(self, { exports: {} }, {})
  let finished = Promise.resolve() as Promise<unknown>
  handlers.push!({ data: { json: () => ({ body: 'Private garment name', title: 'Private household', url: '//evil.test', tag: 'step-1' }) }, waitUntil(value: Promise<unknown>) { finished = value } })
  await finished
  expect(notices).toEqual([{ title: 'A Laundered Closet', options: { body: 'A laundry step needs your attention.', tag: 'step-1', icon: '/icons/laundered-closet-192.png', data: { url: '/laundry' } } }])
  handlers.push!({ data: { json: () => null }, waitUntil(value: Promise<unknown>) { finished = value } })
  await finished
  expect(notices[1]).toMatchObject({ options: { tag: 'laundry-step', data: { url: '/laundry' } } })
})

test('the service worker caches only public static content and neutral page shells', () => {
  const { cachePolicy } = loadWorker()
  const origin = 'https://washcloset.test'
  expect(cachePolicy(request(`${origin}/assets/index-abc123.js`), origin)).toBe('asset')
  expect(cachePolicy(request(`${origin}/icons/laundered-closet-192.png`), origin)).toBe('asset')
  expect(cachePolicy(request(`${origin}/closet`, { mode: 'navigate' }), origin)).toBe('shell')

  expect(cachePolicy(request(`${origin}/api/auth/get-session`), origin)).toBeNull()
  expect(cachePolicy(request(`${origin}/api/auth/token`), origin)).toBeNull()
  expect(cachePolicy(request('https://happy-animal-123.convex.cloud/api/query'), origin)).toBeNull()
  expect(cachePolicy(request('https://happy-animal-123.convex.site/care-photo?token=x'), origin)).toBeNull()
  expect(cachePolicy(request(`${origin}/assets/index.js`, { method: 'POST' }), origin)).toBeNull()
  expect(cachePolicy(request(`${origin}/assets/index.js`, { headers: { authorization: 'Bearer x' } }), origin)).toBeNull()
})

test('responses marked private or no-store are never stored', () => {
  const { storable } = loadWorker()
  expect(storable({ status: 200, type: 'basic', headers: headers() })).toBe(true)
  expect(storable({ status: 200, type: 'basic', headers: headers({ 'cache-control': 'private, no-store' }) })).toBe(false)
  expect(storable({ status: 200, type: 'opaque', headers: headers() })).toBe(false)
  expect(storable({ status: 500, type: 'basic', headers: headers() })).toBe(false)
})

test('install precaches the script and style files the page shell references, each once', () => {
  const { shellAssets } = loadWorker()
  const html = '<link rel="stylesheet" href="/assets/index-a1.css"><script type="module" src="/assets/index-b2.js"></script>'
    + '<link rel="modulepreload" href="/assets/index-b2.js"><style>body{background:url(/assets/bg-c3.png)}</style><a href="/closet">x</a>'
  expect(shellAssets(html)).toEqual(['/assets/index-a1.css', '/assets/index-b2.js', '/assets/bg-c3.png'])
  expect(shellAssets('')).toEqual([])
})

test('install fetches the neutral shell without signed-in cookies', async () => {
  const requests: Request[] = []
  let install: (event: { waitUntil(promise: Promise<unknown>): void }) => void = () => { throw new Error('Missing install handler') }
  const self = { location: { href: 'https://washcloset.test/service-worker.js?build=test', origin: 'https://washcloset.test' },
    addEventListener(name: string, handler: typeof install) { if (name === 'install') install = handler } }
  const cache = { async addAll(input: Request[]) { requests.push(...input) }, async match() { return undefined } }
  const fetched: Request[] = []
  const fetchManifest = async (request: Request) => {
    fetched.push(request)
    return { status: 200, type: 'basic', headers: headers(), async json() { return ['/assets/index-a.js', '/assets/lazy-checklist-b.js', '/assets/SourceSans3-Variable-a.woff2', '/assets/SourceSerif4-Roman-b.woff2', '/assets/SourceSerif4-Italic-c.woff2'] } }
  }
  new Function('self', 'module', 'caches', 'fetch', serviceWorkerSource)(self, { exports: {} }, { async open() { return cache } }, fetchManifest)
  let done = Promise.resolve() as Promise<unknown>
  install({ waitUntil(promise) { done = promise } })
  await done
  expect(requests.some((request) => new URL(request.url).pathname === '/')).toBe(true)
  expect(requests.every((request) => request.credentials === 'omit')).toBe(true)
  expect(requests.some((request) => new URL(request.url).pathname === '/assets/lazy-checklist-b.js')).toBe(true)
  expect(requests.filter((request) => new URL(request.url).pathname.endsWith('.woff2')).map((request) => new URL(request.url).pathname)).toEqual([
    '/assets/SourceSans3-Variable-a.woff2', '/assets/SourceSerif4-Roman-b.woff2', '/assets/SourceSerif4-Italic-c.woff2',
  ])
  expect(fetched.every((request) => request.credentials === 'omit')).toBe(true)
})

test('an incomplete install or a manifest naming private routes cannot claim offline readiness', async () => {
  for (const manifest of [[], ['/api/auth/get-session'], ['/assets/index.js', 'https://other.test/assets/private.js'], ['/assets/index.js?token=secret'], ['/assets/index.js', '/assets/private.json'], ['/assets/font.woff2?token=secret']]) {
    let install: (event: { waitUntil(promise: Promise<unknown>): void }) => void = () => { throw new Error('Missing install') }
    let cached = false
    const self = { location: { href: 'https://washcloset.test/service-worker.js?build=test', origin: 'https://washcloset.test' }, addEventListener(name: string, handler: typeof install) { if (name === 'install') install = handler } }
    const fetchManifest = async () => ({ status: 200, type: 'basic', headers: headers(), async json() { return manifest } })
    new Function('self', 'module', 'caches', 'fetch', serviceWorkerSource)(self, { exports: {} }, { async open() { cached = true } }, fetchManifest)
    let done = Promise.resolve() as Promise<unknown>
    install({ waitUntil(promise) { done = promise } })
    await expect(done).rejects.toThrow('Invalid offline asset manifest')
    expect(cached).toBe(false)
  }
})

test('only same-origin /assets/ files the page reports are cached', () => {
  const { loadedAssets } = loadWorker()
  const origin = 'https://washcloset.test'
  expect(loadedAssets([
    `${origin}/assets/route-wash-d4.js`,
    `${origin}/assets/route-wash-d4.js`,
    `${origin}/api/auth/get-session`,
    'https://happy-animal-123.convex.cloud/assets/x.js',
    `${origin}/assets/x.js?token=secret`,
    42,
    'not a url ::',
  ], origin)).toEqual(['/assets/route-wash-d4.js'])
  expect(loadedAssets('nope', origin)).toEqual([])
})

test('a page fetch waits at most the timeout before the cache is used', async () => {
  const { withTimeout } = loadWorker()
  await expect(withTimeout(Promise.resolve('network'), 50)).resolves.toBe('network')
  await expect(withTimeout(new Promise(() => undefined), 5)).resolves.toBeNull()
  await expect(withTimeout(Promise.reject(new Error('offline')), 50)).rejects.toThrow('offline')
})
