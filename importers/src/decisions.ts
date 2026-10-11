import type { Decision, DecisionFile, GraphDocument } from '../../graph/src/index.ts'

/**
 * Adds a project's recorded Decision records (roadmap step 3) to the graph an import
 * raised. The conflicts stay as raised; each Decision says how one was decided, and the
 * gate and queries read it from there. A decision for a conflict the import no longer
 * raises fails loudly, so a stale decision is never kept.
 */
export function applyDecisions(document: GraphDocument, decisions: DecisionFile | Decision[]): GraphDocument {
  const list = Array.isArray(decisions) ? decisions : decisions.decisions
  const raised = new Set(document.records.filter((record) => record.kind === 'contract-conflict').map((record) => record.id))
  const stale = list.filter((decision) => !raised.has(decision.conflictId))
  if (stale.length > 0) throw new Error(`Decisions for conflicts this import did not raise: ${stale.map((decision) => decision.conflictId).join(', ')}.`)
  return { ...document, records: [...document.records, ...list] }
}
