import assert from 'node:assert/strict'
import { test } from 'node:test'
import { serverFunctionOperations } from './server-functions.mjs'
import { backendCoverage } from '../../shell/server/backend-coverage.mjs'
import { backendInventory } from './backend-coverage.mjs'
import { fileURLToPath } from 'node:url'
import { readFile, mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import nodePath from 'node:path'

const { join } = nodePath

test('Convex inventory derives all kinds, nested identities and registered HTTP routes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'convex-inventory-'))
  await mkdir(join(root, 'backend/nested'), { recursive: true })
  await mkdir(join(root, 'backend/_generated'))
  const kinds = ['query', 'mutation', 'action', 'internalQuery', 'internalMutation', 'internalAction']
  await writeFile(join(root, 'backend/nested/items.ts'), `import { ${kinds.join(', ')} } from '../_generated/server'
${kinds.map(kind => `export const ${kind}Item = ${kind}({ handler: () => 1 })`).join('\n')}
// export const phantom = query({ handler: () => 0 })`)
  await writeFile(join(root, 'backend/http.ts'), `import { httpAction } from './_generated/server'
import { httpRouter } from 'convex/server'
const http = httpRouter()
const handler = httpAction(() => new Response())
http.route({ 'path': '/hook', method: 'POST', handler })
export default http`)
  await writeFile(join(root, 'other.ts'), 'const query = x => x; export const fake = query({})')
  await writeFile(join(root, 'backend/default.ts'), "import { query as q } from './_generated/server'; export default q({ handler: () => 1 })")
  await writeFile(join(root, 'backend/_generated/server.ts'), 'invalid generated source')
  const operations = await backendInventory({ root, sources: [root], manifest: { adapter: {} } })
  assert.equal(operations.length, 8)
  assert.ok(operations.some(row => row.id === 'default' && row.export === 'default'))
  assert.ok(operations.every(row => row.detector === 'convex'))
  for (const kind of kinds) assert.ok(operations.some(row => row.id === `nested/items:${kind}Item` && row.kind === kind.replace(/^internal/u, '').toLowerCase()))
  assert.ok(operations.some(row => row.id === 'POST:/hook' && row.kind === 'route'))
  const tape = { project: 'p', source: 's', seed: { context: { scenario: 'home' } }, steps: [{ operations: [{ name: 'nested/items:queryItem' }, { name: 'nested/items:internalActionItem' }] }] }
  const replay = { schema: 'civic.replay/0', project: 'p', source: 's', scenario: 'home', tape: 'hash', steps: 1, outcome: 'pass' }
  const report = backendCoverage(operations, new Map([['hash', tape]]), [replay], { project: 'p', source: 's', journeys: [{ id: 'journey', scenarios: ['home'] }] })
  assert.deepEqual(report.unreachedInternal, ['nested/items:internalMutationItem', 'nested/items:internalQueryItem'])
  assert.deepEqual(report.unreached, ['default', 'nested/items:actionItem', 'nested/items:mutationItem', 'POST:/hook'])
  assert.equal(report.operations.filter(row => row.reachedBy.length).length, 2)
})

test('HTTP inventories are the routing tables used by both synthetic APIs', async () => {
  await Promise.all(['tasks', 'team-board'].map(async app => {
    const root = fileURLToPath(new URL('../examples/' + app, import.meta.url))
    const manifest = JSON.parse(await readFile(root + '/civic.project.json', 'utf8'))
    const operations = await backendInventory({ root, manifestRoot: root, sources: [root + '/src', root + '/server'], manifest })
    const { createApi } = await import('../examples/' + app + '/server/api.js')
    await Promise.all(operations.map(async operation => {
      const api = createApi({ tasks: [{ id: '1', title: 'Task' }], next: 2, canWrite: true, users: [{ id: 'user', name: 'User', canPost: true }], sessions: new Map([['session', 'user']]), posts: [] })
      const [method, ...path] = operation.id.split(':')
      const response = await api.fetch(new Request('http://synthetic.test' + path.join(':').replace(':id', '1'), { method, headers: { cookie: 'sid=session' }, body: method === 'POST' || method === 'PATCH' ? JSON.stringify({ title: 'New task', text: 'New post', done: true }) : undefined }))
      const expected = operation.id === 'POST:/api/session' ? 401 : method === 'DELETE' ? 204 : method === 'POST' ? 201 : 200
      assert.equal(response.status, expected, operation.id)
    }))
    assert.equal(operations.length, app === 'tasks' ? 3 : 5)
  }))
})

test('parameterized HTTP routes reach their inventory identity; refused calls do not', () => {
  const operations = [{ id: 'PATCH:/api/tasks/:id', file: 'api.js', export: 'updateTask', kind: 'route' }]
  const tape = { project: 'p', source: 's', seed: { context: { scenario: 'home' } }, steps: [{ operations: [{ name: 'PATCH:/api/tasks/1', result: { status: 200 } }] }] }
  const replay = { schema: 'civic.replay/0', project: 'p', source: 's', scenario: 'home', tape: 'hash', steps: 1, outcome: 'pass' }
  const report = () => backendCoverage(operations, new Map([['hash', tape]]), [replay], { project: 'p', source: 's', journeys: [{ id: 'journey', scenarios: ['home'] }] })
  assert.deepEqual(report().operations[0].reachedBy, ['journey'])
  tape.steps[0].operations[0].result.status = 403
  assert.deepEqual(report().unreached, ['PATCH:/api/tasks/:id'])
})

test('inventory uses the transform identities, including aliased factories and unloaded operations', () => {
  const operations = serverFunctionOperations(`import { createServerFn as fn } from '@tanstack/react-start'
export const unused = fn({ method: 'GET' }).handler(() => 1)
// const phantom = fn({ method: 'POST' }).handler(() => 0)
export const save = fn({ method: 'POST' }).handler(() => 2)`, 'src/api.ts')
  assert.deepEqual(operations.map(row => row.id), ['serverFn:src/api.ts:unused', 'serverFn:src/api.ts:save'])
  assert.deepEqual(serverFunctionOperations('export const other = () => 1', 'other.ts'), [])
})

test('only the verified prefix of the latest source-bound replay reaches graph journeys', () => {
  const operations = ['read', 'write', 'unused'].map(id => ({ id, file: 'api.ts', export: id, kind: 'rpc' }))
  const tape = { project: 'p', source: 's', seed: { context: { scenario: 'home' } }, steps: [{ operations: [{ name: 'read' }] }, { operations: [{ name: 'write' }] }] }
  const replay = { schema: 'civic.replay/0', project: 'p', source: 's', scenario: 'home', tape: 'hash', steps: 2, outcome: 'pass', replayedAt: '1' }
  const options = { project: 'p', source: 's', journeys: [{ id: 'journey', scenarios: ['home'] }] }
  const report = rows => backendCoverage(operations, new Map([['hash', tape]]), rows, options)
  assert.deepEqual(report([]).unreached, ['read', 'unused', 'write'])
  assert.deepEqual(report([replay]).unreached, ['unused'])
  assert.deepEqual(report([replay, { ...replay, outcome: 'fail', divergedAt: 2, replayedAt: '2' }]).unreached, ['unused', 'write'])
  assert.deepEqual(report([{ ...replay, outcome: 'fail', divergedAt: 1 }]).unreached, ['read', 'unused', 'write'])
  assert.deepEqual(report([{ ...replay, source: 'old' }]).unreached, ['read', 'unused', 'write'])
  assert.deepEqual(report([{ ...replay, steps: 3 }]).unreached, ['read', 'unused', 'write'])
})
