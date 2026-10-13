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
  assert.deepEqual(screenFacts(graph, 'app.graph.json', 'target:app.done', { today: '2026-10-12' }).findings.map((item) => [item.kind, item.baselined, item.blocks]), [['dead-end', false, true]])
  assert.match(renderScreen(facts), /fail: shows errors \(playwright, abc123def456\): expected alert/)
  assert.throws(() => screenFacts(graph, 'app.graph.json', 'target:app.nope', { today: '2026-10-12' }), /not a target/)
})

test('an open collaboration record about a screen, such as a coverage gap, shows with its findings', () => {
  const gap = { id: 'collab:coverage-gap.app.done', kind: 'collaboration' as const, title: 'Coverage gap: Done', type: 'coverage-gap' as const, subjectIds: ['target:app.done'], summary: 'No passing run covers `done`.', perspectives: ['qa' as const], owners, raisedBy: owners[0]!, at: '2026-10-12T00:00:00Z', status: 'open' as const }
  const graph = indexGraph({ ...document, records: [...document.records, gap] })
  assert.deepEqual(screenFacts(graph, 'app.graph.json', 'target:app.done', { today: '2026-10-12' }).findings.map((item) => [item.kind, item.subjectId, item.blocks]), [['dead-end', 'target:app.done', true], ['open-collaboration', 'collab:coverage-gap.app.done', false]])
  assert.ok(!screenFacts(graph, 'app.graph.json', 'target:app.form', { today: '2026-10-12' }).findings.some((item) => item.kind === 'open-collaboration'))
})

test("a screen's design frames come from the design files that name it, and are shown as design intent", () => {
  const frame = (node: string, designs: string[]) => ({ node, name: `Form ${node}`, page: 'form', hash: `sha256:${'0'.repeat(64)}`, designs })
  const design = { schema: 'civic.design/0' as const, tool: 'open-design', key: 'app', name: 'App reference', version: '2026-10-07', frames: [frame('form-light', ['target:app.form']), frame('form-dark', ['target:app.form']), frame('done-light', ['target:app.done'])] }
  const facts = screenFacts(indexGraph(document), 'app.graph.json', 'target:app.form', { today: '2026-10-12', designs: [{ file: 'app.design.json', design }] })
  assert.deepEqual(facts.design, [{ file: 'app.design.json', tool: 'open-design', name: 'App reference', version: '2026-10-07', frames: [{ node: 'form-light', name: 'Form form-light', page: 'form' }, { node: 'form-dark', name: 'Form form-dark', page: 'form' }] }])
  assert.match(renderScreen(facts), /## Design\n\nApp reference \(open-design, version 2026-10-07\), design intent:\n- Form form-light \(`form-light`\)/)
  // A frame with the same page name but no claim on the screen designs nothing.
  assert.deepEqual(screenFacts(indexGraph(document), 'app.graph.json', 'target:app.journey', { today: '2026-10-12', designs: [{ file: 'app.design.json', design }] }).design, [])
  assert.match(renderScreen(screenFacts(indexGraph(document), 'app.graph.json', 'target:app.done', { today: '2026-10-12' })), /No design frame names this screen\./)
})
