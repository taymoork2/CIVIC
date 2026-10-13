import type { SourceRef, Token } from '../../graph/src/index.ts'

interface DtcgToken {
  $value: unknown
  $type?: string
  $description?: string
}

/**
 * Reads a DTCG tokens file. Group names join with dots to form the token path, and `$type`
 * is inherited from the nearest group that sets it (DTCG format, Design Tokens Community
 * Group). Returns every token by path; callers pick the ones a component uses.
 */
export function readDtcgTokens(document: unknown, source: SourceRef): Map<string, Token> {
  const tokens = new Map<string, Token>()
  const walk = (node: Record<string, unknown>, path: string[], inheritedType?: string) => {
    const type = typeof node.$type === 'string' ? node.$type : inheritedType
    if ('$value' in node) {
      const token = node as unknown as DtcgToken
      if (!type) throw new Error(`DTCG token ${path.join('.')} has no $type.`)
      const name = path.join('.')
      tokens.set(name, { id: `token:${name}`, kind: 'token', title: token.$description ?? name, path: name, type, source: { ...source, anchor: name } })
      return
    }
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith('$') || typeof child !== 'object' || child === null) continue
      walk(child as Record<string, unknown>, [...path, key], type)
    }
  }
  if (typeof document !== 'object' || document === null) throw new Error('A DTCG file is a JSON object.')
  walk(document as Record<string, unknown>, [])
  return tokens
}

/** A DTCG token's type and value, by path, for comparing two token sets (decision 0012). */
export interface DtcgValue {
  type: string
  value: unknown
}

/** Reads every token's resolved `$type` and `$value` by path, the way `readDtcgTokens` names them. */
export function readDtcgValues(document: unknown): Map<string, DtcgValue> {
  const values = new Map<string, DtcgValue>()
  const walk = (node: Record<string, unknown>, path: string[], inheritedType?: string) => {
    const type = typeof node.$type === 'string' ? node.$type : inheritedType
    if ('$value' in node) {
      if (!type) throw new Error(`DTCG token ${path.join('.')} has no $type.`)
      values.set(path.join('.'), { type, value: node.$value })
      return
    }
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith('$') || typeof child !== 'object' || child === null) continue
      walk(child as Record<string, unknown>, [...path, key], type)
    }
  }
  if (typeof document !== 'object' || document === null) throw new Error('A DTCG file is a JSON object.')
  walk(document as Record<string, unknown>, [])
  return values
}

/** One token a release changes: its value moved, or only one of the two sets has it. */
export interface TokenChange {
  path: string
  type: string
  status: 'changed' | 'added' | 'removed'
  before?: unknown
  after?: unknown
}

/**
 * Compares two DTCG token sets by path (decision 0012, point 1). A token whose value or type
 * differs is changed; one only the new set has is added, and one it drops is removed.
 * Values compare as JSON, so a composite value such as a shadow compares whole.
 */
export function compareTokenSets(before: unknown, after: unknown): TokenChange[] {
  const old = readDtcgValues(before)
  const next = readDtcgValues(after)
  const changes: TokenChange[] = []
  for (const [path, was] of old) {
    const now = next.get(path)
    if (!now) changes.push({ path, type: was.type, status: 'removed', before: was.value })
    else if (now.type !== was.type || JSON.stringify(now.value) !== JSON.stringify(was.value)) changes.push({ path, type: now.type, status: 'changed', before: was.value, after: now.value })
  }
  for (const [path, now] of next) if (!old.has(path)) changes.push({ path, type: now.type, status: 'added', after: now.value })
  return changes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}
