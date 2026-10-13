import assert from 'node:assert/strict'
import { test } from 'node:test'
import { forecastLabel, forecastOverride, indexGraph, type Forecast } from '../src/index.ts'
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

// Decision 0011: an Angular product never borrows React's slots.
const withAngular = (builtWith?: { platform: 'web'; framework: string; package: string }[]) => edited('card-override', (d) => {
  record(d, 'platform:example-web.card').framework = 'react'
  d.records.push({ id: 'platform:example-angular.card', kind: 'platform-component', title: 'Angular Card', platform: 'web', framework: 'angular', library: { package: 'example-design-system-angular' }, symbol: 'ex-card', variants: [] } as never)
  d.links.push({ from: 'platform:example-angular.card', relation: 'implements', to: 'semantic:card', status: 'declared' })
  if (builtWith) record(d, 'target:shop.order-summary').builtWith = builtWith
})
const labelled = (forecasts: Forecast[]) => Object.fromEntries(forecasts.map((f) => [forecastLabel(f), f.outcome]))

test('two frameworks on one platform get two answers, never merged', () => {
  const forecasts = forecastOverride(indexGraph(withAngular()), BADGE, ['web'])
  assert.deepEqual(labelled(forecasts), { 'web (react)': 'supported', 'web (angular)': 'needs-library-change' })
  assert.deepEqual(forecasts.map((forecast) => forecast.componentIds), [['platform:example-web.card'], ['platform:example-angular.card']])
  assert.equal(forecasts[1]!.reason, 'No web (angular) extension point expresses header.badge.')
})

test("a screen's declared code libraries decide which answers it gets, matched by package", () => {
  const angularOnly = withAngular([{ platform: 'web', framework: 'angular', package: 'example-design-system-angular' }])
  assert.deepEqual(labelled(forecastOverride(indexGraph(angularOnly), BADGE, ['web'])), { 'web (angular)': 'needs-library-change' })
  // A declared library nothing in the graph implements the contract in is a library change too.
  const vue = withAngular([{ platform: 'web', framework: 'vue', package: 'example-design-system-vue' }])
  const [forecast] = forecastOverride(indexGraph(vue), BADGE, ['web'])
  assert.deepEqual([forecast!.framework, forecast!.package, forecast!.outcome, forecast!.reason], ['vue', 'example-design-system-vue', 'needs-library-change', 'No web (vue) component in example-design-system-vue implements Card yet.'])
})
