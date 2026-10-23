import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git, type Checkout } from './git.ts'
import { SCHEMA_VERSION, validateGraph, type CaptureRef, type GraphDocument } from '../../graph/src/index.ts'

export const STORE_FOLDER = '.civic'
const STALE_LOCK_MS = 30_000
const LOCK_WAIT_MS = 10_000
const NAME = /^([0-9a-f]{64})\.(png|jpg|webp|tape\.json|replay\.json)$/
const SHA256 = /^[0-9a-f]{64}$/
const EXTENSIONS: Record<CaptureRef['mediaType'], string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

/**
 * CIVIC's local collaboration records (decision 0020). One graph document and its content-addressed
 * captures, kept in the main working tree's `.civic/` folder so every worktree and every local
 * agent of a repository sees the same annotations, requests and claims. The folder ignores
 * itself, so nothing is committed to a product branch, and nothing is written inside `.git`.
 * A working tree can be checked out from someone else's branch, so the store refuses to be used
 * while git tracks anything in the folder but `civic.json`. The team-wide store is roadmap step 5;
 * it holds the same record shapes.
 */
export class Store {
  readonly dir: string
  readonly file: string
  /** The working tree that holds `dir`, when there is one to ask git about. */
  private readonly root: string | undefined
  private checked = false

  constructor(dir: string, root?: string) {
    this.dir = dir
    this.file = join(dir, 'records.graph.json')
    this.root = root
  }

  /** The store for a repository: the `.civic/` folder of its main working tree. */
  static forCheckout(checkout: Pick<Checkout, 'mainRoot'>): Store {
    return new Store(join(checkout.mainRoot, STORE_FOLDER), checkout.mainRoot)
  }

  read(): GraphDocument {
    this.trust()
    try {
      return JSON.parse(readFileSync(this.file, 'utf8')) as GraphDocument
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { schema: SCHEMA_VERSION, records: [], links: [] }
      throw error
    }
  }

  /**
   * Reads, changes and writes the store under one lock, so two worktrees or agents can't
   * lose each other's writes. The whole document is validated before it is written: a
   * change the graph's rules refuse (an agent resolving, say) is never stored.
   */
  transact<T>(change: (document: GraphDocument) => T): T {
    this.ensure()
    const release = this.lock()
    try {
      const document = this.read()
      const result = change(document)
      const errors = validateGraph(document).filter((issue) => issue.severity === 'error')
      if (errors.length > 0) throw new RefusedError(errors.map((issue) => `${issue.at}: ${issue.message}`).join('\n'))
      writeFileSync(`${this.file}.tmp`, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 })
      renameSync(`${this.file}.tmp`, this.file)
      return result
    } finally {
      release()
    }
  }

  /** Stores image bytes by their SHA-256. A capture never changes after it is written. */
  putCapture(bytes: Uint8Array, mediaType: CaptureRef['mediaType']): CaptureRef {
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    mkdirSync(join(this.dir, 'captures'), { recursive: true, mode: 0o700 })
    this.ensure()
    const path = this.capturePath({ sha256, mediaType })
    try {
      writeFileSync(path, bytes, { mode: 0o600, flag: 'wx' })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    return { sha256, mediaType }
  }

  /** Where the access key for a preview origin is kept, if the preview needs one. */
  previewAuth(origin: string): string | undefined {
    this.trust()
    try {
      return (JSON.parse(readFileSync(join(this.dir, 'preview-auth.json'), 'utf8')) as Record<string, string>)[origin]
    } catch {
      return undefined
    }
  }

  setPreviewAuth(origin: string, bearerFile: string | undefined) {
    this.ensure()
    const release = this.lock()
    try {
      const path = join(this.dir, 'preview-auth.json')
      let current: Record<string, string> = {}
      try { current = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string> } catch {}
      if (bearerFile) current[origin] = bearerFile
      else delete current[origin]
      writeFileSync(`${path}.tmp`, `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600 })
      renameSync(`${path}.tmp`, path)
    } finally {
      release()
    }
  }

  /**
   * Keeps a replay of a recorded run with its tape (decision 0009), both by content hash, so
   * `civic sync` shares them as it shares captures. The record's bytes are kept as the review
   * server wrote them, so the same replay shared twice is one file. Returns whether it was new.
   */
  putReplay(record: Uint8Array, tape: Uint8Array): boolean {
    const replay = parseReplay(record)
    if (!replay) throw new Error('That is not a civic.replay/0 record: it needs the tape hash, the commit and an outcome.')
    if (sha256(tape) !== replay.tape) throw new Error(`The tape for the replay of ${replay.scenario} doesn't match its SHA-256; nothing was kept.`)
    const name = `${sha256(record)}.replay.json`
    const isNew = !this.captureNames().includes(name)
    this.putFile(`${replay.tape}.tape.json`, tape)
    this.putFile(name, record)
    return isNew
  }

  /** The replays kept here or shared by others, oldest first. */
  replays(): StoredReplay[] {
    return this.captureNames()
      .filter((name) => name.endsWith('.replay.json'))
      .map((name) => parseReplay(this.readCapture(name))!)
      .filter(Boolean)
      .sort((a, b) => a.replayedAt.localeCompare(b.replayedAt) || a.tape.localeCompare(b.tape))
  }

  /** A replayed tape's bytes, by its SHA-256, or undefined when it isn't kept here. */
  readTape(sha: string): Uint8Array | undefined {
    if (!SHA256.test(sha)) throw new Error(`Not a tape hash: ${sha}`)
    try {
      return this.readCapture(`${sha}.tape.json`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
  }

  /** Every capture's file name, `<sha256>.<ext>`, for sharing them (roadmap step 5). Replays and their tapes are among them. */
  captureNames(): string[] {
    this.trust()
    try {
      return readdirSync(join(this.dir, 'captures')).filter((name) => NAME.test(name)).sort()
    } catch {
      return []
    }
  }

  readCapture(name: string): Uint8Array {
    if (!NAME.test(name)) throw new Error(`Not a capture: ${name}`)
    this.trust()
    return readFileSync(join(this.dir, 'captures', name))
  }

  /** Stores a capture shared by someone else, refusing bytes that don't match their name. */
  putCaptureNamed(name: string, bytes: Uint8Array) {
    if (name.endsWith('.replay.json') && !parseReplay(bytes)) throw new Error(`The shared replay ${name} is not a civic.replay/0 record; it was not kept.`)
    if (name.endsWith('.json')) return this.putFile(name, bytes)
    const match = NAME.exec(name)
    const mediaType = match && (Object.keys(EXTENSIONS) as CaptureRef['mediaType'][]).find((type) => EXTENSIONS[type] === match[2])
    if (!match || !mediaType) throw new Error(`Not a capture: ${name}`)
    const stored = this.putCapture(bytes, mediaType)
    if (stored.sha256 !== match[1]) throw new Error(`The shared capture ${name} doesn't match its SHA-256; it was not kept.`)
  }

  capturePath(capture: Pick<CaptureRef, 'sha256' | 'mediaType'>): string {
    return join(this.dir, 'captures', `${capture.sha256}.${EXTENSIONS[capture.mediaType]}`)
  }

  /** Writes a content-addressed file once, refusing bytes that don't match their name. */
  private putFile(name: string, bytes: Uint8Array) {
    const match = NAME.exec(name)
    if (!match) throw new Error(`Not a capture: ${name}`)
    if (sha256(bytes) !== match[1]) throw new Error(`The shared capture ${name} doesn't match its SHA-256; it was not kept.`)
    this.ensure()
    mkdirSync(join(this.dir, 'captures'), { recursive: true, mode: 0o700 })
    try {
      writeFileSync(join(this.dir, 'captures', name), bytes, { mode: 0o600, flag: 'wx' })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }

  /** Makes the folder, with a `.gitignore` that hides everything in it but a committed `civic.json`. */
  ensure() {
    this.trust()
    mkdirSync(this.dir, { recursive: true, mode: 0o700 })
    try {
      writeFileSync(join(this.dir, '.gitignore'), '*\n!civic.json\n', { flag: 'wx' })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    // A .gitignore that was already there may not hide the records; ask git rather than assume.
    if (this.root) {
      try { git(this.root, 'check-ignore', '-q', '--', join(STORE_FOLDER, 'records.graph.json')) } catch {
        throw new Error(`${this.dir} would not be ignored by git, so its records could be committed. Make ${join(this.dir, '.gitignore')} contain "*" and "!civic.json", or add ".civic/*" and "!.civic/civic.json" to the repository's .gitignore.`)
      }
    }
  }

  /** Refuses a folder that git tracks, since a checked-out branch could then supply records or a sign-in file. Asked once. */
  private trust() {
    if (this.checked || !this.root) return
    const tracked = git(this.root, 'ls-files', '--', STORE_FOLDER).split('\n').filter(Boolean)
    const foreign = tracked.filter((path) => path !== `${STORE_FOLDER}/civic.json`)
    if (foreign.length) throw new Error(`Git tracks ${foreign.slice(0, 3).join(', ')}${foreign.length > 3 ? ' and more' : ''} in ${this.dir}, which could have come from another branch. Only civic.json may be committed there. Untrack the rest with "git rm -r --cached ${STORE_FOLDER}" and commit, then retry.`)
    this.checked = true
  }

  private lock(): () => void {
    const path = join(this.dir, 'lock')
    const started = Date.now()
    for (;;) {
      try {
        mkdirSync(path)
        return () => rmSync(path, { recursive: true, force: true })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      }
      // A lock left by a crashed process is taken over once it is clearly stale.
      try {
        if (Date.now() - statSync(path).mtimeMs > STALE_LOCK_MS) rmSync(path, { recursive: true, force: true })
      } catch {}
      if (Date.now() - started > LOCK_WAIT_MS) throw new Error(`The CIVIC store at ${this.dir} is busy. Retry, or remove ${path} if no civic command is running.`)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25)
    }
  }
}

/**
 * A replay of a recorded run as the journey engine's review server keeps it (decision 0009).
 * The importers read it as run evidence; the store only keeps and shares it.
 */
export interface StoredReplay {
  schema: 'civic.replay/0'
  project: string
  scenario: string
  head: string
  source: string
  tape: string
  steps: number
  outcome: 'pass' | 'fail'
  divergedAt?: number
  message?: string
  replayedAt: string
}

const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')

function parseReplay(bytes: Uint8Array): StoredReplay | undefined {
  let value: Partial<StoredReplay>
  try {
    value = JSON.parse(Buffer.from(bytes).toString('utf8')) as Partial<StoredReplay>
  } catch {
    return undefined
  }
  const ok = value?.schema === 'civic.replay/0' && typeof value.project === 'string' && typeof value.scenario === 'string' && typeof value.replayedAt === 'string'
    && SHA256.test(String(value.tape)) && /^[0-9a-f]{40}$/.test(String(value.head)) && Number.isInteger(value.steps) && (value.outcome === 'pass' || value.outcome === 'fail')
  return ok ? (value as StoredReplay) : undefined
}

/** A write the graph's rules refuse. The message lists every rule it broke. */
export class RefusedError extends Error {
  constructor(message: string) {
    super(`Refused by the graph's rules:\n${message}`)
    this.name = 'RefusedError'
  }
}
