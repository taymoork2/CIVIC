import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, symlink } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { candidateCode, checkedContract, coverageBridge, coveragePath, coverageReport } from './review-coverage.mjs'

const target = { id: 'journey.test', title: 'Test journey', kind: 'journey', scenarios: ['first', 'last'], acceptance: ['Cancel retains inputs.'] }
function metadata() { return { revision: { source: 'a'.repeat(64) }, fixtureSource: 'f'.repeat(64), scenarios: [{ id: 'first', edges: [] }, { id: 'last', renderer: 'legacy' }], surfaces: [{ id: 'apps/web/src/account/test.tsx#ConfirmSheet', path: 'apps/web/src/account/test.tsx', name: 'ConfirmSheet', kind: 'sheet', scenarios: [] }, { id: 'generic', path: 'apps/web/src/components/dialog.tsx', name: 'DialogSheet', kind: 'sheet', scenarios: [] }], validation: { status: 'stale', receipt: { behaviorScenarios: ['first', 'last'] } } } }

test('coverage separates planned intent, source presence, partial previews, transitions and stale proof', () => {
  const m = metadata()
  const report = coverageReport(m, checkedContract({ version: 1, targets: [target, { ...target, id: 'planned.feature', scenarios: [] }, { ...target, id: 'screen.absent', kind: 'screen', component: 'apps/web/src/missing.tsx', scenarios: ['unknown'] }] }), new Set())
  assert.equal(report.targets[0].implementation, 'present')
  assert.equal(report.targets[0].preview, 'partial')
  assert.deepEqual(report.targets[0].missingEdges, ['first'])
  assert.equal(report.targets[0].verification, 'unverified')
  assert.equal(report.targets[1].implementation, 'planned')
  assert.equal(report.targets[2].implementation, 'missing')
  assert.equal(report.targets[2].preview, 'missing')
  assert.equal(report.targets.length, 4)
  assert.equal(report.targets[3].id, coverageReport(m, { version: 2, targets: [] }, new Set()).targets[0].id)
  m.validation.status = 'source-current'
  assert.equal(coverageReport(m, { version: 1, targets: [target] }, new Set()).targets[0].verification, 'scoped receipt')
  m.scenarios[0].edges = [{ destination: 'middle' }]
  m.scenarios.push({ id: 'middle', edges: [{ destination: 'first' }, { destination: 'last' }] })
  assert.deepEqual(coverageReport(m, { version: 1, targets: [target] }, new Set()).targets[0].missingEdges, [], 'journey checkpoints can connect through intermediate screens and loops')
})

test('coverage contract rejects duplicate identities, traversal, oversized data and invalid target kinds', () => {
  for (const targets of [[target, target], [{ ...target, component: 'apps/web/src/../../secret.ts' }], [{ ...target, kind: 'atom' }], [{ ...target, title: 'x'.repeat(161) }]]) assert.throws(() => checkedContract({ version: 1, targets }))
})

test('automatic drafts are durable, source-bound, do not replace edits, and never satisfy coverage', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'rehearsal-coverage-test-'))
  const m = metadata(); m.coverage = coverageReport(m, { version: 1, targets: [target] }, new Set())
  const bridge = await coverageBridge({ dataDir, metadata: m })
  let result = await bridge.get()
  assert.equal(result.candidates.length, 2)
  const originalVersion = result.version
  assert.equal((await bridge.get()).version, originalVersion)
  result = await bridge.update({ operation: 'candidate', source: result.source, expectedVersion: result.version, id: target.id, title: 'Edited', body: 'Still a proposal', action: 'Try' })
  await assert.rejects(bridge.update({ operation: 'acknowledge', source: result.source, expectedVersion: originalVersion, id: target.id }), { status: 409 })
  m.revision.source = 'b'.repeat(64)
  result = await bridge.get()
  assert.equal(result.candidates[0].stale, true)
  assert.equal(result.candidates[0].title, 'Edited')
  assert.equal(result.report.targets[0].preview, 'partial')
  await assert.rejects(bridge.update({ operation: 'candidate', source: 'a'.repeat(64), expectedVersion: result.version, id: target.id }), { status: 409 })
  const reopened = await coverageBridge({ dataDir, metadata: m })
  assert.equal((await reopened.get()).candidates[0].title, 'Edited')
  result = await bridge.update({ operation: 'automatic', source: result.source, expectedVersion: result.version, enabled: false })
  m.coverage.targets.push({ ...m.coverage.targets[0], id: 'journey.second' })
  assert.equal((await bridge.get()).candidates.length, 2)
  result = await bridge.update({ operation: 'generate', source: result.source, expectedVersion: result.version, id: 'journey.second' })
  assert.equal(result.candidates.length, 3)
})

test('two-way expectation save writes only the canonical contract and rejects conflicting edits', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'rehearsal-intent-test-'))
  const { writeFile } = await import('node:fs/promises')
  const dataDir = join(repo, '.review-data'); await mkdir(dataDir)
  await mkdir(join(repo, 'docs/design/review-product'), { recursive: true })
  await writeFile(join(repo, coveragePath), JSON.stringify({ version: 1, targets: [target] }))
  const m = metadata(); m.coverage = coverageReport(m, { version: 1, targets: [target] }, new Set())
  const bridge = await coverageBridge({ repo, dataDir, metadata: m })
  let result = await bridge.get()
  result = await bridge.update({ operation: 'intent', source: result.source, expectedVersion: result.version, contractVersion: 1, target: { ...target, acceptance: ['Retries preserve inputs.'] } })
  const saved = JSON.parse(await readFile(join(repo, coveragePath), 'utf8'))
  assert.equal(saved.version, 2); assert.deepEqual(saved.targets[0].acceptance, ['Retries preserve inputs.'])
  await assert.rejects(bridge.update({ operation: 'intent', source: result.source, expectedVersion: result.version, contractVersion: 1, target }), { status: 409 })
})

test('exported React candidate typechecks, keeps untrusted copy in a string literal and captures only local input', async () => {
  const code = candidateCode({ title: '"};throw Error("bad")//', body: '<script>bad</script>', action: 'Try' })
  const content = JSON.parse(code.match(/const content = (.*)\n/)[1])
  assert.equal(content.title, '"};throw Error("bad")//')
  assert.match(code, /Proposal-only synthetic scaffold/)
  assert.match(code, /setCaptured\(value\)/)
  assert.ok(!code.includes('fetch('))
  const directory = await mkdtemp(join(tmpdir(), 'rehearsal-candidate-check-'))
  await symlink(fileURLToPath(new URL('../node_modules', import.meta.url)), join(directory, 'node_modules'))
  await writeFile(join(directory, 'candidate.tsx'), code)
  await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)), '--ignoreConfig', '--noEmit', '--strict', '--jsx', 'react-jsx', '--moduleResolution', 'bundler', '--module', 'esnext', '--target', 'es2022', '--skipLibCheck', join(directory, 'candidate.tsx')])
})
