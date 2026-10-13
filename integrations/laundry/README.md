# CIVIC on your own Laundry checkout

[Decision 0010](../../docs/decisions/0010-laundry-depends-on-civic.md): Laundry depends on CIVIC, not the other way round. `bin/civic-laundry` runs CIVIC's journey canvas on any Laundry checkout, on any branch or worktree, so review works on the code you're actually changing instead of the copy of Laundry in `journey-engine/source`.

## Once per CIVIC checkout

You need Node.js 22 or newer, pnpm 12.5.1 and Google Chrome.

```sh
git clone https://github.com/taymoork2/CIVIC.git && cd CIVIC     # or: git pull
(cd packages && pnpm install --frozen-lockfile)        # CIVIC's packages and their dependencies
```

## Once per Laundry checkout or worktree

```sh
(cd ~/code/washcloset && pnpm install)                  # Laundry's own dependencies, if not already installed
bin/civic-laundry attach ~/code/washcloset              # from the CIVIC checkout
```

`attach` does three things:

- **Copies Laundry's adapter in.** That's `civic.project.json`, `apps/web/src/review/`, `apps/web/scripts/review-*.mjs`, the `apps/web/e2e/review-*.spec.ts` specs, `docs/design/review-product/`, and `apps/web/vite.review.config.ts`, which starts from Laundry's own `vite.config.ts`. They're new files on the branch, Laundry's to commit or leave untracked. It never touches a file with uncommitted changes. If the branch already tracks an older review adapter, it stops and lists those files, and `--replace` takes CIVIC's versions (git keeps the old ones).
- **Links CIVIC's packages.** `@civic/canvas`, `@civic/shell` and `@civic/vite-connector` are linked from this CIVIC checkout into `apps/web/node_modules/@civic`. Laundry's `package.json`, lockfile and `vite.config.ts` aren't changed, and production builds never load CIVIC.
- **Prepares review data.** It keeps review's working data (`.review-data/`) out of `git status`, and copies the fixture snapshots there.

Review notes are written as the checkout's git `user.email`, so set one if the checkout has none.

## Running review

```sh
bin/civic-laundry review ~/code/washcloset                       # http://127.0.0.1:3010/review
bin/civic-laundry review ~/code/washcloset-main --port 3011      # a second worktree, side by side
```

Each worktree gets its own server, review store (`.review-data/`) and fixtures. Notes and work requests go to CIVIC's shared store in Laundry's git common directory (D39), so every worktree of the same Laundry clone sees them. `pnpm install` in Laundry removes the links, and `review` puts them back each time it starts.

To pick up a newer CIVIC, run `git pull` in CIVIC, then `attach` again to refresh the adapter.

## Laundry's review tests

From the Laundry checkout, while its review server runs:

```sh
cd apps/web && WASHCLOSET_REVIEW_E2E=1 WASHCLOSET_E2E_BASE_URL=http://127.0.0.1:3010 npx playwright test e2e/review-*.spec.ts --project=isolated --workers=1
```

## Not yet

- The adapter's source of truth is still CIVIC's copy in `journey-engine/source/apps/web`. Once Laundry commits it, Laundry owns it and the copy goes (decision 0010, steps 4 and 6).
- `projects/laundry/capture.ts` still captures Laundry's graph evidence from CIVIC's copy, not from your checkout.
- The packages are linked from a local CIVIC checkout, not installed from git.
