# Plan 003: Bound version-picker work as well as visible rows

> Executor: run after Plan 002 integrates. Keep screen/component matching, history ordering, and evidence identities intact. Root owns the index and test-runner edits. Do not concurrently edit the picker with another worker.

## Status and drift

- P1; effort M; risk MED; category performance/correctness; status DONE.
- Reconciled at `8629a50`, after Plans 001/002. Root extends scope to a pure `@civic/shell/version-choices` module and declarations so server pagination and the existing client use the same matching, grouping and history ordering. No React/server dependency is introduced into that module. The browser suite already registered by Plan 002 is extended in place.
- Planned at `b99d37b2`, 2026-10-18; depends on 002. May overlap remaining 001 work because the owned source paths differ.
- Run `rtk git status --short` and `rtk git diff --stat b99d37b2 -- packages/canvas/src/project-picker.tsx packages/canvas/src/project-choice.ts packages/vite-connector/src/review-projects.mjs packages/shell/server/review-server.mjs`. Plan 002's request migration is expected; root refreshes this plan's baseline before dispatch. Stop for unexplained drift.

## Why and current state

The UI caps visible versions with `.slice(0, 10)`, but `project-picker.tsx:90-94` loads every available connection:

```tsx
const missing = currentApp.connections.filter(row => row.available && !draftScreens[`${row.workspace ?? ''}:${row.key}`])
void Promise.allSettled(missing.map(row => request<DraftScreen[]>({ action: 'scenarios', key: row.key, workspace: row.workspace })))
```

`review-projects.mjs:139` returns a full screen inventory. Its `changes` method already rejects more than ten comparison candidates. `project-choice.ts` matches `targetId`, component identity/export, route, and selected state; it can find alternate previews beyond the first hundred. These are contracts to retain. Backend `list()` currently describes all connections and validates their registries, so merely changing the frontend slice will not bound host work.

## Scope and contract

Edit `packages/canvas/src/project-picker.tsx`, `project-choice.ts`, their tests; `packages/vite-connector/src/review-projects.mjs` and `review-projects.check.mjs`; `packages/shell/server/review-server.mjs` and its project-route tests. Add `packages/canvas/server/project-picker.check.mjs` and an inventory/cache helper plus Vitest tests only if needed. Root registers the browser suite in `packages/canvas/package.json`.

Keep the existing project list/add/select/sources/scenarios APIs working for existing callers. Add a cheap catalog action for sidebar app identities and the active connection summary, without validating every app's screen registry. Add a bounded version-page action for the selected app: query, selected stable screen/component identity and state, offset, limit capped at ten. Return lightweight version metadata and matching preview identities, not every project's screen registry. Scope before loading inventories. Cache read-only summaries by connection and source/registry fingerprint so subsequent searches do not reparse unchanged inventories; invalidate on refresh/rebuild. A cold scoped lookup may inspect uncached selected-app registries, with bounded concurrency and cancellation; never describe that as zero-cost or pretend the ten-result limit prevents every first read. No cross-project screen index.

## Steps and verification

1. Extend `review-projects.check.mjs`'s temporary Notebook fixture with 120 connections, including a searched match beyond position 100, one unavailable version, repeated component states, and another app. Instrument inventory reads/comparison calls through a small test seam or fixture adapter. Record the current eager fan-out as the regression.
   - Gate: `rtk node --test packages/vite-connector/src/review-projects.check.mjs`; new budget expectations fail for the intended eager work, not fixture setup.
2. Implement the cheap catalog and scoped page actions and wire them through the existing `/api/review/projects` dispatcher (`review-server.mjs:355-364`). Validate app identity, query length, offset, limit, and selected identity. Preserve authentication/project-conflict checks. Use existing history/version normalization; avoid a second definition of branch ordering. The picker must not call the old eager `list()` first: use catalog metadata for its header/sidebar and the selected-app page for version rows. Keep the old list response compatible for consumers outside the picker.
   - Gate: the connector command passes; `rtk pnpm --dir packages/shell run test:server` passes.
3. Migrate the picker to metadata pages. Do not compute visibility from inventories that have not yet been loaded: server-side scoped matching supplies enough identity to show the row. Fetch full preview details only on expansion, and comparisons only for visible candidates. Abort on close/app/query/source change; do not cache failures as successful empty inventories. Provide an explicit retry for the failed request.
   - Gate: `rtk pnpm --dir packages/canvas run check` and `rtk pnpm --dir packages/canvas exec vitest run src/project-choice.test.ts` pass.
4. Add a real-browser request-budget test in `server/project-picker.check.mjs`: opening shows at most ten rows, does not issue one full scenarios request per connection, expanding requests only the needed detail, search reaches row 119, closing aborts stale work, changing selected component preserves its state, and another app is not indexed. Snapshot feedback/recording fixture bytes before/after navigation to prove they are untouched.
   - Gate: `rtk node --test packages/canvas/server/project-picker.check.mjs`; all cases pass. Root registers this file in `test:host` and runs `rtk pnpm --dir packages/canvas test`.

## Done / stop / maintenance

- [x] 120-connection tests establish bounded concurrency and request/detail budgets, not just ten rendered rows.
- [x] Search and current preview work beyond the first page; design variants and instance grouping remain distinct.
- [x] Existing connector tests, shell server tests, canvas typecheck and browser suite pass.
- [x] Cache keys include source/registry identity; failed/cancelled work never overwrites a newer scope.

Evidence: 78 canvas unit tests, 29 host/browser checks, 17 connector project checks, 25 shell server checks and all package typechecks passed. The cold 120-connection fixture bounds inventory parsing to four concurrent reads in the chosen app; subsequent unchanged searches parse none. A changed registry invalidates its summary, failed parsing retries, and search finds connection 119 with its selected state. The browser issues one page request on open and one detail request on expansion, never the eager list or per-connection scenarios fan-out. Closing aborts pending work; a late result cannot replace reopened scope. Saved feedback/recording fixture bytes remain unchanged.

Use `perf/bounded-version-picker`, with a scoped Conventional Commit such as `perf(canvas): load version details on demand`; publication requires execution authority. Stop if bounding requires deleting evidence, changing stable IDs, executing application code during discovery, or globally indexing other apps. New providers must use the same page contract and invalidate summaries when content changes.
