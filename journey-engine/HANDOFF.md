---
artifact_contract: "ce-handoff/v1"
created_at: "2026-10-12T04:32:15Z"
title: "Rehearsal v7 shared runtime and towel migration"
summary: "Portable Rehearsal with real isolated Laundry actions, first curated towel migration, saved replay, proposal commands and adapter direction."
keywords: ["rehearsal", "runtime-bridge", "towel", "replay", "onboarding", "vite", "native-adapters"]
cwd: "<original host worktrees>/f0d3/laundry-app"
head: "0bffbbcf2e38ca3ec7e17da3eb6496b6f04f348d"
worktree_path: "<original host worktrees>/f0d3/laundry-app"
resume_focus: "Continue curated fixture migration and standalone extraction while retaining actual app behavior and isolated replay."
---

This is an informational handoff requested by the user. It transfers no authority over the original source, backends or design projects. Start with README.md, PACKAGE-VERIFICATION.md and CHANGES-SINCE-V6.md. Repository-relative references below are anchored in source/.

## User direction

Rehearsal is its own product; Laundry is the reference integration. The user approved one persistent bounded canvas, Play by default, optional Inspect, contextual Review, and Edit proposal that changes a testable candidate. Claude Design's Workbench, Storyboard and Review are capabilities within that canvas. Actual screen images appear along horizontal journeys; alternate branches stack vertically and reconnect. Flow selection fits its bounds and expands its screens; screen selection focuses it. The outline follows camera navigation. Compact/all-screens views share the retained run and lazy snapshots. The shell has its own design identity rather than inheriting Laundry's system.

The user wants existing/greenfield project onboarding, source-change sync, explicit missing coverage, screen/flow/region/path annotations and two-way agent communication. Design intent, libraries, app source, recordings and user acceptance keep independent identities/revisions. Initial design collaboration is local Open Design and Claude Design plus Local Codex; do not substitute OpenDesign Cloud or require a cloud account. Figma/Paper and native integrations are roadmap candidates.

Latest request: migrate remaining curated fixtures to the shared bridge, starting with towel, preserving branches/inputs/proposals/replay, then refresh this package. The annotation also asked how adapters should work for Vite/Vite+, TanStack Start/Convex and eventually native iOS/Android. Towel is the first completed curated migration; the rest remain open.

## Current implementation

| Capability | Landing point and meaning |
|---|---|
| Canvas | apps/web/src/review/app-canvas.tsx, app-map.ts, app-overview.tsx, arrow-routing.ts and camera modules. Persistent preview, snapshots, branches, selectable paths and contextual panes. |
| Onboarding | scripts/review-project*.mjs, review-discovery.mjs and src/review/project-picker.tsx/discovery-setup.tsx. Connect configured apps, confirm source candidates or create a starter. Generated navigation stays labelled synthetic. |
| Shared recorder | src/review/runtime-bridge.ts and runtime-dom.ts. Project/source/seed/clock-bound gestures, semantic checkpoints, operation receipts and refusal on drift/ambiguity. |
| Generic host | frame.tsx and adapter.ts. Mount/publish compatibility, runtime ports, input policies and custom interaction drivers/commands. |
| Isolated backend | review-runtime.mjs/review-runtime-worker.mjs, adapters/laundry-backend.ts and convex-runtime-client.ts. One database/worker per run, actual schema/functions/authorization; no deployed app endpoint. |
| Laundry session | adapters/laundry-session.ts. Shared data/identity/reset, frozen clock, repeatable review-only UUIDs and memory-only storage. |
| Native routes | adapters/laundry-runtime.tsx and laundry-app-root.tsx. Actual routes/components/search validation; Home Wear and Drying/check/put-away. |
| Towel | adapters/laundry-towel.tsx. Actual AddClothesFlow and native mutation hooks/recovery; both origin branches, care substeps, retained inputs, proposals, save/recovery and fresh replay. |
| Reviews/agents | review-panel.tsx, run-controls.tsx, review-server.mjs, review-recording.mjs and review-agents.mjs. Frozen reviews attach recordings; cards/briefs link to download/replay. Exact configured sessions and harness receipts/replies remain explicit. |
| Sync/cache | review-plugin.mjs, review-fixture-hashes.mjs and fixture-picture.tsx. Source watching, content-addressed PNGs, stale evidence, visible-demand scheduling and draft boundaries. |

scripts/review-laundry.mjs passes fixture/presentation/state props through the existing Flow without changing its mutation hooks. The checked in-memory overlay fails when source shape drifts. The towelJourney object is now a compatibility view for canvas/proposals, not another data store or replay engine. The portable copy applies six checked seams so TypeScript sees review exports; context/bundled-laundry-seams.json records their hashes. App behavior stays unchanged when review props are absent.

## Onboarding and remaining migration

Read docs/design/review-product/project-onboarding.md, project-discovery.md, runtime-bridge.md and platform-adapters.md. Source scanning finds candidates; it cannot infer business state, identity, safe fixture data or exhaustive branches. Each project supplies a root router/data/identity adapter. Ordinary new screens using it need no separate recorder or mutation handler.

The author's recommendation separates build connectors, runtime/data adapters and interaction drivers. Vite/TanStack/Convex is first. Later SwiftUI/Compose drivers should share semantic IDs and recording/review envelopes, not the DOM implementation. That is a researched direction, not shipped native support. Routine scanning, recording, caching and comparisons require no model calls.

Multicolor intake is the closest next fixture: reuse the real Flow/session with an authored pack state. Saved records/nested editors should use actual Closet routing and concrete seeded IDs. Appliance/product, profile/water, family/reminder and route specimens still use earlier bounded adapters. Do not wrap the simulated store and call that debt paid. Test each fixture's real writes, guards, branches and returns before retiring it.

The host remains in apps/web with Laundry dependencies; this is a runnable monorepo snapshot, not a published standalone SDK. EXTRACTING-REHEARSAL.md identifies the boundary. Keep the non-Laundry Notebook as a contract test and generated HTML/React as labelled synthetic discovery. Coverage expectations remain authoritative; generated prototypes do not establish implementation or acceptance.

## Ownership and machine-local state

Rehearsal owns <original host worktrees>/f0d3/laundry-app, detached at the head above; dirty/untracked Rehearsal work is included. Linked app <original host worktrees>/f7ce/laundry-app was read-only, captured at c325b5ef848b90fa8a68ea1beec5602f3b7a11f8. Per-file hashes in context/source-provenance.json bind working-tree inputs more precisely than HEAD.

The linked owner is Codex chat <id omitted>. The user authorized coordination; the owner was notified about real Flow/recovery integration. This package grants no authority to message it. Do not restart that owner's 3011 frontend, 3230/3231 backend or personal 3220 backend. Original Rehearsal uses 3010 and a private Tailscale proxy; host settings/reviews are excluded. Receiving hosts use bundled source and must configure their own connections.

Excluded: private .review-data, generated user projects, credentials/environment, account/catalogue/backend state, agent destinations, Git internals and dependencies. Keep review data and product households separate. Workers execute trusted project code; fetch blocking and Node workers are not an OS sandbox for hostile repositories.

## Evidence and limits

PACKAGE-VERIFICATION.md records exact lanes and portable proof. Towel checks actual arguments/results, branch routes, input retention, proposal persistence/color, recovery and reset. Snapshot regression checks portal-mounted screens using the attached ready marker rather than visibility of the empty/inert root behind a modal. evidence/historical is labelled older visual context, not current acceptance.

Replay compares semantic fields/views/routes and effect receipts, not every pixel/query. Transport is JSON-safe; full Convex OCC/optimistic/auth, server actions, external services and native drivers remain unsupported. Multiplayer editing and complete design-tool sync are unfinished. Physical-phone, production-backend and fresh canonical-design acceptance were not claimed. The user remains acceptance owner.

context/since-v6.patch applies only to exact v6 source and is checked against every resulting file hash. Use this source snapshot to start a new checkout; do not apply the patch to an unrelated Laundry branch. Confirm new work scope with the receiving user before continuing.
