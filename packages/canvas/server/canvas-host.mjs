import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'
import { civicReview } from '@civic/vite-connector'
import { loadProject } from '@civic/vite-connector/project'
import { coverageBridge } from '@civic/vite-connector/coverage'
import { canvasRoot } from './canvas-root.mjs'
import { moduleReviewAdapter } from './module-adapter.mjs'
import { runtimeService } from './runtime-service.mjs'
import { serverFunctionsPlugin } from './server-functions.mjs'

/** Where a standalone canvas keeps its review store, outside every app checkout. */
export const defaultStore = () => resolve(process.env.CIVIC_STORE ?? join(homedir(), '.civic', 'canvas'))

/**
 * The Vite plugins for a canvas host: React, and CIVIC's Vite connector serving this package's canvas.
 * `store` is the folder that owns `.review-data`; connecting an app never writes into the app.
 * `connectors`, `runtime` and `review` are passed to `civicReview`; without them only module apps connect,
 * and live runs use CIVIC's run service for apps that declare a runtime entry. An app's TanStack Start
 * server functions are sent to its live run.
 */
export function canvasPlugins({ store = defaultStore(), connectors = {}, runtime = runtimeService, review = () => ({}) } = {}) {
  let appRoot
  return [react(), serverFunctionsPlugin({ appRoot: () => { try { return appRoot ??= loadProject(store).root } catch { return null } }, side: 'client' }), civicReview({
    host: canvasRoot,
    canvas: canvasRoot,
    repo: store,
    connectors,
    runtime,
    engineRoots: [join(canvasRoot, 'src'), join(canvasRoot, 'server')],
    review: async (context) => ({
      adapter: moduleReviewAdapter,
      coverage: (inputs) => coverageBridge({ repo: store, contractFile: context.project.coverageFile, contractRoot: context.project.manifestRoot, ...inputs }),
      ...await review(context),
    }),
  })]
}

/**
 * Starts the canvas on its own for any app with a `civic.project.json`, with no host workspace.
 * The project picker in the canvas can connect more apps later; they are remembered in the store.
 */
export async function startCanvas({ project, store = defaultStore(), port = 3020, logLevel = 'info' } = {}) {
  mkdirSync(store, { recursive: true, mode: 0o700 })
  // The plugin is rebuilt from the config file on every restart, so selections go through the environment.
  process.env.CIVIC_STORE = store
  if (project) process.env.CIVIC_PROJECT = resolve(project)
  const server = await createServer({ configFile: join(canvasRoot, 'vite.config.mjs'), root: canvasRoot, cacheDir: join(store, '.vite'), logLevel, server: { host: '127.0.0.1', port, strictPort: true } })
  await server.listen()
  return server
}
