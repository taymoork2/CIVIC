# v0 import synthesis: what the journey engine gives CIVIC

- **Date:** 2026-10-10
- **Decision:** [0002 — The v0 journey engine is the CIVIC base](decisions/0002-v0-journey-engine-is-civic-base.md)

On October 10, 2026 the founder's v0 journey engine handoff — built in the Laundry App repository — was imported into [`rehearsal/`](../rehearsal/) and continued as CIVIC's implementation base. This document states plainly what the imported system already does, what was added in this repository, and what evidence exists for each claim.

## What the v0 engine already provides

- **One persistent journey canvas** covering the whole Laundry App: 173 registered screens across 176 captured fixtures, horizontal flows with branch lanes, pan/zoom, selection, and a live synthetic towel run.
- **Bidirectional traceability**: each screen node links to its scenario, component files, and checks, with source and design hashes recorded at capture time.
- **Contextual review**: frozen screen capture, allowlisted captured inputs, revision, retry identity, and resolution — all stored with the review, never inferred from screenshots.
- **Proposals**: versioned heading/action/color edits that can be played on the real screen in place.
- **A three-way Product Contract surface** (added here): per-screen Design / Engineering / QA evidence and whole-app coverage, with an alignment state that is never stronger than the evidence (`Unreviewed drift` for an open review, `Aligned` only when every dimension is proven, otherwise `Unknown / evidence stale`).
- **Loopback-only review server** with explicit access-key login and collaborator bypass for the Amp portal; public visitors, other hosts, and cross-origin writes are refused.

## What is deliberately not done

- The Laundry App domain code still sits inside `rehearsal/source`. Shell extraction has started with `@civic/shell` ([decision 0003](decisions/0003-civic-shell-package.md)); the canvas composition and panels are still in the Laundry app.
- Native (iOS/Android) evidence is 0/173 proven; the Fluent 2 cross-platform adapter ([decision 0001](0001-fluent-2-demo-design-system.md)) is not implemented.
- Coverage counts come from the current specimen inventory; they are not a claim of full app coverage.
- Portal access is personal-thread access, not the multiplayer permission model.

## Verification evidence (this repository)

| Check | Result |
|---|---|
| Handoff integrity (`sha256sum -c SHA256SUMS`) | 1118 of 1124 files match; the 6 mismatches are `apps/web/package.json`, `scripts/review-plugin.mjs`, `scripts/review-server.check.mjs`, `scripts/review-server.mjs`, `src/review/app-canvas.tsx`, `src/review/canvas-chrome.css`, which carry post-import review-server work verified below |
| Orb setup (`.agents/setup`) | passes: `pnpm install --frozen-lockfile`, Google Chrome for captures, thumbnail seeding |
| Web app unit tests (`vitest run`) | 800 passed |
| Planner/convex node tests (`pnpm -r test`) | 13 passed |
| Review server checks (`pnpm run test:review`) | 5 passed |
| Type and style checks (`pnpm run check`) | passed (1591 static utilities compile) |
| Playwright review-canvas journey (against the live review service) | 1 passed |
| Contract panel rendering | verified desktop (1440px) and phone (390px) in a fresh orb |

The `contract.ts` / `contract.tsx` evidence was additionally browser-verified in the source thread, with captures in `.amp/in/artifacts/civic-contract-*.png`.

## After the shell extraction (decision 0003)

Rerun on the extraction branch with Node 22 and pnpm 12.5.1:

| Check | Result |
|---|---|
| `pnpm run check` (shell, planner, Convex, web) | passed (1591 static utilities compile) |
| `pnpm test` | web 794 + shell 6 Vitest, Convex 451, tokens 7, planner node suites and 13 web node checks, all passed |
| Review server checks (shell) and inventory/adapter checks (web) | 5 and 2 passed |
| Playwright review-canvas journey against the live review service | 1 passed |
| Desktop (1440px) and phone (390px) render of the canvas | 176 screen nodes, shell styles applied |
| Fixture-source hash | unchanged at `eb66a3b7…`, so bundled thumbnails stay valid |

The six web tests that moved now run in the shell package, which is why the web count dropped from 800 to 794. The handoff's `SHA256SUMS` describes the original import; moved files report as missing there.

## v4 handoff update

On October 10, 2026 the founder sent a v4 handoff of the journey engine. It was merged into `rehearsal/` on top of this repository's own changes (the `@civic/shell` extraction, the Laundry adapter and the Product Contract panel), using the handoff's verified patch against the original import as the common base. The handoff's `REPORT.md` lists every changed file.

What v4 adds:

- **Coverage.** A declared expectation contract (`docs/design/review-product/coverage.json`, 11 expectations) kept apart from 40 unconfirmed candidates found in source. Each gap gets one durable, proposal-only brief, prototype and React scaffold, and expectations can be edited in the canvas and written back to the repository with version checks. It has a Coverage pane next to Contract.
- **Cross-route actions.** 17 curated source bindings (`route-actions.json`) with parameters, guards and return context: 12 lead to a representative specimen and 5 destination states stay explicitly unmapped. Navigation order no longer draws arrows.
- **Canvas.** A compact flow overview replaces the whole-app hairline, an All screens setting shows all 176 thumbnails, and arrows are routed through gutters around cards (blue action, teal branch, dashed return).
- **Evidence and refresh.** Captures are rejected if the source changes mid-capture, historical thumbnails are served by their own revision, and watched changes are debounced.

What it means for CIVIC:

- The engine now separates declared, observed, inferred and proposed connections, and expected from discovered targets. The graph schema (roadmap step 1) should carry the same distinction instead of reinventing it.
- `coverage.json` is a working example of the Coverage gap record from roadmap step 3, and the candidate store is a working example of a proposal that never counts as adoption.
- The report's onboarding direction (a local manifest plus a web adapter, proven on a second app that does not import Laundry) is the same boundary as decision 0003 and roadmap step 4.
- Its model-light direction (deterministic discovery and replay by default, with any model help optional and budgeted) and its notes on Figma variables and DTCG tokens are inputs to the Fluent 2 Button demo, not commitments.

Merge decisions made here: the coverage bridge stays in the Laundry app, and the shell server receives it as an optional `coverage` factory, so `@civic/shell` still imports nothing from Laundry. The fixture-source hash leaves out `packages/shell/`, because the shell draws the workspace around fixtures and not the fixtures themselves. That keeps it at the handoff's `81d9c360…`, so all 176 bundled thumbnails stay valid.

Verified on the merge branch with Node 22 and pnpm 12.5.1:

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` and `pnpm run check` | passed (1591 static utilities compile) |
| `pnpm test` | web 798 + shell 6 Vitest, Convex 451, tokens 7, planner node suites and 13 web node checks, all passed |
| `pnpm --dir apps/web run test:review` | 7 web checks (adapter, coverage, inventory) and 5 shell server checks passed |
| Live review service inventory | 173 scenarios, 176 thumbnails served from the bundled fixtures, 17 route bindings, 51 coverage targets |
| Playwright `review-canvas.spec.ts` and `review-coverage.spec.ts` (isolated) | 4 and 1 passed |

The handoff's `MANIFEST.json` and `SHA256SUMS` describe the v4 bundle as sent, so files this repository moved into `@civic/shell` or changed still report as missing or different there.

## How to run

The review service is declared in `.amp/services.yaml` (`amp orb services ensure`) and opens through the authenticated Amp portal at the `CIVIC journey engine` portal. Locally: `pnpm --dir rehearsal/source/apps/web run review`, then sign in with the key in `rehearsal/source/.review-data/access-key` (generated at first run, never committed).
