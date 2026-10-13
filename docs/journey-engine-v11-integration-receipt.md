# v11 integration receipt: accounts, offline and viewport

What was integrated from the v11 journey engine handoff, how it was checked, and what is still not accepted. Written on 2026-10-12 for Taymoor's review of the integration PR. How the port relates to earlier handoffs is in [the v11 port notes](synthesis-v0-import.md#v11-port-accounts-offline-and-viewport).

## Authorization and scope

Taymoor authorized on 2026-10-12 (21:47Z) integrating three v11 concerns into CIVIC's existing packages:

- same-run account switching;
- actual offline with explicit manual recovery;
- device, viewport, fold, orientation, theme and text-scale changes on the existing run tape.

This port adds no other policy or roadmap work. Nothing was deployed. No real Laundry trial, backend or inventory was touched, and neither were f7ce, its QA and release runtime, or the canonical Design references. No human Decision or Verification record was written, no review was closed, and no failure was baselined.

## Inputs, as received

| Archive | SHA-256 | Where |
|---|---|---|
| `rehearsal-handoff-2026-10-12-v11.zip` | `7060b59e372fb73648dcaec963271ec641af1f7101e95204b458cda6f7f991c6` | project files (sealed copy, unchanged) |
| `rehearsal-verification-2026-10-12-v11-supplement.zip` | `d52610decb03e3393b18459d8aa9ad6e8d452f56accf6e62e49001b00965a154` | project uploads (unchanged) |

Both hashes match the ones Taymoor gave. Their MANIFEST and SHA256SUMS, HANDOFF and the supplement's `journey-engine-v11-integration-reconciled.md` were read. The earlier integration draft is historical.

v11's `since-v10.patch` applies only to an exact v10, so it was not used. Each concern was ported by diffing v7 as sent (CIVIC's base) against v11's full source and moving the changes into CIVIC's packages. The v11 source and its provenance stay frozen and outside this repository.

## What changed

- **`@civic/canvas`.** It now carries:
  - run journals with leases, and reopening a run from its journal;
  - one synthetic account per persona identity, switchable within a run, with a fresh credential per account and run;
  - a run clock;
  - an offline transport with saved steps that only a person resends;
  - a write identity, so a resend runs at most once;
  - viewport, fold, rotation, theme and text-size steps;
  - the run and viewport controls.

  Its newer HTTP, server-function and sign-in adapters are kept, and there is no second replay or store.
- **`@civic/shell`.** Recordings validate the new run steps, the viewport height and preset, and a write's account.
- **`@civic/vite-connector`.** The run service gets the review store's data directory.
- **Laundry adapter** (`apps/web/src/review/adapters`, `apps/web/scripts`). Its specifics stay there: the 1,000-piece family seed, the owner, member and other accounts, Convex, and the private scope. The family laundry day page (`/review?familyDay=1`) runs on the shared runtime.
- **Laundry app.** Its source was synced to v11 where the family day needs it: privacy, wearers, account-bound saved steps and auth limits. This is in its own commit.
- **Team board example.** It now has two synthetic accounts in one run and handles a failed fetch while offline.

Commits on `claude/project-thread-9en6l5`, in order:

| Commit | What |
|---|---|
| `099b0db` | Shared run behaviour: accounts, offline recovery, viewport steps, team board proof |
| `78658cf` | Laundry app and Convex synced to v11 for the family day |
| `aec5859` | v11 family browser spec; offline writes kept as saved steps; faster settles for large runs; account switch seals the previous step first |
| `a0b1acb` | Write identity, so a lost-answer resend runs once (the Local Codex finding), with the team board regression |
| `4984688` | Workspace checks fitted to live family screens and v11's discard prompt |
| `dd967b8` | Laundry evidence recaptured at `4984688` |
| `96aadce` | This receipt |
| `03c3127` | The frame's transition race fixed with a rapid-navigation check; a family browser check through drying and put-away; this receipt corrected; the capture bounded with per-test progress |
| `211b0c6` | Laundry evidence recaptured at `03c3127`, with this table |
| `ca589d6` | Snapshot and canvas specs rerun on `211b0c6`, after the frame fix |
| `0f93f8d` | Laundry's product specs fitted to v11's modal discard prompt |
| `3d5a5d3` | Product suite and browser signoff results |
| `4fb7fc5` | `main` merged in (replays as run evidence, decision 0009); the canvas's run controls keep both the run section and saving each replay as evidence |

## Fixes found during acceptance

- **Preview startup.** Restarting the review server killed only its `sh -c` wrapper. The `vite.js` child kept port 3010, so the new server failed with the port already in use, and the readiness probe was answered by the old server at an older commit. Restarts now stop the real listener. The server counts as ready only when its review index names HEAD, checked with 5-second request timeouts and a 90-second deadline.
- **Lost answer, resent write.** Local Codex found this in its own independent inspection of `099b0db`, as part of the task Taymoor authorized. It was not a code review by a person. The fix:
  - Every write now carries its own identity, and a saved step keeps it when resent and when the run reopens.
  - The run journals the identity with the write's name, arguments and account. A resend with the same identity gets the recorded receipt back, and nothing executes again, across a reopen too.
  - Reusing an identity for a different write or account is refused, and so is a page acting as an account that is no longer active.
  - Identical payloads are no longer merged. An adapter may name the app's own key for a write; Laundry names its receipt id.
  - Identities stay off tapes, so older recordings still replay.
- **Large-run replay.** Replaying the 1,000-piece run took 48 seconds for two steps, because every settle re-read the whole run state, about 1.3 seconds a read. Settles now re-read only after a write, an account change, a clock change or a reset; waiting flushes coalesce; and the source check uses `inspect`. The same replay takes about 12 seconds.
- **Account switch snapshots.** Switching account blocked input before the previous step was sealed, so that step was recorded with an empty screen and replay diverged. The step is now recorded first.
- **Journey map.** Runtime screens without a route kept no flow of their own. They now keep their journey ("Family laundry day").
- **Transitions checked from the wrong screen.** The frame checked each transition the app reported against the screen it last published, which follows only after the app settles. Two navigations before that publish, such as a fast Save straight after Add task, were refused as unregistered edges. This failed the Tasks browser check once. The frame now keeps the screen the app reported, updated by each publish and by each accepted transition. The Tasks host check now makes two navigations in one task (Add task, then Cancel, before any publish) and expects both transitions. It failed before the fix with only the first transition, and passes after it.
- **Workspace checks.** Two failed after the v11 sync:
  - the drawer check opened the family screens, which are now live screens, not drawers;
  - v11's sheet shows its discard prompt as its own alert dialog.

  The checks now skip runtime screens and answer that dialog. The behaviour checked is the same.

## Results

Every result below is from this branch. The commit named is the one the checked code was at. Rows at `dd967b8` cover code that `03c3127` does not change.

| Command | Commit | Result |
|---|---|---|
| `pnpm --dir packages/canvas exec tsc --noEmit` | `03c3127` | clean |
| `pnpm --dir packages/canvas test` (vitest, then the run service, server function and canvas host checks) | `03c3127` | vitest 17/17; host 17/17 |
| `pnpm --dir apps/web exec tsc --noEmit` | `03c3127` | clean |
| `pnpm --dir apps/web run test:review` | `03c3127` | 28/28, shell server 12/12, vite connector 11/11 |
| `pnpm --dir apps/web exec vitest run` | `03c3127` | 97 files, 845/845 |
| `pnpm --dir convex exec vitest run` | `dd967b8` | 51 files, 479/479 (Convex is unchanged since) |
| `node projects/laundry/capture.ts http://127.0.0.1:3010` (Playwright with `WASHCLOSET_REVIEW_E2E=1`: family runtime, reminder, route states, runtime, towel runtime, workspace; line progress per test, 25-minute global timeout) | `03c3127` | 36/36, 0 skipped, 0 flaky, 7.4 minutes |
| `playwright test e2e/review-snapshots.spec.ts e2e/review-canvas.spec.ts --project=isolated --workers=1 --retries=0` (with `WASHCLOSET_REVIEW_E2E=1`, against the review server serving `211b0c6`, source fingerprint `8f2943dabe6b99bf15dd1495817a56bd22cddcb8be723fe5752b66a423ff4658`) | `211b0c6` (same code as `03c3127`) | 8/8, 0 skipped, 0 flaky, 49 seconds |
| `node projects/laundry/build.ts` | `03c3127` | 294 records, 36 tests, 0 failing; 11 of 13 expectations are coverage gaps |
| Laundry product specs that need no backend (13 files that open design specimens), `--project=isolated --workers=2 --retries=0`, against `vite dev` with no backend | `0f93f8d` | 63 passed, 15 failed, 2 skipped. The same 15 fail on `main` (`cc5e90c`) in the same run, because they sign in and need a Convex backend. Before the spec fixes, 8 more failed, only on this branch |
| `bin/signoff --browser --no-post` | `3d5a5d3` | Passed, review-canvas journey 5/5 |
| Canvas `tsc`, vitest and host checks, then `bin/signoff --browser --no-post`, after merging `main` | `4fb7fc5` | Types clean, vitest 17/17, host checks 17/17. Signoff passed, review-canvas journey 6/6 (one test came from `main`) |

What these cover:

- **Laundry family laundry day** (`e2e/review-family-runtime.spec.ts`, from v11):
  - a private 1,000-piece run starts;
  - owner, member and other accounts switch in the same run;
  - a browser offline event (`context.setOffline`) disconnects the run;
  - a write made offline is kept as a saved step for its account only and hidden from the others;
  - reopening keeps the run offline until a person reconnects, and nothing is resent by itself;
  - the app's own resend settles the saved step, and the write's effect is confirmed in the run;
  - seven device presets, rotation, fold, unfold, dark theme and enlarged text resize the real frame without leaving the run or losing the selection;
  - replay verifies, and reopening restores the viewport;
  - one load goes from washing through drying to put-away in the same run (added at `03c3127`, not from v11). It runs preparation, enters the washer minutes, advances synthetic time 40 minutes, hangs the load and moves it to the drying queue, hangs 20 pieces and checks them. One piece is marked not dry, so 19 are put away while it keeps drying. The last piece is then checked and put away, and the drying list is empty. Reading the run as the owner, the clean count rises by 19 and then by 20. The 1,000 original piece ids are unchanged, and the run is the same one throughout.
- **Laundry family runtime** (`scripts/review-runtime.check.mjs`):
  - the 1,000-piece seed keeps its original ids across accounts;
  - private pieces are hidden from the member, and the other account has no access;
  - a page acting as a switched-away account is refused;
  - a durable run resumes its effects after a restart;
  - the full day (50 loads through planning, preparation, washing, partial drying and put-away) ends with all 1,000 pieces clean, without replacing ids.
- **Towel** (`e2e/review-towel-runtime.spec.ts`): both branches (new and pre-owned) capture real inputs, save through the app and replay from a fresh seed. Proposal commands share the tape and replay without discarding the draft. A failed save keeps its draft and replays the successful retry. Snapshots of portalled screens are real.
- **Outside Laundry:**
  - **Team board**, run service: account switching, refusing a stale page, the clock, durable resume, leases, refusing changed source, no credential in the journal. A write runs once per identity across a reopen and only for its account; identical posts stay separate.
  - **Team board**, browser: account switch; offline write kept as a saved step and hidden from the other account; nothing resent on reconnect; manual resend; viewport, rotation, theme and text steps; replay; reopen. Then a post whose answer is dropped after the run executed it: reconnect, resend and reopen give exactly one post, and two deliberate identical posts stay two.
  - **Tasks** (HTTP), **Reading list** (TanStack Start server functions) and **Notebook** keep passing their existing checks.

## Skips, failures and limits

- **No failing check is baselined or skipped.** `review-family.spec.ts` was replaced by v11's `review-family-runtime.spec.ts`, because the family scenarios no longer use the simulated preview it tested.
- **Scope of the drying and put-away browser check.** It covers one load of 20 pieces in one group, so the not-dry piece is set with a quantity stepper ("Fewer dry"). It does not cover:
  - a grouped ×2 sequence or singleton checkboxes;
  - label instructions to acknowledge (none appeared for this load);
  - a put-away selection that leaves some dry pieces unselected, as opposed to a piece that is still damp;
  - search or paging;
  - extra minutes asked for a damp check after the end;
  - asserting that the wash session completes only after the last piece, or `inLoad` and `washCount` per piece.

  The 50-load, 1,000-piece day is still proven by the runtime check alone, not by a browser. The coverage contract's family expectation ("100, 500 and 1000 items") is no longer reported as a gap, because each of its scenarios now has a passing run. That is per scenario; the 100- and 500-item sizes have no run of their own.
- **Laundry's product suite, only in part.** Most product specs sign in through a local Convex backend. This environment cannot get one: the network policy blocks the backend's download from GitHub, and starting Docker is not allowed. So:
  - **Run:** the 13 spec files that open design specimens. They are listed in the results table, with `main` run the same way for comparison.
  - **Fixed:** v11 moved the sheet's "Discard your changes?" question into its own modal dialog and dropped its five-second auto-dismissal. Eight specs on this branch failed only for that reason, or, in one case, because a spec focused a footer before the reloaded page was ready. They now pass.
  - **Changed but not run:** 12 backend-dependent spec files looked for Keep editing or Discard inside the sheet. They now use the dialog in the same way: `catalog-identifier`, `garment-details` (its timeout test now checks that the prompt waits for a choice), `guided-intake`, `ingredient-tags`, `inventory-records`, `journey-report`, `machine-validation`, `material-care-intake`, `outcome-assessments`, `product-record`, `record-editor-sections` and `unified-intake`. These, and every other backend-dependent product spec, still need a run with a local backend.
- **Follow-up after merge:** run the 12 changed backend-dependent spec files, and the rest of Laundry's backend-dependent product suite, against a local Convex backend. Fix any that fail on this dialog; do not skip or baseline them.
- **Web only.** Every check here is web evidence in a synthetic browser run. Device presets are CSS viewports, not physical-device, native, Safari or installed-PWA evidence.
- **The supplement's verification.** Its Claude Design verification (completed with limits, failures `[]`) is static web reference evidence.
- **Separate acceptance stages.** App-owner mobile and PWA acceptance and physical-phone acceptance are their own stages and are not covered.

## Newer Laundry evidence reported afterwards (not part of v11, not CIVIC acceptance)

Taymoor relayed these as additive, separately attributed application and reference status. They are not contents of the frozen v11 or the supplement, and not requests to port product UI.

- **Root refinements on f7ce** (`a0ca50e364cd8e672dcb72d22548444be7075172`, then documentation `c07a7f6`):
  - explicit Add clothes, closable touch search and contained filters;
  - Household tab count badges and a shorter identity hero;
  - Me's View last wash.

  Local Codex reports 37 read-back verified writes. Claude Design imported 34 files at `root-refinement-reference-2026-10-12/`, with 33/33 listed hashes and 15/15 exact React frame receipts.
- **Final Closet correction** (`e841e1951ab4aa30ff74e70a2d90eec5ff695abf`, documentation `5869a72`). It supersedes only `a0ca50e`'s Closet appearance; Household and Me remain current.
  - Width-based collapsed search for mouse and touch, with owner and count inline.
  - The repeated count is omitted below 361px, and the toolbar is one row at 320 and 393.
  - Glance labels are Laundry and Hamper.

  Seven exact React exports and 22 Local Codex writes. Claude Design imported 18 files at `closet-compact-reference-2026-10-12/`, with 17/17 listed hashes and 7/7 HTML and metrics pairs. The Claude renderer cannot reproduce its own 320px frame viewport, so that visual preview limit is separate from the source metrics.
- **Owner-reported checks.** 22 unit tests and 3 focused browser cases pass. Mobile WebKit and installed Chrome Dev PWA checks pass at enlarged text, including offline relaunch and reconnect, on isolated QA 3011 (backend 3230/3231). These are the owner's, not CIVIC's acceptance.
- **Release status, first report.** The prepared build `phone-e841e19-1791844039133111000` was not released. The real frontend, backend and inventory were unchanged. Physical iPhone acceptance, including the sign-in error and Home Screen, was unresolved.
- **Release status, later report (supersedes the first).** The app owner reports these results:
  - a frontend-only cutover to `e841e19`, authorized by a person, with 96 matching assets;
  - the existing backend and its state kept;
  - zero mutations to real inventory;
  - sign-in on the main installed PWA with the usual account passed, once an earlier mismatch between the QA origin and the main origin was clarified;
  - Native Design's release card and `release-status.json` updated and inspected by the owner.

  Physical installed-PWA navigation, search and rotation are still pending. These are application results the owner reported. They are not CIVIC acceptance, and the frozen v11 and its supplement are unchanged.
