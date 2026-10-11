import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { baselineFrom, checkDocument, compareToBaseline, renderCheck, statusLine, type GraphDocument } from '../src/index.ts'
import { record } from './helpers.ts'

// The gate's acceptance (roadmap step 8) on the Fluent Button and Card demo graphs.

const today = '2026-10-11'

function demo(name: string): GraphDocument {
  return JSON.parse(readFileSync(new URL(`../../demo/${name}.graph.json`, import.meta.url), 'utf8')) as GraphDocument
}

const run = (graph: string, document: unknown, date = today) => checkDocument(graph, document, { today: date })

test('the Button gate fails on the undecided conflict and passes once a decision covers it', () => {
  const raised = compareToBaseline([run('button', demo('fluent-button/out/raised'))], undefined)
  assert.equal(raised.passed, false)
  assert.deepEqual(raised.fresh.map((item) => item.key), ['open-conflict conflict:button.android.brand-outline android'])

  const resolved = compareToBaseline([run('button', demo('fluent-button/out/resolved'))], undefined)
  assert.equal(resolved.passed, true)
  assert.deepEqual(resolved.fresh, [])
  // Known, recorded facts are reported without blocking.
  assert.ok(resolved.advisory.some((item) => item.kind === 'missing-variant'))
})

test('counts come with their denominators', () => {
  const { measures } = run('card', demo('card/out/resolved'))
  const count = (check: string) => measures.find((item) => item.check === check)
  assert.deepEqual(count('Contract conflicts open'), { graph: 'card', check: 'Contract conflicts open', found: 1, of: 4 })
  assert.deepEqual(count('Overrides without a decision'), { graph: 'card', check: 'Overrides without a decision', found: 1, of: 4 })
  assert.deepEqual(count('Product states missing from designs'), { graph: 'card', check: 'Product states missing from designs', found: 2, of: 3 })
  assert.deepEqual(count('Journey screens that are dead ends'), { graph: 'card', check: 'Journey screens that are dead ends', found: 1, of: 3 })
})

test('the Card gate raises each undecided override, missing state and journey gap, one finding each', () => {
  const report = compareToBaseline([run('card', demo('card/out/raised'))], undefined)
  assert.equal(report.passed, false)
  assert.deepEqual(report.fresh.map((item) => item.kind), ['open-conflict', 'open-conflict', 'open-conflict', 'open-conflict', 'missing-state', 'missing-state', 'dead-end', 'unreachable-screen'])
})

test('baselined findings are ignored, a new one still fails, and a fixed one is reported', () => {
  const baseline = baselineFrom(compareToBaseline([run('card', demo('card/out/raised'))], undefined))
  assert.equal(compareToBaseline([run('card', demo('card/out/raised'))], baseline).passed, true)

  // Three of the four overrides are decided in the resolved graph, so they leave the baseline's findings.
  const resolved = compareToBaseline([run('card', demo('card/out/resolved'))], baseline)
  assert.equal(resolved.passed, true)
  assert.equal(resolved.baselined.length, 5)
  assert.equal(resolved.fixed.length, 3)

  // A new undecided override on the same graph is raised at the change that caused it.
  const changed = demo('card/out/resolved')
  const reopened = record(demo('card/out/raised'), 'conflict:shop.order-summary.card.actions')
  changed.records = changed.records.map((item) => (item.id === reopened.id ? (reopened as unknown as typeof item) : item))
  const report = compareToBaseline([run('card', changed)], baselineFrom(resolved))
  assert.equal(report.passed, false)
  assert.deepEqual(report.fresh.map((item) => item.subjectId), ['conflict:shop.order-summary.card.actions'])
})

test('an approved exception past its expiry blocks again', () => {
  const before = compareToBaseline([run('card', demo('card/out/resolved'))], undefined)
  assert.ok(before.advisory.some((item) => item.kind === 'approved-exception'))
  const after = compareToBaseline([run('card', demo('card/out/resolved'), '2027-04-02')], undefined)
  assert.ok(after.fresh.some((item) => item.kind === 'expired-exception' && item.subjectId === 'conflict:shop.order-summary.card.header-action'))
})

test('an override no conflict tracks is unreviewed and blocks', () => {
  const document = demo('card/out/resolved')
  document.records = document.records.filter((item) => item.id !== 'conflict:shop.order-summary.card.corner-radius')
  const report = compareToBaseline([run('card', document)], undefined)
  assert.ok(report.fresh.some((item) => item.kind === 'unreviewed-override' && item.subjectId.endsWith('corner-radius')))
})

test('a project can choose which kinds block', () => {
  const report = compareToBaseline([run('button', demo('fluent-button/out/resolved'))], undefined, ['open-conflict', 'no-run-evidence'])
  assert.equal(report.passed, false)
  assert.deepEqual(new Set(report.fresh.map((item) => item.kind)), new Set(['no-run-evidence']))
})

test('an invalid graph always fails and is never written to a baseline', () => {
  const broken = { schema: 'civic.graph/0', records: [{ id: 'nonsense', kind: 'intent', title: 'x' }], links: [] }
  const report = compareToBaseline([run('broken', broken)], undefined)
  assert.equal(report.passed, false)
  assert.ok(report.fresh.every((item) => item.kind === 'invalid-graph'))
  const baseline = baselineFrom(report)
  assert.deepEqual(baseline.findings, [])
  assert.equal(compareToBaseline([run('broken', broken)], baseline).passed, false)
})

test('the same graphs and date give the same report, and the summary fits a commit status', () => {
  const checks = () => [run('button', demo('fluent-button/out/raised')), run('card', demo('card/out/raised'))]
  assert.equal(renderCheck(compareToBaseline(checks(), undefined)), renderCheck(compareToBaseline(checks(), undefined)))
  assert.ok(statusLine(compareToBaseline(checks(), undefined)).length <= 140)
  assert.match(renderCheck(compareToBaseline(checks(), undefined)), /^# civic check: failed/)
})

test('the repository gate passes on its own config and baseline, and fails without the baseline', () => {
  const cli = (...extra: string[]) =>
    spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli.ts', import.meta.url)), 'check', '--today', today, ...extra], { cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8' })
  const pass = cli()
  assert.equal(pass.status, 0, pass.stdout + pass.stderr)
  assert.match(pass.stdout, /# civic check: passed/)
  const fail = cli('--baseline', 'no-such-baseline.json')
  assert.equal(fail.status, 1)
  assert.match(fail.stdout, /New, undecided/)
})
