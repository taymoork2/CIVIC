import { expect, test } from 'vite-plus/test'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import { createMachine, machineFromJSON, initialTransition } from 'xstate'
import { commit, decide, initial } from '../src/kernel.ts'
import { assertAnalysis, assertGraph, replayRegressions } from '../src/testing.ts'

const isNotice = (value: unknown): value is { type: 'notice' } => typeof value === 'object' && value !== null && 'type' in value && value.type === 'notice'
const machine = machineFromJSON({ initial: 'open', schemas: { events: { GO: {} } }, states: { open: { on: { GO: { target: 'done' } } }, done: { type: 'final' } } })

test('explores paths, covers events and checks terminal refusal', () => {
  assertAnalysis(machine)
  expect(assertGraph(machine, undefined, [{ type: 'GO' }])).toHaveLength(2)
  expect(() => assertGraph(machine, undefined, [])).toThrow('Missing event')
  expect(Option.isNone(decide(machine, initial(machine), { type: 'OTHER' }))).toBe(true)
  expect(replayRegressions(machine, `${import.meta.dirname}/fixtures/*.json`)).toBe(1)
})

test('rejects executable effects and unknown intents', () => {
  const executable = createMachine({ initial: 'open', states: { open: { on: { GO: (_args, enq) => { enq(() => {}); return { target: 'done' } } } }, done: {} } })
  expect(() => decide(executable, initial(executable), { type: 'GO' })).toThrow('cannot execute')
  const emitted = machineFromJSON({ initial: 'open', states: { open: { on: { GO: { actions: [{ type: '@xstate.emit', event: { type: 'notice' } }] } } } } })
  expect(() => decide(emitted, initial(emitted), { type: 'GO' })).toThrow('cannot execute')
  expect(Option.getOrThrow(decide(emitted, initial(emitted), { type: 'GO' }, isNotice)).intents).toEqual([{ type: 'notice' }])
  const startup = machineFromJSON({ initial: 'open', states: { open: { entry: [{ type: '@xstate.emit', event: { type: 'notice' } }] } } })
  expect(initialTransition(startup)[1]).toHaveLength(1)
  expect(() => initial(startup)).toThrow('initialize without effects')
})

test('retries one conflict and propagates other failures', () => {
  let reads = 0
  const read = Effect.sync(() => ++reads)
  expect(Effect.runSync(commit(read, (row) => row === 1 ? Effect.fail('conflict') : Effect.succeed(row), (failure) => failure === 'conflict'))).toBe(2)
  reads = 0
  expect(Effect.runSync(Effect.flip(commit(read, () => Effect.fail('conflict'), () => true)))).toBe('conflict')
  expect(reads).toBe(2)
  reads = 0
  Effect.runSync(Effect.result(commit(read, () => Effect.fail('other'), () => false)))
  expect(reads).toBe(1)
})
