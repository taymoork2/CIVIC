import assert from 'node:assert/strict'
import { globSync, readFileSync } from 'node:fs'
import * as Option from 'effect/Option'
import { getMachineSerializationDiagnostics, machineToJSON } from 'xstate'
import type { AnyStateMachine, AnyEventObject, AnyMachineSnapshot, InputFrom, StateNodeJSON } from 'xstate'
import { getShortestPaths, toDirectedGraph } from 'xstate/graph'
import { decide, initial } from './kernel.ts'

export function assertAnalysis(machine: AnyStateMachine): void {
  assert.equal(toDirectedGraph(machine).analysis.transitionTargetsComplete, true)
  assert.deepEqual(getMachineSerializationDiagnostics(machine), [])
}

export function assertGraph(machine: AnyStateMachine, input: InputFrom<AnyStateMachine>, events: AnyEventObject[], fromState?: AnyMachineSnapshot) {
  const definition = machineToJSON(machine)
  const declared = new Set(Object.keys(definition.schemas?.events ?? {}))
  const collect = (node: StateNodeJSON): void => {
    for (const type of Object.keys(node.on ?? {})) declared.add(type)
    for (const child of Object.values(node.states ?? {})) collect(child)
  }
  collect(definition)
  const supplied = new Set(events.map((event) => event.type))
  for (const type of declared) assert.ok(supplied.has(type), `Missing event representative: ${type}`)
  // Leaf states with no transitions of their own; a nested machine's children are named by path.
  const terminal = new Set<string>()
  const leaves = (node: StateNodeJSON, path: string[]): void => {
    const children = Object.entries(node.states ?? {})
    if (path.length && !children.length && !Object.keys(node.on ?? {}).length) terminal.add(path.join('.'))
    for (const [name, child] of children) leaves(child, [...path, name])
  }
  leaves(definition, [])
  const paths = getShortestPaths(machine, { input, events, fromState, serializeState: (snapshot) => JSON.stringify(snapshot.value) })
  for (const path of paths) {
    let snapshot = fromState ?? initial(machine, input)
    for (const step of path.steps.slice(1)) snapshot = Option.getOrThrow(decide(machine, snapshot, step.event)).snapshot
    assert.deepEqual(snapshot.value, path.state.value)
    if (snapshot.status === 'done' || terminal.has(String(snapshot.value))) {
      for (const event of events) assert.ok(Option.isNone(decide(machine, snapshot, event)))
    }
  }
  return paths
}

export function replayRegressions(machine: AnyStateMachine, pattern: string): number {
  const files = globSync(pattern)
  for (const file of files) {
    // SAFETY: regression fixtures are written by CIVIC's own tests in this shape; a malformed one fails the replay below.
    const fixture = JSON.parse(readFileSync(file, 'utf8')) as { input?: unknown; state?: string; context?: object; events: AnyEventObject[]; expected: unknown }
    let snapshot = fixture.state ? machine.resolveState({ value: fixture.state, context: fixture.context ?? {} }) : initial(machine, fixture.input)
    for (const event of fixture.events) {
      const decision = decide(machine, snapshot, event)
      if (Option.isSome(decision)) snapshot = decision.value.snapshot
    }
    assert.deepEqual(snapshot.value, fixture.expected, file)
  }
  return files.length
}
