import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { hasDifferences, indexGraph, renderStoryDifferences, storyDifferences, type GraphDocument } from '../src/index.ts'

// Story differences at the gate (decision 0013, point 4): a change from one role shows to the
// others as differences in the stories they read.

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as GraphDocument

test('nothing moved, nothing to show', () => {
  const card = read('../../demo/card/out/resolved.graph.json')
  assert.equal(hasDifferences(storyDifferences('card', indexGraph(card), indexGraph(structuredClone(card)))), false)
})

test("a library change reaches every journey step that uses the component, and removes the code story it no longer maps", () => {
  const base = read('../../demo/card/out/resolved.graph.json')
  const head = structuredClone(base)
  const react = head.records.find((record) => record.id === 'platform:fluent-react-v9.card')!
  if (react.kind !== 'platform-component') throw new Error('expected the React Card')
  react.variants = react.variants.map((variant) => (variant.semanticVariant === 'outline' ? { semanticVariant: 'outline', mapping: 'none', note: 'Dropped in this release.' } : variant))
  const differences = storyDifferences('card', indexGraph(base), indexGraph(head))
  assert.deepEqual(differences.components.map((item) => [item.semanticId, item.moved, item.storiesRemoved, item.reaches.length]), [['semantic:card', ['platform:fluent-react-v9.card'], ['story:component.fluent-react-v9.card.outline'], 3]])
  assert.deepEqual(differences.steps.map((step) => [step.title, step.change, step.screen, step.components.map((component) => component.id)]), [
    ['Order Summary', 'screen', false, ['semantic:card']],
    ['Promo applied', 'screen', false, ['semantic:card']],
    ['Gift options', 'screen', false, ['semantic:card']],
  ])
  const text = renderStoryDifferences([differences])
  assert.match(text, /- Checkout, step 2 \(Promo applied\) uses Card, which this change moved\./)
  assert.match(text, /- Card \(`semantic:card`\) moved in 1 record; it removes code stories story:component\.fluent-react-v9\.card\.outline; reaches 3 journey steps: Checkout 1, Checkout 2, Checkout 3\./)
})

test('a step that newly fails points back to the journey, and a capture that only moves sources shows nothing', () => {
  const base = read('../../projects/laundry/out/graph.json')
  const head = structuredClone(base)
  for (const record of head.records) if (record.source) record.source = { ...record.source, revision: 'f'.repeat(40) }
  assert.equal(hasDifferences(storyDifferences('laundry', indexGraph(base), indexGraph(head))), false)
  const run = head.records.find((record) => record.kind === 'evidence' && record.method === 'playwright' && record.subjectIds.includes('target:laundry.route.drying.washer-queued'))!
  if (run.kind !== 'evidence') throw new Error('expected a run')
  run.outcome = 'fail'
  const differences = storyDifferences('laundry', indexGraph(base), indexGraph(head))
  assert.deepEqual(differences.steps.filter((step) => step.storyTitle === 'Drying').map((step) => [step.index, step.change, step.from, step.to]), [[2, 'outcome', 'pass', 'fail']])
  assert.match(renderStoryDifferences([differences]), /- Drying, step 2 \(Drying · washed pieces queued\) now fails \(was passing\)\./)
})
