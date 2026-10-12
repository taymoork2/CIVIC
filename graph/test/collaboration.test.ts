import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  checkDocument,
  closeCollaboration,
  decisionFileRecords,
  DECISION_FILE_SCHEMA,
  gapsIn,
  indexGraph,
  recordCollaboration,
  validateGraph,
  type Actor,
  type CollaborationRecord,
  type DecisionFile,
  type GraphDocument,
} from '../src/index.ts'
import { edited, record } from './helpers.ts'

// Collaboration records (roadmap step 3): typed, owned concerns about the contract instead
// of passive comments, kept in the decision file and read by the gate and civic gaps.

const qa = { role: 'qa', who: 'button-qa' } as const
const design = { role: 'design', who: 'design-system-maintainers' } as const

function collab(fields: Partial<CollaborationRecord> = {}): CollaborationRecord {
  return {
    id: 'collab:ambiguity.button',
    kind: 'collaboration',
    title: 'Ambiguity on Button',
    type: 'ambiguity',
    subjectIds: ['semantic:button'],
    platform: 'android',
    summary: 'Should a disabled Button stay focusable on Android?',
    perspectives: ['design', 'engineering'],
    owners: [design],
    raisedBy: qa,
    at: '2026-10-12T00:00:00Z',
    status: 'open',
    ...fields,
  }
}

const exception = (fields: Partial<CollaborationRecord> = {}) =>
  collab({ id: 'collab:exception.button', title: 'Exception on Button', type: 'exception', summary: 'Android ships without a transparent neutral Button.', userImpact: 'Toolbars use the subtle style instead.', revisitTrigger: 'Compose adds a transparent style.', expires: '2027-01-01', ...fields })

const errorCodes = (document: GraphDocument) => validateGraph(document).filter((issue) => issue.severity === 'error').map((issue) => issue.code)
const withRecords = (...records: CollaborationRecord[]) => edited('fluent-button', (d) => d.records.push(...records))

test('an open record and an exception in force are valid', () => {
  assert.deepEqual(errorCodes(withRecords(collab(), exception())), [])
})

const cases: [string, CollaborationRecord, string][] = [
  ['a record about nothing', collab({ subjectIds: [] }), 'collaboration-subjects'],
  ['an open record about something the graph lacks', collab({ subjectIds: ['semantic:gone'] }), 'dangling-reference'],
  ['a record nobody owns', collab({ owners: [] }), 'collaboration-owner'],
  ['an exception with no end date', exception({ expires: undefined }), 'exception-terms'],
  ['an exception with no revisit trigger', exception({ revisitTrigger: undefined }), 'exception-terms'],
  ['a risk with exception terms', collab({ type: 'risk', expires: '2027-01-01' }), 'exception-terms'],
  ['a resolved record that says nothing of how', collab({ status: 'resolved' }), 'collaboration-resolution'],
  ['an open record with a resolution', collab({ resolution: { by: design, at: '2026-10-13T00:00:00Z', note: 'Done.', recordIds: [], changes: [] } }), 'collaboration-resolution'],
  ['an unknown type', collab({ type: 'opinion' as CollaborationRecord['type'] }), 'shape'],
]

for (const [name, item, code] of cases) {
  test(`rejects ${name}`, () => {
    const codes = errorCodes(withRecords(item))
    assert.ok(codes.includes(code), `expected ${code} in ${JSON.stringify(codes)}`)
  })
}

test('an agent may raise an ambiguity, but never records an exception or closes a record (D35)', () => {
  const actors = (d: GraphDocument) => d.records.push(
    { id: 'actor:person.taymoor', kind: 'actor', title: 'Taymoor', type: 'person', handle: 'taymoor' } as Actor,
    { id: 'actor:agent.claude-code.taymoor', kind: 'actor', title: 'Claude Code for Taymoor', type: 'agent', handle: 'claude-code', delegatedBy: 'actor:person.taymoor' } as Actor,
  )
  const agent = 'actor:agent.claude-code.taymoor'
  assert.deepEqual(errorCodes(edited('fluent-button', (d) => { actors(d); d.records.push(collab({ writtenBy: agent })) })), [])
  assert.ok(errorCodes(edited('fluent-button', (d) => { actors(d); d.records.push(exception({ writtenBy: agent })) })).includes('agent-decision'))
  const closed = collab({ writtenBy: agent, status: 'resolved', resolution: { by: design, at: '2026-10-13T00:00:00Z', note: 'Stays focusable.', recordIds: [], changes: [] } })
  assert.ok(errorCodes(edited('fluent-button', (d) => { actors(d); d.records.push(closed) })).includes('agent-resolved'))
})

test('a closed record keeps its history after the import stops raising what it was about', () => {
  const closed = collab({ subjectIds: ['conflict:button.android.gone'], status: 'resolved', resolution: { by: design, at: '2026-10-13T00:00:00Z', note: 'Fixed in the kit.', recordIds: [], changes: [{ tool: 'figma', revision: 'kit-v2' }] } })
  assert.deepEqual(errorCodes(withRecords(closed)), [])
})

test('the gate reports open records as advisory, says when one is overdue, and fails an expired exception', () => {
  const document = withRecords(collab({ due: '2026-10-10' }), exception(), exception({ id: 'collab:exception.button.2', expires: '2026-10-01', limitation: true }))
  const { findings, measures } = checkDocument('button', document, { today: '2026-10-12' })
  const mine = new Map(findings.filter((item) => item.subjectId.startsWith('collab:')).map((item) => [item.subjectId, item]))
  assert.deepEqual([...mine.values()].map((item) => [item.subjectId, item.kind]).sort(), [
    ['collab:ambiguity.button', 'open-collaboration'],
    ['collab:exception.button', 'approved-exception'],
    ['collab:exception.button.2', 'expired-exception'],
  ])
  assert.match(mine.get('collab:ambiguity.button')!.summary, /^Open ambiguity: Should a disabled Button stay focusable on Android\? It was due 2026-10-10\. Needs design, engineering\.$/)
  assert.match(mine.get('collab:exception.button.2')!.summary, /accepted limitation expired on 2026-10-01/)
  assert.deepEqual(measures.find((item) => item.check === 'Collaboration records open'), { graph: 'button', check: 'Collaboration records open', found: 1, of: 1 })
})

test('civic gaps lists the open records on a component, with their owners', () => {
  const gaps = gapsIn(indexGraph(withRecords(collab(), exception(), collab({ id: 'collab:risk.button', type: 'risk', status: 'withdrawn', resolution: { by: design, at: '2026-10-13T00:00:00Z', note: 'Not a risk.', recordIds: [], changes: [] } }))), { scope: 'semantic:button' })
  const mine = gaps.filter((gap) => gap.subjectId.startsWith('collab:'))
  assert.deepEqual(mine.map((gap) => [gap.kind, gap.subjectId, gap.owners]), [
    ['approved-exception', 'collab:exception.button', [design]],
    ['open-collaboration', 'collab:ambiguity.button', [design]],
  ])
})

test('recordCollaboration numbers IDs, and closeCollaboration keeps the record as history', () => {
  const empty: DecisionFile = { schema: DECISION_FILE_SCHEMA, decisions: [] }
  const { id: _id, kind: _kind, status: _status, ...fields } = collab()
  const first = recordCollaboration(empty, fields)
  const second = recordCollaboration(first.file, fields)
  assert.deepEqual([first.record.id, second.record.id], ['collab:ambiguity.button', 'collab:ambiguity.button.2'])
  const closed = closeCollaboration(second.file, 'collab:ambiguity.button', 'resolved', { by: design, at: '2026-10-13T00:00:00Z', note: 'Disabled Buttons stay focusable.', recordIds: [], changes: [] })
  assert.deepEqual(decisionFileRecords(closed.file).map((item) => [item.id, (item as CollaborationRecord).status]), [['collab:ambiguity.button', 'resolved'], ['collab:ambiguity.button.2', 'open']])
  assert.throws(() => closeCollaboration(closed.file, 'collab:ambiguity.button', 'withdrawn', closed.record.resolution!), /already resolved/)
})

test('civic raise and civic close keep collaboration records in the decision file, checked against the graph', () => {
  const dir = mkdtempSync(join(tmpdir(), 'civic-collab-'))
  const file = join(dir, 'decisions.json')
  const graphPath = join(dir, 'raised.graph.json')
  writeFileSync(graphPath, JSON.stringify(edited('fluent-button', () => {})))
  const civic = (...rest: string[]) => spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli.ts', import.meta.url)), ...rest], { encoding: 'utf8' })
  const ok = (result: ReturnType<typeof civic>) => assert.equal(result.status, 0, result.stdout + result.stderr)

  ok(civic('raise', file, 'coverage-gap', '--graph', graphPath, '--about', 'semantic:button', '--platform', 'ios', '--summary', 'No device run covers the iOS Button.',
    '--by', 'qa:button-qa', '--owners', 'qa:button-qa', '--perspectives', 'qa,engineering', '--due', '2026-11-01', '--at', '2026-10-12T00:00:00Z'))
  const missing = civic('raise', file, 'exception', '--graph', graphPath, '--about', 'semantic:button', '--summary', 'x', '--by', 'design:a', '--owners', 'design:a')
  assert.equal(missing.status, 2)
  assert.match(missing.stderr, /needs --impact, --revisit and --expires/)
  const dangling = civic('raise', file, 'risk', '--graph', graphPath, '--about', 'semantic:gone', '--summary', 'x', '--by', 'design:a', '--owners', 'design:a')
  assert.equal(dangling.status, 1)
  assert.match(dangling.stderr, /Not recorded/)

  ok(civic('close', file, 'collab:coverage-gap.button', '--graph', graphPath, '--by', 'qa:button-qa', '--note', 'Added the iOS device run.', '--changes', 'git:4f2a9c1', '--at', '2026-10-13T00:00:00Z'))
  const saved = JSON.parse(readFileSync(file, 'utf8')) as DecisionFile
  const closed = record<CollaborationRecord>({ schema: '0', records: decisionFileRecords(saved), links: [] } as unknown as GraphDocument, 'collab:coverage-gap.button')
  assert.equal(closed.status, 'resolved')
  assert.deepEqual(closed.resolution, { by: qa, at: '2026-10-13T00:00:00Z', note: 'Added the iOS device run.', recordIds: [], changes: [{ tool: 'git', revision: '4f2a9c1' }] })
  assert.deepEqual(closed.perspectives, ['qa', 'engineering'])
})
