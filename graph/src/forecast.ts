import { countsForReadiness, type Graph } from './graph.ts'
import { propertyCovers } from './ids.ts'
import type { ExtensionPoint, Override, Platform, PlatformComponent } from './schema.ts'

export type ForecastOutcome = 'supported' | 'needs-library-change' | 'forbidden'

export interface Forecast {
  platform: Platform
  outcome: ForecastOutcome
  /** The extension point that makes it supported. */
  extensionPointId?: string
  /** The contract rule that forbids it. */
  ruleKey?: string
  reason: string
}

/**
 * Forecasts, per platform, whether an override on a component instance can be built with
 * the library as it is today (D29, component change flow):
 *
 * - forbidden: a rule in the semantic contract forbids it, on every platform;
 * - supported: the platform component has an extension point that expresses the property;
 * - needs a library change: no extension point does, or no platform component exists.
 *
 * Each platform gets its own answer; they are never merged. Only declared and observed
 * `implements` links count, so a proposed mapping cannot make an override look supported.
 * A detached instance is never expressible through an extension point.
 *
 * `platforms` defaults to the platforms of the screen the instance is placed on.
 */
export function forecastOverride(graph: Graph, overrideId: string, platforms?: Platform[]): Forecast[] {
  const override = graph.get(overrideId)
  if (override?.kind !== 'override') throw new Error(`${overrideId} is not an override in this graph.`)
  const instance = graph.get(override.instanceId)
  if (instance?.kind !== 'component-instance') throw new Error(`${override.instanceId} is not a component instance in this graph.`)
  const semantic = graph.get(instance.semanticId)
  if (semantic?.kind !== 'semantic-component') throw new Error(`${instance.semanticId} is not a semantic component in this graph.`)

  const placedOn = graph.get(instance.placedOn)
  const shipsOn = platforms ?? (placedOn?.kind === 'target' ? placedOn.platforms : undefined)
  if (!shipsOn) throw new Error(`Pass platforms: ${instance.placedOn} does not list the platforms it ships on.`)

  const rule = semantic.rules?.find(
    (candidate) => candidate.forbids && propertyCovers(candidate.forbids.property, override.property) && (!candidate.forbids.change || candidate.forbids.change === override.change),
  )
  const implementations = graph
    .linksTo(semantic.id)
    .filter((link) => link.relation === 'implements' && countsForReadiness(link))
    .map((link) => graph.get(link.from))
    .filter((record): record is PlatformComponent => record?.kind === 'platform-component')

  return shipsOn.map((platform): Forecast => {
    if (rule) return { platform, outcome: 'forbidden', ruleKey: rule.key, reason: `${semantic.title} contract: ${rule.statement}` }
    const components = implementations.filter((component) => component.platform === platform)
    if (components.length === 0) {
      return { platform, outcome: 'needs-library-change', reason: `No ${platform} component implements ${semantic.title} yet.` }
    }
    const point = expressingPoint(graph, components, override)
    if (point) return { platform, outcome: 'supported', extensionPointId: point.id, reason: `${point.mechanism} \`${point.name}\` expresses ${override.property}.` }
    return {
      platform,
      outcome: 'needs-library-change',
      reason: override.change === 'detach'
        ? 'A detached instance is a fork; no extension point expresses it.'
        : `No ${platform} extension point expresses ${override.property}.`,
    }
  })
}

function expressingPoint(graph: Graph, components: PlatformComponent[], override: Override): ExtensionPoint | undefined {
  if (override.change === 'detach') return undefined
  const ids = new Set(components.map((component) => component.id))
  return graph
    .ofKind('extension-point')
    .find((point) => ids.has(point.platformComponentId) && point.expresses.some((pattern) => propertyCovers(pattern, override.property)))
}
