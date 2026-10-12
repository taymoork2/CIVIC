import { execFileSync } from 'node:child_process'
import type { GraphDocument } from './schema.ts'

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
}

/**
 * Which of a graph's evidence is stale, with the reason, by evidence ID. A revision git
 * doesn't know is stale too, since nothing shows the code is the same. Compares with the
 * working tree, so an uncommitted edit shows at once. One git call per distinct revision.
 */
export function staleEvidence(document: GraphDocument, rule: FreshnessRule, root: string): Map<string, string> {
  const changedSince = new Map<string, string | undefined>()
  const reasonFor = (revision: string): string | undefined => {
    if (!changedSince.has(revision)) changedSince.set(revision, changes(root, revision, rule.watch))
    return changedSince.get(revision)
  }
  const stale = new Map<string, string>()
  for (const record of document.records) {
    if (record.kind !== 'evidence' || !rule.tools.includes(record.source.tool)) continue
    const reason = reasonFor(record.source.revision)
    if (reason) stale.set(record.id, reason)
  }
  return stale
}

function changes(root: string, revision: string, watch: string[]): string | undefined {
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  try {
    git('rev-parse', '--verify', '--quiet', `${revision}^{commit}`)
  } catch {
    return `revision ${revision.slice(0, 12)} isn't in this repository, so nothing shows the code is unchanged`
  }
  const files = git('diff', '--name-only', revision, '--', ...watch).split('\n').filter(Boolean)
  if (files.length === 0) return undefined
  return `${files.length} file${files.length === 1 ? '' : 's'} under ${watch.join(', ')} changed since ${revision.slice(0, 12)}`
}
