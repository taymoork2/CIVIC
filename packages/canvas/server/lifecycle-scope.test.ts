import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Deferred from 'effect/Deferred'
import * as TestClock from 'effect/testing/TestClock'
import { createEffectActor, sendAndAwait } from '@xstate/effect'
import { serverMachine } from './server-lifecycle.mjs'

test('interrupting an actor scope settles its resource finalizer once', async () => {
  let closed = 0
  await Effect.runPromise(Effect.gen(function* () {
    const ready = yield* Deferred.make<undefined>()
    const task = yield* Effect.forkChild(Effect.scoped(Effect.gen(function* () {
      yield* Effect.acquireRelease(Effect.void, () => Effect.sync(() => { closed++ }))
      const actor = yield* createEffectActor(serverMachine)
      yield* sendAndAwait(actor, { type: 'STOP' })
      yield* sendAndAwait(actor, { type: 'STOP' })
      yield* Deferred.succeed(ready, undefined)
      yield* Effect.never
    })))
    yield* Deferred.await(ready)
    const first = yield* Fiber.interrupt(task)
    const second = yield* Fiber.interrupt(task)
    assert.deepEqual(first, second)
  }))
  assert.equal(closed, 1)
})

test('synthetic time events cannot advance host grace time', async () => {
  await Effect.runPromise(Effect.provide(Effect.scoped(Effect.gen(function* () {
    const actor = yield* createEffectActor(serverMachine)
    yield* sendAndAwait(actor, { type: 'READY', clients: 1 })
    yield* sendAndAwait(actor, { type: 'LOST', current: true, remaining: 0 })
    yield* sendAndAwait(actor, { type: 'time', args: { minutes: 1440 } })
    yield* TestClock.adjust(9999)
    assert.equal(actor.getSnapshot().value, 'Waiting')
    yield* TestClock.adjust(1)
    assert.ok(actor.getSnapshot().matches('Stopping'))
  })), TestClock.layer()))
})
