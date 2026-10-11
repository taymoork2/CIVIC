import assert from 'node:assert/strict'
import { test } from 'node:test'
import { completenessOf, gapsIn, indexGraph, renderCompleteness, validateGraph } from '../src/index.ts'
import type { GraphDocument } from '../src/schema.ts'
import { edited, example, record } from './helpers.ts'

const JOURNEY = 'target:shop.checkout'
const SCREEN = 'target:shop.order-summary'
const INSTANCE = 'instance:shop.order-summary.card'

/** Adds a second screen to the example's checkout journey, with the given paths. */
function withScreen(document: GraphDocument, id: string, links: { from: string; to: string }[]) {
  document.records.push({ id, kind: 'target', title: 'Gift options', scale: 'screen', presence: 'expected' })
  document.links.push({ from: JOURNEY, relation: 'contains', to: id, status: 'declared' })
  for (const link of links) document.links.push({ ...link, relation: 'navigates', status: 'declared' })
}

test('the edited example stays a valid graph', () => {
  assert.deepEqual(validateGraph(example('card-override')), [])
})

test('product states the design neither shows nor inherits are missing; library states are not', () => {
  const [coverage] = completenessOf(indexGraph(example('card-override')), JOURNEY).states
  assert.deepEqual(coverage, {
    screenId: SCREEN,
    semanticId: 'semantic:card',
    instanceIds: [INSTANCE],
    total: 7,
    shown: ['rest'],
    fromLibrary: ['hover', 'selected', 'disabled'],
    inherited: [],
    missing: ['loading', 'empty', 'error'],
  })
})

test('a state frame on the screen counts, and an explicit inherit is an accepted answer', () => {
  const graph = indexGraph(
    edited('card-override', (d) => {
      d.records.push({ id: 'target:shop.order-summary.loading', kind: 'target', title: 'Order Summary loading', scale: 'state', presence: 'expected' })
      d.records.push({ id: 'instance:shop.order-summary.loading.card', kind: 'component-instance', title: 'Loading card', semanticId: 'semantic:card', state: 'loading', placedOn: 'target:shop.order-summary.loading', product: 'shop', origin: 'design' })
      d.links.push({ from: SCREEN, relation: 'contains', to: 'target:shop.order-summary.loading', status: 'declared' })
      record(d, INSTANCE).inheritsStates = ['error']
    }),
  )
  const [coverage] = completenessOf(graph, JOURNEY).states
  assert.deepEqual([coverage!.shown, coverage!.inherited, coverage!.missing], [['rest', 'loading'], ['error'], ['empty']])
  assert.deepEqual(gapsIn(graph).filter((gap) => gap.kind === 'missing-state').map((gap) => [gap.subjectId, gap.summary]), [
    [SCREEN, "Order Summary has no design for the Card's empty state(s); show them or say the instance inherits the default."],
  ])
})

test('instances read from code do not count towards design completeness', () => {
  const graph = indexGraph(edited('card-override', (d) => { Object.assign(record(d, INSTANCE), { origin: 'code', platform: 'web' }) }))
  assert.deepEqual(completenessOf(graph, JOURNEY).states, [])
})

test('a screen with no counted path on is a dead end, unless the journey declares it an exit', () => {
  // Order Summary's only counted path is the unmapped one to payment; the inferred promo path does not count.
  const base = indexGraph(edited('card-override', (d) => withScreen(d, 'target:shop.gift-options', [{ from: SCREEN, to: 'target:shop.gift-options' }])))
  assert.deepEqual(completenessOf(base, JOURNEY).journey.deadEnds, ['target:shop.gift-options'])
  const exit = indexGraph(
    edited('card-override', (d) => {
      withScreen(d, 'target:shop.gift-options', [{ from: SCREEN, to: 'target:shop.gift-options' }])
      record(d, JOURNEY).exits = ['target:shop.gift-options']
    }),
  )
  assert.deepEqual(completenessOf(exit, JOURNEY).journey.deadEnds, [])
})

test('a screen no counted path reaches from the entry is unreachable', () => {
  const graph = indexGraph(edited('card-override', (d) => withScreen(d, 'target:shop.gift-options', [{ from: 'target:shop.gift-options', to: SCREEN }])))
  const { journey } = completenessOf(graph, JOURNEY)
  assert.deepEqual([journey.screens, journey.unreachable, journey.deadEnds], [[SCREEN, 'target:shop.gift-options'].sort(), ['target:shop.gift-options'], []])
  const noEntry = indexGraph(edited('card-override', (d) => { delete record(d, JOURNEY).entry }))
  assert.deepEqual(completenessOf(noEntry, JOURNEY).journey.unreachable, [])
  assert.match(renderCompleteness(noEntry, completenessOf(noEntry, JOURNEY)), /not checked, because the journey declares no entry screen/)
})

test('the report gives counts with denominators', () => {
  const graph = indexGraph(example('card-override'))
  const report = renderCompleteness(graph, completenessOf(graph, JOURNEY))
  assert.match(report, /Order Summary, Card\*\*: 4 of 7 states accounted for\. Shown: rest\. From the library: hover, selected, disabled\. Inherited by choice: none\. Missing: loading, empty, error\./)
  assert.match(report, /Dead ends: 0 of 1\./)
  assert.match(report, /Unreachable screens: 0 of 1\./)
})

test('validation keeps states, inherits and journey ends honest', () => {
  const codes = (edit: (d: GraphDocument) => void) => validateGraph(edited('card-override', edit)).filter((issue) => issue.severity === 'error').map((issue) => issue.code)
  assert.deepEqual(codes((d) => { record(d, INSTANCE).state = 'pressed' }), ['unknown-state'])
  assert.deepEqual(codes((d) => { record(d, INSTANCE).inheritsStates = ['hover'] }), ['unknown-state'])
  assert.deepEqual(codes((d) => { record<{ productStates: string[] }>(d, 'semantic:card').productStates.push('offline') }), ['unknown-state'])
  assert.deepEqual(codes((d) => { record(d, SCREEN).entry = [SCREEN] }), ['journey-ends'])
  assert.deepEqual(codes((d) => { record(d, JOURNEY).exits = ['target:shop.gone'] }), ['dangling-reference'])
})

test('a target that is not a journey is refused', () => {
  assert.throws(() => completenessOf(indexGraph(example('card-override')), SCREEN), /not a journey/)
})
