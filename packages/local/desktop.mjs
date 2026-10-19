import { app, BrowserWindow, shell, dialog } from 'electron'
import { store } from './onboard.mjs'
import { localReviewOrigin, trustedWindow } from './desktop-windows.mjs'
const origin = 'http://127.0.0.1:3012'
app.setName('CIVIC')
app.setPath('userData', store + '/desktop')
const external = url => { if (/^https?:$/.test(new URL(url).protocol)) void shell.openExternal(url) }
async function open(url = origin + '/review') {
  const window = new BrowserWindow({ title: 'CIVIC', width: 1440, height: 1000, backgroundColor: '#ffffff', ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 18 } } : process.platform === 'win32' ? { titleBarStyle: 'hidden', titleBarOverlay: { color: '#ffffff', symbolColor: '#25272c', height: 52 } } : {}), webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, reply) => reply(false))
  const trusted = url => trustedWindow(url, origin, (url, options) => window.webContents.session.fetch(url, options))
  const report = error => dialog.showErrorBox('Could not open project window', error.message)
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (localReviewOrigin(url)) void trusted(url).then(allowed => { if (!allowed) throw Error('This address is not a registered CIVIC project host'); return open(url) }).catch(report)
    else external(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const target = localReviewOrigin(url)
    if (!target) { event.preventDefault(); external(url); return }
    const destination = new URL(url)
    if (target !== origin && target !== new URL(window.webContents.getURL()).origin) {
      event.preventDefault()
      destination.searchParams.set('desktop', process.platform)
      void trusted(url).then(allowed => { if (!allowed) throw Error('This address is not a registered CIVIC project host'); return window.loadURL(destination.href) }).catch(report)
      return
    }
    if (destination.searchParams.get('desktop') !== process.platform) {
      event.preventDefault()
      destination.searchParams.set('desktop', process.platform)
      void window.loadURL(destination.href)
    }
  })
  const destination = new URL(url)
  destination.searchParams.set('desktop', process.platform)
  await window.loadURL(destination.href)
}
app.whenReady().then(() => open()).catch(error => { dialog.showErrorBox('Start the CIVIC server first', error.message); app.quit() })
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) void open() })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
