import { fileURLToPath } from 'node:url'
import { relative } from 'node:path'

const VIRTUAL = 'virtual:civic-server-functions'
const PROVIDED = new Set(['createServerFn', 'createMiddleware', 'useServerFn'])
const START_IMPORT = /\bimport\s*\{([^}]*)\}\s*from\s*(['"])@tanstack\/(?:react-|solid-)?start\2[ \t]*;?/g
const coreModule = fileURLToPath(new URL('../src/server-functions-core.mjs', import.meta.url))
const clientModule = fileURLToPath(new URL('../src/server-functions.ts', import.meta.url))

/** Index of the parenthesis closing the one at `open`, past strings, templates and comments; -1 if unsure. */
export function closingParen(code, open) {
  let depth = 0
  const substitutions = []
  // From inside a template literal, to its closing backtick or into its next `${`.
  const template = (index) => {
    for (; index < code.length && code[index] !== '`'; index++) {
      if (code[index] === '\\') index++
      else if (code[index] === '$' && code[index + 1] === '{') { substitutions.push(depth); return index + 1 }
    }
    return index
  }
  // An unterminated comment, string or template ends the scan unmatched.
  const end = (index) => index < 0 ? code.length : index
  for (let index = open; index < code.length; index++) {
    const char = code[index]
    if (char === '/' && code[index + 1] === '/') index = end(code.indexOf('\n', index))
    else if (char === '/' && code[index + 1] === '*') index = end(code.indexOf('*/', index + 2)) + 1
    else if (char === '`') index = template(index + 1)
    else if (char === '"' || char === "'") {
      for (index++; index < code.length && code[index] !== char; index++) {
        if (code[index] === '\\') index++
        else if (code[index] === '\n') return -1
      }
    } else if (char === '}' && substitutions.at(-1) === depth) { substitutions.pop(); index = template(index + 1) }
    else if ('([{'.includes(char)) depth++
    else if (')]}'.includes(char) && --depth === 0) return char === ')' ? index : -1
  }
  return -1
}

/** Empties the arguments of each `.name(...)` call, so server-only code never reaches the page. */
function stripCalls(code, names) {
  let output = '', last = 0, stripped = false
  for (const match of code.matchAll(new RegExp(`\\.(?:${names.join('|')})\\s*\\(`, 'g'))) {
    if (match.index < last) continue
    const open = match.index + match[0].length - 1, close = closingParen(code, open)
    if (close < 0) continue
    output += code.slice(last, open + 1); last = close; stripped = true
  }
  return { code: output + code.slice(last), stripped }
}

/** Drops import bindings the stripped module no longer uses, as TanStack Start's compiler does for the client. */
function dropUnusedImports(code) {
  const statements = [...code.matchAll(/^import\s+(?!type\b)([\w$*{][^;'"]*?)\s+from\s*(['"])([^'"\n]+)\2[ \t]*;?/gm)]
  let rest = code
  for (const statement of statements) rest = rest.replace(statement[0], '')
  // A name mentioned only in a comment is unused.
  rest = rest.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1')
  const used = (name) => new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])`).test(rest)
  let output = code
  for (const [text, clause, quote, source] of statements) {
    const named = clause.match(/\{([^}]*)\}/)
    const head = clause.replace(/,?\s*\{[^}]*\}/, '').trim().replace(/,$/, '').trim()
    const parts = head ? head.split(',').map((part) => part.trim()) : []
    const keptHead = parts.filter((part) => used(part.startsWith('* as ') ? part.slice(5).trim() : part))
    const specifiers = named ? named[1].split(',').map((part) => part.trim()).filter(Boolean) : []
    // Type-only specifiers go too: the module may be server-only, and types never reach the page anyway.
    const keptNamed = specifiers.filter((part) => !/^type\s/.test(part) && used(part.split(/\s+as\s+/).pop()))
    if (keptHead.length === parts.length && keptNamed.length === specifiers.length) continue
    const kept = [...keptHead, ...(keptNamed.length ? [`{ ${keptNamed.join(', ')} }`] : [])]
    output = output.replace(text, kept.length ? `import ${kept.join(', ')} from ${quote}${source}${quote};` : '')
  }
  return output
}

/**
 * Rewrites one module's `@tanstack/react-start` (or solid-start) import so its server functions run
 * through CIVIC: in the preview as calls to the live run, in the run's worker as registered handlers.
 * `file` is the module's path from the app root and becomes part of each function's key.
 */
export function transformServerFunctions(code, file, side) {
  if (!code.includes('@tanstack/')) return null
  const factories = []
  let rewritten = code.replace(START_IMPORT, (statement, clause, quote) => {
    const kept = [], bound = []
    for (const specifier of clause.split(',').map((part) => part.trim()).filter(Boolean)) {
      const [imported, local = imported] = specifier.split(/\s+as\s+/)
      if (PROVIDED.has(imported)) bound.push(`const ${local} = __civicStart.${imported};`)
      else kept.push(specifier)
      if (imported === 'createServerFn') factories.push(local)
    }
    if (!bound.length) return statement
    return [kept.length ? `import { ${kept.join(', ')} } from ${quote}${statement.match(/@tanstack\/[\w-]+/)[0]}${quote};` : '', ...bound].filter(Boolean).join(' ')
  })
  if (rewritten === code) return null
  rewritten = `import { serverFunctions as __civicServerFunctions } from ${JSON.stringify(VIRTUAL)}; const __civicStart = __civicServerFunctions(${JSON.stringify(file)}); ` + rewritten
  for (const local of factories) rewritten = rewritten.replace(new RegExp(`(?<![\\w$.])([A-Za-z_$][\\w$]*)(\\s*=\\s*)${local.replace(/\$/g, '\\$')}\\s*\\(`, 'g'), (_, name, equals) => `${name}${equals}${local}.as(${JSON.stringify(name)}, `)
  if (side === 'client') {
    const stripped = stripCalls(rewritten, ['handler', 'server'])
    if (stripped.stripped) rewritten = dropUnusedImports(stripped.code)
  }
  return rewritten
}

/**
 * The Vite plugin for one side: `client` for the canvas serving the preview, `server` for a run's worker.
 * `appRoot()` is the app's root (null before one is chosen); only its own modules are transformed, never its dependencies.
 */
export function serverFunctionsPlugin({ appRoot, side }) {
  return {
    name: `civic-server-functions-${side}`,
    enforce: 'pre',
    resolveId: (id) => id === VIRTUAL ? '\0' + VIRTUAL : undefined,
    load(id) {
      if (id !== '\0' + VIRTUAL) return
      return side === 'client'
        ? `export { serverFunctions } from ${JSON.stringify('/@fs' + clientModule)}`
        : `import { createServerFunctions } from ${JSON.stringify(coreModule)}; export const serverFunctions = (file) => createServerFunctions(file)`
    },
    transform(code, id) {
      const path = id.split('?')[0], root = appRoot()
      if (!root || id.startsWith('\0') || !/\.[cm]?[jt]sx?$/.test(path) || !path.startsWith(root + '/') || path.includes('/node_modules/')) return
      const output = transformServerFunctions(code, relative(root, path), side)
      return output === null ? undefined : { code: output, map: null }
    },
  }
}
