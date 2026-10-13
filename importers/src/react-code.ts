import type { ComponentInstance, Evidence, ExtensionPoint, Link, Owner, PlatformComponent, SourceRef, Target } from '../../graph/src/index.ts'
import { fragment, slug, type Fragment } from './fragment.ts'

// Reads a product's React code for its uses of a code library's components (decision 0011,
// point 7): which library component each screen renders, found by import (package and symbol,
// never by name), the variant it asks for, and the props and slots it sets, each matched to
// a declared extension point. A product's own component that renders a library component is
// a wrapper, the code twin of a product shared component: its uses are read once, and each
// screen that renders it contains it. Static analysis of the source text, with no model
// calls: it says what the code declares, not how it behaves.

/** One library component the product may import, with the extension points its maintainers declared. */
export interface CodeLibraryComponent {
  component: PlatformComponent
  extensionPoints: ExtensionPoint[]
  semanticId: string
}

export interface ReactCodeOptions {
  product: string
  owners: Owner[]
  /** The library components to look for, by their package and symbol. */
  components: CodeLibraryComponent[]
  /** Which file renders which screen or state, as `target:` IDs. Other files may hold wrappers. */
  screens: Record<string, string>
  /**
   * What the design file already gave this product, so the screens are checked and a wrapper
   * that is also a design component, and where it is placed, aren't recorded twice.
   */
  alongside?: Fragment
  source: Omit<SourceRef, 'path' | 'anchor'>
  evidenceId: string
  capturedAt: string
}

interface JsxElement {
  start: number
  props: Map<string, string | number | boolean | undefined>
  inner: string
}

/**
 * Reads the files. Each use of a library component becomes a `code` instance on its screen,
 * or on the wrapper that renders it, with `uses` naming each extension point it sets.
 */
export function readReactProductCode(files: readonly { path: string; text: string }[], options: ReactCodeOptions): Fragment {
  const records: (ComponentInstance | Target | Evidence)[] = []
  const links: Link[] = []
  const engineering = options.owners.filter((owner) => owner.role === 'engineering')
  const known = options.alongside ? new Set(options.alongside.records.filter((record) => record.kind === 'target').map((record) => record.id)) : undefined
  const placed = new Set((options.alongside?.links ?? []).filter((link) => link.relation === 'contains').map((link) => `${link.from} ${link.to}`))
  const unknown = Object.values(options.screens).filter((id) => known && !known.has(id))
  if (unknown.length > 0) throw new Error(`The code screens name ${unknown.join(', ')}, which the graph does not have.`)

  // Wrappers first: a file that isn't a screen and renders a library component.
  const wrappers = new Map<string, { path: string; targetId: string; name: string }>()
  for (const file of files) {
    if (options.screens[file.path] || uses(file.text, options).length === 0) continue
    const name = /export\s+(?:default\s+)?(?:function\s+([A-Z]\w*)|const\s+([A-Z]\w*)\s*=)/.exec(file.text)
    if (!name) throw new Error(`${file.path} renders a library component but exports no component.`)
    const symbol = (name[1] ?? name[2])!
    wrappers.set(symbol, { path: file.path, name: symbol, targetId: `target:${options.product}.component.${slug(symbol.replace(/([a-z0-9])([A-Z])/g, '$1-$2'))}` })
  }

  const read = (file: { path: string; text: string }, targetId: string) => {
    const counts = new Map<string, number>()
    for (const use of uses(file.text, options)) {
      const { component, extensionPoints, semanticId } = use.library
      const base = `instance:${targetId.slice('target:'.length)}.${component.platform}.${slug(component.symbol)}`
      const n = (counts.get(base) ?? 0) + 1
      counts.set(base, n)
      const id = n === 1 ? base : `${base}.${n}`
      const point = (name: string) => extensionPoints.find((candidate) => candidate.name === name)
      const used: NonNullable<ComponentInstance['uses']> = []
      let variant = component.defaultVariant
      for (const [name, value] of use.element.props) {
        const found = point(name)
        if (!found) continue
        if (found.expresses.includes('variant')) {
          const mapped = component.variants.find((mapping) => mapping.expression === value)
          if (typeof value === 'string' && !mapped) throw new Error(`${file.path}: ${component.symbol} ${name}="${value}" maps to no semantic variant.`)
          if (mapped) variant = mapped.semanticVariant
          continue
        }
        used.push({ extensionPointId: found.id, property: found.expresses[0]!, ...(value !== undefined ? { value } : {}) })
      }
      // The library's other components inside it are its parts: each one, and each prop it sets, is a slot.
      for (const [part, partSymbol] of use.parts) {
        for (const element of elements(use.element.inner, part)) {
          const whole = point(partSymbol)
          if (whole) used.push({ extensionPointId: whole.id, property: whole.expresses[0]! })
          for (const [name, value] of element.props) {
            const found = point(`${partSymbol}.${name}`)
            if (found) used.push({ extensionPointId: found.id, property: found.expresses[0]!, ...(value !== undefined ? { value } : {}) })
          }
        }
      }
      const line = file.text.slice(0, use.element.start).split('\n').length
      records.push({
        id,
        kind: 'component-instance',
        title: `${component.symbol} in ${file.path.split('/').at(-1)}`,
        semanticId,
        ...(variant ? { variant } : {}),
        placedOn: targetId,
        product: options.product,
        origin: 'code',
        platform: component.platform,
        library: { file: component.library.package, key: component.symbol, matchedBy: 'key' },
        ...(used.length > 0 ? { uses: used } : {}),
        owners: engineering,
        source: { ...options.source, path: file.path, anchor: `L${line}` },
      })
      links.push({ from: targetId, relation: 'contains', to: id, status: 'declared' })
    }
    // A wrapper this file renders is placed here.
    for (const wrapper of wrappers.values()) {
      if (wrapper.path === file.path || !imports(file.text).some((entry) => entry.local === wrapper.name && entry.from.startsWith('.'))) continue
      if (elements(file.text, wrapper.name).length === 0 || placed.has(`${targetId} ${wrapper.targetId}`)) continue
      links.push({ from: targetId, relation: 'contains', to: wrapper.targetId, status: 'declared', source: { ...options.source, path: file.path } })
    }
  }

  for (const wrapper of wrappers.values()) {
    if (!known?.has(wrapper.targetId)) {
      records.push({ id: wrapper.targetId, kind: 'target', title: `${wrapper.name} (code component)`, scale: 'component', presence: 'expected', owners: engineering, source: { ...options.source, path: wrapper.path } })
    }
    read(files.find((file) => file.path === wrapper.path)!, wrapper.targetId)
  }
  for (const file of files) if (options.screens[file.path]) read(file, options.screens[file.path]!)

  const instances = records.filter((record): record is ComponentInstance => record.kind === 'component-instance')
  records.push({
    id: options.evidenceId,
    kind: 'evidence',
    title: 'Library components the product code renders',
    subjectIds: instances.map((instance) => instance.id),
    tier: 'static-analysis',
    method: 'source-analysis',
    outcome: 'finding',
    finding:
      `${instances.length} use(s) of ${[...new Set(instances.map((instance) => instance.library!.key))].join(', ') || 'no library component'} in ${files.length} file(s), found by import; ` +
      `${wrappers.size} wrapper(s): ${[...wrappers.keys()].join(', ') || 'none'}.`,
    capturedAt: options.capturedAt,
    source: options.source,
  })
  return fragment(records, links)
}

/** Each use of a library component in a file: the element, its library entry, and the library parts imported beside it. */
function uses(text: string, options: Pick<ReactCodeOptions, 'components'>) {
  const imported = imports(text)
  return options.components.flatMap((library) => {
    const entry = imported.find((candidate) => candidate.from === library.component.library.package && candidate.symbol === library.component.symbol)
    if (!entry) return []
    // Other names from the same package, by the local name they're used under and their exported symbol.
    const parts = imported.filter((candidate) => candidate.from === entry.from && candidate !== entry).map((candidate) => [candidate.local, candidate.symbol] as const)
    return elements(text, entry.local).map((element) => ({ library, element, parts }))
  })
}

/** Named imports: `import { Card, CardHeader as Header } from "@fluentui/react-card"`. */
function imports(text: string): { local: string; symbol: string; from: string }[] {
  return [...text.matchAll(/import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)].flatMap((match) =>
    match[1]!
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part && !part.startsWith('type '))
      .map((part) => {
        const [symbol, local] = part.split(/\s+as\s+/)
        return { symbol: symbol!, local: local ?? symbol!, from: match[2]! }
      }),
  )
}

/** Every JSX element with this tag: its props and, unless it closes itself, what is inside it. */
function elements(text: string, tag: string): JsxElement[] {
  const found: JsxElement[] = []
  const open = new RegExp(`<${tag}(?=[\\s/>])`, 'g')
  for (const match of text.matchAll(open)) {
    const { props, end, selfClosing } = openingTag(text, match.index! + tag.length + 1)
    if (selfClosing) {
      found.push({ start: match.index!, props, inner: '' })
      continue
    }
    // Find the matching close, counting nested elements of the same tag.
    let depth = 1
    const tokens = new RegExp(`<${tag}(?=[\\s/>])|</${tag}\\s*>`, 'g')
    tokens.lastIndex = end
    let close = -1
    for (let token = tokens.exec(text); token; token = tokens.exec(text)) {
      if (token[0].startsWith('</')) {
        if (--depth === 0) {
          close = token.index
          break
        }
      } else if (!openingTag(text, token.index + tag.length + 1).selfClosing) depth++
    }
    if (close < 0) throw new Error(`<${tag}> at offset ${match.index} is never closed.`)
    found.push({ start: match.index!, props, inner: text.slice(end, close) })
  }
  return found
}

/** Reads an opening tag's attributes from just after its name to its `>`. */
function openingTag(text: string, from: number): { props: JsxElement['props']; end: number; selfClosing: boolean } {
  const props: JsxElement['props'] = new Map()
  let at = from
  const skip = () => {
    while (/\s/.test(text[at] ?? '')) at++
  }
  for (;;) {
    skip()
    if (text.startsWith('/>', at)) return { props, end: at + 2, selfClosing: true }
    if (text[at] === '>') return { props, end: at + 1, selfClosing: false }
    if (text[at] === '{') {
      at = balanced(text, at) // a spread: its props can't be read statically
      continue
    }
    const name = /^[A-Za-z_][\w.:-]*/.exec(text.slice(at))?.[0]
    if (!name) throw new Error(`Can't read the JSX attribute at offset ${at}.`)
    at += name.length
    skip()
    if (text[at] !== '=') {
      props.set(name, true)
      continue
    }
    at++
    skip()
    if (text[at] === '"' || text[at] === "'") {
      const close = text.indexOf(text[at]!, at + 1)
      props.set(name, text.slice(at + 1, close))
      at = close + 1
    } else if (text[at] === '{') {
      const end = balanced(text, at)
      props.set(name, literal(text.slice(at + 1, end - 1).trim()))
      at = end
    } else throw new Error(`Can't read the value of ${name} at offset ${at}.`)
  }
}

/** The offset just past the brace that matches the one at `at`, skipping strings and nested JSX braces. */
function balanced(text: string, at: number): number {
  let depth = 0
  for (let index = at; index < text.length; index++) {
    const char = text[index]
    if (char === '"' || char === "'" || char === '`') {
      index = text.indexOf(char, index + 1)
      if (index < 0) break
    } else if (char === '{') depth++
    else if (char === '}' && --depth === 0) return index + 1
  }
  throw new Error(`Unbalanced braces after offset ${at}.`)
}

/** A literal expression's value; anything computed is undefined, because only the code at runtime knows it. */
function literal(expression: string): string | number | boolean | undefined {
  if (expression === 'true' || expression === 'false') return expression === 'true'
  if (/^-?\d+(\.\d+)?$/.test(expression)) return Number(expression)
  const quoted = /^(['"`])([^'"`$]*)\1$/.exec(expression)
  return quoted ? quoted[2] : undefined
}
