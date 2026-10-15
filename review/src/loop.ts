import { randomUUID } from 'node:crypto'
import {
  checkCounts,
  indexGraph,
  isAnchored,
  laneFor,
  type Anchor,
  type Annotation,
  type CaptureRef,
  type EdgeRef,
  type ElementLocator,
  type GraphDocument,
  type Environment,
  type Lane,
  type Line,
  type Owner,
  type Platform,
  type RequestStatus,
  type WorkRequest,
} from '../../graph/src/index.ts'
import { ForbiddenError, loadAccess, scopesOf, type AccessPolicy, type Scope } from './access.ts'
import { git, idPath, revisionOf, type Checkout } from './git.ts'
import { actorId, ensureActor, type Identity } from './identity.ts'
import type { Store } from './store.ts'

/** Everything an operation needs to know about who runs it and where. */
export interface Context {
  store: Store
  checkout: Checkout
  identity: Identity
  now?: () => Date
  /** The access policy (roadmap step 5). Left out, it is read from the default branch; null means none. */
  access?: AccessPolicy | null
}

const DEFAULT_LEASE_MINUTES = 120

const nowOf = (context: Context) => (context.now ?? (() => new Date()))()

/** Refuses an operation the access policy doesn't give this identity's person. */
export function allow(context: Context, scope: Scope, what: string) {
  const policy = context.access === undefined ? loadAccess(context.checkout) : (context.access ?? undefined)
  if (!scopesOf(policy, context.identity).has(scope)) throw new ForbiddenError(context.identity, scope, what)
}

// ---------------------------------------------------------------------------
// Lines (D36)

export function mainLineId(): string {
  return 'line:git.main'
}

/** The line a checkout is on: main, a branch, or a linked worktree's branch. */
export function lineIdFor(checkout: Checkout): string {
  if (checkout.branch === checkout.defaultBranch) return mainLineId()
  if (!checkout.branch) return `line:git.detached.${checkout.head.slice(0, 12)}`
  return `line:git.${idPath(checkout.branch)}`
}

/**
 * Records main and the checkout's own line, with the revisions they are at now. Run on
 * every write, so each record names a line the store knows. A linked worktree's path is
 * kept in the line's source, so CIVIC can run acceptance checks in it.
 */
export function ensureLines(document: GraphDocument, checkout: Checkout): string {
  const mainHead = revisionOf(checkout.root, checkout.defaultBranch) ?? checkout.head
  upsertLine(document, { id: mainLineId(), kind: 'line', title: checkout.defaultBranch, type: 'main', tool: 'git', ref: checkout.defaultBranch, head: mainHead, status: 'open' })
  const id = lineIdFor(checkout)
  if (id !== mainLineId()) {
    upsertLine(document, {
      id,
      kind: 'line',
      title: checkout.isWorktree ? `Worktree: ${checkout.branch ?? 'detached'}` : (checkout.branch ?? 'detached HEAD'),
      type: checkout.isWorktree ? 'worktree' : 'branch',
      tool: 'git',
      ref: checkout.branch ?? checkout.head,
      base: mainLineId(),
      head: checkout.head,
      status: 'open',
      source: { tool: 'git', importer: 'civic-review', revision: checkout.head, path: checkout.root },
    })
  }
  return id
}

function upsertLine(document: GraphDocument, line: Line) {
  const existing = document.records.find((record): record is Line => record.id === line.id && record.kind === 'line')
  if (!existing) return void document.records.push(line)
  existing.head = line.head
  if (line.source) existing.source = line.source
  if (existing.status !== 'open' && line.status === 'open' && existing.type !== 'main') {
    // A branch name reused after a merge is a new stream of work on the same line.
    existing.status = 'open'
    delete existing.mergedAs
  }
}

/**
 * Says a preview serves this checkout's line at its current revision. A preview behind a
 * local access key (the journey engine's review server) names the file holding the key, so
 * CIVIC's re-capture can sign in. The key itself is never copied into the store.
 */
export function registerPreview(context: Context, url: string, bearerFile?: string): Line {
  allow(context, 'write', 'register a preview')
  const origin = new URL(url).origin
  if (bearerFile) context.store.setPreviewAuth(origin, bearerFile)
  return context.store.transact((document) => {
    const id = ensureLines(document, context.checkout)
    const line = find<Line>(document, id, 'line')
    line.previews = [...(line.previews ?? []).filter((preview) => new URL(preview.url).origin !== origin), { url: origin, revision: context.checkout.head }]
    return structuredClone(line)
  })
}

export interface PullRequestInput {
  number: number
  /** Where the PR's head runs, such as a hosted preview deploy. */
  preview?: string
  /** The git remote that hosts the PR; GitHub serves its head as `refs/pull/<n>/head`. */
  remote?: string
}

/**
 * Records a pull request as its own line (D36), at the head its remote has now, with the
 * preview that serves that head. Annotations made on the preview's URL then land on the PR's
 * line and revision, and fixes can be re-captured there. Run it again when the PR moves; once
 * its head is on the default branch, the line is marked merged.
 */
export function registerPullRequest(context: Context, input: PullRequestInput): Line {
  allow(context, 'write', 'register a pull request')
  if (!Number.isInteger(input.number) || input.number < 1) throw new Error(`A pull request number is a whole number from 1. Got ${input.number}.`)
  const remote = input.remote ?? 'origin'
  const local = `refs/civic/pulls/${remote}/${input.number}`
  const root = context.checkout.root
  try {
    git(root, 'fetch', '--quiet', '--no-tags', remote, `+refs/pull/${input.number}/head:${local}`, `+refs/heads/${context.checkout.defaultBranch}:refs/civic/pulls/${remote}/base`)
  } catch (error) {
    throw new Error(`Couldn't fetch pull request ${input.number} from ${remote}: ${String((error as { stderr?: unknown }).stderr ?? (error as Error).message).trim()}`)
  }
  const head = git(root, 'rev-parse', local)
  const merged = isAncestor(root, head, `refs/civic/pulls/${remote}/base`)
  return context.store.transact((document) => {
    ensureLines(document, context.checkout)
    const id = `line:github.pr.${input.number}`
    let line = document.records.find((record): record is Line => record.id === id && record.kind === 'line')
    if (!line) {
      line = { id, kind: 'line', title: `Pull request #${input.number}`, type: 'pr', tool: 'github', ref: String(input.number), base: mainLineId(), head, status: 'open' }
      document.records.push(line)
    }
    line.head = head
    line.source = { tool: 'github', importer: 'civic-review', revision: head, path: `${remote} refs/pull/${input.number}/head` }
    if (merged) {
      line.status = 'merged'
      line.mergedAs = head
    }
    // A hosted PR preview redeploys on every push, so each preview it has serves the new head.
    const origins = [...(line.previews ?? []).map((preview) => preview.url), ...(input.preview ? [new URL(input.preview).origin] : [])]
    if (origins.length) line.previews = [...new Set(origins)].map((url) => ({ url, revision: head }))
    return structuredClone(line)
  })
}

export interface ReleaseInput {
  /** `npm` for a code package version, `figma` for a design library publish. */
  tool: 'npm' | 'figma'
  /** `<package>@<version>` or `<file key>@<version>`. */
  ref: string
  /** The line it was released from; main by default. */
  from?: string
  title?: string
}

/**
 * Records a library release as its own line (decision 0013, point 3): a published version a
 * product can pin, so a story can be read on it. A release never moves or merges, so
 * registering it again only renames it.
 */
export function registerRelease(context: Context, input: ReleaseInput): Line {
  allow(context, 'write', 'register a library release')
  const at = input.ref.lastIndexOf('@')
  if (at <= 0 || at === input.ref.length - 1) throw new Error(`A release is <package>@<version> or <file key>@<version>. Got ${input.ref}.`)
  const version = input.ref.slice(at + 1)
  return context.store.transact((document) => {
    ensureLines(document, context.checkout)
    const base = input.from ?? mainLineId()
    if (!document.records.some((record) => record.id === base && record.kind === 'line')) throw new Error(`No line ${base} to release from. \`civic lines\` lists them.`)
    const id = `line:${input.tool}.release.${idPath(input.ref.replaceAll('@', '.'))}`
    let line = document.records.find((record): record is Line => record.id === id && record.kind === 'line')
    if (!line) {
      line = { id, kind: 'line', title: input.title ?? input.ref, type: 'release', tool: input.tool, ref: input.ref, base, head: version, status: 'open' }
      document.records.push(line)
    } else if (input.title) line.title = input.title
    return structuredClone(line)
  })
}

export interface EnvironmentInput {
  name: string
  title?: string
  url?: string
  canvas?: boolean
  /** Lines deployed there, each at a revision; a line given without one runs at its head. */
  runs: { line: string; revision?: string }[]
}

/**
 * Records which revision of which line runs in an environment, such as staging or production
 * (decision 0013, point 3). Each call is an observation: it replaces the revision of each line
 * it names and keeps the others.
 */
export function recordEnvironment(context: Context, input: EnvironmentInput): Environment {
  allow(context, 'write', 'record an environment')
  if (input.runs.length === 0) throw new Error('Name at least one line that runs there: --runs <line>[@<revision>].')
  const observedAt = nowOf(context).toISOString()
  return context.store.transact((document) => {
    ensureLines(document, context.checkout)
    const id = `environment:${idPath(input.name)}`
    let environment = document.records.find((record): record is Environment => record.id === id && record.kind === 'environment')
    if (!environment) {
      environment = { id, kind: 'environment', title: input.title ?? input.name, runs: [] }
      document.records.push(environment)
    }
    if (input.title) environment.title = input.title
    if (input.url) environment.url = new URL(input.url).origin
    if (input.canvas !== undefined) environment.canvas = input.canvas
    for (const run of input.runs) {
      const line = document.records.find((record): record is Line => record.id === run.line && record.kind === 'line')
      if (!line) throw new Error(`No line ${run.line}. \`civic lines\` lists them.`)
      environment.runs = [...environment.runs.filter((item) => item.line !== line.id), { line: line.id, revision: run.revision ?? line.head, observedAt }]
    }
    return structuredClone(environment)
  })
}

function isAncestor(root: string, revision: string, of: string): boolean {
  try {
    git(root, 'merge-base', '--is-ancestor', revision, of)
    return true
  } catch {
    return false
  }
}

/** The line whose preview serves this URL, if any (the latest registration wins). */
function lineForUrl(document: GraphDocument, url: string): { line: string; revision: string } | undefined {
  const origin = new URL(url).origin
  for (const record of document.records) {
    if (record.kind !== 'line') continue
    const preview = record.previews?.find((candidate) => new URL(candidate.url).origin === origin)
    if (preview) return { line: record.id, revision: preview.revision }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Annotations (D37, D40)

export interface AnnotateInput {
  comment: string
  title?: string
  targetIds?: string[]
  edges?: EdgeRef[]
  locator?: ElementLocator
  rect?: Anchor['rect']
  /** An image to keep as the frozen capture: a screenshot import, or the overlay's capture. */
  image?: { bytes: Uint8Array; mediaType: CaptureRef['mediaType'] }
  viewport?: CaptureRef['viewport']
  /** The page the annotation was made on. If it is a registered preview, its line and revision are used. */
  url?: string
  /** The line and revision a preview stamped on itself at build time. Used only when the store knows the line. */
  stamped?: { line: string; revision: string }
  /** A line the store knows, such as a design draft, annotated at its latest revision. */
  line?: string
}

/**
 * Records an annotation for the person running the command, or for the person an agent
 * acts for. With no target, edge or locator it is unanchored, which is how an imported
 * screenshot arrives: tracked and handed off like any other, but it can't follow the
 * product to another revision until someone anchors it.
 */
export function annotate(context: Context, input: AnnotateInput): Annotation {
  allow(context, 'write', 'annotate')
  const capture = input.image ? context.store.putCapture(input.image.bytes, input.image.mediaType) : undefined
  return context.store.transact((document) => {
    const writtenBy = ensureActor(document, context.identity)
    const here = ensureLines(document, context.checkout)
    const stamped = input.stamped && document.records.some((record) => record.kind === 'line' && record.id === input.stamped!.line) ? input.stamped : undefined
    const named = input.line ? find<Line>(document, input.line, 'line') : undefined
    const seen = (named && { line: named.id, revision: named.head }) ?? stamped ?? (input.url ? lineForUrl(document, input.url) : undefined) ?? { line: here, revision: context.checkout.head }
    const anchor: Anchor = {
      targetIds: [...new Set([...(input.targetIds ?? []), ...(input.edges ?? []).map((edge) => edge.from)])],
      ...(input.edges?.length ? { edges: input.edges } : {}),
      ...(input.locator ? { locator: input.locator } : {}),
      ...(input.rect ? { rect: input.rect } : {}),
    }
    const url = input.url ? new URL(input.url) : undefined
    const annotation: Annotation = {
      id: `annotation:${randomUUID()}`,
      kind: 'annotation',
      title: input.title ?? firstLine(input.comment),
      comment: input.comment,
      ...(isAnchored(anchor) || anchor.rect ? { anchor } : {}),
      ...(capture ? { capture: { ...capture, ...(input.viewport ? { viewport: input.viewport } : {}), ...(url ? { reproduction: url.pathname + url.search } : {}) } } : {}),
      seenOn: { ...seen, ...(input.url ? { url: input.url } : {}) },
      at: nowOf(context).toISOString(),
      writtenBy,
    }
    document.records.push(annotation)
    return annotation
  })
}

// ---------------------------------------------------------------------------
// Work requests (D38)

export interface RequestInput {
  annotationIds: string[]
  ask: string
  title?: string
  /** A change to intent or behavior, not a fix that restores the approved contract. */
  change?: boolean
  highRisk?: boolean
  checks?: string[]
  owners?: Owner[]
  platform?: Platform
  contextIds?: string[]
}

/** "Hand to agent": turns annotations into a work request any agent can claim. */
export function createRequest(context: Context, input: RequestInput): WorkRequest {
  allow(context, 'write', 'ask for work')
  return context.store.transact((document) => {
    const by = ensureActor(document, context.identity)
    ensureLines(document, context.checkout)
    const annotationIds = input.annotationIds.map((id) => resolveId(document, id, 'annotation'))
    const annotations = annotationIds.map((id) => find<Annotation>(document, id, 'annotation'))
    // The problem was seen where its first annotation was made.
    const base = { line: annotations[0]!.seenOn.line, revision: annotations[0]!.seenOn.revision }
    const id = `request:${randomUUID()}`
    const at = nowOf(context).toISOString()
    const request: WorkRequest = {
      id,
      kind: 'work-request',
      title: input.title ?? firstLine(input.ask),
      ask: input.ask,
      annotationIds,
      intent: input.change ? 'change' : 'restore-contract',
      risk: input.highRisk ? 'high' : 'normal',
      base,
      ...(input.platform ? { platform: input.platform } : {}),
      ...(input.contextIds?.length ? { contextIds: input.contextIds } : {}),
      acceptance: (input.checks ?? []).map((command) => ({ command, writtenBy: by })),
      repro: `civic repro ${id} --url <preview>`,
      requestedBy: by,
      ...(input.owners?.length ? { owners: input.owners } : {}),
      status: 'open',
      fixes: [],
      comments: [],
      history: [{ status: 'open', by, at }],
      version: 1,
      changed: { by, at, what: 'request' },
    }
    document.records.push(request)
    return request
  })
}

export interface RequestSummary {
  request: WorkRequest
  lane: Lane
  /** The live claim, if its lease hasn't expired. */
  claimedBy?: string
}

export function summarize(document: GraphDocument, request: WorkRequest, now: Date): RequestSummary {
  const graph = indexGraph(document)
  const lane = laneFor(
    request,
    (id) => { const record = graph.get(id); return record?.kind === 'actor' ? record : undefined },
    (id) => { const record = graph.get(id); return record?.kind === 'annotation' && isAnchored(record.anchor) },
  )
  const live = request.claim && request.status === 'claimed' && Date.parse(request.claim.expires) > now.getTime()
  return { request, lane, ...(live ? { claimedBy: request.claim!.by } : {}) }
}

/** Whether an acceptance check counts toward Auto: a person wrote it or accepted it. */
export function checkCountsIn(document: GraphDocument): (check: WorkRequest['acceptance'][number]) => boolean {
  const graph = indexGraph(document)
  return (check) => checkCounts(check, (id) => { const record = graph.get(id); return record?.kind === 'actor' ? record : undefined })
}

export interface ListFilter {
  status?: RequestStatus[]
  lane?: Lane
  /** Only requests on, or claimable from, this line. */
  line?: string
}

/** Open work first, then by when it was asked for. */
export function listRequests(context: Context, filter: ListFilter = {}): RequestSummary[] {
  allow(context, 'read', 'read work requests')
  const document = context.store.read()
  const now = nowOf(context)
  const order: RequestStatus[] = ['reopened', 'open', 'claimed', 'fix-ready', 'resolved']
  return document.records
    .filter((record): record is WorkRequest => record.kind === 'work-request')
    .map((request) => summarize(document, request, now))
    .filter(({ request, lane }) => (!filter.status || filter.status.includes(request.status)) && (!filter.lane || filter.lane === lane))
    .filter(({ request }) => !filter.line || request.base.line === filter.line || request.claim?.line === filter.line || request.status === 'open' || request.status === 'reopened')
    .sort((a, b) => order.indexOf(a.request.status) - order.indexOf(b.request.status) || a.request.history[0]!.at.localeCompare(b.request.history[0]!.at))
}

export function getRequest(context: Context, id: string): RequestSummary {
  allow(context, 'read', 'read work requests')
  const document = context.store.read()
  return summarize(document, find<WorkRequest>(document, resolveId(document, splitVersion(id).id, 'request'), 'work-request'), nowOf(context))
}

/**
 * Claims a request for the checkout's line. A claim is a lease, so a crashed agent
 * doesn't block the request forever. A live claim by someone else is refused, naming
 * the holder. The same actor can renew its own claim.
 */
export function claim(context: Context, id: string, leaseMinutes = DEFAULT_LEASE_MINUTES): WorkRequest {
  return mutateRequest(context, id, 'claim', 'write', (request, by, at, document) => {
    const now = nowOf(context)
    if (request.status === 'fix-ready') throw new Error(`${request.id} already has a fix waiting for review; reopen it first.`)
    if (request.status === 'resolved') throw new Error(`${request.id} is resolved; a person can reopen it.`)
    const holder = summarize(document, request, now).claimedBy
    if (holder && holder !== by) throw new Error(`${request.id} is claimed by ${holder} on ${request.claim!.line} until ${request.claim!.expires}.`)
    const line = ensureLines(document, context.checkout)
    request.claim = { by, line, at, expires: new Date(now.getTime() + leaseMinutes * 60_000).toISOString() }
    if (request.status !== 'claimed') request.history.push({ status: 'claimed', by, at })
    request.status = 'claimed'
  })
}

/** Gives a claim back, so another agent can take the request. */
export function release(context: Context, id: string): WorkRequest {
  return mutateRequest(context, id, 'release', 'write', (request, by, at) => {
    if (request.status !== 'claimed' || request.claim?.by !== by) throw new Error(`${request.id} is not claimed by ${by}.`)
    const reopened = request.history.some((event) => event.status === 'reopened')
    request.status = reopened ? 'reopened' : 'open'
    request.history.push({ status: request.status, by, at, note: 'Claim released.' })
    delete request.claim
  })
}

export function comment(context: Context, id: string, text: string): WorkRequest {
  return mutateRequest(context, id, 'comment', 'write', (request, by, at) => {
    request.comments.push({ by, at, text })
  })
}

export interface FixInput {
  preview?: string
  note?: string
  /** Defaults to the checkout's HEAD. */
  revision?: string
}

/**
 * Says a fix is ready, with its line, revision and preview. This only moves the request to
 * Fix ready for review; CIVIC's re-capture and the request's lane decide what happens next.
 * The reporter must hold the claim, so two agents can't report over each other.
 */
export function reportFix(context: Context, id: string, input: FixInput = {}): WorkRequest {
  return mutateRequest(context, id, 'report-fix', 'write', (request, by, at, document) => {
    if (request.status !== 'claimed' || request.claim?.by !== by) {
      throw new Error(`Claim ${request.id} before reporting a fix${request.claim ? `; it is claimed by ${request.claim.by}` : ''}.`)
    }
    const line = ensureLines(document, context.checkout)
    const revision = input.revision ?? context.checkout.head
    if (input.preview) {
      const record = find<Line>(document, line, 'line')
      const origin = new URL(input.preview).origin
      record.previews = [...(record.previews ?? []).filter((preview) => new URL(preview.url).origin !== origin), { url: origin, revision }]
    }
    request.fixes.push({ by, line, revision, at, ...(input.preview ? { preview: input.preview } : {}), ...(input.note ? { note: input.note } : {}) })
    request.status = 'fix-ready'
    request.history.push({ status: 'fix-ready', by, at, ...(input.note ? { note: input.note } : {}) })
  })
}

/** Adds an acceptance check. A check an agent adds counts toward Auto only once a person accepts it. */
export function addCheck(context: Context, id: string, command: string): WorkRequest {
  return mutateRequest(context, id, 'add-check', 'write', (request, by) => {
    request.acceptance.push({ command, writtenBy: by })
  })
}

/** A person accepts an agent's check, by its position in the request's acceptance list (from 1). */
export function acceptCheck(context: Context, id: string, position: number): WorkRequest {
  return mutateRequest(context, id, 'accept-check', 'approve', (request, by) => {
    const check = request.acceptance[position - 1]
    if (!check) throw new Error(`${request.id} has no acceptance check ${position}.`)
    check.acceptedBy = by
  })
}

/**
 * A person resolves requests, many at a time (batch review), or signs one off as its owner.
 * The graph's rules refuse an agent, a non-owner in the owner lane, and on a high-risk target
 * the person who delegated the fix. A request with no reported fix needs a note saying why.
 */
export function resolve(context: Context, ids: string[], note?: string): WorkRequest[] {
  allow(context, 'resolve', 'resolve work requests')
  return context.store.transact((document) => {
    const by = ensureActor(document, context.identity)
    const at = nowOf(context).toISOString()
    return ids.map((id) => {
      const request = findVersioned(document, id)
      if (request.status === 'resolved') throw new Error(`${request.id} is already resolved.`)
      if (request.status !== 'fix-ready' && !note) throw new Error(`${request.id} has no fix waiting for review; say why it is resolved with --note.`)
      request.status = 'resolved'
      request.history.push({ status: 'resolved', by, at, ...(note ? { note } : {}) })
      bump(request, by, at, 'resolve')
      return structuredClone(request)
    })
  })
}

/** Sends a fix back, or reopens a resolved request; the note goes to whoever picks it up. */
export function reopen(context: Context, id: string, note: string): WorkRequest {
  return mutateRequest(context, id, 'reopen', 'resolve', (request, by, at) => {
    if (request.status !== 'resolved' && request.status !== 'fix-ready') throw new Error(`${request.id} is ${request.status}; only a fix waiting for review or a resolved request can be reopened.`)
    request.status = 'reopened'
    request.history.push({ status: 'reopened', by, at, note })
    delete request.claim
  })
}

/** A person sends a request to a stricter lane than its rules give. */
export function escalate(context: Context, id: string, lane: 'batch-review' | 'owner-sign-off'): WorkRequest {
  return mutateRequest(context, id, 'escalate', 'approve', (request) => {
    request.escalatedTo = lane
  })
}

/** Fixes waiting for a person, grouped by lane: the batch-review queue and the owners' sign-offs. */
export function reviewQueue(context: Context): RequestSummary[] {
  return listRequests(context, { status: ['fix-ready'] })
}

// ---------------------------------------------------------------------------

function mutateRequest(context: Context, id: string, what: string, scope: Scope, change: (request: WorkRequest, by: string, at: string, document: GraphDocument) => void): WorkRequest {
  allow(context, scope, what.replace('-', ' '))
  return context.store.transact((document) => {
    const by = ensureActor(document, context.identity)
    const at = nowOf(context).toISOString()
    const request = findVersioned(document, id)
    change(request, by, at, document)
    bump(request, by, at, what)
    return structuredClone(request)
  })
}

/**
 * A request ID may carry the version it was read at, as `<id>@<version>` (roadmap step 5).
 * The write is then refused if anyone changed the request since, naming the change, so a
 * stale view never overwrites a newer fix, claim or comment. Without one, the write applies
 * to the request as it is now.
 */
export function splitVersion(id: string): { id: string; expected?: number } {
  const match = /^(.+)@(\d+)$/.exec(id)
  return match ? { id: match[1]!, expected: Number(match[2]) } : { id }
}

export function versionOf(request: WorkRequest): number {
  return request.version ?? 1
}

function findVersioned(document: GraphDocument, id: string): WorkRequest {
  const { id: bare, expected } = splitVersion(id)
  const request = find<WorkRequest>(document, resolveId(document, bare, 'request'), 'work-request')
  if (expected !== undefined && expected !== versionOf(request)) throw new ConflictError(request, expected)
  return request
}

/** Counts a change and says who made it. CIVIC's re-capture counts too. */
export function bump(request: WorkRequest, by: string, at: string, what: string) {
  request.version = versionOf(request) + 1
  request.changed = { by, at, what }
}

/** A write based on an older version of a request. Nothing was written; read it again and retry. */
export class ConflictError extends Error {
  readonly status = 409
  constructor(request: WorkRequest, expected: number) {
    const current = versionOf(request)
    const change = request.changed ? `: ${request.changed.what} by ${request.changed.by} at ${request.changed.at}` : ''
    const short = request.id.slice('request:'.length, 'request:'.length + 8)
    super(`${request.id} is at version ${current}, not ${expected}${change}. Nothing was written. Read it again with \`civic show ${short}\`, then retry with ${short}@${current}.`)
    this.name = 'ConflictError'
  }
}

export function find<T>(document: GraphDocument, id: string, kind: string): T {
  const record = document.records.find((candidate) => candidate.id === id)
  if (!record || record.kind !== kind) throw new Error(`No ${kind} ${id} in the CIVIC store.`)
  return record as T
}

/** Accepts a full ID or a unique prefix of its path, so `civic claim 3f2a` works. */
export function resolveId(document: GraphDocument, id: string, prefix: string): string {
  if (id.includes(':')) return id
  const matches = document.records.filter((record) => record.id.startsWith(`${prefix}:${id}`))
  if (matches.length === 1) return matches[0]!.id
  throw new Error(matches.length === 0 ? `No ${prefix} starts with ${id}.` : `${id} matches ${matches.length} records; give more of the ID.`)
}

export { actorId }

function firstLine(text: string): string {
  const line = text.trim().split('\n')[0]!
  return line.length > 80 ? `${line.slice(0, 77)}...` : line
}
