import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { DESIGN_INTENT, frameWalk, indexGraph, renderWalk, renderWalkPage, walkPath, type GraphDocument } from '../src/index.ts'

// The frame walk (D33) on the Card demo's Shop checkout: frames joined by prototype links,
// labelled as design intent.

const card = () => indexGraph(JSON.parse(readFileSync(new URL('../../demo/card/out/resolved.graph.json', import.meta.url), 'utf8')) as GraphDocument)

test('the walk starts on the flow\'s start frame and follows prototype links breadth first', () => {
  const walk = frameWalk(card(), 'target:shop.checkout')
  assert.equal(walk.label, DESIGN_INTENT)
  assert.deepEqual(walk.revisions, ['civic-stand-in-4'])
  assert.deepEqual(walk.frames.map((frame) => [frame.id, frame.scale]), [
    ['target:shop.order-summary', 'screen'],
    ['target:shop.order-summary.loading', 'state'],
    ['target:shop.promo-applied', 'screen'],
    ['target:shop.gift-options', 'screen'],
  ])
  const start = walk.frames[0]!
  assert.deepEqual(start.actions.map((action) => [action.label, action.to ?? action.leaves]), [['Apply promotion', 'target:shop.promo-applied'], ['Continue to payment', '/checkout/payment']])
  assert.deepEqual(start.components[0]!.overrides.find((override) => override.property === 'state.selected')!.forecasts, [
    { platform: 'web', outcome: 'supported' },
    { platform: 'ios', outcome: 'needs-library-change' },
    { platform: 'android', outcome: 'needs-library-change' },
  ])
  // The completeness check's findings show up where a person walking would hit them.
  assert.equal(walk.frames.find((frame) => frame.id === 'target:shop.promo-applied')!.deadEnd, true)
  assert.equal(walk.frames.find((frame) => frame.id === 'target:shop.gift-options')!.unreachable, true)
})

test('a scripted walk follows labels, and stops where the design ends or the label is wrong', () => {
  const walk = frameWalk(card(), 'target:shop.checkout')
  assert.deepEqual(walkPath(walk, ['Apply promotion']), { visited: ['target:shop.order-summary', 'target:shop.promo-applied'] })
  assert.match(walkPath(walk, ['Continue to payment']).stopped!, /leaves the design for \/checkout\/payment/)
  assert.match(walkPath(walk, ['Pay now']).stopped!, /Order Summary has no prototype link "Pay now"\. It has: Apply promotion, Continue to payment\./)
})

test('only links read from a design file count, so an app\'s own paths never join the walk', () => {
  const graph = card()
  graph.document.links.push({ from: 'target:shop.promo-applied', relation: 'navigates', to: 'target:shop.gift-options', status: 'declared', action: 'From source' })
  const walk = frameWalk(indexGraph(graph.document), 'target:shop.checkout')
  assert.deepEqual(walk.frames.find((frame) => frame.id === 'target:shop.promo-applied')!.actions, [])
})

test('the text and the page both carry the design intent label', () => {
  const walk = frameWalk(card(), 'target:shop.checkout')
  assert.ok(renderWalk(walk).includes(DESIGN_INTENT))
  const page = renderWalkPage(walk)
  assert.ok(page.includes(DESIGN_INTENT))
  assert.ok(!/<script[^>]+src=|<link[^>]+href=/.test(page), 'the page loads nothing from elsewhere')
  assert.throws(() => frameWalk(card(), 'target:shop.order-summary'), /is not a journey/)
})

test('a prototype link into another journey leaves the walk instead of breaking a scripted path', () => {
  const graph = card()
  graph.document.records.push(
    { id: 'target:shop.payment', kind: 'target', title: 'Payment', scale: 'journey', presence: 'expected', entry: ['target:shop.card-entry'] },
    { id: 'target:shop.card-entry', kind: 'target', title: 'Card entry', scale: 'screen', presence: 'expected' },
  )
  graph.document.links.push(
    { from: 'target:shop.payment', relation: 'contains', to: 'target:shop.card-entry', status: 'declared' },
    { from: 'target:shop.promo-applied', relation: 'navigates', to: 'target:shop.card-entry', status: 'declared', action: 'Pay', source: { tool: 'figma', importer: 'figma-file', revision: 'r' } },
  )
  const walk = frameWalk(indexGraph(graph.document), 'target:shop.checkout')
  assert.deepEqual(walk.frames.find((frame) => frame.id === 'target:shop.promo-applied')!.actions.map((action) => [action.label, action.to, action.leaves]), [['Pay', undefined, 'Card entry, outside this journey']])
  assert.match(walkPath(walk, ['Apply promotion', 'Pay']).stopped!, /leaves the design for Card entry, outside this journey/)
})
