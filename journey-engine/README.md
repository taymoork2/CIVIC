# Rehearsal v7

> **Removed from CIVIC (decision 0010, step 6, 2026-10-13).** This folder keeps the v7 handoff's records only. Its `source/` (CIVIC's copy of Laundry) and `fixtures/` were removed: the engine's packages live in [`packages/`](../packages), and Laundry runs review from its own repository ([integrations/laundry](../integrations/laundry)). The commands below describe the handoff as delivered; git history keeps the files.

Start with [HANDOFF.md](HANDOFF.md), [CHANGES-SINCE-V6.md](CHANGES-SINCE-V6.md), [PACKAGE-VERIFICATION.md](PACKAGE-VERIFICATION.md) and [EXTRACTING-REHEARSAL.md](EXTRACTING-REHEARSAL.md). Rehearsal is its own product; Laundry is the reference integration. Standalone extraction is unfinished.

## Run on a receiving host

```sh
cd source
pnpm install --frozen-lockfile
pnpm --dir apps/web run review
```

Open http://127.0.0.1:3010/review. No review key, account, model provider or running Laundry backend is required. Verification used Node 26.10.0, pnpm 12.10.1 and Chrome. Dependencies are excluded: portable install reused cache with zero downloads; another host needs a compatible cache or registry access. Chrome is needed for snapshots/browser checks. Missing Git identity stays explicit.

Try /review?scenario=intake.towel.fabric. Play, enter fibers, follow either origin branch, and save. Inspect → Recorded run replays/resets or downloads the run. Edit proposal changes copy/color without discarding input. Live reviews attach recordings; fresh replay restores branch/clock and proposal commands. Changed source is refused rather than silently upgrading evidence.

Project picker → Connect existing app → Discover screens → confirm candidates/props/capture fields/paths → Generate preview provides bounded synthetic onboarding. Provider-dependent apps need a declared adapter. The independent Notebook example can start directly:

```sh
REHEARSAL_PROJECT=apps/web/examples/rehearsal-demo/rehearsal.project.json pnpm --dir apps/web run review
```

The discovery example is source/apps/web/examples/discovery-app. Project selection is shared host state, not per-user multiplayer. Do not run two processes on 3010. Disposable previews use another explicit port and REHEARSAL_DATA_DIR.

## Contents and integrity

- source/: current Rehearsal, contracts/examples/config/tests and a hashed Laundry snapshot with checked seams.
- context/: source provenance, seam hashes, exact binary patch/delta from v6 and verification receipts.
- design/: retained local Open Design/Claude Design concepts/skills, historical rather than freshly accepted.
- evidence/historical/: labelled prior canvas captures.
- history/v6/: superseded narrative and verification.

Private stores/reviews, credentials/environment, dependencies, Git, generated user projects, backend/catalogue data, harness destinations and Tailscale settings are excluded. Configure trusted agent sessions explicitly on the receiving host.

Verify with `shasum -a 256 -c SHA256SUMS` at package root. context/since-v6.patch applies only to exact v6 source; use `git apply --check` on a copy. This is a source snapshot, not a deployment/database restore. Towel is the first migrated curated fixture; other fixture adapters remain open.
