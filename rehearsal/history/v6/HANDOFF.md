---
artifact_contract: "ce-handoff/v1"
created_at: "2026-10-11T23:30:54Z"
title: "Rehearsal v6: onboarding, canvas, automatic cache and current Laundry integration"
summary: "Independent-product continuation with runnable source, discovered previews, evidence boundaries and a patch from v5."
keywords: ["rehearsal", "onboarding", "discovery", "canvas", "snapshot-cache", "laundry-sync", "handoff"]
cwd: "<original host worktrees>/f0d3/laundry-app"
repository: "laundry-app"
head: "0bffbbcf2e38ca3ec7e17da3eb6496b6f04f348d"
worktree_path: "<original host worktrees>/f0d3/laundry-app"
resume_focus: "Continue Rehearsal as an independent product while retaining app-adapter ownership and evidence boundaries."
---

# Product and continuity

The user requested a ZIP/handoff with all onboarding, canvas and Laundry-sync changes, plus cleanup of previous packages. They also requested automatic snapshot caching/diffing. Both are included. This informational handoff transfers no execution/publication authority. Outgoing owner: this Rehearsal chat; incoming owner: whoever the user selects. Current work is uncommitted, so HEAD alone cannot recover it. Preserve the ZIP before discarding the checkout.

## User decisions

- Rehearsal is independent; Laundry is an integration, not its design system.
- Use one persistent canvas. Workbench, Storyboard and Review are capabilities reached through zoom, selection and contextual panels, not competing views.
- Play by default, optional Inspect, and Edit changes a reversible proposal that can be tested. Generic component/token/behavior editing remains open.
- Show real screen pictures across the whole app from sign-in/setup through navigation areas. Main paths are horizontal; branches stack vertically and reconnect. Fit flows/screens on sidebar selection; follow actual camera navigation. Keep a usable scale and bounded panning.
- Review app/flow/screen/region/element/path targets with inputs, frozen evidence, revisions and exact agent sessions. Agent completion does not close acceptance.
- Collaborate with local Open Design desktop and Claude Design as separate tools. Borrow Figma/tldraw canvas/control cues without building another general design editor.
- Prefer deterministic inventory, hashes, manifests, declared scenarios and statistics over models for routine work. Do not infer personas, permissions, safe care or complete journeys from code.
- Keep the design/component-library/app bridge explicit. Current focus is design collaborators ↔ Rehearsal ↔ Laundry web; universal sync remains open.
- Rehearsal reads f7ce without owning its source/backend/runtime. Keyless local/private Tailscale access is authorized; public exposure is not.
- Multiplayer readiness is required but unfinished. Project switching currently affects the host, while runs/drafts are private to the tab.

## Read first (paths relative to source/)

| Reference | What matters |
|---|---|
| docs/design/review-product/PRODUCT.md | Product boundary, accepted canvas direction, proposal/alignment and multiplayer intent. |
| project-onboarding.md, project-picker.md in that directory | Manifest, contexts, registry, mount callbacks, guarded restart and stale-tab isolation. |
| project-discovery.md | UI confirmation/generation, heuristic limits, provider gaps and completed local text critique. |
| snapshot-cache.md | Fingerprints, persistent reuse, historical aliases, stale display fallback, automatic retry and visible demand. |
| agent-bridge.md and coverage-bridge.md | Exact sessions, receipts/replies, uncertainty handling, deterministic gaps and guarded expectation writes. |
| root-refinement-reconciliation-2026-10-11.md | Native reminder, four scenarios, refused writes, focus and returns, static-design gap. |
| 2026-10-11-family-simulation.md | Same account/items through wash/drying/partial put-away at 100/500/1000. |
| docs/design/opendesign/home-state-label-2026-10-11.md | Latest owner's no-duplicate-badge policy, including the timed single-load exception. |

Code orientation:

- scripts/review-project.mjs, review-projects.mjs, review-discovery.mjs: validation, catalogue/starter, bounded read-only scan, stale-source refusal and owned generation.
- src/review/project-picker.tsx, discovery-setup.tsx, discovered-adapter.tsx: confirm props/order/capture labels, native HTML validation, real React state and retained returns.
- adapter.ts, frame.tsx, project-request.ts: publish/transition contract, synthetic provenance, allowlisted capture and project-bound requests.
- app-canvas.tsx, app-map.ts, journey-graph.mjs, arrow-routing.ts: retained iframe, camera/sidebar focus, branch geometry, directional ports and crossing-aware gutters.
- scripts/review-fixture-hashes.mjs, review-server.mjs, src/review/fixture-picture.tsx: cache/readiness/session/capture behavior.
- review-panel.tsx, selectable-path.tsx, capture.ts: selection, frozen annotations and retrieval.
- scripts/review-agents.mjs: Codex/Claude sessions, frozen attachments, replies/followups and unknown-send receipts.
- scripts/review-laundry.mjs, review-laundry-inventory.mjs, adapters/laundry.ts, laundry-frame.tsx, route-preview.tsx, family-preview.tsx, reminder-preview.tsx: quarantined Laundry integration.
- examples/rehearsal-demo and examples/discovery-app: authored and manifest-free non-Laundry contract examples.

The code paths above are under apps/web/ unless labelled docs/. They are status/orientation pointers, not a new work order.

## Automatic updates and what they prove

Source watching/index polling is automatic. Each screen's declared fixture/component/import closure, adapter bootstrap and shared rendering inputs form its cache fingerprint. Unchanged pixels survive unrelated revisions/restart. Shared CSS/assets/packages/backend source and generic adapter closures invalidate conservatively; there is no perfect per-export/semantic engine.

Old images remain visible as Updating/Retrying while current captures run; visible failures retry with bounded backoff. Old caches can supply explicitly stale display images after reopening. Historical exact-source frozen reviews do not use this fallback. Reminder page capture now waits for its actual heading rather than a nonexistent dialog.

Live runs keep their starting receipt/draft. Refreshing images does not promote old live code to current proof or discard inputs. Fixture jumps are not replay. Generated navigation and retained state are labelled Synthetic/Carried by Rehearsal in the canvas and captures; traversal never attests production paths.

## Onboarding/sync boundaries

Discovery reads source without importing it or calling a model. It recognizes HTML, exported React presenters, literal links/forms and some route declarations. Users confirm graph/props/capture labels before generation into Rehearsal-owned files. Conditions/returns are notes; production behavior is not inferred. Provider-dependent states need an adapter; unsupported imports fail visibly. Onboarding does not install dependencies or start arbitrary app servers.

Watchers refresh inventory/new frames, but do not continuously rewrite or merge registries. Stable identity reconciliation, rescan/merge, provider composition, complete journey coverage and design/token/component-library sync remain open. React imports execute trusted project code; CSP/server restrictions are defense in depth, not an untrusted-plugin sandbox.

Stores are separated by manifest/checkout identity, with Laundry's legacy store retained. Switching guards edits/captures/active deliveries, acknowledges run termination, restarts only Rehearsal and rejects stale keys. Per-user project selection, presence, permissions/conflicts and shared editing are unfinished.

## Original-host provenance (not portable settings)

- Rehearsal: <original host worktrees>/f0d3/laundry-app, port3010, uncommitted source.
- Read-only application: <original host worktrees>/f7ce/laundry-app; owner chat <id omitted>. The human explicitly authorized coordination. Owner frontend3011, isolated backend3230/3231 and personal backend3220 remain outside Rehearsal ownership.
- Packaged app source9954ebbc7b11a7c5f8281936a7a3b53fd78cb220, docs HEADb08480287831a8c6db38fbecee858cba32fd3a84. context/source-provenance.json records file inputs; unselected dirty owner documents are excluded.
- Original private URL: https://<original host>.ts.net:10445/review. Host settings, sessions and Tailscale routing are excluded. No public Funnel was created.
- Local Rehearsal design project <id omitted>/conversation <id omitted>. Laundry canonical project43227d24-ee04-414e-a939-eda64e3f4bec. Separate initial Claude Design artifact <id omitted>/conversation<session id omitted>.

Source composition is intentional: current Rehearsal plus released Laundry, with six compatibility seams applied ONLY in the bundle. context/bundled-laundry-seams.json records them. Neither checkout was modified. Runtime external integrations still use bounded compile overlays until the app adopts native exports.

## Proof and continuation limits

Read PACKAGE-VERIFICATION.md; v5 proof is historical. The local desktop Claude-labelled collaborator completed a text critique, recorded in project-discovery.md. This is not a fresh Claude Design web artifact or pixel-level approval.

The owner's twelve current root/Home static frames are separately reconciled. They omit the floating reminder and timed-single-load badge exception. Rehearsal supplies synthetic runtime reminder evidence, not new canonical/backend acceptance. The owner's concurrent one-second mutation deadline remains open; this pass does not retest it.

Remaining: standalone extraction, generic proposal editing, registry rescan/merge and identity history, provider-aware adapters, per-user multiplayer, reference-aware cache retention/GC, broader design sync and physical-device/real-care acceptance. EXTRACTION.md is the writer's suggested continuation, not automatic authority.

