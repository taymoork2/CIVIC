import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkDocument, compareToBaseline, DECISION_FILE_SCHEMA, recordDecision, type DecisionFile, type GraphDocument } from '../src/index.ts'

// Decision records (roadmap step 3): recorded in a decision file, checked against the graph,
// and read by the gate so a decided conflict stops failing it.

const CONFLICT = 'conflict:button.android.brand-outline'
const raisedPath = fileURLToPath(new URL('../../demo/fluent-button/out/raised.graph.json', import.meta.url))
const fields = {
  title: 'Update the kit',
  conflictId: CONFLICT,
  outcome: 'update-design',
  classification: 'outdated-design-source',
  alignment: 'awaiting-adoption',
  decidedBy: { role: 'design', who: 'design-system-maintainers' },
  at: '2026-10-11T00:00:00Z',
  rationale: 'The kit is older than Compose.',
  evidenceIds: ['evidence:figma.android-kit.button'],
} as const

test('a second call on the same conflict supersedes the first instead of overwriting it', () => {
  const empty: DecisionFile = { schema: DECISION_FILE_SCHEMA, decisions: [] }
  const first = recordDecision(empty, { ...fields, decidedBy: { ...fields.decidedBy }, evidenceIds: [...fields.evidenceIds] })
  assert.equal(first.decision.id, 'decision:button.android.brand-outline')
  assert.equal(first.decision.supersedes, undefined)
  const second = recordDecision(first.file, { ...fields, decidedBy: { ...fields.decidedBy }, evidenceIds: [...fields.evidenceIds], at: '2026-10-12T00:00:00Z' })
  assert.equal(second.decision.id, 'decision:button.android.brand-outline.2')
  assert.equal(second.decision.supersedes, 'decision:button.android.brand-outline')
  assert.equal(second.file.decisions.length, 2)
  assert.equal(empty.decisions.length, 0, 'recordDecision does not change its input')
})

test('civic decide records a decision that clears its conflict from the gate, and refuses one the graph rejects', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'civic-decide-')), 'decisions.json')
  const decide = (...extra: string[]) =>
    spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli.ts', import.meta.url)), 'decide', file, CONFLICT, '--graph', raisedPath, ...extra], { encoding: 'utf8' })

  const refused = decide('--outcome', 'approve-exception', '--classification', 'temporary-gap', '--by', 'design:design-system-maintainers', '--rationale', 'Later.', '--evidence', 'evidence:figma.android-kit.button')
  assert.equal(refused.status, 1, refused.stdout + refused.stderr)
  assert.match(refused.stderr, /exception-revisit/)

  const recorded = decide('--outcome', 'update-design', '--classification', 'outdated-design-source', '--by', 'design:design-system-maintainers', '--rationale', 'The kit is older than Compose.', '--evidence', 'evidence:figma.android-kit.button', '--at', '2026-10-11T00:00:00Z')
  assert.equal(recorded.status, 0, recorded.stdout + recorded.stderr)

  const decisions = JSON.parse(readFileSync(file, 'utf8')) as DecisionFile
  assert.deepEqual(decisions.decisions.map((decision) => [decision.id, decision.alignment]), [['decision:button.android.brand-outline', 'awaiting-adoption']])
  const raised = JSON.parse(readFileSync(raisedPath, 'utf8')) as GraphDocument
  const today = { today: '2026-10-11' }
  assert.equal(compareToBaseline([checkDocument('button', raised, today)], undefined).passed, false)
  const decided = { ...raised, records: [...raised.records, ...decisions.decisions] }
  // The decision clears the Android conflict; the iOS kit's two stay until someone decides them.
  const after = compareToBaseline([checkDocument('button', decided, today)], undefined)
  assert.deepEqual(after.fresh.map((item) => item.subjectId).sort(), ['conflict:button.ios.danger', 'conflict:button.ios.transparent-neutral'])
})
