import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkGraph, indexGraph, objectMapOf, renderObjectMap, validateGraph, type DomainObject, type GraphDocument, type Link, type Owner, type Target } from '../src/index.ts'

// The object map (decision 0014, point 8): an ORCA grid's objects, the targets tied to
// them, and the designer's three questions asked of what was built.

const design = { role: 'design' as const, who: 'designers' }
const ios = { role: 'engineering' as const, who: 'ios-team', platform: 'ios' as const }
const web = { role: 'engineering' as const, who: 'web-team', platform: 'web' as const }

const order: DomainObject = {
  id: 'object:shop.order',
  kind: 'object',
  title: 'Order',
  owners: [design],
  attributes: [
    { key: 'total', title: 'Total', kind: 'core' },
    { key: 'status', title: 'Status', kind: 'core' },
    { key: 'placed-at', title: 'Placed at', kind: 'metadata' },
  ],
  actions: [
    { key: 'cancel', title: 'Cancel' },
    { key: 'reorder', title: 'Reorder' },
  ],
  relationships: [{ objectId: 'object:shop.customer', cardinality: 'one' }],
}
const customer: DomainObject = { id: 'object:shop.customer', kind: 'object', title: 'Customer', owners: [design], attributes: [{ key: 'name', title: 'Name', kind: 'core' }], actions: [], relationships: [] }
const screen = (id: string, title: string, platforms: Target['platforms'], owners: Owner[] = [web]): Target => ({ id, kind: 'target', title, scale: 'screen', presence: 'expected', platforms, owners })
const journey: Target = { id: 'target:shop.checkout', kind: 'target', title: 'Checkout', scale: 'journey', presence: 'expected', owners: [{ role: 'qa', who: 'qa' }] }
const shows = (from: string, to: string, extra: Partial<Link> = {}): Link => ({ from, relation: 'shows', to, status: 'declared', ...extra })

function shop(): GraphDocument {
  return {
    schema: 'civic.graph/0',
    records: [
      journey,
      screen('target:shop.confirmation', 'Confirmation', ['web']),
      screen('target:shop.order-web', 'Order detail', ['web']),
      screen('target:shop.order-ios', 'Order detail', ['ios'], [ios]),
      screen('target:shop.receipt', 'Receipt', ['web']),
      order,
      customer,
    ],
    links: [
      { from: journey.id, relation: 'contains', to: 'target:shop.confirmation', status: 'declared' },
      shows(journey.id, order.id),
      shows(journey.id, customer.id),
      shows('target:shop.order-web', order.id, { attributes: ['total', 'status', 'placed-at'], actions: ['cancel', 'reorder'] }),
      shows('target:shop.order-ios', order.id, { attributes: ['total', 'status'], actions: ['cancel'] }),
      shows('target:shop.receipt', order.id, { view: 'card', attributes: ['total'] }),
      shows('target:shop.confirmation', order.id, { status: 'inferred', source: { tool: 'civic', importer: 'object-ties', revision: 'x', anchor: 'suggested by the name "order"' } }),
    ],
  }
}

test('an object map is a valid graph, and ties name only what the object has', () => {
  assert.deepEqual(validateGraph(shop()).filter((issue) => issue.severity === 'error'), [])
  const document = shop()
  document.links.push(shows('target:shop.receipt', customer.id, { attributes: ['email'], actions: ['cancel'] }))
  document.links.push(shows(journey.id, 'target:shop.receipt'))
  document.links[1] = { ...document.links[1]!, view: 'detail' }
  const codes = validateGraph(document).filter((issue) => issue.severity === 'error').map((issue) => `${issue.code} ${issue.message}`)
  assert.ok(codes.includes('object-key object:shop.customer has no attribute email.'), codes.join('\n'))
  assert.ok(codes.includes('object-key object:shop.customer has no call to action cancel.'))
  assert.ok(codes.some((code) => code.startsWith('reference-kind') && code.includes('expected object')))
  assert.ok(codes.some((code) => code.startsWith('shows-journey')))
  const navigates = shop()
  navigates.links.push({ from: 'target:shop.receipt', relation: 'navigates', to: 'target:shop.confirmation', status: 'declared', attributes: ['total'] })
  assert.ok(validateGraph(navigates).some((issue) => issue.code === 'shape' && issue.message.includes('only on a shows link')))
})

test('the three comparisons and suggested ties, each with Design as owner', () => {
  const map = objectMapOf(indexGraph(shop()))
  const gaps = map.gaps.map((gap) => [gap.kind, gap.subjectId, gap.platform ?? '', gap.detail])
  assert.deepEqual(gaps, [
    // Checkout needs the order, and the only screen it contains carries an unconfirmed suggestion.
    ['object-not-shown', 'target:shop.checkout', '', 'object:shop.order'],
    ['object-not-shown', 'target:shop.checkout', '', 'object:shop.customer'],
    // Placed at is on the web detail and not the iOS one; the receipt's card view is compared on its own.
    ['object-attribute-missing', 'object:shop.order', '', 'detail placed-at'],
    ['object-action-platform', 'object:shop.order', 'ios', 'reorder'],
    ['unconfirmed-object-tie', 'target:shop.confirmation', '', 'object:shop.order'],
  ])
  const [needsOrder, , attribute, action, tie] = map.gaps
  assert.match(needsOrder!.summary, /none of its 1 screen\(s\) shows it\. CIVIC suggests Confirmation/)
  assert.match(attribute!.summary, /Order's Placed at \(metadata\) is shown on Order detail but not on Order detail, in its detail view\./)
  assert.match(action!.summary, /Reorder on Order is offered on web but not on ios/)
  assert.match(tie!.summary, /\(inferred, suggested by the name "order"\)/)
  // Design is asked, and the platform's owners are told.
  assert.deepEqual(action!.owners, [design, ios])
  assert.deepEqual(attribute!.owners, [design, ios])
  assert.deepEqual(map.counts, { needs: 2, attributeChecks: 3, actionChecks: 2, ties: 4 })
  assert.match(renderObjectMap(map), /\| Order \| 3 \| 2 \| 3 \| 1 \| 1 \|/)
})

test('confirming the suggestion clears the journey finding, and the gate reports all of it as advisory', () => {
  const document = shop()
  const suggestion = document.links.find((link) => link.status === 'inferred')!
  suggestion.status = 'declared'
  const map = objectMapOf(indexGraph(document))
  assert.deepEqual(map.gaps.filter((gap) => gap.kind === 'object-not-shown').map((gap) => gap.detail), ['object:shop.customer'])
  assert.ok(!map.gaps.some((gap) => gap.kind === 'unconfirmed-object-tie'))

  const check = checkGraph('shop', indexGraph(shop()), { today: '2026-10-15' })
  const kinds = check.findings.filter((item) => item.kind.startsWith('object') || item.kind === 'unconfirmed-object-tie').map((item) => item.key)
  assert.deepEqual(kinds, [
    'object-not-shown target:shop.checkout object:shop.customer',
    'object-not-shown target:shop.checkout object:shop.order',
    'object-attribute-missing object:shop.order detail placed-at',
    'object-action-platform object:shop.order ios reorder',
    'unconfirmed-object-tie target:shop.confirmation object:shop.order',
  ])
  assert.deepEqual(
    check.measures.filter((item) => item.check.startsWith('Object')).map((item) => [item.check, item.found, item.of]),
    [
      ['Objects a journey needs that no screen of it shows', 2, 2],
      ['Object attributes missing from a screen of the same view', 1, 3],
      ['Object calls to action missing on a platform', 1, 2],
      ['Object ties awaiting confirmation', 1, 4],
    ],
  )
})

test('a graph with no objects has no object findings', () => {
  const map = objectMapOf(indexGraph({ schema: 'civic.graph/0', records: [journey], links: [] }))
  assert.deepEqual(map.gaps, [])
})
