# Rehearsal synthesis: what the import gives CIVIƆ

- **Date:** 2026-10-10
- **Decision:** [0002 — Rehearsal is the CIVIƆ base](decisions/0002-rehearsal-is-civic-base.md)

On October 10, 2026 the founder's Rehearsal handoff — built in the Laundry App repository — was imported into [`rehearsal/`](../rehearsal/) and continued as CIVIƆ's implementation base. This document states plainly what the imported system already does, what was added in this repository, and what evidence exists for each claim.

## What Rehearsal already provides

- **One persistent journey canvas** covering the whole Laundry App: 173 registered screens across 176 captured fixtures, horizontal flows with branch lanes, pan/zoom, selection, and a live synthetic towel run.
- **Bidirectional traceability**: each screen node links to its scenario, component files, and checks, with source and design hashes recorded at capture time.
- **Contextual review**: frozen screen capture, allowlisted captured inputs, revision, retry identity, and resolution — all stored with the review, never inferred from screenshots.
- **Proposals**: versioned heading/action/color edits that can be played on the real screen in place.
- **A three-way Product Contract surface** (added here): per-screen Design / Engineering / QA evidence and whole-app coverage, with an alignment state that is never stronger than the evidence (`Unreviewed drift` for an open review, `Aligned` only when every dimension is proven, otherwise `Unknown / evidence stale`).
- **Loopback-only review server** with explicit access-key login and collaborator bypass for the Amp portal; public visitors, other hosts, and cross-origin writes are refused.

## What is deliberately not done

- The Laundry App domain code still sits inside `rehearsal/source`. Extracting the CIVIƆ shell is future work.
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

## How to run

The review service is declared in `.amp/services.yaml` (`amp orb services ensure`) and opens through the authenticated Amp portal at the `CIVIƆ Rehearsal` portal. Locally: `pnpm --dir rehearsal/source/apps/web run review`, then sign in with the key in `rehearsal/source/.review-data/access-key` (generated at first run, never committed).
