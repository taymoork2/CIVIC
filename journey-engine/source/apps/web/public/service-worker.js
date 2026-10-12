// WashCloset service worker: static assets and the neutral page shell only.
// Private data lives in Convex and never passes through these caches: /api (auth),
// cross-origin requests (Convex), and non-GET requests are left to the network.

const BUILD = new URL(self.location.href).searchParams.get('build') || 'development'
const CACHE = `washcloset-static-${BUILD}`
const PRECACHE = ['/', '/manifest.webmanifest', '/icons/laundered-closet.svg', '/icons/laundered-closet-192.png', '/icons/laundered-closet-512.png', '/icons/laundered-closet-maskable-512.png', '/icons/laundered-closet-apple-touch.png']
// On weak signal a page load waits this long for the network before the cached shell is used.
const PAGE_TIMEOUT_MS = 2500

/** Returns how a request is handled: 'asset' (cache first), 'shell' (network first), or null (not handled). */
function cachePolicy(request, origin) {
  if (request.method !== 'GET') return null
  const url = new URL(request.url)
  if (url.origin !== origin) return null
  if (url.pathname.startsWith('/api/')) return null
  if (request.headers.get('authorization')) return null
  if (request.mode === 'navigate') return 'shell'
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') return 'asset'
  return null
}

/** Only plain successful same-origin responses that the server allows to be stored are cached. */
function storable(response) {
  if (!response || response.status !== 200 || response.type !== 'basic') return false
  const cacheControl = response.headers.get('cache-control') || ''
  return !/no-store|private/i.test(cacheControl)
}

/** The same-origin `/assets/…` paths a page's HTML references, each once, in order. */
function shellAssets(html) {
  const found = []
  for (const match of String(html).matchAll(/["'(](\/assets\/[^"'()?#\s]+)/g)) {
    if (!found.includes(match[1])) found.push(match[1])
  }
  return found
}

/** Keeps only same-origin `/assets/…` paths from URLs the page reports; anything else is ignored. */
function loadedAssets(urls, origin) {
  if (!Array.isArray(urls)) return []
  const found = []
  for (const value of urls) {
    if (typeof value !== 'string') continue
    let url
    try {
      url = new URL(value, origin)
    } catch {
      continue
    }
    if (url.origin !== origin || !url.pathname.startsWith('/assets/') || url.search !== '') continue
    if (!found.includes(url.pathname)) found.push(url.pathname)
  }
  return found
}

/** Stores each path not already cached; one failed asset never blocks the rest. */
function cacheAssets(cache, paths) {
  return Promise.all(paths.map((path) => cache.match(path).then((cached) => cached || fetch(path).then((response) => {
    if (storable(response)) return cache.put(path, response)
    return undefined
  })).catch(() => undefined)))
}

/** Resolves with the network response, or null once `ms` pass with no answer; network errors reject. */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms)
    promise.then((value) => { clearTimeout(timer); resolve(value) }, (error) => { clearTimeout(timer); reject(error) })
  })
}

self.addEventListener('install', (event) => {
  // Installation may happen after sign-in. Never send cookies when fetching the shell.
  event.waitUntil(fetch(new Request(new URL('/offline-assets.json', self.location.origin), { credentials: 'omit', cache: 'no-store' }))
    .then(async (response) => {
      if (!storable(response)) throw new Error('Offline asset manifest unavailable')
      const manifest = await response.json()
      const paths = loadedAssets(manifest, self.location.origin).filter((path) => /^\/assets\/[^?#]+\.(?:js|css|woff2)$/.test(path))
      if (!Array.isArray(manifest) || paths.length === 0 || paths.length !== manifest.length) throw new Error('Invalid offline asset manifest')
      return caches.open(CACHE).then((cache) => cache.addAll([...PRECACHE, ...paths].map((path) => new Request(new URL(path, self.location.origin), { credentials: 'omit' })))
    // The shell's own script and style files, so the first launch offline has its code.
    .then(() => cache.match('/'))
    .then((shell) => (shell ? shell.text() : ''))
    .then((html) => cacheAssets(cache, shellAssets(html))))
    }))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('washcloset-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
  // The page reports the code it loaded before this worker was in control, and lazy chunks since.
  if (event.data && event.data.type === 'CACHE_ASSETS') {
    const paths = loadedAssets(event.data.urls, self.location.origin)
    if (paths.length > 0) event.waitUntil(caches.open(CACHE).then((cache) => cacheAssets(cache, paths)))
  }
})

/** Only internal laundry destinations can be opened by a notification. */
function pushDestination(value) {
  return typeof value === 'string' && /^\/(?:laundry|session\/[a-zA-Z0-9]+)$/.test(value) ? value : '/laundry'
}

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    const parsed = event.data ? event.data.json() : null
    if (parsed && typeof parsed === 'object') payload = parsed
  } catch { /* A generic prompt still works. */ }
  event.waitUntil(self.registration.showNotification('A Laundered Closet', {
    body: 'A laundry step needs your attention.',
    tag: typeof payload.tag === 'string' ? payload.tag.slice(0, 120) : 'laundry-step',
    icon: '/icons/laundered-closet-192.png',
    data: { url: pushDestination(payload.url) },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(pushDestination(event.notification.data?.url), self.location.origin).href
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
    const client = clients.find((candidate) => new URL(candidate.url).origin === self.location.origin)
    if (client) { await client.navigate(url); return client.focus() }
    return self.clients.openWindow(url)
  }))
})

self.addEventListener('fetch', (event) => {
  const policy = cachePolicy(event.request, self.location.origin)
  if (policy === 'asset') {
    event.respondWith(
      // These are same-origin public static files. Module requests add Origin, but the
      // precache fetch doesn't; Vary: Origin must not hide the identical hashed asset.
      caches.match(event.request, { ignoreVary: true }).then((cached) => cached || fetch(event.request).then((response) => {
        if (storable(response)) {
          const copy = response.clone()
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)))
        }
        return response
      })),
    )
  } else if (policy === 'shell') {
    // Only credential-free pages are neutral; authenticated SSR is private/no-store.
    // The network gets 2.5s; then the cached shell answers, and a late response still refreshes the cache.
    const path = new URL(event.request.url).pathname
    const cachedShell = () => caches.match(path).then((cached) => cached || caches.match('/'))
    const network = fetch(event.request).then((response) => {
      if (storable(response)) {
        const copy = response.clone()
        event.waitUntil(caches.open(CACHE).then((cache) => cache.put(path, copy)))
      }
      return response
    })
    event.waitUntil(network.catch(() => undefined))
    event.respondWith(
      withTimeout(network, PAGE_TIMEOUT_MS)
        // Nothing cached yet: keep waiting on the network rather than showing an error.
        .then((response) => response || cachedShell().then((cached) => cached || network))
        .catch(() => cachedShell().then((cached) => cached || Response.error())),
    )
  }
})

if (typeof module !== 'undefined') module.exports = { cachePolicy, storable, shellAssets, loadedAssets, withTimeout, pushDestination }
