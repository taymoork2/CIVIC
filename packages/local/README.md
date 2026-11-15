# CIVIC local desktop host

The local launcher serves the generic canvas and opens it in Electron. Projects
are selected through their manifests; no connected application is required by
CIVIC's source or startup.

From a clone, `bin/civic desktop` does all of this for you: it downloads Electron on first run, starts a
server on its own port and store, opens the window, and stops the server when the window closes. The
commands below are the manual route.

```sh
CIVIC_PROJECT=/absolute/project/civic.json pnpm --dir packages/local start
CIVIC_ELECTRON_BINARY=/absolute/Electron pnpm --dir packages/local desktop
```

The default loopback port is 3012. Use `CIVIC_LOCAL_PORT` and `CIVIC_LOCAL_STORE`
for an isolated instance. The store owns project connections, synthetic runtime
state, captures, reviews, and the Electron profile. Application sources remain
external and read-only. This source-backed Electron launcher is not a signed,
packaged application.

Optional integrations can provide a Vite configuration. Set `hostConfig` to its
absolute path in the store's ignored `local-config.json`. Keep adapter code,
private project assets, and acceptance reports outside tracked CIVIC content.
An integration owns its dependencies and project-specific runtime restrictions;
CIVIC's shared engine and default host stay independent of it.

The generic host supports manifest selection, isolated module runtimes, project
windows and tabs, and lease-based host cleanup. Electron uses sandboxed,
context-isolated views and accepts project navigation only through registered
loopback hosts. Window closing and checkout replacement preserve existing draft
confirmation guards.

Run `pnpm --dir packages/local test` for launcher and lifecycle checks. The
optional `test:electron` script runs every `*.electron.mjs` check, which drives
Electron with synthetic projects and a temporary profile. Private integrations have separate local validation.

`retainPreviewBuilds(store, { live, inUse })` in `preview-retention.mjs` is an
opt-in helper for adapters. `live` contains absolute worktree roots; `inUse`
contains absolute build directories under the store's `projects/`. The adapter
must serialize the call with builds, receipt publication, and preview lease
changes, and supply every connected root and running build.

An adapter-owned project has a regular `receipt.json` with an absolute `root`
(new required retention field), a nonempty `worktreeHash`, and `worktreeBuild`
matching `builds/<16 lowercase hex>-<8 lowercase hex>`. Writing this receipt
asserts that the project's contents are disposable CIVIC preview artifacts.
Legacy receipts without `root` and foreign folders are left alone. Live projects
keep their published build and leased builds; disconnected projects stay while
any build is leased. No source root is traversed or deleted.

The helper refuses a linked store, project, receipt or build folder and paths
outside the real `projects/` boundary. Links inside a build (such as linked
`node_modules`) are removed as links, never followed. It inspects at most
500,000 entries per call; past that it deletes nothing. Results contain `removed: [{ path, bytes }]`, total
`bytes` (logical file sizes, not reclaimed disk blocks), and `refused` reasons.
It never starts automatically; adopting it in private adapters is separate work.
