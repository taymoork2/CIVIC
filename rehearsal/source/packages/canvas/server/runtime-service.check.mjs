import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadProject } from '@civic/vite-connector/project'
import { canvasRoot } from './canvas-root.mjs'
import { runtimeService } from './runtime-service.mjs'

const tasks = loadProject(canvasRoot, { manifest: `${canvasRoot}/examples/tasks/civic.project.json` })
const now = Date.UTC(2026, 9, 12, 9)

test('a fetch-handler backend runs per run with its persona, role and condition, and only writes are mutations', async (t) => {
  const service = runtimeService(tasks, () => 'source-one')
  t.after(() => service.close())
  const start = (fields = {}) => service.handle({ action: 'start', scenario: 'tasks.list', persona: 'planner', role: 'member', condition: 'normal', now, ...fields })
  const call = (run, method, path, body) => service.handle({ action: method === 'GET' ? 'query' : 'mutation', run, name: `${method}:${path}`, args: { query: '', ...(body ? { body: JSON.stringify(body), type: 'application/json' } : {}) } })
  const a = await start(), b = await start()
  assert.deepEqual(a.seed, { tasks: 2 })
  const created = await call(a.id, 'POST', '/api/tasks', { title: 'Call the plumber' })
  assert.equal(created.status, 201)
  assert.equal(JSON.parse(created.body).createdAt, new Date(now).toISOString(), 'the run clock is fixed')
  assert.equal(JSON.parse((await call(a.id, 'GET', '/api/tasks')).body).length, 3)
  assert.equal(JSON.parse((await call(b.id, 'GET', '/api/tasks')).body).length, 2, 'runs never share data')
  await service.handle({ action: 'reset', run: a.id })
  assert.equal(JSON.parse((await call(a.id, 'GET', '/api/tasks')).body).length, 2)
  assert.deepEqual((await service.handle({ action: 'state', run: a.id })).tasks.map((task) => task.title), ['Water the plants', 'Book the dentist'])
  const viewer = await start({ role: 'viewer' })
  assert.equal((await call(viewer.id, 'POST', '/api/tasks', { title: 'Nope' })).status, 403)
  const down = await start({ condition: 'api-down' })
  assert.equal((await call(down.id, 'GET', '/api/tasks')).status, 503)
  await assert.rejects(service.handle({ action: 'query', run: a.id, name: 'POST:/api/tasks', args: { query: '', body: '{}' } }), /Reads are queries and writes are mutations/)
  await assert.rejects(service.handle({ action: 'mutation', run: a.id, name: 'POST:/api/../secrets', args: {} }), /Invalid function name/)
  await assert.rejects(service.handle({ action: 'query', run: a.id, name: 'CONNECT:/api/tasks', args: {} }), /Invalid request name/)
})

test('a project without a runtime entry refuses live runs', async () => {
  const notebook = loadProject(canvasRoot, { manifest: `${canvasRoot}/examples/notebook/civic.project.json` })
  const service = runtimeService(notebook, () => 'source-one')
  await assert.rejects(service.handle({ action: 'start', scenario: 'demo.home', role: 'author', condition: 'normal' }), /no isolated data runtime/)
  await service.close()
})
