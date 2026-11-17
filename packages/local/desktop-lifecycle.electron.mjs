/* eslint-disable no-shadow -- Playwright serializes callbacks into a separate Electron process. */
/* eslint-disable promise/avoid-new, promise/prefer-await-to-callbacks -- process events are callback boundaries. */
/* eslint-disable unicorn/import-style -- fixtures use path joins throughout. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { Effect, Schedule } from 'effect'
import electron from 'electron'
import { canvasRoot } from '../canvas/server/canvas-root.mjs'
import { moduleReviewAdapter } from '../canvas/server/module-adapter.mjs'

const { _electron } = createRequire(new URL('../canvas/package.json', import.meta.url))('@playwright/test')
const store = await mkdtemp(join(tmpdir(), 'civic-client-lifecycle-'))
const registration = join(store, '.review-data/service/registration.json')
const env = { ...process.env, CIVIC_TEST: '1', CIVIC_LOCAL_STORE: store, CIVIC_PROJECT: join(canvasRoot, 'examples/pantry/civic.project.json') }
delete env.ELECTRON_RUN_AS_NODE
delete env.CIVIC_DESKTOP_ORIGIN
const launch = () => _electron.launch({ executablePath: process.env.CIVIC_ELECTRON_BINARY || electron, args: [fileURLToPath(new URL('desktop.mjs', import.meta.url))], env, timeout: 60000 })
const wait = (check, timeout = '20 seconds') => Effect.runPromise(Effect.timeout(Effect.retry(Effect.tryPromise(async () => {
  assert.ok(await check())
}), { times: 1000, schedule: Schedule.spaced(100) }), timeout))
const missing = file => access(file).then(() => false).catch(error => { if (error.code === 'ENOENT') return true; throw error })
const exitedProcess = pid => {
  try { process.kill(pid, 0); return false }
  catch (error) { if (error.code === 'ESRCH') return true; throw error }
}
let app, browser
try {
  app = await launch()
  const window = await app.firstWindow()
  await window.waitForURL(/\/review/u)
  assert.equal(await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().every(window => window.getOpacity() === 0)), true)
  const owner = JSON.parse(await readFile(registration, 'utf8'))
  assert.notEqual(new URL(owner.endpoint).port, '3012')
  assert.match(await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].getTitle()), /CIVIC · .+/u)
  browser = await moduleReviewAdapter.launchFixtureBrowser()
  const page = await browser.newPage()
  const attached = page.waitForEvent('websocket', socket => socket.url().endsWith('/api/civic/control'))
  await page.goto(owner.endpoint + '/review')
  await attached
  const runtime = input => page.evaluate(async input => {
    const index = await fetch('/api/review/index').then(response => response.json())
    const response = await fetch('/api/review/runtime', { method: 'POST', headers: { 'content-type': 'application/json', 'x-rehearsal-project': index.project.key }, body: JSON.stringify(input) })
    if (!response.ok) throw Error(await response.text())
    return response.json()
  }, input)
  const run = await runtime({ action: 'start', scenario: 'pantry.shelf', persona: 'stocked', role: 'cook', condition: 'normal' })
  await app.evaluate(({ app }) => app.quit())
  await app.close(); app = null
  let state = await runtime({ action: 'state', run: run.id })
  assert.equal(state.items.length, 3)
  console.log('AE1 passed: Electron Quit preserves browser and run')
  const reattached = page.waitForEvent('websocket', socket => socket.url().endsWith('/api/civic/control'))
  await page.reload(); await reattached
  await Effect.runPromise(Effect.sleep('11 seconds'))
  assert.equal(JSON.parse(await readFile(registration, 'utf8')).nonce, owner.nonce)
  state = await runtime({ action: 'state', run: run.id })
  assert.equal(state.items.length, 3)
  console.log('AE3 passed: sole browser reload retains server identity and run')
  app = await launch(); await app.firstWindow()
  await browser.close(); browser = null
  await app.evaluate(async ({ BaseWindow, webContents }) => {
    const late = webContents.getAllWebContents().flatMap(contents => contents.listeners('page-title-updated'))
    const resize = BaseWindow.getAllWindows().flatMap(window => window.listeners('resize'))
    await Promise.all(BaseWindow.getAllWindows().map(window => new Promise(resolve => { window.once('closed', resolve); window.close() })))
    for (const handler of late) handler({ preventDefault: () => null })
    for (const handler of resize) handler()
  })
  console.log('Late title and resize callbacks after window close passed without throwing')
  await wait(() => app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().length === 0))
  await Effect.runPromise(Effect.sleep('11 seconds'))
  assert.equal(JSON.parse(await readFile(registration, 'utf8')).nonce, owner.nonce)
  await app.evaluate(({ app }) => app.emit('activate'))
  await app.firstWindow()
  await app.evaluate(({ app }) => app.quit())
  await app.close(); app = null
  await wait(() => missing(registration))
  await wait(() => Promise.resolve(exitedProcess(owner.pid)))
  console.log('AE2 and AE8 passed: windowless main retains host; final Quit releases and host exits')
  app = await launch()
  const crashWindow = await app.firstWindow()
  await crashWindow.waitForURL(/\/review/u)
  const crashOwner = JSON.parse(await readFile(registration, 'utf8'))
  await app.evaluate(({ webContents }) => {
    for (const contents of webContents.getAllWebContents()) if (contents.getURL().includes('/review')) contents.forcefullyCrashRenderer()
  })
  await Effect.runPromise(Effect.sleep('11 seconds'))
  assert.equal(JSON.parse(await readFile(registration, 'utf8')).nonce, crashOwner.nonce)
  app.process().kill('SIGKILL')
  await wait(() => missing(registration))
  await wait(() => Promise.resolve(exitedProcess(crashOwner.pid)))
  app = null
  console.log('AE8 passed: renderer crash retains main connection; main crash leaves no host')
  const orphanStore = await mkdtemp(join(tmpdir(), 'civic-client-orphan-'))
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import { fork } from 'node:child_process'
    const host = fork(${JSON.stringify(fileURLToPath(new URL('managed-host.mjs', import.meta.url)))}, [], { detached: true, execArgv: [], stdio: ['ignore', 'ignore', 'inherit', 'ipc'] })
    host.unref()
    host.once('message', owner => process.send(owner, () => process.exit(0)))
  `], { env: { ...env, CIVIC_LOCAL_STORE: orphanStore, CIVIC_HOST_BUILD: 'orphan-check' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  const exited = new Promise((resolve, reject) => { child.once('exit', code => code === 0 ? resolve() : reject(Error('Orphan host failed: ' + code))); child.once('error', reject) })
  try {
    const abandoned = await new Promise((resolve, reject) => { child.once('message', resolve); child.once('error', reject); child.once('exit', () => reject(Error('Host exited before ready'))) })
    await exited
    await wait(() => missing(join(orphanStore, '.review-data/service/registration.json')), '70 seconds')
    await wait(() => Promise.resolve(exitedProcess(abandoned.pid)))
  } finally { if (child.exitCode === null) child.kill('SIGTERM') }
  console.log('AE8 passed: launcher exits before attach; first-client deadline leaves no host')
} finally {
  await browser?.close()
  await app?.evaluate(({ app }) => app.exit(0)).catch(() => null)
  await app?.close().catch(() => null)
}
