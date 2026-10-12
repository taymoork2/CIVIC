# Review to agent: annotations, handoff, and versioning across lines of work

Proposal, 2026-10-11, answering the founder in the CIVIC project thread. The approved parts are recorded in [decision 0007](decisions/0007-review-to-agent-loop.md) and spec decisions D35 to D40. It amends [decision 0006](decisions/0006-deterministic-civic-for-agentic-teams.md) and builds on [decision 0005](decisions/0005-what-civic-is.md), the spec's [contextual review](product-spec.md#contextual-review) and [multiplayer](product-spec.md#multiplayer-and-ownership) sections, and the graph schema in [`graph/`](../graph). Nothing here is built yet.

## The ask

Taymoor wants to use the journey canvas to select, comment on and annotate the user journey, its screens, parts of screens, and paths or branches, and hand that to an agent to work on. Two things make this hard:

1. **Versioning.** Agents work on different branches and worktrees. PRs have preview builds. Designers keep several drafts before one is final. CIVIC has to know which version of the product, and which version of the design, every comment, capture and fix belongs to.
2. **The connection.** A selection on the canvas has to become something an agent can pick up, act on, and report back on, without CIVIC losing track of who decided what.

## Short answer

- **CIVIC still makes no model calls itself.** What changes in 0006 is that agents get a real interface with a narrow write path, and an agent becomes an attributed actor that always works on behalf of a named person. The agent interface moves out of "Later" and into the roadmap.
- **Versioning is one new concept: a line.** A line is any stream of work that has revisions: a git branch or worktree, a PR (with its preview), or a design draft. The canvas always shows the graph *as of* a chosen design line and code line, and every annotation, capture and piece of evidence records the exact revision it saw.
- **The handoff is a work request.** Selecting one or more annotations and choosing "Hand to agent" creates a work request: the captures, anchors, the `civic context` export for each target, a reproduction command, and the base revision. Agents fetch it through a CLI or MCP server, claim it on their own line, and report a fix with its revision and preview. CIVIC re-captures the same scenario on that preview, deterministically, and a person resolves it.

## What exists today

The journey engine's review already does most of the capture side (spec, [contextual review](product-spec.md#contextual-review); code in `journey-engine/source/packages/shell/server/review-server.mjs`):

- A feedback item freezes its capture before it's written: a screenshot rendered from the page's HTML, a highlight rectangle (normalized x, y, width, height) with a label, the visible state (dialogs, tabs, fields), the scenario and presentation inputs, and an exact-scenario link.
- It records the git commit (`head`) and a hash of the source (`source`) it was rendered from, plus design file hashes. A row is marked `sourceStale` when the server is now on a different revision.
- Retries keep the request identity. Status moves Open, Fix ready for review, Resolved, and resolving needs evidence.
- Presentation proposals are reversible candidates you can play on the real experience.

What's missing for this ask:

| Gap | Today |
|---|---|
| Feedback is siloed per worktree | Stored in that worktree's `.review-data/`. A second worktree or agent never sees it. |
| No notion of a branch, PR or draft | Only "same commit as the server or stale". |
| The anchor is a rectangle | A rectangle on a screenshot can't be found again on another revision. |
| No handoff | Nothing an agent can fetch, claim, or report against. |
| No attribution beyond the local key | Every write looks the same, whether a person or an agent made it. |

## 1. Lines and revisions

### The model

```diagram
 Line (main, branch, worktree, PR, design draft)
   │  has many
   ▼
 Revision (commit + source hash, Figma version, library version)  ── immutable
   │  rendered by
   ▼
 Preview (local port in a worktree, PR preview URL, Storybook deploy)
   │  produces
   ▼
 Capture / Evidence  ── always names the revision, and the line it was seen on
```

- **Line.** `{ id, tool, kind: main | branch | worktree | pr | design-draft, base: line, head: revision, previews[], owner, status: open | merged | abandoned }`. A worktree is a branch with a local preview; a PR is a branch with a review and usually a hosted preview. A Figma branch, or a draft page or frame set the designer marks as a draft, is a design-draft line.
- **Revision.** What the graph's `SourceRef.revision` already holds. This proposal adds an optional `line` to `SourceRef`, so the same commit seen on two lines is still one revision.
- **Preview.** Where a revision runs. The graph's `working-preview` evidence tier already exists for what a preview proves.

### What the canvas shows

The canvas reads the graph **as of a lens**: one design line and one code line (and later a library version). The default lens is main and main. Switching the code lens to a PR shows that PR's preview in the live screen, its captures in the cached thumbnails, and its evidence in the panels. Switching the design lens to a draft compares the draft's frames with whichever code line is selected.

A line's records sit on top of its base, like a branch: anything created on a line (a capture, a discovered state, a proposed fixture) stays on that line until the line merges, then it's adopted on the base with a link to the merge revision. An abandoned line's records stay readable and never count. This follows the spec's proposal, decision, adoption and verification records, and the rule that testing a candidate isn't adopting it.

The canvas marks every target that has open lines changing it ("2 open lines change this screen"), so two agents or two designers working on the same thing see each other before they merge.

### Designers' drafts

Several drafts of one design are several design-draft lines from the same base. Comments made on a draft stay on that draft. Choosing a draft is a Decision for drafts, a draft choice record, naming the chosen line and revision; the others are marked abandoned, not deleted, so "why didn't we do B" keeps its answer. CIVIC reads drafts from the Figma file export (D27) as it reads main, so no new integration is needed, only the line label on import.

## 2. What you can annotate, and how it survives a change of revision

Taymoor's restatement (2026-10-11): select, comment on and annotate the user journey, its screens, parts of screens, and paths or branches, then have an agent work on whatever needs addressing. So an annotation can target any of these, each with its own stable ID in the graph:

| Selection on the canvas | What it anchors to | Example ask |
|---|---|---|
| A whole journey or flow | the journey target | "Add an offline path to checkout" |
| A screen or state | the state target | "This empty state is missing" |
| Part of a screen | a component instance or element inside the state (see anchors below) | "This price badge clips at 200% text" |
| A path (transition) | the `navigates` link: action, condition, return context | "Back from receipt should return to the order, not home" |
| A branch | the condition that splits the path, and the alternate route below it | "The payment-declined branch dead-ends" |
| A design-draft frame | the frame's node ID and component instance | "Use the draft B layout here" |

A path or branch annotation sits on the edge itself, so "this button should go to the error state" is one annotation on an edge, not a screenshot with an arrow drawn on it. A selection can also be several of these at once (two screens and the path between them), and the work request carries all of them.

Asks aren't only bug fixes. A work request can ask for a fix, a missing state, a new branch, or a change to a path. When the ask changes intent or behavior rather than restoring the approved contract, the request is a Proposal (spec, "Proposal, decision, adoption, verification") and a person decides before the result is adopted.

For part of a screen, an annotation (the spec's highlight, comment or annotation) gets layered anchors, from strongest to weakest:

1. **Graph target IDs.** The state, screen, component instance or transition the selection covers, from the `data-civic-*` attributes and test IDs that D31's contract export tells code to carry. This is the anchor that moves across revisions and lines.
2. **Element locator.** Role and accessible name, test ID, and the DOM or accessibility path at capture time, the same things a Playwright locator uses.
3. **Rectangle.** Today's normalized rectangle on the frozen screenshot. Always kept, never used to re-find anything.

The frozen capture never changes. Reading an annotation on another revision resolves it by exact target ID, then by exact locator. If neither matches, it shows as **not found on this revision**, never placed on the nearest element. This is the spec's existing rule ("nothing is matched automatically to the nearest node") applied to comments, and it's deterministic.

## 3. From selection to agent: work requests

### On the canvas

Select one or more annotations (or select an area and write one), and choose **Hand to agent**. CIVIC creates a **work request**, a new collaboration record:

- the annotations, with their frozen captures and anchors;
- the `civic context` export (D31) for each target on the platform in question, so the agent gets the contract and the IDs, not only the screenshot;
- the base line and revision the problem was seen on;
- a reproduction command that opens the exact scenario on any preview (`civic repro <request> --url <preview>`), built from the existing exact-scenario link;
- acceptance: which annotations must no longer reproduce, and which checks must pass;
- the person who asked, who owns the result.

The work request is also a plain Markdown and JSON file, so it can be pasted into any agent or filed in a tracker.

### The agent interface

One set of queries, offered as a CLI first and as an MCP server over the same code:

| Call | Who | What it does |
|---|---|---|
| `list_requests`, `get_request` | anyone | Read open work requests and everything above |
| `context`, `gaps` | anyone | D31's existing read-only export |
| `claim` | agent or person | Claim a request for a named line. A claim is a lease that expires, so a crashed agent doesn't block it. A second claim on the same request is refused and names the holder. |
| `comment` | agent or person | Ask a question or explain a choice. It lands in the thread on the canvas. |
| `report_fix` | agent or person | Say "fix ready" with the line, revision and preview URL. This only moves the request to **Fix ready for review**. |
| `release` | agent or person | Give a claim back. |

Agents cannot resolve, approve, decide, or write evidence. Those stay with people and with CIVIC's own capture.

### Closing the loop

When a fix is reported, CIVIC re-runs the reproduction on the reported preview with Playwright (the same deterministic capture the journey engine does today), resolves each anchor on the new revision, and shows before and after side by side on the annotation. The result is `working-preview` evidence tied to the fix revision. What happens next depends on the resolution policy below: CIVIC resolves it, or a person resolves or reopens it with a comment that goes back to the agent. When the line merges, an Adoption record links the decision to the merged commit, and the next capture on main is the verification.

```diagram
 Canvas: select + annotate ──▶ Work request ──▶ agent claims on line L
                                                   │
                                   report_fix(L, revision R, preview P)
                                                   ▼
            CIVIC re-captures the scenario on P (no model call)
                                                   ▼
     Before / after ──▶ resolution policy: auto, batch review, or owner
                                                   ▼
                    L merges ──▶ Adoption ──▶ capture on main = Verification
```

### Not a bottleneck: the resolution policy

Agents work faster than anyone can review one fix at a time, so "only a person resolves" means a person sets the rule up front, not that a person looks at every fix. Agents never resolve their own work. Each work request falls into one of three lanes, chosen by the risk policy the project already uses for gaps (D32):

| Lane | When | What happens |
|---|---|---|
| **Auto** | The request restores the approved contract (no change to intent or behavior), the target isn't high risk, and its acceptance is executable: existing checks, or checks the requester attached | CIVIC resolves it when its own re-capture finds every anchor and the acceptance checks pass on the fix revision. The requester gets a digest and can reopen anything. |
| **Batch review** | Anything else that isn't high risk, including requests whose acceptance is only a comment | Before and after pairs wait in one queue. A person clears many at once, from the canvas or from a phone. |
| **Owner sign-off** | A change to intent or behavior (a Proposal, in the spec's terms), or a high-risk target | The named owner decides, as the spec already requires. |

Checks the agent writes as part of its own fix don't count toward the Auto lane until a person has accepted them once, because an agent shouldn't grade its own work. Review never blocks an agent: while a fix waits in a queue, the agent claims the next request, and the line's PR still follows the repository's own merge rules.

## 4. Where the records live

Today each worktree has its own `.review-data/`. Worktrees of one repository share one git directory (`git rev-parse --git-common-dir`), so the local fix is to keep CIVIC's collaboration records there, under the common directory, keyed by line. Every worktree and every local agent then sees the same annotations, requests and claims, with no service to run and nothing committed to product branches. Captures stay content-addressed files beside them.

For a team (several machines, hosted PR previews, designers), the same records move to the shared CIVIC store that roadmap step 5 already plans: real identities, scoped permissions, expected-version writes. The local store and the shared store hold the same record shapes, so the step 5 work is transport and permissions, not a new model.

Committing records into the repository (on the product branches, or on a separate `refs/civic/*` ref like git notes) was considered. Product branches would get merge noise from comments, and a separate ref needs push access and sync logic for every reviewer. It's a reasonable later option for teams that want records in git.

## 5. Attribution: agents as actors, on someone's behalf

Decision 0006 says "the graph has no agent actor". For this loop CIVIC needs to know who claimed and who reported, so the proposal brings back a narrow actor:

- An actor is a **person** or an **agent acting for a person**: `{ kind: 'agent', name, delegatedBy: person, line }`. The person is accountable for everything the agent writes.
- An agent can claim, comment, report fixes, and record an annotation for its person (section 6). It can't approve, decide, resolve, or create evidence.
- Segregation of duties stays as 0006 wrote it, with one addition: for a high-risk target, the person who delegated the fix can't be its only approver.

## 6. Capturing from wherever you work

The founder's default today is a screenshot and a comment pasted into a harness. Desktop harnesses such as Claude Code desktop and Codex desktop have built-in browsers and image annotation, but CIVIC can't depend on what each one exposes. So capture lives in three places, from richest to plainest, and all three produce the same Annotation record.

**1. A capture overlay inside every preview.** The app's dev server or preview build injects a small CIVIC script, as the journey engine's review middleware does today. Press a key, select an element, an area, or the control that starts a path, and type a comment. The overlay records the same capture the canvas does: a screenshot (with the existing `@civic/shell` capture code), the element locator, the `data-civic-*` IDs, the scenario, and the revision and line the preview reports about itself, stamped at build time. Because it lives in the page, it works in any browser: the built-in browser of Claude Code desktop or Codex, Chrome, a hosted PR preview, or a phone. It's left out of production builds. A browser extension for pages you can't inject into (production) can come later.

**2. The agent side: one MCP server, thin packages per harness.** The calls in section 3 are offered by a CLI and by an MCP server over the same code, so any harness that speaks MCP can use them (Claude Code, Codex, Cursor and others). Each harness then gets a thin package, with all logic kept in the CLI:

- **Claude Code plugin:** the MCP server; a skill explaining how to work a request (claim, read the context, repro, fix, report); slash commands such as `/civic:next` and `/civic:request <id>`; and a session-start hook that lists open requests for the current line.
- **Codex:** the same plugin folder, with a Codex manifest beside the Claude Code one: the same MCP server, skill and session-start hook.

Request captures are returned as images, so the agent sees exactly what the person saw.

**3. Screenshot and comment, as today.** `civic annotate --image shot.png --url <preview URL> "comment"`, or the MCP `annotate` call an agent makes when you paste a screenshot into the harness, stores an **unanchored** annotation: the image, the comment, the URL, and the revision when the URL is a known preview. It's tracked, handed off and resolved like any other, but it has no target, so it can't follow the product to another revision until someone anchors it on the canvas. Annotations made with a harness's own browser tools come in the same way, along with any element details the harness gives the agent.

Recommended order: screenshot import and the CLI first, because they're the cheapest; then the overlay and the MCP server with the Claude Code plugin, in the Laundry slice; then Codex packaging.

## What changes in decision 0006

| 0006 says | Proposed |
|---|---|
| CIVIC makes no model calls (D30) | **Unchanged.** CIVIC captures, compares and replays deterministically. The agent runs elsewhere, on the team's own setup and budget. |
| Agents sit outside CIVIC; their code arrives only through a PR or import | Agents still sit outside, and code still arrives through the line's PR. They gain a narrow write path: claim, comment, report a fix, and record an annotation for their person. |
| The graph has no agent actor | An agent is an attributed actor that always acts for a named person, with no approve, resolve or evidence rights. |
| An agent interface is "Later, not scheduled"; write-back undecided | The interface is the next build: CLI first, then an MCP server over the same calls, packaged for Claude Code and Codex. Write-back is the table in section 3, nothing more. |
| Everything else (D31 to D34, no agent-built prototypes, no model-drafted states) | Unchanged |

It doesn't bring back what the founder removed in 0006: no model calls inside CIVIC, no agent-drafted designs, adapters or prototypes, no model-suggested states. One option is left out on purpose: CIVIC launching agents itself (for example, starting a coding agent on a new worktree when you click "Hand to agent"). That's the next step if the handoff proves useful, and it would still make no model calls inside CIVIC, but it makes CIVIC responsible for running agents, so it's worth a separate decision later.

## Schema additions

A follow-up change to [`graph/`](../graph) adds:

- `Line` record (`line:` prefix) and an optional `line` on `SourceRef`.
- `Annotation` record (`annotation:`) with layered anchors (target IDs, locator, rectangle), or none when it's unanchored, the frozen capture reference, and the revision and line it was made on.
- `WorkRequest` record (`request:`) with its annotations, base revision, acceptance, owner, lane, status (Open, Claimed, Fix ready for review, Resolved, Reopened), and claim lease.
- `Actor` on records that are written by someone: a person, or an agent with `delegatedBy`.
- A validation rule that an agent actor can't be the author of Evidence, a Decision, or a Resolved status.

Annotations and work requests are collaboration records, so they start step 3's typed records.

## Where it goes on the roadmap

This is the next build, ahead of the Card demo:

1. **Records.** Line, Annotation, WorkRequest and Actor go into the graph as the start of step 3.
2. **A first slice on the journey engine with Laundry.** Move `.review-data` into the git common directory, add layered anchors and screenshot import, add the lens switch between worktrees, and add the CLI (`civic annotate`, `civic requests`, `civic claim`, `civic report-fix`, `civic repro`) with the resolution policy. Then the capture overlay, the MCP server, and the Claude Code plugin.
3. **PR previews and design drafts** follow, once the Figma import (D27) brings drafts in. Codex packaging comes with them.
4. **Step 5** moves the records to the shared store for teams.

## Decisions

| # | Decision | Outcome |
|---|---|---|
| 1 | How far to loosen 0006 | **Approved** (founder, 2026-10-11): agents get a narrow write interface and are attributed actors for a named person. CIVIC itself still makes no model calls. CIVIC launching agents is later. (D35) |
| 2 | How annotations follow a change | **Approved** (founder, 2026-10-11): stable target IDs, then exact locator, otherwise "not found on this revision". Never nearest-element matching. (D37) |
| 3 | Who can close a request | **Approved** (founder, 2026-10-11): agents never resolve, and a person decides. The founder asked that review not become a bottleneck, so a person decides through the resolution policy's three lanes, which the founder approved the same day. (D38) |
| 4 | Where local records live | **Approved** (founder, 2026-10-11): the git common directory, shared by all worktrees. (D39) |
| 5 | When to build it | **Approved** (founder, 2026-10-11): the next build, ahead of the Card demo. Records start step 3, then the Laundry slice. |
| 6 | Lines and the design-and-code lens | **Approved** (founder, 2026-10-11) with the proposal. (D36) |
| 7 | Harness integration | **Approved** (founder, 2026-10-11): a capture overlay in previews, an MCP server with thin packages per harness, and screenshot import. (D40) |
