import { checkGraph, type Baseline, type Finding } from './check.ts'
import { countsForReadiness, type Graph } from './graph.ts'
import type { Evidence, LinkStatus, Target } from './schema.ts'

// What the graph knows about one screen, for a viewer such as the journey canvas (decision
// 0004: the engine is a viewer of the graph). A read-only query; no model calls (D30).

export interface ScreenFacts {
  graph: string
  target: Pick<Target, 'id' | 'title' | 'scale' | 'presence'>
  journeys: { id: string; title: string }[]
  paths: { action?: string; to?: string; toTitle?: string; unmapped?: string; status: LinkStatus; counts: boolean }[]
  evidence: Pick<Evidence, 'id' | 'title' | 'outcome' | 'finding' | 'tier' | 'method' | 'capturedAt' | 'source'>[]
  /** The gate's findings on this screen or on evidence about it, and whether the baseline holds each. */
  findings: (Finding & { baselined: boolean })[]
}

export function screenFacts(graph: Graph, label: string, targetId: string, options: { today: string; baseline?: Baseline }): ScreenFacts {
  const target = graph.get(targetId)
  if (target?.kind !== 'target') throw new Error(`${targetId} is not a target in ${label}.`)
  const evidence = graph.ofKind('evidence').filter((item) => item.subjectIds.includes(targetId))
  const subjects = new Set([targetId, ...evidence.map((item) => item.id)])
  const held = new Set((options.baseline?.findings ?? []).filter((entry) => entry.graph === label).map((entry) => entry.key))
  const title = (id: string) => graph.get(id)?.title ?? id
  return {
    graph: label,
    target: { id: target.id, title: target.title, scale: target.scale, presence: target.presence },
    journeys: graph.linksTo(targetId).filter((link) => link.relation === 'contains').map((link) => ({ id: link.from, title: title(link.from) })),
    paths: graph.linksFrom(targetId).filter((link) => link.relation === 'navigates').map((link) => ({
      ...(link.action ? { action: link.action } : {}),
      ...(link.to ? { to: link.to, toTitle: title(link.to) } : {}),
      ...(link.unmapped ? { unmapped: link.unmapped } : {}),
      status: link.status,
      counts: countsForReadiness(link),
    })),
    evidence: evidence.map(({ id, title, outcome, finding, tier, method, capturedAt, source }) => ({ id, title, outcome, ...(finding ? { finding } : {}), tier, method, capturedAt, source })),
    findings: checkGraph(label, graph, { today: options.today }).findings.filter((item) => subjects.has(item.subjectId)).map((item) => ({ ...item, baselined: held.has(item.key) })),
  }
}

export function renderScreen(facts: ScreenFacts): string {
  const lines = [`# ${facts.target.title}`, '', `\`${facts.target.id}\`, ${facts.target.presence} ${facts.target.scale} in ${facts.graph}.`, '']
  if (facts.journeys.length > 0) lines.push(`In: ${facts.journeys.map((journey) => journey.title).join(', ')}.`, '')
  lines.push('## Paths on', '', ...(facts.paths.length > 0 ? facts.paths.map((path) => `- ${path.action ?? 'path'} to ${path.toTitle ?? `unmapped ${path.unmapped}`} (${path.status})`) : ['None.']), '')
  lines.push('## Evidence', '', ...(facts.evidence.length > 0 ? facts.evidence.map((item) => `- ${item.outcome}: ${item.title} (${item.method}, ${item.source.revision.slice(0, 12)})${item.finding ? `: ${item.finding}` : ''}`) : ['None.']), '')
  lines.push('## Findings', '', ...(facts.findings.length > 0 ? facts.findings.map((item) => `- **${item.kind}**${item.baselined ? ' (baselined)' : ''} ${item.summary}`) : ['None.']))
  return lines.join('\n')
}
