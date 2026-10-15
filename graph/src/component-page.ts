import { placesOn } from './completeness.ts'
import { conflictStates } from './decisions.ts'
import { countsForReadiness, type Graph } from './graph.ts'
import type { LinkStatus, Platform, PlatformComponent, SemanticComponent, VariantMapping } from './schema.ts'
import type { StoriesFile } from './story.ts'

// A component page (decision 0013, point 2): one semantic component with everything the graph
// joins to it. Its contract, each platform's implementation and how it maps the variants, the
// design library it comes from, every product use in design and code with its overrides and
// forks, every journey step whose screen uses it, and the conflicts on it with where each
// decision stands. Read-only and deterministic; no model calls (D30).

export interface ComponentFacts {
  semantic: Pick<SemanticComponent, 'id' | 'title' | 'purpose' | 'variants' | 'states'> & { slots: string[]; productStates: string[] }
  implementations: {
    id: string
    platform: Platform
    framework?: string
    package: string
    version?: string
    symbol: string
    /** How the `implements` link is known. An inferred one counts only once a person confirms it. */
    status: LinkStatus
    confirmed: boolean
    /** One per contract variant, in the contract's order: `none` where nothing maps it. */
    variants: (Pick<VariantMapping, 'mapping' | 'expression' | 'note'> & { variant: string })[]
    extraVariants: string[]
  }[]
  /** Design library files instances take the component from, by published key (decision 0011). */
  libraries: { file: string; key: string }[]
  uses: {
    id: string
    title: string
    product: string
    origin: 'design' | 'code'
    platform?: Platform
    variant?: string
    state?: string
    fork: boolean
    overrides: string[]
    /** Screens the instance appears on, directly or through a state frame or product component. */
    screens: string[]
  }[]
  /** Story steps whose screen uses the component, as each story orders them. */
  steps: { storyId: string; storyTitle: string; index: number; targetId: string; title: string }[]
  conflicts: { id: string; title: string; platform?: Platform; status: 'open' | 'decided'; alignment: string; outcome?: string }[]
}

export function componentFacts(graph: Graph, semanticId: string, stories?: StoriesFile): ComponentFacts {
  const semantic = graph.get(semanticId)
  if (semantic?.kind !== 'semantic-component') throw new Error(`${semanticId} is not a semantic component in this graph.`)
  // Every implementation, confirmed or not, so an inferred one shows as such rather than not at all.
  const implementations = graph
    .linksTo(semanticId)
    .filter((link) => link.relation === 'implements')
    .flatMap((link) => {
      const component = graph.get(link.from)
      return component?.kind === 'platform-component' ? [{ component, link }] : []
    })
    .sort((a, b) => a.component.id.localeCompare(b.component.id)) as { component: PlatformComponent; link: { status: LinkStatus } & Parameters<typeof countsForReadiness>[0] }[]
  const instances = graph.ofKind('component-instance').filter((instance) => instance.semanticId === semanticId).sort((a, b) => a.id.localeCompare(b.id))
  // Which screens each place belongs to: the screen itself, its state frames and the product components it places.
  const screensOf = new Map<string, string[]>()
  for (const screen of graph.ofKind('target').filter((target) => target.scale === 'screen')) {
    for (const place of placesOn(graph, screen.id)) screensOf.set(place, [...(screensOf.get(place) ?? []), screen.id])
  }
  const uses = instances.map((instance) => ({
    id: instance.id,
    title: instance.title,
    product: instance.product,
    origin: instance.origin,
    ...(instance.platform ? { platform: instance.platform } : {}),
    ...(instance.variant ? { variant: instance.variant } : {}),
    ...(instance.state ? { state: instance.state } : {}),
    fork: Boolean(instance.fork),
    overrides: graph.ofKind('override').filter((override) => override.instanceId === instance.id).map((override) => override.title),
    screens: [...new Set(screensOf.get(instance.placedOn) ?? [])].sort(),
  }))
  const used = new Set(uses.flatMap((use) => use.screens))
  const steps = (stories?.stories ?? []).flatMap((story) => story.steps.flatMap((step, index) => (used.has(step.targetId) ? [{ storyId: story.id, storyTitle: story.title, index, targetId: step.targetId, title: step.title }] : [])))
  const subjects = new Set([semanticId, ...implementations.map(({ component }) => component.id), ...instances.map((instance) => instance.id)])
  const conflicts = conflictStates(graph)
    .filter((state) => subjects.has(state.conflict.targetId))
    .map((state) => ({
      id: state.conflict.id,
      title: state.conflict.title,
      ...(state.conflict.platform ? { platform: state.conflict.platform } : {}),
      status: state.status,
      alignment: state.alignment,
      ...(state.decision ? { outcome: state.decision.outcome } : {}),
    }))
  const libraries = [...new Map(instances.flatMap((instance) => (instance.library ? [[`${instance.library.file} ${instance.library.key}`, { file: instance.library.file, key: instance.library.key }] as const] : []))).values()]
  return {
    semantic: { id: semantic.id, title: semantic.title, purpose: semantic.purpose, variants: semantic.variants, states: semantic.states, slots: semantic.slots ?? [], productStates: semantic.productStates ?? [] },
    implementations: implementations.map(({ component, link }) => ({
      id: component.id,
      status: link.status,
      confirmed: countsForReadiness(link),
      platform: component.platform,
      ...(component.framework ? { framework: component.framework } : {}),
      package: component.library.package,
      ...(component.library.version ? { version: component.library.version } : {}),
      symbol: component.symbol,
      variants: semantic.variants.map((variant) => {
        const mapped = component.variants.find((item) => item.semanticVariant === variant.key)
        return { variant: variant.key, mapping: mapped?.mapping ?? 'none', ...(mapped?.expression ? { expression: mapped.expression } : {}), ...(mapped?.note ? { note: mapped.note } : {}) }
      }),
      extraVariants: (component.extraVariants ?? []).map((extra) => extra.expression),
    })),
    libraries,
    uses,
    steps,
    conflicts,
  }
}
