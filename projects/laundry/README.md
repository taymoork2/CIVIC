# Laundry's CIVIC graph

Roadmap [step 9](../../docs/roadmap.md#9-real-inputs-replace-the-stand-ins): real inputs replace the stand-ins. Laundry is the first real app CIVIC reads, and unlike the [Fluent Button](../../demo/fluent-button) and [Card](../../demo/card) demos, nothing here is illustrative. Every record comes from Laundry's own journey data and Laundry's own test suite, run unchanged.

## What a reader sees

| Question | Where to look |
|---|---|
| Which journeys and screens have run evidence, and which fail? | [`out/runs.md`](out/runs.md): one row per journey, then every failing test with the screens it covers. |
| What does the gate say? | `bin/civic check`, which reads [`out/graph.json`](out/graph.json) with the demo graphs ([`civic.check.json`](../../civic.check.json)). |
| What is missing, with owners? | `bin/civic gaps projects/laundry/out/graph.json` |

On the first capture, at commit `ea0d4e83a6b0`, 24 of Laundry's 27 review tests pass and 3 fail, and 12 of the 49 journey screens are dead ends. All 15 findings are real and are held in [`civic.baseline.json`](../../civic.baseline.json), so the gate passes today and blocks the next new one.

- **Failing tests.** "Review opens real synthetic sheets" waits for a review heading the v6 workspace no longer shows. "Every initial named scenario renders a real task drawer" now also loops over the Home reminder scenarios, which aren't drawers. "Returning to the family plan" can't find its Back to Laundry link. They look like tests the v6 handoff didn't update, but nobody has confirmed that yet.
- **Dead ends.** The appliance, product, saved record and nested edit scenarios declare no path on, for example from Basic appliance intake to Saved appliance. Either the paths are missing from the journey data or the screens are legitimate ends. The engine declares no exits, so CIVIC can't tell which.

## Inputs

| File | What it is | How it's read |
|---|---|---|
| [`inputs/review-index.json`](inputs/review-index.json) | The journey engine's review index for Laundry (`GET /api/review/index`): 204 scenarios in 12 groups, their declared paths, the cross-route actions found in source, and each scenario's checks | `readJourneyIndex` |
| [`inputs/playwright-report.json`](inputs/playwright-report.json) | Playwright's JSON report from the four browser specs the scenarios name as their checks, run against a review server, with attachments and machine paths removed | `readPlaywrightReport` |

Both name the commit they were captured at, and every record carries it.

## How the graph is built

- **Screens and journeys.** Each scenario becomes an expected screen with the ID the canvas already uses for annotations, `target:laundry.<scenario>`. Each journey contains its screens. The 155 older design-preview specimens are a catalog rather than a journey anyone walks, so they become a surface and the journey shape checks skip them.
- **Paths.** Each declared path becomes a declared `navigates` link. A path the engine also found in application source keeps its route and source anchor.
- **Run evidence.** Laundry's tests carry no CIVIC annotations, and nothing is added to them. A test covers the scenarios its spec file is declared to check. When the test opens some of them by name (`scenario=<id>` in a URL), it covers only those. A test that loops over scenarios in code covers the whole declared set, so one failure there marks every screen in it as failing, and its message names the screen that broke.
- **Not covered.** The 155 specimens are checked by a unit test (`design-preview.test.ts`), not a browser run, so they have no run evidence here. Laundry's full browser suite needs its local Convex backend, which this capture doesn't start; the review specs run on synthetic fixtures without one.

## Recapturing

```sh
cd rehearsal/source && pnpm --dir apps/web run review     # a review server on port 3010
node projects/laundry/capture.ts                           # from the repository root, on a clean rehearsal/source
node projects/laundry/build.ts                             # rebuild out/
bin/civic check                                            # new findings block; fixed ones are listed
```

The capture refuses a dirty `rehearsal/source`, and it refuses a review server that read a different commit, because the evidence would describe code no commit holds. Laundry's Playwright config uses installed Chrome. `bin/signoff` fails when `out/` doesn't match the inputs. Because the build reads the spec files to see which scenarios each test opens, an edited spec can also change `out/`, which is a sign to recapture.
