import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { completenessOf, designAndCode, forecastLabel, forecastOverride, indexGraph, reviewInstance, validateGraph, type GraphDocument } from '../../graph/src/index.ts'

// The committed Card demo outputs: `node demo/card/build.ts --check` proves they are what
// the inputs produce; these tests pin what the demo must show (roadmap step 2, D29, D32).
const load = (name: string) => JSON.parse(readFileSync(new URL(`../../demo/card/out/${name}.graph.json`, import.meta.url), 'utf8')) as GraphDocument
const outcomes = (graph: ReturnType<typeof indexGraph>, id: string) => Object.fromEntries(forecastOverride(graph, id).map((forecast) => [forecastLabel(forecast), forecast.outcome]))
const INSTANCE = 'instance:shop.order-summary.card'

test('both Card graphs are valid with no warnings', () => {
  assert.deepEqual(validateGraph(load('raised')), [])
  assert.deepEqual(validateGraph(load('resolved')), [])
})

test('each override gets its own answer per platform and framework: flexible React, brittle iOS', () => {
  const graph = indexGraph(load('raised'))
  // The real Fluent 2 web kit draws the header quick action and the footer by default, so
  // Shop using them is not an override. Turning on the header's checkbox is.
  assert.deepEqual(graph.ofKind('override').map((override) => override.id).sort(), ['override:shop.order-summary.card.corner-radius', 'override:shop.order-summary.card.state-selected'])
  // Shop builds web with React and web components (decision 0011): React's selected prop doesn't help <fluent-card>.
  assert.deepEqual(outcomes(graph, 'override:shop.order-summary.card.state-selected'), { 'web (react)': 'supported', 'web (web-components)': 'needs-library-change', 'ios (uikit)': 'needs-library-change', 'android (compose)': 'needs-library-change' })
  // Android's basicCardTokens can set a radius, but the contract forbids a local one everywhere.
  assert.deepEqual(outcomes(graph, 'override:shop.order-summary.card.corner-radius'), { 'web (react)': 'forbidden', 'web (web-components)': 'forbidden', 'ios (uikit)': 'forbidden', 'android (compose)': 'forbidden' })
})

test('every override is unreviewed drift until the maintainers decide, and the design is not yet adoptable', () => {
  const raised = reviewInstance(indexGraph(load('raised')), INSTANCE)
  assert.equal(raised.items.length, 2)
  assert.ok(raised.items.every((item) => item.conflict?.alignment === 'unreviewed-drift' && !item.decision))
  assert.equal(raised.readiness, 'not-yet-adoptable')
  assert.deepEqual(raised.asked.map((owner) => owner.who), ['shop-design', 'design-system-maintainers'])
  assert.deepEqual(raised.told.map((owner) => owner.who), ['fluent-android', 'fluent-ios', 'fluent-web-components', 'shop-engineering', 'shop-qa'])
})

test('the resolved graph keeps the rejection and leaves the selectable Card undecided', () => {
  const resolved = reviewInstance(indexGraph(load('resolved')), INSTANCE)
  const decided = Object.fromEntries(resolved.items.map((item) => [item.override.property, item.decision?.outcome ?? 'open']))
  assert.deepEqual(decided, { 'corner-radius': 'update-design', 'state.selected': 'open' })
  assert.equal(resolved.readiness, 'not-yet-adoptable')
})

test('the completeness check finds the missing loading, empty and error states, a dead end and an unreachable screen', () => {
  const result = completenessOf(indexGraph(load('raised')), 'target:shop.checkout')
  // Gift options shows the Card through Shop's own Gift option component, read once at its definition.
  assert.deepEqual(result.states.map((item) => [item.screenId, item.instanceIds, item.shown, item.missing, item.total]), [
    ['target:shop.gift-options', ['instance:shop.component.gift-option.card'], ['rest'], ['loading', 'empty', 'error'], 7],
    ['target:shop.order-summary', ['instance:shop.order-summary.card', 'instance:shop.order-summary.loading.card'], ['rest'], ['loading', 'empty', 'error'], 7],
  ])
  assert.deepEqual([result.journey.deadEnds, result.journey.unreachable, result.journey.screens.length], [['target:shop.promo-applied'], ['target:shop.gift-options'], 3])
})

test('platform evidence is static analysis read from Fluent source; design evidence is the Figma export', () => {
  const evidence = indexGraph(load('raised')).ofKind('evidence')
  assert.ok(evidence.every((item) => item.tier === 'static-analysis'))
  assert.deepEqual(evidence.map((item) => item.source.importer).sort(), ['custom-elements', 'figma-file', 'figma-file', 'kotlin-source', 'react-code', 'react-types', 'swift-source'])
})

test('the library Card\'s default footer, body and header action are raised where iOS CardView can\'t build them', () => {
  const graph = indexGraph(load('raised'))
  const defaults = graph.ofKind('contract-conflict').filter((conflict) => conflict.id.includes('.default.'))
  assert.deepEqual(defaults.map((conflict) => conflict.id).sort(), ['conflict:card.ios.default.actions', 'conflict:card.ios.default.body', 'conflict:card.ios.default.header-action'])
  assert.ok(defaults.every((conflict) => conflict.platform === 'ios' && conflict.alignment === 'unreviewed-drift'))
})

test("Shop's React code builds the selectable Card the design asks for, and leaves out the rejected radius", () => {
  const graph = indexGraph(load('resolved'))
  const [summary] = designAndCode(graph, 'target:shop.order-summary')
  assert.deepEqual(summary!.code, ['instance:shop.order-summary.web.card'])
  assert.deepEqual(summary!.changes.map((change) => [change.override.property, change.decision ?? 'open', change.code.map((use) => use.extensionPointId)]), [
    ['corner-radius', 'update-design', []],
    ['state.selected', 'open', ['extension:fluent-react-v9.card.selected']],
  ])
  // Shop's GiftOption wrapper is read once, on the same product component the design file defines.
  const [gifts] = designAndCode(graph, 'target:shop.gift-options')
  assert.deepEqual([gifts!.design, gifts!.code], [['instance:shop.component.gift-option.card'], ['instance:shop.component.gift-option.web.card']])
})
