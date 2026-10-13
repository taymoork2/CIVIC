import { createRoot } from 'react-dom/client'
import { ConvexProviderWithAuth } from 'convex/react'
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import { routeTree } from 'virtual:rehearsal-laundry-routes'
import { PrivateScope } from 'virtual:rehearsal-private-scope'
import { openLaundrySession } from './laundry-session'
import { authClient } from './laundry-auth'
import type { AdapterContext } from '@civic/canvas/adapter'
import '@/app.css'
import '@/generated/tokens.css'

const syntheticAuth = () => ({ isLoading: false, isAuthenticated: true, fetchAccessToken: async () => 'isolated-runtime' })

export async function mountLaundryRuntime(container: HTMLElement, context: AdapterContext) {
  if (context.scenario.route?.includes('$')) throw Error('This route needs a concrete starting address. Reach it through the app or declare its fixture parameters.')
  const runtime = await openLaundrySession(context)
  const { session, transport, client } = runtime
  const root = createRoot(container)
  const family = context.scenario.id.startsWith('family.')
  // A reopened run returns to the address it was on.
  const restoredPath = new URLSearchParams(location.search).get('runtimePath')
  if (restoredPath && (!restoredPath.startsWith('/') || restoredPath.startsWith('//') || restoredPath.length > 2000)) throw Error('Invalid saved application route')
  const initialPath = restoredPath ?? context.scenario.route ?? (context.scenario.id.startsWith('app.drying') || context.scenario.id === 'family.drying' || context.scenario.id === 'family.putaway' ? '/drying' : family ? '/laundry' : '/')
  const newRouter = () => createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [initialPath] }), defaultPendingMinMs: 0 })
  let router = newRouter(), incarnation = 0, lastData: unknown = null
  const listeners = new Set<() => void>()
  const observeRouter = () => router.subscribe('onResolved', () => { for (const listener of listeners) listener() })
  let unsubscribe = observeRouter()
  const dispose = () => {
    unsubscribe(); root.unmount(); runtime.close()
  }
  // Private pieces and the app's own saved steps belong to the synthetic account acting now.
  const Scope = () => <PrivateScope subject={authClient.useSession().data.user.id} householdId={session.seed.householdId}><RouterProvider router={router} /><Toaster position="top-center" /></PrivateScope>
  const render = () => root.render(<ConvexProviderWithAuth key={incarnation} client={client} useAuth={syntheticAuth}><Scope /></ConvexProviderWithAuth>)
  try {
  const route = () => router.state.location.href
  const settle = async () => {
    await runtime.settle()
    if (router.state.status === 'pending') await router.load()
    lastData = runtime.data()
  }
  const bridge = context.connectRuntime({
    seed: runtime.seed, now: session.now, run: runtime,
    route, subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } }, assertSource: runtime.assertSource, settle, data: () => ({ ...lastData as object, path: route() }), captureInputs: 'synthetic',
    screen: () => {
      const path = router.state.matches.at(-1)?.routeId ?? router.state.location.pathname
      if (router.state.location.pathname === initialPath) return context.scenario.id
      if (family && path === '/session/$sessionId') return 'family.washing'
      if (family && path === '/drying') return 'family.drying'
      if (family && path === '/laundry') return 'family.planning'
      return path === '/' ? 'app.home' : `app.${path.slice(1).replaceAll('$', '').replace(/[^a-z0-9]+/gi, '.').toLowerCase()}`
    },
    // Another account sees the same run through its own access: remount the app as that account.
    changed: async (step) => { if (step === 'identity') { incarnation++; render(); await router.load() } },
    reset: async () => {
      await runtime.reset(); incarnation++
      unsubscribe(); router = newRouter(); unsubscribe = observeRouter(); render(); await router.load(); await settle()
    },
  })
  transport.bind(bridge)
  // Recording is attached before the first usable screen; readiness still waits for its state.
  render(); await router.load(); await settle()
  return dispose
  } catch (error) { dispose(); throw error }
}
