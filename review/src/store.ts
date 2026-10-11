import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SCHEMA_VERSION, validateGraph, type CaptureRef, type GraphDocument } from '../../graph/src/index.ts'

const STALE_LOCK_MS = 30_000
const LOCK_WAIT_MS = 10_000
const EXTENSIONS: Record<CaptureRef['mediaType'], string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

/**
 * CIVIC's local collaboration records (D39). One graph document and its content-addressed
 * captures, kept in the git common directory so every worktree and every local agent of a
 * repository sees the same annotations, requests and claims, and nothing is committed to a
 * product branch. The team-wide store is roadmap step 5; it holds the same record shapes.
 */
export class Store {
  readonly dir: string
  readonly file: string

  constructor(dir: string) {
    this.dir = dir
    this.file = join(dir, 'records.graph.json')
  }

  /** The store for a repository, from its git common directory. */
  static forCommonDir(commonDir: string): Store {
    return new Store(join(commonDir, 'civic'))
  }

  read(): GraphDocument {
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
    mkdirSync(this.dir, { recursive: true, mode: 0o700 })
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
    try {
      return (JSON.parse(readFileSync(join(this.dir, 'preview-auth.json'), 'utf8')) as Record<string, string>)[origin]
    } catch {
      return undefined
    }
  }

  setPreviewAuth(origin: string, bearerFile: string | undefined) {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 })
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

  capturePath(capture: Pick<CaptureRef, 'sha256' | 'mediaType'>): string {
    return join(this.dir, 'captures', `${capture.sha256}.${EXTENSIONS[capture.mediaType]}`)
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

/** A write the graph's rules refuse. The message lists every rule it broke. */
export class RefusedError extends Error {
  constructor(message: string) {
    super(`Refused by the graph's rules:\n${message}`)
    this.name = 'RefusedError'
  }
}
