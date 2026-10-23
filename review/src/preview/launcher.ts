// `civic preview`: preview this CIVIC worktree's own canvas, to review CIVIC with CIVIC (docs/self-dogfood.md).
// It starts the canvas on free ports with a throwaway store under TMPDIR, puts `civic review-app` in front of
// it (the overlay, and the preview registered on this worktree's line), and stops and deletes all of it on
// Ctrl+C. It never reads, stops or attaches to the owner's running instance, or its `.civic-canvas/` store.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, openSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { git, readCheckout } from '../git.ts'
import { identityFromEnv } from '../identity.ts'
import { startReviewApp } from '../review-app.ts'
import { Store } from '../store.ts'
import { forgetPreview, identify, isRunning, LAUNCHER_MARKER, pickPorts, previewId, previewsDir, privateDir, readPreviews, removeOwnedRoot, ROOT_MARK, select, stopProcess, writePreview, type Preview } from './state.ts'

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
/** What the canvas needs installed: the workspace's packages, and the review package (the overlay's capture). */
const INSTALLS = ['packages', 'review']

const ago = (iso: string) => {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  return minutes < 1 ? 'just now' : `${minutes} min ago`
}

const up = (url: string) => fetch(url, { signal: AbortSignal.timeout(2000) }).then((response) => response.ok, () => false)

async function waitUp(url: string, seconds = 90) {
  for (let i = 0; i < seconds * 5; i++) {
    if (await up(url)) return true
    await sleep(200)
  }
  return false
}

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
  const child = spawn('/usr/bin/osascript', ['-'], { stdio: ['pipe', 'ignore', 'ignore'] })
  child.stdin.end(`open location ${JSON.stringify(href)}\n`)
  try {
    await once(child, 'exit')
    return child.exitCode === 0
  } catch {
    return false
  }
}

export async function startPreview(o: PreviewOptions): Promise<number> {
  const checkout = readCheckout(o.cwd)
  const root = checkout.root
  if (!existsSync(join(root, 'packages/canvas/bin/civic-canvas.mjs')) || !existsSync(join(root, 'review/src/cli.ts'))) {
    throw new Error(`${root} is not a CIVIC worktree. Run \`civic preview\` inside one, or \`civic preview <url>\` to register a preview that is already running.`)
  }
  const branch = checkout.branch ?? checkout.head.slice(0, 7)
  const id = previewId(root, branch)
  const existing = (await prune()).find((preview) => preview.id === id)
  if (existing) {
    o.print(`A preview of ${branch} is already running: ${link(existing)}`)
    return 0
  }
  const dirty = git(root, 'status', '--porcelain') !== ''
  if (dirty && !o.allowDirty) throw new Error(`${root} has uncommitted changes. Commit them, or add --allow-dirty to review the page with your edits (annotations are filed on ${checkout.head.slice(0, 7)}).`)
  const manifest = resolve(o.cwd, o.project ?? join(root, NOTEBOOK))
  if (!existsSync(manifest)) throw new Error(`No project at ${manifest}.`)

  for (const dir of INSTALLS.map((name) => join(root, name)).filter(needsInstall)) {
    // The main working tree may be what the owner's instance runs from; nothing here installs into it.
    if (root === checkout.mainRoot) throw new Error(`Dependencies are missing or out of date in ${dir}. This is the main working tree, so run: pnpm --dir ${dir} install --frozen-lockfile`)
    o.print(`Installing dependencies in ${dir} (pnpm install --frozen-lockfile)`)
    execFileSync('pnpm', ['--dir', dir, 'install', '--frozen-lockfile'], { stdio: ['ignore', 'inherit', 'inherit'] })
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

  let stopping = false
  let closeApp = async () => {}
  const shutdown = async (code: number) => {
    if (stopping) return
    stopping = true
    await closeApp()
    await teardown(preview)
    if (o.keep) o.print(`Preview data kept in ${previewRoot}`)
    process.exit(code)
  }
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, () => void shutdown(0))

  try {
    writePreview(preview)
    // Nothing inherited from the shell that could point a preview at another instance's store or ports.
    const env = Object.fromEntries(Object.entries(o.env).filter(([key]) => !/^(?:VITE_)?CIVIC_/.test(key)))
    const log = openSync(join(previewRoot, 'canvas.log'), 'a')
    const canvas: ChildProcess = spawn(process.execPath, [join(root, 'packages/canvas/bin/civic-canvas.mjs'), '--project', manifest, '--store', store, '--port', String(canvasPort)], { cwd: root, env, detached: true, stdio: ['ignore', log, log] })
    canvas.once('error', (error) => { console.error(`Could not start the canvas: ${error.message}`); void shutdown(1) })
    preview.children = [identify(canvas.pid ?? 0, `--store ${store}`, true)]
    writePreview(preview)
    canvas.once('exit', () => {
      if (!stopping) { console.error(`The preview's canvas stopped; see ${previewRoot}/canvas.log`); void shutdown(1) }
    })
    if (!(await waitUp(`http://127.0.0.1:${canvasPort}/review`))) throw new Error(`The preview did not start; see ${previewRoot}/canvas.log`)

    const identity = identityFromEnv({ ...o.env, CIVIC_AGENT: undefined }, root)
    const bearerFile = findAccessKey(store)
    const app = await startReviewApp({ store: Store.forCheckout(checkout), checkout, identity }, { upstream: `http://127.0.0.1:${canvasPort}`, port, overlayPort, allowDirty: o.allowDirty, ...(bearerFile ? { bearerFile } : {}) })
    closeApp = app.close
    o.print(`Previewing ${branch} at ${checkout.head.slice(0, 7)}${dirty ? ' plus uncommitted changes' : ''}: ${link(preview)}\nAnnotations land on ${app.line} at ${app.revision.slice(0, 7)}. Stop with Ctrl+C or \`civic preview stop\`.`)
    if (o.noOpen || !(await openInBrowser(link(preview)))) o.print(`Open ${link(preview)}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    await shutdown(1)
  }
  await new Promise<void>(() => {})
  return 0
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
