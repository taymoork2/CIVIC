import assert from 'node:assert/strict'
import { test } from 'node:test'
import { architecture, compare, count } from '../bin/lint-baseline.mjs'

const cases = [
  ['useEffect', 'packages/canvas/src/a.tsx', 'useEffect(() => {})', 'useExternalSync()'],
  ['raw-timer', 'packages/local/a.mjs', 'setTimeout(work, 1)', 'Clock.sleep(1)'],
  ['module-mocking', 'review/test/a.ts', 'vi.mock("./a")', 'vi.fn()'],
  ['data-core', 'graph/src/a.ts', 'export * from "effect/Clock"', 'import x from "node:path"'],
  ['browser-server', 'packages/shell/src/a.ts', 'import("../server/a")', 'import("./a")'],
  ['outside-repo', 'graph/src/a.ts', 'require("../../../outside")', 'require("./a")'],
]
for (const [rule, file, failing, passing] of cases) {
  test(`${rule}: failing and passing fixtures`, () => {
    assert.equal(architecture(file, failing).filter(item => item.code === `architecture/${rule}`).length, 1)
    assert.deepEqual(architecture(file, passing), [])
  })
}
test('imports, exports, dynamic imports and type imports share the boundary', () => {
  for (const source of ['import x from "xstate"', 'export * from "@effect/platform-node"', 'import("effect")', 'type X = import("node:child_process").X']) {
    assert.equal(architecture('importers/src/a.ts', source).length, 1)
  }
  assert.deepEqual(architecture('packages/canvas/src/a.ts', '// vi.mock("x")\nconst text = "setTimeout()"'), [])
})
test('aliases and computed members cannot bypass call restrictions', () => {
  assert.equal(architecture('packages/canvas/src/a.ts', 'import {useEffect as sync} from "react"; sync(work)').length, 1)
  assert.equal(architecture('packages/local/a.ts', 'globalThis["setTimeout"](work, 1)').length, 1)
  assert.equal(architecture('review/test/a.ts', 'import {vi as v} from "vitest"; v["mock"]("x")').length, 1)
})
test('integration processes and React test rendering do not weaken production boundaries', () => {
  assert.deepEqual(architecture('graph/test/cli.test.ts', 'import {spawnSync} from "node:child_process"'), [])
  assert.equal(architecture('graph/src/cli.ts', 'import {spawnSync} from "node:child_process"').length, 1)
  assert.equal(architecture('graph/test/cli.test.ts', 'import "effect"').length, 1)
  assert.deepEqual(architecture('packages/canvas/src/view.test.tsx', 'import "react-dom/server"'), [])
  assert.equal(architecture('packages/canvas/src/view.tsx', 'import "react-dom/server"').length, 1)
  assert.equal(architecture('packages/canvas/src/view.test.tsx', 'import "../server/work.mjs"').length, 1)
})
test('baseline accepts equality, rejects growth/new pairs and requires deliberate shrink', () => {
  const baseline = { 'rule:a.ts': 2 }
  assert.deepEqual(compare(baseline, baseline), [])
  assert.equal(compare({ 'rule:a.ts': 3 }, baseline, true).length, 1)
  assert.equal(compare({ 'rule:b.ts': 1 }, baseline, true).length, 1)
  assert.match(compare({}, baseline)[0], /--update/)
  assert.deepEqual(compare({}, baseline, true), [])
  assert.deepEqual(count([{ code: 'rule', filename: 'a.ts' }, { code: 'rule', filename: 'a.ts' }]), baseline)
  assert.throws(() => count([{ filename: 'a.ts' }]), /Unclassified/)
  assert.throws(() => compare({}, { bad: -1 }), /Invalid/)
})
