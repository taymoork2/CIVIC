import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import http, { createServer, request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { hostPlaywright, reviewMiddleware } from './review-server.mjs'

// A synthetic adapter shaped like the towel journey: 13 screens over 10 scenarios.
const steps = ['type', 'whose', 'details', 'fabric', 'color', 'origin', 'dye', 'care:wash', 'care:bleach', 'care:dry', 'stain', 'final', 'saved']
const screens = steps.map((id) => ({ id, scenario: `intake.towel.${id === 'saved' ? 'final' : id.split(':')[0]}` }))
const unusedFixture = async () => { throw new Error('No fixture expected') }
// Its journey graph: the declared screens as one flow, every other scenario as its own one-screen flow.
const journeyGraph = (scenarios, project) => [
  ...(project?.adapter === 'module' ? [] : [{ id: 'towel', label: 'Add a towel', screens: screens.map((screen) => ({ ...screen, label: screen.id, edges: [] })) }]),
  ...scenarios.filter((scenario) => project?.adapter === 'module' || !scenario.id.startsWith('intake.towel.')).map((scenario) => ({ id: `flow:${scenario.id}`, label: scenario.id, screens: [{ id: scenario.id, label: scenario.id, scenario: scenario.id, edges: scenario.edges ?? [] }] })),
]
const pathId = (from, to, action) => JSON.stringify([from, to, action])
const adapter = (captureFixture = unusedFixture) => ({ screens, journeyGraph, pathId, proposalProperties: ['title', 'action', 'color'], captureFixture })

// A synthetic coverage bridge: the shell owns access, origin and refresh guards; the app's bridge owns versions.
const coverage = async () => {
  let version = 1
  return {
    get: async () => ({ version, source: snapshot.revision.source, candidates: [{ id: 'screen.test' }] }),
    update: async (input) => { if (input.expectedVersion !== version) throw Object.assign(new Error('Coverage changed elsewhere.'), { status: 409 }); return { version: ++version } },
  }
}

const snapshot = { revision: { head: '0'.repeat(40), source: '1'.repeat(64), capturedAt: new Date().toISOString() }, design: { project: 'synthetic-test-design', hashes: {} } }

test('a comment reuses its saved screen capture and refuses a different source or viewport', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'civic-screen-capture-'))
  let captures = 0
  const middleware = await reviewMiddleware({ dataDir, metadata: { ...snapshot, scenarios: [{ id: 'screen' }] }, adapter: adapter(), capture: async () => { captures++; return Buffer.from('original-png') } })
  const server = createServer((req, res) => middleware(req, res, () => res.end('Review')))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const origin = `http://127.0.0.1:${server.address().port}`, headers = await localHeaders(origin)
  const context = { scenario: 'screen', persona: 'single', role: 'owner', condition: 'normal', theme: 'light', textScale: 1, viewport: { width: 393, height: 852 }, state: { dialogs: [], tabs: [], fields: [] } }
  const input = { requestId: '12345678-1234-4234-8234-123456789abc', kind: 'other', message: 'Screen capture', context, snapshot, html: '<html></html>', anchor: { label: 'Whole screen', x: 0, y: 0, width: 1, height: 1 } }
  const post = (path, value) => fetch(origin + '/api/review/' + path, { method: 'POST', headers, body: JSON.stringify(value) })
  const captureResponse = await post('capture', input)
  assert.equal(captureResponse.status, 200)
  const receipt = await captureResponse.json()
  assert.equal(receipt.id, input.requestId)
  const note = { ...input, html: undefined, capture: receipt.id, requestId: '22345678-1234-4234-8234-123456789abc', kind: 'bug', message: 'Check this region', anchor: { label: 'Heading', x: .1, y: .1, width: .5, height: .1 } }
  const response = await post('feedback', note)
  assert.equal(response.status, 201)
  const saved = await response.json()
  const image = await fetch(origin + saved.screenshot, { headers })
  assert.equal(image.status, 200)
  assert.equal(await image.text(), 'original-png')
  assert.equal(captures, 1, 'The exact saved image is annotated without rendering it again')
  for (const patch of [{ capture: '../other' }, { context: { ...context, viewport: { width: 800, height: 600 } } }, { snapshot: { ...snapshot, revision: { ...snapshot.revision, source: '3'.repeat(64) } } }]) {
    assert.equal((await post('feedback', { ...note, requestId: '32345678-1234-4234-8234-123456789abc', ...patch })).status, 400)
  }
})

test('explicit high resolution fixtures retain their viewport and use a separate image cache', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'civic-retina-capture-'))
  const contexts = []
  let closed = 0
  const custom = adapter(async (node, { browser }) => { if (browser) await browser.newContext({ viewport: { width: 393, height: 852 } }); return Buffer.from(node.pixelRatio === 2 ? 'retina' : 'standard') })
  custom.launchFixtureBrowser = async () => ({ newContext: async options => { contexts.push(options) }, close: async () => { closed++ } })
  const middleware = await reviewMiddleware({ dataDir, metadata: { ...snapshot, scenarios: [{ id: 'screen' }] }, adapter: custom })
  const server = createServer((req, res) => middleware(req, res, () => res.end('Review')))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const origin = `http://127.0.0.1:${server.address().port}`, headers = await localHeaders(origin)
  const get = query => fetch(origin + '/api/review/fixture.png?screen=screen' + query, { headers })
  assert.equal(await (await get('&width=800&height=600&pixelRatio=2')).text(), 'retina')
  assert.deepEqual(contexts, [{ viewport: { width: 800, height: 600 }, deviceScaleFactor: 2 }])
  assert.equal(closed, 0, 'Queued captures retain their browser while every context stays isolated')
  assert.equal(await (await get('')).text(), 'standard')
  assert.equal((await get('&pixelRatio=8')).status, 400)
  assert.equal(await (await get('&width=800&height=600&pixelRatio=2')).text(), 'retina')
  assert.equal(closed, 0, 'A matching high resolution image is reused')
  await middleware.close()
  assert.equal(closed, 1, 'Closing the host releases its retained browser')
})

test('visible snapshots reuse one browser, retain fresh contexts and recover a disconnected renderer', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'civic-browser-reuse-'))
  let launches = 0, contexts = 0, closed = 0, disconnected = false
  const custom = adapter(async (node, { browser }) => {
    const context = await browser.newContext({ viewport: node.viewport })
    await context.close()
    return Buffer.from(String(context.id))
  })
  custom.launchFixtureBrowser = async () => {
    launches++; disconnected = false
    return { isConnected: () => !disconnected, newContext: async () => ({ id: ++contexts, close: async () => {} }), close: async () => { closed++ } }
  }
  const middleware = await reviewMiddleware({ dataDir, metadata: { ...snapshot, scenarios: [{ id: 'screen' }] }, adapter: custom })
  const server = createServer((req, res) => middleware(req, res, () => res.end('Review')))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { await middleware.close(); await new Promise(resolve => server.close(resolve)) })
  const origin = `http://127.0.0.1:${server.address().port}`, headers = await localHeaders(origin)
  const get = width => fetch(origin + `/api/review/fixture.png?screen=screen&width=${width}&height=852`, { headers })
  assert.equal(await (await get(393)).text(), '1')
  assert.equal(await (await get(394)).text(), '2')
  assert.equal(launches, 1)
  assert.equal(contexts, 2, 'A browser process is shared, never a screen context or its storage')
  disconnected = true
  assert.equal(await (await get(395)).text(), '3')
  assert.equal(launches, 2)
  await new Promise(resolve => setTimeout(resolve, 1100))
  assert.equal(closed, 2, 'An idle snapshot browser closes without retaining background work')
})

test('parallel CIVIC ports keep independent browser sessions on the same hostname', async t => {
  const servers = []
  for (let index = 0; index < 2; index++) {
    const dataDir = await mkdtemp(join(tmpdir(), 'civic-port-session-'))
    const middleware = await reviewMiddleware({ dataDir, metadata: snapshot, adapter: adapter() })
    const server = createServer((req, res) => middleware(req, res, () => res.end('Review')))
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    t.after(() => new Promise(resolve => server.close(resolve)))
    const base = `http://127.0.0.1:${server.address().port}`
    const cookie = (await fetch(base + '/review')).headers.get('set-cookie').split(';')[0]
    servers.push({ base, cookie })
  }
  assert.notEqual(servers[0].cookie.split('=')[0], servers[1].cookie.split('=')[0])
  const jar = servers.map(row => row.cookie).join('; ')
  for (const [index, row] of servers.entries()) {
    assert.equal((await fetch(row.base + '/api/review/index', { headers: { cookie: jar } })).status, 200)
    assert.equal((await fetch(row.base + '/api/review/index', { headers: { cookie: servers[1 - index].cookie } })).status, 401)
  }
})

test('browser automation resolves through the host dependency without loading its test runner', async () => {
  const root = await mkdtemp(join(tmpdir(), 'civic-browser-loader-')), cwd = process.cwd()
  for (const name of ['@playwright/test', 'playwright']) {
    const folder = join(root, 'node_modules', name); await mkdir(folder, { recursive: true })
    await writeFile(join(folder, 'package.json'), JSON.stringify({ name, main: 'index.cjs' }))
    await writeFile(join(folder, 'index.cjs'), name === '@playwright/test' ? 'throw Error("A second test runner must never be loaded")' : 'module.exports = { chromium: { fixtureOnly: true } }')
  }
  try { process.chdir(root); assert.equal((await hostPlaywright()).chromium.fixtureOnly, true) }
  finally { process.chdir(cwd) }
})
test('source discovery requires project authentication and does not hold the write queue during provider reads', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'civic-source-api-'))
  let started, finish, linked = 0
  const pending = new Promise(resolve => { finish = resolve }), sourceStarted = new Promise(resolve => { started = resolve })
  const middleware = await reviewMiddleware({ dataDir, metadata: { ...snapshot, project: { key: 'source-app' } }, adapter: adapter(), projects: {
    sourceVersions: async () => { started(); await pending; return { items: [], limit: 10 } },
    linkFigma: async () => { linked++; return { linked: true } },
  } })
  const server = createServer((req, res) => middleware(req, res, () => res.end('Review')))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { finish(); server.close(resolve) }))
  const base = `http://127.0.0.1:${server.address().port}`, headers = { ...await localHeaders(base), 'x-rehearsal-project': 'source-app' }
  const post = (action, auth = headers) => fetch(base + '/api/review/projects', { method: 'POST', headers: auth, body: JSON.stringify({ action }), signal: AbortSignal.timeout(2000) })
  assert.equal((await post('source-versions', { 'content-type': 'application/json' })).status, 401)
  assert.equal((await post('source-versions', { ...headers, 'x-rehearsal-project': 'other-app' })).status, 409)
  const discovery = post('source-versions')
  await sourceStarted
  try { assert.equal((await post('link-figma')).status, 200); assert.equal(linked, 1) }
  finally { finish() }
  assert.equal((await discovery).status, 200)
})
test('project-window requests require authentication and retain the originating project binding', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'civic-window-api-')), calls = []
  const middleware = await reviewMiddleware({ dataDir, metadata: { ...snapshot, project: { key: 'source-app' } }, adapter: adapter(), projects: {
    openWindow: async (key, workspace) => { calls.push({ key, workspace }); return { url: 'http://127.0.0.1:4001/review' } },
    windowOrigins: () => ['http://127.0.0.1:4001'],
  } })
  const server = createServer((req, res) => middleware(req, res, () => res.end('Review')))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}`, headers = { ...await localHeaders(base), 'x-rehearsal-project': 'source-app' }
  const post = (action, auth = headers) => fetch(base + '/api/review/projects', { method: 'POST', headers: auth, body: JSON.stringify({ action, key: 'laundry' }) })
  assert.equal((await post('open-window', { 'content-type': 'application/json' })).status, 401)
  assert.equal((await post('open-window', { ...headers, 'x-rehearsal-project': 'other-app' })).status, 409)
  assert.deepEqual(await (await post('open-window')).json(), { url: 'http://127.0.0.1:4001/review' })
  assert.deepEqual(calls, [{ key: 'laundry', workspace: undefined }])
  assert.deepEqual(await (await post('window-origins')).json(), { origins: ['http://127.0.0.1:4001'] })
})
test('screen comparisons are authenticated, project-bound and do not block the write queue', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'civic-changes-api-'))
  let started, finish, linked = 0
  const pending = new Promise(resolve => { finish = resolve }), comparisonStarted = new Promise(resolve => { started = resolve })
  const middleware = await reviewMiddleware({ dataDir, metadata: { ...snapshot, project: { key: 'selected-app' } }, adapter: adapter(), projects: {
    changes: async input => { started(); await pending; return { scenario: input.scenario, comparisons: [] } },
    linkFigma: async () => { linked++; return { linked: true } },
  } })
  const server = createServer((req, res) => middleware(req, res, () => res.end('Review')))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { finish(); server.close(resolve) }))
  const base = `http://127.0.0.1:${server.address().port}`, headers = { ...await localHeaders(base), 'x-rehearsal-project': 'selected-app' }
  const post = (action, auth = headers) => fetch(base + '/api/review/projects', { method: 'POST', headers: auth, body: JSON.stringify({ action, scenario: 'home', candidates: [] }), signal: AbortSignal.timeout(2000) })
  assert.equal((await post('changes', { 'content-type': 'application/json' })).status, 401)
  assert.equal((await post('changes', { ...headers, 'x-rehearsal-project': 'other-app' })).status, 409)
  const comparison = post('changes')
  await comparisonStarted
  try { assert.equal((await post('link-figma')).status, 200); assert.equal(linked, 1) }
  finally { finish() }
  assert.deepEqual(await (await comparison).json(), { scenario: 'home', comparisons: [] })
})

test('catalog and version pages retain authentication, project binding and cancellation outside the write queue', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'civic-version-api-'))
  let started, aborted, linked = 0
  const beginning = new Promise(resolve => { started = resolve }), cancellation = new Promise(resolve => { aborted = resolve })
  const middleware = await reviewMiddleware({ dataDir, metadata: { ...snapshot, project: { key: 'selected-app' } }, adapter: adapter(), projects: {
    catalog: async () => ({ active: 'selected-app', apps: [] }),
    versionPage: async (_input, { signal }) => { started(); await new Promise(resolve => signal.addEventListener('abort', () => { aborted(); resolve() }, { once: true })); return { items: [] } },
    linkFigma: async () => { linked++; return { linked: true } },
  } })
  const server = createServer((req, res) => middleware(req, res, () => res.end('Review')))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}`, headers = { ...await localHeaders(base), 'x-rehearsal-project': 'selected-app' }
  const post = (action, auth = headers, signal = AbortSignal.timeout(2000)) => fetch(base + '/api/review/projects', { method: 'POST', headers: auth, body: JSON.stringify({ action, app: 'notes' }), signal })
  for (const action of ['catalog', 'version-page']) {
    assert.equal((await post(action, { 'content-type': 'application/json' })).status, 401)
    assert.equal((await post(action, { ...headers, 'x-rehearsal-project': 'other-app' })).status, 409)
  }
  assert.equal((await post('catalog')).status, 200)
  const controller = new AbortController(), request = post('version-page', headers, controller.signal)
  const rejected = assert.rejects(request, { name: 'AbortError' })
  await beginning
  assert.equal((await post('link-figma')).status, 200)
  assert.equal(linked, 1)
  controller.abort()
  await Promise.all([rejected, cancellation])
})

test('live interaction inventory is authenticated, source-bound and scans only registered read-only fixtures', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'civic-interaction-api-'))
  const project = { key: 'orca', mode: 'live-read-only', personas: [{ id: 'owner' }], roles: [{ id: 'browse' }], conditions: [{ id: 'live' }] }
  const metadata = { ...snapshot, project, coverage: { targets: [] }, scenarios: [{ id: 'home', label: 'Home' }, { id: 'settings', label: 'Settings' }] }
  const captured = []
  let closed = false
  const middleware = await reviewMiddleware({ dataDir, metadata, coverage, adapter: { ...adapter(async node => { captured.push(node.id); if (node.id === 'settings') throw Error('Unavailable state'); return Buffer.from('png') }), launchFixtureBrowser: async () => ({ close: async () => { closed = true } }) } })
  const server = createServer((req, res) => middleware(req, res, () => res.end('Review')))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`, headers = await localHeaders(base)
  const state = { scenario: 'home', persona: 'owner', role: 'browse', condition: 'live', viewport: { width: 1440, height: 900 }, controls: [{ tag: 'button', role: 'button', name: 'Menu', count: 1, index: 0, disabled: false }], landmarks: [], truncated: false }
  const input = { action: 'observe', source: snapshot.revision.source, state }
  const post = (data, auth = headers) => fetch(`${base}/api/review/interactions`, { method: 'POST', headers: auth, body: JSON.stringify(data) })
  try {
    assert.equal((await post(input, { 'content-type': 'application/json' })).status, 401)
    assert.equal((await post(input, { ...headers, origin: 'https://foreign.test' })).status, 403)
    assert.equal((await post(input, { ...headers, 'x-rehearsal-project': 'another' })).status, 409)
    assert.equal((await post({ ...input, source: 'a'.repeat(64) })).status, 409)
    assert.equal((await post({ ...input, state: { ...state, controls: [{ ...state.controls[0], value: 'private' }] } })).status, 400)
    assert.equal((await post(input)).status, 201)
    assert.equal((await fetch(`${base}/api/review/replays`, { method: 'POST', headers, body: '{}' })).status, 409, 'Live observations cannot be posted as verified replays')
    assert.equal((await post({ action: 'verify', source: input.source })).status, 409, 'Live projects cannot run isolated writes')
    const report = await (await fetch(`${base}/api/review/coverage`, { headers })).json()
    assert.equal(report.interactions.summary.controls, 1)
    assert.equal(report.interactions.summary.unrecorded, 1)
    assert.equal((await post({ action: 'scan', source: input.source })).status, 202)
    const deadline = Date.now() + 2000
    while (!closed && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(closed, true)
    assert.deepEqual(captured, ['home', 'settings'])
    const scan = (await (await fetch(`${base}/api/review/interactions`, { headers })).json()).scan
    assert.equal(scan.status, 'partial')
    assert.deepEqual(scan.errors, [{ scenario: 'settings', message: 'Unavailable state' }])
  } finally { await new Promise(resolve => server.close(resolve)) }
})

test('isolated behavior results persist with their source and cannot verify a changed build', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'civic-behavior-api-'))
  const metadata = { ...snapshot, project: { key: 'isolated', runtime: true, personas: [{ id: 'owner' }], roles: [{ id: 'owner' }], conditions: [{ id: 'normal' }] }, scenarios: [{ id: 'home' }] }
  let closed = false, explored = false
  const middleware = await reviewMiddleware({ dataDir, metadata, adapter: { ...adapter(), launchFixtureBrowser: async () => ({ close: async () => { closed = true } }), exploreFixture: async () => { explored = true; return { states: 3, actions: 2, errors: [], limited: true } }, verifyBehavior: async () => [{ title: 'Synthetic write retained', outcome: 'pass', assertions: ['One owned record'] }] } })
  const server = createServer((req, res) => middleware(req, res, () => res.end('Review')))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`, headers = await localHeaders(base)
  const post = action => fetch(`${base}/api/review/interactions`, { method: 'POST', headers, body: JSON.stringify({ action, source: metadata.revision.source }) })
  const wait = async () => { const deadline = Date.now() + 2000; while (!closed && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(closed, true) }
  const report = async () => (await fetch(`${base}/api/review/interactions`, { headers })).json()
  try {
    assert.equal((await post('explore')).status, 202); await wait()
    assert.equal(explored, true); assert.equal((await report()).scan.status, 'partial')
    closed = false
    assert.equal((await post('verify')).status, 202); await wait()
    assert.equal((await report()).behavior.checks[0].outcome, 'pass')
    metadata.revision = { ...metadata.revision, source: 'a'.repeat(64) }
    assert.equal((await report()).behavior, null)
  } finally { await new Promise(resolve => server.close(resolve)) }
})

test('content-addressed snapshots survive unrelated revisions and retain historical evidence while changed inputs render', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'rehearsal-cache-'))
  const metadata = { ...snapshot, project: { adapter: 'module' }, scenarios: [{ id: 'a' }], fixtureHashes: { a: 'a'.repeat(64) } }
  let renders = 0
  const middleware = await reviewMiddleware({ dataDir, metadata, adapter: adapter(async () => Buffer.from(`image-${++renders}`)) })
  const server = createServer((req, res) => middleware(req, res, () => res.end('Review')))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`, headers = await localHeaders(base)
  const get = (query = '') => fetch(`${base}/api/review/fixture.png?screen=a${query}`, { headers })
  try {
    assert.equal(await (await get()).text(), 'image-1')
    metadata.fixtureSource = '2'.repeat(64)
    const stale = await get('&cached=1')
    assert.equal(stale.headers.get('x-review-source'), snapshot.revision.source)
    assert.equal(await stale.text(), 'image-1')
    assert.equal(await (await get()).text(), 'image-1'); assert.equal(renders, 1)
    metadata.fixtureHashes.a = 'b'.repeat(64); metadata.fixtureSource = '3'.repeat(64)
    assert.equal(await (await get()).text(), 'image-2'); assert.equal(renders, 2)
    assert.equal(await (await get('&source=' + snapshot.revision.source)).text(), 'image-1')
    const restarted = await reviewMiddleware({ dataDir, metadata, adapter: adapter(async () => { throw Error('Must reuse disk cache') }) })
    server.removeAllListeners('request'); server.on('request', (req, res) => restarted(req, res, () => res.end('Review')))
    assert.equal(await (await fetch(base + '/api/review/fixture.png?screen=a', { headers: await localHeaders(base) })).text(), 'image-2')
  } finally { await new Promise((resolve) => server.close(resolve)) }
})

test('one screen keeps distinct phone and desktop snapshot caches across source changes', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'rehearsal-viewport-cache-'))
  const metadata = { ...snapshot, project: { adapter: 'module' }, scenarios: [{ id: 'a' }] }
  const renders = []
  const middleware = await reviewMiddleware({ dataDir, metadata, adapter: adapter(async node => { renders.push(node.viewport); return Buffer.from(JSON.stringify(node.viewport)) }) })
  const server = createServer((req, res) => middleware(req, res, () => res.end('Review')))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`, headers = await localHeaders(base)
  const get = query => fetch(`${base}/api/review/fixture.png?screen=a&${query}`, { headers })
  try {
    assert.deepEqual(await (await get('width=393&height=852')).json(), { width: 393, height: 852 })
    assert.deepEqual(await (await get('width=1440&height=900')).json(), { width: 1440, height: 900 })
    assert.equal(renders.length, 2)
    await get('width=393&height=852'); assert.equal(renders.length, 2)
    metadata.fixtureSource = '2'.repeat(64)
    assert.deepEqual(await (await get('width=1440&height=900&cached=1')).json(), { width: 1440, height: 900 })
    assert.deepEqual(await (await get(`width=393&height=852&source=${snapshot.revision.source}`)).json(), { width: 393, height: 852 })
    assert.equal((await get('width=1440')).status, 400)
    assert.equal((await get('width=99999&height=900')).status, 400)
  } finally { await new Promise(resolve => server.close(resolve)) }
})

test('one private HTTPS proxy gets secure sessions, exact origins and loopback captures', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'rehearsal-tailnet-'))
  const publicOrigin = 'https://review.example.ts.net:10445'
  const metadata = { ...snapshot, scenarios: [{ id: 'intake.pack.color' }] }
  for (const invalid of ['http://review.example.ts.net', 'https://foreign.test', publicOrigin + '/review']) {
    await assert.rejects(reviewMiddleware({ dataDir, metadata, adapter: adapter(), publicOrigin: invalid }), /HTTPS Tailscale origin/)
  }
  let captureOrigin
  const middleware = await reviewMiddleware({ dataDir, metadata, adapter: adapter(), publicOrigin, capture: async (_html, _viewport, options) => { captureOrigin = options.origin; return Buffer.from('synthetic-png') } })
  const server = createServer((req, res) => middleware(req, res, () => res.end('Review')))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const headers = { host: new URL(publicOrigin).host, origin: publicOrigin, 'content-type': 'application/json' }
  const send = (url, options = {}) => new Promise((resolve, reject) => {
    const req = request(url, { method: options.method, headers: options.headers }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers: res.headers })))
      res.on('error', reject)
    })
    req.on('error', reject); req.end(options.body)
  })
  try {
    const entry = await send(`${base}/review`, { headers })
    assert.equal(entry.status, 200)
    assert.match(entry.headers.get('set-cookie'), /HttpOnly; SameSite=Strict; Path=\/; Secure/)
    assert.equal((await send(`${base}/api/review/index`, { headers })).status, 401)
    headers.cookie = entry.headers.get('set-cookie').split(';')[0]
    assert.equal((await send(`${base}/api/review/index`, { headers })).status, 200)
    assert.equal((await send(`${base}/review`, { headers: { ...headers, host: 'other.example.ts.net:10445' } })).status, 403)
    const note = { requestId: '12345678-1234-4234-8234-123456789abc', message: 'Phone review', kind: 'idea', snapshot, html: '<html><body>Synthetic</body></html>', anchor: { label: 'Screen', x: 0, y: 0, width: 1, height: 1 }, context: { scenario: 'intake.pack.color', persona: 'single', role: 'owner', condition: 'normal', theme: 'light', textScale: 1, viewport: { width: 393, height: 852 }, state: { dialogs: [], tabs: [], fields: [] } } }
    for (const origin of ['https://foreign.test', publicOrigin.replace('https:', 'http:'), 'http://' + headers.host]) {
      assert.equal((await send(`${base}/api/review/feedback`, { method: 'POST', headers: { ...headers, origin }, body: JSON.stringify(note) })).status, 403)
    }
    const saved = await send(`${base}/api/review/feedback`, { method: 'POST', headers, body: JSON.stringify(note) })
    assert.equal(saved.status, 201)
    assert.equal(captureOrigin, base, 'capture stays on the local service, independent of tailnet DNS')
    const row = await saved.json()
    const brief = await (await send(`${base}/api/review/feedback/${row.id}/handoff`, { headers })).text()
    assert.ok(brief.includes(publicOrigin + row.reproduction), 'handoff retains the private HTTPS address')
    assert.equal((await fetch(`${base}/api/review/index`, { headers: await localHeaders(base) })).status, 200)
  } finally { await new Promise((resolve) => server.close(resolve)) }
})

test('offscreen snapshot requests leave the queue; a shared visible request still completes', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'rehearsal-visible-snapshots-'))
  const captured = [], seen = new Map(), closed = new Map()
  let unblock, started
  const held = new Promise((resolve) => { unblock = resolve })
  const capturing = new Promise((resolve) => { started = resolve })
  const metadata = { ...snapshot, scenarios: [] }
  const middleware = await reviewMiddleware({ dataDir, metadata, adapter: adapter(async (node) => {
    captured.push(node.id)
    if (node.id === 'fabric') { started(); await held }
    return Buffer.from(node.id)
  }) })
  const server = createServer((req, res) => {
    const id = new URL(req.url, 'http://localhost').searchParams.get('screen')
    seen.get(id)?.(); res.once('close', () => closed.get(id)?.())
    void middleware(req, res, () => res.end('Local review'))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`, headers = await localHeaders(base)
  const get = (id, signal) => fetch(`${base}/api/review/fixture.png?screen=${id}`, { headers, signal })
  const abandon = new AbortController(), skip = new AbortController()
  try {
    const first = get('fabric'); await capturing
    const originSeen = new Promise((resolve) => seen.set('origin', resolve))
    const old = get('origin', abandon.signal).catch(() => null); await originSeen
    const sharedSeen = new Promise((resolve) => seen.set('origin', resolve))
    const shared = get('origin'); await sharedSeen
    const skippedSeen = new Promise((resolve) => seen.set('dye', resolve))
    const skipped = get('dye', skip.signal).catch(() => null); await skippedSeen
    const originClosed = new Promise((resolve) => closed.set('origin', resolve))
    const dyeClosed = new Promise((resolve) => closed.set('dye', resolve))
    abandon.abort(); skip.abort(); await Promise.all([originClosed, dyeClosed])
    unblock()
    assert.equal(await (await first).text(), 'fabric')
    assert.equal(await (await shared).text(), 'origin')
    await Promise.all([old, skipped])
    assert.deepEqual(captured, ['fabric', 'origin'])
    assert.equal(await (await get('dye')).text(), 'dye', 'cancelled snapshots can be requested again')
  } finally { unblock(); abandon.abort(); skip.abort(); await new Promise((resolve) => server.close(resolve)) }
})

async function localHeaders(base) {
  const entry = await fetch(`${base}/review`)
  assert.equal(entry.status, 200)
  const cookie = entry.headers.get('set-cookie')
  assert.match(cookie, /HttpOnly; SameSite=Strict/)
  return { cookie: cookie.split(';')[0], 'content-type': 'application/json' }
}

test('saved reviews dispatch once, retain receipts and recover uncertain sends after restart', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'rehearsal-agent-test-'))
  const destination = { id: 'codex-test', label: 'Selected worktree', provider: 'codex', sessionId: '12345678-1234-4234-8234-123456789abc', cwd: '/owned/project', executable: '/private/bin/codex', socket: '/private/agent.sock' }
  const row = { id: 'aaaaaaaa-1234-4234-8234-123456789abc', message: 'Fix this branch.', status: 'new', revision: snapshot.revision, context: { scenario: 'intake.pack.color' }, screenshot: '/api/review/screenshots/test.png', reproduction: '/review?scenario=intake.pack.color' }
  await writeFile(join(dataDir, 'feedback.json'), JSON.stringify([row]))
  await writeFile(join(dataDir, row.id + '.png'), 'frozen-png')
  let sends = 0, receipt
  // The app's agent bridge reads destinations from its data directory; the shell only sees this contract.
  const publicDestination = ({ executable: _executable, socket: _socket, ...rest }) => rest
  const sendReview = async (target, packet, notify) => { sends++; assert.equal(target.sessionId, destination.sessionId); assert.match(packet.brief, /Fix this branch/); assert.equal(packet.png.toString(), 'frozen-png'); receipt = notify; await notify({ status: 'accepted', turnId: 'turn-1' }) }
  const start = async () => {
    const middleware = await reviewMiddleware({ dataDir, metadata: { ...snapshot, scenarios: [] }, capture: async () => Buffer.from('image'), adapter: adapter(), agents: { destinations: async () => [destination], dispatch: sendReview, publicDestination } })
    const server = createServer((req, res) => middleware(req, res, () => res.end('Local review')))
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    return { server, base: `http://127.0.0.1:${server.address().port}` }
  }
  let running = await start(), headers = await localHeaders(running.base)
  const input = { requestId: 'bbbbbbbb-1234-4234-8234-123456789abc', destination: destination.id }
  const post = (value, extra = {}) => fetch(`${running.base}/api/review/feedback/${row.id}/send`, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(value) })
  try {
    const available = await (await fetch(`${running.base}/api/review/agents`, { headers })).json()
    assert.equal(available[0].cwd, '/owned/project'); assert.equal(available[0].socket, undefined); assert.equal(available[0].executable, undefined)
    assert.equal((await post(input, { origin: 'https://foreign.test' })).status, 403)
    assert.equal((await post({ ...input, destination: 'unregistered' })).status, 400)
    assert.equal((await post(input)).status, 202)
    assert.equal((await post(input)).status, 200)
    assert.equal((await post({ ...input, requestId: 'cccccccc-1234-4234-8234-123456789abc' })).status, 409)
    // Dispatch starts after its durable HTTP receipt, without waiting for the agent turn.
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(sends, 1)
    const stored = JSON.parse(await readFile(join(dataDir, 'feedback.json'), 'utf8'))[0]
    assert.equal(stored.status, 'new'); assert.equal(stored.deliveries[0].status, 'accepted')
    await receipt({ status: 'completed', detail: 'Agent finished, verification pending.' })
    assert.equal(JSON.parse(await readFile(join(dataDir, 'feedback.json'), 'utf8'))[0].status, 'new')
    assert.equal((await post({ requestId: 'eeeeeeee-1234-4234-8234-123456789abc', destination: destination.id, replyTo: input.requestId, message: 'Show the branch checks and remaining gaps.' })).status, 202)
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(sends, 2)
    const conversation = JSON.parse(await readFile(join(dataDir, 'feedback.json'), 'utf8'))[0]
    assert.equal(conversation.deliveries[1].replyTo, input.requestId)
    assert.equal(conversation.deliveries[1].message, 'Show the branch checks and remaining gaps.')
    assert.equal((await post({ requestId: 'ffffffff-1234-4234-8234-123456789abc', destination: destination.id, replyTo: input.requestId, message: 'Duplicate old follow-up.' })).status, 409)
    stored.deliveries[0].status = 'pending'
    await writeFile(join(dataDir, 'feedback.json'), JSON.stringify([stored]))
    await new Promise((resolve) => running.server.close(resolve))
    running = await start(); headers = await localHeaders(running.base)
    const recovered = await (await fetch(`${running.base}/api/review/feedback`, { headers })).json()
    assert.equal(recovered[0].deliveries[0].status, 'unknown')
    assert.equal((await post({ ...input, requestId: 'dddddddd-1234-4234-8234-123456789abc' })).status, 409)
    assert.equal(sends, 2)
  } finally { await new Promise((resolve) => running.server.close(resolve)) }
})

test('opening review starts a keyless local session; feedback retries and survives restart', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'closet-review-test-'))
  const metadata = { scenarios: [{ id: 'intake.pack.color' }], ...snapshot }
  metadata.coverage = { contractVersion: 1, targets: [{ id: 'screen.test', title: 'Test gap', kind: 'screen', scenarios: [], acceptance: ['Cancel retains draft.'], preview: 'missing', missingEdges: [], verification: 'unverified', reason: 'Missing preview.' }], limits: [] }
  let captures = 0
  const start = async () => {
    const middleware = await reviewMiddleware({ dataDir, metadata, adapter: adapter(), coverage, capture: async () => { captures++; return Buffer.from('synthetic-png') } })
    const server = createServer((req, res) => middleware(req, res, () => { res.writeHead(200); res.end('Local review entry') }))
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    return { server, base: `http://127.0.0.1:${server.address().port}` }
  }
  let running = await start()
  let headers = await localHeaders(running.base)
  const context = { scenario: 'intake.pack.color', screen: 'intake.pack.color', persona: 'single', role: 'owner', condition: 'normal', theme: 'light', textScale: 1, viewport: { width: 393, height: 852 }, state: { dialogs: ['Add clothes'], tabs: [], fields: [{ label: 'Name', value: 'Synthetic tee' }] } }
  const note = { requestId: '12345678-1234-4234-8234-123456789abc', message: 'The color choice needs a clearer label.', kind: 'confusing', context, anchor: { label: 'Color', x: 0.2, y: 0.3, width: 0.1, height: 0.1 }, html: '<html><body>Synthetic only</body></html>', snapshot }
  try {
    assert.equal((await fetch(`${running.base}/api/review/feedback`)).status, 401)
    assert.equal((await fetch(`${running.base}/api/review/coverage`)).status, 401)
    // Browsers on loopback need no key; CIVIC's own tools (civic recapture, civic repro) read this one.
    assert.ok((await readdir(dataDir)).includes('access-key'))
    const foreignHost = await new Promise((resolve, reject) => {
      const req = request(`${running.base}/api/review/index`, { headers: { ...headers, host: 'untrusted.example' } }, (res) => { res.resume(); resolve(res.statusCode) })
      req.on('error', reject); req.end()
    })
    assert.equal(foreignHost, 403)
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
    assert.equal((await fetch(`${running.base}/api/review/feedback`, { headers })).status, 401)
    headers = await localHeaders(running.base)
    const list = await (await fetch(`${running.base}/api/review/feedback`, { headers })).json()
    assert.equal(list.length, 2)
    assert.equal(list[0].status, 'resolved')
    assert.equal(list[0].context.scenario, context.scenario)
    assert.equal(list[0].sourceStale, true)
    assert.ok(!JSON.stringify(list).includes(headers.cookie.split('=')[1]))
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
  const headers = await localHeaders(base)
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
  const server = createServer((req, res) => middleware(req, res, () => { res.writeHead(200); res.end() }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const headers = await localHeaders(base)
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
    try {
      const restartedBase = `http://127.0.0.1:${restartedServer.address().port}`
      assert.equal(await (await fetch(`${restartedBase}/api/review/fixture.png?screen=fabric`, { headers: await localHeaders(restartedBase) })).text(), 'real-fixture')
    }
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

test('a finished replay is kept as CIVIC run evidence, with its tape by content hash', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'rehearsal-replays-'))
  const project = { key: 'example-checkout', personas: [{ id: 'reviewer' }], roles: [{ id: 'author' }], conditions: [{ id: 'normal' }] }
  const metadata = { scenarios: [{ id: 'note.edit' }], ...snapshot, project }
  const middleware = await reviewMiddleware({ dataDir, metadata, capture: async () => Buffer.from(''), adapter: adapter() })
  const server = createServer((req, res) => middleware(req, res, () => { res.writeHead(200); res.end() }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const headers = await localHeaders(base)
  const post = (data) => fetch(`${base}/api/review/replays`, { method: 'POST', headers, body: JSON.stringify(data) })
  const tape = { version: 1, project: project.key, source: snapshot.revision.source, now: 1, initialRoute: '/', seed: { context: { scenario: 'note.edit', persona: 'reviewer', role: 'author', condition: 'normal', theme: 'light', textScale: 1, width: 393 } }, steps: [{ gesture: { kind: 'click', target: { tag: 'button', name: 'Save', index: 0, count: 1 } }, route: '/', view: 'Saved', fields: [], operations: [] }] }
  try {
    const passed = await post({ tape, outcome: 'pass', verified: 1 })
    assert.equal(passed.status, 201)
    const { replay } = await passed.json()
    assert.deepEqual({ ...replay, replayedAt: undefined }, { schema: 'civic.replay/0', project: project.key, scenario: 'note.edit', head: snapshot.revision.head, source: snapshot.revision.source, tape: replay.tape, steps: 1, outcome: 'pass', replayedAt: undefined })
    assert.equal(await readFile(join(dataDir, 'replays', 'tapes', `${replay.tape}.json`), 'utf8'), JSON.stringify(tape))
    assert.equal((await post({ tape, outcome: 'fail', divergedAt: 1, message: 'Replay diverged at step 1.' })).status, 201)
    // A pass that skipped steps, a failure with no step, and a tape from another source are refused.
    assert.equal((await post({ tape, outcome: 'pass', verified: 0 })).status, 400)
    assert.equal((await post({ tape, outcome: 'fail' })).status, 400)
    assert.equal((await post({ tape: { ...tape, source: '9'.repeat(64) }, outcome: 'pass', verified: 1 })).status, 400)
    const listed = await (await fetch(`${base}/api/review/replays`, { headers })).json()
    assert.deepEqual(listed.map((item) => [item.outcome, item.divergedAt]).sort(), [['fail', 1], ['pass', undefined]])
    // The story portal's replay player reads a replayed tape by its hash, byte for byte; other hashes are refused.
    const served = await fetch(`${base}/api/review/replays/tapes/${replay.tape}`, { headers })
    assert.equal(served.status, 200)
    assert.equal(await served.text(), JSON.stringify(tape))
    assert.equal((await fetch(`${base}/api/review/replays/tapes/${'0'.repeat(64)}`, { headers })).status, 404)
  } finally { await new Promise((resolve) => server.close(resolve)) }
})
