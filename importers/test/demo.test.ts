import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { conflictState, indexGraph, validateGraph, type ContractConflict, type GraphDocument, type PlatformComponent } from '../../graph/src/index.ts'

// The committed demo outputs: `node demo/fluent-button/build.ts --check` proves they are
// what the inputs produce; these tests pin what the demo must show (roadmap step 2).
const load = (name: string) => JSON.parse(readFileSync(new URL(`../../demo/fluent-button/out/${name}.graph.json`, import.meta.url), 'utf8')) as GraphDocument

test('both demo graphs are valid with no warnings', () => {
  assert.deepEqual(validateGraph(load('raised')), [])
  assert.deepEqual(validateGraph(load('resolved')), [])
})

test('the real Android kit raises exactly the Brand outline conflict, from read evidence', () => {
  const graph = indexGraph(load('raised'))
  const conflicts = graph.ofKind('contract-conflict').filter((conflict) => conflict.platform === 'android')
  assert.deepEqual(conflicts.map((conflict) => conflict.id), ['conflict:button.android.brand-outline'])
  const [conflict] = conflicts as [ContractConflict]
  assert.equal(conflictState(graph, conflict).status, 'open')
  const sides = conflict.sides.flatMap((side) => side.evidenceIds).map((id) => graph.get(id))
  assert.deepEqual(sides.map((item) => item?.kind === 'evidence' && item.source.importer), ['figma-file', 'kotlin-source'])
  const kit = graph.get('evidence:figma.android-kit.button')
  assert.ok(kit?.kind === 'evidence' && kit.source.revision !== 'civic-stand-in-1')
})

test('the real iOS kit draws four styles, so iOS Danger and Transparent neutral have no design, undecided', () => {
  const raised = indexGraph(load('raised'))
  const ios = raised.ofKind('contract-conflict').filter((conflict) => conflict.platform === 'ios')
  assert.deepEqual(ios.map((conflict) => conflict.id).sort(), ['conflict:button.ios.danger', 'conflict:button.ios.transparent-neutral'])
  const resolved = indexGraph(load('resolved'))
  assert.ok(ios.every((conflict) => conflictState(resolved, resolved.get(conflict.id) as ContractConflict).status === 'open'))
  const kit = raised.get('evidence:figma.ios-kit.button')
  assert.ok(kit?.kind === 'evidence' && kit.source.revision === '2409334717272340147' && kit.source.path === 'Microsoft Fluent 2 iOS (Community) / Button / Button')
})

test('the resolved graph keeps the decision with its evidence and revisit trigger', () => {
  const graph = indexGraph(load('resolved'))
  const state = conflictState(graph, graph.get('conflict:button.android.brand-outline') as ContractConflict)
  assert.equal(state.status, 'decided')
  assert.equal(state.decision?.id, 'decision:button.android.brand-outline')
  assert.equal(state.decision?.outcome, 'update-design')
  assert.equal(state.classification, 'outdated-design-source')
  assert.ok(state.decision?.revisitTrigger)
})

test('each platform maps the Button from its own source, with decision 0001’s differences', () => {
  const graph = indexGraph(load('raised'))
  const component = (id: string) => graph.get(id) as PlatformComponent
  assert.equal(component('platform:fluent-react-v9.button').defaultVariant, 'neutral-default')
  assert.equal(component('platform:fluent-apple.button').defaultVariant, 'brand-outline')
  assert.equal(component('platform:fluent-android.compose-button').defaultVariant, 'primary-filled')
  assert.deepEqual(component('platform:fluent-apple.button').extraVariants?.map((extra) => extra.expression), ['dangerOutline', 'dangerSubtle', 'floatingAccent', 'floatingSubtle'])
})

test("web evidence is automated and passing, from the harness and Fluent's own stories; iOS and Android evidence is static only", () => {
  const evidence = indexGraph(load('raised')).ofKind('evidence')
  const web = evidence.filter((item) => item.platform === 'web' && item.tier === 'automated')
  assert.ok(web.length > 0 && web.every((item) => item.outcome === 'pass'))
  const stories = web.filter((item) => item.method === 'storybook')
  assert.equal(stories.length, 13)
  assert.equal(web.length - stories.length, 13)
  assert.ok(stories.every((item) => item.source.path?.startsWith('demo/fluent-button/sources/react-button-stories/') && item.source.anchor?.startsWith('components-button-button--')))
  for (const platform of ['ios', 'android'] as const) {
    assert.ok(evidence.filter((item) => item.platform === platform).every((item) => item.tier === 'static-analysis'))
  }
})
