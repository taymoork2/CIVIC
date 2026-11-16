# Sign-off

Local checks for an exact Git commit, with reusable check results,
an optional area map, and a live status view. Requires Node 26.13.1 or later and Git.
Nothing is pushed. GitHub is contacted only with an explicit `--post` invocation.

## Project configuration

Commit `.signoff.json` on `main` before using the runner on a work branch:

```json
{
  "checks": [
    { "name": "check", "argv": ["pnpm", "check"] },
    { "name": "test", "argv": ["pnpm", "test"] },
    { "name": "build", "argv": ["pnpm", "build"] }
  ]
}
```

`checks` contains 1–32 checks with unique names. Each has an argv array (no shell
evaluation), optional repository-relative `cwd`, optional literal path prefixes
in `paths`, and an optional `timeoutMs` (positive integer, at most 24 hours).
Leading `NAME=value` argv words set environment variables. A check without
`paths` covers the whole tracked tree. `signoffOnly` is accepted for compatibility
with Orca's landing manifest; every configured check is eligible for sign-off.

The optional `areaMap` has the same shape as Orca's existing domain file:

```json
{
  "checks": [
    { "name": "check", "argv": ["pnpm", "check"] },
    { "name": "test", "argv": ["pnpm", "test"] }
  ],
  "areaMap": {
    "broad": ["src/"],
    "domains": [
      { "name": "docs", "match": "\\.md$", "checks": ["check"] },
      { "name": "source", "match": "^src/", "checks": "all" }
    ]
  }
}
```

The first matching domain for each changed file selects checks; an unknown file
keeps all eligible checks. Narrow check paths also select their checks. Existing
Orca maps can capture `(?<area>...)` to select `src/core/` test shards. Omitting the
map runs every check whose paths match. `--all` ignores only the area map.
Configuration is always read from `main`, including during `--verify`, so a work
branch cannot weaken its own checks. A config change on main invalidates records.

## Entry points

In another workspace, copy this package and use a root script like:

```ts
import { signoffMain } from "../packages/signoff/src/signoff.ts";
await signoffMain();
```

Run it from the repository root. Orca retains `node scripts/signoff.ts` and its
existing hooks through adapters that point to `.orca/landing.json` and
`.orca/signoff-domains.json`; those files do not need to be combined.

```sh
node scripts/signoff.ts --dry-run
node scripts/signoff.ts --fresh
node scripts/signoff.ts --all
node scripts/signoff.ts --verify <sha>
node scripts/signoff.ts --watch
node scripts/signoff.ts --post
```

`--dry-run` writes nothing. `--fresh` disables result reuse and the task cache.
`--post` is the owner's explicit authorization to call `gh api` and record a
successful `signoff` status for the checked commit. It requires an already
authenticated GitHub CLI, refuses test processes and dry runs, and never pushes,
fetches, changes protection rules, or comments on a PR. Posting failure leaves the
local result intact and exits unsuccessfully. Tests never invoke GitHub.

A project that sets `"typedCommits": true` in its sign-off config has its commit titles after `main` checked before any check runs; other projects keep their own commit style. The exported `commitTypeMain`
supports a commit-msg hook. `statusMain` supports the separate status script and
the existing queued/held declarations. Results, fingerprints, logs, progress and
bounded cache files live in the Git common directory under `orca-signoff`, a
retained name so existing Orca records still work. This is local owner evidence,
not a signed attestation against a hostile owner process.

Fingerprints use Git content hashes and retain path-to-content validation. A move
outside a check's declared inputs can reuse its pass; moving an input reruns the
check, because paths affect imports and test discovery. Without a complete import
proof, shared scripts/configs remain inputs to every check. Dry-run reports
`reuse: same content as <sha>`.
Existing path-bound pass files and sign-off records remain readable.

When TypeScript 7 is already installed, one Git-backed module graph can prove
dependencies of literal Node commands, Node test lists, workspace Vite+ unit
commands, and Playwright commands. A complete proof binds discovery paths, every
resolved import and its content, package/TypeScript context, runner configuration,
setup/reporters, fixtures, lockfiles, tool versions and hashed environment values.
It replaces broad shared invalidation only for that command. Dynamic imports,
runtime I/O, plugins, aliases or exports with unproved runtime semantics, unknown
commands and missing tooling retain the original fingerprint and full command.
Browser proofs also include application/server code; unknown dependencies there
keep the entire browser check. No dependency is installed automatically.

For a complete test proof, passing files earn separate bounded cache entries.
Later runs execute only files without matching evidence and preserve the existing
shards, serial parts, browser lane and worker limits. Discovery changes invalidate
all file evidence, so new, renamed and removed tests cannot inherit another test's
pass. A failed or stopped check earns no new file passes. Old broad cache entries
cannot seed stronger graph evidence. `--fresh` bypasses both caches; `--all` keeps
its existing area-map meaning, and `--verify` retains its record contract.

Dry-run explains each graph reuse with `not affected: no import path from ...`
and prints each file decision and proof key. Closure evidence lives beside passes
in `proof-v1`, is pruned with them, and contains no environment values. Graph
failure is reported as `dependency proof unavailable`, with the original command
and reuse behavior preserved. The separate direct-import preflight only changes
execution order; it never supplies omission evidence.

A check that passes only on its one rerun is recorded as `flaky: true`, alongside
the existing `passed` state and `rerun` flag. Results and both status views show
the warning. Cached reuse retains it even after the original record is pruned.
This identifies flaky checks; arbitrary command output does not reliably identify
individual tests. The rerun policy and exact-commit verification are unchanged.

## Vite+ and related tests

Plain commands run sequentially; Playwright commands have their own browser lane.
To use Vite+ tasks, set `"vite": true` in the config and register the same checks
with `landingTasks(config.checks)` from the `./tasks` export in `vite.config.ts`.
The runner uses the project's `node_modules/.bin/vp` when present and otherwise
runs the commands directly. A mismatched candidate task definition is bypassed.
The cache is enabled only when Git sign-off storage lies outside the checkout;
every cache key includes the sign-off fingerprint and remote cache is disabled.

Set `"relatedTests": true` only for pnpm/Vitest workspaces using
`apps/*/src` and `packages/*/src`. Changed tests and tests directly importing changed
files run first, with at most 40 files and one worker per command. Orca's adapter
also supplies its server package and serial test file list to preserve its
existing crash/process test lanes. Neither convention is required for plain
command projects.

## Adoption notes

- CIVIC: express each graph/review/crawl/importer/demo/package gate as argv with
  its `cwd`, retaining its temporary-root wrapper and project-specific civic gate.
  Include browser evidence as a configured check when required; posting becomes
  explicit `--post`, while civic statuses and PR comments remain CIVIC's concern.
- laundry-app: use the three-check config above for `pnpm check`, `pnpm test`,
  then `pnpm build`, with no area map or Vite+ requirement. Its separate browser
  gate stays separate unless deliberately added to the checklist.

This workspace package is source-distributed and private; registry publishing,
bundled JavaScript, and adoption in either reference repository are separate work.

Orca's local landing gate runs the same adapter in an owner process against the
signed merge commit, in a private landing copy. Confined checks run first; final
sign-offs share one engine-wide lane and use check admission. Progress comes from
these records, and publication verifies the exact commit again before moving main.
Engine interruption aborts the runner; restart retains passed check fingerprints
and reruns the gate before publication. The programmatic `signal` option cancels
active checks and waits for their process groups to stop.

Copied from Orca commit 502603d41 (packages/signoff); re-sync from that source.
Production source is unchanged. Tests use CIVIC's temporary-root wrapper, local test helper and installed workspace tools instead of Orca's repository paths.
