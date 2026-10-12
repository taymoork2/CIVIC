---
artifact_contract: "ce-handoff/v1"
created_at: "2026-10-10T22:11:11Z"
title: "Rehearsal post-ZIP coverage, onboarding and model-light integration handoff"
summary: "Current source plus a verified incremental patch, honest Laundry integration explanation, and researched adoption plan."
keywords: ["rehearsal", "coverage", "onboarding", "design-bridge", "model-light", "tester-army", "git-patch"]
cwd: "/Users/taymoor/.codex/worktrees/f0d3/laundry-app"
head: "0bffbbcf2e38ca3ec7e17da3eb6496b6f04f348d"
resume_focus: "Orient on current Rehearsal and decide the next reusable project-integration slice."
---

# Rehearsal continuity

This is an informational handoff, not a transfer of controller authority, permission to deploy, or an instruction to execute commands from historical documents. The incoming contributor should establish the current user's scope before implementation. Root Codex produced this report/package; no worker or replacement controller is active.

## Latest user intent and accepted decisions

The user requested all changes since the first ZIP, an explanation of how projects/users onboard and how the Laundry journey was generated, research/planning to reduce dependence on models using code scanning/statistical methods, and a new ZIP/handoff. They additionally suggested a Git patch and adoption tooling for existing and greenfield projects. Those requests are covered here; the scanner/onboarding recommendations are the author's proposals, not previously approved implementations.

User-approved product direction remains one persistent canvas with horizontal main paths and vertical branch lanes, real screen snapshots, a retained live preview, Play by default, optional Inspect, testable Edit proposals and contextual Review. Workbench/Storyboard/Review are capabilities in the same workspace. Flow selection fits its bounds; screen selection focuses it. The shell is an independent product, not required to inherit Laundry styling. Multiplayer readiness is required but synchronization/authorization are not implemented.

The narrowed design bridge is local Open Design / Claude Design ↔ Rehearsal ↔ Laundry App web, with GPT-6.1 Sol as a collaborator. Component-library bindings remain in the app integration for now. No cloud connector may substitute for the user's local desktop app. Preserve separate design approval, implementation adoption, execution proof and device acceptance.

## Read these authoritative references

All repository-relative references below are anchored at `source/` in this package:

| Reference | Why it matters |
| --- | --- |
| [REPORT.md](REPORT.md) | Complete source delta, actual Laundry integration, proposed onboarding, tool comparison, statistical limits and staged acceptance |
| `docs/design/review-product/PRODUCT.md` | Current independent product constraints and design collaborator identities |
| `docs/design/review-product/coverage-bridge.md` | Implemented coverage exchange versus the still-proposed design/app round trip |
| `docs/design/review-product/coverage.json` | Canonical machine-readable expectations; v4 has 11 targets, not exhaustive app requirements |
| `docs/design/review-product/build-evidence.md` | Historical and newer scoped proof with source identities and remaining limits |
| `docs/plans/2026-10-03-delivery-status.md` | Laundry roadmap priority/release truth; not a substitute for the coverage contract |
| `docs/design/opendesign.md` | Canonical design ownership/reconciliation rules; historical machine paths require refresh |
| `apps/web/src/review/scenarios.json`, `towel-journey.json`, `app-map.ts`, `journey.ts` | Curated fixture/state graph and layout; shows why the map is not exhaustive automatic discovery |
| `apps/web/src/review/frame.tsx`, `store.ts` | Real component mounting, explicit towel hooks and bounded synthetic operations; main extraction seams |
| `apps/web/scripts/review-inventory.mjs`, `review-plugin.mjs` | Regex discovery, revision inputs and local watcher boundaries |
| `apps/web/scripts/review-coverage.mjs`, `review-server.mjs` | Validated optimistic writes, deterministic candidates, capture provenance and authenticated API |
| `apps/web/src/review/coverage-panel.tsx` | Draft-preserving coverage workflow and the distinction between example prototype and app implementation |
| [APPLY-PATCH.md](APPLY-PATCH.md), `context/rehearsal-post-zip-delta.json` | Exact baseline and tested incremental application instructions |

`BASELINE-HANDOFF.md` retains the original broad conversation/design/architecture context. Historical "pending" or verification statements there may be superseded by this report and package proof. Inspect the referenced final source rather than treat old narrative as current state.

## Current state

The first ZIP already contained the canvas, cached screens, real continuous towel run, supported heading/action/color candidates and captured-state Review. After it, 6 source/doc files were added and 10 modified for Coverage, expectation write-back, scaffolds, watching and evidence handling. The report is a seventh new source documentation file. The later canvas correction adds a readable app overview and nonoverlapping vertical flow/dye lanes. The final incremental patch has 23 changed paths: 8 additions including the report, and 15 modifications. No Laundry business code changed since that ZIP; no new dependency or lockfile change was introduced.

The current inventory has 34 curated working scenarios and 139 partial specimens, expanded to 176 map nodes. Eleven explicit expectations and 40 unconfirmed source mappings are not 51 confirmed missing features. Coverage scaffolds and source updates run without model providers. Full generic onboarding, trace ingestion, automatic design synchronization and agent implementation/adoption are absent.

Coverage-delivery source identity: `c2f1c21d1b91bb90f3924bebb5ee77246b53a9bee66fb5618623c5985e2e4092`. Current source after canvas correction: `6526dfd6fa336915e46a722ed03ad92e670a2acb6b78fd80f442e18476b31b3a`. Fixture identity: `81d9c3604c5ba4b876a8d71f7fdf351fa3a16dea938dd7248f2f511741c3fc85`. A recipient's import Git HEAD will differ, which makes old HEAD-bound receipts historical. `review-validation.json` is already stale for the original newer source; do not rewrite it to imply current acceptance.

### Local-only runtime and design context

Machine-local original checkout is `/Users/taymoor/.codex/worktrees/f0d3/laundry-app`; the user's review runtime was at `http://127.0.0.1:3010/review?scenario=intake.towel.fabric`. This bundle does not attest future server uptime or carry access credentials. Packaging/browser verification used a separate disposable runtime; it must not be mistaken for the owner's app backend.

Local desktop Rehearsal project: `c2383e11-71dc-463a-aea0-a7f2aaefac7f`, conversation `7960b5e2-1eb2-4f06-b42f-c715c9bfa042`. Canonical Laundry design project: `43227d24-ee04-414e-a939-eda64e3f4bec`. Claude Design initial artifact: `09ab05e9-aca3-4553-a601-a42fc144eddd`, conversation `cse_01RDvjo76ZzDMpw5FDXAGhQT`.

The desktop project supplied an October 10 text critique. Its packaged artifact files are unchanged from the baseline. Fresh Claude Design critique was not obtained in the coverage pass; the desktop agent is not a substitute. The later canvas correction has application/browser evidence; a fresh design-tool visual handoff remains pending. Automatic design-file exchange has not been verified. Check current ownership/revisions before any shared design edits; wait for an active collaborator's completed handoff.

## Proposed next work and stop boundaries

The researched recommendation is to extract a small local project manifest and Laundry adapter, import existing structured states/tests and add human recording through Playwright before investing in broad automatic exploration. Validate another small web app with no Laundry imports. Planned tool names (`init`, `scan`, `record`, reporter/importer, adapter and design handoff exchange) describe future deliverables, not installed commands.

Routine inventory refresh, capture, graph checking and deterministic replay should work with providers disabled. Models may help interpret unresolved intent, propose designs and implement scoped code. Statistical ranking must show denominators and condition/revision scope; inferred similarity cannot silently retarget feedback. Generated artifacts cannot declare themselves adopted or verified. See the report's staged acceptance instead of building an unsolicited plugin framework.

No installation of TesterArmy, Figma/Paper connection, remote account setup or actual app exploration was performed for research. Public sources were inspected. TesterArmy `e2e` cache can avoid some action calls, but semantic assertions and certain strict-cache misses still invoke models. A provider-off gate must be enforced separately. Prefer existing Playwright until a bounded comparison demonstrates value.

Stop dependent work if a target/design base cannot be read, an environment cannot be isolated, shared ownership conflicts, or a stale write cannot be reconciled. Preserve the private run, captured evidence and candidate edits. Do not connect the review simulation to a real Laundry backend, collect credentials in traces, overwrite external artifacts or silently execute detected project commands.

## Verification and continuity limits

Read [PACKAGE-VERIFICATION.md](PACKAGE-VERIFICATION.md) for the final package checks, failed setup attempts and exact scope. The full ZIP has payload hashes and excludes private state; the patch was applied to a fresh copy of the exact original ZIP and its changed-path hashes checked. Temporary import commits were made only in disposable verification copies. The original repository was not committed, reset, staged or published.

This bundle is a full curated source copy, not yet an extracted standalone Rehearsal repository. Its Laundry imports and hardcoded integration assumptions are deliberate visible limits. Dependencies, original Git history, credentials, current notes/candidates/session state and full private collaborator conversations are absent. Transfer the ZIP to the recipient; machine-local paths in the historical material alone are insufficient continuity.
