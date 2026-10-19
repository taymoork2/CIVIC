import { randomUUID } from 'node:crypto'

export function projectTabs({ acquire, release, createView, confirm, changed = () => {}, limit = 8 }) {
  const tabs = []
  let active, queue = Promise.resolve()
  const snapshot = () => ({ active, tabs: tabs.map(({ id, appId, name, version, dirty }) => ({ id, appId, name, version, dirty: Boolean(dirty) })) })
  const publish = () => changed(snapshot())
  const select = id => {
    const next = tabs.find(tab => tab.id === id)
    if (!next) throw Error('Unknown project tab')
    for (const tab of tabs) if (tab !== next) tab.view.hide()
    active = id; next.view.show(); publish()
  }
  const serial = work => { const result = queue.then(work); queue = result.catch(() => {}); return result }
  const dispose = async tab => { tab.view.destroy(); if (!tab.initial) await release(tab.selection, tab.lease) }
  return {
    snapshot,
    views: () => tabs.map(tab => tab.view),
    idForView: id => tabs.find(tab => tab.view.id === id)?.id,
    owns: id => tabs.some(tab => tab.view.id === id),
    register(id, input) {
      const tab = tabs.find(tab => tab.view.id === id)
      if (!tab) throw Error('Unknown project view')
      if (!input || !['appId', 'name', 'key', 'version'].every(key => typeof input[key] === 'string' && input[key].length <= 240) || typeof input.dirty !== 'boolean') throw Error('Invalid project tab metadata')
      Object.assign(tab, { appId: input.appId, name: input.name, version: input.version, key: input.key, dirty: input.dirty }); publish()
    },
    select,
    open(selection) { return serial(async () => {
      if (!selection || !['appId', 'name', 'key'].every(key => typeof selection[key] === 'string' && selection[key].length > 0 && selection[key].length <= 240) || selection.workspace !== undefined && typeof selection.workspace !== 'string' || selection.scenario !== undefined && (typeof selection.scenario !== 'string' || selection.scenario.length > 240)) throw Error('Invalid project tab')
      const previous = tabs.find(tab => tab.appId === selection.appId && tab.key === selection.key && tab.selection.workspace === selection.workspace)
      if (previous) { select(previous.id); if (selection.scenario) previous.view.focusScenario(selection.scenario); return snapshot() }
      if (tabs.length >= limit) throw Error(`Close a project tab before opening another (${limit} maximum).`)
      const lease = randomUUID(), initial = Boolean(selection.initial)
      let view, tab
      try {
        const url = await acquire(selection, lease)
        view = await createView(url, selection)
        tab = { id: randomUUID(), appId: selection.appId, name: selection.name, key: selection.key, version: '', selection, lease, initial, view }
        tabs.push(tab)
        await view.load?.()
      } catch (error) {
        if (tab) tabs.splice(tabs.indexOf(tab), 1)
        view?.destroy()
        if (!initial) await release(selection, lease).catch(() => {})
        publish()
        throw error
      }
      select(tab.id)
      return snapshot()
    }) },
    close(id) { return serial(async () => {
      const tab = tabs.find(tab => tab.id === id)
      if (!tab) throw Error('Unknown project tab')
      if (tab.dirty && !await confirm(tab.name, 'close project')) return snapshot()
      const index = tabs.indexOf(tab)
      tabs.splice(index, 1)
      if (tabs.length && active === id) select(tabs[Math.min(index, tabs.length - 1)].id)
      if (!tabs.length) active = undefined
      await dispose(tab); publish(); return snapshot()
    }) },
    destroy() { return serial(async () => {
      for (const tab of tabs) if (tab.dirty && !await confirm(tab.name, 'close window')) return false
      const previous = tabs.splice(0); active = undefined
      await Promise.all(previous.map(dispose)); publish(); return true
    }) },
  }
}
