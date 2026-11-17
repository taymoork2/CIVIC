import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, writeFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import nodePath from 'node:path'
import { backendInventory } from './backend-coverage.mjs'
import { backendCoverage } from '../../shell/server/backend-coverage.mjs'
import { checkedProject, loadProject } from '../../vite-connector/src/review-project.mjs'

const { join } = nodePath

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'openapi-'))
  const manifest = { version: 1, id: 'contract', name: 'Contract', adapter: { kind: 'module', contracts: ['openapi.json'] }, sources: ['src'], scenarios: 'scenarios.json', coverage: 'coverage.json', navigation: ['Home'], personas: [{ id: 'default', label: 'Default' }], roles: [{ id: 'user', label: 'User' }], conditions: [{ id: 'normal', label: 'Normal' }] }
  const document = { openapi: '3.1.0', servers: [{ url: 'https://synthetic.invalid/api' }], paths: { '/orders/{id}': { get: { operationId: 'order' } }, '/unused': { post: {} } } }
  await writeFile(join(root, 'openapi.json'), JSON.stringify(document))
  return { root, sources: [root], manifest, document }
}

test('OpenAPI inventory merges source routes and matches recorded HTTP request identities', async () => {
  const project = await fixture()
  await writeFile(join(project.root, 'api.mjs'), "import express from 'express'; const app = express(); app.get('/api/orders/:id', handler)")
  const inventory = await backendInventory(project)
  assert.equal(inventory.length, 2)
  assert.equal(inventory.find(row => row.inContract).detector, 'express')
  assert.equal(inventory.find(row => row.evidence === 'contract').id, 'POST /api/unused')
  const tape = { project: 'p', source: 's', seed: { context: { scenario: 'home' } }, steps: [{ operations: [{ name: 'GET:/api/orders/42?expand=true' }, { name: 'GET:/api/missing', result: { status: 404 } }, { name: 'rpc:other' }] }] }
  const replay = { schema: 'civic.replay/0', project: 'p', source: 's', scenario: 'home', tape: 'hash', steps: 1, outcome: 'pass' }
  const options = { project: 'p', source: 's', journeys: [{ id: 'journey', scenarios: ['home'] }], contracts: true }
  const report = backendCoverage(inventory, new Map([['hash', tape]]), [replay], options)
  assert.deepEqual(report.unreached, ['POST /api/unused'])
  assert.deepEqual(report.operations.find(row => row.inContract).reachedBy, ['journey'])
  assert.deepEqual(report.outsideContract, ['GET /api/missing'])
  assert.equal(backendCoverage(inventory, new Map(), [], { ...options, contracts: false }).outsideContract, undefined)
})

test('contract-only evidence, multiple servers, malformed documents and confinement', async () => {
  const project = await fixture()
  const initial = await backendInventory(project)
  assert.equal(initial[0].export, 'order')
  assert.equal(initial[0].evidence, 'contract')
  project.document.servers.push({ url: '/other' })
  await writeFile(join(project.root, 'openapi.json'), JSON.stringify(project.document))
  const multiple = await backendInventory(project)
  assert.equal(multiple[0].id, 'GET /orders/:id')
  await writeFile(join(project.root, 'openapi.json'), '{"openapi":"2.0","paths":{}}')
  await assert.rejects(backendInventory(project), /Invalid OpenAPI/u)
  const outside = await fixture()
  await symlink(join(outside.root, 'openapi.json'), join(project.root, 'escape.json'))
  project.manifest.adapter.contracts = ['escape.json']
  await assert.rejects(backendInventory(project), /escapes checkout/u)
})

test('manifest contracts reject invalid fields, traversal, absolute paths and symlink escapes', async () => {
  const project = await fixture()
  for (const contracts of ['openapi.json', [42], ['../outside.json'], ['/outside.json'], ['a\\b'], ['a', 'a']]) assert.throws(() => checkedProject({ ...project.manifest, adapter: { kind: 'module', contracts } }))
  assert.equal(checkedProject(project.manifest), project.manifest)
  project.manifest.sources = ['.']
  await writeFile(join(project.root, 'civic.json'), JSON.stringify(project.manifest))
  project.manifest.adapter.contracts = ['../outside.json']
  assert.throws(() => checkedProject(project.manifest), /relative path/u)
  // Loading enforces physical confinement as well as manifest syntax.
  const outside = await fixture()
  await symlink(join(outside.root, 'openapi.json'), join(project.root, 'escape.json'))
  project.manifest.sources = ['src']
  const { mkdir } = await import('node:fs/promises')
  await mkdir(join(project.root, 'src'))
  project.manifest.adapter.contracts = ['escape.json']
  await writeFile(join(project.root, 'civic.json'), JSON.stringify(project.manifest))
  assert.throws(() => loadProject(project.root), /escapes checkout/u)
})

test('editing a declared contract changes the revision, so older replays become stale', async () => {
  const { reviewInventory } = await import('../../vite-connector/src/review-inventory.mjs')
  const { mkdir } = await import('node:fs/promises')
  const project = await fixture()
  await mkdir(join(project.root, 'src'))
  await Promise.all([['civic.json', project.manifest], ['scenarios.json', []], ['coverage.json', { version: 1, targets: [] }]].map(([file, content]) => writeFile(join(project.root, file), JSON.stringify(content))))
  const revision = async () => {
    const { metadata } = await reviewInventory(project.root, null, project.root, undefined, { engineRoots: [] })
    return metadata.revision.source
  }
  const before = await revision()
  assert.equal(await revision(), before)
  await writeFile(join(project.root, 'openapi.json'), JSON.stringify({ ...project.document, paths: { ...project.document.paths, '/added': { get: {} } } }))
  assert.notEqual(await revision(), before)
})

test('a passing replay outside every declared journey credits its scenario, not nothing', () => {
  const operations = [{ id: 'GET /api/orders/:id', kind: 'route' }, { id: 'POST /api/unused', kind: 'route' }]
  const tape = { project: 'p', source: 's', seed: { context: { scenario: 'orphan' } }, steps: [{ operations: [{ name: 'GET:/api/orders/7' }] }] }
  const replay = { schema: 'civic.replay/0', project: 'p', source: 's', scenario: 'orphan', tape: 'hash', steps: 1, outcome: 'pass' }
  const report = backendCoverage(operations, new Map([['hash', tape]]), [replay], { project: 'p', source: 's', journeys: [{ id: 'journey', scenarios: ['other'] }] })
  assert.deepEqual(report.operations.find(row => row.id === 'GET /api/orders/:id').reachedBy, ['scenario:orphan'])
  assert.deepEqual(report.unreached, ['POST /api/unused'])
})
