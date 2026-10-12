import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { accessSync, constants, readFileSync } from 'node:fs'
import { test } from 'node:test'

// The Claude Code and Codex plugin is a thin package: every call goes to CIVIC's own MCP server and CLI.
const plugin = new URL('../../integrations/claude-code/', import.meta.url)
const repoRoot = new URL('../../', import.meta.url).pathname

test('the plugin and marketplace manifests name the same plugin', () => {
  const marketplace = JSON.parse(readFileSync(new URL('../../.claude-plugin/marketplace.json', import.meta.url), 'utf8'))
  const manifest = JSON.parse(readFileSync(new URL('.claude-plugin/plugin.json', plugin), 'utf8'))
  assert.equal(marketplace.plugins[0].name, manifest.name)
  assert.equal(marketplace.plugins[0].source, './integrations/claude-code')
  const mcp = JSON.parse(readFileSync(new URL('.mcp.json', plugin), 'utf8'))
  assert.equal(mcp.mcpServers.civic.env.CIVIC_AGENT, 'claude-code')
  for (const script of ['bin/civic-home', 'bin/civic-mcp', 'bin/session-start']) accessSync(new URL(script, plugin), constants.X_OK)
})

test('Codex reads the same plugin through its own manifest, as the codex agent', () => {
  const claude = JSON.parse(readFileSync(new URL('.claude-plugin/plugin.json', plugin), 'utf8'))
  const codex = JSON.parse(readFileSync(new URL('.codex-plugin/plugin.json', plugin), 'utf8'))
  assert.equal(codex.name, claude.name)
  assert.equal(codex.version, claude.version)
  const server = JSON.parse(readFileSync(new URL(codex.mcpServers, plugin), 'utf8')).mcpServers.civic
  // Codex runs a plugin's stdio server from a path inside the plugin, in the plugin's folder.
  assert.deepEqual([server.command, server.cwd, server.env.CIVIC_AGENT], ['./bin/civic-mcp', './', 'codex'])
  assert.deepEqual(server.env_vars, ['CIVIC_HOME', 'CIVIC_FOR'])
})

test('the plugin launcher starts CIVIC\'s MCP server from CIVIC_HOME', () => {
  const out = execFileSync(new URL('bin/civic-mcp', plugin).pathname, {
    input: `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })}\n`,
    env: { ...process.env, CIVIC_HOME: repoRoot, CIVIC_REPO: repoRoot },
    encoding: 'utf8',
    timeout: 20_000,
  })
  const tools = JSON.parse(out.split('\n')[0]!).result.tools.map((tool: { name: string }) => tool.name)
  assert.ok(tools.includes('report_fix'))
})
