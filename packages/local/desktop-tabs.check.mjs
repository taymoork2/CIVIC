import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { projectTabs } from './desktop-tabs.mjs'

function fixture() {
  const events = [], views = []
  let permit = false
  const tabs = projectTabs({ limit: 2, acquire: async input => { events.push(`acquire:${input.key}`); if (input.key === 'fail') throw Error('Unavailable'); return input.key }, release: async input => events.push(`release:${input.key}`), confirm: async () => permit, createView: async url => {
    const view = { id: views.length + 1, show: () => events.push(`show:${url}`), hide: () => events.push(`hide:${url}`), destroy: () => events.push(`destroy:${url}`), focusScenario: id => events.push(`focus:${id}`) }
    views.push(view); return view
  } })
  return { tabs, events, views, allow: () => { permit = true } }
}
test('project tabs load on demand, deduplicate concurrent opens, and preserve their views', async () => {
  const { tabs, events } = fixture()
  await Promise.all([tabs.open({ appId: 'a', name: 'App A', key: 'a' }), tabs.open({ appId: 'a', name: 'App A', key: 'a' })])
  assert.equal(events.filter(event => event === 'acquire:a').length, 1)
  const id = tabs.snapshot().active
  await tabs.open({ appId: 'b', name: 'App B', key: 'b' })
  tabs.select(id)
  assert.equal(tabs.snapshot().tabs.length, 2)
  assert.ok(events.includes('hide:b'))
  assert.equal(events.some(event => event.startsWith('destroy')), false)
  await assert.rejects(tabs.open({ appId: 'c', name: 'App C', key: 'c' }), /maximum/)
  await tabs.close(id)
  assert.ok(events.includes('release:a'))
  assert.equal(tabs.snapshot().tabs.length, 1)
})
test('different checkouts keep separate views and closing preserves a dirty project until confirmed', async () => {
  const { tabs, events, views, allow } = fixture()
  await tabs.open({ appId: 'a', name: 'App A', key: 'a' })
  const id = tabs.snapshot().active
  tabs.register(views[0].id, { appId: 'a', name: 'App A', key: 'a', version: 'Main', dirty: true })
  await tabs.open({ appId: 'a', name: 'App A', key: 'other' })
  await tabs.close(id)
  assert.equal(tabs.snapshot().tabs.length, 2)
  assert.ok(events.includes('acquire:other'))
  assert.equal(events.includes('release:a'), false)
  assert.equal(await tabs.destroy(), false)
  allow()
  await tabs.close(id)
  assert.equal(tabs.snapshot().tabs.length, 1)
  assert.ok(events.includes('release:a'))
  assert.ok(await tabs.destroy())
  assert.ok(events.includes('release:other'))
})
test('failed opens release their lease and malformed tab requests are rejected', async () => {
  const { tabs, events } = fixture()
  await assert.rejects(tabs.open({ appId: 'a', name: 'App A', key: 'fail' }), /Unavailable/)
  assert.deepEqual(tabs.snapshot().tabs, [])
  assert.ok(events.includes('release:fail'))
  await assert.rejects(tabs.open({ appId: '', name: 'Bad', key: 'bad' }), /Invalid/)
  await tabs.open({ appId: 'a', name: 'App A', key: 'a', initial: true })
  await tabs.open({ appId: 'a', name: 'App A', key: 'a', scenario: 'home' })
  assert.ok(events.includes('focus:home'))
  await tabs.destroy()
  assert.equal(events.includes('release:a'), false, 'The original shared host stays running')
})

test('switching a checkout replaces its tab in place at the tab limit and releases the old host', async () => {
  const { tabs, events } = fixture()
  await tabs.open({ appId: 'a', name: 'App A', key: 'main' })
  const main = tabs.snapshot().active
  await tabs.open({ appId: 'b', name: 'App B', key: 'other-app' })
  const other = tabs.snapshot().active
  await tabs.open({ appId: 'a', name: 'App A', key: 'branch' }, main)
  const state = tabs.snapshot()
  assert.equal(state.tabs.length, 2)
  assert.equal(state.tabs[0].id, state.active)
  assert.equal(state.tabs[1].id, other)
  assert.ok(events.includes('destroy:main'))
  assert.ok(events.includes('release:main'))
  assert.equal(events.includes('destroy:other-app'), false)
  await tabs.open({ appId: 'b', name: 'App B', key: 'other-app' }, state.active)
  assert.equal(tabs.snapshot().active, other)
  assert.equal(tabs.snapshot().tabs.length, 2, 'An already open checkout is focused without discarding either view')
})

test('cancelled or failed checkout switches preserve the current view and its edits', async () => {
  const { tabs, events, views, allow } = fixture()
  await tabs.open({ appId: 'a', name: 'App A', key: 'main' })
  const main = tabs.snapshot().active
  tabs.register(views[0].id, { appId: 'a', name: 'App A', key: 'main', version: 'Main', dirty: true })
  await tabs.open({ appId: 'a', name: 'App A', key: 'branch' }, main)
  assert.equal(tabs.snapshot().active, main)
  assert.equal(tabs.snapshot().tabs.length, 1)
  assert.equal(tabs.snapshot().tabs[0].dirty, true)
  assert.ok(events.includes('release:branch'))
  assert.equal(events.includes('destroy:main'), false)
  await assert.rejects(tabs.open({ appId: 'a', name: 'App A', key: 'fail' }, main), /Unavailable/)
  assert.equal(tabs.snapshot().active, main)
  allow()
  await tabs.open({ appId: 'a', name: 'App A', key: 'branch' }, main)
  assert.equal(tabs.snapshot().tabs.length, 1)
  assert.ok(events.includes('destroy:main'))
})

test('a failed renderer load removes its pending tab and preserves the active view', async () => {
  const changed = [], released = []
  let controller
  controller = projectTabs({ acquire: async input => input.key, release: async input => released.push(input.key), confirm: async () => true, changed: state => changed.push(state.tabs.length), createView: async key => ({ id: key, show() {}, hide() {}, destroy() {}, load: async () => {
    if (key === 'broken') { controller.register(key, { appId: 'app', name: 'App', key, version: 'Loading', dirty: false }); throw Error('Load failed') }
  } }) })
  await controller.open({ appId: 'app', name: 'App', key: 'main' })
  const active = controller.snapshot().active
  await assert.rejects(controller.open({ appId: 'app', name: 'App', key: 'broken' }), /Load failed/)
  await assert.rejects(controller.open({ appId: 'app', name: 'App', key: 'broken' }, active), /Load failed/)
  assert.equal(controller.snapshot().active, active)
  assert.equal(changed.at(-1), 1)
  assert.deepEqual(released, ['broken', 'broken'])
})

test('preload combines independent draft guards and exposes no bridge to embedded frames', async () => {
  const source = await readFile(new URL('desktop-preload.cjs', import.meta.url), 'utf8')
  const calls = [], exposed = [], events = new Map()
  const require = name => { assert.equal(name, 'electron'); return { contextBridge: { exposeInMainWorld: (name, api) => exposed.push(api) }, ipcRenderer: { on: (name, listener) => events.set(name, listener), invoke: async (name, input) => calls.push({ name, input }) } } }
  runInNewContext(source, { require, process: { isMainFrame: false } })
  assert.equal(exposed.length, 0)
  runInNewContext(source, { require, process: { isMainFrame: true, versions: { electron: '44.9.0', chrome: '152.0.0', node: '26.0.0' } } })
  const api = exposed[0]
  let opened = 0
  events.get('civic-desktop:settings')()
  events.get('civic-desktop:settings')()
  const unsubscribe = api.onSettings(() => opened++)
  assert.equal(opened, 1, 'Settings requested during workspace loading opens once after subscribing')
  events.get('civic-desktop:settings')()
  assert.equal(opened, 2)
  unsubscribe()
  api.onSettings(() => opened++)
  assert.equal(opened, 2, 'A delivered request is never replayed')
  assert.equal(JSON.stringify(api.runtime), JSON.stringify({ electron: '44.9.0', chrome: '152.0.0' }))
  await api.setDraft('review', true)
  await api.register({ key: 'main', dirty: false })
  assert.equal(calls.at(-1).input.dirty, true)
  await api.setDraft('coverage', true)
  await api.setDraft('review', false)
  assert.equal(calls.at(-1).input.dirty, true)
  await api.setDraft('coverage', false)
  assert.equal(calls.at(-1).input.dirty, false)
  await api.register({ key: 'main', dirty: true })
  await api.setDraft('review', false)
  assert.equal(calls.at(-1).input.dirty, true)
})
