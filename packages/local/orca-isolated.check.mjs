import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copyFile, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

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
