// Bookkeeping for `civic preview` (launcher.ts): free ports, one state file per preview, process
// identity, and cleanup that can only touch what a preview started. Same contract as Orca's
// `pnpm preview` (apps/server/src/preview-state.ts). Nothing here runs on import.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

// Ports other instances use: Orca's dev, dogfood and test lanes, CIVIC's own host (3012), standalone
// canvas (3020) and default overlay (4777).
const RESERVED = new Set([3012, 3020, 4317, 4417, 4777, 5733, 5734, 10_448])
const RESERVED_RANGES = [[4997, 4999], [5997, 5999]] as const

export const reservedPort = (port: number) => RESERVED.has(port) || RESERVED_RANGES.some(([low, high]) => port >= low && port <= high)

/** Ports the OS hands out while all of them are held open together, so they are distinct. */
async function freePorts(count: number): Promise<number[]> {
  const servers = Array.from({ length: count }, () => createServer())
  await Promise.all(servers.map(async (server) => { server.listen(0, '127.0.0.1'); await once(server, 'listening') }))
  const ports = servers.map((server) => (server.address() as { port: number }).port)
  await Promise.all(servers.map(async (server) => { server.close(); await once(server, 'close') }))
  return ports
}

/** `count` distinct ports the OS says are free, none of them reserved. */
export async function pickPorts(count: number, ask = freePorts): Promise<number[]> {
  const ports = [...new Set(await ask(count + 8))].filter((port) => !reservedPort(port)).slice(0, count)
  if (ports.length < count) throw new Error('Could not find a free port.')
  return ports
}

/** A process a preview started. `started` is the OS start time, so a recycled pid never matches. */
export interface Proc {
  pid: number
  /** Own process group (spawned detached): stopping it stops the whole tree. */
  group: boolean
  /** Text that must appear in the process's command line. */
  marker: string
  started: string
}

export interface Preview {
  id: string
  branch: string
  worktree: string
  /** Temp folder owned by this preview: the canvas store, logs and a marker file. */
  root: string
  head: string
  /** The worktree had uncommitted changes at start, so annotations are filed on `head` but the page shows more. */
  dirty: boolean
  canvasPort: number
  port: number
  origin: string
  keep: boolean
  startedAt: string
  launcher: Proc
  children: Proc[]
}

export const ROOT_MARK = '.civic-preview'
export const LAUNCHER_MARKER = 'review/src/cli.ts preview'

// The command lines `civic preview` starts: itself, or the canvas host given this preview's store.
// A state file naming any other kind of process is not ours to act on.
const ownMarker = (marker: string) => marker === LAUNCHER_MARKER || /^--store \S+\/civic-preview\/[\w.-]+\/store$/.test(marker)

export const previewsDir = () => join(tmpdir(), 'civic-preview')

/** One preview per worktree: the branch plus a short hash of the worktree's path. */
export const previewId = (worktree: string, branch: string) => `${branch.replaceAll(/[^\w.-]+/g, '-').slice(0, 24)}-${createHash('sha256').update(worktree).digest('hex').slice(0, 8)}`

const keys = (value: object) => Object.keys(value).sort().join(',')
const isProc = (value: unknown): value is Proc => {
  const proc = value as Proc
  return !!proc && typeof proc === 'object' && keys(proc) === 'group,marker,pid,started' && Number.isInteger(proc.pid) && proc.pid > 1
    && typeof proc.group === 'boolean' && typeof proc.started === 'string' && typeof proc.marker === 'string' && ownMarker(proc.marker)
}
const isPort = (value: unknown) => Number.isInteger(value) && !reservedPort(value as number)

const PREVIEW_KEYS = 'branch,canvasPort,children,dirty,head,id,keep,launcher,origin,port,root,startedAt,worktree'

/** State files sit in a temp folder other processes can write, so a file is parsed, never trusted. */
export function parsePreview(value: unknown): Preview | undefined {
  const p = value as Preview
  if (!p || typeof p !== 'object' || keys(p) !== PREVIEW_KEYS) return undefined
  const text = [p.id, p.branch, p.worktree, p.root, p.head, p.origin, p.startedAt].every((field) => typeof field === 'string')
  const ok = text && /^[\w.-]+$/.test(p.id) && typeof p.keep === 'boolean' && typeof p.dirty === 'boolean'
    && isPort(p.canvasPort) && isPort(p.port) && isProc(p.launcher) && p.launcher.marker === LAUNCHER_MARKER && Array.isArray(p.children) && p.children.every(isProc)
  return ok ? p : undefined
}

export interface Inspected { started: string; command: string }

export function inspect(pid: number): Inspected | null {
  try {
    const out = execFileSync('ps', ['-p', String(pid), '-o', 'lstart=', '-o', 'command=']).toString().trim()
    const match = /^(?<started>\w{3} \w{3}\s+\d+ [\d:]{8} \d{4})\s+(?<command>.*)$/s.exec(out)
    return match?.groups?.started !== undefined && match.groups.command !== undefined ? { started: match.groups.started, command: match.groups.command } : null
  } catch {
    return null
  }
}

export const identify = (pid: number, marker: string, group: boolean, look = inspect): Proc => ({ pid, group, marker, started: look(pid)?.started ?? '' })

/** True only for the very process that was recorded: same start time and the same command. */
export function sameProcess(proc: Proc, look = inspect): boolean {
  const now = look(proc.pid)
  return now !== null && now.started === proc.started && now.command.includes(proc.marker)
}

export interface Signals {
  look?: typeof inspect
  kill?: (pid: number, signal: NodeJS.Signals) => void
  graceMs?: number
}

/** Ask a recorded process to stop, then force it after a grace period. Anything else is left alone. */
export async function stopProcess(proc: Proc, { look = inspect, kill = (pid, signal) => process.kill(pid, signal), graceMs = 5000 }: Signals = {}): Promise<boolean> {
  if (!sameProcess(proc, look)) return false
  const send = (signal: NodeJS.Signals) => {
    try { kill(proc.group ? -proc.pid : proc.pid, signal) } catch { /* already gone */ }
  }
  send('SIGTERM')
  for (let waited = 0; waited < graceMs; waited += 100) {
    if (!sameProcess(proc, look)) return true
    await sleep(100)
  }
  if (sameProcess(proc, look)) send('SIGKILL')
  return true
}

/** Makes `dir` if needed, and refuses it unless it is a real folder of ours that nobody else can enter. */
export function privateDir(dir: string) {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const info = lstatSync(dir)
  // The low six mode bits are group and other access.
  if (!info.isDirectory() || info.uid !== process.getuid?.() || info.mode % 0o100 !== 0) throw new Error(`Refusing ${dir}: it is not a private folder of yours.`)
}

const stateFile = (id: string, dir: string) => join(dir, `${id}.json`)

export function writePreview(preview: Preview, dir = previewsDir()) {
  privateDir(dir)
  const file = stateFile(preview.id, dir)
  // Never write through a link someone left at the temporary name.
  rmSync(`${file}.tmp`, { force: true })
  writeFileSync(`${file}.tmp`, JSON.stringify(preview), { mode: 0o600, flag: 'wx' })
  renameSync(`${file}.tmp`, file)
}

export function readPreviews(dir = previewsDir()): Preview[] {
  let names: string[]
  try { names = readdirSync(dir) } catch { return [] }
  const found: Preview[] = []
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    try {
      const parsed = parsePreview(JSON.parse(readFileSync(join(dir, name), 'utf8')))
      // The file name is the id, so a state file can't point one preview at another's entry.
      if (parsed && `${parsed.id}.json` === name) found.push(parsed)
    } catch { /* unreadable: ignore */ }
  }
  return found
}

export const forgetPreview = (id: string, dir = previewsDir()) => rmSync(stateFile(id, dir), { force: true })

/** Deletes a preview's temp folder: it must sit directly inside the previews folder and carry the marker this tool wrote. */
export function removeOwnedRoot(root: string, dir = previewsDir()): boolean {
  if (root === '') return false
  let real: string
  let base: string
  try { real = realpathSync(root); base = realpathSync(dir) } catch { return false }
  const inside = relative(base, real)
  if (inside === '' || inside.includes(sep) || inside.startsWith('..') || !existsSync(join(real, ROOT_MARK))) return false
  rmSync(real, { recursive: true, force: true })
  return true
}

export const isRunning = (preview: Preview, look = inspect) => [preview.launcher, ...preview.children].some((proc) => sameProcess(proc, look))

/** `stop` and `link` target: all, a branch or id, or (no name) the preview of the current worktree. */
export function select(previews: Preview[], name: string | undefined, worktree: string): Preview[] {
  if (name === 'all') return previews
  return previews.filter((preview) => (name === undefined ? preview.worktree === worktree : preview.branch === name || preview.id === name))
}
