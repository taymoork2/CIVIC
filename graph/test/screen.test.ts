import assert from 'node:assert/strict'
import { test } from 'node:test'
import { indexGraph, renderScreen, screenFacts, type GraphDocument } from '../src/index.ts'


const owners = [{ role: 'qa' as const, who: 'qa' }]
const screen = (id: string, title: string) => ({ id, kind: 'target' as const, title, scale: 'screen' as const, presence: 'expected' as const, owners })
const source = { tool: 'playwright', importer: 'playwright-report', revision: 'abc123def4567' }
const document: GraphDocument = {
  schema: 'civic.graph/0',
  records: [
    { id: 'target:app.journey', kind: 'target', title: 'Add an item', scale: 'journey', presence: 'expected', owners },
    screen('target:app.form', 'Form'),
    screen('target:app.done', 'Done'),
    { id: 'evidence:playwright.saves', kind: 'evidence', title: 'saves', subjectIds: ['target:app.form'], tier: 'automated', method: 'playwright', outcome: 'pass', capturedAt: '2026-10-12T00:00:00Z', source },
    { id: 'evidence:playwright.errors', kind: 'evidence', title: 'shows errors', subjectIds: ['target:app.form'], tier: 'automated', method: 'playwright', outcome: 'fail', finding: 'expected alert', capturedAt: '2026-10-12T00:00:00Z', source },
  ],
  links: [
    { from: 'target:app.journey', relation: 'contains', to: 'target:app.form', status: 'declared' },
    { from: 'target:app.journey', relation: 'contains', to: 'target:app.done', status: 'declared' },
    { from: 'target:app.form', relation: 'navigates', to: 'target:app.done', status: 'declared', action: 'Save' },
    { from: 'target:app.form', relation: 'navigates', unmapped: '/help', status: 'proposed', action: 'Help' },
  ],
}

test('a screen\'s facts: its journeys, paths, evidence and the gate\'s findings on it', () => {
  const graph = indexGraph(document)
  const facts = screenFacts(graph, 'app.graph.json', 'target:app.form', { today: '2026-10-12', baseline: { schema: 'civic.baseline/0', findings: [{ graph: 'app.graph.json', key: 'failing-evidence evidence:playwright.errors', summary: '' }] } })
  assert.deepEqual(facts.journeys, [{ id: 'target:app.journey', title: 'Add an item' }])
  assert.deepEqual(facts.paths.map((path) => [path.action, path.toTitle ?? path.unmapped, path.counts]), [['Save', 'Done', true], ['Help', '/help', false]])
  assert.deepEqual(facts.evidence.map((item) => [item.title, item.outcome]), [['saves', 'pass'], ['shows errors', 'fail']])
  assert.deepEqual(facts.findings.map((item) => [item.kind, item.subjectId, item.baselined]), [['failing-evidence', 'evidence:playwright.errors', true]])
  // Done has no way on and isn't an exit: the gate's dead end is about Done, not Form.
  assert.deepEqual(screenFacts(graph, 'app.graph.json', 'target:app.done', { today: '2026-10-12' }).findings.map((item) => [item.kind, item.baselined]), [['dead-end', false]])
  assert.match(renderScreen(facts), /fail: shows errors \(playwright, abc123def456\): expected alert/)
  assert.throws(() => screenFacts(graph, 'app.graph.json', 'target:app.nope', { today: '2026-10-12' }), /not a target/)
})
