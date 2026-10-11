import { readFileSync } from 'node:fs'
import type { Decision, GraphDocument } from '../src/schema.ts'

export type ExampleName = 'fluent-button' | 'card-override' | 'review-loop'

export function example(name: ExampleName): GraphDocument {
  return JSON.parse(readFileSync(new URL(`../examples/${name}.graph.json`, import.meta.url), 'utf8')) as GraphDocument
}

/** A deep copy of an example, changed by `edit`, so each test starts from a valid graph. */
export function edited(name: ExampleName, edit: (document: GraphDocument) => void): GraphDocument {
  const document = example(name)
  edit(document)
  return document
}

export function record<T = Record<string, unknown>>(document: GraphDocument, id: string): T {
  const found = document.records.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`No record ${id}`)
  return found as unknown as T
}

/**
 * Records a person's decision on a conflict, as `civic decide` would. Defaults to a
 * design-system maintainer updating the design, with the given evidence.
 */
export function decide(document: GraphDocument, conflictId: string, fields: Partial<Decision> & Pick<Decision, 'evidenceIds'>): Decision {
  const decision: Decision = {
    id: `decision:${conflictId.slice('conflict:'.length)}`,
    kind: 'decision',
    title: `Decision on ${conflictId}`,
    conflictId,
    outcome: 'update-design',
    classification: 'outdated-design-source',
    alignment: 'awaiting-adoption',
    decidedBy: { role: 'design', who: 'design-system-maintainers' },
    at: '2026-10-12T00:00:00Z',
    rationale: 'Compose is the source of truth.',
    ...fields,
  }
  document.records.push(decision)
  return decision
}
