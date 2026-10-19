import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { connectIsolatedOrca } from './orca-isolated.mjs'

test('dependency failure leaves an existing isolated connection and its coverage untouched', async () => {
  const store = await mkdtemp(join(tmpdir(), 'civic-isolated-previous-')), source = join(store, 'source'), folder = join(store, 'projects/orca-isolated')
  await mkdir(source); await mkdir(folder, { recursive: true })
  const files = { 'civic.project.json': '{"previous":"connection"}', 'receipt.json': '{"previous":"build"}', 'civic.coverage.json': '{"version":4,"targets":[{"id":"saved"}]}' }
  for (const [file, content] of Object.entries(files)) await writeFile(join(folder, file), content)
  await assert.rejects(connectIsolatedOrca(store, source, {}), /effect\/Effect/)
  for (const [file, content] of Object.entries(files)) assert.equal(await readFile(join(folder, file), 'utf8'), content)
})

test('actual Orca store accepts owned writes and refuses host, provider and outside-path commands', { skip: !process.env.CIVIC_ORCA_SOURCE }, async () => {
  const folder = await mkdtemp(join(tmpdir(), 'civic-orca-check-'))
  await copyFile(new URL('./orca-isolated-runtime.mjs', import.meta.url), join(folder, 'runtime.mjs'))
  await writeFile(join(folder, 'receipt.json'), JSON.stringify({ source: process.env.CIVIC_ORCA_SOURCE, ui: 'test', server: 'test' }))
  const { createRuntime } = await import(pathToFileURL(join(folder, 'runtime.mjs')))
  const runtime = await createRuntime(), initial = await runtime.state()
  assert.equal(initial.snapshot.projects.length, 1)
  await runtime.execute('mutation', 'command', { _tag: 'SaveAppSettings', settings: { autoFallback: false } })
  assert.equal((await runtime.state()).settings.autoFallback, false)
  await assert.rejects(runtime.execute('query', 'command', { _tag: 'SaveAppSettings', settings: {} }), /cannot execute/)
  for (const command of [{ _tag: 'RestartServer' }, { _tag: 'ListHarnesses' }, { _tag: 'CreateProject', name: 'Outside', path: '/Users/taymoor/Projects/orca' }, { _tag: 'SaveProjectSettings', projectId: runtime.seed.projectId, target: 'file', settings: {} }]) await assert.rejects(runtime.execute('mutation', 'command', command), /cannot execute|disposable|isolated database/)
  assert.equal((await runtime.state()).snapshot.projects.length, 1)
  await runtime.execute('mutation', 'command', { _tag: 'CreateProject', name: 'Owned', path: runtime.seed.projectPath })
  const state = await runtime.state()
  assert.equal(state.snapshot.projects.length, 2)
  assert.ok(state.snapshot.sessions.every(session => session.status === 'detached'))
})
