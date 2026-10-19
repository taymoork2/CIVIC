import assert from 'node:assert/strict'
import { test } from 'node:test'
import { projectWindows } from './project-windows.mjs'
import { trustedWindow } from './desktop-windows.mjs'

test('tab leases release owned hosts only after the last owner leaves', async () => {
  let closed = 0
  const windows = projectWindows({ current: 'main', origin: 'http://127.0.0.1:3012', limit: 2, createHost: async () => ({ url: 'http://127.0.0.1:4001/review', close: async () => { closed++ } }) })
  const a = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', b = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  await windows.open({ key: 'other' }, a); await windows.open({ key: 'other' }, b)
  assert.deepEqual(await windows.release('other', a), { closed: false })
  assert.deepEqual(await windows.release('other', 'unknown'), { closed: false })
  assert.equal((await windows.release('other', b)).closed, true)
  assert.equal(closed, 1)
  assert.deepEqual(windows.origins(), ['http://127.0.0.1:3012'])
  await windows.open({ key: 'next' }, a)
  await windows.open({ key: 'next' })
  assert.deepEqual(await windows.release('next', a), { closed: false }, 'A browser window pins a shared host')
  await assert.rejects(windows.open({ key: 'bad' }, 'invalid'), /Invalid project host lease/)
})

test('windows reuse one host per connection, including concurrent opens, and close owned hosts', async () => {
  let created = 0, closed = 0
  const windows = projectWindows({ current: 'orca', origin: 'http://127.0.0.1:3012', async createHost(project) { created++; return { url: `http://127.0.0.1:${4000 + created}/review`, close: async () => { closed++ } } } })
  assert.equal(await windows.open({ key: 'orca' }), 'http://127.0.0.1:3012/review')
  const results = await Promise.all([windows.open({ key: 'laundry' }), windows.open({ key: 'laundry' })])
  assert.equal(results[0], results[1]); assert.equal(created, 1)
  assert.deepEqual(windows.origins(), ['http://127.0.0.1:3012', 'http://127.0.0.1:4001'])
  await windows.close(); assert.equal(closed, 1)
})

test('a failed project host can retry without occupying the window limit', async () => {
  let fail = true
  const windows = projectWindows({ current: 'orca', origin: 'http://127.0.0.1:3012', limit: 2, async createHost() { if (fail) throw Error('Build failed'); return { url: 'http://127.0.0.1:4001/review' } } })
  await assert.rejects(windows.open({ key: 'laundry' }), /Build failed/)
  fail = false
  await windows.open({ key: 'laundry' })
  await assert.rejects(windows.open({ key: 'third' }), /limit/)
})

test('refreshing an owned window replaces its host on the same origin', async () => {
  const ports = [], closed = []
  const windows = projectWindows({ current: 'orca', origin: 'http://127.0.0.1:3012', async createHost(project, port = 4001) { ports.push(port); return { url: `http://127.0.0.1:${port}/review`, close: async () => { closed.push(project.key) } } } })
  await windows.open({ key: 'laundry' })
  await windows.refresh({ key: 'laundry' })
  assert.deepEqual(ports, [4001, 4001]); assert.deepEqual(closed, ['laundry'])
  assert.equal(await windows.open({ key: 'laundry' }), 'http://127.0.0.1:4001/review')
  await assert.rejects(windows.refresh({ key: 'orca' }), /owned project host/)
})

test('Electron admits only local origins registered by its original CIVIC host', async () => {
  const origin = 'http://127.0.0.1:3012', requested = []
  const fetcher = async (url, options) => { requested.push(url); assert.equal(options.credentials, 'include'); return { ok: true, json: async () => ({ origins: ['http://127.0.0.1:4001'] }) } }
  assert.equal(await trustedWindow(origin + '/review', origin, fetcher), true)
  assert.equal(await trustedWindow('https://example.com/review', origin, fetcher), false)
  assert.equal(await trustedWindow('http://user:secret@127.0.0.1:4001/review', origin, fetcher), false)
  assert.equal(await trustedWindow('http://127.0.0.1:4001/review', origin, fetcher), true)
  assert.equal(await trustedWindow('http://127.0.0.1:4002/review', origin, fetcher), false)
  assert.deepEqual(requested, [origin + '/api/review/projects', origin + '/api/review/projects'])
})
