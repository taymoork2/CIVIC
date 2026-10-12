# CIVIC for Claude Code and Codex

A thin plugin for [decision 0007](../../docs/decisions/0007-review-to-agent-loop.md)'s review to agent loop. All logic lives in CIVIC's [`review/`](../../review) package. The plugin provides:

- **The `civic` MCP server** (`review/src/mcp.ts`). It offers `list_requests`, `get_request` (which returns the frozen captures as images), `claim`, `release`, `comment`, `repro`, `report_fix`, `add_check`, `annotate`, `context` and `gaps`. Agents can't resolve requests, accept checks or change a lane (D35). `report_fix` with a preview runs CIVIC's own re-capture, which is written as `actor:civic`.
- **A skill**, `work-a-request`, that walks Claude through choosing a request, claiming it, reading it, reproducing it, fixing it, committing, and reporting the fix.
- **Commands**: `/civic:next` picks up the oldest unclaimed request, and `/civic:request <id>` works one request.
- **A SessionStart hook** that lists open requests, so Claude can offer to pick one up.

The MCP server runs with `CIVIC_AGENT=claude-code`. `CIVIC_FOR` defaults to the checkout's git identity. Set it to act for someone else.

## Install

```text
/plugin marketplace add taymoork2/CIVIC
/plugin install civic@civic
```

The plugin is copied into Claude Code's plugin cache, so it finds CIVIC through `CIVIC_HOME`, or through the project itself when you work inside the CIVIC repository. For a product repository such as Laundry, set `CIVIC_HOME` to a CIVIC checkout before starting Claude Code. Each tool takes a `cwd` argument, so a claim or fix is recorded on the line of the worktree Claude is actually working in. CIVIC makes no model calls.

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
