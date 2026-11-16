import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Deferred from 'effect/Deferred'
import * as TestClock from 'effect/testing/TestClock'
import * as Clock from 'effect/Clock'
import { awakeClock } from './awake-clock.mjs'
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

test('host grace survives suspend and expires only after a fresh awake window', async () => {
  await Effect.runPromise(Effect.provide(Effect.scoped(Effect.gen(function* () {
    let offset = 0
    const base = yield* Clock.Clock
    const jumpingClock = Object.assign(Object.create(base), {
      currentTimeMillis: base.currentTimeMillis.pipe(Effect.map(now => now + offset)),
      currentTimeMillisUnsafe: () => base.currentTimeMillisUnsafe() + offset,
    })
    const clock = yield* Effect.provideService(awakeClock, Clock.Clock, jumpingClock)
    const actor = yield* Effect.provideService(createEffectActor(serverMachine), Clock.Clock, clock)
    yield* sendAndAwait(actor, { type: 'READY', clients: 1 })
    yield* sendAndAwait(actor, { type: 'LOST', current: true, remaining: 0 })
    offset = 3_600_000
    yield* TestClock.adjust(1000)
    assert.equal(actor.getSnapshot().value, 'Waiting')
    for (let tick = 0; tick < 9; tick++) yield* TestClock.adjust(1000)
    assert.equal(actor.getSnapshot().value, 'Waiting')
    yield* TestClock.adjust(1000)
    assert.ok(actor.getSnapshot().matches('Stopping'))
  })), TestClock.layer()))
})
