import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { readElementSource } from '../../packages/canvas/src/element-source.mjs'
import { taggedCapture } from '../src/elements.ts'

function node(dataset = {}, parentElement: Element | null = null, metadata?: unknown): Element {
  return { dataset, parentElement, __svelte_meta: { loc: metadata } } as unknown as Element
}

test('framework locations normalize to original one-based coordinates with provenance', () => {
  const cases = [
    [node({ civicSource: 'src/View.tsx:3:1' }), 'civic'],
    [node({ vInspector: 'src/View.vue:3:1' }), 'vue-inspector'],
    [node({}, null, { file: '/project/src/View.svelte', line: 2, column: 0 }), 'svelte-inspector'],
    [node({ sourceLoc: 'src/View.tsx:3:2' }), 'solid-locator'],
  ] as const
  for (const [element, via] of cases) {
    const result = readElementSource(element, { root: '/project' })
    assert.equal(result.line, 3)
    assert.equal(result.column, 1)
    assert.equal(result.via, via)
    assert.equal(result.match, 'exact')
    assert.ok(result.file?.startsWith('src/'))
  }
})

test('invalid paths and coordinates cannot escape the project or identify dependencies', () => {
  for (const value of ['/outside/View.vue:1:1', '/project-other/View.vue:1:1', '../View.vue:1:1', 'node_modules/View.vue:1:1', '/project/node_modules/View.vue:1:1', 'src/View.vue:0:1', 'src/View.vue:1:0', 'src/View.vue:1:9007199254740992']) {
    assert.deepEqual(readElementSource(node({ vInspector: value }), { root: '/project' }), {})
  }
  assert.deepEqual(readElementSource(node({ civicSource: '/project/View.tsx:1:1' })), {})
  assert.equal(readElementSource(node({ vInspector: '/project/src/View.vue:1:1' }), { root: '/project' }).file, 'src/View.vue')
})

test('precedence, fallback, and nearest ancestor evidence stay distinct', () => {
  const parent = node({ civicSource: 'src/Parent.tsx:1:1' })
  const child = node({ civicSource: 'bad', vInspector: 'src/View.vue:2:4', sourceLoc: 'src/View.tsx:9:9' }, parent)
  assert.equal(readElementSource(child).via, 'vue-inspector')
  assert.equal(readElementSource(child).match, 'exact')
  assert.equal(readElementSource(node({}, parent)).match, 'ancestor')
  assert.equal(readElementSource(node({ civicSource: 'src/View.tsx:1:1', vInspector: 'src/View.vue:1:1' })).via, 'civic')
})

test('Angular returns only the nearest component identity and tolerates unavailable debug APIs', () => {
  class TodoListComponent {}
  const parent = node()
  const child = node({}, parent)
  const ownerDocument = { defaultView: { ng: { getComponent: (element: Element) => element === parent ? new TodoListComponent() : null } } }
  Object.assign(parent, { ownerDocument }); Object.assign(child, { ownerDocument })
  assert.deepEqual(readElementSource(child), { component: 'TodoListComponent' })
  ownerDocument.defaultView.ng.getComponent = () => { throw Error('not available') }
  assert.deepEqual(readElementSource(child), {})
})

test('tagged capture serializes the shared reader without module dependencies', async () => {
  const element = Object.assign(node({ vInspector: '/project/src/View.vue:2:3' }), { tagName: 'BUTTON', textContent: 'Save', getAttribute: () => null })
  const capture = await taggedCapture({ evaluate: async <T>(code: string) => runInNewContext(code, { document: { querySelectorAll: () => [element] } }) as T }, 'view', '/project')
  assert.equal(capture.elements[0]?.source, 'src/View.vue:2:3')
  assert.equal(capture.elements[0]?.via, 'vue-inspector')
  assert.equal(capture.elements[0]?.match, 'exact')
})

test('the overlay mode passes absolute paths through for its server to make relative', () => {
  const element = { dataset: { civicSource: '/repo/src/view.tsx:2:3' }, parentElement: null, ownerDocument: null } as unknown as Element
  assert.equal(readElementSource(element, { absolute: true }).location, '/repo/src/view.tsx:2:3')
  const hidden = { dataset: { civicSource: '/repo/node_modules/x/view.tsx:2:3' }, parentElement: null, ownerDocument: null } as unknown as Element
  assert.equal(readElementSource(hidden, { absolute: true }).location, undefined)
})
