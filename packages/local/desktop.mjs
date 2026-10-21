import { app, BaseWindow, WebContentsView, ipcMain, shell, dialog, Menu, nativeTheme } from 'electron'
import { fileURLToPath } from 'node:url'
import { store } from './store.mjs'
import { localReviewOrigin, trustedWindow } from './desktop-windows.mjs'
import { projectTabs } from './desktop-tabs.mjs'
import { readAppearance, saveAppearance } from './desktop-appearance.mjs'
import { join } from 'node:path'

const origin = localReviewOrigin(process.env.CIVIC_DESKTOP_ORIGIN ?? 'http://127.0.0.1:3012')
if (!origin) throw Error('CIVIC desktop requires a local review origin')
const windows = new Set()
app.setName('CIVIC')
app.setPath('userData', store + '/desktop')
const appearanceFile = join(app.getPath('userData'), 'appearance.json')
let themePreference = readAppearance(appearanceFile)
// Shell appearance is CSS-owned; Chromium's system preference stays available to reviewed apps.
nativeTheme.themeSource = 'system'
const appearance = () => ({ preference: themePreference, resolved: themePreference === 'system' ? nativeTheme.shouldUseDarkColors ? 'dark' : 'light' : themePreference, system: nativeTheme.shouldUseDarkColors ? 'dark' : 'light' })
const windowColors = () => appearance().resolved === 'dark' ? { color: '#191b20', symbolColor: '#eceef3' } : { color: '#ffffff', symbolColor: '#25272c' }
const publishAppearance = () => {
  for (const context of windows) {
    const colors = windowColors()
    context.window.setBackgroundColor(colors.color)
    if (process.platform === 'win32') context.window.setTitleBarOverlay({ ...colors, height: 60 })
    for (const view of context.tabs.views()) if (!view.contents.isDestroyed()) view.contents.send('civic-desktop:appearance', appearance())
  }
}
nativeTheme.on('updated', publishAppearance)
const report = error => dialog.showErrorBox('Could not open project', error.message)
const external = url => { if (/^https?:$/.test(new URL(url).protocol)) void shell.openExternal(url) }

async function open(initialURL = origin + '/review') {
  const window = new BaseWindow({ show: false, title: 'CIVIC', width: 1440, height: 1000, minWidth: 360, minHeight: 480, backgroundColor: windowColors().color, ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 22 } } : process.platform === 'win32' ? { titleBarStyle: 'hidden', titleBarOverlay: { ...windowColors(), height: 60 } } : {}) })
  let closing = false, reviewSession
  const context = { window, tabs: null }
  const stateFor = id => ({ ...context.tabs.snapshot(), visible: window.isVisible() && !window.isMinimized() && context.tabs.idForView(id) === context.tabs.snapshot().active })
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
    confirm: async (name, action) => (await dialog.showMessageBox(window, { type: 'question', message: action === 'switch checkout' ? 'Switch checkout for ' + name + '?' : 'Close ' + name + '?', detail: 'This checkout has a live run or unsaved edits. Saved reviews and recordings are retained.', buttons: action === 'switch checkout' ? ['Keep checkout', 'Switch checkout'] : ['Keep tab open', 'Close tab'], defaultId: 0, cancelId: 0 })).response === 1,
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
      const view = new WebContentsView({ webPreferences: { preload: fileURLToPath(new URL('desktop-preload.cjs', import.meta.url)), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: true } })
      const contents = view.webContents
      reviewSession ??= contents.session
      contents.session.setPermissionRequestHandler((_contents, _permission, reply) => reply(false))
      const destination = value => { const next = new URL(value); next.searchParams.set('desktop', process.platform); return next.href }
      contents.setWindowOpenHandler(({ url }) => {
        if (localReviewOrigin(url)) void trusted(url).then(allowed => { if (!allowed) throw Error('This address is not a registered CIVIC project host'); return open(url) }).catch(report)
        else external(url)
        return { action: 'deny' }
      })
      contents.on('will-navigate', (event, url) => {
        if (!localReviewOrigin(url)) { event.preventDefault(); external(url); return }
        if (new URL(url).origin !== new URL(contents.getURL()).origin || new URL(url).searchParams.get('desktop') !== process.platform) {
          event.preventDefault()
          void trusted(url).then(allowed => { if (!allowed) throw Error('This address is not a registered CIVIC project host'); return contents.loadURL(destination(url)) }).catch(report)
        }
      })
      let attached = false
      const bounds = () => { const { width, height } = window.getContentBounds(); view.setBounds({ x: 0, y: 0, width, height }) }
      window.on('resize', bounds)
      return {
        id: contents.id, contents,
        load: () => contents.loadURL(destination(url)),
        show: () => { if (!attached) { window.contentView.addChildView(view); attached = true }; bounds(); contents.focus() },
        hide: () => { if (attached) { window.contentView.removeChildView(view); attached = false } },
        focusScenario: id => contents.send('civic-desktop:focus-scenario', id),
        destroy: () => { window.removeListener('resize', bounds); if (attached) window.contentView.removeChildView(view); if (!contents.isDestroyed()) contents.close({ waitForBeforeUnload: false }) },
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
    void context.tabs.destroy().then(done => { if (done) { closing = true; window.destroy() } }).catch(report)
  })
  window.on('closed', () => windows.delete(context))
  try {
    await context.tabs.open({ appId: 'initial', name: 'CIVIC', key: 'initial', initial: true })
    window.show()
  } catch (error) { closing = true; window.destroy(); throw error }
  return context
}

for (const action of ['state', 'register', 'open', 'replace', 'select', 'close', 'appearance', 'set-appearance']) ipcMain.handle('civic-desktop:' + action, async (event, input) => {
  const context = [...windows].find(context => context.tabs.owns(event.sender.id))
  if (!context || event.senderFrame !== event.sender.mainFrame || !localReviewOrigin(event.senderFrame.url) || new URL(event.senderFrame.url).pathname !== '/review') throw Error('Untrusted desktop sender')
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
  if (action === 'close') { await context.tabs.close(input); if (!context.tabs.snapshot().tabs.length) context.window.close() }
  return context.tabs.snapshot()
})
const openSettings = () => {
  const context = [...windows].find(context => context.window.isFocused()) ?? [...windows][0]
  const view = context?.tabs.views().find(view => context.tabs.idForView(view.id) === context.tabs.snapshot().active)
  if (view && !view.contents.isDestroyed()) { context.window.show(); context.window.focus(); view.contents.send('civic-desktop:settings') }
}
app.whenReady().then(() => {
  const settings = { id: 'civic-settings', label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: openSettings }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    process.platform === 'darwin' ? { label: 'CIVIC', submenu: [{ role: 'about' }, { type: 'separator' }, settings, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] } : { label: 'File', submenu: [settings, { type: 'separator' }, { role: 'quit' }] },
    { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
  ]))
  return open()
}).catch(error => { report(error); app.quit() })
app.on('activate', () => { if (!windows.size) void open().catch(report) })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
