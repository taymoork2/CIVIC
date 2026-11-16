import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { sensitivePayload } from '@civic/shell/server/recording'
import * as Effect from 'effect/Effect'
import * as Scope from 'effect/Scope'
import * as Exit from 'effect/Exit'
import * as Schedule from 'effect/Schedule'
import * as Clock from 'effect/Clock'
import { createEffectActor, sendAndAwait } from '@xstate/effect'
import { runMachine } from './run-lifecycle.mjs'

const reject = (message, status = 400) => { throw Object.assign(Error(message), { status }) }
const hostTime = () => Effect.runSync(Clock.currentTimeMillis)

// Operations that change a run. They are journaled, so a durable run can be reopened with the same effects.
const EFFECTS = ['mutation', 'identity', 'recover', 'time']

/**
 * Isolated live runs for a project's runtime entry (`adapter.runtime` in its manifest): one worker
 * and in-memory backend per run, with a fixed clock and no network. The entry is trusted project
 * code, never supplied by a request. It exports one of:
 *   createRuntime(seed)       -> { seed, state(actor?), recover?(), execute(kind, name, args, actor?), identity?(account), inspect?() }   function backends
 *   createFetchRuntime(seed)  -> { seed?, state?(), fetch(request) }                       fetch-handler backends (HTTP APIs)
 *   createServerFnRuntime(seed) -> { seed?, state?(), context?(), fetch?(request) }     TanStack Start server functions
 * Apps with sign-in declare synthetic identities on their personas (`identity` in the manifest). Each run gets a
 * fresh review credential for every such persona (`seed.identities`; `seed.identity` is the run's own persona) and
 * starts signed in as its persona through the app's own sign-in, unless its condition is listed in
 * `identity.signedOut` or its starting screen is marked `"identity": "signed-out"` (a sign-in screen).
 * Sessions live in the run, never in the page (see runtime-worker.mjs).
 * A run can switch to another of its accounts (`identity`), advance its clock (`time`), and is told which account
 * the page believes is acting (`actor`); an operation from a page that still shows another account is refused.
 * With `dataDir`, every run keeps a journal of its effects in `<dataDir>/runtime/<run>.json`, so a closed or
 * expired run can be reopened (`resume`) on the same source revision with the same seed and effects.
 * The journal holds no credential: a reopened run mints fresh ones and its page signs in again.
 * A host adds what its backend needs to load: `root` (where modules resolve), extra `aliases`,
 * `dedupe` (shared installed packages), `noExternal` (packages needing Vite transformation),
 * and `modules(project)`, generated virtual modules such as a backend's function index.
 */
export function runtimeService(project, source, { root = project.manifestRoot, aliases = {}, dedupe = [], noExternal = [], modules = async () => ({}), dataDir } = {}) {
  const runs = new Map(), restoring = new Map()
  const pending = new Set()
  const scope = Effect.runSync(Scope.make())
  let closing
  const open = () => { if (closing) reject('Isolated runtime stopped; start a new run.', 409) }
  const send = (run, type) => Effect.runPromise(sendAndAwait(run.actor, { type, sameSource: run.source === source() }))
  let virtual, acquiring = 0
  const path = (id) => join(dataDir, 'runtime', `${id}.json`)
  const persist = async (run) => {
    if (!dataDir) return
    try {
      await mkdir(join(dataDir, 'runtime'), { recursive: true, mode: 0o700 })
      const temp = `${path(run.id)}.${randomUUID()}.tmp`
      await writeFile(temp, JSON.stringify(run.saved), { mode: 0o600 }); await rename(temp, path(run.id))
    } catch (error) { await stop(run.id); throw error }
  }
  const stop = async (id) => {
    const run = runs.get(id)
    if (!run) return
    if (run.stopping) return run.stopping
    run.stopping = (async () => {
      await send(run, 'STOP')
      await Effect.runPromise(Scope.close(run.scope, Exit.void))
      await send(run, 'CLOSED')
      await Effect.runPromise(Scope.close(run.actorScope, Exit.void))
      runs.delete(id)
    })()
    return run.stopping
  }
  Effect.runSync(Effect.forkIn(Effect.repeat(Effect.promise(async () => {
    for (const [id, run] of runs) if (hostTime() - run.used > 30 * 60_000) await stop(id)
  }), Schedule.spaced('1 minute')), scope))
  function call(run, command) {
    const id = randomUUID()
    let cleanup
    if (run.stopping) reject('Isolated runtime stopped; start a new run.', 409)
    return Effect.runPromise(Effect.ensuring(Effect.timeoutOrElse(Effect.callback(resumeCall => {
      cleanup = () => { run.worker.off('message', message); run.worker.off('error', failed); run.worker.off('exit', exited) }
      const message = (response) => { if (response.id !== id) return; resumeCall(response.error ? Effect.fail(Object.assign(Error(response.error), { data: response.data })) : Effect.succeed(response.result)) }
      const failed = (error) => resumeCall(Effect.fail(error))
      const exited = () => failed(Error('Isolated runtime stopped; start a new run.'))
      run.worker.on('message', message).once('error', failed).once('exit', exited)
      run.worker.postMessage({ ...command, id })
      return Effect.sync(cleanup)
    }), { duration: '30 seconds', orElse: () => Effect.promise(async () => { await stop(run.id); throw Error('Isolated runtime timed out; start a new run.') }) }), Effect.sync(() => cleanup?.())))
  }
  /** Fresh review credentials for every persona with an identity; the run's own persona is `identity`. */
  const credentials = (persona, signedIn) => {
    const identities = project.manifest.personas.filter((row) => row.identity).map((row) => ({ persona: row.id, ...row.identity, credential: `review-${randomBytes(18).toString('base64url')}`, signedIn: row.id === persona.id && signedIn }))
    return { identities, identity: identities.find((row) => row.persona === persona.id) ?? null }
  }
  const publicIdentity = (identity) => identity && { id: identity.id, name: identity.name, email: identity.email, credential: identity.credential, signedIn: identity.signedIn }
  const spawn = async (saved, identities) => {
    open()
    virtual ??= modules(project).catch((error) => { virtual = undefined; throw error })
    const persona = project.manifest.personas.find((row) => row.id === saved.options.persona)
    if (!persona || saved.project !== project.key) reject('Saved run belongs to another project.', 409)
    if (saved.source !== source()) reject('Saved run belongs to another source revision. Keep its evidence and start a run on the current source.', 409)
    if (runs.size + acquiring >= 8) reject('Eight isolated runs are active. Close a preview before starting another.', 429)
    const identity = identities.identity
    const generated = await virtual
    open()
    if (runs.size + acquiring >= 8) reject('Eight isolated runs are active. Close a preview before starting another.', 429)
    acquiring++
    const runScope = Effect.runSync(Scope.make())
    const actorScope = Effect.runSync(Scope.make())
    try {
      const actor = await Effect.runPromise(Effect.provideService(createEffectActor(runMachine), Scope.Scope, actorScope))
      open()
      const worker = await Effect.runPromise(Effect.provideService(Effect.acquireRelease(Effect.sync(() => new Worker(new URL('./runtime-worker.mjs', import.meta.url), { workerData: { entry: project.runtimeEntry, appRoot: project.root, aliases: { ...project.aliases, ...aliases }, dedupe, noExternal, root, virtual: generated, namespace: saved.id, ...saved.options, persona, identity, identities: identities.identities, signIn: project.manifest.identity?.signIn ?? null }, resourceLimits: { maxOldGenerationSizeMb: 256 } })), worker => Effect.promise(() => worker.terminate())), Scope.Scope, runScope))
      const run = { id: saved.id, worker, source: saved.source, saved, identity, lease: randomUUID(), used: hostTime(), queue: Promise.resolve() }
      Object.assign(run, { scope: runScope, actorScope, actor })
      runs.set(run.id, run)
      const ended = () => { void stop(run.id) }
      await Effect.runPromise(Effect.provideService(Effect.acquireRelease(
        Effect.sync(() => worker.on('error', ended).on('exit', ended)),
        () => Effect.sync(() => { worker.off('error', ended).off('exit', ended) }),
      ), Scope.Scope, runScope))
      if (closing) { await stop(run.id); open() }
      return run
    } catch (error) {
      await Effect.runPromise(Scope.close(runScope, Exit.void))
      await Effect.runPromise(Scope.close(actorScope, Exit.void))
      throw error
    } finally { acquiring-- }
  }
  const envelope = async (run) => {
    const who = await call(run, { action: 'inspect' })
    open()
    return { id: run.id, seed: run.saved.seed, now: run.saved.options.now, source: run.source, project: project.key, identity: publicIdentity(run.identity), account: who.account ?? null, subject: who.subject ?? null, accounts: who.accounts ?? [], clock: who.now, lease: run.lease }
  }
  async function resume(id) {
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) reject('Invalid run identity')
    if (restoring.has(id)) return restoring.get(id)
    // A page reopening a run that is still open takes it over; the older page's close no longer stops it.
    if (runs.has(id)) { const run = runs.get(id); run.lease = randomUUID(); return envelope(run) }
    if (!dataDir) reject('This runtime keeps no journals, so its runs cannot be reopened.', 409)
    const ready = (async () => {
      let saved
      try { saved = JSON.parse(await readFile(path(id), 'utf8')) } catch (error) { if (error.code === 'ENOENT') reject('Saved isolated run unavailable', 404); throw error }
      if (saved.version !== 1 || saved.id !== id || !Array.isArray(saved.journal) || saved.journal.length > 20_000) reject('Invalid saved isolated run')
      const persona = project.manifest.personas.find((row) => row.id === saved.options.persona)
      if (!persona) reject('Saved run belongs to another project.', 409)
      const run = await spawn(saved, credentials(persona, saved.signedIn))
      try {
        await send(run, 'RESTORE')
        const seed = await call(run, { action: 'start' })
        if (JSON.stringify(seed) !== JSON.stringify(saved.seed)) reject('Saved run seed changed; keep its evidence and reset explicitly.', 409)
        // An entry the page never saw finish is not an effect: its page kept it as a saved step to resend by hand.
        saved.journal = saved.journal.filter((entry) => entry.complete)
        for (const entry of saved.journal) {
          const value = await call(run, entry.command)
          if (JSON.stringify(value) !== JSON.stringify(entry.result)) reject('Saved run effects differ from their receipts.', 409)
        }
        await persist(run)
        await send(run, 'READY')
        return envelope(run)
      } catch (error) { await stop(run.id); throw error }
    })()
    restoring.set(id, ready)
    try { return await ready } finally { restoring.delete(id) }
  }
  const facade = {
    async handle(input) {
      if (!project.runtimeEntry) reject('This project has no isolated data runtime.', 409)
      if (!input || typeof input !== 'object' || JSON.stringify(input).length > 250_000) reject('Invalid runtime request')
      if (input.action === 'resume') return resume(input.run)
      if (input.action === 'start') {
        for (const field of ['role', 'condition']) if (!project.manifest[field === 'role' ? 'roles' : 'conditions'].some((preset) => preset.id === input[field])) reject('Choose a declared preset')
        const persona = project.manifest.personas.find((preset) => preset.id === (input.persona ?? project.manifest.personas[0].id))
        if (!persona) reject('Choose a declared persona')
        if (typeof input.scenario !== 'string' || input.scenario.length > 150) reject('Invalid scenario')
        if (input.options !== undefined && (!input.options || typeof input.options !== 'object' || Array.isArray(input.options) || JSON.stringify(input.options).length > 1000 || sensitivePayload(input.options) || Object.values(input.options).some((value) => !['string', 'number', 'boolean'].includes(typeof value)))) reject('Invalid run options')
        const now = input.now ?? Date.now()
        if (!Number.isSafeInteger(now) || now < 0 || now > 8_640_000_000_000_000) reject('Invalid run clock')
        const timeZone = input.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
        try { if (typeof timeZone !== 'string' || timeZone.length > 100) throw Error(); new Intl.DateTimeFormat('en', { timeZone }) } catch { reject('Invalid run time zone') }
        const screen = persona.identity ? JSON.parse(await readFile(project.scenariosPath, 'utf8')).find((row) => row?.id === input.scenario) : null
        const signedIn = Boolean(persona.identity) && !(project.manifest.identity?.signedOut ?? []).includes(input.condition) && screen?.identity !== 'signed-out'
        const id = randomUUID(), revision = source()
        const run = await spawn({ version: 1, id, project: project.key, source: revision, signedIn, options: { now, timeZone, persona: persona.id, scenario: input.scenario, role: input.role, condition: input.condition, ...(input.options ? { options: input.options } : {}) }, journal: [] }, credentials(persona, signedIn))
        try {
          run.saved.seed = await call(run, { action: 'start' })
          if (source() !== revision) reject('Source changed while creating the run.', 409)
          await persist(run)
          await send(run, 'READY')
          return await envelope(run)
        } catch (error) { await stop(id); throw error }
      }
      if (restoring.has(input.run)) await restoring.get(input.run).catch(() => {})
      const run = runs.get(input.run)
      if (!run) reject('Unknown or expired isolated run.', 404)
      if (input.action === 'close') {
        if (input.lease !== undefined && input.lease !== run.lease) return { closed: false }
        await stop(run.id); return { closed: true }
      }
      if (run.source !== source()) reject('Source changed. Save the recording and start a run on the new revision.', 409)
      run.used = hostTime()
      if (input.action === 'action') reject('Server actions are disabled in isolated review.')
      if (!['query', 'mutation', 'reset', 'state', 'recover', 'identity', 'time', 'inspect'].includes(input.action)) reject('Unknown runtime operation')
      if (input.actor !== undefined && (typeof input.actor !== 'string' || !input.actor || input.actor.length > 200)) reject('Invalid expected synthetic actor')
      if (input.action === 'identity' && (typeof input.args?.account !== 'string' || !/^[\w.-]{1,80}$/.test(input.args.account))) reject('Unknown synthetic account')
      if (input.action === 'time' && (!Number.isInteger(input.args?.minutes) || input.args.minutes < 1 || input.args.minutes > 1440)) reject('Choose 1 to 1440 synthetic minutes')
      if (['query', 'mutation'].includes(input.action) && (typeof input.name !== 'string' || input.name.length > 200 || !/^[a-zA-Z_/][\w/.:_~%-]*$/.test(input.name) || input.name.includes('..'))) reject('Invalid function name')
      if (input.intent !== undefined && (input.action !== 'mutation' || typeof input.intent !== 'string' || !/^[A-Za-z0-9-]{8,80}$/.test(input.intent))) reject('Invalid write identity')
      if (input.args !== undefined && (!input.args || Array.isArray(input.args) || typeof input.args !== 'object' || sensitivePayload(input.args))) reject('Invalid or sensitive operation arguments')
      const result = run.queue.then(async () => {
        if (run.stopping) reject('Isolated runtime stopped; start a new run.', 409)
        if (run.source !== source()) reject('Source changed before executing the operation.', 409)
        const state = await send(run, 'EXECUTE')
        if (state.value !== 'Executing') reject('Isolated runtime is not ready.', 409)
        try {
          if (input.action === 'reset') { run.saved.journal = []; await persist(run) }
          // A write runs at most once per identity: a resend whose first answer was lost gets that answer back. The
          // identity names one write by one account; reusing it for anything else is refused. It lives in the journal,
          // so it holds across a reopen, and a reset forgets it with the data.
          if (input.intent) {
            const prior = run.saved.journal.find((row) => row.complete && row.command.intent === input.intent)
            if (prior) {
              // Answering from the journal still answers only the account acting now.
              if (input.actor !== undefined && input.actor !== (await call(run, { action: 'inspect' })).subject) reject('The synthetic account changed in another pane. Reopen before acting.', 409)
              if (prior.command.name !== input.name || prior.command.actor !== input.actor || JSON.stringify(prior.command.args) !== JSON.stringify(input.args)) reject('This write identity belongs to a different write or account.', 409)
              return prior.result
            }
          }
          // Journal before executing, so an effect is never lost; an entry still incomplete on reopen is dropped.
          const entry = EFFECTS.includes(input.action) ? { command: { action: input.action, ...(input.name ? { name: input.name } : {}), ...(input.args !== undefined ? { args: input.args } : {}), ...(input.actor ? { actor: input.actor } : {}), ...(input.intent ? { intent: input.intent } : {}) }, complete: false } : null
          if (entry) { if (run.saved.journal.length >= 20_000) reject('Isolated run journal is full; save the recording and reset.'); run.saved.journal.push(entry); await persist(run) }
          let value
          try { value = await call(run, input) }
          catch (error) { if (entry) { run.saved.journal.splice(run.saved.journal.indexOf(entry), 1); await persist(run) } throw error }
          if (entry) { entry.result = value; entry.complete = true; await persist(run) }
          if (run.stopping) reject('Isolated runtime stopped; start a new run.', 409)
          if (run.source !== source()) reject('Source changed during the operation. Inspect the isolated run before restarting.', 409)
          return value
        } finally { if (!run.stopping) await send(run, 'COMPLETED') }
      })
      run.queue = result.catch(() => {})
      return result
    },
    close() {
      closing ??= (async () => {
        await Effect.runPromise(Effect.timeoutOrElse(Effect.promise(() => Promise.allSettled(pending)), { duration: '30 seconds', orElse: () => Effect.void }))
        await Promise.all([...runs.keys()].map(stop))
        await Effect.runPromise(Scope.close(scope, Exit.void))
      })()
      return closing
    },
  }
  return {
    handle(input) {
      try { open() } catch (error) { return Promise.reject(error) }
      const task = facade.handle(input)
      pending.add(task)
      void task.finally(() => pending.delete(task)).catch(() => pending.delete(task))
      return task
    },
    close: facade.close,
  }
}
