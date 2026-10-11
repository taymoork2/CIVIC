// Static readers for platform source. Each one pulls a narrow, named fact out of a file
// (an enum's cases, a function's parameters, a prop's union, the tokens a style arm reads)
// and throws when the shape it expects is not there, so a library change shows up as a
// failed import rather than a silent wrong answer. This is static analysis: it says what
// the source declares, never how it behaves.

export interface EnumCase {
  name: string
  deprecated: boolean
}

/** The text between the brace that opens after `from` and its matching close. */
export function braceBody(text: string, from: number, open = '{', close = '}'): string {
  const start = text.indexOf(open, from)
  if (start < 0) throw new Error(`No ${open} after offset ${from}.`)
  let depth = 0
  for (let index = start; index < text.length; index++) {
    if (text[index] === open) depth++
    else if (text[index] === close && --depth === 0) return text.slice(start + 1, index)
  }
  throw new Error(`Unbalanced ${open}${close} after offset ${from}.`)
}

function find(text: string, pattern: RegExp, what: string): RegExpExecArray {
  const match = pattern.exec(text)
  if (!match) throw new Error(`Could not find ${what}.`)
  return match
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ---------------------------------------------------------------------------
// Swift

/** Cases of a Swift enum, with `@available(*, deprecated...)` cases marked. */
export function swiftEnumCases(source: string, enumName: string): EnumCase[] {
  const match = find(source, new RegExp(`\\benum\\s+${escape(enumName)}\\b[^{]*`), `Swift enum ${enumName}`)
  const body = braceBody(source, match.index)
  const cases: EnumCase[] = []
  let deprecated = false
  for (const line of body.split('\n')) {
    const trimmed = line.trim()
    if (/^@available\(.*\bdeprecated\b/.test(trimmed)) deprecated = true
    const declared = /^case\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*$/.exec(trimmed)
    if (declared) {
      for (const name of declared[1]!.split(',')) cases.push({ name: name.trim(), deprecated })
      deprecated = false
    } else if (trimmed.startsWith('public ') || trimmed.startsWith('var ') || trimmed.startsWith('func ')) {
      deprecated = false
    }
  }
  if (cases.length === 0) throw new Error(`Swift enum ${enumName} has no cases.`)
  return cases
}

/** The default of a Swift stored property, such as `open var style: ButtonStyle = .accent` gives `accent`. */
export function swiftPropertyDefault(source: string, property: string): string {
  return find(source, new RegExp(`\\bvar\\s+${escape(property)}\\s*:\\s*\\w+\\s*=\\s*\\.(\\w+)`), `a default for Swift property ${property}`)[1]!
}

/** Names of public or open members a caller can set: `public var`, `open var`, `public func`. */
export function swiftPublicMembers(source: string): string[] {
  const names = [...source.matchAll(/\b(?:public|open)\s+(?:lazy\s+)?(?:var|func)\s+([A-Za-z_]\w*)/g)].map((match) => match[1]!)
  return [...new Set(names)].sort()
}

// ---------------------------------------------------------------------------
// Kotlin

/** Entries of a Kotlin `enum class`. */
export function kotlinEnumCases(source: string, enumName: string): EnumCase[] {
  const match = find(source, new RegExp(`\\benum\\s+class\\s+${escape(enumName)}\\b[^{]*`), `Kotlin enum class ${enumName}`)
  const body = braceBody(source, match.index).split(';')[0]!
  const cases: EnumCase[] = []
  let deprecated = false
  for (const raw of body.split(',')) {
    const entry = raw.replace(/\/\/.*$/gm, '').trim()
    if (entry.includes('@Deprecated')) deprecated = true
    const name = /([A-Za-z_]\w*)\s*(?:\(.*\))?\s*$/s.exec(entry.replace(/@Deprecated\([^)]*\)/g, ''))?.[1]
    if (name) cases.push({ name, deprecated })
    deprecated = false
  }
  if (cases.length === 0) throw new Error(`Kotlin enum class ${enumName} has no entries.`)
  return cases
}

export interface Parameter {
  name: string
  type: string
  default?: string
}

/** Parameters of a top-level Kotlin `fun` (the first one with that name), with defaults. */
export function kotlinFunctionParameters(source: string, functionName: string): Parameter[] {
  const match = find(source, new RegExp(`\\bfun\\s+${escape(functionName)}\\s*\\(`), `Kotlin fun ${functionName}`)
  const list = braceBody(source, match.index, '(', ')')
  const parameters: Parameter[] = []
  let depth = 0
  let current = ''
  for (const char of `${list},`) {
    if ('({<['.includes(char)) depth++
    // `->` in a function type is an arrow, not a closing angle bracket.
    if (')}]'.includes(char) || (char === '>' && !current.endsWith('-'))) depth--
    if (char === ',' && depth === 0) {
      const parsed = /^\s*([A-Za-z_]\w*)\s*:\s*([^=]+?)\s*(?:=\s*([\s\S]+?))?\s*$/.exec(current)
      if (parsed) parameters.push({ name: parsed[1]!, type: parsed[2]!, ...(parsed[3] ? { default: parsed[3] } : {}) })
      current = ''
    } else current += char
  }
  return parameters
}

// ---------------------------------------------------------------------------
// Style arms: which tokens each variant reads in one token function.

export interface StyleArm {
  cases: string[]
  tokens: string[]
}

/**
 * The arms of a Kotlin `when (buttonInfo.style)` inside `fun <functionName>(`, and the alias
 * tokens each arm reads (`...Tokens.<Name>]`). An arm with no token reads nothing, such as
 * an empty `StateBrush()`.
 */
export function kotlinStyleArms(source: string, functionName: string, enumName: string): StyleArm[] {
  const match = find(source, new RegExp(`\\bfun\\s+${escape(functionName)}\\s*\\(`), `Kotlin fun ${functionName}`)
  const open = match.index + match[0].length - 1
  const body = braceBody(source, open + braceBody(source, open, '(', ')').length + 2)
  const armStart = new RegExp(`^\\s*((?:${escape(enumName)}\\.\\w+\\s*,?\\s*)+)->`, 'gm')
  return arms(body, armStart, (header) => [...header.matchAll(new RegExp(`${escape(enumName)}\\.(\\w+)`, 'g'))].map((m) => m[1]!), /Tokens\.(\w+)\]/g)
}

/**
 * The arms of the `switch style()` under `case .<tokenCase>:` in a Swift token set, and the
 * theme colours each arm reads (`theme.color(.<name>)`). `.clear` reads no token.
 */
export function swiftStyleArms(source: string, tokenCase: string): StyleArm[] {
  const match = find(source, new RegExp(`^(\\s*)case \\.${escape(tokenCase)}:\\s*$`, 'm'), `Swift token case .${tokenCase}`)
  const indent = match[1]!.replace('\n', '')
  const rest = source.slice(match.index + match[0].length)
  const end = new RegExp(`^${indent}(?:case \\.|default:|\\})`, 'm').exec(rest)
  const body = end ? rest.slice(0, end.index) : rest
  const armStart = /^\s*case\s+((?:\.\w+\s*,?\s*)+):/gm
  return arms(body, armStart, (header) => [...header.matchAll(/\.(\w+)/g)].map((m) => m[1]!), /theme\.color\(\.(\w+)\)/g)
}

function arms(body: string, armStart: RegExp, casesOf: (header: string) => string[], tokenPattern: RegExp): StyleArm[] {
  const starts = [...body.matchAll(armStart)]
  if (starts.length === 0) throw new Error('No style arms found.')
  return starts.map((start, index) => {
    const text = body.slice(start.index! + start[0].length, starts[index + 1]?.index ?? body.length)
    const tokens = [...new Set([...text.matchAll(tokenPattern)].map((m) => m[1]!))]
    return { cases: casesOf(start[1]!), tokens }
  })
}

// ---------------------------------------------------------------------------
// TypeScript declarations and compiled JavaScript

/** The body of `export declare type <name> = ...;`, up to the next top-level declaration. */
function declaredType(dts: string, typeName: string): string {
  const match = find(dts, new RegExp(`export declare type ${escape(typeName)}\\b[^=]*=`), `declared type ${typeName}`)
  const rest = dts.slice(match.index + match[0].length)
  const end = /\n(?:export |declare )/.exec(rest)
  return end ? rest.slice(0, end.index) : rest
}

/** The string-literal union of one prop: `appearance?: 'a' | 'b'` gives `['a', 'b']`. */
export function tsPropUnion(dts: string, typeName: string, prop: string): string[] {
  const body = declaredType(dts, typeName)
  const union = find(body, new RegExp(`\\b${escape(prop)}\\??\\s*:\\s*((?:'[^']*'\\s*\\|?\\s*)+);`), `a string union for ${typeName}.${prop}`)[1]!
  return [...union.matchAll(/'([^']*)'/g)].map((m) => m[1]!)
}

/** Prop or slot names declared directly in a type: `name?:` or `name:` at the type's top level. */
export function tsTypeKeys(dts: string, typeName: string): string[] {
  const body = declaredType(dts, typeName).replace(/\/\*[\s\S]*?\*\//g, '')
  return [...new Set([...body.matchAll(/^\s{4}([A-Za-z_]\w*)\??\s*:/gm)].map((m) => m[1]!))].sort()
}

/** A destructured default in compiled JS: `const { appearance = 'secondary' } = props`. */
export function jsDestructuredDefault(js: string, prop: string): string {
  return find(js, new RegExp(`\\b${escape(prop)}\\s*=\\s*'([^']*)'`), `a default for ${prop}`)[1]!
}

/** Every Fluent token a style file reads: `tokens.<name>`. Sorted and unique. */
export function jsTokenReferences(js: string): string[] {
  return [...new Set([...js.matchAll(/\btokens\.([A-Za-z]\w*)/g)].map((m) => m[1]!))].sort()
}
