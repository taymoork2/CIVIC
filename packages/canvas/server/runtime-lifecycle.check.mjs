import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadProject } from '@civic/vite-connector/project'
import { canvasRoot } from './canvas-root.mjs'
import { runtimeService } from './runtime-service.mjs'

const now = Date.UTC(2026, 9, 12, 9)
const { join } = path
async function fixture(t, example = 'tasks') {
  const dataDir = await mkdtemp(join(tmpdir(), 'civic-lifecycle-'))
  const project = loadProject(canvasRoot, { manifest: `${canvasRoot}/examples/${example}/civic.project.json` })
  let source = 'one'
  const service = runtimeService(project, () => source, { dataDir })
  t.after(() => service.close())
  const start = () => service.handle({ action: 'start', scenario: example === 'tasks' ? 'tasks.list' : 'board.home', persona: example === 'tasks' ? 'planner' : 'lead', role: 'member', condition: 'normal', now, timeZone: 'Pacific/Auckland' })
  return { service, start, project, dataDir, source: value => { source = value }, path: id => join(dataDir, 'runtime', `${id}.json`) }
}

test('lost response retains a receipt across reconstruction and explicit resend', async t => {
  const f = await fixture(t), run = await f.start()
  const command = { action: 'mutation', run: run.id, name: 'POST:/api/tasks', intent: 'dropped-0001', args: { body: JSON.stringify({ title: 'Once' }), type: 'application/json' } }
  await f.service.handle(command)
  const saved = JSON.parse(await readFile(f.path(run.id), 'utf8'))
  assert.equal(saved.journal[0].complete, true)
  await f.service.handle({ action: 'close', run: run.id })
  await f.service.handle({ action: 'resume', run: run.id })
  assert.deepEqual(await f.service.handle(command), saved.journal[0].result)
  const state = await f.service.handle({ action: 'state', run: run.id })
  assert.equal(state.tasks.length, 3)
})

test('stale lease cannot close a replacement owner', async t => {
  const f = await fixture(t), run = await f.start()
  const replacement = await f.service.handle({ action: 'resume', run: run.id })
  assert.notEqual(run.lease, replacement.lease)
  assert.deepEqual(await f.service.handle({ action: 'close', run: run.id, lease: run.lease }), { closed: false })
  assert.ok(await f.service.handle({ action: 'state', run: run.id }))
})

test('source, seed and receipt mismatch refuse restore and preserve journal bytes', async t => {
  const f = await fixture(t), run = await f.start()
  await f.service.handle({ action: 'time', run: run.id, args: { minutes: 1 } })
  await f.service.handle({ action: 'close', run: run.id })
  const original = await readFile(f.path(run.id), 'utf8')
  /* eslint-disable no-await-in-loop -- Each refusal must preserve the same journal before the next alteration. */
  for (const kind of ['source', 'seed', 'result']) {
    const saved = JSON.parse(original)
    if (kind === 'source') f.source('two')
    if (kind === 'seed') saved.seed = { changed: true }
    if (kind === 'result') saved.journal[0].result = { changed: true }
    const bytes = JSON.stringify(saved)
    await writeFile(f.path(run.id), bytes)
    await assert.rejects(f.service.handle({ action: 'resume', run: run.id }), /source revision|seed changed|effects differ/u)
    assert.equal(await readFile(f.path(run.id), 'utf8'), bytes)
    f.source('one')
  }
  /* eslint-enable no-await-in-loop */
})

test('process death after intent persistence restores only completed operations', { timeout: 15_000 }, async t => {
  const f = await fixture(t)
  const child = fork(new URL('check-fixtures/interrupted-host.mjs', import.meta.url), [f.dataDir], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL') })
  const [message] = await once(child, 'message')
  const exited = once(child, 'exit')
  child.kill('SIGKILL')
  await exited
  const saved = JSON.parse(await readFile(f.path(message.run), 'utf8'))
  assert.deepEqual(saved.journal.map(entry => entry.complete), [true, false])
  f.project.runtimeEntry = new URL('check-fixtures/interrupted-runtime.mjs', import.meta.url).pathname
  await f.service.handle({ action: 'resume', run: message.run })
  assert.deepEqual(await f.service.handle({ action: 'state', run: message.run }), { count: 1 })
  assert.equal(JSON.parse(await readFile(f.path(message.run), 'utf8')).journal.length, 1)
  assert.deepEqual(await f.service.handle({ ...saved.journal[1].command, run: message.run }), { count: 2 })
})

test('account, reset, timezone and fresh credentials survive close and restore', async t => {
  const f = await fixture(t, 'team-board'), run = await f.start()
  await f.service.handle({ action: 'identity', run: run.id, args: { account: 'newcomer' } })
  const write = { action: 'mutation', run: run.id, name: 'POST:/api/posts', actor: 'sam', intent: 'reset-post-0001', args: { body: JSON.stringify({ text: 'Before reset' }), type: 'application/json' } }
  await f.service.handle(write)
  await f.service.handle({ action: 'time', run: run.id, args: { minutes: 30 } })
  await f.service.handle({ action: 'close', run: run.id })
  const reopened = await f.service.handle({ action: 'resume', run: run.id })
  assert.equal(reopened.account, 'newcomer')
  assert.equal(reopened.clock, now + 30 * 60_000)
  assert.notEqual(reopened.identity.credential, run.identity.credential)
  const posts = await f.service.handle({ action: 'query', run: run.id, name: 'GET:/api/posts' })
  assert.ok(JSON.parse(posts.body).some(post => post.text === 'Before reset'))
  await f.service.handle({ action: 'reset', run: run.id })
  await f.service.handle({ action: 'close', run: run.id })
  const reset = await f.service.handle({ action: 'resume', run: run.id })
  assert.equal(reset.account, 'lead')
  assert.equal(reset.clock, now)
  const resetPosts = await f.service.handle({ action: 'query', run: run.id, name: 'GET:/api/posts' })
  assert.ok(!JSON.parse(resetPosts.body).some(post => post.text === 'Before reset'))
  const bytes = await readFile(f.path(run.id), 'utf8')
  assert.equal(JSON.parse(bytes).options.timeZone, 'Pacific/Auckland')
  assert.deepEqual(JSON.parse(bytes).journal, [])
  assert.ok(!bytes.includes('review-'))
})
