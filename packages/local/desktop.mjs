import { app, BaseWindow, WebContentsView, ipcMain, shell, dialog, Menu, nativeTheme } from 'electron'
import { fileURLToPath } from 'node:url'
import { localReviewOrigin, trustedWindow } from './desktop-windows.mjs'
import { projectTabs } from './desktop-tabs.mjs'
import { readAppearance, saveAppearance } from './desktop-appearance.mjs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { branch, profile, desktopHost } from './desktop-host.mjs'

const testFailure = error => { console.error(error?.stack ?? error); app.exit(1) }
if (process.env.CIVIC_TEST === '1') {
  process.on('uncaughtException', testFailure)
  process.on('unhandledRejection', testFailure)
  dialog.showErrorBox = (title, message) => testFailure(Error(`${title}: ${message}`))
  dialog.showMessageBox = () => { testFailure(Error('Unexpected native confirmation in a test')); return Promise.resolve({ response: 0 }) }
}
let origin
const windows = new Set()
app.setName('CIVIC')
app.setPath('userData', profile)
const appearanceFile = join(app.getPath('userData'), 'appearance.json')
let themePreference = readAppearance(appearanceFile)
// Shell appearance is CSS-owned; Chromium's system preference stays available to reviewed apps.
nativeTheme.themeSource = 'system'
const appearance = () => ({ preference: themePreference, resolved: themePreference === 'system' ? nativeTheme.shouldUseDarkColors ? 'dark' : 'light' : themePreference, system: nativeTheme.shouldUseDarkColors ? 'dark' : 'light' })
const windowColors = () => appearance().resolved === 'dark' ? { color: '#191b20', symbolColor: '#eceef3' } : { color: '#ffffff', symbolColor: '#25272c' }
const publishAppearance = () => {
  for (const context of windows) {
    if (context.window.isDestroyed()) continue
    const colors = windowColors()
    context.window.setBackgroundColor(colors.color)
    if (process.platform === 'win32') context.window.setTitleBarOverlay({ ...colors, height: 60 })
    for (const view of context.tabs.views()) if (!view.contents.isDestroyed()) view.contents.send('civic-desktop:appearance', appearance())
  }
}
const report = error => { if (process.env.CIVIC_TEST === '1') testFailure(error); else dialog.showErrorBox('Could not open project', error.message) }
const external = url => { if (/^https?:$/.test(new URL(url).protocol)) void shell.openExternal(url) }
const keepRunning = () => null
const trustedSender = (event, context) => context && !context.window.isDestroyed() && event.senderFrame && event.senderFrame === event.sender.mainFrame && localReviewOrigin(event.senderFrame.url) && new URL(event.senderFrame.url).pathname === '/review'

async function open(initialURL = origin + '/review') {
  const window = new BaseWindow({ show: false, title: `CIVIC · ${branch}`, width: 1440, height: 1000, minWidth: 360, minHeight: 480, backgroundColor: windowColors().color, ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 22 } } : process.platform === 'win32' ? { titleBarStyle: 'hidden', titleBarOverlay: { ...windowColors(), height: 60 } } : {}) })
  let closing = false, reviewSession
  const context = { window, tabs: null }
  const stateFor = id => ({ ...context.tabs.snapshot(), visible: !window.isDestroyed() && window.isVisible() && !window.isMinimized() && context.tabs.idForView(id) === context.tabs.snapshot().active })
  const publish = () => {
    if (window.isDestroyed()) return
    for (const view of context.tabs.views()) if (!view.contents.isDestroyed()) view.contents.send('civic-desktop:state', stateFor(view.id))
  }
  const request = async input => {
    if (!reviewSession) throw Error('The original project is not ready')
    const response = await reviewSession.fetch(origin + '/api/review/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), credentials: 'include', signal: AbortSignal.timeout(30_000) })
    const result = await response.json()
    if (!response.ok) throw Error(result.error ?? 'Project request failed')
    return result
  }
  const trusted = url => trustedWindow(url, origin, (url, options) => reviewSession.fetch(url, options))
  context.tabs = projectTabs({
    changed: publish,
    confirm: async (name, action) => !window.isDestroyed() && (await dialog.showMessageBox(window, { type: 'question', message: action === 'switch checkout' ? 'Switch checkout for ' + name + '?' : 'Close ' + name + '?', detail: 'This checkout has a live run or unsaved edits. Saved reviews and recordings are retained.', buttons: action === 'switch checkout' ? ['Keep checkout', 'Switch checkout'] : ['Keep tab open', 'Close tab'], defaultId: 0, cancelId: 0 })).response === 1 && !window.isDestroyed(),
    acquire: async (selection, lease) => {
      if (selection.initial) return initialURL
      const result = await request({ action: 'open-window', key: selection.key, workspace: selection.workspace, lease })
      const url = new URL(result.url)
      if (!localReviewOrigin(url.href) || url.pathname !== '/review' || url.search || url.hash || !await trusted(url.href)) throw Error('The project did not return a registered local review address')
      if (selection.scenario) { url.searchParams.set('scenario', selection.scenario); url.searchParams.set('play', '1') }
      return url.href
    },
    release: async (selection, lease) => {
      try { await request({ action: 'release-window', key: selection.key, workspace: selection.workspace, lease }) }
      catch (error) { console.error('Project host cleanup: ' + error.message) }
    },
    createView: async url => {
      if (window.isDestroyed()) throw Error('This window has closed')
      const view = new WebContentsView({ webPreferences: { preload: fileURLToPath(new URL('desktop-preload.cjs', import.meta.url)), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: true } })
      const contents = view.webContents
      const reportIfOpen = error => { if (!window.isDestroyed() && !contents.isDestroyed()) report(error) }
      contents.on('page-title-updated', event => { event.preventDefault(); if (!window.isDestroyed() && !contents.isDestroyed()) window.setTitle(`CIVIC · ${branch}`) })
      reviewSession ??= contents.session
      contents.session.setPermissionRequestHandler((_contents, _permission, reply) => reply(false))
      const destination = value => { const next = new URL(value); next.searchParams.set('desktop', process.platform); return next.href }
      contents.setWindowOpenHandler(({ url }) => {
        if (window.isDestroyed() || contents.isDestroyed()) return { action: 'deny' }
        if (localReviewOrigin(url)) void trusted(url).then(allowed => { if (window.isDestroyed() || contents.isDestroyed()) return null; if (!allowed) throw Error('This address is not a registered CIVIC project host'); return open(url) }).catch(reportIfOpen)
        else external(url)
        return { action: 'deny' }
      })
      contents.on('will-navigate', (event, url) => {
        if (window.isDestroyed() || contents.isDestroyed()) { event.preventDefault(); return }
        if (!localReviewOrigin(url)) { event.preventDefault(); external(url); return }
        if (new URL(url).origin !== new URL(contents.getURL()).origin || new URL(url).searchParams.get('desktop') !== process.platform) {
          event.preventDefault()
          void trusted(url).then(allowed => { if (window.isDestroyed() || contents.isDestroyed()) return null; if (!allowed) throw Error('This address is not a registered CIVIC project host'); return contents.loadURL(destination(url)) }).catch(reportIfOpen)
        }
      })
      let attached = false
      const bounds = () => { if (window.isDestroyed() || contents.isDestroyed()) return; const { width, height } = window.getContentBounds(); view.setBounds({ x: 0, y: 0, width, height }) }
      window.on('resize', bounds)
      return {
        id: contents.id, contents,
        load: () => !window.isDestroyed() && !contents.isDestroyed() ? contents.loadURL(destination(url)) : Promise.reject(Error('This window has closed')),
        show: () => { if (window.isDestroyed() || contents.isDestroyed()) return; if (!attached) { window.contentView.addChildView(view); attached = true }; bounds(); contents.focus() },
        hide: () => { if (attached && !window.isDestroyed()) { window.contentView.removeChildView(view); attached = false } },
        focusScenario: id => { if (!contents.isDestroyed()) contents.send('civic-desktop:focus-scenario', id) },
        destroy: () => { if (!window.isDestroyed()) { window.removeListener('resize', bounds); if (attached) window.contentView.removeChildView(view) }; if (!contents.isDestroyed()) contents.close({ waitForBeforeUnload: false }) },
      }
    },
  })
  context.stateFor = stateFor
  windows.add(context)
  window.on('show', publish)
  window.on('hide', publish)
  window.on('minimize', publish)
  window.on('restore', publish)
  window.on('close', event => {
    if (closing) return
    event.preventDefault()
    void context.tabs.destroy().then(done => { if (done && !window.isDestroyed()) { closing = true; window.destroy() } }).catch(report)
  })
  window.on('closed', () => windows.delete(context))
  try {
    await context.tabs.open({ appId: 'initial', name: 'CIVIC', key: 'initial', initial: true })
    if (!window.isDestroyed()) window.show()
  } catch (error) { closing = true; if (window.isDestroyed()) return context; window.destroy(); throw error }
  return context
}

for (const action of ['state', 'register', 'open', 'replace', 'select', 'close', 'appearance', 'set-appearance']) ipcMain.handle('civic-desktop:' + action, async (event, input) => {
  if (event.sender.isDestroyed()) throw Error('This window has closed')
  const context = [...windows].find(context => context.tabs.owns(event.sender.id))
  if (!trustedSender(event, context)) throw Error('Untrusted desktop sender')
  if (action === 'set-appearance') {
    saveAppearance(appearanceFile, input)
    themePreference = input
    publishAppearance()
  }
  if (action === 'appearance' || action === 'set-appearance') return appearance()
  if (action === 'state') return context.stateFor(event.sender.id)
  if (action === 'register') context.tabs.register(event.sender.id, input)
  if (action === 'open' || action === 'replace') {
    if (!input || input.initial !== undefined) throw Error('Invalid project tab request')
    if (action === 'replace' && context.tabs.snapshot().active !== context.tabs.idForView(event.sender.id)) throw Error('Only the active project tab can switch checkouts')
    await context.tabs.open({ appId: input.appId, name: input.name, key: input.key, workspace: input.workspace, scenario: input.scenario }, action === 'replace' ? context.tabs.idForView(event.sender.id) : undefined)
  }
  if (action === 'select') context.tabs.select(input)
  if (action === 'close') { await context.tabs.close(input); if (!context.window.isDestroyed() && !context.tabs.snapshot().tabs.length) context.window.close() }
  return context.tabs.snapshot()
})
const openSettings = () => {
  const context = [...windows].find(candidate => !candidate.window.isDestroyed() && candidate.window.isFocused()) ?? [...windows].find(candidate => !candidate.window.isDestroyed())
  const view = context?.tabs.views().find(view => context.tabs.idForView(view.id) === context.tabs.snapshot().active)
  if (view && !view.contents.isDestroyed()) { context.window.show(); context.window.focus(); view.contents.send('civic-desktop:settings') }
}
const main = Effect.scoped(Effect.gen(function* () {
  yield* Effect.promise(() => app.whenReady())
  yield* Effect.acquireRelease(
    Effect.sync(() => nativeTheme.on('updated', publishAppearance)),
    () => Effect.sync(() => nativeTheme.removeListener('updated', publishAppearance)),
  )
  origin = process.env.CIVIC_DESKTOP_ORIGIN ? localReviewOrigin(process.env.CIVIC_DESKTOP_ORIGIN) : yield* desktopHost
  if (!origin) throw Error('CIVIC desktop requires a local review origin')
  yield* Effect.addFinalizer(() => Effect.promise(async () => {
    await Promise.all([...windows].map(async context => { await context.tabs.destroy(); if (!context.window.isDestroyed()) context.window.destroy() }))
    for (const action of ['state', 'register', 'open', 'replace', 'select', 'close', 'appearance', 'set-appearance']) ipcMain.removeHandler('civic-desktop:' + action)
  }))
  const settings = { id: 'civic-settings', label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: openSettings }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    process.platform === 'darwin' ? { label: 'CIVIC', submenu: [{ role: 'about' }, { type: 'separator' }, settings, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] } : { label: 'File', submenu: [settings, { type: 'separator' }, { role: 'quit' }] },
    { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
  ]))
  // eslint-disable-next-line unicorn/consistent-function-scoping -- this listener belongs to the main scope.
  const activate = () => { if (!windows.size) void open().catch(report) }
  app.on('activate', activate)
  yield* Effect.addFinalizer(() => Effect.sync(() => app.removeListener('activate', activate)))
  app.on('window-all-closed', keepRunning)
  yield* Effect.addFinalizer(() => Effect.sync(() => app.removeListener('window-all-closed', keepRunning)))
  yield* Effect.tryPromise(() => open())
  yield* Effect.callback(resume => {
    let quitting = false
    const quit = event => {
      event.preventDefault()
      if (quitting) return
      quitting = true
      Promise.all([...windows].map(context => context.tabs.destroy())).then(results => {
        if (results.every(Boolean)) resume(Effect.void)
        else quitting = false
        return null
      }).catch(error => { quitting = false; report(error) })
    }
    app.on('before-quit', quit)
    return Effect.sync(() => app.removeListener('before-quit', quit))
  })
}))
void Effect.runPromise(main).then(() => app.exit(0)).catch(error => { report(error); app.exit(1) })
