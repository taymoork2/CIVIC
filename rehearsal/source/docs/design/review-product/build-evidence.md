# Rehearsal build evidence

Local, uncommitted delivery in `/Users/taymoor/.codex/worktrees/f0d3/laundry-app`.
The isolated review server runs at `http://127.0.0.1:3010/review`; all application
providers are synthetic. Existing owner application/backend runtimes were not changed.

Previous timeline-pass source revision:
`07389aae4a0206146a3b44ec46c1dddd3146a98b6801179ab821945ffc29f918`.
Previous controls-pass source revision:
`e8921a3454d046c8ed2a9c1eea6de7fde8dd977f40caa044c672721da1810b42`.
Fixture source:
`eb66a3b7e3d1d65e1759a5060d659c2e513225064810eb7c372e9320517ac813`.
Consolidation preview source revision:
`3b5ff1c41621ed3997f013c25613f2ca4950eea4bad9ce92c8bcf1d8db246c53`.
Final source revision:
`3cd327094bf7a7ce06da5d8c86e9f3dd517e5fe795c7a1614f207f239fdda9ea`.
The single-canvas consolidation below supersedes the separate structure navigation
in the historical passes. Its private Color run remains resumable.

## October 10 whole-app framing and branch correction

Owner evidence showed an app-wide strip compressed to 0.7% zoom. Source after
the correction: `6526dfd6fa336915e46a722ed03ad92e670a2acb6b78fd80f442e18476b31b3a`.
The fixture revision remains `81d9c3604c5ba4b876a8d71f7fdf351fa3a16dea938dd7248f2f511741c3fc85`.

The same canvas now frames readable flow summaries for App, with entry/navigation
areas horizontal and related flows in nonoverlapping vertical lanes. Choosing a
flow fits its full horizontal screen timeline; choosing a screen focuses it.
The dye screen is wholly below the main row, with split/rejoin arrows preserved.
Dashed navigation/grouping links remain separate from solid declared actions.
The detailed scene is hidden in overview without unmounting the live run.
On narrow widths, overview uses a 35% floor and horizontal panning.

Type/style checks and 66 focused tests pass. Two canvas Chromium cases pass:
live inputs survive overview, navigation, review and proposal testing; actual
cached images render, flow lanes/branch geometry are separate, and a 488px-wide
canvas pans without collapsing to a hairline. The coverage Chromium case also
passes after this change. Tests used a disposable source copy and local store
on port 3143, not the owner's private draft/store. Browser captures are included
in the new handoff's `evidence/` directory. An initial zero-height overview
container was fixed; a narrow test correctly dismisses the existing outline
overlay before operating the canvas. No application allowlist was widened.

Fresh local Open Design / Claude Design visual reconciliation and physical
device acceptance remain pending. Navigation grouping does not establish
unregistered application actions or exhaustive branching coverage.

## Initial delivery (historical)

- **Storyboard:** 176 actual screen nodes from 34 working scenarios and 139 partial
  specimens, with towel care expanded into separate states. Cached fixture images
  load without mounting every screen. All flows run left to right in entry/tab
  order. The towel and pack dye branches sit below the primary path. Solid arrows
  represent declared actions; dashed arrows between flow boxes represent navigation
  order, not proven runtime transitions. Unmapped paths remain unverified.
- A bounded camera supports background drag, wheel/trackpad pan, pointer-centered
  zoom, Space/Pan over screens and explicit controls. Its outside margin is 240
  viewport pixels. Flow selection fits its entire bounds and expands the sidebar;
  screen selection fits that screen. At screen scale the sidebar follows the screen
  under the camera center. The initial view starts at sign-in/setup; App overview
  fits the whole timeline.
- **Workbench:** one mounted real towel intake runtime follows confirmed states,
  with Play default and optional Inspect. Switching back to Storyboard retains both
  its camera and the running draft. Browsing another state does not replace that
  draft. Start here is a confirmed fixture jump, not replay.
- **Edit:** heading, primary-action copy and accessible button color become real
  React props in a reversible proposal. Save produces a durable optimistic version;
  Play tests it without adopting it into the application. Baseline/candidate changes
  retain the current intake inputs. An earlier source revision stays visibly stale.
- **Review:** explicit entry to the existing authenticated feedback/evidence view,
  preserving scenario identity and opening separately to retain the private run.
  Its queue, exact captured-state restoration and automatic before/after comparison
  are not integrated yet.

## Browser evidence

Evidence directory:
`/Users/taymoor/.codex/visualizations/2026/10/10/01a12354-2b94-7df3-aff2-45fe8e90641e/review-workspace`.

| Check | Evidence |
| --- | --- |
| Whole flow, all 13 sidebar entries | `timeline-flow-fit-desktop.jpg` |
| Ownership split and lower Dye lane | `timeline-ownership-branches-desktop.jpg` |
| Neighboring flows and connecting arrows | `timeline-neighbor-flows-desktop.jpg` |
| Fabric selection and centered snapshot | `timeline-screen-focus-desktop.jpg` |
| Pan Fabric → Color; viewed entry follows | `timeline-camera-follows-screen.jpg` |
| Play-default live Color, retained real controls | `timeline-workbench-color-desktop.jpg` |
| Phone focus and reachable Play action | `timeline-screen-focus-mobile.jpg`, `timeline-screen-focus-mobile-controls.jpg` |
| Tablet focus | `timeline-screen-focus-tablet.jpg` |
| Real saved-item result after a failed save/retry | `canvas-save-recovery.png` (historical JPEG bytes) |
| Durable proposal v3 rendered and played | `proposal-v3-playing-desktop.jpg` |

The real towel run verified Fabric → Color → Origin; pre-owned skipped Dye, Back
retained ownership, newly owned entered Dye, and the care sequence reached real
Save → Saved. Captures retained raw `cotton 80%` and `polyester 20%` text while
the separate percentage fields remained empty. Repeated Back visits remain in
history. A failed Save did not create a successful Saved edge; retry retained the
draft and completed the save. Proposal v3 changed the real Fabric heading and
primary action; confirmed Next recorded the candidate action and raw fields.

A later Color shade selection advanced to Origin, returned to Storyboard with its
Color camera unchanged, and resumed the Origin runtime. The agent discarded only
that synthetic test draft through the real Close/Discard confirmation before
refreshing the build. Unsaved real drafts correctly prevent browser reload.

Desktop 1440×1024, phone 390×844 and tablet 850×1024 were inspected using the
in-app browser. Latest checked console errors: none. The phone page can scroll
outside the bounded canvas; the selected screen's action remains reachable.

## Checks

- `pnpm --filter @washcloset/web run check`: types, 1,591 static utilities and
  stylesheet separation passed.
- Vitest: camera, app-map, navigator scrolling and real intake tests: **51/51**.
- `pnpm --filter @washcloset/web run test:review`: inventory, authenticated
  feedback/capture retries, failed capture and proposal version validation: **4/4**.
- `git diff --check`: passed.

The inventory check now rejects the accidental `string` entry caused by matching
a type check as a screen name. Named specimens still do not prove exhaustive
product coverage. Historical `review-validation.json` remains a separate receipt;
it was not rewritten to attest this larger build.

## Boundaries

Recording and live proposal editing are implemented for the towel adapter. Other
screens remain working fixtures or explicitly partial specimens. The editor does
not yet change arbitrary components, primitives, tokens, source behavior or native
platform variants. Review's integrated queue, remote shared storage, collaborator
identity/permissions, presence and simultaneous authorization remain open.

Claude Design and local Open Design supplied the completed design critique/handoff
recorded in `screen-canvas.md`. This build also incorporates subsequent owner
instructions for the horizontal timeline, lower branch lanes and three structures.
It is not a fresh collaborator approval of the implementation. Native platforms,
physical devices, production deployment and complete application behavior were not
verified. The shell is independent of Laundry App's design system.

## Canvas controls pass — October 9

The owner requested substantial tldraw/Figma cues, with Paper as another
reference. [tldraw's canvas UI](https://tldraw.dev/sdk-features/ui-components),
[Figma's UI3 design](https://www.figma.com/blog/behind-our-redesign-ui3/) and
[Paper's interaction guidance](https://paper.design/docs/support) informed the
compact project/view bar, floating Select/Hand tools, collapsible outline,
neutral frames and zoom/fit menu. Horizontal flow positions, lower branch lanes
and declared connectors are retained. Blue marks selection; green marks Live.

Claude Design supplied a completed text critique in its existing Sightline
conversation. Local Open Design supplied another completed text critique in
project `c2383e11-71dc-463a-aea0-a7f2aaefac7f`, conversation
`7960b5e2-1eb2-4f06-b42f-c715c9bfa042`. Both emphasized shortcut isolation from
live app input. These are design critiques, not approvals of rendered code;
existing collaborator artifacts and handoff files were left unchanged.

Verified in the in-app browser at desktop 1440×1000 and phone 390×844:

- The canvas fills the remaining viewport without scrolling the outer page.
- Flow fit retains all 14 declared towel edges. Screen fit selects Fabric.
- Hand drag moves the camera; V/H and Shift+2 work; the zoom menu reaches 100%.
- Typing `h` in search and a live material field does not switch canvas tools.
  Switching tools keeps the entered field value. Test-only text was restored.
- The phone outline opens as a closable overlay. Both floating control groups
  remain inside the viewport; the real Next action remains above them.
- Play starts by default. The existing supported candidate was reviewed and
  saved as v4 against controls source `300832f339e8`, then played. Fabric → Color produced the 22nd
  retained visit and a frozen Fabric capture. Storyboard → Resume retained Gray
  and the private runtime. No candidate was adopted into application code.
- Latest inspected browser console errors: none. Temporary viewport overrides
  were reset. After the final Fit app correction, the agent closed only its own
  synthetic test draft and refreshed. The final deliverable is Storyboard with
  a new baseline Color fixture resumable; previous captures and proposal v4 remain.
- Workbench's Fit app command switches to Storyboard and fits its now-visible
  whole timeline: final observed scale `0.0136379` at desktop size. Baseline
  switching clears the earlier candidate-play status message. Proposal v4 now
  correctly belongs to the preceding source, rather than being silently adopted
  or stamped current by these final shell fixes.

Screenshots in the same evidence directory:
`controls-storyboard-desktop.jpg`, `controls-workbench-desktop.jpg`,
`controls-workbench-phone.jpg`. The final desktop and phone captures show the
baseline Color fixture and adjacent baseline snapshots at the final source.

Types/styles pass (1,591 utilities); six focused Vitest files pass **57/57**;
`git diff --check` passes. API endpoints were unchanged, so their earlier 4/4
receipt remains historical. A long wait occurred while the browser awaited the
screen library; fixture source stayed unchanged. No startup-performance claim
is made. Native gestures/devices and full multiplayer remain unverified.

## One persistent canvas — October 9

Owner approval consolidates Workbench, Storyboard and Review into capabilities
of one workspace. There is one stage, camera and scene. The towel iframe remains
mounted at its current screen's position when browsing or changing panels;
normal transitions move that same frame. Header controls are Play, Edit proposal,
Inspect and Review. Screen/flow selection, lower branches, declared arrows,
navigation-order connectors and camera-following outline remain available.

Inspect and Review share the right pane. The review queue filters by selected
screen, selected flow, all reviews and open/resolved status. Whole-screen capture
freezes HTML, receipt, raw inputs and exact screen identity before writing.
An unsent review persists across navigation/pane changes and reload; retry retains
its request identity and original capture. Review focus moves the camera only.
Historical screenshots/inputs stay labelled; no exact runtime replay is claimed.
The optional screen identity is validated at the server boundary, while older
scenario-only reviews remain readable. The former standalone evidence UI remains
available through `legacy=1` for its element-pin workflow and existing checks.

Current checks:

- Types/styles pass, including 1,591 static utilities.
- Seven focused Vitest files pass **59/59**, including exact care-screen review
  targeting, older-review compatibility, camera, navigation, graph and real intake.
- Authenticated API/capture/proposal and inventory checks pass **4/4** with the
  bundled Node 24 runtime and loopback listeners permitted. Sandboxed listeners
  previously caused a Node assertion; the authorized local run passed.
- The new explicit Playwright consolidation scenario is saved as source only;
  it was not executed. Its interactions were checked manually through the in-app
  browser at desktop 1440×1000 and phone 390×844.

Browser acceptance retained raw `cotton 79%` through Color navigation, review
composition and proposal testing. Proposal `a1a299c4-1f40-450a-86d5-f395b87b3d87`
v5 changes the real Fabric heading to “Which fibers make up this towel?” and
primary action to “Choose towel color”; its confirmed Next reached Color and
created the 24th retained visit. It is a candidate, not adopted application code.
Cancelling Start here kept the current run. All/Resolved review filters did not
move the camera. Phone outline and Review overlays opened and closed without
replacing the Color session; the real Next action and canvas controls remained
reachable. Temporary viewport overrides were cleared afterward.

Two explicitly synthetic acceptance reviews were saved and resolved with evidence:
`7e47e9f9-9356-4808-a314-a874a57b616f` (older scenario-only form) and
`2c5aa058-e544-478d-8def-b92c3ee00f58` (exact `screen=fabric`). Both retain
the raw input and frozen screen. Local API retrieval confirmed proposal v5,
their resolved status and the source revision above without exposing credentials.

Fresh screenshots in the existing evidence directory:
`single-canvas-flow-desktop.jpg`, `single-canvas-desktop.jpg`,
`single-canvas-phone.jpg`, `single-canvas-review-phone.jpg`.

Claude Design and local Open Design each completed a bounded text critique of
this consolidation in their existing conversations. Both emphasized one private
runtime, draft preservation, explicit fixture jumps and frozen-review provenance.
These are completed design handoffs, not rendered-code approval. Impeccable and
frontend interaction guidance informed the contextual-pane pass. No new assets,
dependencies, generic drawing editor or collaborator presence UI were added.

Exact historical replay, automatic before/after comparison, arbitrary component
or behavior edits and real multiplayer remain open. Native/device acceptance,
production deployment and a full application journey audit were not performed.

Final dogfood corrections keep Play scoped to the selected flow: playing Home
does not save an unpublished towel proposal or discard its app input. A fresh
browser verified the unpublished heading and `cotton 79%` on return. The reviewed
candidate was saved and played as v6 against source
`7280f968b7fc5d76149fdfeb26a4015a0923d34ceb299415cb142fd9fd3d584f`;
its confirmed Fabric → Color created the first visit of that new synthetic run.
The new explicit browser test includes this cross-flow regression.

Feedback retrieval now compares each saved receipt to the current source instead
of retaining only the staleness flag computed at creation. Tests verify that a
source change marks older feedback stale without rewriting its receipt or stored
row. The four API checks pass again. Final API retrieval reports both acceptance
reviews as resolved and stale at the final revision. Their captures remain intact.
Types/styles pass after the scoped Play correction; tracked and new-panel
whitespace checks are clean. The final delivery opens a fresh baseline Color
session, with the earlier candidate visibly stale when inspected. Temporary QA
tabs and viewport overrides are removed; owner tabs are retained.

## Coverage bridge — October 10

The [coverage bridge](coverage-bridge.md) is running in this same isolated checkout
on port 3010. Final inventory source is
`c2f1c21d1b91bb90f3924bebb5ee77246b53a9bee66fb5618623c5985e2e4092`;
fixture source is `81d9c3604c5ba4b876a8d71f7fdf351fa3a16dea938dd7248f2f511741c3fc85`.
Contract v4 contains 11 expectations; source discovery adds 40 unconfirmed
mapping candidates. All 176 fixture images are cached for this fixture revision.
These counts are inventory facts, not 51 confirmed absent app features.

Types/styles and 65 focused tests pass. Nine API/inventory/coverage checks pass,
including candidate TSX compilation, path validation, canonical contract writes,
durable scaffolds, stale/conflicting writes, source changes during image capture,
and exact historical snapshot provenance. The new Chromium coverage browser case
passes against the final service: editable prototype and captured example input,
persistence, unpublished-edit discard guard, actual repository expectation save,
automatic watched-source notification and unchanged live towel iframe/inputs.
The washer-recovery expectation now explicitly requires retries to retain the
washer selection and preparation. The synthetic QA candidate heading was restored
to its real target title after verification.

The local desktop design project supplied a completed text-only critique; fresh
Claude Design review was not obtained in that separate app. Generation is a local
brief/prototype/React scaffold, not AI implementation or a candidate Git branch.
No application feature adoption, native/device acceptance, deployment, background
daemon or cross-process multiplayer safety is attested. Existing execution/design
receipts remain tied to their earlier source revisions.

## Cross-route action connections — October 10

Navigation order now controls area placement without drawing artificial arrows
between tabs or vertically adjacent flows. `src/review/route-actions.json` holds
17 curated source bindings: 12 link representative existing specimens; five
retain an unmapped destination state. Examples include Home → selected plan,
Home → running wash or dryer check, Closet → Laundry, and Me → completed wash
with return-to-Me context. Account/settings actions remain actions within Me.

The inventory merges mapped actions into the existing scenario graph and exposes
all bindings in Inspect with symbolic route parameters, conditions, return
context and source links. A missing source anchor suppresses the mapped arrow;
the binding becomes stale. This is a bounded source check, not semantic parsing,
exhaustive discovery, an observed transition or a continuous cross-route runner.
Unmapped states include Add chooser, Closet item in a running load, Laundry's
open hamper item, successful washer-to-Drying transfer and garment care history.

Types/styles, four map tests and six inventory/coverage checks passed. Three
isolated Chromium canvas cases passed, including preserved live drafts, readable
overview/branch framing and route inspection with an explicitly unmapped target.
The overview screenshot was inspected. Tests used copied local dependencies
after the temporary test cache was repaired; no cold install is attested.
Laundry App behavior and canonical design files were not changed. No fresh
Claude Design or local desktop visual handoff, native acceptance or exhaustive
application navigation audit is attested. The v3 ZIP remains the prior snapshot.

The existing port-3010 service reads the new source revision but retains the
previously loaded inventory module (its index exposes zero route bindings).
It requires a server restart before these bindings appear there. That service
and its user's live session were left running; verification used port 3143.

## Canvas routing and full detail — October 10

An in-repository rectilinear A* router replaces the shared top lane and curved
branch connectors. It routes through card gutters with a bend cost, separates
lanes, rounds corners and suppresses an arrow if no unobstructed path exists.
Forward actions are blue, branch choices retain teal labels, and return links
use dashed gray strokes. Existing observed towel transitions retain orange.
Routing is memoized independently of pan/zoom. It avoids cards, but does not
globally minimize connector crossings; more densely connected graphs may need
crossing costs. Navigation order still creates no inferred actions.

The Canvas detail selector offers Compact flows or All screens and persists the
choice locally. All screens renders all 176 registered thumbnails at a minimum
18% camera scale, with panning rather than whole-app compression. Selecting a
flow or screen still fits that target; App returns to the chosen detail setting.
The same live frame stays mounted across both representations.

Types/styles, six routing/map tests, six inventory/coverage checks and four
isolated Chromium cases passed. Desktop overview, towel branches and desktop/
narrow all-screen captures were inspected in two bounded rounds. The browser
cases verify retained input, complete thumbnail count, reload persistence,
narrow panning and cross-route target context. The existing port-3010 service
was not restarted. No cold install, native-device acceptance, exhaustive graph
audit or fresh external design handoff is attested; the v3 ZIP is unchanged.

## Preview restart and v4 handoff — October 10

At the user's request the current checkout now serves the synthetic preview on
`http://127.0.0.1:3010/review`. Port 3010 had no listener before launch. The new
service exposes source `e514dbcd8ee04808602f81432455f43b0f43f233752e05f78c5d289edf55bb77`,
173 scenarios and all 17 route bindings (12 representative previews, five
unmapped destination states). This supersedes the earlier cached-module warning;
the earlier notes describe the service before this restart.

The v4 package refreshes the curated source, complete post-first-ZIP report,
handoff, arrow/full-detail screenshots and incremental Git patch. Its comparison
with the verified original archive covers 27 source paths: 11 additions and 16
modifications, without removals. Earlier bundles are preserved. Source/runtime
proof, portable payload integrity and historical design evidence are separate;
private keys, saved review records, environment files and dependencies are not
transfer assets. No additional product feature or shared design edit is part of
this packaging pass.
