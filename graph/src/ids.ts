import type { RecordKind } from './schema.ts'

/**
 * Every ID is `<prefix>:<path>`, where the prefix names the record kind and the path is
 * dot-separated segments. IDs are shared strings: when a token path, component name or
 * test annotation is the same on both sides, the two link without a guess.
 */
export const ID_PREFIX: Record<RecordKind, string> = {
  intent: 'intent',
  target: 'target',
  token: 'token',
  'semantic-component': 'semantic',
  'platform-component': 'platform',
  'extension-point': 'extension',
  'component-instance': 'instance',
  override: 'override',
  evidence: 'evidence',
  'contract-conflict': 'conflict',
}

const ID_PATTERN = /^([a-z]+):([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)$/

export function parseId(id: string): { prefix: string; path: string } | undefined {
  const match = ID_PATTERN.exec(id)
  return match ? { prefix: match[1]!, path: match[2]! } : undefined
}

export function idMatchesKind(id: string, kind: RecordKind): boolean {
  return parseId(id)?.prefix === ID_PREFIX[kind]
}

/** True when `property` is `pattern` or sits under it: `header` covers `header.badge`. */
export function propertyCovers(pattern: string, property: string): boolean {
  return property === pattern || property.startsWith(`${pattern}.`)
}
