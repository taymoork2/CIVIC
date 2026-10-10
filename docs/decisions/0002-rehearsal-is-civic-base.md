# 0002: Rehearsal is the CIVIƆ base

- **Status:** Accepted
- **Date:** 2026-10-10
- **Decider:** Founder

## Context

The founder built **Rehearsal** in the Laundry App repository because they needed to see an entire application journey interactively at once. Rehearsal already implements a large part of CIVIƆ's MVP on one real web app. The founder asked to continue from it rather than start a separate codebase.

## Decision

Import the October 10, 2026 Rehearsal handoff unchanged into [`rehearsal/`](../../rehearsal/) and evolve it into CIVIƆ. The verbatim import was commit `893bee6` in the Amp-hosted repository, and its `SHA256SUMS` verified on import. That commit is not in the GitHub history: there the import and the changes below arrived together as `12bb16e`. Laundry App remains the first adapter. Fluent 2 ([decision 0001](0001-fluent-2-demo-design-system.md)) becomes the cross-platform adapter that proves the semantic component model.

## How Rehearsal maps to CIVIƆ

| CIVIƆ capability | Rehearsal today | Gap |
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
- Rehearsal runs as an orb service and opens through an authenticated Amp portal. Only thread collaborators skip the local key; public portal visitors, other hosts and cross-origin writes are refused, and screenshot capture still uses the loopback listener.
- Orb setup installs dependencies and Google Chrome, and seeds the bundled thumbnails. Rendering all 176 thumbnails from scratch took 6 minutes 53 seconds in an orb.

## Consequences

- CIVIƆ has a working base. The next work is evidence, decisions, and adapters, not a new canvas.
- Rehearsal's safety rules carry forward: never turn a fixture jump, failed operation, inferred edge, or old screenshot into runtime evidence.
- The Laundry App source and its domain code still sit inside `rehearsal/source`. Extracting the CIVIƆ shell is a planned step, not done here. It started in [decision 0003](0003-civic-shell-package.md).
- Portal access is personal-thread access. It is not the multiplayer permission model.
