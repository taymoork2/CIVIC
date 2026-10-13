# CIVIC review in Laundry

[Decision 0010](../../docs/decisions/0010-laundry-depends-on-civic.md): Laundry depends on CIVIC, not the other way round. Laundry's repository, [taymoork2/washcloset](https://github.com/taymoork2/washcloset), carries its own review adapter and installs CIVIC's packages from git, pinned to a CIVIC commit ([washcloset#57](https://github.com/taymoork2/washcloset/pull/57)). CIVIC keeps no copy of Laundry. The copy that lived in `journey-engine/source`, and `bin/civic-laundry` that attached it to a checkout, were removed in step 6.

## Running review on a Laundry checkout

You need Node.js 22 or newer, pnpm 12.5.1 and Google Chrome. CIVIC is private, so `pnpm install` needs GitHub credentials that can read it.

```sh
cd ~/code/washcloset && pnpm install
pnpm --dir apps/web review                                  # http://127.0.0.1:3010/review
PORT=3011 pnpm --dir apps/web review                        # another worktree, side by side
```

Each worktree gets its own review store (`.review-data/`). Notes and work requests go to CIVIC's shared store in Laundry's git common directory (D39), so every worktree of the same clone sees them. Sharing them with `civic` commands needs `CIVIC_ROOT` set to a CIVIC checkout, because a git install doesn't carry CIVIC's CLI.

To move to a newer CIVIC, change the commit in the `@civic/*` entries of `apps/web/package.json` and run `pnpm install`.

## Laundry's review checks and tests

From the Laundry checkout:

```sh
pnpm --dir apps/web test:review                             # adapter, inventory and server checks
cd apps/web && WASHCLOSET_REVIEW_E2E=1 WASHCLOSET_E2E_BASE_URL=http://127.0.0.1:3010 npx playwright test e2e/review-*.spec.ts --project=isolated --workers=1
```

## Laundry's graph in CIVIC

[`projects/laundry`](../../projects/laundry) builds Laundry's CIVIC graph from inputs captured in a Laundry checkout: `LAUNDRY_CHECKOUT=<path> node projects/laundry/capture.ts` while Laundry's review server runs, then `node projects/laundry/build.ts`. With `LAUNDRY_CHECKOUT` set, `bin/civic check` also says whether Laundry's code has changed since the evidence was captured.
