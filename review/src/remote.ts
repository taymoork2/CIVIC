import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SCHEMA_VERSION, type GraphDocument } from '../../graph/src/index.ts'
import { canonical } from './signing.ts'

/**
 * Where a team's shared records live (roadmap step 5). Each person's local store syncs with
 * one remote: a commit-like history of whole snapshots, each made by one person. The first
 * remote is a git ref on the repository's own remote, so there is no server to run and only
 * people who can push to the repository can share records. A hosted service with sign-in
 * can implement the same interface later; nothing else in CIVIC knows which remote it is.
 */
export interface RecordsRemote {
  /** For messages, such as `origin refs/civic/records`. */
  readonly label: string
  /** The latest shared snapshot, or undefined when nobody has shared records yet. */
  fetch(): RemoteSnapshot | undefined
  /** The snapshots after `since` (or all of them), oldest first, each with the one before it. */
  changesSince(since: string | undefined): RemoteChange[]
  readCapture(revision: string, name: string): Uint8Array
  /**
   * Publishes a snapshot made on top of `base`, the revision it was merged with. Refused,
   * with nothing written, when the remote moved past `base` meanwhile; fetch, merge, retry.
   */
  publish(snapshot: OutgoingSnapshot, base: string | undefined): { revision: string } | 'moved'
}

export interface RemoteSnapshot {
  revision: string
  document: GraphDocument
  /** Capture file names, `<sha256>.<ext>`. */
  captures: string[]
}

export interface RemoteChange {
  revision: string
  /** The revision it was made on top of. */
  parent: string | undefined
  /** The `ed25519:` signature over signedPayload(parent, after, actor), when the sync was signed. */
  signature: string | undefined
  /** The actor the snapshot says made it. */
  actor: string | undefined
  before: GraphDocument
  after: GraphDocument
}

export interface OutgoingSnapshot {
  document: GraphDocument
  /** Captures the remote doesn't have yet, by file name. */
  captures: Map<string, Uint8Array>
  actor: string
  summary: string
  /** The sync's signature over signedPayload(base, document, actor). */
  signature?: string
}

const EMPTY: GraphDocument = { schema: SCHEMA_VERSION, records: [], links: [] }
export const DEFAULT_REF = 'refs/civic/records'

/**
 * Records kept on a git ref of the repository's remote (by default `origin`), outside every
 * branch: each sync is a commit holding `records.graph.json` and `captures/`, with the
 * person who synced in a `Civic-Actor:` trailer. A push that isn't a fast-forward is
 * refused by git itself, which is the compare-and-swap that keeps two syncs from losing
 * each other's records. Who may push is the repository host's own access control.
 */
export class GitRefRemote implements RecordsRemote {
  readonly label: string
  private readonly tracking: string
  private readonly root: string
  private readonly remote: string
  private readonly ref: string

  constructor(root: string, remote = 'origin', ref = DEFAULT_REF) {
    this.root = root
    this.remote = remote
    this.ref = ref
    this.label = `${remote} ${ref}`
    this.tracking = `refs/civic/remotes/${remote}/${ref.replace(/^refs\//, '').replaceAll('/', '-')}`
  }

  fetch(): RemoteSnapshot | undefined {
    try {
      this.git([], 'fetch', '--quiet', '--no-tags', this.remote, `+${this.ref}:${this.tracking}`)
    } catch (error) {
      if (!/couldn't find remote ref/i.test(String((error as { stderr?: unknown }).stderr ?? error))) throw error
      return undefined
    }
    const revision = this.git([], 'rev-parse', this.tracking)
    return { revision, document: this.documentAt(revision), captures: this.capturesAt(revision) }
  }

  changesSince(since: string | undefined): RemoteChange[] {
    const head = this.tryGit('rev-parse', '--verify', '--quiet', this.tracking)
    if (!head) return []
    const range = since ? `${since}..${head}` : head
    const revisions = this.git([], 'rev-list', '--reverse', '--first-parent', range).split('\n').filter(Boolean)
    return revisions.map((revision) => {
      const parent = this.tryGit('rev-parse', '--verify', '--quiet', `${revision}^`)
      const message = this.git([], 'log', '-1', '--format=%B', revision)
      return {
        revision,
        parent,
        actor: /^Civic-Actor: (.+)$/m.exec(message)?.[1]?.trim(),
        signature: /^Civic-Signature: (.+)$/m.exec(message)?.[1]?.trim(),
        before: parent ? this.documentAt(parent) : EMPTY,
        after: this.documentAt(revision),
      }
    })
  }

  readCapture(revision: string, name: string): Uint8Array {
    return execFileSync('git', ['-C', this.root, 'cat-file', 'blob', `${revision}:captures/${name}`], { maxBuffer: 64 * 1024 * 1024 })
  }

  publish(snapshot: OutgoingSnapshot, base: string | undefined): { revision: string } | 'moved' {
    const scratch = mkdtempSync(join(tmpdir(), 'civic-index-'))
    const env = { GIT_INDEX_FILE: join(scratch, 'index') }
    try {
      if (base) this.git([env], 'read-tree', base)
      const records = this.git([], 'hash-object', '-w', '--stdin', { input: canonical(snapshot.document) })
      this.git([env], 'update-index', '--add', '--cacheinfo', `100644,${records},records.graph.json`)
      for (const [name, bytes] of snapshot.captures) {
        const blob = this.git([], 'hash-object', '-w', '--stdin', { input: bytes })
        this.git([env], 'update-index', '--add', '--cacheinfo', `100644,${blob},captures/${name}`)
      }
      const tree = this.git([env], 'write-tree')
      const message = `${snapshot.summary}\n\nCivic-Actor: ${snapshot.actor}\n${snapshot.signature ? `Civic-Signature: ${snapshot.signature}\n` : ''}`
      const commit = this.git([], 'commit-tree', tree, ...(base ? ['-p', base] : []), { input: message })
      try {
        this.git([], 'push', '--quiet', this.remote, `${commit}:${this.ref}`)
      } catch (error) {
        if (/rejected|non-fast-forward|fetch first|stale info/i.test(String((error as { stderr?: unknown }).stderr ?? error))) return 'moved'
        throw error
      }
      this.git([], 'update-ref', this.tracking, commit)
      return { revision: commit }
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  }

  private documentAt(revision: string): GraphDocument {
    return JSON.parse(this.git([], 'show', `${revision}:records.graph.json`)) as GraphDocument
  }

  private capturesAt(revision: string): string[] {
    return this.git([], 'ls-tree', '--name-only', `${revision}:captures`, { allowFailure: true }).split('\n').filter(Boolean)
  }

  private tryGit(...args: string[]): string | undefined {
    try {
      return this.git([], ...args)
    } catch {
      return undefined
    }
  }

  private git(envs: Record<string, string>[], ...args: (string | { input?: string | Uint8Array; allowFailure?: boolean })[]): string {
    const options = (typeof args.at(-1) === 'object' ? args.pop() : {}) as { input?: string | Uint8Array; allowFailure?: boolean }
    try {
      return execFileSync('git', ['-C', this.root, ...(args as string[])], {
        encoding: 'utf8',
        env: { ...process.env, ...Object.assign({}, ...envs), GIT_TERMINAL_PROMPT: '0' },
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 64 * 1024 * 1024,
        ...(options.input !== undefined ? { input: options.input } : {}),
      }).trim()
    } catch (error) {
      if (options.allowFailure) return ''
      throw error
    }
  }
}
