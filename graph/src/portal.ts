import { readFileSync } from 'node:fs'
import { forecastLabel } from './forecast.ts'
import type { Graph } from './graph.ts'
import { RUN_METHODS, type Evidence } from './schema.ts'
import type { StoriesFile, Story, StoryStep } from './story.ts'
import { renderReplayPage, type RecordedTape } from './replay-player.ts'
import { frameWalk, renderWalkPage, type FrameWalk } from './walk.ts'

// The read-only portal (decision 0013, first slice): the graph's journey stories as static
// pages, where every step is a <civic-story> element. A step renders as a still first, drawn
// from the graph into a declarative shadow root so its styles stay scoped and it shows
// without scripts. Where a step can be played, the element upgrades to a frame on request:
// the frame walk for a design's linked frames, or the screen live in the journey canvas's
// review frame. The portal is just one host; any page that loads civic-story.js can host the
// same element. Pages are written as files and open from disk. No model calls (D30).

export interface PortalOptions {
  /** Shown as the portal's heading. */
  title: string
  /**
   * Where a running journey canvas serves its review frame, such as Laundry's review server.
   * Screens the journey engine read then get a live frame tier. Without it, they stay stills.
   */
  canvas?: string
  /**
   * Recorded runs' tapes by SHA-256, as `civic share-replays` keeps them. A step whose screen a
   * replayed tape starts from gets a replay player for it (decision 0009).
   */
  tapes?: ReadonlyMap<string, RecordedTape>
  /**
   * The island tier (decision 0013): screens the journey engine read mount live in the story
   * through the app's own `mount(container, context)` module, built for the browser. The
   * presets are the project manifest's first persona, role and condition unless named.
   */
  island?: IslandOptions
}

export const STORY_ELEMENT = readFileSync(new URL('./civic-story.js', import.meta.url), 'utf8')

/** Every page of the portal, by path relative to its root. */
export function renderPortal(graph: Graph, stories: StoriesFile, options: PortalOptions): Map<string, string> {
  const pages = new Map<string, string>()
  pages.set('civic-story.js', STORY_ELEMENT)
  pages.set('index.html', indexPage(graph, stories, options))
  for (const story of stories.stories) {
    const walk = story.steps.some((step) => step.walk) ? frameWalk(graph, story.journeyId) : undefined
    if (walk) pages.set(`walks/${slug(story.id)}.html`, renderWalkPage(walk))
    pages.set(`stories/${slug(story.id)}.html`, storyPage(graph, stories, story, walk, options))
    for (const step of story.steps) {
      for (const replay of replaysOn(graph, step, options)) {
        const page = `replays/${replay.sha}.html`
        if (!pages.has(page)) pages.set(page, renderReplayPage({ sha: replay.sha, tape: replay.tape, title: step.title, outcome: replay.evidence.outcome === 'fail' ? 'fail' : 'pass', ...(replay.divergedAt ? { divergedAt: replay.divergedAt } : {}), head: replay.evidence.source.revision }))
      }
    }
  }
  return pages
}

/** A step passes when it has run evidence and all of it passed, and fails when any failed. */
export function stepOutcome(graph: Graph, step: StoryStep): 'pass' | 'fail' | 'none' {
  const runs = runEvidence(graph, step)
  if (runs.some((item) => item.outcome === 'fail')) return 'fail'
  return runs.length > 0 && runs.every((item) => item.outcome === 'pass') ? 'pass' : 'none'
}

function runEvidence(graph: Graph, step: StoryStep): Evidence[] {
  return step.evidenceIds.flatMap((id) => {
    const item = graph.get(id)
    return item?.kind === 'evidence' && (RUN_METHODS as readonly string[]).includes(item.method) ? [item] : []
  })
}

function indexPage(graph: Graph, stories: StoriesFile, options: PortalOptions): string {
  const rows = stories.stories.map((story) => {
    const outcomes = story.steps.map((step) => stepOutcome(graph, step))
    const count = (outcome: string) => outcomes.filter((item) => item === outcome).length
    const records = new Set(story.steps.flatMap((step) => step.recordIds)).size
    const walk = story.steps.some((step) => step.walk)
    return `<tr><th scope="row"><a href="stories/${slug(story.id)}.html">${escapeHtml(story.title)}</a>${walk ? ' <span class="tag">frame walk</span>' : ''}</th><td>${story.steps.length}</td><td>${count('pass')}</td><td>${count('fail')}</td><td>${count('none')}</td><td>${records}</td></tr>`
  })
  const body = `<h1>${escapeHtml(options.title)}</h1>
<p class="muted">Journey stories read from <code>${escapeHtml(stories.graph)}</code>. A story points at the graph's own records, so every still here shows what the graph holds now; nothing is recorded or copied for it.</p>
${stories.stories.length > 0 ? `<div class="table"><table>
<thead><tr><th scope="col">Story</th><th scope="col">Steps</th><th scope="col">Passing</th><th scope="col">Failing</th><th scope="col">No run evidence</th><th scope="col">Open records</th></tr></thead>
<tbody>
${rows.join('\n')}
</tbody>
</table></div>` : '<p>No journey in this graph contains a screen yet.</p>'}
<h2>Playing a story</h2>
<p>Each step is a <code>&lt;civic-story&gt;</code> element. It shows a still first: the step's evidence, paths and design intent, drawn from the graph. A step that can be played offers to upgrade to a frame: the frame walk where the design links its frames, ${options.canvas ? `or the screen live in the journey canvas at <code>${escapeHtml(options.canvas)}</code>, which has to be running` : 'or the screen live in a journey canvas when the portal is built with one'}, and each recorded run replayed from the screen, played back from its tape${options.tapes && options.tapes.size > 0 ? '' : ' (this portal was built with no tapes)'}.${options.island ? ' A screen of the app can also run as an island: its own code mounted live in the story, with no backend and nothing recorded. Islands need the portal served over HTTP. ' : ' '}Nothing plays until you ask.</p>
<p>Any page can host the same element: load <code>civic-story.js</code> and copy a step's <code>&lt;civic-story&gt;</code> markup.</p>`
  return page(options.title, body, '')
}

function storyPage(graph: Graph, stories: StoriesFile, story: Story, walk: FrameWalk | undefined, options: PortalOptions): string {
  const steps = story.steps.map((step, index) => {
    const frames = frameTiers(graph, story, step, options)
    const island = islandOf(graph, step, options)
    const attributes = [`story="${escapeHtml(story.id)}"`, `step="${escapeHtml(step.targetId)}"`, ...(island ? [`island="${escapeHtml(JSON.stringify(island))}"`] : []), ...(frames.length > 0 ? [`frames="${escapeHtml(JSON.stringify(frames))}"`] : [])]
    return `<civic-story ${attributes.join(' ')}>
<template shadowrootmode="open">
<style>${STILL_STYLE}</style>
${still(graph, story, step, index, walk)}
</template>
</civic-story>`
  })
  const body = `<p class="crumbs"><a href="../index.html">All stories</a></p>
<h1>${escapeHtml(story.title)}</h1>
<p class="muted">${story.steps.length} step${story.steps.length === 1 ? '' : 's'} in the order a person meets them, read from <code>${escapeHtml(stories.graph)}</code>. Story <code>${escapeHtml(story.id)}</code> points at journey <code>${escapeHtml(story.journeyId)}</code>.</p>
<ol class="steps">
${steps.map((item) => `<li>${item}</li>`).join('\n')}
</ol>`
  return page(story.title, body, '<script defer src="../civic-story.js"></script>')
}

interface FrameOption { src: string; label: string; note: string; sandbox: string }

export interface IslandOptions {
  /** The built preview module, by URL relative to a story page, exporting `mount(container, context)`. */
  module: string
  /** Stylesheets the screens need, linked inside each island's shadow root. */
  styles?: string[]
  /** The project manifest's presets (`civic.project.json`). */
  personas?: { id: string; label?: string; seed?: unknown }[]
  roles?: { id: string; label?: string }[]
  conditions?: { id: string; label?: string }[]
  /** The scenario registry, for each screen's fixture. */
  scenarios?: { id: string; label?: string; fixture?: unknown }[]
}

function islandOf(graph: Graph, step: StoryStep, options: PortalOptions): Record<string, unknown> | undefined {
  const island = options.island
  const scenario = scenarioOf(graph, step)
  if (!island || !scenario) return undefined
  const registered = island.scenarios?.find((item) => item.id === scenario)
  const [persona, role, condition] = [island.personas?.[0], island.roles?.[0], island.conditions?.[0]]
  return {
    module: island.module,
    ...(island.styles && island.styles.length > 0 ? { styles: island.styles } : {}),
    label: 'Run this screen here',
    note: `Mounts the screen's own code in this page${persona ? ` as ${persona.label ?? persona.id}` : ''}, with no backend and nothing recorded.`,
    scenario: { id: scenario, label: registered?.label ?? step.title, ...(registered?.fixture !== undefined ? { fixture: registered.fixture } : {}) },
    ...(persona ? { persona } : {}),
    ...(role ? { role } : {}),
    ...(condition ? { condition } : {}),
  }
}

/** The scenario a screen the journey engine read is registered under. */
function scenarioOf(graph: Graph, step: StoryStep): string | undefined {
  const target = graph.get(step.targetId)
  return target?.source?.tool === 'journey-engine' && target.source.importer === 'journey-index' ? target.source.anchor : undefined
}

/** The tapes replayed from this screen that the portal has, with each one's latest replay. */
function replaysOn(graph: Graph, step: StoryStep, options: PortalOptions): { sha: string; tape: RecordedTape; evidence: Evidence; divergedAt?: number }[] {
  return step.evidenceIds.flatMap((id) => {
    const item = graph.get(id)
    if (item?.kind !== 'evidence' || item.source.importer !== 'replay') return []
    const sha = /^sha256:([0-9a-f]{64})$/.exec(item.source.contentHash ?? '')?.[1]
    const tape = sha ? options.tapes?.get(sha) : undefined
    if (!sha || !tape) return []
    const diverged = /diverged at step (\d+)/i.exec(item.finding ?? '')?.[1]
    return [{ sha, tape, evidence: item, ...(diverged ? { divergedAt: Number(diverged) } : {}) }]
  })
}

/** Every way the step can be played, best first: the walk or the live screen, then each recorded run. */
function frameTiers(graph: Graph, story: Story, step: StoryStep, options: PortalOptions): FrameOption[] {
  const first = frameTier(graph, story, step, options)
  const replays = replaysOn(graph, step, options).map(({ sha, tape, evidence }): FrameOption => ({
    src: `../replays/${sha}.html`,
    label: `Play the recorded run (${tape.steps.length} step${tape.steps.length === 1 ? '' : 's'})`,
    note: `A recorded run from this screen, played back from its tape; its latest replay ${evidence.outcome === 'fail' ? 'diverged' : 'passed'}.`,
    sandbox: 'allow-scripts',
  }))
  return [...(first ? [first] : []), ...replays]
}

function frameTier(graph: Graph, story: Story, step: StoryStep, options: PortalOptions): FrameOption | undefined {
  if (step.walk) {
    return { src: `../walks/${slug(story.id)}.html#frame=${encodeURIComponent(step.targetId)}`, label: 'Walk the design from here', note: 'The frame walk: design intent from the design file, not behavior from running code.', sandbox: 'allow-scripts' }
  }
  const scenario = scenarioOf(graph, step)
  if (options.canvas && scenario) {
    const base = options.canvas.replace(/\/+$/, '')
    return { src: `${base}/review-frame.html?scenario=${encodeURIComponent(scenario)}`, label: 'Play this screen live', note: `Opens the screen in the journey canvas's review frame at ${base}, with synthetic data. That server has to be running.`, sandbox: 'allow-scripts allow-same-origin allow-forms' }
  }
  return undefined
}

function still(graph: Graph, story: Story, step: StoryStep, index: number, walk: FrameWalk | undefined): string {
  const title = (id: string) => graph.get(id)?.title ?? id
  const outcome = stepOutcome(graph, step)
  const evidence = step.evidenceIds.flatMap((id) => {
    const item = graph.get(id)
    if (item?.kind !== 'evidence') return []
    return [`<li><span class="outcome ${item.outcome}">${escapeHtml(item.outcome)}</span> ${escapeHtml(item.title)} <span class="muted">${escapeHtml(item.method)}, ${escapeHtml(item.source.revision.slice(0, 12))}</span>${item.finding ? `<br><span class="muted">${escapeHtml(item.finding)}</span>` : ''}</li>`]
  })
  const paths = graph.linksFrom(step.targetId).filter((link) => link.relation === 'navigates').map((link) => `<li>${escapeHtml(link.action ?? 'Path')} to ${escapeHtml(link.to ? title(link.to) : `unmapped ${link.unmapped ?? 'destination'}`)} <span class="muted">${escapeHtml(link.status)}${link.source?.tool === 'figma' ? ', prototype link' : ''}</span></li>`)
  const frames = step.designFrames.map((frame) => `<li>${escapeHtml(frame.node)} <span class="muted">${escapeHtml(frame.file)}</span></li>`)
  const components = (walk?.frames.find((frame) => frame.id === step.targetId)?.components ?? []).map((component) => `<li>${escapeHtml(component.title)}: ${escapeHtml(component.semanticId)}${component.variant ? `, ${escapeHtml(component.variant)}` : ''}${component.state ? `, ${escapeHtml(component.state)}` : ''}${component.overrides.length > 0 ? `<ul>${component.overrides.map((override) => `<li>Override ${escapeHtml(override.title)}: ${escapeHtml(override.forecasts.map((forecast) => `${forecastLabel(forecast)} ${forecast.outcome}`).join(', ') || 'no platforms listed')}</li>`).join('')}</ul>` : ''}</li>`)
  const records = step.recordIds.flatMap((id) => {
    const item = graph.get(id)
    return item?.kind === 'collaboration' ? [`<li>${escapeHtml(item.type)}: ${escapeHtml(item.title)}</li>`] : []
  })
  const section = (heading: string, items: string[], empty?: string) => (items.length > 0 ? `<section><h4>${heading}</h4><ul>${items.join('')}</ul></section>` : empty ? `<section><h4>${heading}</h4><p class="muted">${empty}</p></section>` : '')
  return `<article class="still" part="still">
<header><p class="muted">Step ${index + 1} of ${story.steps.length} <span class="outcome ${outcome}">${outcome === 'none' ? 'no run evidence' : outcome}</span></p><h3>${escapeHtml(step.title)}</h3><p class="muted"><code>${escapeHtml(step.targetId)}</code></p></header>
${section('Evidence', evidence, 'None about this screen yet.')}
${section('Paths on', paths, 'None declared.')}
${section('Design intent', [...components, ...frames])}
${section('Open records', records)}
</article>`
}

const STILL_STYLE = `:host { display: block; }
.still { background: var(--panel, #fff); color: var(--text, #1d1d1b); border: 1px solid var(--line, #d9d9d4); border-radius: 10px; padding: 14px 16px; font: 14px/1.5 system-ui, sans-serif; overflow-wrap: anywhere; }
header p { margin: 0; }
h3 { font-size: 17px; margin: 2px 0; }
h4 { font-size: 13px; margin: 12px 0 4px; color: var(--muted, #5f5f5a); font-weight: 600; }
ul { margin: 0; padding-left: 18px; }
p { margin: 0; }
code { font-size: 12px; }
.muted { color: var(--muted, #5f5f5a); font-size: 13px; }
.outcome { display: inline-block; border-radius: 4px; padding: 0 6px; font-size: 12px; border: 1px solid currentColor; }
.outcome.pass { color: var(--pass, #1d7a46); }
.outcome.fail { color: var(--fail, #b3261e); }
.outcome.finding, .outcome.none, .outcome.unknown { color: var(--muted, #5f5f5a); }`

function page(title: string, body: string, head: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root { --bg: #f7f7f5; --panel: #ffffff; --text: #1d1d1b; --muted: #5f5f5a; --line: #d9d9d4; --accent: #2b5fd9; --pass: #1d7a46; --fail: #b3261e; }
@media (prefers-color-scheme: dark) { :root { --bg: #161615; --panel: #20201f; --text: #ededea; --muted: #a5a59f; --line: #3a3a37; --accent: #8fb0ff; --pass: #6fd49a; --fail: #ff8a80; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 system-ui, sans-serif; }
main { max-width: 860px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { font-size: 22px; margin: 0 0 6px; }
h2 { font-size: 17px; margin: 24px 0 6px; }
a { color: var(--accent); }
.muted, .crumbs { color: var(--muted); font-size: 13px; }
.tag { font-size: 12px; color: var(--muted); border: 1px solid var(--line); border-radius: 4px; padding: 0 5px; white-space: nowrap; }
.table { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); }
td { font-variant-numeric: tabular-nums; }
.steps { list-style: none; padding: 0; display: grid; gap: 12px; }
</style>
${head}
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`
}

function slug(id: string): string {
  return id.replace(/^story:/, '').replace(/[^a-z0-9-]+/gi, '-').toLowerCase()
}

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}
