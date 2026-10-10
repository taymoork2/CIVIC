# CIVIƆ roadmap

Ordered next steps after the Rehearsal import ([synthesis](synthesis-rehearsal.md), [decision 0002](decisions/0002-rehearsal-is-civic-base.md)). Each step should end with evidence in the Product Contract surface, not a claim.

## 1. Extract the CIVIƆ shell from Laundry

Move the review shell (canvas, panels, review server, inventory) out of `rehearsal/source/apps/web` into its own workspace package so Laundry App becomes a plain adapter behind it. Keep shell styles separate from product decisions and domain behavior, per the Rehearsal contributor rules.

## 2. Typed Product Contract records

Promote the contract panel's derived evidence to durable, typed records: per-dimension claims with owners, timestamps, and the evidence pointer that proves them. Alignment states then read from records instead of being recomputed.

## 3. Decisions, attribution, permissions

Add the record types Rehearsal's brief defines but does not store: adaptation/limitation decisions for platform constraints, approvals as separate records from proposals, and attributed identity in place of the single local access key. This is also the prerequisite for real multiplayer — portal collaborator access today is personal-thread access, not a permission model.

## 4. Fluent 2 cross-platform adapter

Implement the [Fluent 2 demo](decisions/0001-fluent-2-demo-design-system.md) as the first non-web adapter: semantic components over tokens, with explicit adaptation/limitation decisions for anything web-specific. Native evidence moves from 0/173 toward partial coverage on real screens.

## 5. Journey completeness and replay

Rehearsal captures exhaustively via its cold fixture run (176 cases, ~6m53s in an orb). Wire that capture into CI so evidence can be regenerated and become stale visibly, and add replay-from-start to the scenario player.

## 6. Repository and delivery hygiene

- Relink this project to GitHub: both GitHub creation attempts failed with `403 Resource not accessible by integration`; Amp-hosted projects also could not switch their primary repository to GitHub mode. Retry with the integration permissions fixed before the repo needs external reviewers.
- Decide what stays vendored: `rehearsal/design/skills` and the fixture PNGs are handoff material; they can move to a release artifact or submodule once the shell is extracted.
