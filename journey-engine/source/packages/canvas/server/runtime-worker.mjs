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

// The page sends this in place of the run's review credential, so recordings never hold it and replay across runs.
const credentialPlaceholder = '[review credential]'
const identity = workerData.identity
const reveal = (text) => identity ? text.replaceAll(credentialPlaceholder, identity.credential) : text
const conceal = (text) => identity ? text.replaceAll(identity.credential, credentialPlaceholder) : text

/** The run's signed-in session: cookies the app sets and headers its sign-in hands back. The page never holds it. */
function sessionJar() {
  const cookies = new Map(), headers = {}
  return {
    cookies, headers,
    take(response) {
      for (const line of response.headers.getSetCookie()) {
        const [pair, ...attributes] = line.split(';'), split = pair.indexOf('=')
        if (split < 1) continue
        const name = pair.slice(0, split).trim(), value = pair.slice(split + 1).trim()
        const expired = attributes.some((attribute) => {
          const [key, raw = ''] = attribute.split('='), field = key.trim().toLowerCase()
          return field === 'max-age' && Number(raw) <= 0 || field === 'expires' && Date.parse(raw) <= Date.now()
        })
        if (expired || !value) cookies.delete(name); else cookies.set(name, value)
      }
    },
    headersFor(extra = {}) {
      return { ...extra, ...headers, ...(cookies.size ? { cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') } : {}) }
    },
  }
}

async function send(app, jar, path, init) {
  const response = await app.fetch(new Request(`http://isolated.review${path}`, { ...init, headers: jar.headersFor(init.headers) }))
  if (!(response instanceof Response)) throw Error('fetch(request) must return a Response')
  jar.take(response)
  return response
}

/** Starts the run signed in as its persona's review identity: the app's own `signIn(identity)`, or the manifest's sign-in request. */
async function signIn(app, jar) {
  if (!identity?.signedIn) return
  const who = { id: identity.id, name: identity.name, email: identity.email, credential: identity.credential }
  if (typeof app.signIn === 'function') {
    const session = await app.signIn(who) ?? {}
    for (const [name, value] of Object.entries(session.cookies ?? {})) jar.cookies.set(name, String(value))
    Object.assign(jar.headers, session.headers)
    return
  }
  const request = workerData.signIn
  if (!request) throw Error('This persona has a review identity, but the runtime entry has no signIn(identity) and the manifest no identity.signIn request.')
  const body = JSON.stringify(request.body ?? { email: '{email}', password: '{credential}' }, (key, value) => typeof value === 'string' ? value.replace(/\{(id|name|email|credential)\}/g, (match, field) => who[field]) : value)
  const response = await send(app, jar, request.path, { method: request.method ?? 'POST', body, headers: { 'content-type': 'application/json' } })
  if (!response.ok) throw Error(`Signing in as ${identity.name} failed with ${response.status}. Check identity.signIn and that the runtime entry accepts seed.identity.credential.`)
  if (request.token) {
    const token = request.token.split('.').reduce((value, key) => value?.[key], await response.json())
    if (typeof token !== 'string') throw Error(`The sign-in response has no ${request.token}.`)
    jar.headers.authorization = `Bearer ${token}`
  }
}

/** A fetch-handler backend behind the function protocol: `METHOD:/path` names, `{ query, body }` arguments, `{ status, type, body }` results. */
async function fetchRuntime(app, seed) {
  const jar = sessionJar()
  await signIn(app, jar)
  return {
    seed: app.seed ?? { scenario: seed.scenario },
    state: async () => await app.state?.() ?? null,
    recover: async () => await app.recover?.() ?? null,
    async execute(kind, name, args) {
      const split = name.indexOf(':'), method = name.slice(0, split), path = name.slice(split + 1)
      if (!/^(?:GET|HEAD|POST|PUT|PATCH|DELETE)$/.test(method) || !path.startsWith('/')) throw Error('Invalid request name')
      if ((kind === 'query') !== ['GET', 'HEAD'].includes(method)) throw Error('Reads are queries and writes are mutations')
      const query = typeof args.query === 'string' && args.query.startsWith('?') ? reveal(args.query) : ''
      const response = await send(app, jar, path + query, { method, ...(typeof args.body === 'string' ? { body: reveal(args.body), headers: { 'content-type': args.type ?? 'application/json' } } : {}) })
      return { status: response.status, type: response.headers.get('content-type') ?? '', body: conceal(await response.text()) }
    },
  }
}

/**
 * TanStack Start server functions: `serverFn:<file>:<name>` names, loaded from the app's own module in this
 * run's module graph, so the app's server-side singletons are this run's alone. Other names go to `fetch`, if any.
 */
async function serverFnRuntime(app, seed) {
  const http = typeof app.fetch === 'function' ? await fetchRuntime(app, seed) : null
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
      const seed = { scenario: workerData.scenario, persona: workerData.persona, identity, role: workerData.role, condition: workerData.condition, now: workerData.now, timeZone: workerData.timeZone, namespace: workerData.namespace }
      runtime = entry.createRuntime ? await entry.createRuntime(seed) : entry.createServerFnRuntime ? await serverFnRuntime(await entry.createServerFnRuntime(seed), seed) : await fetchRuntime(await entry.createFetchRuntime(seed), seed)
    }
    const result = message.action === 'start' || message.action === 'reset' ? runtime.seed : message.action === 'state' ? await runtime.state() : message.action === 'recover' ? await runtime.recover() : await runtime.execute(message.action, message.name, message.args ?? {})
    parentPort.postMessage({ id: message.id, result })
  } catch (error) { parentPort.postMessage({ id: message.id, error: error.message, ...(error.data === undefined ? {} : { data: error.data }) }) }
})
