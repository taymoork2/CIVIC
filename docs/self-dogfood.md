# CIVIC reviewing CIVIC: the self-dogfood loop

Plan, 2026-10-23. It adapts the Orca self-development handoff (22 October 2026) to this repository, after checking each of its findings against CIVIC's code. The command described under [The command](#the-command) is built as `civic preview` ([decision 0021](decisions/0021-civic-preview-reviews-a-worktree-of-civic.md)); where this plan and that decision differ, the decision wins. The first trial is described under [What the trial showed](#what-the-trial-showed).

## Outcome

Open any CIVIC worktree's own canvas with one command, comment on it with CIVIC's overlay, hand the comment to an agent as a work request, have the agent fix it in its own worktree and show the fix on that worktree's own copy, and resolve it. The comments, the requests and the fixes are CIVIC's own records, filed on CIVIC's own lines and revisions ([decision 0020](decisions/0020-records-live-in-the-civic-folder.md)).

CIVIC makes no model calls and launches no agents ([decision 0006](decisions/0006-deterministic-civic-for-agentic-teams.md)). The coordinator in the Orca handoff is therefore not part of CIVIC. The agent is external (Orca, Claude Code or Codex, through the MCP server). CIVIC is where the work is seen, requested, re-captured and signed off.

## What exists today

- **One dev host, strict port.** `packages/local/start.mjs` starts a detached Vite server with hot module replacement (HMR) on `CIVIC_LOCAL_PORT` (3012 by default). It only checks that the port is free. It writes `runtime.json` with a pid, port, origin and start time: no source, store or mode. `packages/canvas/bin/civic-canvas.mjs` is a second launcher (3020, store `~/.civic/canvas`) and `packages/local/desktop-launch.mjs` a third, which I did not read.
- **State follows the checkout.** `packages/local/store.mjs` puts the store at `CIVIC_LOCAL_STORE`, else `CIVIC_STORE`, else `<launching checkout>/.civic-canvas/`. A worktree therefore starts with its own empty store.
- **A running instance exists.** `~/Projects/CIVIC/.civic-canvas/runtime.json` records pid 8839 on port 3012 with a tailnet origin, started 21 October. I did not check that it is alive and did not touch it. From its store's location it appears to serve the main checkout, so a change in another worktree would not show there until it is merged.
- **Nothing is packaged.** The Electron launcher is "not a signed, packaged application" (`packages/local/README.md`). There is no release build and no promotion step to keep apart.
- **The review loop already works on any loopback app.** `civic review-app` ([decision 0019](decisions/0019-review-a-running-app-through-a-proxy.md)) adds the overlay and registers the preview on the checkout's line. `civic claim`, `report-fix`, `recapture` and `resolve` finish the loop.
- **Setup is separate installs** in `graph/`, `review/`, `importers/`, `crawl/` and `packages/`. A fresh worktree has none. `packages/local/worktree-dependencies.mjs` refuses to install into a worktree for the user ("Install the worktree's pinned dependencies separately").

## What the trial showed

On 23 October, on ports 53965–53967 with a temporary store and a throwaway git repository, I started the standalone canvas on the Notebook example behind `civic review-app` and drove it with Chrome. The overlay loaded in the canvas page (the canvas draws its screens in that one page; no frames). An annotation on the "Notebook home" card was saved and `civic annotations` listed it on the repository's line. All processes were stopped afterwards by their recorded pids.

Not tried: the CIVIC repository's own `.civic/`, recapture or `report-fix` through the proxy, HMR through the proxy's WebSocket tunnel, Electron, and the running 3012 instance.

## The Orca findings, checked against CIVIC

| Orca finding | In CIVIC |
| --- | --- |
| F1 The dogfood route is an installation lifecycle | Differs. No release build exists. The likely gap is that the live instance serves the main checkout, so other worktrees' changes are invisible to it. |
| F2 Several launchers, no one open/attach contract | Applies, smaller: the host and canvas launchers I read share no identity, attach or readiness check. |
| F3 State follows the launching checkout | Applies: `.civic-canvas/` is per checkout. |
| F4 A responding port is not an identity | Applies: the port probe and `runtime.json` say nothing about source, store or mode. |
| F5 Restart policy, queues, effects | Mostly n/a: no engine holds queued work. What a restart can lose here is unsaved drafts, captures and comments (AGENTS.md says to keep them across navigation and resizing) and isolated live-run workers. |
| F6 Owner authentication | n/a. The host is loopback only with no sign-in. Recapture signs in with the preview's key file (`--bearer-file`), never copied into records. |
| F7 Worker isolation | n/a for CIVIC. It launches no workers. Each external agent uses its own worktree, and claims are per line. |
| F8 Preview, check and checkpoint tools | CIVIC is that host: `review-app`, `recapture`, `bin/signoff`. Reuse them. |
| F9 History is not a current pass | Applies. `plans/005` has a manual Electron check. No recorded acceptance of this loop exists. |

## The command

Match the Orca `pnpm preview` contract once that is in Orca's main (names below are placeholders): run from any CIVIC worktree, free ports, temporary data, one link, with `list`, `stop` and `link`.

- **start** (the default; repeating it attaches). Uses this worktree's source. Starts the canvas host on a free port, then `civic review-app` in front of it, registered on this worktree's line, filed under its branch. Prints one link, the proxy's `/review`. Default project: the Notebook example. `--project` picks another.
- **list** shows the instances and their worktrees, heads, ports and whether each is alive.
- **stop** ends one instance, or all, by the processes it recorded.
- **link** prints the link again.

How it behaves:

1. **Identity.** One instance per worktree, found in a registry under `$TMPDIR` (not in any checkout), with pid and start time of each process, ports, store, project, head and the dirty state at start.
2. **Attach only on a match.** Attach when the recorded processes are alive with the recorded start times and `/review` answers. Otherwise report a stale record and start fresh. A port held by anything else is refused, never killed or adopted.
3. **Two starts at once** end with one owner of each process (a lock in the registry).
4. **Stop** signals only recorded processes whose start times still match. No `pkill`, no stale pid trust. It never touches 3012 or `.civic-canvas/`.
5. **Data.** A temporary store per instance by default. Records of the review itself go to CIVIC's `.civic/` ([decision 0020](decisions/0020-records-live-in-the-civic-folder.md)).
6. **Setup.** If `node_modules` is missing, run `pnpm install --frozen-lockfile` in the directories the command needs, in this worktree only (it is CIVIC's own checkout, not a connected app). This is an open decision below.
7. **Status shows what runs.** Head, whether the tree is dirty, and when the instance started. HMR serves uncommitted bytes, so head alone is not the running source.

## What each change needs to take effect

| Change | Takes effect by |
| --- | --- |
| Canvas and shell UI (`packages/canvas/src`, `packages/shell`) | Vite HMR. Verify through the proxy. |
| `civic`, `graph/`, `importers/`, `crawl/`, `review/` commands | The next command. |
| `review-app`, overlay and MCP servers | Restart that process. Records are untouched. |
| Vite plugin and host code (`canvas-host`, `vite-connector`, the review server) | Restart the host. Unsaved drafts, captures and comments must survive; to be verified. |
| Electron main and preload | Relaunch the window. |
| Dependencies | Install, then restart the host. |

## Safety

Everything in AGENTS.md holds. In particular: ephemeral ports, never the reserved ones; never change HOME; no recursive deletion outside owned, verified artifacts; no model calls; loopback only; keys out of logs; the running 3012 instance and its `.civic-canvas/` are not touched without the owner's approval.

## Slices

1. **Baseline, read-only.** Record the live instance's real state (is pid 8839 alive, what it serves) before anything changes.
2. **Start, attach, list, stop, link** with tests on temporary ports and a foreign listener.
3. **Activation.** Verify HMR and the WebSocket tunnel through the proxy; add the running-source status.
4. **Setup** from a fresh worktree.
5. **One real journey** (below).

## Acceptance

Each row is proved with current evidence, not by a past run.

| ID | Scenario | Evidence |
| --- | --- | --- |
| S01 | Start from a fresh worktree | Link opens; overlay present; processes and ports recorded |
| S02 | Start again | Same instance; no new processes |
| S03 | Two starts at once | One owner per process |
| S04 | A foreign process holds the requested port | Refused; the process is still running and was sent nothing |
| S05 | Start from a second worktree | Its own instance and store; the first is untouched |
| S06 | Edit a canvas component | Visible change through the proxy without reload; HMR not broken by the tunnel |
| S07 | Edit host code | Host restart; the status says so; drafts survive |
| S08 | `stop` | Only recorded processes end; others stay |
| S09 | The 3012 instance | Same pid, port and `runtime.json` before and after |
| S10 | Comment on CIVIC's own UI | Annotation on this worktree's line and revision, in CIVIC's `.civic/` |
| S11 | The whole loop | Comment, request, an external agent claims it in its own worktree, `report-fix` with its own copy, recapture, the owner resolves |
| S12 | Merge, then the live instance | The change shows in 3012 only if the owner has asked for that; no restart without approval |

Record every step the owner or the agent had to do in a terminal. The target is none for routine runs.

## Follow-ups after `civic preview`

`civic preview` is built ([decision 0021](decisions/0021-civic-preview-reviews-a-worktree-of-civic.md)). Slices 2, 4 and part of 3 are done: start, attach, list, link and stop; setup from a fresh worktree; and hot reload through the proxy (S06). Still open:

1. **`--desktop`.** CIVIC's Electron shell needs the branch in its window title and its own profile (`packages/local/desktop.mjs`), and an Electron binary to verify them.
2. **The full agent loop (S11).** An external agent claims a request in its own worktree, reports a fix with a preview of its own copy, `civic recapture` checks it there, and the owner resolves it. The launcher passes the preview's access key file when it finds exactly one, but no recapture has been run through a preview.
3. **S12.** Merging to main and seeing the change in the owner's live instance on port 3012, only when the owner asks for it.
4. **Sign-in.** The preview has none (decision 0021, point 7).
5. **Fixture signing.** Only the preview, store-location and review-app tests turn off `commit.gpgsign` in their throwaway repositories. The other test files that commit in a temp repository still ask the owner's signing key for every fixture commit, and fail whenever it is locked. Set `commit.gpgsign` to `false` in each of their fixtures.
6. **The remaining rows of the table** that no test or trial has covered: S07 (host edit with unsaved drafts), S09 beyond the one `ps` comparison, and the rest of S10 across several worktrees.

## Open decisions

1. The command's name. Follow Orca's final contract.
2. May the command install dependencies into CIVIC's own worktrees?
3. The default project: Notebook example, or a manifest for CIVIC itself.
4. Whether `civic` should eventually own the 3012 instance. Separate approval; nothing here touches it.
5. Canvas-level review of CIVIC (CIVIC as a project in its own picker, with a scenario registry for its screens) is not needed for this loop and is not planned here.

## The brief to hand an executing session

> Read `docs/self-dogfood.md` and AGENTS.md. Implement the smallest complete change that lets any CIVIC worktree run its own canvas behind `civic review-app` with one command (start, attach, list, stop, link), following the contract in the plan. Inspect the current branch and the running instance first, read-only; the instance on port 3012 and `.civic-canvas/` are not yours to touch. Use free ports and temporary data. Build on `packages/local`, `packages/canvas` and `review/`; do not write a new server framework. Keep CIVIC free of model calls and keep records in `.civic/`. Verify the acceptance rows with real processes and a real browser, then make one real change to CIVIC's own UI through the loop (annotate, request, an external agent fixes it in its own worktree, recapture, resolve). Report current evidence, every manual step, what remains and how to recover. Do not push or merge, and sign commits through 1Password; if signing fails, stop and say so.
