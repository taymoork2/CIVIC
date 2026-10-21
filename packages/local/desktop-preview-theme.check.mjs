import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startCanvas } from '../canvas/server/canvas-host.mjs'
import { canvasRoot } from '../canvas/server/canvas-root.mjs'

const { _electron } = createRequire(new URL('../canvas/package.json', import.meta.url))('@playwright/test')
const store = await mkdtemp(join(tmpdir(), 'civic-electron-preview-theme-')), source = join(store, 'notebook')
await cp(join(canvasRoot, 'examples/notebook'), source, { recursive: true })
const file = join(source, 'civic.project.json'), manifest = JSON.parse(await readFile(file, 'utf8'))
manifest.appearance = { themes: [{ id: 'paper', label: 'Paper' }, { id: 'ocean', label: 'Ocean' }], defaultTheme: 'paper' }
await writeFile(file, JSON.stringify(manifest))
const server = await startCanvas({ project: file, store, port: 0, logLevel: 'silent' })
const origin = `http://127.0.0.1:${server.httpServer.address().port}`, env = { ...process.env, CIVIC_LOCAL_STORE: store, CIVIC_DESKTOP_ORIGIN: origin }
delete env.ELECTRON_RUN_AS_NODE
let app, page
try {
  app = await _electron.launch({ executablePath: process.env.CIVIC_ELECTRON_BINARY, args: [fileURLToPath(new URL('desktop.mjs', import.meta.url))], env })
  page = await app.firstWindow()
  await page.getByLabel('Canvas appearance', { exact: true }).waitFor()
  await page.evaluate(() => window.civicDesktop.setAppearance('dark'))
  await page.getByLabel('Canvas appearance', { exact: true }).selectOption('light')
  await page.getByLabel('App theme', { exact: true }).selectOption('ocean')
  await page.locator('.app-screen-heading > button:first-child', { hasText: 'Notebook home' }).click()
  await page.getByRole('button', { name: /^Play \d\d / }).click()
  const live = page.locator('iframe[title="Live Notebook home"]'), frame = page.frameLocator('iframe[title="Live Notebook home"]')
  await frame.getByRole('button', { name: 'New note', exact: true }).click()
  await frame.getByLabel('Title', { exact: true }).fill('Electron retained draft')
  assert.equal(await frame.locator('.notebook-screen').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(237, 247, 252)')
  await app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'dark' })
  await page.getByLabel('Canvas appearance', { exact: true }).selectOption('system')
  await page.waitForFunction(() => document.querySelector('iframe').contentWindow.reviewPreview.config.theme === 'dark', undefined, { timeout: 5000 })
  await app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'light' })
  await page.waitForFunction(() => document.querySelector('iframe').contentWindow.reviewPreview.config.theme === 'light', undefined, { timeout: 5000 })
  assert.equal(await page.evaluate(() => document.documentElement.dataset.civicTheme), 'dark')
  const window = await app.browserWindow(page)
  for (const width of [1440, 390]) {
    await window.evaluate((window, width) => window.setSize(width, 900), width)
    assert.equal(await page.getByLabel('Canvas appearance', { exact: true }).isVisible(), true)
    assert.equal(await page.getByLabel('App theme', { exact: true }).isVisible(), true)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: join(store, `preview-${width}.png`) })
  }
  assert.equal(await frame.getByLabel('Title', { exact: true }).inputValue(), 'Electron retained draft')
  assert.equal(await live.evaluate(element => element.contentWindow.reviewPreview.config.appTheme), 'ocean')
  console.log(`Electron preview themes passed at 1440/390px; system changes, shell independence, and draft retained. Evidence: ${store}`)
} catch (error) {
  console.error('Theme diagnostics:', await page?.evaluate(() => ({ shell: document.documentElement.dataset.civicTheme, system: matchMedia('(prefers-color-scheme: dark)').matches, choice: document.querySelector('[aria-label="Canvas appearance"]')?.value, config: document.querySelector('iframe')?.contentWindow?.reviewPreview?.config })))
  console.error('Native theme:', await app?.evaluate(({ nativeTheme }) => ({ source: nativeTheme.themeSource, dark: nativeTheme.shouldUseDarkColors })))
  throw error
} finally {
  await app?.evaluate(({ app }) => app.exit(0)).catch(() => {})
  await app?.close().catch(() => {})
  await server.close()
}
