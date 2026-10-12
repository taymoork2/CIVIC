import { parentPort, workerData } from 'node:worker_threads'
import { createServer } from 'vite'
import { readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

async function moduleFiles(root) {
  const entries = await readdir(root, { withFileTypes: true })
  return (await Promise.all(entries.filter((entry) => entry.name !== 'node_modules').map((entry) => entry.isDirectory() ? moduleFiles(join(root, entry.name)) : join(root, entry.name)))).flat()
}
const web = dirname(dirname(fileURLToPath(import.meta.url)))
const backend = join(workerData.root, 'convex')
const modules = workerData.aliases['@convex'] ? (await moduleFiles(backend)).filter((path) => path.endsWith('.ts') && !/\.(?:test|testing|spec)\.ts$/.test(path)) : []
const server = await createServer({
  configFile: false, root: web, appType: 'custom', logLevel: 'error',
  server: { middlewareMode: true, watch: null, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] },
  resolve: { alias: { ...workerData.aliases, 'convex-test': join(web, '../../convex/node_modules/convex-test/dist/index.js') } },
  plugins: [{ name: 'rehearsal-backend-modules', resolveId: (id) => id === 'virtual:rehearsal-backend' ? '\0' + id : undefined, load: (id) => id === '\0virtual:rehearsal-backend' ? `export const modules = {${modules.map((path) => `${JSON.stringify(path)}: () => import(${JSON.stringify(path)})`).join(',')}}` : undefined }],
})
const entry = await server.ssrLoadModule(workerData.entry)
if (typeof entry.createRuntime !== 'function') throw Error('Runtime entry must export createRuntime(seed).')
// These workers execute trusted application functions; they never use an application network endpoint.
globalThis.fetch = async () => { throw Error('External requests are disabled in isolated review.') }
const RealDate = Date
globalThis.Date = new Proxy(RealDate, {
  construct: (target, args) => Reflect.construct(target, args.length ? args : [workerData.now]),
  apply: () => new RealDate(workerData.now).toString(),
  get: (target, key) => key === 'now' ? () => workerData.now : Reflect.get(target, key),
})
let runtime
parentPort.on('message', async (message) => {
  try {
    if (message.action === 'start' || message.action === 'reset') runtime = await entry.createRuntime({ scenario: workerData.scenario, persona: workerData.persona, role: workerData.role, condition: workerData.condition, now: workerData.now, timeZone: workerData.timeZone, namespace: workerData.namespace })
    const result = message.action === 'start' || message.action === 'reset' ? runtime.seed : message.action === 'state' ? await runtime.state() : message.action === 'recover' ? await runtime.recover() : await runtime.execute(message.action, message.name, message.args ?? {})
    parentPort.postMessage({ id: message.id, result })
  } catch (error) { parentPort.postMessage({ id: message.id, error: error.message, ...(error.data === undefined ? {} : { data: error.data }) }) }
})
