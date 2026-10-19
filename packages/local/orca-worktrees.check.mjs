import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { buildWorktree, checkDependencyLock, worktreeHash } from './orca-worktrees.mjs'
import { loadProject, checkedScenarios } from '../vite-connector/src/review-project.mjs'
import { isolatedOrcaAssets } from './orca-isolated.mjs'

test('worktree freshness tracks source and ignores unrelated docs without writing to the source', async () => {
  const source = await mkdtemp(join(tmpdir(), 'civic-worktree-hash-'))
  await mkdir(join(source, 'apps/web/src'), { recursive: true })
  await writeFile(join(source, 'apps/web/src/test.tsx'), 'first')
  const first = await worktreeHash(source)
  await writeFile(join(source, 'notes.md'), 'unrelated documentation')
  assert.equal(await worktreeHash(source), first)
  await writeFile(join(source, 'apps/web/src/test.tsx'), 'second')
  assert.notEqual(await worktreeHash(source), first)
})
test('dependency reuse accepts extra installed pins and rejects changed resolution or peers', () => {
  const lock = "lockfileVersion: '9.0'\n\npackages:\n\n  lib@1:\n    resolution: {integrity: abc}\n\nsnapshots:\n\n  lib@1: {}\n"
  checkDependencyLock(lock, lock.replace('snapshots:', '  extra@2: {}\n\nsnapshots:').replace('  lib@1: {}', '  lib@1: {}\n\n  extra@2: {}'))
  assert.throws(() => checkDependencyLock(lock, lock.replace('abc', 'wrong')), /pinned dependencies/)
  assert.throws(() => checkDependencyLock(lock, lock.replace('9.0', '8.0')), /format/)
})
test('runtime dependency checks resolve the exact snapshot without importing application code', async () => {
  const { checkRuntimeDependencies } = await import('./orca-worktrees.mjs')
  const source = await mkdtemp(join(tmpdir(), 'civic-runtime-dependencies-'))
  await assert.rejects(checkRuntimeDependencies(source), /effect\/Effect/)
  const effect = join(source, 'apps/server/node_modules/effect')
  await mkdir(effect, { recursive: true })
  await writeFile(join(effect, 'package.json'), JSON.stringify({ name: 'effect', exports: Object.fromEntries(['Effect', 'Scope', 'Schema'].map(name => [`./${name}`, `./${name}.js`])) }))
  for (const name of ['Effect', 'Scope', 'Schema']) await writeFile(join(effect, `${name}.js`), 'throw Error("Dependency checks must never execute this file")')
  await checkRuntimeDependencies(source)
})
test('a cached build with missing runtime dependencies is refused without changing the previous build or evidence', async () => {
  const store = await mkdtemp(join(tmpdir(), 'civic-previous-build-')), source = join(store, 'checkout')
  await mkdir(source)
  const hash = await worktreeHash(source)
  const id = `orca-worktree-${createHash('sha256').update(source).digest('hex').slice(0, 12)}`, folder = join(store, 'projects', id)
  await mkdir(folder, { recursive: true })
  const values = { 'receipt.json': JSON.stringify({ worktreeHash: hash, ui: 'test', dirty: false, worktreeBuild: 'builds/prior' }), 'civic.project.json': '{"previous":"build"}', 'feedback.json': '[{"saved":"review"}]' }
  for (const [file, content] of Object.entries(values)) await writeFile(join(folder, file), content)
  await assert.rejects(buildWorktree(store, source, { path: source, revision: 'test', dirty: false }), /effect\/Effect/)
  for (const [file, content] of Object.entries(values)) assert.equal(await readFile(join(folder, file), 'utf8'), content)
})
test('an actual worktree builds real screens/components, retains stable identity and isolated writes', { skip: !process.env.CIVIC_ORCA_SOURCE }, async () => {
  const store = await mkdtemp(join(tmpdir(), 'civic-worktree-build-')), source = process.env.CIVIC_ORCA_SOURCE
  const before = await worktreeHash(source)
  const tree = { path: source, branch: 'orca/test-draft', revision: 'test', dirty: false }
  const connection = await buildWorktree(store, source, tree)
  const project = loadProject(store, { manifest: connection.manifest, applicationRoot: source })
  const scenarios = checkedScenarios(JSON.parse(await readFile(project.scenariosPath)), project)
  assert.equal(scenarios.filter(row => row.route).length, 7)
  assert.equal(scenarios.filter(row => row.fixture.component).length, 20)
  assert.equal(scenarios.find(row => row.fixture.name === 'home').targetId, 'orca.screen.home')
  assert.equal(await worktreeHash(source), before)
  const folder = dirname(connection.manifest), receiptBefore = await readFile(join(folder, 'receipt.json'), 'utf8')
  await writeFile(join(folder, 'civic.coverage.json'), '{"version":1,"targets":[{"id":"saved"}]}')
  assert.deepEqual(await buildWorktree(store, source, tree), connection)
  assert.equal(await readFile(join(folder, 'receipt.json'), 'utf8'), receiptBefore)
  assert.match(await readFile(join(folder, 'civic.coverage.json'), 'utf8'), /saved/)
  const { createRuntime } = await import(pathToFileURL(project.runtimeEntry))
  const runtime = await createRuntime(), state = await runtime.state()
  assert.equal(state.snapshot.workItems.length, 1)
  assert.equal(state.snapshot.sessions.find(row => row.id === runtime.seed.sessionId).status, 'detached')
  assert.ok(state.snapshot.sessions.some(row => row.role === 'assistant' && row.projectId === null))
  await assert.rejects(runtime.execute('mutation', 'command', { _tag: 'RestartServer' }), /cannot execute/)
  await mkdir(join(store, '.review-data'), { recursive: true })
  await writeFile(join(store, '.review-data/application.json'), JSON.stringify({ project: connection.manifest, root: source }))
  let serve
  isolatedOrcaAssets({ store, source }).configureServer({ middlewares: { use(handler) { serve = handler } } })
  const request = async (url, method = 'GET') => {
    const result = {}
    await serve({ url, method }, { writeHead(status, headers) { Object.assign(result, { status, headers }); return this }, end(body) { result.body = body } }, () => { result.passed = true })
    return result
  }
  const icon = await request('/icon.svg')
  assert.equal(icon.status, 200)
  assert.equal(icon.headers['content-type'], 'image/svg+xml')
  assert.equal((await request('/__orca-isolated/receipt.json')).status, 404)
  assert.equal((await request('/__orca-isolated/assets/../../receipt.json')).status, 404)
  assert.equal((await request('/icon.svg', 'POST')).status, 404)
  assert.equal((await request('/unrelated')).passed, true)
})
