# 0003: Start the CIVIƆ shell as a workspace package

- **Status:** Proposed
- **Date:** 2026-10-10
- **Decider:** Founder (pending review)

## Context

[Decision 0002](0002-rehearsal-is-civic-base.md) made Rehearsal the CIVIƆ base with Laundry App as its first adapter, and roadmap step 1 is to extract the shell. The Rehearsal handoff asks for that extraction to be honest: move what is truly independent, leave a narrow Laundry adapter, and prove a second integration before building a broad plugin framework.

The review code in `rehearsal/source/apps/web/src/review` mixed both kinds of code. Some modules never touched Laundry, while others import Laundry components, fixtures and copy.

## Decision

Create `@civic/shell` at `rehearsal/source/packages/shell` and move into it only the modules with no Laundry imports:

- Canvas camera, camera hook and canvas controls
- Outline navigation reveal
- Product Contract dimensions, alignment and coverage
- Frozen screen capture
- Shell chrome styles (`.rehearsal`, `.rh-*`, `.app-*`)
- The loopback review server (access key, feedback, proposals, captures and fixture thumbnails)

The server no longer imports the towel journey. Laundry passes an explicit adapter (`apps/web/scripts/review-adapter.mjs`) with its screens, the proposal properties it accepts, and how to render a fixture. The shell refuses proposal properties it cannot validate.

The shell's source is now part of the review inventory's attested revision. The fixture-source hash is unchanged (`eb66a3b7…`), so the bundled thumbnails stay valid.

## Not moved, and why

| Still in `apps/web` | Coupling |
|---|---|
| `app-canvas.tsx`, `contract-panel.tsx`, `review-panel.tsx` | Read the Laundry journey graph and towel runtime types |
| `app-map.ts`, `journey.ts`, `scenarios.json`, `towel-journey.json` | Laundry's scenarios and towel branches |
| `canvas.tsx`, `frame.tsx`, `store.ts` | Mount real Laundry components with synthetic Convex data |
| `review-plugin.mjs`, `review-inventory.mjs` | Scan Laundry previews and the Laundry design reference |
| Feedback context vocabulary in the server | Personas, roles and conditions are Laundry's |

## Consequences

- New shell work goes in `packages/shell` and must not import from `apps/web`.
- The adapter boundary is defined by one consumer. Generalize it when the Fluent 2 adapter ([0001](0001-fluent-2-demo-design-system.md)) needs it, not before.
- The handoff's `SHA256SUMS` now describes the original import, not the current tree. Moved files report as missing there.
