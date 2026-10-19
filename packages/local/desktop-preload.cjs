const { contextBridge, ipcRenderer } = require('electron')

if (process.isMainFrame) {
  let active = true
  let metadata
  const drafts = new Map()
  const register = () => metadata && ipcRenderer.invoke('civic-desktop:register', { ...metadata, dirty: metadata.dirty || [...drafts.values()].some(Boolean) })
  const subscribers = new Set(), focused = new Set()
  ipcRenderer.on('civic-desktop:state', (_event, state) => { active = state.visible; for (const listener of subscribers) listener(state) })
  ipcRenderer.on('civic-desktop:focus-scenario', (_event, id) => { for (const listener of focused) listener(id) })
  contextBridge.exposeInMainWorld('civicDesktop', {
    state: () => ipcRenderer.invoke('civic-desktop:state').then(state => { active = state.visible; return state }),
    subscribe: listener => { subscribers.add(listener); return () => subscribers.delete(listener) },
    onFocusScenario: listener => { focused.add(listener); return () => focused.delete(listener) },
    isActive: () => active,
    register: value => { metadata = value; return register() },
    setDraft: (name, dirty) => { drafts.set(name, Boolean(dirty)); return register() },
    openProject: value => ipcRenderer.invoke('civic-desktop:open', value),
    select: id => ipcRenderer.invoke('civic-desktop:select', id),
    close: id => ipcRenderer.invoke('civic-desktop:close', id),
  })
}
