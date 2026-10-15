import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { componentFacts, indexGraph, renderPortal, storiesIn, type GraphDocument } from '../src/index.ts'

// Component pages (decision 0013, point 2): one semantic component joined to its
// implementations, design library, uses, journey steps and conflicts.

const read = (path: string) => indexGraph(JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as GraphDocument)

test('the Card joins its four implementations, its uses in design and code, its journey steps and its conflicts', () => {
  const graph = read('../../demo/card/out/resolved.graph.json')
  const facts = componentFacts(graph, 'semantic:card', storiesIn(graph, 'card'))
  assert.deepEqual(facts.implementations.map((item) => [item.platform, item.framework, item.confirmed]), [
    ['android', 'compose', true],
    ['ios', 'uikit', true],
    ['web', 'react', true],
    ['web', 'web-components', true],
  ])
  // A variant a platform can't express is shown as `none`, never left out.
  assert.deepEqual(facts.implementations.find((item) => item.framework === 'web-components')!.variants.map((item) => [item.variant, item.mapping]), [['filled', 'none'], ['outline', 'none']])
  assert.ok(facts.uses.some((use) => use.origin === 'code' && use.fork))
  assert.deepEqual(facts.uses.find((use) => use.id === 'instance:shop.order-summary.card')!.screens, ['target:shop.order-summary'])
  assert.deepEqual(facts.steps.map((step) => step.title), ['Order Summary', 'Promo applied', 'Gift options'])
  assert.ok(facts.conflicts.some((conflict) => conflict.status === 'open'))
  assert.throws(() => componentFacts(graph, 'target:shop.checkout'), /not a semantic component/)
})

test('an inferred implementation shows as unconfirmed, and the portal links components and story steps both ways', () => {
  const graph = read('../../projects/laundry/out/graph.json')
  const facts = componentFacts(graph, 'semantic:laundry.answer-row')
  assert.deepEqual(facts.implementations.map((item) => [item.symbol, item.status, item.confirmed]), [['AnswerRow', 'inferred', false]])

  const card = read('../../demo/card/out/resolved.graph.json')
  const pages = renderPortal(card, storiesIn(card, 'card'), { title: 'Shop' })
  assert.match(pages.get('components/card.html')!, /<a href="\.\.\/stories\/shop-checkout\.html#step-2">Checkout, step 2: Promo applied<\/a>/)
  assert.match(pages.get('stories/shop-checkout.html')!, /<li id="step-2">/)
  assert.match(pages.get('stories/shop-checkout.html')!, /<a href="\.\.\/components\/card\.html">Card<\/a> <span class="muted">design copy, code web copy<\/span>/)
  assert.match(pages.get('index.html')!, /<a href="components\/card\.html">Card<\/a><\/th><td>android \(compose\), ios \(uikit\), web \(react\), web \(web-components\)<\/td>/)
})
