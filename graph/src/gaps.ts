import { stateCoverageOn } from './completeness.ts'
import { implementationsOf } from './context.ts'
import { conflictState } from './decisions.ts'
import { countsForReadiness, type Graph } from './graph.ts'
import type { Owner, Platform, SemanticComponent } from './schema.ts'

export const GAP_KINDS = [
  'open-conflict',
  'missing-variant',
  'missing-state',
  'platform-only-variant',
  'failing-evidence',
  'no-run-evidence',
  'unconfirmed-link',
  'approved-exception',
  'open-collaboration',
] as const
export type GapKind = (typeof GAP_KINDS)[number]

/** Something the contract expects that isn't there yet, and who owns closing it (D31). */
export interface Gap {
  kind: GapKind
  subjectId: string
  platform?: Platform
  /** What tells two gaps on one subject apart, such as the variant or the link, so a gap has a stable key. */
  detail?: string
  summary: string
  /** Empty when the graph names no owner, which is itself worth fixing. */
  owners: Owner[]
}

export interface GapOptions {
  /** A semantic component ID. Defaults to every semantic component. */
  scope?: string
  platform?: Platform
}

/**
 * Lists what is expected but missing, with owners. A read-only query over the graph:
 * the same graph always gives the same list, in the same order.
 */
export function gapsIn(graph: Graph, options: GapOptions = {}): Gap[] {
  const semantics = options.scope ? [graph.get(options.scope)] : graph.ofKind('semantic-component')
  const gaps: Gap[] = []
  for (const semantic of semantics) {
    if (semantic?.kind !== 'semantic-component') throw new Error(`${options.scope} is not a semantic component in this graph.`)
    gaps.push(...gapsForComponent(graph, semantic))
  }
  return gaps
    .filter((gap) => !options.platform || !gap.platform || gap.platform === options.platform)
    .sort((a, b) => GAP_KINDS.indexOf(a.kind) - GAP_KINDS.indexOf(b.kind) || (a.platform ?? '').localeCompare(b.platform ?? '') || a.subjectId.localeCompare(b.subjectId) || a.summary.localeCompare(b.summary))
}

function gapsForComponent(graph: Graph, semantic: SemanticComponent): Gap[] {
  const gaps: Gap[] = []
  const owners = (role: Owner['role']) => (semantic.owners ?? []).filter((owner) => owner.role === role)
  const implementations = implementationsOf(graph, semantic)
  const componentIds = new Set(implementations.map((component) => component.id))
  const points = graph.ofKind('extension-point').filter((point) => componentIds.has(point.platformComponentId))
  const scopeIds = new Set([semantic.id, ...componentIds, ...points.map((point) => point.id)])

  for (const conflict of graph.ofKind('contract-conflict')) {
    if (conflict.targetId !== semantic.id && !conflict.sides.some((side) => side.recordId && componentIds.has(side.recordId))) continue
    const where = { ...(conflict.platform ? { platform: conflict.platform } : {}) }
    const state = conflictState(graph, conflict)
    if (state.status === 'open') {
      gaps.push({ kind: 'open-conflict', subjectId: conflict.id, ...where, summary: `${conflict.summary} Classification ${state.classification}.`, owners: conflict.owners })
    } else if (state.decision?.outcome === 'approve-exception') {
      const { revisitTrigger, expires } = state.decision
      gaps.push({
        kind: 'approved-exception',
        subjectId: conflict.id,
        ...where,
        summary: `${conflict.title}: accepted as ${state.alignment}. Revisit when: ${revisitTrigger}${expires ? ` Expires ${expires}.` : ''}`,
        owners: conflict.owners,
      })
    }
  }

  // Collaboration records on the component, its implementations or its conflicts (roadmap step 3).
  const conflictIds = new Set(graph.ofKind('contract-conflict').filter((conflict) => conflict.targetId === semantic.id || conflict.sides.some((side) => side.recordId && componentIds.has(side.recordId))).map((conflict) => conflict.id))
  for (const record of graph.ofKind('collaboration')) {
    if (record.status !== 'open' || !record.subjectIds.some((id) => scopeIds.has(id) || conflictIds.has(id))) continue
    const where = { ...(record.platform ? { platform: record.platform } : {}) }
    if (record.type === 'exception') {
      gaps.push({ kind: 'approved-exception', subjectId: record.id, ...where, summary: `${record.title}: ${record.limitation ? 'accepted limitation' : 'exception'} until ${record.expires}. Revisit when: ${record.revisitTrigger}`, owners: record.owners })
    } else {
      gaps.push({ kind: 'open-collaboration', subjectId: record.id, ...where, detail: record.type, summary: `Open ${record.type.replace('-', ' ')}: ${record.summary}${record.due ? ` Due ${record.due}.` : ''}`, owners: record.owners })
    }
  }

  for (const component of implementations) {
    const componentOwners = [...(component.owners ?? [])]
    for (const mapping of component.variants.filter((candidate) => candidate.mapping === 'none')) {
      gaps.push({
        kind: 'missing-variant',
        subjectId: component.id,
        platform: component.platform,
        detail: mapping.semanticVariant,
        summary: `No ${component.platform} equivalent for ${semantic.title} ${mapping.semanticVariant}${mapping.note ? `: ${mapping.note}` : '.'}`,
        owners: componentOwners,
      })
    }
    for (const extra of component.extraVariants ?? []) {
      gaps.push({
        kind: 'platform-only-variant',
        subjectId: component.id,
        platform: component.platform,
        detail: extra.expression,
        summary: `${component.platform} offers \`${extra.expression}\`, which no ${semantic.title} variant covers. Design decides whether the contract adds it.`,
        owners: owners('design'),
      })
    }
    const evidence = graph.ofKind('evidence').filter((item) => item.subjectIds.some((id) => id === component.id || id === semantic.id) && (!item.platform || item.platform === component.platform))
    const runs = evidence.filter((item) => (item.tier === 'automated' || item.tier === 'physical-device') && (item.subjectIds.includes(component.id) || item.platform === component.platform))
    if (!runs.some((item) => item.outcome === 'pass')) {
      gaps.push({
        kind: 'no-run-evidence',
        subjectId: component.id,
        platform: component.platform,
        summary: `No automated or device evidence for ${component.title}; only static analysis.`,
        owners: owners('qa'),
      })
    }
  }

  // Product states a screen's design neither shows nor inherits (D32), owned by whoever owns the instances.
  const instances = graph.ofKind('component-instance').filter((instance) => instance.semanticId === semantic.id && instance.origin === 'design' && !instance.fork)
  const screens = new Set(instances.flatMap((instance) => screensOf(graph, instance.placedOn)))
  for (const screenId of [...screens].sort()) {
    for (const coverage of stateCoverageOn(graph, screenId).filter((item) => item.semanticId === semantic.id && item.missing.length > 0)) {
      const instanceOwners = instances.filter((instance) => coverage.instanceIds.includes(instance.id)).flatMap((instance) => instance.owners ?? [])
      gaps.push({
        kind: 'missing-state',
        subjectId: screenId,
        summary: `${graph.get(screenId)?.title ?? screenId} has no design for the ${semantic.title}'s ${coverage.missing.join(', ')} state(s); show them or say the instance inherits the default.`,
        owners: instanceOwners.length > 0 ? dedupeOwners(instanceOwners) : owners('design'),
      })
    }
  }

  for (const item of graph.ofKind('evidence')) {
    if (item.outcome === 'fail' && item.subjectIds.some((id) => scopeIds.has(id))) {
      gaps.push({ kind: 'failing-evidence', subjectId: item.id, ...(item.platform ? { platform: item.platform } : {}), summary: `${item.title} fails.`, owners: owners('qa') })
    }
  }

  for (const link of graph.document.links) {
    if (!countsForReadiness(link) && (scopeIds.has(link.from) || (link.to && scopeIds.has(link.to)))) {
      gaps.push({ kind: 'unconfirmed-link', subjectId: link.from, detail: `${link.relation} ${link.to ?? link.unmapped ?? 'unmapped'}`, summary: `${link.from} ${link.relation} ${link.to ?? link.unmapped} is ${link.status}; a person confirms it before it counts.`, owners: semantic.owners ?? [] })
    }
  }
  return gaps
}

/** The screen an instance belongs to: its own target, or the screen that contains its state target. */
/**
 * The screens a target is shown on: a state's screen, or for a product component (decision
 * 0011), every screen that places it, directly or inside another component.
 */
export function screensOf(graph: Graph, targetId: string, seen = new Set<string>()): string[] {
  const target = graph.get(targetId)
  if (target?.kind !== 'target' || target.scale !== 'component') return [screenOf(graph, targetId)]
  if (seen.has(targetId)) return []
  seen.add(targetId)
  const placers = graph.linksTo(targetId).filter((link) => link.relation === 'contains' && countsForReadiness(link) && graph.get(link.from)?.kind === 'target')
  return [...new Set(placers.flatMap((link) => screensOf(graph, link.from, seen)))].sort()
}

export function screenOf(graph: Graph, targetId: string): string {
  const target = graph.get(targetId)
  if (target?.kind !== 'target' || target.scale !== 'state') return targetId
  const parent = graph.linksTo(targetId).find((link) => link.relation === 'contains' && countsForReadiness(link) && graph.get(link.from)?.kind === 'target')
  return parent?.from ?? targetId
}

function dedupeOwners(owners: Owner[]): Owner[] {
  const seen = new Set<string>()
  return owners.filter((owner) => {
    const key = `${owner.role}|${owner.who}|${owner.platform ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** The gap list as Markdown, grouped by kind. */
export function renderGaps(gaps: Gap[]): string {
  if (gaps.length === 0) return 'No gaps.'
  const lines = [`${gaps.length} gap(s)`, '']
  for (const kind of GAP_KINDS) {
    const ofKind = gaps.filter((gap) => gap.kind === kind)
    if (ofKind.length === 0) continue
    lines.push(`## ${kind} (${ofKind.length})`, '')
    for (const gap of ofKind) {
      const owners = gap.owners.length > 0 ? gap.owners.map((owner) => `${owner.role} ${owner.who}`).join(', ') : 'no owner recorded'
      lines.push(`- ${gap.platform ? `[${gap.platform}] ` : ''}${gap.summary} Owners: ${owners}. (\`${gap.subjectId}\`)`)
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}
