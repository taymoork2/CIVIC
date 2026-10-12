# CIVIC review to agent loop

The local half of [decision 0007](../docs/decisions/0007-review-to-agent-loop.md). People annotate the journey, hand annotations to an agent as a work request, the agent claims it on its own line and reports a fix, CIVIC re-captures the fix on its preview, and the request resolves through its lane. The records are the graph's Actor, Line, Annotation and Work request ([`graph/`](../graph#the-review-to-agent-loop)), so every rule there applies to every write here.

CIVIC makes no model calls (D30). Agents run in their own harness and talk to CIVIC through this CLI or through the MCP server over the same calls. The [Claude Code plugin](../integrations/claude-code) packages that server.

## Where the records live

In the git common directory, under `civic/` (D39): `records.graph.json` holds the graph document, and `captures/` holds images named by their SHA-256. Every worktree of a repository shares the common directory, so an annotation made in one worktree is visible to an agent in another. Nothing is committed to a product branch.

Each write takes a lock, re-reads the store, applies the change, validates the whole document against the graph's rules, and replaces the file atomically. A write the rules refuse, such as an agent resolving a request, is never stored. `civic sync` shares the store with the team ([below](#sharing-records-with-the-team)).

Every work request has a version, which counts its changes from 1, and names its latest change (who, when, which operation). `civic requests` and `civic queue` print each request as `<id>@<version>`, and any command that takes a request accepts that form. The write is then refused if anyone changed the request since that version, naming the change, and nothing is written. So a person who reviewed one fix never resolves a newer one they didn't see, and an agent never claims over a comment it didn't read. Read the request again with `civic show` and retry at its current version. Without `@<version>`, a write applies to the request as it is now.

## Sharing records with the team

`civic sync` shares this store with everyone else's through `refs/civic/records` on the repository's remote (`--remote`, default `origin`; `--ref` to change it), as [decision 0008](../docs/decisions/0008-team-records-on-a-git-ref.md) says. Each sync is one commit holding the records and their captures, with the person who synced in a `Civic-Actor:` trailer. Only people who can push to the repository can share records. A push that isn't a fast-forward is refused, so the sync fetches, merges again, and retries.

The merge goes record by record against the last snapshot this store shared:

- A record changed on one side takes that side.
- Comments made on both sides at once are both kept.
- Any other change made on both sides keeps the shared version and sets yours aside. `civic conflicts` lists them. `civic settle <record> --keep theirs` drops yours, and `--keep mine` puts yours back as a new change that the next sync shares. Keeping yours needs the resolve scope.

Before merging, every shared change since the last sync is checked. Its person may change only what they, their agents, or CIVIC's re-capture wrote, with the scopes that `civic.access.json` gives them. Nobody deletes a record. If a sync breaks this, it is refused whole, the commit is named, and nothing is merged.

The trailer alone is a claim. Signing makes it a proof. `civic keygen` writes an Ed25519 private key that stays on your machine (default `~/.config/civic/<handle>.ed25519.pem`), points `git config civic.signingKey` at it, and prints your public key. Add that key to `civic.access.json` on the default branch:

```json
{ "people": { "taymoor": ["read", "write", "approve", "resolve"] }, "keys": { "taymoor": ["ed25519:…"] } }
```

Once any key is listed, every sync must be signed. Each sync signs exactly what it shares: the revision it builds on, a SHA-256 of the records, and the person it names. A shared sync counts only when a key listed for that person verifies it. An unsigned sync, a sync signed by someone else's key, or a genuine signature copied onto other records is refused. `CIVIC_SIGNING_KEY` overrides the git config. The signature covers the snapshot rather than the git commit, so a hosted remote can carry the same proof. Signing uses Node's own crypto, so no gpg or ssh setup is needed.

Sync talks to a `RecordsRemote` (`src/remote.ts`), so a hosted service can replace the git ref without changing anything else.

## Who is acting

A person runs as themselves, using the handle from `git config civic.handle`, `CIVIC_PERSON`, or their git email. An agent runs with `CIVIC_AGENT=<harness>` and `CIVIC_FOR=<person>`, so every write it makes names the person it acts for (D35). This is local attribution, not authentication: anyone who can write the git directory can write the store. Shared records are authenticated by signed syncs ([below](#sharing-records-with-the-team)).

What each person may do comes from `civic.access.json` on the default branch, so changing it is itself a reviewed, merged change, and an edit in a worktree grants nothing:

```json
{ "people": { "taymoor": ["read", "write", "approve", "resolve"], "sam": ["read", "write"] }, "others": ["read"] }
```

`read` lists and shows requests. `write` annotates, asks for work, claims, comments, reports fixes, adds checks and re-captures. `approve` accepts a check and escalates a lane. `resolve` resolves and reopens. An agent has the scopes of the person it acts for, and the graph's rules still apply on top of them: an agent never resolves or accepts a check. Without the file, everyone has every scope. `civic whoami` prints your scopes.

## Lines

The line is read from the checkout: main for the default branch, a worktree line for a linked worktree, and a branch line otherwise. Each write records the line's current revision, and a worktree line keeps its path, so CIVIC can run acceptance checks there. `civic preview <url>` says that a dev server serves this line at HEAD. An annotation made on that URL is recorded against that line and revision. `civic lines` is the lens: every line, its previews, and the requests claimed on it.

A pull request is a line of its own. `civic pr <number> --preview <url>` fetches the head its remote serves (`refs/pull/<n>/head` on GitHub) and records it as `line:github.pr.<n>`, with the hosted preview that serves it. Annotations made on that preview's URL land on the PR's line and revision, and fixes reported there can be re-captured on it. Run it again when the PR moves. Its previews then serve the new head, since a hosted preview redeploys on every push. Once the head is on the default branch, the line is marked merged. Agents call the MCP `register_pr` after opening a PR.

A designer's draft is a line too. CIVIC reads it from the Figma file export (`GET /v1/files/:key`, D27), as it reads the main file. `civic design <export> --file <key>` records the file's main line, `line:figma.<key>`, at the export's version. `civic draft <export> --file <key> --name "<draft>" [--branch <key>]` records a draft branched from it, `line:figma.<key>.draft.<name>`, and lists its frames. A Figma branch passes its branch key; a draft page or frame set in the main file is named only. Annotate a frame with `civic annotate "..." --line <draft line> --figma-node <node id>` (the MCP `annotate` takes `line` and `figma_node`). The comment stays on that draft and revision. Registering the draft again moves it to the new version and says whether each annotated frame is still there, by node ID only. A person chooses between drafts with `civic choose-draft <line> --why "..."`. That writes a draft choice naming the chosen line and revision and marks the other open drafts from the same base abandoned, not deleted, so their comments keep their answer. `--merged-as <version>` marks the chosen draft merged once the designer has merged it into the main file. Choosing needs the approve scope, and an agent can't choose.

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

An annotation can point at graph target IDs (`--target`), a path or branch (`--edge <from>><to>[:<action>]`), and an element locator (`--test-id`, `--role` with `--name`, or `--figma-node` for a design draft's frame). Re-capture finds it by target ID through `data-civic-id` (space-separated IDs on the element), then by the exact locator matching one element. Otherwise it reports it not found on that revision. It never moves an anchor to the nearest element (D37). An annotation with none of these, such as an imported screenshot, is unanchored. It's handed off and resolved like any other, but only a person can judge whether it's fixed.

### Lanes

The graph's `laneFor` decides the lane, and `civic show` displays it (D38):

- **Auto.** A contract-restoring request whose annotations are all anchored, and whose acceptance checks were all written or accepted by a person. `civic recapture` resolves it when every anchor is found and every check passes in the fix's worktree. Otherwise it reopens it for the agent, and the requester can reopen anything.
- **Batch review.** Everything else that isn't high risk, including requests whose acceptance is only the comment. `civic queue` lists them, and `civic resolve` clears many at once.
- **Owner sign-off.** A change to intent or behavior (`--change`), or a high-risk target (`--high-risk`). Only an owner named with `--owner <role>:<who>` can resolve it. On a high-risk target, the person who delegated the fix can't approve it.

An agent can add a check with `civic add-check`. It counts toward Auto only after a person runs `civic accept-check`. `civic escalate` moves a request to a stricter lane.

Re-capture runs only checks that a person wrote or accepted, so an agent can't run a command through CIVIC by adding it as a check. It writes a working-preview Evidence record as `actor:civic`, tied to the fix's revision and line.

## The journey engine

Laundry's review server ([`review-civic.mjs`](../journey-engine/source/apps/web/scripts/review-civic.mjs)) runs this CLI. Each note saved on the canvas also becomes an annotation here. A whole-screen note anchors to the scenario's target, `target:laundry.<scenario>`, which the review frame carries as `data-civic-id`. A note pinned to an element keeps that element's role and accessible name as its locator. A dragged region keeps only its rectangle. The note's capture, viewport and exact `/review-frame.html?...` scenario come with it. Saved notes get a **Hand to agent** button, and the **Across lines of work** section lists the notes from every worktree, which you can filter by line.

When the review server starts, it registers itself as its line's preview, with `.review-data/access-key` as the key file. That lets `civic recapture` and `civic repro --capture` sign in with the key, which is never copied into the store. `.review-data/` still holds the server's own working state for its checkout: the access key, the fixture cache, presentation drafts, coverage candidates, and its copy of each note with the annotation's ID. Set `CIVIC_SHARED=0` to review without the shared store. Without `review/`, as in the standalone handoff, the server reviews as it did before.

## Capture overlay

`civic overlay [--port 4777]` serves a small script for dev and preview pages (D40), and prints the script tag to add to them. In a page with the tag, press Alt+Shift+C or the CIVIC button, then select an element or drag over an area, and write a comment. The overlay sends the page's DOM, the selection's rectangle, the element's role and accessible name, its test ID, and the `data-civic-id` of the element or its nearest ancestor (never the page root). It also sends the viewport, the URL, and any line and revision stamped on the script tag. The server renders the screenshot from the DOM with scripts disabled, then records an annotation for the person running it. It accepts only pages served from loopback, so another website can't write annotations. Because it lives in the page, it works in any browser, including the browsers built into desktop harnesses.

Laundry's dev build adds the tag only when `VITE_CIVIC_OVERLAY` names the overlay server, for example `VITE_CIVIC_OVERLAY=http://127.0.0.1:4777`. A production build never includes it.

## MCP server

`node review/src/mcp.ts` (the `civic-mcp` bin) speaks MCP over stdio, and any harness that speaks MCP can use it. It offers D35's write path and nothing more. An agent can list and read requests (captures come back as images), claim, release, comment, get repro URLs, report a fix, add a check, record an annotation, and run `context` and `gaps`. When a fix is reported with a preview, CIVIC's re-capture runs straight away. On the CLI, the same thing is `civic report-fix --recapture`. The server acts as `CIVIC_AGENT` (default `mcp-agent`) for `CIVIC_FOR`. Each tool takes the agent's `cwd`, so its line is the worktree it's working in.

## Commands

```sh
cd review
pnpm install --frozen-lockfile
pnpm run check
pnpm test      # includes the roadmap acceptance, end to end on a temporary repository with a linked worktree
```

From the repository root, `bin/civic` runs both these commands and the graph's (`validate`, `forecast`, `context`, `gaps`). Re-capture uses `playwright-core` with Playwright's Chromium, or the machine's Chrome. Set `CIVIC_BROWSER_PATH` or `CIVIC_BROWSER_CHANNEL` to choose another. With no browser, the capture tests are skipped and say why.
