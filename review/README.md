# CIVIC review to agent loop

The local half of [decision 0007](../docs/decisions/0007-review-to-agent-loop.md). People annotate the journey, hand annotations to an agent as a work request, the agent claims it on its own line and reports a fix, CIVIC re-captures the fix on its preview, and the request resolves through its lane. The records are the graph's Actor, Line, Annotation and Work request ([`graph/`](../graph#the-review-to-agent-loop)), so every rule there applies to every write here.

CIVIC makes no model calls (D30). Agents run in their own harness and talk to CIVIC through this CLI. An MCP server over the same calls comes next.

## Where the records live

In the git common directory, under `civic/` (D39): `records.graph.json` holds the graph document, and `captures/` holds images named by their SHA-256. Every worktree of a repository shares the common directory, so an annotation made in one worktree is visible to an agent in another. Nothing is committed to a product branch.

Each write takes a lock, re-reads the store, applies the change, validates the whole document against the graph's rules, and replaces the file atomically. A write the rules refuse, such as an agent resolving a request, is never stored. The team-wide store is roadmap step 5. It holds the same record shapes.

## Who is acting

A person runs as themselves, using the handle from `git config civic.handle`, `CIVIC_PERSON`, or their git email. An agent runs with `CIVIC_AGENT=<harness>` and `CIVIC_FOR=<person>`, so every write it makes names the person it acts for (D35). This is local attribution, not authentication. Identities and permissions are roadmap step 5.

## Lines

The line is read from the checkout: main for the default branch, a worktree line for a linked worktree, and a branch line otherwise. Each write records the line's current revision, and a worktree line keeps its path, so CIVIC can run acceptance checks there. `civic preview <url>` says that a dev server serves this line at HEAD. An annotation made on that URL is recorded against that line and revision. `civic lines` is the lens: every line, its previews, and the requests claimed on it.

## The loop

```sh
# A person, in any worktree
civic annotate "The colour label clips at 200% text" --url http://127.0.0.1:3010/review?scenario=intake.pack.color \
  --target target:laundry.intake.pack --test-id pack-color-label
civic annotate "Back from the receipt goes home" --image shot.png      # screenshot import, unanchored
civic request <annotation> --ask "Let the label wrap" --check "pnpm --dir apps/web test"

# An agent, in its own worktree (CIVIC_AGENT=claude-code CIVIC_FOR=taymoor)
civic requests
civic show <request>            # the work order as Markdown; --graph <file> adds the civic context export
civic claim <request>           # a lease; a second claim is refused and names the holder
civic repro <request> --url http://127.0.0.1:3011 [--capture out/]
civic report-fix <request> --preview http://127.0.0.1:3011 --note "Let the label wrap"

# CIVIC, run by anyone
civic recapture <request>

# People
civic queue                     # fixes waiting for batch review or an owner
civic resolve <request>...      # many at once
civic reopen <request> --note "Also check dark mode"
```

Request IDs can be shortened to a unique prefix, as in `civic claim 3f2a`.

### Anchors

An annotation can point at graph target IDs (`--target`), a path or branch (`--edge <from>><to>[:<action>]`), and an element locator (`--test-id`, or `--role` with `--name`). Re-capture finds it by target ID through `data-civic-id` (space-separated IDs on the element), then by the exact locator matching one element. Otherwise it reports it not found on that revision. It never moves an anchor to the nearest element (D37). An annotation with none of these, such as an imported screenshot, is unanchored. It's handed off and resolved like any other, but only a person can judge whether it's fixed.

### Lanes

The graph's `laneFor` decides the lane, and `civic show` displays it (D38):

- **Auto.** A contract-restoring request whose annotations are all anchored, and whose acceptance checks were all written or accepted by a person. `civic recapture` resolves it when every anchor is found and every check passes in the fix's worktree. Otherwise it reopens it for the agent, and the requester can reopen anything.
- **Batch review.** Everything else that isn't high risk, including requests whose acceptance is only the comment. `civic queue` lists them, and `civic resolve` clears many at once.
- **Owner sign-off.** A change to intent or behavior (`--change`), or a high-risk target (`--high-risk`). Only an owner named with `--owner <role>:<who>` can resolve it. On a high-risk target, the person who delegated the fix can't approve it.

An agent can add a check with `civic add-check`. It counts toward Auto only after a person runs `civic accept-check`. `civic escalate` moves a request to a stricter lane.

Re-capture runs only checks that a person wrote or accepted, so an agent can't run a command through CIVIC by adding it as a check. It writes a working-preview Evidence record as `actor:civic`, tied to the fix's revision and line.

## Commands

```sh
cd review
pnpm install --frozen-lockfile
pnpm run check
pnpm test      # includes the roadmap acceptance, end to end on a temporary repository with a linked worktree
```

From the repository root, `bin/civic` runs both these commands and the graph's (`validate`, `forecast`, `context`, `gaps`). Re-capture uses `playwright-core` with Playwright's Chromium, or the machine's Chrome. Set `CIVIC_BROWSER_PATH` or `CIVIC_BROWSER_CHANNEL` to choose another. With no browser, the capture tests are skipped and say why.
