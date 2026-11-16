import type { Evidence, GraphDocument } from './schema.ts'

// Evidence proves the code at one revision (roadmap step 6). When that code changes, the
// evidence is stale: it still says what it saw, but no longer about what the code is now.
// A project names, per graph, which evidence proves code in this repository and where that
// code lives; git then says whether anything there changed since each capture.

/** One graph's freshness rule, from civic.check.json. */
export interface FreshnessRule {
  /** The graph file, as civic.check.json lists it. */
  graph: string
  /** Evidence from these tools (`source.tool`) proves code in this repository. */
  tools: string[]
  /** Paths, relative to the repository root, that the evidence proves. */
  watch: string[]
  /**
   * The code is in another repository (decision 0010): `env` names an environment variable holding the path to a
   * checkout of `repository`, and `watch` is relative to that checkout. Without the variable set, nothing compares
   * the evidence with the code, so none of it is called stale; the gate says how old it is instead.
   */
  checkout?: { repository: string; env: string }
}

/** Where a rule's code is: this repository, a checkout named by the rule's variable, or nowhere to compare with. */
export function freshnessRoot(rule: FreshnessRule, root: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  return rule.checkout ? env[rule.checkout.env] || undefined : root
}

/** The newest capture of a rule's evidence in a graph, and the revision it names, for a gate that can't compare it. */
export function evidenceAge(document: GraphDocument, rule: FreshnessRule): { capturedAt: string; revision: string; count: number } | undefined {
  const evidence = document.records.filter((record): record is Evidence => record.kind === 'evidence' && rule.tools.includes(record.source.tool))
  const newest = [...evidence].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0]
  return newest ? { capturedAt: newest.capturedAt, revision: newest.source.revision, count: evidence.length } : undefined
}

// Preserve existing callers while review owns git execution.
export { staleEvidence } from '../../review/src/freshness.ts'
