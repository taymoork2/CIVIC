import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter } from 'node:events'
import { Clock, Duration, Effect } from 'effect'
import { awakeSleep } from './awake-clock.mjs'
import { holdRestart } from './app-server-main.mjs'
import { clientPresence } from './client-presence.mjs'

function clock(jumps) {
  const base = Effect.runSync(Clock.Clock)
  let now = 0, ticks = 0
  return Object.assign(Object.create(base), { currentTimeMillis: Effect.sync(() => now), sleep: duration => Effect.sync(() => {
    now += jumps[ticks++] ?? Duration.toMillis(duration)
  }), ticks: () => ticks })
}

test('awake deadline ignores a long jump and still expires after active ticks', async () => {
  const time = clock([3_600_000])
  await Effect.runPromise(Effect.provideService(awakeSleep(60_000), Clock.Clock, time))
  assert.equal(time.ticks(), 61)
})

test('restart deadline answers held requests with retryable 503 and cleans its listener', async () => {
  // eslint-disable-next-line unicorn/prefer-event-target -- Node HTTP responses expose EventEmitter listeners.
  const response = new EventEmitter()
  response.writeHead = (status, headers) => { response.status = status; response.headers = headers }
  response.end = body => { response.body = body }
  const time = clock([])
  assert.equal(await holdRestart(Promise.withResolvers().promise, response, effect =>
    Effect.runPromise(Effect.provideService(effect, Clock.Clock, time))), false)
  assert.equal(time.ticks(), 60)
  assert.equal(response.status, 503)
  assert.equal(response.headers['retry-after'], '1')
  assert.match(response.body, /reload/u)
  assert.equal(response.listenerCount('close'), 0)
})

test('wake probes a real socket before expiring presence', () => {
  let now = 0, count = 0, pings = 0, terminated = 0
  // eslint-disable-next-line unicorn/prefer-event-target -- ws sockets expose EventEmitter listeners.
  const socket = new EventEmitter()
  socket.ping = () => { pings++ }
  socket.terminate = () => { terminated++ }
  const presence = clientPresence(value => { count = value }, () => now)
  presence.attach(socket)
  now = 3_600_000
  presence.heartbeat()
  assert.equal(count, 1)
  assert.equal(pings, 1)
  socket.emit('pong')
  now += 5000
  presence.heartbeat()
  assert.equal(terminated, 0)
  now += 5000
  presence.heartbeat()
  now += 5000
  presence.heartbeat()
  assert.equal(terminated, 1)
  assert.equal(count, 0)
})

test('held requests continue on restart and cancel when their connection closes', async () => {
  // eslint-disable-next-line unicorn/prefer-event-target -- Node HTTP responses expose EventEmitter listeners.
  const response = new EventEmitter()
  assert.equal(await holdRestart(Promise.resolve(), response), true)
  assert.equal(response.listenerCount('close'), 0)
  const waiting = holdRestart(Promise.withResolvers().promise, response)
  response.destroyed = true
  response.emit('close')
  assert.equal(await waiting, false)
  assert.equal(response.listenerCount('close'), 0)
})
