import { readFileSync } from 'node:fs'
import { placesOn } from './completeness.ts'
import { componentFacts, type ComponentFacts } from './component-page.ts'
import { componentStoriesIn, type ComponentStory } from './component-story.ts'
import { forecastLabel } from './forecast.ts'
import type { Graph } from './graph.ts'
import { describeLens, lensView, type ResolvedLens } from './lens.ts'
import { RUN_METHODS, type Evidence, type GraphRecord } from './schema.ts'
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
  /**
   * Component harnesses (decision 0013, point 1) by platform component ID: a module, by URL
   * relative to a component page, whose `mount(container, context)` renders that component
   * with the props of `context.component`. Its code stories then run in the page as islands.
   */
  harnesses?: Readonly<Record<string, HarnessOptions>>
  /** Stories imported once from Storybook (decision 0013), pruned into the generated ones where those show them. */
  imported?: readonly ComponentStory[]
  /**
   * The lens the portal is read through (decision 0013, point 3): one design line, one code
   * line and one environment, from the review store's records. Each step then shows its frames
   * on the design line, the run evidence on the code line, and whether the environment runs it,
   * and the lens goes into every story's link. Without one, a step shows everything the graph has.
   */
  lens?: { resolved: ResolvedLens; records: readonly GraphRecord[] }
}

export interface HarnessOptions {
  module: string
  /** Stylesheets the component needs, linked inside each island's shadow root. */
  styles?: string[]
}

export const STORY_ELEMENT = readFileSync(new URL('./civic-story.js', import.meta.url), 'utf8')

/** Every page of the portal, by path relative to its root. */
export function renderPortal(graph: Graph, stories: StoriesFile, options: PortalOptions): Map<string, string> {
  const pages = new Map<string, string>()
  pages.set('civic-story.js', STORY_ELEMENT)
  pages.set('index.html', indexPage(graph, stories, options))
  // Component pages (decision 0013, point 2): each semantic component joined to its implementations, uses and journey steps.
  const codeStories = componentStoriesIn(graph, options.imported)
  for (const semantic of graph.ofKind('semantic-component')) {
    const own = codeStories.filter((story) => story.semanticId === semantic.id)
    pages.set(`components/${componentSlug(semantic.id)}.html`, componentPage(componentFacts(graph, semantic.id, stories), stories, own, options))
  }
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
    return `<tr><th scope="row"><a href="stories/${slug(story.id)}.html${lensSuffix(options)}">${escapeHtml(story.title)}</a>${walk ? ' <span class="tag">frame walk</span>' : ''}</th><td>${story.steps.length}</td><td>${count('pass')}</td><td>${count('fail')}</td><td>${count('none')}</td><td>${records}</td></tr>`
  })
  const body = `<h1>${escapeHtml(options.title)}</h1>${lensBar(options)}
<p class="muted">Journey stories read from <code>${escapeHtml(stories.graph)}</code>. A story points at the graph's own records, so every still here shows what the graph holds now; nothing is recorded or copied for it.</p>
${stories.stories.length > 0 ? `<div class="table"><table>
<thead><tr><th scope="col">Story</th><th scope="col">Steps</th><th scope="col">Passing</th><th scope="col">Failing</th><th scope="col">No run evidence</th><th scope="col">Open records</th></tr></thead>
<tbody>
${rows.join('\n')}
</tbody>
</table></div>` : '<p>No journey in this graph contains a screen yet.</p>'}
${componentTable(graph, stories)}
<h2>Playing a story</h2>
<p>Each step is a <code>&lt;civic-story&gt;</code> element. It shows a still first: the step's evidence, paths and design intent, drawn from the graph. A step that can be played offers to upgrade to a frame: the frame walk where the design links its frames, ${options.canvas ? `or the screen live in the journey canvas at <code>${escapeHtml(options.canvas)}</code>, which has to be running` : 'or the screen live in a journey canvas when the portal is built with one'}, and each recorded run replayed from the screen, played back from its tape${options.tapes && options.tapes.size > 0 ? '' : ' (this portal was built with no tapes)'}.${options.island ? ' A screen of the app can also run as an island: its own code mounted live in the story, with no backend and nothing recorded. Islands need the portal served over HTTP. ' : ' '}Nothing plays until you ask.</p>
<p>Any page can host the same element: load <code>civic-story.js</code> and copy a step's <code>&lt;civic-story&gt;</code> markup.</p>`
  return page(options.title, body, '')
}

function storyPage(graph: Graph, stories: StoriesFile, story: Story, walk: FrameWalk | undefined, options: PortalOptions): string {
  const steps = story.steps.map((step, index) => {
    const frames = frameTiers(graph, story, step, options)
    const island = islandOf(graph, step, options)
    const attributes = [`story="${escapeHtml(story.id)}"`, `step="${escapeHtml(step.targetId)}"`, ...(options.lens?.resolved.query ? [`lens="${escapeHtml(options.lens.resolved.query)}"`] : []), ...(island ? [`island="${escapeHtml(JSON.stringify(island))}"`] : []), ...(frames.length > 0 ? [`frames="${escapeHtml(JSON.stringify(frames))}"`] : [])]
    return `<civic-story ${attributes.join(' ')}>
<template shadowrootmode="open">
<style>${STILL_STYLE}</style>
${still(graph, story, step, index, walk, options)}
</template>
</civic-story>`
  })
  const body = `<p class="crumbs"><a href="../index.html">All stories</a></p>
<h1>${escapeHtml(story.title)}</h1>${lensBar(options)}
<p class="muted">${story.steps.length} step${story.steps.length === 1 ? '' : 's'} in the order a person meets them, read from <code>${escapeHtml(stories.graph)}</code>. Story <code>${escapeHtml(story.id)}</code> points at journey <code>${escapeHtml(story.journeyId)}</code>.</p>
<ol class="steps">
${steps.map((item, index) => `<li id="step-${index + 1}">${item}</li>`).join('\n')}
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
  const environment = options.lens?.resolved.environment
  const scenario = scenarioOf(graph, step)
  const live = environment?.canvas && environment.url && scenario
    ? [{ src: `${environment.url.replace(/\/+$/, '')}/review-frame.html?scenario=${encodeURIComponent(scenario)}`, label: `Play on ${environment.title}`, note: `Opens the screen in the journey canvas ${environment.title} serves at ${environment.url}, with synthetic data.`, sandbox: 'allow-scripts allow-same-origin allow-forms' }]
    : []
  return [...(first ? [first] : []), ...live, ...replays]
}

function lensSuffix(options: PortalOptions): string {
  return options.lens?.resolved.query ? `?${escapeHtml(options.lens.resolved.query)}` : ''
}

function lensBar(options: PortalOptions): string {
  if (!options.lens) return ''
  return `\n<p class="lens">Seen through ${escapeHtml(describeLens(options.lens.resolved))}. The lens is part of each story's link.</p>`
}

/** What the step looks like through the portal's lens: the design line's frames, the code line's runs, and the environment. */
function lensSection(graph: Graph, step: StoryStep, options: PortalOptions): string {
  if (!options.lens) return ''
  const { resolved, records } = options.lens
  const view = lensView(graph, records, resolved, step.targetId)
  const items = [
    ...(resolved.design ? (view.frames.length > 0 ? view.frames.map((frame) => `<li>Design on ${escapeHtml(resolved.design!.title)}: ${escapeHtml(frame.page)} / ${escapeHtml(frame.name)} <span class="muted">${escapeHtml(frame.change === 'no base' ? 'no base to compare' : `${frame.change} from the base`)}</span></li>`) : [`<li>Design on ${escapeHtml(resolved.design.title)}: no frame designs this screen.</li>`]) : []),
    ...(resolved.code ? [`<li>Runs on ${escapeHtml(resolved.code.title)}: ${view.runs.length > 0 ? view.runs.map((run) => `<span class="outcome ${run.outcome}">${escapeHtml(run.outcome)}</span> ${escapeHtml(run.title)}`).join(', ') : 'none'}${view.elsewhere > 0 ? ` <span class="muted">(${view.elsewhere} from other lines set aside)</span>` : ''}</li>`] : []),
    ...(resolved.environment ? [`<li>${escapeHtml(resolved.environment.title)}: ${!resolved.code ? 'pick a code line to compare' : view.deployed ? (view.deployed.current ? `runs ${escapeHtml(resolved.code.title)} at its head` : `runs ${escapeHtml(resolved.code.title)} at ${escapeHtml(view.deployed.revision.slice(0, 12))}, behind its head`) : `doesn't run ${escapeHtml(resolved.code.title)}`}</li>`] : []),
  ]
  return `\n<section><h4>Through the lens</h4><ul>${items.join('')}</ul></section>`
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

function still(graph: Graph, story: Story, step: StoryStep, index: number, walk: FrameWalk | undefined, options: PortalOptions): string {
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
  // The components the screen uses, in design or code, each linked to its component page.
  const places = new Set(placesOn(graph, step.targetId))
  const used = new Map<string, string[]>()
  for (const instance of graph.ofKind('component-instance').filter((item) => places.has(item.placedOn))) {
    used.set(instance.semanticId, [...(used.get(instance.semanticId) ?? []), `${instance.origin}${instance.platform ? ` ${instance.platform}` : ''}${instance.fork ? ' copy' : ''}`])
  }
  const usedComponents = [...used.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, uses]) => `<li><a href="../components/${componentSlug(id)}.html">${escapeHtml(title(id))}</a> <span class="muted">${escapeHtml([...new Set(uses)].join(', '))}</span></li>`)
  const section = (heading: string, items: string[], empty?: string) => (items.length > 0 ? `<section><h4>${heading}</h4><ul>${items.join('')}</ul></section>` : empty ? `<section><h4>${heading}</h4><p class="muted">${empty}</p></section>` : '')
  return `<article class="still" part="still">
<header><p class="muted">Step ${index + 1} of ${story.steps.length} <span class="outcome ${outcome}">${outcome === 'none' ? 'no run evidence' : outcome}</span></p><h3>${escapeHtml(step.title)}</h3><p class="muted"><code>${escapeHtml(step.targetId)}</code></p></header>
${section('Evidence', evidence, 'None about this screen yet.')}
${section('Paths on', paths, 'None declared.')}
${section('Design intent', [...components, ...frames])}
${section('Components', usedComponents)}
${section('Open records', records)}${lensSection(graph, step, options)}
</article>`
}

const STILL_STYLE = `:host { display: block; }
a { color: var(--accent, #2b5fd9); }
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
td.none { color: var(--fail); }
td.closest { color: var(--muted); }
.steps { list-style: none; padding: 0; display: grid; gap: 12px; }
.lens { border: 1px solid var(--accent); border-radius: 6px; padding: 6px 10px; font-size: 13px; }
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

function componentTable(graph: Graph, stories: StoriesFile): string {
  const rows = graph.ofKind('semantic-component').map((semantic) => {
    const facts = componentFacts(graph, semantic.id, stories)
    const platforms = [...new Set(facts.implementations.map((item) => (item.framework ? `${item.platform} (${item.framework})` : item.platform)))].join(', ') || 'none'
    const open = facts.conflicts.filter((item) => item.status === 'open').length
    return `<tr><th scope="row"><a href="components/${componentSlug(semantic.id)}.html">${escapeHtml(semantic.title)}</a></th><td>${escapeHtml(platforms)}</td><td>${facts.uses.length}</td><td>${facts.steps.length}</td><td>${open}</td></tr>`
  })
  if (rows.length === 0) return ''
  return `<h2>Components</h2>
<p class="muted">Each component's page joins its contract, its implementation on each platform, its uses in design and code, and the journey steps whose screens use it.</p>
<div class="table"><table>
<thead><tr><th scope="col">Component</th><th scope="col">Implemented on</th><th scope="col">Uses</th><th scope="col">Journey steps</th><th scope="col">Open conflicts</th></tr></thead>
<tbody>
${rows.join('\n')}
</tbody>
</table></div>`
}

function componentPage(facts: ComponentFacts, stories: StoriesFile, codeStories: ComponentStory[], options: PortalOptions): string {
  const { semantic } = facts
  const list = (items: string[], empty: string) => (items.length > 0 ? `<ul>${items.join('')}</ul>` : `<p class="muted">${empty}</p>`)
  const variantRows = semantic.variants.map((variant) => `<tr><th scope="row">${escapeHtml(variant.title)} <code>${escapeHtml(variant.key)}</code></th>${facts.implementations.map((component) => {
    const mapped = component.variants.find((item) => item.variant === variant.key)!
    return `<td class="${mapped.mapping}">${escapeHtml(mapped.mapping)}${mapped.expression ? `<br><code>${escapeHtml(mapped.expression)}</code>` : ''}${mapped.note ? `<br><span class="muted">${escapeHtml(mapped.note)}</span>` : ''}</td>`
  }).join('')}</tr>`)
  const body = `<p class="crumbs"><a href="../index.html">All stories and components</a></p>
<h1>${escapeHtml(semantic.title)}</h1>
<p>${escapeHtml(semantic.purpose)}</p>
<p class="muted"><code>${escapeHtml(semantic.id)}</code>. States: ${escapeHtml(semantic.states.join(', ') || 'none')}${semantic.productStates.length > 0 ? `; the product shows ${escapeHtml(semantic.productStates.join(', '))}` : ''}.${semantic.slots.length > 0 ? ` Slots: ${escapeHtml(semantic.slots.join(', '))}.` : ''} Read from <code>${escapeHtml(stories.graph)}</code>.</p>
<h2>Implementations</h2>
${facts.implementations.length > 0 ? `<ul>${facts.implementations.map((component) => `<li><strong>${escapeHtml(component.platform)}${component.framework ? ` (${escapeHtml(component.framework)})` : ''}</strong>: <code>${escapeHtml(component.symbol)}</code> from <code>${escapeHtml(component.package)}${component.version ? `@${escapeHtml(component.version)}` : ''}</code>${component.confirmed ? '' : ` <span class="muted">(${escapeHtml(component.status)}, not confirmed yet)</span>`}${component.extraVariants.length > 0 ? `<br><span class="muted">Also offers ${escapeHtml(component.extraVariants.join(', '))}, which no contract variant covers.</span>` : ''}</li>`).join('')}</ul>` : '<p class="muted">No platform implements it yet.</p>'}
${facts.implementations.length > 0 && semantic.variants.length > 0 ? `<h2>Variants by platform</h2>
<div class="table"><table>
<thead><tr><th scope="col">Variant</th>${facts.implementations.map((component) => `<th scope="col">${escapeHtml(component.platform)}${component.framework ? ` (${escapeHtml(component.framework)})` : ''}</th>`).join('')}</tr></thead>
<tbody>
${variantRows.join('\n')}
</tbody>
</table></div>` : ''}${codeStoriesSection(facts, codeStories, options)}
<h2>Design library</h2>
${list(facts.libraries.map((library) => `<li><code>${escapeHtml(library.file)}</code>, published key <code>${escapeHtml(library.key)}</code></li>`), 'No instance names the library file it comes from.')}
<h2>Uses</h2>
${list(facts.uses.map((use) => `<li>${escapeHtml(use.title)} <span class="muted">${escapeHtml([use.product, use.origin, use.platform, use.variant, use.state].filter(Boolean).join(', '))}${use.fork ? ', a copy of the library component' : ''}</span>${use.overrides.length > 0 ? `<br><span class="muted">Overrides: ${escapeHtml(use.overrides.join('; '))}</span>` : ''}</li>`), 'No product use is in the graph.')}
<h2>In journeys</h2>
${list(facts.steps.map((step) => `<li><a href="../stories/${slug(step.storyId)}.html#step-${step.index + 1}">${escapeHtml(step.storyTitle)}, step ${step.index + 1}: ${escapeHtml(step.title)}</a></li>`), 'No journey step shows a screen that uses it.')}
<h2>Conflicts</h2>
${list(facts.conflicts.map((conflict) => `<li>${escapeHtml(conflict.title)} <span class="muted">${escapeHtml([conflict.platform, conflict.status === 'open' ? 'open' : `decided: ${conflict.outcome ?? ''}`, conflict.alignment].filter(Boolean).join(', '))}</span></li>`), 'None.')}`
  return page(semantic.title, body, codeStories.length > 0 ? '<script defer src="../civic-story.js"></script>' : '')
}

/** Code stories per implementation: a still of the props, and an island where a harness mounts the component. */
function codeStoriesSection(facts: ComponentFacts, codeStories: ComponentStory[], options: PortalOptions): string {
  if (codeStories.length === 0) return ''
  const section = (groups: string[]) => `\n<h2>Code stories</h2>
<p class="muted">Generated, not written: one story per variant the implementation maps, the disabled state on its default variant, and each product use in code the variants don't already show.${options.imported && options.imported.length > 0 ? ' Storybook stories imported once are pruned into these where they show the same thing, and kept as their own where they set more props.' : ''}${options.harnesses && Object.keys(options.harnesses).length > 0 ? ' A story with a harness renders the real component on request; islands need the portal served over HTTP.' : ''}</p>
${groups.join('\n')}`
  const groups = facts.implementations.flatMap((component) => {
    const own = codeStories.filter((story) => story.componentId === component.id)
    if (own.length === 0) return []
    const harness = options.harnesses?.[component.id]
    const name = `${component.platform}${component.framework ? ` (${component.framework})` : ''}`
    const items = own.map((story) => {
      const island = harness
        ? {
            module: harness.module,
            ...(harness.styles && harness.styles.length > 0 ? { styles: harness.styles } : {}),
            label: 'Render it here',
            note: `Mounts ${component.symbol} from ${component.package} in this page with these props, through the component's harness.`,
            component: { id: component.id, symbol: component.symbol, platform: component.platform, ...(component.framework ? { framework: component.framework } : {}), variant: story.variant, expression: story.expression, ...(story.state ? { state: story.state } : {}), ...(story.props ? { props: Object.fromEntries(Object.entries(story.props).filter(([, value]) => value !== null)) } : {}) },
          }
        : undefined
      const attributes = [`story="${escapeHtml(story.id)}"`, `step="${escapeHtml(story.componentId)}"`, ...(island ? [`island="${escapeHtml(JSON.stringify(island))}"`] : [])]
      const used = story.instanceIds.length
      return `<li><civic-story ${attributes.join(' ')}>
<template shadowrootmode="open">
<style>${STILL_STYLE}</style>
<article class="still">
<h3>${escapeHtml(story.title)}</h3>
<p><code>${escapeHtml(component.symbol)}</code> with <code>${escapeHtml(story.expression)}</code>${story.state ? `, ${escapeHtml(story.state)}` : ''}${Object.entries(story.props ?? {}).map(([name, value]) => `, <code>${escapeHtml(name)}${value === null ? '' : `=${escapeHtml(String(value))}`}</code>${value === null ? ' (set in code)' : ''}`).join('')} <span class="muted">(${escapeHtml(story.mapping)}${story.from === 'usage' ? ', from a product use' : story.from === 'storybook' ? ', imported from Storybook' : ''})</span></p>
${story.note ? `<p class="muted">${escapeHtml(story.note)}</p>` : ''}${story.storybook && story.storybook.length > 0 ? `\n<p class="muted">Stands for Storybook's ${escapeHtml([...new Set(story.storybook.map((ref) => `${ref.story} (“${ref.label}”)`))].join(', '))}.${[...new Set(story.storybook.flatMap((ref) => ref.undeclared ?? []))].length > 0 ? ` It also sets ${escapeHtml([...new Set(story.storybook.flatMap((ref) => ref.undeclared ?? []))].join(', '))}, which no extension point declares.` : ''}</p>` : ''}
<p class="muted">${used > 0 ? `${used} product use${used === 1 ? '' : 's'} in code show${used === 1 ? 's' : ''} this.` : 'No product use in code shows this yet.'}</p>
</article>
</template>
</civic-story></li>`
    })
    const why = harness
      ? ''
      : component.platform === 'web'
        ? '<p class="muted">No harness was given for this implementation, so its stories stay stills.</p>'
        : '<p class="muted">Native harnesses wait on device runners, as the native crawl does, so these stay stills.</p>'
    return [`<h3>${escapeHtml(name)}: <code>${escapeHtml(component.symbol)}</code></h3>
${why}
<ul class="steps">
${items.join('\n')}
</ul>`]
  })
  return section(groups)
}

function componentSlug(id: string): string {
  return id.replace(/^semantic:/, '').replace(/[^a-z0-9-]+/gi, '-').toLowerCase()
}

function slug(id: string): string {
  return id.replace(/^story:/, '').replace(/[^a-z0-9-]+/gi, '-').toLowerCase()
}

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}
