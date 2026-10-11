import type { AlignmentState, Classification, GraphDocument, Resolution } from '../../graph/src/index.ts'

/** A person's call on a raised conflict: a classification, and optionally its resolution. */
export interface ConflictDecision {
  conflictId: string
  classification: Classification
  alignment?: AlignmentState
  resolution?: Resolution
}

/**
 * Applies recorded decisions to the conflicts an import raised. Until roadmap step 3 makes
 * Decision its own record, a decision lives inline on the conflict. A decision for a
 * conflict the import no longer raises fails loudly, so a stale decision is never kept.
 */
export function applyDecisions(document: GraphDocument, decisions: ConflictDecision[]): GraphDocument {
  const records = document.records.map((record) => {
    if (record.kind !== 'contract-conflict') return record
    const decision = decisions.find((candidate) => candidate.conflictId === record.id)
    if (!decision) return record
    return {
      ...record,
      classification: decision.classification,
      ...(decision.alignment ? { alignment: decision.alignment } : {}),
      ...(decision.resolution ? { status: 'resolved' as const, resolution: decision.resolution } : {}),
    }
  })
  const raised = new Set(records.filter((record) => record.kind === 'contract-conflict').map((record) => record.id))
  const stale = decisions.filter((decision) => !raised.has(decision.conflictId))
  if (stale.length > 0) throw new Error(`Decisions for conflicts this import did not raise: ${stale.map((decision) => decision.conflictId).join(', ')}.`)
  return { ...document, records }
}
