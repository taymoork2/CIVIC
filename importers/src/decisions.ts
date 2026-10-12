import { conflictOfRecord, decisionFileRecords, DECISION_FILE_SCHEMA, type Decision, type DecisionFile, type GraphDocument } from '../../graph/src/index.ts'

/** A decided conflict the import no longer raises, after a revision adopted the decision. */
export interface SettledConflict {
  conflictId: string
  decisionId: string
  adoptionIds: string[]
}

/**
 * Adds a project's recorded decision loop records (roadmap step 3: proposals, decisions,
 * adoptions and verifications) to the graph an import raised. The conflicts stay as raised;
 * each Decision says how one was decided, and the gate and queries read it from there.
 *
 * A conflict the import no longer raises is settled when the decision in force on it was
 * adopted: the import itself is CIVIC's re-check that the fix landed. Its records stay in
 * the file as history and are left out of the graph (see `settledConflicts`). A decision on
 * a conflict that vanished without an adoption fails loudly, so a stale decision is never
 * kept and a fix nobody recorded is noticed.
 */
export function applyDecisions(document: GraphDocument, decisions: DecisionFile | Decision[]): GraphDocument {
  const file = asFile(decisions)
  const { settled, stale } = partition(document, file)
  if (stale.length > 0) {
    throw new Error(
      `Decisions for conflicts this import did not raise: ${stale.join(', ')}. If a fix removed them, record the revision that carries it with civic adopt; otherwise remove the stale decision.`,
    )
  }
  const left = new Set(settled.map((item) => item.conflictId))
  const records = decisionFileRecords(file).filter((record) => {
    const conflictId = conflictOfRecord(file, record)
    return !conflictId || !left.has(conflictId)
  })
  return { ...document, records: [...document.records, ...records] }
}

/** The decided conflicts this import no longer raises because an adopted fix removed them. */
export function settledConflicts(document: GraphDocument, decisions: DecisionFile | Decision[]): SettledConflict[] {
  return partition(document, asFile(decisions)).settled
}

function partition(document: GraphDocument, file: DecisionFile): { settled: SettledConflict[]; stale: string[] } {
  const raised = new Set(document.records.filter((record) => record.kind === 'contract-conflict').map((record) => record.id))
  const gone = new Set(decisionFileRecords(file).flatMap((record) => conflictOfRecord(file, record) ?? []).filter((id) => !raised.has(id)))
  const settled: SettledConflict[] = []
  const stale: string[] = []
  for (const conflictId of [...gone].sort()) {
    const on = file.decisions.filter((decision) => decision.conflictId === conflictId)
    const superseded = new Set(on.flatMap((decision) => (decision.supersedes ? [decision.supersedes] : [])))
    const inForce = on.filter((decision) => !superseded.has(decision.id)).at(-1)
    const adoptionIds = inForce ? (file.adoptions ?? []).filter((adoption) => adoption.decisionId === inForce.id).map((adoption) => adoption.id) : []
    if (inForce && inForce.outcome !== 'approve-exception' && adoptionIds.length > 0) settled.push({ conflictId, decisionId: inForce.id, adoptionIds })
    else stale.push(conflictId)
  }
  return { settled, stale }
}

function asFile(decisions: DecisionFile | Decision[]): DecisionFile {
  return Array.isArray(decisions) ? { schema: DECISION_FILE_SCHEMA, decisions } : decisions
}
