# Local CIVIC

## Live Orca

The picker has one **Orca** app, containing **Design references**, **Live implementation** (`orca-live-32697c595bf2`) and the linked **Isolated instance**. The live connection mounts the installed Orca production bundle and reads its actual backend at ports 5734/4417. One journey contains seven screen identities. The canvas viewport picker changes their dimensions (phone, tablet, desktop or wide desktop), their snapshot aspect ratios and the active preview in place. It preserves the page and recording. Snapshot caches and frozen reviews include viewport dimensions. The work detail includes the real coordinator transcript, claim ladder, checks and changed-file evidence.

```sh
pnpm --dir packages/local connect:orca /Users/taymoor/.orca-dogfood/app
```

Refresh that connection after Orca is deployed to a newer revision, then restart the owned CIVIC server. Open <http://127.0.0.1:3012/review>. The adapter binds the served frontend and running backend revisions; it refuses a newer build until refreshed. Each connection retains its own evidence and runtime boundary underneath its app.

This is a **live, read-only observation**: actual navigation is recorded and saved through CIVIC. The bridge refuses every non-read Orca command, including automatic drafts and seen markers, agent input, approvals, settings saves and restarts. No prompts are captured as input fields. Live recordings cannot deterministically replay or reset Orca's changing backend. Declared graph edges and cached screenshots remain separate from observed journey evidence. A route without the required real project/work/session reports unavailable instead of fabricating data.

The whole live project, including captures and saved reviews, preserves Orca's configured Tailscale owner check. As observed during setup, that owner differs from this Mac's current Tailscale identity, so live Orca is refused through CIVIC's private HTTPS route for this caller. Local CIVIC/Electron remains available. No Orca owner, origin, service, source, database or Tailscale configuration was changed. Reconcile ownership explicitly before enabling private access; do not remove the gate.

Desktop web shown inside CIVIC's Electron window is still a web viewport. It is **not** a native Orca Electron/preload/API capture. Those native capabilities and physical devices remain unverified.

### Interaction coverage

Open **Coverage → Actual interactions → Scan registered screens** to inventory rendered controls. **Explore menus and dialogs** opens menu, dialog, disclosure and tab branches at desktop and phone widths, with fresh storage per branch. Each branch has a depth, action-time and state budget, and the whole job has a three-minute budget. Unreached states, refused actions and timeouts remain gaps. Submit and destructive actions require authored checks. The live Orca proxy continues to refuse writes.

The report compares each observed state/control with scenario edges, explicit coverage expectations and saved recordings. Repeated labels and destinations share a group, with evidence retained per source state, persona, role, condition and viewport. New recordings carry before/after control inventories. Merely seeing a control, declaring an expectation or saving a gesture never supplies a passing behavior assertion. Older source revisions are excluded, and live Orca cannot submit replay verification.

Use **Draft interaction expectation** or **Draft state expectation** to prepare a binding in the existing expectation editor. Review its acceptance text before saving. `state` binds the observed state hash; an interaction's `control` binds `{ "tag": "button", "name": "Keyboard shortcuts", "index": 0 }`. An interaction binding does not declare the whole screen state covered. Discovery records only bounded control descriptions, never input values or full transcript snapshots. It persists in the project's `interaction-states.json`; the authenticated `/api/review/interactions` endpoint exposes the same report and scan progress.

The journey outline filters journeys and screens locally. Select a bundled arrow to reveal its individual source paths in the outline, then choose one for review. Bundling uses action, destination, condition and return context; each path retains its original review identity. Coverage remains in Details.

### Isolated dogfood instances

```sh
node packages/local/isolate.mjs
CIVIC_LOCAL_STORE=/absolute/store/from/the/output CIVIC_LOCAL_PORT=3013 node packages/local/start.mjs
```

This creates an independent CIVIC store under `.civic-canvas/dogfood/`, an independent Laundry checkout under `~/Projects/civic-instances/` with shared installed dependencies, and an isolated Orca connection. The original workspace on port 3012 keeps its project and data. `isolation.json` records the paths and connection keys. No package installation, live Convex deployment, credentials or real household records are needed.

### App grouping and source locations

`.review-data/project-picker.json` stores each connection's stable `key`, source `root`, manifest, logical `app: { id, name }`, and `kind` (`design`, `live`, `isolated`, or `implementation`). **Projects & versions** groups connections under one app. Select a project, expand a version, then use its explicit **Open** action to choose a preview. **Viewing** identifies the version already rendered. Branches, running/test instances and design references have separate sections. **Manage connections** exposes source details and attaches another source without merging evidence.

The canvas selection determines the switcher's screen or component scope; All journeys uses the whole app. Screen candidates use registered target identities or the same declared route, never similar titles. Components use registered component/export identities. Routes and source matches remain labelled unverified; missing counterparts and unavailable inventories are explicit. Opening a preview selects its registered screen without merging verification evidence. Standalone component swapping requires a registered component preview. Cross-version changes retain the existing draft/capture guards and require confirmation during an active run.

The authenticated projects API supports `organize` with `{ key, app, kind }`, read-only `sources` lookup with `{ key, workspace? }`, and `scenarios` with `{ key, workspace? }` returning only screen IDs, labels, declared routes and component/export references. Generated React component previews retain `componentExport` so different exports in a shared file are not silently equated.

**Sources** reads `git worktree list --porcelain -z` without switching branches or modifying checkouts. Design references retain their collection ID, declared files and available import revision/receipt. Figma discovery is not configured; no Figma screens or versions are implied by Git discovery.

Local configuration may link another owned CIVIC instance with `workspaces: [{ store, origin, name }]`. Only loopback HTTP origins are accepted. Its connections appear under the same app groups; selecting one authenticates server-side to that instance, applies its existing switch guards, waits for readiness, then opens its workspace. Credentials stay on the host. Evidence is never copied or merged across instances. Browser session cookies are namespaced by listener port, so opening the second instance does not invalidate the first.

The existing Laundry clones now live at `~/Projects/civic-instances/laundry` and `~/Projects/civic-instances/run-E25HF5-laundry`. Cached design imports, connection manifests and evidence remain in CIVIC's ignored local store. New starter apps default to `~/Projects/civic-apps/`.

`consolidate.mjs --isolated-store /absolute/dogfood/store` inspects the original two nested Laundry clones without changing them. Add `--apply` only after checking that plan. It saves connection/configuration backups, verifies and stops the two owned CIVIC listeners, moves the clones, repairs dependency links, preserves connection keys and checks source/evidence hashes. It refuses existing destinations and linked worktrees. Start both listeners again after migration. The completed migration's backup and byte-preservation receipt are in `.civic-canvas/migrations/consolidate-4fbea651-4355-4f72-bca0-44e39695b6ea/`.

Orca uses its actual compiled UI, command schemas, store and runtime functions through CIVIC's per-run transport. Every run gets a synthetic SQLite database and disposable project directory. The dispatcher never starts. Model turns, harness probes, approvals, shell commands, updates and external services cannot be invoked through this adapter. Only project creation inside that run's directory, drafts and local database settings are writable. Work execution and native Electron APIs remain unverified. Orca recordings are inspectable; its transport does not yet support deterministic replay or reopening a closed run.

Laundry uses its actual UI and Convex functions in its existing isolated `convex-test` runtime. In either project, **Verify isolated write flows** runs authored assertions and saves the execution recordings plus a source-bound `behavior-checks.json`. Orca checks settings save/read-back/revert and rejects outside project paths before creating an owned project. Laundry checks a successful towel save and a declared failed save, including backend record counts and retained draft. Passing these assertions does not blanket-verify every discovered control or manufacture replay evidence.

CIVIC itself can be dogfooded here by saving an expectation, reloading, and switching the two isolated projects. Those writes affect this disposable store and clone only. Browser screenshots and behavior results are local evidence; real provider turns, production Convex and physical-device behavior are separate checks.

Runs the current standalone canvas with its native project picker.

```sh
pnpm --dir packages install --frozen-lockfile
pnpm --dir packages/local start
```

Open <http://127.0.0.1:3012/review>, or privately <https://macbook-pro.tail221f42.ts.net:10449/review>. Open the canvas directly: current CIVIC creates a browser session without asking for a review key. APIs still require a session or the local tools key. Exact host/origin checks, secure tailnet cookies and the loopback listener come from `@civic/shell`. The tailnet URL works while this Mac and Tailscale are available; no Funnel or ACL changes are needed.

The server runs independently of the terminal. `.civic-canvas/runtime.json` records its PID; `.civic-canvas/server.log` holds logs. A second start refuses an occupied port. To stop, verify that recorded PID still runs `packages/local/start.mjs --serve`, then send it SIGTERM. Starting again reopens the last selected project. The app's native picker protects active drafts and keeps saved records per project. Switching restarts this shared preview, so other open tabs must reload.

## Onboard or refresh

The local configuration is in `.civic-canvas/local-config.json`. Refresh Orca's design snapshot after its owner completes changes:

```sh
pnpm --dir packages/local onboard
```

Initial configuration accepts explicit paths:

```sh
pnpm --dir packages/local onboard \
  --orca-source /path/to/orca-redesign-checkout \
  --orca-design '/path/to/local-design/projects/orca-redesign' \
  --laundry /path/to/isolated-washcloset-checkout \
  --origin https://HOST.ts.net:10449
```

Orca uses the existing `module` adapter contract: 40 families, their named design states (199 at the latest import), and the 12 declared journey cases from its product screen map. The cases appear as explicitly unverified journey expectations in Coverage. A family/state selection is a fixture jump. There is no Orca runtime, recorder bridge, fabricated journey edge, approval or adoption. The embedded study runs in an opaque sandbox with bundled local assets and no network access. `receipt.json` retains source/document and design-asset hashes; the imported snapshot does not automatically follow later design edits. Component implementation, behavior and device acceptance remain unverified. Local design controls cannot act on Orca.

Laundry uses its existing `laundry` connector, guided towel adapter and isolated `convex-test` runtime. No real Convex deployment or household data is connected. Its external checkout was independently cloned from `taymoork2/washcloset`, at `a2ace5e` when onboarded. Its three `@civic/*` dev dependencies use absolute `link:` paths to this CIVIC checkout's `packages/{canvas,shell,vite-connector}`. Only those owned clones' dependency manifests and lockfiles were changed; the original Laundry and Orca checkouts were not modified. For a fresh setup, clone washcloset outside CIVIC, configure those links, and install dependencies in that clone before onboarding.

The original connection IDs include `orca-design-study-c9fa15e508d1` and `laundry-app-3afc423a3fe6` on this machine. A new connection's key starts from its paths; registered keys remain stable when a migration moves its source or manifest and updates the registry. Per-connection reviews, proposals, recordings and isolated runtime journals remain under `.civic-canvas/.review-data/projects/` in their original CIVIC store. Source selection is shared host state, not multiplayer authorization.

The retired v4 setup is preserved in the named Git stash `CIVIC local setup before migration from 046c7e2 to merged PR109`. Its historical synthetic data/evidence remains in ignored `rehearsal/source/.review-data`; it was not relabelled as current or mixed into the new stores.

## Private access

The existing Serve configuration gained only this route; all other handlers remain intact:

```sh
tailscale serve --bg --https=10449 http://127.0.0.1:3012
```

To remove only CIVIC's route: `tailscale serve --https=10449 off`. Do not reset the full Serve configuration.

## Optional Electron launcher

The compact project/version trigger opens **Projects & versions** for the selected screen or whole app. Branch history uses separate lanes, commit ages and capture ages. Expand a version to inspect available previews and scoped source changes, then choose **Open**. Search limits the list to ten matching versions, with a separate bound of ten previews within each expanded version. Only the list scrolls; the title, search and connection actions stay visible. Reviews and evidence stay with their original version.

**Search this project** and Cmd+K/Ctrl+K use the same command menu. It indexes only the running instance's loaded journeys, screens and component states, alongside canvas and project actions. It never builds a cross-project search index. Routine source updates use a dismissible four-second toast and keep the live draft intact; errors that need action remain visible alerts.

Uses an already installed Electron runtime, without bundling, publishing or modifying Orca:

```sh
CIVIC_ELECTRON_BINARY=/path/to/Electron.app/Contents/MacOS/Electron \
  pnpm --dir packages/local desktop
```

The installed Electron 44.9.0 in Orca's dependencies was used for verification. Each checkout tab retains a sandboxed, context-isolated `WebContentsView` with no renderer Node API. A narrow preload bridge exposes project-tab actions only to the main frame; IPC verifies the owning view and main frame. Tabs are identified by project, connection and linked workspace, so different drafts of one project can stay open independently. Opening the same checkout reuses its tab. Up to eight tabs load on demand; narrow windows put extra tabs in an overflow menu. Inactive tabs pause coverage polling and new canvas captures. Live runs and unsaved review, coverage and proposal edits require confirmation before closing.

Closing a tab releases its host lease. CIVIC closes an owned host after its last tab releases it; the original host and hosts opened by browser windows remain running. The launcher opens an existing server and does not stop that server on exit. Restart the owned server after changing the project-window API. `CIVIC_DESKTOP_ORIGIN` selects another loopback CIVIC host for the launcher and desktop acceptance check. This is a usable launcher, not a signed or packaged application.

The shell header is also the custom title bar: 40 px on desktop, with larger targets in narrow windows. macOS keeps native traffic lights, Windows keeps native window controls through its title bar overlay, and Linux retains its system frame. Blank header space drags the window; buttons stay interactive. The launcher preserves its platform marker across project navigation so window controls do not overlap checkout tabs. Browser windows retain their compact project picker and use ordinary browser tabs.

## Checks

### Independent project windows

**Projects & versions** separates branch history from running/test instances and design references. Its graph orders recorded commits newest first, keeping descendants above known ancestors. Commit age and capture age remain separate.

Use the new-window icon beside a project to open it without switching the current window. Local browsers open a tab/window; Electron opens another native window. CIVIC starts one loopback host per connection and keeps that connection's existing evidence. Hosts share the connection registry, while each project's active preview stays independent. Extra hosts live with the parent CIVIC process, up to eight including the original host; reopen project windows after restarting CIVIC. This action is available locally, not through the private HTTPS proxy.

```sh
pnpm --dir packages check
pnpm --dir packages/local test
CIVIC_ORCA_SOURCE=/path/to/installed-orca node --test packages/local/orca-isolated.check.mjs
pnpm --dir packages/local test:browser
CIVIC_TEST_ORIGIN=https://HOST.ts.net:10449 pnpm --dir packages/local test:browser
CIVIC_ELECTRON_BINARY=/path/to/Electron.app/Contents/MacOS/Electron pnpm --dir packages/local test:desktop
```

Browser checks have a two-minute budget and use synthetic data. They verify keyless entry, both project registrations, the actual Orca design render, phone width, project switches and a recorded Laundry Fabric → Color transition. They return to Orca. Do not run simultaneous tests that switch this shared host's active project. Physical phones, production backend behavior, complete Laundry journey coverage and Orca runtime behavior require separate evidence.
