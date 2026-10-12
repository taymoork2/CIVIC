# Package verification — October 10, 2026

This bundle contains the current curated Rehearsal source, its Laundry App integration example, historical design context, the change report and current fixed synthetic thumbnails. It is not a framework-neutral Rehearsal release.

## Passed

- Verified the original ZIP CRC and all original manifest payload hashes before comparison. Its SHA-256 remains `fb1738009443993ef0dc9d7b059973747d8f9556fe54c6e9d46e997c89fca5ad`.
- Generated the Git patch in a disposable import of that exact original source. `git apply --check` and actual application passed on a separate fresh extraction. All 23 resulting changed-path hashes match current source. See `context/rehearsal-since-first-zip-PATCH-VERIFICATION.json`.
- Tested the packaged source in a disposable extraction with its own temporary Git repository, local access key and synthetic store. No application backend or model provider was used.
- Web TypeScript checking and style checking passed; the style check inspected 1,591 utility candidates.
- Eight focused test files passed: **66 tests**, covering Rehearsal, intake and design preview behavior.
- Node 24 API/inventory/coverage checks passed: **9 tests**.
- Chromium coverage test passed: **1 test**, including candidate editing/testing/persistence, retained intake draft, unpublished-edit protection, expectation write-back and watched refresh. Its expectation mutation stayed in the disposable copy.
- Two additional Chromium canvas cases passed after the owner-reported hairline fix: overview/flow/screen navigation retains the live draft through Review/Edit; all overview thumbnails render, related flows and the dye branch are vertically separated, split/rejoin arrows remain, and the 488px canvas pans at usable scale. See `evidence/app-overview-qa.png`, `evidence/towel-branches-qa.png` and `evidence/app-overview-narrow-qa.png`.
- Authenticated reads served **all 176 cached fixture PNGs**; every response matched its cached file hash and returned the correct fixture revision. See `context/package-cache-verification.json`.
- Inspected the new synthetic browser capture included at `evidence/coverage-package-qa-2026-10-10.png`.
- The temporary review server on port 3143 was stopped. The existing user preview on port 3010 was left alone. The original checkout was not staged, committed, reset or modified by package tests.

## Packaging checks

The finalizer checks every packaged source file against the current checkout, except the deliberately portable root `AGENTS.md` and `CLAUDE.md`. It rejects private stores, environment files, dependency directories, Git data and symlinks; checks that the original access key is absent; and scans bounded credential patterns. This is not a forensic secret audit.

`MANIFEST.json` and `SHA256SUMS` describe the final payload. The external `rehearsal-handoff-2026-10-10-v3-ARCHIVE-VERIFICATION.json` confirms ZIP integrity, manifest hashes, source fidelity and preservation of the original archive. The ZIP hash is in the adjacent `.zip.sha256` file.

## Test setup and limits

Dependency trees were reused from the earlier verified package installation after confirming the lockfile was identical. A new cold `pnpm install` was not performed. An initial setup using dependency symlinks outside the disposable project failed because the isolated review plugin correctly refused an outside-root Vite module. Replacing those symlinks with contained dependency trees made the browser test pass; the application allowlist was not widened. Earlier pnpm script invocations warned while attempting to reconcile those symlinks; only completed checks are counted above.

The disposable test copy was updated with the canvas correction before the canvas checks. The final report/product/evidence wording edits change documentation only; the Git patch was regenerated and verified afterward. The finalizer checks the final report/source copies for byte equality. The first overview check exposed a zero-height wrapper, which was fixed. A narrow test then needed to close the deliberately retained navigation overlay before clicking the canvas controls; the corrected cases pass.

No new native/device acceptance, complete Laundry journey execution, second-project integration, generic onboarding, multiplayer, automatic design-tool round trip, Tester Army trial or cold dependency installation is claimed. The old broad review-validation receipt remains historical/stale, as described in the report. Future adoption tools and provider-off benchmarks are proposals, not delivered features.
