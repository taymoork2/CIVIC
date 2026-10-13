# v0 import synthesis: what the journey engine gives CIVIC

- **Date:** 2026-10-10
- **Decision:** [0002 — The v0 journey engine is the CIVIC base](decisions/0002-v0-journey-engine-is-civic-base.md)

On October 10, 2026 the founder's v0 journey engine handoff — built in the Laundry App repository — was imported into [`journey-engine/`](../journey-engine/) and continued as CIVIC's implementation base. This document states plainly what the imported system already does, what was added in this repository, and what evidence exists for each claim.

## What the v0 engine already provides

- **One persistent journey canvas** covering the whole Laundry App: 173 registered screens across 176 captured fixtures, horizontal flows with branch lanes, pan/zoom, selection, and a live synthetic towel run.
- **Bidirectional traceability**: each screen node links to its scenario, component files, and checks, with source and design hashes recorded at capture time.
- **Contextual review**: frozen screen capture, allowlisted captured inputs, revision, retry identity, and resolution — all stored with the review, never inferred from screenshots.
- **Proposals**: versioned heading/action/color edits that can be played on the real screen in place.
- **A three-way Product Contract surface** (added here): per-screen Design / Engineering / QA evidence and whole-app coverage, with an alignment state that is never stronger than the evidence (`Unreviewed drift` for an open review, `Aligned` only when every dimension is proven, otherwise `Unknown / evidence stale`).
- **Loopback-only review server** with explicit access-key login and collaborator bypass for the Amp portal; public visitors, other hosts, and cross-origin writes are refused.

## What is deliberately not done

- The Laundry App domain code still sits inside `journey-engine/source`. Shell extraction has started with `@civic/shell` ([decision 0003](decisions/0003-civic-shell-package.md)); the canvas composition and panels are still in the Laundry app.
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

On October 10, 2026 the founder sent a v4 handoff of the journey engine. It was merged into `journey-engine/` on top of this repository's own changes (the `@civic/shell` extraction, the Laundry adapter and the Product Contract panel), using the handoff's verified patch against the original import as the common base. The handoff's `REPORT.md` lists every changed file.

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

## v6 handoff update

On October 11, 2026 the founder sent a v6 handoff of the journey engine. It was merged into `journey-engine/` the same way as v4: a three-way merge whose base is the v4 handoff's source exactly as sent (checked against its `SHA256SUMS`), with this repository's changes on one side and v6 on the other. v6's own `context/since-v5.patch` was checked by rebuilding v5 from it. The v4 handoff documents and context moved to `journey-engine/history/v4/`; `journey-engine/` now carries v6's (`HANDOFF.md`, `CHANGES-SINCE-V5.md`, `EXTRACTION.md`, `history/v5/`). Host paths, the private tailnet address and session IDs are redacted in the committed copies of the handoff notes.

What v5 and v6 add, over v4:

- **A project contract and picker.** `rehearsal.project.json` names an app's sources, scenario registry, coverage file, personas, roles, conditions and preview adapter. The picker connects another app read-only, keeps a separate review store per project, and restarts the engine on a switch. Two non-Laundry examples prove it: an authored Notebook app and a manifest-free discovery app.
- **Static discovery for existing apps.** A bounded source scan (no imports, no model) proposes screens, props, links and forms. A person confirms them before anything is generated, and the generated files are owned by the engine, never written into the app.
- **Per-screen snapshot fingerprints.** Each screen's picture is keyed by its own import closure and shared inputs, so unrelated changes keep cached pictures, changed screens re-render, and older pictures show as stale rather than current.
- **Review targets beyond a screen.** Notes can target the app, a flow, a screen, a region or a declared path, with the journey graph shared by the canvas and the server's validation.
- **An agent-session bridge.** A saved review, with its frozen picture and source receipts, can be sent to one configured Codex or Claude session. Replies come back to the review, and a finished agent turn never resolves it.
- **Laundry kept current**: 204 registered scenarios (from 173), 26 cross-route bindings, family-size simulations, native reminder states, and private phone access through one HTTPS Tailscale origin.

Merge decisions made here:

- `@civic/shell` still imports nothing from Laundry. The Laundry adapter now also supplies the journey graph (`journeyGraph`, `pathId`) and v6's fixture renderer; the agent bridge reaches the shell as an optional `agents` option, and the coverage bridge as the existing `coverage` factory. The one test that needs the real Laundry graph moved to `apps/web/scripts/review-adapter.check.mjs`.
- Local browsers need no key (v6's keyless loopback session). The local key file stays, because CIVIC's re-capture and repro sign in with it and Amp portal visitors who aren't collaborators use it. The portal's collaborator access and v6's Tailscale origin both work.
- The shell's own source is part of the attested revision but not of any screen's fingerprint, now hashed wherever the workspace link points.
- v6's discovery and picker tests hard-coded macOS's `/private/tmp`; they use the system temp directory instead.
- The 176 bundled thumbnails are v4's. v6 looks pictures up by per-screen fingerprint, so they show as stale placeholders until current snapshots render.

How v6 relates to CIVIC's own work:

- **Roadmap step 4.** The manifest, the picker and the two non-Laundry examples are most of step 4's onboarding direction, and they meet its acceptance that a second app connects without Laundry code. What's missing is the graph: the engine's journey graph (`journey-graph.mjs`, the scenario registry's edges with `when` and `returnTo`) should be exported into the CIVIC graph rather than read by the canvas directly. v6's discovery is a static source scan; D34's crawl-first discovery is still to build, and the two can share the same confirm-before-adopt step.
- **The review loop (decision 0007).** v6's agent bridge pushes one review to one named session; CIVIC's loop records an annotation and lets agents claim a work request. Both keep agents from resolving anything (D38). Kept separate for now: a note still becomes a shared annotation, and sending it to a session is a second, direct path. The bridge fits best later as a delivery channel for a CIVIC work request, so receipts land on the request rather than only in the engine's local store.
- **The `civic check` gate.** v6 adds no gate. Its unconfirmed discovery candidates, unmapped route destinations and coverage gaps are the kind of findings the gate could report once they are in the graph.
- **Step 6.** Per-screen fingerprints are the staleness rule step 6 asks for (evidence visibly stale when its inputs change), but fixture capture is not yet in `bin/signoff`.
- **Step 5.** Project switching is host-wide and the Tailscale origin admits anyone on the tailnet; neither is the identity and permission model.

Verified on the merge branch with Node 22 and pnpm 12.5.1: `pnpm install --frozen-lockfile`, `pnpm run check` and `pnpm --dir apps/web run test:review` (every engine check, the shell's 10 server tests included) pass. The full `pnpm test` result is in the pull request.

## v7 handoff update

On October 12, 2026 the founder sent a v7 handoff of the journey engine, with a note on platform adapters. It was merged into `journey-engine/` the same way as v6: a three-way merge whose base is the v6 handoff's source exactly as sent (checked against its `SHA256SUMS`), with this repository's changes on one side and v7 on the other. v7's own `context/since-v6.patch` was checked by applying it to v6's source, which reproduced v7's source exactly. The v6 handoff documents, context and evidence moved to `journey-engine/history/v6/` and `journey-engine/evidence/historical/`; `journey-engine/` now carries v7's (`HANDOFF.md`, `CHANGES-SINCE-V6.md`, `EXTRACTING-REHEARSAL.md`, `PACKAGE-VERIFICATION.md`). Host paths and the owner's session ID are redacted in the committed `HANDOFF.md`.

What v7 adds, over v6:

- **A shared runtime bridge.** One framework-independent recorder (`runtime-bridge.ts`, `runtime-dom.ts`) records gestures, routes and effect receipts bound to the project, source revision, seed and clock, and refuses to replay on drift or ambiguity. Any adapter's live run can be recorded; the Inspect panel gets run controls.
- **Real effects in isolation.** Each run gets its own worker and in-memory database running Laundry's actual Convex schema, queries, mutations and authorization (`review-runtime.mjs`), with external requests and server actions blocked. Nothing reaches a deployed backend.
- **The actual Laundry app in review.** The real route tree mounts with a synthetic identity, frozen clock and review-only IDs. Home Wear and Drying run their shipped handlers.
- **Towel is the first curated migration.** The towel journey mounts the real `AddClothesFlow` instead of the simulated mutation switch, with both origin branches, retained inputs, proposals, save, failed-save recovery and fresh replay. The other curated fixtures still use the older bounded adapters.
- **Saved recordings.** A run can be saved (`/api/review/runs`), attached to a review, downloaded and replayed; agent briefs carry the links. Sensitive or deeply nested payloads are refused.
- **An adapter direction** (`docs/design/review-product/platform-adapters.md`, researched, not built): a build connector, a runtime and data adapter, and an interaction driver.

Merge decisions made here:

- `@civic/shell` still imports nothing from Laundry. v7 put recording storage, the runtime endpoint and its new fixture renderer in the review server. The recording endpoints and their validation (`review-recording.mjs`, which only knows a project's presets) moved into the shell, exported as `@civic/shell/server/recording`, with its check in the shell's `test:server`. The runtime arrives as an optional `runtime` option, like `agents`. v7's fixture renderer, which now waits for isolated runs and closes them, lives in the Laundry adapter (`apps/web/scripts/review-adapter.mjs`), and the shell fills each declared screen with its registered scenario's fields.
- Replay from start (PR #28) stays for project adapters, beside v7's run controls and saved-run replay. The Contract panel and the shell's shared styles are unchanged.
- The access-key file stays for CIVIC's tools, as in v6.

How v7 relates to CIVIC's own work:

- **The adapter split and the roadmap.** v7's three responsibilities map onto CIVIC's pieces. Its build connector is the Vite plugin and static discovery, which CIVIC's crawl (D34) complements: the crawl finds states from outside, the connector finds code from inside, and both should stay discovered until a person confirms. Its interaction driver is what CIVIC's crawl drivers already are: the web driver on Playwright and the Appium driver from PR #25, which reads native states as roles and accessible names. v7's recommendation for native (shared semantic IDs and the same recording envelope, drivers written in the platform's own runtime, every receipt bound to platform, source, driver and fixture version) is the shape a native capture should take when a device runner exists. Its runtime and data adapter (seed, identity, clock, isolated effects) has no CIVIC counterpart yet; native apps will need one through their dependency boundary. No new adapter is built here.
- **The graph.** A recording's receipts are run evidence the graph could hold: a path walked with a source revision, a seed and per-step effect receipts. They aren't exported yet; Laundry's graph (`projects/laundry`) still reads the review index and review specs, and the canvas reads the graph through `civic screen`.
- **Step 6.** v7 built a recorder, where step 6 said to record with Playwright's own tooling. It is deterministic and makes no model calls, so it meets step 6's acceptance; whether CIVIC adopts its tape format as the recording record is open.
- **Step 5.** Saved runs live in the engine's local store, not in the shared review records `civic sync` publishes.

Verified on the merge branch with Node 22 and pnpm 12.5.1: `pnpm install --frozen-lockfile`, `pnpm run check`, `pnpm --dir apps/web run test:review` and the shell's server tests pass. The full `pnpm test` and `bin/signoff` results are in the pull request.

## v11 port: accounts, offline and viewport

On October 12, 2026 the founder sent the v11 handoff (`rehearsal-handoff-2026-10-12-v11.zip`, SHA-256 `7060b59e372fb73648dcaec963271ec641af1f7101e95204b458cda6f7f991c6`) and a verification supplement (`rehearsal-verification-2026-10-12-v11-supplement.zip`, `d52610decb03e3393b18459d8aa9ad6e8d452f56accf6e62e49001b00965a154`), and authorized porting three of its concerns into CIVIC's packages. v11 is not merged as a handoff: its `since-v10.patch` applies only to v10, and CIVIC's tree descends from v7. Each concern was ported by diffing v7 as sent against v11. The archives stay as sent; `journey-engine/` still carries v7's handoff documents.

What the port adds, in `@civic/canvas` (with small changes in `@civic/shell` and `@civic/vite-connector`):

- **Same-run account switching.** Every persona with a synthetic identity is an account of the run, each with its own fresh credential and session. Switching keeps the run's data, clock and captured inputs. A page acting as an account that is no longer active is refused. A write made after a switch names its account on the tape; a run that never switches records none, so older recordings still match. Credentials stay off tapes and journals.
- **Actual offline with manual recovery.** Disconnecting aborts the page's in-flight requests and makes `navigator.onLine` false; the browser's own `offline` event disconnects the run too. A write made or cut off while offline is kept as a saved step for its account only, in the reviewer's storage under the run. Nothing is resent by itself: a person resends or discards each step, and an accepted write clears a matching saved step, so the app's own retry can't send it twice.
- **Durable runs.** With a data directory, each run keeps a journal of its effects (mode 0600). Reopening re-runs the completed effects and checks each result. A run whose seed, source or effects differ is refused, never silently guessed. Leases keep a stale page's close from stopping a reopened run. Fixture and render snapshots stay a separate cache from this provenance.
- **Viewport changes on the tape.** Device presets, rotation, fold and unfold, theme and text size change the live frame in place, and each is a recorded step that replay restores. Presets are CSS viewports, not physical-device evidence. Recordings from before viewports had a height still replay.
- **Run controls.** The Inspect panel has the account select, Disconnect and Reconnect, Reopen, saved steps and the viewport controls. Each run command (`identity`, `connection`, `time`, `applyPending`, `discardPending`, `viewport`) is a step on the same tape.

Laundry keeps its specifics in its adapter: the 1,000-piece family seed, the owner, member and other accounts, Convex, and its private scope. The family laundry day page (`/review?familyDay=1`) runs on the shared runtime. The Laundry app source was synced to v11 where the family day needs it. The [Team board example](../packages/canvas/examples/team-board) proves the shared behaviour without Laundry.

Not covered by this port: native or physical-phone acceptance, Safari or installed PWA behaviour, and the app owner's own mobile and PWA acceptance, which is a separate stage. The supplement's Claude Design verification is static web reference evidence. Newer Laundry work reported afterwards (root refinements on its own branch, its owner's Mobile WebKit and PWA checks) is separate evidence, not part of v11.

## How to run

The review service is declared in `.amp/services.yaml` (`amp orb services ensure`) and opens through the authenticated Amp portal at the `CIVIC journey engine` portal. Locally: `pnpm --dir journey-engine/source/apps/web run review` and open the page; a loopback browser needs no key. CIVIC's tools use the key in `journey-engine/source/.review-data/access-key` (generated at first run, never committed).
