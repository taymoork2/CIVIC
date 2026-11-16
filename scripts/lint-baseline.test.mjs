import assert from 'node:assert/strict'
import { test } from 'node:test'
import { adopt, architecture, compare, count, effectFindings } from '../bin/lint-baseline.mjs'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

test('Effect diagnostics retain rule/file counts and fail closed without the plugin', () => {
  const report = { diagnostics: [{ name: 'floatingEffect', file: fileURLToPath(new URL('../review/src/mcp.ts', import.meta.url)) }], summary: { filesChecked: 1, filesWithoutPlugin: 0 } }
  assert.deepEqual(count(effectFindings(report)), { 'effect/floatingEffect:review/src/mcp.ts': 1 })
  assert.throws(() => effectFindings({ ...report, summary: { filesChecked: 0 } }), /inactive/)
  assert.throws(() => effectFindings({ ...report, diagnostics: [{}] }), /Unclassified/)
})

const cases = [
  ['useEffect', 'packages/canvas/src/a.tsx', 'useEffect(() => {})', 'useExternalSync()'],
  ['raw-timer', 'packages/local/a.mjs', 'setTimeout(work, 1)', 'Clock.sleep(1)'],
  ['module-mocking', 'review/test/a.ts', 'vi.mock("./a")', 'vi.fn()'],
  ['data-core', 'graph/src/a.ts', 'export * from "effect/Clock"', 'import x from "node:path"'],
  ['browser-server', 'packages/shell/src/a.ts', 'import("../server/a")', 'import("./a")'],
  ['outside-repo', 'graph/src/a.ts', 'require("../../../outside")', 'require("./a")'],
]
test('adoption adds only a new named rule and refuses every unrelated change', () => {
  const baseline = { 'existing:a.ts': 2 }
  const current = { ...baseline, 'anti-slop-effect(new-rule):a.ts': 3 }
  assert.deepEqual(adopt(current, baseline, 'anti-slop-effect(new-rule)'), current)
  assert.throws(() => adopt({ ...current, 'existing:a.ts': 3 }, baseline, 'anti-slop-effect(new-rule)'), /grew/)
  assert.throws(() => adopt({ ...current, 'existing:a.ts': 1 }, baseline, 'anti-slop-effect(new-rule)'), /shrank/)
  assert.throws(() => adopt({ ...current, 'other:a.ts': 1 }, baseline, 'anti-slop-effect(new-rule)'), /grew/)
  assert.throws(() => adopt(current, current, 'anti-slop-effect(new-rule)'), /already adopted/)
  assert.throws(() => adopt(current, baseline, 'existing'), /requires/)
})

test('Effect 4 lint fixtures accept service construction and reject manual tags', () => {
  const dir = mkdtempSync(join(tmpdir(), 'effect-lint-'))
  const plugin = fileURLToPath(new URL('../tools/oxlint/anti-slop-effect/index.ts', import.meta.url))
  const config = join(dir, 'config.json')
  writeFileSync(config, JSON.stringify({ jsPlugins: [{ name: 'anti-slop-effect', specifier: plugin }], rules: {
    'anti-slop-effect/require-service-make-layer': 'error',
    'anti-slop-effect/require-operation-span': 'error',
    'anti-slop-effect/no-manual-tagged-construction': 'error',
  } }))
  const valid = join(dir, 'valid.ts'), invalid = join(dir, 'invalid.ts')
  writeFileSync(valid, `import { Context, Effect, Layer, Schema } from 'effect';
    class Failure extends Schema.TaggedError<Failure>()('Failure', {}) {}
    class Store extends Context.Service<Store, { find: () => Effect.Effect<void> }>()('Store', {
      make: Effect.gen(function* () { return { find: Effect.fn('Store.find')(function* () {}) }; })
    }) { static layer = Layer.effect(this, this.make); }`)
  writeFileSync(invalid, `const value = { _tag: 'Ready' };`)
  const result = spawnSync('pnpm', ['--dir', fileURLToPath(new URL('../packages', import.meta.url)), 'exec', 'vp', 'lint', '--config', config, '--format', 'json', '--threads', '2', valid, invalid], { encoding: 'utf8' })
  assert.equal(result.status, 1, result.stderr)
  const diagnostics = JSON.parse(result.stdout).diagnostics.filter(item => item.code.startsWith('anti-slop-effect'))
  assert.equal(diagnostics.length, 1, JSON.stringify(diagnostics))
  assert.equal(diagnostics[0].code, 'anti-slop-effect(no-manual-tagged-construction)')
})
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
test('shared subscription hooks permit exactly one effect', () => {
  for (const file of ['use-window-event.ts', 'use-resize-observer.ts', 'use-frame-keydown.ts']) {
    assert.deepEqual(architecture(`packages/shell/src/${file}`, 'useEffect(work)'), [])
    assert.equal(architecture(`packages/shell/src/${file}`, 'useEffect(work); useEffect(other)').length, 1)
  }
  assert.equal(architecture('packages/shell/src/use-anything.ts', 'useEffect(work)').length, 1)
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
