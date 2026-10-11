import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { test } from 'node:test'
import { run } from '../src/index.ts'

// The MCP server speaks JSON-RPC over stdio and offers D35's narrow write path, nothing more.
test('an agent works a request over MCP and cannot resolve it', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'civic-mcp-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo })
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'taymoor@example.com')
  writeFileSync(join(repo, 'README'), 'x'); git('add', '.'); git('commit', '-q', '-m', 'init')
  const printed: string[] = []
  const env = { ...process.env, CIVIC_PERSON: 'taymoor', CIVIC_AGENT: undefined }
  await run(['annotate', 'Label clips.', '--target', 'target:demo.pack'], repo, env, (t) => printed.push(t))
  await run(['request', printed[0]!, '--ask', 'Wrap the label.'], repo, env, (t) => printed.push(t))
  const requestId = printed[1]!.split(' ')[0]!

  const server = spawn(process.execPath, [new URL('../src/mcp.ts', import.meta.url).pathname], { env: { ...process.env, CIVIC_AGENT: 'claude-code', CIVIC_FOR: 'taymoor', CIVIC_REPO: repo, CIVIC_PERSON: undefined }, stdio: ['pipe', 'pipe', 'inherit'] })
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
    const names = (await call('tools/list')).result.tools.map((t: { name: string }) => t.name)
    assert.ok(names.includes('claim') && names.includes('report_fix') && names.includes('annotate'))
    for (const forbidden of ['resolve', 'accept_check', 'escalate']) assert.ok(!names.includes(forbidden), `${forbidden} is not an agent tool`)

    assert.match((await tool('list_requests', {})).content[0].text, /Wrap the label\./)
    assert.match((await tool('claim', { id: requestId })).content[0].text, /claimed by actor:agent\.claude-code\.taymoor/)
    assert.match((await tool('get_request', { id: requestId })).content[0].text, /Status: Claimed/)
    const fix = await tool('report_fix', { id: requestId, note: 'Wrapped.' })
    assert.match(fix.content[0].text, /Fix ready for review/)
    const unknown = await tool('resolve', { id: requestId })
    assert.equal(unknown.isError, true)
    assert.equal((await call('no/such/method')).error.code, -32601)
  } finally {
    server.kill()
  }
})
