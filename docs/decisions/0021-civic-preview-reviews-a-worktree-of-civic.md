# 0021: `civic preview` runs a worktree's own canvas so CIVIC can review CIVIC

- **Status:** Accepted
- **Date:** 2026-10-23
- **Decider:** Owner's request that CIVIC dogfood itself; the shape decided by Claude under the standing rule that Claude decides and records design decisions, following Orca's `pnpm preview` contract as the orchestrator directed; the owner may revise it
- **Builds on:** [0019](0019-review-a-running-app-through-a-proxy.md) (`civic review-app`), [0020](0020-records-live-in-the-civic-folder.md) (records in `.civic/`)
- **Plan:** [self-dogfood](../self-dogfood.md)

## Context

CIVIC could already review any loopback app, but reviewing CIVIC's own canvas from a worktree took four manual steps (install, start the canvas on a free port and a temporary store, start `review-app`, remember to stop both). The long-running instance on port 3012 serves the main checkout, so a change in another worktree is invisible to it. The owner wants a worktree's CIVIC to be reviewable the way Orca's branches are.

## Decision

1. **The verbs are Orca's, under the existing `civic preview`.** `civic preview` with no address starts a preview of the current worktree; `list`, `link [branch]` and `stop [branch|all]` manage them; `--keep`, `--no-open` and `--project` change how. `civic preview <url>` still registers an already running preview. `--seed` is not carried over; `--project` picks the example (the Notebook example by default) in its place. `--desktop` is refused for now: CIVIC's Electron shell has no branch title or own profile yet, and I could not verify one here.
2. **One preview per worktree, entirely under `$TMPDIR/civic-preview/<branch>-<hash>/`.** It holds a throwaway canvas store, logs and a marker file, in private folders that refuse links and loose permissions. The state file is parsed strictly. `stop` signals a process only when its start time and command still match what was recorded, and deletes the folder only when it carries the marker. Ctrl+C cleans up; `--keep` keeps the data. Ports come from the OS, never a reserved one (Orca's, plus CIVIC's 3012, 3020 and 4777). Inherited `CIVIC_*` variables are stripped from the canvas.
3. **Running it twice attaches.** A second `civic preview` in a worktree that has one prints the link rather than failing.
4. **The owner's instance is out of reach.** The command does not read, attach to, stop or use the store of the instance on port 3012 or its `.civic-canvas/`.
5. **Dependencies.** It runs `pnpm install --frozen-lockfile` in `packages/` and `review/` of the worktree being previewed, only when `node_modules` is missing or pnpm's copy of the lockfile differs, and says so. In the repository's main working tree it never installs; it prints the command.
6. **The comments are CIVIC's own records.** The preview is registered on the worktree's line and revision, so an annotation on CIVIC's UI is filed in CIVIC's `.civic/` ([0020](0020-records-live-in-the-civic-folder.md)). A worktree with uncommitted changes is refused, because the revision would not describe the page. `--allow-dirty` allows it, with the annotation filed on the committed head and the page showing more; `list` marks such a preview. The preview's access key is passed to the registration as a file path, so re-capture can sign in, and the registration (and the path) is removed when the preview stops.
7. **There is no sign-in.** CIVIC's host is loopback only and has no owner login, so `link` prints the address, and the preview relies on loopback plus local attribution ([D35](0007-review-to-agent-loop.md)), which is not authentication. Any local process, an agent included, that can reach the preview's overlay port can post an annotation to it, filed under the name of the person who ran the preview: the server checks that a page's origin is loopback, and a program can claim any origin. This is acceptable for now because whoever can do that runs as the same user and could already write the records folder directly ([0020](0020-records-live-in-the-civic-folder.md)), and an annotation is not an approval: an agent still cannot resolve a request or accept a check. A page token would not close the gap, since the token is in the page any local process can fetch. What would close it is an owner capability the page earns and the server checks, as Orca's preview has, together with a sandbox that keeps agents away from the overlay port.

## Consequences

- Any CIVIC worktree can be reviewed with one command, and several at once, each on its own ports and store.
- An edit to the canvas or shell shows through Vite's hot reload. A change to the host's Vite plugin, or to long-lived processes, needs `stop` and a new `civic preview`.
- `--desktop`, and canvas-level review of CIVIC as a project in its own picker, are not built.
- `--keep` on `civic settle` is a different flag from `--keep` on `civic preview`; the parser reads it as a switch only for `preview`.
