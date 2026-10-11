import assert from 'node:assert/strict'
import { test } from 'node:test'
import { indexGraph, renderInstanceReview, reviewInstance } from '../src/index.ts'
import { edited, example } from './helpers.ts'

const INSTANCE = 'instance:shop.order-summary.card'
const BADGE = 'override:shop.order-summary.card.price-badge'

/** The example with a drift conflict raised on the badge, optionally resolved. */
const withConflict = (resolved: boolean) =>
  edited('card-override', (d) => {
    d.records.push({ id: 'evidence:design', kind: 'evidence', title: 'Design', subjectIds: [INSTANCE], tier: 'static-analysis', method: 'design-export', outcome: 'finding', finding: 'A badge.', capturedAt: 'now', source: { tool: 'figma', importer: 'figma-file', revision: '1' } })
    d.records.push({
      id: 'conflict:shop.order-summary.card.price-badge',
      kind: 'contract-conflict',
      title: 'Badge',
      targetId: 'semantic:card',
      summary: 'A badge.',
      sides: [{ claim: 'Badge.', recordId: BADGE, evidenceIds: ['evidence:design'] }, { claim: 'Contract.', recordId: 'semantic:card', evidenceIds: [] }],
      classification: 'unclassified',
      owners: [{ role: 'design', who: 'design-system-maintainers' }],
      alignment: resolved ? 'aligned' : 'unreviewed-drift',
      status: resolved ? 'resolved' : 'open',
      ...(resolved ? { resolution: { outcome: 'update-contract', decidedBy: { role: 'design', who: 'design-system-maintainers' }, at: 'now', rationale: 'Promote.', evidenceIds: ['evidence:design'] } } : {}),
    })
  })

test('a review forecasts every override and finds the record that tracks it', () => {
  const review = reviewInstance(indexGraph(withConflict(false)), INSTANCE)
  assert.deepEqual(review.items.map((item) => [item.override.id, item.conflict?.id]), [
    [BADGE, 'conflict:shop.order-summary.card.price-badge'],
    ['override:shop.order-summary.card.radius', undefined],
  ])
  assert.equal(review.readiness, 'not-yet-adoptable')
})

test('the maker and the contract owners are asked; library owners where a change is needed are told', () => {
  const review = reviewInstance(indexGraph(example('card-override')), INSTANCE)
  assert.deepEqual(review.asked.map((owner) => owner.who), ['shop-design', 'design-system-maintainers'])
  // The example's libraries name no owners, so only the product's would be told, and it names none either.
  assert.deepEqual(review.told, [])
  assert.deepEqual(review.shownOn, ['target:shop.order-summary', 'target:shop.checkout'])
})

test('the design is adoptable only once every override has a decision', () => {
  const partly = reviewInstance(indexGraph(withConflict(true)), INSTANCE)
  assert.equal(partly.readiness, 'not-yet-adoptable')
  const graph = indexGraph(edited('card-override', (d) => { d.records = d.records.filter((record) => record.kind !== 'override') }))
  assert.equal(reviewInstance(graph, INSTANCE).readiness, 'no-overrides')
  assert.match(renderInstanceReview(graph, reviewInstance(graph, INSTANCE)), /No overrides/)
})

test('the report shows each platform separately and says why', () => {
  const graph = indexGraph(withConflict(false))
  const report = renderInstanceReview(graph, reviewInstance(graph, INSTANCE))
  assert.match(report, /\| Price badge in the header \(`header.badge`\) \| Supported \| Needs a library change \| Needs a library change \| Unreviewed drift, open/)
  assert.match(report, /\| Larger corner radius \(`corner-radius`\) \| Forbidden by contract \| Forbidden by contract \| Forbidden by contract \| not raised \|/)
  assert.match(report, /Design not yet adoptable: 2 of 2 override\(s\) have no decision\./)
})
