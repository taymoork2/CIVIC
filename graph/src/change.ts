import type { CheckReport, Finding, GraphCheck } from './check.ts'
import { indexGraph, type Graph } from './graph.ts'
import type { ContractConflict, GraphDocument, GraphRecord, Owner } from './schema.ts'

// Checks where each role works (roadmap step 10): a finding is raised at the change that
// caused it, to the people who made that change. The gate is run twice, on the graphs at
// the base revision and at the change, and every finding the change introduces is traced to
// the side that moved: the records each side of it rests on are compared between the two
// revisions. The owner of the side that moved is asked; the other sides' owners are told.
// Deterministic, read-only, and no model calls (D30).

/** One graph at both revisions. `base` is absent when the graph is new in the change. */
export interface GraphAtRevisions {
  graph: string
  base?: { document: GraphDocument; check: GraphCheck }
  head: { document: GraphDocument; check: GraphCheck }
}

/** One side a finding rests on, and whether the change moved it. */
export interface SideChange {
  /** The side's claim, or the record's title for a finding that isn't a conflict. */
  claim: string
  /** The records compared: the side's own record, then its evidence. */
  recordIds: string[]
  moved: boolean
  /** How it moved: which records are new or changed. Empty when it didn't. */
  how: string[]
  owners: Owner[]
}

export interface IntroducedFinding {
  finding: Finding
  sides: SideChange[]
  /** Owners of the sides that moved: they made the change, so the change is theirs to fix or decide. */
  asked: Owner[]
  /** Owners of the sides that held still: the change reaches them, but nothing is asked of them. */
  told: Owner[]
  /** One sentence on where the finding came from. */
  why: string
}

export interface ChangeReport {
  /** The base revision, as given (a branch, tag or commit). */
  since: string
  introduced: IntroducedFinding[]
  /** Findings at the base that the change no longer raises. */
  resolved: Finding[]
}

/**
 * Findings the change introduces, each traced to the side that moved, and findings it
 * resolves. Stale evidence is left out: staleness is measured against the working tree, so
 * it has no value at the base, and its summary already names the files that changed.
 */
export function changeBetween(since: string, graphs: GraphAtRevisions[]): ChangeReport {
  const introduced: IntroducedFinding[] = []
  const resolved: Finding[] = []
  for (const { base, head } of graphs) {
    const before = new Set((base?.check.findings ?? []).map((item) => item.key))
    const after = new Set(head.check.findings.map((item) => item.key))
    const baseGraph = base ? indexGraph(base.document) : undefined
    const headGraph = indexGraph(head.document)
    for (const item of head.check.findings) {
      if (item.kind === 'stale-evidence' || before.has(item.key)) continue
      introduced.push(attribute(item, baseGraph, headGraph))
    }
    for (const item of base?.check.findings ?? []) {
      if (item.kind !== 'stale-evidence' && !after.has(item.key)) resolved.push(item)
    }
  }
  return { since, introduced, resolved }
}

/** Traces one finding at the head to the sides that moved since the base. */
export function attribute(item: Finding, base: Graph | undefined, head: Graph): IntroducedFinding {
  const subject = head.get(item.subjectId)
  const sides = subject?.kind === 'contract-conflict' ? conflictSides(subject, base, head) : [recordSide(item, subject, base, head)]
  const movedSides = sides.filter((side) => side.moved)
  const still = sides.filter((side) => !side.moved)
  if (movedSides.length === 0) {
    // Nothing the finding rests on changed, so something around it did: a decision was
    // withdrawn, an exception expired, a rule changed. Everyone it names is asked.
    return { finding: item, sides, asked: item.owners, told: [], why: unmovedReason(item, base, head) }
  }
  const asked = dedupe(movedSides.flatMap((side) => side.owners))
  const askedKeys = new Set(asked.map(ownerKey))
  const told = dedupe(still.flatMap((side) => side.owners)).filter((owner) => !askedKeys.has(ownerKey(owner)))
  const why = movedSides.map((side) => `${side.claim} (${side.how.join('; ')})`).join(' Also: ')
  return { finding: item, sides, asked: asked.length > 0 ? asked : item.owners, told, why: `Moved: ${why}` }
}

/**
 * A conflict's sides, each with its owners. A side's owners are its record's owners (or the
 * person who made an override) and its evidence's owners; a side with none of its own takes
 * the conflict's owners that no other side claims, which is how a design kit side with only
 * a Figma export behind it gets the design owner.
 */
function conflictSides(conflict: ContractConflict, base: Graph | undefined, head: Graph): SideChange[] {
  const sides = conflict.sides.map((side) => {
    const recordIds = [...(side.recordId ? [side.recordId] : []), ...side.evidenceIds]
    const own = dedupe(recordIds.flatMap((id) => ownersOf(head.get(id))))
    return { claim: side.claim, recordIds, ...movement(recordIds, base, head), owners: own }
  })
  const claimed = new Set(sides.flatMap((side) => side.owners.map(ownerKey)))
  const unclaimed = conflict.owners.filter((owner) => !claimed.has(ownerKey(owner)))
  return sides.map((side) => (side.owners.length > 0 ? side : { ...side, owners: unclaimed.length > 0 ? unclaimed : conflict.owners }))
}

/** A finding that isn't a conflict rests on its subject record, owned by the finding's owners. */
function recordSide(item: Finding, subject: GraphRecord | undefined, base: Graph | undefined, head: Graph): SideChange {
  const recordIds = subject ? [subject.id] : []
  return { claim: subject?.title ?? item.subjectId, recordIds, ...movement(recordIds, base, head), owners: item.owners }
}

function movement(recordIds: string[], base: Graph | undefined, head: Graph): Pick<SideChange, 'moved' | 'how'> {
  const how: string[] = []
  for (const id of recordIds) {
    const now = head.get(id)
    const then = base?.get(id)
    if (!now) continue
    if (!then) how.push(`${id} is new`)
    else if (fingerprint(then) !== fingerprint(now)) how.push(`${id} changed${revisionChange(then, now)}`)
  }
  return { moved: how.length > 0, how }
}

/**
 * What counts as a record moving. Evidence moves when what it read or found changes, not
 * when it is recaptured with the same result, so its capture time is left out.
 */
function fingerprint(record: GraphRecord): string {
  if (record.kind === 'evidence') {
    const { capturedAt: _capturedAt, ...rest } = record
    return stable(rest)
  }
  return stable(record)
}

function revisionChange(then: GraphRecord, now: GraphRecord): string {
  const before = then.source?.revision
  const after = now.source?.revision
  return before && after && before !== after ? ` from ${now.source!.tool} revision ${short(before)} to ${short(after)}` : ''
}

function unmovedReason(item: Finding, base: Graph | undefined, head: Graph): string {
  if (!base) return 'The graph is new in this change.'
  const subject = head.get(item.subjectId)
  if (subject?.kind === 'contract-conflict') {
    const recorded = [...head.ofKind('decision'), ...head.ofKind('adoption'), ...head.ofKind('verification'), ...head.ofKind('proposal')].filter(
      (record) => relatesTo(record, item.subjectId, head) && (!base.get(record.id) || fingerprint(base.get(record.id)!) !== fingerprint(record)),
    )
    if (recorded.length > 0) return `Nothing on either side changed; the change records ${recorded.map((record) => record.id).join(', ')}.`
  }
  if (item.kind === 'open-conflict') {
    const withdrawn = base.ofKind('decision').filter((decision) => decision.conflictId === item.subjectId && !head.get(decision.id))
    if (withdrawn.length > 0) return `Nothing on either side changed; the change removed ${withdrawn.map((decision) => decision.id).join(', ')}, which decided it.`
  }
  if (item.kind === 'expired-exception') return 'Nothing on either side changed; the approved exception expired.'
  return 'Nothing the finding rests on changed; the records around it did.'
}

/** Whether a decision-loop record is about the conflict: directly, or through its decision or adoption. */
function relatesTo(record: GraphRecord, conflictId: string, graph: Graph): boolean {
  if (record.kind === 'decision' || record.kind === 'proposal') return record.conflictId === conflictId
  if (record.kind === 'adoption') return relatesTo(graph.get(record.decisionId) ?? record, conflictId, graph)
  if (record.kind === 'verification') return relatesTo(graph.get(record.adoptionId) ?? record, conflictId, graph)
  return false
}

function ownersOf(record: GraphRecord | undefined): Owner[] {
  if (!record) return []
  return [...(record.owners ?? []), ...(record.kind === 'override' && record.madeBy ? [record.madeBy] : [])]
}

/** The change as Markdown, for a pull request comment: what this change raised, and who is asked. */
export function renderChange(change: ChangeReport, gate: Pick<CheckReport, 'passed' | 'blocking' | 'baselined'> & { graphs: number }): string {
  const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`
  const lines = [
    `## CIVIC: ${count(change.introduced.length, 'finding')} introduced, ${count(change.resolved.length, 'finding')} resolved since ${change.since}`,
    '',
    `The gate ${gate.passed ? 'passed' : 'failed'} on ${count(gate.graphs, 'graph')}. Each finding below is new in this change and goes to the owners of the side that moved.`,
    '',
  ]
  const held = new Set(gate.baselined.map((item) => `${item.graph}\n${item.key}`))
  const isHeld = (entry: IntroducedFinding) => held.has(`${entry.finding.graph}\n${entry.finding.key}`)
  const blocks = (entry: IntroducedFinding) => entry.finding.kind === 'invalid-graph' || gate.blocking.includes(entry.finding.kind)
  const blocking = change.introduced.filter((entry) => blocks(entry) && !isHeld(entry))
  const baselined = change.introduced.filter((entry) => blocks(entry) && isHeld(entry))
  const advisory = change.introduced.filter((entry) => !blocks(entry))
  if (blocking.length === 0) lines.push('Nothing new to decide.', '')
  for (const entry of blocking) {
    const { finding: item } = entry
    lines.push(`### ${item.kind}${item.platform ? ` [${item.platform}]` : ''}: ${item.summary}`, '')
    lines.push(`- **Asked:** ${people(entry.asked)}`)
    if (entry.told.length > 0) lines.push(`- **Told:** ${people(entry.told)}`)
    lines.push(`- **Why:** ${entry.why}`)
    const next = nextStep(item)
    if (next) lines.push(`- **Next:** ${next}`)
    lines.push(`- ${item.graph}, \`${item.key}\``, '')
  }
  const compact = (heading: string, intro: string, entries: IntroducedFinding[], askedLabel: string) => {
    if (entries.length === 0) return
    lines.push(`### ${heading}`, '', intro, '')
    for (const entry of entries) lines.push(`- ${entry.finding.kind}${entry.finding.platform ? ` [${entry.finding.platform}]` : ''}: ${entry.finding.summary} ${askedLabel}: ${people(entry.asked)}.${entry.told.length > 0 ? ` Told: ${people(entry.told)}.` : ''}`)
    lines.push('')
  }
  compact('Added to the baseline in this change', 'These block by policy, and this change adds them to the baseline, so they are known debt rather than a failure.', baselined, 'Asked')
  compact('Recorded, not blocking', 'Known facts and evidence debt the policy reports without failing.', advisory, 'Owners')
  if (change.resolved.length > 0) {
    lines.push('### Resolved by this change', '')
    for (const item of change.resolved) lines.push(`- ${item.kind}: ${item.summary} (${item.graph})`)
    lines.push('')
  }
  lines.push('Run `bin/civic check --since <base>` to see this locally. CIVIC made no model calls.')
  return lines.join('\n')
}

function nextStep(item: Finding): string | undefined {
  if (item.kind === 'open-conflict') return `decide it with \`civic decide <decisions.json> ${item.subjectId} --graph ${item.graph} ...\`, or change the side that moved back.`
  if (item.kind === 'unreviewed-override') return 'raise a conflict for it so its owner is asked, or remove the override.'
  return undefined
}

function people(owners: Owner[]): string {
  return owners.length > 0 ? owners.map((owner) => `${owner.who} (${owner.role}${owner.platform ? `, ${owner.platform}` : ''})`).join(', ') : 'no owner recorded'
}

function ownerKey(owner: Owner): string {
  return `${owner.role}|${owner.who}|${owner.platform ?? ''}`
}

function dedupe(owners: Owner[]): Owner[] {
  const seen = new Set<string>()
  return owners.filter((owner) => !seen.has(ownerKey(owner)) && Boolean(seen.add(ownerKey(owner))))
}

function short(revision: string): string {
  return /^[0-9a-f]{40}$/.test(revision) ? revision.slice(0, 12) : revision
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}
