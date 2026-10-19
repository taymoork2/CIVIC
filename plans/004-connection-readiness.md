# Plan 004: Distinguish configured connections from previews that actually work

> Executor: wait for Plans 001–003 to integrate. This plan changes shared connection/preview contracts, so the root controller owns integration and refreshes the baseline first. Read the entire scope and stop conditions before editing.

## Status and drift

- P2; effort M; change risk MED; category correctness/UX; status DONE.
- Implemented at `f5f80ea`. Canvas units (80), host/browser checks (34), connector checks (57), shell server checks (25), local checks (22 passed, two source-gated skips) and package typechecks passed. The installed Orca source resolves the required Effect imports without executing application code. React Doctor's five warnings were reviewed: ordered fixture operations, the four-worker inventory bound and small grouped-list lookups retain their intended behavior. No diagnostic suppressions were added.
- Root reconciled Plans 001–003 before execution. The source-bound capability metadata also crosses `review-project.mjs`, `review-plugin.mjs` and `review-inventory.mjs`; these existing profile/connector seams join this unit's scope. No app-specific adapter names enter the canvas or generic connector. Static resolution checks use the exact runtime snapshot and never import application code or install dependencies.
- Planned at `b99d37b2`, 2026-10-18, plus the recorded viewport working changes. Depends on 001 and 003 (which includes 002).
- Run `rtk git status --short` and `rtk git diff --stat b99d37b2 -- packages/canvas/src packages/vite-connector/src/review-projects.mjs packages/local/orca-worktrees.mjs`. Changes from prerequisite plans are expected; root reconciles them before dispatch. Unexplained drift stops edits.

## Why and current state

`review-projects.mjs:46-51` validates descriptors/scenarios/coverage, then returns a connection with `available: true`. That proves configuration is readable, not that dependencies resolve or a frame mounts. `app-canvas.tsx:42-43` derives broad mode booleans, while `adapter.ts` exposes `preview`, `runtime`, and optional `mode`. The UI can therefore offer a preview whose actual startup later fails.

```js
const kind = row.kind ?? kindOf(p)
return { ...publicProject(p), /* metadata */ available: true }
```

`packages/local/orca-isolated-runtime.mjs:10-12` resolves dependencies from the selected source:

```js
const source = receipt.source, require = createRequire(join(source, 'apps/server/package.json'))
const Effect = require('effect/Effect'), Scope = require('effect/Scope'), Schema = require('effect/Schema')
```

The preceding dogfood encountered a missing `effect/Effect` in a copied worktree. Treat that as a historical reproduction lead, not proof the same checkout is still broken. `orca-worktrees.mjs:43-55` already checks lock compatibility and symlinks pinned dependencies. `frame.tsx` already reports successful mounting with `data-rehearsal-ready` and renders startup errors. Reuse those signals.

## Scope and contract

Edit `packages/vite-connector/src/review-projects.mjs` and its checks; `packages/local/orca-worktrees.mjs`, `orca-worktrees.check.mjs`, `orca-isolated.mjs`, and `orca-isolated.check.mjs`; `packages/canvas/src/adapter.ts`, `frame.tsx`, `app-canvas.tsx`, `project-picker.tsx`, `project-choice.ts`, `run-controls.tsx` and relevant tests. Add a small `packages/canvas/src/connection-readiness.ts` / `.test.ts` for shared UI interpretation if needed. Root owns browser-test registration and generated styles.

Add optional, backwards-compatible readiness metadata: state `unchecked`, `checking`, `ready`, `stale`, `failed`, or `unsupported`, with reason and source fingerprint. Keep configuration availability separate. Ready means the declared check actually ran for that fingerprint. Absence of readiness metadata means unchecked, never verified. Capability flags cover resize/record/replay and remain separate from authorization; unknown capabilities must not enable actions by default.

Do not merge read-only observation with isolated execution. A runtime entry alone does not prove replay support: the Orca isolated adapter explicitly refuses protocol replay. Do not change manifest formats, stable keys, backend allowlists, model/provider policy, source checkouts, or historical recordings. Existing consumers may ignore the additive fields safely.

## Steps and gates

1. Extend connector fixtures with configured-but-missing-entry/dependency cases and stale fingerprints. Add UI interpretation tests for unchecked/unsupported/failed, read-only, replay-unsupported isolated adapters, and old responses without metadata. No app code executes during list/search.
   - Gate: `rtk node --test packages/vite-connector/src/review-projects.check.mjs` and `rtk pnpm --dir packages/canvas exec vitest run src/connection-readiness.test.ts`; characterize the missing readiness distinction before implementation.
2. Consolidate static dependency/asset checks in the existing worktree build boundary. Resolve required packages against the exact snapshot used by its runtime; catch missing runtime dependencies before publishing that build as usable. Resolution is read-only and must not install packages or execute a backend. Keep the previous successful build/evidence when checking fails.
   - Gate: `rtk node --test packages/local/orca-worktrees.check.mjs packages/local/orca-isolated.check.mjs`; missing-dependency and previous-build-retention regressions pass. Checks requiring an actual Orca source remain explicitly skipped unless a separately authorized compatible source is supplied.
3. Centralize capability interpretation across picker, Play, inspector, and viewport. Disable unsupported actions with a concise reason; avoid another permanent status toolbar. Expose failed/unchecked state accurately. Do not start health probes for every row or every poll: use bounded checks for the selected build and actual frame startup.
   - Gate: `rtk pnpm --dir packages/canvas run check` and `rtk pnpm --dir packages/canvas exec vitest run` pass; Plan 003's loading-budget tests still pass.
4. Connect existing frame success/error events to current-session readiness. Accept only messages/events from the expected iframe and matching project/source; discard stale successes from replaced frames. Actual mount success proves the preview, not every backend behavior. It cannot erase previously frozen evidence or certify replay. Add browser cases to the root-owned picker/viewport suites for success, broken startup, retry, source change, and replaced frame.
   - Gate: `rtk pnpm --dir packages/canvas run test:host`, `rtk pnpm --dir packages/shell run test:server`, and `rtk pnpm --dir packages/local test` pass. Read-only refusal and isolated-write boundary checks remain enabled.

## Done / stop / maintenance

- [x] A configured but unstartable connection is never labelled verified/ready.
- [x] Readiness is source-bound; unsupported replay/resize is explained consistently at every entry point.
- [x] No eager list-wide runtime startup, external source write, production mutation, or new model call occurs.
- [x] Existing keys, review files, journals, connection grouping, and last successful build are retained byte-for-byte where applicable.

Branch suggestion `fix/connection-readiness`; Conventional Commit example `fix(preview): report source-bound connection readiness`. No push/merge without execution authority. Stop if resolution requires installing into Orca, if a check would invoke providers/host commands, or if unknown capabilities can only be inferred by unsafe execution. Keep evidence of configuration, preview startup, and authored behavior verification as distinct claims.
