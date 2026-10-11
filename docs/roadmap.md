# CIVIC roadmap

Ordered next steps after [decision 0004](decisions/0004-graph-first-journey-engine-as-viewer.md). The artifact graph is the core, and the journey engine is one viewer and the first web adapter. Each step should end with evidence, not a claim.

Every step follows [decision 0006](decisions/0006-deterministic-civic-for-agentic-teams.md): CIVIC makes no model calls and works from existing non-AI tools and static analysis. [Decision 0007](decisions/0007-review-to-agent-loop.md) lets agents outside CIVIC claim and report work through a narrow interface.

## 1. CIVIC graph schema

Define a small, CIVIC-owned schema outside `rehearsal/` for Intent, Semantic component, Platform component, Component instance, Override, Extension point, Evidence, and Contract Conflict (D29). Instances, overrides, and extension points let CIVIC forecast at design time whether a product team's change to a library component is supported on each platform ([component change flow](component-change-flow.md)). Use stable identities and the alignment states from the [spec](product-spec.md#alignment-states). Keep it plain and file-based until the demo shows what storage it needs.

Reuse the journey engine's distinctions rather than inventing new ones: a connection is declared, observed, inferred, or proposed, and a target is either expected or only discovered in source. Its cross-route actions (`rehearsal/source/apps/web/src/review/route-actions.json`) show the edge shape: route, condition, return context, and whether the destination is mapped. The schema copies these ideas; it never imports the engine.

Built in [`graph/`](../graph): schema v0 types, a validator for the spec's identity, evidence and conflict rules, per-platform override forecasts, and two example graphs (the decision 0001 Button and an illustrative Card). `bin/signoff` runs its checks.

## 2. Fluent 2 Button conflict demo

Build the [decision 0001](decisions/0001-fluent-2-demo-design-system.md) demo on that schema:

- One semantic Button with its variants mapped to Fluent React v9, iOS, and Android Compose.
- Web evidence from Storybook and Playwright. iOS and Android evidence from source and token analysis.
- The Android Figma kit compared with Compose, which raises a Contract Conflict that is classified, given owners, and resolved.
- Tokens move as DTCG where the source supports it. Read Figma structure from a file export; the Variables REST API needs Enterprise access, so the demo can't depend on it.

A design-system Card changed by a product team is the second demo after Button. It follows the review to agent loop below.

Also part of this step ([decision 0006](decisions/0006-deterministic-civic-for-agentic-teams.md)):

- **Contract export (D31).** `civic context` prints the Android Button variant's contract as one work order: intent, states, mappings, tokens, extension points, open records, and the IDs to put in code. `civic gaps` lists what's missing, with owners. Both are read-only queries.
- **Design completeness check (D32).** On the Card demo, static rules flag the states the product team's Card mock is missing (for example empty and error) from the Card contract and the journey's shape.

The demo succeeds when a reviewer can see what disagrees, why it matters, who must act, and how the decision is preserved.

Built in [`demo/fluent-button/`](../demo/fluent-button) on the importers in [`importers/`](../importers). The Button's web, iOS and Android mappings are checked against Fluent's own source at pinned revisions. Web has 13 passing Playwright checks against DTCG token values; iOS and Android have static evidence only. A Figma-export-shaped stand-in for the Android kit raises the Neutral default conflict, and an illustrative decision resolves it as an approved exception. `civic context` and `civic gaps` are in the graph CLI. The real Figma export, Storybook and native runs are still to come.

## Next: the review to agent loop

Ahead of the Card demo ([decision 0007](decisions/0007-review-to-agent-loop.md), [review to agent](agent-review-loop.md)):

1. **Records.** Line, Annotation, WorkRequest, and Actor go into the graph as the start of step 3. Built in [`graph/`](../graph#the-review-to-agent-loop), with validation for D35 to D38, `laneFor` and `resolveAnchor`.
2. **A first slice on the journey engine with Laundry.** Records move from each worktree's `.review-data/` to the git common directory. Annotations get ID and locator anchors, and screenshot import arrives. The canvas gets a lens to switch between worktrees. The CLI gets `civic annotate`, `requests`, `claim`, `report-fix`, and `repro`, with the resolution policy's Auto, batch review, and owner sign-off lanes. Then come the capture overlay for dev and preview builds, the MCP server, and the Claude Code plugin.
3. **PR previews and design drafts** follow, once the Figma import (D27) brings drafts in. Codex packaging comes with them.

Acceptance: an annotation made in one worktree is claimed by an agent in another, the reported fix is re-captured on that worktree's preview with no model call, and the request resolves through its lane.

## 3. Typed contract and change records

Store Proposal, Decision, Adoption, and Verification as separate, owned records, along with the collaboration record types (Ambiguity, Constraint, Coverage gap, Divergence, Risk, Exception). Alignment states read from records instead of being recomputed.

The journey engine already has working examples: `coverage.json` is a Coverage gap record with versioned write-back, and its coverage candidates are proposals that never count as adoption.

## 4. The journey engine as a graph viewer

Point the journey engine's canvas and Contract panel at the graph, with Laundry as one web adapter. Generalize the `@civic/shell` adapter boundary now that Fluent is a second consumer ([decision 0003](decisions/0003-civic-shell-package.md) was paused until then). Follow the v4 handoff's onboarding direction: a local project manifest plus a supported web adapter.

Discover the app by crawling first (D34): one CIVIC crawl loop, on Playwright for web and Appium for native, explores from seeded fixtures with destructive actions blocked, and groups states by DOM or accessibility hierarchy. Crawled states come in as discovered until a person confirms them. Write or generate an adapter only where a crawl can't tell states apart, reach them, or reset them. Add the frame walk (D33): the scenario player walks imported design frames along their prototype links, labelled as design intent.

Validate onboarding with two cases ([onboarding and ingestion](onboarding-and-ingestion.md#6-validating-onboarding)): the Fluent Button, and Laundry's five unmapped destination states brought in through the manifest as expected states.

Acceptance: a second small web app connects without importing Laundry code, unsupported features stay visibly unavailable, and source refresh, capture, and replay make zero model calls with providers disabled.

## 5. Identity, permissions, and multiplayer

Real identities, scoped permissions, and versioned shared records, following the spec's [multiplayer boundary](product-spec.md#multiplayer-and-ownership). The single local access key and the portal's collaborator access are not this model.

## 6. Journey completeness and replay

Add fixture capture to `bin/signoff` so evidence can be regenerated and becomes visibly stale. Then add replay from start to the scenario player, and native captures as runners allow.

Discovery and replay are deterministic by default. Record journeys with existing Playwright tooling (Codegen, the reporter API, traces) instead of building a recorder, and replay only verified paths, stopping visibly on a miss. Report counts and denominators rather than confidence percentages. CIVIC makes no model calls (D30).

Acceptance: ordinary refresh and replay make zero model calls with providers disabled, and failed or cancelled operations never become successful edges.

## 7. Repository hygiene

- Done: the repository is on GitHub at [taymoork2/CIVIC](https://github.com/taymoork2/CIVIC), with local signoffs (`bin/signoff`) instead of GitHub Actions.
- Decide what stays vendored. `rehearsal/design/skills`, the fixture PNGs, and the handoff manifest are handoff material and could move to a release artifact.

## Later, not scheduled

These came out of [agentic development](agentic-development.md) and wait until the steps above give them a base:

- **CIVIC launching agents.** Starting a coding agent on a new worktree from "Hand to agent". The agent interface itself moved to the next build ([decision 0007](decisions/0007-review-to-agent-loop.md)).
- **A capture browser extension** for pages a preview build can't inject the overlay into, such as production.
- **Prototypes.** If reviews need more than the frame walk (D33), the non-AI option is a preview assembled from the component mappings. CIVIC stays out of WYSIWYG and no-code.
- **A return path to Figma.** Reference captures, frames rebuilt from library instances, and token proposals, all through a plugin into a page the designer merges from. This needs the Figma import and plugin first.
- **A rebrand demo.** The Fluent Button and Card re-themed to a second brand, showing the blast radius, hidden overrides, and the migration table. A candidate third demo after Card.
- **New device classes** such as TV and watches. They aren't modelled until they've been researched.
