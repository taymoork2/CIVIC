import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { componentStoriesIn, indexGraph, renderPortal, storiesIn, usageFromTapes, type GraphDocument } from '../src/index.ts'

// Component stories (decision 0013, point 1): generated from the contract's variant matrix and
// real usage, rendered on the component page, with an island where a harness mounts the component.

const read = (path: string) => indexGraph(JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as GraphDocument)
const button = () => read('../../demo/fluent-button/out/resolved.graph.json')
const card = () => read('../../demo/card/out/resolved.graph.json')

test('each mapped variant gets a story at rest and disabled gets one on the default variant; unmapped variants get none', () => {
  const web = componentStoriesIn(button()).filter((story) => story.componentId === 'platform:fluent-react-v9.button')
  assert.deepEqual(web.map((story) => [story.variant, story.expression, story.state ?? 'rest', story.from]), [
    ['primary-filled', 'primary', 'rest', 'contract'],
    ['brand-outline', 'outline', 'rest', 'contract'],
    ['neutral-default', 'secondary', 'rest', 'contract'],
    ['subtle', 'subtle', 'rest', 'contract'],
    ['transparent-neutral', 'transparent', 'rest', 'contract'],
    ['neutral-default', 'secondary', 'disabled', 'contract'],
  ])
  // Android maps no danger, neutral default or transparent neutral, so it has no story for them.
  const android = componentStoriesIn(button()).filter((story) => story.platform === 'android')
  assert.ok(!android.some((story) => ['danger', 'neutral-default', 'transparent-neutral'].includes(story.variant)))
})

test('a story names the product uses in code that show it', () => {
  const graph = card()
  const filled = componentStoriesIn(graph).find((story) => story.id === 'story:component.fluent-react-v9.card.filled')!
  assert.equal(filled.instanceIds.length, 3)
  for (const id of filled.instanceIds) assert.equal(graph.get(id)?.kind, 'component-instance')
})

test('the component page shows code stories, with an island only where a harness is given', () => {
  const graph = button()
  const page = renderPortal(graph, storiesIn(graph, 'button'), { title: 'Button', harnesses: { 'platform:fluent-react-v9.button': { module: '../harness.js' } } }).get('components/button.html')!
  assert.match(page, /<h2>Code stories<\/h2>/)
  assert.equal(page.match(/<civic-story /g)?.length, 17)
  const islands = [...page.matchAll(/island="([^"]+)"/g)].map((match) => JSON.parse(match[1]!.replaceAll('&quot;', '"').replaceAll('&amp;', '&')) as { module: string; component: Record<string, string> })
  assert.equal(islands.length, 6)
  assert.deepEqual(islands.at(-1)!.component, { id: 'platform:fluent-react-v9.button', symbol: 'Button', platform: 'web', variant: 'neutral-default', expression: 'secondary', state: 'disabled' })
  assert.match(page, /Native harnesses wait on device runners/)
  assert.match(page, /<script defer src="\.\.\/civic-story\.js"><\/script>/)
})

test('usage harvested from recorded runs: each way a run showed a component, pruned into the story that already shows it', () => {
  const graph = button()
  const step = (components: { component: string; variant?: string; state?: string; props?: Record<string, string> }[]) => ({ gesture: { kind: 'click' }, route: '/', fields: [], view: '[]', operations: [], components })
  const tape = { version: 1 as const, project: 'shop', source: 'abc', initialRoute: '/', steps: [
    step([{ component: 'platform:fluent-react-v9.button', variant: 'primary-filled' }, { component: 'platform:fluent-react-v9.button', props: { size: 'large' } }]),
    step([{ component: 'platform:fluent-react-v9.button', variant: 'primary-filled', state: 'disabled' }, { component: 'platform:unknown.button' }, { component: 'platform:fluent-android.compose-button', variant: 'danger' }]),
  ] }
  const sha = 'a'.repeat(64)
  const harvested = usageFromTapes(graph, new Map([[sha, tape]]))
  assert.deepEqual(harvested.map((story) => [story.id, story.runs]), [
    ['story:component.fluent-react-v9.button.primary-filled', [{ tape: sha, step: 1 }]],
    ['story:component.fluent-react-v9.button.neutral-default.size-large', [{ tape: sha, step: 1 }]],
    ['story:component.fluent-react-v9.button.primary-filled.disabled', [{ tape: sha, step: 2 }]],
  ])
  const stories = componentStoriesIn(graph, harvested)
  // Primary at rest is a contract story already, so the run step is a reference on it.
  assert.deepEqual(stories.find((story) => story.id === 'story:component.fluent-react-v9.button.primary-filled')!.runs, [{ tape: sha, step: 1 }])
  assert.equal(stories.find((story) => story.id === 'story:component.fluent-react-v9.button.neutral-default.size-large')!.from, 'usage')
  const pages = renderPortal(graph, storiesIn(graph, 'button'), { title: 'Button', tapes: new Map([[sha, tape]]) })
  assert.match(pages.get('components/button.html')!, /Seen in 1 recorded run step: <a href="\.\.\/replays\/a{64}\.html#step=2">aaaaaaaa step 2<\/a>/)
  assert.match(pages.get(`replays/${sha}.html`)!, /Components: <code>fluent-react-v9\.button<\/code> primary-filled, disabled/)
})
