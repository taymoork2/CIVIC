import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { test } from 'node:test'
import { readBackendCoverage, readProjectInventory } from '../src/backend.ts'
import { changedScreens, coverage } from '../src/coordinator.ts'
import { readCheckout } from '../src/git.ts'
import { Store } from '../src/store.ts'

test('outside checkout discovery, explicit projects and declared connectors', async () => {
  const root = mkdtempSync(join(tmpdir(), 'civic-outside-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim()
  git('init', '-q', '-b', 'main')
  mkdirSync(join(root, 'src'))
  const manifest = { version: 1, id: 'outside', name: 'Outside', adapter: { kind: 'custom', connector: 'connector.mjs' }, sources: ['src'], scenarios: 'scenarios.json', coverage: 'coverage.json', personas: [{ id: 'reader', label: 'Reader' }], roles: [{ id: 'reader', label: 'Reader' }], conditions: [{ id: 'normal', label: 'Normal' }], navigation: ['Main'] }
  writeFileSync(join(root, 'civic.json'), JSON.stringify(manifest))
  writeFileSync(join(root, 'connector.mjs'), "export default { kind: 'custom' }\n")
  writeFileSync(join(root, 'src/screen.tsx'), 'export const Screen = () => <h1>Before</h1>\n')
  writeFileSync(join(root, 'scenarios.json'), JSON.stringify([{ id: 'home', label: 'Home', journey: 'Read', component: 'src/screen.tsx' }]))
  writeFileSync(join(root, 'coverage.json'), JSON.stringify({ version: 1, targets: [] }))
  git('add', '.')
  git('-c', 'user.name=Fixture', '-c', 'user.email=f@example.invalid', 'commit', '-qm', 'test: before')
  const base = git('rev-parse', 'HEAD')
  writeFileSync(join(root, 'src/screen.tsx'), 'export const Screen = () => <h1>After</h1>\n')
  git('add', '.')
  git('-c', 'user.name=Fixture', '-c', 'user.email=f@example.invalid', 'commit', '-qm', 'test: after')
  // A connector the checkout names is refused until the owner trusts that exact file.
  writeFileSync(join(root, 'connector.mjs'), "throw new Error('untrusted connector ran')\n")
  await assert.rejects(readProjectInventory(root), /CIVIC_TRUSTED_CONNECTORS/)
  writeFileSync(join(root, 'connector.mjs'), "export default { kind: 'custom' }\n")
  process.env.CIVIC_TRUSTED_CONNECTORS = [join(root, 'connector.mjs'), join(root, 'owned.mjs')].join(delimiter)
  const { project, metadata } = await readProjectInventory(root)
  Store.forCheckout(readCheckout(root)).putTaggedCapture(project.key, metadata.revision.source, { scenario: 'home', elements: [{ tag: 'h1', source: 'src/screen.tsx:1:29' }] })
  for (const selection of [undefined, 'civic.json', project.key]) {
    assert.equal((await coverage(root, selection)).screens.total, 1)
    assert.equal((await changedScreens(root, base, selection)).screens[0]?.scenario, 'home')
  }
  assert.deepEqual((await readBackendCoverage(root)).unreached, [])
  const dataDir = join(root, '.review-data/projects', project.key)
  mkdirSync(join(dataDir, 'replays/tapes'), { recursive: true })
  const tape = Buffer.from(JSON.stringify({ project: project.key, source: metadata.revision.source, seed: { context: { scenario: 'home' } }, steps: [] }))
  const hash = createHash('sha256').update(tape).digest('hex')
  const replay = Buffer.from(JSON.stringify({ schema: 'civic.replay/0', project: project.key, source: metadata.revision.source, head: git('rev-parse', 'HEAD'), scenario: 'home', steps: 0, tape: hash, outcome: 'pass', replayedAt: new Date().toISOString() }))
  writeFileSync(join(dataDir, 'replays/tapes', hash + '.json'), tape)
  writeFileSync(join(dataDir, 'replays', randomUUID() + '.json'), replay)
  const unshared = await coverage(root)
  assert.equal(unshared.screens.covered, 0)
  assert.equal(unshared.unsharedReplays, 1)
  assert.match(unshared.hints[0]!, /1 passing replays recorded but not shared yet; run `civic share-replays /)
  Store.forCheckout(readCheckout(root)).putReplay(replay, tape)
  const shared = await coverage(root)
  assert.equal(shared.screens.covered, 1)
  assert.equal(shared.unsharedReplays, 0)
  assert.deepEqual(shared.hints, [])
  writeFileSync(join(root, 'owned.mjs'), `
    import assert from 'node:assert/strict'
    export default {
      kind: 'custom', sharedStore: () => true, designRoot: repo => repo + '/design',
      async inventory(repo, design, app, project) {
        assert.equal(repo, app)
        assert.equal(design, repo + '/design')
        return { metadata: { revision: { source: 'fixture' }, fixtureSource: 'fixture', validation: {}, scenarios: [], surfaces: [] }, evidence: new Map() }
      }
    }
  `)
  writeFileSync(join(root, 'owned.json'), JSON.stringify({ ...manifest, adapter: { kind: 'custom', connector: 'owned.mjs' } }))
  assert.equal((await readProjectInventory(root, 'owned.json', join(root, 'store'))).sharedStore, true)
  assert.deepEqual((await readBackendCoverage(root, 'owned.json')).unreached, [])
  writeFileSync(join(root, 'explicit.json'), JSON.stringify({ ...manifest, id: 'explicit' }))
  writeFileSync(join(root, 'civic.json'), 'invalid default')
  assert.equal((await coverage(root, 'explicit.json')).screens.total, 1)
  assert.equal((await changedScreens(root, base, 'explicit.json')).screens.length, 0)
  writeFileSync(join(root, 'civic.json'), JSON.stringify({ ...manifest, adapter: { kind: 'custom' } }))
  await assert.rejects(readBackendCoverage(root), /Declare adapter.connector/)
  writeFileSync(join(root, 'civic.json'), JSON.stringify({ ...manifest, adapter: { kind: 'custom', connector: '../escape.mjs' } }))
  await assert.rejects(readBackendCoverage(root), /invalid relative path/)
})
