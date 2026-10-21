import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, mkdtemp, readFile, readdir, writeFile, realpath } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { buildWorktree, worktreeHash, reactScreens } from './orca-worktrees.mjs'
import { checkDependencyLock, dependencyAliases, previewDependencies } from './worktree-dependencies.mjs'
import { loadProject, checkedScenarios } from '../vite-connector/src/review-project.mjs'
import { isolatedOrcaAssets } from './orca-isolated.mjs'
import { worktreeConnections } from './worktree-connections.mjs'

test('shared worktree refresh includes source branches on demand, bounds retries and preserves source files', async () => {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'civic-worktree-discovery-'))), source = join(base, 'main'), draft = join(base, 'draft')
  await mkdir(source)
  const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '--initial-branch=main')
  await writeFile(join(source, 'screen.tsx'), 'main')
  git('add', 'screen.tsx'); git('-c', 'user.name=Preview Test', '-c', 'user.email=preview@example.invalid', 'commit', '-m', 'main')
  git('worktree', 'add', '-b', 'draft', draft)
  await writeFile(join(draft, 'screen.tsx'), 'local changes')
  const before = git('status', '--porcelain'), calls = []
  const connect = async tree => { calls.push(tree.path); return { root: tree.path } }
  const refresh = worktreeConnections(source, connect, { includeSource: true })
  const [first, concurrent] = await Promise.all([refresh(), refresh()])
  assert.deepEqual(first, concurrent)
  assert.deepEqual(first.connections.map(row => row.root), [source, draft])
  assert.deepEqual(calls, [source, draft])
  await refresh(); assert.equal(calls.length, 2, 'Repeated picker reads reuse discovery')
  assert.deepEqual((await worktreeConnections(source, connect)()).connections, [{ root: draft }], 'Orca can exclude its separately connected running source')
  const failed = await worktreeConnections(source, async () => { throw Error('Adapter unavailable') })()
  assert.equal(failed.connections.length, 0); assert.match(failed.errors[0], /Adapter unavailable/)
  assert.equal(git('status', '--porcelain'), before)
  assert.equal(await readFile(join(draft, 'screen.tsx'), 'utf8'), 'local changes')
  assert.deepEqual((await worktreeConnections(source, connect, { includeSource: true, paths: [draft] })()).connections, [{ root: draft }], 'Explicit preview sources avoid compiling unrelated branches')
})

test('React screen registration uses declared file routes and actual route exports', async () => {
  const source = await mkdtemp(join(tmpdir(), 'civic-react-routes-')), routes = join(source, 'apps/web/src/routes')
  await mkdir(routes, { recursive: true })
  for (const [name, path] of [['index', '/'], ['project', '/p/$projectId/'], ['settings', '/p/$projectId/settings/'], ['learning', '/learning']]) await writeFile(join(routes, `${name}.tsx`), `export const Route = createFileRoute('${path}')({ component: Page })`)
  await writeFile(join(routes, 'unsupported.tsx'), 'export const NotARoute = () => null')
  const screens = await reactScreens(source)
  assert.deepEqual(screens.map(row => row.route), ['/', '/p/:projectId', '/p/:projectId/settings', '/learning'])
  assert.ok(screens.every(row => row.componentExport === 'Route'))
  assert.equal(screens.find(row => row.fixture.name === 'project').component, 'apps/web/src/routes/project.tsx')
  assert.equal(screens.find(row => row.fixture.name === 'home').targetId, 'orca.screen.home')
})

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

test('dependency aliases reuse only matching pins and leave source checkouts untouched', async () => {
  const base = await mkdtemp(join(tmpdir(), 'civic-preview-deps-')), source = join(base, 'source'), installed = join(base, 'installed')
  const lock = "lockfileVersion: '9.0'\n\npackages:\n\n  lib@1:\n    resolution: {integrity: abc}\n\nsnapshots:\n\n  lib@1: {}\n"
  for (const root of [source, installed]) {
    await mkdir(join(root, 'web'), { recursive: true })
    await writeFile(join(root, 'pnpm-lock.yaml'), lock)
    await writeFile(join(root, 'web/package.json'), JSON.stringify({ dependencies: { lib: '1', workspace: 'workspace:*' } }))
  }
  const dependency = join(installed, 'web/node_modules/lib'); await mkdir(dependency, { recursive: true })
  await writeFile(join(dependency, 'index.js'), 'throw Error("Discovery must never import dependencies")')
  assert.deepEqual(await dependencyAliases(source, installed, ['web']), { lib: await realpath(dependency) })
  const plugin = previewDependencies({ lib: dependency }, source), resolved = []
  const resolver = { resolve: async (...args) => { resolved.push(args); return { id: 'resolved' } } }
  await plugin.resolveId.call(resolver, 'lib/subpath', join(source, 'web/screen.tsx'))
  assert.equal(await plugin.resolveId.call(resolver, 'lib/subpath', '/civic/shell/button.tsx'), undefined)
  assert.equal(resolved[0][0], 'lib/subpath')
  assert.equal(resolved[0][1], join(dependency, 'package.json'))
  assert.equal(resolved.length, 1, 'App dependency reuse cannot replace CIVIC shell dependencies')
  await writeFile(join(dependency, 'package.json'), JSON.stringify({ name: 'lib', exports: { './subpath': './index.js' } }))
  const { createServer } = await import('vite')
  const server = await createServer({ configFile: false, root: source, logLevel: 'silent', plugins: [plugin] })
  try {
    const found = await server.environments.client.pluginContainer.resolveId('lib/subpath', join(source, 'web/screen.tsx'))
    assert.equal(await realpath(found.id.split('?')[0]), await realpath(join(dependency, 'index.js')), 'Vite honors package exports from the matching installation')
  } finally { await server.close() }
  await assert.rejects(readFile(join(source, 'web/node_modules/lib/index.js')), { code: 'ENOENT' })
  await writeFile(join(source, 'web/package.json'), JSON.stringify({ dependencies: { lib: '2' } }))
  await assert.rejects(dependencyAliases(source, installed, ['web']), /dependency differs/)
  await writeFile(join(source, 'pnpm-lock.yaml'), lock.replace('abc', 'changed'))
  await assert.rejects(dependencyAliases(source, installed, ['web']), /pinned dependencies/)
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

test('a failed new build removes only its disposable directory and retains the published preview', async () => {
  const store = await mkdtemp(join(tmpdir(), 'civic-build-cleanup-')), source = join(store, 'checkout')
  await mkdir(join(source, 'apps/web'), { recursive: true })
  await writeFile(join(source, 'apps/web/package.json'), '{"dependencies":{}}')
  const folder = join(store, 'projects', `orca-worktree-${createHash('sha256').update(source).digest('hex').slice(0, 12)}`)
  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, 'receipt.json'), '{"previous":"receipt"}')
  await writeFile(join(folder, 'civic.project.json'), '{"previous":"manifest"}')
  await assert.rejects(buildWorktree(store, source, { path: source, revision: 'test', dirty: true }), /ENOENT/)
  assert.deepEqual(await readdir(join(folder, 'builds')), [])
  assert.equal(await readFile(join(folder, 'receipt.json'), 'utf8'), '{"previous":"receipt"}')
  assert.equal(await readFile(join(folder, 'civic.project.json'), 'utf8'), '{"previous":"manifest"}')
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
