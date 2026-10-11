import type { Evidence, GraphDocument, GraphRecord, Link, RecordKind } from './schema.ts'

/** A read-only index over a validated graph document. */
export interface Graph {
  document: GraphDocument
  get(id: string): GraphRecord | undefined
  ofKind<K extends RecordKind>(kind: K): Extract<GraphRecord, { kind: K }>[]
  linksFrom(id: string): Link[]
  linksTo(id: string): Link[]
}

export function indexGraph(document: GraphDocument): Graph {
  const byId = new Map(document.records.map((record) => [record.id, record]))
  return {
    document,
    get: (id) => byId.get(id),
    ofKind: <K extends RecordKind>(kind: K) =>
      document.records.filter((record): record is Extract<GraphRecord, { kind: K }> => record.kind === kind),
    linksFrom: (id) => document.links.filter((link) => link.from === id),
    linksTo: (id) => document.links.filter((link) => link.to === id),
  }
}

/**
 * Readiness is computed only from declared and observed links (onboarding plan, section 3).
 * Inferred and proposed links are suggestions until a person confirms them.
 */
export function countsForReadiness(link: Link): boolean {
  return link.status === 'declared' || link.status === 'observed'
}

/**
 * Evidence proves one revision. When its source has moved on, it is stale and reads as
 * Unknown / evidence stale; it is never relabelled current.
 */
export function isStale(evidence: Evidence, currentRevision: string): boolean {
  return evidence.source.revision !== currentRevision
}
