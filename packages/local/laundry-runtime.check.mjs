import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadProject } from '@civic/vite-connector/project'
import { dependencyAliases } from './worktree-dependencies.mjs'
import { laundryRuntime, laundrySpecimenShell } from './laundry-runtime.mjs'

test('legacy Laundry presenters retain the native AppShell without touching live routes', () => {
  const plugin = laundrySpecimenShell()
  const entry = '<DesignPreviewScreen screen={config.scenario.replace(/^legacy\\./, \'\')} onBack={close} />'
  assert.match(plugin.transform(entry, '/preview/src/review/laundry-frame.tsx'), /<AppShell focus><DesignPreviewScreen/)
  assert.equal(plugin.transform(entry, '/product/src/main.tsx'), undefined)
  assert.throws(() => plugin.transform('changed entry', '/preview/src/review/laundry-frame.tsx'), /AppShell boundary/)
})

test('a real Laundry checkout runs with matching preview dependencies and separate synthetic databases', { skip: !process.env.CIVIC_LAUNDRY_SOURCE }, async () => {
  const source = process.env.CIVIC_LAUNDRY_SOURCE, installed = process.env.CIVIC_LAUNDRY_ADAPTER
  assert.ok(installed, 'Set CIVIC_LAUNDRY_ADAPTER to the managed Laundry preview checkout')
  const store = await mkdtemp(join(tmpdir(), 'civic-laundry-runtime-'))
  const status = () => execFileSync('git', ['-C', source, 'status', '--porcelain'], { encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } })
  const before = status()
  const project = loadProject(store, { manifest: join(installed, 'civic.project.json'), applicationRoot: source })
  const aliases = await dependencyAliases(source, installed, ['apps/web', 'convex', 'packages/planner', 'packages/icons'])
  const runtime = laundryRuntime(project, () => 'history-acceptance', { installed, dependencies: aliases, dataDir: store })
  try {
    const start = () => runtime.handle({ action: 'start', scenario: 'app.home', persona: 'single', role: 'owner', condition: 'normal', now: 1792454400000, timeZone: 'UTC' })
    const first = await start(), second = await start()
    assert.notEqual(first.id, second.id)
    const state = run => runtime.handle({ action: 'state', run, actor: run === first.id ? first.subject : second.subject })
    const baseline = await state(second.id)
    await runtime.handle({ action: 'mutation', run: first.id, actor: first.subject, name: 'inventory:createTextiles', args: { householdId: first.seed.householdId, name: 'History isolation proof', color: 'White', colorGroup: 'white', kind: 't_shirt', quantity: 1, status: 'clean' } })
    assert.ok((await state(first.id)).textiles.some(row => row.name === 'History isolation proof'))
    assert.deepEqual(await state(second.id), baseline)
    await assert.rejects(runtime.handle({ action: 'action', run: first.id }), /Server actions are disabled/)
    assert.equal(status(), before, 'Preview setup and mutations never modify the source checkout')
    const journal = JSON.parse(await readFile(join(store, 'runtime', `${first.id}.json`), 'utf8'))
    assert.equal(journal.project, project.key)
    assert.equal(journal.journal.length, 1)
    console.log(`Laundry isolation evidence: ${store}`)
  } finally { await runtime.close() }
})
