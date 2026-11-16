import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { HARNESSES, integrationConfig, pluginConfig, serverEntry } from '../src/integrations.ts'
import { run } from '../src/cli.ts'

for (const harness of HARNESSES) {
  test(`${harness} config starts the shared stdio server`, { timeout: 15_000 }, async () => {
    const rendered = integrationConfig(harness)
    let entry = serverEntry()
    if (harness === 'codex-toml') {
      const command = JSON.parse(/^command = (.+)$/m.exec(rendered)![1]!) as string
      const args = JSON.parse(/^args = (.+)$/m.exec(rendered)![1]!) as string[]
      const root = JSON.parse(/^CIVIC_HOME = (.+)$/m.exec(rendered)![1]!) as string
      const agent = JSON.parse(/^CIVIC_AGENT = (.+)$/m.exec(rendered)![1]!) as string
      entry = { command, args, env: { CIVIC_HOME: root, CIVIC_AGENT: agent } }
    } else {
      const config = JSON.parse(rendered)
      if (harness === 'opencode') {
        const local = config.mcp.civic
        assert.equal(local.type, 'local')
        entry = { command: local.command[0], args: local.command.slice(1), env: local.environment }
      } else if (harness === 'acp') {
        const local = config.mcpServers[0]
        entry = { command: local.command, args: local.args, env: Object.fromEntries(local.env.map(({ name, value }: { name: string; value: string }) => [name, value])) as typeof entry.env }
      } else {
        const { default_tools_approval_mode: approval, ...local } = config.mcpServers.civic
        assert.equal(approval, harness === 'codex' ? 'approve' : undefined)
        entry = local
      }
    }
    if (harness === 'codex-toml') assert.match(rendered, /^default_tools_approval_mode = "approve"$/m)
    assert.deepEqual(entry, serverEntry())
    const printed: string[] = []
    assert.equal(await run(['integrate', harness], '/not-a-repository', process.env, (text) => printed.push(text)), 0)
    assert.equal(printed[0], rendered)
    const server = spawn(entry.command, entry.args, { env: { ...process.env, ...entry.env }, stdio: ['pipe', 'pipe', 'inherit'] })
    try {
      const output: Buffer[] = []
      server.stdout.on('data', (chunk) => output.push(chunk))
      const closed = once(server, 'exit')
      server.stdin.end([
        { id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: harness, version: '1' } } },
        { method: 'notifications/initialized' },
        { id: 2, method: 'tools/list' },
      ].map((message) => JSON.stringify({ jsonrpc: '2.0', ...message })).join('\n') + '\n')
      assert.deepEqual(await closed, [0, null])
      const messages = Buffer.concat(output).toString().trim().split('\n').map((line) => JSON.parse(line))
      assert.equal(messages[0].result.serverInfo.name, 'civic')
      assert.ok(messages[1].result.tools.length > 0)
    } finally {
      if (server.exitCode === null) server.kill()
    }
  })
}

test('plugin configs are rendered from the shared entry', () => {
  for (const harness of ['claude-code', 'codex'] as const) {
    const file = harness === 'codex' ? 'codex.mcp.json' : '.mcp.json'
    assert.deepEqual(JSON.parse(readFileSync(new URL(`../../integrations/claude-code/${file}`, import.meta.url), 'utf8')), JSON.parse(pluginConfig(harness)))
  }
  assert.throws(() => integrationConfig('unknown'), /Unknown harness/)
})
