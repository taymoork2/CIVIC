import type { Evidence, Owner, Platform, SourceRef } from '../../graph/src/index.ts'

/** Which component set in a Figma file is the kit's version of a semantic component. */
export interface DesignKitMapping {
  id: string
  title: string
  platform: Platform
  componentSet: string
  variantProperty: string
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
 */
export function readFigmaComponentSet(file: unknown, kit: DesignKitMapping, semanticId: string, capturedAt: string): DesignKitFacts {
  const root = file as { name?: string; version?: string; document?: FigmaNode }
  if (!root.document || typeof root.version !== 'string') throw new Error('Not a Figma file export: it needs `document` and `version`.')
  const found = findSet(root.document, kit.componentSet, [])
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
  const options = definition.variantOptions.filter((option) => drawn.has(option))
  const missing = Object.keys(kit.variants).filter((option) => !options.includes(option))
  if (missing.length > 0) throw new Error(`${kit.title}: the mapping names ${missing.join(', ')}, which ${kit.componentSet} does not draw.`)

  const otherProperties = Object.entries(node.componentPropertyDefinitions ?? {})
    .filter(([name, value]) => name !== kit.variantProperty && value.type === 'VARIANT')
    .map(([name, value]) => `${name}: ${(value.variantOptions ?? []).join(', ')}`)
  const source: SourceRef = { tool: 'figma', importer: 'figma-file', revision: root.version, path: [root.name, ...path].join(' / '), anchor: node.id }
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

function findSet(node: FigmaNode, name: string, path: string[]): { node: FigmaNode; path: string[] } | undefined {
  if (node.type === 'COMPONENT_SET' && node.name === name) return { node, path: [...path, node.name] }
  const here = node.type === 'CANVAS' || node.type === 'FRAME' || node.type === 'SECTION' ? [...path, node.name] : path
  for (const child of node.children ?? []) {
    const found = findSet(child, name, here)
    if (found) return found
  }
  return undefined
}
