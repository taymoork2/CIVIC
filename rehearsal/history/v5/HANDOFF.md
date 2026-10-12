---
artifact_contract: "ce-handoff/v1"
created_at: "2026-10-11T21:36:03Z"
title: "Rehearsal v5: project onboarding and portable handoff"
summary: "Reusable application adapter, project picker, runnable starter, captured reviews and current source with worktree ownership retained."
keywords: ["rehearsal", "onboarding", "project-picker", "adapter", "canvas", "handoff"]
cwd: "<original host worktrees>/f0d3/laundry-app"
repository: "laundry-app"
head: "0bffbbcf2e38ca3ec7e17da3eb6496b6f04f348d"
worktree_path: "<original host worktrees>/f0d3/laundry-app"
resume_focus: "Continue Rehearsal from the inspected portable snapshot without taking ownership of the linked product checkout."
---

# Current state

The owner requested a project picker and existing/new-project onboarding without using the CLI, plus a refreshed ZIP and handoff. That UI is implemented and verified. This handoff is informational; it grants no new execution or publication authority. The current Codex chat remains the implementation/integration owner. No commits, pushes or production deployment were performed.

This bundle contains uncommitted Rehearsal work from f0d3. Its base Git HEAD alone cannot recover these changes; preserve or transfer the ZIP/source before discarding a worktree. The ZIP is an independent snapshot, not a repository history or a clone of the separately evolving Laundry product checkout.

## User decisions

- Rehearsal should be an independent product that can eventually be spun out. Laundry is its first application integration, not its design system or universal adapter.
- Use one persistent canvas. Workbench, storyboard and review are capabilities supplied by zoom, selection and contextual panels, rather than separate competing views. Play is default; Inspect is optional; Edit must create a testable proposal.
- Use real screens in journey nodes, static screenshots for overview performance, horizontal timelines, vertically stacked branch lanes and visible declared-action arrows. Sidebar selection fits a flow or screen; camera focus follows the entry.
- Support comments/annotations on the app, flow, screen, element/region and path, retain state and evidence, and let an agent address a saved review. Agent completion is not product acceptance.
- Keep the source/design/component-library/application bridge explicit. Prefer deterministic inventory, manifests, authored scenarios and statistics over model calls for routine operations.
- Work with the user's local Open Design desktop project and Claude Design. Existing completed artifacts are retained; this onboarding pass has no newly completed collaborator critique.
- Keep Rehearsal work separate while reading the product owner's f7ce changes automatically. Keyless local access and private Tailscale access are authorized; public exposure is not.

## Completed capabilities and entry points

Paths below are relative to the package's `source/` directory.

| Read first | Why it matters |
|---|---|
| `docs/design/review-product/PRODUCT.md` | Independent product direction, proposal/alignment and multiplayer intent. |
| `docs/design/review-product/project-onboarding.md` | Portable manifest fields, authored contexts, scenario/branch registry, synthetic mount callbacks, watching and trust boundaries. |
| `docs/design/review-product/project-picker.md` | UI onboarding, read-only source policy, atomic selection, restart, stale tabs and proof. |
| `rehearsal.project.json` | Explicit Laundry adapter rather than implicit coupling. Absolute machine bindings are not stored here. |
| `apps/web/scripts/review-project.mjs` | Shared path/manifest/scenario validation, `init` and `check`, resolved project identity. |
| `apps/web/scripts/review-projects.mjs` | Saved catalogue; connect without app writes; owned inventory integration; runnable starter; validated selection/settings. |
| `apps/web/scripts/review-plugin.mjs` | Selected aliases/asset/filesystem bindings, generic virtual modules, source watch, isolated entry routing and same-port restart. |
| `apps/web/src/review/adapter.ts`, `frame.tsx` | `mount`, `publish`, declared `transition`, synthetic contexts, retained iframe, input allowlist and visible adapter failure. |
| `apps/web/examples/rehearsal-demo/` | Independent real DOM screens and browser adapter: home/edit/saved/review, branch/return, roles and save-error preset. New-project template. |
| `apps/web/src/review/main.tsx`, `project-request.ts`, `project-picker.tsx` | Initial project-bound API requests, accessible picker/modal and guarded switching. |
| `apps/web/src/review/app-canvas.tsx`, `app-map.ts`, `journey-graph.mjs` | Shared graph, bounded camera, real-screen overview, branches, selection and live runs. |
| `apps/web/src/review/review-panel.tsx`, `selectable-path.tsx`, `capture.ts` | Target/region/path reviews, frozen evidence and machine-readable retrieval. |
| `apps/web/scripts/review-server.mjs` | Keyless sessions, exact origin/private proxy guards, durable captures/proposals/reviews and project API. |
| `docs/design/review-product/agent-bridge.md`, `scripts/review-agents.mjs` | Configured exact Codex/Claude sessions, frozen attachments, receipts, replies/followups and uncertain-send handling. Private destination registrations are excluded. |
| `docs/design/review-product/coverage-bridge.md`, `scripts/review-coverage.mjs` | Intent/source/evidence distinctions; deterministic gaps and proposal scaffolds; guarded writes to the selected expectation contract. |
| `docs/design/review-product/2026-10-11-family-simulation.md` | Same-state family care loop, scale fixtures, wash/dry/put-away and synthetic limits. |
| `docs/design/review-product/build-evidence.md` | Earlier route, annotation, capture, family and harness proof. Historical counts are not current acceptance. |
| `docs/design/review-product/proposals.md`, `screen-canvas.md` | Actual collaborator artifacts and accepted canvas direction, separately from application proof. |

Connecting an existing app with a manifest reuses its contexts and adapter. Without one, onboarding creates a Rehearsal-owned descriptor and empty registry, then exposes unconfirmed source candidates. It does not infer a complete user journey or invent user personas. New projects start with a runnable note-writing template. They do not receive a generated full product.

Saved generic records are scoped by resolved manifest and checkout identity. Laundry App retains its existing legacy store. Switches rebuild the Vite binding on the same port, retain saved records and end the in-memory run with explicit acknowledgement. Proposal edits and pending/failed captures block switching; active agent deliveries must finish. Stale tabs send their old project key and receive a conflict, rather than changing the new project's records. The preview is shared by local/phone users; selection is not per-collaborator multiplayer state.

## Machine-local ownership and runtime

These absolute paths are provenance for the original host, not portable package settings:

- Rehearsal: `<original host worktrees>/f0d3/laundry-app`, port **3010**. Live application source is `<original host worktrees>/f7ce/laundry-app`, read-only. Its owning chat is <id omitted>; that user explicitly authorized coordination. Product owner frontend **3011**, backend **3230/3231** remain outside this chat's scope.
- Latest inspected f7ce HEAD: `2e0fcd33bb0450ad74e498c2ef7046ee569c09da`; its additional dirty design/delivery documents are owner work. The current connected inventory has **199 scenarios / 202 graph nodes**. These can refresh as the owner changes code. The bundled f0d3 integration has fewer states; that difference is expected.
- Private HTTPS: `https://<original host>.ts.net:10445/review` proxies this host's 3010. Its settings and session credentials are excluded. No public Funnel exposure was added; other Tailscale routes were preserved.
- Local design project for Rehearsal: <id omitted>; earlier conversation <id omitted>. Laundry canonical design is separate: `43227d24-ee04-414e-a939-eda64e3f4bec`. This bundle has curated historical exports, not the user's complete app database/account state.

The product owner confirmed that its release lacks the optional native presenter/intake review seams. Compatibility transforms remain quarantined in `review-laundry.mjs`, and actual Laundry imports in `laundry-frame.tsx`/its adapter. They are compilation-only and fail on unexpected source drift; they never edit f7ce. Removing those overlays needs a separate product-owned handoff.

## Current proof and practical limits

See `PACKAGE-VERIFICATION.md` for this pass's commands, results and portable smoke test. Node/Chromium proof uses synthetic state. Earlier design/device/backend receipts cannot be promoted to current UI, device or production acceptance. Physical phone use, a fresh Claude Design/local desktop critique, native framework adapters, generic proposal editing and exhaustive automatic journey extraction remain open.

The source has not been extracted into a standalone distributable Rehearsal package. It still carries Laundry libraries/presenters and the host's Vite configuration. Dependencies, personal reviews, agent destinations, private machine connections and generated user projects must be recreated by the receiving host. Starting the server remains a host setup step; per-project connection/creation/switching now happens in the UI.

## Known verification repair

The older canvas test encoded a fixed 183-node count and obsolete review labels. The active f7ce graph now has 202 nodes. The test now reads the registered graph's count and current review controls, then verifies that the same live draft survives navigation, review and candidate proposal play. This repaired test passes; it is not evidence that the product graph was reduced to an old count.

## Continuity

Use this source as the current snapshot. `context/source-delta-v4.json` and `context/since-v4.patch` describe its exact source change from v4; old documents live under `history/v4/`. Read the product/connection contracts before choosing further work. Plausible next work is a separately scoped design critique of onboarding, explicit adapter editing support, or extraction into an independent package; none is automatically authorized by this handoff.
