import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { indexGraph, renderPortal, renderStories, stepOutcome, storiesIn, STORIES_SCHEMA, type DesignExport, type GraphDocument } from '../src/index.ts'

// Journey stories (decision 0013): stories point at the graph's own records, and the portal
// renders each step as a <civic-story> still that can upgrade to a frame.

const read = <T>(path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T
const card = () => indexGraph(read<GraphDocument>('../../demo/card/out/resolved.graph.json'))
const laundry = () => indexGraph(read<GraphDocument>('../../projects/laundry/out/graph.json'))

test('a story follows its journey from the entry along paths and only points at records', () => {
  const file = storiesIn(card(), 'card')
  assert.equal(file.schema, STORIES_SCHEMA)
  assert.deepEqual(file.stories.map((story) => story.id), ['story:shop.checkout'])
  const [story] = file.stories
  assert.deepEqual(story!.steps.map((step) => step.targetId), ['target:shop.order-summary', 'target:shop.promo-applied', 'target:shop.gift-options'])
  // The design links the checkout's frames, so every step can play the frame walk.
  assert.ok(story!.steps.every((step) => step.walk))
  // Pointing, not copying: every ID a story holds is a record in the graph.
  const graph = card()
  for (const step of story!.steps) for (const id of [step.targetId, ...step.evidenceIds, ...step.recordIds]) assert.ok(graph.get(id), id)
  assert.match(renderStories(file), /1\. Order Summary: 0 evidence, frame walk/)
})

test('Laundry gets a story per journey with screens, with its run evidence and open records, and no story for the specimen catalog', () => {
  const graph = laundry()
  const design = read<DesignExport>('../../projects/laundry/out/design.json')
  const file = storiesIn(graph, 'laundry', { designs: [{ file: 'design.json', design }] })
  assert.equal(file.stories.length, 12)
  assert.ok(!file.stories.some((story) => story.title === 'Existing specimens'))
  const drying = file.stories.find((story) => story.id === 'story:laundry.journey.drying')!
  assert.deepEqual(drying.steps.map((step) => [step.title, stepOutcome(graph, step), step.recordIds.length]), [
    ['Drying check · from hanging reminder', 'none', 1],
    ['Drying · washed pieces queued', 'pass', 0],
  ])
  assert.ok(file.stories.every((story) => story.steps.every((step) => !step.walk)))
})

test('the portal renders each step as a still in a declarative shadow root, upgrading to the walk or a live canvas frame', () => {
  const pages = renderPortal(card(), storiesIn(card(), 'card'), { title: 'Shop' })
  assert.deepEqual([...pages.keys()].sort(), ['civic-story.js', 'index.html', 'stories/shop-checkout.html', 'walks/shop-checkout.html'])
  const story = pages.get('stories/shop-checkout.html')!
  assert.equal(story.match(/<civic-story /g)?.length, 3)
  assert.match(story, /<template shadowrootmode="open">/)
  assert.match(story, /&quot;src&quot;:&quot;\.\.\/walks\/shop-checkout\.html#frame=target%3Ashop\.promo-applied&quot;/)
  assert.match(story, /Override Local cornerRadius 20: web \(react\) forbidden/)
  // The walk page opens at the frame a step names.
  assert.match(pages.get('walks/shop-checkout.html')!, /#frame=/)
  assert.match(pages.get('civic-story.js')!, /customElements\.define\('civic-story'/)

  const live = renderPortal(laundry(), storiesIn(laundry(), 'laundry'), { title: 'Laundry', canvas: 'http://127.0.0.1:3010/' })
  assert.match(live.get('stories/laundry-journey-drying.html')!, /&quot;src&quot;:&quot;http:\/\/127\.0\.0\.1:3010\/review-frame\.html\?scenario=route\.drying\.washer-queued&quot;/)
  // Without a canvas, journey-engine screens stay stills.
  assert.doesNotMatch(renderPortal(laundry(), storiesIn(laundry(), 'laundry'), { title: 'Laundry' }).get('stories/laundry-journey-drying.html')!, /frames=/)
  assert.match(live.get('index.html')!, /<a href="stories\/laundry-journey-drying\.html">Drying<\/a><\/th><td>2<\/td><td>1<\/td><td>0<\/td><td>1<\/td><td>1<\/td>/)
})

test('with an island, a screen the journey engine read mounts its own code in the story, with the manifest\'s first presets and its fixture', () => {
  const graph = laundry()
  const island = { module: '../app/preview.js', styles: ['../app/preview.css'], personas: [{ id: 'family', label: 'Family' }, { id: 'solo' }], roles: [{ id: 'owner' }], conditions: [{ id: 'normal' }], scenarios: [{ id: 'route.drying.washer-queued', label: 'Washer queued', fixture: { pieces: 6 } }] }
  const page = renderPortal(graph, storiesIn(graph, 'laundry'), { title: 'Laundry', island }).get('stories/laundry-journey-drying.html')!
  const islands = [...page.matchAll(/island="([^"]+)"/g)].map((match) => JSON.parse(match[1]!.replaceAll('&quot;', '"').replaceAll('&amp;', '&')) as Record<string, unknown>)
  assert.equal(islands.length, 2)
  assert.deepEqual(islands[1], {
    module: '../app/preview.js',
    styles: ['../app/preview.css'],
    label: 'Run this screen here',
    note: "Mounts the screen's own code in this page as Family, with no backend and nothing recorded.",
    scenario: { id: 'route.drying.washer-queued', label: 'Washer queued', fixture: { pieces: 6 } },
    persona: { id: 'family', label: 'Family' },
    role: { id: 'owner' },
    condition: { id: 'normal' },
  })
  // Design frames have no code to mount, so the Card demo's walk steps get no island.
  assert.doesNotMatch(renderPortal(card(), storiesIn(card(), 'card'), { title: 'Shop', island }).get('stories/shop-checkout.html')!, /island=/)
})
