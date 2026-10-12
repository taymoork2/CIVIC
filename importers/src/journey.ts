import type { Link, Owner, Platform, SourceRef, Target } from '../../graph/src/index.ts'
import { fragment, slug, type Fragment } from './fragment.ts'

/** One path out of a scenario, as the journey engine declares it. */
interface IndexEdge {
  action: string
  destination: string
  when?: string
}

/** A cross-route action the engine read from application source, with where it found it. */
interface IndexRouteAction extends IndexEdge {
  from: string
  route?: string
  returnTo?: string
  source?: string
  anchor?: string
}

interface IndexScenario {
  id: string
  label: string
  journey: string
  renderer?: string
  component?: string
  checks?: string[]
  edges?: IndexEdge[]
}

/** The parts of the journey engine's review index (`GET /api/review/index`) this importer reads. */
export interface JourneyIndex {
  revision: { head: string; source: string }
  project?: { id: string; name: string }
  scenarios: IndexScenario[]
  routeActions?: IndexRouteAction[]
}

export interface JourneyIndexOptions {
  /** The ID segment every target gets, such as `laundry`: a scenario `intake.pack.type` becomes `target:laundry.intake.pack.type`. */
  prefix: string
  platform: Platform
  owners: Owner[]
  /** Scenario groups that are catalogs of specimens rather than journeys. They become surfaces, so the journey shape checks skip them. */
  catalogs?: string[]
  /** Where the index was read from, recorded on every source reference. */
  path: string
}

/** The target ID a scenario becomes. Annotations made on the canvas use the same ID (decision 0007). */
export const scenarioTarget = (prefix: string, scenarioId: string) => `target:${prefix}.${scenarioId}`

/**
 * Reads the journey engine's review index into the graph (decision 0004: the engine is one
 * viewer and adapter, and the graph is the store). Each scenario becomes an expected screen,
 * because the project declared it; each journey becomes a journey target that contains its
 * screens; each declared path becomes a declared `navigates` link. Paths the engine also
 * found in application source keep their route and source anchor. The index declares no
 * entry or exit screens, so none are invented: unreachable screens aren't checked, and a
 * screen with no way on is reported as a dead end until someone declares it an exit.
 *
 * Returns the fragment and, for each check file the scenarios name, the targets it is
 * declared to cover, so a test report can be tied to them.
 */
export function readJourneyIndex(index: JourneyIndex, options: JourneyIndexOptions): { fragment: Fragment; checks: Map<string, string[]> } {
  if (!index || !Array.isArray(index.scenarios) || typeof index.revision?.head !== 'string') throw new Error('Not a journey engine review index: it needs `revision.head` and `scenarios`.')
  const { prefix, platform, owners } = options
  const catalogs = new Set(options.catalogs ?? [])
  const source = (anchor?: string, path = options.path): SourceRef => ({ tool: 'journey-engine', importer: 'journey-index', revision: index.revision.head, path, ...(anchor ? { anchor } : {}) })
  const known = new Set(index.scenarios.map((scenario) => scenario.id))
  const routeActions = new Map((index.routeActions ?? []).map((action) => [`${action.from}\u0000${action.destination}\u0000${action.action}`, action]))

  const targets: Target[] = []
  const links: Link[] = []
  const checks = new Map<string, string[]>()
  const groups = new Map<string, Target>()
  for (const scenario of index.scenarios) {
    const id = scenarioTarget(prefix, scenario.id)
    targets.push({ id, kind: 'target', title: scenario.label, scale: 'screen', presence: 'expected', platforms: [platform], owners, source: source(scenario.id) })
    let group = groups.get(scenario.journey)
    if (!group) {
      const catalog = catalogs.has(scenario.journey)
      group = { id: `target:${prefix}.${catalog ? 'catalog' : 'journey'}.${slug(scenario.journey)}`, kind: 'target', title: scenario.journey, scale: catalog ? 'surface' : 'journey', presence: 'expected', platforms: [platform], owners, source: source(`journey ${scenario.journey}`) }
      groups.set(scenario.journey, group)
    }
    links.push({ from: group.id, relation: 'contains', to: id, status: 'declared', source: source(scenario.id) })
    for (const check of scenario.checks ?? []) checks.set(check, [...(checks.get(check) ?? []), id])
    for (const edge of scenario.edges ?? []) {
      const action = routeActions.get(`${scenario.id}\u0000${edge.destination}\u0000${edge.action}`)
      links.push({
        from: id,
        relation: 'navigates',
        ...(known.has(edge.destination) ? { to: scenarioTarget(prefix, edge.destination) } : { unmapped: edge.destination }),
        status: 'declared',
        action: edge.action,
        ...(edge.when ? { condition: edge.when } : {}),
        ...(action?.route ? { route: action.route } : {}),
        ...(action?.returnTo ? { returnTo: action.returnTo } : {}),
        source: action?.source ? source(action.anchor, action.source) : source(scenario.id),
      })
    }
  }
  return { fragment: fragment([...groups.values(), ...targets], links), checks }
}
