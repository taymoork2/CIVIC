import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { test } from 'node:test'
import { readCheckout } from '../src/git.ts'
import { Store } from '../src/store.ts'
import { readProjectInventory } from '../src/backend.ts'
import { previewId, sameProcess } from '../src/preview/state.ts'

test('coordinator reviews, links, captures, notifies and closes over real stdio', { timeout: 120_000 }, async () => {
  const repo = mkdtempSync(join(tmpdir(), 'civic-coordinator-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'owner@example.com')
  const civic = new URL('../../', import.meta.url).pathname
  const notebook = join(repo, 'packages/canvas/examples/notebook')
  mkdirSync(join(repo, 'packages/canvas/examples'), { recursive: true })
  cpSync(join(civic, 'packages/canvas/examples/notebook'), notebook, { recursive: true })
  for (const name of ['packages/node_modules', 'packages/pnpm-lock.yaml', 'packages/canvas/bin', 'review', 'graph']) symlinkSync(join(civic, name), join(repo, name))
  const source = join(notebook, 'src/screens.js')
  writeFileSync(source, readFileSync(source, 'utf8').replace("  heading.textContent", "  heading.setAttribute('data-civic-source', 'src/screens.js:7:1')\n  heading.textContent"))
  writeFileSync(join(repo, 'README'), 'fixture\n')
  git('add', '.')
  git('commit', '-qm', 'test: fixture')
  const base = git('rev-parse', 'HEAD').toString().trim()
  writeFileSync(source, readFileSync(source, 'utf8').replace("'Notebook'", "'My Notebook'"))
  git('add', '.')
  git('commit', '-qm', 'test: change heading')
  const checkout = readCheckout(repo)
  const store = Store.forCheckout(checkout)
  const capture = { scenario: 'home', elements: [{ tag: 'button', source: 'src/home.ts:1:1' }] }
  store.putTaggedCapture('test', 'old', capture)
  store.putTaggedCapture('test', 'new', capture)
  assert.deepEqual(store.taggedCaptures('test', 'old'), [])
  assert.deepEqual(store.taggedCaptures('test', 'new'), [capture])
  const server = spawn(process.execPath, [new URL('../src/mcp.ts', import.meta.url).pathname], { env: { ...process.env, CIVIC_REPO: repo, CIVIC_FOR: 'owner' }, stdio: ['pipe', 'pipe', 'inherit'] })
  const lines = createInterface({ input: server.stdout })
  const pending = new Map<number, (value: any) => void>()
  let next = 0
  let notified!: (message: any) => void
  let notice = new Promise<any>(resolve => { notified = resolve })
  lines.on('line', line => {
    const message = JSON.parse(line)
    if (message.method === 'notifications/resources/updated') notified(message)
    pending.get(message.id)?.(message)
    pending.delete(message.id)
  })
  const rpc = (method: string, params: object = {}) => new Promise<any>(resolve => {
    const id = ++next
    pending.set(id, resolve)
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  })
  const uri = 'civic://requests?system=test&id=W1'
  try {
    assert.equal((await rpc('initialize')).result.capabilities.resources.subscribe, true)
    assert.deepEqual((await rpc('resources/subscribe', { uri })).result, {})
    const opened = await rpc('tools/call', { name: 'open_review', arguments: { cwd: repo, workRef: { system: 'test', id: 'W1' } } })
    assert.equal(opened.result.isError, undefined, opened.result.content[0].text)
    const session = JSON.parse(opened.result.content[0].text)
    notice = new Promise<any>(resolve => { notified = resolve })
    const html = await (await fetch(session.link)).text()
    const overlay = /<script src="(http:\/\/127\.0\.0\.1:\d+)\/overlay.js"/.exec(html)![1]!
    const response = await fetch(`${overlay}/annotate`, { method: 'POST', headers: { origin: new URL(session.link).origin, 'content-type': 'application/json' }, body: JSON.stringify({ comment: 'Review this', url: session.link, viewport: { width: 400, height: 400 }, rect: { x: 0, y: 0, width: 1, height: 1 }, html: '<p>Review this</p>', workRef: { system: 'forged', id: 'wrong' } }) })
    assert.equal(response.status, 201, await response.text())
    assert.equal((await notice).params.uri, uri)
    const resource = await rpc('resources/read', { uri })
    const request = JSON.parse(resource.result.contents[0].text)[0].request
    assert.deepEqual(request.links, [{ system: 'test', id: 'W1' }])
    const changed = await rpc('tools/call', { name: 'changed_screens', arguments: { cwd: repo, base } })
    assert.ok(JSON.parse(changed.result.content[0].text).screens.some((screen: any) => screen.scenario === 'demo.home'))
    const report = await rpc('tools/call', { name: 'coverage', arguments: { cwd: repo } })
    const coverage = JSON.parse(report.result.content[0].text)
    assert.equal(coverage.screens.total, 4)
    assert.ok(coverage.journeys.length)
    assert.ok(Array.isArray(coverage.backend.operations))
    assert.equal((await rpc('resources/read', { uri: `civic://coverage/${encodeURIComponent(coverage.project)}` })).error, undefined)
    assert.equal((await rpc('tools/call', { name: 'close_review', arguments: { id: 'another-session' } })).result.isError, true)
    assert.equal((await fetch(session.link)).status, 200)
    const preview = JSON.parse(readFileSync(join(tmpdir(), 'civic-preview', `${previewId(checkout.root, 'main')}.json`), 'utf8'))
    const coverageUri = `civic://coverage/${encodeURIComponent(coverage.project)}`
    assert.deepEqual((await rpc('resources/subscribe', { uri: coverageUri })).result, {})
    // The preview owns this replay; the shared review store must remain untouched.
    const replayDirectory = join(preview.root, 'store/.review-data/projects', coverage.project, 'replays')
    mkdirSync(replayDirectory, { recursive: true })
    notice = new Promise<any>(resolve => { notified = message => { if (message.params.uri === coverageUri) resolve(message) } })
    const { metadata } = await readProjectInventory(repo, join(notebook, 'civic.project.json'), join(preview.root, 'store'))
    const tape = { project: coverage.project, source: metadata.revision.source, seed: { context: { scenario: 'demo.home' } }, steps: [] }
    const bytes = JSON.stringify(tape)
    const hash = createHash('sha256').update(bytes).digest('hex')
    mkdirSync(join(replayDirectory, 'tapes'), { recursive: true })
    writeFileSync(join(replayDirectory, 'tapes', `${hash}.json`), bytes)
    writeFileSync(join(replayDirectory, `${randomUUID()}.json`), JSON.stringify({ schema: 'civic.replay/0', project: coverage.project, source: metadata.revision.source, scenario: 'demo.home', tape: hash, steps: 0, outcome: 'pass', replayedAt: new Date().toISOString() }))
    assert.equal((await notice).params.uri, coverageUri)
    assert.equal((await rpc('resources/read', { uri: coverageUri })).error, undefined)
    assert.equal(store.replays().length, 0)
    assert.deepEqual((await rpc('resources/unsubscribe', { uri: coverageUri })).result, {})
    assert.equal((await rpc('tools/call', { name: 'close_review', arguments: { id: session.id } })).result.isError, undefined)
    for (const proc of preview.children) assert.equal(sameProcess(proc), false)
    assert.deepEqual((await rpc('resources/unsubscribe', { uri })).result, {})
    assert.deepEqual((await rpc('resources/subscribe', { uri: coverageUri })).result, {})
    assert.equal((await rpc('tools/call', { name: 'close_review', arguments: { id: 'another-session' } })).result.isError, true)
  } finally {
    const exited = once(server, 'exit')
    server.stdin.end()
    await exited
    lines.close()
  }
})
