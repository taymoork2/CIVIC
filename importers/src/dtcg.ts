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
