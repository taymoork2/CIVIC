import { completenessOf } from './completeness.ts'
import type { Graph } from './graph.ts'
import { forecastLabel, forecastOverride } from './forecast.ts'
import type { Platform, SourceRef } from './schema.ts'

// The frame walk (D33): a journey's design frames, joined by their prototype links, walked
// the way a person clicks through the prototype. Everything here is design intent. It says
// what the design shows and where its links go, never how the app behaves, so the walk is
// labelled that way wherever it is shown. Deterministic, read-only, and no model calls (D30).

export const DESIGN_INTENT = 'Design intent: frames and prototype links from the design file, not behavior from running code.'

export interface WalkAction {
  /** The layer the prototype link sits on, such as a button's name. */
  label: string
  /** The frame it leads to, when the link stays in the design. */
  to?: string
  /** Where it leads outside the design, such as a route no frame draws yet. */
  leaves?: string
  source?: SourceRef
}

export interface WalkComponent {
  id: string
  title: string
  semanticId: string
  variant?: string
  state?: string
  /** Each local change on the instance, with whether each platform can build it. */
  overrides: { id: string; title: string; property: string; forecasts: { platform: Platform; framework?: string; outcome: string }[] }[]
}

export interface WalkFrame {
  id: string
  title: string
  scale: 'screen' | 'state'
  source?: SourceRef
  /** State frames of this screen, such as its loading state. */
  states: string[]
  components: WalkComponent[]
  actions: WalkAction[]
  /** No prototype link leads on and the journey doesn't name it as an exit. */
  deadEnd: boolean
  /** No prototype link reaches it from the journey's start. */
  unreachable: boolean
}

export interface FrameWalk {
  journeyId: string
  title: string
  label: typeof DESIGN_INTENT
  /** The design file revision the frames were read at. */
  revisions: string[]
  start: string[]
  /** Every frame, screens in walk order (breadth first from the start, then the unreachable ones), each followed by its states. */
  frames: WalkFrame[]
}

/** The walk through one journey's frames. Only links read from a design file count. */
export function frameWalk(graph: Graph, journeyId: string): FrameWalk {
  const journey = graph.get(journeyId)
  if (journey?.kind !== 'target' || journey.scale !== 'journey') throw new Error(`${journeyId} is not a journey in this graph.`)
  const shape = completenessOf(graph, journeyId).journey
  const screens = new Set(shape.screens)
  const designLinks = (id: string) => graph.linksFrom(id).filter((link) => link.relation === 'navigates' && link.source?.tool === 'figma')

  // Breadth first from the start, following only prototype links between this journey's screens.
  const order: string[] = []
  const queue = [...shape.entry]
  while (queue.length > 0) {
    const id = queue.shift()!
    if (order.includes(id) || !screens.has(id)) continue
    order.push(id)
    for (const link of designLinks(id)) if (link.to) queue.push(link.to)
  }
  for (const id of [...screens].sort()) if (!order.includes(id)) order.push(id)

  const deadEnds = new Set(shape.deadEnds)
  const unreachable = new Set(shape.unreachable)
  const frames: WalkFrame[] = []
  const platforms = journey.platforms ?? []
  const frame = (id: string, scale: 'screen' | 'state'): WalkFrame => {
    const target = graph.get(id)
    const contained = graph.linksFrom(id).filter((link) => link.relation === 'contains' && link.to).map((link) => graph.get(link.to!))
    const states = contained.filter((record) => record?.kind === 'target' && record.scale === 'state').map((record) => record!.id)
    const components = contained.flatMap((record): WalkComponent[] => {
      if (record?.kind !== 'component-instance') return []
      const overrides = graph.ofKind('override').filter((override) => override.instanceId === record.id)
      return [
        {
          id: record.id,
          title: record.title,
          semanticId: record.semanticId,
          ...(record.variant ? { variant: record.variant } : {}),
          ...(record.state ? { state: record.state } : {}),
          overrides: overrides.map((override) => ({
            id: override.id,
            title: override.title,
            property: override.property,
            forecasts: platforms.length > 0 ? forecastOverride(graph, override.id, platforms).map((forecast) => ({ platform: forecast.platform, ...(forecast.framework ? { framework: forecast.framework } : {}), outcome: forecast.outcome })) : [],
          })),
        },
      ]
    })
    // A link to a frame outside this journey, such as another flow's, leaves the walk.
    const inJourney = (to: string) => screens.has(to) || graph.linksTo(to).some((link) => link.relation === 'contains' && screens.has(link.from))
    const actions = designLinks(id).map((link): WalkAction => ({
      label: link.action ?? link.route ?? 'Prototype link',
      ...(link.to && inJourney(link.to) ? { to: link.to } : link.to ? { leaves: `${graph.get(link.to)?.title ?? link.to}, outside this journey` } : { leaves: link.route ?? link.unmapped ?? 'outside the design' }),
      ...(link.source ? { source: link.source } : {}),
    }))
    return {
      id,
      title: target?.title ?? id,
      scale,
      ...(target?.source ? { source: target.source } : {}),
      states,
      components,
      actions: actions.sort((a, b) => a.label.localeCompare(b.label)),
      deadEnd: deadEnds.has(id),
      unreachable: unreachable.has(id),
    }
  }
  for (const id of order) {
    const screen = frame(id, 'screen')
    frames.push(screen, ...screen.states.map((state) => frame(state, 'state')))
  }
  const revisions = [...new Set(frames.flatMap((item) => (item.source?.tool === 'figma' ? [item.source.revision] : [])))].sort()
  return { journeyId, title: journey.title, label: DESIGN_INTENT, revisions, start: shape.entry, frames }
}

/**
 * Follows a path of action labels from the start, as a scenario would: each label must be a
 * prototype link on the frame the walk is on. Returns the frames visited, or where it stopped.
 */
export function walkPath(walk: FrameWalk, labels: string[]): { visited: string[]; stopped?: string } {
  const byId = new Map(walk.frames.map((item) => [item.id, item]))
  const first = walk.start[0]
  if (!first) return { visited: [], stopped: `${walk.title} has no start frame.` }
  const visited = [first]
  for (const label of labels) {
    const here = byId.get(visited.at(-1)!)
    if (!here) return { visited, stopped: `${visited.at(-1)} isn't a frame in ${walk.title}.` }
    const action = here.actions.find((candidate) => candidate.label === label)
    if (!action) return { visited, stopped: `${here.title} has no prototype link "${label}". It has: ${here.actions.map((candidate) => candidate.label).join(', ') || 'none'}.` }
    if (!action.to) return { visited, stopped: `"${label}" on ${here.title} leaves the design for ${action.leaves}; no frame draws it.` }
    visited.push(action.to)
  }
  return { visited }
}

/** The walk as text: one block per frame, in walk order. */
export function renderWalk(walk: FrameWalk): string {
  const titleOf = (id: string) => walk.frames.find((item) => item.id === id)?.title ?? id
  const lines = [`# Frame walk: ${walk.title}`, '', `${walk.label}${walk.revisions.length > 0 ? ` Read at design revision ${walk.revisions.join(', ')}.` : ''}`, '', `Starts on: ${walk.start.map(titleOf).join(', ') || 'no start frame'}.`, '']
  for (const item of walk.frames) {
    lines.push(`## ${item.scale === 'state' ? 'State: ' : ''}${item.title}${item.unreachable ? ' (not reachable from the start)' : ''}`, '')
    for (const component of item.components) {
      lines.push(`- ${component.title}: ${component.semanticId}${component.variant ? `, ${component.variant}` : ''}${component.state ? `, ${component.state}` : ''}`)
      for (const override of component.overrides) lines.push(`  - Override ${override.title} (\`${override.property}\`): ${override.forecasts.map((forecast) => `${forecastLabel(forecast)} ${forecast.outcome}`).join(', ') || 'no platforms listed'}`)
    }
    if (item.states.length > 0) lines.push(`- States drawn: ${item.states.map(titleOf).join(', ')}`)
    for (const action of item.actions) lines.push(`- **${action.label}** ${action.to ? `goes to ${titleOf(action.to)}` : `leaves the design for ${action.leaves}`}`)
    if (item.deadEnd) lines.push('- No prototype link leads on, and the journey doesn\'t name this frame as an exit.')
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}

/**
 * A self-contained page that plays the walk: one frame at a time, its prototype links as
 * buttons, a back button, and the design intent label on every frame. No scripts or styles
 * are loaded from anywhere, so the page opens from disk.
 */
export function renderWalkPage(walk: FrameWalk): string {
  const data = JSON.stringify(walk).replaceAll('<', '\\u003c')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Frame walk: ${escapeHtml(walk.title)}</title>
<style>
:root { --bg: #f7f7f5; --panel: #ffffff; --text: #1d1d1b; --muted: #5f5f5a; --line: #d9d9d4; --accent: #2b5fd9; --warn: #9a5b00; }
@media (prefers-color-scheme: dark) { :root { --bg: #161615; --panel: #20201f; --text: #ededea; --muted: #a5a59f; --line: #3a3a37; --accent: #8fb0ff; --warn: #f0b45c; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 system-ui, sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { font-size: 20px; margin: 0 0 4px; }
.label { border: 1px solid var(--warn); color: var(--warn); border-radius: 6px; padding: 6px 10px; font-size: 13px; margin: 8px 0 16px; }
.frame { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 16px; }
.frame h2 { font-size: 18px; margin: 0 0 4px; }
.muted { color: var(--muted); font-size: 13px; }
ul { padding-left: 18px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
button { font: inherit; border: 1px solid var(--accent); color: var(--accent); background: transparent; border-radius: 6px; padding: 6px 12px; cursor: pointer; }
button[disabled] { border-color: var(--line); color: var(--muted); cursor: not-allowed; }
nav { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
.trail { color: var(--muted); font-size: 13px; }
</style>
</head>
<body>
<main>
<h1>Frame walk: ${escapeHtml(walk.title)}</h1>
<p class="label">${escapeHtml(walk.label)}${walk.revisions.length > 0 ? ` Design revision ${escapeHtml(walk.revisions.join(', '))}.` : ''}</p>
<nav><button id="back" type="button">Back</button><button id="restart" type="button">Start over</button><span class="trail" id="trail"></span></nav>
<section class="frame" id="frame" aria-live="polite"></section>
<noscript><p>This page needs JavaScript to step through the frames. <code>civic walk</code> prints the same walk as text.</p></noscript>
</main>
<script id="walk" type="application/json">${data}</script>
<script>
const walk = JSON.parse(document.getElementById('walk').textContent)
const byId = new Map(walk.frames.map((frame) => [frame.id, frame]))
const titleOf = (id) => (byId.get(id) || { title: id }).title
let trail = walk.start.slice(0, 1)
const el = (tag, text, cls) => { const node = document.createElement(tag); if (text) node.textContent = text; if (cls) node.className = cls; return node }
function show() {
  const frame = byId.get(trail[trail.length - 1])
  const root = document.getElementById('frame')
  root.replaceChildren()
  document.getElementById('trail').textContent = trail.map(titleOf).join(' then ')
  document.getElementById('back').disabled = trail.length < 2
  if (!frame) { root.append(el('p', 'This journey has no start frame.')); return }
  root.append(el('h2', (frame.scale === 'state' ? 'State: ' : '') + frame.title))
  if (frame.source) root.append(el('p', 'Figma node ' + frame.source.anchor + ' in ' + frame.source.path, 'muted'))
  if (frame.components.length > 0) {
    const list = el('ul')
    for (const component of frame.components) {
      const item = el('li', component.title + ': ' + component.semanticId + (component.variant ? ', ' + component.variant : '') + (component.state ? ', ' + component.state : ''))
      if (component.overrides.length > 0) {
        const sub = el('ul')
        for (const override of component.overrides) sub.append(el('li', 'Override ' + override.title + ': ' + override.forecasts.map((f) => (f.framework ? f.platform + ' (' + f.framework + ')' : f.platform) + ' ' + f.outcome).join(', ')))
        item.append(sub)
      }
      list.append(item)
    }
    root.append(list)
  }
  const actions = el('div', '', 'actions')
  for (const state of frame.states) { const button = el('button', 'State: ' + titleOf(state)); button.type = 'button'; button.onclick = () => { trail.push(state); show() }; actions.append(button) }
  for (const action of frame.actions) {
    const button = el('button', action.label)
    button.type = 'button'
    if (action.to) button.onclick = () => { trail.push(action.to); show() }
    else { button.disabled = true; button.title = 'Leaves the design for ' + action.leaves }
    actions.append(button)
  }
  root.append(actions)
  for (const action of frame.actions.filter((a) => !a.to)) root.append(el('p', action.label + ' leaves the design for ' + action.leaves + '; no frame draws it.', 'muted'))
  if (frame.deadEnd) root.append(el('p', "No prototype link leads on, and the journey doesn't name this frame as an exit.", 'muted'))
  if (frame.unreachable) root.append(el('p', "No prototype link reaches this frame from the start.", 'muted'))
  const others = walk.frames.filter((f) => f.unreachable && f.scale === 'screen')
  if (trail.length === 1 && others.length > 0) {
    const p = el('p', 'Not reachable from the start: ', 'muted')
    for (const other of others) { const button = el('button', other.title); button.type = 'button'; button.onclick = () => { trail.push(other.id); show() }; p.append(button, ' ') }
    root.append(p)
  }
}
document.getElementById('back').onclick = () => { if (trail.length > 1) { trail.pop(); show() } }
document.getElementById('restart').onclick = () => { trail = walk.start.slice(0, 1); show() }
show()
</script>
</body>
</html>
`
}

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}
