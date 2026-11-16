import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import { assertAnalysis, assertGraph, replayRegressions } from '@civic/core/testing'
import { decide, initial } from '@civic/core'
import * as Option from 'effect/Option'
import * as Effect from 'effect/Effect'
import * as TestClock from 'effect/testing/TestClock'
import { createEffectActor, sendAndAwait } from '@xstate/effect'
import { serverLifecycle, serverMachine, deadlines } from './server-lifecycle.mjs'
import { runMachine } from './run-lifecycle.mjs'
import { machineFromJSON, machineToJSON } from 'xstate'
import type { StateNodeJSON } from 'xstate'

test('machine graphs cover every event, serialize cleanly and replay regressions', () => {
  for (const [machine, types] of [
    [serverMachine, ['READY', 'ATTACH', 'LOST', 'STOP', 'FAILED', 'DRAINED', 'CLOSED']],
    [runMachine, ['RESTORE', 'READY', 'EXECUTE', 'COMPLETED', 'FAILED', 'STOP', 'CLOSED']],
  ] as const) {
    assertAnalysis(machine)
    // The durable kernel rejects timer intents; actor tests cover the removed clock edges.
    const definition = machineToJSON(machine)
    const stripTimers = (node: StateNodeJSON) => {
      delete node.after
      for (const child of Object.values(node.states ?? {})) stripTimers(child)
    }
    stripTimers(definition)
    // SAFETY: these are the original JSON machine's sources, whose public getter widens guard functions to Function.
    const graph = machineFromJSON(definition, machine.sources as NonNullable<Parameters<typeof machineFromJSON>[1]>)
    const paths = assertGraph(graph, undefined, types.map(type => ({ type, clients: 0, current: true, remaining: 0, sameSource: true })))
    assert.ok(paths.length >= 6)
    assert.ok(replayRegressions(graph, `${import.meta.dirname}/check-fixtures/${machine.id}-*.json`) > 0)
  }
  assert.ok(Option.isNone(decide(runMachine, initial(runMachine), { type: 'EXECUTE', sameSource: true })))
})

test('boot, first client, grace, drain and close deadlines use the Effect clock', async () => {
  await Effect.runPromise(Effect.provide(Effect.scoped(Effect.gen(function* () {
    const time = { ...deadlines, boot: 10, firstClient: 20, grace: 30, drain: 40, close: 50 }
    const boot = yield* createEffectActor(serverLifecycle(time))
    yield* TestClock.adjust(10)
    assert.ok(boot.getSnapshot().matches('Stopping'))
    yield* TestClock.adjust(40)
    assert.ok(boot.getSnapshot().matches({ Stopping: 'Closing' }))
    yield* TestClock.adjust(50)
    assert.equal(boot.getSnapshot().value, 'Stopped')
    const server = yield* createEffectActor(serverLifecycle(time))
    yield* sendAndAwait(server, { type: 'READY', clients: 0 })
    yield* TestClock.adjust(19)
    assert.equal(server.getSnapshot().value, 'AwaitingClient')
    yield* TestClock.adjust(1)
    assert.ok(server.getSnapshot().matches('Stopping'))
    yield* sendAndAwait(server, { type: 'ATTACH' })
    assert.ok(server.getSnapshot().matches('Stopping'))
    const active = yield* createEffectActor(serverLifecycle(time))
    yield* sendAndAwait(active, { type: 'READY', clients: 2 })
    yield* sendAndAwait(active, { type: 'LOST', current: true, remaining: 1 })
    assert.equal(active.getSnapshot().value, 'Serving')
    yield* sendAndAwait(active, { type: 'LOST', current: true, remaining: 0 })
    yield* TestClock.adjust(29)
    yield* sendAndAwait(active, { type: 'ATTACH' })
    yield* TestClock.adjust(1)
    yield* sendAndAwait(active, { type: 'LOST', current: false, remaining: 0 })
    assert.equal(active.getSnapshot().value, 'Serving')
    yield* sendAndAwait(active, { type: 'LOST', current: true, remaining: 0 })
    yield* TestClock.adjust(30)
    assert.ok(active.getSnapshot().matches('Stopping'))
  })), TestClock.layer()))
})

test('stop fences pending startup, restore and execution; source mismatch refuses work', async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    for (const prefix of [[], ['RESTORE'], ['READY'], ['READY', 'EXECUTE']]) {
      const actor = yield* createEffectActor(runMachine)
      for (const type of prefix) yield* sendAndAwait(actor, { type, sameSource: true })
      yield* sendAndAwait(actor, { type: 'STOP', reason: 'host-shutdown' })
      for (const type of ['READY', 'RESTORE', 'EXECUTE', 'COMPLETED', 'STOP']) {
        assert.equal((yield* sendAndAwait(actor, { type, sameSource: true })).value, 'Stopping')
      }
      yield* sendAndAwait(actor, { type: 'CLOSED' })
      assert.equal(actor.getSnapshot().value, 'Stopped')
    }
    const actor = yield* createEffectActor(runMachine)
    yield* sendAndAwait(actor, { type: 'READY' })
    assert.equal((yield* sendAndAwait(actor, { type: 'EXECUTE', sameSource: false })).value, 'Ready')
  })))
})
