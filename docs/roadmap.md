# CIVIC roadmap

Ordered next steps after [decision 0004](decisions/0004-graph-first-journey-engine-as-viewer.md). The artifact graph is the core, and the journey engine is one viewer and the first web adapter. Each step should end with evidence, not a claim.

## 1. CIVIC graph schema

Define a small, CIVIC-owned schema outside `rehearsal/` for Intent, Semantic component, Platform component, Component instance, Override, Extension point, Evidence, and Contract Conflict (D29). Instances, overrides, and extension points let CIVIC forecast at design time whether a product team's change to a library component is supported on each platform ([component change flow](component-change-flow.md)). Use stable identities and the alignment states from the [spec](product-spec.md#alignment-states). Keep it plain and file-based until the demo shows what storage it needs.

Reuse the journey engine's distinctions rather than inventing new ones: a connection is declared, observed, inferred, or proposed, and a target is either expected or only discovered in source. Its cross-route actions (`rehearsal/source/apps/web/src/review/route-actions.json`) show the edge shape: route, condition, return context, and whether the destination is mapped. The schema copies these ideas; it never imports the engine.

## 2. Fluent 2 Button conflict demo

Build the [decision 0001](decisions/0001-fluent-2-demo-design-system.md) demo on that schema:

- One semantic Button with its variants mapped to Fluent React v9, iOS, and Android Compose.
- Web evidence from Storybook and Playwright. iOS and Android evidence from source and token analysis.
- The Android Figma kit compared with Compose, which raises a Contract Conflict that is classified, given owners, and resolved.
- Tokens move as DTCG where the source supports it. Read Figma structure from a file export; the Variables REST API needs Enterprise access, so the demo can't depend on it.

A design-system Card changed by a product team is the second demo after Button.

The demo succeeds when a reviewer can see what disagrees, why it matters, who must act, and how the decision is preserved.

## 3. Typed contract and change records

Store Proposal, Decision, Adoption, and Verification as separate, owned records, along with the collaboration record types (Ambiguity, Constraint, Coverage gap, Divergence, Risk, Exception). Alignment states read from records instead of being recomputed.

The journey engine already has working examples: `coverage.json` is a Coverage gap record with versioned write-back, and its coverage candidates are proposals that never count as adoption.

## 4. The journey engine as a graph viewer

Point the journey engine's canvas and Contract panel at the graph, with Laundry as one web adapter. Generalize the `@civic/shell` adapter boundary now that Fluent is a second consumer ([decision 0003](decisions/0003-civic-shell-package.md) was paused until then). Follow the v4 handoff's onboarding direction: a local project manifest plus a supported web adapter.

Validate onboarding with two cases ([onboarding and ingestion](onboarding-and-ingestion.md#6-validating-onboarding)): the Fluent Button, and Laundry's five unmapped destination states brought in through the manifest as expected states.

Acceptance: a second small web app connects without importing Laundry code, unsupported features stay visibly unavailable, and source refresh, capture, and replay make zero model calls with providers disabled.

## 5. Identity, permissions, and multiplayer

Real identities, scoped permissions, and versioned shared records, following the spec's [multiplayer boundary](product-spec.md#multiplayer-and-ownership). The single local access key and the portal's collaborator access are not this model.

## 6. Journey completeness and replay

Add fixture capture to `bin/signoff` so evidence can be regenerated and becomes visibly stale. Then add replay from start to the scenario player, and native captures as runners allow.

Discovery and replay are deterministic by default. Record journeys with existing Playwright tooling (Codegen, the reporter API, traces) instead of building a recorder, and replay only verified paths, stopping visibly on a miss. Report counts and denominators rather than confidence percentages. Model help is optional, attributed, and budgeted.

Acceptance: ordinary refresh and replay make zero model calls with providers disabled, and failed or cancelled operations never become successful edges.

## 7. Repository hygiene

- Done: the repository is on GitHub at [taymoork2/CIVIC](https://github.com/taymoork2/CIVIC), with local signoffs (`bin/signoff`) instead of GitHub Actions.
- Decide what stays vendored. `rehearsal/design/skills`, the fixture PNGs, and the handoff manifest are handoff material and could move to a release artifact.
