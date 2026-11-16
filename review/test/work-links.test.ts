import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { test } from 'node:test'
import { validateGraph } from '../../graph/src/index.ts'
import { readCheckout } from '../src/git.ts'
import { annotate, createRequest, listRequests } from '../src/loop.ts'
import { Store } from '../src/store.ts'

test('work links inherit, validate and update over real MCP stdio with version checks', { timeout: 30_000 }, async () => {
  const repo = mkdtempSync(join(tmpdir(), 'civic-work-links-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'owner@example.com')
  writeFileSync(join(repo, 'README'), 'fixture\n')
  git('add', '.')
  git('commit', '-q', '-m', 'test: fixture')
  const checkout = readCheckout(repo)
  const store = Store.forCheckout(checkout)
  const context = { checkout, store, identity: { type: 'person' as const, handle: 'owner' } }
  const workRef = { system: 'coordinator', id: 'item-1' }
  const annotation = annotate(context, { comment: 'Wrap this label', workRef, targetIds: ['target:fixture.label'] })
  const request = createRequest(context, { annotationIds: [annotation.id], ask: 'Wrap this label' })
  assert.deepEqual(request.links, [workRef])
  const other = annotate(context, { comment: 'Another label', targetIds: ['target:fixture.other'] })
  const unlinked = createRequest(context, { annotationIds: [other.id], ask: 'Another label' })
  assert.deepEqual(unlinked.links, [])
  const malformed = store.read()
  const record = malformed.records.find(record => record.id === request.id)!
  Object.assign(record, { links: [{ system: '', id: 123 }] })
  assert.ok(validateGraph(malformed).some(issue => issue.severity === 'error'))

  const server = spawn(process.execPath, [new URL('../src/mcp.ts', import.meta.url).pathname], { env: { ...process.env, CIVIC_REPO: repo, CIVIC_AGENT: 'test-coordinator', CIVIC_FOR: 'owner' }, stdio: ['pipe', 'pipe', 'inherit'] })
  const responses = createInterface({ input: server.stdout })
  const pending = new Map<number, (value: any) => void>()
  let next = 0
  responses.on('line', line => { const message = JSON.parse(line); pending.get(message.id)?.(message.result); pending.delete(message.id) })
  const tool = (name: string, args: object) => new Promise<any>(resolve => {
    const id = ++next
    pending.set(id, resolve)
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } })}\n`)
  })
  try {
    assert.equal((await tool('link_request', { id: unlinked.id, workRef })).isError, true)
    assert.equal((await tool('link_request', { id: `${unlinked.id}@2`, workRef })).isError, true)
    assert.equal(store.read().records.find(record => record.id === unlinked.id)!.kind, 'work-request')
    const linked = await tool('link_request', { id: `${unlinked.id}@1`, workRef })
    assert.equal(linked.isError, undefined)
    assert.deepEqual(JSON.parse(linked.content[0].text).links, [workRef])
    assert.equal(JSON.parse(linked.content[0].text).status, 'open')
    assert.equal((await tool('link_request', { id: `${unlinked.id}@1`, workRef })).isError, true)
    assert.match((await tool('list_requests', { workRef })).content[0].text, /Another label/)
    assert.doesNotMatch((await tool('list_requests', { workRef: { ...workRef, system: 'different' } })).content[0].text, /Another label/)
    assert.equal(listRequests(context, { workRef }).length, 2)
  } finally {
    const exited = once(server, 'exit')
    server.stdin.end()
    await exited
    responses.close()
  }
})
