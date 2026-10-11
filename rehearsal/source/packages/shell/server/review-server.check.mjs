import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import http, { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { reviewMiddleware } from './review-server.mjs'

// A synthetic adapter shaped like the towel journey: 13 screens over 10 scenarios.
const steps = ['type', 'whose', 'details', 'fabric', 'color', 'origin', 'dye', 'care:wash', 'care:bleach', 'care:dry', 'stain', 'final', 'saved']
const screens = steps.map((id) => ({ id, scenario: `intake.towel.${id === 'saved' ? 'final' : id.split(':')[0]}` }))
const unusedFixture = async () => { throw new Error('No fixture expected') }
const adapter = (captureFixture = unusedFixture) => ({ screens, proposalProperties: ['title', 'action', 'color'], captureFixture })

// A synthetic coverage bridge: the shell owns access, origin and refresh guards; the app's bridge owns versions.
const coverage = async () => {
  let version = 1
  return {
    get: async () => ({ version, source: snapshot.revision.source, candidates: [{ id: 'screen.test' }] }),
    update: async (input) => { if (input.expectedVersion !== version) throw Object.assign(new Error('Coverage changed elsewhere.'), { status: 409 }); return { version: ++version } },
  }
}

const snapshot = { revision: { head: '0'.repeat(40), source: '1'.repeat(64), capturedAt: new Date().toISOString() }, design: { project: 'synthetic-test-design', hashes: {} } }

test('review feedback requires access, captures synthetic context, retries once and survives restart', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'civic-review-test-'))
  const metadata = { scenarios: [{ id: 'intake.pack.color' }], ...snapshot }
  metadata.coverage = { contractVersion: 1, targets: [{ id: 'screen.test', title: 'Test gap', kind: 'screen', scenarios: [], acceptance: ['Cancel retains draft.'], preview: 'missing', missingEdges: [], verification: 'unverified', reason: 'Missing preview.' }], limits: [] }
  let captures = 0
  const start = async () => {
    const middleware = await reviewMiddleware({ dataDir, metadata, adapter: adapter(), coverage, capture: async () => { captures++; return Buffer.from('synthetic-png') } })
    const server = createServer((req, res) => middleware(req, res, () => { res.writeHead(404); res.end() }))
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    return { server, base: `http://127.0.0.1:${server.address().port}` }
  }
  let running = await start()
  const key = (await readFile(join(dataDir, 'access-key'), 'utf8')).trim()
  const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' }
  const context = { scenario: 'intake.pack.color', screen: 'intake.pack.color', persona: 'single', role: 'owner', condition: 'normal', theme: 'light', textScale: 1, viewport: { width: 393, height: 852 }, state: { dialogs: ['Add clothes'], tabs: [], fields: [{ label: 'Name', value: 'Synthetic tee' }] } }
  const note = { requestId: '12345678-1234-4234-8234-123456789abc', message: 'The color choice needs a clearer label.', kind: 'confusing', context, anchor: { label: 'Color', x: 0.2, y: 0.3, width: 0.1, height: 0.1 }, html: '<html><body>Synthetic only</body></html>', snapshot }
  try {
    assert.equal((await fetch(`${running.base}/api/review/feedback`)).status, 401)
    assert.equal((await fetch(`${running.base}/api/review/coverage`)).status, 401)
    const coverage = await (await fetch(`${running.base}/api/review/coverage`, { headers })).json()
    assert.equal(coverage.candidates.length, 1)
    const coverageInput = { operation: 'acknowledge', source: coverage.source, expectedVersion: coverage.version, id: 'screen.test' }
    assert.equal((await fetch(`${running.base}/api/review/coverage`, { method: 'POST', headers: { ...headers, origin: 'https://untrusted.example' }, body: JSON.stringify(coverageInput) })).status, 403)
    assert.equal((await fetch(`${running.base}/api/review/coverage`, { method: 'POST', headers, body: JSON.stringify(coverageInput) })).status, 200)
    assert.equal((await fetch(`${running.base}/api/review/coverage`, { method: 'POST', headers, body: JSON.stringify(coverageInput) })).status, 409)
    metadata.refreshError = 'Source inventory unavailable'
    assert.equal((await fetch(`${running.base}/api/review/index`, { headers })).status, 503)
    assert.equal((await fetch(`${running.base}/api/review/coverage`, { headers })).status, 503)
    delete metadata.refreshError
    assert.equal((await fetch(`${running.base}/api/review/feedback`, { method: 'POST', headers: { ...headers, origin: 'https://untrusted.example' }, body: JSON.stringify(note) })).status, 403)
    assert.equal((await fetch(`${running.base}/api/review/feedback`, { method: 'POST', headers, body: JSON.stringify({ ...note, context: { ...context, scenario: 'private-household' } }) })).status, 400)
    assert.equal((await fetch(`${running.base}/api/review/feedback`, { method: 'POST', headers, body: JSON.stringify({ ...note, context: { ...context, screen: 'care:dry' } }) })).status, 400)
    const response = await fetch(`${running.base}/api/review/feedback`, { method: 'POST', headers, body: JSON.stringify(note) })
    assert.equal(response.status, 201)
    const saved = await response.json()
    assert.equal(saved.context.state.fields[0].value, 'Synthetic tee')
    assert.equal(saved.context.screen, 'intake.pack.color')
    assert.deepEqual(saved.revision, snapshot.revision)
    assert.equal(saved.sourceStale, false)
    metadata.revision = { ...snapshot.revision, source: '2'.repeat(64) }
    const refreshed = await (await fetch(`${running.base}/api/review/feedback`, { headers })).json()
    assert.equal(refreshed[0].sourceStale, true)
    assert.deepEqual(refreshed[0].revision, snapshot.revision)
    assert.equal(JSON.parse(await readFile(join(dataDir, 'feedback.json'), 'utf8'))[0].sourceStale, false)
    const stale = await (await fetch(`${running.base}/api/review/feedback`, { method: 'POST', headers, body: JSON.stringify({ ...note, requestId: '22345678-1234-4234-8234-123456789abc' }) })).json()
    assert.equal(stale.sourceStale, true)
    assert.deepEqual(stale.revision, snapshot.revision)
    assert.equal((await fetch(`${running.base}/api/review/feedback`, { method: 'POST', headers, body: JSON.stringify(note) })).status, 200)
    assert.equal(captures, 2)
    assert.equal((await fetch(`${running.base}/api/review/feedback/${saved.id}/resolve`, { method: 'POST', headers, body: '{}' })).status, 400)
    assert.equal((await fetch(`${running.base}/api/review/feedback/${saved.id}/resolve`, { method: 'POST', headers, body: JSON.stringify({ evidence: 'apps/web/e2e/review-workspace.spec.ts: passing correction check' }) })).status, 200)
    await new Promise((resolve) => running.server.close(resolve))
    running = await start()
    const list = await (await fetch(`${running.base}/api/review/feedback`, { headers })).json()
    assert.equal(list.length, 2)
    assert.equal(list[0].status, 'resolved')
    assert.equal(list[0].context.scenario, context.scenario)
    assert.equal(list[0].sourceStale, true)
    assert.ok(!JSON.stringify(list).includes(key))
    const screenshot = await fetch(`${running.base}${list[0].screenshot}`, { headers })
    assert.equal(await screenshot.text(), 'synthetic-png')
  } finally { await new Promise((resolve) => running.server.close(resolve)) }
})

test('the Amp portal admits only its collaborators, and captures still load the loopback listener', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'civic-review-portal-'))
  const origins = []
  const middleware = await reviewMiddleware({ dataDir, metadata: { scenarios: [{ id: 'intake.pack.color' }], ...snapshot }, publicHost: 'civic.onamp.dev', adapter: adapter(), capture: async (_html, _viewport, { origin }) => { origins.push(origin); return Buffer.from('png') } })
  const server = createServer((req, res) => middleware(req, res, () => { res.writeHead(404); res.end() }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const base = `http://127.0.0.1:${port}`
  const portal = { host: 'civic.onamp.dev', 'x-amp-authenticated': 'amp-user=yes, workspace-member=no, collaborator=yes' }
  const note = { requestId: '32345678-1234-4234-8234-123456789abc', message: 'Portal review', kind: 'idea', context: { scenario: 'intake.pack.color', persona: 'single', role: 'owner', condition: 'normal', theme: 'light', textScale: 1, viewport: { width: 393, height: 852 }, state: { dialogs: [], tabs: [], fields: [] } }, anchor: { label: 'Screen', x: 0, y: 0, width: 1, height: 1 }, html: '<html><body>Fixture</body></html>', snapshot }
  // fetch cannot override Host, so drive the middleware with raw requests.
  const request = (path, headers, body) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: body ? 'POST' : 'GET', headers: { ...headers, ...(body ? { 'content-type': 'application/json' } : {}) } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)) })
    req.on('error', reject); req.end(body && JSON.stringify(body))
  })
  try {
    assert.equal(await request('/api/review/feedback', portal), 200)
    assert.equal(await request('/api/review/feedback', { ...portal, 'x-amp-authenticated': 'amp-user=yes, workspace-member=yes, collaborator=no' }), 401)
    assert.equal(await request('/api/review/feedback', { ...portal, 'x-amp-authenticated': 'amp-user=no, workspace-member=no, collaborator=no' }), 401)
    assert.equal(await request('/api/review/feedback', { ...portal, host: 'other.onamp.dev' }), 403)
    assert.equal(await request('/api/review/feedback', { ...portal, origin: 'https://untrusted.example' }, note), 403)
    assert.equal(await request('/api/review/feedback', { ...portal, origin: 'https://civic.onamp.dev' }, note), 201)
    assert.deepEqual(origins, [base])
    assert.equal((await fetch(`${base}/api/review/feedback`)).status, 401)
  } finally { await new Promise((resolve) => server.close(resolve)) }
})

test('a failed capture never acknowledges or stores feedback', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'civic-review-failure-'))
  const middleware = await reviewMiddleware({ dataDir, metadata: { scenarios: [{ id: 'intake.pack.color' }], ...snapshot }, adapter: adapter(), capture: async () => { throw new Error('Capture unavailable') } })
  const server = createServer((req, res) => middleware(req, res, () => res.end()))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const key = (await readFile(join(dataDir, 'access-key'), 'utf8')).trim()
  const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' }
  try {
    const body = { requestId: '12345678-1234-4234-8234-123456789abc', message: 'Retain this draft', kind: 'bug', context: { scenario: 'intake.pack.color', persona: 'single', role: 'owner', condition: 'normal', theme: 'dark', textScale: 2, viewport: { width: 393, height: 852 }, state: { dialogs: [], tabs: [], fields: [] } }, anchor: { label: 'Screen', x: 0, y: 0, width: 1, height: 1 }, html: '<html><body>Fixture</body></html>', snapshot }
    assert.equal((await fetch(`${base}/api/review/feedback`, { method: 'POST', headers, body: JSON.stringify(body) })).status, 503)
    assert.deepEqual(await (await fetch(`${base}/api/review/feedback`, { headers })).json(), [])
  } finally { await new Promise((resolve) => server.close(resolve)) }
})

test('proposals validate supported properties, reject stale writes, and persist alongside idempotent run captures', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'rehearsal-proposals-'))
  let captures = 0
  let fixtureCaptures = 0
  let driftDuringCapture = false
  const metadata = { scenarios: [{ id: 'intake.towel.fabric' }, { id: 'intake.pack.color', renderer: 'intake' }, { id: 'legacy.home', renderer: 'legacy' }], ...snapshot }
  const middleware = await reviewMiddleware({ dataDir, metadata, capture: async () => { captures++; return Buffer.from('run-image') }, adapter: adapter(async () => { fixtureCaptures++; if (driftDuringCapture) metadata.fixtureSource = '3'.repeat(64); return Buffer.from('real-fixture') }) })
  const server = createServer((req, res) => middleware(req, res, () => { res.writeHead(404); res.end() }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const key = (await readFile(join(dataDir, 'access-key'), 'utf8')).trim()
  const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' }
  const post = (path, data) => fetch(`${base}/api/review/${path}`, { method: 'POST', headers, body: JSON.stringify(data) })
  const proposal = { id: '12345678-1234-4234-8234-123456789abc', expectedVersion: 0, source: snapshot.revision.source, title: 'Towel candidate', edits: { fabric: { title: 'Which fibers?', action: 'Choose a color', color: '#174bf5' } } }
  try {
    assert.equal((await fetch(`${base}/api/review/proposals`)).status, 401)
    assert.equal((await post('proposals', { ...proposal, edits: { fabric: { onclick: 'alert(1)' } } })).status, 400)
    assert.equal((await post('proposals', { ...proposal, edits: { fabric: { color: '#ffffff' } } })).status, 400)
    assert.equal((await post('proposals', { ...proposal, source: '2'.repeat(64) })).status, 400)
    assert.equal((await post('proposals', proposal)).status, 200)
    const saved = await (await fetch(`${base}/api/review/proposals`, { headers })).json()
    assert.equal(saved[0].version, 1)
    assert.equal(saved[0].edits.fabric.title, 'Which fibers?')
    assert.equal((await post('proposals', proposal)).status, 409)
    const simultaneous = await Promise.all([post('proposals', { ...proposal, expectedVersion: 1 }), post('proposals', { ...proposal, expectedVersion: 1 })])
    assert.deepEqual(simultaneous.map((res) => res.status).sort(), [200, 409])
    assert.equal(JSON.parse(await readFile(join(dataDir, 'proposals.json'), 'utf8'))[0].version, 2)
    const input = { requestId: '22345678-1234-4234-8234-123456789abc', message: 'Fabric to color', kind: 'other', context: { scenario: 'intake.towel.fabric', persona: 'single', role: 'owner', condition: 'normal', theme: 'light', textScale: 1, viewport: { width: 393, height: 852 }, state: { dialogs: ['Fabric'], tabs: [], fields: [{ label: 'Other percentage', value: '' }] } }, anchor: { label: 'Screen', x: 0, y: 0, width: 1, height: 1 }, html: '<html><body>Frozen inputs</body></html>', snapshot }
    assert.equal((await post('capture', input)).status, 200)
    assert.equal((await post('capture', input)).status, 200)
    assert.equal(captures, 1)
    assert.equal(await (await fetch(`${base}/api/review/captures/${input.requestId}.png`, { headers })).text(), 'run-image')
    assert.equal((await fetch(`${base}/api/review/fixture.png?screen=private-data`, { headers })).status, 400)
    assert.equal(await (await fetch(`${base}/api/review/fixture.png?screen=fabric`, { headers })).text(), 'real-fixture')
    assert.equal((await (await post('snapshots', {})).json()).count, 13)
    assert.equal(fixtureCaptures, 13)
    assert.equal((await (await post('snapshots', { scope: 'app' })).json()).count, 15)
    assert.equal(fixtureCaptures, 15)
    assert.equal(await (await fetch(`${base}/api/review/fixture.png?screen=legacy.home`, { headers })).text(), 'real-fixture')
    assert.equal((await (await post('snapshots', {})).json()).count, 13)
    assert.equal(fixtureCaptures, 15)
    const restarted = await reviewMiddleware({ dataDir, metadata, capture: async () => Buffer.from('unused'), adapter: adapter(async () => { throw new Error('Saved snapshots must survive restart') }) })
    const restartedServer = createServer((req, res) => restarted(req, res, () => res.end()))
    await new Promise((resolve) => restartedServer.listen(0, '127.0.0.1', resolve))
    try { assert.equal(await (await fetch(`http://127.0.0.1:${restartedServer.address().port}/api/review/fixture.png?screen=fabric`, { headers })).text(), 'real-fixture') }
    finally { await new Promise((resolve) => restartedServer.close(resolve)) }
    metadata.fixtureSource = '2'.repeat(64); driftDuringCapture = true
    assert.equal((await post('snapshots', {})).status, 409)
    assert.ok(!(await readdir(join(dataDir, 'fixtures'))).some((file) => file.startsWith('2'.repeat(64))), 'mixed revision captures must not be cached')
    const historical = await fetch(`${base}/api/review/fixture.png?screen=fabric&source=${snapshot.revision.source}`, { headers })
    assert.equal(historical.headers.get('x-review-source'), snapshot.revision.source)
    assert.equal(await historical.text(), 'real-fixture')
    assert.equal((await fetch(`${base}/api/review/fixture.png?screen=fabric&source=${'4'.repeat(64)}`, { headers })).status, 404)
    assert.equal((await fetch(`${base}/api/review/fixture.png?screen=fabric&source=invalid`, { headers })).status, 400)
  } finally { await new Promise((resolve) => server.close(resolve)) }
})

test('an adapter cannot offer proposal properties the shell does not validate', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'rehearsal-adapter-'))
  await assert.rejects(reviewMiddleware({ dataDir, metadata: { scenarios: [], ...snapshot }, capture: async () => Buffer.from(''), adapter: { ...adapter(), proposalProperties: ['title', 'onclick'] } }), /only validate/)
})

test('saved notes become shared CIVIC annotations with their locator, and annotations can be handed to an agent', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'civic-review-shared-'))
  const recorded = []
  const handed = []
  const shared = {
    record: async (input) => { recorded.push(input); return 'annotation:12345678-1234-4234-8234-123456789abc' },
    list: async () => ({ lines: [], annotations: recorded.length }),
    handOff: async (input) => { handed.push(input); return { id: 'request:1' } },
  }
  const middleware = await reviewMiddleware({ dataDir, metadata: { scenarios: [{ id: 'intake.pack.color' }], ...snapshot }, adapter: adapter(), shared, capture: async () => Buffer.from('png') })
  const server = createServer((req, res) => middleware(req, res, () => { res.writeHead(404); res.end() }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const key = (await readFile(join(dataDir, 'access-key'), 'utf8')).trim()
  const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' }
  const context = { scenario: 'intake.pack.color', persona: 'single', role: 'owner', condition: 'normal', theme: 'light', textScale: 2, viewport: { width: 393, height: 852 }, state: { dialogs: [], tabs: [], fields: [] } }
  const note = { requestId: '32345678-1234-4234-8234-123456789abc', message: 'Continue is hard to find.', kind: 'bug', context, anchor: { label: 'Continue', x: 0.1, y: 0.8, width: 0.8, height: 0.05, locator: { role: 'button', name: 'Continue' } }, html: '<html></html>', snapshot }
  try {
    assert.equal((await fetch(`${base}/api/review/feedback`, { method: 'POST', headers, body: JSON.stringify({ ...note, requestId: '42345678-1234-4234-8234-123456789abc', anchor: { ...note.anchor, locator: { role: 'Not a role!', name: 'x' } } }) })).status, 400)
    const saved = await (await fetch(`${base}/api/review/feedback`, { method: 'POST', headers, body: JSON.stringify(note) })).json()
    assert.equal(saved.annotationId, 'annotation:12345678-1234-4234-8234-123456789abc')
    assert.deepEqual(recorded[0].feedback.anchor.locator, { role: 'button', name: 'Continue' })
    assert.equal(recorded[0].screenshot.toString(), 'png')
    assert.equal(recorded[0].origin, base)
    assert.deepEqual(await (await fetch(`${base}/api/review/shared`, { headers })).json(), { lines: [], annotations: 1 })
    assert.equal((await fetch(`${base}/api/review/hand-off`, { method: 'POST', headers, body: JSON.stringify({ annotationIds: ['../../etc'], ask: 'x' }) })).status, 400)
    assert.equal((await fetch(`${base}/api/review/hand-off`, { method: 'POST', headers, body: JSON.stringify({ annotationIds: [saved.annotationId], ask: 'Make Continue visible.' }) })).status, 201)
    assert.deepEqual(handed, [{ annotationIds: [saved.annotationId], ask: 'Make Continue visible.', checks: [] }])
    assert.equal((await fetch(`${base}/api/review/hand-off`, { method: 'POST', body: '{}' })).status, 401)
    shared.record = async () => { throw new Error('store is locked') }
    const kept = await fetch(`${base}/api/review/feedback`, { method: 'POST', headers, body: JSON.stringify({ ...note, requestId: '52345678-1234-4234-8234-123456789abc' }) })
    assert.equal(kept.status, 201)
    const row = await kept.json()
    assert.equal(row.annotationId, undefined)
    assert.match(row.sharedError, /store is locked/)
    assert.ok((await (await fetch(`${base}/api/review/feedback`, { headers })).json()).some((entry) => entry.id === row.id))
  } finally { await new Promise((resolve) => server.close(resolve)) }
})
