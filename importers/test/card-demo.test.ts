import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { completenessOf, forecastOverride, indexGraph, reviewInstance, validateGraph, type GraphDocument } from '../../graph/src/index.ts'

// The committed Card demo outputs: `node demo/card/build.ts --check` proves they are what
// the inputs produce; these tests pin what the demo must show (roadmap step 2, D29, D32).
const load = (name: string) => JSON.parse(readFileSync(new URL(`../../demo/card/out/${name}.graph.json`, import.meta.url), 'utf8')) as GraphDocument
const outcomes = (graph: ReturnType<typeof indexGraph>, id: string) => Object.fromEntries(forecastOverride(graph, id).map((forecast) => [forecast.platform, forecast.outcome]))
const INSTANCE = 'instance:shop.order-summary.card'

test('both Card graphs are valid with no warnings', () => {
  assert.deepEqual(validateGraph(load('raised')), [])
  assert.deepEqual(validateGraph(load('resolved')), [])
})

test('each override gets its own answer per platform: flexible web and Android, brittle iOS', () => {
  const graph = indexGraph(load('raised'))
  assert.deepEqual(outcomes(graph, 'override:shop.order-summary.card.header-action'), { web: 'supported', ios: 'needs-library-change', android: 'supported' })
  assert.deepEqual(outcomes(graph, 'override:shop.order-summary.card.actions'), { web: 'supported', ios: 'needs-library-change', android: 'supported' })
  assert.deepEqual(outcomes(graph, 'override:shop.order-summary.card.state-selected'), { web: 'supported', ios: 'needs-library-change', android: 'needs-library-change' })
  // Android's basicCardTokens can set a radius, but the contract forbids a local one everywhere.
  assert.deepEqual(outcomes(graph, 'override:shop.order-summary.card.corner-radius'), { web: 'forbidden', ios: 'forbidden', android: 'forbidden' })
})

test('every override is unreviewed drift until the maintainers decide, and the design is not yet adoptable', () => {
  const raised = reviewInstance(indexGraph(load('raised')), INSTANCE)
  assert.equal(raised.items.length, 4)
  assert.ok(raised.items.every((item) => item.conflict?.status === 'open' && item.conflict.alignment === 'unreviewed-drift'))
  assert.equal(raised.readiness, 'not-yet-adoptable')
  assert.deepEqual(raised.asked.map((owner) => owner.who), ['shop-design', 'design-system-maintainers'])
  assert.deepEqual(raised.told.map((owner) => owner.who), ['fluent-android', 'fluent-ios', 'shop-engineering', 'shop-qa'])
})

test('the resolved graph keeps reject, exception and promote, and leaves one change undecided', () => {
  const resolved = reviewInstance(indexGraph(load('resolved')), INSTANCE)
  const decided = Object.fromEntries(resolved.items.map((item) => [item.override.property, item.conflict?.resolution?.outcome ?? 'open']))
  assert.deepEqual(decided, { actions: 'update-contract', 'corner-radius': 'update-design', 'header.action': 'approve-exception', 'state.selected': 'open' })
  assert.equal(resolved.readiness, 'not-yet-adoptable')
})

test('the completeness check finds the missing empty and error states, a dead end and an unreachable screen', () => {
  const result = completenessOf(indexGraph(load('raised')), 'target:shop.checkout')
  assert.deepEqual(result.states.map((item) => [item.screenId, item.shown, item.missing, item.total]), [['target:shop.order-summary', ['rest', 'loading'], ['empty', 'error'], 7]])
  assert.deepEqual([result.journey.deadEnds, result.journey.unreachable, result.journey.screens.length], [['target:shop.promo-applied'], ['target:shop.gift-options'], 3])
})

test('platform evidence is static analysis read from Fluent source; design evidence is the Figma export', () => {
  const evidence = indexGraph(load('raised')).ofKind('evidence')
  assert.ok(evidence.every((item) => item.tier === 'static-analysis'))
  assert.deepEqual(evidence.map((item) => item.source.importer).sort(), ['figma-file', 'figma-file', 'kotlin-source', 'react-types', 'swift-source'])
})
