const { contextBridge, ipcRenderer } = require('electron')

if (process.isMainFrame) {
  let active = true
  let metadata
  const drafts = new Map()
  const register = () => metadata && ipcRenderer.invoke('civic-desktop:register', { ...metadata, dirty: metadata.dirty || [...drafts.values()].some(Boolean) })
  const subscribers = new Set(), focused = new Set(), settings = new Set(), appearance = new Set()
  let pendingSettings = false
  ipcRenderer.on('civic-desktop:state', (_event, state) => { active = state.visible; for (const listener of subscribers) listener(state) })
  ipcRenderer.on('civic-desktop:focus-scenario', (_event, id) => { for (const listener of focused) listener(id) })
  ipcRenderer.on('civic-desktop:settings', () => { pendingSettings = settings.size === 0; for (const listener of settings) listener() })
  ipcRenderer.on('civic-desktop:appearance', (_event, value) => { for (const listener of appearance) listener(value) })
  contextBridge.exposeInMainWorld('civicDesktop', {
    runtime: { electron: process.versions.electron, chrome: process.versions.chrome },
    state: () => ipcRenderer.invoke('civic-desktop:state').then(state => { active = state.visible; return state }),
    subscribe: listener => { subscribers.add(listener); return () => subscribers.delete(listener) },
    onFocusScenario: listener => { focused.add(listener); return () => focused.delete(listener) },
    onSettings: listener => { settings.add(listener); if (pendingSettings) { pendingSettings = false; listener() } return () => settings.delete(listener) },
    appearance: () => ipcRenderer.invoke('civic-desktop:appearance'),
    setAppearance: value => ipcRenderer.invoke('civic-desktop:set-appearance', value),
    onAppearance: listener => { appearance.add(listener); return () => appearance.delete(listener) },
    isActive: () => active,
    register: value => { metadata = value; return register() },
    setDraft: (name, dirty) => { drafts.set(name, Boolean(dirty)); return register() },
    openProject: value => ipcRenderer.invoke('civic-desktop:open', value),
    replaceProject: value => ipcRenderer.invoke('civic-desktop:replace', value),
    select: id => ipcRenderer.invoke('civic-desktop:select', id),
    close: id => ipcRenderer.invoke('civic-desktop:close', id),
  })
}
