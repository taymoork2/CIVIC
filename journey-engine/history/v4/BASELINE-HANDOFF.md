# Rehearsal product and engineering handoff

Prepared October 10, 2026. Outgoing integrator: Local Codex. This delivery packages the current implementation and accepted direction; the recipient becomes the implementation owner when assigned by the product owner. It does not transfer authority over other runtimes, design files or production. The original checkout remains intact. No recipient has been selected or contacted.

## What we are building

A place to understand, play, propose changes to and review a real application across its journeys and platform variants. Screens have stable identities and visible relationships. An owner can point at a problem in a real state, test a candidate, and inspect evidence of a verified fix without repeating intake.

Rehearsal is a tentative name. Its own interface can depart completely from Laundered Closet's design system. Laundry App is useful now as the first demanding integration, not the definition of the eventual product. The niche is executable journeys and evidence-backed proposals; a generic drawing editor is not required.

The current prototype has a single persistent canvas. Storyboard describes understanding the journey; Workbench describes interacting with a live screen; Review describes managing captured observations. These capabilities share selection, camera and contextual panels. There are no longer separate Workbench/Storyboard destinations. Review belongs in the optional right pane alongside Inspect and proposal editing.

## Owner decisions to preserve

The conversation evolved through several designs. This list carries the accepted direction; older artifacts preserve ideas and context rather than overriding it.

1. Use the owner's **local Open Design desktop app**, based on its GitHub project and usable locally without an account. Do not substitute OpenDesign Cloud. Claude Design is a separate collaborator.
2. Treat this as its own potentially spun-off product. The shell need not reuse Laundry components or styling. Real application components belong inside the reviewed preview.
3. Collaborate on bounded proposals with both local Open Design and Claude Design. Use design taste/frontend, Apple, Emil, Impeccable and Product Design guidance where useful. The owner preferred the first two early concepts; screenshots preserve those explorations. No final brand approval exists.
4. Show real screen images throughout the entire application journey by default. Cache snapshots instead of mounting every screen. Clicking a screen exposes a focused live interaction and contextual tools.
5. **Play is default**, Inspect optional. Edit must change a real testable proposal, not a decorative overlay. Testing a proposal is not adopting it into the application.
6. Cover both towel ownership branches and capture entered inputs during real transitions. Preserve Back/loops and failed saves honestly.
7. The canvas supports pan and zoom with bounded outside space. Flows and the main path run horizontally like a timeline. Alternate branches stack below and reconnect with labelled arrows. Keep arrows between flows, distinguishing navigation order from verified runtime transitions.
8. Order the app from entry/sign-in/setup into home and primary navigation. The sidebar can follow page/tab/navigation ordering; it must show individual screens, expand on flow entry and indicate the actively viewed screen when possible. Flow selection fits the whole flow; screen selection fits that screen. Camera focus updates the outline.
9. Take substantial canvas/control cues from tldraw and Figma, with Paper as another reference. Preserve approachable controls and readable screen hierarchy rather than importing a complex design tool's entire feature set.
10. **One persistent canvas with selection, zoom and contextual panels is approved.** Claude Design's three structures are retained as capabilities, not competing screens.
11. Multiplayer readiness matters. Shared proposals, comments, decisions and attribution must be designed alongside private preview/draft/camera state. Other people must not discard or overwrite a participant's app draft by navigating.
12. Keep design proposals at journey/screen/component/primitive/token scope, and make cross-platform drift, accepted adaptations and limitations explicit. A library restriction is a reason to seek a decision, not an implicit approval.

## Current implementation and exact limits

The registry supplies 34 working scenarios and 139 partial specimens, yielding 176 map nodes after separating towel care screens. These are an initial inventory, not exhaustive app coverage. All flow boxes are horizontal in entry/tab order. Declared towel edges are solid; navigation-order links between flows are dashed; confirmed run edges are distinct. Dye occupies the lower branch lane.

Inactive nodes use real synthetic fixture thumbnails. One mounted towel iframe follows confirmed runtime transitions and moves to the current screen's canvas position. Browsing a different node, selecting a review or opening a panel retains that session. Controls are shielded when its screen is not focused at a usable scale. Start here is an explicit fixture jump with draft protection. Unmapped runtime states remain visibly unmapped instead of being matched to a nearby node.

The bounded camera supports background drag, wheel/trackpad pan, pointer-centered zoom and Space/Hand over screen areas. Its outside margin is 240 viewport pixels. A flow fit expands its outline; a screen fit focuses it; the viewed item follows the camera center. Keyboard shortcuts avoid search and live-app typing. Narrow layouts have closable outline and inspector overlays.

The towel adapter runs real intake screens: Type → Whose → Details → Fabric → Color → Origin; newly owned → Dye, pre-owned → skip Dye; then Wash → Bleach → Dry → Stain → Review → Saved. Confirmed transitions record ordered visits and allowlisted raw fields. Back produces repeat visits. Failed Save does not produce a Saved edge. Both branches and save retry were manually exercised. Other fixtures do not have this complete recording adapter.

Edit proposal currently supports heading, primary-action copy and accessible button color through real React props. It has durable optimistic versions and baseline/candidate switching without destroying the draft. Cross-flow Play does not save an unpublished towel proposal. Arbitrary component layout, token system, behavior and native variant editing remain open. A proposed change has not been adopted into the Laundry source merely because it was played.

The right Review pane supports screen/flow/all and open/resolved filters, whole-screen capture, durable unsent composition, local save/retry and evidence-backed resolution. It freezes HTML, revision, raw inputs and exact screen identity **before** writing. Retry preserves capture and request identity. Selecting a review moves the camera and retains the current run; it does not replay that historical runtime. Old scenario-only notes remain readable without invented exact care-screen identity. The server recomputes source staleness at retrieval while preserving the original receipt.

The earlier element-pin feedback workspace remains at `?legacy=1`. It is compatibility/context, not a second primary product. The consolidated pane does not yet integrate every legacy pin/reproduction feature.

Not implemented: exact historical state replay, automatic before/after comparisons, arbitrary editing or source adoption, a generic app adapter contract, Figma import/synchronization, native comment synchronization, native runners, shared remote storage, collaborator identities/permissions, presence, synchronized review driving or production hosting. A shared local access key is not multiplayer authorization.

## Architecture and code map

All paths below are relative to `source/`.

| Area | Files / responsibility |
|---|---|
| Canvas integration | `apps/web/src/review/app-canvas.tsx`: selection, panels, live placements and session routing |
| Graph | `apps/web/src/review/app-map.ts`, `journey.ts`, `towel-journey.json`, `scenarios.json`: stable IDs, graph, branches, inventory and ordering |
| Camera/controls | `use-canvas-camera.ts`, `canvas-controls.tsx`, `canvas-chrome.css`, `app-canvas.css`, `canvas.css` |
| Runtime and candidates | `canvas.tsx`: towel session, trace, proposal state and API integration |
| Feedback | `review-panel.tsx`, `capture.ts`: frozen capture, compose/retry, queue and resolution |
| Real synthetic preview | `frame.tsx`, `store.ts`: isolated providers, fixtures and synthetic writes |
| Compatibility entry | `workspace.tsx`, `apps/web/review.html`, `review-frame.html` |
| Laundry adapter | `apps/web/src/closet/add-clothes.tsx`: presentation overrides and runtime callbacks; other app/dev modules supply real fixtures |
| Local service | `apps/web/scripts/review-plugin.mjs`, `review-server.mjs`, `review-inventory.mjs` |
| Checks | `apps/web/src/review/*.test.*`, intake tests, `scripts/review-*.check.mjs`, `e2e/review-canvas.spec.ts`, legacy `e2e/review-workspace.spec.ts` |
| Dependencies | Root workspace/lockfile; `packages/icons`, `planner`, `tokens`; Convex generated references and types |

Review is a Vite **development server** plugin, active only with `WASHCLOSET_REVIEW=1`; normal app build does not deploy it. Its entries never mount real application providers. Loopback-only binding and route restrictions prevent calling ordinary app/research APIs. Synthetic Convex URLs intentionally point at port 1. Don't run real app/Convex provisioning scripts to start this handoff.

`.review-data/` holds a new local access key, feedback JSON, proposals JSON, captures and fixture thumbnails; it is ignored by Git. The browser holds private session/draft state. Local serialization and optimistic proposal versions do not provide distributed multiplayer consistency. `/api/review/index` exposes inventory/revision metadata; `/proposals`, `/feedback`, `/capture`, `/captures/:id.png`, `/screenshots/:id.png`, `/fixture.png`, `/snapshots` and `/evidence` form the authenticated local review surface. Resolution uses `/feedback/:id/resolve`. Read validators before extending payloads.

The inventory combines source hashes, Git HEAD, bounded design hashes and historical validation receipts. Its source hash does not cover every shared package/backend input, so do not claim an exhaustive reproducible build attestation. The imported Git HEAD will differ from the original and old receipts must stay historical/stale. Fixture caching uses a separate fixture-source hash. Existing cached images can be reused only under their exact keys; never relabel them current after an app change.

Review HMR is disabled to protect an active draft. Frontend edits require an explicit reload after closing/discarding or otherwise preserving the synthetic draft. Changes to service scripts require a server restart. Editing while a live test is in progress should not masquerade as a fresh source receipt.

## Design references and collaboration

Read `source/docs/design/review-product/PRODUCT.md` as the current product brief, `build-evidence.md` as chronological delivery evidence and `workspace-observations.md` as findings. `proposals.md`, `screen-canvas.md` and `journeys-and-collaboration.md` retain wider design decisions. The two connected-review-workspace proposals are earlier context. Historical scope/counts/three-mode navigation do not override this handoff and the current brief.

`design/local-open-design/` contains the actual local desktop board/prototype and four completed briefs/handoffs, exported as files without app internals. Project `c2383e11-71dc-463a-aea0-a7f2aaefac7f`, conversation `7960b5e2-1eb2-4f06-b42f-c715c9bfa042`. Open `index.html` or `app.html` locally to inspect the historical interactive proposal; they use illustrative application state, not the runnable React adapter. Those files precede later owner revisions.

Claude Design's initial artifact is `09ab05e9-aca3-4553-a601-a42fc144eddd` in conversation `cse_01RDvjo76ZzDMpw5FDXAGhQT`. The supplied comparison board is in `design/proposal-images/claude-three-structures.png`; the rendered workbench screenshot is in `evidence/`. The package contains the recorded handoff/critique summaries and supplied artifacts, not full private conversation exports or a source export of every Claude board. Both collaborators supplied bounded text critiques of the later controls/consolidation. These were design handoffs, not rendered-code acceptance.

`design/laundry-reference/` belongs to Laundry App's canonical project `43227d24-ee04-414e-a939-eda64e3f4bec`. Its design contract governs the reviewed app, not Rehearsal chrome. Bundled references include original recorded hashes/receipt; generated-reference freshness remains whatever those receipts say. Larger canonical screen bundles and archives are not shipped. Existing historical documents may link to omitted external paths; the portable handoff, source and selected artifacts are the usable starting points.

Reference cues recorded in the controls pass: [tldraw canvas UI](https://tldraw.dev/sdk-features/ui-components), [Figma UI3](https://www.figma.com/blog/behind-our-redesign-ui3/), [Paper interaction guidance](https://paper.design/docs/support), and the owner's [Figma design basics](https://www.figma.com/resource-library/design-basics/). These are references, not integrations or licensing clearance. Existing package/library license obligations remain applicable; this export does not grant redistribution rights for third-party material.

For the next collaborator brief: state the product decision, stable target IDs/scope, current screenshot, current source/design revision, constraints and expected handoff. Assign one owner per file/stage, require completed proposals before integration, preserve alternative proposals and record acceptance separately. Do not silently replace a local desktop collaborator with a cloud connector.

`design/skills/` preserves the owner's explicitly named design-taste-frontend, frontend-design, imagegen-frontend-mobile, apple-design, emil-design-eng and gpt-taste guidance, plus the installed Impeccable 4.3.1 and Product Design 0.1.56 skill instructions. These are dated reference snapshots, not plugin installations or proof those tools are available to the recipient. Relative references within copied folders are retained. Skills that require a particular runtime, connector or output directory must be adapted to the incoming environment; no account credentials or tool sessions are included. Generated assets are optional when they help the product, not a requirement to regenerate the interface.

## Proposal and alignment model to implement

Keep stable project, journey, screen, component, primitive/token and platform-variant identities. A proposal records its target, baseline revision, candidate revision, scope, rationale, author and expected behavior. A decision records the exact approved candidate and its variant scope. Adoption links that decision to an implementation revision. Verification carries independent browser/native/device evidence. Do not flatten these into a single complete flag.

Use explicit alignment states: Aligned; Approved adaptation; Accepted limitation; Unreviewed drift; Awaiting adoption; Unknown/stale. Android drifting from other platforms remains Unreviewed drift until the product owner accepts a specific adaptation or limitation. Record the architectural/library constraint, user impact, alternative and revisit condition. Native differences should preserve the shared intent even when presentation differs.

## Multiplayer boundary

Shared: proposals, observations, decisions, status, immutable captures and verification evidence. Private by default: camera, selected screen, running app session, entered draft, persona/fixture experiments and unsent composition. Shared attribution needs real identities and scoped read/write/approve/resolve permissions. Conflicts need expected versions and visible recovery; last-write-wins must not silently overwrite candidate edits or evidence.

Presence and follow mode are optional. Shared driving needs an explicit driver, opt-in join/leave and disconnect/rejoin behavior. No collaborator's navigation may discard a private draft. Local JSON + one key is the current development storage, not an approved multiplayer architecture. Select the backend/transport only after these ownership requirements are settled.

## Suggested incoming sequence

1. Import this snapshot into a new local repo, install, run synthetic review and inspect the current screenshots. Repeat the two towel branches, proposal activation, cross-flow draft retention and frozen-review retry before changing architecture.
2. Extract Rehearsal shell/server/registry into its own package or repository, leaving a narrow Laundry adapter that owns fixtures, targets, runtime transitions and supported presentation edits. Keep the real towel screen and safety/domain logic in the adapter. First prove a minimal second integration before building a broad plugin framework.
3. Make the standalone build/start path portable: remove hardcoded personal defaults, replace Laundry-named access copy/env namespaces deliberately, define package-owned revision evidence, expose current limits clearly and establish app-specific design reference resolution. This ZIP's environment override provides a runnable bridge, not that finished extraction.
4. Complete the evidence loop: exact replay contract, retained target history/re-anchoring, stable proposal/adoption records and explicit before/after evidence. Keep failures and stale captures visible.
5. Implement shared identities, permissioned storage and conflict handling while retaining private runs. Then add presence or synchronized review only if the owner wants it.
6. Expand declared/observed app journeys beyond towel; audit navigation edges rather than presenting specimen discovery as complete path coverage. Add supported component/token/platform editing only with clear scope and application adoption paths.

## Verification and evidence

Original snapshot base HEAD: `0bffbbcf2e38ca3ec7e17da3eb6496b6f04f348d`. The implementation was uncommitted, so HEAD alone is insufficient. Final reported review source hash: `3cd327094bf7a7ce06da5d8c86e9f3dd517e5fe795c7a1614f207f239fdda9ea`; fixture hash: `eb66a3b7e3d1d65e1759a5060d659c2e513225064810eb7c372e9320517ac813`. The manifest preserves exact packaged file hashes and provenance.

Original delivery checks: web types/styles passed (1,591 utilities); seven focused Vitest files passed 59/59; authenticated API/proposal/capture and inventory checks passed 4/4 under the available Node 24 runtime with loopback listeners permitted; whitespace checks passed. Desktop 1440×1000 and phone 390×844 were inspected manually, with earlier tablet evidence retained. The explicit new Playwright scenario was listed, not executed. Package checks are reported separately in `PACKAGE-VERIFICATION.md`.

Current captures: `evidence/single-canvas-desktop.jpg`, `single-canvas-flow-desktop.jpg`, `single-canvas-phone.jpg`, `single-canvas-review-phone.jpg`. Other images show earlier branch, camera, save-retry and proposal tests. Generated concept images are in the design folder and must not be cited as implementation evidence. The screenshot evidence index identifies the final versus historical passes.

Original acceptance used a reversible Fabric candidate (heading “Which fibers make up this towel?”, action “Choose towel color”), preserved raw `cotton 79%`, and exercised confirmed Fabric → Color. Candidate v6 belonged to the preceding source revision and became visibly stale after the final feedback-staleness fix. Two synthetic reviews were saved/resolved and later reported stale without rewriting their captured receipts. Their runtime rows, browser draft and key are deliberately excluded; the imported workspace starts clean.

Physical devices/native gestures, production deployment, full-suite/full-journey acceptance, exact historical replay and multiplayer remain unchecked. The delivery does not promise independent production startup, app-store/native support or fresh collaborator approval of rendered code. No runtime or design project was modified to assemble this handoff.
