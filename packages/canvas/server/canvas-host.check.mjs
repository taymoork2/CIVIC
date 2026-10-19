import assert from 'node:assert/strict'
import { cp, mkdtemp, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { canvasRoot } from './canvas-root.mjs'
import { canvasPlugins, startCanvas } from './canvas-host.mjs'
import { moduleReviewAdapter } from './module-adapter.mjs'

const notebook = join(canvasRoot, 'examples/notebook')

test('the canvas imports only React, the CIVIC shell, its virtual modules and itself', async () => {
  for (const file of await readdir(join(canvasRoot, 'src'))) {
    if (!/\.(?:tsx?|mjs)$/.test(file) || /\.test\./.test(file)) continue
    const code = await readFile(join(canvasRoot, 'src', file), 'utf8')
    for (const [, a, b, c] of code.matchAll(/^(?:import|export)\s[^'"\n]*from\s*["']([^"']+)["']|^import\s+["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']/gm)) {
      const specifier = a ?? b ?? c
      if (specifier) assert.match(specifier, /^(?:react(?:-dom\/client)?|@civic\/shell\/[a-z-/.]+|virtual:civic-[a-z-]+|\.\/[a-z-]+(?:\.mjs|\.css|\.json)?)$/, `${file} imports ${specifier}`)
    }
  }
})

test('the standalone canvas opens a module app with no host workspace and draws its journey', async (t) => {
  const store = await realpath(await mkdtemp(join(tmpdir(), 'civic-canvas-')))
  const server = await startCanvas({ project: join(notebook, 'civic.project.json'), store, port: 0, logLevel: 'silent' })
  t.after(() => server.close())
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  const page = await fetch(origin + '/review')
  assert.equal(page.status, 200)
  const html = await page.text()
  assert.match(html, new RegExp(`src="/@fs${canvasRoot}/src/main\\.tsx"`))
  const headers = { cookie: page.headers.get('set-cookie').split(';')[0] }
  const index = await (await fetch(origin + '/api/review/index', { headers })).json()
  assert.equal(index.project.name, 'Notebook')
  assert.equal(index.connection.applicationRoot, notebook)
  assert.deepEqual(index.scenarios.map((row) => row.id), ['demo.home', 'demo.edit', 'demo.saved', 'demo.review'])
  // The store lives in the chosen folder, never in the app.
  assert.ok((await readdir(join(store, '.review-data'))).includes('projects'))
  assert.deepEqual((await readdir(notebook)).sort(), ['civic.coverage.json', 'civic.project.json', 'civic.scenarios.json', 'src'])
  const canvas = await fetch(`${origin}/@fs${canvasRoot}/src/app-canvas.tsx`, { headers })
  assert.equal(canvas.status, 200)
  assert.doesNotMatch((await canvas.text()).replaceAll(join(canvasRoot, '../..'), '<repo>'), /towel|laundry/i)
  assert.equal((await fetch(`${origin}/@fs${canvasRoot}/src/extension.ts`, { headers })).status, 200)

  let browser
  try { browser = await moduleReviewAdapter.launchFixtureBrowser() } catch { return t.skip('No browser for Playwright') }
  t.after(() => browser.close())
  const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  tab.on('pageerror', (error) => errors.push(error.message))
  await tab.goto(origin + '/review')
  await tab.locator('.app-nav-section button', { hasText: 'Write a note' }).click()
  await tab.getByRole('region', { name: 'Write a note flow' }).waitFor({ timeout: 20000 })
  assert.equal(await tab.title(), 'Notebook · CIVIC')
  await tab.locator('.app-screen > button', { hasText: 'Notebook home' }).click()
  await tab.getByRole('button', { name: 'Play this screen' }).click()
  const frame = tab.frameLocator('iframe[title="Live Notebook home"]')
  await frame.locator('[data-rehearsal-ready="true"]').waitFor({ state: 'attached', timeout: 20000 })
  assert.deepEqual(errors, [])
})

test('an app calling its own HTTP API runs live against an isolated copy of that API, then records and replays', async (t) => {
  const store = await realpath(await mkdtemp(join(tmpdir(), 'civic-canvas-')))
  const tasks = join(canvasRoot, 'examples/tasks')
  const server = await startCanvas({ project: join(tasks, 'civic.project.json'), store, port: 0, logLevel: 'silent' })
  t.after(() => server.close())
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  let browser
  try { browser = await moduleReviewAdapter.launchFixtureBrowser() } catch { return t.skip('No browser for Playwright') }
  t.after(() => browser.close())
  const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = [], api = []
  tab.on('pageerror', (error) => errors.push(error.message))
  tab.on('request', (request) => { if (/\/api\/tasks/.test(request.url())) api.push(request.url()) })
  await tab.goto(origin + '/review')
  await tab.locator('.app-nav-section button', { hasText: 'Plan tasks' }).click()
  await tab.locator('.app-screen > button', { hasText: 'Task list' }).click()
  await tab.getByRole('button', { name: 'Play this screen' }).click()
  const frame = tab.frameLocator('iframe[title="Live Task list"]')
  await frame.getByText('Water the plants').waitFor({ timeout: 20000 })
  await frame.locator('[data-rehearsal-ready="true"]').waitFor({ state: 'attached' })
  // Two navigations in one task, before the frame publishes the first: each is checked from the screen it left.
  const rapid = await tab.locator('iframe[title="Live Task list"]').evaluate((element) => {
    const win = element.contentWindow, doc = element.contentDocument, seen = []
    const note = (event) => seen.push([event.detail.from, event.detail.to, event.detail.action])
    win.addEventListener('rehearsal-transition', note)
    const button = (name) => [...doc.querySelectorAll('button')].find((candidate) => candidate.textContent === name)
    button('Add task').click(); button('Cancel').click()
    win.removeEventListener('rehearsal-transition', note)
    return seen
  })
  assert.deepEqual(rapid, [['tasks.list', 'tasks.add', 'Add task'], ['tasks.add', 'tasks.list', 'Cancel']])
  await frame.getByRole('button', { name: 'Add task' }).click()
  await frame.getByLabel('Title').fill('Call the plumber')
  await frame.getByRole('button', { name: 'Save' }).click()
  await frame.getByText('Call the plumber').waitFor()
  assert.deepEqual(api, [], 'the app\'s API calls never leave the page')
  const tape = await tab.locator('iframe[title="Live Task list"]').evaluate((element) => element.contentWindow.reviewPreview.recording())
  const writes = tape.steps.flatMap((step) => step.operations)
  assert.deepEqual(writes.map((operation) => [operation.name, operation.result.status]), [['POST:/api/tasks', 201]])
  const replayed = await tab.locator('iframe[title="Live Task list"]').evaluate((element, recording) => element.contentWindow.reviewPreview.replay(recording), tape)
  assert.equal(replayed.verified, tape.steps.length)
  assert.deepEqual(await frame.locator('li').allTextContents(), [' Water the plants', ' Book the dentist', ' Call the plumber'])
  // Snapshots render each screen from its own isolated run.
  const cookie = (await tab.context().cookies()).map((row) => `${row.name}=${row.value}`).join('; ')
  const snapshots = await (await fetch(origin + '/api/review/snapshots', { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json', 'x-rehearsal-project': (await (await fetch(origin + '/api/review/index', { headers: { cookie } })).json()).project.key }, body: '{}' })).json()
  assert.deepEqual(snapshots.errors, [])
  assert.equal(snapshots.count, 2)
  assert.deepEqual(errors, [])
})

test('an app on a function backend runs live against an isolated run of its functions, with its own canvas extension, then records and replays', async (t) => {
  const store = await realpath(await mkdtemp(join(tmpdir(), 'civic-canvas-')))
  const server = await startCanvas({ project: join(canvasRoot, 'examples/pantry/civic.project.json'), store, port: 0, logLevel: 'silent' })
  t.after(() => server.close())
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  let browser
  try { browser = await moduleReviewAdapter.launchFixtureBrowser() } catch { return t.skip('No browser for Playwright') }
  t.after(() => browser.close())
  const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  tab.on('pageerror', (error) => errors.push(error.stack))
  await tab.goto(origin + '/review')
  // The app's extension files each flow under the manifest's navigation, and draws the shopping flow first.
  await tab.locator('.app-nav-section').first().waitFor()
  const sections = await tab.locator('.app-nav-section').evaluateAll((rows) => rows.map((row) => [row.querySelector('h3').textContent, [...row.querySelectorAll(':scope > ol > li > button > span')].map((label) => label.textContent)]))
  assert.deepEqual(sections, [['Pantry', ['Keep the pantry']], ['Shopping', ['Plan shopping']]])
  const flows = await tab.locator('.app-flow h2').allTextContents()
  assert.deepEqual(flows, ['Plan shopping', 'Keep the pantry'])
  await tab.locator('.app-nav-section button', { hasText: 'Keep the pantry' }).click()
  await tab.locator('.app-screen > button', { hasText: 'Shelf' }).click()
  await tab.getByRole('button', { name: 'Play this screen' }).click()
  const frame = tab.frameLocator('iframe[title="Live Shelf"]')
  await frame.getByText('Rice × 2').waitFor({ timeout: 20000 })
  await frame.locator('[data-rehearsal-ready="true"]').waitFor({ state: 'attached' })
  await frame.getByRole('button', { name: 'Use Olive oil' }).click()
  await frame.getByRole('button', { name: 'Use Olive oil' }).waitFor({ state: 'detached' })
  await frame.getByRole('button', { name: 'Add item' }).click()
  await frame.getByLabel('Item').fill('Flour')
  await frame.getByLabel('Quantity').fill('2')
  await frame.getByRole('button', { name: 'Save' }).click()
  await frame.getByText('Flour × 2').waitFor()
  await frame.getByRole('button', { name: 'Shopping list' }).click()
  await frame.getByText('Olive oil').waitFor()
  const live = tab.locator('iframe[title="Live Shelf"]')
  const tape = await live.evaluate((element) => element.contentWindow.reviewPreview.recording())
  const writes = tape.steps.flatMap((step) => step.operations)
  assert.deepEqual(writes.map((operation) => [operation.name, operation.result.name, operation.result.quantity]), [['items:use', 'Olive oil', 0], ['items:add', 'Flour', 2]])
  const replayed = await live.evaluate((element, recording) => element.contentWindow.reviewPreview.replay(recording), tape)
  assert.equal(replayed.verified, tape.steps.length)
  assert.deepEqual(await frame.locator('li').allTextContents(), ['Olive oil', 'Lentils'])
  const cookie = (await tab.context().cookies()).map((row) => `${row.name}=${row.value}`).join('; ')
  const snapshots = await (await fetch(origin + '/api/review/snapshots', { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json', 'x-rehearsal-project': (await (await fetch(origin + '/api/review/index', { headers: { cookie } })).json()).project.key }, body: '{}' })).json()
  assert.deepEqual(snapshots.errors, [])
  assert.equal(snapshots.count, 3)
  assert.deepEqual(errors, [])
})

test('a connector\'s canvas extension drives a guided run: one frame plays the flow and the canvas follows it', async (t) => {
  const store = await realpath(await mkdtemp(join(tmpdir(), 'civic-canvas-')))
  // The Pantry app under a connector's adapter kind, whose extension (a check fixture) supplies the guided run.
  const app = join(store, 'pantry')
  await cp(join(canvasRoot, 'examples/pantry'), app, { recursive: true })
  const manifest = JSON.parse(await readFile(join(app, 'civic.project.json'), 'utf8'))
  delete manifest.adapter.extension
  await writeFile(join(app, 'civic.project.json'), JSON.stringify({ ...manifest, adapter: { ...manifest.adapter, kind: 'guided-pantry' } }))
  const saved = process.env.CIVIC_PROJECT
  process.env.CIVIC_PROJECT = join(app, 'civic.project.json')
  t.after(() => { if (saved === undefined) delete process.env.CIVIC_PROJECT; else process.env.CIVIC_PROJECT = saved })
  const { createServer } = await import('vite')
  const connector = { canvasExtension: () => join(canvasRoot, 'src/check-fixtures/guided-extension.tsx') }
  const server = await createServer({ configFile: false, root: canvasRoot, cacheDir: join(store, '.vite'), logLevel: 'silent', server: { host: '127.0.0.1', port: 0 }, plugins: canvasPlugins({ store, connectors: { 'guided-pantry': connector } }) })
  await server.listen()
  t.after(() => server.close())
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  let browser
  try { browser = await moduleReviewAdapter.launchFixtureBrowser() } catch { return t.skip('No browser for Playwright') }
  t.after(() => browser.close())
  const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  tab.on('pageerror', (error) => errors.push(error.message))
  await tab.goto(origin + '/review')
  const flow = tab.locator('section.app-flow', { has: tab.locator('h2', { hasText: 'Keep the pantry' }) })
  await tab.locator('.app-nav-section button', { hasText: 'Keep the pantry' }).click()
  await flow.locator('header p', { hasText: 'Shelf and adding, played continuously' }).waitFor({ timeout: 20000 })
  await flow.getByRole('button', { name: 'Play pantry run' }).click()
  const live = tab.frameLocator('iframe[title="Live pantry run"]')
  await live.getByText('Rice × 2').waitFor({ timeout: 20000 })
  await live.locator('[data-rehearsal-ready="true"]').waitFor({ state: 'attached' })
  await live.getByRole('button', { name: 'Add item' }).click()
  await tab.locator('article[aria-label="Live pantry run"] strong', { hasText: 'Add an item' }).waitFor()
  await live.getByLabel('Item').fill('Flour')
  await live.getByRole('button', { name: 'Save' }).click()
  await live.getByText('Flour × 1').waitFor()
  await tab.locator('article[aria-label="Live pantry run"] strong', { hasText: 'Shelf' }).waitFor()
  await tab.getByText('2 captured visits').waitFor()
  const identity = await tab.locator('iframe[title="Live pantry run"]').elementHandle()
  await tab.getByRole('button', { name: 'Hand tool', exact: true }).click()
  await live.getByRole('button', { name: 'Add item', exact: true }).press('Enter')
  await tab.locator('article[aria-label="Live pantry run"] strong', { hasText: 'Add an item' }).waitFor()
  assert.equal(await tab.locator('.app-screen-outline button[aria-current="page"]').textContent().then(value => value.includes('Shelf')), true, 'Panning stops the canvas following the live run')
  assert.equal(await tab.locator('iframe[title="Live pantry run"]').evaluate((element, previous) => element === previous, identity), true)
  assert.deepEqual(errors, [])
})

test('workspace panes preserve the live draft and block replacement until failed captures are saved', { timeout: 90000 }, async t => {
  const store = await realpath(await mkdtemp(join(tmpdir(), 'civic-workspace-session-')))
  const server = await startCanvas({ project: join(notebook, 'civic.project.json'), store, port: 0, logLevel: 'silent' })
  t.after(() => server.close())
  const browser = await moduleReviewAdapter.launchFixtureBrowser()
  t.after(() => browser.close())
  const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  let captures = 0
  await tab.route('**/api/review/capture', async route => {
    captures++
    if (captures === 1) return route.fulfill({ status: 503, json: { error: 'Fixture capture unavailable' } })
    await route.continue()
  })
  await tab.goto(`http://127.0.0.1:${server.httpServer.address().port}/review`)
  await tab.locator('.app-screen > button', { hasText: 'Notebook home' }).click()
  await tab.getByRole('button', { name: 'Play this screen', exact: true }).click()
  const live = tab.locator('iframe[title="Live Notebook home"]'), frame = tab.frameLocator('iframe[title="Live Notebook home"]')
  await frame.locator('[data-rehearsal-ready="true"]').waitFor({ state: 'attached' })
  await frame.getByRole('button', { name: 'New note', exact: true }).click()
  await frame.getByLabel('Title', { exact: true }).fill('Keep the workspace draft')
  const identity = await live.elementHandle()
  const inspect = async () => { await tab.getByRole('button', { name: 'Open details', exact: true }).click(); await tab.getByRole('menuitem', { name: 'Inspect', exact: true }).click() }
  await inspect()
  await tab.locator('summary', { hasText: 'Run history (1)' }).click()
  await tab.getByText('Fixture capture unavailable', { exact: true }).waitFor()
  await tab.locator('.app-screen-outline button', { hasText: 'Saved note' }).click()
  await tab.getByRole('button', { name: 'Play this screen', exact: true }).click()
  assert.equal(await tab.getByRole('button', { name: 'Open selected screen', exact: true }).isDisabled(), true)
  await tab.getByRole('button', { name: 'Retry capture', exact: true }).click()
  await tab.getByRole('link', { name: 'Frozen screen', exact: true }).waitFor()
  await tab.waitForFunction(() => ![...document.querySelectorAll('button')].find(button => button.textContent === 'Open selected screen')?.disabled)
  await tab.getByRole('button', { name: 'Keep current preview', exact: true }).click()
  assert.equal(await live.evaluate(element => element.contentWindow.reviewPreview.state().dirty), true, 'Runtime observation retains the adapter’s unsaved draft status')
  await tab.getByRole('button', { name: 'Replay from start', exact: true }).click()
  await tab.getByRole('alert').filter({ hasText: 'unsaved draft' }).waitFor()
  for (let index = 0; index < 2; index++) { await tab.getByRole('button', { name: 'Close panel', exact: true }).click(); await inspect() }
  assert.equal(await live.evaluate((element, previous) => element === previous, identity), true)
  assert.equal(await frame.getByLabel('Title', { exact: true }).inputValue(), 'Keep the workspace draft')
  await tab.locator('.app-screen-outline button', { hasText: 'Compose note' }).click()
  await frame.getByRole('button', { name: 'Cancel', exact: true }).click()
  await frame.getByRole('button', { name: 'New note', exact: true }).waitFor()
  await tab.getByText('2 captured visits', { exact: false }).waitFor()
  await tab.waitForFunction(() => document.querySelectorAll('.rh-inspect-content a').length >= 2)
  assert.equal(captures, 3, 'Pane toggles do not duplicate frame transition subscriptions')
  await tab.getByRole('button', { name: 'Search this project', exact: true }).click()
  await tab.getByRole('dialog', { name: 'Search Notebook', exact: true }).getByRole('combobox').press('Escape')
  await tab.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Search this project')
})

test('a TanStack Start app\'s server functions run live against an isolated run, and server-only modules never reach the page', async (t) => {
  const store = await realpath(await mkdtemp(join(tmpdir(), 'civic-canvas-')))
  const books = join(canvasRoot, 'examples/reading-list')
  const server = await startCanvas({ project: join(books, 'civic.project.json'), store, port: 0, logLevel: 'silent' })
  t.after(() => server.close())
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  let browser
  try { browser = await moduleReviewAdapter.launchFixtureBrowser() } catch { return t.skip('No browser for Playwright') }
  t.after(() => browser.close())
  const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = [], modules = []
  tab.on('pageerror', (error) => errors.push(error.message))
  tab.on('request', (request) => modules.push(new URL(request.url()).pathname))
  await tab.goto(origin + '/review')
  await tab.locator('.app-nav-section button', { hasText: 'Keep a reading list' }).click()
  await tab.locator('.app-screen > button', { hasText: 'Reading list' }).click()
  await tab.getByRole('button', { name: 'Play this screen' }).click()
  const frame = tab.frameLocator('iframe[title="Live Reading list"]')
  await frame.getByText('Piranesi').waitFor({ timeout: 20000 })
  await frame.locator('[data-rehearsal-ready="true"]').waitFor({ state: 'attached' })
  await frame.getByRole('button', { name: 'Add book' }).click()
  await frame.getByLabel('Title').fill('Middlemarch')
  await frame.getByLabel('Author').fill('George Eliot')
  await frame.getByRole('button', { name: 'Save' }).click()
  await frame.getByText('Middlemarch').waitFor()
  assert.match(await frame.locator('li').last().textContent(), /by George Eliot, added 20\d\d-\d\d-\d\d/, 'the added date arrives as a Date')
  assert.ok(modules.some((path) => path.endsWith('/src/books.functions.ts')))
  assert.deepEqual(modules.filter((path) => /\/server\/(?:library|civic-runtime)/.test(path)), [], 'server-only modules stay in the run')
  const tape = await tab.locator('iframe[title="Live Reading list"]').evaluate((element) => element.contentWindow.reviewPreview.recording())
  const writes = tape.steps.flatMap((step) => step.operations)
  assert.deepEqual(writes.map((operation) => [operation.name, operation.result.value.title]), [['serverFn:src/books.functions.ts:addBook', 'Middlemarch']])
  const replayed = await tab.locator('iframe[title="Live Reading list"]').evaluate((element, recording) => element.contentWindow.reviewPreview.replay(recording), tape)
  assert.equal(replayed.verified, tape.steps.length)
  assert.equal(await frame.locator('li').count(), 3)
  const cookie = (await tab.context().cookies()).map((row) => `${row.name}=${row.value}`).join('; ')
  const snapshots = await (await fetch(origin + '/api/review/snapshots', { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json', 'x-rehearsal-project': (await (await fetch(origin + '/api/review/index', { headers: { cookie } })).json()).project.key }, body: '{}' })).json()
  assert.deepEqual(snapshots.errors, [])
  assert.equal(snapshots.count, 2)
  assert.deepEqual(errors, [])
})

test('an app with sign-in runs live as its persona\'s synthetic identity, signs out and back in with the run\'s credential, and replays', async (t) => {
  const store = await realpath(await mkdtemp(join(tmpdir(), 'civic-canvas-')))
  const server = await startCanvas({ project: join(canvasRoot, 'examples/team-board/civic.project.json'), store, port: 0, logLevel: 'silent' })
  t.after(() => server.close())
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  let browser
  try { browser = await moduleReviewAdapter.launchFixtureBrowser() } catch { return t.skip('No browser for Playwright') }
  t.after(() => browser.close())
  const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = [], api = []
  tab.on('pageerror', (error) => errors.push(error.message))
  tab.on('request', (request) => { if (/\/api\/(?:session|me|posts)/.test(request.url())) api.push(request.url()) })
  await tab.goto(origin + '/review')
  await tab.locator('.app-nav-section button', { hasText: 'Use the board' }).click()
  await tab.locator('.app-screen > button', { hasText: 'Team board' }).click()
  await tab.getByRole('button', { name: 'Play this screen' }).click()
  const live = tab.locator('iframe[title="Live Team board"]'), frame = tab.frameLocator('iframe[title="Live Team board"]')
  await frame.getByText('Signed in as Alex Rivera').waitFor({ timeout: 20000 })
  await frame.locator('[data-rehearsal-ready="true"]').waitFor({ state: 'attached' })
  await frame.getByText('Alex Rivera: Standup moves to 10:00').waitFor()
  await frame.getByRole('button', { name: 'Sign out' }).click()
  await frame.getByRole('heading', { name: 'Sign in' }).waitFor()
  assert.match(await frame.getByLabel('Password').inputValue(), /^review-/, 'the run\'s credential is filled in, as a password manager would')
  await frame.getByLabel('Email').fill('alex@team.example')
  await frame.getByRole('button', { name: 'Sign in' }).click()
  await frame.getByRole('heading', { name: 'Team board' }).waitFor()
  await frame.getByLabel('Message').fill('Lunch at noon')
  await frame.getByRole('button', { name: 'Post' }).click()
  await frame.getByText('Alex Rivera: Lunch at noon').waitFor()
  assert.deepEqual(api, [], 'sign-in and the app\'s API calls never leave the page')
  const tape = await live.evaluate((element) => element.contentWindow.reviewPreview.recording())
  const writes = tape.steps.flatMap((step) => step.operations)
  assert.deepEqual(writes.map((operation) => [operation.name, operation.result.status]), [['DELETE:/api/session', 204], ['POST:/api/session', 200], ['POST:/api/posts', 201]])
  assert.equal(JSON.parse(writes[1].args.body).password, '[review credential]', 'recordings hold a placeholder, never the credential')
  assert.ok(!JSON.stringify(tape).includes('review-'), 'no credential anywhere in the recording')
  const replayed = await live.evaluate((element, recording) => element.contentWindow.reviewPreview.replay(recording), tape)
  assert.equal(replayed.verified, tape.steps.length)
  assert.deepEqual(await frame.locator('li').allTextContents(), ['Alex Rivera: Standup moves to 10:00', 'Alex Rivera: Release notes are in the shared folder', 'Alex Rivera: Lunch at noon'])
  // A signed-out run opens the board on sign in.
  const signedOut = new URL(await live.getAttribute('src'), origin)
  signedOut.searchParams.set('condition', 'signed-out')
  const other = await browser.newPage()
  other.on('pageerror', (error) => errors.push(error.message))
  await other.goto(signedOut.href)
  await other.getByRole('heading', { name: 'Sign in' }).waitFor({ timeout: 20000 })
  // Snapshots render each screen from its own run: the board signed in, sign in signed out.
  const cookie = (await tab.context().cookies()).map((row) => `${row.name}=${row.value}`).join('; ')
  const key = (await (await fetch(origin + '/api/review/index', { headers: { cookie } })).json()).project.key
  const snapshots = await (await fetch(origin + '/api/review/snapshots', { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json', 'x-rehearsal-project': key }, body: '{}' })).json()
  assert.deepEqual(snapshots.errors, [])
  assert.equal(snapshots.count, 2)
  assert.deepEqual(errors, [])
})

test('a live run switches account, goes offline and back, and changes viewport on one tape that replays and reopens', async (t) => {
  const store = await realpath(await mkdtemp(join(tmpdir(), 'civic-canvas-')))
  const server = await startCanvas({ project: join(canvasRoot, 'examples/team-board/civic.project.json'), store, port: 0, logLevel: 'silent' })
  t.after(() => server.close())
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  let browser
  try { browser = await moduleReviewAdapter.launchFixtureBrowser() } catch { return t.skip('No browser for Playwright') }
  t.after(() => browser.close())
  const tab = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  const errors = []
  tab.on('pageerror', (error) => errors.push(error.message))
  await tab.goto(origin + '/review')
  await tab.locator('.app-nav-section button', { hasText: 'Use the board' }).click()
  await tab.locator('.app-screen > button', { hasText: 'Team board' }).click()
  await tab.getByRole('button', { name: 'Play this screen' }).click()
  const live = tab.locator('iframe[title="Live Team board"]'), frame = tab.frameLocator('iframe[title="Live Team board"]')
  await frame.getByText('Signed in as Alex Rivera').waitFor({ timeout: 20000 })
  await frame.locator('[data-rehearsal-ready="true"]').waitFor({ state: 'attached' })
  await tab.getByRole('button', { name: 'Open details', exact: true }).click()
  await tab.getByRole('menuitem', { name: 'Inspect', exact: true }).click()
  const run = tab.getByRole('region', { name: 'Isolated run' })
  // Input is held while the account changes, as it is for a person; act once the app is ready again.
  const ready = () => tab.waitForFunction(() => { const doc = document.querySelector('iframe[title="Live Team board"]')?.contentDocument; return Boolean(doc?.body) && !doc.body.inert && doc.getElementById('review-root')?.dataset.rehearsalReady === 'true' })
  await run.getByLabel('Synthetic account').selectOption('newcomer')
  await frame.getByText('Signed in as Sam Lee').waitFor()
  await ready()
  await frame.getByLabel('Message').fill('From Sam')
  await frame.getByRole('button', { name: 'Post' }).click()
  await frame.getByText('Sam Lee: From Sam').waitFor()

  await run.getByRole('button', { name: 'Disconnect app' }).click()
  await run.getByRole('button', { name: 'Reconnect app' }).waitFor()
  assert.equal(await live.evaluate((element) => element.contentWindow.navigator.onLine), false, 'the app sees itself offline')
  await frame.getByLabel('Message').fill('Written offline')
  await frame.getByRole('button', { name: 'Post' }).click()
  await frame.getByText('Your post wasn\'t sent').waitFor()
  const saved = run.getByRole('region', { name: 'Saved steps' })
  await saved.getByText('POST:/api/posts').waitFor()
  await run.getByLabel('Synthetic account').selectOption('lead')
  await ready()
  await saved.waitFor({ state: 'detached' })
  assert.equal(await saved.count(), 0, 'another account never sees this account\'s saved step')
  await run.getByLabel('Synthetic account').selectOption('newcomer')
  await ready()
  await saved.getByText('POST:/api/posts').waitFor()
  await run.getByRole('button', { name: 'Reconnect app' }).click()
  await run.getByRole('button', { name: 'Disconnect app' }).waitFor()
  await frame.getByText('Sam Lee: From Sam').waitFor()
  assert.equal(await frame.getByText('Sam Lee: Written offline').count(), 0, 'reconnecting resends nothing by itself')
  assert.equal(await saved.count(), 1, 'the saved step waits for a person')
  await saved.getByRole('button', { name: 'Resend saved step' }).click()
  await frame.getByText('Sam Lee: Written offline').waitFor()
  await tab.waitForFunction(() => !document.querySelector('[aria-label="Saved steps"]'))
  await frame.getByLabel('Message').fill('')

  const viewport = tab.getByRole('region', { name: 'Responsive preview' })
  await tab.getByRole('button', { name: /^Viewport ·/ }).click()
  await tab.getByLabel('Device', { exact: true }).selectOption('small-phone')
  await tab.getByRole('button', { name: /^Viewport ·/ }).click()
  // Rotate the device once it is shown, so the rotation isn't lost to the device change.
  await viewport.getByText('320 × 658 CSS pixels').waitFor()
  await viewport.getByRole('button', { name: 'Rotate viewport' }).click()
  await viewport.getByLabel('Preview appearance').selectOption('dark')
  await viewport.getByLabel('Preview text size').selectOption('2')
  await viewport.getByText('658 × 320 CSS pixels').waitFor()
  await tab.waitForFunction(() => document.querySelector('iframe[title="Live Team board"]').contentWindow.reviewPreview.config.textScale === 2)
  assert.deepEqual(await live.evaluate((element) => [element.style.width, element.style.height, element.contentDocument.documentElement.dataset.theme, element.contentDocument.documentElement.style.fontSize]), ['658px', '320px', 'dark', '200%'])
  assert.equal(await frame.getByLabel('Message').inputValue(), '', 'the app and its run stay as they were')
  await frame.getByText('Sam Lee: Written offline').waitFor()

  const tape = await live.evaluate((element) => element.contentWindow.reviewPreview.recording())
  const commands = tape.steps.filter((step) => step.gesture.kind === 'command').map((step) => [step.gesture.target.name, JSON.parse(step.gesture.value)])
  assert.deepEqual(commands.slice(0, 5), [['identity', 'newcomer'], ['connection', false], ['identity', 'lead'], ['identity', 'newcomer'], ['connection', true]])
  assert.equal(commands[5][0], 'applyPending')
  assert.deepEqual(commands.slice(6).map(([name, value]) => [name, value.width, value.height, value.theme, value.textScale]), [['viewport', 320, 658, 'light', 1], ['viewport', 658, 320, 'light', 1], ['viewport', 658, 320, 'dark', 1], ['viewport', 658, 320, 'dark', 2]])
  const writes = tape.steps.flatMap((step) => step.operations)
  assert.deepEqual(writes.map((operation) => [operation.name, operation.result?.status ?? operation.error, operation.actor]), [['POST:/api/posts', 201, 'newcomer'], ['POST:/api/posts', /interrupted/.test(writes[1].error) && writes[1].error, 'newcomer'], ['POST:/api/posts', 201, 'newcomer']], 'writes after the switch name the account; the offline attempt is kept as a refused write, and the resend as the effect')
  assert.ok(!JSON.stringify(tape).includes('"intent"'), 'write identities stay off the tape, so older tapes still match')
  assert.ok(!JSON.stringify(tape).includes('review-'), 'no credential anywhere in the recording')
  const replayed = await live.evaluate((element, recording) => element.contentWindow.reviewPreview.replay(recording), tape)
  assert.equal(replayed.verified, tape.steps.length)
  assert.deepEqual((await frame.locator('li').allTextContents()).slice(-2), ['Sam Lee: From Sam', 'Sam Lee: Written offline'])
  await frame.getByText('Signed in as Sam Lee').waitFor()
  assert.deepEqual(await live.evaluate((element) => [element.style.width, element.style.height]), ['658px', '320px'], 'replay restores the viewport changes')

  // Reopening loads the same run from its journal in a fresh page: same account, posts and viewport.
  const before = await live.evaluate((element) => element.contentWindow.reviewRuntime.status().run)
  await run.getByRole('button', { name: 'Reopen app' }).click()
  await frame.getByText('Signed in as Sam Lee').waitFor({ timeout: 20000 })
  await ready()
  const reopened = new URL(await live.getAttribute('src'), origin)
  assert.equal(reopened.searchParams.get('runtimeRun'), before)
  assert.deepEqual(['width', 'height', 'theme', 'scale'].map((key) => reopened.searchParams.get(key)), ['658', '320', 'dark', '2'])
  assert.deepEqual((await frame.locator('li').allTextContents()).slice(-2), ['Sam Lee: From Sam', 'Sam Lee: Written offline'])

  // The run executes a post but its answer never reaches the page. Resending the saved step returns that answer and
  // posts nothing twice; posting the same words again on purpose is a second post.
  let dropped = 0
  await tab.route('**/api/review/runtime', async (route) => {
    const input = route.request().postDataJSON()
    if (input?.action === 'mutation' && input.args?.body?.includes('Answer lost') && dropped === 0) { dropped++; await route.fetch(); await route.abort('failed'); return }
    await route.continue()
  })
  await frame.getByLabel('Message').fill('Answer lost')
  await frame.getByRole('button', { name: 'Post' }).click()
  await frame.getByText('Your post wasn\'t sent').waitFor()
  assert.equal(dropped, 1)
  await saved.getByText('POST:/api/posts').waitFor()
  await run.getByLabel('Synthetic account').selectOption('lead')
  await ready()
  assert.equal(await saved.count(), 0, 'the saved step stays with the account that made it')
  await run.getByLabel('Synthetic account').selectOption('newcomer')
  await ready()
  await run.getByRole('button', { name: 'Reconnect app' }).click()
  await frame.getByText('Sam Lee: Answer lost').waitFor()
  assert.equal(await saved.count(), 1, 'reconnecting resends nothing by itself')
  await saved.getByRole('button', { name: 'Resend saved step' }).click()
  await tab.waitForFunction(() => !document.querySelector('[aria-label="Saved steps"]'))
  await frame.getByText('Signed in as Sam Lee').waitFor()
  assert.equal(await frame.getByText('Sam Lee: Answer lost').count(), 1, 'the resend returned the first answer; one post')
  for (let index = 0; index < 2; index++) {
    const count = await frame.locator('li').count()
    await frame.getByLabel('Message').fill('Same words')
    await frame.getByRole('button', { name: 'Post' }).click()
    await tab.waitForFunction((expected) => document.querySelector('iframe[title="Live Team board"]').contentDocument.querySelectorAll('li').length === expected, count + 1)
  }
  assert.equal(await frame.getByText('Sam Lee: Same words').count(), 2, 'two posts with the same words are two posts')
  await run.getByRole('button', { name: 'Reopen app' }).click()
  await frame.getByText('Signed in as Sam Lee').waitFor({ timeout: 20000 })
  await ready()
  assert.deepEqual((await frame.locator('li').allTextContents()).slice(-5), ['Sam Lee: From Sam', 'Sam Lee: Written offline', 'Sam Lee: Answer lost', 'Sam Lee: Same words', 'Sam Lee: Same words'], 'reopening keeps exactly these effects')
  assert.deepEqual(errors, [])
})
