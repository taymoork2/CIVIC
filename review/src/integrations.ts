import { fileURLToPath } from 'node:url'

export const HARNESSES = ['claude-code', 'codex', 'codex-toml', 'opencode', 'cursor', 'acp'] as const

export const serverEntry = (root = fileURLToPath(new URL('../../', import.meta.url))) => ({
  command: `${root.replace(/\/$/, '')}/integrations/claude-code/bin/civic-mcp`,
  args: [] as string[],
  env: { CIVIC_HOME: root, CIVIC_AGENT: 'mcp-agent' },
})

// Unattended Codex refuses MCP calls nobody approved. CIVIC's tools cannot resolve or accept work, so trust them.
const codexApproval = { default_tools_approval_mode: 'approve' }

export function integrationConfig(harness: string, entry = serverEntry()): string {
  const json = (value: unknown) => JSON.stringify(value, null, 2)
  switch (harness) {
    case 'claude-code':
    case 'cursor':
      return json({ mcpServers: { civic: entry } })
    case 'codex':
      return json({ mcpServers: { civic: { ...entry, ...codexApproval } } })
    case 'codex-toml':
      return `[mcp_servers.civic]\ncommand = ${json(entry.command)}\nargs = ${json(entry.args)}\ndefault_tools_approval_mode = "approve"\n\n[mcp_servers.civic.env]\n${Object.entries(entry.env).map(([key, value]) => `${key} = ${json(value)}`).join('\n')}`
    case 'opencode':
      return json({ mcp: { civic: { type: 'local', command: [entry.command, ...entry.args], environment: entry.env } } })
    case 'acp':
      return json({ mcpServers: [{ name: 'civic', command: entry.command, args: entry.args, env: Object.entries(entry.env).map(([name, value]) => ({ name, value })) }] })
    default:
      throw new Error(`Unknown harness ${harness}. Choose ${HARNESSES.join(', ')}.`)
  }
}

export function pluginConfig(harness: 'claude-code' | 'codex'): string {
  const entry = serverEntry()
  const server = {
    ...entry,
    command: harness === 'claude-code' ? '${CLAUDE_PLUGIN_ROOT}/bin/civic-mcp' : './bin/civic-mcp',
    env: { CIVIC_AGENT: harness, ...(harness === 'claude-code' ? { CIVIC_REPO: '${CLAUDE_PROJECT_DIR}' } : {}) },
    ...(harness === 'codex' ? { cwd: './', env_vars: ['CIVIC_HOME', 'CIVIC_FOR'], ...codexApproval } : {}),
  }
  return JSON.stringify({ mcpServers: { civic: server } }, null, 2)
}
