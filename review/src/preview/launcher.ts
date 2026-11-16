// `civic preview`: preview this CIVIC worktree's own canvas, to review CIVIC with CIVIC (docs/self-dogfood.md).
// It starts the canvas on free ports with a throwaway store under TMPDIR, puts `civic review-app` in front of
// it (the overlay, and the preview registered on this worktree's line), and stops and deletes all of it on
// Ctrl+C. It never reads, stops or attaches to the owner's running instance, or its `.civic-canvas/` store.
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { closeSync, existsSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import * as Effect from 'effect/Effect'
import * as Scope from 'effect/Scope'
import { createEffectActor, sendAndAwait } from '@xstate/effect'
import { previewMachine } from './lifecycle.ts'
import { waitUntil } from './runtime.ts'
import { git, readCheckout } from '../git.ts'
import { identityFromEnv } from '../identity.ts'
import { startReviewApp } from '../review-app.ts'
import { Store } from '../store.ts'
import { forgetPreview, identify, isProc, isRunning, sameProcess, LAUNCHER_MARKER, pickPorts, previewId, previewsDir, privateDir, readPreviews, removeOwnedRoot, ROOT_MARK, select, stopProcess, writePreview, type Preview } from './state.ts'

export interface PreviewOptions {
  cwd: string
  env: NodeJS.ProcessEnv
  print: (text: string) => void
  keep: boolean
  noOpen: boolean
  /** Review the page with uncommitted edits. Annotations are still filed on the committed head. */
  allowDirty: boolean
  /** A project manifest, or the folder holding one. The Notebook example by default. */
  project?: string
}

const NOTEBOOK = 'packages/canvas/examples/notebook/civic.project.json'

const ago = (iso: string) => {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  return minutes < 1 ? 'just now' : `${minutes} min ago`
}

const waitUp = (url: string, signal: AbortSignal) => Effect.runPromise(waitUntil(
  Effect.tryPromise((signal) => fetch(url, { signal }).then((response) => response.ok)).pipe(Effect.timeoutOption(2000), Effect.map((value) => value._tag === 'Some' && value.value), Effect.catch(() => Effect.succeed(false))),
  200, 90_000,
), { signal })

/** Stops what a preview started and removes what it left. Works from the state file alone, so `stop` can finish for a launcher that died. */
async function teardown(preview: Preview) {
  await Promise.all(preview.children.map((proc) => stopProcess(proc, { graceMs: 8000 })))
  if (!preview.keep) removeOwnedRoot(preview.root)
  forgetPreview(preview.id)
}

/** The previews still running; the state of any that died is cleaned up. */
async function prune() {
  const all = readPreviews()
  await Promise.all(all.filter((preview) => !isRunning(preview)).map(teardown))
  return all.filter((preview) => isRunning(preview))
}

const link = (preview: Preview) => `${preview.origin}/review`

/** pnpm's own copy of the lockfile it last installed from, so only a missing or changed install is repeated. */
function needsInstall(dir: string) {
  try {
    return readFileSync(join(dir, 'node_modules/.pnpm/lock.yaml'), 'utf8') !== readFileSync(join(dir, 'pnpm-lock.yaml'), 'utf8')
  } catch {
    return true
  }
}

/** The key the preview's review server wrote, so CIVIC's re-capture can sign in. Never copied into the records. */
function findAccessKey(store: string) {
  const projects = join(store, '.review-data/projects')
  try {
    const found = readdirSync(projects).map((name) => join(projects, name, 'access-key')).filter((file) => existsSync(file))
    return found.length === 1 ? found[0] : undefined
  } catch {
    return undefined
  }
}

async function openInBrowser(href: string) {
  if (process.platform !== 'darwin') return false
  // The address goes over stdin, as Orca's launcher does, so it stays out of process arguments.
  try {
    return await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const child = yield* Effect.acquireRelease(
        Effect.sync(() => spawn('/usr/bin/osascript', ['-'], { stdio: ['pipe', 'ignore', 'ignore'] })),
        (child) => Effect.sync(() => { if (child.exitCode === null) child.kill() }),
      )
      child.stdin.end(`open location ${JSON.stringify(href)}\n`)
      yield* Effect.tryPromise(() => once(child, 'exit')).pipe(Effect.timeout(10_000))
      return child.exitCode === 0
    })))
  } catch {
    return false
  }
}

export async function startPreview(o: PreviewOptions): Promise<number> {
  return Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const scope = yield* Scope.Scope
    return yield* Effect.tryPromise({ try: () => launch(o, scope), catch: (error) => error })
  })))
}

async function launch(o: PreviewOptions, scope: Scope.Scope): Promise<number> {
  const run = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) => Effect.runPromise(Effect.provideService(effect, Scope.Scope, scope))
  const actor = await run(createEffectActor(previewMachine))
  const move = (event: { type: string; owner?: boolean; matching?: boolean }) => run(sendAndAwait(actor, event))
  const checkout = readCheckout(o.cwd)
  const root = checkout.root
  if (!existsSync(join(root, 'packages/canvas/bin/civic-canvas.mjs')) || !existsSync(join(root, 'review/src/cli.ts'))) {
    throw new Error(`${root} is not a CIVIC worktree. Run \`civic preview\` inside one, or \`civic preview <url>\` to register a preview that is already running.`)
  }
  const branch = checkout.branch ?? checkout.head.slice(0, 7)
  const id = previewId(root, branch)
  const existing = (await prune()).find((preview) => preview.id === id)
  if (existing && isRunning(existing)) {
    await move({ type: 'ATTACH', matching: true })
    o.print(`A preview of ${branch} is already running: ${link(existing)}`)
    return 0
  }
  const dirty = git(root, 'status', '--porcelain') !== ''
  if (dirty && !o.allowDirty) throw new Error(`${root} has uncommitted changes. Commit them, or add --allow-dirty to review the page with your edits (annotations are filed on ${checkout.head.slice(0, 7)}).`)
  const manifest = resolve(o.cwd, o.project ?? join(root, NOTEBOOK))
  if (!existsSync(manifest)) throw new Error(`No project at ${manifest}.`)

  privateDir(previewsDir())
  const claim = join(previewsDir(), `${id}.lock`)
  const owner = identify(process.pid, LAUNCHER_MARKER, false)
  const acquire = () => {
    try { writeFileSync(claim, JSON.stringify(owner), { flag: 'wx', mode: 0o600 }); return true } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      return false
    }
  }
  if (!acquire()) {
    let claimed = false
    let attached: Preview | undefined
    const available = await Effect.runPromise(waitUntil(Effect.sync(() => {
      attached = readPreviews().find((p) => p.id === id && isRunning(p))
      if (attached) return true
      claimed = acquire()
      if (claimed) return true
      // Serialize stale-claim removal so a second starter cannot unlink the new owner's claim.
      const reclaim = `${claim}.reclaim`
      try { writeFileSync(reclaim, '', { flag: 'wx', mode: 0o600 }) } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        return false
      }
      try {
        const recorded: unknown = JSON.parse(readFileSync(claim, 'utf8'))
        if (isProc(recorded) && !sameProcess(recorded)) {
          rmSync(claim)
          claimed = acquire()
        }
      } catch { /* incomplete claim: wait for its writer */ }
      finally { rmSync(reclaim) }
      return claimed
    }), 100, 90_000))
    if (attached) {
      await move({ type: 'ATTACH', matching: true })
      o.print(`A preview of ${branch} is already running: ${link(attached)}`)
      return 0
    }
    if (!available || !claimed) throw new Error(`A preview of ${branch} is still starting.`)
  }
  await run(Effect.addFinalizer(() => Effect.sync(() => rmSync(claim, { force: true }))))
  await move({ type: 'START', owner: true })

  const dir = join(root, 'packages')
  if (needsInstall(dir)) {
    // The main working tree may be what the owner's instance runs from; nothing here installs into it.
    if (root === checkout.mainRoot) throw new Error(`Dependencies are missing or out of date in ${dir}. This is the main working tree, so run: pnpm --dir ${dir} install --frozen-lockfile`)
    o.print(`Installing dependencies in ${dir} (pnpm install --frozen-lockfile)`)
    await run(Effect.scoped(Effect.gen(function* () {
      const child = yield* Effect.acquireRelease(
        Effect.sync(() => spawn('pnpm', ['--dir', dir, 'install', '--frozen-lockfile'], { stdio: ['ignore', 'inherit', 'inherit'] })),
        (child) => Effect.sync(() => { if (child.exitCode === null) child.kill() }),
      )
      yield* Effect.tryPromise(() => once(child, 'exit'))
      if (child.exitCode !== 0) throw new Error('Preview dependency installation failed.')
    })))
  }

  const [canvasPort = 0, port = 0, overlayPort = 0] = await pickPorts(3)
  const previewRoot = join(previewsDir(), id)
  const store = join(previewRoot, 'store')
  for (const dir of [previewsDir(), previewRoot, store]) privateDir(dir)
  writeFileSync(join(previewRoot, ROOT_MARK), id)

  const preview: Preview = {
    id, branch, worktree: root, root: previewRoot, head: checkout.head, dirty,
    canvasPort, port, origin: `http://127.0.0.1:${port}`, keep: o.keep, startedAt: new Date().toISOString(),
    launcher: identify(process.pid, LAUNCHER_MARKER, false), children: [],
  }

  const stopping = () => ['stopping', 'stopped'].includes(String(actor.getSnapshot().value))
  const readiness = new AbortController()
  let finish: (code: number) => void = () => {}
  const finished = new Promise<number>((resolve) => { finish = resolve })
  let closeApp = async () => {}
  const shutdown = async (code: number) => {
    if (stopping()) return
    await move({ type: 'STOP' })
    readiness.abort()
    finish(code)
  }
  const onSignal = () => void shutdown(0)
  await run(Effect.acquireRelease(Effect.sync(() => {
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, onSignal)
  }), () => Effect.promise(async () => {
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.off(signal, onSignal)
    try { await closeApp() } finally { await teardown(preview) }
    await move({ type: 'CLOSED' })
    if (o.keep) o.print(`Preview data kept in ${previewRoot}`)
  })))

  try {
    writePreview(preview)
    // Nothing inherited from the shell that could point a preview at another instance's store or ports.
    const env = Object.fromEntries(Object.entries(o.env).filter(([key]) => !/^(?:VITE_)?CIVIC_/.test(key)))
    const canvas: ChildProcess = await run(Effect.acquireRelease(Effect.sync(() => {
      const log = openSync(join(previewRoot, 'canvas.log'), 'a')
      try { return spawn(process.execPath, [join(root, 'packages/canvas/bin/civic-canvas.mjs'), '--project', manifest, '--store', store, '--port', String(canvasPort)], { cwd: root, env, detached: true, stdio: ['ignore', log, log] }) } finally { closeSync(log) }
    }), () => Effect.promise(async () => {
      try { await closeApp() } finally {
        closeApp = async () => {}
        await Promise.all(preview.children.map((proc) => stopProcess(proc, { graceMs: 8000 })))
      }
    })))
    canvas.once('error', (error) => { console.error(`Could not start the canvas: ${error.message}`); void shutdown(1) })
    preview.children = [identify(canvas.pid ?? 0, `--store ${store}`, true)]
    writePreview(preview)
    canvas.once('exit', () => {
      if (!stopping()) { console.error(`The preview's canvas stopped; see ${previewRoot}/canvas.log`); void shutdown(1) }
    })
    if (!(await waitUp(`http://127.0.0.1:${canvasPort}/review`, readiness.signal))) throw new Error(`The preview did not start; see ${previewRoot}/canvas.log`)

    const identity = identityFromEnv({ ...o.env, CIVIC_AGENT: undefined }, root)
    const bearerFile = findAccessKey(store)
    const app = await startReviewApp({ store: Store.forCheckout(checkout), checkout, identity }, { upstream: `http://127.0.0.1:${canvasPort}`, port, overlayPort, allowDirty: o.allowDirty, ...(bearerFile ? { bearerFile } : {}) })
    closeApp = app.close
    if ((await move({ type: 'READY' })).value !== 'running') return finished
    o.print(`Previewing ${branch} at ${checkout.head.slice(0, 7)}${dirty ? ' plus uncommitted changes' : ''}: ${link(preview)}\nAnnotations land on ${app.line} at ${app.revision.slice(0, 7)}. Stop with Ctrl+C or \`civic preview stop\`.`)
    if (o.noOpen || !(await openInBrowser(link(preview)))) o.print(`Open ${link(preview)}`)
  } catch (error) {
    if (!stopping()) await move({ type: 'LOST' })
    console.error(error instanceof Error ? error.message : String(error))
    await shutdown(1)
  }
  return finished
}

export async function listPreviews(print: (text: string) => void) {
  const running = await prune()
  if (running.length === 0) print('No previews running.')
  for (const p of running) print(`${p.branch}  ${link(p)}  ${p.head.slice(0, 7)}${p.dirty ? ' + uncommitted changes' : ''}  started ${ago(p.startedAt)}`)
}

export async function linkPreview(name: string | undefined, cwd: string, print: (text: string) => void) {
  const running = await prune()
  const [mine] = select(running, name, readCheckout(cwd).root)
  // With no name, a lone running preview is the obvious one.
  const target = mine ?? (name === undefined && running.length === 1 ? running[0] : undefined)
  if (!target) throw new Error(name === undefined ? 'No preview of this worktree is running. `civic preview list` shows the others.' : `No running preview called ${name}.`)
  print(`${target.branch}: ${link(target)}\nThe page is loopback only and needs no sign-in.`)
}

export async function stopPreviews(name: string | undefined, cwd: string, print: (text: string) => void) {
  const hit = select(await prune(), name, readCheckout(cwd).root)
  if (hit.length === 0) throw new Error(name === undefined ? 'No preview of this worktree is running. `civic preview list` shows the others.' : `No running preview called ${name}.`)
  for (const preview of hit) {
    // The launcher cleans up after itself when asked to stop.
    await stopProcess(preview.launcher, { graceMs: 25_000 })
    const left = readPreviews().find((p) => p.id === preview.id)
    if (left) await teardown(left)
    print(`Stopped ${preview.branch}${preview.keep ? ` (data kept in ${preview.root})` : ''}.`)
  }
}
