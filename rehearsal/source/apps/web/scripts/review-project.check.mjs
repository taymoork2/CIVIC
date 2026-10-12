import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, writeFile, symlink, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { loadProject, checkedProject, checkedScenarios, projectPath } from '@civic/vite-connector/project'
import { reviewInventory } from './review-inventory.mjs'

const repo = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '')
const example = join(repo, 'apps/web/examples/rehearsal-demo')
const clone = async () => { const root = await realpath(await mkdtemp(join(tmpdir(), 'rehearsal-project-check-'))); await cp(example, root, { recursive: true }); return root }
const load = (root) => loadProject(repo, { manifest: join(root, 'civic.project.json') })

test('portable init is explicit, non-overwriting and works outside a Laundry checkout', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'rehearsal-init-check-')))
  await mkdir(join(root, 'src'))
  const command = (args) => spawnSync(process.execPath, [join(repo, 'packages/vite-connector/src/review-project.mjs'), ...args], { cwd: repo, encoding: 'utf8' })
  const args = ['init', '--root', root, '--name', 'Second app', '--id', 'second-app', '--source', 'src']
  const dry = command(args); assert.equal(dry.status, 0, dry.stderr); assert.equal(JSON.parse(dry.stdout).written, false)
  await assert.rejects(readFile(join(root, 'civic.project.json')), { code: 'ENOENT' })
  assert.equal(command([...args, '--write']).status, 0)
  assert.equal(load(root).entry, null, 'inventory-only onboarding does not pretend to mount a live app')
  assert.notEqual(command([...args, '--write']).status, 0)
  const check = command(['check', '--project', join(root, 'civic.project.json')]); assert.equal(check.status, 0, check.stderr)
  assert.equal(JSON.parse(check.stdout).scenarios, 0)
})

test('project paths, identities, presets and branch parents reject ambiguous connections', async () => {
  const root = await clone(), project = load(root)
  assert.equal(project.root, root, 'explicit manifest never inherits the local Laundry checkout')
  for (const path of ['/etc/passwd', '../outside', 'src/../../outside', '.env.local', 'src/.git/config']) assert.throws(() => projectPath(root, path), /invalid relative/)
  const outside = await mkdtemp(join(tmpdir(), 'rehearsal-outside-check-'))
  await symlink(outside, join(root, 'escape'))
  assert.throws(() => projectPath(root, 'escape/new.json', false), /escapes checkout/)
  const m = project.manifest
  assert.throws(() => checkedProject({ ...m, personas: [m.personas[0], m.personas[0]] }), /duplicate personas/)
  assert.throws(() => checkedProject({ ...m, version: 2 }), /version 1/)
  const rows = JSON.parse(await readFile(project.scenariosPath, 'utf8'))
  assert.throws(() => checkedScenarios([...rows, rows[0]], project), /duplicate scenario/)
  assert.throws(() => checkedScenarios([{ ...rows[0], edges: 0 }], project), /invalid edges/)
  assert.throws(() => checkedScenarios([{ ...rows[0], branchOf: 'missing.screen' }], project), /branch parent/)
  assert.throws(() => checkedScenarios([{ ...rows[0], section: 'Laundry' }], project), /navigation section/)
  assert.notEqual(project.key, load(await clone()).key, 'same project in another checkout has a separate store identity')
})

test('a second application has its own graph, context and revision without overlays or product writes', async () => {
  const root = await clone(), project = load(root)
  const original = await readFile(join(root, 'src/screens.js'), 'utf8')
  const first = await reviewInventory(repo, undefined, root, project)
  assert.equal(first.metadata.project.name, 'Notebook')
  assert.equal(first.metadata.project.adapter, 'module')
  assert.deepEqual(first.metadata.project.personas.map((p) => p.id), ['writer', 'editor'])
  assert.equal(first.metadata.scenarios.length, 4)
  assert.equal(first.metadata.scenarios.find((s) => s.id === 'demo.review').branchOf, 'demo.edit')
  assert.deepEqual(first.metadata.coverage.targets[0].missingEdges, [], 'conditional branch reconnects to the save path')
  assert.ok(first.evidence.has('src/screens.js'))
  assert.ok(!first.evidence.has('apps/web/src/closet/add-clothes.tsx'))
  await writeFile(join(root, 'src/screens.js'), original + '\n// changed presenter\n')
  const changed = await reviewInventory(repo, undefined, root, project)
  assert.notEqual(first.metadata.fixtureSource, changed.metadata.fixtureSource)
  assert.equal(await readFile(join(root, 'src/screens.js'), 'utf8'), original + '\n// changed presenter\n', 'inventory preserves external edits')
  const rows = JSON.parse(await readFile(project.scenariosPath, 'utf8'))
  rows.push({ id: 'demo.planned', label: 'Planned screen', journey: 'Write a note', component: 'src/missing.js', edges: [{ action: 'Open missing', destination: 'demo.unmapped' }] })
  await writeFile(project.scenariosPath, JSON.stringify(rows))
  const next = await reviewInventory(repo, undefined, root, project)
  assert.equal(next.metadata.scenarios.at(-1).implementation, 'missing')
  assert.notEqual(next.metadata.fixtureSource, changed.metadata.fixtureSource)
})

test('generic Vite connection refreshes source and presets while isolating stores and denying live app routes', async () => {
  const root = await clone(), host = await realpath(await mkdtemp(join(tmpdir(), 'rehearsal-host-project-')))
  const web = join(host, 'apps/web'); await mkdir(web, { recursive: true })
  await cp(join(repo, 'apps/web/scripts'), join(web, 'scripts'), { recursive: true })
  await symlink(join(repo, 'apps/web/src'), join(web, 'src'))
  await symlink(join(repo, 'apps/web/node_modules'), join(web, 'node_modules'))
  for (const name of ['package.json', 'review.html', 'review-frame.html']) await cp(join(repo, 'apps/web', name), join(web, name))
  await mkdir(join(host, '.review-data'))
  await writeFile(join(host, '.review-data/application.json'), JSON.stringify({ project: join(root, 'civic.project.json') }))
  const { createServer } = await import('vite'), { reviewPlugin } = await import(join(web, 'scripts/review-plugin.mjs'))
  const server = await createServer({ configFile: false, root: web, cacheDir: join(host, '.vite'), optimizeDeps: { noDiscovery: true, entries: [] }, server: { host: '127.0.0.1', port: 0, hmr: false, preTransformRequests: false }, plugins: [reviewPlugin()] })
  try {
    await server.listen()
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`
    const response = await fetch(origin + '/review'), headers = { cookie: response.headers.get('set-cookie').split(';')[0] }
    const index = async () => { const response = await fetch(origin + '/api/review/index', { headers }); assert.equal(response.status, 200); return response.json() }
    const first = await index()
    assert.equal(first.project.adapter, 'module')
    const capture = { requestId: '00000000-0000-4000-8000-000000000001', kind: 'other', message: 'Synthetic test', html: '<h1>Draft</h1>', snapshot: first, anchor: { label: 'Whole screen', x: 0, y: 0, width: 1, height: 1 }, context: { scenario: 'demo.edit', screen: 'demo.edit', persona: 'writer', role: 'author', condition: 'normal', theme: 'light', textScale: 1, viewport: { width: 393, height: 852 }, state: { dialogs: [], tabs: [], fields: [{ label: 'Undeclared input', value: 'not retained' }] } } }
    const rejected = await fetch(origin + '/api/review/capture', { method: 'POST', headers: { ...headers, 'content-type': 'application/json', origin }, body: JSON.stringify(capture) })
    assert.equal(rejected.status, 400); assert.match((await rejected.json()).error, /allowlist/)
    await readFile(join(host, '.review-data/projects', first.project.key, 'coverage-candidates.json'))
    await assert.rejects(readFile(join(host, '.review-data/coverage-candidates.json')), { code: 'ENOENT' })
    const file = join(root, 'src/screens.js'), original = await readFile(file, 'utf8')
    const url = `${origin}/@fs/${file}`
    assert.equal((await fetch(url, { headers })).status, 200)
    await writeFile(file, original + '\nexport const changedPresenter = true\n')
    const manifestPath = join(root, 'civic.project.json'), manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.personas[0].seed.title = 'Updated synthetic situation'; await writeFile(manifestPath, JSON.stringify(manifest))
    let next = first
    for (let i = 0; i < 50 && next.project.personas[0].seed.title !== 'Updated synthetic situation'; i++) { await new Promise((resolve) => setTimeout(resolve, 100)); next = await index() }
    assert.notEqual(next.revision.source, first.revision.source)
    assert.equal(next.project.personas[0].seed.title, 'Updated synthetic situation')
    assert.match(await (await fetch(url, { headers })).text(), /changedPresenter/)
    for (const denied of ['/api/live', '/@fs/etc/passwd', `/@fs/${root}/.env.local`]) assert.equal((await fetch(origin + denied, { headers })).status, 404)
    const coverage = await (await fetch(origin + '/api/review/coverage', { headers })).json()
    const write = await fetch(origin + '/api/review/coverage', { method: 'POST', headers: { ...headers, 'content-type': 'application/json', origin }, body: JSON.stringify({ operation: 'intent', source: next.revision.source, expectedVersion: coverage.version, contractVersion: 1, target: { id: 'note.second', title: 'Second expectation', kind: 'screen', scenarios: [], acceptance: ['Register a preview.'] } }) })
    assert.equal(write.status, 200, await write.text())
    assert.equal(JSON.parse(await readFile(join(root, 'civic.coverage.json'), 'utf8')).version, 2)
    assert.equal(await readFile(file, 'utf8'), original + '\nexport const changedPresenter = true\n', 'only the explicit coverage contract is written')
    const bad = await fetch(origin + '/api/review/proposals', { method: 'POST', headers: { ...headers, 'content-type': 'application/json', origin }, body: '{}' }); assert.equal(bad.status, 409)
    manifest.adapter.entry = 'src/screens.js'; await writeFile(manifestPath, JSON.stringify(manifest))
    let status = 200
    for (let i = 0; i < 50 && status !== 503; i++) { await new Promise((resolve) => setTimeout(resolve, 100)); status = (await fetch(origin + '/api/review/index', { headers })).status }
    assert.equal(status, 503, 'changed compilation binding requires restart instead of mixing adapters')
  } finally { await server.close() }
})
