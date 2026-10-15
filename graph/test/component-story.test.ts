import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { componentStoriesIn, indexGraph, renderPortal, storiesIn, type GraphDocument } from '../src/index.ts'

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
