import { indexGraph } from './graph.ts'
import type { Evidence, GraphDocument, Owner, Platform } from './schema.ts'

// What one test run covered, measured against the graph (roadmap step 10, QA). A run's
// evidence is compared with the evidence the graph already holds for the same platform:
// which subjects now fail that passed, which now pass that failed, and which subjects the
// run left uncovered. Deterministic, read-only, and no model calls (D30).

export interface CoverageSubject {
  id: string
  title: string
  /** QA owners when the record names any, otherwise every owner it names. */
  owners: Owner[]
}

export interface OutcomeChange extends CoverageSubject {
  /** The run's tests on this subject that decided its new outcome. */
  tests: string[]
}

export interface RunCoverage {
  platform: Platform
  revision: string
  tests: { passed: number; failed: number }
  /** Subjects the run has evidence on. */
  covered: number
  /** Subjects the run was expected to cover: screens the graph expects, and every subject the graph's run evidence on this platform covers. */
  expected: number
  newlyFailing: OutcomeChange[]
  newlyPassing: OutcomeChange[]
  /** Expected subjects the run produced no evidence on. */
  uncovered: CoverageSubject[]
}

const RUN_TIERS = new Set(['automated', 'physical-device'])

/**
 * Compares a run's evidence with the graph. A subject fails when any test on it failed and
 * passes when every test on it passed, the same reading the Laundry runs table uses. `scope`
 * narrows the expected subjects, for a run that is meant to cover only part of the graph.
 */
export function runCoverage(document: GraphDocument, run: Evidence[], platform: Platform, scope?: (id: string) => boolean): RunCoverage {
  const graph = indexGraph(document)
  const onPlatform = (item: Evidence) => RUN_TIERS.has(item.tier) && (item.platform ?? platform) === platform
  const before = graph.ofKind('evidence').filter(onPlatform)
  const now = run.filter(onPlatform)
  const outcome = (evidence: Evidence[], id: string): 'pass' | 'fail' | undefined => {
    const on = evidence.filter((item) => item.subjectIds.includes(id) && item.outcome !== 'finding')
    if (on.length === 0) return undefined
    return on.some((item) => item.outcome === 'fail') ? 'fail' : 'pass'
  }
  const subject = (id: string): CoverageSubject => {
    const record = graph.get(id)
    const owners = record?.owners ?? []
    const qa = owners.filter((owner) => owner.role === 'qa')
    return { id, title: record?.title ?? id, owners: qa.length > 0 ? qa : owners }
  }
  const testsOn = (id: string, wanted: 'pass' | 'fail') => now.filter((item) => item.subjectIds.includes(id) && item.outcome === wanted).map((item) => item.title)

  const screens = graph.ofKind('target').filter((target) => target.scale === 'screen' && target.presence === 'expected' && (!target.platforms || target.platforms.includes(platform)))
  const inScope = scope ?? (() => true)
  const expected = [...new Set([...screens.map((target) => target.id), ...before.flatMap((item) => item.subjectIds)])].filter(inScope).sort()
  const covered = [...new Set(now.flatMap((item) => item.subjectIds))].sort()
  const coveredSet = new Set(covered)

  const newlyFailing: OutcomeChange[] = []
  const newlyPassing: OutcomeChange[] = []
  for (const id of covered) {
    const then = outcome(before, id)
    const after = outcome(now, id)
    if (then === 'pass' && after === 'fail') newlyFailing.push({ ...subject(id), tests: testsOn(id, 'fail') })
    if (then === 'fail' && after === 'pass') newlyPassing.push({ ...subject(id), tests: testsOn(id, 'pass') })
  }
  const revisions = [...new Set(now.map((item) => item.source.revision))]
  return {
    platform,
    revision: revisions.join(', '),
    tests: { passed: now.filter((item) => item.outcome === 'pass').length, failed: now.filter((item) => item.outcome === 'fail').length },
    covered: covered.length,
    expected: expected.length,
    newlyFailing,
    newlyPassing,
    uncovered: expected.filter((id) => !coveredSet.has(id)).map(subject),
  }
}

/** The coverage as plain text for a terminal, listing at most `limit` subjects per section. */
export function renderCoverage(coverage: RunCoverage, graphLabel: string, limit = 20): string {
  const people = (owners: Owner[]) => (owners.length > 0 ? owners.map((owner) => `${owner.role} ${owner.who}`).join(', ') : 'no owner recorded')
  const list = (items: CoverageSubject[], extra: (item: CoverageSubject) => string = () => '') => [
    ...items.slice(0, limit).map((item) => `  - ${item.title} (${item.id}). Owners: ${people(item.owners)}.${extra(item)}`),
    ...(items.length > limit ? [`  ... and ${items.length - limit} more`] : []),
  ]
  const lines = [
    `CIVIC: ${coverage.tests.passed + coverage.tests.failed} test(s) on ${coverage.platform} at ${coverage.revision || 'no revision'}: ${coverage.tests.passed} passed, ${coverage.tests.failed} failed, covering ${coverage.covered} subject(s). Compared with ${graphLabel}.`,
  ]
  if (coverage.newlyFailing.length > 0) lines.push(`Now failing, passed in the graph (${coverage.newlyFailing.length}):`, ...list(coverage.newlyFailing, (item) => ` Failed: ${(item as OutcomeChange).tests.join('; ')}.`))
  if (coverage.newlyPassing.length > 0) lines.push(`Now passing, failed in the graph (${coverage.newlyPassing.length}):`, ...list(coverage.newlyPassing))
  if (coverage.uncovered.length > 0) lines.push(`Left uncovered by this run (${coverage.uncovered.length} of ${coverage.expected} expected):`, ...list(coverage.uncovered))
  else lines.push(`Every one of the ${coverage.expected} expected subject(s) has evidence from this run.`)
  return lines.join('\n')
}
