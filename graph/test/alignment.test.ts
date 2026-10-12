import assert from 'node:assert/strict'
import { test } from 'node:test'
import { alignmentsIn, indexGraph, renderAlignments, type CollaborationRecord, type Evidence, type GraphDocument } from '../src/index.ts'
import { decide, edited } from './helpers.ts'

// Alignment states per target and platform (spec: Alignment states, roadmap step 3), read
// from the records instead of being recomputed: the most severe state any record gives wins.

const TODAY = '2026-10-12'
const CONFLICT = 'conflict:button.android.neutral-default'
const states = (document: GraphDocument, stale?: Map<string, string>) =>
  Object.fromEntries(alignmentsIn(indexGraph(document), { today: TODAY, ...(stale ? { stale } : {}) }).map((item) => [item.platform, item.state]))

function run(platform: 'web' | 'ios', subject: string, outcome: Evidence['outcome'] = 'pass'): Evidence {
  return {
    id: `evidence:${platform}.button.run`,
    kind: 'evidence',
    title: `${platform} Button run`,
    subjectIds: [subject],
    tier: 'automated',
    method: 'playwright',
    platform,
    outcome,
    capturedAt: '2026-10-12T00:00:00Z',
    source: { tool: 'playwright', importer: 'playwright', revision: 'abc1234', path: 'e2e/button.spec.ts' },
  } as Evidence
}

function exception(fields: Partial<CollaborationRecord> = {}): CollaborationRecord {
  return {
    id: 'collab:exception.button',
    kind: 'collaboration',
    title: 'iOS Button limitation',
    type: 'exception',
    subjectIds: ['platform:fluent-apple.button'],
    platform: 'ios',
    summary: 'iOS has no transparent neutral Button.',
    perspectives: ['design'],
    owners: [{ role: 'design', who: 'design-system-maintainers' }],
    raisedBy: { role: 'design', who: 'design-system-maintainers' },
    at: '2026-10-12T00:00:00Z',
    userImpact: 'Toolbars use the subtle style.',
    revisitTrigger: 'fluentui-apple adds a transparent style.',
    expires: '2027-01-01',
    limitation: true,
    status: 'open',
    ...fields,
  }
}

test('an open conflict is drift, and a platform with no evidence is unknown, never aligned', () => {
  assert.deepEqual(states(edited('fluent-button', () => {})), { android: 'unreviewed-drift', ios: 'unknown-stale', web: 'unknown-stale' })
})

test('passing evidence aligns a platform; failing or stale evidence does not', () => {
  assert.equal(states(edited('fluent-button', (d) => d.records.push(run('web', 'platform:fluent-react-v9.button')))).web, 'aligned')
  assert.equal(states(edited('fluent-button', (d) => d.records.push(run('web', 'semantic:button')))).web, 'aligned', 'evidence about the contract on that platform counts')
  assert.equal(states(edited('fluent-button', (d) => d.records.push(run('web', 'platform:fluent-react-v9.button', 'fail')))).web, 'unreviewed-drift')
  const stale = new Map([['evidence:web.button.run', 'the Button source changed']])
  assert.equal(states(edited('fluent-button', (d) => d.records.push(run('web', 'platform:fluent-react-v9.button'))), stale).web, 'unknown-stale')
})

test('a decided conflict reads its state from the decision, and an expired exception is drift again', () => {
  const update = edited('fluent-button', (d) => { decide(d, CONFLICT, { evidenceIds: ['evidence:compose-source.button.styles'] }) })
  assert.equal(states(update).android, 'awaiting-adoption')
  const limitation = (expires: string) => edited('fluent-button', (d) => {
    decide(d, CONFLICT, { evidenceIds: ['evidence:compose-source.button.styles'], outcome: 'approve-exception', classification: 'technical-limitation', alignment: 'accepted-limitation', revisitTrigger: 'Compose adds a neutral style.', expires })
  })
  assert.equal(states(limitation('2027-01-01')).android, 'accepted-limitation')
  assert.equal(states(limitation('2026-10-01')).android, 'unreviewed-drift')
})

test('an accepted limitation recorded as a collaboration record holds until it expires, and drift still wins', () => {
  const ios = (record: CollaborationRecord, ...more: Evidence[]) => states(edited('fluent-button', (d) => d.records.push(run('ios', 'platform:fluent-apple.button'), record, ...more))).ios
  assert.equal(ios(exception()), 'accepted-limitation')
  assert.equal(ios(exception({ limitation: undefined })), 'approved-adaptation')
  assert.equal(ios(exception({ expires: '2026-10-01' })), 'unreviewed-drift')
  assert.equal(ios(exception({ platform: 'android' })), 'aligned', 'an exception on another platform does not apply')
  assert.equal(ios(exception(), { ...run('ios', 'platform:fluent-apple.button', 'fail'), id: 'evidence:ios.button.failing' }), 'unreviewed-drift')
})

test('the table gives each row the records behind its state', () => {
  const graph = indexGraph(edited('fluent-button', (d) => d.records.push(run('web', 'platform:fluent-react-v9.button'))))
  const table = renderAlignments(graph, alignmentsIn(graph, { today: TODAY }, 'semantic:button'))
  assert.match(table, /\| Button \| android \| unreviewed-drift \| .*Nobody has decided it yet\. \(`conflict:button\.android\.neutral-default`\) \|/)
  assert.match(table, /\| Button \| web \| aligned \| Every record agrees and the evidence is current\. \|/)
  assert.throws(() => alignmentsIn(graph, { today: TODAY }, 'platform:fluent-apple.button'), /not a semantic component/)
})
