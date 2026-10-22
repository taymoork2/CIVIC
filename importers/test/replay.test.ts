import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateGraph } from '../../graph/src/index.ts'
import { assemble, fragment, readReplays, type ReplayRecord } from '../src/index.ts'

// Decision 0009: the engine's tape stays the recording, and a replay of it is run evidence.

const head = 'a'.repeat(40)
const replay = (fields: Partial<ReplayRecord> = {}): ReplayRecord => ({ schema: 'civic.replay/0', project: 'example', scenario: 'family.drying', head, source: 'b'.repeat(64), tape: 'c'.repeat(64), steps: 4, outcome: 'pass', replayedAt: '2026-10-13T05:00:00.000Z', ...fields })
const options = { prefix: 'example', platform: 'web' as const, path: 'inputs/replays.json', targetIds: new Set(['target:example.family.drying']) }

test('a replay that verified every step passes, about the screen the run starts from, at the commit it ran at', () => {
  const [evidence] = readReplays([replay()], options)
  assert.deepEqual(evidence, {
    id: `evidence:runtime.${'c'.repeat(16)}`,
    kind: 'evidence',
    title: 'Recorded run from family.drying, 4 steps',
    subjectIds: ['target:example.family.drying'],
    tier: 'working-preview',
    method: 'runtime',
    platform: 'web',
    outcome: 'pass',
    finding: `Every step verified on replay, at source ${'b'.repeat(12)}.`,
    capturedAt: '2026-10-13T05:00:00.000Z',
    source: { tool: 'journey-engine', importer: 'replay', revision: head, contentHash: `sha256:${'c'.repeat(64)}`, path: 'inputs/replays.json' },
  })
  const graph = assemble(fragment([{ id: 'target:example.family.drying', kind: 'target', title: 'Drying', scale: 'screen', presence: 'expected', owners: [{ role: 'qa', who: 'qa' }] }]), fragment([evidence!]))
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

test('a replay that verified still fails when its tape misses what the journey expects (decision 0017)', () => {
  const tape = {
    version: 1 as const, project: 'example', source: 'b'.repeat(64), initialRoute: '/',
    steps: [{ gesture: { kind: 'click', target: { tag: 'button', name: 'Hold', index: 0, count: 1 } }, route: '/', fields: [], view: '[]', operations: [], discovery: { after: { controls: [{ role: 'button', name: 'Add to chat', disabled: false }], landmarks: [] } } }],
  }
  const expectations = { schema: 'civic.expectations/0' as const, scenarios: [{ scenario: 'family.drying', steps: [{ after: { step: 1 }, expect: [{ role: 'button', name: 'Add to queued message' }] }] }] }
  const [failed] = readReplays([replay()], { ...options, expectations, tapes: new Map([['c'.repeat(64), tape]]) })
  assert.equal(failed!.outcome, 'fail')
  assert.match(failed!.finding!, /^Every step verified on replay.*But 1 expectation of the journey did not hold:\nStep 1 \(Clicked button “Hold”\):\n {2}expected a button named “Add to queued message”\n {2}but {5}the step offered button “Add to chat”/s)
  const fixed = { ...tape, steps: [{ ...tape.steps[0]!, discovery: { after: { controls: [{ role: 'button', name: 'Add to queued message', disabled: false }], landmarks: [] } } }] }
  const [passed] = readReplays([replay()], { ...options, expectations, tapes: new Map([['c'.repeat(64), fixed]]) })
  assert.equal(passed!.outcome, 'pass')
  assert.match(passed!.finding!, /Every expectation of the journey held \(1\)/)
  // Without the tape, the run keeps its replay outcome and says the expectations went unchecked.
  const [unread] = readReplays([replay()], { ...options, expectations })
  assert.equal(unread!.outcome, 'pass')
  assert.match(unread!.finding!, /expectations were not checked: the tape is not on hand/)
  // Scenarios the file doesn't mention are untouched.
  assert.equal(readReplays([replay()], { ...options, expectations: { ...expectations, scenarios: [] } })[0]!.finding, `Every step verified on replay, at source ${'b'.repeat(12)}.`)
})
