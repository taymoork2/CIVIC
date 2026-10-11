import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { indexGraph, validateGraph, type ContractConflict, type GraphDocument, type PlatformComponent } from '../../graph/src/index.ts'

// The committed demo outputs: `node demo/fluent-button/build.ts --check` proves they are
// what the inputs produce; these tests pin what the demo must show (roadmap step 2).
const load = (name: string) => JSON.parse(readFileSync(new URL(`../../demo/fluent-button/out/${name}.graph.json`, import.meta.url), 'utf8')) as GraphDocument

test('both demo graphs are valid with no warnings', () => {
  assert.deepEqual(validateGraph(load('raised')), [])
  assert.deepEqual(validateGraph(load('resolved')), [])
})

test('the Android kit raises exactly the Neutral default conflict, from read evidence', () => {
  const graph = indexGraph(load('raised'))
  const conflicts = graph.ofKind('contract-conflict')
  assert.deepEqual(conflicts.map((conflict) => conflict.id), ['conflict:button.android.neutral-default'])
  const [conflict] = conflicts as [ContractConflict]
  assert.equal(conflict.status, 'open')
  const sides = conflict.sides.flatMap((side) => side.evidenceIds).map((id) => graph.get(id))
  assert.deepEqual(sides.map((item) => item?.kind === 'evidence' && item.source.importer), ['figma-file', 'kotlin-source'])
})

test('the resolved graph keeps the decision with its evidence and revisit trigger', () => {
  const conflict = indexGraph(load('resolved')).get('conflict:button.android.neutral-default') as ContractConflict
  assert.equal(conflict.status, 'resolved')
  assert.equal(conflict.resolution?.outcome, 'approve-exception')
  assert.ok(conflict.resolution?.revisitTrigger)
})

test('each platform maps the Button from its own source, with decision 0001’s differences', () => {
  const graph = indexGraph(load('raised'))
  const component = (id: string) => graph.get(id) as PlatformComponent
  assert.equal(component('platform:fluent-react-v9.button').defaultVariant, 'neutral-default')
  assert.equal(component('platform:fluent-apple.button').defaultVariant, 'brand-outline')
  assert.equal(component('platform:fluent-android.compose-button').defaultVariant, 'primary-filled')
  assert.deepEqual(component('platform:fluent-apple.button').extraVariants?.map((extra) => extra.expression), ['dangerOutline', 'dangerSubtle', 'floatingAccent', 'floatingSubtle'])
})

test('web evidence is automated and passing; iOS and Android evidence is static only', () => {
  const evidence = indexGraph(load('raised')).ofKind('evidence')
  const web = evidence.filter((item) => item.platform === 'web' && item.tier === 'automated')
  assert.ok(web.length > 0 && web.every((item) => item.outcome === 'pass' && item.method === 'playwright'))
  for (const platform of ['ios', 'android'] as const) {
    assert.ok(evidence.filter((item) => item.platform === platform).every((item) => item.tier === 'static-analysis'))
  }
})
