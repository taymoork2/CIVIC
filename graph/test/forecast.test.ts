import assert from 'node:assert/strict'
import { test } from 'node:test'
import { forecastOverride, indexGraph, type Forecast } from '../src/index.ts'
import { edited, example, record } from './helpers.ts'

const outcomes = (forecasts: Forecast[]) => Object.fromEntries(forecasts.map((f) => [f.platform, f.outcome]))
const BADGE = 'override:shop.order-summary.card.price-badge'
const RADIUS = 'override:shop.order-summary.card.radius'

test('a header badge is supported on web, and needs a library change on iOS and Android', () => {
  const forecasts = forecastOverride(indexGraph(example('card-override')), BADGE)
  assert.deepEqual(outcomes(forecasts), { web: 'supported', ios: 'needs-library-change', android: 'needs-library-change' })
  assert.equal(forecasts[0]!.extensionPointId, 'extension:example-web.card.header')
})

test('a local corner radius is forbidden by the Card contract on every platform', () => {
  const forecasts = forecastOverride(indexGraph(example('card-override')), RADIUS, ['web', 'ios'])
  assert.deepEqual(outcomes(forecasts), { web: 'forbidden', ios: 'forbidden' })
  assert.ok(forecasts.every((forecast) => forecast.ruleKey === 'shape-from-token'))
})

test('a rule limited to one kind of change does not forbid other changes to that property', () => {
  const graph = indexGraph(edited('card-override', (d) => { record(d, RADIUS).change = 'set-property' }))
  assert.deepEqual(outcomes(forecastOverride(graph, RADIUS, ['web'])), { web: 'needs-library-change' })
})

test('a detached instance is never supported', () => {
  const graph = indexGraph(edited('card-override', (d) => { record(d, BADGE).change = 'detach' }))
  assert.deepEqual(outcomes(forecastOverride(graph, BADGE, ['web'])), { web: 'needs-library-change' })
})

test('a proposed implementation does not make an override look supported', () => {
  const graph = indexGraph(edited('card-override', (d) => { d.links.find((l) => l.from === 'platform:example-web.card')!.status = 'proposed' }))
  assert.deepEqual(outcomes(forecastOverride(graph, BADGE, ['web'])), { web: 'needs-library-change' })
})

test('an extension point covers nested properties but not siblings', () => {
  const graph = indexGraph(edited('card-override', (d) => { record(d, BADGE).property = 'header.title' }))
  assert.deepEqual(outcomes(forecastOverride(graph, BADGE, ['ios'])), { ios: 'supported' })
  const sibling = indexGraph(edited('card-override', (d) => { record(d, BADGE).property = 'header-extra' }))
  assert.deepEqual(outcomes(forecastOverride(sibling, BADGE, ['web'])), { web: 'needs-library-change' })
})
