import type { ChangeReport } from './change.ts'
import { completenessOf, stateCoverageOn } from './completeness.ts'
import { conflictStates, describeFix, openProposals, type FixStage } from './decisions.ts'
import { gapsIn, screensOf } from './gaps.ts'
import { indexGraph, type Graph } from './graph.ts'
import { methodCheck, type ResolvedProfile } from './method.ts'
import { resolveVocabulary, type ActionVocabulary } from './inverses.ts'
import { objectMapOf } from './objects.ts'
import type { GraphDocument, Owner, Platform } from './schema.ts'
import { validateGraph } from './validate.ts'

// The gate (roadmap step 8): every check CIVIC has, run over one or more graphs, with one
// pass or fail. A finding nobody has decided fails the gate unless a baseline already
// holds it, so old debt doesn't block a change and a new finding is raised at the change
// that caused it (decision 0005). Deterministic, read-only, and no model calls (D30).

export const FINDING_KINDS = [
  'invalid-graph',
  'open-conflict',
  'unreviewed-override',
  'expired-exception',
  'failed-fix',
  'regressed-fix',
  'failing-evidence',
  'stale-evidence',
  'missing-state',
  'dead-end',
  'unreachable-screen',
  'missing-variant',
  'platform-only-variant',
  'no-run-evidence',
  'unconfirmed-link',
  'unconfirmed-target',
  'unconfirmed-fork',
  'approved-exception',
  'open-proposal',
  'awaiting-adoption',
  'unverified-adoption',
  'open-collaboration',
  'object-not-shown',
  'object-attribute-missing',
  'object-action-platform',
  'object-action-no-inverse',
  'unconfirmed-object-tie',
  'tier-composition',
  'token-tier',
  'no-tier',
] as const
export type FindingKind = (typeof FINDING_KINDS)[number]

/**
 * The default policy: findings that still wait on someone's decision block. The rest are
 * known, recorded facts (a variant mapped to `none`, an approved exception) or evidence
 * debt, and are reported without failing. A project can choose its own list.
 */
export const DEFAULT_BLOCKING: readonly FindingKind[] = [
  'invalid-graph',
  'open-conflict',
  'unreviewed-override',
  'expired-exception',
  'failed-fix',
  'regressed-fix',
  'failing-evidence',
  'missing-state',
  'dead-end',
  'unreachable-screen',
]

export interface Finding {
  /** Stable across runs: kind, subject, platform and detail. Baselines match on it with the graph. */
  key: string
  graph: string
  kind: FindingKind
  subjectId: string
  platform?: Platform
  summary: string
  owners: Owner[]
}

/** One check's count with its denominator, such as "1 of 4 conflicts open". */
export interface Measure {
  graph: string
  check: string
  found: number
  of: number
}

export interface GraphCheck {
  graph: string
  findings: Finding[]
  measures: Measure[]
}

export interface CheckOptions {
  /** ISO date that approved exceptions' `expires` is compared with. */
  today: string
  /**
   * Evidence whose code changed since it was captured, with the reason, by evidence ID
   * (`staleEvidence`). Given only for graphs with a freshness rule; without it, staleness
   * isn't checked or measured.
   */
  stale?: ReadonlyMap<string, string>
  /**
   * The methodology profiles this graph's team declared (decision 0014), already resolved.
   * Without any, no methodology check runs.
   */
  methods?: readonly ResolvedProfile[]
  /** The project's action vocabulary (decision 0015), which extends the defaults the inverse check reads. */
  actions?: ActionVocabulary
}

/** Validates one graph document and, if it is valid, runs every check on it. */
export function checkDocument(graph: string, document: unknown, options: CheckOptions): GraphCheck {
  const errors = validateGraph(document).filter((issue) => issue.severity === 'error')
  if (errors.length > 0) {
    return {
      graph,
      findings: errors.map((issue) => finding(graph, 'invalid-graph', issue.at, `${issue.code}: ${issue.message}`, [], undefined, issue.code)),
      measures: [],
    }
  }
  return checkGraph(graph, indexGraph(document as GraphDocument), options)
}

/** Runs every check on a valid graph. The same graph and date always give the same result. */
export function checkGraph(label: string, graph: Graph, options: CheckOptions): GraphCheck {
  const findings: Finding[] = []
  const measures: Measure[] = []
  const add = (kind: FindingKind, subjectId: string, summary: string, owners: Owner[], platform?: Platform, detail?: string) =>
    findings.push(finding(label, kind, subjectId, summary, owners, platform, detail))
  const measure = (check: string, found: number, of: number) => measures.push({ graph: label, check, found, of })

  // A conflict is decided only by a Decision record in force on it (roadmap step 3).
  const states = conflictStates(graph)
  const conflicts = states.map((state) => state.conflict)
  const exceptions = states.filter((state) => state.decision?.outcome === 'approve-exception')
  for (const { conflict, status } of states) {
    if (status === 'open') add('open-conflict', conflict.id, `${conflict.summary} Nobody has decided it yet.`, conflict.owners, conflict.platform)
  }
  for (const { conflict, decision, alignment } of exceptions) {
    const { expires, revisitTrigger } = decision!
    if (expires && expires < options.today) add('expired-exception', conflict.id, `${conflict.title}: the approved exception expired on ${expires}. Revisit when: ${revisitTrigger}`, conflict.owners, conflict.platform)
    else add('approved-exception', conflict.id, `${conflict.title}: accepted as ${alignment}${expires ? ` until ${expires}` : ''}. Revisit when: ${revisitTrigger}`, conflict.owners, conflict.platform)
  }
  measure('Contract conflicts open', states.filter((state) => state.status === 'open').length, states.length)
  measure('Approved exceptions expired', findings.filter((item) => item.kind === 'expired-exception').length, exceptions.length)

  // The decision loop: a decided fix is tracked until a revision carries it and evidence at
  // that revision verifies it, then re-checked on every run (roadmap step 3).
  const fixes = states.flatMap((state) => (state.fix && state.fix.stage !== 'accepted' ? [{ conflict: state.conflict, fix: state.fix }] : []))
  const kindFor: Record<Exclude<FixStage, 'accepted' | 'verified'>, FindingKind> = { 'awaiting-adoption': 'awaiting-adoption', adopted: 'unverified-adoption', failed: 'failed-fix', regressed: 'regressed-fix' }
  for (const { conflict, fix } of fixes) {
    if (fix.stage === 'verified' || fix.stage === 'accepted') continue
    const owners = fix.stage === 'awaiting-adoption' || fix.stage === 'adopted' ? conflict.owners : [fix.adoption!.adoptedBy, ...conflict.owners]
    add(kindFor[fix.stage], conflict.id, `${conflict.title}: ${describeFix(fix)}`, owners, conflict.platform, fix.adoption?.id)
  }
  measure('Decided fixes not yet adopted', fixes.filter(({ fix }) => fix.stage === 'awaiting-adoption').length, fixes.length)
  measure('Decided fixes verified', fixes.filter(({ fix }) => fix.stage === 'verified').length, fixes.length)
  measure('Decided fixes failed or regressed', fixes.filter(({ fix }) => fix.stage === 'failed' || fix.stage === 'regressed').length, fixes.length)
  const proposals = graph.ofKind('proposal')
  const undecidedProposals = openProposals(graph)
  for (const proposal of undecidedProposals) {
    const conflict = proposal.conflictId ? graph.get(proposal.conflictId) : undefined
    add('open-proposal', proposal.id, `${proposal.title} proposes ${proposal.outcome} at ${proposal.candidate.tool} ${proposal.candidate.revision} and waits for a decision.`, conflict?.owners ?? [proposal.proposedBy])
  }
  measure('Proposals waiting for a decision', undecidedProposals.length, proposals.length)

  // Collaboration records (roadmap step 3). An exception in force is reported like an approved
  // exception on a conflict and fails once it expires; any other open record is advisory and
  // says when it is overdue.
  const collaboration = graph.ofKind('collaboration')
  const open = collaboration.filter((record) => record.status === 'open')
  for (const record of open) {
    const typeLabel = record.type === 'exception' ? (record.limitation ? 'accepted limitation' : 'exception') : record.type.replace('-', ' ')
    if (record.type === 'exception') {
      if (record.expires! < options.today) add('expired-exception', record.id, `${record.title}: the ${typeLabel} expired on ${record.expires}. Revisit when: ${record.revisitTrigger}`, record.owners, record.platform)
      else add('approved-exception', record.id, `${record.title}: ${typeLabel} until ${record.expires}. Revisit when: ${record.revisitTrigger}`, record.owners, record.platform)
    } else {
      const overdue = record.due && record.due < options.today ? ` It was due ${record.due}.` : ''
      add('open-collaboration', record.id, `Open ${typeLabel}: ${record.summary}${overdue} Needs ${record.perspectives.join(', ') || 'its owners'}.`, record.owners, record.platform, record.type)
    }
  }
  measure('Collaboration records open', open.filter((record) => record.type !== 'exception').length, collaboration.filter((record) => record.type !== 'exception').length)

  const overrides = graph.ofKind('override')
  let undecided = 0
  for (const override of overrides) {
    const tracking = states.find((state) => state.conflict.sides.some((side) => side.recordId === override.id))
    if (!tracking) add('unreviewed-override', override.id, `${override.title} changes \`${override.property}\` and no conflict tracks it, so nobody has been asked to decide.`, override.madeBy ? [override.madeBy] : [])
    if (tracking?.status !== 'decided') undecided += 1
  }
  measure('Overrides without a decision', undecided, overrides.length)

  const evidence = graph.ofKind('evidence')
  for (const item of evidence.filter((candidate) => candidate.outcome === 'fail')) add('failing-evidence', item.id, `${item.title} fails.`, item.owners ?? [], item.platform)
  measure('Evidence failing', evidence.filter((item) => item.outcome === 'fail').length, evidence.length)
  if (options.stale) {
    const stale = evidence.filter((item) => options.stale!.has(item.id))
    for (const item of stale) add('stale-evidence', item.id, `${item.title} is stale: ${options.stale.get(item.id)}. Recapture it.`, item.owners ?? [], item.platform)
    measure('Evidence stale', stale.length, evidence.length)
  }

  // Product states each screen's design accounts for (D32), one finding per missing state.
  const designScreens = new Set(graph.ofKind('component-instance').filter((instance) => instance.origin === 'design' && !instance.fork).flatMap((instance) => screensOf(graph, instance.placedOn)))
  let productStates = 0
  let missingStates = 0
  for (const screenId of [...designScreens].sort()) {
    for (const coverage of stateCoverageOn(graph, screenId)) {
      const semantic = graph.get(coverage.semanticId)
      if (semantic?.kind !== 'semantic-component') continue
      productStates += (semantic.productStates ?? []).length
      missingStates += coverage.missing.length
      const owners = coverage.instanceIds.flatMap((id) => graph.get(id)?.owners ?? [])
      for (const state of coverage.missing) {
        add('missing-state', screenId, `${title(graph, screenId)} has no design for the ${semantic.title}'s ${state} state; show it or say the instance inherits the default.`, owners.length > 0 ? owners : (semantic.owners ?? []).filter((owner) => owner.role === 'design'), undefined, `${semantic.id} ${state}`)
      }
    }
  }
  measure('Product states missing from designs', missingStates, productStates)

  let screens = 0
  let deadEnds = 0
  let unreachable = 0
  for (const journey of graph.ofKind('target').filter((target) => target.scale === 'journey')) {
    const shape = completenessOf(graph, journey.id).journey
    screens += shape.screens.length
    deadEnds += shape.deadEnds.length
    unreachable += shape.unreachable.length
    for (const id of shape.deadEnds) add('dead-end', id, `${title(graph, id)} is a dead end in ${journey.title}: no path leads on and it isn't a declared exit.`, journey.owners ?? [], undefined, journey.id)
    for (const id of shape.unreachable) add('unreachable-screen', id, `${title(graph, id)} can't be reached from ${journey.title}'s entry.`, journey.owners ?? [], undefined, journey.id)
  }
  measure('Journey screens that are dead ends', deadEnds, screens)
  measure('Journey screens unreachable', unreachable, screens)

  // Discovered screens (D34) wait for a person to confirm them; until then they don't count.
  const targets = graph.ofKind('target').filter((target) => target.scale !== 'journey' && target.scale !== 'component')
  const discovered = targets.filter((target) => target.presence === 'discovered')
  for (const target of discovered) add('unconfirmed-target', target.id, `${target.title} was discovered${target.source ? ` by ${target.source.importer}` : ''}; a person confirms it before it counts.`, target.owners ?? [])
  measure('Screens awaiting confirmation', discovered.length, targets.length)

  // Forks CIVIC inferred by name and structure, or by import (decision 0011), wait for a person too.
  const forks = graph.ofKind('component-instance').filter((instance) => instance.fork)
  const inferred = forks.filter((instance) => instance.fork!.status === 'inferred')
  for (const instance of inferred) {
    add('unconfirmed-fork', instance.id, `${instance.title} looks like a copy of the library's ${title(graph, instance.semanticId)} (${instance.fork!.basis}); a person confirms or dismisses it before it counts as drift.`, instance.owners ?? [], instance.platform)
  }
  measure('Forks awaiting confirmation', inferred.length, forks.length)

  // The contract export's gaps that the checks above don't already cover.
  const fromGaps = new Set<FindingKind>(['missing-variant', 'platform-only-variant', 'no-run-evidence', 'unconfirmed-link'])
  for (const gap of gapsIn(graph)) {
    if (fromGaps.has(gap.kind as FindingKind)) add(gap.kind as FindingKind, gap.subjectId, gap.summary, gap.owners, gap.platform, gap.detail)
  }
  const mappings = graph.ofKind('platform-component').flatMap((component) => component.variants)
  measure('Variant mappings with no equivalent', mappings.filter((mapping) => mapping.mapping === 'none').length, mappings.length)

  // The object map (decision 0014, point 8): the designer's questions of what was built.
  // Advisory by default, since what a screen leaves out of an object is often on purpose.
  const objects = objectMapOf(graph, resolveVocabulary(options.actions))
  for (const gap of objects.gaps) add(gap.kind, gap.subjectId, gap.summary, gap.owners, gap.platform, gap.detail)
  const gapCount = (kind: FindingKind) => objects.gaps.filter((gap) => gap.kind === kind).length
  measure('Objects a journey needs that no screen of it shows', gapCount('object-not-shown'), objects.counts.needs)
  measure('Object attributes missing from a screen of the same view', gapCount('object-attribute-missing'), objects.counts.attributeChecks)
  measure('Object calls to action missing on a platform', gapCount('object-action-platform'), objects.counts.actionChecks)
  measure('Object actions with no way back', gapCount('object-action-no-inverse'), objects.counts.inverseChecks)
  measure('Object ties awaiting confirmation', gapCount('unconfirmed-object-tie'), objects.counts.ties)

  // Methodology profiles (decision 0014): composition, token tiers and targets with no tier,
  // in the team's own vocabulary. Advisory by default, since tier boundaries are judgment calls.
  // A placement that doesn't fit the graph is an invalid declaration, so it fails like one.
  for (const profile of options.methods ?? []) {
    const result = methodCheck(graph, profile)
    for (const error of result.errors) add('invalid-graph', profile.id, `${profile.title}: ${error}`, profile.owners ?? [], undefined, error)
    for (const gap of result.gaps) add(gap.kind, gap.subjectId, gap.summary, gap.owners, undefined, gap.detail)
    const gapCount = (kind: FindingKind) => result.gaps.filter((gap) => gap.kind === kind).length
    measure(`${profile.title}: containments its tiers don't allow`, gapCount('tier-composition'), result.counts.containments)
    measure(`${profile.title}: token reads past their tier`, result.counts.pastTier, result.counts.references)
    measure(`${profile.title}: targets with no tier`, gapCount('no-tier'), result.counts.held)
  }

  const seen = new Set<string>()
  const unique = findings.filter((item) => !seen.has(item.key) && Boolean(seen.add(item.key)))
  return { graph: label, findings: unique.sort(byKindThenKey), measures }
}

export interface BaselineEntry {
  graph: string
  key: string
  summary: string
}

export interface Baseline {
  schema: 'civic.baseline/0'
  findings: BaselineEntry[]
}

export interface CheckReport {
  passed: boolean
  blocking: readonly FindingKind[]
  /** Blocking findings the baseline doesn't hold: these fail the gate. */
  fresh: Finding[]
  /** Blocking findings the baseline already holds. */
  baselined: Finding[]
  /** Baseline entries no longer found: fixed, so they can come out of the baseline. */
  fixed: BaselineEntry[]
  /** Findings the policy reports without blocking. */
  advisory: Finding[]
  measures: Measure[]
}

/**
 * Splits the findings by the policy and the baseline. An invalid graph can't be baselined:
 * the other checks didn't run on it, so nothing else about it is known.
 */
export function compareToBaseline(checks: GraphCheck[], baseline: Baseline | undefined, blocking: readonly FindingKind[] = DEFAULT_BLOCKING): CheckReport {
  const held = new Set((baseline?.findings ?? []).map((entry) => `${entry.graph}\n${entry.key}`))
  const findings = checks.flatMap((check) => check.findings)
  const blocks = findings.filter((item) => item.kind === 'invalid-graph' || blocking.includes(item.kind))
  const fresh = blocks.filter((item) => item.kind === 'invalid-graph' || !held.has(`${item.graph}\n${item.key}`))
  const baselined = blocks.filter((item) => !fresh.includes(item))
  const found = new Set(findings.map((item) => `${item.graph}\n${item.key}`))
  const fixed = (baseline?.findings ?? []).filter((entry) => !found.has(`${entry.graph}\n${entry.key}`))
  return {
    passed: fresh.length === 0,
    blocking,
    fresh,
    baselined,
    fixed,
    advisory: findings.filter((item) => !blocks.includes(item)),
    measures: checks.flatMap((check) => check.measures),
  }
}

/** A baseline holding every blocking finding in the report, so the gate passes on this state. */
export function baselineFrom(report: CheckReport): Baseline {
  const findings = [...report.baselined, ...report.fresh]
    .filter((item) => item.kind !== 'invalid-graph')
    .map((item) => ({ graph: item.graph, key: item.key, summary: item.summary }))
    .sort((a, b) => a.graph.localeCompare(b.graph) || a.key.localeCompare(b.key))
  return { schema: 'civic.baseline/0', findings }
}

/** One line for a commit status, at most 140 characters as GitHub allows. */
export function statusLine(report: CheckReport, change?: ChangeReport): string {
  const line = report.passed
    ? `No new undecided findings; ${report.baselined.length} baselined, ${report.advisory.length} advisory`
    : `${report.fresh.length} new undecided finding(s); ${report.baselined.length} baselined`
  const since = change ? `; this change: ${change.introduced.length} introduced, ${change.resolved.length} resolved` : ''
  return `${line}${since}`.slice(0, 140)
}

/** The report as Markdown: the verdict, what is new, then counts with denominators. */
export function renderCheck(report: CheckReport): string {
  const lines = [`# civic check: ${report.passed ? 'passed' : 'failed'}`, '']
  lines.push(
    `${report.fresh.length} new undecided finding(s), ${report.baselined.length} held by the baseline, ${report.fixed.length} fixed since the baseline, ${report.advisory.length} advisory.`,
    '',
  )
  if (report.fresh.length > 0) {
    lines.push('## New, undecided', '')
    for (const item of report.fresh) lines.push(line(item))
    lines.push('')
  }
  lines.push('## Counts', '', 'Checks with nothing to count in a graph are left out.', '', '| Graph | Check | Found | Of |', '|---|---|---|---|')
  for (const item of report.measures.filter((measure) => measure.of > 0)) lines.push(`| ${item.graph} | ${item.check} | ${item.found} | ${item.of} |`)
  lines.push('')
  if (report.fixed.length > 0) {
    lines.push('## Fixed since the baseline', '', 'Run `civic check --update-baseline` to take these out.', '')
    for (const entry of report.fixed) lines.push(`- ${entry.graph}: ${entry.summary} (\`${entry.key}\`)`)
    lines.push('')
  }
  if (report.baselined.length > 0) {
    lines.push('## Held by the baseline', '')
    for (const item of report.baselined) lines.push(line(item))
    lines.push('')
  }
  if (report.advisory.length > 0) {
    const counts = FINDING_KINDS.map((kind) => [kind, report.advisory.filter((item) => item.kind === kind).length] as const).filter(([, count]) => count > 0)
    lines.push('## Advisory', '', `Reported, not blocking: ${counts.map(([kind, count]) => `${count} ${kind}`).join(', ')}. \`civic gaps\` lists the contract gaps among them with owners.`, '')
  }
  return lines.join('\n').trimEnd()
}

function line(item: Finding): string {
  const owners = item.owners.length > 0 ? item.owners.map((owner) => `${owner.role} ${owner.who}`).join(', ') : 'no owner recorded'
  return `- **${item.kind}** ${item.platform ? `[${item.platform}] ` : ''}${item.summary} Owners: ${owners}. (${item.graph}, \`${item.key}\`)`
}

function finding(graph: string, kind: FindingKind, subjectId: string, summary: string, owners: Owner[], platform?: Platform, detail?: string): Finding {
  const key = [kind, subjectId, platform, detail].filter(Boolean).join(' ')
  return { key, graph, kind, subjectId, ...(platform ? { platform } : {}), summary, owners: dedupe(owners) }
}

function byKindThenKey(a: Finding, b: Finding): number {
  return FINDING_KINDS.indexOf(a.kind) - FINDING_KINDS.indexOf(b.kind) || a.key.localeCompare(b.key)
}

function title(graph: Graph, id: string): string {
  return graph.get(id)?.title ?? id
}

function dedupe(owners: Owner[]): Owner[] {
  const seen = new Set<string>()
  return owners.filter((owner) => {
    const key = `${owner.role}|${owner.who}|${owner.platform ?? ''}`
    return !seen.has(key) && Boolean(seen.add(key))
  })
}
