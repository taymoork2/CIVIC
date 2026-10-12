import type { Graph } from './graph.ts'
import type { Adoption, AlignmentState, Classification, CollaborationRecord, CollaborationResolution, ContractConflict, Decision, DecisionOutcome, GraphRecord, Proposal, Verification } from './schema.ts'

// Decisions (roadmap step 3). A conflict keeps what the import raised; whether it is
// decided, how it was classified and which alignment state it is in are read from the
// Decision record in force on it, never recomputed. Read-only and deterministic.

/** Which alignment states a decided outcome may put a conflict in. An open conflict is `unreviewed-drift` or `unknown-stale`. */
export const ALIGNMENT_FOR: Record<'open' | DecisionOutcome, readonly AlignmentState[]> = {
  open: ['unreviewed-drift', 'unknown-stale'],
  'update-design': ['awaiting-adoption', 'aligned'],
  'change-implementation': ['awaiting-adoption', 'aligned'],
  'update-contract': ['awaiting-adoption', 'aligned'],
  'approve-exception': ['approved-adaptation', 'accepted-limitation'],
}

/** A conflict as it stands: open, or decided by the Decision in force. */
export interface ConflictState {
  conflict: ContractConflict
  status: 'open' | 'decided'
  classification: Classification
  /** The decided alignment, except that a verified fix is `aligned`. */
  alignment: AlignmentState
  decision?: Decision
  /** Where the decided fix stands: adopted, verified, failed. Only on a decided conflict. */
  fix?: FixState
  /** Proposals that answer this conflict, oldest first. */
  proposals: Proposal[]
}

/** Every Decision on a conflict, oldest first, superseded ones included. */
export function decisionsOn(graph: Graph, conflictId: string): Decision[] {
  return graph
    .ofKind('decision')
    .filter((decision) => decision.conflictId === conflictId)
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
}

/**
 * The Decision in force on a conflict: the one no other Decision supersedes. A valid graph
 * has at most one; if an invalid graph has more, the latest is returned.
 */
export function decisionFor(graph: Graph, conflictId: string): Decision | undefined {
  const decisions = decisionsOn(graph, conflictId)
  const superseded = new Set(decisions.flatMap((decision) => (decision.supersedes ? [decision.supersedes] : [])))
  return decisions.filter((decision) => !superseded.has(decision.id)).at(-1)
}

export function conflictState(graph: Graph, conflict: ContractConflict): ConflictState {
  const decision = decisionFor(graph, conflict.id)
  const proposals = byTime(graph.ofKind('proposal').filter((proposal) => proposal.conflictId === conflict.id))
  if (!decision) return { conflict, status: 'open', classification: conflict.classification, alignment: conflict.alignment, proposals }
  const fix = fixFor(graph, decision)
  const alignment = fix.stage === 'verified' ? 'aligned' : decision.alignment
  return { conflict, status: 'decided', classification: decision.classification, alignment, decision, fix, proposals }
}

/** Every conflict in the graph with its current state. */
export function conflictStates(graph: Graph): ConflictState[] {
  return graph.ofKind('contract-conflict').map((conflict) => conflictState(graph, conflict))
}

// ---------------------------------------------------------------------------
// The decision loop: a decided conflict becomes a tracked fix that gets re-checked.

/**
 * Where a decided fix stands, read from its records and re-checked on every run:
 * - `accepted`: an approved exception, so there is nothing to adopt.
 * - `awaiting-adoption`: decided, and no revision carries it yet.
 * - `adopted`: a revision carries it, and nothing has verified that yet.
 * - `verified`: a Verification passed at the adopted revision and its evidence still passes.
 * - `failed`: the latest Verification failed, or the import read the adopted revision and
 *   still raises the conflict.
 * - `regressed`: it was verified, and evidence the Verification cited fails now.
 */
export const FIX_STAGES = ['accepted', 'awaiting-adoption', 'adopted', 'verified', 'failed', 'regressed'] as const
export type FixStage = (typeof FIX_STAGES)[number]

export interface FixState {
  stage: FixStage
  decision: Decision
  /** The latest adoption: the one the stage is about. */
  adoption?: Adoption
  /** The latest verification of that adoption. */
  verification?: Verification
  /** Why it failed or regressed, in a sentence. */
  reason?: string
}

/** Adoptions of a decision, oldest first. */
export function adoptionsOf(graph: Graph, decisionId: string): Adoption[] {
  return byTime(graph.ofKind('adoption').filter((adoption) => adoption.decisionId === decisionId))
}

/** Verifications of an adoption, oldest first. */
export function verificationsOf(graph: Graph, adoptionId: string): Verification[] {
  return byTime(graph.ofKind('verification').filter((verification) => verification.adoptionId === adoptionId))
}

/**
 * Where a decision's fix stands. Deterministic, and it reads the graph as it is now: a
 * verified fix whose evidence fails on a later import is `regressed`, so the gate checks it
 * again on every run instead of trusting the day it was verified.
 */
export function fixFor(graph: Graph, decision: Decision): FixState {
  if (decision.outcome === 'approve-exception') return { stage: 'accepted', decision }
  const adoption = adoptionsOf(graph, decision.id).at(-1)
  if (!adoption) return { stage: 'awaiting-adoption', decision }
  const verification = verificationsOf(graph, adoption.id).at(-1)
  const found = { decision, adoption, ...(verification ? { verification } : {}) }
  const revision = adoption.carriedBy.revision

  // CIVIC's own re-check: an import that read the adopted revision and still raises the
  // conflict shows the adoption didn't settle it, whatever anyone recorded.
  const conflict = graph.get(decision.conflictId)
  if (conflict?.kind === 'contract-conflict') {
    const readAt = conflict.sides.flatMap((side) => side.evidenceIds).filter((id) => {
      const evidence = graph.get(id)
      return evidence?.kind === 'evidence' && evidence.source.revision === revision
    })
    if (readAt.length > 0) return { stage: 'failed', ...found, reason: `The import read ${revision} (${readAt.join(', ')}) and still raises the conflict.` }
  }
  if (!verification) return { stage: 'adopted', ...found }
  if (verification.outcome === 'fail') return { stage: 'failed', ...found, reason: `${verification.id} failed at ${verification.revision}.` }
  const failing = verification.evidenceIds.filter((id) => {
    const evidence = graph.get(id)
    return evidence?.kind === 'evidence' && evidence.outcome === 'fail'
  })
  if (failing.length > 0) {
    const at = failing.map((id) => graph.get(id)?.source?.revision).filter(Boolean)
    return { stage: 'regressed', ...found, reason: `Verified at ${verification.revision}, and ${failing.join(', ')} now fail${at.length > 0 ? ` at ${[...new Set(at)].join(', ')}` : ''}.` }
  }
  return { stage: 'verified', ...found }
}

/** Every decision in force with its fix, in conflict order. */
export function fixesIn(graph: Graph): FixState[] {
  return conflictStates(graph).flatMap((state) => (state.fix ? [state.fix] : []))
}

/** Proposals no decision has approved yet, oldest first. Superseded decisions count: a proposal they approved was decided. */
export function openProposals(graph: Graph): Proposal[] {
  const approved = new Set(graph.ofKind('decision').flatMap((decision) => (decision.proposalId ? [decision.proposalId] : [])))
  return byTime(graph.ofKind('proposal').filter((proposal) => !approved.has(proposal.id)))
}

/** Every decided fix and open proposal as Markdown, for `civic fixes`. */
export function renderFixes(graph: Graph): string {
  const states = conflictStates(graph).filter((state) => state.decision)
  const lines = ['# Decided fixes', '']
  if (states.length === 0) lines.push('No conflict has a decision yet.', '')
  for (const { conflict, decision, fix } of states) {
    lines.push(`- **${fix!.stage}** ${conflict.title}${conflict.platform ? ` [${conflict.platform}]` : ''}: ${decision!.outcome} (\`${decision!.id}\`${decision!.proposalId ? `, approving \`${decision!.proposalId}\`` : ''}). ${describeFix(fix!)}`)
  }
  const open = openProposals(graph)
  if (open.length > 0) {
    lines.push('', '## Proposals waiting for a decision', '')
    for (const proposal of open) {
      lines.push(`- ${proposal.title}: ${proposal.outcome} at ${proposal.candidate.tool} ${proposal.candidate.revision}${proposal.candidate.preview ? ` (${proposal.candidate.preview})` : ''}, from ${proposal.proposedBy.role} ${proposal.proposedBy.who}. Expected: ${proposal.expected} (\`${proposal.id}\`)`)
    }
  }
  return lines.join('\n').trimEnd()
}

/** A fix stage as words a person reads in a report. */
export function describeFix(fix: FixState): string {
  const adopted = fix.adoption ? `adopted at ${fix.adoption.carriedBy.tool} ${fix.adoption.carriedBy.revision} by ${fix.adoption.adoptedBy.role} ${fix.adoption.adoptedBy.who} (\`${fix.adoption.id}\`)` : ''
  switch (fix.stage) {
    case 'accepted':
      return 'Accepted as an exception; nothing to adopt.'
    case 'awaiting-adoption':
      return 'Awaiting adoption: no revision carries the decision yet.'
    case 'adopted':
      return `${capital(adopted)}; not verified yet.`
    case 'verified':
      return `${capital(adopted)}; verified by ${fix.verification!.verifiedBy.role} ${fix.verification!.verifiedBy.who} (\`${fix.verification!.id}\`).`
    case 'failed':
      return `${capital(adopted)}; failed. ${fix.reason}`
    case 'regressed':
      return `${capital(adopted)}; regressed. ${fix.reason}`
  }
}

/**
 * Where a project keeps its Decision records between imports: a plain JSON file in the
 * repository, next to the contract, so a decision is reviewed and versioned like code.
 * Importers add these records to the graph they raise.
 */
export const DECISION_FILE_SCHEMA = 'civic.decisions/0'

/**
 * The decision loop's records live in the same file: proposals, decisions, adoptions and
 * verifications, each its own record, and the collaboration records (ambiguities,
 * constraints, coverage gaps, divergences, risks and exceptions). Older files have only
 * `decisions`.
 */
export interface DecisionFile {
  schema: typeof DECISION_FILE_SCHEMA
  note?: string
  proposals?: Proposal[]
  decisions: Decision[]
  adoptions?: Adoption[]
  verifications?: Verification[]
  collaboration?: CollaborationRecord[]
}

/** Every record a decision file holds, in loop order. */
export function decisionFileRecords(file: DecisionFile): GraphRecord[] {
  return [...(file.proposals ?? []), ...file.decisions, ...(file.adoptions ?? []), ...(file.verifications ?? []), ...(file.collaboration ?? [])]
}

/** Which conflict a decision file record is about, if any. */
export function conflictOfRecord(file: DecisionFile, record: GraphRecord): string | undefined {
  if (record.kind === 'proposal' || record.kind === 'decision') return record.conflictId
  if (record.kind === 'adoption') return file.decisions.find((decision) => decision.id === record.decisionId)?.conflictId
  if (record.kind === 'verification') {
    const adoption = (file.adoptions ?? []).find((candidate) => candidate.id === record.adoptionId)
    return adoption ? file.decisions.find((decision) => decision.id === adoption.decisionId)?.conflictId : undefined
  }
  return undefined
}

/**
 * Adds a decision to a decision file, superseding the one in force on the same conflict
 * if there is one, so a changed call never overwrites the earlier one. The new decision's
 * ID is `decision:<conflict path>`, with `.2`, `.3` and so on for later calls. Pure: the
 * caller writes the file and checks the result against the graph.
 */
export function recordDecision(file: DecisionFile, decision: Omit<Decision, 'id' | 'kind' | 'supersedes'>): { file: DecisionFile; decision: Decision } {
  const on = file.decisions.filter((candidate) => candidate.conflictId === decision.conflictId)
  const superseded = new Set(on.flatMap((candidate) => (candidate.supersedes ? [candidate.supersedes] : [])))
  const inForce = on.filter((candidate) => !superseded.has(candidate.id)).at(-1)
  const id = freeId(file, `decision:${decision.conflictId.replace(/^conflict:/, '')}`)
  const recorded: Decision = { id, kind: 'decision', ...decision, ...(inForce ? { supersedes: inForce.id } : {}) }
  return { file: { ...file, decisions: [...file.decisions, recorded] }, decision: recorded }
}

/** Adds a proposal, `proposal:<conflict path>` (or `proposal:<first target path>`), numbered like decisions. Pure. */
export function recordProposal(file: DecisionFile, proposal: Omit<Proposal, 'id' | 'kind'>): { file: DecisionFile; proposal: Proposal } {
  const from = proposal.conflictId ?? proposal.targetIds[0] ?? 'proposal:change'
  const recorded: Proposal = { id: freeId(file, `proposal:${pathOf(from)}`), kind: 'proposal', ...proposal }
  return { file: { ...file, proposals: [...(file.proposals ?? []), recorded] }, proposal: recorded }
}

/** Adds an adoption of a decision, `adoption:<decision path>`. Pure. */
export function recordAdoption(file: DecisionFile, adoption: Omit<Adoption, 'id' | 'kind'>): { file: DecisionFile; adoption: Adoption } {
  const recorded: Adoption = { id: freeId(file, `adoption:${pathOf(adoption.decisionId)}`), kind: 'adoption', ...adoption }
  return { file: { ...file, adoptions: [...(file.adoptions ?? []), recorded] }, adoption: recorded }
}

/** Adds a verification of an adoption, `verification:<adoption path>`. Pure. */
export function recordVerification(file: DecisionFile, verification: Omit<Verification, 'id' | 'kind'>): { file: DecisionFile; verification: Verification } {
  const recorded: Verification = { id: freeId(file, `verification:${pathOf(verification.adoptionId)}`), kind: 'verification', ...verification }
  return { file: { ...file, verifications: [...(file.verifications ?? []), recorded] }, verification: recorded }
}

/** Adds a collaboration record, `collab:<type>.<first subject path>`, open. Pure. */
export function recordCollaboration(file: DecisionFile, record: Omit<CollaborationRecord, 'id' | 'kind' | 'status' | 'resolution'>): { file: DecisionFile; record: CollaborationRecord } {
  const recorded: CollaborationRecord = { id: freeId(file, `collab:${record.type}.${pathOf(record.subjectIds[0] ?? 'collab:unscoped')}`), kind: 'collaboration', ...record, status: 'open' }
  return { file: { ...file, collaboration: [...(file.collaboration ?? []), recorded] }, record: recorded }
}

/**
 * Closes an open collaboration record as resolved or withdrawn, with how it closed and the
 * changes that resulted. The record stays in the file as history. Pure.
 */
export function closeCollaboration(file: DecisionFile, id: string, status: 'resolved' | 'withdrawn', resolution: CollaborationResolution): { file: DecisionFile; record: CollaborationRecord } {
  const existing = (file.collaboration ?? []).find((record) => record.id === id)
  if (!existing) throw new Error(`The decision file has no ${id}.`)
  if (existing.status !== 'open') throw new Error(`${id} is already ${existing.status}.`)
  const closed: CollaborationRecord = { ...existing, status, resolution }
  return { file: { ...file, collaboration: (file.collaboration ?? []).map((record) => (record.id === id ? closed : record)) }, record: closed }
}

/** `base`, or `base.2`, `base.3` and so on: the first ID the file doesn't use yet. */
function freeId(file: DecisionFile, base: string): string {
  const taken = new Set(decisionFileRecords(file).map((record) => record.id))
  let id = base
  for (let n = 2; taken.has(id); n += 1) id = `${base}.${n}`
  return id
}

function pathOf(id: string): string {
  return id.slice(id.indexOf(':') + 1)
}

function byTime<T extends { at: string; id: string }>(records: T[]): T[] {
  return [...records].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
