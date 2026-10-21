# 0004: The artifact graph is the core; the journey engine is a viewer

- **Status:** Accepted
- **Date:** 2026-10-10
- **Decider:** Founder
- **Amends:** [0002](0002-v0-journey-engine-is-civic-base.md). **Pauses:** [0003](0003-civic-shell-package.md)

## Context

The founding [product spec](../product-spec.md) defines CIVIC as a cross-platform artifact graph, "not only a canvas or web preview". Its MVP is platform-neutral from the first release, because "native support must not be retrofitted later". [Decision 0001](0001-fluent-2-demo-design-system.md) defines the demo's success as one Fluent 2 Button across web, iOS, and Android that raises a Contract Conflict which is classified, assigned, and resolved.

After the v0 import, the roadmap put three steps of Example-shaped work ahead of any cross-platform work. Those steps were shell extraction, contract records derived from Example screens, and permissions for the review server. The repository's model is still Example screens. It has no tokens, semantic components, platform components, or Contract Conflicts as data.

## Decision

## What comes over from the v0 engine

| Kept as CIVIC product rules (now in the spec) | Left with the v0 engine or Example |
|---|---|
| Alignment states: Aligned, Approved adaptation, Accepted limitation, Unreviewed drift, Awaiting adoption, Unknown / stale | Example screens, fixtures, the towel journey, and its adapter |
| Proposal, Decision, Adoption, and Verification as separate records | Amp orb service, portal auth, and the single local access key |
| Evidence integrity: never stronger than the evidence, with no jump, failure, inferred edge, or old screenshot counted as runtime evidence | Vite dev-server plugin and the Example-specific inventory |
| Stable identities, explicit re-anchoring, and distinct declared, proposed, and observed paths | The Open Design and Claude Design collaboration workflow |
| Frozen capture before writing, retained retry identity, and evidence-required resolution | Vendored design skills, the Example design reference, the manifest, and checksums |
| Multiplayer boundary between shared records and private runs and drafts | The legacy `?legacy=1` pin workspace |
| Coding agents as a persona that reproduces items, proposes fixes and hands them back for verification, plus the split between scenario inputs and presentation inputs (from Claude Design's review-workspace proposal) | The proposal's Sightline name and visual tokens |
| Canvas layout: one persistent canvas, horizontal flows, branches below, snapshots plus one live screen, play by default | |

The `@civic/shell` code, which covers the camera, controls, capture, and contract states, stays where it is as viewer code. It isn't a foundation for the graph.

## Consequences
