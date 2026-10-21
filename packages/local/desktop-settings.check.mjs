import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { cp, mkdtemp, readFile, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createServer } from 'vite'
import { canvasPlugins } from '../canvas/server/canvas-host.mjs'
import { canvasRoot } from '../canvas/server/canvas-root.mjs'
import { loadProject } from '@civic/vite-connector/project'
import { projectPicker } from '@civic/vite-connector/projects'
import { projectWindows } from './project-windows.mjs'

const { _electron } = createRequire(new URL('../canvas/package.json', import.meta.url))('@playwright/test')
const store = await realpath(await mkdtemp(join(tmpdir(), 'civic-electron-settings-')))
const historyRoot = join(store, 'history-main')
await cp(join(canvasRoot, 'examples/notebook'), historyRoot, { recursive: true })
const git = (...args) => execFileSync('git', ['-C', historyRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
git('init', '--initial-branch=main'); git('add', '.')
git('-c', 'user.name=History Test', '-c', 'user.email=history@example.invalid', 'commit', '-m', 'main')
const manifest = join(historyRoot, 'civic.project.json')
const current = loadProject(store, { manifest }), registry = {}
const copy = join(store, 'second-checkout')
git('worktree', 'add', '-b', 'fix/history-display', copy)
execFileSync('git', ['-C', copy, '-c', 'user.name=History Test', '-c', 'user.email=history@example.invalid', 'commit', '--allow-empty', '-m', 'draft'], { stdio: 'pipe' })
const secondProject = loadProject(store, { manifest: join(copy, 'civic.project.json') })
const catalog = await projectPicker(store, current, { registry })
await catalog.organize({ key: current.key, app: { id: 'notebook-demo', name: 'Notebook' }, kind: 'implementation' })
await catalog.add({ kind: 'existing', root: copy, manifest: 'civic.project.json', app: { id: 'notebook-demo', name: 'Notebook' }, connectionKind: 'implementation' })
let windows
const host = async project => {
  const server = await createServer({ configFile: false, root: canvasRoot, cacheDir: join(store, '.vite', project.key), logLevel: 'silent', server: { host: '127.0.0.1', port: 0 }, plugins: canvasPlugins({ store, project: { manifest: project.manifestPath }, picker: { registry, openWindow: (project, lease) => windows.open(project, lease), releaseWindow: (project, lease) => windows.release(project.key, lease), windowOrigins: () => windows.origins() } }) })
  await server.listen()
  await Promise.all(['main.tsx', 'frame.tsx'].map(entry => server.warmupRequest(`/@fs${canvasRoot}/src/${entry}`)))
  await server.waitForRequestsIdle()
  return { url: `http://127.0.0.1:${server.httpServer.address().port}/review`, close: () => server.close() }
}
const initial = await host(current), origin = new URL(initial.url).origin
windows = projectWindows({ current: current.key, origin, createHost: host })
const env = { ...process.env, CIVIC_LOCAL_STORE: store, CIVIC_DESKTOP_ORIGIN: origin }
delete env.ELECTRON_RUN_AS_NODE
let app
const budget = setTimeout(() => { app?.process().kill('SIGKILL'); process.exitCode = 1 }, 180000)
try {
  const launch = () => _electron.launch({ executablePath: process.env.CIVIC_ELECTRON_BINARY, args: [fileURLToPath(new URL('desktop.mjs', import.meta.url))], env, timeout: 30000 })
  app = await launch()
  app.process().stderr.on('data', bytes => process.stderr.write(bytes))
  await app.evaluate(({ dialog }) => { dialog.showErrorBox = (title, message) => console.error(title, message) })
  let page = await app.firstWindow()
  const errors = []
  page.on('pageerror', error => { errors.push(error.stack); console.error('Renderer:', error.stack) })
  page.on('console', message => { if (message.type() === 'error') console.error('Renderer console:', message.text()) })
  page.on('response', response => { if (response.status() >= 400) console.error('Renderer response:', response.status(), response.url()) })
  await page.getByRole('button', { name: 'Open project or checkout', exact: true }).waitFor()
  await app.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu().getMenuItemById('civic-settings')
    if (item.accelerator !== 'CmdOrCtrl+,') throw Error('Missing native Settings accelerator')
    item.click()
  })
  let modal = page.getByRole('dialog', { name: 'CIVIC settings', exact: true })
  await modal.getByRole('button', { name: 'Dark', exact: true }).click()
  await page.waitForFunction(() => document.documentElement.dataset.civicTheme === 'dark')
  assert.equal(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource), 'dark')
  await modal.getByRole('button', { name: 'All screens', exact: true }).click()
  assert.equal(await page.evaluate(() => localStorage.getItem('rehearsal-canvas-detail')), 'all')
  await page.screenshot({ path: join(store, 'settings-electron-desktop-dark.png') })
  await modal.getByRole('tab', { name: 'Shortcuts', exact: true }).click()
  await modal.getByRole('table', { name: 'Keyboard shortcuts' }).waitFor()
  await page.screenshot({ path: join(store, 'settings-electron-shortcuts.png') })
  await modal.getByRole('tab', { name: 'About', exact: true }).click()
  const runtime = await app.evaluate(() => ({ electron: process.versions.electron, chrome: process.versions.chrome }))
  assert.ok((await modal.getByRole('tabpanel', { name: 'About', exact: true }).innerText()).includes(`Electron ${runtime.electron}`))
  assert.ok((await modal.getByRole('tabpanel', { name: 'About', exact: true }).innerText()).includes(`Chromium ${runtime.chrome}`))
  await modal.getByRole('tab', { name: 'General', exact: true }).click()
  await modal.getByRole('button', { name: 'Project connections', exact: true }).click()
  await page.getByRole('dialog', { name: 'Notebook · Connections', exact: true }).getByRole('button', { name: 'Add local folder', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  const [other] = await Promise.all([app.waitForEvent('window'), page.evaluate(project => window.civicDesktop.openProject({ appId: project.id, name: project.name, key: project.key }), { id: secondProject.manifest.id, name: secondProject.manifest.name, key: secondProject.key })])
  await other.waitForFunction(() => document.documentElement.dataset.civicTheme === 'dark')
  await other.getByRole('button', { name: 'Open project or checkout', exact: true }).waitFor()
  assert.notEqual(new URL(other.url()).origin, origin)
  await other.keyboard.press(process.platform === 'darwin' ? 'Meta+,' : 'Control+,')
  await other.getByRole('dialog', { name: 'CIVIC settings', exact: true }).getByRole('button', { name: 'Light', exact: true }).click()
  await page.waitForFunction(() => document.documentElement.dataset.civicTheme === 'light')
  await other.keyboard.press('Escape')
  const state = await other.evaluate(() => window.civicDesktop.state())
  await other.getByRole('tab').first().click()
  await page.evaluate(id => window.civicDesktop.close(id), state.tabs[1].id)
  await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].setSize(390, 844))
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+,' : 'Control+,')
  await modal.getByRole('button', { name: 'System', exact: true }).click()
  // NativeTheme overrides emulate system notification delivery without changing macOS settings.
  await app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'dark' })
  await page.waitForFunction(() => document.documentElement.dataset.civicTheme === 'dark')
  assert.equal(await modal.getByRole('button', { name: 'System', exact: true }).getAttribute('aria-pressed'), 'true')
  await page.waitForFunction(() => {
    const dialog = document.querySelector('.civic-settings-dialog')
    const option = dialog.querySelector('[aria-label="Appearance"] [aria-pressed=false]')
    return getComputedStyle(option).color === getComputedStyle(dialog).color
  }, undefined, { timeout: 5000 })
  const box = await modal.boundingBox()
  assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844 && box.height < 520)
  assert.equal(await page.locator('.rh-brand').evaluate(element => element.scrollWidth <= element.clientWidth), true)
  await page.screenshot({ path: join(store, 'settings-electron-narrow-system-dark.png') })
  for (const section of ['Shortcuts', 'About', 'General']) {
    await modal.getByRole('tab', { name: section, exact: true }).click()
    assert.equal(await modal.evaluate(element => element.scrollWidth <= element.clientWidth), true)
  }
  assert.equal(await modal.getByRole('button', { name: 'All screens', exact: true }).getAttribute('aria-pressed'), 'true')
  await modal.getByRole('button', { name: 'Light', exact: true }).click()
  await modal.getByRole('button', { name: 'Dark', exact: true }).click()
  assert.equal(JSON.parse(await readFile(join(store, 'desktop/appearance.json'), 'utf8')).theme, 'dark')
  await assert.rejects(page.evaluate(() => window.civicDesktop.setAppearance('invalid')), /Invalid appearance/)
  assert.equal((await page.evaluate(() => window.civicDesktop.appearance())).preference, 'dark')
  assert.deepEqual(errors, [])
  await page.keyboard.press('Escape')
  await modal.waitFor({ state: 'detached' })
  for (const width of [1440, 768, 390, 360]) {
    await app.evaluate(({ BaseWindow }, width) => BaseWindow.getAllWindows()[0].setSize(width, 900), width)
    await page.getByRole('button', { name: 'Open project or checkout', exact: true }).click()
    const picker = page.getByRole('dialog', { name: 'Projects & versions', exact: true })
    await picker.locator('.civic-version-toggle').first().waitFor()
    await picker.getByRole('button', { name: 'Preview options for Main branch', exact: true }).waitFor()
    await picker.getByRole('button', { name: 'Preview options for Fix/history-display', exact: true }).waitFor()
    assert.equal(await picker.getByRole('img', { name: /Fix\/history-display descends from Main branch/ }).count(), 1)
    assert.ok((await picker.innerText()).includes('1 ahead of main'))
    assert.equal((await picker.innerText()).includes('Captured'), false, 'Checkout history must not invent build capture age')
    assert.equal(await picker.evaluate(element => element.scrollWidth <= element.clientWidth), true)
    const bounds = await picker.boundingBox()
    assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= 900)
    assert.equal(await page.locator('.rh-brand').evaluate(element => element.scrollWidth <= element.clientWidth), true)
    assert.equal(await page.locator('.rh-brand').evaluate(element => element.getBoundingClientRect().height), 60, 'Title bar keeps breathing room at every window size')
    assert.equal(await page.locator('.civic-desktop-tabs').evaluate(element => getComputedStyle(element).webkitAppRegion), 'drag', 'Empty tab space remains draggable')
    assert.equal(await page.locator('.rh-brand button').evaluateAll(buttons => buttons.every(button => getComputedStyle(button).webkitAppRegion === 'no-drag')), true, 'Title bar controls remain clickable')
    await page.screenshot({ path: join(store, `shell-picker-electron-${width}.png`) })
    await picker.getByRole('button', { name: 'Close project picker', exact: true }).click()
    await picker.waitFor({ state: 'detached' })
  }
  await page.getByRole('button', { name: 'Open project or checkout', exact: true }).click()
  await page.getByRole('button', { name: 'Manage sources', exact: true }).click()
  const sources = page.getByRole('dialog', { name: 'Notebook · Connections', exact: true })
  const inactive = sources.getByRole('checkbox', { name: 'Include inactive work', exact: true })
  await inactive.check()
  assert.equal(await inactive.getAttribute('aria-checked'), 'true')
  await inactive.uncheck()
  await sources.getByRole('button', { name: 'Close project picker', exact: true }).click()
  await sources.waitFor({ state: 'detached' })
  await page.getByRole('button', { name: 'Toggle journey outline', exact: true }).click()
  await page.getByRole('textbox', { name: 'Filter journeys and screens', exact: true }).fill('Compose')
  await page.locator('#civic-journey-outline').getByRole('button', { name: 'Compose note', exact: true }).click()
  await page.locator('#civic-journey-outline').waitFor({ state: 'hidden' })
  assert.deepEqual(errors, [])
  await app.evaluate(({ app }) => app.exit(0)); await app.close()
  app = await launch(); page = await app.firstWindow()
  await page.waitForFunction(() => document.documentElement.dataset.civicTheme === 'dark')
  await page.getByRole('button', { name: 'Open project or checkout', exact: true }).waitFor()
  assert.equal((await page.evaluate(() => window.civicDesktop.appearance())).preference, 'dark')
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+,' : 'Control+,')
  assert.equal(await page.getByRole('dialog', { name: 'CIVIC settings', exact: true }).getByRole('button', { name: 'All screens', exact: true }).getAttribute('aria-pressed'), 'true')
  await page.getByRole('dialog', { name: 'CIVIC settings', exact: true }).getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('dialog', { name: 'CIVIC settings', exact: true }).waitFor({ state: 'detached' })
  for (const [width, branch] of [[1440, 'Fix/history-display'], [390, 'Main branch']]) {
    await app.evaluate(({ BaseWindow }, width) => BaseWindow.getAllWindows()[0].setSize(width, 900), width)
    const active = page.getByRole('tablist', { name: 'Open project checkouts' }).getByRole('tab', { selected: true })
    await active.click()
    let picker = page.getByRole('dialog', { name: 'Projects & versions', exact: true })
    await picker.waitFor()
    await page.keyboard.press('Escape')
    await picker.waitFor({ state: 'detached' })
    await page.waitForFunction(() => document.activeElement?.matches('.civic-desktop-tab [role=tab][aria-selected=true]'), undefined, { timeout: 3000 }).catch(async error => { console.error('Picker return focus:', await page.evaluate(() => document.activeElement?.outerHTML)); throw error })
    const choose = async () => {
      await active.click()
      picker = page.getByRole('dialog', { name: 'Projects & versions', exact: true })
      await picker.getByRole('button', { name: `Preview options for ${branch}`, exact: true }).click()
      await picker.getByRole('button', { name: 'Switch to Local checkout preview', exact: true }).waitFor()
    }
    await choose()
    if (width === 1440) {
      const before = await page.evaluate(() => window.civicDesktop.state())
      await page.evaluate(() => window.civicDesktop.setDraft('switch-guard', true))
      await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }) })
      await picker.getByRole('button', { name: 'Switch to Local checkout preview', exact: true }).click()
      await picker.waitFor({ state: 'detached' })
      const after = await page.evaluate(() => window.civicDesktop.state())
      assert.equal(after.active, before.active)
      assert.equal(after.tabs.length, 1)
      assert.equal(after.tabs[0].dirty, true, 'Declining a checkout switch retains the guarded view')
      await page.evaluate(() => window.civicDesktop.setDraft('switch-guard', false))
      await choose()
    }
    const [replacement] = await Promise.all([app.waitForEvent('window'), picker.getByRole('button', { name: 'Switch to Local checkout preview', exact: true }).click()])
    page = replacement
    await page.getByRole('tab', { selected: true }).waitFor()
    await page.waitForFunction(async () => (await window.civicDesktop.state()).tabs.length === 1)
    await page.getByRole('tab', { selected: true }).click()
    picker = page.getByRole('dialog', { name: 'Projects & versions', exact: true })
    await picker.getByRole('button', { name: `Preview options for ${branch}`, exact: true }).waitFor()
    assert.equal(await picker.evaluate(element => element.scrollWidth <= element.clientWidth), true)
    await page.screenshot({ path: join(store, `checkout-switch-electron-${width}.png`) })
    await page.keyboard.press('Escape')
  }
  await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].setSize(1440, 900))
  await page.getByRole('button', { name: 'Open project or checkout', exact: true }).click()
  let picker = page.getByRole('dialog', { name: 'Projects & versions', exact: true })
  await picker.getByRole('button', { name: 'Preview options for Fix/history-display', exact: true }).click()
  const [extra] = await Promise.all([app.waitForEvent('window'), picker.getByRole('button', { name: 'Open Local checkout preview', exact: true }).click()])
  await extra.getByRole('tab', { selected: true }).waitFor()
  assert.equal((await extra.evaluate(() => window.civicDesktop.state())).tabs.length, 2, 'The plus action still opens a separate tab')
  await extra.getByRole('tab', { selected: false }).click()
  await page.waitForFunction(() => window.civicDesktop.isActive())
  assert.equal(await page.getByRole('dialog', { name: 'Projects & versions', exact: true }).count(), 0, 'Selecting an inactive tab does not open its picker')
  const security = await app.evaluate(({ BaseWindow }) => {
    const preferences = BaseWindow.getAllWindows()[0].contentView.children[0].webContents.getLastWebPreferences()
    return { sandbox: preferences.sandbox, contextIsolation: preferences.contextIsolation, nodeIntegration: preferences.nodeIntegration }
  })
  assert.deepEqual(security, { sandbox: true, contextIsolation: true, nodeIntegration: false })
  console.log(`Electron settings passed: sections, canvas defaults, runtime, project connections, native menu, cross-origin tabs, live themes, persistence, desktop/390px checkout switching, cancellation, explicit new tabs and sandbox. Evidence: ${store}`)
} catch (error) {
  for (const page of app?.windows() ?? []) {
    console.error('Failed Electron settings window:', page.url(), (await page.locator('body').innerText().catch(() => '')).slice(0, 2000))
    await page.screenshot({ path: join(store, 'settings-electron-failure.png') }).catch(() => {})
  }
  console.error('Electron settings evidence:', store)
  throw error
} finally {
  clearTimeout(budget)
  await app?.evaluate(({ app }) => app.exit(0)).catch(() => {})
  await app?.close().catch(() => {})
  await windows.close(); await initial.close()
}
