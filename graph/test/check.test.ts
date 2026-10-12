import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { baselineFrom, checkDocument, compareToBaseline, renderCheck, statusLine, type GraphDocument } from '../src/index.ts'
import { decide } from './helpers.ts'

// The gate's acceptance (roadmap step 8) on the Fluent Button and Card demo graphs.

const today = '2026-10-11'

function demo(name: string): GraphDocument {
  return JSON.parse(readFileSync(new URL(`../../demo/${name}.graph.json`, import.meta.url), 'utf8')) as GraphDocument
}

const run = (graph: string, document: unknown, date = today) => checkDocument(graph, document, { today: date })

test('the Button gate fails on each undecided conflict and passes once decisions cover them', () => {
  const raised = compareToBaseline([run('button', demo('fluent-button/out/raised'))], undefined)
  assert.equal(raised.passed, false)
  const ios = ['open-conflict conflict:button.ios.danger ios', 'open-conflict conflict:button.ios.transparent-neutral ios']
  assert.deepEqual(raised.fresh.map((item) => item.key).sort(), ['open-conflict conflict:button.android.brand-outline android', ...ios])

  // The demo's decision records cover all three, so the resolved graph passes.
  const passed = compareToBaseline([run('button', demo('fluent-button/out/resolved'))], undefined)
  assert.equal(passed.passed, true)
  assert.deepEqual(passed.fresh, [])
  // Known, recorded facts are reported without blocking.
  assert.ok(passed.advisory.some((item) => item.kind === 'missing-variant'))
})

test('counts come with their denominators', () => {
  const { measures } = run('card', demo('card/out/resolved'))
  const count = (check: string) => measures.find((item) => item.check === check)
  assert.deepEqual(count('Contract conflicts open'), { graph: 'card', check: 'Contract conflicts open', found: 1, of: 5 })
  assert.deepEqual(count('Overrides without a decision'), { graph: 'card', check: 'Overrides without a decision', found: 1, of: 2 })
  assert.deepEqual(count('Product states missing from designs'), { graph: 'card', check: 'Product states missing from designs', found: 3, of: 3 })
  assert.deepEqual(count('Journey screens that are dead ends'), { graph: 'card', check: 'Journey screens that are dead ends', found: 1, of: 3 })
})

test('the Card gate raises each undecided override, library default iOS can\'t build, missing state and journey gap, one finding each', () => {
  const report = compareToBaseline([run('card', demo('card/out/raised'))], undefined)
  assert.equal(report.passed, false)
  assert.deepEqual(report.fresh.map((item) => item.kind), ['open-conflict', 'open-conflict', 'open-conflict', 'open-conflict', 'open-conflict', 'missing-state', 'missing-state', 'missing-state', 'dead-end', 'unreachable-screen'])
})

test('baselined findings are ignored, a new one still fails, and a fixed one is reported', () => {
  const baseline = baselineFrom(compareToBaseline([run('card', demo('card/out/raised'))], undefined))
  assert.equal(compareToBaseline([run('card', demo('card/out/raised'))], baseline).passed, true)

  // One of the two overrides and the three iOS library defaults are decided in the resolved graph, so they leave the baseline's findings.
  const resolved = compareToBaseline([run('card', demo('card/out/resolved'))], baseline)
  assert.equal(resolved.passed, true)
  assert.equal(resolved.baselined.length, 6)
  assert.equal(resolved.fixed.length, 4)

  // A new undecided override on the same graph is raised at the change that caused it.
  const changed = demo('card/out/resolved')
  changed.records = changed.records.filter((item) => item.id !== 'decision:shop.order-summary.card.corner-radius')
  const report = compareToBaseline([run('card', changed)], baselineFrom(resolved))
  assert.equal(report.passed, false)
  assert.deepEqual(report.fresh.map((item) => item.subjectId), ['conflict:shop.order-summary.card.corner-radius'])
})

test('an approved exception past its expiry blocks again', () => {
  const excepted = demo('card/out/resolved')
  decide(excepted, 'conflict:shop.order-summary.card.state-selected', {
    outcome: 'approve-exception',
    classification: 'temporary-gap',
    alignment: 'accepted-limitation',
    evidenceIds: ['evidence:fluent-apple.card-view.variants'],
    revisitTrigger: 'Fluent iOS CardView gains a selected state.',
    expires: '2027-04-01',
  })
  const before = compareToBaseline([run('card', excepted)], undefined)
  assert.ok(before.advisory.some((item) => item.kind === 'approved-exception'))
  const after = compareToBaseline([run('card', excepted, '2027-04-02')], undefined)
  assert.ok(after.fresh.some((item) => item.kind === 'expired-exception' && item.subjectId === 'conflict:shop.order-summary.card.state-selected'))
})

test('an override no conflict tracks is unreviewed and blocks', () => {
  const document = demo('card/out/resolved')
  document.records = document.records.filter((item) => item.id !== 'conflict:shop.order-summary.card.corner-radius' && item.id !== 'decision:shop.order-summary.card.corner-radius')
  const report = compareToBaseline([run('card', document)], undefined)
  assert.ok(report.fresh.some((item) => item.kind === 'unreviewed-override' && item.subjectId.endsWith('corner-radius')))
})

test('a decision recorded on an open conflict clears its finding, and only its finding', () => {
  const raised = demo('fluent-button/out/raised')
  const decided = demo('fluent-button/out/raised')
  decide(decided, 'conflict:button.android.brand-outline', { evidenceIds: ['evidence:figma.android-kit.button'], decidedBy: { role: 'design', who: 'design-system-maintainers' } })
  assert.equal(compareToBaseline([run('button', raised)], undefined).passed, false)
  const report = compareToBaseline([run('button', decided)], undefined)
  assert.deepEqual(report.fresh.map((item) => item.subjectId).sort(), ['conflict:button.ios.danger', 'conflict:button.ios.transparent-neutral'])
  assert.deepEqual(
    report.measures.find((item) => item.check === 'Contract conflicts open'),
    { graph: 'button', check: 'Contract conflicts open', found: 2, of: 3 },
  )
})

test('an agent-written decision does not clear a finding: the graph is invalid', () => {
  const document = demo('fluent-button/out/raised')
  document.records.push(
    { id: 'actor:person.taymoor', kind: 'actor', title: 'Taymoor', type: 'person', handle: 'taymoor' },
    { id: 'actor:agent.claude-code.taymoor', kind: 'actor', title: 'Claude Code for Taymoor', type: 'agent', handle: 'claude-code', delegatedBy: 'actor:person.taymoor' },
  )
  decide(document, 'conflict:button.android.brand-outline', { evidenceIds: ['evidence:figma.android-kit.button'], writtenBy: 'actor:agent.claude-code.taymoor' })
  const report = compareToBaseline([run('button', document)], undefined)
  assert.equal(report.passed, false)
  assert.ok(report.fresh.some((item) => item.kind === 'invalid-graph' && item.key.includes('agent-decision')))
})

test('a project can choose which kinds block', () => {
  const report = compareToBaseline([run('button', demo('fluent-button/out/resolved'))], undefined, ['no-run-evidence'])
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

test('a discovered screen is reported as awaiting confirmation and never blocks', () => {
  const screen = (id: string, presence: 'expected' | 'discovered') => ({ id, kind: 'target' as const, title: id, scale: 'screen' as const, presence, owners: [{ role: 'engineering' as const, who: 'eng' }] })
  const document: GraphDocument = { schema: 'civic.graph/0', records: [screen('target:app.found', 'discovered'), screen('target:app.known', 'expected')], links: [] }
  const report = compareToBaseline([run('app', document)], undefined)
  assert.equal(report.passed, true)
  assert.deepEqual(report.advisory.map((item) => [item.kind, item.subjectId]), [['unconfirmed-target', 'target:app.found']])
  assert.deepEqual(report.measures.find((measure) => measure.check === 'Screens awaiting confirmation'), { graph: 'app', check: 'Screens awaiting confirmation', found: 1, of: 2 })
})
