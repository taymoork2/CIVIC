import { stableStringify } from './change.ts'
import { forecastOverride, type ForecastOutcome } from './forecast.ts'
import { indexGraph, type Graph } from './graph.ts'
import type { GraphDocument, Owner, PlatformComponent } from './schema.ts'

// The Design Engineering side of roadmap step 10: a check on a library release. A release is
// a platform component whose record or extension points changed between two revisions of a
// graph. For each one it names the semantic variants the release leaves without a mapping and
// the product overrides it breaks: overrides the library could express before the release and
// can't after. The release's owners are asked; the overrides' makers are told. Deterministic,
// read-only, and no model calls (D30).

export interface UnmappedVariant {
  semanticVariant: string
  /** True when the variant had a mapping before this release. */
  newInRelease: boolean
  note?: string
}

export interface OverrideImpact {
  overrideId: string
  title: string
  instanceId: string
  property: string
  before: ForecastOutcome
  after: ForecastOutcome
  reason: string
  /** The override's maker and the instance's owners: told, since the release moved, not them. */
  told: Owner[]
}

export interface ReleaseImpact {
  componentId: string
  title: string
  platform: PlatformComponent['platform']
  /** The library version before and after, or undefined where the component is new or gone. */
  before?: string
  after?: string
  /** The component's owners, asked to keep what the release breaks or decide it. */
  asked: Owner[]
  unmapped: UnmappedVariant[]
  /** Native variants the release adds that no semantic variant covers. */
  newExtraVariants: string[]
  broken: OverrideImpact[]
  /** Overrides the release makes expressible. */
  fixed: OverrideImpact[]
}

/** Every release between two revisions of one graph, with what each breaks. */
export function releasesBetween(base: GraphDocument | undefined, head: GraphDocument): ReleaseImpact[] {
  const before = base ? indexGraph(base) : undefined
  const after = indexGraph(head)
  return after
    .ofKind('platform-component')
    .filter((component) => !before || fingerprint(before, component.id) !== fingerprint(after, component.id))
    .map((component) => impact(component, before, after))
}

function impact(component: PlatformComponent, before: Graph | undefined, after: Graph): ReleaseImpact {
  const previous = before?.get(component.id)
  const was = previous?.kind === 'platform-component' ? previous : undefined
  const unmapped = component.variants
    .filter((mapping) => mapping.mapping === 'none')
    .map((mapping): UnmappedVariant => {
      const then = was?.variants.find((candidate) => candidate.semanticVariant === mapping.semanticVariant)
      return { semanticVariant: mapping.semanticVariant, newInRelease: Boolean(then && then.mapping !== 'none'), ...(mapping.note ? { note: mapping.note } : {}) }
    })
  const extras = new Set((was?.extraVariants ?? []).map((extra) => extra.expression))
  const newExtraVariants = was ? (component.extraVariants ?? []).map((extra) => extra.expression).filter((expression) => !extras.has(expression)) : []

  const broken: OverrideImpact[] = []
  const fixed: OverrideImpact[] = []
  const implemented = new Set(after.linksFrom(component.id).filter((link) => link.relation === 'implements').map((link) => link.to))
  for (const override of after.ofKind('override')) {
    const instance = after.get(override.instanceId)
    if (instance?.kind !== 'component-instance' || !implemented.has(instance.semanticId)) continue
    const now = forecastOn(after, override.id, component)
    const then = before ? forecastOn(before, override.id, component) : undefined
    if (!now || !then || now.outcome === then.outcome) continue
    const entry: OverrideImpact = {
      overrideId: override.id,
      title: override.title,
      instanceId: instance.id,
      property: override.property,
      before: then.outcome,
      after: now.outcome,
      reason: now.reason,
      told: dedupe([...(override.madeBy ? [override.madeBy] : []), ...(instance.owners ?? [])]),
    }
    if (then.outcome === 'supported') broken.push(entry)
    else if (now.outcome === 'supported') fixed.push(entry)
  }
  return {
    componentId: component.id,
    title: component.title,
    platform: component.platform,
    ...(was?.library.version ? { before: was.library.version } : {}),
    ...(component.library.version ? { after: component.library.version } : {}),
    asked: component.owners ?? [],
    unmapped,
    newExtraVariants,
    broken,
    fixed,
  }
}

/**
 * The forecast for the component's own library: the answer that considered it, or on a
 * graph where it doesn't implement the contract yet, the one for its framework.
 */
function forecastOn(graph: Graph, overrideId: string, component: PlatformComponent) {
  if (graph.get(overrideId)?.kind !== 'override') return undefined
  try {
    const forecasts = forecastOverride(graph, overrideId, [component.platform])
    return forecasts.find((forecast) => forecast.componentIds.includes(component.id)) ?? forecasts.find((forecast) => forecast.framework === component.framework)
  } catch {
    // The override's instance or component isn't in that revision, so nothing could be built then.
    return undefined
  }
}

/** What a release is: the component's record and its extension points. */
function fingerprint(graph: Graph, componentId: string): string | undefined {
  const component = graph.get(componentId)
  if (!component) return undefined
  const points = graph
    .ofKind('extension-point')
    .filter((point) => point.platformComponentId === componentId)
    .sort((a, b) => a.id.localeCompare(b.id))
  return stableStringify([component, points])
}

/** Whether any release breaks something it didn't before: an override, or a variant's mapping. */
export function releaseBreaks(impacts: ReleaseImpact[]): boolean {
  return impacts.some((item) => item.broken.length > 0 || item.unmapped.some((variant) => variant.newInRelease))
}

/** The releases as Markdown, one section per release. */
export function renderReleases(impacts: ReleaseImpact[], since: string): string {
  const people = (owners: Owner[]) => (owners.length > 0 ? owners.map((owner) => `${owner.who} (${owner.role}${owner.platform ? `, ${owner.platform}` : ''})`).join(', ') : 'no owner recorded')
  if (impacts.length === 0) return `# civic release: no library release since ${since}`
  const lines = [`# civic release: ${impacts.length} library release(s) since ${since}`, '']
  for (const item of impacts) {
    const versions = item.before && item.after && item.before !== item.after ? ` ${item.before} to ${item.after}` : item.after ? ` ${item.after}` : ''
    lines.push(`## ${item.title} [${item.platform}]${versions}`, '', `Asked: ${people(item.asked)}.`, '')
    const gaps = item.unmapped
    if (gaps.length > 0) {
      lines.push('Variants left without a mapping:', '')
      for (const variant of gaps) lines.push(`- ${variant.semanticVariant}${variant.newInRelease ? ' (new in this release: it had a mapping before)' : ''}${variant.note ? `: ${variant.note}` : ''}`)
      lines.push('')
    }
    if (item.newExtraVariants.length > 0) lines.push(`New native variants no semantic variant covers: ${item.newExtraVariants.join(', ')}.`, '')
    if (item.broken.length > 0) {
      lines.push('Product overrides this release breaks:', '')
      for (const override of item.broken) lines.push(`- ${override.title} (\`${override.property}\` on ${override.instanceId}): ${override.before} before, ${override.after} now. ${override.reason} Told: ${people(override.told)}.`)
      lines.push('')
    }
    if (item.fixed.length > 0) {
      lines.push('Product overrides this release makes expressible:', '')
      for (const override of item.fixed) lines.push(`- ${override.title} (\`${override.property}\`): ${override.before} before, ${override.after} now. Told: ${people(override.told)}.`)
      lines.push('')
    }
    if (gaps.length === 0 && item.broken.length === 0 && item.newExtraVariants.length === 0 && item.fixed.length === 0) lines.push('Every semantic variant is mapped, and no product override changes.', '')
  }
  return lines.join('\n').trimEnd()
}

function dedupe(owners: Owner[]): Owner[] {
  const seen = new Set<string>()
  return owners.filter((owner) => {
    const key = `${owner.role}|${owner.who}|${owner.platform ?? ''}`
    return !seen.has(key) && Boolean(seen.add(key))
  })
}
