import assert from 'node:assert/strict'
import { fork, spawn } from 'node:child_process'
import { once } from 'node:events'
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import nodePath from 'node:path'
import { test } from 'node:test'
import { Effect, Schedule } from 'effect'
import { WebSocket } from 'ws'
import { chromium } from '@playwright/test'
import { canvasRoot } from './canvas-root.mjs'
import { moduleReviewAdapter } from './module-adapter.mjs'
import { awakeTimeout } from './awake-clock.mjs'

const { join } = nodePath
const wait = (predicate, timeout = '20 seconds') => Effect.runPromise(awakeTimeout(Effect.tryPromise(predicate).pipe(Effect.repeat({ schedule: Schedule.spaced('50 millis'), until: Boolean })), timeout))
const hmrModule = value => `export const value = ${value}; window.civicHmrCheck = value; if (import.meta.hot) import.meta.hot.accept(next => { window.civicHmrCheck = next.value })`

for (const scenario of ['visibility', 'restart', 'hmr']) {
test(`managed viewer clients: ${scenario}`, { timeout: 120_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'civic-managed-clients-'))
  const project = join(root, 'pantry'), store = join(root, 'store')
  await cp(join(canvasRoot, 'examples/pantry'), project, { recursive: true })
  await mkdir(store)
  const entry = join(root, 'host.mjs')
  await writeFile(entry, `import { startManagedCanvas } from ${JSON.stringify(new URL('app-server-main.mjs', import.meta.url).href)};
await startManagedCanvas({ store: process.argv[2], project: { manifest: process.argv[3] }, build: 'clients-check', ready: owner => process.send(owner) });`)
  const child = fork(entry, [store, join(project, 'civic.project.json')], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
  const exited = once(child, 'exit')
  let browser, captureBrowser, desktop, chrome, chromeExited
  try {
    const [owner] = await Promise.race([once(child, 'message'), exited.then(() => { throw Error('Host exited before ready') })])
    const registration = join(store, '.review-data/service/registration.json')
    const originalRegistration = await readFile(registration, 'utf8')
    const clients = async () => {
      const response = await fetch(owner.endpoint + '/api/civic/health', { headers: { authorization: `Bearer ${owner.capability}` } })
      const health = await response.json()
      return health.clients
    }
    desktop = new WebSocket(owner.endpoint.replace('http:', 'ws:') + '/api/civic/control', ['civic-control'], { headers: { authorization: `Bearer ${owner.capability}` } })
    await once(desktop, 'open')
    if (scenario === 'visibility') {
      // New headless Chrome preserves real tab visibility; CDP must not apply Playwright's defaults.
      const profile = join(root, 'browser')
      chrome = spawn(process.env.CIVIC_BROWSER_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--no-startup-window', '--disable-backgrounding-occluded-windows'], { stdio: 'ignore' })
      chromeExited = once(chrome, 'exit')
      let debugPort
      await wait(async () => {
        try { const address = await readFile(join(profile, 'DevToolsActivePort'), 'utf8'); debugPort = Number(address.split('\n')[0]); return Boolean(debugPort) }
        catch (error) { if (error.code === 'ENOENT') return false; throw error }
      })
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`, { noDefaults: true })
    } else browser = await moduleReviewAdapter.launchFixtureBrowser()
    const context = browser.contexts()[0] ?? await browser.newContext()
    const tab = await context.newPage()
    const controls = []
    let hmrConnected = false
    tab.on('websocket', socket => {
      socket.on('framereceived', ({ payload }) => {
        if (typeof payload === 'string' && JSON.parse(payload).type === 'connected') hmrConnected = true
      })
      socket.on('close', () => { if (!socket.url().endsWith('/api/civic/control')) hmrConnected = false })
    })
    tab.on('websocket', socket => { if (socket.url().endsWith('/api/civic/control')) controls.push(socket) })
    await tab.goto(owner.endpoint + '/review')
    await wait(async () => await clients() === 2)
    await wait(() => Promise.resolve(controls.length === 1))
    let controlClosed = false
    controls[0].on('close', () => { controlClosed = true })
    const indexResponse = await tab.request.get(owner.endpoint + '/api/review/index')
    const index = await indexResponse.json()
    const post = (path, data) => tab.request.post(owner.endpoint + path, { data, headers: { origin: owner.endpoint, 'x-rehearsal-project': index.project.key } })
    const started = await post('/api/review/runtime', { action: 'start', scenario: 'pantry.shelf', persona: 'stocked', role: 'cook', condition: 'normal' })
    assert.equal(started.status(), 200)
    const run = await started.json()
    const journal = join(store, '.review-data/projects', index.project.key, 'runtime', `${run.id}.json`)
    const originalRun = await readFile(journal, 'utf8')
    if (scenario === 'visibility') await t.test('hidden top-level tabs retain their hold; nested canvas, preview and capture frames acquire none', async () => {
    const hidden = await context.newPage()
    try {
    await hidden.bringToFront()
    await tab.waitForFunction(() => document.visibilityState === 'hidden', undefined, { polling: 100 })
    await Effect.runPromise(Effect.sleep('16 seconds'))
    assert.equal(await clients(), 2)
    assert.equal(controlClosed, false)
    await hidden.close()
    await tab.evaluate(() => { const frame = document.createElement('iframe'); frame.src = '/review'; document.body.append(frame) })
    await tab.evaluate(() => { const frame = document.createElement('iframe'); frame.src = '/review-frame.html?scenario=pantry.shelf'; frame.style.cssText = 'position:fixed;inset:0;z-index:9999'; document.body.append(frame) })
    captureBrowser = await moduleReviewAdapter.launchFixtureBrowser()
    const capture = await captureBrowser.newPage()
    await capture.goto(owner.endpoint + '/review-frame.html?scenario=pantry.shelf')
    await capture.locator('[data-rehearsal-ready="true"]').waitFor()
    await tab.frames()[1].waitForLoadState('networkidle')
    await tab.bringToFront()
    await tab.frameLocator('iframe').nth(1).locator('[data-rehearsal-ready="true"]').waitFor()
    assert.equal(await clients(), 2)
    } finally {
      await hidden.close()
      await captureBrowser?.close()
      captureBrowser = undefined
      await tab.evaluate(() => { for (const frame of document.querySelectorAll('iframe')) frame.remove() })
    }
    })
    if (scenario === 'restart') await t.test('adapter config restart retains host, registration, control connections and original run binding', async () => {
    const cookies = await context.cookies()
    const sessionName = `review_session_${new URL(owner.endpoint).port}`
    const initialSession = cookies.find(cookie => cookie.name === sessionName)?.value
    assert.ok(initialSession)
    await tab.evaluate(() => { window.civicBeforeRestart = true })
    const manifestPath = join(project, 'civic.project.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    await cp(join(project, manifest.adapter.entry), join(project, 'src/restarted-preview.js'))
    manifest.adapter.entry = 'src/restarted-preview.js'
    await writeFile(manifestPath, JSON.stringify(manifest))
    const selected = await post('/api/review/projects', { action: 'select', key: index.project.key })
    assert.equal(selected.status(), 200)
    const selection = await selected.json()
    assert.equal(selection.restarting, true)
    await wait(async () => {
      const page = await tab.request.get(owner.endpoint + '/review')
      assert.equal(page.status(), 200)
      const currentCookies = await context.cookies()
      if (currentCookies.find(cookie => cookie.name === sessionName)?.value === initialSession) return false
      const response = await tab.request.get(owner.endpoint + '/api/review/index')
      if (!response.ok()) return false
      const updated = await response.json()
      return updated.revision.source !== index.revision.source
    })
    assert.equal(child.exitCode, null)
    assert.equal(await readFile(registration, 'utf8'), originalRegistration)
    assert.equal(desktop.readyState, WebSocket.OPEN)
    // Vite reloads after its retiring HMR socket closes; HTTP readiness precedes that reload.
    await wait(() => tab.evaluate(() => window.civicBeforeRestart !== true).catch(error => {
      if (error.message.includes('Execution context was destroyed')) return false
      throw error
    }))
    await wait(async () => await clients() === 2, '10 seconds')
    const refused = await post('/api/review/runtime', { action: 'state', run: run.id })
    assert.equal(refused.status(), 409)
    assert.match(JSON.stringify(await refused.json()), /Source changed/u)
    assert.equal(await readFile(journal, 'utf8'), originalRun)
    const remaining = await clients()
    assert.equal(remaining, 2, JSON.stringify({ desktop: desktop.readyState, controlClosed, controls: controls.length, url: tab.url() }))
    })
    if (scenario === 'hmr') await t.test('canvas source hot-updates without dropping the control connection', async () => {
      const source = join(store, 'managed-hmr-check.js')
      await writeFile(source, hmrModule(1))
      await tab.evaluate(path => import(path), '/@fs' + source)
      // Module evaluation can finish before Vite's WebSocket handshake under load.
      await wait(() => Promise.resolve(hmrConnected))
      const connections = controls.length
      let disconnected = false
      controls.at(-1).on('close', () => { disconnected = true })
      await writeFile(source, hmrModule(2))
      await wait(() => tab.evaluate(() => window.civicHmrCheck === 2), '30 seconds')
      assert.equal(disconnected, false)
      assert.equal(controls.length, connections)
      assert.equal(await clients(), 2)
    })
  } finally {
    desktop?.terminate()
    await browser?.close()
    if (chrome && chrome.exitCode === null && chrome.signalCode === null) chrome.kill('SIGTERM')
    await chromeExited
    await captureBrowser?.close()
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    await exited
  }
})
}
