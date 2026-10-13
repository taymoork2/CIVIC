import type { ContractConflict, Evidence, Owner, Token } from '../../graph/src/index.ts'

/**
 * Reads the CSS custom properties a stylesheet sets for its default theme: the declarations in
 * top-level rules whose selector list includes `:root` and no dark theme. `var()` references
 * to other properties in the same set are resolved, so an alias compares by what it means.
 * The first declaration of a name wins, as the stylesheets put the base value first.
 */
export function readCssTokens(...stylesheets: string[]): Map<string, string> {
  const declared = new Map<string, string>()
  for (const css of stylesheets) {
    for (const [selector, body] of topLevelRules(css.replace(/\/\*[\s\S]*?\*\//g, ''))) {
      const selectors = selector.split(',').map((part) => part.trim())
      if (!selectors.includes(':root') || /dark/.test(selector)) continue
      for (const match of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) if (!declared.has(match[1]!)) declared.set(match[1]!, match[2]!.trim())
    }
  }
  const resolve = (name: string, seen: Set<string>): string => {
    const value = declared.get(name)!
    if (seen.has(name)) return value
    return value.replace(/var\(--([\w-]+)\)/g, (whole, other: string) => (declared.has(other) ? resolve(other, new Set([...seen, name])) : whole))
  }
  return new Map([...declared.keys()].sort().map((name) => [name, resolve(name, new Set())]))
}

function topLevelRules(css: string): [string, string][] {
  const rules: [string, string][] = []
  let at = 0
  while (at < css.length) {
    const open = css.indexOf('{', at)
    if (open < 0) break
    let depth = 1
    let end = open + 1
    for (; depth > 0 && end < css.length; end++) {
      if (css[end] === '{') depth++
      else if (css[end] === '}') depth--
    }
    rules.push([css.slice(at, open).trim(), css.slice(open + 1, end - 1)])
    at = end
  }
  return rules
}

/** Two CSS values are the same when they differ only in spacing, case or a leading zero. */
export function sameCssValue(a: string, b: string): boolean {
  const normal = (value: string) => value.replace(/\s+/g, '').toLowerCase().replace(/(^|[^\d.])0+\.(\d)/g, '$1.$2')
  return normal(a) === normal(b)
}

export interface TokenSide {
  /** Each custom property's resolved value, from readCssTokens. */
  tokens: ReadonlyMap<string, string>
  /** The evidence record that read this side; its ID is cited by each conflict. */
  evidence: Evidence
  /** How a person names this side in a sentence, such as "Laundry's design reference". */
  label: string
}

export interface TokenComparison {
  /** One Token record per name both sides set. */
  tokens: Token[]
  /** One open Contract Conflict per shared name whose values differ. */
  conflicts: ContractConflict[]
  /** Names both sides set to the same value. */
  agreed: string[]
  /** Names only the design sets: roles the code has no token for. Reported, not raised. */
  designOnly: string[]
}

/**
 * Compares a design's tokens with the code's by custom-property name, the string both sides
 * share. A name both set to different values is one open, unclassified Contract Conflict on
 * that token: it may be the design that is out of date or the code that drifted, and only a
 * person can say which. A name the design sets and the code doesn't is a role the code
 * hasn't adopted, which is reported but not raised. Deterministic, with no model calls.
 */
export function compareCssTokens(design: TokenSide, code: TokenSide, options: { owners: Owner[] }): TokenComparison {
  const tokens: Token[] = []
  const conflicts: ContractConflict[] = []
  const agreed: string[] = []
  const designOnly: string[] = []
  for (const [name, value] of design.tokens) {
    const built = code.tokens.get(name)
    if (built === undefined) {
      designOnly.push(name)
      continue
    }
    const id = `token:${name}`
    tokens.push({ id, kind: 'token', title: `--${name}`, path: name, type: typeOf(value), source: { ...code.evidence.source, anchor: `--${name}` } })
    if (sameCssValue(value, built)) {
      agreed.push(name)
      continue
    }
    conflicts.push({
      id: `conflict:token.${name}`,
      kind: 'contract-conflict',
      title: `--${name} differs between design and code`,
      targetId: id,
      platform: 'web',
      summary: `${design.label} sets --${name} to ${value}; ${code.label} sets it to ${built}.`,
      sides: [
        { claim: `${design.label} sets --${name} to ${value}.`, evidenceIds: [design.evidence.id] },
        { claim: `${code.label} sets --${name} to ${built}.`, evidenceIds: [code.evidence.id] },
      ],
      classification: 'unclassified',
      owners: options.owners,
      alignment: 'unreviewed-drift',
    })
  }
  return { tokens, conflicts, agreed, designOnly }
}

function typeOf(value: string): string {
  if (/^(#|rgba?\(|hsla?\(|color-mix\()/i.test(value)) return 'color'
  if (/^-?[\d.]+(px|rem|em|%|vh|vw)$/.test(value)) return 'dimension'
  if (/^[\d.]+m?s$/.test(value)) return 'duration'
  if (/^cubic-bezier\(/.test(value)) return 'cubicBezier'
  return 'other'
}
