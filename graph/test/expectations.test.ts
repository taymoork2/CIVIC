import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkExpectations, readExpectations, renderExpectationFailures, type RecordedStep, type RecordedTape, type ScenarioExpectations } from '../src/index.ts'

// Expected state per journey step (decision 0017): a recorded run is read against what its
// journey says must be true afterwards, and a miss names the step and shows the difference.

const control = (role: string, name: string, extra: Record<string, unknown> = {}) => ({ role, name, disabled: false, ...extra })
const step = (name: string, controls: ReturnType<typeof control>[], extra: Partial<RecordedStep> = {}): RecordedStep => ({
  gesture: { kind: 'click', target: { tag: 'button', name, index: 0, count: 1 } },
  route: '/chat',
  fields: [],
  view: JSON.stringify(['Chat']),
  operations: [],
  discovery: { after: { controls, landmarks: [] } },
  ...extra,
})
const tape = (steps: RecordedStep[]): RecordedTape => ({ version: 1, project: 'app', source: 'src', initialRoute: '/chat', steps })

const queued = tape([
  step('Queue message', [control('button', 'Cancel queued message'), control('button', 'Add to chat')]),
  step('Open queued message', [control('button', 'Add to queued message'), control('button', 'Copy')]),
])
const entry = (...expect: ScenarioExpectations['steps'][number]['expect']): ScenarioExpectations => ({ scenario: 'chat.queue', journey: 'Edit a queued message', steps: [{ after: { gesture: 'click', target: 'Open queued message' }, expect }] })

test('a control that is there, and one that must not be, both hold', () => {
  assert.deepEqual(checkExpectations(queued, entry({ role: 'button', name: 'Add to queued message' }, { role: 'button', name: 'Add to chat', absent: true })), [])
})

test('a wrong label fails with the step, what was expected, and what the step offered', () => {
  const stale = tape([queued.steps[0]!, step('Open queued message', [control('button', 'Add to chat'), control('button', 'Copy')])])
  const failures = checkExpectations(stale, entry({ role: 'button', name: 'Add to queued message' }))
  assert.deepEqual(failures, [{ step: 2, did: 'Clicked button “Open queued message”', expected: 'a button named “Add to queued message”', actual: 'the step offered button “Add to chat”, button “Copy”' }])
  assert.equal(renderExpectationFailures(failures), 'Step 2 (Clicked button “Open queued message”):\n  expected a button named “Add to queued message”\n  but     the step offered button “Add to chat”, button “Copy”')
  assert.deepEqual(checkExpectations(stale, entry({ name: 'Add to chat', absent: true }))[0]?.actual, 'it was there')
})

test('control state, text, component state and route are checked the same way', () => {
  const run = tape([
    step('Hold work', [control('switch', 'Notify', { pressed: 'true' }), control('button', 'Resume', { disabled: true })], {
      view: JSON.stringify(['Work', 'Waiting']),
      components: [{ component: 'work-row', state: 'held', props: { label: 'Waiting' } }],
      route: '/work',
    }),
  ])
  const at = { gesture: 'click' }
  const check = (...expect: ScenarioExpectations['steps'][number]['expect']) => checkExpectations(run, { scenario: 's', steps: [{ after: at, expect }] })
  assert.deepEqual(check({ role: 'switch', name: 'Notify', pressed: true }, { name: 'Resume', disabled: true }, { text: 'Waiting' }, { component: 'work-row', state: 'held' }, { route: '/work' }), [])
  assert.deepEqual(check({ text: 'Working' }).map((failure) => failure.actual), ['the step showed “Work”, “Waiting”, “Notify”, “Resume”, “held”, “Waiting”'])
  assert.deepEqual(check({ component: 'work-row', state: 'running' }).map((failure) => failure.actual), ['the step marked work-row (held)'])
  assert.deepEqual(check({ role: 'switch', name: 'Notify', pressed: false }).map((failure) => failure.expected), ['a switch named “Notify”, not pressed'])
  assert.deepEqual(check({ route: '/chat' }).map((failure) => failure.actual), ['the route was /work'])
  assert.deepEqual(check({ text: 'Waiting', absent: true }).map((failure) => failure.expected), ['no text “Waiting”'])
})

test('a step that is not in the run, or a run recorded without controls, fails rather than passes quietly', () => {
  assert.match(checkExpectations(queued, { scenario: 's', steps: [{ after: { gesture: 'click', target: 'Nowhere' }, expect: [{ text: 'x' }] }] })[0]!.expected, /a step that clicks “Nowhere”/)
  assert.equal(checkExpectations(queued, { scenario: 's', steps: [{ after: { step: 9 }, expect: [{ text: 'x' }] }] })[0]!.actual, 'the run has 2 steps, none like it')
  const bare = tape([{ ...queued.steps[0]!, discovery: undefined }])
  assert.match(checkExpectations(bare, { scenario: 's', steps: [{ after: { step: 1 }, expect: [{ name: 'Cancel queued message' }] }] })[0]!.actual, /recorded without the controls each step offers/)
  assert.equal(checkExpectations(queued, { scenario: 's', steps: [{ after: { gesture: 'click', nth: 2 }, expect: [{ name: 'Copy' }] }] }).length, 0)
})

test('an expectations file with the wrong shape is refused with where it is wrong', () => {
  const file = (expect: unknown) => ({ schema: 'civic.expectations/0', scenarios: [{ scenario: 's', steps: [{ after: { step: 1 }, expect }] }] })
  assert.doesNotThrow(() => readExpectations(file([{ name: 'Go' }])))
  assert.throws(() => readExpectations({ schema: 'other' }), /Not an expectations file/)
  assert.throws(() => readExpectations(file([])), /scenarios\[0\]\.steps\[0\]\.expect lists what must be true/)
  assert.throws(() => readExpectations(file([{ text: 'a', name: 'b' }])), /say a control/)
  assert.throws(() => readExpectations(file([{ name: 'a', pressed: 'yes' }])), /pressed is true or false/)
  assert.throws(() => readExpectations({ schema: 'civic.expectations/0', scenarios: [{ scenario: 's', steps: [{ after: {}, expect: [{ name: 'a' }] }] }] }), /after names a step number or a gesture/)
})

test('`civic expect` prints the differences and exits 1, or says every expectation held', () => {
  const dir = mkdtempSync(join(tmpdir(), 'civic-expect-'))
  try {
    const expectations = join(dir, 'expect.json')
    const run = join(dir, 'tape.json')
    writeFileSync(expectations, JSON.stringify({ schema: 'civic.expectations/0', scenarios: [{ scenario: 'chat.queue', steps: [{ after: { gesture: 'click', target: 'Open queued message' }, expect: [{ role: 'button', name: 'Add to queued message' }] }] }] }))
    const civic = (tape: RecordedTape) => {
      writeFileSync(run, JSON.stringify(tape))
      return spawnSync(process.execPath, [new URL('../src/cli.ts', import.meta.url).pathname, 'expect', expectations, run], { encoding: 'utf8' })
    }
    const held = civic(queued)
    assert.deepEqual([held.status, held.stdout.trim()], [0, 'Every expectation held (1).'])
    const missed = civic(tape([queued.steps[0]!, step('Open queued message', [control('button', 'Add to chat')])]))
    assert.equal(missed.status, 1)
    assert.match(missed.stdout, /Step 2 \(Clicked button “Open queued message”\):\n {2}expected a button named “Add to queued message”/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
