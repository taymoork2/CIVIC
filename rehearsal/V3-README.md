# Rehearsal — refreshed project handoff

October 10, 2026, second bundle. Start with [REPORT.md](REPORT.md) for the complete post-ZIP change report, current integration mechanics, proposed onboarding and research into reducing model dependence. Then read [HANDOFF.md](HANDOFF.md) for continuity and source pointers.

**Rehearsal is independent in product direction, but its current implementation is coupled to Laundry App.** The first ZIP already provided the canvas, real towel Play, proposal editing and captured-state Review. This update adds deterministic coverage, repository expectation editing, scaffolds and source-change handling. Generic onboarding and automatic design exchange are proposed, not implemented.

## Full copy or incremental patch

This folder contains the complete refreshed working source. If you already have the original ZIP, use [APPLY-PATCH.md](APPLY-PATCH.md) and the included Git patch instead. The patch covers source changes and the report; the full bundle additionally includes refreshed synthetic thumbnails and packaging/handoff documentation. It contains no original Git history or private review store.

## Run locally

Verified host versions: Node 26.10.0 for Vite/types/browser checks, pnpm 12.5.1 and Google Chrome. Node 24 was used for the service checks; those results do not establish Node 26 service-test compatibility. No model provider, hosted design account or running Convex backend is needed for the synthetic review.

From this folder:

```sh
cd source
git init -b main
git add .
git -c user.name="Rehearsal import" -c user.email="import@localhost" commit -m "chore: import rehearsal handoff"
pnpm install --frozen-lockfile
mkdir -p .review-data/fixtures
cp ../fixtures/*.png .review-data/fixtures/
WASHCLOSET_REVIEW_DESIGN="$PWD/../design/laundry-reference" pnpm --dir apps/web run review
```

The import commit is needed because the inventory reads Git HEAD. Create it only in your extracted copy. Dependency installation needs registry access or a populated store; dependencies are not bundled.

Open `http://127.0.0.1:3010/review`. Read your newly created `source/.review-data/access-key` locally and enter it at the access screen; do not share it. `/review?scenario=intake.towel.fabric` focuses Fabric. Start from Type to play both towel ownership branches. This local access screen is not generic project onboarding.

If 3010 is occupied, start another loopback port explicitly:

```sh
WASHCLOSET_REVIEW=1 WASHCLOSET_REVIEW_DESIGN="$PWD/../design/laundry-reference" VITE_CONVEX_URL=http://127.0.0.1:1 VITE_CONVEX_SITE_URL=http://127.0.0.1:1 pnpm --dir apps/web exec vite dev --host 127.0.0.1 --port 3011 --strictPort
```

Coverage drafts fresh local candidates on startup. The bundle does not carry the original collaborator notes, saved candidates, auth sessions or browser drafts. A generated React scaffold is not a Laundry App feature implementation.

## Checks

From `source`:

```sh
pnpm --dir apps/web run check
pnpm --dir apps/web exec vitest run src/review src/closet/add-clothes.test.tsx src/dev/design-preview.test.ts
pnpm --dir apps/web run test:review
```

Use Node 24 for the final command if reproducing the verified service-test environment. An explicit browser case writes only to its local synthetic store and expectation contract; run it in a disposable copy:

```sh
WASHCLOSET_REVIEW_E2E=1 WASHCLOSET_E2E_BASE_URL=http://127.0.0.1:3010 pnpm --dir apps/web exec playwright test e2e/review-coverage.spec.ts --project=isolated --workers=1 --retries=0
```

See [PACKAGE-VERIFICATION.md](PACKAGE-VERIFICATION.md) for results actually obtained and dependency reuse limits.

## Contents and integrity

- `source/`: current curated working source, adapter dependencies, lockfile, tests and relevant docs; portable contributor instructions replace machine-local ones.
- `REPORT.md`, `HANDOFF.md`, `APPLY-PATCH.md`: changes, onboarding/research plan, continuity and patch application.
- `context/`: exact baseline comparison, Git patch/verification, provenance and historical local instructions. Historical patches are not instructions to apply to an arbitrary checkout.
- `design/`: existing desktop prototypes, bounded Laundry canonical references, proposal images and named design-skill snapshots. No collaborator conversation database or installed connector is included.
- `fixtures/`: all 176 fixed synthetic thumbnails at the current fixture revision.
- `evidence/`: historical baseline captures plus explicitly named October 10 synthetic coverage captures.
- `MANIFEST.json` and `SHA256SUMS`: payload hashes. From this folder, run `shasum -a 256 -c SHA256SUMS` to check them.

Excluded: environment files, credentials, existing review records, Git internals/history, node_modules, build/test runtime output and personal harness state. Original local paths in historical documents are provenance, not portable operating instructions.

The original ZIP remains unchanged. `BASELINE-HANDOFF.md`, `BASELINE-README.md` and `BASELINE-PACKAGE-VERIFICATION.md` preserve its historical context; this README/report/handoff govern the updated snapshot.
