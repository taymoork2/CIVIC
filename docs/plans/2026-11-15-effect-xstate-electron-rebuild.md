# Rebuilding CIVIC on Orca's foundations (15 Nov 2026)

## In plain words

The owner asked for four things: CIVIC built the way Orca is (Effect, XState, Electron), CIVIC as an MCP server that agent tools plug into, two new features (find the code behind a selected element, and see which server paths no journey reaches), and a cleanup using what Orca learned.

CIVIC is not rewritten from scratch. Most of it is pure data code (the graph, importers, records) that works and is tested; it stays plain functions. What changes is the part that starts, watches and stops things: previews, the review server, the app server, the desktop window, the MCP server and the request lifecycle. Those move onto Effect (resources that always clean up) and XState (one place that says which move is allowed next).

The order is: first the checks that stop old mistakes coming back, then one install for all of CIVIC, then the shared state-machine kernel and the request machine, then the MCP server, then CIVIC as a project in its own picker, then the two features, then the preview, app-server and desktop lifecycles, then the hand-off between CIVIC and Orca in both directions. Everything moves to Effect 4.1 and XState v6, with every dependency updated, in the first step. Each step lands on its own after its checks pass.

One thing needs the owner (listed at the end): whether the stale Orca preview builds in the live store may be deleted.

## 1. Audit: where CIVIC is today

Grounded at `f749b770` (this branch). Counts are from `grep` over tracked source, not lint output.

| Area | Today | Target | Verdict |
|---|---|---|---|
| Graph, importers, records (`graph/`, `importers/`, `review/src/store.ts`…) | Plain TypeScript, pure functions, `node --test` | Same | **Keep.** No Effect or XState here; a lint rule keeps it that way. `graph/src/validate.ts` (1057 lines) is a later candidate for Effect `Schema` only if it deletes code. |
| Installs | Five separate pnpm installs (`packages/`, `graph/`, `review/`, `importers/`, `crawl/`), each with its own lockfile | One workspace, one lockfile, one `vp run` | **Change** (S3). Two copies of Effect across lockfiles would break type identity, so this comes before Effect leaves `packages/`. |
| Tooling | `tsc` + `vitest` 5 + `node --test`; no linter, no formatter, no hooks | Vite+: `vp lint` (oxlint), `vp fmt`, `vp test`, `vp run` tasks, `vp staged`, `vp hooks` | **Change** (S1). |
| Test lists | Hardcoded in `package.json` scripts (`node --test a.check.mjs b.check.mjs …`) and `packages/local` `check` (12 `node --check` calls); `bin/signoff` names each directory | Derived by glob / from the workspace | **Change** (S1). |
| Review corrections | Written in AGENTS.md, enforced by hand | Lint rules and tests with a baseline that may only shrink | **Change** (S2). 77 `useEffect` in `packages/canvas/src` + `packages/shell/src`; raw timers in 27 files; 0 `vi.mock` (lock it at 0). |
| Request lifecycle (`review/src/loop.ts`, 628 lines) | `open → claimed → fix-ready → resolved/reopened` as `if` checks; records already carry `@version` | XState machine through a pure kernel; the record's version is the compare-and-set | **Change** (S4). Exact match for Orca's durable kernel. |
| Preview launcher (`review/src/preview/launcher.ts`, `state.ts`) | Hand-written start/attach/stop with a registry and pid+start-time checks | Effect scoped processes + XState lifecycle, `after` timers on Effect `Clock` | **Change** (S9). Behaviour (decision 0021) unchanged. |
| Run service (`packages/canvas/server/runtime-service.mjs`) | One worker per run, 8-worker cap, per-run queue, 30 s call timeout, 30 min idle, version-1 journals | Same rules, Effect-owned workers and timers, run machine | **Change** inside the app server (S10). Journal rules stay exactly as the 18 Oct plan lists them. |
| App server | Not built. The launcher owns the Vite server's lifetime. Plan of 18 Oct (`2026-10-18-0515-feat-effect-app-server-lifecycle-plan.md`) is implementation-ready | Effect host with client presence, Electron main as a client | **Build** (S10) from that plan, with pins updated below. |
| Electron (`packages/local/desktop*.mjs`, 148-line main) | Works; needs `CIVIC_ELECTRON_BINARY`; no `electron` dependency; no branch in title; shares one profile | `electron` as a dev dependency, main process as an Effect program, its own profile per worktree | **Change** (S10). |
| MCP server (`review/src/mcp.ts`, 199 lines) | Hand-written stdio JSON-RPC; tool list and JSON schemas typed by hand | Same tools, input schemas derived from Effect `Schema`, new tools for element location and backend coverage | **Change** (S5). Decision 0006 and D35's narrow write path unchanged. |
| Harness integration (`integrations/claude-code`, `.claude-plugin`, `codex.mcp.json`) | Claude Code plugin (skills, hooks, MCP launcher) and a Codex MCP snippet | One MCP server any harness can use; thin per-harness wrappers that only point at it | **Extend** (S11). No per-harness tool lists: the server lists its tools. |
| CIVIC in its own picker | CIVIC reviews itself as the "Isolated CIVIC" workspace via `civic preview`; no `civic.project.json` for CIVIC's screens | A tracked manifest and scenario registry for CIVIC's own screens | **Build** (S6). CIVIC is public, so this is allowed under decision 0010. |
| Live store growth | `.civic-canvas/projects` holds 79 `orca-worktree-*` folders (1.4 GB) | Bounded retention | **Fix the source** (S9b). See §4. |

## 2. Foundations and pins

Owner, 15 Nov: CIVIC targets **Effect 4.1** and **XState v6 beta**, the versions Orca is moving to on its `w/effect-41` branch. That branch did not exist yet when this was written; once it lands, its findings are reused here rather than found again.

Orca's `w/effect-41` (commit `d3b0df96e`, not yet on Orca's main) pins `effect` `^4.1.4`, `xstate` `6.0.0-beta.3` and `@xstate/effect` `1.0.0-beta.2`, exact and paired until the next beta's snapshot compatibility is checked. Its finding: beta.3 cannot statically analyze transition functions, so `transitionTargetsComplete` is false for any `(args, enq) => …` transition and serialization reports a `code-expression` per such transition. Orca pins those diagnostics per machine as baselines that may only shrink (`core/machine/graph-diagnostics.test.ts`). CIVIC's machines are new, so they use object transitions (`{ target, guard, actions }`) with plain guard functions wherever the target is static, and start with empty baselines; a function transition is allowed only with its diagnostic pinned.

- `effect` `^4.1.4` and `@effect/platform-node` `^4.1` (no 4.0 tilde pin and no `platform-node-shared` override; Orca kept those only while it stayed on 4.0). The 4.1 breaking changes that touch CIVIC: crypto moves to `effect/crypto`; `ChildProcess` templates reject shell syntax (preview and signoff process code passes arguments, never a shell string); `KeyValueStore` key format; `NodeCrypto`/`NodeFileSystem` layers. `sql.insert` and `MigratorFileSystem` do not apply (CIVIC has no SQL).
- `xstate` `6.0.0-beta.3` and `@xstate/effect` `1.0.0-beta.2`, exact versions (prereleases), listed in `minimumReleaseAgeExclude`. v6 rules: actions are `(args, enq)` functions, guards are plain functions, no typegen. Any persisted snapshot (for example the desktop window's) goes through `createSnapshotCodec` and `machineVersions`/`migrateSnapshot`; durable request state is the record's own status field, so it needs no snapshot.
- `vite-plus` `^1.6.0`, with `vite` aliased to `npm:@voidzero-dev/vite-plus-core@1.6.0` so every plugin sees one Vite.
- `electron` `^45.3.2` (dev dependency of `packages/local`), `allowBuilds: electron: true`.
- All dependencies updated in the foundation (S1b): `NODE_USE_ENV_PROXY=1 pnpm dlx taze major -r -l`, caret ranges, `pnpm audit` clean or each remaining advisory named; installs only in worktrees. Repeated before each later dependency change.

Where each tool is used:

- **Effect** owns anything with a lifetime: processes, listeners, workers, file watchers, timers, the MCP server, the app server, Electron main. `Context.Service` and layers only where a service earns a boundary (a test swaps it, or two callers share it).
- **XState** decides; it does not execute. Durable lifecycles (requests) use a pure kernel ported from Orca's `core/machine/kernel.ts`: `initial`, `decide` (rejects any effect other than an emitted intent) and `commit` (read, persist with compare-and-set, retry once on conflict). In-process lifecycles (preview, app server, run, desktop window) use `@xstate/effect` actors with `after` timers on Effect `Clock`, tested with `TestClock`.
- **Machine checks are gates** (owner, 15 Nov; [XState v6 agents guide](https://stately.ai/docs/xstate/v6/agents)). Read `node_modules/xstate/docs/agents.md` once installed, and reuse the `xstate` JSON CLI (`validate`, `simulate`, `test`, `replay`, `diff`) and `@xstate/codemod` rather than writing those tools. Each machine's test asserts `analysis.transitionTargetsComplete` and an empty `getMachineSerializationDiagnostics(machine)`. A failing event sequence (from a property test, a graph test or a real bug) is saved as a JSON fixture next to the machine and replayed as a regression test; the fixture list is globbed, never listed by hand.
- **Graph tests** for every machine: `xstate/graph` `getShortestPaths` over a list of events that covers every event the machine declares (the test fails if one is missing), replay each path through the kernel, check terminals accept nothing.
- The kernel lives in a new small package `packages/core` (`@civic/core`): kernel, graph-test helper, and shared Effect services (process, clock-backed scheduling). This replaces the 18 Oct plan's "no core package" (its KTD1), because the request machine (`review/`) and the app server (`packages/canvas`) both need it.

A decision record, `docs/decisions/0022-effect-xstate-electron-foundations.md`, states these boundaries.

## 3. Corrections become checks

Each rule is a lint rule or a test. Where code already breaks a rule, a committed baseline lists today's count per file; the check fails if a count grows, and the baseline is rewritten only downward.

| Rule | How | Baseline today |
|---|---|---|
| No `useEffect` in CIVIC's UI; named hooks for real external sync | oxlint `no-restricted-syntax`/import rule, per-file baseline | 77 |
| No raw `setTimeout`/`setInterval` outside browser UI glue; Effect `Schedule`/`Clock` | oxlint `no-restricted-globals` in server/CLI code | 27 files (verify) |
| No `vi.mock`, no module mocking | oxlint rule | 0, locked |
| Layering: `graph/` and `importers/` import no `effect`, `xstate`, `node:child_process`; browser code imports no `server/`; nothing imports a connected project | architecture test over all tracked source, globbed | measured in S2 |
| Every check runs under `bin/with-temp-root.mjs` | existing `review/test/temp-root.test.ts`, extended to the derived task list | 0 |
| Commit titles typed (`feat:`, `fix:`, `refactor:`…) | `.vite-hooks/commit-msg` + `scripts/commit-type.ts`; `bin/signoff` refuses untyped commits after main | — |
| Pre-commit lints staged files, check only | `vp staged --no-stash`. Entire moves an existing hook to `<hook>.pre-entire` and chains to it, and the Vite+ dispatcher stub resolves the project hook from its own file name, so `.vite-hooks/commit-msg.pre-entire` sources the real hook (Orca `w/hooks-entire`). `core.hooksPath` is absolute, because the generated `.vite-hooks/_` dispatcher exists only in the checkout where `vp hooks enable` ran | — |
| Machine analysis and serialization clean; saved failing sequences replay | per-machine test, fixtures globbed | — |
| Effect language service diagnostics | `@effect/language-service` in `tsconfig` plugins, run in `check` | 0 |
| Short "why"-only comments | review rule in AGENTS.md; anti-slop preset where it applies | — |
| No hardcoded lists of files, scripts or tools | test lists by glob; MCP tool list from one table with `Schema` inputs; sign-off steps from CIVIC's config (§6b) | — |

Tests are end to end and unmocked: real processes, temporary stores, temporary git repositories, Playwright for UI.

## 4. The store leak

The 79 `orca-worktree-*` folders come from the owner's private Orca adapter (`.civic-canvas/private-integrations/runtime/packages/local/orca-worktrees.mjs`, `buildWorktree`). It names a folder per worktree path and adds a new `builds/<hash>-<uuid>` on each change. Nothing removes a folder when its worktree is gone, or old builds once a newer one is published.

That adapter is ignored local storage in the owner's live copy, so it is not edited here. The fix goes in tracked code: a shared retention helper in `packages/local` (keep the newest published build per live worktree and the build a running preview uses; remove builds of worktrees that no longer exist, only inside the store's `projects/` folder, only folders with CIVIC's own receipt), with a test on a temporary store. The adapter then calls it. Adopting it in the adapter and deleting the existing 79 folders need the owner's approval.

## 5. The two features

### Source-to-element (S7)

- **Tagging.** In CIVIC's dev and preview builds, a Vite transform in `packages/vite-connector` adds `data-civic-source="<repo-relative file>:<line>:<column>"` to host JSX elements (React 19 dropped `_debugSource`, so the fiber cannot be relied on). Only for sources the manifest lists; never in a production build. Gui (Apache 2.0) is read for ideas, not depended on.
- **Element → source.** The overlay and canvas selection read the nearest tagged ancestor and show the file and line under "Details". Annotations and work requests store it as an optional `source: { file, line, column, revision }`, so `get_request` hands the agent the file to open.
- **Source → elements.** `civic elements <file>[:<from>-<to>]` and an MCP tool return the scenarios and elements a file or line range renders, from a capture's tagged DOM. A diff maps its hunks to line ranges and highlights those elements on the canvas.
- First on CIVIC's own screens (needs S6), then the synthetic examples; Orca and Laundry stay local, owner-run checks.

### Backend coverage (S8)

- **Inventory, derived.** The server-functions transform (`packages/canvas/server/server-functions.mjs`) already sees every `createServerFn`; it writes the list of server operations per project (file, export, method). A project adapter that serves HTTP routes or RPCs reports its own list through the manifest's adapter, not by hand.
- **Reached, derived.** Tapes already record the operations each step made (decision 0009). An importer reads saved tapes and replays into "journey → operations reached".
- **Report.** The coverage panel gets a server section: per journey, the operations it reaches; overall, the operations no journey reaches. `civic coverage --backend` and an MCP tool give the same. Only replays that passed count; a diverged tape counts up to the step it diverged at.

## 5b. CIVIC and Orca, both ways (S11b)

Owner, 15 Nov. Orca treats CIVIC as an outside integration it hands work to, as it treats Gui. CIVIC side: generic tools any coordinator can use, so CIVIC holds no Orca internals and names no Orca type. Orca is the first coordinator. CIVIC still makes no model calls and starts no agents; starting its own preview of a worktree is CIVIC's own work, as `civic preview` already does.

### Shared shapes

```ts
// A coordinator's work item, opaque to CIVIC. `system` is whatever the coordinator calls itself.
type WorkRef = { system: string; id: string; url?: string }

type ScreenRef = { project: string; scenario: string; journey?: string; route?: string }
type Shot = { viewport: 1440 | 390 | number; theme: 'light' | 'dark' }

type ChangedScreens = {
  revision: string; base: string
  screens: Array<ScreenRef & { because: Array<{ file: string; lines?: [number, number] }> }>
  limits: string[]          // e.g. files no capture renders, so no screen could be named
}

type ReviewSession = {
  id: string; workRef: WorkRef; line: string; revision: string
  link: string              // what the owner opens; loopback /review of that worktree's preview
  screens: Array<ScreenRef & { shots: Shot[] }>
}

type Coverage = {
  project: string; revision: string; evidenceAt: string
  screens: { total: number; covered: number; uncovered: ScreenRef[] }
  journeys: Array<{ id: string; screens: string[]; lastReplay: 'passed' | 'diverged' | 'none'; divergedAt?: number }>
  backend: {
    operations: Array<{ id: string; file: string; export: string; kind: 'server-function' | 'route' | 'rpc'; reachedBy: string[] }>
    unreached: string[]     // operation ids no passing replay reaches
  }
}
```

Work requests gain `links: WorkRef[]`. An annotation made in a review session carries that session's `workRef`, so the request it becomes is linked from birth.

### MCP surface

| Kind | Name | Input | Returns | Writes |
|---|---|---|---|---|
| tool | `changed_screens` | `cwd`, `base` | `ChangedScreens` (source-to-element reverse map over the diff, plus journeys through those screens) | nothing |
| tool | `open_review` | `cwd`, `workRef`, `screens?` (default: `changed_screens`), `shots?` (default 1440 and 390, light and dark) | `ReviewSession` | starts or attaches that worktree's preview; no record |
| tool | `close_review` | `id` | — | stops the preview it started, by recorded process only |
| tool | `link_request` | request `id@version`, `workRef` | the request | adds one link; nothing else |
| tool | `list_requests` (existing) | adds `workRef?` filter | as today | nothing |
| tool | `coverage` | `cwd` or `project` | `Coverage` | nothing |
| resource | `civic://requests?system=…&id=…` | subscribable | requests linked to that work item | — |
| resource | `civic://coverage/{project}` | subscribable | `Coverage` | — |

Resource changes go out as `notifications/resources/updated`, so a coordinator waits on a notice instead of polling. The D35 write path is unchanged: `open_review` and `link_request` write no review outcome, and no coordinator or agent can resolve a request, accept a check or annotate on the owner's behalf.

### The three flows

1. **Orca asks for a review.** Orca calls `open_review` for a work item's worktree. The owner opens the link, comments, and each comment becomes a request linked to that work item. Orca hears it through the `civic://requests` resource and puts it on the work item.
2. **A CIVIC request becomes Orca work.** For a project Orca manages, Orca lists open requests, creates a work item from `get_request`'s work order, and calls `link_request`. Its agent then claims and reports through the existing tools.
3. **Orca's agents read coverage.** Through Orca's MCP gateway, agents call `coverage` (screens, journeys and backend) for the worktree they are in.

### Proposal for the Orca controller

Not built here; Orca is read-only for this work. In Orca's integration settings, register CIVIC's MCP server (`civic-mcp` over stdio, or the plugin's launcher). Add a "Review in CIVIC" action on a work item that calls `open_review` with the item's copy and shows `link` to the owner. Subscribe to `civic://requests` per open item, and turn new requests into notices or inputs on that item through Orca's own attention rules. Offer "Make a work item" on unlinked CIVIC requests for managed projects (flow 2). Pass `coverage` and `changed_screens` through the gateway to agents. Orca calls CIVIC; CIVIC never calls Orca.

## 6. Slices

Each slice: its own worktree and branch, its own checks plus the full suites, `bin/signoff --no-post` on the exact commit, then a signed merge into this controller branch. Nothing is pushed.

| # | Slice | Done when |
|---|---|---|
| S0 | This plan and decision 0022 | Committed |
| S1 | Vite+ in the `packages/` workspace: `vp test` replaces vitest, `vp lint` with Ultracite presets, `vp fmt --check` on staged files, `vp run` tasks, `.vite-hooks`, `scripts/commit-type.ts`, signoff refuses untyped commits, test lists by glob | All existing suites pass under the new runner; a typed-commit test; hooks chain `.git/hooks` |
| S1b | All dependencies to their latest majors (§2): taze, caret ranges, `pnpm audit`. Effect and XState enter with their first user (S4), not as unused dependencies | Every suite green on the new versions; audit clean or each advisory named |
| S2 | The rule table in §3 with baselines | Each rule has a failing fixture and a passing one; baselines committed |
| S3 | One install for all of CIVIC: `packages/pnpm-workspace.yaml` lists `../graph`, `../review`, `../importers`, `../crawl` (spike 15 Nov: pnpm links out-of-root members, one lockfile, no root `package.json`) | One lockfile; signoff installs once |
| S4 | `@civic/core` kernel + graph-test helper; request machine in `review/` replaces the `if` checks; arch test forbids status writes outside the machine | Graph test covers every event; existing review tests unchanged and green |
| S5 | MCP server on Effect: one tool table with `Schema` inputs, JSON schemas derived; stdio transport scoped | Same tool names and answers; a test starts the real server and lists tools |
| S6 | CIVIC as a project in its own picker: tracked manifest, scenario registry for CIVIC's screens | `civic preview` opens CIVIC's own screens as a project; Playwright check |
| S7 | Source-to-element (§5) | Select an element on CIVIC's own canvas → file and line; file → elements; carried on an annotation and in `get_request` |
| S8 | Backend coverage (§5) | On a synthetic example with a deliberately unreached server function, the report names it |
| S9 | Preview lifecycle on Effect + XState; S9b store retention helper | Decision 0021's acceptance rows still pass; retention test on a temporary store |
| S10 | App server and Electron (18 Oct plan, pins from §2) in its six units | That plan's AE1–AE8 |
| S11 | Harness integrations: Claude Code plugin, Codex, OpenCode, and any ACP agent through the same MCP server; behaviour test drives the server the way a harness does | A misbehaving-agent test (wrong version, foreign claim, resolve attempt) is refused before any real-agent run |
| S11b | Coordinator integration, CIVIC side (§5b): `changed_screens`, `open_review`, `link_request`, `coverage`, request resources with update notifications, `work_ref` on records | A test plays the coordinator against the real MCP server on a temporary repository: opens a review, an owner annotation arrives as a request on the work item, a linked request lists under its work item, coverage reads the backend section |
| S12 | Cleanup passes found by S2's baselines and fallow (largest files, duplicated helpers) | Baselines shrink |

S1, S6 and S9b touch different paths and may run in parallel workers. S1b follows S1 (same lockfile) and comes before S3. S4 waits for S3. S7 and S8 wait for S5 and S6. S11b waits for S5, S7 and S8.

## 6b. Sign-off: requirements for the shared package

Adoption: `tools/signoff` copies Orca bb0c009c3; `.signoff.json` on main lists the steps, run through `scripts/signoff.ts`. The package waits for a quiet machine itself: no older sign-off running anywhere (CIVIC's or Orca's) and 1-minute load below `maxLoad` (default 10), checked twice 30 seconds apart, oldest first, up to 120 minutes (`--no-wait`, `--wait-max <minutes>`). CIVIC keeps the machine awake for the run on macOS. Posting requires `--post`. Runtime base/browser options currently require fresh checks to avoid stale reuse.

Owner and Orca controller, 15 Nov: Orca's sign-off (exact-commit sign-off, area map, reuse of passed checks, Vite+ task cache, related tests first, live status view, typed-commit check) is being extracted into a shared package that CIVIC and laundry-app will adopt, with a GitHub `signoff` commit-status mode like gh-signoff. CIVIC does not rewrite `bin/signoff` now. It keeps working as it is (S1 added the typed-title check, S1b installs before any suite, S3 made it one install and one check-and-test pass) until the shared package can replace it. What CIVIC needs from that package:

1. **Exact commit.** Refuse a dirty tree; refuse if the tree or HEAD changes while checks run; the result names the full SHA. A merge whose tree equals a signed-off commit's tree counts as signed off (CIVIC's controller verifies `HEAD^{tree}` after each merge today).
2. **CIVIC's check list, derived not listed:** the engine workspace's own `check` and `test` (`pnpm --dir packages run check` / `test`, which include the shrink-only lint baseline and every member package); graph validation; the demo and example graph builds with `--check` (`demo/fluent-button`, `demo/card`, `demo/rebrand`, `projects/discovery-app`); the civic gate (`bin/civic check --config civic.check.json`, against `CIVIC_BASE`, default `origin/main`); the library-release report (exit 1 is reported, not gating); and the install check (`packages/install.check.mjs`: the three packages installed from this commit by git into an empty app). Steps come from CIVIC's config, not from the package.
3. **Browser evidence flag.** An opt-in step for the Fluent Button web evidence (`--browser`: its own install, a Storybook build and Playwright), off by default.
4. **Temp root.** Every step runs under `bin/with-temp-root.mjs` (one temporary folder per run, removed afterwards, kept with `CIVIC_KEEP_TEMP=1`; git inside it never signs). The package must run CIVIC's steps inside it, or provide the same guarantees; `review/test/temp-root.test.ts` must keep passing.
5. **Machine sharing.** Wait before heavy steps until the one-minute load is below 6 and no other sign-off (CIVIC's or Orca's) is running; at most two test workers; one heavy lane at a time. Detect other runs by their actual processes, never by matching text in a waiting script's own command line (a self-matching gate stalled CIVIC's queue on 15 Nov).
6. **Reuse of passed checks** keyed by tree, so a merge or a rebase that does not change a step's inputs does not rerun it.
7. **Typed commits.** Refuse commits after main whose titles lack a conventional type (CIVIC's `scripts/commit-type.ts` today).
8. **GitHub status posting** only when asked (CIVIC passes `--no-post` until the owner authorizes pushing): a `signoff` commit status for the SHA, the civic gate status (`civic check --post`), and the change's findings as a comment on the open pull request.
9. **Owner-facing output** in everyday words, with paths and SHAs only in details.

## 7. Safety and pacing

AGENTS.md holds throughout: HOME never changes; ephemeral ports only (never 3012, 3013, 4317, 5733, 4417, 5734, 10448, 10449); the 3012 instance and `.civic-canvas/` are read-only; work happens in worktrees; commits are signed (1Password) and a signing failure stops the work; no push or PR without the owner. Heavy suites run one lane at a time, at most two test workers, only when the one-minute load is below 6 and no Orca sign-off is running. Workers are Codex (gpt-6.1-sol) at medium effort, one slice each.

## 8. Owner calls

1. May the 79 stale `orca-worktree-*` folders (1.4 GB) in `.civic-canvas/projects` be deleted, and may the private Orca adapter adopt the retention helper?

## Status, 16 Nov (handover)

**Merged on `civic/controller-2026-11-15`** (each through `bin/signoff`; nothing pushed, nothing in `main`): every slice S0–S12 of this plan. Tooling and dependency updates (S1/S1b), shrink-only lint and architecture baselines (S2), one workspace (S3), the machine core and request machine (S4), the Effect MCP server (S5), CIVIC in its own picker (S6), source-to-element (S7), backend coverage (S8), the preview lifecycle and bounded build retention (S9/S9b), the shared app server and desktop app U1–U6 (S10), harness integrations (S11), the coordinator hand-off (S11b), and a first layering cleanup (S12). Follow-ups merged in `7c9a1442`: Effect diagnostics through `@effect/tsgo` 0.69.0 (10 recorded in the baseline), server raw timers 13 → 4, attached tabs and desktop surviving a Vite restart, coverage notices for preview-only replays, a hidden-tab and frame test, and a fix for the managed-client checks' covered-window rendering. Fixes found on the way: checkbox replay, a git option injection in `changed_screens`, a desktop crash on late window events, and git-installed canvases loading TypeScript.

**Merged later, `25a93d20`:** `chore/anti-slop-effect`: 12 Effect rules vendored from k-mistele/anti-slop at `b7c1619b`, `no-runtime-typeof` off, a `--adopt` baseline path, and `useEffect` 51 → 45 behind `useWindowEvent`, `useResizeObserver` and `useFrameKeydown`. Its first sign-off stalled because the machine slept (idle and thermal sleep from 06:59 to 11:35, 16 Nov); the code was not at fault. A second run failed the managed-client checks while an Orca sign-off ran alongside (load 14) and passed alone. One real fault: the lint fixture test ran `pnpm --dir packages` from the caller's folder; fixed in `cd7f27af`. Sign-offs now run under `caffeinate -ims` and re-check the gate 30 seconds after it opens, so two sign-offs do not start together.

**Owner decisions:** merge this branch into `main` and push; then enable hooks (`vp hooks enable`, absolute `core.hooksPath`) and adopt the retention helper in the private Orca adapter. Sign-off timing: wait for a quiet machine, or allow load below 10 when no Orca sign-off runs (used overnight 16 Nov). Two old dogfood recordings that tick a checkbox (`.civic-canvas/dogfood/run-E25HF5`) need re-recording or removal.

**Merged 16 Nov, `4b45ae6c`:** `useEffect` 45 → 41 (the rest each sync with something outside React); deadlines in the host, desktop and run supervision count only awake time, held restart requests get a 503 after 60 awake seconds, server raw timers 4 → 1; an opt-in real-agent run (`CIVIC_REAL_AGENT=codex node review/test/real-agent-loop.manual.mjs`) that passed once: list, read, claim, edit, report, owner accepts; sign-off through the shared package in `tools/signoff` (Orca 502603d41), which takes over once `main` carries `.signoff.json`.

**Merged 16 Nov, afternoon (`5b22b2bf` … `a6a3f822`):** Codex setups pre-approve CIVIC's tools; the stale-version refusal names `get_request`; no raw timers remain. The coverage tools read a project other than CIVIC's own (found by the Laundry trial: 176 of 176 element locations matched source, two towel journeys replayed). A manifest-named connector loads only when its file is listed in `CIVIC_TRUSTED_CONNECTORS`. [Decision 0023](../decisions/0023-backend-coverage-boundary.md) sets backend coverage's tiers and [the framework plan](2026-11-16-framework-coverage-prep.md) its order. Backend operations are derived for TanStack Start, Convex, Next.js route handlers and server actions, Express, Hono, Fastify, Elysia, NestJS, tRPC, SvelteKit, React Router/Remix, Nuxt/Nitro and Astro, one detector module each; OpenAPI 3 JSON contracts add operations for any language and list requests outside the contract. Unshared passing replays are reported, not counted. Source tags reach non-Vite builds through a webpack-style loader, checked on Next.js 16.4.6 with Turbopack. Sign-off copies Orca's package at bb0c009c3, which waits machine-wide for older sign-offs and low load. Hooks are on in the owner's checkout.

**Remaining work:** the Orca-side wiring and the Orca trial (Orca's controller has both scheduled); Laundry's journeys recorded again at the current source; replay matching for Next.js and SvelteKit actions (build-time ids); runtime route tables for composed Hono, Fastify and Elysia apps; evidence statuses per journey step and tracker links (0023 points 4 and 5); YAML contracts; Koa only when a project needs it; React Native with the native app work; the managed-viewer check that flakes under load; further baseline cleanup (useEffect 41, about 3,300 lint findings).
