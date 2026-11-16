import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, writeFile, rename, mkdir, stat } from 'node:fs/promises'
import * as Effect from 'effect/Effect'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadProject } from '@civic/vite-connector/project'
import { canvasRoot } from './canvas-root.mjs'
import { runtimeService } from './runtime-service.mjs'

const now = Date.UTC(2026, 9, 12, 9)
const pause = () => Effect.runPromise(Effect.sleep('10 millis'))
async function barrierReady(file, attempt = 0) {
  if (await stat(file).catch(() => null)) return
  assert.ok(attempt < 500, 'worker did not reach barrier')
  await pause()
  return barrierReady(file, attempt + 1)
}
const { join } = path
async function fixture(t, example = 'tasks', options = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'civic-lifecycle-'))
  const project = loadProject(canvasRoot, { manifest: `${canvasRoot}/examples/${example}/civic.project.json` })
  let source = 'one'
  const service = runtimeService(project, () => source, { dataDir, ...options })
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

test('U3 stop drains a changing operation and persists its receipt', async t => {
  const f = await fixture(t)
  f.project.runtimeEntry = new URL('check-fixtures/interrupted-runtime.mjs', import.meta.url).pathname
  const run = await f.start(), barrier = join(f.dataDir, 'finish')
  const write = f.service.handle({ action: 'mutation', run: run.id, name: 'finish', args: { barrier } })
  await barrierReady(barrier)
  await f.service.close()
  assert.deepEqual(await write, { count: 1 })
  assert.equal(JSON.parse(await readFile(f.path(run.id), 'utf8')).journal[0].complete, true)
  await assert.rejects(f.start(), /stopped/u)
})

test('U3 hung operation is terminated without a completed receipt', { timeout: 36_000 }, async t => {
  const f = await fixture(t)
  f.project.runtimeEntry = new URL('check-fixtures/interrupted-runtime.mjs', import.meta.url).pathname
  const run = await f.start(), barrier = join(f.dataDir, 'hang')
  const write = assert.rejects(f.service.handle({ action: 'mutation', run: run.id, name: 'hang', args: { barrier } }), /timed out|stopped/u)
  await barrierReady(barrier)
  const start = Date.now()
  await f.service.close()
  await write
  assert.ok(Date.now() - start < 35_000)
  assert.ok(JSON.parse(await readFile(f.path(run.id), 'utf8')).journal.every(entry => !entry.complete))
})

test('U3 stop fences pending creation and restore', async t => {
  const original = await fixture(t), run = await original.start()
  await original.service.close()
  await Promise.all([false, true].map(async restore => {
    const { promise: waiting, resolve: entered } = Promise.withResolvers()
    const { promise: generated, resolve: release } = Promise.withResolvers()
    const modules = () => { entered(); return generated }
    const service = runtimeService(original.project, () => 'one', { dataDir: original.dataDir, modules })
    t.after(() => service.close())
    const request = assert.rejects(service.handle(restore ? { action: 'resume', run: run.id } : { action: 'start', scenario: 'tasks.list', role: 'member', condition: 'normal' }), /stopped/u)
    await waiting
    const closed = service.close()
    release({})
    await Promise.all([closed, request])
  }))
})

test('U3 duplicate resume, queued mutation and stale close preserve takeover', async t => {
  const f = await fixture(t), run = await f.start()
  await f.service.handle({ action: 'close', run: run.id })
  const [first, second] = await Promise.all([f.service.handle({ action: 'resume', run: run.id }), f.service.handle({ action: 'resume', run: run.id })])
  assert.equal(first.lease, second.lease)
  const write = { action: 'mutation', run: run.id, name: 'POST:/api/tasks', intent: 'race-write-0001', args: { body: JSON.stringify({ title: 'Once' }), type: 'application/json' } }
  const [a, b, closed] = await Promise.all([f.service.handle(write), f.service.handle(write), f.service.handle({ action: 'close', run: run.id, lease: run.lease })])
  assert.deepEqual(a, b)
  assert.deepEqual(closed, { closed: false })
  assert.equal(JSON.parse(await readFile(f.path(run.id), 'utf8')).journal.length, 1)
})

test('U3 persistence and startup failures release workers and preserve recoverable input', async t => {
  const f = await fixture(t), run = await f.start()
  const bytes = await readFile(f.path(run.id), 'utf8')
  await rename(join(f.dataDir, 'runtime'), join(f.dataDir, 'retained'))
  await writeFile(join(f.dataDir, 'runtime'), 'blocked')
  await assert.rejects(f.service.handle({ action: 'time', run: run.id, args: { minutes: 1 } }))
  assert.equal(await readFile(join(f.dataDir, 'retained', `${run.id}.json`), 'utf8'), bytes)
  const broken = await fixture(t)
  broken.project.runtimeEntry = join(broken.dataDir, 'missing.mjs')
  await assert.rejects(broken.start())
  await mkdir(join(broken.dataDir, 'runtime'), { recursive: true })
  await writeFile(broken.path(run.id), bytes)
  await assert.rejects(broken.service.handle({ action: 'resume', run: run.id }))
  assert.equal(await readFile(broken.path(run.id), 'utf8'), bytes)
})
