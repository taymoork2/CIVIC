import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { interactionStore, interactionReport, stateId, checkedState } from './review-interactions.mjs'

const source = 'a'.repeat(64)
const project = { key: 'orca', personas: [{ id: 'owner' }], roles: [{ id: 'browse' }], conditions: [{ id: 'live' }] }
const control = { tag: 'button', role: 'button', name: 'Open menu', index: 0, count: 1, disabled: false }
const state = (controls = [control]) => ({ scenario: 'home', persona: 'owner', role: 'browse', condition: 'live', viewport: { width: 1440, height: 900 }, controls, landmarks: [], truncated: false })
const metadata = () => ({ project, revision: { source }, scenarios: [{ id: 'home', label: 'Home', edges: [{ destination: 'settings', action: 'Open settings' }] }, { id: 'settings', label: 'Settings' }], coverage: { targets: [] } })

test('compares real controls and states with explicit expectations and exact execution evidence', () => {
  const before = state(), after = state([control, { ...control, name: 'Close menu' }])
  const m = metadata(), observations = [{ source, state: before }, { source, state: after }]
  const tape = { project: project.key, source, seed: { context: { persona: 'owner', role: 'browse', condition: 'live' } }, steps: [{ gesture: { kind: 'click', target: control }, discovery: { before, after }, operations: [] }] }
  let report = interactionReport(m, observations, [{ id: 'run', tape }], [])
  assert.equal(report.states.length, 2)
  assert.equal(report.states[0].declared, false)
  assert.equal(report.states[0].controls[0].execution, 'recorded')
  assert.equal(report.states[0].controls[0].verified, false)
  assert.ok(report.states[1].controls.some(row => row.execution === 'unrecorded'))
  m.coverage.targets = [{ id: 'menu', kind: 'interaction', scenarios: ['home'], state: stateId(before), control: { tag: 'button', name: 'Open menu', index: 0 } }]
  report = interactionReport(m, observations, [{ id: 'run', tape }], [])
  assert.equal(report.states[0].controls[0].declared, true)
  assert.equal(report.states[0].declared, false, 'One declared interaction does not cover the whole state')
  assert.equal(report.states[1].controls[0].declared, false, 'A binding for one state cannot cover another')
  assert.ok(report.states[0].controls[0].gaps.includes('No passing replay'))
  assert.equal(interactionReport({ ...m, revision: { source: 'b'.repeat(64) } }, observations, [{ id: 'run', tape }], []).states.length, 0)
  const failed = structuredClone(tape); failed.steps[0].operations = [{ error: 'Write refused' }]
  assert.equal(interactionReport(m, observations, [{ id: 'run', tape: failed }], []).states[0].controls[0].execution, 'failed')
  const replay = { project: project.key, source, outcome: 'pass', steps: 1, tape: createHash('sha256').update(JSON.stringify(tape)).digest('hex') }
  assert.equal(interactionReport(m, observations, [{ id: 'run', tape }], [replay]).states[0].controls[0].verified, true)
  assert.equal(interactionReport({ ...m, project: { ...project, mode: 'live-read-only' } }, observations, [{ id: 'run', tape }], [replay]).states[0].controls[0].verified, false, 'Observational live mode cannot claim deterministic replay')
})

test('keeps viewport evidence scoped, distinguishes duplicate controls and never treats disabled controls as exercised', () => {
  const before = state([control, { ...control, index: 1, count: 2, disabled: true }])
  const phone = { ...before, viewport: { width: 393, height: 852 } }
  assert.notEqual(stateId(before), stateId(phone))
  const report = interactionReport(metadata(), [{ source, state: before }, { source, state: phone }], [], [])
  assert.equal(report.states.length, 2)
  assert.equal(report.states[0].controls[1].execution, 'unrecorded')
  assert.ok(report.states[0].controls[1].gaps.includes('Disabled in observed state'))
})

test('validates trust boundaries and persists observations without losing concurrent updates', async () => {
  const m = metadata(), dataDir = await mkdtemp(join(tmpdir(), 'civic-interactions-'))
  for (const value of [{ ...state(), controls: [{ ...control, name: 'Password' }] }, { ...state(), viewport: { width: 1, height: 2 } }, { ...state(), persona: 'other' }, { ...state(), controls: [{ ...control, value: 'private draft' }] }]) assert.throws(() => checkedState(value, m))
  const store = interactionStore({ dataDir, metadata: m })
  await assert.rejects(store.observe({ source: 'b'.repeat(64), state: state() }), { status: 409 })
  await Promise.all([store.observe({ source, state: state() }), store.observe({ source, state: state([{ ...control, name: 'Another control' }]) })])
  assert.equal((await interactionStore({ dataDir, metadata: m }).report()).states.length, 2)
})
