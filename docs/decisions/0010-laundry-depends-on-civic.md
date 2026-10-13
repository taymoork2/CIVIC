# 0010: Laundry depends on CIVIC, and CIVIC stops carrying a copy of Laundry

- **Status:** Accepted
- **Date:** 2026-10-13
- **Decider:** Founder
- **Builds on:** [0002](0002-v0-journey-engine-is-civic-base.md), [0004](0004-graph-first-journey-engine-as-viewer.md), [0007](0007-review-to-agent-loop.md) (D39)

## Context

The journey engine came into CIVIC as handoffs from a separate project, and each handoff was a snapshot of Laundry's monorepo with the engine inside it. `journey-engine/source` is still that monorepo: its workspace is named `washcloset`, `apps/web` and `convex` are Laundry's app as of Laundry commit `c325b5e` (`journey-engine/context/source-provenance.json`), and `@washcloset/planner`, `icons` and `tokens` are Laundry's packages. CIVIC's own engine packages, `@civic/canvas`, `@civic/shell` and `@civic/vite-connector`, sit beside them and are private workspace packages.

Since v7, CIVIC develops the engine itself; the v11 port moved concerns into those packages rather than taking a handoff. Laundry's owner keeps working in Laundry's own repository, so the copy in CIVIC falls behind (owner work such as `a0ca50e`, `c07a7f6` and `e841e19` isn't in it), and every change crosses between projects by hand. The coupling is concrete:

- Laundry's adapter (`apps/web/src/review/`, `apps/web/scripts/review-*.mjs`, `civic.project.json`) exists only in CIVIC's copy.
- `review-civic.mjs` finds CIVIC's CLI at `../..` from Laundry's root, so Laundry's review talks to CIVIC only when Laundry sits inside CIVIC's tree.
- `projects/laundry/capture.ts`, `civic.check.json`'s freshness rule and `bin/signoff` all read `journey-engine/source`. Signoff runs Laundry's whole check and test suite on every CIVIC change.
- Function backends (`createRuntime`) and the `CanvasExtension` seam have no example except Laundry, so CIVIC can't test them without it.

There were three options:

- **Keep the copy and sync it.** Every Laundry change still has to be carried across, and CIVIC keeps testing an app it doesn't own.
- **Publish the packages to npm.** This is outward-facing and hard to take back, and nothing outside this team consumes them yet.
- **Laundry depends on CIVIC's packages from git, and CIVIC drops the copy.** This is the one decided below.

## Decision

1. **The dependency runs one way: Laundry depends on CIVIC.** CIVIC never imports, vendors or tests Laundry's source. Laundry's repository owns its adapter, its `civic.project.json`, its canvas extension and its review data.
2. **CIVIC's engine packages move to a CIVIC workspace at the repository root** (`packages/canvas`, `packages/shell`, `packages/vite-connector`, with the canvas examples). The engine's handoff documents stay under `journey-engine/` as history.
3. **First, a local link; later, a git install.** `bin/civic-laundry attach <checkout>` ([integrations/laundry](../../integrations/laundry)) copies the adapter into any Laundry checkout or worktree and links the three packages from a local CIVIC checkout into its `node_modules`, changing none of Laundry's tracked files; `bin/civic-laundry review <checkout>` runs review there. Once Laundry commits the adapter, it installs the packages from git as dev dependencies, all three pinned to the same CIVIC commit, and keeps the local link for working on both at once. CIVIC doesn't publish to a registry until a team outside this one needs it.
4. **Laundry loads CIVIC only in review.** Review runs from its own Vite config, `apps/web/vite.review.config.ts`, which extends Laundry's `vite.config.ts`, so production builds and deploys never need CIVIC installed.
5. **The bridge to CIVIC's CLI is CIVIC's, not Laundry's.** What `review-civic.mjs` does moves into `@civic/vite-connector`, which finds the CLI through the installed package or `CIVIC_ROOT`, not a relative path. Review records stay in the reviewed repository's git common directory (D39), so Laundry's notes live in Laundry's repository and reach a team through `civic sync`.
6. **Laundry's evidence comes from Laundry's checkout.** `projects/laundry/capture.ts` takes the path to a Laundry checkout, runs Laundry's specs there, and stamps inputs with Laundry's commit. The freshness rule compares that commit with the checkout's when one is given, and otherwise reports the evidence's age without failing. Laundry's design references come in the same way, as `civic.design/0` files or render receipts read from Laundry's checkout rather than handed over.
7. **CIVIC proves its seams without Laundry.** Before the copy is removed, CIVIC adds a small function-backend example with a canvas extension and a guided run, beside Notebook, Tasks, Team board and Reading list. Those examples are CIVIC's contract tests; Laundry's suite is Laundry's.

## Consequences

- A CIVIC change can't break Laundry until Laundry moves its pin, and moving it is Laundry's choice. Laundry finds out what broke from its own tests.
- `bin/signoff` stops running Laundry's unit, Convex and browser suites. It runs CIVIC's packages, examples and graphs. Laundry's graph is checked from the inputs last captured, and is refreshed by a capture against Laundry's checkout.
- Nothing has to be handed between the projects. The remaining coordination is ordinary versioning: CIVIC records breaking changes to the packages, and Laundry moves its pin when it wants them.
- The cloud environment can reach only CIVIC's repository, so the Laundry side (adding the dependency, moving the adapter in, the review-only import) is done in Laundry's repository by its owner or a session given access to it. CIVIC supplies the adapter files and the steps.

## Order

0. *Built:* `bin/civic-laundry attach` and `review` run CIVIC's canvas on a Laundry checkout outside CIVIC's tree, reading that checkout's source and commit, with CIVIC's CLI found through `CIVIC_ROOT`.
1. *Built:* Move the three packages and their examples to the root workspace. `journey-engine/source` links them, so Laundry's copy still runs while the rest moves. Signoff stays green. The workspace file and lockfile sit in [`packages/`](../../packages) rather than at the repository root, so CIVIC's other projects (graph, importers, review, crawl, demos) keep their own installs; the journey engine's workspace lists `../../packages/*`, so both share one copy of each dependency.
2. *Built:* The CLI bridge is `@civic/vite-connector/civic` (`civicShared({ repo, product })`). It finds the CLI through `CIVIC_ROOT` or the CIVIC checkout the package came from, and takes the product ID its graph targets use. The function-backend example is `packages/canvas/examples/pantry`: named queries and mutations through `createRuntime`, called from `context.startRuntime`, with its own canvas extension named in its manifest (`adapter.extension`). A guided run is proven without Laundry too: the canvas's checks run the Pantry app under a connector whose extension (a check fixture) supplies `useGuidedSession`, and a connector no longer needs its own index to do so.
3. *Built:* Prove the git install: an empty app outside CIVIC installs the three packages from a CIVIC commit and opens in `civic-canvas`. [`packages/install.check.mjs`](../../packages/install.check.mjs) does it on every signoff, from the commit being signed off. Inside a git install, pnpm can't resolve `workspace:` ranges and refuses git subdependencies. So the canvas and the connector take `@civic/shell` (and the canvas `@civic/vite-connector`) as peers, and the app lists all three, each pinned to the same commit.
4. In Laundry's repository: add the dependency, bring in the adapter and manifest from CIVIC's copy, and import review behind its flag. Laundry's review tests run there.
5. Point `capture.ts` and the freshness rule at a Laundry checkout, and recapture.
6. Remove `journey-engine/source/apps`, `convex` and the `@washcloset` packages from CIVIC.
