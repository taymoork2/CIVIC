import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { canvasRoot } from './canvas-root.mjs'
import { startCanvas } from './canvas-host.mjs'
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
  assert.doesNotMatch(await canvas.text(), /towel|laundry/i)
  assert.equal((await fetch(`${origin}/@fs${canvasRoot}/src/extension.ts`, { headers })).status, 200)

  let browser
  try { browser = await moduleReviewAdapter.launchFixtureBrowser() } catch { return t.skip('No browser for Playwright') }
  t.after(() => browser.close())
  const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  tab.on('pageerror', (error) => errors.push(error.message))
  await tab.goto(origin + '/review')
  await tab.getByRole('region', { name: 'Write a note flow' }).waitFor({ timeout: 20000 })
  assert.equal(await tab.title(), 'Notebook · CIVIC')
  await tab.locator('.app-nav-section button', { hasText: 'Write a note' }).click()
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
