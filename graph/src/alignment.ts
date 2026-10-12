import { implementationsOf } from './context.ts'
import { conflictStates, type ConflictState } from './decisions.ts'
import type { Graph } from './graph.ts'
import type { AlignmentState, Platform, SemanticComponent } from './schema.ts'

// Alignment states per contract target and platform (spec: Alignment states, roadmap
// step 3). Every semantic component has exactly one state on each platform that implements
// it, read from the records: the conflicts and the Decision in force on each, the fix stage
// the decision loop tracks, accepted limitations and exceptions, and the evidence. Nothing
// is guessed: no evidence is `unknown-stale`, never `aligned`. Read-only and deterministic.

export interface Alignment {
  semanticId: string
  platform: Platform
  platformComponentId: string
  state: AlignmentState
  /** Why, one line per record that set or held the state, most severe first. */
  reasons: { state: AlignmentState; recordId: string; why: string }[]
}

export interface AlignmentOptions {
  /** ISO date that exceptions' end dates are compared with. */
  today: string
  /** Stale evidence by ID, with the reason (`staleEvidence`). */
  stale?: ReadonlyMap<string, string>
}

/** Most severe first: the state a target takes is the most severe any record gives it. */
const SEVERITY: readonly AlignmentState[] = ['unreviewed-drift', 'unknown-stale', 'awaiting-adoption', 'accepted-limitation', 'approved-adaptation', 'aligned']

/** The alignment state of every semantic component on each platform that implements it. */
export function alignmentsIn(graph: Graph, options: AlignmentOptions, scope?: string): Alignment[] {
  const semantics = scope ? [graph.get(scope)] : graph.ofKind('semantic-component')
  const states = conflictStates(graph)
  return semantics.flatMap((semantic) => {
    if (semantic?.kind !== 'semantic-component') throw new Error(`${scope} is not a semantic component in this graph.`)
    return implementationsOf(graph, semantic).map((component) => alignmentOf(graph, semantic, component.id, component.platform, states, options))
  })
}

function alignmentOf(graph: Graph, semantic: SemanticComponent, componentId: string, platform: Platform, states: ConflictState[], options: AlignmentOptions): Alignment {
  const reasons: Alignment['reasons'] = []
  const add = (state: AlignmentState, recordId: string, why: string) => reasons.push({ state, recordId, why })

  // Conflicts on this component on this platform, as decided (or not).
  for (const { conflict, status, alignment, fix, decision } of states) {
    const onTarget = conflict.targetId === semantic.id || conflict.sides.some((side) => side.recordId === componentId)
    if (!onTarget || (conflict.platform && conflict.platform !== platform)) continue
    if (status === 'open') add(conflict.alignment, conflict.id, `${conflict.summary} Nobody has decided it yet.`)
    else if (fix?.stage === 'failed' || fix?.stage === 'regressed') add('unreviewed-drift', conflict.id, `The decided fix ${fix.stage}${fix.reason ? `: ${fix.reason}` : '.'}`)
    else if (decision?.outcome === 'approve-exception' && decision.expires && decision.expires < options.today) add('unreviewed-drift', conflict.id, `The approved exception expired on ${decision.expires}.`)
    else add(alignment, conflict.id, alignment === 'aligned' ? 'The decided fix is verified.' : `Decided: ${decision!.outcome}${fix && fix.stage !== 'accepted' ? `, ${fix.stage.replace('-', ' ')}` : ''}.`)
  }

  // Exceptions and accepted limitations recorded as collaboration records.
  for (const record of graph.ofKind('collaboration')) {
    if (record.type !== 'exception' || record.status !== 'open') continue
    if (!record.subjectIds.some((id) => id === semantic.id || id === componentId) || (record.platform && record.platform !== platform)) continue
    if (record.expires! < options.today) add('unreviewed-drift', record.id, `The ${record.limitation ? 'accepted limitation' : 'exception'} expired on ${record.expires}.`)
    else add(record.limitation ? 'accepted-limitation' : 'approved-adaptation', record.id, `${record.summary} Until ${record.expires}.`)
  }

  // Evidence: failing evidence is drift, and stale evidence proves nothing.
  const evidence = graph.ofKind('evidence').filter((item) => item.subjectIds.includes(componentId) || (item.subjectIds.includes(semantic.id) && item.platform === platform))
  for (const item of evidence) {
    if (item.outcome === 'fail') add('unreviewed-drift', item.id, `${item.title} fails.`)
    else if (options.stale?.has(item.id)) add('unknown-stale', item.id, `${item.title} is stale: ${options.stale.get(item.id)}.`)
  }
  // Nothing above held the platform back, so only a passing run can show it aligned: a static
  // finding is not a verdict. A decision in force already rests on the evidence it cites.
  if (reasons.length === 0 && !evidence.some((item) => item.outcome === 'pass')) {
    add('unknown-stale', componentId, evidence.length === 0 ? `No evidence about ${platform} yet.` : `No passing run on ${platform} yet, only static findings.`)
  }

  reasons.sort((a, b) => SEVERITY.indexOf(a.state) - SEVERITY.indexOf(b.state) || a.recordId.localeCompare(b.recordId))
  return { semanticId: semantic.id, platform, platformComponentId: componentId, state: reasons[0]?.state ?? 'aligned', reasons }
}

/** The alignment table as Markdown: one row per component and platform, with why. */
export function renderAlignments(graph: Graph, alignments: Alignment[]): string {
  if (alignments.length === 0) return 'No semantic component has an implementation yet.'
  const lines = ['| Component | Platform | Alignment | Why |', '|---|---|---|---|']
  for (const item of alignments) {
    const title = graph.get(item.semanticId)?.title ?? item.semanticId
    const why = item.reasons.filter((reason) => reason.state === item.state).map((reason) => `${reason.why} (\`${reason.recordId}\`)`).join(' ') || 'Every record agrees and the evidence is current.'
    lines.push(`| ${title} | ${item.platform} | ${item.state} | ${why.replaceAll('|', '\\|')} |`)
  }
  return lines.join('\n')
}
