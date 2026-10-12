import { parentPort, workerData } from 'node:worker_threads'
import { join } from 'node:path'
import { createServer } from 'vite'
import { executeServerFunction } from '../src/server-functions-core.mjs'
import { serverFunctionsPlugin } from './server-functions.mjs'

// One isolated run: the project's runtime entry, loaded through Vite with the project's aliases and any generated modules.
const virtual = workerData.virtual ?? {}
const server = await createServer({
  configFile: false, root: workerData.root, appType: 'custom', logLevel: 'error',
  server: { middlewareMode: true, watch: null, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] },
  resolve: { alias: workerData.aliases },
  plugins: [serverFunctionsPlugin({ appRoot: () => workerData.appRoot, side: 'server' }), { name: 'civic-runtime-modules', resolveId: (id) => id in virtual ? '\0' + id : undefined, load: (id) => id.startsWith('\0') && id.slice(1) in virtual ? virtual[id.slice(1)] : undefined }],
})
const entry = await server.ssrLoadModule(workerData.entry)
if (!['createRuntime', 'createFetchRuntime', 'createServerFnRuntime'].some((name) => typeof entry[name] === 'function')) throw Error('Runtime entry must export createRuntime(seed), createFetchRuntime(seed) or createServerFnRuntime(seed).')
// These workers execute trusted application code; they never reach a network endpoint.
globalThis.fetch = async () => { throw Error('External requests are disabled in isolated review.') }
const RealDate = Date
globalThis.Date = new Proxy(RealDate, {
  construct: (target, args) => Reflect.construct(target, args.length ? args : [workerData.now]),
  apply: () => new RealDate(workerData.now).toString(),
  get: (target, key) => key === 'now' ? () => workerData.now : Reflect.get(target, key),
})

/** A fetch-handler backend behind the function protocol: `METHOD:/path` names, `{ query, body }` arguments, `{ status, type, body }` results. */
function fetchRuntime(app, seed) {
  return {
    seed: app.seed ?? { scenario: seed.scenario },
    state: async () => await app.state?.() ?? null,
    recover: async () => await app.recover?.() ?? null,
    async execute(kind, name, args) {
      const split = name.indexOf(':'), method = name.slice(0, split), path = name.slice(split + 1)
      if (!/^(?:GET|HEAD|POST|PUT|PATCH|DELETE)$/.test(method) || !path.startsWith('/')) throw Error('Invalid request name')
      if ((kind === 'query') !== ['GET', 'HEAD'].includes(method)) throw Error('Reads are queries and writes are mutations')
      const query = typeof args.query === 'string' && args.query.startsWith('?') ? args.query : ''
      const response = await app.fetch(new Request(`http://isolated.review${path}${query}`, { method, ...(typeof args.body === 'string' ? { body: args.body, headers: { 'content-type': args.type ?? 'application/json' } } : {}) }))
      if (!(response instanceof Response)) throw Error('fetch(request) must return a Response')
      return { status: response.status, type: response.headers.get('content-type') ?? '', body: await response.text() }
    },
  }
}

/**
 * TanStack Start server functions: `serverFn:<file>:<name>` names, loaded from the app's own module in this
 * run's module graph, so the app's server-side singletons are this run's alone. Other names go to `fetch`, if any.
 */
function serverFnRuntime(app, seed) {
  const http = typeof app.fetch === 'function' ? fetchRuntime(app, seed) : null
  return {
    seed: app.seed ?? { scenario: seed.scenario },
    state: async () => await app.state?.() ?? null,
    recover: async () => await app.recover?.() ?? null,
    async execute(kind, name, args) {
      if (!name.startsWith('serverFn:')) { if (http) return http.execute(kind, name, args); throw Error('Unknown server function') }
      const key = name.slice('serverFn:'.length), file = key.slice(0, key.lastIndexOf(':'))
      if (!/\.[cm]?[jt]sx?$/.test(file) || file.split('/').includes('node_modules')) throw Error('Unknown server function')
      await server.ssrLoadModule(join(workerData.appRoot, file))
      return executeServerFunction(kind, key, args, await app.context?.() ?? {})
    },
  }
}

let runtime
parentPort.on('message', async (message) => {
  try {
    if (message.action === 'start' || message.action === 'reset') {
      const seed = { scenario: workerData.scenario, persona: workerData.persona, role: workerData.role, condition: workerData.condition, now: workerData.now, timeZone: workerData.timeZone, namespace: workerData.namespace }
      runtime = entry.createRuntime ? await entry.createRuntime(seed) : entry.createServerFnRuntime ? serverFnRuntime(await entry.createServerFnRuntime(seed), seed) : fetchRuntime(await entry.createFetchRuntime(seed), seed)
    }
    const result = message.action === 'start' || message.action === 'reset' ? runtime.seed : message.action === 'state' ? await runtime.state() : message.action === 'recover' ? await runtime.recover() : await runtime.execute(message.action, message.name, message.args ?? {})
    parentPort.postMessage({ id: message.id, result })
  } catch (error) { parentPort.postMessage({ id: message.id, error: error.message, ...(error.data === undefined ? {} : { data: error.data }) }) }
})
