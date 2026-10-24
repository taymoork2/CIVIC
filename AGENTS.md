# Working on CIVIC

CIVIC is a deterministic product review and evidence system. Keep changes small,
maintainable, and grounded in the current checkout. Read the relevant package's
README and architecture decisions before changing its boundaries.

## Resource use is a product requirement

- Respect the user's time, CPU, RAM, disk, tokens, and subscriptions, both while
  developing CIVIC and while CIVIC runs on an end user's device.
- CIVIC makes no model calls. Agents and their subscriptions remain external
  ([decision 0006](docs/decisions/0006-deterministic-civic-for-agentic-teams.md)).
- Load projects and versions on demand. Search the running instance's loaded
  project; do not eagerly parse, build, or index every connected checkout.
- Bound concurrency and result sizes. Cancel abandoned requests, pause background
  polling/capture, and release browsers, workers, hosts, and subscriptions when
  their owners finish. Reuse expensive processes while work is queued; preserve
  per-preview storage and runtime isolation.
- Reuse valid captures and builds with explicit source/content, screen, viewport,
  and render-option identities. Bound cache retention and handle invalidation;
  never trade stale evidence for apparent speed.
- Loading states explain waiting; they do not establish a performance improvement.
  Measure the affected workload before claiming one. Include cold/warm behavior
  and cleanup when introducing expensive infrastructure or dependencies.
- Investigate narrowly and reuse results. Run focused checks first, then broaden
  only for changed risk or a required gate. Avoid duplicate builds, full captures,
  broad agent teams, and repeated unchanged polling.

## Ownership, isolation, and evidence

- Inspect the checkout, branch, diff, active runtime, and ownership before editing
  or restarting anything. Preserve unrelated changes and other agents' work.
- Connected app checkouts, dependencies, credentials, and production data are
  read-only unless the user explicitly authorizes changes to that source.
  Previews use CIVIC-owned snapshots, synthetic data, and disposable runtime state.
- Never silently install into, switch, reset, or clean an app's working tree.
  Failed or changing builds retain the previous usable preview and its evidence.
- Keep unsaved drafts, captures, comments, and recordings across navigation and
  resizing. Preserve existing confirmation guards for destructive replacement.
- Branch names and equal commit SHAs do not prove identical local contents.
  Bind evidence to recorded content and keep checkout selection explicit.
- Distinguish declared paths, static specimens, synthetic execution, replay,
  installed-app checks, and real-device/deployment acceptance. Report limits.
- Keep access keys and credentials out of logs, screenshots, exports, and commits.
  Preserve authentication, origin checks, loopback defaults, and Electron sandboxing.
- Keep connected-project adapters, designs, screenshots, and real-project validation
  reports in ignored local storage. Tracked examples and checks must be synthetic
  and must not require a named private project or a developer-specific checkout.
- Delete only verified, owned, regenerable artifacts within a checked boundary.
  Preserve source and evidence; respect deletion guards and external ownership.

## Shared implementation

| Area | Owner |
| --- | --- |
| Canvas, picker, screen review, search | `packages/canvas/` |
| Shared shadcn/Base UI controls, tokens, camera, review server | `packages/shell/` |
| Project connection, inventory, source/history discovery | `packages/vite-connector/` |
| Local app adapters, preview hosts, Electron lifecycle | `packages/local/` |
| Graph, import, review records, discovery | `graph/`, `importers/`, `review/`, `crawl/` |

- Fix shared behavior in its owner rather than duplicating project-specific or
  browser/Electron implementations. Keep app-specific behavior in adapters.
- Use shared shadcn/Base UI components and semantic tokens for shell UI. Preserve
  accessibility, focus, keyboard behavior, contrast, and narrow-window usability.
  Remove replaced legacy controls instead of retaining competing implementations.
- React Compiler belongs in CIVIC's Vite configuration, scoped to CIVIC's UI.
  Use memoization where it helps; avoid blanket wrappers and unstable Suspense
  promises. Preserve cancellation, error handling, and live frame identity.
- `packages/pnpm-workspace.yaml` and `packages/pnpm-lock.yaml` own the engine
  workspace. Use package scripts and declared versions; do not invent a root
  workspace or assume another app's dependency layout.

## Verification and delivery

- Start with the affected package's `check` and focused tests. For shell changes,
  verify the changed flow at desktop and narrow widths; verify Electron when its
  shared UI or lifecycle changes. Reuse existing acceptance scripts and fixtures.
- Every check runs under `bin/with-temp-root.mjs` (package `test` scripts and
  `bin/signoff` already do): its temp folder is removed afterwards, since one
  Electron profile is up to 110 MB. A new script that runs checks must go
  through it; `review/test/temp-root.test.ts` fails if one does not. Set
  `CIVIC_KEEP_TEMP=1` to keep a run's folder as evidence. Git inside it never
  signs, so checks do not ask the owner's signing key for fixture commits.
- Use temporary stores, profiles, ports, and synthetic data for acceptance.
  Do not disturb installed dogfood sessions or another owner's backend.
- When landing is authorized, sign off the exact committed candidate with
  `bin/signoff --no-post` from a clean checkout. That is a release gate, not a
  reason to rerun every suite during each edit. Do not stash someone else's work.
- Commit, merge, push, publish statuses, or dispatch GitHub CI only within the
  user's authorization. Preserve unrelated work when grouping commits.
- CIVIC merges its own branches: a CIVIC session makes a signed merge after
  `bin/signoff` on the result. A coordinator in another tool must not request
  integration into this repository (for example Orca's `orca_integrate`), and
  must leave `.civic/` and the owner's untracked root `package.json` alone.
- Report what changed, the checks actually run, and material remaining risks.
  Keep private validation evidence in ignored local storage; keep these instructions short.

See [README.md](README.md), [architecture decisions](docs/decisions), and the
[local runtime guide](packages/local/README.md) for details. Machine paths,
process IDs, ports, and historical signoffs are evidence, not current defaults.
