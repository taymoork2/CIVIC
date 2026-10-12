import type { ConvexReactClient } from 'convex/react'
import { hasPendingSteps } from './pending-step'

/** Root screens can refresh; task routes and any open editor keep their current working state. */
export function updateReloadAllowed(client: Pick<ConvexReactClient, 'connectionState'>): boolean {
  const connection = client.connectionState()
  return document.visibilityState === 'visible' && navigator.onLine
    && connection.isWebSocketConnected && connection.inflightMutations === 0
    && ['/', '/closet', '/household', '/me', '/settings'].includes(window.location.pathname)
    && !document.querySelector('[role="dialog"], form, [aria-busy="true"]')
    && !document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')
    && !hasPendingSteps()
}

/** Discover releases even in a long-lived installed app; never activate a worker over another tab's draft. */
export function watchAppUpdates(build: string, client: Pick<ConvexReactClient, 'connectionState'>, onReady: () => void): () => void {
  let stopped = false
  let checking = false
  let ready = false
  let readyBuild = ''
  let reloading = false
  let lastCheck = 0
  let lastInteraction = Date.now()
  let registration: ServiceWorkerRegistration | null = null
  const cleanups: (() => void)[] = []
  let request: AbortController | null = null
  const activity = () => { lastInteraction = Date.now() }
  const reloadIfSafe = () => {
    if (stopped || reloading || !ready || Date.now() - lastInteraction < 3000 || !updateReloadAllowed(client)) return
    try {
      // A weak connection can serve the old offline shell again; attempt each release once per tab.
      if (window.sessionStorage.getItem('washcloset:update-reload') === readyBuild) return
      window.sessionStorage.setItem('washcloset:update-reload', readyBuild)
    } catch { return } // Without a durable loop guard, leave the notice and keep working.
    reloading = true
    // Fresh HTML loads the new build. SKIP_WAITING would also replace other tabs' workers and caches.
    window.location.reload()
  }
  const markReady = (latest: string) => {
    if (stopped || ready) return
    ready = true
    readyBuild = latest
    onReady()
    reloadIfSafe()
  }
  const check = async () => {
    // Offline installation downloads every route; let this page finish first.
    if (stopped || checking || document.readyState !== 'complete' || document.visibilityState !== 'visible' || !navigator.onLine) return
    checking = true
    lastCheck = Date.now()
    request = new AbortController()
    const timeout = window.setTimeout(() => request?.abort(), 10_000)
    try {
      const response = await fetch('/app-version.json', { cache: 'no-store', credentials: 'omit', signal: request.signal })
      if (!response.ok) return
      const version: unknown = await response.json()
      if (!version || typeof version !== 'object' || !('build' in version) || typeof version.build !== 'string' || version.build.length === 0 || version.build.length > 200 || stopped) return
      const latest = version.build
      if (!('serviceWorker' in navigator)) { if (latest !== build) markReady(latest); return }
      const next = await navigator.serviceWorker.register(`/service-worker.js?build=${encodeURIComponent(latest)}`, { updateViaCache: 'none' })
      if (stopped) return
      if (registration !== next) {
        registration = next
        const track = () => {
          const worker = next.installing
          if (!worker) return
          const installed = () => {
            const workerBuild = new URL(worker.scriptURL).searchParams.get('build')
            if (worker.state === 'installed' && workerBuild && workerBuild !== build) markReady(workerBuild)
          }
          worker.addEventListener('statechange', installed)
          cleanups.push(() => worker.removeEventListener('statechange', installed))
          installed()
        }
        next.addEventListener('updatefound', track)
        cleanups.push(() => next.removeEventListener('updatefound', track))
        track()
      }
      if (latest !== build && (next.waiting || next.active)?.scriptURL === new URL(`/service-worker.js?build=${encodeURIComponent(latest)}`, window.location.origin).href) markReady(latest)
    } catch { /* Offline or an incomplete deployment: keep working and check again later. */ }
    finally { window.clearTimeout(timeout); request = null; checking = false }
  }
  const resume = () => { void check(); reloadIfSafe() }
  for (const event of ['pointerdown', 'keydown', 'input']) {
    document.addEventListener(event, activity, true)
    cleanups.push(() => document.removeEventListener(event, activity, true))
  }
  document.addEventListener('visibilitychange', resume)
  window.addEventListener('pageshow', resume)
  window.addEventListener('focus', resume)
  window.addEventListener('online', resume)
  window.addEventListener('load', resume)
  const timer = window.setInterval(() => {
    if (Date.now() - lastCheck >= 60_000) void check()
    reloadIfSafe()
  }, 1000)
  void check()
  return () => {
    stopped = true
    request?.abort()
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', resume)
    for (const event of ['pageshow', 'focus', 'online', 'load']) window.removeEventListener(event, resume)
    cleanups.forEach((cleanup) => cleanup())
  }
}
