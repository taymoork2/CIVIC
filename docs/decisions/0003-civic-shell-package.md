# 0003: Start the CIVIC shell as a workspace package

- **Status:** Merged in PR #1; further extraction paused by [0004](0004-graph-first-journey-engine-as-viewer.md)
- **Date:** 2026-10-10
- **Decider:** Founder (pending review)

## Context

[Decision 0002](0002-v0-journey-engine-is-civic-base.md) made the v0 journey engine the CIVIC base with Example app as its first adapter, and roadmap step 1 is to extract the shell. The v0 handoff asks for that extraction to be honest: move what is truly independent, leave a narrow Example adapter, and prove a second integration before building a broad plugin framework.

## Decision

- Canvas camera, camera hook and canvas controls
- Outline navigation reveal
- Product Contract dimensions, alignment and coverage
- Frozen screen capture
- Shell chrome styles (`.rehearsal`, `.rh-*`, `.app-*`)
- The loopback review server (access key, feedback, proposals, captures and fixture thumbnails)

The server no longer imports the towel journey. Example passes an explicit adapter (`apps/web/scripts/review-adapter.mjs`) with its screens, the proposal properties it accepts, and how to render a fixture. The shell refuses proposal properties it cannot validate.

The shell's source is now part of the review inventory's attested revision. The fixture-source hash is unchanged (`eb66a3b7…`), so the bundled thumbnails stay valid.

## Not moved, and why

| Still in `apps/web` | Coupling |
|---|---|
| `app-canvas.tsx`, `contract-panel.tsx`, `review-panel.tsx` | Read the Example journey graph and towel runtime types |
| `app-map.ts`, `journey.ts`, `scenarios.json`, `towel-journey.json` | Example's scenarios and towel branches |
| `canvas.tsx`, `frame.tsx`, `store.ts` | Mount real Example components with synthetic Convex data |
| `review-plugin.mjs`, `review-inventory.mjs` | Scan Example previews and the Example design reference |
| Feedback context vocabulary in the server | Personas, roles and conditions are Example's |

## Consequences

- New shell work goes in `packages/shell` and must not import from `apps/web`.
- The adapter boundary is defined by one consumer. Generalize it when the Fluent 2 adapter ([0001](0001-fluent-2-demo-design-system.md)) needs it, not before.
- The handoff's `SHA256SUMS` now describes the original import, not the current tree. Moved files report as missing there.
