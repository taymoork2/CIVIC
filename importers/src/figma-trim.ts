// Trims a full Figma file export (`GET /v1/files/:key`) to what an importer reads: the file's
// identity and the path down to each named component set or frame, with only the node fields
// the importers use. The result keeps Figma's REST shape, so the importers read the trimmed and
// the full export the same way. A full kit is well over 100 MB of artwork a demo never looks at,
// and the kits' CC BY 4.0 licence asks for credit, not a copy of all of it. A component set's
// default variant keeps the outline of its layers (names only, two levels deep), which is what
// a product's copy of the component is compared with (decision 0011).

export interface TrimTarget {
  type: 'COMPONENT_SET' | 'FRAME'
  name: string
}

interface FigmaNode {
  id: string
  name: string
  type: string
  children?: FigmaNode[]
  componentPropertyDefinitions?: Record<string, { type: string; defaultValue?: unknown }>
}

interface FigmaFile {
  name: string
  version: string
  lastModified: string
  schemaVersion: number
  document: FigmaNode
  components?: Record<string, { key: string; name: string; componentSetId?: string; remote?: boolean }>
  componentSets?: Record<string, { key: string; name: string; remote?: boolean }>
}

const bare = (node: FigmaNode): FigmaNode => ({ id: node.id, name: node.name, type: node.type })

/** Layer types that give a component its structure; shapes, text and vectors are its artwork. */
export const STRUCTURAL_LAYERS = ['FRAME', 'GROUP', 'INSTANCE', 'COMPONENT', 'SECTION']

/** How deep a component's layer outline goes: its containers and the components inside them. */
export const OUTLINE_DEPTH = 2

/**
 * The variant a component set shows by default: the one whose `Property=Option` name matches
 * every variant property's default. Undefined when the set declares no defaults.
 */
export function defaultVariantOf<T extends FigmaNode>(set: T): T | undefined {
  const defaults = Object.entries(set.componentPropertyDefinitions ?? {}).filter(([, definition]) => definition.type === 'VARIANT' && typeof definition.defaultValue === 'string')
  if (defaults.length === 0) return undefined
  return (set.children ?? []).find((child) => {
    const options = new Map(child.name.split(',').map((part) => part.split('=').map((side) => side.trim()) as [string, string]))
    return defaults.every(([name, definition]) => options.get(name) === definition.defaultValue)
  }) as T | undefined
}

function outline(node: FigmaNode, depth: number): FigmaNode {
  const children = depth < OUTLINE_DEPTH ? (node.children ?? []).filter((child) => STRUCTURAL_LAYERS.includes(child.type)).map((child) => outline(child, depth + 1)) : []
  return { ...bare(node), ...(children.length > 0 ? { children } : {}) }
}

/** A target's own node, keeping only its component descendants and the frames that hold them; the default variant keeps its outline. */
function keepComponents(node: FigmaNode, keepOutline?: FigmaNode): FigmaNode | undefined {
  if (node.type === 'COMPONENT') return node === keepOutline ? outline(node, 0) : bare(node)
  const variant = node.type === 'COMPONENT_SET' ? defaultVariantOf(node) : keepOutline
  const children = (node.children ?? []).flatMap((child) => keepComponents(child, variant) ?? [])
  if (children.length === 0) return undefined
  return { ...bare(node), ...(node.componentPropertyDefinitions ? { componentPropertyDefinitions: node.componentPropertyDefinitions } : {}), children }
}

/**
 * Keeps the path from the document to every target and nothing else on the way. When a kept
 * component set's instance-swap property defaults to a component, that component's entry in
 * the file's `components` stays too, so the default can still be named.
 */
export function trimFigmaFile(input: unknown, targets: TrimTarget[]): object {
  const file = input as FigmaFile
  if (!file.document || typeof file.version !== 'string') throw new Error('Not a Figma file export: it needs `document` and `version`.')
  const found = new Set<string>()
  const prune = (node: FigmaNode): FigmaNode | undefined => {
    const target = targets.find((candidate) => candidate.type === node.type && candidate.name === node.name)
    if (target) {
      found.add(`${target.type} ${target.name}`)
      return keepComponents(node)
    }
    const children = (node.children ?? []).flatMap((child) => prune(child) ?? [])
    return children.length > 0 ? { ...bare(node), children } : undefined
  }
  const document = prune(file.document)
  const missing = targets.filter((target) => !found.has(`${target.type} ${target.name}`))
  if (!document || missing.length > 0) throw new Error(`${file.name} has no ${missing.map((target) => target.name).join(', ')}.`)

  const swapDefaults = new Set<string>()
  const collect = (node: FigmaNode) => {
    for (const definition of Object.values(node.componentPropertyDefinitions ?? {})) {
      if (definition.type === 'INSTANCE_SWAP' && typeof definition.defaultValue === 'string') swapDefaults.add(definition.defaultValue)
    }
    for (const child of node.children ?? []) collect(child)
  }
  collect(document)
  const components = Object.fromEntries(
    Object.entries(file.components ?? {}).flatMap(([id, component]) => {
      if (swapDefaults.has(id)) return [[id, component]]
      return !component.remote && !component.componentSetId ? [[id, { key: component.key, name: component.name }]] : []
    }),
  )
  const componentSets = Object.fromEntries(Object.entries(file.componentSets ?? {}).flatMap(([id, set]) => (set.remote ? [] : [[id, { key: set.key, name: set.name }]])))
  return {
    name: file.name,
    lastModified: file.lastModified,
    version: file.version,
    schemaVersion: file.schemaVersion,
    document,
    ...(Object.keys(components).length > 0 ? { components } : {}),
    ...(Object.keys(componentSets).length > 0 ? { componentSets } : {}),
  }
}
