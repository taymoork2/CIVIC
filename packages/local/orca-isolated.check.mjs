import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copyFile, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { connectIsolatedOrca, isolatedOrcaConnector } from './orca-isolated.mjs'
import { loadProject } from '../vite-connector/src/review-project.mjs'
import { reviewInventory } from '../vite-connector/src/review-inventory.mjs'

test('dependency failure leaves an existing isolated connection and its coverage untouched', async () => {
  const store = await mkdtemp(join(tmpdir(), 'civic-isolated-previous-')), source = join(store, 'source'), folder = join(store, 'projects/orca-isolated')
  await mkdir(source); await mkdir(folder, { recursive: true })
  const files = { 'civic.project.json': '{"previous":"connection"}', 'receipt.json': '{"previous":"build"}', 'civic.coverage.json': '{"version":4,"targets":[{"id":"saved"}]}' }
  for (const [file, content] of Object.entries(files)) await writeFile(join(folder, file), content)
  await assert.rejects(connectIsolatedOrca(store, source, {}), /effect\/Effect/)
  for (const [file, content] of Object.entries(files)) assert.equal(await readFile(join(folder, file), 'utf8'), content)
})

test('frozen preview inventory and capture identity stay bound to captured files while the checkout changes', async () => {
  const store = await mkdtemp(join(tmpdir(), 'civic-orca-frozen-')), source = join(store, 'checkout'), folder = join(store, 'connection'), frozen = join(folder, 'builds/captured/source')
  for (const root of [source, frozen]) { await mkdir(join(root, 'apps/web/src'), { recursive: true }); await writeFile(join(root, 'apps/web/src/home.tsx'), root === source ? 'active worktree' : 'frozen screen') }
  const manifest = { version: 1, id: 'orca-frozen', name: 'Orca', adapter: { kind: 'orca-isolated', entry: 'builds/captured/preview.mjs' }, sources: ['apps/web/src'], scenarios: 'scenarios.json', coverage: 'coverage.json', personas: [{ id: 'owner', label: 'Owner' }], roles: [{ id: 'owner', label: 'Owner' }], conditions: [{ id: 'normal', label: 'Normal' }], navigation: ['Screens'] }
  await writeFile(join(folder, 'civic.project.json'), JSON.stringify(manifest))
  await writeFile(join(folder, 'scenarios.json'), JSON.stringify([{ id: 'orca.home', label: 'Home', journey: 'Orca', component: 'apps/web/src/home.tsx', fixture: { name: 'home' }, edges: [], captureFields: [] }]))
  await writeFile(join(folder, 'coverage.json'), '{"version":1,"targets":[]}')
  await writeFile(join(folder, 'builds/captured/preview.mjs'), 'export function mount() {}')
  await writeFile(join(folder, 'receipt.json'), JSON.stringify({ source, worktreeBuild: 'builds/captured', worktreeHash: 'a'.repeat(64), ui: 'b'.repeat(40) }))
  await mkdir(join(store, '.review-data'))
  await writeFile(join(store, '.review-data/application.json'), JSON.stringify({ root: source, project: join(folder, 'civic.project.json') }))
  const first = await isolatedOrcaConnector.inventory(store)
  assert.equal(first.evidence.get('apps/web/src/home.tsx'), 'frozen screen')
  assert.equal(first.metadata.revision.head, 'b'.repeat(40))
  await writeFile(join(source, 'apps/web/src/home.tsx'), 'new unsaved redesign')
  const next = await isolatedOrcaConnector.inventory(store)
  assert.equal(next.metadata.revision.source, first.metadata.revision.source)
  assert.equal(next.metadata.fixtureSource, first.metadata.fixtureSource)
  assert.equal(next.metadata.scenarios[0].fixture.componentError, undefined)
  assert.equal(next.metadata.connection.applicationRoot, await realpath(source))
  const project = loadProject(store)
  await writeFile(join(store, '.review-data/application.json'), JSON.stringify({ root: join(store, 'other-checkout'), project: join(store, 'other-project.json') }))
  const tab = await reviewInventory(store, undefined, source, project, { connector: isolatedOrcaConnector })
  assert.equal(tab.metadata.scenarios[0].id, 'orca.home', 'A tab indexes its selected project instead of the shared workspace selection')
  assert.equal(tab.evidence.get('apps/web/src/home.tsx'), 'frozen screen')
})

test('actual Orca store accepts owned writes and refuses host, provider and outside-path commands', { skip: !process.env.CIVIC_ORCA_SOURCE }, async () => {
  const folder = await mkdtemp(join(tmpdir(), 'civic-orca-check-'))
  await copyFile(new URL('./orca-isolated-runtime.mjs', import.meta.url), join(folder, 'runtime.mjs'))
  const react = Boolean(JSON.parse(await readFile(join(process.env.CIVIC_ORCA_SOURCE, 'apps/web/package.json'), 'utf8')).dependencies?.react)
  await writeFile(join(folder, 'receipt.json'), JSON.stringify({ source: process.env.CIVIC_ORCA_SOURCE, ui: 'test', server: 'test', screenDrafts: react }))
  const { createRuntime } = await import(pathToFileURL(join(folder, 'runtime.mjs')))
  const runtime = await createRuntime(), initial = await runtime.state()
  assert.equal(initial.snapshot.projects.length, 1)
  await runtime.execute('mutation', 'command', { _tag: 'SaveAppSettings', settings: { autoFallback: false } })
  assert.equal((await runtime.state()).settings.autoFallback, false)
  if (react) {
    const learning = await runtime.execute('query', 'command', { _tag: 'GetLearning' })
    assert.deepEqual(learning.interventions, [])
    const problems = await runtime.execute('query', 'command', { _tag: 'GetIncidents' })
    assert.deepEqual(problems.incidents, [])
    const catalog = await runtime.execute('query', 'command', { _tag: 'GetHarnessCatalog', refresh: true })
    assert.deepEqual(catalog.harnesses, [], 'Synthetic catalogs never discover or probe installed providers')
    assert.deepEqual(catalog.accounts, [])
    assert.deepEqual((await runtime.execute('query', 'command', { _tag: 'GetGuidance' })).rules, [])
    await runtime.execute('mutation', 'command', { _tag: 'MarkSeen', workItemId: runtime.seed.workItemId, at: '2026-10-20T00:00:00.000Z' })
    assert.equal((await runtime.state()).snapshot.workItems[0].seenAt, '2026-10-20T00:00:00.000Z')
    await assert.rejects(runtime.execute('mutation', 'command', { _tag: 'GetLearning' }), /cannot execute/)
  }
  await assert.rejects(runtime.execute('query', 'command', { _tag: 'SaveAppSettings', settings: {} }), /cannot execute/)
  for (const command of [{ _tag: 'RestartServer' }, { _tag: 'ListHarnesses' }, { _tag: 'CreateProject', name: 'Outside', path: '/Users/taymoor/Projects/orca' }, { _tag: 'SaveProjectSettings', projectId: runtime.seed.projectId, target: 'file', settings: {} }]) await assert.rejects(runtime.execute('mutation', 'command', command), /cannot execute|disposable|isolated database/)
  assert.equal((await runtime.state()).snapshot.projects.length, 1)
  await runtime.execute('mutation', 'command', { _tag: 'CreateProject', name: 'Owned', path: runtime.seed.projectPath })
  const state = await runtime.state()
  assert.equal(state.snapshot.projects.length, 2)
  assert.ok(state.snapshot.sessions.every(session => session.status === 'detached'))
})
