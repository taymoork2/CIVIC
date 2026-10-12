# Verification — October 11, 2026 · v5

## Current source checks

Executed against the final Rehearsal source in f0d3:

```sh
pnpm --dir apps/web run test:review
pnpm --dir apps/web run check
pnpm --dir apps/web exec vitest run src/review/app-map.test.ts src/review/review-panel.test.ts src/review/store.test.ts
```

Results: **27 service checks**, **14 focused unit checks**, TypeScript and style checks passed. Project-specific checks include non-overwriting/read-only connection, starter creation, catalogue persistence, invalid/escaping/symlink paths, settings retention, invalid scenario/coverage configuration, session/origin protection, old project keys, active-agent switch refusal and restart response ordering.

## Browser proof

Final onboarding tests ran on a disposable source host, port 3145, with its own connection catalogue, review stores, generated project folders and unconfigured example app. They did not change f7ce or select another project on the owner's 3010 preview.

```sh
REHEARSAL_PICKER_E2E=1 \
REHEARSAL_PICKER_APP=/private/tmp/rehearsal-picker-final-rpg4mkgx/existing-app \
REHEARSAL_PICKER_EVIDENCE=/private/tmp/rehearsal-picker-final-rpg4mkgx/evidence \
WASHCLOSET_E2E_BASE_URL=http://127.0.0.1:3145 \
node node_modules/@playwright/test/cli.js test e2e/review-project-picker.spec.ts \
  --project isolated --workers 1 --retries 0
```

**Two tests passed**: invalid-path recovery and connection without app writes; new project creation; actual same-port adapter restart; real branch/return/save retaining inputs; three captured transitions; durable reviews kept separate across switching and retained on return; stale keys refused; phone-width fit, first-field focus, Escape and restored trigger focus. These are Chromium checks, not physical-device acceptance. Recreate the disposable host/folders when rerunning; the literal temporary paths are test provenance.

The linked Laundry continuity test also passed on 3010 with current f7ce code. It verifies the same live draft through app overview/detail navigation, frozen review composition, saved review, saved proposal play and unpublished proposal preservation. Its obsolete fixed node count and old review labels were repaired; assertions now follow the declared inventory and present-day controls.

The live project picker and existing-app form were inspected in Chromium with no page errors. Local `http://127.0.0.1:3010/review` and the existing private HTTPS origin both returned HTTP 200; their index named Laundry App and read-only f7ce. Source inventory updated as the product owner worked. No claim is made about that owner's code or device acceptance beyond this synthetic adapter path.

## Portable copy

A clean copy of the **858 packaged source files** started on port 3146 without Git history or the original host's connection/settings/private store. `pnpm install --offline --frozen-lockfile --ignore-scripts` installed **310 cached declared packages**, downloaded none and completed successfully with pnpm 12.10.1 / Node 26.10.0. Test dependencies were installed into that disposable copy; none is included in the ZIP. A fresh online registry install was not tested.

Its default Laundry integration produced **184 scenarios**, an unavailable application HEAD and a zero revision HEAD plus actual content hashes. The picker listed the bundled connection. Chromium opened the real Fabric screen and accepted a synthetic input, with no page errors. A startup log showed a cancelled-request `ECONNRESET` while browser work ended; the browser functional assertions passed. See `context/portable-verification.json` and `evidence/project-onboarding/portable-fabric.png`.

The live f7ce connection has 199 scenarios / 202 graph nodes because it is a separate, newer product checkout. That checkout and its personal/local backend data are deliberately not included. The archive uses the f0d3 source snapshot, not a portable promise to reach the original host's absolute paths.

## Source patch and archive

`context/since-v4.patch` was checked and actually applied to a disposable copy of the exact v4 source. Every resulting file hash matched all 858 v5 source files. Its SHA and proof are in `context/patch-verification.json`. It is a source patch; new root handoff/evidence assets are supplied by the full ZIP.

The archive includes `MANIFEST.json`, per-file `SHA256SUMS` and a ZIP SHA-256 sidecar. Archive verification checks entry paths, private/dependency/Git exclusions, CRC integrity and extracted payload hashes. The adjacent `rehearsal-handoff-2026-10-11-v5-ARCHIVE-VERIFICATION.json` is the final archive receipt.

## Remaining limits

No physical phone, public deployment, newly completed Claude Design/local desktop critique, production backend, native/framework-specific SDK or generic proposal editing acceptance was performed. Existing app onboarding without a manifest remains inventory-only; author its registry and synthetic adapter for Play. Full standalone extraction and per-user multiplayer project selection remain open. Private harness destinations and Tailscale configuration must be set up on the receiving host.
