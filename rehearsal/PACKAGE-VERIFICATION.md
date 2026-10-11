# Verification for the v4 snapshot

The bundle contains current curated source, its Laundry adapter, cumulative report, historical design context, 176 fixed synthetic screen captures and the verified first-ZIP patch. It is not an extracted framework-neutral release.

## Current live-preview checks

Port 3010 had no listener before launch. The current checkout was started explicitly at the user's request with the isolated synthetic review environment and no real Convex endpoint. It remains running at capture time.

Authenticated inventory reads passed on Node 26.10.0 and identify source `e514dbcd8ee04808602f81432455f43b0f43f233752e05f78c5d289edf55bb77`: 173 scenarios, 176 mapped screen states and 17 route bindings (12 representative targets, five unmapped destination states).

All 176 cached PNG responses matched their on-disk hashes and fixture identity `81d9c3604c5ba4b876a8d71f7fdf351fa3a16dea938dd7248f2f511741c3fc85`. A fresh Chrome context verified Fabric, Inspect, App and All screens, with no page errors. It did not write feedback, proposals or expectations, or alter the user's existing browser draft. See `context/rehearsal-live-3010-v4-VERIFICATION.json` and `evidence/rehearsal-live-3010-v4.png`.

## Latest implementation proof retained from the preceding pass

- Types and styles passed; 1,591 utility candidates were checked.
- Six focused routing/map tests passed, covering card avoidance, distinct gutters, blocked endpoints, horizontal/vertical geometry and declared action connections.
- Six inventory/coverage checks passed.
- Four isolated Chrome canvas cases passed without retries: retained live input through navigation/Review/Edit, visible separate branches, route parameters/return context/unmapped states, all 176 thumbnails, setting persistence and narrow panning.
- Desktop overview, towel branches and desktop/narrow All screens captures were inspected in two bounded rounds. See `evidence/app-overview-qa.png`, `towel-branches-qa.png`, `all-screens-qa.png` and `all-screens-narrow-qa.png`.

Those checks used a disposable copy updated with the current implementation and contained copies of local dependencies. Its coverage-test contract mutation stayed there. They were not repeated against the user's live state. This packaging pass changes documentation only; final source copies are checked byte-for-byte. The older coverage pass's broader 66-test and nine-service-check results remain historical, documented in `V3-PACKAGE-VERIFICATION.md` and build evidence; they are not counted as fresh full-suite proof.

## Patch and archive integrity

The first ZIP's CRC and all payload hashes were verified before comparison. Its SHA-256 remains `fb1738009443993ef0dc9d7b059973747d8f9556fe54c6e9d46e997c89fca5ad`. The v3 archive remains `f4b110d6baee0c70a72d171826d8955be02b7fdd9b128ca9cf4e1aa4fc9c6f31`.

The versioned Git patch was generated in a disposable baseline import. `git apply --check` and actual application passed on a separate fresh extraction; all 27 changed-path hashes matched current source. Original checkout staging, commits and history were not changed. The receipt is in `context/rehearsal-since-first-zip-v4-PATCH-VERIFICATION.json`.

The finalizer checks every source file against the current checkout except portable AGENTS/CLAUDE replacements, rejects symlinks/private stores/dependency and environment paths, checks exact original access-key absence and scans bounded credential patterns. It writes MANIFEST/SHA256SUMS, checks ZIP CRC and every manifest payload hash, and verifies preservation of the first/v3 archives. The adjacent external `rehearsal-handoff-2026-10-10-v4-ARCHIVE-VERIFICATION.json` records results; `.zip.sha256` provides the final archive hash. The secret checks are bounded, not a forensic audit.

## Setup and remaining limits

No cold dependency installation was performed. Dependencies were copied inside the disposable test project after confirming the unchanged lockfile. An earlier outside-root dependency symlink failed the isolated Vite allowlist; the allowlist was not broadened. A later pnpm invocation attempted store reconciliation in that disposable copy and failed offline; contained dependency copies and direct installed binaries were used instead. No original dependency installation was changed.

No fresh full Laundry E2E suite, native/physical-device acceptance, generic onboarding, second-project adapter, multiplayer, whole-app continuous execution, TesterArmy trial or new external design handoff is claimed. Routing avoids cards but does not globally minimize edge crossings. All screens means all registered states; inferred or unmapped paths remain incomplete. Historical design files and stale broad receipts are clearly separate from current application proof.
