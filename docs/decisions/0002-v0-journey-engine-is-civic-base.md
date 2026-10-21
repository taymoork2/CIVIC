# 0002: The v0 journey engine is the CIVIC base

- **Status:** Accepted, amended by [0004](0004-graph-first-journey-engine-as-viewer.md): the journey engine is a viewer and the first web adapter, not the core
- **Date:** 2026-10-10
- **Decider:** Founder

## Context

The founder built a journey engine in the Example app repository (another project named it Rehearsal, which CIVIC keeps only as the engine's codename) because they needed to see an entire application journey interactively at once. It already implements a large part of CIVIC's MVP on one real web app. The founder asked to continue from it rather than start a separate codebase.

## Decision

## How the v0 engine maps to CIVIC

| CIVIC capability | v0 engine today | Gap |
|---|---|---|
| Journey canvas and scenario player | One persistent canvas, 176 screen nodes, horizontal flows, lower branch lanes, pan and zoom, live towel run | Exhaustive paths, replay from start |
| Bidirectional traceability | Screen → scenario → component file → checks; source and design hashes | Tokens, semantic components, platform implementations |
| Contextual review | Frozen capture, inputs, revision, retry identity, resolution with evidence | Typed records, decisions, attribution |
| Proposals | Versioned heading, action and color edits played on the real screen | Component, token and behavior scope; adoption |
| Alignment states | Defined in its brief, not stored | Decisions for adaptation, limitation and adoption |
| Three-way Product Contract | Evidence fields per scenario, shown as a summary | Owned records, readiness thresholds |
| Cross-platform | Web only; native marked missing | Fluent web, iOS and Android adapters |
| Multiplayer | Single local key; private run model designed | Identities, permissions, shared storage |

## Changes in this commit

- A **Contract** pane shows each selected screen's Design, Engineering and QA evidence from the existing inventory. With nothing selected, it shows coverage across all registered screens.
- The alignment state is never stronger than the evidence. An open review is **Unreviewed drift**; **Aligned** needs every dimension proven; anything else is **Unknown / evidence stale**.
- The engine runs as an orb service and opens through an authenticated Amp portal. Only thread collaborators skip the local key; public portal visitors, other hosts and cross-origin writes are refused, and screenshot capture still uses the loopback listener.
- Orb setup installs dependencies and Google Chrome, and seeds the bundled thumbnails. Rendering all 176 thumbnails from scratch took 6 minutes 53 seconds in an orb.

## Consequences
