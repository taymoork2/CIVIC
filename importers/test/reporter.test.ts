import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { runCoverage, type Evidence, type GraphDocument } from '../../graph/src/index.ts'
import { CivicReporter, readCivicRun } from '../src/index.ts'

// Step 10's QA check: a Playwright reporter that writes run evidence for the graph and says
// what the run left uncovered. Driven here through Playwright's reporter calls directly.

const button = () => JSON.parse(readFileSync(new URL('../../demo/fluent-button/out/resolved.graph.json', import.meta.url), 'utf8')) as GraphDocument
const subject = (id: string) => ({ type: 'civic.subject', description: id })

function runReporter(options: ConstructorParameters<typeof CivicReporter>[0], tests: { title: string; status: string; subjects: string[]; line?: number }[]) {
  const root = mkdtempSync(join(tmpdir(), 'civic-reporter-'))
  const reporter = new CivicReporter({ revision: 'rev-2', ...options })
  reporter.onBegin({ rootDir: root, metadata: {} })
  tests.forEach((item, index) => {
    const testCase = { id: `t${index}`, title: item.title, location: { file: join(root, 'e2e/button.spec.ts'), line: item.line ?? index + 1 }, annotations: item.subjects.map(subject) }
    const errors = item.status === 'passed' ? [] : [{ message: 'expected visible\nmore detail' }]
    reporter.onTestEnd(testCase, { status: item.status, startTime: new Date('2026-10-12T00:00:00Z'), errors })
  })
  const logs: string[] = []
  const log = console.log
  console.log = (...args: unknown[]) => void logs.push(args.join(' '))
  try {
    reporter.onEnd()
  } finally {
    console.log = log
  }
  return { reporter, root, output: logs.join('\n') }
}

test('the reporter turns a run into evidence, keeping each test\'s last attempt', () => {
  const root = mkdtempSync(join(tmpdir(), 'civic-reporter-'))
  const reporter = new CivicReporter({ revision: 'rev-2', output: 'out/run.json' })
  reporter.onBegin({ rootDir: root })
  const testCase = { id: 'a', title: 'brand Button has an accessible name', location: { file: join(root, 'e2e/button.spec.ts'), line: 12 }, annotations: [subject('semantic:button')] }
  reporter.onTestEnd(testCase, { status: 'failed', startTime: new Date('2026-10-12T00:00:00Z'), errors: [{ message: 'flaky' }] })
  reporter.onTestEnd(testCase, { status: 'passed', startTime: new Date('2026-10-12T00:00:05Z'), errors: [] })
  reporter.onTestEnd({ ...testCase, id: 'b', title: 'not CIVIC evidence', annotations: [] }, { status: 'passed', startTime: new Date(), errors: [] })
  const log = console.log
  console.log = () => {}
  try {
    reporter.onEnd()
  } finally {
    console.log = log
  }
  const evidence = readCivicRun(JSON.parse(readFileSync(join(root, 'out/run.json'), 'utf8')))
  assert.equal(evidence.length, 1)
  assert.deepEqual(
    { outcome: evidence[0]!.outcome, subjects: evidence[0]!.subjectIds, source: evidence[0]!.source },
    { outcome: 'pass', subjects: ['semantic:button'], source: { tool: 'playwright', importer: 'playwright-report', revision: 'rev-2', path: 'e2e/button.spec.ts', anchor: 'line 12' } },
  )
})

test('against the Button graph it names what now fails, and what the run left uncovered with its QA owners', () => {
  const graph = mkdtempSync(join(tmpdir(), 'civic-graph-'))
  writeFileSync(join(graph, 'graph.json'), JSON.stringify(button()))
  const { reporter, output } = runReporter({ graph: join(graph, 'graph.json') }, [
    { title: 'brand Button has an accessible name', status: 'failed', subjects: ['intent:button.accessible-name'] },
    { title: 'brand Button uses the brand token', status: 'passed', subjects: ['semantic:button', 'token:colorBrandBackground'] },
  ])
  const coverage = reporter.run!.coverage!
  assert.deepEqual(coverage.newlyFailing.map((item) => [item.id, item.tests]), [['intent:button.accessible-name', ['brand Button has an accessible name']]])
  assert.deepEqual(coverage.newlyPassing, [])
  // The graph's web runs cover eight subjects; this run covered three of them.
  assert.equal(coverage.expected, 8)
  assert.equal(coverage.covered, 3)
  assert.deepEqual(coverage.uncovered.map((item) => item.id), ['extension:fluent-react-v9.button.disabledFocusable', 'platform:fluent-react-v9.button', 'token:colorNeutralBackground1', 'token:colorSubtleBackground', 'token:colorTransparentBackground'])
  assert.match(output, /Now failing, passed in the graph \(1\):/)
  assert.match(output, /Left uncovered by this run \(5 of 8 expected\):/)
  assert.match(output, /Failed: brand Button has an accessible name\./)
})

test('a screen the graph expects and no test reaches is uncovered; a subject that recovers is reported', () => {
  const owners = [{ role: 'engineering' as const, who: 'eng' }, { role: 'qa' as const, who: 'qa-team' }]
  const screen = (id: string) => ({ id, kind: 'target' as const, title: id, scale: 'screen' as const, presence: 'expected' as const, owners })
  const failing: Evidence = { id: 'evidence:playwright.home', kind: 'evidence', title: 'home', subjectIds: ['target:app.home'], tier: 'automated', method: 'playwright', platform: 'web', outcome: 'fail', capturedAt: '2026-10-11T00:00:00Z', source: { tool: 'playwright', importer: 'playwright-report', revision: 'rev-1' } }
  const document: GraphDocument = { schema: 'civic.graph/0', records: [screen('target:app.home'), screen('target:app.settings'), { ...screen('target:app.found'), presence: 'discovered' }, failing], links: [] }
  const coverage = runCoverage(document, [{ ...failing, outcome: 'pass', source: { ...failing.source, revision: 'rev-2' } }], 'web')
  assert.deepEqual(coverage.newlyPassing.map((item) => item.id), ['target:app.home'])
  // A discovered screen isn't expected until a person confirms it (D34). QA owners are named.
  assert.deepEqual(coverage.uncovered, [{ id: 'target:app.settings', title: 'target:app.settings', owners: [{ role: 'qa', who: 'qa-team' }] }])
  assert.equal(runCoverage(document, [], 'web', (id) => id !== 'target:app.settings').uncovered.length, 1)
})

test('without a revision or a git checkout the reporter refuses to write evidence', () => {
  const reporter = new CivicReporter({})
  reporter.onBegin({ rootDir: mkdtempSync(join(tmpdir(), 'civic-nogit-')) })
  assert.throws(() => reporter.onEnd(), /needs a revision/)
})
