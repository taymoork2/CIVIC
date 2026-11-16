import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import { Effect } from 'effect'
import * as TestClock from 'effect/testing/TestClock'
import { clientPresence } from './client-presence.mjs'

test('browser tickets are bound, single use, and expire at ten seconds', async () => {
  await Effect.runPromise(Effect.provide(Effect.gen(function* () {
    const presence = clientPresence(() => null)
    const first = yield* presence.issue('project')
    assert.equal(yield* presence.consume(first, 'project'), true)
    assert.equal(yield* presence.consume(first, 'project'), false)
    const wrong = yield* presence.issue('project')
    assert.equal(yield* presence.consume(wrong, 'other'), false)
    const expired = yield* presence.issue('project')
    yield* TestClock.adjust(10_000)
    assert.equal(yield* presence.consume(expired, 'project'), false)
  }), TestClock.layer()))
})
