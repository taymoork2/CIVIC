import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Schema } from 'effect'
import { previewOrigin, previewStore, ReviewSessions } from '../src/coordinator.ts'
import { readCheckout } from '../src/git.ts'
import { configuredStore, Store } from '../src/store.ts'
import { callTool, TOOLS } from '../src/mcp.ts'

test('configured store routes checkout and preview records and refuses invalid paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'civic-config-'))
  const dir = join(root, 'records')
  const previous = process.env.CIVIC_STORE
  process.env.CIVIC_STORE = dir
  try {
    assert.equal(Store.forCheckout({ mainRoot: root }).dir, dir)
    assert.equal(previewStore(root), dir)
    assert.equal(statSync(dir).mode & 0o777, 0o700)
    assert.throws(() => configuredStore({ CIVIC_STORE: 'relative' }), /absolute/)
    writeFileSync(join(root, 'file'), '')
    assert.throws(() => configuredStore({ CIVIC_STORE: join(root, 'file') }), /folder/)
  } finally {
    if (previous === undefined) delete process.env.CIVIC_STORE
    else process.env.CIVIC_STORE = previous
  }
})

test('preview address and MCP schema', async () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) assert.equal(previewOrigin(`http://${host}:12345`), `http://${host}:12345`)
  for (const url of ['https://localhost:12345', 'http://example.com:12345', 'http://localhost', 'http://user:pass@localhost:12345', 'bad']) assert.throws(() => previewOrigin(url), /loopback/)
  const schema = TOOLS.find(row => row.name === 'open_review')!.schema
  assert.match(JSON.stringify(Schema.toJsonSchemaDocument(schema).schema), /"preview_url"/)
  await assert.rejects(callTool('open_review', { cwd: '/tmp', workRef: { system: 'test', id: '1' }, preview_url: 'http://example.com:12345' }), /loopback/)
})

test('explicit attachment reads inventory, refuses unknown and mismatched previews, and leaves the server running', async () => {
  const root = mkdtempSync(join(tmpdir(), 'civic-attach-'))
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root })
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=t@example.invalid', 'commit', '--allow-empty', '-qm', 'test: fixture'], { cwd: root })
  cpSync(new URL('../../packages/canvas/examples/tasks', import.meta.url), root, { recursive: true })
  const { readProjectInventory } = await import('../src/backend.ts')
  const local = await readProjectInventory(root)
  let metadata = { ...local.metadata, scenarios: [] }
  let status = 200
  const authorizations: string[] = []
  const server = createServer((req, res) => { if (req.headers.authorization) authorizations.push(req.headers.authorization); res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(metadata)) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`
  // A token stored for this address must never be sent to an address given at call time.
  const bearer = join(root, 'bearer')
  writeFileSync(bearer, 'secret-token')
  Store.forCheckout(readCheckout(root)).setPreviewAuth(origin, bearer)
  const sessions = new ReviewSessions()
  try {
    const session = await sessions.open(root, { system: 'test', id: '1' }, process.env, [], [], origin)
    await sessions.close(session.id)
    assert.equal((await fetch(origin)).status, 200)
    assert.deepEqual(authorizations, [])
    metadata = { ...metadata, project: { ...metadata.project, key: 'other' } }
    await assert.rejects(sessions.open(root, { system: 'test', id: '1' }, process.env, [], [], origin), /different project/)
    status = 404
    await assert.rejects(sessions.open(root, { system: 'test', id: '1' }, process.env, [], [], origin), /CIVIC preview/)
  } finally {
    await sessions.closeAll()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
