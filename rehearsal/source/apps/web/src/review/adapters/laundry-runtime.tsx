import { createRoot } from 'react-dom/client'
import { ConvexProviderWithAuth } from 'convex/react'
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import { routeTree } from 'virtual:rehearsal-laundry-routes'
import { openLaundrySession } from './laundry-session'
import type { AdapterContext } from '@civic/canvas/adapter'
import '@/app.css'
import '@/generated/tokens.css'

const syntheticAuth = () => ({ isLoading: false, isAuthenticated: true, fetchAccessToken: async () => 'isolated-runtime' })

export async function mountLaundryRuntime(container: HTMLElement, context: AdapterContext) {
  if (context.scenario.route?.includes('$')) throw Error('This route needs a concrete starting address. Reach it through the app or declare its fixture parameters.')
  const runtime = await openLaundrySession(context)
  const { session, transport, client } = runtime
  const root = createRoot(container)
  const initialPath = context.scenario.route ?? (context.scenario.id.startsWith('app.drying') ? '/drying' : '/')
  const newRouter = () => createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [initialPath] }), defaultPendingMinMs: 0 })
  let router = newRouter(), incarnation = 0, lastData: unknown = null
  const listeners = new Set<() => void>()
  const observeRouter = () => router.subscribe('onResolved', () => { for (const listener of listeners) listener() })
  let unsubscribe = observeRouter()
  const dispose = () => {
    unsubscribe(); root.unmount(); runtime.close()
  }
  const render = () => root.render(<ConvexProviderWithAuth key={incarnation} client={client} useAuth={syntheticAuth}><RouterProvider router={router} /><Toaster position="top-center" /></ConvexProviderWithAuth>)
  try {
  render()
  const route = () => router.state.location.href
  const settle = async () => {
    await runtime.settle()
    if (router.state.status === 'pending') await router.load()
    lastData = runtime.data()
  }
  await router.load(); await settle()
  const bridge = context.connectRuntime({
    seed: runtime.seed, now: session.now,
    route, subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } }, assertSource: runtime.assertSource, settle, data: () => ({ ...lastData as object, path: route() }), captureInputs: 'synthetic',
    screen: () => {
      const path = router.state.matches.at(-1)?.routeId ?? router.state.location.pathname
      if (router.state.location.pathname === initialPath) return context.scenario.id
      return path === '/' ? 'app.home' : `app.${path.slice(1).replaceAll('$', '').replace(/[^a-z0-9]+/gi, '.').toLowerCase()}`
    },
    reset: async () => {
      await runtime.reset(); incarnation++
      unsubscribe(); router = newRouter(); unsubscribe = observeRouter(); render(); await router.load(); await settle()
    },
  })
  transport.bind(bridge)
  return dispose
  } catch (error) { dispose(); throw error }
}
