import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkedRecording } from './review-recording.mjs'

const project = { key: 'example-checkout', personas: [{ id: 'reviewer' }], roles: [{ id: 'author' }], conditions: [{ id: 'normal' }] }
const recording = () => ({ version: 1, project: project.key, source: 'a'.repeat(64), now: 1, initialRoute: '/', seed: { context: { scenario: 'note.edit', persona: 'reviewer', role: 'author', condition: 'normal', theme: 'light', textScale: 1, width: 393 } }, steps: [{ gesture: { kind: 'input', value: 'A note', target: { tag: 'input', name: 'Title', index: 0, count: 1 } }, route: '/', view: 'Write a note', fields: [{ label: 'Title', value: 'A note' }], operations: [] }] })
test('recordings are bounded and bound to project, context and safe inputs', () => {
  assert.deepEqual(checkedRecording(recording(), project), recording())
  for (const edit of [(tape) => { tape.project = 'another-project' }, (tape) => { tape.seed.context.role = 'invented' }, (tape) => { tape.steps[0].gesture.target.name = 'Password' }, (tape) => { tape.steps[0].fields[0].label = 'Access token' }, (tape) => { tape.steps[0].gesture.target.index = 10 }, (tape) => { tape.steps = Array(1001).fill(tape.steps[0]) }]) {
    const tape = recording(); edit(tape); assert.throws(() => checkedRecording(tape, project))
  }
  for (const payload of [{ args: { nested: { password: 'private' } } }, { result: { accessToken: 'private' } }]) {
    const tape = recording(); tape.steps[0].operations.push({ kind: 'mutation', name: 'save', ...payload })
    assert.throws(() => checkedRecording(tape, project), /sensitive/)
  }
  const command = recording()
  command.steps[0].gesture = { kind: 'command', target: { tag: 'adapter', name: 'presentation', index: 0, count: 1 }, value: JSON.stringify({ edits: { fabric: { title: 'Proposal' } }, version: 1 }) }
  assert.equal(checkedRecording(command, project), command)
  command.steps[0].gesture.value = '{invalid'
  assert.throws(() => checkedRecording(command, project), /command/)
  command.steps[0].gesture.value = JSON.stringify({ nested: { accessToken: 'private' } })
  assert.throws(() => checkedRecording(command, project), /sensitive/)
})

test('run steps on a recording are bounded: viewport, account, connection, clock and saved steps', () => {
  const steps = recording()
  steps.seed.context = { ...steps.seed.context, height: 852, preset: 'phone' }
  const step = (name, value) => ({ gesture: { kind: 'command', target: { tag: 'adapter', name, index: 0, count: 1 }, value: JSON.stringify(value) }, route: '/', view: '', fields: [], operations: [] })
  steps.steps.push(step('viewport', { width: 360, height: 764, theme: 'dark', textScale: 2, preset: 'folded' }), step('identity', 'member'), step('connection', false), step('time', 40), step('applyPending', 'a-saved-step'))
  steps.steps.at(-1).operations.push({ kind: 'mutation', name: 'save', args: { title: 'A note' }, actor: 'member' })
  assert.equal(checkedRecording(steps, project), steps, 'a recording before heights existed and one with run steps are both valid')
  for (const [name, value] of [['viewport', { width: 100, height: 764, theme: 'dark', textScale: 1 }], ['viewport', { width: 360, height: 764, theme: 'dark', textScale: 1, device: 'physical' }], ['identity', { account: 'member' }], ['connection', 'off'], ['time', 0], ['time', 99999]]) {
    const tape = recording(); tape.steps.push(step(name, value))
    assert.throws(() => checkedRecording(tape, project), /command/)
  }
  const tall = recording(); tall.seed.context.height = 5000
  assert.throws(() => checkedRecording(tall, project), /height/)
  const actor = recording(); actor.steps[0].operations.push({ kind: 'mutation', name: 'save', args: {}, actor: '../owner' })
  assert.throws(() => checkedRecording(actor, project), /operation/)
})
