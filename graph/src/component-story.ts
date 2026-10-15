import { countsForReadiness, type Graph } from './graph.ts'
import type { Platform } from './schema.ts'

// Component stories (decision 0013, point 1): a component story is the smallest journey, one
// platform component shown with one set of props. Nobody writes them. They come from the
// contract's variant matrix (each variant the implementation maps, at rest) and from real
// usage (each product code instance of the component whose variant and state no variant story
// already shows). Disabled is the one contract state a harness can set from props, so it gets
// a story on the default variant; hover, pressed and focus are what a person does, not props.
// A harness adapter mounts the component for a story, the way the canvas mounts an app screen.
// Like journey stories, these only point at the graph. Read-only, no model calls (D30).

export interface ComponentStory {
  id: string
  kind: 'component'
  title: string
  semanticId: string
  /** The platform component the story mounts. */
  componentId: string
  platform: Platform
  framework?: string
  /** The contract variant, and how this platform expresses it (its variant property's value). */
  variant: string
  expression: string
  mapping: 'exact' | 'closest'
  note?: string
  /** A contract state other than rest, such as `disabled`. */
  state?: string
  /** Where the story comes from: the contract's variant matrix, or a product's real use of it. */
  from: 'contract' | 'usage'
  /** The product code instances that show this variant and state on this platform. */
  instanceIds: string[]
}

/** States a harness can set from props alone. The others need a person's gesture. */
const PROP_STATES = new Set(['disabled'])

export function componentStoriesIn(graph: Graph): ComponentStory[] {
  const stories: ComponentStory[] = []
  for (const semantic of graph.ofKind('semantic-component')) {
    const implementations = graph
      .linksTo(semantic.id)
      .filter((link) => link.relation === 'implements' && countsForReadiness(link))
      .flatMap((link) => {
        const component = graph.get(link.from)
        return component?.kind === 'platform-component' ? [component] : []
      })
      .sort((a, b) => a.id.localeCompare(b.id))
    const instances = graph.ofKind('component-instance').filter((instance) => instance.semanticId === semantic.id && instance.origin === 'code')
    for (const component of implementations) {
      const mapped = semantic.variants.flatMap((variant) => {
        const mapping = component.variants.find((item) => item.semanticVariant === variant.key)
        return mapping && mapping.mapping !== 'none' && mapping.expression ? [{ variant, mapping }] : []
      })
      const used = instances.filter((instance) => instance.platform === component.platform)
      const story = (variantKey: string, state: string | undefined, from: ComponentStory['from']): ComponentStory | undefined => {
        const found = mapped.find((item) => item.variant.key === variantKey)
        if (!found) return undefined
        const shows = used.filter((instance) => (instance.variant ?? component.defaultVariant) === variantKey && (instance.state && instance.state !== 'rest' ? instance.state : undefined) === state)
        return {
          id: `story:component.${component.id.replace(/^platform:/, '')}.${variantKey}${state ? `.${state}` : ''}`,
          kind: 'component',
          title: `${found.variant.title}${state ? `, ${state}` : ''}`,
          semanticId: semantic.id,
          componentId: component.id,
          platform: component.platform,
          ...(component.framework ? { framework: component.framework } : {}),
          variant: variantKey,
          expression: found.mapping.expression!,
          mapping: found.mapping.mapping as 'exact' | 'closest',
          ...(found.mapping.note ? { note: found.mapping.note } : {}),
          ...(state ? { state } : {}),
          from,
          instanceIds: shows.map((instance) => instance.id).sort(),
        }
      }
      const own: ComponentStory[] = []
      for (const { variant } of mapped) own.push(story(variant.key, undefined, 'contract')!)
      const fallback = component.defaultVariant && mapped.some((item) => item.variant.key === component.defaultVariant) ? component.defaultVariant : mapped[0]?.variant.key
      for (const state of semantic.states.filter((state) => PROP_STATES.has(state))) {
        const made = fallback ? story(fallback, state, 'contract') : undefined
        if (made) own.push(made)
      }
      // Real usage the matrix doesn't show: a variant in another state, as a product uses it.
      for (const instance of used) {
        const variant = instance.variant ?? component.defaultVariant
        const state = instance.state && instance.state !== 'rest' ? instance.state : undefined
        if (!variant || own.some((item) => item.variant === variant && item.state === state)) continue
        const made = story(variant, state, 'usage')
        if (made) own.push(made)
      }
      stories.push(...own)
    }
  }
  return stories
}
