import type { ContractConflict, Evidence, Owner, Token } from '../../graph/src/index.ts'

/**
 * Reads the CSS custom properties a stylesheet sets for one theme. The default theme is the
 * declarations in top-level rules whose selector list includes `:root` and no dark theme;
 * the first declaration of a name wins, as the stylesheets put the base value first. The
 * dark theme is the default with the dark rules laid over it: rules whose selector names
 * `data-theme` dark, and `:root` rules inside `@media (prefers-color-scheme: dark)`. Palettes
 * and other media are ignored. `var()` references to other properties in the same set are
 * resolved, so an alias compares by what it means.
 */
export function readCssTokens(stylesheets: string | readonly string[], theme: 'default' | 'dark' = 'default'): Map<string, string> {
  const declared = new Map<string, string>()
  const dark = new Map<string, string>()
  const declarations = (body: string) => [...body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1]!, match[2]!.trim()] as const)
  for (const css of typeof stylesheets === 'string' ? [stylesheets] : stylesheets) {
    for (const [selector, body] of topLevelRules(css.replace(/\/\*[\s\S]*?\*\//g, ''))) {
      if (/^@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)/.test(selector)) {
        for (const [inner, innerBody] of topLevelRules(body)) if (/:root/.test(inner) && !/palette/.test(inner)) for (const [name, value] of declarations(innerBody)) dark.set(name, value)
        continue
      }
      if (/data-theme=["']?dark/.test(selector)) {
        for (const [name, value] of declarations(body)) dark.set(name, value)
        continue
      }
      if (!selector.split(',').map((part) => part.trim()).includes(':root')) continue
      for (const [name, value] of declarations(body)) if (!declared.has(name)) declared.set(name, value)
    }
  }
  if (theme === 'dark') for (const [name, value] of dark) declared.set(name, value)
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
  /** Design names compared under another code name, from `map`, as [design, code]. */
  mapped: [string, string][]
}

/**
 * Compares a design's tokens with the code's by custom-property name, the string both sides
 * share. A name both set to different values is one open, unclassified Contract Conflict on
 * that token: it may be the design that is out of date or the code that drifted, and only a
 * person can say which. A name the design sets and the code doesn't is a role the code
 * hasn't adopted, which is reported but not raised. Each theme is compared on its own; a dark
 * theme conflict's ID ends in `.dark`. `names` limits the comparison, such as to the names a
 * dark theme sets itself. Deterministic, with no model calls.
 */
export function compareCssTokens(design: TokenSide, code: TokenSide, options: { owners: Owner[]; theme?: 'default' | 'dark'; names?: ReadonlySet<string> }): TokenComparison {
  const dark = options.theme === 'dark'
  const where = dark ? ' in the dark theme' : ''
  const tokens: Token[] = []
  const conflicts: ContractConflict[] = []
  const agreed: string[] = []
  const designOnly: string[] = []
  const mapped: [string, string][] = []
  for (const [name, value] of design.tokens) {
    if (options.names && !options.names.has(name)) continue
    const as = options.map?.get(name) ?? name
    if (as !== name) mapped.push([name, as])
    const built = code.tokens.get(as)
    if (built === undefined && as === name) {
      designOnly.push(name)
      continue
    }
    const id = `token:${name}`
    tokens.push({ id, kind: 'token', title: as === name ? `--${name}` : `--${name} as --${as}`, path: name, type: typeOf(value), source: { ...code.evidence.source, anchor: `--${as}` } })
    if (built !== undefined && sameCssValue(value, built)) {
      agreed.push(name)
      continue
    }
    const codeClaim = built === undefined ? `${code.label} doesn't set --${as} yet${where}` : as === name ? `${code.label} sets it to ${built}` : `${code.label} sets --${as} to ${built}`
    conflicts.push({
      id: `conflict:token.${name}${dark ? '.dark' : ''}`,
      kind: 'contract-conflict',
      title: as === name ? `--${name} differs between design and code${where}` : `--${name} differs from the code's --${as}${where}`,
      targetId: id,
      platform: 'web',
      summary: `${design.label} sets --${name} to ${value}${where}; ${codeClaim}.`,
      sides: [
        { claim: `${design.label} sets --${name} to ${value}${where}.`, evidenceIds: [design.evidence.id] },
        { claim: built === undefined ? `${codeClaim}.` : `${code.label} sets --${as} to ${built}${where}.`, evidenceIds: [code.evidence.id] },
      ],
      classification: 'unclassified',
      owners: options.owners,
      alignment: 'unreviewed-drift',
    })
  }
  return { tokens, conflicts, agreed, designOnly, mapped }
}

function typeOf(value: string): string {
  if (/^(#|rgba?\(|hsla?\(|color-mix\()/i.test(value)) return 'color'
  if (/^-?[\d.]+(px|rem|em|%|vh|vw)$/.test(value)) return 'dimension'
  if (/^[\d.]+m?s$/.test(value)) return 'duration'
  if (/^cubic-bezier\(/.test(value)) return 'cubicBezier'
  return 'other'
}
