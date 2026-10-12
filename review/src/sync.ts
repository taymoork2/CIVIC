import { readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { SCHEMA_VERSION, type Actor, type GraphDocument, type GraphRecord, type WorkRequest } from '../../graph/src/index.ts'
import type { KeyObject } from 'node:crypto'
import { ACCESS_FILE, loadAccess, personOf, scopesOf, signingRequired, type AccessPolicy, type Scope } from './access.ts'
import { actorId, ensureActor, CIVIC_ACTOR_ID } from './identity.ts'
import { allow, versionOf, type Context } from './loop.ts'
import type { RecordsRemote, RemoteChange } from './remote.ts'
import { signedBy, signedPayload, signPayload } from './signing.ts'

// Roadmap step 5: each person's local store syncs with the team's shared records. A sync
// pulls what others shared, merges it record by record with what was written here since the
// last sync, and publishes the result on top of what it pulled. Records are never silently
// overwritten: when both sides changed the same record, the shared one stays shared, this
// side's version is kept aside as a conflict, and a person picks which one wins.

const EMPTY: GraphDocument = { schema: SCHEMA_VERSION, records: [], links: [] }
const ATTEMPTS = 5

export interface SyncConflict {
  id: string
  kind: GraphRecord['kind']
  /** The version written here, kept aside; the shared version stays in the store. */
  mine: GraphRecord
  theirs: GraphRecord
  at: string
}

export interface SyncResult {
  remote: string
  /** The shared revision this store now matches, or undefined when nothing is shared yet. */
  revision: string | undefined
  /** Records this sync brought in from others. */
  pulled: string[]
  /** Records this sync shared. */
  pushed: string[]
  /** Records both sides changed; see `civic conflicts`. */
  conflicts: SyncConflict[]
}

/** A shared change whose author can't have made it under the access policy. Nothing was merged. */
export class UntrustedChangeError extends Error {
  constructor(remote: string, revision: string, problems: string[]) {
    super(`Refused the shared records on ${remote} at ${revision.slice(0, 12)}; nothing was merged:\n${problems.map((problem) => `- ${problem}`).join('\n')}\nThe sync commit names who made it; ask them, or someone who can push to the repository, to revert it.`)
    this.name = 'UntrustedChangeError'
  }
}

export interface SyncOptions {
  /** The person's Ed25519 private key (`civic keygen`). Required once civic.access.json lists keys. */
  signingKey?: KeyObject
}

export function sync(context: Context, remote: RecordsRemote, options: SyncOptions = {}): SyncResult {
  allow(context, 'write', 'share records')
  const policy = context.access === undefined ? loadAccess(context.checkout) : (context.access ?? undefined)
  if (signingRequired(policy) && !options.signingKey) {
    throw new Error(`This repository signs shared records: ${ACCESS_FILE} on the default branch lists keys. Run civic keygen, add the key it prints under keys.${personOf(context.identity)} on the default branch, then sync again.`)
  }
  const store = context.store
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const state = readState(store.dir, remote.label)
    const shared = remote.fetch()
    if (shared) verify(remote, state?.revision, policy)
    const base = state?.document ?? EMPTY
    const theirs = shared?.document ?? EMPTY
    const at = (context.now ?? (() => new Date()))().toISOString()

    let merged!: GraphDocument
    let pulled: string[] = []
    let conflicts: SyncConflict[] = []
    let me = ''
    store.transact((local) => {
      // A store with nothing in it and nothing shared has nobody to name yet.
      me = local.records.length || theirs.records.length ? ensureActor(local, context.identity) : actorId(context.identity)
      const result = merge3(base, local, theirs, at, me)
      pulled = changedIds(local, result.document)
      conflicts = result.conflicts
      local.schema = result.document.schema
      local.records = result.document.records
      local.links = result.document.links
      merged = structuredClone(local)
    })
    if (conflicts.length) keepConflicts(store.dir, conflicts)

    // Captures are content-addressed, so both sides simply get the ones they lack.
    const have = new Set(store.captureNames())
    for (const name of shared?.captures ?? []) if (!have.has(name)) store.putCaptureNamed(name, remote.readCapture(shared!.revision, name))
    const theirCaptures = new Set(shared?.captures ?? [])
    const outgoing = new Map(store.captureNames().filter((name) => !theirCaptures.has(name)).map((name) => [name, store.readCapture(name)] as const))

    const pushed = changedIds(theirs, merged)
    if (shared && pushed.length === 0 && outgoing.size === 0) {
      writeState(store.dir, remote.label, { revision: shared.revision, document: theirs })
      return { remote: remote.label, revision: shared.revision, pulled, pushed, conflicts }
    }
    if (!shared && merged.records.length === 0) return { remote: remote.label, revision: undefined, pulled, pushed, conflicts }
    const signature = options.signingKey ? signPayload(options.signingKey, signedPayload(shared?.revision, merged, me)) : undefined
    const published = remote.publish({ document: merged, captures: outgoing, actor: me, summary: `CIVIC records: ${pushed.length} changed`, ...(signature ? { signature } : {}) }, shared?.revision)
    if (published === 'moved') continue
    writeState(store.dir, remote.label, { revision: published.revision, document: merged })
    return { remote: remote.label, revision: published.revision, pulled, pushed, conflicts }
  }
  throw new Error(`The shared records on ${remote.label} kept changing during the sync. Run civic sync again.`)
}

/** Conflicts kept aside by earlier syncs, newest per record. */
export function listConflicts(context: Pick<Context, 'store'>): SyncConflict[] {
  return readConflicts(context.store.dir)
}

/**
 * Settles a conflict. `theirs` keeps the shared version, which is already in the store.
 * `mine` puts this side's version back as a new change on top of the shared one, made by the
 * person settling it, so the next sync shares it and nobody's change is lost unseen. Taking
 * your own version over someone else's is a judgment call, so it needs the resolve scope.
 */
export function settleConflict(context: Context, id: string, keep: 'mine' | 'theirs'): SyncConflict {
  const conflicts = readConflicts(context.store.dir)
  const conflict = conflicts.find((candidate) => candidate.id === id || candidate.id.slice(candidate.id.indexOf(':') + 1).startsWith(id))
  if (!conflict) throw new Error(`No conflict for ${id}. civic conflicts lists them.`)
  if (keep === 'mine') {
    allow(context, 'resolve', 'keep your version over a shared one')
    context.store.transact((document) => {
      const by = ensureActor(document, context.identity)
      const at = (context.now ?? (() => new Date()))().toISOString()
      const index = document.records.findIndex((record) => record.id === conflict.id)
      const current = index >= 0 ? document.records[index]! : conflict.theirs
      const mine = structuredClone(conflict.mine) as GraphRecord
      if (mine.kind === 'work-request') {
        mine.version = Math.max(versionOf(mine), current.kind === 'work-request' ? versionOf(current) : 1) + 1
        mine.changed = { by, at, what: 'keep-mine' }
      }
      if (index >= 0) document.records[index] = mine
      else document.records.push(mine)
    })
  }
  writeConflicts(context.store.dir, conflicts.filter((candidate) => candidate !== conflict))
  return conflict
}

// ---------------------------------------------------------------------------
// Merging

/**
 * A three-way merge by record ID. A record only one side changed takes that side. When both
 * changed it differently, the shared version stays and this side's is returned as a conflict,
 * except for lines and actors, which describe the local checkout and people and are merged
 * rather than chosen.
 */
export function merge3(base: GraphDocument, mine: GraphDocument, theirs: GraphDocument, at: string, by: string): { document: GraphDocument; conflicts: SyncConflict[] } {
  const index = (document: GraphDocument) => new Map(document.records.map((record) => [record.id, record]))
  const [b, m, t] = [index(base), index(mine), index(theirs)]
  const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y)
  const ids = [...new Set([...t.keys(), ...m.keys()])]
  const records: GraphRecord[] = []
  const conflicts: SyncConflict[] = []
  for (const id of ids) {
    const [was, ours, shared] = [b.get(id), m.get(id), t.get(id)]
    if (!ours) { if (shared) records.push(shared); continue }
    if (!shared) { records.push(ours); continue }
    if (same(ours, shared) || same(ours, was)) { records.push(shared); continue }
    if (same(shared, was)) { records.push(ours); continue }
    if (ours.kind === 'line' && shared.kind === 'line') {
      const origins = new Set<string>()
      const previews = [...(ours.previews ?? []), ...(shared.previews ?? [])].filter((preview) => !origins.has(preview.url) && origins.add(preview.url))
      records.push({ ...shared, ...ours, ...(previews.length ? { previews } : {}) })
      continue
    }
    if (ours.kind === 'actor' && shared.kind === 'actor') { records.push(shared); continue }
    if (ours.kind === 'work-request' && shared.kind === 'work-request') {
      const comments = mergeComments(ours, shared)
      if (comments) {
        records.push({ ...shared, comments, version: Math.max(versionOf(ours), versionOf(shared)) + 1, changed: { by, at, what: 'merge-comments' } })
        continue
      }
    }
    records.push(shared)
    conflicts.push({ id, kind: ours.kind, mine: ours, theirs: shared, at })
  }
  const links = [...new Map([...theirs.links, ...mine.links].map((link) => [JSON.stringify(link), link])).values()]
  return { document: { schema: theirs.schema ?? mine.schema, records, links }, conflicts }
}

/**
 * Two people commenting on the same request at once is ordinary, so when the two versions
 * differ only in comments, both sets are kept, oldest first. Anything else is a conflict.
 */
function mergeComments(ours: WorkRequest, shared: WorkRequest): WorkRequest['comments'] | undefined {
  const rest = ({ comments: _comments, version: _version, changed: _changed, ...fields }: WorkRequest) => JSON.stringify(fields)
  if (rest(ours) !== rest(shared)) return undefined
  const seen = new Map([...shared.comments, ...ours.comments].map((comment) => [JSON.stringify(comment), comment]))
  return [...seen.values()].sort((a, b) => a.at.localeCompare(b.at))
}

function changedIds(from: GraphDocument, to: GraphDocument): string[] {
  const before = new Map(from.records.map((record) => [record.id, JSON.stringify(record)]))
  return to.records.filter((record) => before.get(record.id) !== JSON.stringify(record)).map((record) => record.id)
}

// ---------------------------------------------------------------------------
// Checking what others shared

/**
 * Checks every shared change since the last sync against the access policy: the person a
 * sync names may change only what they, their agents or CIVIC's own re-capture wrote, with
 * the scopes the policy gives them, and nobody deletes a record. Who could push at all is the
 * repository host's access control; this catches a sync that claims more than its person may.
 */
function verify(remote: RecordsRemote, since: string | undefined, policy: AccessPolicy | undefined) {
  for (const change of remote.changesSince(since)) {
    const problems = [...checkSignature(change, policy), ...checkChange(change.actor, change.before, change.after, policy)]
    if (problems.length) throw new UntrustedChangeError(remote.label, change.revision, problems)
  }
}

/**
 * Once civic.access.json lists keys, a shared sync counts only when it is signed by a key
 * listed for the person it names. Without listed keys, the name is a claim (decision 0008).
 */
export function checkSignature(change: Pick<RemoteChange, 'actor' | 'parent' | 'signature' | 'after'>, policy: AccessPolicy | undefined): string[] {
  if (!signingRequired(policy) || !change.actor) return []
  const actor = change.after.records.find((record): record is Actor => record.id === change.actor && record.kind === 'actor')
  if (!actor) return []
  if (!change.signature) return [`The sync naming ${change.actor} isn't signed, and ${ACCESS_FILE} requires signed syncs.`]
  const keys = policy!.keys[actor.handle] ?? []
  if (!signedBy(change.signature, signedPayload(change.parent, change.after, change.actor), keys)) {
    return [`The sync's signature isn't from a key ${ACCESS_FILE} lists for ${actor.handle}, so it can't be shown to come from ${change.actor}.`]
  }
  return []
}

const SCOPE_OF: Record<string, Scope> = { resolve: 'resolve', reopen: 'resolve', 'keep-mine': 'resolve', 'accept-check': 'approve', escalate: 'approve' }

export function checkChange(actorId: string | undefined, before: GraphDocument, after: GraphDocument, policy: AccessPolicy | undefined): string[] {
  if (!actorId) return ['The sync names nobody (no Civic-Actor trailer).']
  const actors = new Map(after.records.filter((record): record is Actor => record.kind === 'actor').map((actor) => [actor.id, actor]))
  const person = actors.get(actorId)
  if (person?.type !== 'person') return [`The sync names ${actorId}, which isn't a person in the records.`]
  const scopes = scopesOf(policy, { type: 'person', handle: person.handle })
  const own = (id: string | undefined) => id === actorId || id === CIVIC_ACTOR_ID || (id !== undefined && actors.get(id)?.delegatedBy === actorId)
  const problems: string[] = []
  const was = new Map(before.records.map((record) => [record.id, record]))
  const now = new Set(after.records.map((record) => record.id))
  for (const id of was.keys()) if (!now.has(id)) problems.push(`${actorId} deleted ${id}; shared records are never deleted.`)
  for (const record of after.records) {
    const previous = was.get(record.id)
    if (previous && JSON.stringify(previous) === JSON.stringify(record)) continue
    const author = authorOf(record)
    if (record.kind !== 'line' && record.kind !== 'actor' && !own(author)) problems.push(`${actorId} changed ${record.id} as ${author ?? 'nobody'}.`)
    if (record.kind === 'actor' && !own(record.id) && previous) problems.push(`${actorId} changed someone else's actor record, ${record.id}.`)
    const scope = record.kind === 'work-request' && record.changed ? (SCOPE_OF[record.changed.what] ?? 'write') : 'write'
    if (!scopes.has(scope)) problems.push(`${actorId} changed ${record.id}${record.kind === 'work-request' && record.changed ? ` (${record.changed.what})` : ''} without the ${scope} scope.`)
  }
  return problems
}

function authorOf(record: GraphRecord): string | undefined {
  if (record.kind === 'work-request') return record.changed?.by ?? (record as WorkRequest).history.at(-1)?.by
  return record.writtenBy
}

// ---------------------------------------------------------------------------
// Local sync state, beside the store

interface SyncState { revision: string; document: GraphDocument }

function stateFile(dir: string, label: string) {
  return join(dir, 'sync', `${label.replace(/[^A-Za-z0-9_-]+/g, '-')}.json`)
}

function readState(dir: string, label: string): SyncState | undefined {
  try {
    return JSON.parse(readFileSync(stateFile(dir, label), 'utf8')) as SyncState
  } catch {
    return undefined
  }
}

function writeState(dir: string, label: string, state: SyncState) {
  atomicWrite(stateFile(dir, label), state)
}

function readConflicts(dir: string): SyncConflict[] {
  try {
    return JSON.parse(readFileSync(join(dir, 'sync', 'conflicts.json'), 'utf8')) as SyncConflict[]
  } catch {
    return []
  }
}

function keepConflicts(dir: string, conflicts: SyncConflict[]) {
  const ids = new Set(conflicts.map((conflict) => conflict.id))
  writeConflicts(dir, [...readConflicts(dir).filter((conflict) => !ids.has(conflict.id)), ...conflicts])
}

function writeConflicts(dir: string, conflicts: SyncConflict[]) {
  atomicWrite(join(dir, 'sync', 'conflicts.json'), conflicts)
}

function atomicWrite(file: string, value: unknown) {
  mkdirSync(join(file, '..'), { recursive: true, mode: 0o700 })
  writeFileSync(`${file}.tmp`, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  renameSync(`${file}.tmp`, file)
}

