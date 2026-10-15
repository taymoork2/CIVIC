import { stableStringify } from './change.ts'
import { placesOn } from './completeness.ts'
import { componentStoriesIn } from './component-story.ts'
import type { Graph } from './graph.ts'
import { stepOutcome } from './portal.ts'
import type { GraphRecord } from './schema.ts'
import { storiesIn } from './story.ts'

// Story differences (decision 0013, point 4): both directions meet at the gate. A change from
// any role shows to the others as a difference in the stories they read. A component or
// library change lists every journey step whose screen uses it, and a step that newly fails
// or whose screen changed points back to the components it uses and their design. Computed by
// comparing the stories read from a graph at the base and at the change. Read-only,
// deterministic, no model calls (D30).

export interface StepDifference {
  storyId: string
  storyTitle: string
  /** The step's position in the story at the change, from 1; at the base for a removed step. */
  index: number
  targetId: string
  title: string
  change: 'added' | 'removed' | 'outcome' | 'screen'
  /** For an outcome change: the step's outcome at the base and at the change. */
  from?: 'pass' | 'fail' | 'none'
  to?: 'pass' | 'fail' | 'none'
  /** For a `screen` change: the screen's own records moved, not only components it uses. */
  screen?: boolean
  /** The components the screen uses that this change moved. */
  components: { id: string; title: string }[]
}

export interface ComponentDifference {
  semanticId: string
  title: string
  /** Records about the component that are new, changed or gone: its contract, implementations and product uses. */
  moved: string[]
  storiesAdded: string[]
  storiesRemoved: string[]
  /** Journey steps whose screens use the component, at the change: everyone the change reaches. */
  reaches: { storyTitle: string; index: number; title: string }[]
}

export interface StoryDifferences {
  graph: string
  storiesAdded: string[]
  storiesRemoved: string[]
  steps: StepDifference[]
  components: ComponentDifference[]
}

export function storyDifferences(label: string, base: Graph | undefined, head: Graph): StoryDifferences {
  const before = base ? storiesIn(base, label).stories : []
  const after = storiesIn(head, label).stories
  const moved = movedComponents(base, head)
  const steps: StepDifference[] = []
  for (const story of after) {
    const old = before.find((item) => item.id === story.id)
    story.steps.forEach((step, position) => {
      const was = old?.steps.find((item) => item.targetId === step.targetId)
      const components = usedBy(head, step.targetId).filter((id) => moved.has(id)).map((id) => ({ id, title: head.get(id)?.title ?? id }))
      const at = { storyId: story.id, storyTitle: story.title, index: position + 1, targetId: step.targetId, title: step.title, components }
      if (!old) return
      if (!was) return steps.push({ ...at, change: 'added' })
      const from = stepOutcome(base!, was)
      const to = stepOutcome(head, step)
      if (from !== to) return steps.push({ ...at, change: 'outcome', from, to })
      const screen = screenMoved(base!, head, step.targetId)
      if (components.length > 0 || screen) steps.push({ ...at, change: 'screen', screen })
    })
    for (const [position, step] of (old?.steps ?? []).entries()) {
      if (!story.steps.some((item) => item.targetId === step.targetId)) steps.push({ storyId: story.id, storyTitle: story.title, index: position + 1, targetId: step.targetId, title: step.title, change: 'removed', components: [] })
    }
  }
  const beforeCode = base ? componentStoriesIn(base) : []
  const afterCode = componentStoriesIn(head)
  const components = [...moved.entries()].map(([semanticId, ids]): ComponentDifference => {
    const reaches = after.flatMap((story) => story.steps.flatMap((step, position) => (usedBy(head, step.targetId).includes(semanticId) ? [{ storyTitle: story.title, index: position + 1, title: step.title }] : [])))
    const own = (list: typeof afterCode) => new Set(list.filter((item) => item.semanticId === semanticId).map((item) => item.id))
    const [was, now] = [own(beforeCode), own(afterCode)]
    return {
      semanticId,
      title: (head.get(semanticId) ?? base?.get(semanticId))?.title ?? semanticId,
      moved: ids,
      storiesAdded: [...now].filter((id) => !was.has(id)),
      storiesRemoved: [...was].filter((id) => !now.has(id)),
      reaches,
    }
  })
  return {
    graph: label,
    storiesAdded: after.filter((story) => !before.some((item) => item.id === story.id)).map((story) => story.title),
    storiesRemoved: before.filter((story) => !after.some((item) => item.id === story.id)).map((story) => story.title),
    steps,
    components,
  }
}

export function hasDifferences(differences: StoryDifferences): boolean {
  return differences.storiesAdded.length + differences.storiesRemoved.length + differences.steps.length + differences.components.length > 0
}

export function renderStoryDifferences(all: StoryDifferences[]): string {
  const changed = all.filter(hasDifferences)
  if (changed.length === 0) return ''
  const lines = ['### Story differences', '', 'What this change looks like in the journey and component stories each role reads (decision 0013).', '']
  for (const item of changed) {
    lines.push(`In ${item.graph}:`, '')
    for (const title of item.storiesAdded) lines.push(`- New story: ${title}.`)
    for (const title of item.storiesRemoved) lines.push(`- Story gone: ${title}.`)
    for (const step of item.steps) {
      const where = `${step.storyTitle}, step ${step.index} (${step.title})`
      const uses = step.components.length > 0 ? ` Its screen uses ${step.components.map((component) => component.title).join(', ')}, which this change moved.` : ''
      if (step.change === 'added') lines.push(`- ${where} is new.${uses}`)
      else if (step.change === 'removed') lines.push(`- ${where} is gone.`)
      else if (step.change === 'outcome') lines.push(`- ${where} ${step.to === 'fail' ? 'now fails' : step.to === 'pass' ? 'now passes' : 'has no run evidence any more'} (was ${step.from === 'none' ? 'without run evidence' : step.from === 'pass' ? 'passing' : 'failing'}).${uses}`)
      else if (step.screen) lines.push(`- ${where}: the screen changed.${uses}`)
      else lines.push(`- ${where} uses ${step.components.map((component) => component.title).join(', ')}, which this change moved.`)
    }
    for (const component of item.components) {
      const stories = [...(component.storiesAdded.length > 0 ? [`adds code stories ${component.storiesAdded.join(', ')}`] : []), ...(component.storiesRemoved.length > 0 ? [`removes code stories ${component.storiesRemoved.join(', ')}`] : [])]
      const reach = component.reaches.length > 0 ? `reaches ${component.reaches.length} journey step${component.reaches.length === 1 ? '' : 's'}: ${component.reaches.map((step) => `${step.storyTitle} ${step.index}`).join(', ')}` : 'reaches no journey step'
      lines.push(`- ${component.title} (\`${component.semanticId}\`) moved in ${component.moved.length} record${component.moved.length === 1 ? '' : 's'}; it ${[...stories, reach].join('; ')}.`)
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}

/** Semantic components whose contract, implementations, extension points, product uses or overrides differ, with the records that moved. */
function movedComponents(base: Graph | undefined, head: Graph): Map<string, string[]> {
  const moved = new Map<string, string[]>()
  const add = (semanticId: string, id: string) => moved.set(semanticId, [...new Set([...(moved.get(semanticId) ?? []), id])].sort())
  const kinds = ['semantic-component', 'platform-component', 'extension-point', 'component-instance', 'override'] as const
  const records = (graph: Graph | undefined) => new Map<string, GraphRecord>(kinds.flatMap((kind) => (graph?.ofKind(kind) ?? []) as GraphRecord[]).map((record) => [record.id, record]))
  const [was, now] = [records(base), records(head)]
  for (const id of new Set([...was.keys(), ...now.keys()])) {
    const a = was.get(id)
    const b = now.get(id)
    if (a && b && stableStringify(withoutSource(a)) === stableStringify(withoutSource(b))) continue
    for (const graph of [head, base]) {
      const semanticId = graph ? semanticOf(graph, (b ?? a)!) : undefined
      if (semanticId) {
        add(semanticId, id)
        break
      }
    }
  }
  return moved
}

function semanticOf(graph: Graph, record: GraphRecord): string | undefined {
  if (record.kind === 'semantic-component') return record.id
  if (record.kind === 'component-instance') return record.semanticId
  if (record.kind === 'platform-component') return graph.linksFrom(record.id).find((link) => link.relation === 'implements')?.to
  if (record.kind === 'extension-point') {
    const component = graph.get(record.platformComponentId)
    return component ? semanticOf(graph, component) : undefined
  }
  if (record.kind === 'override') {
    const instance = graph.get(record.instanceId)
    return instance ? semanticOf(graph, instance) : undefined
  }
  return undefined
}

/** The semantic components a screen uses, through its state frames and product components. */
function usedBy(graph: Graph, targetId: string): string[] {
  const places = new Set(placesOn(graph, targetId))
  return [...new Set(graph.ofKind('component-instance').filter((instance) => places.has(instance.placedOn)).map((instance) => instance.semanticId))].sort()
}

/** The screen's own record, or a state frame or product component it places, differs. */
function screenMoved(base: Graph, head: Graph, targetId: string): boolean {
  const ids = new Set([...placesOn(base, targetId), ...placesOn(head, targetId)])
  return [...ids].some((id) => {
    const a = base.get(id)
    const b = head.get(id)
    return !a || !b || stableStringify(withoutSource(a)) !== stableStringify(withoutSource(b))
  })
}

/** A record without its source, whose revision moves on every capture. */
function withoutSource(record: GraphRecord): unknown {
  const { source: _source, ...rest } = record as GraphRecord & { source?: unknown }
  return rest
}
