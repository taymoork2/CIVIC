import assert from 'node:assert/strict'
import { cp, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { canvasRoot } from './canvas-root.mjs'
import { canvasPlugins, startCanvas } from './canvas-host.mjs'
import { createServer } from 'vite'
import { moduleReviewAdapter } from './module-adapter.mjs'

async function workspace(t, standalone = false) {
  const store = await realpath(await mkdtemp(join(tmpdir(), 'civic-viewport-')))
  let manifest = join(canvasRoot, 'examples/notebook/civic.project.json')
  if (standalone) {
    const app = join(store, 'notebook')
    await cp(join(canvasRoot, 'examples/notebook'), app, { recursive: true })
    manifest = join(app, 'civic.project.json')
    const config = JSON.parse(await readFile(manifest, 'utf8'))
    config.adapter.kind = 'viewport-fixture'
    await writeFile(manifest, JSON.stringify(config))
  }
  const server = standalone ? await createServer({ configFile: false, root: canvasRoot, cacheDir: join(store, '.vite'), logLevel: 'silent', server: { host: '127.0.0.1', port: 0 }, plugins: canvasPlugins({ store, project: { manifest }, connectors: { 'viewport-fixture': { canvasExtension: () => join(canvasRoot, 'src/check-fixtures/viewport-controls.tsx') } } }) }) : await startCanvas({ project: manifest, store, port: 0, logLevel: 'silent' })
  if (standalone) await server.listen()
  t.after(() => server.close())
  const browser = await moduleReviewAdapter.launchFixtureBrowser()
  t.after(() => browser.close())
  const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  await tab.goto(origin + '/review' + (standalone ? '?standaloneViewport=1' : ''))
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
  await live.evaluate(element => { delete element.contentWindow.reviewPreview.setViewport })
  await tab.getByLabel('Width (px)', { exact: true }).fill('640')
  await tab.getByRole('button', { name: 'Apply', exact: true }).click()
  await tab.getByRole('alert').filter({ hasText: 'Wait for the live preview' }).waitFor()
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
