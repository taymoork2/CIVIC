import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contextFor, renderWorkOrder } from '../src/context.ts'
import { gapsIn, renderGaps } from '../src/gaps.ts'
import { indexGraph } from '../src/graph.ts'
import { decide, edited, example } from './helpers.ts'

const graph = () => indexGraph(example('fluent-button'))

test('context exports the Android Neutral default as one work order', () => {
  const order = contextFor(graph(), 'semantic:button', { platform: 'android', variant: 'neutral-default' })
  assert.equal(order.implementation?.id, 'platform:fluent-android.compose-button')
  assert.deepEqual(order.implementation?.mappings.map((mapping) => mapping.mapping), ['none'])
  assert.deepEqual(order.ids.slice(0, 2), ['semantic:button', 'platform:fluent-android.compose-button'])
  assert.deepEqual(order.records.map((record) => record.id), ['conflict:button.android.neutral-default'])
  assert.deepEqual(order.otherPlatforms.map((other) => `${other.platform}:${other.mapping}`), ['ios:exact', 'web:exact'])
  assert.ok(order.acceptance.some((line) => line.includes('needs a decision')))
  assert.ok(order.acceptance.some((line) => line.startsWith('No automated or device evidence on android')))
  assert.ok(renderWorkOrder(order).startsWith('# Work order: Button, Neutral default, on android'))
})

test('context leaves out other platforms’ evidence and records', () => {
  const order = contextFor(graph(), 'semantic:button', { platform: 'web' })
  assert.deepEqual(order.records, [])
  assert.ok(order.evidence.every((item) => !item.id.includes('android')))
  assert.equal(order.tokens.length, 2)
})

test('context refuses unknown targets and variants instead of guessing', () => {
  assert.throws(() => contextFor(graph(), 'semantic:card', { platform: 'web' }), /not a semantic component/)
  assert.throws(() => contextFor(graph(), 'semantic:button', { platform: 'web', variant: 'ghost' }), /no variant ghost/)
})

test('context is deterministic', () => {
  const options = { platform: 'android', variant: 'neutral-default' } as const
  assert.equal(JSON.stringify(contextFor(graph(), 'semantic:button', options)), JSON.stringify(contextFor(graph(), 'semantic:button', options)))
})

test('gaps lists open conflicts and missing variants with owners', () => {
  const gaps = gapsIn(graph())
  assert.equal(gaps[0]?.kind, 'open-conflict')
  assert.deepEqual(gaps[0]?.owners.map((owner) => owner.role), ['design', 'engineering'])
  const missing = gaps.filter((gap) => gap.kind === 'missing-variant').map((gap) => `${gap.platform}:${gap.summary.split(' ').at(-4)}`)
  assert.equal(missing.length, 4)
  assert.ok(gaps.some((gap) => gap.kind === 'no-run-evidence' && gap.platform === 'web'))
  assert.match(renderGaps(gaps), /^8 gap\(s\)/)
})

test('gaps filters by platform and keeps platform-neutral gaps', () => {
  const gaps = gapsIn(graph(), { platform: 'ios' })
  assert.ok(gaps.every((gap) => !gap.platform || gap.platform === 'ios'))
  assert.deepEqual(gaps.map((gap) => gap.kind), ['no-run-evidence'])
})

test('an approved exception is listed with its revisit trigger, not as an open conflict', () => {
  const document = edited('fluent-button', (doc) => {
    decide(doc, 'conflict:button.android.neutral-default', {
      outcome: 'approve-exception',
      classification: 'temporary-gap',
      alignment: 'accepted-limitation',
      rationale: 'Use custom tokens until the library adds a style.',
      evidenceIds: ['evidence:compose-source.button.styles'],
      revisitTrigger: 'The library adds a neutral style.',
    })
  })
  const gaps = gapsIn(indexGraph(document))
  assert.ok(!gaps.some((gap) => gap.kind === 'open-conflict'))
  const exception = gaps.find((gap) => gap.kind === 'approved-exception')
  assert.match(exception?.summary ?? '', /Revisit when: The library adds a neutral style\./)
})

test('unconfirmed links show up as gaps', () => {
  const document = edited('fluent-button', (doc) => {
    doc.links.push({ from: 'platform:fluent-apple.button', relation: 'uses-token', to: 'token:colorBrandBackground', status: 'inferred' })
  })
  assert.ok(gapsIn(indexGraph(document)).some((gap) => gap.kind === 'unconfirmed-link' && gap.subjectId === 'platform:fluent-apple.button'))
})
