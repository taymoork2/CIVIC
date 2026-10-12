# Verification · v6

The final package is tested as an extracted copy, not merely by starting the original worktree. QA host: disposable `/private/tmp/rehearsal-v6-portable-davi2u1d/source`, port3146. It contains no Git history, original connection/store, design directory or agent destination. The server is stopped after checks; dependencies/private QA state are excluded from the ZIP.

## Portable checks

- `pnpm install --offline --frozen-lockfile --ignore-scripts`: 310 cached packages reused, zero downloaded, pnpm12.10.1 / Node26.10.0. Online install was not tested.
- `pnpm --dir apps/web run check`: TypeScript and style checks pass; 1,659 native static utilities compile.
- `pnpm --dir apps/web run test:review`: all32 service checks pass, including read-only paths, project isolation, generated adapters, source fingerprints and cache/history/restart behavior.
- Focused Vitest app-map/app-overview/arrow-routing/review-panel/store: 17 checks pass.
- Eight Chromium cases pass across review-project-picker, review-discovery, review-reminder and review-snapshots. They cover UI creation, inventory-only connection, generated HTML/React, branches/return inputs, frozen captures, native reminder dismissal/focus/exact run and returns, stale image replacement, transient retry, visible-demand loading and cold import recovery.

The generic tests used the manifest-free discovery example, an empty existing-app source folder and the authored Notebook connection, registered only on the disposable host. New generated projects/settings/stores are not included. The default bundled Laundry produced204 scenarios /207 fixture fingerprints, unavailable application HEAD and zero revision HEAD plus actual content hashes. Counts describe this snapshot, not completeness. `context/portable-verification.json` is its structured receipt.

Two first-run issues were found and corrected before final packaging: three Home source bindings still pointed to the old route file; explicit new/old presenter alternatives now resolve both versions. A Vite optimization reload rejected the first preview import; only an unmounted frame retries that failure up to twice. The final browser rerun passes, including an explicitly aborted module import. No live draft is replaced.

## Patch and integrity

The source has924 files. Relative to v5 there are66 additions,142 modifications and no deletions; most product changes are reference-integration updates. `context/since-v5.patch` is binary-compatible, passed `git apply --check`, was actually applied to a fresh copy of v5 source and reproduced every final file hash. `context/patch-verification.json` binds that proof to the patch SHA. Current top-level docs/design/evidence are outside the source patch.

`MANIFEST.json` records payload file hashes/size and source composition. `SHA256SUMS` verifies payload and manifest; it excludes itself. The adjacent ZIP SHA and archive verification receipt bind the final archive. ZIP paths, CRCs, private/dependency/Git exclusions and extracted-file hashes are checked. Original v5 is preserved in the historical archive; older expanded directories are removed only after proving they match their preserved ZIP, or storing divergent content separately.

## Evidence and limits

`evidence/portable/` contains fresh default-reminder and onboarding captures from the extracted source. `evidence/current/` retains the earlier October11 toolbar/narrow layout and linked-reminder inspection; these are contextual, not blanket proof of every final pixel/state. `design/` retains historical proposals/skills. The completed local text critique is documented in source/docs/design/review-product/project-discovery.md; no new Claude Design web artifact or final visual-fidelity approval is claimed.

No production backend, physical phone/VoiceOver, public exposure, clean online install, universal framework adapter, per-user multiplayer or full standalone extraction was tested. The owner's timed badge exception and concurrent backend deadline retain their separate owner evidence. Historical snapshot GC was not added because reviews may still reference those captures.
