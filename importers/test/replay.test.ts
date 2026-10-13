import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateGraph } from '../../graph/src/index.ts'
import { assemble, fragment, readReplays, type ReplayRecord } from '../src/index.ts'

// Decision 0009: the engine's tape stays the recording, and a replay of it is run evidence.

const head = 'a'.repeat(40)
const replay = (fields: Partial<ReplayRecord> = {}): ReplayRecord => ({ schema: 'civic.replay/0', project: 'laundry', scenario: 'family.drying', head, source: 'b'.repeat(64), tape: 'c'.repeat(64), steps: 4, outcome: 'pass', replayedAt: '2026-10-13T05:00:00.000Z', ...fields })
const options = { prefix: 'laundry', platform: 'web' as const, path: 'inputs/replays.json', targetIds: new Set(['target:laundry.family.drying']) }

test('a replay that verified every step passes, about the screen the run starts from, at the commit it ran at', () => {
  const [evidence] = readReplays([replay()], options)
  assert.deepEqual(evidence, {
    id: `evidence:runtime.${'c'.repeat(16)}`,
    kind: 'evidence',
    title: 'Recorded run from family.drying, 4 steps',
    subjectIds: ['target:laundry.family.drying'],
    tier: 'working-preview',
    method: 'runtime',
    platform: 'web',
    outcome: 'pass',
    finding: `Every step verified on replay, at source ${'b'.repeat(12)}.`,
    capturedAt: '2026-10-13T05:00:00.000Z',
    source: { tool: 'journey-engine', importer: 'replay', revision: head, contentHash: `sha256:${'c'.repeat(64)}`, path: 'inputs/replays.json' },
  })
  const graph = assemble(fragment([{ id: 'target:laundry.family.drying', kind: 'target', title: 'Drying', scale: 'screen', presence: 'expected', owners: [{ role: 'qa', who: 'qa' }] }]), fragment([evidence!]))
  assert.deepEqual(validateGraph(graph).filter((issue) => issue.severity === 'error'), [])
})

test("a tape's latest replay decides, and a divergence fails at its step", () => {
  const [evidence] = readReplays([replay({ outcome: 'fail', divergedAt: 3, replayedAt: '2026-10-13T06:00:00.000Z' }), replay()], options)
  assert.equal(evidence!.outcome, 'fail')
  assert.match(evidence!.finding!, /^Replay diverged at step 3 of 4/)
  assert.equal(readReplays([replay(), replay({ tape: 'd'.repeat(64) })], options).length, 2)
})

test('a replay from a screen the graph lacks, or a record of another shape, is refused', () => {
  assert.throws(() => readReplays([replay({ scenario: 'gone' })], options), /isn't a screen in this graph/)
  assert.throws(() => readReplays([replay({ head: 'HEAD' })], options), /not a civic\.replay\/0 record/)
})
