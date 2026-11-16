import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import { clientPresence, frameLimit } from './client-presence.mjs'
import { Effect, Fiber } from 'effect'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { managedHost } from './app-server.mjs'
import { loadProject } from '@civic/vite-connector/project'
import { canvasRoot } from './canvas-root.mjs'

test('host retains a run across viewer generations, refuses changed source, and closes its service', async () => {
  const store = await mkdtemp(path.join(tmpdir(), 'civic-host-runs-'))
  const project = loadProject(canvasRoot, { manifest: `${canvasRoot}/examples/pantry/civic.project.json` })
  const { promise: ready, resolve } = Promise.withResolvers()
  let runtime, first, second
  const fiber = Effect.runFork(managedHost({ store, build: 'runs', viewer: (_listener, _presence, services) => {
    runtime = services.runtime
    first = runtime(project, () => 'one', { dataDir: store })
    resolve()
    return Promise.resolve({ handle: (_req, res) => res.end(), close: () => Promise.resolve() })
  } }))
  try {
    await ready
    const run = await first.handle({ action: 'start', scenario: 'pantry.shelf', persona: 'stocked', role: 'cook', condition: 'normal' })
    second = runtime(project, () => 'one', { dataDir: store })
    const state = await second.handle({ action: 'state', run: run.id })
    assert.equal(state.items.length, 3)
    runtime(project, () => 'two', { dataDir: store })
    await assert.rejects(second.handle({ action: 'state', run: run.id }), /Source changed/u)
    const saved = JSON.parse(await readFile(path.join(store, 'runtime', `${run.id}.json`), 'utf8'))
    assert.equal(saved.source, 'one')
  } finally { await Effect.runPromise(Fiber.interrupt(fiber)) }
  await assert.rejects(second.handle({ action: 'start' }), /stopping/u)
})

test('managed control authenticates desktop capability and exact-origin single-use tickets', async () => {
  const store = await mkdtemp(path.join(tmpdir(), 'civic-control-'))
  let issue, endpoint
  const { promise: started, resolve: ready } = Promise.withResolvers()
  const requests = []
  const fiber = Effect.runFork(managedHost({ store, build: 'auth', viewer: (listener, presence) => {
    endpoint = `http://127.0.0.1:${listener.address().port}`
    issue = presence.issue
    ready()
    return Promise.resolve({ handle: (req, res) => { requests.push(req.url); res.end('ready') }, close: () => Promise.resolve() })
  } }))
  try {
    await started
    await fetch(endpoint)
    const owner = JSON.parse(await readFile(path.join(store, '.review-data/service/registration.json'), 'utf8'))
    const connect = (protocols, options) => new WebSocket(endpoint.replace('http:', 'ws:') + '/api/civic/control', protocols, options)
    const desktop = connect(['civic-control'], { headers: { authorization: `Bearer ${owner.capability}` } })
    await once(desktop, 'open')
    const rejected = async (protocols, options) => {
      const socket = connect(protocols, options)
      await once(socket, 'error')
      assert.notEqual(socket.readyState, WebSocket.OPEN)
    }
    await rejected(['civic-control'], {})
    await rejected(['civic-control'], { headers: { authorization: 'Bearer invalid' } })
    const ticket = await issue(endpoint)
    await rejected(['civic-control', ticket], { origin: 'http://foreign.example' })
    const browser = connect(['civic-control', ticket], { origin: endpoint })
    await once(browser, 'open')
    await rejected(['civic-control', ticket], { origin: endpoint })
    assert.ok(requests.every(url => !url.includes(ticket) && !url.includes(owner.capability)))
    desktop.terminate(); browser.terminate()
  } finally { await Effect.runPromise(Fiber.interrupt(fiber)) }
})

test('real control sockets close on oversize and queue overflow, releasing presence once', async () => {
  const listener = createServer()
  const server = new WebSocketServer({ server: listener, maxPayload: frameLimit })
  let count = 0
  let now = 0
  const presence = clientPresence(value => { count = value }, () => now)
  server.on('connection', socket => presence.attach(socket))
  const listening = once(listener, 'listening'); listener.listen(0, '127.0.0.1'); await listening
  const endpoint = `ws://127.0.0.1:${listener.address().port}`
  try {
    const oversized = new WebSocket(endpoint)
    await once(oversized, 'open')
    const closed = once(oversized, 'close')
    oversized.send(Buffer.alloc(frameLimit + 1))
    const [code] = await closed
    assert.equal(code, 1009)
    assert.equal(count, 0)
    const slow = new WebSocket(endpoint)
    await once(slow, 'open')
    const overflow = once(slow, 'close')
    for (let i = 0; i < 258; i++) presence.broadcast({ type: 'status', state: 'Serving' })
    const [overflowCode] = await overflow
    assert.equal(overflowCode, 1013)
    assert.equal(count, 0)
    presence.heartbeat()
    assert.equal(count, 0)
    const missing = new WebSocket(endpoint, { autoPong: false })
    await once(missing, 'open')
    now = 5000
    presence.heartbeat()
    now = 10000
    presence.heartbeat()
    now = 14_999
    presence.heartbeat()
    assert.equal(count, 1)
    const expired = once(missing, 'close')
    now = 15_000
    presence.heartbeat()
    await expired
    assert.equal(count, 0)
    presence.heartbeat()
    assert.equal(count, 0)
  } finally { presence.close(); server.close(); listener.closeAllConnections(); listener.close() }
})
