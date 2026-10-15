import { completenessOf } from './completeness.ts'
import type { Graph } from './graph.ts'
import type { DesignExport } from './schema.ts'

// Journey stories (decision 0013): a story is a playable view of one journey, built from what
// the graph already holds. A story record only points: at the journey, its screens in the
// order a person meets them, the evidence about each screen, the design frames that name it
// and, where the design links its frames, the frame walk (D33). Nothing is recorded or copied
// for a story, so a story is never older than the graph it was read from. Read-only and
// deterministic; no model calls (D30).

export const STORIES_SCHEMA = 'civic.stories/0'

export interface StoryStep {
  /** The screen this step shows. */
  targetId: string
  title: string
  /** Evidence about the screen: runs, replays and static analysis, as graph IDs. */
  evidenceIds: string[]
  /** Open collaboration records about the screen, such as a coverage gap. */
  recordIds: string[]
  /** Frames in the configured design files that name this screen (D37). */
  designFrames: { file: string; node: string }[]
  /** The design links the journey's frames, so the frame walk (D33) can play from this screen's frame. */
  walk: boolean
}

export interface Story {
  id: string
  kind: 'journey'
  title: string
  journeyId: string
  /** Screens in the order a person meets them: along paths from the journey's entry, then the rest as the journey lists them. */
  steps: StoryStep[]
}

export interface StoriesFile {
  schema: typeof STORIES_SCHEMA
  graph: string
  stories: Story[]
}

export interface StoryOptions {
  designs?: readonly { file: string; design: DesignExport }[]
}

/** One story per journey that contains a screen. Surfaces, such as a catalog of specimens, are not journeys anyone walks. */
export function storiesIn(graph: Graph, label: string, options: StoryOptions = {}): StoriesFile {
  const journeys = graph.ofKind('target').filter((target) => target.scale === 'journey')
  const stories = journeys.flatMap((journey): Story[] => {
    const order = stepOrder(graph, journey.id)
    // The frame walk plays the journey's design frames when the design links any of them.
    const walk = order.some((id) => graph.linksFrom(id).some((link) => link.relation === 'navigates' && link.source?.tool === 'figma'))
    const steps = order.map((id) => storyStep(graph, id, walk, options))
    return steps.length > 0 ? [{ id: `story:${journey.id.replace(/^target:/, '')}`, kind: 'journey', title: journey.title, journeyId: journey.id, steps }] : []
  })
  return { schema: STORIES_SCHEMA, graph: label, stories }
}

function stepOrder(graph: Graph, journeyId: string): string[] {
  const shape = completenessOf(graph, journeyId).journey
  const screens = new Set(shape.screens)
  const order: string[] = []
  const queue = [...shape.entry]
  while (queue.length > 0) {
    const id = queue.shift()!
    if (order.includes(id) || !screens.has(id)) continue
    order.push(id)
    for (const link of graph.linksFrom(id)) if (link.relation === 'navigates' && link.to) queue.push(link.to)
  }
  for (const id of shape.screens) if (!order.includes(id)) order.push(id)
  return order
}

function storyStep(graph: Graph, targetId: string, walk: boolean, options: StoryOptions): StoryStep {
  return {
    targetId,
    title: graph.get(targetId)?.title ?? targetId,
    evidenceIds: graph.ofKind('evidence').filter((item) => item.subjectIds.includes(targetId)).map((item) => item.id),
    recordIds: graph.ofKind('collaboration').filter((item) => item.status === 'open' && item.subjectIds.includes(targetId)).map((item) => item.id),
    designFrames: (options.designs ?? []).flatMap(({ file, design }) => design.frames.filter((frame) => frame.designs?.includes(targetId)).map((frame) => ({ file, node: frame.node }))),
    walk,
  }
}

/** The stories as text: one line per story, then its steps. */
export function renderStories(file: StoriesFile): string {
  const lines = [`# Journey stories in ${file.graph}`, '', `${file.stories.length} stor${file.stories.length === 1 ? 'y' : 'ies'}. Each points at the graph's own records; nothing is copied.`, '']
  for (const story of file.stories) {
    lines.push(`## ${story.title}`, '', `\`${story.id}\`, ${story.steps.length} step${story.steps.length === 1 ? '' : 's'}.`, '')
    story.steps.forEach((step, index) => {
      const parts = [`${step.evidenceIds.length} evidence`, ...(step.recordIds.length > 0 ? [`${step.recordIds.length} open record${step.recordIds.length === 1 ? '' : 's'}`] : []), ...(step.designFrames.length > 0 ? [`${step.designFrames.length} design frame${step.designFrames.length === 1 ? '' : 's'}`] : []), ...(step.walk ? ['frame walk'] : [])]
      lines.push(`${index + 1}. ${step.title}: ${parts.join(', ')}`)
    })
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}
