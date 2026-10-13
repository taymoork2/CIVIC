import { countsForReadiness, type Graph } from './graph.ts'
import type { ComponentInstance, SemanticComponent, Target } from './schema.ts'

// The static design completeness check (D32). Rules read the graph an importer built from
// a design export, the component contracts, and the journey's declared shape. They report
// counts with denominators, never a confidence score, and make no model call (D30).
// Which gaps block a release is the project's risk policy, not this check.

/** How many of one component's contract states a screen's design accounts for. */
export interface StateCoverage {
  screenId: string
  semanticId: string
  /** The design instances on the screen and its state frames. */
  instanceIds: string[]
  /** Every state in the contract: the denominator. */
  total: number
  /** States some instance on the screen shows. */
  shown: string[]
  /** States the library renders, so the product design need not draw them. */
  fromLibrary: string[]
  /** Product states an instance explicitly leaves to the component's default. */
  inherited: string[]
  /** Product states that are neither shown nor inherited. */
  missing: string[]
}

export interface JourneyShape {
  journeyId: string
  /** Screens the journey contains: the denominator for both rules. */
  screens: string[]
  entry: string[]
  /** Screens with no way on: no outgoing path, and not a declared exit. */
  deadEnds: string[]
  /** Screens no path reaches from an entry screen. Empty when the journey declares no entry. */
  unreachable: string[]
}

export interface Completeness {
  journey: JourneyShape
  states: StateCoverage[]
}

/** Runs both rule sets over one journey: its screens' component states and its shape. */
export function completenessOf(graph: Graph, journeyId: string): Completeness {
  const journey = graph.get(journeyId)
  if (journey?.kind !== 'target' || journey.scale !== 'journey') throw new Error(`${journeyId} is not a journey in this graph.`)
  const screens = containedTargets(graph, journeyId, 'screen')
  return {
    journey: journeyShape(graph, journey, screens),
    states: screens.flatMap((screen) => stateCoverageOn(graph, screen.id)),
  }
}

/**
 * Per component, which contract states the design of one screen accounts for. A state is
 * accounted for when an instance on the screen or one of its state frames shows it, when
 * the library renders it (it isn't a product state), or when an instance says it inherits
 * the component's default. Only design instances count: the check runs before code exists.
 */
export function stateCoverageOn(graph: Graph, screenId: string): StateCoverage[] {
  const places = new Set(placesOn(graph, screenId))
  const instances = graph.ofKind('component-instance').filter((instance) => instance.origin === 'design' && places.has(instance.placedOn))
  const bySemantic = new Map<string, ComponentInstance[]>()
  for (const instance of instances) bySemantic.set(instance.semanticId, [...(bySemantic.get(instance.semanticId) ?? []), instance])

  return [...bySemantic.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([semanticId, group]) => {
      const semantic = graph.get(semanticId)
      if (semantic?.kind !== 'semantic-component') return []
      return [coverage(semantic, screenId, group)]
    })
}

function coverage(semantic: SemanticComponent, screenId: string, instances: ComponentInstance[]): StateCoverage {
  const productStates = semantic.productStates ?? []
  const shownSet = new Set(instances.flatMap((instance) => (instance.state ? [instance.state] : [])))
  const inheritedSet = new Set(instances.flatMap((instance) => instance.inheritsStates ?? []))
  const shown = semantic.states.filter((state) => shownSet.has(state))
  const fromLibrary = semantic.states.filter((state) => !productStates.includes(state) && !shownSet.has(state))
  const inherited = productStates.filter((state) => !shownSet.has(state) && inheritedSet.has(state))
  const missing = productStates.filter((state) => !shownSet.has(state) && !inheritedSet.has(state))
  return { screenId, semanticId: semantic.id, instanceIds: instances.map((instance) => instance.id).sort(), total: semantic.states.length, shown, fromLibrary, inherited, missing }
}

function journeyShape(graph: Graph, journey: Target, screens: Target[]): JourneyShape {
  const ids = screens.map((screen) => screen.id)
  const exits = new Set(journey.exits ?? [])
  const paths = (id: string) => graph.linksFrom(id).filter((link) => link.relation === 'navigates' && countsForReadiness(link))
  const deadEnds = ids.filter((id) => !exits.has(id) && paths(id).length === 0)

  const entry = journey.entry ?? []
  const reached = new Set<string>(entry)
  const queue = [...entry]
  while (queue.length > 0) {
    for (const link of paths(queue.shift()!)) {
      if (link.to && !reached.has(link.to)) {
        reached.add(link.to)
        queue.push(link.to)
      }
    }
  }
  const unreachable = entry.length === 0 ? [] : ids.filter((id) => !reached.has(id))
  return { journeyId: journey.id, screens: ids, entry, deadEnds, unreachable }
}

/**
 * Where a screen's instances can be placed: the screen, its state frames, and the product
 * components (decision 0011) any of them places, nested ones too.
 */
export function placesOn(graph: Graph, screenId: string): string[] {
  const places = new Set([screenId, ...containedTargets(graph, screenId, 'state').map((state) => state.id)])
  for (const place of [...places]) for (const component of placedComponents(graph, place)) places.add(component)
  return [...places]
}

/** The product components (decision 0011) a target places, and the ones they place, transitively. */
export function placedComponents(graph: Graph, targetId: string): string[] {
  const found: string[] = []
  const queue = [targetId]
  while (queue.length > 0) {
    for (const component of containedTargets(graph, queue.shift()!, 'component')) {
      if (!found.includes(component.id)) {
        found.push(component.id)
        queue.push(component.id)
      }
    }
  }
  return found
}

/** Targets of one scale that `parentId` contains through a declared or observed link, in ID order. */
function containedTargets(graph: Graph, parentId: string, scale: Target['scale']): Target[] {
  return graph
    .linksFrom(parentId)
    .filter((link) => link.relation === 'contains' && link.to && countsForReadiness(link))
    .map((link) => graph.get(link.to!))
    .filter((record): record is Target => record?.kind === 'target' && record.scale === scale)
    .sort((a, b) => a.id.localeCompare(b.id))
}

/** The check's result as Markdown: counts with their denominators, then each finding. */
export function renderCompleteness(graph: Graph, result: Completeness): string {
  const title = (id: string) => graph.get(id)?.title ?? id
  const list = (ids: string[]) => (ids.length > 0 ? ids.join(', ') : 'none')
  const { journey } = result
  const lines = [`# Design completeness: ${title(journey.journeyId)}`, '']
  lines.push('Static rules over the design export, the component contracts and the journey shape (D32). Results are counts with denominators. Which gaps block is the project\'s risk policy.', '')

  lines.push('## Component states', '')
  if (result.states.length === 0) lines.push('No design instances of contracted components on these screens.')
  for (const item of result.states) {
    const accounted = item.total - item.missing.length
    lines.push(
      `- **${title(item.screenId)}, ${title(item.semanticId)}**: ${accounted} of ${item.total} states accounted for. ` +
        `Shown: ${list(item.shown)}. From the library: ${list(item.fromLibrary)}. Inherited by choice: ${list(item.inherited)}. ` +
        `Missing: ${list(item.missing)}. (\`${item.semanticId}\` on \`${item.screenId}\`)`,
    )
  }
  lines.push('')

  lines.push('## Journey shape', '')
  const count = journey.screens.length
  lines.push(`${count} screen(s); entry: ${journey.entry.length > 0 ? journey.entry.map(title).join(', ') : 'none declared'}.`, '')
  lines.push(`- Dead ends: ${journey.deadEnds.length} of ${count}${journey.deadEnds.length > 0 ? `: ${journey.deadEnds.map((id) => `${title(id)} (\`${id}\`)`).join(', ')}` : ''}.`)
  if (journey.entry.length === 0) lines.push('- Unreachable screens: not checked, because the journey declares no entry screen.')
  else lines.push(`- Unreachable screens: ${journey.unreachable.length} of ${count}${journey.unreachable.length > 0 ? `: ${journey.unreachable.map((id) => `${title(id)} (\`${id}\`)`).join(', ')}` : ''}.`)
  lines.push('', 'Not checked yet: accessibility intent in the design.')
  return lines.join('\n')
}
