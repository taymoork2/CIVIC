import type { ComponentInstance, Evidence, Link, Override, OverrideChange, Owner, Platform, SourceRef, Target } from '../../graph/src/index.ts'
import { fragment, slug, type Fragment } from './fragment.ts'

// Reads a product team's design file, and the library file its components come from, out of
// Figma REST exports (`GET /v1/files/:key`, D27). It finds the product's screens and state
// frames, the prototype paths between them, each instance of a library component with the
// contract state it shows, and every way the product changed that instance (D29). Nothing
// is matched by guesswork: the component set, its variant and state options, and which
// component property or local style means what are declared, and an undeclared name fails.

/**
 * What one component property means. For a property that changes the component, a value
 * other than the library default is an override of `property`. A `content` property, such as
 * a title's text, is how every product fills the component in, so setting it is never an override.
 */
export type PropertyMapping = { property: string; change: OverrideChange } | { content: true }

/** How a design system library draws one semantic component, declared by its maintainers. */
export interface LibraryComponentMapping {
  semanticId: string
  /** The component set's name in the library file and in files that use it. */
  componentSet: string
  variantProperty: string
  /** Figma variant option to semantic variant key. */
  variants: Record<string, string>
  stateProperty: string
  /** Figma state option to contract state. */
  states: Record<string, string>
  /** Every other component property, by name without Figma's `#id` suffix. */
  properties: Record<string, PropertyMapping>
  /**
   * Component sets nested inside this one, such as a header, by name: every property of each,
   * declared the same way. A product sets these on the nested instance, not on the component.
   */
  parts?: Record<string, Record<string, PropertyMapping>>
  /** Fields of the instance itself (`overriddenFields` in the export) that are local styles. */
  styleFields: Record<string, string>
  owners?: Owner[]
}

/** A product team's declaration of itself: who owns its design and where it ships. */
export interface ProductManifest {
  product: string
  title: string
  platforms: Platform[]
  owners: Owner[]
}

export interface LibraryFacts {
  mapping: LibraryComponentMapping
  /** Default of each declared property, as the library file defines it; a part's are keyed `<part> / <property>`. */
  defaults: Record<string, unknown>
  /** Component names by key, so an instance swap can be compared across files. */
  componentNames: Record<string, string>
  evidence: Evidence
}

interface FigmaNode {
  id: string
  name: string
  type: string
  children?: FigmaNode[]
  componentId?: string
  componentProperties?: Record<string, { type: string; value: unknown }>
  componentPropertyDefinitions?: Record<string, { type: string; defaultValue?: unknown; variantOptions?: string[] }>
  overrides?: { id: string; overriddenFields: string[] }[]
  reactions?: { trigger?: { type: string }; actions?: { type: string; destinationId?: string | null; navigation?: string; url?: string }[] }[]
  flowStartingPoints?: { nodeId: string; name: string }[]
  [field: string]: unknown
}

interface FigmaFile {
  name: string
  version: string
  lastModified: string
  document: FigmaNode
  components?: Record<string, { key: string; name: string; componentSetId?: string; remote?: boolean }>
  componentSets?: Record<string, { key: string; name: string; remote?: boolean }>
}

function asFile(file: unknown): FigmaFile {
  const root = file as Partial<FigmaFile>
  if (!root.document || typeof root.version !== 'string' || typeof root.name !== 'string') throw new Error('Not a Figma file export: it needs `name`, `version` and `document`.')
  return root as FigmaFile
}

/** Figma suffixes non-variant property names with `#<id>`; declarations use the bare name. */
const bareName = (name: string) => name.replace(/#[^#]*$/, '')

function walk(node: FigmaNode, visit: (node: FigmaNode) => void) {
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}

/** Reads the library's component set: its declared options must all exist, and its property defaults. */
export function readFigmaLibraryComponent(file: unknown, mapping: LibraryComponentMapping, capturedAt: string): LibraryFacts {
  const root = asFile(file)
  const setNamed = (name: string) => {
    let found: FigmaNode | undefined
    walk(root.document, (node) => {
      if (node.type === 'COMPONENT_SET' && node.name === name) found ??= node
    })
    if (!found) throw new Error(`${root.name}: no component set named ${name}.`)
    return found
  }
  const definitionsOf = (node: FigmaNode) => Object.fromEntries(Object.entries(node.componentPropertyDefinitions ?? {}).map(([name, value]) => [bareName(name), value]))
  const set = setNamed(mapping.componentSet)
  const definitions = definitionsOf(set)
  const problems: string[] = []
  for (const [property, options] of [[mapping.variantProperty, mapping.variants], [mapping.stateProperty, mapping.states]] as const) {
    const definition = definitions[property]
    if (definition?.type !== 'VARIANT') problems.push(`no variant property ${property}`)
    else for (const option of Object.keys(options)) if (!definition.variantOptions?.includes(option)) problems.push(`${property} has no option ${option}`)
  }
  for (const name of Object.keys(mapping.properties)) if (!definitions[name]) problems.push(`no component property ${name}`)
  const partDefinitions = Object.fromEntries(Object.keys(mapping.parts ?? {}).map((part) => [part, definitionsOf(setNamed(part))]))
  for (const [part, properties] of Object.entries(mapping.parts ?? {})) {
    for (const name of Object.keys(properties)) if (!partDefinitions[part]![name]) problems.push(`${part} has no component property ${name}`)
  }
  if (problems.length > 0) throw new Error(`${root.name} ${mapping.componentSet}: ${problems.join('; ')}.`)

  const componentNames: Record<string, string> = {}
  for (const component of Object.values(root.components ?? {})) componentNames[component.key] = component.name
  const defaults: Record<string, unknown> = {}
  const defaultOf = (definition: { type: string; defaultValue?: unknown }) =>
    // An instance swap's default is a node in the library file; compare it by component name.
    definition.type === 'INSTANCE_SWAP' && typeof definition.defaultValue === 'string' ? (root.components?.[definition.defaultValue]?.name ?? definition.defaultValue) : definition.defaultValue
  for (const name of Object.keys(mapping.properties)) defaults[name] = defaultOf(definitions[name]!)
  for (const [part, properties] of Object.entries(mapping.parts ?? {})) {
    for (const name of Object.keys(properties)) defaults[`${part} / ${name}`] = defaultOf(partDefinitions[part]![name]!)
  }
  const declared = [
    ...Object.entries(mapping.properties).map(([name, value]) => [name, value] as const),
    ...Object.entries(mapping.parts ?? {}).flatMap(([part, properties]) => Object.entries(properties).map(([name, value]) => [`${part} / ${name}`, value] as const)),
  ]
    .filter(([, value]) => !('content' in value))
    .map(([name]) => `${name} (default ${String(defaults[name])})`)
  return {
    mapping,
    defaults,
    componentNames,
    evidence: {
      id: `evidence:figma.library.${slug(mapping.componentSet)}`,
      kind: 'evidence',
      title: `Library ${mapping.componentSet} component set`,
      subjectIds: [mapping.semanticId],
      tier: 'static-analysis',
      method: 'design-export',
      outcome: 'finding',
      finding:
        `${mapping.componentSet} draws ${mapping.variantProperty}: ${definitions[mapping.variantProperty]!.variantOptions!.join(', ')}; ` +
        `${mapping.stateProperty}: ${definitions[mapping.stateProperty]!.variantOptions!.join(', ')}; product-settable properties: ${declared.join(', ')}.`,
      capturedAt,
      source: { tool: 'figma', importer: 'figma-file', revision: root.version, path: `${root.name} / ${mapping.componentSet}`, anchor: set.id },
    },
  }
}

/**
 * Reads a product's design file: every top-level frame on each page is a screen, or a
 * state of a screen when it is named `<Screen> / <State>`. Each prototype flow starting
 * point is a journey that contains the page's screens and enters at that frame. Prototype
 * clicks become declared `navigates` links (a URL action stays unmapped), and each instance
 * of the library component becomes a component instance with its overrides.
 */
export function readFigmaProductFile(file: unknown, library: LibraryFacts, product: ProductManifest, capturedAt: string): Fragment {
  const root = asFile(file)
  const { mapping } = library
  const designOwners = product.owners.filter((owner) => owner.role === 'design')
  const source = (path: string, anchor: string): SourceRef => ({ tool: 'figma', importer: 'figma-file', revision: root.version, path: `${root.name} / ${path}`, anchor })
  const records: (Target | ComponentInstance | Override | Evidence)[] = []
  const links: Link[] = []
  const pages = (root.document.children ?? []).filter((node) => node.type === 'CANVAS')

  // Frames first, so paths can resolve their destinations.
  const frames = new Map<string, { node: FigmaNode; targetId: string; page: string; screenId: string; isState: boolean }>()
  for (const page of pages) {
    for (const node of (page.children ?? []).filter((child) => child.type === 'FRAME')) {
      const [screen, state, ...rest] = node.name.split(' / ').map((part) => part.trim())
      if (!screen || rest.length > 0) throw new Error(`${root.name} / ${page.name}: frame "${node.name}" is not named <Screen> or <Screen> / <State>.`)
      const screenId = `target:${product.product}.${slug(screen)}`
      const targetId = state ? `${screenId}.${slug(state)}` : screenId
      if ([...frames.values()].some((frame) => frame.targetId === targetId)) throw new Error(`${root.name}: two frames map to ${targetId}.`)
      frames.set(node.id, { node, targetId, page: page.name, screenId, isState: Boolean(state) })
    }
  }
  const screenTargets = new Set([...frames.values()].filter((frame) => !frame.isState).map((frame) => frame.targetId))

  for (const frame of frames.values()) {
    const { node, targetId, page, screenId, isState } = frame
    if (isState && !screenTargets.has(screenId)) throw new Error(`${root.name}: state frame "${node.name}" has no screen frame for ${screenId}.`)
    records.push({ id: targetId, kind: 'target', title: node.name, scale: isState ? 'state' : 'screen', presence: 'expected', platforms: product.platforms, owners: designOwners, source: source(`${page} / ${node.name}`, node.id) })
    links.push({ from: isState ? screenId : `target:${product.product}.${slug(page)}`, relation: 'contains', to: targetId, status: 'declared' })

    walk(node, (child) => {
      for (const reaction of child.reactions ?? []) {
        for (const action of reaction.actions ?? []) {
          const base = { from: targetId, relation: 'navigates' as const, status: 'declared' as const, action: child.name, source: source(`${page} / ${node.name} / ${child.name}`, child.id) }
          if (action.type === 'NODE' && action.destinationId && action.navigation === 'NAVIGATE') {
            const destination = frames.get(action.destinationId)
            if (!destination) throw new Error(`${root.name}: "${child.name}" in "${node.name}" navigates to ${action.destinationId}, which is not a top-level frame.`)
            links.push({ ...base, to: destination.targetId })
          } else if (action.type === 'URL' && action.url) {
            links.push({ ...base, unmapped: action.url, route: action.url })
          }
        }
      }
    })

    const instanceIds = new Set<string>()
    walk(node, (child) => {
      if (child.type !== 'INSTANCE' || !child.componentId || setNameOf(root, child.componentId) !== mapping.componentSet) return
      const instanceId = `instance:${targetId.slice('target:'.length)}.${slug(child.name)}`
      if (instanceIds.has(instanceId)) throw new Error(`${root.name}: "${node.name}" has two ${mapping.componentSet} instances named "${child.name}"; name them apart.`)
      instanceIds.add(instanceId)
      records.push(...readInstance(root, child, instanceId, targetId, node.name, library, product, designOwners, source(`${page} / ${node.name} / ${child.name}`, child.id)))
      links.push({ from: targetId, relation: 'contains', to: instanceId, status: 'declared' })
    })
  }

  for (const page of pages) {
    const pageScreens = [...frames.values()].filter((frame) => frame.page === page.name && !frame.isState)
    for (const start of page.flowStartingPoints ?? []) {
      const entry = frames.get(start.nodeId)
      if (!entry || entry.isState) throw new Error(`${root.name} / ${page.name}: flow "${start.name}" starts on ${start.nodeId}, which is not a screen frame.`)
      const journeyId = `target:${product.product}.${slug(page.name)}`
      if (records.some((record) => record.id === journeyId)) throw new Error(`${root.name} / ${page.name}: one journey per page; "${start.name}" is a second flow.`)
      records.push({ id: journeyId, kind: 'target', title: start.name, scale: 'journey', presence: 'expected', platforms: product.platforms, owners: product.owners, entry: [entry.targetId], source: source(page.name, page.id) })
    }
    if (pageScreens.length > 0 && !records.some((record) => record.id === `target:${product.product}.${slug(page.name)}`)) {
      throw new Error(`${root.name} / ${page.name}: the page has screens but no prototype flow starting point, so there is no journey to hold them.`)
    }
  }

  const instances = records.filter((record): record is ComponentInstance => record.kind === 'component-instance')
  const overrides = records.filter((record): record is Override => record.kind === 'override')
  records.push({
    id: `evidence:figma.${product.product}.${slug(root.name)}`,
    kind: 'evidence',
    title: `${root.name} design export`,
    subjectIds: [mapping.semanticId, ...instances.map((instance) => instance.id)],
    tier: 'static-analysis',
    method: 'design-export',
    outcome: 'finding',
    finding:
      `${frames.size} frame(s): ${[...frames.values()].map((frame) => frame.node.name).join(', ')}. ` +
      `${instances.length} ${mapping.componentSet} instance(s) showing ${instances.map((instance) => instance.state).join(', ')}; ` +
      `${overrides.length} override(s): ${overrides.map((override) => override.property).join(', ') || 'none'}.`,
    capturedAt,
    source: { tool: 'figma', importer: 'figma-file', revision: root.version, path: root.name },
  })
  return fragment(records, links)
}

function setNameOf(root: FigmaFile, componentId: string): string | undefined {
  const component = root.components?.[componentId]
  return component?.componentSetId ? root.componentSets?.[component.componentSetId]?.name : undefined
}

function readInstance(
  root: FigmaFile,
  node: FigmaNode,
  instanceId: string,
  targetId: string,
  frameName: string,
  library: LibraryFacts,
  product: ProductManifest,
  owners: Owner[],
  source: SourceRef,
): (ComponentInstance | Override)[] {
  const { mapping } = library
  const properties = Object.fromEntries(Object.entries(node.componentProperties ?? {}).map(([name, value]) => [bareName(name), value]))
  const option = (property: string, options: Record<string, string>) => {
    const value = properties[property]?.value
    if (typeof value !== 'string' || !options[value]) throw new Error(`${root.name}: instance "${node.name}" has ${property}=${String(value)}, which the ${mapping.componentSet} mapping does not declare.`)
    return options[value]!
  }
  const instance: ComponentInstance = {
    id: instanceId,
    kind: 'component-instance',
    title: `${node.name} on ${frameName}`,
    semanticId: mapping.semanticId,
    variant: option(mapping.variantProperty, mapping.variants),
    state: option(mapping.stateProperty, mapping.states),
    placedOn: targetId,
    product: product.product,
    origin: 'design',
    owners,
    source,
  }
  const madeBy = owners[0]
  const overrides: Override[] = []
  const add = (key: string, title: string, property: string, change: OverrideChange, value: string | number | boolean | undefined, name = title) => {
    // Several Figma properties can mean one contract property; a second override keeps its own name.
    const base = `override:${instanceId.slice('instance:'.length)}.${key}`
    overrides.push({
      id: overrides.some((override) => override.id === base) ? `${base}.${slug(name)}` : base,
      kind: 'override',
      title,
      instanceId,
      property,
      change,
      ...(value !== undefined ? { value } : {}),
      ...(madeBy ? { madeBy } : {}),
      source,
    })
  }

  const propertyOverrides = (set: Record<string, { type: string; value: unknown }>, declarations: Record<string, PropertyMapping>, part?: string) => {
    for (const [name, declared] of Object.entries(declarations)) {
      const given = set[name]
      if (!given || 'content' in declared) continue
      const value = given.type === 'INSTANCE_SWAP' && typeof given.value === 'string' ? (root.components?.[given.value]?.name ?? given.value) : given.value
      const label = part ? `${part} / ${name}` : name
      if (value === library.defaults[label]) continue
      add(slug(declared.property), `${label} set to ${String(value)}`, declared.property, declared.change, value as string | number | boolean, label)
    }
  }
  propertyOverrides(properties, mapping.properties)
  for (const [part, declarations] of Object.entries(mapping.parts ?? {})) {
    walk(node, (child) => {
      if (child === node || child.type !== 'INSTANCE' || !child.componentId || setNameOf(root, child.componentId) !== part) return
      const set = Object.fromEntries(Object.entries(child.componentProperties ?? {}).map(([name, value]) => [bareName(name), value]))
      const unknown = Object.keys(set).filter((name) => !declarations[name])
      if (unknown.length > 0) throw new Error(`${root.name}: ${part} in instance "${node.name}" sets ${unknown.join(', ')}, which the ${mapping.componentSet} mapping does not declare.`)
      propertyOverrides(set, declarations, part)
    })
  }
  for (const field of node.overrides?.find((entry) => entry.id === node.id)?.overriddenFields ?? []) {
    const property = mapping.styleFields[field]
    const raw = node[field]
    const value = typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean' ? raw : undefined
    // An undeclared local style is still an override: nothing is hidden, and no extension point will claim it.
    add(slug(property ?? `unmapped-${field}`), `Local ${field}${value !== undefined ? ` ${value}` : ''}`, property ?? `unmapped.${field}`, 'local-style', value)
  }
  const unknown = Object.keys(properties).filter((name) => name !== mapping.variantProperty && name !== mapping.stateProperty && !mapping.properties[name])
  if (unknown.length > 0) throw new Error(`${root.name}: instance "${node.name}" sets ${unknown.join(', ')}, which the ${mapping.componentSet} mapping does not declare.`)
  return [instance, ...overrides]
}
