# Rehearsal first-slice design QA

final result: passed

Latest controls pass: passed within the bounded desktop/phone scope below.

Scope: the owner-approved real towel Workbench and application Storyboard changes.
This does not approve the complete three-structure product. Review's integrated
queue, before/after comparison and captured-state restoration remain undelivered.

## October 9 controls refinement

The owner explicitly requested tldraw/Figma/Paper cues. This supersedes the older
shell spacing, typography and orange selection tokens documented below; those
sections retain the earlier timeline-pass evidence. The new shell uses a compact
56px project bar, 248px collapsible outline, floating Select/Hand and zoom/fit
controls, neutral canvas frames, blue selection and green Live status.

Claude Design and local Open Design completed text critiques before integration.
The practical changes preserve the independent product shell and existing
bounded camera, real previews, private inputs, proposal editor and branch graph.
No drawing-editor dependency or decorative assets were introduced.

Desktop 1440×1000 and phone 390×844 rendered captures are saved as
`controls-storyboard-desktop.jpg`, `controls-workbench-desktop.jpg` and
`controls-workbench-phone.jpg` in the evidence directory below. Full-page height
equals viewport height in both checks. Zoomed screens remain pannable; phone
controls do not cover the primary Next action. Sidebar collapse and overlay,
flow/screen fit, drag pan, V/H, Shift+2, 100% zoom, typing isolation, Fabric → Color
capture and retained Gray selection across view switching were verified. A final
correction verifies Workbench's Fit app command fits the complete Storyboard after
it becomes visible. The agent closed its test draft before refreshing; the final
captures show a fresh baseline Color fixture, with the prior evidence retained.

Types/styles and 57 focused tests pass. No console errors were inspected in the
final browser check. The wider queue, native/device acceptance, startup latency
and multiplayer remain outside this pass. These captures are not collaborator
approval of the rendered implementation or pixel matching against Figma.

## Visual truth and normalization

- Screen-canvas source:
  `/Users/taymoor/.codex/generated_images/01a12354-2b94-7df3-aff2-45fe8e90641e/exec-ed51bfac-9a4c-4269-84de-31a1be9b4b66.png`
  — 1487×1058 PNG, an illustrative desktop/mobile board rather than a CSS viewport.
- Three-structure source:
  `/Users/taymoor/Downloads/Three structures compared@2x.png`
  — 2880×1720 PNG; compared as a 1440×860 conceptual board at nominal 2× density.
- Owner's subsequent instructions intentionally change the source composition:
  restored sidebar, horizontal flow timeline, lower branch lanes, bounded camera,
  flow/screen fit and Workbench / Storyboard / Review entry points.
- Implementation evidence directory:
  `/Users/taymoor/.codex/visualizations/2026/10/10/01a12354-2b94-7df3-aff2-45fe8e90641e/review-workspace`.
- Desktop `timeline-workbench-color-desktop.jpg`,
  `timeline-flow-fit-desktop.jpg`, `timeline-ownership-branches-desktop.jpg`,
  `timeline-neighbor-flows-desktop.jpg`, `timeline-screen-focus-desktop.jpg`:
  1440×1024 pixels at a 1440×1024 CSS browser viewport.
- Phone `timeline-screen-focus-mobile.jpg` and
  `timeline-screen-focus-mobile-controls.jpg`: 390×844 pixels/CSS viewport.
- Tablet `timeline-screen-focus-tablet.jpg`: 850×1024 pixels/CSS viewport.
- Screenshot output is JPEG, nominal 1× capture density. Actual application frame
  is 393×852 CSS pixels and is transformed by the canvas camera. No exact pixel
  identity or font identification is claimed for the generated board. Region
  comparisons assess hierarchy, real controls and readable interaction states.

## Comparison evidence

Source board and rendered desktop/phone/tablet captures were opened together in
the same comparison input. A final comparison paired the original screen-canvas
board with the ready Color Workbench and corrected ownership-branch capture.

Full view confirms a clear mode header, left journey rail, central live preview,
optional inspector and a separate Storyboard composition. Focused Fabric at 98%
and its 82% phone capture establish readable controls and a reachable Play action.
Color Workbench uses the source's Gray/Light baseline with the real optional-color
control and Next action. Origin/Dye/Care is compared separately to inspect the
branch geometry and labels. The phone controls capture was taken after outer-page
scroll; this is separate from canvas pan. Important details were inspected at
screen scale rather than judged from the 19% whole-flow fit alone.

## Findings and iteration history

| Earlier finding | Severity | Fix | Post-fix evidence |
| --- | --- | --- | --- |
| Scrolling sheet presented as pan; branch arrows missing | P1 | Shared camera transform, bounded pan, pointer zoom and explicit graph arrows | `timeline-screen-focus-desktop.jpg`, camera test |
| Flow groups arranged vertically despite requested timeline | P1 | Horizontal flow positions and cross-flow connections | `timeline-neighbor-flows-desktop.jpg`, app-map test |
| No individual screen entries or viewport-following highlight | P1 | Expanded nested outline; flow/screen fit and center hit detection | `timeline-camera-follows-screen.jpg`, phone focus |
| Dye above primary path and labels colliding after lane change | P2 | Lower Dye lane, direct pre-owned bypass and separated label positions | `timeline-ownership-branches-desktop.jpg` |
| Snapshot fit clipped Play action | P2 | Fit includes 737px card/action region | `timeline-screen-focus-mobile-controls.jpg` |
| Resize/hidden canvas could reset focus; outline moved the whole page | P2 | Ignore hidden zero dimensions; refit live screen; scroll only outline containers | tablet/phone captures and navigation test |
| Initial final screenshot caught a loading frame | Evidence gap | Recaptured only after actual Gray radio, Next action and saved thumbnails appeared | ready `timeline-workbench-color-desktop.jpg` |

No actionable P0/P1/P2 differences remain in this first-slice scope. Intentional
deviations below do not constitute pixel-matching approval of the wider product.

## Required fidelity surfaces

- **Typography:** system UI shell, clear 28px page heading/19px panel heading/13px
  outline hierarchy. Nested screen names inherit readable size/color rather than
  the muted number styling. Real application typography remains inside its frame.
  The generated source's exact font is unspecified; system UI is intentional.
- **Spacing/layout:** restored 220px rail, central camera and optional 300px
  inspector. Phone header wraps; outline scrolls internally; screen action remains
  reachable by outer-page scroll. Native sheet gray scrim is preserved even though
  the illustrative source crops it away. Lower branches and timeline replace the
  source's compact local arrangement by explicit owner request.
- **Color/tokens:** independent ink `#172334`, muted `#5a6c83`, pale canvas
  `#f5f9fc` and accent `#bd3907`; actual application keeps its blue primary action.
  Proposal colors are validated for white-text contrast before durable save.
  Selection uses text/border/state semantics in addition to color.
- **Images/assets:** inactive screens are actual cached PNGs, not recreated screen
  pictures. Focused screen is the real component. Browser JPEG proof has mild
  compression; runtime fixture PNGs remain lossless. Illustrative avatars, date
  and tentative brand mark were intentionally removed with excess shell chrome;
  no replacement decorative illustrations or fake collaborators were added.
- **Copy/content:** explicit Baseline/Proposal, Live/Fixture/Captured and private
  synthetic run labels. Raw Fabric text and empty percentage fields are retained.
  Partial specimens and declared/navigation-order paths are distinct. Edit only
  exposes properties it persists and renders. No developer-role mode is required.

## Primary interactions and checks

Verified real towel transitions through both ownership paths, Back, real Save,
failed-save recovery, frozen captures, retained raw inputs, durable proposal v3
and baseline/candidate switching. Verified flow fit, screen fit, pan-following
sidebar, phone/tablet focus, Storyboard return with retained run/camera and Review
opening the selected scenario without replacing Workbench. Latest browser console
error check returned none. Types/styles, 51 focused tests and four API/inventory
checks pass. See `docs/design/review-product/build-evidence.md` for receipts/limits.

## Follow-up polish and limits

- P3: at whole-app fit, a long horizontal timeline produces tiny thumbnails; use
  the tested flow/screen fit controls. A distant-view simplification can improve it.
- Review currently uses the existing evidence UI in a separate tab. It has not
  been visually reconciled as the final note-led queue from structure C.
- Full multiplayer, native targets, physical devices, dark shell mode, freeform
  component/token editing and exhaustive app transitions were not accepted here.

Implementation checklist completed for this slice: corrected camera/layout;
restored branch arrows; expanded/following sidebar; retained live run; real
proposal editing/captures; responsive inspections; combined source comparisons;
scoped tests; explicit delivery boundaries.

## Owner-approved single-canvas consolidation

The October 9 consolidation supersedes separate Workbench/Storyboard navigation
and the standalone Review entry described above. One canvas now holds the app
timeline and retained live towel session; Inspect, Edit proposal and Review use
the right pane. Play remains the default. Claude Design and local Open Design
completed text critiques emphasizing draft safety and frozen-review provenance.
Their critiques are design input, not approval of the rendered implementation.

Desktop 1440×1000 and phone 390×844 captures in the existing evidence directory
show the current composition: `single-canvas-desktop.jpg`,
`single-canvas-flow-desktop.jpg`, `single-canvas-phone.jpg` and
`single-canvas-review-phone.jpg`. Horizontal flows, lower Dye lane, declared
connectors, nested screen outline and active Live marker remain. The compact
neutral shell and blue selection from the controls pass replace the earlier
orange shell described in the historical fidelity section.

Manual interaction checks verified that `cotton 79%` survives screen navigation,
review writing and candidate v5 testing. The same real iframe advances Fabric
to Color; the frozen prior capture keeps the raw fields. Start here cancellation
retains the application draft. Review filters preserve the camera; selecting a
review focuses its screen without replacing the run. Phone Review and outline
overlays close back to the current Color screen. Types/styles, 59 focused tests
and four API/inventory checks pass. The new Playwright scenario remains unrun;
these browser checks used the in-app browser's interaction tools.

The final cross-flow check retained an unpublished towel heading and app input
when playing Home. Candidate v6 played against the reviewed frontend source;
the final API-only staleness correction makes its earlier receipt explicit.
Older reviews now get a current staleness flag on retrieval, without changing
their original receipt or image. Both synthetic acceptance reviews are resolved.

Integrated review currently captures whole screens. The earlier element-pin
workflow remains available at `legacy=1`. Historical draft replay, automatic
before/after, arbitrary component edits, physical devices and multiplayer were
not verified or delivered by this consolidation.
