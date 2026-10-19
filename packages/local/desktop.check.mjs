import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { store } from './onboard.mjs'
const { _electron } = createRequire(new URL('../canvas/package.json', import.meta.url))('@playwright/test')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ executablePath: process.env.CIVIC_ELECTRON_BINARY, args: [fileURLToPath(new URL('desktop.mjs', import.meta.url))], env })
try {
  const page = await app.firstWindow()
  await page.locator('.rh-project-trigger').waitFor({ timeout: 20000 })
  assert.equal(await page.getByLabel('Review key', { exact: true }).count(), 0)
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined')
  const security = await app.evaluate(({ BrowserWindow }) => {
    const value = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()
    return { sandbox: value.sandbox, contextIsolation: value.contextIsolation, nodeIntegration: value.nodeIntegration }
  })
  assert.deepEqual(security, { sandbox: true, contextIsolation: true, nodeIntegration: false })
  assert.equal(await page.locator('html').getAttribute('data-civic-desktop'), process.platform)
  await page.locator('.rh-project-trigger').click()
  const picker = page.getByRole('dialog', { name: 'Projects & versions', exact: true })
  await picker.waitFor()
  await picker.getByRole('button', { name: /^Orca/ }).waitFor()
  await picker.getByRole('button', { name: /^Laundry App/ }).waitFor()
  for (const name of ['Orca', 'Laundry App']) assert.equal(await picker.getByRole('button', { name: new RegExp(`^${name}`) }).count(), 1, `App must appear once: ${name}`)
  await picker.locator('.civic-version-toggle').first().waitFor()
  assert.ok(await picker.locator('.civic-version-toggle').count() <= 10, 'Version summaries stay bounded')
  const current = await page.locator('.rh-project-trigger').textContent()
  const version = picker.locator('.civic-version-toggle').first()
  await version.click()
  assert.equal(await version.getAttribute('aria-expanded'), 'true')
  assert.equal(await page.locator('.rh-project-trigger').textContent(), current, 'Disclosure never selects a preview')
  await page.getByRole('button', { name: 'Close project picker' }).click()
  await page.evaluate(() => { location.assign('/review') })
  await page.waitForURL(url => url.searchParams.get('desktop') === process.platform)
  await page.locator('.rh-project-trigger').waitFor()
  assert.equal(new URL(page.url()).searchParams.get('desktop'), process.platform, 'Navigation retains title bar insets')
  await page.screenshot({ path: join(store, 'electron-projects.png') })
  console.log('Electron: keyless canvas, connected projects, sandbox, context isolation and no renderer Node API passed.')
} finally { await app.close() }
