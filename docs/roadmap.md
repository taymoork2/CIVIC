# CIVIƆ roadmap

Ordered next steps after the Rehearsal import ([synthesis](synthesis-rehearsal.md), [decision 0002](decisions/0002-rehearsal-is-civic-base.md)). Each step should end with evidence in the Product Contract surface, not a claim.

## 1. Extract the CIVIƆ shell from Laundry (started)

`@civic/shell` (`rehearsal/source/packages/shell`) now holds the camera, canvas controls, contract states, capture, shell styles and the review server. Laundry passes its screens, proposal properties and fixture renderer through an explicit adapter ([decision 0003](decisions/0003-civic-shell-package.md)).

Still to move: the canvas composition, journey graph, review and contract panels, the Vite plugin and inventory, and the server's Laundry feedback vocabulary. Each one needs its Laundry types replaced by a narrow adapter input first. Keep shell styles separate from product decisions and domain behavior, per the Rehearsal contributor rules.

## 2. Typed Product Contract records

Promote the contract panel's derived evidence to durable, typed records: per-dimension claims with owners, timestamps, and the evidence pointer that proves them. Alignment states then read from records instead of being recomputed.

## 3. Decisions, attribution, permissions

Add the record types Rehearsal's brief defines but does not store: adaptation/limitation decisions for platform constraints, approvals as separate records from proposals, and attributed identity in place of the single local access key. This is also the prerequisite for real multiplayer — portal collaborator access today is personal-thread access, not a permission model.

## 4. Fluent 2 cross-platform adapter

Implement the [Fluent 2 demo](decisions/0001-fluent-2-demo-design-system.md) as the first non-web adapter: semantic components over tokens, with explicit adaptation/limitation decisions for anything web-specific. Native evidence moves from 0/173 toward partial coverage on real screens.

## 5. Journey completeness and replay

Rehearsal captures exhaustively via its cold fixture run (176 cases, ~6m53s in an orb). GitHub CI now runs type, style, unit and review-server checks on every pull request; the next step is adding the browser capture and review-canvas journey so evidence can be regenerated and become stale visibly. Then add replay-from-start to the scenario player.

## 6. Repository and delivery hygiene

- Done: the repository is on GitHub at [taymoork2/CIVIC](https://github.com/taymoork2/CIVIC) with CI in `.github/workflows/ci.yml`.
- Decide what stays vendored: `rehearsal/design/skills` and the fixture PNGs are handoff material; they can move to a release artifact or submodule once the shell is extracted.
