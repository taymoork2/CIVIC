import { Effect } from 'effect'
import { createServer } from 'vite'
import { managedHost } from './app-server.mjs'
import { canvasPlugins } from './canvas-host.mjs'
import { canvasRoot } from './canvas-root.mjs'
import { deadlines } from './server-lifecycle.mjs'
import { awakeTimeout } from './awake-clock.mjs'

export function holdRestart(restarting, res, wait = (effect, signal) => Effect.runPromise(effect, { signal })) {
  const abort = new AbortController()
  const cancel = () => abort.abort()
  res.once('close', cancel)
  return wait(awakeTimeout(Effect.promise(() => restarting), deadlines.boot), abort.signal).then(() => true).catch(() => {
    if (!res.destroyed) { res.writeHead(503, { 'content-type': 'text/plain', 'retry-after': '1' }); res.end('The review could not restart. Please reload to try again.') }
    return false
  }).finally(() => res.off('close', cancel))
}

const noop = () => Promise.resolve()

export function runManagedCanvas({ store, build, port = 0, project, ready }) {
  return managedHost({ store, build, port, ready, viewer: async (listener, presence, { runtime }) => {
    let current, dispose = noop, closed = false, restarting = Promise.resolve()
    const start = async () => {
      const server = await createServer({ configFile: false, root: canvasRoot, plugins: canvasPlugins({ store, project, runtime, restart, managed: { listener, presence, dispose: fn => { dispose = fn } } }), server: { host: '127.0.0.1', middlewareMode: true, hmr: { server: listener } } })
      if (closed) { await dispose(); await server.close(); throw Error('Viewer stopped during startup') }
      current = server
    }
    const restart = () => {
      const previous = restarting
      restarting = (async () => {
        await previous
        const old = current
        current = null
        presence.revoke()
        // A retiring compiler must not reload documents into the startup gap.
        if (old) {
          const hot = old.environments.client.hot, send = hot.send.bind(hot)
          hot.send = (...args) => { if (args[0]?.type !== 'full-reload') send(...args) }
        }
        try { await dispose() } finally { await old?.close() }
        if (!closed) await start()
      })()
      return restarting
    }
    try { await start() } catch (error) { await dispose(); await current?.close(); throw error }
    return { handle: async (req, res) => {
      if (!current && !await holdRestart(restarting, res)) return
      if (res.destroyed) return
      if (closed || !current) { res.writeHead(503); res.end('The review has stopped. Please open it again.'); return }
      current.middlewares(req, res)
    }, close: async () => { closed = true; presence.revoke(); try { await restarting; await dispose() } finally { await current?.close() } } }
  } })
}

export const startManagedCanvas = options => Effect.runPromise(runManagedCanvas(options))
