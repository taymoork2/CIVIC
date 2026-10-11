import type { Graph } from './graph.ts'
import type { AlignmentState, Classification, ContractConflict, Decision, DecisionOutcome } from './schema.ts'

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
  alignment: AlignmentState
  decision?: Decision
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
  if (!decision) return { conflict, status: 'open', classification: conflict.classification, alignment: conflict.alignment }
  return { conflict, status: 'decided', classification: decision.classification, alignment: decision.alignment, decision }
}

/** Every conflict in the graph with its current state. */
export function conflictStates(graph: Graph): ConflictState[] {
  return graph.ofKind('contract-conflict').map((conflict) => conflictState(graph, conflict))
}

/**
 * Where a project keeps its Decision records between imports: a plain JSON file in the
 * repository, next to the contract, so a decision is reviewed and versioned like code.
 * Importers add these records to the graph they raise.
 */
export const DECISION_FILE_SCHEMA = 'civic.decisions/0'

export interface DecisionFile {
  schema: typeof DECISION_FILE_SCHEMA
  note?: string
  decisions: Decision[]
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
  const base = `decision:${decision.conflictId.replace(/^conflict:/, '')}`
  const taken = new Set(file.decisions.map((candidate) => candidate.id))
  let id = base
  for (let n = 2; taken.has(id); n += 1) id = `${base}.${n}`
  const recorded: Decision = { id, kind: 'decision', ...decision, ...(inForce ? { supersedes: inForce.id } : {}) }
  return { file: { ...file, decisions: [...file.decisions, recorded] }, decision: recorded }
}
