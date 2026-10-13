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
- **Workspace checks.** Two failed after the v11 sync:
  - the drawer check opened the family screens, which are now live screens, not drawers;
  - v11's sheet shows its discard prompt as its own alert dialog.

  The checks now skip runtime screens and answer that dialog. The behaviour checked is the same.

## Results

Every result below is from this branch. The commit named is the one the checked code was at. `dd967b8` adds only evidence files to `4984688`.

| Command | Commit | Result |
|---|---|---|
| `pnpm --dir packages/canvas exec tsc --noEmit` | `dd967b8` | clean |
| `pnpm --dir packages/canvas test` (vitest, then the run service, server function and canvas host checks) | `dd967b8` | vitest 17/17; host 17/17 |
| `pnpm --dir apps/web exec tsc --noEmit` | `dd967b8` | clean |
| `pnpm --dir apps/web run test:review` | `dd967b8` | 28/28, shell server 12/12, vite connector 11/11 |
| `pnpm --dir apps/web exec vitest run` | `dd967b8` | 97 files, 845/845 |
| `pnpm --dir convex exec vitest run` | `dd967b8` | 51 files, 479/479 |
| `WASHCLOSET_REVIEW_E2E=1 node projects/laundry/capture.ts http://127.0.0.1:3010` (Playwright: family runtime, reminder, route states, runtime, towel runtime, workspace) | `4984688` | 35/35, 0 skipped, 0 flaky |
| `playwright test e2e/review-snapshots.spec.ts e2e/review-canvas.spec.ts --project=isolated --workers=1 --retries=0` | `dd967b8` | 8/8 |
| `node projects/laundry/build.ts` | `dd967b8` | 294 records, 35 tests, 0 failing |
| `bin/signoff --no-post` | see the PR | recorded in the PR |

What these cover:

- **Laundry family laundry day** (`e2e/review-family-runtime.spec.ts`, from v11):
  - a private 1,000-piece run starts;
  - owner, member and other accounts switch in the same run;
  - a browser offline event (`context.setOffline`) disconnects the run;
  - a write made offline is kept as a saved step for its account only and hidden from the others;
  - reopening keeps the run offline until a person reconnects, and nothing is resent by itself;
  - the app's own resend settles the saved step, and the write's effect is confirmed in the run;
  - seven device presets, rotation, fold, unfold, dark theme and enlarged text resize the real frame without leaving the run or losing the selection;
  - replay verifies, and reopening restores the viewport.
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
- **Open coverage gap (advisory, not baselined).** `family.drying` and `family.putaway` have no browser run. v11's family browser spec walks planning and washing. Drying and put-away are proven only by the runtime check above, which is not a Playwright run, so the Laundry graph now reports 12 of 13 declared expectations as gaps, up from 11.
- **A race in the canvas frame (still exists, fixed nowhere).** The frame checks a screen change against state it publishes a moment later, so a very fast click can fail. It failed the Tasks example's browser check once during a full canvas run and passed 5 of 5 reruns. The same code path is on main, and this port did not change it.
- **Not run here:** Laundry's own product end-to-end suite outside the review specs, including `a8-preview`, `garment-details` and the other product specs, and `bin/signoff --browser`. The v11 sheet change (the discard prompt as its own dialog) may affect product specs that look inside the sheet.
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
