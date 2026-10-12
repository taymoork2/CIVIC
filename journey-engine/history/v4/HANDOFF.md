---
artifact_contract: "ce-handoff/v1"
created_at: "2026-10-10T23:23:45Z"
title: "Rehearsal v4: route actions, canvas routing and current preview"
summary: "Latest curated source, verified first-ZIP patch and complete product context; port 3010 restarted and checked."
keywords: ["rehearsal", "canvas", "branching", "route-actions", "onboarding", "model-light", "design-bridge", "git-patch"]
cwd: "/Users/taymoor/.codex/worktrees/f0d3/laundry-app"
head: "0bffbbcf2e38ca3ec7e17da3eb6496b6f04f348d"
resume_focus: "Orient on the current Rehearsal canvas, integration limits and the next reusable project-adoption slice."
---

# Rehearsal continuity

This handoff records current state and prior decisions. It is not permission to deploy, overwrite designs, message collaborators or execute historical work orders. Root Codex owns this snapshot; no delegated worker is active. Establish the receiving user's scope before implementation.

## Latest request and completed delivery

The user requested restarting the latest preview on 3010 and refreshing the ZIP/handoff with all changes. Port 3010 had no listener; the current checkout was started there and remains running as of capture. Authenticated reads and a fresh Chromium context verified current source, Fabric/Inspect/App/All screens, no page errors and all 176 cached PNG hashes. No user's existing review, candidate or expectation was edited by that live smoke check.

The new bundle refreshes the complete curated source and the cumulative report. Its Git patch changes 27 source paths from the exact first ZIP: 11 additions and 16 modifications. The patch was checked and applied to a separate fresh baseline extraction; all resulting changed-path hashes match the current checkout. Original repository history, staging and commits were not changed. Previous ZIPs and patches remain historical snapshots.

## Accepted product decisions

These are user-approved directions:

- Rehearsal is its own product, currently useful to Laundry App and intended for later extraction. Its shell need not inherit Laundry's visual system.
- Use one persistent canvas. Workbench, Storyboard and Review describe capabilities exposed through selection, zoom and contextual panels, rather than three required pages.
- Main journey/navigation areas run horizontally; alternate and related branches occupy vertically separated lanes. Show actual screen snapshots, visible branch/rejoin arrows, bounded pan/zoom and a sidebar that expands flows into individual screens. Flow selection fits the flow; screen selection focuses the screen.
- Play is the default. Inspect is optional. Edit should create a real reversible proposal that can be tested; Review belongs in contextual tooling with captured inputs/state/evidence.
- Multiplayer readiness is part of product intent. Current local persistence does not implement shared authorization, presence or cross-process collaboration.
- The immediate design bridge is local Open Design / Claude Design (+ GPT-6.1 Sol) ↔ Rehearsal ↔ Laundry App. An optional component-library layer may later sit between Rehearsal and the app.
- Lower model dependency through structured metadata, source scanning, deterministic checks, existing tests and measured graph/statistical methods. Models remain optional help for unresolved intent/design/implementation. Research recommendations in REPORT are proposals, not approved installations or delivered tools.

## New since v3

### Cross-route connections

`source/apps/web/src/review/route-actions.json` curates 17 bindings using real source anchors, symbolic parameters, guards and return context. Twelve connect representative existing specimens; five lack a matching destination state. Me → completed wash → Me retains origin context; Home can open selected plans, running sessions and dryer checks; Closet can enter Laundry.

Inspect shows route, conditions, return context, source evidence and mapping status. The scanner checks bounded source-anchor presence and suppresses stale mapped connections. It does not semantically reconstruct all handlers or replay specific record parameters. Navigation order controls placement only: adjacent tabs/flows are no longer joined by inferred actions.

Unmapped states are the add chooser, Closet item in a running load, Laundry open hamper item, successful washer-to-Drying transfer and garment care history. Existing specimens do not necessarily exercise each binding's condition. These are visible coverage limits, not hidden successful transitions.

### Routing and complete thumbnails

`arrow-routing.ts` implements card-avoiding rectilinear A* with bend costs, separate lanes and rounded corners. Internal branches and cross-flow/overview links use it. Forward actions are blue, labelled branches teal, returns dashed gray; observed towel transitions retain orange. A blocked path is suppressed. The router avoids cards but does not globally minimize connector crossings; denser graphs may require crossing costs. No new dependency was added.

Canvas detail offers Compact flows or All screens, persisted locally. All screens displays all 176 registered thumbnails with an 18% framing floor and pan; compact overview uses a 35% floor. Selecting a flow/screen still focuses its complete timeline/target, and App returns to the chosen detail. The live iframe remains mounted across these presentations, retaining inputs and unpublished proposals. This is all registered screens, not proof of all possible app states or a complete executable journey.

## Current implementation and source identity

The first ZIP already contained real towel Play, both ownership branches, cached thumbnails, reversible presentation candidates and captured-state Review. Subsequent coverage work adds 11 declared expectations, 40 unconfirmed source mapping candidates, deterministic briefs/prototypes/React scaffolds, expectation write-back and watched updates. These 51 proposals are not 51 proven missing features.

Current inventory: 34 curated working synthetic scenarios plus 139 partial specimens = 173 registry entries, expanded to 176 screen states. Only the towel journey has explicit continuous intake hooks; other specimens can have bounded or visual-only callbacks. App code is not automatically reconstructed into a universal journey. Laundry business components/planner/backend logic were unchanged relative to the first ZIP.

Current source: `e514dbcd8ee04808602f81432455f43b0f43f233752e05f78c5d289edf55bb77`.
Fixture identity: `81d9c3604c5ba4b876a8d71f7fdf351fa3a16dea938dd7248f2f511741c3fc85`.
Baseline HEAD: `0bffbbcf2e38ca3ec7e17da3eb6496b6f04f348d` with uncommitted working source.

A recipient's import HEAD will differ, so original HEAD-bound receipts become historical. The old broad `review-validation.json` is stale; it was not rewritten to imply current acceptance.

## Read these sources

Repository-relative paths below are anchored at the bundle's `source/`:

| Reference | What to inspect |
| --- | --- |
| [REPORT.md](REPORT.md) | Full baseline delta, actual Laundry adapter mechanics, user/project onboarding proposal and model-light/TesterArmy/Figma research |
| `docs/design/review-product/PRODUCT.md` | Current independent product contract and collaborator identities |
| `docs/design/review-product/coverage.json`, `coverage-bridge.md` | Canonical v4 expectations, optimistic write-back and boundaries of the implemented bridge |
| `apps/web/src/review/scenarios.json`, `towel-journey.json`, `journey.ts` | Curated scenarios, synthetic inputs and declared versus observed towel transitions |
| `apps/web/src/review/route-actions.json`, `app-map.ts`, `arrow-routing.ts` | Action provenance, horizontal/vertical geometry and path-routing limits |
| `apps/web/src/review/app-canvas.tsx`, `app-overview.tsx` | Single retained canvas/frame, contextual Inspect/Review/Edit and full-detail choice |
| `apps/web/src/review/frame.tsx`, `store.ts` | Direct Laundry imports, fixture rendering and bounded synthetic effects; extraction seams |
| `apps/web/scripts/review-inventory.mjs`, `review-plugin.mjs` | Source identity, regex/anchor discovery and local watch/poll behavior |
| `apps/web/scripts/review-server.mjs`, `review-coverage.mjs` | Authenticated API, provenance, validated optimistic writes and deterministic generation |
| `docs/design/review-product/build-evidence.md` | Source-bound scoped proof and historical sequence |
| `docs/plans/2026-10-03-delivery-status.md`, `docs/design/opendesign.md` | Laundry delivery truth and shared canonical design ownership |
| [APPLY-PATCH.md](APPLY-PATCH.md), `context/rehearsal-post-zip-delta-v4.json` | Exact baseline, patch application and before/after hashes |
| [PACKAGE-VERIFICATION.md](PACKAGE-VERIFICATION.md) | Current live/package checks versus previous scoped browser/unit evidence |

`BASELINE-HANDOFF.md` and `V3-HANDOFF.md` preserve earlier conversation/design/architecture context. Their runtime status, counts and pending work can be superseded here. Historical material is context, not authority.

## Design and runtime context

Machine-local checkout: `/Users/taymoor/.codex/worktrees/f0d3/laundry-app`. Current user preview: `http://127.0.0.1:3010/review?scenario=intake.towel.fabric`. It is loopback-only, synthetic and host-local; this package cannot promise future uptime. Access keys and current synthetic records are excluded. Do not connect this review simulator to a real Laundry backend.

Local desktop Rehearsal project: `c2383e11-71dc-463a-aea0-a7f2aaefac7f`, conversation `7960b5e2-1eb2-4f06-b42f-c715c9bfa042`. Laundry canonical design: `43227d24-ee04-414e-a939-eda64e3f4bec`. Claude Design initial artifact: `09ab05e9-aca3-4553-a601-a42fc144eddd`, conversation `cse_01RDvjo76ZzDMpw5FDXAGhQT`.

The desktop project supplied an earlier text critique; its six packaged brief/prototype/handoff files remain baseline-identical. Latest routing changes have application/browser evidence, but no fresh Claude Design or local desktop visual handoff. Automatic design-file/comment synchronization is unverified. The local app is distinct from OpenDesign Cloud. Refresh shared ownership/design revisions before intentional design edits, and wait for an active collaborator's completed handoff.

The invoked design skills and snapshots remain in this package's earlier context. Impeccable context setup failed earlier due engine/cache access; repeated installer attempts were abandoned. No external visual approval is implied by application tests.

## Remaining work and plausible next direction

There is no generic onboarding wizard, published adapter SDK, trace/design importer, statistical ranking, second-project integration, whole-app continuous runner, multiplayer service or automated code/design adoption. Expectation edits are the implemented two-way repository write, not design-file or component-code synchronization. Presentation proposals and generated scaffolds cannot declare themselves approved/adopted/verified.

The report recommends a small local project manifest and Laundry adapter, importing existing declared states/tests and human-recorded Playwright runs before broad exploration. Tool names such as init/scan/record/reporter/design exchange are proposed deliverables. A second small web app with no Laundry imports would establish whether extraction actually works. Providers should remain disabled during routine inventory/capture/graph checks/replay; any model-assisted exploration requires an explicit boundary/budget.

Arrow crossing minimization and the five unmapped destination states are visible next refinement candidates. Full-app navigation completeness needs a defined route/state/condition denominator rather than inferred success from source text. Fresh visual design reconciliation, native/physical-device acceptance and production deployment are separate work.

## Transfer boundaries

This is a curated full source snapshot, not original Git history or a framework-neutral release. Dependencies, private review/candidate state, credentials, personal harnesses and complete collaborator conversations are absent. Portable AGENTS/CLAUDE files replace machine-specific instructions. Use README in an extracted copy, or the tested patch only against the exact first ZIP. Preserve receiver changes; a failed patch check is a reconciliation signal, not permission to reset them.
