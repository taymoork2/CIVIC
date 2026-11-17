import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { once } from 'node:events'
import { test } from 'node:test'
import { Schema } from 'effect'
import { run } from '../src/index.ts'
import { TOOLS } from '../src/mcp.ts'

// The MCP server speaks JSON-RPC over stdio and offers D35's narrow write path, nothing more.
test('an agent works a request over MCP and cannot resolve it', { timeout: 30_000 }, async () => {
  const repo = mkdtempSync(join(tmpdir(), 'civic-mcp-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo })
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'taymoor@example.com')
  writeFileSync(join(repo, 'README'), 'x'); git('add', '.'); git('commit', '-q', '-m', 'init')
  const worktree = `${repo}-worktree`
  git('worktree', 'add', '-q', '-b', 'agent', worktree)
  mkdirSync(join(repo, '.civic'), { mode: 0o500 })
  chmodSync(join(repo, '.civic'), 0o500)
  const store = join(repo, 'external-store')
  const printed: string[] = []
  const env = { ...process.env, CIVIC_STORE: store, CIVIC_PERSON: 'taymoor', CIVIC_AGENT: undefined }
  await run(['annotate', 'Label clips.', '--target', 'target:demo.pack'], repo, env, (t) => printed.push(t))
  await run(['request', printed[0]!, '--ask', 'Wrap the label.'], repo, env, (t) => printed.push(t))
  const requestId = printed[1]!.split(' ')[0]!

  const server = spawn(process.execPath, [new URL('../src/mcp.ts', import.meta.url).pathname], { env: { ...env, CIVIC_AGENT: 'claude-code', CIVIC_FOR: 'taymoor', CIVIC_REPO: worktree, CIVIC_PERSON: undefined }, stdio: ['pipe', 'pipe', 'inherit'] })
  const responses = createInterface({ input: server.stdout })
  const pending = new Map<number, (value: any) => void>()
  responses.on('line', (line) => { const message = JSON.parse(line); pending.get(message.id)?.(message); pending.delete(message.id) })
  let next = 1
  const call = (method: string, params?: object) => new Promise<any>((resolve) => { const id = next++; pending.set(id, resolve); server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`) })
  const tool = async (name: string, args: object) => (await call('tools/call', { name, arguments: args })).result
  try {
    const init = await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
    assert.equal(init.result.serverInfo.name, 'civic')
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
    const listed = (await call('tools/list')).result.tools
    assert.deepEqual(listed, TOOLS.map(({ name, description, schema }) => ({ name, description, inputSchema: Schema.toJsonSchemaDocument(schema).schema })))
    const names = listed.map((t: { name: string }) => t.name)
    assert.ok(names.includes('claim') && names.includes('report_fix') && names.includes('annotate'))
    for (const forbidden of ['resolve', 'accept_check', 'escalate']) assert.ok(!names.includes(forbidden), `${forbidden} is not an agent tool`)

    assert.match((await tool('list_requests', {})).content[0].text, /Wrap the label\./)
    const oversized = await tool('comment', { id: requestId, text: 'x'.repeat(64 * 1024 + 1) })
    assert.equal(oversized.isError, true)
    assert.match(oversized.content[0].text, /text exceeds 65536 bytes/)
    const unclaimed = await tool('report_fix', { id: requestId, note: 'Not mine.' })
    assert.equal(unclaimed.isError, true)
    assert.match(unclaimed.content[0].text, /claim/i)
    await tool('comment', { id: requestId, text: 'Changed since you read it.' })
    const stale = await tool('claim', { id: `${requestId}@1` })
    assert.equal(stale.isError, true)
    assert.match(stale.content[0].text, /comment/)
    assert.match((await tool('claim', { id: requestId })).content[0].text, /claimed by actor:agent\.claude-code\.taymoor/)
    const foreign = spawn(process.execPath, [new URL('../src/mcp.ts', import.meta.url).pathname], { env: { ...env, CIVIC_AGENT: 'other-agent', CIVIC_FOR: 'taymoor', CIVIC_REPO: worktree }, stdio: ['pipe', 'pipe', 'inherit'] })
    try {
      const output: Buffer[] = []
      foreign.stdout.on('data', (chunk) => output.push(chunk))
      const closed = once(foreign, 'exit')
      foreign.stdin.end([
        { id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'other', version: '1' } } },
        { id: 2, method: 'tools/list' },
        { id: 3, method: 'tools/call', params: { name: 'claim', arguments: { id: requestId } } },
      ].map((message) => JSON.stringify({ jsonrpc: '2.0', ...message })).join('\n') + '\n')
      assert.deepEqual(await closed, [0, null])
      const result = JSON.parse(Buffer.concat(output).toString().trim().split('\n')[2]!).result
      assert.equal(result.isError, true)
      assert.match(result.content[0].text, /actor:agent\.claude-code\.taymoor/)
    } finally {
      if (foreign.exitCode === null) foreign.kill()
    }
    assert.match((await tool('get_request', { id: requestId })).content[0].text, /Status: Claimed/)
    const fix = await tool('report_fix', { id: requestId, note: 'Wrapped.' })
    assert.match(fix.content[0].text, /Fix ready for review/)
    assert.ok(existsSync(join(store, 'records.graph.json')))
    assert.equal(existsSync(join(repo, '.civic/records.graph.json')), false)
    const unknown = await tool('resolve', { id: requestId })
    assert.equal(unknown.isError, true)
    assert.match(unknown.content[0].text, /Unknown tool resolve/)
    assert.equal((await call('no/such/method')).error.code, -32601)
    for (const args of [{}, { id: 42 }, { id: '' }]) {
      const invalid = await tool('claim', args)
      assert.equal(invalid.isError, true)
      assert.match(invalid.content[0].text, /id/)
    }
    assert.deepEqual((await call('ping')).result, {})
    await call('shutdown')
    assert.equal((await call('tools/list')).error.code, -32600)
    const closed = once(server, 'exit')
    server.stdin.end()
    assert.deepEqual(await closed, [0, null])
  } finally {
    if (server.exitCode === null) server.kill()
    responses.close()
    chmodSync(join(repo, '.civic'), 0o700)
  }
})

test('stdin end closes the MCP scope without a shutdown request', { timeout: 10_000 }, async () => {
  const server = spawn(process.execPath, [new URL('../src/mcp.ts', import.meta.url).pathname], { stdio: ['pipe', 'pipe', 'inherit'] })
  const output: Buffer[] = []
  server.stdout.on('data', (chunk) => output.push(chunk))
  try {
    const closed = once(server, 'exit')
    server.stdin.end(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })}\n`)
    assert.deepEqual(await closed, [0, null])
    assert.deepEqual(JSON.parse(Buffer.concat(output).toString()), { jsonrpc: '2.0', id: 1, result: {} })
  } finally {
    if (server.exitCode === null) server.kill()
  }
})
