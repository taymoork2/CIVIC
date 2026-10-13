# Laundry's CIVIC graph

Roadmap [step 9](../../docs/roadmap.md#9-real-inputs-replace-the-stand-ins): real inputs replace the stand-ins. Laundry is the first real app CIVIC reads, and unlike the [Fluent Button](../../demo/fluent-button) and [Card](../../demo/card) demos, nothing here is illustrative. Every record comes from Laundry's own journey data and Laundry's own test suite, run unchanged.

## What a reader sees

| Question | Where to look |
|---|---|
| Which journeys and screens have run evidence, and which fail? | [`out/runs.md`](out/runs.md): one row per journey, then every failing test with the screens it covers. |
| What does one screen look like in the graph? | `bin/civic screen target:laundry.<scenario>`, or the Contract panel on the journey canvas, which shows the same facts for the selected screen. |
| What has Laundry declared but can't yet show and prove? | [`out/coverage.md`](out/coverage.md): one open Coverage gap record per expectation in the journey engine's coverage contract that no passing run covers yet. |
| What does Laundry's design reference cover? | [`out/design.md`](out/design.md): Open Design's reference renders as a design file, [`out/design.json`](out/design.json), which `bin/civic design` registers as Laundry's design line. |
| Do Laundry's design tokens match its code? | [`out/tokens.md`](out/tokens.md): the design reference's custom properties against the web tokens Laundry's token build generates. Each name set differently is an open Contract Conflict. |
| What does the gate say? | `bin/civic check`, which reads [`out/graph.json`](out/graph.json) with the demo graphs ([`civic.check.json`](../../civic.check.json)). |

On the first capture, at commit `ea0d4e83a6b0`, 24 of Laundry's 27 review tests passed and 3 failed, and 12 of the 49 journey screens are dead ends. All 15 findings are real and are held in [`civic.baseline.json`](../../civic.baseline.json), so the gate passes today and blocks the next new one.

- **Failing tests.** "Review opens real synthetic sheets" waits for a review heading the v6 workspace no longer shows. "Every initial named scenario renders a real task drawer" now also loops over the Home reminder scenarios, which aren't drawers. "Returning to the family plan" can't find its Back to Laundry link. They look like tests the v6 handoff didn't update, but nobody has confirmed that yet.
- **Dead ends.** The appliance, product, saved record and nested edit scenarios declare no path on, for example from Basic appliance intake to Saved appliance. Either the paths are missing from the journey data or the screens are legitimate ends. The engine declares no exits, so CIVIC can't tell which.

## Inputs

| File | What it is | How it's read |
|---|---|---|
| [`inputs/review-index.json`](inputs/review-index.json) | The journey engine's review index for Laundry (`GET /api/review/index`): 204 scenarios in 12 groups, their declared paths, the cross-route actions found in source, and each scenario's checks | `readJourneyIndex` |
| [`inputs/coverage.json`](inputs/coverage.json) | The journey engine's coverage contract at the same commit: the screens, interactions and journeys Laundry declares, with their expected scenarios and acceptance requirements | `readCoverageContract` |
| [`inputs/playwright-report.json`](inputs/playwright-report.json) | Playwright's JSON report from the four browser specs the scenarios name as their checks, run against a review server, with attachments and machine paths removed | `readPlaywrightReport` |

Laundry's design reference comes from the vendored Open Design package, [`journey-engine/design/laundry-reference/source-reference/receipt.json`](../../journey-engine/design/laundry-reference/source-reference/receipt.json), read by `readRenderReceipt`. It isn't captured: a newer reference or a designer's proposal comes from Open Design or Claude Design with a receipt of the same shape.

All three are read at the commit they were captured at, and every record carries it.

## How the graph is built

- **Screens and journeys.** Each scenario becomes an expected screen with the ID the canvas already uses for annotations, `target:laundry.<scenario>`. Each journey contains its screens. The 155 older design-preview specimens are a catalog rather than a journey anyone walks, so they become a surface and the journey shape checks skip them.
- **Paths.** Each declared path becomes a declared `navigates` link. A path the engine also found in application source keeps its route and source anchor.
- **Run evidence.** Laundry's tests carry no CIVIC annotations, and nothing is added to them. A test covers the scenarios its spec file is declared to check. When the test opens some of them by name (`scenario=<id>` in a URL), it covers only those. A test that loops over scenarios in code covers the whole declared set, so one failure there marks every screen in it as failing, and its message names the screen that broke.
- **Coverage gaps.** Each expectation in the coverage contract becomes an expected target, `target:laundry.expectation.<id>`. One the app can't yet show and prove becomes an open Coverage gap [collaboration record](../../graph#collaboration-records), owned like any other. That covers an expectation no scenario shows, one whose expected scenario isn't in the index, and one with a scenario no passing run covers. A gap names the expectation and its unproven scenarios. The next build stops raising it once a passing run covers every scenario. Scaffolds and file presence never count as coverage. At commit `e8cb256b31d3`, 11 of the 13 expectations are gaps: six planned features with no code yet, three with code but no scenario, and two journeys with scenarios that no passing run covers. The gate reports open records as advisory.
- **Design reference.** Laundry's design system lives in Open Design, not Figma. Each case of its source-render receipt, one screen at one viewport, theme and text scale, becomes a frame in [`out/design.json`](out/design.json) (`civic.design/0`), fingerprinted by its reference image and settings. The review frame renders scenario `legacy.<screen>` as the same design-preview screen the reference renders (`apps/web/src/review/laundry-frame.tsx`), so a case designs `target:laundry.legacy.<screen>`. All 134 cases design one of 76 screens. Those specimen screens have no run evidence (see below), so the lens shows a proposal's screens without runs for now.
- **Tokens.** The design reference's stylesheets (`colors_and_type.css`, `tokens.css`) and the generated `apps/web/src/generated/tokens.css` are compared by custom-property name, with `var()` aliases resolved. The default theme is compared first. The dark theme is then laid over it and compared again only where it sets something itself. In the default theme, 18 names are set by both and 4 differ. The reference's `--accent` resolves to its `--pr` (#164be0), while the code's is #1f45ff, the reference's `--ac`. The reference's `--space-2`, `--space-4` and `--space-6` are 2, 4 and 6 px layout roles, while the code's are a 0.5rem, 1rem and 2rem scale, so the same names mean different things. In the dark theme only `--accent` differs, in the same way: the reference has #2f4cf0 (its `--pr`) and the code has #9db4ff (its `--ac`). All five are decided in [`decisions.json`](decisions.json): the shipped code wins, so the reference's `--accent` alias changes to `--ac`, and its pixel layout roles get names of their own. Claude made these calls on Taymoor's standing instruction, and he can revise any of them with `civic decide`. The other reference names, mostly its short color names and its layout and motion roles, have no generated token, and they are listed rather than raised.
- **Replayed runs.** A recorded run replayed in the canvas is kept by the review server as a `civic.replay/0` record ([decision 0009](../../docs/decisions/0009-recorded-runs-as-evidence.md)). The capture copies the replays made at the captured commit into `inputs/replays.json`, both this checkout's and those others shared through `civic share-replays` and `civic sync`, and each tape's latest replay becomes `runtime` evidence about the screen the run starts from. None has been captured yet.
- **Not covered.** The 155 specimens are checked by a unit test (`design-preview.test.ts`), not a browser run, so they have no run evidence here. Laundry's full browser suite needs its local Convex backend, which this capture doesn't start; the review specs run on synthetic fixtures without one.

## Recapturing

```sh
cd journey-engine/source && pnpm --dir apps/web run review     # a review server on port 3010
node projects/laundry/capture.ts                           # from the repository root, on a clean journey-engine/source
node projects/laundry/build.ts                             # rebuild out/
bin/civic check                                            # new findings block; fixed ones are listed
```

Or let the signoff decide: `bin/signoff --capture` recaptures only when the gate finds the evidence stale, meaning `journey-engine/source` changed since the commit it was captured at ([`civic.check.json`](../../civic.check.json)'s freshness rule). A recapture stops the signoff so the new evidence is reviewed and committed first. The recapture at `c694591b9b25`, after the Contract panel change, gave the same 24 passes and 3 failures. On 2026-10-12, after the v7 import and the move to `journey-engine/`, five stale review tests were brought up to date (renamed headings and controls, whole-screen renderers that aren't drawers, and the towel now saving through the app). The recapture at `e8cb256b31d3` runs 39 tests across 6 spec files, and all pass. The v7 index adds a Live application journey whose 14 screens have no declared paths yet, so they're dead ends, held by the baseline.

The capture refuses a dirty `journey-engine/source`, and it refuses a review server that read a different commit, because the evidence would describe code no commit holds. Laundry's Playwright config uses installed Chrome. `bin/signoff` fails when `out/` doesn't match the inputs. Because the build reads the spec files to see which scenarios each test opens, an edited spec can also change `out/`, which is a sign to recapture.
