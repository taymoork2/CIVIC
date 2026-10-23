# 0020: Review records live in the project's `.civic/` folder, never inside `.git`

- **Status:** Accepted
- **Date:** 2026-10-23
- **Decider:** Owner's direction, after seeing CIVIC write into a connected app's `.git`; the shape decided by Claude under the standing rule that Claude decides and records design decisions; the owner may revise it
- **Supersedes:** D39 in [0007](0007-review-to-agent-loop.md) (point 5), and point 4 of [0019](0019-review-a-running-app-through-a-proxy.md)
- **Builds on:** [0008](0008-team-records-on-a-git-ref.md) (sharing with the team stays on a git ref)

## Context

Decision 0007 (D39) put local review records in the git common directory, `<repo>/.git/civic/`, so every worktree sees the same annotations and nothing is committed to a product branch. To review a connected app, CIVIC therefore wrote into that app's `.git`. The owner does not want CIVIC, or anything else that isn't git, writing there. The records are also evidence, so they can't live in a cache. Vite keeps its own cache under `node_modules`, which an install or a clean wipes, so that was considered and rejected.

## Decision

1. **One store per repository: the main working tree's `.civic/`.** The main working tree is the first one `git worktree list` names, the one that owns the repository's `.git`. `records.graph.json`, `captures/`, `sync/` and the preview sign-in file live there. Every worktree of the repository reads and writes that one folder. This keeps D39's behaviour: an annotation made in one worktree is visible to an agent in another, with no sync step. The alternative, a store in each worktree with a way to forward records to the main one, needs a merge for every read and gives two places for the truth.
2. **The folder hides itself from git.** CIVIC writes `.civic/.gitignore` containing `*` and `!civic.json` when it first uses the folder, so records and captures can't be staged by `git add -A`, and `civic.json` can. A repository may also add `.civic/*` and `!.civic/civic.json` to its own `.gitignore`; CIVIC never edits a connected app's tracked files. It asks git (`git check-ignore`) before its first write, and stops if the records would not be ignored.
3. **A working tree can come from another branch, so the store distrusts tracked files.** Checking out a branch could supply `.civic/records.graph.json`, or a `preview-auth.json` that names a file to send as a sign-in key. The store refuses every read and write while git tracks anything in `.civic/` but `civic.json`, and says how to untrack it. The git common directory could not be checked out, so D39 never needed this. A link or file someone plants in the folder locally is not defended against: whoever can write the working tree could always write `.git/civic/` too.
4. **The project manifest is `civic.json`**, found at the app's root and then in `.civic/civic.json`. Paths inside a manifest in `.civic/` start from the app's root, the folder above `.civic`. `civic.project.json` and `rehearsal.project.json` are still read after those, with a deprecation note. `init` writes the new name.
5. **`civic move-store` moves an earlier store out of `.git`.** It copies each file of `<git dir>/civic/` into `.civic/`, checks every copy byte for byte, deletes the old file, then the empty folders. Running it again finds nothing. It stops, changing nothing, if both stores hold a file of the same name with different bytes, if a civic command holds the old store's lock, or if the old folder holds anything but plain files.
6. **What stays in git.** `civic sync` still shares records on `refs/civic/records`, and `civic pr` still fetches into `refs/civic/pulls/`. These are git references that git writes at a person's request. This decision is about CIVIC's own working files.

## Consequences

- Nothing CIVIC writes is inside `.git` any more. `git status` stays clean in the app, since the folder ignores itself.
- A sandboxed agent working in a linked worktree must be allowed to write the main working tree's `.civic/`. Before, it needed the git common directory, which it already could. A sandbox that allows only the worktree and `.git` must add this one folder.
- The records now live in a working tree, not in the repository's database. `git clean -x` in the main checkout, or deleting that folder, removes them. Shared records survive on the sync ref, which is why `civic sync` matters more. AGENTS.md already forbids cleaning an app's checkout.
- `civic review-app`, the MCP server and every command find the store through the checkout, so they need no setting. Existing stores in `.git/civic/` are untouched until someone runs `civic move-store`.
- Examples and the project picker's starter still ship a `civic.project.json`, which still works. Renaming them is separate work.
