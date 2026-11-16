// oxlint-disable-next-line vitest/no-import-node-test -- Review runs its tests with Node.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertAnalysis, assertGraph, replayRegressions } from '@civic/core/testing'
import { decide, initial } from '@civic/core'
import * as Option from 'effect/Option'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as TestClock from 'effect/testing/TestClock'
import { createEffectActor, sendAndAwait } from '@xstate/effect'
import { previewMachine } from '../src/preview/lifecycle.ts'
import { waitUntil } from '../src/preview/runtime.ts'

test('preview graph covers every declared event and serializes without diagnostics', () => {
  assertAnalysis(previewMachine)
  const events = ['START', 'ATTACH', 'READY', 'LOST', 'STOP', 'CLOSED'].map((type) => ({ type, owner: true, matching: true }))
  const paths = assertGraph(previewMachine, undefined, events)
  assert.deepEqual(paths.map((path) => path.state.value).sort(), ['absent', 'running', 'stale', 'starting', 'stopped', 'stopping'])
  assert.ok(replayRegressions(previewMachine, `${import.meta.dirname}/../src/preview/regressions/*.json`) > 0)
  assert.ok(Option.isNone(decide(previewMachine, initial(previewMachine), { type: 'ATTACH', matching: false })))
  assert.ok(Option.isNone(decide(previewMachine, initial(previewMachine), { type: 'START', owner: false })))
})

test('Effect actor processes the same lifecycle and ignores a second start', async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const actor = yield* createEffectActor(previewMachine)
    assert.equal((yield* sendAndAwait(actor, { type: 'START', owner: true })).value, 'starting')
    assert.equal((yield* sendAndAwait(actor, { type: 'START', owner: true })).value, 'starting')
    assert.equal((yield* sendAndAwait(actor, { type: 'READY' })).value, 'running')
    assert.equal((yield* sendAndAwait(actor, { type: 'STOP' })).value, 'stopping')
    assert.equal((yield* sendAndAwait(actor, { type: 'CLOSED' })).value, 'stopped')
  })))
})

test('readiness polling succeeds or times out on the Effect clock', async () => {
  await Effect.runPromise(Effect.provide(Effect.gen(function* () {
    let attempts = 0
    const ready = yield* Effect.forkChild(waitUntil(Effect.sync(() => ++attempts === 3), 100, 1000))
    yield* TestClock.adjust(200)
    assert.equal(yield* Fiber.join(ready), true)
    const timeout = yield* Effect.forkChild(waitUntil(Effect.succeed(false), 100, 1000))
    yield* TestClock.adjust(1000)
    assert.equal(yield* Fiber.join(timeout), false)
  }), TestClock.layer()))
})
