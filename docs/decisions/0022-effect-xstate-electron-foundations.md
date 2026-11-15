# 0022: Effect owns lifetimes, XState decides lifecycles, the data core stays plain

- **Status:** Accepted
- **Date:** 2026-11-15
- **Decider:** Owner's direction that CIVIC be an Effect + XState + Electron project like Orca; the boundaries decided by Claude as controller; the owner may revise them
- **Builds on:** [0006](0006-deterministic-civic-for-agentic-teams.md) (no model calls), [0010](0010-project-dependency-boundary.md) (project boundary), [0021](0021-civic-preview-reviews-a-worktree-of-civic.md) (`civic preview`)
- **Plan:** [rebuild plan](../plans/2026-11-15-effect-xstate-electron-rebuild.md)

## Context

CIVIC's graph, importers and records are pure, tested functions. Its weak spots are the parts with a lifetime: previews, servers, workers, the desktop window and the request lifecycle, whose rules are `if` checks spread over files and whose timers and processes are cleaned up by hand. Orca solved the same problems with Effect for resources and XState for decisions.

## Decision

1. **Effect owns anything with a lifetime**: processes, listeners, workers, watchers, timers, the MCP server, the app server and Electron main. Timers use Effect `Schedule` and `Clock`, never raw `setTimeout`/`setInterval` outside browser UI glue.
2. **XState decides, it does not execute.** Durable lifecycles (work requests) go through a pure kernel: a transition may only emit intents, and the caller persists the new state with the record's version as compare-and-set. In-process lifecycles (preview, app server, run, desktop window) are `@xstate/effect` actors whose timers run on Effect's `Clock`.
3. **Every machine has a graph test** whose event list covers every event the machine declares.
4. **The data core stays plain.** `graph/` and `importers/` import neither Effect nor XState; a check enforces it. Effect `Schema` may replace hand validation there only where it deletes code.
5. **`@civic/core`** (`packages/core`) holds the kernel, the graph-test helper and shared Effect services. This replaces the 18 Oct plan's choice to keep everything in `@civic/canvas`, because `review/` and `packages/canvas` both need the kernel.
6. Pins follow Orca's workspace: `effect` and `@effect/platform-node` `~4.0.5`, `xstate` `6.0.0-alpha.73`, `@xstate/effect` `1.0.0-alpha.12`, `electron` `^45.3.2`, `vite-plus` `^1.6.0`.

CIVIC still makes no model calls and launches no agents. Integrations are the MCP server, skills and plugins that harnesses use.

## Consequences

- Recurring review corrections become lint rules or tests with baselines that may only shrink.
- The request machine replaces status checks in `review/src/loop.ts`; status changes outside it are refused by an architecture test.
- One install for all of CIVIC comes before Effect is used outside `packages/`, so one copy of Effect is loaded.
