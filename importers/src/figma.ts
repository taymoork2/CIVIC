import type { Evidence, Owner, Platform, SourceRef } from '../../graph/src/index.ts'

/** Which component set in a Figma file is the kit's version of a semantic component. */
export interface DesignKitMapping {
  id: string
  title: string
  platform: Platform
  componentSet: string
  variantProperty: string
  /**
   * For kits made before Figma variants (2020), which draw each option as its own component
   * named `<Option> / <State>` inside a frame rather than as one component set: the frame's
   * name. The first name segment is the variant option, with any `01. ` ordering prefix removed.
   */
  componentFrame?: string
  owners?: Owner[]
  /** Figma variant option to semantic variant key. */
  variants: Record<string, string>
}

export interface DesignKitFacts {
  kit: DesignKitMapping
  /** Semantic variants the kit draws. */
  semanticVariants: string[]
  /** Variant options with no semantic variant declared for them. */
  unmappedOptions: string[]
  evidence: Evidence
}

interface FigmaNode {
  id: string
  name: string
  type: string
  children?: FigmaNode[]
  componentPropertyDefinitions?: Record<string, { type: string; variantOptions?: string[]; defaultValue?: unknown }>
}

/**
 * Reads one component set from a Figma file export, the JSON that Figma's REST API returns
 * for `GET /v1/files/:key` (D27). It needs no Enterprise access: variants come from the
 * component set's property definitions and its component children, not from Variables.
 * A kit drawn before variants existed is read from its components' names instead
 * (`componentFrame`).
 */
export function readFigmaComponentSet(file: unknown, kit: DesignKitMapping, semanticId: string, capturedAt: string): DesignKitFacts {
  const root = file as { name?: string; version?: string; document?: FigmaNode }
  if (!root.document || typeof root.version !== 'string') throw new Error('Not a Figma file export: it needs `document` and `version`.')
  const { options, otherProperties, path, anchor } = kit.componentFrame ? readComponentFrame(root, kit, kit.componentFrame) : readComponentSet(root, kit)
  const missing = Object.keys(kit.variants).filter((option) => !options.includes(option))
  if (missing.length > 0) throw new Error(`${kit.title}: the mapping names ${missing.join(', ')}, which ${kit.componentFrame ?? kit.componentSet} does not draw.`)

  const source: SourceRef = { tool: 'figma', importer: 'figma-file', revision: root.version, path: [root.name, ...path].join(' / '), anchor }
  const evidence: Evidence = {
    id: `evidence:figma.${kit.id}.${kit.componentSet.toLowerCase()}`,
    kind: 'evidence',
    title: `${kit.title} ${kit.componentSet} variants`,
    subjectIds: [semanticId],
    tier: 'static-analysis',
    method: 'design-export',
    platform: kit.platform,
    outcome: 'finding',
    finding: `${kit.componentSet} draws ${kit.variantProperty}: ${options.join(', ')}${otherProperties.length > 0 ? `; ${otherProperties.join('; ')}` : ''}.`,
    capturedAt,
    source,
  }
  return {
    kit,
    semanticVariants: options.flatMap((option) => (kit.variants[option] ? [kit.variants[option]] : [])),
    unmappedOptions: options.filter((option) => !kit.variants[option]),
    evidence,
  }
}

interface KitDrawing {
  /** Variant options the kit draws, in its own order. */
  options: string[]
  /** Its other variant properties, described as `Name: a, b`. */
  otherProperties: string[]
  path: string[]
  anchor: string
}

function readComponentSet(root: { name?: string; document?: FigmaNode }, kit: DesignKitMapping): KitDrawing {
  const found = find(root.document!, 'COMPONENT_SET', kit.componentSet, [])
  if (!found) throw new Error(`${root.name}: no component set named ${kit.componentSet}.`)
  const { node, path } = found
  const definition = node.componentPropertyDefinitions?.[kit.variantProperty]
  if (definition?.type !== 'VARIANT' || !definition.variantOptions) throw new Error(`${kit.componentSet} has no variant property ${kit.variantProperty}.`)

  const drawn = new Set(
    (node.children ?? [])
      .filter((child) => child.type === 'COMPONENT')
      .flatMap((child) => child.name.split(',').map((part) => part.trim()))
      .filter((part) => part.startsWith(`${kit.variantProperty}=`))
      .map((part) => part.slice(kit.variantProperty.length + 1)),
  )
  const otherProperties = Object.entries(node.componentPropertyDefinitions ?? {})
    .filter(([name, value]) => name !== kit.variantProperty && value.type === 'VARIANT')
    .map(([name, value]) => `${name}: ${(value.variantOptions ?? []).join(', ')}`)
  return { options: definition.variantOptions.filter((option) => drawn.has(option)), otherProperties, path, anchor: node.id }
}

/**
 * Reads a pre-variant kit: components named like `01. Primary / ⚪️ B. Pressed - Light` in a
 * frame. The option is `Primary`; the rest of the name (`Pressed`, `Light`) is reported as
 * what each option is drawn in, since such kits declare no property names for it.
 */
function readComponentFrame(root: { name?: string; document?: FigmaNode }, kit: DesignKitMapping, frame: string): KitDrawing {
  const found = find(root.document!, 'FRAME', frame, [])
  if (!found) throw new Error(`${root.name}: no frame named ${frame}.`)
  const names = components(found.node).map((node) => node.name.split('/').map((segment) => segment.trim()))
  const options = unique(names.map(([first]) => first!.replace(/^\d+\.\s*/, '')))
  if (options.length === 0) throw new Error(`${frame} has no components.`)
  const columns: string[][] = []
  for (const rest of names.map((segments) => segments.slice(1).join(' / '))) {
    const cleaned = rest.replace(/^[^\p{L}\p{N}]+/u, '').replace(/^[A-Z]\.\s+/, '')
    cleaned.split(' - ').forEach((part, index) => (columns[index] ??= []).push(part.trim()))
  }
  const drawnIn = columns.map((column) => unique(column.filter(Boolean)).join(', ')).filter(Boolean)
  return {
    options,
    otherProperties: drawnIn.length > 0 ? [`each drawn as ${drawnIn.join('; ')}`] : [],
    path: found.path,
    anchor: found.node.id,
  }
}

function components(node: FigmaNode): FigmaNode[] {
  if (node.type === 'COMPONENT') return [node]
  return (node.children ?? []).flatMap(components)
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function find(node: FigmaNode, type: string, name: string, path: string[]): { node: FigmaNode; path: string[] } | undefined {
  if (node.type === type && node.name === name) return { node, path: [...path, node.name] }
  const here = node.type === 'CANVAS' || node.type === 'FRAME' || node.type === 'SECTION' ? [...path, node.name] : path
  for (const child of node.children ?? []) {
    const found = find(child, type, name, here)
    if (found) return found
  }
  return undefined
}
