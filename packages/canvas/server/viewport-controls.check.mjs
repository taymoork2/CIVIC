import assert from 'node:assert/strict'
import { cp, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { canvasRoot } from './canvas-root.mjs'
import { canvasPlugins, startCanvas } from './canvas-host.mjs'
import { createServer } from 'vite'
import { moduleReviewAdapter } from './module-adapter.mjs'

async function workspace(t, standalone = false, { prepare, template = 'notebook', capabilities } = {}) {
  const store = await realpath(await mkdtemp(join(tmpdir(), 'civic-viewport-')))
  let manifest = join(canvasRoot, 'examples', template, 'civic.project.json')
  if (standalone || prepare || capabilities) {
    const app = join(store, template)
    await cp(join(canvasRoot, 'examples', template), app, { recursive: true })
    manifest = join(app, 'civic.project.json')
    const config = JSON.parse(await readFile(manifest, 'utf8'))
    if (standalone || capabilities) config.adapter.kind = 'viewport-fixture'
    await writeFile(manifest, JSON.stringify(config))
    await prepare?.(app)
  }
  const custom = standalone || Boolean(capabilities)
  const server = custom ? await createServer({ configFile: false, root: canvasRoot, cacheDir: join(store, '.vite'), logLevel: 'silent', server: { host: '127.0.0.1', port: 0 }, plugins: canvasPlugins({ store, project: { manifest }, connectors: { 'viewport-fixture': { capabilities, ...(standalone ? { canvasExtension: () => join(canvasRoot, 'src/check-fixtures/viewport-controls.tsx') } : {}) } } }) }) : await startCanvas({ project: manifest, store, port: 0, logLevel: 'silent' })
  if (custom) await server.listen()
  t.after(() => server.close())
  const browser = await moduleReviewAdapter.launchFixtureBrowser()
  t.after(() => browser.close())
  const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  await tab.goto(origin + '/review' + (standalone ? '?standaloneViewport=1' : ''))
  // Initial Vite dependency optimization can replace the dev document.
  if (!prepare) await tab.waitForLoadState('networkidle')
  return { tab, origin }
}

async function draft(tab) {
  await tab.locator('.app-nav-section button', { hasText: 'Write a note' }).click()
  await tab.locator('.app-screen > button', { hasText: 'Notebook home' }).click()
  await tab.getByRole('button', { name: 'Play this screen' }).click()
  const live = tab.locator('iframe[title="Live Notebook home"]')
  const frame = tab.frameLocator('iframe[title="Live Notebook home"]')
  await frame.getByRole('button', { name: 'New note' }).click()
  await frame.getByLabel('Title', { exact: true }).fill('Keep this draft')
  return { live, frame }
}

async function size(tab, width, height) {
  await tab.getByRole('button', { name: /^Viewport ·/ }).click()
  await tab.getByLabel('Width (px)', { exact: true }).fill(String(width))
  await tab.getByLabel('Height (px)', { exact: true }).fill(String(height))
  await tab.getByRole('button', { name: 'Apply', exact: true }).click()
}

test('header, inspector and commands share the viewport without replacing the live draft', { timeout: 90000 }, async t => {
  const { tab, origin } = await workspace(t)
  const { live, frame } = await draft(tab)
  const identity = await live.elementHandle()
  await tab.getByRole('button', { name: 'Open details', exact: true }).click()
  await tab.getByRole('menuitem', { name: 'Inspect', exact: true }).click()
  await tab.getByLabel('Preview appearance', { exact: true }).waitFor()
  assert.equal(await tab.getByLabel('Preview device', { exact: true }).count(), 0, 'The workspace keeps device selection in the header')
  await size(tab, 640, 800)
  await tab.waitForFunction(() => document.querySelector('iframe[title="Live Notebook home"]').contentWindow.reviewPreview.config.width === 640)
  await tab.getByRole('button', { name: /^Viewport ·/ }).click()
  await tab.getByLabel('Preview appearance', { exact: true }).selectOption('dark')
  await tab.waitForFunction(() => document.querySelector('iframe[title="Live Notebook home"]').contentWindow.reviewPreview.config.theme === 'dark')
  const viewport = await live.evaluate(element => element.contentWindow.reviewPreview.config)
  assert.equal(viewport.width, 640)
  assert.equal(viewport.height, 800)
  await tab.getByLabel('Preview text size', { exact: true }).selectOption('2')
  await tab.getByRole('button', { name: 'Rotate viewport', exact: true }).click()
  await tab.waitForFunction(() => document.querySelector('iframe[title="Live Notebook home"]').contentWindow.reviewPreview.config.width === 800)
  await tab.getByRole('button', { name: 'Unfold viewport', exact: true }).click()
  await tab.waitForFunction(() => document.querySelector('iframe[title="Live Notebook home"]').contentWindow.reviewPreview.config.width === 1016)
  assert.equal((await live.evaluate(element => element.contentWindow.reviewPreview.config)).preset, 'unfolded')
  await tab.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k')
  await tab.getByRole('dialog', { name: 'Search Notebook', exact: true }).getByRole('combobox').fill('Desktop viewport')
  await tab.getByRole('option', { name: 'Desktop viewport', exact: true }).click()
  await tab.waitForFunction(() => document.querySelector('iframe[title="Live Notebook home"]').contentWindow.reviewPreview.config.width === 1024)
  const final = await live.evaluate(element => element.contentWindow.reviewPreview.config)
  assert.equal(final.height, 768)
  assert.equal(final.theme, 'dark')
  assert.equal(final.textScale, 2)
  assert.equal(final.preset, 'desktop')
  assert.equal(await live.evaluate((element, previous) => element === previous, identity), true)
  assert.equal(await frame.getByLabel('Title', { exact: true }).inputValue(), 'Keep this draft')
  await tab.goto(origin + '/review')
  await tab.getByRole('button', { name: 'Viewport · Desktop · 1024 × 768', exact: true }).waitFor()
  const saved = await tab.evaluate(() => JSON.parse(localStorage.getItem('civic:notebook-demo:viewport')))
  assert.equal(saved.theme, 'dark')
  assert.equal(saved.textScale, 2)
})

test('custom dimensions reject invalid input and retain legacy preferences until a valid resize', { timeout: 90000 }, async t => {
  const { tab } = await workspace(t)
  const project = await tab.evaluate(async () => {
    const response = await fetch('/api/review/index')
    if (!response.ok) throw Error('Notebook inventory unavailable')
    return (await response.json()).project
  })
  const legacy = { width: 480, height: 800, theme: 'dark', textScale: 2 }
  await tab.evaluate(({ key, value }) => { localStorage.removeItem('civic:notebook-demo:viewport'); localStorage.setItem(`civic:${key}:viewport`, JSON.stringify(value)) }, { key: project.key, value: legacy })
  await tab.reload()
  await tab.getByRole('button', { name: 'Viewport · Custom · 480 × 800', exact: true }).click()
  for (const [width, height] of [['', '800'], ['640.5', '800'], ['199', '800'], ['1921', '800'], ['640', '199'], ['640', '1601']]) {
    await tab.getByLabel('Width (px)', { exact: true }).fill(width)
    await tab.getByLabel('Height (px)', { exact: true }).fill(height)
    assert.equal(await tab.locator('form:has(#civic-viewport-width)').evaluate(form => form.checkValidity()), false)
    await tab.getByRole('button', { name: 'Apply', exact: true }).click()
    assert.equal(await tab.getByRole('button', { name: 'Viewport · Custom · 480 × 800', exact: true }).count(), 1)
  }
  await tab.getByLabel('Width (px)', { exact: true }).fill('640')
  await tab.getByLabel('Height (px)', { exact: true }).fill('800')
  await tab.getByRole('button', { name: 'Apply', exact: true }).click()
  await tab.getByRole('button', { name: 'Viewport · Custom · 640 × 800', exact: true }).waitFor()
  const saved = await tab.evaluate(() => JSON.parse(localStorage.getItem('civic:notebook-demo:viewport')))
  assert.deepEqual(saved, { ...legacy, width: 640 })
  assert.deepEqual(await tab.evaluate(key => JSON.parse(localStorage.getItem(`civic:${key}:viewport`)), project.key), legacy)
})

test('failed, rapid and replaced-frame resizes never persist a false success', { timeout: 90000 }, async t => {
  const { tab } = await workspace(t)
  const { live, frame } = await draft(tab)
  await live.evaluate(element => {
    const preview = element.contentWindow.reviewPreview
    window.viewportOriginal = preview.setViewport
    window.viewportCalls = 0
    preview.setViewport = () => { window.viewportCalls++; return new Promise((_, reject) => { window.viewportReject = () => reject(Error('Resize refused')) }) }
  })
  await tab.getByRole('button', { name: /^Viewport ·/ }).click()
  await tab.getByLabel('Width (px)', { exact: true }).fill('640')
  await tab.getByLabel('Height (px)', { exact: true }).fill('800')
  await tab.locator('form:has(#civic-viewport-width)').evaluate(form => { form.requestSubmit(); form.requestSubmit() })
  await tab.waitForFunction(() => window.viewportCalls === 1)
  assert.equal(await tab.getByRole('button', { name: 'Applying…', exact: true }).isDisabled(), true)
  await tab.evaluate(() => window.viewportReject())
  await tab.getByRole('alert').filter({ hasText: 'Resize refused' }).waitFor()
  assert.equal(await tab.getByRole('button', { name: 'Viewport · Phone · 393 × 852', exact: true }).count(), 1)
  assert.equal(await frame.getByLabel('Title', { exact: true }).inputValue(), 'Keep this draft')
  assert.equal(await tab.evaluate(() => localStorage.getItem('civic:notebook-demo:viewport')), null)
  await live.evaluate(element => {
    element.contentWindow.reviewPreview.setViewport = () => new Promise(resolve => { window.viewportFinish = resolve })
  })
  await tab.getByLabel('Width (px)', { exact: true }).fill('640')
  await tab.getByRole('button', { name: 'Apply', exact: true }).click()
  await tab.waitForFunction(() => Boolean(window.viewportFinish))
  await live.evaluate(element => { element.src = element.src + '&replacement=1' })
  await frame.getByRole('button', { name: 'New note' }).waitFor()
  await frame.getByRole('button', { name: 'New note' }).click()
  await frame.getByLabel('Title', { exact: true }).fill('New document draft')
  await tab.evaluate(() => window.viewportFinish())
  await tab.getByRole('alert').filter({ hasText: 'preview changed while resizing' }).waitFor()
  assert.equal((await live.evaluate(element => element.contentWindow.reviewPreview.config)).width, 393)
  assert.equal(await frame.getByLabel('Title', { exact: true }).inputValue(), 'New document draft')
  assert.equal(await tab.evaluate(() => localStorage.getItem('civic:notebook-demo:viewport')), null)
  await live.evaluate(element => { const win = element.contentWindow; delete win.reviewPreview.setViewport; Object.assign(win.reviewPreview.readiness, { state: 'checking', reason: 'Opening preview…' }); win.dispatchEvent(new Event('civic-preview-status')) })
  await tab.getByRole('status').filter({ hasText: 'Opening preview…' }).waitFor()
  assert.equal(await tab.getByRole('button', { name: 'Apply', exact: true }).isDisabled(), true)
  assert.equal((await live.evaluate(element => element.contentWindow.reviewPreview.config)).width, 393)
  assert.equal(await tab.evaluate(() => localStorage.getItem('civic:notebook-demo:viewport')), null)
})

test('standalone exported run controls use the same controller and retain the existing callback', { timeout: 90000 }, async t => {
  const { tab } = await workspace(t, true)
  const frame = tab.frameLocator('iframe[title="Standalone notebook"]')
  await frame.getByRole('button', { name: 'New note', exact: true }).click()
  await frame.getByLabel('Title', { exact: true }).fill('Standalone draft')
  assert.equal(await tab.getByLabel('Preview appearance', { exact: true }).inputValue(), 'dark')
  assert.equal(await tab.getByLabel('Preview text size', { exact: true }).inputValue(), '2')
  await tab.getByLabel('Preview device', { exact: true }).selectOption('phone')
  await tab.getByRole('button', { name: 'Rotate viewport', exact: true }).click()
  await tab.waitForFunction(() => { const value = JSON.parse(document.querySelector('output').textContent); return value && value.width === 852 })
  assert.deepEqual(JSON.parse(await tab.getByLabel('Last applied viewport', { exact: true }).textContent()), { width: 852, height: 393, theme: 'dark', textScale: 2, preset: 'phone' })
  assert.equal(await frame.getByLabel('Title', { exact: true }).inputValue(), 'Standalone draft')
})

test('failed startup can retry while configured versions remain distinct from mounted readiness', { timeout: 90000 }, async t => {
  const { tab } = await workspace(t, false, { prepare: async app => {
    await cp(join(app, 'src/preview.js'), join(app, 'src/original-preview.js'))
    await writeFile(join(app, 'src/preview.js'), `import { mount as original } from './original-preview.js'; export function mount(root, context) { if (!sessionStorage.getItem('civic-retry-fixture')) { sessionStorage.setItem('civic-retry-fixture', '1'); throw Error('Fixture boot failed') } return original(root, context) }`)
  } })
  await tab.locator('.app-screen > button', { hasText: 'Notebook home' }).click()
  await tab.getByRole('button', { name: 'Play this screen' }).click()
  const frame = tab.frameLocator('iframe[title="Live Notebook home"]')
  await frame.getByRole('alert').filter({ hasText: 'Fixture boot failed' }).waitFor()
  await tab.getByRole('button', { name: 'Retry preview', exact: true }).waitFor()
  await tab.locator('.rh-project-trigger').click()
  await tab.locator('.civic-version-toggle').click()
  await tab.locator('.civic-preview-option[data-readiness="failed"]').waitFor()
  await tab.getByRole('button', { name: 'Close project picker', exact: true }).click()
  await tab.getByRole('button', { name: 'Retry preview', exact: true }).click()
  await frame.getByRole('button', { name: 'New note', exact: true }).waitFor()
  await tab.locator('.rh-project-trigger').click()
  await tab.locator('.civic-version-toggle').click()
  await tab.locator('.civic-preview-option[data-readiness="ready"]').waitFor()
})

test('a callable replay or resize method does not override an explicit unsupported capability', { timeout: 90000 }, async t => {
  const { tab } = await workspace(t, false, { template: 'team-board', capabilities: { resize: false, record: true, replay: false, reason: 'Fixture protocol does not support resize or replay.' } })
  await tab.locator('.app-nav-section button', { hasText: 'Use the board' }).click()
  await tab.locator('.app-screen > button', { hasText: 'Team board' }).click()
  await tab.getByRole('button', { name: 'Play this screen' }).click()
  const frame = tab.frameLocator('iframe[title="Live Team board"]')
  await frame.getByText('Signed in as Alex Rivera').waitFor()
  await frame.getByLabel('Message', { exact: true }).fill('Capability check')
  await frame.getByRole('button', { name: 'Post', exact: true }).click()
  await frame.getByText('Alex Rivera: Capability check', { exact: true }).waitFor()
  const actual = await tab.locator('iframe[title="Live Team board"]').evaluate(element => ({ readiness: element.contentWindow.reviewPreview.readiness, capabilities: element.contentWindow.reviewPreview.capabilities, callable: typeof element.contentWindow.reviewPreview.replay, source: element.contentWindow.reviewPreview.snapshot.revision.source }))
  assert.equal(actual.readiness.state, 'ready')
  assert.equal(actual.readiness.source, actual.source)
  assert.equal(actual.callable, 'function')
  assert.equal(actual.capabilities.replay, false)
  await tab.getByRole('button', { name: 'Open details', exact: true }).click()
  await tab.getByRole('menuitem', { name: 'Inspect', exact: true }).click()
  assert.equal(await tab.getByRole('button', { name: 'Replay this run', exact: true }).isDisabled(), true)
  assert.equal(await tab.getByRole('button', { name: 'Save recording', exact: true }).isEnabled(), true)
  assert.equal(await tab.getByLabel('Preview appearance', { exact: true }).isDisabled(), true)
  await tab.getByRole('button', { name: /^Viewport ·/ }).click()
  assert.equal(await tab.getByRole('button', { name: 'Apply', exact: true }).isDisabled(), true)
  await tab.getByRole('status').filter({ hasText: 'Fixture protocol does not support resize or replay.' }).waitFor()
})

test('source changes mark the mounted revision stale without replacing the live draft', { timeout: 90000 }, async t => {
  const { tab } = await workspace(t)
  const { live, frame } = await draft(tab)
  await tab.locator('main[data-preview-state="ready"]').waitFor()
  const before = await live.elementHandle()
  const source = await live.evaluate(element => element.contentWindow.reviewPreview.readiness.source)
  for (const endpoint of ['index', 'coverage']) await tab.route(`**/api/review/${endpoint}`, async route => {
    const response = await route.fetch()
    assert.ok(response.ok())
    const body = await response.json(), next = 'b'.repeat(64)
    await route.fulfill({ response, json: endpoint === 'index' ? { ...body, revision: { ...body.revision, source: next }, fixtureSource: next } : { ...body, source: next } })
  })
  await tab.locator('main[data-preview-state="stale"]').waitFor()
  assert.equal(await tab.locator('main').getAttribute('data-preview-source'), source)
  assert.equal(await live.evaluate((element, previous) => element === previous, before), true)
  assert.equal(await frame.getByLabel('Title', { exact: true }).inputValue(), 'Keep this draft')
})

test('an old success notification cannot certify a replaced iframe document', { timeout: 90000 }, async t => {
  const { tab } = await workspace(t)
  const { live, frame } = await draft(tab)
  await tab.locator('main[data-preview-state="ready"]').waitFor()
  const old = await live.evaluate(element => ({ ...element.contentWindow.reviewPreview.readiness }))
  await live.evaluate(element => { const url = new URL(element.src); url.searchParams.set('scenario', 'unregistered.screen'); element.src = url.href })
  await frame.getByRole('alert').filter({ hasText: 'This scenario is not registered' }).waitFor()
  await tab.locator('main[data-preview-state="failed"]').waitFor()
  await live.evaluate((element, status) => element.contentWindow.dispatchEvent(new CustomEvent('civic-preview-status', { detail: status })), old)
  assert.equal(await tab.locator('main').getAttribute('data-preview-state'), 'failed')
  assert.equal(await live.evaluate(element => element.contentWindow.reviewPreview), undefined)
})

test('returning from mount without a ready screen stays unchecked until the adapter publishes', { timeout: 90000 }, async t => {
  const { tab } = await workspace(t, false, { capabilities: {}, prepare: async app => {
    await writeFile(join(app, 'src/preview.js'), `export function mount(root, context) { root.textContent = 'Waiting for adapter readiness'; window.fixturePublish = () => context.publish({ screen: context.scenario.id }); return () => delete window.fixturePublish }`)
  } })
  await tab.locator('.app-screen > button', { hasText: 'Notebook home' }).click()
  await tab.getByRole('button', { name: 'Play this screen' }).click()
  const live = tab.locator('iframe[title="Live Notebook home"]')
  await tab.frameLocator('iframe[title="Live Notebook home"]').getByText('Waiting for adapter readiness').waitFor()
  const before = await live.evaluate(element => element.contentWindow.reviewPreview)
  assert.equal(before.readiness.state, 'unchecked')
  assert.equal(before.capabilities.resize, false)
  await live.evaluate(element => element.contentWindow.fixturePublish())
  await tab.locator('main[data-preview-state="ready"]').waitFor()
  assert.equal((await live.evaluate(element => element.contentWindow.reviewPreview.capabilities)).resize, true)
})
