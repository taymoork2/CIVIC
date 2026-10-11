import { readFileSync } from 'node:fs'
import type { GraphDocument } from '../src/schema.ts'

export function example(name: 'fluent-button' | 'card-override'): GraphDocument {
  return JSON.parse(readFileSync(new URL(`../examples/${name}.graph.json`, import.meta.url), 'utf8')) as GraphDocument
}

/** A deep copy of an example, changed by `edit`, so each test starts from a valid graph. */
export function edited(name: 'fluent-button' | 'card-override', edit: (document: GraphDocument) => void): GraphDocument {
  const document = example(name)
  edit(document)
  return document
}

export function record<T = Record<string, unknown>>(document: GraphDocument, id: string): T {
  const found = document.records.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`No record ${id}`)
  return found as unknown as T
}
