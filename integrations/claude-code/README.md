# CIVIC from your agent harness

A thin plugin for [decision 0007](../../docs/decisions/0007-review-to-agent-loop.md)'s review to agent loop. All logic lives in CIVIC's [`review/`](../../review) package. The plugin provides:

- **The `civic` MCP server** (`review/src/mcp.ts`). The server lists its own tools. Agents can't resolve requests, accept checks or change a lane (D35).
- **A skill**, `work-a-request`, that walks an agent through choosing a request, claiming it, reading it, reproducing it, fixing it, committing, and reporting the fix.
- **Commands**: `/civic:next` picks up the oldest unclaimed request, and `/civic:request <id>` works one request.
- **A SessionStart hook** that lists open requests, so Claude can offer to pick one up.

The MCP server runs with `CIVIC_AGENT=claude-code`. `CIVIC_FOR` defaults to the checkout's git identity. Set it to act for someone else.

## Install

```text
/plugin marketplace add taymoork2/CIVIC
/plugin install civic@civic
```

The plugin is copied into Claude Code's plugin cache, so it finds CIVIC through `CIVIC_HOME`, or through the project itself when you work inside the CIVIC repository. For a product repository such as Example, set `CIVIC_HOME` to a CIVIC checkout before starting Claude Code. Each tool takes a `cwd` argument, so a claim or fix is recorded on the line of the worktree Claude is actually working in. CIVIC makes no model calls.

## Codex

The same folder is a Codex plugin. Codex reads its own manifest (`.codex-plugin/plugin.json`) and MCP config (`codex.mcp.json`), and uses the skill and the SessionStart hook as they are. Install it from the same marketplace:

```sh
codex plugin marketplace add taymoork2/CIVIC
codex plugin add civic@civic
```

- **Set `CIVIC_HOME` before starting Codex,** even inside the CIVIC repository. Codex starts the MCP server in the plugin's own folder and passes only the environment it names, which is `CIVIC_HOME` and `CIVIC_FOR`. The server runs with `CIVIC_AGENT=codex`.
- **Pass `cwd` on every tool call.** Codex doesn't tell the server which project it's in, so the skill's instruction to pass the worktree is required here.
- **Trust the hook** when Codex asks, so the open requests are listed at session start.
- **Commands become skills.** Codex turns `/civic:next` into the `civic:source-command-next` skill and leaves out `/civic:request`. Ask for the `civic:work-a-request` skill with a request ID instead.

Checked with Codex CLI 0.162.1: the plugin installs from this repository's marketplace, both skills and the hook load, the hook runs at the first turn, and the MCP server starts and answers a tool call.

## Other harnesses and manual setup

Run `civic integrate <harness>` from this checkout to print setup. It prints only;
it never changes your settings. The command and environment come from
`review/src/integrations.ts`. Every setup starts
`integrations/claude-code/bin/civic-mcp`, which finds CIVIC with `CIVIC_HOME`
and starts the same stdio server. Keep this checkout available, with its dependencies
installed and Node on PATH. Run the harness from your product checkout, or pass
that checkout as `cwd` in tool calls. Set `CIVIC_FOR` for attribution if needed.

| Harness argument | Where the printed setup goes |
| --- | --- |
| `claude-code` | Your project's `.mcp.json`, or use the plugin above |
| `codex` | Plugin `codex.mcp.json` |
| `codex-toml` | The MCP section of Codex `config.toml` |
| `opencode` | The `mcp` section of `opencode.json` |
| `cursor` | Your project's `.cursor/mcp.json` |
| `acp` | The `mcpServers` field of the ACP client's `session/new` parameters |

Merge the printed section into existing settings. ACP is a client protocol:
clients pass the printed stdio entry to agents such as Amp or Gemini CLI through
ACP; support depends on the agent and client. CIVIC starts neither agents nor
model calls. The skill text can be reused wherever a harness supports skills.

The checked-in plugin configs are rendered with `pluginConfig` in the same source;
a test prevents them from drifting. MCP strings are limited to 64 KiB per field,
except `image_base64` (8 MiB); rejected input names the field.
