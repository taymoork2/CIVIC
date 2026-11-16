import { Effect } from 'effect'
import { createServer } from 'vite'
import { managedHost } from './app-server.mjs'
import { canvasPlugins } from './canvas-host.mjs'
import { canvasRoot } from './canvas-root.mjs'

const noop = () => Promise.resolve()

export function runManagedCanvas({ store, build, port = 0, project }) {
  return managedHost({ store, build, port, viewer: async (listener, presence, { runtime }) => {
    let current, dispose = noop, closed = false, restarting = Promise.resolve()
    const start = async () => {
      const server = await createServer({ configFile: false, root: canvasRoot, plugins: canvasPlugins({ store, project, runtime, restart, managed: { listener, presence, dispose: fn => { dispose = fn } } }), server: { host: '127.0.0.1', middlewareMode: true, hmr: { server: listener } } })
      if (closed) { await dispose(); await server.close(); throw Error('Viewer stopped during startup') }
      current = server
    }
    const restart = () => {
      const previous = restarting
      restarting = (async () => { await previous; const old = current; current = null; presence.revoke(); try { await dispose() } finally { await old?.close() } if (!closed) await start() })()
      return restarting
    }
    try { await start() } catch (error) { await dispose(); await current?.close(); throw error }
    return { handle: (req, res) => { if (current) current.middlewares(req, res); else { res.writeHead(503); res.end('Starting') } }, close: async () => { closed = true; presence.revoke(); try { await restarting; await dispose() } finally { await current?.close() } } }
  } })
}

export const startManagedCanvas = options => Effect.runPromise(runManagedCanvas(options))
