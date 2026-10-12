import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  checkDocument,
  compareToBaseline,
  conflictState,
  decisionFileRecords,
  indexGraph,
  validateGraph,
  type Adoption,
  type DecisionFile,
  type Evidence,
  type GraphDocument,
  type Proposal,
  type Verification,
} from '../src/index.ts'
import { decide, edited, record } from './helpers.ts'

// The decision loop (roadmap step 3): a Proposal, a person's Decision, the Adoption that
// carries it and the Verification that proves it, each its own record, re-checked by the gate.

const CONFLICT = 'conflict:button.android.neutral-default'
const owner = { role: 'design', who: 'design-system-maintainers' } as const

function proposal(fields: Partial<Proposal> = {}): Proposal {
  return {
    id: 'proposal:button.android.neutral-default',
    kind: 'proposal',
    title: 'Drop Neutral default from the Android kit',
    conflictId: CONFLICT,
    targetIds: ['semantic:button'],
    scope: 'component',
    outcome: 'update-design',
    baseline: { tool: 'figma', revision: 'decision-0001' },
    candidate: { tool: 'figma', revision: 'kit-v2', preview: 'https://figma.example/branch/kit-v2' },
    rationale: 'Compose has no stock neutral default, so the kit should not draw one.',
    expected: 'The Android kit draws Primary as the default Button.',
    proposedBy: owner,
    at: '2026-10-12T00:00:00Z',
    ...fields,
  }
}

function adoption(fields: Partial<Adoption> = {}): Adoption {
  return {
    id: 'adoption:button.android.neutral-default',
    kind: 'adoption',
    title: 'Kit v2 drops Neutral default',
    decisionId: 'decision:button.android.neutral-default',
    carriedBy: { tool: 'figma', revision: 'kit-v2' },
    adoptedBy: owner,
    at: '2026-10-13T00:00:00Z',
    ...fields,
  }
}

function run(fields: Partial<Evidence> = {}): Evidence {
  return {
    id: 'evidence:android-figma-kit.button.default',
    kind: 'evidence',
    title: 'The Android kit draws Primary as the default',
    subjectIds: ['semantic:button'],
    tier: 'static-analysis',
    method: 'design-export',
    platform: 'android',
    outcome: 'pass',
    capturedAt: '2026-10-13T00:00:00Z',
    source: { tool: 'figma', importer: 'figma-export', revision: 'kit-v2' },
    ...fields,
  }
}

function verification(fields: Partial<Verification> = {}): Verification {
  return {
    id: 'verification:button.android.neutral-default',
    kind: 'verification',
    title: 'Kit v2 verified',
    adoptionId: 'adoption:button.android.neutral-default',
    evidenceIds: ['evidence:android-figma-kit.button.default'],
    revision: 'kit-v2',
    outcome: 'pass',
    verifiedBy: owner,
    at: '2026-10-13T01:00:00Z',
    ...fields,
  }
}

/** The example Button graph with the conflict decided, and the loop records `add` returns. */
function looped(add: (document: GraphDocument) => void = () => {}): GraphDocument {
  return edited('fluent-button', (document) => {
    decide(document, CONFLICT, { evidenceIds: ['evidence:android-figma-kit.button.neutral-default'] })
    add(document)
  })
}

const codes = (document: GraphDocument) => validateGraph(document).map((issue) => issue.code)
const stage = (document: GraphDocument) => conflictState(indexGraph(document), record(document, CONFLICT)).fix?.stage

test('the four records validate, and each one points where it should', () => {
  const document = looped((doc) => {
    doc.records.push(proposal(), adoption(), run(), verification())
    record<{ proposalId?: string }>(doc, 'decision:button.android.neutral-default').proposalId = 'proposal:button.android.neutral-default'
  })
  assert.deepEqual(validateGraph(document).filter((issue) => issue.severity === 'error'), [])

  assert.ok(codes(looped((doc) => doc.records.push(proposal({ targetIds: [] })))).includes('proposal-targets'))
  assert.ok(codes(looped((doc) => doc.records.push(proposal({ candidate: { tool: 'figma', revision: 'decision-0001' } })))).includes('proposal-candidate'))
  assert.ok(codes(looped((doc) => doc.records.push(adoption({ decisionId: 'decision:nothing' })))).includes('dangling-reference'))
  assert.ok(codes(looped((doc) => doc.records.push(adoption(), run(), verification({ revision: 'kit-v3' })))).includes('verification-revision'))
  assert.ok(codes(looped((doc) => doc.records.push(adoption(), verification({ evidenceIds: [] })))).includes('verification-evidence'))
})

test('a decision approves a proposal on the same conflict with the same outcome, and a contract change needs one', () => {
  const approving = (fields: Partial<Proposal>, outcome?: string) =>
    looped((doc) => {
      doc.records.push(proposal(fields))
      const decision = record<Record<string, unknown>>(doc, 'decision:button.android.neutral-default')
      decision.proposalId = 'proposal:button.android.neutral-default'
      if (outcome) decision.outcome = outcome
    })
  assert.ok(codes(approving({ outcome: 'change-implementation' })).includes('proposal-outcome'))
  assert.ok(codes(approving({ conflictId: undefined })).includes('proposal-other-conflict'))

  const contract = edited('fluent-button', (doc) => decide(doc, CONFLICT, { outcome: 'update-contract', evidenceIds: ['evidence:compose-source.button.styles'] }))
  assert.ok(codes(contract).includes('decision-proposal'))
  assert.ok(!codes(approving({ outcome: 'update-contract' }, 'update-contract')).includes('decision-proposal'))
})

test('there is nothing to adopt for an exception, and an agent may propose but never verify', () => {
  const exception = edited('fluent-button', (doc) => {
    decide(doc, CONFLICT, { outcome: 'approve-exception', classification: 'platform-convention', alignment: 'approved-adaptation', revisitTrigger: 'Compose adds a neutral style.', evidenceIds: ['evidence:compose-source.button.styles'] })
    doc.records.push(adoption())
  })
  assert.ok(codes(exception).includes('adoption-exception'))

  const agents = (writtenBy: (document: GraphDocument) => void) =>
    looped((doc) => {
      doc.records.push(
        { id: 'actor:person.taymoor', kind: 'actor', title: 'Taymoor', type: 'person', handle: 'taymoor' },
        { id: 'actor:agent.claude-code.taymoor', kind: 'actor', title: 'Claude Code for Taymoor', type: 'agent', handle: 'claude-code', delegatedBy: 'actor:person.taymoor' },
        proposal(),
        adoption(),
        run(),
        verification(),
      )
      writtenBy(doc)
    })
  const agent = 'actor:agent.claude-code.taymoor'
  assert.deepEqual(validateGraph(agents((doc) => (record<Proposal>(doc, 'proposal:button.android.neutral-default').writtenBy = agent))).filter((issue) => issue.severity === 'error'), [])
  assert.ok(codes(agents((doc) => (record<Verification>(doc, 'verification:button.android.neutral-default').writtenBy = agent))).includes('agent-verification'))
})

test('a verification can not pass on evidence that fails at the adopted revision', () => {
  assert.ok(codes(looped((doc) => doc.records.push(adoption(), run({ outcome: 'fail' }), verification()))).includes('verification-outcome'))
  assert.ok(!codes(looped((doc) => doc.records.push(adoption(), run({ outcome: 'fail' }), verification({ outcome: 'fail' })))).includes('verification-outcome'))
})

test('a fix moves from awaiting adoption to adopted to verified, and a verified fix is aligned', () => {
  assert.equal(stage(looped()), 'awaiting-adoption')
  assert.equal(stage(looped((doc) => doc.records.push(adoption()))), 'adopted')
  const verified = looped((doc) => doc.records.push(adoption(), run(), verification()))
  assert.equal(stage(verified), 'verified')
  const state = conflictState(indexGraph(verified), record(verified, CONFLICT))
  assert.equal(state.alignment, 'aligned')
  assert.equal(conflictState(indexGraph(looped()), record(verified, CONFLICT)).alignment, 'awaiting-adoption')
})

test('the gate re-checks every fix: one the import still raises at the adopted revision fails, and a regressed one fails again', () => {
  const report = (document: GraphDocument) => compareToBaseline([checkDocument('button', document, { today: '2026-10-13' })], undefined)

  const waiting = report(looped())
  assert.equal(waiting.passed, true)
  assert.deepEqual(waiting.advisory.filter((item) => item.kind === 'awaiting-adoption').map((item) => item.subjectId), [CONFLICT])

  // The import read the adopted kit and still raised the conflict: the adoption didn't settle it.
  const stillRaised = looped((doc) => {
    doc.records.push(adoption())
    record<Evidence>(doc, 'evidence:android-figma-kit.button.neutral-default').source.revision = 'kit-v2'
  })
  assert.equal(stage(stillRaised), 'failed')
  const failed = report(stillRaised)
  assert.equal(failed.passed, false)
  assert.deepEqual(failed.fresh.map((item) => item.kind), ['failed-fix'])
  assert.match(failed.fresh[0]!.summary, /read kit-v2 .* and still raises the conflict/)

  const verified = report(looped((doc) => doc.records.push(adoption(), run(), verification())))
  assert.equal(verified.passed, true)
  assert.ok(verified.measures.some((item) => item.check === 'Decided fixes verified' && item.found === 1 && item.of === 1))

  // A later import of the same evidence fails: the verified fix regressed.
  const regressed = looped((doc) => doc.records.push(adoption(), run({ outcome: 'fail', source: { tool: 'figma', importer: 'figma-export', revision: 'kit-v3' } }), verification()))
  assert.deepEqual(validateGraph(regressed).filter((issue) => issue.severity === 'error'), [])
  const again = report(regressed)
  // The failing evidence is a finding of its own; the regression names the fix it undoes.
  assert.deepEqual(again.fresh.map((item) => item.kind), ['regressed-fix', 'failing-evidence'])
  assert.match(again.fresh[0]!.summary, /now fail at kit-v3/)
})

test('a proposal nobody has decided is reported, not blocking', () => {
  const document = edited('fluent-button', (doc) => doc.records.push(proposal()))
  const result = compareToBaseline([checkDocument('button', document, { today: '2026-10-13' })], undefined)
  assert.deepEqual(result.advisory.filter((item) => item.kind === 'open-proposal').map((item) => item.subjectId), ['proposal:button.android.neutral-default'])
})

test('civic propose, decide, adopt and verify keep the loop in one decision file, checked against the graph', () => {
  const dir = mkdtempSync(join(tmpdir(), 'civic-loop-'))
  const file = join(dir, 'decisions.json')
  const graphPath = join(dir, 'raised.graph.json')
  const raised = edited('fluent-button', () => {})
  writeFileSync(graphPath, JSON.stringify(raised))
  const civic = (...rest: string[]) => spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli.ts', import.meta.url)), ...rest], { encoding: 'utf8' })
  const ok = (result: ReturnType<typeof civic>) => assert.equal(result.status, 0, result.stdout + result.stderr)

  ok(civic('propose', file, '--graph', graphPath, '--conflict', CONFLICT, '--targets', 'semantic:button', '--scope', 'component', '--outcome', 'update-design', '--by', 'design:design-system-maintainers',
    '--rationale', 'Compose has no stock neutral default.', '--expected', 'The kit draws Primary as the default.', '--baseline', 'figma:decision-0001', '--candidate', 'figma:kit-v2', '--at', '2026-10-12T00:00:00Z'))
  ok(civic('decide', file, CONFLICT, '--graph', graphPath, '--outcome', 'update-design', '--classification', 'outdated-design-source', '--by', 'design:design-system-maintainers',
    '--rationale', 'Follow Compose.', '--evidence', 'evidence:compose-source.button.styles', '--proposal', 'proposal:button.android.neutral-default', '--at', '2026-10-12T01:00:00Z'))
  ok(civic('adopt', file, 'decision:button.android.neutral-default', '--graph', graphPath, '--revision', 'figma:kit-v2', '--by', 'design:design-system-maintainers', '--at', '2026-10-13T00:00:00Z'))

  // The raised graph still holds the evidence as read before the adoption, so it can't verify it.
  const early = civic('verify', file, 'adoption:button.android.neutral-default', '--graph', graphPath, '--evidence', 'evidence:android-figma-kit.button.neutral-default', '--by', 'design:design-system-maintainers')
  assert.equal(early.status, 1)
  assert.match(early.stderr, /not read at the adopted revision kit-v2/)

  // Imported again at kit-v2, the kit evidence passes there.
  writeFileSync(graphPath, JSON.stringify({ ...raised, records: [...raised.records, run()] }))
  ok(civic('verify', file, 'adoption:button.android.neutral-default', '--graph', graphPath, '--evidence', 'evidence:android-figma-kit.button.default', '--by', 'design:design-system-maintainers', '--at', '2026-10-13T01:00:00Z'))

  const saved = JSON.parse(readFileSync(file, 'utf8')) as DecisionFile
  assert.deepEqual(decisionFileRecords(saved).map((item) => item.id), [
    'proposal:button.android.neutral-default',
    'decision:button.android.neutral-default',
    'adoption:button.android.neutral-default',
    'verification:button.android.neutral-default',
  ])
  assert.equal(saved.verifications![0]!.outcome, 'pass')
  assert.equal(saved.decisions[0]!.proposalId, 'proposal:button.android.neutral-default')

  const fixes = civic('fixes', graphPath)
  ok(fixes)
  assert.match(fixes.stdout, /No conflict has a decision yet/)
  const withLoop = join(dir, 'resolved.graph.json')
  writeFileSync(withLoop, JSON.stringify({ ...raised, records: [...raised.records, run(), ...decisionFileRecords(saved)] }))
  const listed = civic('fixes', withLoop)
  ok(listed)
  assert.match(listed.stdout, /\*\*verified\*\* Neutral default Button on Android/)
})
