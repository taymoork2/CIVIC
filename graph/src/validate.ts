import { ID_PREFIX, idMatchesKind, parseId } from './ids.ts'
import { isAnchored, laneFor } from './work.ts'
import {
  ACTOR_TYPES,
  ALIGNMENT_STATES,
  ANCHOR_OUTCOMES,
  CLASSIFICATIONS,
  EVIDENCE_TIERS,
  LINE_TYPES,
  LINK_STATUSES,
  OVERRIDE_CHANGES,
  PLATFORMS,
  RELATIONS,
  REQUEST_STATUSES,
  ROLES,
  RUN_METHODS,
  SCHEMA_VERSION,
  STATIC_METHODS,
  type Actor,
  type AlignmentState,
  type Evidence,
  type GraphDocument,
  type GraphRecord,
  type Link,
  type RecordKind,
  type Relation,
  type Resolution,
  type WorkRequest,
} from './schema.ts'

export interface Issue {
  severity: 'error' | 'warning'
  code: string
  message: string
  /** The record ID, or `links[<n>]`, the issue is about. */
  at: string
}

const RECORD_KINDS = Object.keys(ID_PREFIX) as RecordKind[]

/** Which record kinds each relation may join. `to` is checked only when present. */
const RELATION_KINDS: Record<Relation, { from: RecordKind[]; to: RecordKind[] }> = {
  implements: { from: ['platform-component'], to: ['semantic-component'] },
  serves: { from: ['target', 'semantic-component', 'platform-component', 'component-instance'], to: ['intent'] },
  'uses-token': { from: ['semantic-component', 'platform-component', 'extension-point'], to: ['token'] },
  navigates: { from: ['target'], to: ['target'] },
  contains: { from: ['target'], to: ['target', 'component-instance'] },
}

/** Evidence tiers that prove behavior, so they can back an observed link. */
const RUN_TIERS: Evidence['tier'][] = ['automated', 'physical-device']

/** Which alignment states a conflict may carry, by status and resolution outcome. */
const ALIGNMENT_FOR: Record<'open' | Resolution['outcome'], AlignmentState[]> = {
  open: ['unreviewed-drift', 'unknown-stale'],
  'update-design': ['awaiting-adoption', 'aligned'],
  'change-implementation': ['awaiting-adoption', 'aligned'],
  'update-contract': ['awaiting-adoption', 'aligned'],
  'approve-exception': ['approved-adaptation', 'accepted-limitation'],
}

/**
 * Checks a graph document against schema v0: the shape of every record and link, stable
 * IDs, references, link statuses, evidence honesty and conflict resolution. Pure and
 * deterministic; it reads nothing but its argument.
 */
export function validateGraph(input: unknown): Issue[] {
  const issues: Issue[] = []
  const add = (severity: Issue['severity'], code: string, at: string, message: string) =>
    issues.push({ severity, code, at, message })
  const error = (code: string, at: string, message: string) => add('error', code, at, message)

  if (!isObject(input)) return [{ severity: 'error', code: 'shape', at: '$', message: 'A graph document must be a JSON object.' }]
  if (input.schema !== SCHEMA_VERSION) error('schema-version', '$', `Expected schema "${SCHEMA_VERSION}", found ${JSON.stringify(input.schema)}.`)
  if (!Array.isArray(input.records)) error('shape', '$', '`records` must be an array.')
  if (!Array.isArray(input.links)) error('shape', '$', '`links` must be an array.')
  if (issues.length > 0) return issues

  // Shapes first, so the cross-record checks below can trust the fields they read.
  const records = new Map<string, GraphRecord>()
  const formerIds = new Map<string, string>()
  ;(input.records as unknown[]).forEach((raw, index) => {
    const at = isObject(raw) && typeof raw.id === 'string' ? raw.id : `records[${index}]`
    const before = issues.length
    checkRecordShape(raw, at, error)
    if (issues.length > before) return
    const record = raw as unknown as GraphRecord
    if (records.has(record.id)) return error('duplicate-id', at, `ID ${record.id} is used by more than one record.`)
    records.set(record.id, record)
    for (const former of record.formerIds ?? []) formerIds.set(former.id, record.id)
  })
  for (const [former, current] of formerIds) {
    if (records.has(former)) error('former-id-collision', current, `Former ID ${former} is also a live record; an ID is never reused.`)
  }

  const ref = (at: string, field: string, id: string, kinds: RecordKind[]) => {
    const target = records.get(id)
    if (target) {
      if (!kinds.includes(target.kind)) error('reference-kind', at, `${field} points at ${id}, a ${target.kind}; expected ${kinds.join(' or ')}.`)
      return target
    }
    if (formerIds.has(id)) error('reanchor-needed', at, `${field} points at ${id}, which was re-anchored to ${formerIds.get(id)}. Update the reference explicitly.`)
    else error('dangling-reference', at, `${field} points at ${id}, which is not in the graph.`)
    return undefined
  }

  const links: Link[] = []
  ;(input.links as unknown[]).forEach((raw, index) => {
    const at = `links[${index}]`
    const before = issues.length
    checkLinkShape(raw, at, error)
    if (issues.length === before) links.push(raw as unknown as Link)
  })

  // Which semantic component each platform component implements, from declared or observed links.
  const implemented = new Map<string, string>()
  for (const link of links) {
    if (link.relation === 'implements' && link.to && (link.status === 'declared' || link.status === 'observed')) implemented.set(link.from, link.to)
  }

  const actorRef = (at: string, field: string, id: string) => {
    const actor = ref(at, field, id, ['actor'])
    return actor?.kind === 'actor' ? actor : undefined
  }
  const actorOf = (id: string) => {
    const record = records.get(id)
    return record?.kind === 'actor' ? record : undefined
  }

  for (const record of records.values()) {
    const at = record.id
    // D35: an agent can annotate and comment for its person, but never writes evidence or a decision.
    const author = record.writtenBy === undefined ? undefined : actorRef(at, 'writtenBy', record.writtenBy)
    if (author?.type === 'agent') {
      if (record.kind === 'evidence') error('agent-evidence', at, `${author.id} is an agent; agents can't write evidence. CIVIC's own capture does.`)
      if (record.kind === 'contract-conflict' && record.status === 'resolved') error('agent-decision', at, `${author.id} is an agent; agents can't resolve a conflict.`)
    }
    if (record.source?.line) ref(at, 'source.line', record.source.line, ['line'])
    switch (record.kind) {
      case 'actor':
        if (record.type === 'agent') {
          if (!record.delegatedBy) error('agent-delegation', at, 'An agent always acts for a named person; set `delegatedBy`.')
          else if (actorRef(at, 'delegatedBy', record.delegatedBy) && actorOf(record.delegatedBy)?.type !== 'person') {
            error('agent-delegation', at, `${record.delegatedBy} is not a person; an agent acts for a person, who is accountable.`)
          }
        } else if (record.delegatedBy) error('agent-delegation', at, 'Only an agent acts for someone else.')
        break
      case 'line':
        if (record.type === 'main' && record.base) error('line-base', at, 'Main has no base line.')
        if (record.type !== 'main' && !record.base) error('line-base', at, 'A line that is not main names the line it branched from.')
        if (record.base) {
          if (record.base === record.id) error('line-base', at, 'A line cannot be its own base.')
          else ref(at, 'base', record.base, ['line'])
        }
        if (record.status === 'merged' && !record.mergedAs) error('line-merge', at, 'A merged line names the revision it merged as.')
        if (record.status !== 'merged' && record.mergedAs) error('line-merge', at, 'Only a merged line has `mergedAs`.')
        break
      case 'annotation':
        actorRef(at, 'writtenBy', record.writtenBy)
        ref(at, 'seenOn.line', record.seenOn.line, ['line'])
        for (const edge of record.anchor?.edges ?? []) {
          if (!record.anchor!.targetIds.includes(edge.from)) error('edge-anchor', at, `A path anchor also lists the screen it leaves, ${edge.from}, in targetIds.`)
        }
        if (!isAnchored(record.anchor) && !record.capture) {
          error('annotation-empty', at, 'An annotation with no target, edge or locator keeps its capture; otherwise there is nothing to look at.')
        }
        break
      case 'work-request':
        checkWorkRequest(record, at, error, ref, actorRef, actorOf, (id) => {
          const annotation = records.get(id)
          return annotation?.kind === 'annotation' && isAnchored(annotation.anchor)
        })
        break
      case 'token':
        if (record.id !== `token:${record.path}`) error('token-id', at, `A token's ID is token:<path>; expected token:${record.path}.`)
        break
      case 'platform-component': {
        const semanticId = implemented.get(record.id)
        if (!semanticId) {
          add('warning', 'unimplemented', at, 'No declared or observed `implements` link says which semantic component this is.')
          break
        }
        const semantic = records.get(semanticId)
        if (semantic?.kind !== 'semantic-component') break
        const keys = new Set(semantic.variants.map((variant) => variant.key))
        for (const mapping of record.variants) {
          if (!keys.has(mapping.semanticVariant)) error('unknown-variant', at, `Variant ${mapping.semanticVariant} is not defined by ${semantic.id}.`)
        }
        if (record.defaultVariant && !keys.has(record.defaultVariant)) error('unknown-variant', at, `Default variant ${record.defaultVariant} is not defined by ${semantic.id}.`)
        for (const key of keys) {
          if (!record.variants.some((mapping) => mapping.semanticVariant === key)) {
            add('warning', 'unmapped-variant', at, `${semantic.id} variant ${key} has no mapping here; record it as \`none\` if there is no equivalent.`)
          }
        }
        break
      }
      case 'extension-point':
        ref(at, 'platformComponentId', record.platformComponentId, ['platform-component'])
        break
      case 'component-instance': {
        const semantic = ref(at, 'semanticId', record.semanticId, ['semantic-component'])
        ref(at, 'placedOn', record.placedOn, ['target'])
        if (record.variant && semantic?.kind === 'semantic-component' && !semantic.variants.some((v) => v.key === record.variant)) {
          error('unknown-variant', at, `Variant ${record.variant} is not defined by ${semantic.id}.`)
        }
        if (record.origin === 'code' && !record.platform) error('instance-platform', at, 'An instance read from code names its platform.')
        break
      }
      case 'override':
        ref(at, 'instanceId', record.instanceId, ['component-instance'])
        break
      case 'evidence': {
        for (const id of record.subjectIds) ref(at, 'subjectIds', id, RECORD_KINDS)
        const isStatic = (STATIC_METHODS as readonly string[]).includes(record.method)
        if (isStatic && RUN_TIERS.includes(record.tier)) {
          error('evidence-overclaims', at, `${record.method} reads an artifact; it cannot be ${record.tier} evidence of behavior.`)
        }
        if (record.outcome === 'finding' && !record.finding) error('finding-missing', at, 'An evidence finding says what was found.')
        break
      }
      case 'contract-conflict': {
        const target = ref(at, 'targetId', record.targetId, RECORD_KINDS)
        if (record.variant && target?.kind === 'semantic-component' && !target.variants.some((v) => v.key === record.variant)) {
          error('unknown-variant', at, `Variant ${record.variant} is not defined by ${target.id}.`)
        }
        if (record.sides.length < 2) error('conflict-sides', at, 'A conflict names at least two sources that disagree.')
        for (const side of record.sides) {
          if (side.recordId) ref(at, 'sides.recordId', side.recordId, RECORD_KINDS)
          for (const id of side.evidenceIds) ref(at, 'sides.evidenceIds', id, ['evidence'])
        }
        if (record.owners.length === 0) error('conflict-owners', at, 'A conflict has at least one owner.')
        checkResolution(record.status, record.resolution, record.alignment, at, error, (id) => ref(at, 'resolution.evidenceIds', id, ['evidence']))
        break
      }
    }
  }

  const seenLinks = new Set<string>()
  links.forEach((link, index) => {
    const at = `links[${index}]`
    const kinds = RELATION_KINDS[link.relation]
    ref(at, 'from', link.from, kinds.from)
    if (link.to) ref(at, 'to', link.to, kinds.to)
    const key = `${link.from} ${link.relation} ${link.to ?? `?${link.unmapped}`}`
    if (seenLinks.has(key)) error('duplicate-link', at, `${key} appears more than once; one link carries one status.`)
    seenLinks.add(key)

    const evidence = (link.evidenceIds ?? []).map((id) => ref(at, 'evidenceIds', id, ['evidence'])).filter(isEvidence)
    if (link.status === 'observed') {
      const proving = evidence.filter((item) => RUN_TIERS.includes(item.tier) && item.outcome === 'pass')
      if (proving.length === 0) {
        error('observed-without-run', at, 'An observed link needs passing automated or physical-device evidence. A fixture jump, failed operation or inferred edge is not runtime evidence.')
      }
    }
  })

  return issues
}

type Ref = (at: string, field: string, id: string, kinds: RecordKind[]) => GraphRecord | undefined

/**
 * D38's rules for a work request: its history tells the truth about its status, agents
 * never resolve, CIVIC resolves only in the Auto lane on a passing re-capture, the owner
 * lane needs an owner, and for a high-risk target the person who delegated the fix can't
 * approve it alone.
 */
function checkWorkRequest(
  request: WorkRequest,
  at: string,
  error: (code: string, at: string, message: string) => void,
  ref: Ref,
  actorRef: (at: string, field: string, id: string) => Actor | undefined,
  actorOf: (id: string) => Actor | undefined,
  anchored: (annotationId: string) => boolean,
) {
  if (request.annotationIds.length === 0) error('request-annotations', at, 'A work request carries at least one annotation.')
  for (const id of request.annotationIds) ref(at, 'annotationIds', id, ['annotation'])
  ref(at, 'base.line', request.base.line, ['line'])
  for (const id of request.contextIds ?? []) ref(at, 'contextIds', id, ['semantic-component'])
  if (actorRef(at, 'requestedBy', request.requestedBy) && actorOf(request.requestedBy)?.type !== 'person') {
    error('request-requester', at, 'A work request is asked for by a person, who owns the result.')
  }
  for (const check of request.acceptance) {
    actorRef(at, 'acceptance.writtenBy', check.writtenBy)
    if (check.acceptedBy && actorRef(at, 'acceptance.acceptedBy', check.acceptedBy) && actorOf(check.acceptedBy)?.type !== 'person') {
      error('acceptance-self', at, 'Only a person accepts a check; an agent never grades its own work.')
    }
  }
  for (const comment of request.comments) actorRef(at, 'comments.by', comment.by)
  if (request.claim) {
    actorRef(at, 'claim.by', request.claim.by)
    ref(at, 'claim.line', request.claim.line, ['line'])
  }
  for (const fix of request.fixes) {
    actorRef(at, 'fixes.by', fix.by)
    ref(at, 'fixes.line', fix.line, ['line'])
    if (fix.recapture?.evidenceId) ref(at, 'fixes.recapture.evidenceId', fix.recapture.evidenceId, ['evidence'])
  }

  const last = request.history.at(-1)
  if (!last) return error('request-history', at, 'A work request records how it reached its status.')
  if (last.status !== request.status) error('request-history', at, `Status is ${request.status} but the last history entry is ${last.status}.`)
  if (request.history[0]!.status !== 'open') error('request-history', at, 'A work request starts Open.')
  if (request.status === 'claimed' && !request.claim) error('request-claim', at, 'A claimed request has a claim.')
  if (request.status === 'fix-ready' && request.fixes.length === 0) error('request-fix', at, 'A request is Fix ready only after a fix is reported.')

  const lane = laneFor(request, actorOf, anchored)
  for (const event of request.history) {
    const actor = actorRef(at, 'history.by', event.by)
    if (event.status !== 'resolved' || !actor) continue
    if (actor.type === 'agent') {
      error('agent-resolved', at, `${actor.id} is an agent; agents never resolve a work request (D38).`)
      continue
    }
    const fix = request.fixes.at(-1)
    if (actor.type === 'civic') {
      if (lane !== 'auto') error('auto-lane', at, `CIVIC resolves only in the Auto lane; this request is in ${lane}.`)
      const recapture = fix?.recapture
      const passed = recapture !== undefined && recapture.anchors.every((anchor) => anchor.outcome === 'found-by-id' || anchor.outcome === 'found-by-locator') && recapture.checks.length > 0 && recapture.checks.every((check) => check.outcome === 'pass')
      if (!passed) error('auto-lane', at, 'CIVIC resolves only when its own re-capture found every anchor and every acceptance check passed.')
      continue
    }
    if (lane === 'owner-sign-off' && !(request.owners ?? []).some((owner) => owner.who === actor.handle)) {
      error('owner-sign-off', at, `${actor.id} is not an owner of this request; changes to intent and high-risk targets go to a named owner.`)
    }
    if (request.risk === 'high' && fix) {
      const fixer = actorOf(fix.by)
      const delegator = fixer?.type === 'agent' ? fixer.delegatedBy : fixer?.id
      if (delegator === actor.id) error('self-approval', at, `${actor.id} delegated this fix, so they can't be its only approver on a high-risk target.`)
    }
  }
}

function checkResolution(
  status: 'open' | 'resolved',
  resolution: Resolution | undefined,
  alignment: AlignmentState,
  at: string,
  error: (code: string, at: string, message: string) => void,
  evidenceRef: (id: string) => unknown,
) {
  if (status === 'open') {
    if (resolution) error('resolution-on-open', at, 'An open conflict has no resolution yet.')
  } else if (!resolution) {
    return error('resolution-missing', at, 'A resolved conflict records its resolution.')
  } else {
    if (resolution.evidenceIds.length === 0) error('resolution-evidence', at, 'A conflict resolves only with evidence for the decided outcome.')
    for (const id of resolution.evidenceIds) evidenceRef(id)
    if (resolution.outcome === 'approve-exception' && !resolution.revisitTrigger) {
      error('exception-revisit', at, 'An approved exception names its revisit trigger.')
    }
  }
  const allowed = ALIGNMENT_FOR[status === 'open' ? 'open' : (resolution?.outcome ?? 'update-contract')]
  if (!allowed.includes(alignment)) {
    error('alignment-inconsistent', at, `Alignment ${alignment} does not fit a ${status === 'open' ? 'open' : resolution?.outcome} conflict; expected ${allowed.join(' or ')}.`)
  }
}

// ---------------------------------------------------------------------------
// Shape checks

type Report = (code: string, at: string, message: string) => void

function checkRecordShape(raw: unknown, at: string, error: Report) {
  if (!isObject(raw)) return error('shape', at, 'A record must be an object.')
  const field = fieldChecker(raw, at, error)
  if (!field.oneOf('kind', RECORD_KINDS)) return
  const kind = raw.kind as RecordKind
  if (field.string('id')) {
    if (!parseId(raw.id as string)) error('id-format', at, `ID ${raw.id} is not <prefix>:<dot.separated.path>.`)
    else if (!idMatchesKind(raw.id as string, kind)) error('id-kind', at, `A ${kind} ID starts with "${ID_PREFIX[kind]}:".`)
  }
  field.string('title')
  field.optionalList('owners', (owner, path) => checkOwner(owner, path, error))
  field.optional('source', (source, path) => checkSource(source, path, error))
  field.optional('writtenBy', (value, path) => checkString(value, path, error))
  field.optionalList('formerIds', (former, path) => {
    if (!isObject(former)) return error('shape', path, 'Must be an object.')
    const f = fieldChecker(former, path, error)
    f.string('id')
    f.string('reason')
    f.string('at')
    checkOwner(former.by, `${path}.by`, error)
  })

  switch (kind) {
    case 'intent':
      field.oneOf('category', ['requirement', 'business-rule', 'accessibility-rule'])
      field.string('statement')
      break
    case 'target':
      field.oneOf('scale', ['journey', 'screen', 'state', 'surface'])
      field.oneOf('presence', ['expected', 'discovered'])
      field.optionalList('platforms', (value, path) => checkEnum(value, PLATFORMS, path, error))
      break
    case 'token':
      field.string('path')
      field.string('type')
      break
    case 'semantic-component':
      field.string('purpose')
      field.list('variants', (variant, path) => {
        if (!isObject(variant)) return error('shape', path, 'Must be an object.')
        const v = fieldChecker(variant, path, error)
        v.string('key')
        v.string('title')
      })
      field.list('states', (value, path) => checkString(value, path, error))
      field.optionalList('slots', (value, path) => checkString(value, path, error))
      field.optionalList('rules', (rule, path) => {
        if (!isObject(rule)) return error('shape', path, 'Must be an object.')
        const r = fieldChecker(rule, path, error)
        r.string('key')
        r.string('statement')
        r.optional('forbids', (match, matchPath) => {
          if (!isObject(match)) return error('shape', matchPath, 'Must be an object.')
          const m = fieldChecker(match, matchPath, error)
          m.string('property')
          m.optional('change', (value, changePath) => checkEnum(value, OVERRIDE_CHANGES, changePath, error))
        })
      })
      break
    case 'platform-component':
      field.oneOf('platform', PLATFORMS)
      field.string('symbol')
      if (isObject(raw.library)) fieldChecker(raw.library, `${at}.library`, error).string('package')
      else error('shape', at, '`library` must be an object with a `package`.')
      field.list('variants', (mapping, path) => {
        if (!isObject(mapping)) return error('shape', path, 'Must be an object.')
        const m = fieldChecker(mapping, path, error)
        m.string('semanticVariant')
        m.oneOf('mapping', ['exact', 'closest', 'none'])
        if (mapping.mapping !== 'none' && typeof mapping.expression !== 'string') error('shape', path, 'An exact or closest mapping names its `expression`.')
      })
      field.optional('defaultVariant', (value, path) => checkString(value, path, error))
      field.optionalList('extraVariants', (extra, path) => {
        if (!isObject(extra)) return error('shape', path, 'Must be an object.')
        fieldChecker(extra, path, error).string('expression')
      })
      break
    case 'extension-point':
      field.string('platformComponentId')
      field.oneOf('mechanism', ['slot', 'prop', 'token', 'style-api', 'theme-hook'])
      field.string('name')
      field.list('expresses', (value, path) => checkString(value, path, error))
      break
    case 'component-instance':
      field.string('semanticId')
      field.string('placedOn')
      field.string('product')
      field.oneOf('origin', ['design', 'code'])
      field.optional('platform', (value, path) => checkEnum(value, PLATFORMS, path, error))
      break
    case 'override':
      field.string('instanceId')
      field.string('property')
      field.oneOf('change', OVERRIDE_CHANGES)
      field.optional('madeBy', (owner, path) => checkOwner(owner, path, error))
      break
    case 'evidence':
      field.list('subjectIds', (value, path) => checkString(value, path, error))
      field.oneOf('tier', EVIDENCE_TIERS)
      field.oneOf('method', [...STATIC_METHODS, ...RUN_METHODS])
      field.oneOf('outcome', ['pass', 'fail', 'finding'])
      field.optional('platform', (value, path) => checkEnum(value, PLATFORMS, path, error))
      field.string('capturedAt')
      if (raw.source === undefined) error('evidence-revision', at, 'Evidence is tied to the exact revision it proves, so `source` is required.')
      break
    case 'contract-conflict':
      field.string('targetId')
      field.string('summary')
      field.optional('platform', (value, path) => checkEnum(value, PLATFORMS, path, error))
      field.list('sides', (side, path) => {
        if (!isObject(side)) return error('shape', path, 'Must be an object.')
        const s = fieldChecker(side, path, error)
        s.string('claim')
        s.list('evidenceIds', (value, idPath) => checkString(value, idPath, error))
      })
      field.oneOf('classification', CLASSIFICATIONS)
      field.list('owners', (owner, path) => checkOwner(owner, path, error))
      field.oneOf('alignment', ALIGNMENT_STATES)
      field.oneOf('status', ['open', 'resolved'])
      field.optional('resolution', (resolution, path) => {
        if (!isObject(resolution)) return error('shape', path, 'Must be an object.')
        const r = fieldChecker(resolution, path, error)
        r.oneOf('outcome', ['update-design', 'change-implementation', 'update-contract', 'approve-exception'])
        r.string('at')
        r.string('rationale')
        r.list('evidenceIds', (value, idPath) => checkString(value, idPath, error))
        checkOwner(resolution.decidedBy, `${path}.decidedBy`, error)
      })
      break
    case 'actor':
    case 'line':
    case 'annotation':
    case 'work-request':
      checkReviewShape(kind, raw, at, error)
      break
  }
}

function checkReviewShape(kind: RecordKind, raw: Record<string, unknown>, at: string, error: Report) {
  const field = fieldChecker(raw, at, error)
  const id = (value: unknown, path: string) => {
    if (typeof value !== 'string' || !parseId(value)) error('shape', path, 'Must be a graph ID, <prefix>:<dot.separated.path>.')
  }
  const capture = (value: unknown, path: string) => {
    if (!isObject(value)) return error('shape', path, 'A capture is an object.')
    if (typeof value.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.sha256)) error('shape', path, 'A capture names the SHA-256 of its image.')
    checkEnum(value.mediaType, ['image/png', 'image/jpeg', 'image/webp'], `${path}.mediaType`, error)
  }
  switch (kind) {
    case 'actor':
      field.oneOf('type', ACTOR_TYPES)
      field.string('handle')
      field.optional('delegatedBy', id)
      break
    case 'line':
      field.oneOf('type', LINE_TYPES)
      field.string('tool')
      field.string('ref')
      field.string('head')
      field.oneOf('status', ['open', 'merged', 'abandoned'])
      field.optional('base', id)
      field.optionalList('previews', (preview, path) => {
        if (!isObject(preview)) return error('shape', path, 'Must be an object.')
        const p = fieldChecker(preview, path, error)
        p.string('url')
        p.string('revision')
      })
      break
    case 'annotation':
      field.string('comment')
      field.string('at')
      field.string('writtenBy')
      field.optional('capture', capture)
      if (!isObject(raw.seenOn)) error('shape', at, '`seenOn` names the line and revision the annotation was made on.')
      else {
        const seen = fieldChecker(raw.seenOn, `${at}.seenOn`, error)
        seen.string('line')
        seen.string('revision')
      }
      field.optional('anchor', (anchor, path) => {
        if (!isObject(anchor)) return error('shape', path, 'An anchor is an object.')
        const a = fieldChecker(anchor, path, error)
        a.list('targetIds', id)
        a.optionalList('edges', (edge, edgePath) => {
          if (!isObject(edge)) return error('shape', edgePath, 'Must be an object.')
          id(edge.from, `${edgePath}.from`)
          if (edge.to !== undefined) id(edge.to, `${edgePath}.to`)
        })
        a.optional('locator', (locator, locatorPath) => {
          if (!isObject(locator)) error('shape', locatorPath, 'A locator is an object.')
        })
        a.optional('rect', (rect, rectPath) => {
          if (!isObject(rect) || ['x', 'y', 'width', 'height'].some((key) => typeof rect[key] !== 'number' || (rect[key] as number) < 0 || (rect[key] as number) > 1)) {
            error('shape', rectPath, 'A rectangle is normalized to the capture: x, y, width and height between 0 and 1.')
          }
        })
      })
      break
    case 'work-request':
      field.string('ask')
      field.list('annotationIds', id)
      field.oneOf('intent', ['restore-contract', 'change'])
      field.oneOf('risk', ['normal', 'high'])
      field.optional('escalatedTo', (value, path) => checkEnum(value, ['batch-review', 'owner-sign-off'], path, error))
      if (!isObject(raw.base)) error('shape', at, '`base` names the line and revision the problem was seen on.')
      else {
        const base = fieldChecker(raw.base, `${at}.base`, error)
        base.string('line')
        base.string('revision')
      }
      field.optional('platform', (value, path) => checkEnum(value, PLATFORMS, path, error))
      field.optionalList('contextIds', id)
      field.list('acceptance', (check, path) => {
        if (!isObject(check)) return error('shape', path, 'Must be an object.')
        const c = fieldChecker(check, path, error)
        c.string('command')
        c.string('writtenBy')
      })
      field.string('repro')
      field.string('requestedBy')
      field.oneOf('status', REQUEST_STATUSES)
      field.optional('claim', (claim, path) => {
        if (!isObject(claim)) return error('shape', path, 'Must be an object.')
        const c = fieldChecker(claim, path, error)
        for (const key of ['by', 'line', 'at', 'expires']) c.string(key)
      })
      field.list('fixes', (fix, path) => {
        if (!isObject(fix)) return error('shape', path, 'Must be an object.')
        const f = fieldChecker(fix, path, error)
        for (const key of ['by', 'line', 'revision', 'at']) f.string(key)
        f.optional('recapture', (recapture, recapturePath) => {
          if (!isObject(recapture)) return error('shape', recapturePath, 'Must be an object.')
          const r = fieldChecker(recapture, recapturePath, error)
          r.string('at')
          r.string('revision')
          r.list('anchors', (anchor, anchorPath) => {
            if (!isObject(anchor)) return error('shape', anchorPath, 'Must be an object.')
            id(anchor.annotationId, `${anchorPath}.annotationId`)
            checkEnum(anchor.outcome, ANCHOR_OUTCOMES, `${anchorPath}.outcome`, error)
            if (anchor.capture !== undefined) capture(anchor.capture, `${anchorPath}.capture`)
          })
          r.list('checks', (check, checkPath) => {
            if (!isObject(check)) return error('shape', checkPath, 'Must be an object.')
            fieldChecker(check, checkPath, error).string('command')
            checkEnum(check.outcome, ['pass', 'fail'], `${checkPath}.outcome`, error)
          })
        })
      })
      field.list('comments', (comment, path) => {
        if (!isObject(comment)) return error('shape', path, 'Must be an object.')
        const c = fieldChecker(comment, path, error)
        for (const key of ['by', 'at', 'text']) c.string(key)
      })
      field.list('history', (event, path) => {
        if (!isObject(event)) return error('shape', path, 'Must be an object.')
        const e = fieldChecker(event, path, error)
        e.oneOf('status', REQUEST_STATUSES)
        e.string('by')
        e.string('at')
      })
      break
  }
}

function checkLinkShape(raw: unknown, at: string, error: Report) {
  if (!isObject(raw)) return error('shape', at, 'A link must be an object.')
  const field = fieldChecker(raw, at, error)
  field.string('from')
  field.oneOf('relation', RELATIONS)
  field.oneOf('status', LINK_STATUSES)
  field.optionalList('evidenceIds', (value, path) => checkString(value, path, error))
  field.optional('source', (source, path) => checkSource(source, path, error))
  if (raw.to === undefined) {
    if (raw.relation !== 'navigates' || typeof raw.unmapped !== 'string') {
      error('unmapped-edge', at, 'Only a `navigates` link may omit `to`, and then `unmapped` says what is known about the destination.')
    }
  } else {
    field.string('to')
    if (raw.unmapped !== undefined) error('unmapped-edge', at, 'A link with a mapped `to` has no `unmapped` hint.')
  }
  if (raw.relation !== 'navigates') {
    for (const key of ['action', 'route', 'condition', 'returnTo']) {
      if (raw[key] !== undefined) error('shape', at, `\`${key}\` belongs only on a navigates link.`)
    }
  }
}

function checkOwner(owner: unknown, at: string, error: Report) {
  if (!isObject(owner)) return error('shape', at, 'An owner is an object with `role` and `who`.')
  const field = fieldChecker(owner, at, error)
  field.oneOf('role', ROLES)
  field.string('who')
  field.optional('platform', (value, path) => checkEnum(value, PLATFORMS, path, error))
}

function checkSource(source: unknown, at: string, error: Report) {
  if (!isObject(source)) return error('shape', at, 'A source is an object.')
  const field = fieldChecker(source, at, error)
  field.string('tool')
  field.string('importer')
  field.string('revision')
  field.optional('line', (value, path) => checkString(value, path, error))
}

function fieldChecker(object: Record<string, unknown>, at: string, error: Report) {
  const path = (key: string) => `${at}.${key}`
  return {
    string(key: string) {
      if (typeof object[key] === 'string' && object[key] !== '') return true
      error('shape', at, `\`${key}\` must be a non-empty string.`)
      return false
    },
    oneOf(key: string, values: readonly string[]) {
      return checkEnum(object[key], values, path(key), error, at)
    },
    list(key: string, each: (value: unknown, path: string) => void) {
      if (!Array.isArray(object[key])) return error('shape', at, `\`${key}\` must be an array.`)
      ;(object[key] as unknown[]).forEach((value, index) => each(value, `${path(key)}[${index}]`))
    },
    optionalList(key: string, each: (value: unknown, path: string) => void) {
      if (object[key] !== undefined) this.list(key, each)
    },
    optional(key: string, check: (value: unknown, path: string) => void) {
      if (object[key] !== undefined) check(object[key], path(key))
    },
  }
}

function checkEnum(value: unknown, values: readonly string[], path: string, error: Report, at = path) {
  if (typeof value === 'string' && values.includes(value)) return true
  error('shape', at, `${path} must be one of ${values.join(', ')}; found ${JSON.stringify(value)}.`)
  return false
}

function checkString(value: unknown, path: string, error: Report) {
  if (typeof value !== 'string' || value === '') error('shape', path, 'Must be a non-empty string.')
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isEvidence(record: GraphRecord | undefined): record is Evidence {
  return record?.kind === 'evidence'
}

export function assertValid(document: unknown): asserts document is GraphDocument {
  const errors = validateGraph(document).filter((issue) => issue.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Invalid CIVIC graph:\n${errors.map((issue) => `  ${issue.at}: ${issue.message}`).join('\n')}`)
  }
}
