import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { store } from './onboard.mjs'
const { _electron } = createRequire(new URL('../canvas/package.json', import.meta.url))('@playwright/test')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ executablePath: process.env.CIVIC_ELECTRON_BINARY, args: [fileURLToPath(new URL('desktop.mjs', import.meta.url))], env, timeout: 30000 })
app.process().stderr.on('data', bytes => process.stderr.write(bytes))
const budget = setTimeout(() => app.process().kill(), 120000)
try {
  console.log('Electron: waiting for the first checkout')
  const page = await app.firstWindow()
  page.on('pageerror', error => console.error('Renderer:', error.message))
  await page.getByRole('button', { name: 'Open project or checkout', exact: true }).waitFor({ timeout: 30000 })
  await page.waitForFunction(() => window.civicDesktop && !['Opening…', 'Loading version…'].includes(document.querySelector('.civic-desktop-tab small')?.textContent ?? 'Opening…'))
  assert.equal(await page.getByLabel('Review key', { exact: true }).count(), 0)
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined')
  const security = await app.evaluate(({ BaseWindow }) => {
    const value = BaseWindow.getAllWindows()[0].contentView.children[0].webContents.getLastWebPreferences()
    return { sandbox: value.sandbox, contextIsolation: value.contextIsolation, nodeIntegration: value.nodeIntegration }
  })
  assert.deepEqual(security, { sandbox: true, contextIsolation: true, nodeIntegration: false })
  assert.equal(await page.locator('html').getAttribute('data-civic-desktop'), process.platform)
  const filter = page.getByRole('textbox', { name: 'Filter journeys and screens' })
  if (!await filter.isVisible()) await page.getByRole('button', { name: 'Toggle journey outline' }).click()
  await filter.fill('Home')
  await page.getByRole('button', { name: 'Open project or checkout', exact: true }).click()
  const picker = page.getByRole('dialog', { name: 'Projects & versions', exact: true })
  await picker.waitFor()
  const summaries = picker.locator('.civic-version-toggle')
  await summaries.first().waitFor()
  let next
  for (let i = 0; i < Math.min(await summaries.count(), 10); i++) {
    await summaries.nth(i).click()
    await picker.locator('.civic-version-previews').waitFor()
    const options = picker.locator('.civic-preview-option').getByRole('button', { name: /^Open .* preview$/ })
    if (await options.count() && await options.first().isEnabled()) { next = options.first(); break }
  }
  assert.ok(next, 'The registered project needs a second available checkout for desktop acceptance')
  const [second] = await Promise.all([app.waitForEvent('window'), next.click()])
  await second.getByRole('button', { name: 'Open project or checkout', exact: true }).waitFor({ timeout: 30000 })
  await second.waitForFunction(() => document.querySelectorAll('.civic-desktop-tabs [role=tab]').length === 2)
  await second.waitForFunction(() => !['Opening…', 'Loading version…'].includes(document.querySelectorAll('.civic-desktop-tab small')[1]?.textContent ?? 'Opening…'))
  let state = await second.evaluate(() => window.civicDesktop.state())
  assert.equal(state.tabs.length, 2)
  assert.equal(state.tabs[0].appId, state.tabs[1].appId, 'Different checkouts of one project have separate tabs')
  const own = await second.evaluate(async () => (await (await fetch('/api/review/index')).json()).project)
  await second.evaluate(async project => { await window.civicDesktop.openProject({ appId: project.app?.id ?? project.id, name: project.app?.name ?? project.name, key: project.key }) }, own)
  assert.equal((await second.evaluate(() => window.civicDesktop.state())).tabs.length, 2, 'Opening the same checkout reuses its tab')
  await second.getByRole('tab').first().click()
  await page.waitForFunction(() => window.civicDesktop.isActive())
  assert.equal(await filter.inputValue(), 'Home', 'Switching preserves the checkout’s local filter')
  assert.equal(await second.evaluate(() => window.civicDesktop.isActive()), false)
  const backgroundRequests = []
  second.on('request', request => { if (/\/api\/review\/(coverage|snapshots)/.test(request.url())) backgroundRequests.push(request.url()) })
  await page.waitForTimeout(5500)
  assert.deepEqual(backgroundRequests, [], 'Inactive checkout pauses coverage polling and new snapshot requests')
  await page.screenshot({ path: join(store, 'electron-checkout-tabs-desktop.png') })
  await page.screenshot({ path: join(store, 'electron-checkout-tabs-titlebar.png'), clip: { x: 0, y: 0, width: 1440, height: 110 } })
  assert.ok(await page.locator('.rh-brand').evaluate(el => el.getBoundingClientRect().height <= 40), 'Desktop title bar stays slim')
  await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].setSize(480, 800))
  await page.getByRole('button', { name: 'More project tabs' }).waitFor()
  assert.ok(await page.locator('.rh-brand').evaluate(el => el.getBoundingClientRect().height <= 48), 'Narrow title bar keeps touch targets compact')
  assert.equal(await page.locator('.rh-brand').evaluate(el => el.scrollWidth <= el.clientWidth), true, 'Narrow title bar must not overflow')
  await page.getByRole('button', { name: 'Open project or checkout', exact: true }).click()
  await picker.waitFor()
  await picker.locator('.civic-picker-loading').waitFor({ state: 'hidden' })
  await picker.locator('.civic-version-toggle').first().waitFor()
  assert.equal(await picker.evaluate(el => el.scrollWidth <= el.clientWidth), true, 'Narrow picker must not overflow')
  await page.screenshot({ path: join(store, 'electron-checkout-tabs-narrow.png') })
  await page.getByRole('button', { name: 'Close project picker' }).click()
  await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].setSize(360, 800))
  assert.equal(await page.locator('.rh-brand').evaluate(el => el.scrollWidth <= el.clientWidth), true, 'Minimum-width title bar must not overflow')
  await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].setSize(480, 800))
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }) })
  await second.evaluate(async project => { await window.civicDesktop.register({ appId: project.app?.id ?? project.id, name: project.app?.name ?? project.name, key: project.key, version: 'Close protection test', dirty: true }); const state = await window.civicDesktop.state(); await window.civicDesktop.close(state.tabs[1].id) }, own)
  assert.equal((await page.evaluate(() => window.civicDesktop.state())).tabs.length, 2, 'Cancelling close preserves a dirty checkout')
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }) })
  state = await page.evaluate(() => window.civicDesktop.state())
  const checkoutOrigin = new URL(second.url()).origin
  await page.evaluate(id => window.civicDesktop.close(id), state.tabs[1].id)
  assert.equal((await page.evaluate(() => window.civicDesktop.state())).tabs.length, 1)
  await assert.rejects(fetch(checkoutOrigin + '/review', { signal: AbortSignal.timeout(2000) }), /fetch failed/, 'The last checkout tab releases its owned host')
  await page.getByRole('button', { name: 'Open project or checkout', exact: true }).click()
  await picker.getByRole('button', { name: /^Laundry App/ }).click()
  await picker.locator('.civic-picker-loading').waitFor({ state: 'hidden' })
  await picker.locator('.civic-version-toggle').first().click()
  const [laundry] = await Promise.all([app.waitForEvent('window'), picker.locator('.civic-preview-option').getByRole('button', { name: /^Open .* preview$/ }).first().click()])
  await laundry.getByRole('button', { name: 'Open project or checkout', exact: true }).waitFor({ timeout: 30000 })
  state = await laundry.evaluate(() => window.civicDesktop.state())
  assert.equal(state.tabs.length, 2)
  assert.notEqual(state.tabs[0].appId, state.tabs[1].appId, 'A second project opens independently')
  const laundryOrigin = new URL(laundry.url()).origin
  await page.evaluate(id => window.civicDesktop.close(id), state.tabs[1].id)
  assert.equal((await page.evaluate(() => window.civicDesktop.state())).tabs.length, 1)
  await assert.rejects(fetch(laundryOrigin + '/review', { signal: AbortSignal.timeout(2000) }), /fetch failed/, 'Closing the second project releases its owned host')
  console.log('Electron: separate checkout tabs, reuse, preserved state, narrow overflow, close protection and sandbox passed.')
} catch (error) {
  console.error(error)
  for (const page of app.windows()) console.error('Failed checkout:', page.url(), (await page.locator('body').innerText().catch(() => '')).slice(0, 1500))
  throw error
}
finally { clearTimeout(budget); await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); await app.close().catch(() => {}) }
