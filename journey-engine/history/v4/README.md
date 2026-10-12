# Rehearsal — current project handoff

October 10, 2026, v4. Read [HANDOFF.md](HANDOFF.md) for current state and accepted decisions, [REPORT.md](REPORT.md) for changes since the first ZIP and the researched onboarding/model-light direction, and [PACKAGE-VERIFICATION.md](PACKAGE-VERIFICATION.md) for evidence and limits.

Rehearsal is independent in product direction; this source still depends on Laundry App as its first integration. This bundle adds the latest cross-route bindings, gutter-routed arrows and persistent Compact flows / All screens control to the earlier coverage bridge and canvas. The first ZIP, v2 and v3 remain earlier snapshots.

## Run your extracted copy

The verified local environment has Node 26.10.0, pnpm 12.5.1 and Google Chrome. Earlier full review service checks used Node 24; current live startup and browser reads passed on Node 26. No model provider, design account or real Convex backend is needed for synthetic review.

From this folder, in a new extracted copy:

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

The inventory reads Git HEAD, so the disposable import commit is required. It is not an instruction to commit or reset an existing Laundry checkout. Dependencies are excluded; installation requires registry access or a populated compatible store.

Open `http://127.0.0.1:3010/review`. Read the new `source/.review-data/access-key` locally and enter it on the access screen; do not share it. Existing keys, reviews, candidates and browser drafts are not transferred. This access screen is not generic project onboarding.

If 3010 belongs to another runtime, select a different explicit loopback port:

```sh
WASHCLOSET_REVIEW=1 WASHCLOSET_REVIEW_DESIGN="$PWD/../design/laundry-reference" VITE_CONVEX_URL=http://127.0.0.1:1 VITE_CONVEX_SITE_URL=http://127.0.0.1:1 pnpm --dir apps/web exec vite dev --host 127.0.0.1 --port 3011 --strictPort
```

## Try the current workspace

- App shows compact flow cards by default. Canvas detail → All screens shows all 176 registered thumbnails; panning keeps them readable instead of compressing the entire app into a hairline. The choice persists in your browser.
- Click a sidebar flow to fit its complete horizontal timeline, or an individual screen to focus it. Related flows and alternate branch lanes stack vertically.
- Begin Add a towel at Type to play both ownership branches. `/review?scenario=intake.towel.fabric` focuses Fabric. Play is the default; Inspect shows context and source evidence; Edit tests supported presentation proposals; Review captures frozen state.
- Blue arrows are declared actions, teal labelled paths are branches, dashed gray arrows are returns and orange marks observed towel transitions. Navigation order alone draws no action.
- Inspect exposes 17 curated cross-route bindings with parameters, conditions and return context. Twelve lead to representative specimens; five destination states remain unmapped. Selecting a specimen does not replay its symbolic record parameters.
- Coverage separates 11 explicit expectations from 40 unconfirmed source candidates. Generated briefs, prototypes and React scaffolds are proposals, not delivered Laundry features.

## Verification commands

From `source`:

```sh
pnpm --dir apps/web run check
pnpm --dir apps/web exec vitest run src/review/arrow-routing.test.ts src/review/app-map.test.ts
pnpm --dir apps/web run test:review
```

Use Node 24 to reproduce the earlier full service-test environment. Browser tests write synthetic reviews/proposals and the coverage case can edit the local expectation contract, so run them only against a disposable extracted copy:

```sh
WASHCLOSET_REVIEW_E2E=1 WASHCLOSET_E2E_BASE_URL=http://127.0.0.1:3010 pnpm --dir apps/web exec playwright test e2e/review-canvas.spec.ts --project=isolated --workers=1 --retries=0
```

## Transfer and integrity

`source/` contains the current curated source, Laundry dependencies, tests, lockfile and relevant docs. It is not yet a standalone Rehearsal repository. `design/` preserves the earlier local desktop prototypes, bounded Laundry references and design-skill snapshots. `fixtures/` contains 176 fixed synthetic PNGs. `evidence/` separates current routing/full-detail captures from historical coverage/design proof. `context/` contains source provenance, live verification, exact baseline delta and the verified Git patch.

Use [APPLY-PATCH.md](APPLY-PATCH.md) only if starting from the exact first ZIP. The full ZIP includes updated handoff/evidence assets beyond the source patch. Run `shasum -a 256 -c SHA256SUMS` from this folder to check payload integrity.

Excluded: private stores, credentials, environment files, original Git internals/history, dependencies and personal harness state. Historical `BASELINE-*` and `V3-*` documents retain context; this README and handoff describe the current snapshot. Machine-local paths and old receipts are provenance, not portable runtime configuration or current acceptance.
