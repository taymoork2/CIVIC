import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, symlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { projectPicker } from './review-projects.mjs'
import { loadProject } from './review-project.mjs'
import { reviewMiddleware } from '@civic/shell/server'
import { laundryReviewAdapter } from './review-adapter.mjs'

const template = resolve('examples/rehearsal-demo')
test('picker connects without app writes, creates a playable starter, validates paths and retains host settings', async () => {
  const repo = await realpath(await mkdtemp(join(await realpath(tmpdir()), 'rehearsal-picker-')))
  await mkdir(join(repo, 'apps/web/examples'), { recursive: true })
  await cp(template, join(repo, 'apps/web/examples/rehearsal-demo'), { recursive: true })
  const current = loadProject(repo, { manifest: join(template, 'rehearsal.project.json'), applicationRoot: template })
  const picker = await projectPicker(repo, current)
  const app = join(repo, 'existing-app')
  await mkdir(join(app, 'src'), { recursive: true })
  await writeFile(join(app, 'src/screen.ts'), 'export function Home() {}')
  const connected = await picker.add({ kind: 'existing', root: app, source: 'src', name: 'Existing app' })
  assert.equal(connected.preview, false)
  assert.deepEqual(await readdir(app), ['src'])
  assert.equal(await readFile(join(app, 'src/screen.ts'), 'utf8'), 'export function Home() {}')
  const known = await picker.add({ kind: 'existing', root: template })
  assert.equal(known.key, current.key)
  const created = await picker.add({ kind: 'new', name: 'New app' })
  assert.equal(created.preview, true)
  const list = await picker.list()
  assert.equal(list.projects.length, 3)
  const starter = list.projects.find((row) => row.key === created.key)
  assert.ok(starter.root.startsWith(join(repo, 'rehearsal-projects/')))
  assert.equal(JSON.parse(await readFile(join(starter.root, 'rehearsal.scenarios.json'))).length, 4)
  for (const source of ['../src', '.env', 'node_modules', '/etc', '.git']) await assert.rejects(picker.add({ kind: 'existing', root: app, name: 'Bad path', source }))
  await symlink(await realpath(tmpdir()), join(app, 'escape'))
  await assert.rejects(picker.add({ kind: 'existing', root: app, name: 'Escape', source: 'escape' }), /escapes checkout/)
  await assert.rejects(picker.add({ kind: 'existing', root: app, manifest: '../rehearsal.project.json' }))
  await assert.rejects(picker.select('missing-project'), /Unknown/)
  await writeFile(join(repo, '.review-data/application.json'), JSON.stringify({ publicOrigin: 'https://host.example.ts.net:10445', preserved: true }))
  const before = { project: process.env.REHEARSAL_PROJECT, root: process.env.REHEARSAL_APP_ROOT }
  try {
    const result = await picker.select(created.key)
    assert.equal(result.restarting, true)
    const local = JSON.parse(await readFile(join(repo, '.review-data/application.json')))
    assert.equal(local.root, starter.root); assert.equal(local.publicOrigin, 'https://host.example.ts.net:10445'); assert.equal(local.preserved, true)
    assert.equal(loadProject(repo).key, created.key)
    const resumed = await projectPicker(repo, loadProject(repo))
    assert.equal((await resumed.list()).projects.length, 3)
    await writeFile(join(starter.root, 'rehearsal.scenarios.json'), '{}')
    assert.equal((await resumed.list()).projects.find((row) => row.key === created.key).available, false)
    await assert.rejects(resumed.select(created.key), /invalid scenario/)
  } finally {
    for (const [key, value] of [['REHEARSAL_PROJECT', before.project], ['REHEARSAL_APP_ROOT', before.root]]) if (value === undefined) delete process.env[key]; else process.env[key] = value
  }
})

test('project API uses review authentication, refuses foreign origins and stale tabs, then requests restart after selection', async () => {
  const dataDir = await mkdtemp(join(await realpath(tmpdir()), 'rehearsal-picker-http-'))
  let selected = false, restarted = false
  const middleware = await reviewMiddleware({ dataDir, metadata: { project: { key: 'current' }, scenarios: [], revision: {} }, capture: async () => Buffer.from('png'), adapter: laundryReviewAdapter, projects: { list: async () => ({ active: 'current', projects: [] }), add: async () => ({ key: 'new' }), select: async () => { selected = true; return { key: 'new', restarting: true } } }, restart: () => { restarted = true } })
  const server = createServer((req, res) => void middleware(req, res, () => res.end('review')))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  try {
    assert.equal((await fetch(origin + '/api/review/projects')).status, 401)
    const entry = await fetch(origin + '/review')
    const cookie = entry.headers.get('set-cookie').split(';')[0]
    const headers = { cookie, origin, 'content-type': 'application/json', 'x-rehearsal-project': 'current' }
    assert.equal((await fetch(origin + '/api/review/projects', { headers })).status, 200)
    assert.equal((await fetch(origin + '/api/review/projects', { method: 'POST', headers: { ...headers, origin: 'https://foreign.invalid' }, body: '{"action":"select","key":"new"}' })).status, 403)
    assert.equal((await fetch(origin + '/api/review/coverage', { method: 'POST', headers: { ...headers, 'x-rehearsal-project': 'previous-project' }, body: '{}' })).status, 409)
    await writeFile(join(dataDir, 'feedback.json'), JSON.stringify([{ deliveries: [{ status: 'accepted' }] }]))
    assert.equal((await fetch(origin + '/api/review/projects', { method: 'POST', headers, body: '{"action":"select","key":"new"}' })).status, 409)
    assert.equal(selected, false)
    await writeFile(join(dataDir, 'feedback.json'), '[]')
    const response = await fetch(origin + '/api/review/projects', { method: 'POST', headers, body: '{"action":"select","key":"new"}' })
    assert.equal(response.status, 200); assert.equal(selected, true)
    await new Promise((resolve) => setTimeout(resolve, 150)); assert.equal(restarted, true)
  } finally { await new Promise((resolve) => server.close(resolve)) }
})
