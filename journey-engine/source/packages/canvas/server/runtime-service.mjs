import { randomUUID } from 'node:crypto'
import { Worker } from 'node:worker_threads'
import { sensitivePayload } from '@civic/shell/server/recording'

const reject = (message, status = 400) => { throw Object.assign(Error(message), { status }) }

/**
 * Isolated live runs for a project's runtime entry (`adapter.runtime` in its manifest): one worker
 * and in-memory backend per run, with a fixed clock and no network. The entry is trusted project
 * code, never supplied by a request. It exports one of:
 *   createRuntime(seed)       -> { seed, state(), recover?(), execute(kind, name, args) }   function backends (Laundry's Convex)
 *   createFetchRuntime(seed)  -> { seed?, state?(), fetch(request) }                       fetch-handler backends (HTTP APIs)
 *   createServerFnRuntime(seed) -> { seed?, state?(), context?(), fetch?(request) }     TanStack Start server functions
 * A host adds what its backend needs to load: `root` (where modules resolve), extra `aliases`,
 * and `modules(project)`, generated virtual modules such as a backend's function index.
 */
export function runtimeService(project, source, { root = project.manifestRoot, aliases = {}, modules = async () => ({}) } = {}) {
  const runs = new Map()
  let virtual
  const stop = async (id) => { const run = runs.get(id); if (run) { runs.delete(id); await run.worker.terminate() } }
  const expiry = setInterval(() => { for (const [id, run] of runs) if (Date.now() - run.used > 30 * 60_000) void stop(id) }, 60_000)
  expiry.unref()
  async function call(run, command) {
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); void stop(run.id); reject(Error('Isolated runtime timed out; start a new run.')) }, 30_000)
      const cleanup = () => { clearTimeout(timer); run.worker.off('message', message); run.worker.off('error', failed); run.worker.off('exit', exited) }
      const message = (response) => { if (response.id !== id) return; cleanup(); response.error ? reject(Object.assign(Error(response.error), { data: response.data })) : resolve(response.result) }
      const failed = (error) => { cleanup(); reject(error) }
      const exited = () => failed(Error('Isolated runtime stopped; start a new run.'))
      run.worker.on('message', message).once('error', failed).once('exit', exited)
      run.worker.postMessage({ ...command, id })
    })
  }
  return {
    async handle(input) {
      if (!project.runtimeEntry) reject('This project has no isolated data runtime.', 409)
      if (!input || typeof input !== 'object' || JSON.stringify(input).length > 250_000) reject('Invalid runtime request')
      if (input.action === 'start') {
        virtual ??= modules(project).catch((error) => { virtual = undefined; throw error })
        for (const field of ['role', 'condition']) if (!project.manifest[field === 'role' ? 'roles' : 'conditions'].some((preset) => preset.id === input[field])) reject('Choose a declared preset')
        const persona = project.manifest.personas.find((preset) => preset.id === (input.persona ?? project.manifest.personas[0].id))
        if (!persona) reject('Choose a declared persona')
        if (typeof input.scenario !== 'string' || input.scenario.length > 150) reject('Invalid scenario')
        if (runs.size >= 8) reject('Eight isolated runs are active. Close a preview before starting another.', 429)
        const now = input.now ?? Date.now()
        if (!Number.isSafeInteger(now) || now < 0 || now > 8_640_000_000_000_000) reject('Invalid run clock')
        const timeZone = input.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
        try { if (typeof timeZone !== 'string' || timeZone.length > 100) throw Error(); new Intl.DateTimeFormat('en', { timeZone }) } catch { reject('Invalid run time zone') }
        const id = randomUUID(), revision = source()
        const worker = new Worker(new URL('./runtime-worker.mjs', import.meta.url), { workerData: { entry: project.runtimeEntry, appRoot: project.root, aliases: { ...project.aliases, ...aliases }, root, virtual: await virtual, namespace: id, now, timeZone, persona, scenario: input.scenario, role: input.role, condition: input.condition }, resourceLimits: { maxOldGenerationSizeMb: 256 } })
        const run = { id, worker, source: revision, used: Date.now(), queue: Promise.resolve() }
        runs.set(id, run)
        try { const seed = await call(run, { action: 'start' }); if (source() !== revision) reject('Source changed while creating the run.', 409); return { id, seed, now, source: revision, project: project.key } }
        catch (error) { await stop(id); throw error }
      }
      const run = runs.get(input.run)
      if (!run) reject('Unknown or expired isolated run.', 404)
      if (input.action === 'close') { await stop(run.id); return { closed: true } }
      if (run.source !== source()) reject('Source changed. Save the recording and start a run on the new revision.', 409)
      run.used = Date.now()
      if (input.action === 'action') reject('Server actions are disabled in isolated review.')
      if (!['query', 'mutation', 'reset', 'state', 'recover'].includes(input.action)) reject('Unknown runtime operation')
      if (['query', 'mutation'].includes(input.action) && (typeof input.name !== 'string' || input.name.length > 200 || !/^[a-zA-Z_/][\w/.:_~%-]*$/.test(input.name) || input.name.includes('..'))) reject('Invalid function name')
      if (input.args !== undefined && (!input.args || Array.isArray(input.args) || typeof input.args !== 'object' || sensitivePayload(input.args))) reject('Invalid or sensitive operation arguments')
      const result = run.queue.then(async () => {
        if (run.source !== source()) reject('Source changed before executing the operation.', 409)
        const value = await call(run, input)
        if (run.source !== source()) reject('Source changed during the operation. Inspect the isolated run before restarting.', 409)
        return value
      })
      run.queue = result.catch(() => {})
      return result
    },
    async close() { clearInterval(expiry); await Promise.all([...runs.keys()].map(stop)) },
  }
}
