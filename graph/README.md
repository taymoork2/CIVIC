# CIVIC graph schema

Roadmap step 1. This package is the CIVIC-owned schema that every importer writes and every view reads ([decision 0004](../docs/decisions/0004-graph-first-journey-engine-as-viewer.md)). It lives outside `journey-engine/` and imports nothing from the journey engine or Laundry. It has no runtime dependencies and makes no model calls ([decision 0006](../docs/decisions/0006-deterministic-civic-for-agentic-teams.md)). A test enforces both.

Storage is plain JSON files until the Button demo shows what storage it needs. The event log from [onboarding and ingestion](../docs/onboarding-and-ingestion.md#4b-how-data-gets-back-to-the-engine) comes later; a graph document here is the current state that log would produce.

## A graph document

```json
{ "schema": "civic.graph/0", "records": [ ... ], "links": [ ... ] }
```

Types are in [`src/schema.ts`](src/schema.ts). Two worked examples validate cleanly:

- [`examples/fluent-button.graph.json`](examples/fluent-button.graph.json) is the decision 0001 Button: one semantic Button, its React v9, iOS and Compose components with each variant's mapping, and an open Contract Conflict for the Android kit's Neutral default. It is hand-entered from decision 0001's table, so its source revision is `decision-0001` and its evidence is static. It stays as a small test fixture; the [Fluent Button demo](../demo/fluent-button) builds the same Button from read data with the [importers](../importers).
- [`examples/card-override.graph.json`](examples/card-override.graph.json) is an illustrative Card with web and iOS libraries, a product screen, an instance on it, and two overrides to forecast. The [Card demo](../demo/card) builds a fuller Card from Fluent's source and Figma exports.
- [`examples/review-loop.graph.json`](examples/review-loop.graph.json) is an illustrative review to agent loop on Laundry: a person, their agent and CIVIC as actors, main and a worktree line, three annotations (anchored, a path, and an unanchored screenshot), and one work request in each lane.

## Records

Every record has a stable ID, `<prefix>:<dot.separated.path>`, a title, and optional owners, source and former IDs.

| Kind | ID prefix | What it holds |
|---|---|---|
| Intent | `intent:` | A requirement, business rule or accessibility rule that stays true on every platform |
| Target | `target:` | A journey, screen, state or surface, either **expected** (declared) or only **discovered** in source or by a crawl. A journey can name its `entry` and `exits` screens. |
| Token | `token:` | A design token, identified by its DTCG path |
| Semantic component | `semantic:` | The platform-independent contract: purpose, variants, states, slots and contract rules. `productStates` are the states whose content depends on the product's data, such as loading, empty and error. |
| Platform component | `platform:` | One platform's implementation, with how each semantic variant maps (`exact`, `closest` or `none`), its default variant, and any variants no semantic variant covers |
| Extension point | `extension:` | A slot, prop, token, style API or theming hook on a platform component, and the semantic properties it can express |
| Component instance | `instance:` | A use of a component on a product's screen, from design or code, with the contract `state` it shows and any product states it `inheritsStates` from the default |
| Override | `override:` | A local change to an instance: added content, a changed property, a local style, or a detach |
| Evidence | `evidence:` | What a source shows, tied to the exact revision it read, in one evidence tier |
| Contract Conflict | `conflict:` | Two sources that disagree on a target, as the import raised it: the sides and their evidence, owners, and the state it was raised in |
| Decision | `decision:` | A person's call on a conflict: outcome, classification, the alignment state it leaves, who decided, rationale, evidence, and for an exception its revisit trigger and expiry. A later decision `supersedes` an earlier one. |
| Collaboration record | `collab:` | An ambiguity, constraint, coverage gap, divergence, risk or exception: what it affects, the perspectives it needs, owners, a deadline, and once closed, how it closed and the artifact changes that resulted. An exception also has user impact, a revisit trigger and an end date. |
| Actor | `actor:` | Who wrote something: a person, an agent acting for a named person, or CIVIC's own deterministic process |
| Line | `line:` | A stream of work with revisions: main, a branch, a worktree, a PR with its preview, or a design draft |
| Annotation | `annotation:` | A comment on a journey, screen, part of a screen, path or branch, with layered anchors, a frozen capture, and the line and revision it was made on |
| Draft choice | `choice:` | A person's choice between design drafts from one base: the chosen line and revision, and the drafts passed over, which are marked abandoned |
| Work request | `request:` | Annotations handed to an agent: base revision, acceptance checks, repro command, claim lease, reported fixes, CIVIC's re-capture, a status history, and a version that counts its changes (roadmap step 5) |

### Decisions

A conflict is decided only by a Decision record (roadmap step 3, [`src/decisions.ts`](src/decisions.ts)). The conflict keeps what the import raised, and whether it is decided, how it was classified and which alignment state it is in are read from the Decision in force on it: the one no later Decision supersedes. A changed call is a new Decision that supersedes the old one, so the history stays. Validation requires evidence, a classification, an alignment state that fits the outcome, and a revisit trigger for an exception. It allows one decision in force per conflict, warns when the decider isn't one of the conflict's owners, and rejects a decision an agent wrote (D35).

A project keeps its decisions in a decision file (`civic.decisions/0`) next to its contract, reviewed and versioned like code, and its importers add them to the graph they raise. `civic decide` adds one:

```sh
civic decide demo/fluent-button/contract/decisions.json conflict:button.android.brand-outline \
  --graph demo/fluent-button/out/raised.graph.json --outcome update-design \
  --classification outdated-design-source --by design:design-system-maintainers \
  --rationale "The kit predates Compose's OutlinedButton." --evidence evidence:figma.android-kit.button
```

It checks the decision against the graph before writing, defaults the alignment state from the outcome, and supersedes the decision already in force. Rebuild the graph, and the gate stops counting the conflict as undecided.

### The decision loop

A decision is not a "done" flag. The spec's four records are separate, owned records ([`src/decisions.ts`](src/decisions.ts)), and all four live in the same decision file:

1. **Proposal** (`proposal:`): a candidate change. It names what it changes, its scope, the resolution path (the same outcomes a decision takes), the baseline and candidate revisions with a preview to play it on, the rationale, and what a person should see once it lands. Anyone may propose, an agent included: CIVIC and the agents working from it draft remediation, and the owner decides. Testing a candidate is not adopting it.
2. **Decision**: names the proposal it approves in `proposalId`. An `update-contract` decision changes intent, so it must approve a proposal; a fix that restores the contract (update the design, change the implementation) needs none.
3. **Adoption** (`adoption:`): the revision that carries the decision, such as a commit or a Figma file version. It is a claim, so an agent may record it. An approved exception has nothing to adopt.
4. **Verification** (`verification:`): evidence read at the adopted revision, with a pass or fail. Agents never write one (D35), as with evidence.

Each decided fix has a stage, read from its records and re-checked every time the graph is read (`fixFor`):

| Stage | When |
|---|---|
| `accepted` | The decision approves an exception. |
| `awaiting-adoption` | No revision carries the decision yet. |
| `adopted` | A revision carries it, and nothing has verified it. |
| `verified` | A verification passed at the adopted revision and the evidence it cites still passes. The conflict reads `aligned`. |
| `failed` | The latest verification failed, or the import read the adopted revision and still raises the conflict. |
| `regressed` | It was verified, and evidence the verification cites fails now. |

The import is CIVIC's own re-check. When a re-import no longer raises a decided conflict and its decision was adopted, the conflict is settled: `applyDecisions` leaves its records out of the graph and they stay in the file as history. A decision on a conflict that vanished without an adoption still fails the build, so a fix nobody recorded is noticed. Commands:

```sh
civic propose demo/card/contract/decisions.json --graph demo/card/out/raised.graph.json \
  --conflict conflict:shop.order-summary.card.state-selected --targets semantic:card --scope component \
  --outcome update-contract --by design:shop-design --rationale "Selection is part of Shop's order flow." \
  --expected "The Card contract has a selected state on every platform." \
  --baseline figma:1 --candidate figma:2 --preview https://figma.example/branch
civic decide ... --proposal proposal:shop.order-summary.card.state-selected
civic adopt <decisions.json> <decision-id> --graph <file> --revision git:4f2a9c1 --by engineering:fluent-android
civic verify <decisions.json> <adoption-id> --graph <file> --evidence <id,...> --by qa:shop-qa
civic fixes <file>                       # every decided fix with its stage, and proposals waiting for a decision
```

Each writes only after checking the decision file against the graph. `civic verify` reads the outcome from the evidence, never from a flag, and refuses evidence the graph holds at any revision other than the adopted one; it exits 1 when the verification it records fails.

Any record can name the actor that wrote it in `writtenBy`, and a `SourceRef` can name the `line` its revision was seen on.

### Collaboration records

Collaboration uses typed, owned records instead of passive comments ([spec](../docs/product-spec.md#collaboration-records), roadmap step 3). They live in the same decision file as the loop, under `collaboration`, so importers add them to the graph they raise. Each record has a type:

- **Ambiguity:** expected behavior is unclear.
- **Constraint:** a technical, platform, business or policy limit.
- **Coverage gap:** a state, platform or condition has no validation.
- **Divergence:** artifacts or shipped behavior disagree.
- **Risk:** something could cause harm or cost.
- **Exception:** a temporary, owned, expiring departure from policy or contract. With `limitation` it is an Accepted limitation, which accepts a platform or library constraint.

Each record names what it affects, as graph IDs, along with the perspectives it needs, its owners, who raised it and an optional `due` date. An exception also needs `userImpact`, `revisitTrigger` and `expires`. Closing a record marks it resolved or withdrawn, says who closed it and how, and lists the records and artifact revisions that resulted. The record stays in the file as history.

Anyone may raise a record, an agent included, except an exception, which only a person records. Only a person closes one (D35). An open record's subjects must be in the graph. A closed record keeps its history even after an import stops raising what it was about. The gate reports each open record as `open-collaboration`, which is advisory and says when the record is overdue. An exception in force is reported like an approved exception on a conflict, and it fails as `expired-exception` once its end date passes. `civic gaps` lists open records on a component, its implementations or its conflicts, with their owners.

```sh
civic raise <decisions.json> ambiguity --graph <file> --about semantic:button --summary "Should a disabled Button stay focusable on Android?" \
  --by qa:button-qa --owners design:design-system-maintainers --perspectives design,engineering --platform android --due 2026-11-01
civic raise <decisions.json> exception --graph <file> --about semantic:button --summary "..." --by design:a --owners design:a \
  --impact "Toolbars use the subtle style." --revisit "Compose adds a transparent style." --expires 2027-01-01 [--limitation]
civic close <decisions.json> collab:ambiguity.button --graph <file> --by design:design-system-maintainers --note "Disabled Buttons stay focusable." \
  [--records decision:...] [--changes git:4f2a9c1] [--withdraw]
```

### Alignment: `civic alignment`

`civic alignment <file> [--scope <semantic-id>] [--today <date>]` gives each semantic component exactly one [alignment state](../docs/product-spec.md#alignment-states) on each platform that implements it ([`src/alignment.ts`](src/alignment.ts)). The state is read from the records, never guessed, and the most severe state any record gives wins:

- **Unreviewed drift:** an open conflict, a decided fix that failed or regressed, an exception past its end date, or failing evidence.
- **Unknown / evidence stale:** stale evidence, or nothing else holds the platform back but there is no passing run about it (no evidence at all, or only static findings). A platform without a passing run is never aligned.
- **Awaiting adoption:** a decided conflict whose fix isn't verified yet.
- **Accepted limitation / approved adaptation:** an approved exception, either on a conflict's decision or as an exception [collaboration record](#collaboration-records).
- **Aligned:** none of the above, with a passing run.

Each row lists the records behind its state. `--json` gives the same with every reason.

## Links

A link is a traceable claim between two records: `implements`, `serves`, `uses-token`, `navigates` or `contains`. Every link has a status, as in the journey engine:

- **declared**: a person, manifest or explicit reference says so.
- **observed**: a confirmed run showed it. It needs passing automated or physical-device evidence.
- **inferred**: read from structure or names, and never counted.
- **proposed**: a candidate a person hasn't confirmed.

Only declared and observed links count for readiness. A `navigates` link follows the journey engine's cross-route actions (action, route, condition, return context). It can leave out `to` when the destination isn't mapped yet, and then it says what is known in `unmapped`, so the gap stays visible.

## What validation enforces

`validateGraph` checks shapes and these spec rules:

- **Stable identity.** IDs are unique and match their kind. A renamed record keeps its old ID in `formerIds`, an old ID is never reused, and references to an old ID fail until someone updates them. Nothing is re-anchored automatically.
- **Evidence integrity.** Evidence names its source revision. Source, token and design-file analysis can't claim to be automated or device evidence. An observed link needs a passing run, so a failed operation, fixture jump or inferred edge never becomes one.
- **Contracts.** A platform component's variant mappings use the semantic component's variants. A warning lists variants with no mapping, so a missing equivalent is recorded as `none` rather than left out.
- **Conflicts.** A conflict names at least two sides and an owner. It resolves only with evidence, an approved exception names its revisit trigger, and the alignment state must fit the status. For example, an open conflict can't be Aligned.

## The review to agent loop

Actor, Line, Annotation, Work request and Draft choice are the records for [decision 0007](../docs/decisions/0007-review-to-agent-loop.md), and the start of roadmap step 3's collaboration records. Validation enforces its rules:

- **Agents act for a person (D35).** An agent names the person it acts for in `delegatedBy`. An agent can write annotations and comments, claim, and report fixes, but it can't write evidence, resolve a conflict, accept an acceptance check, or resolve a work request.
- **Lines branch from a base (D36).** Only main has no base, and a merged line names the revision it merged as. A draft choice is written by a person, never an agent; its chosen line and every draft it passed over are design drafts of its base, and the passed-over drafts are abandoned.
- **Anchors follow identity (D37).** An anchor lists graph target IDs, path edges (whose starting screen is also a target) and an element locator, plus the capture's rectangle. `resolveAnchor` finds an anchor on another revision by target ID, then by exact locator (a test ID, a Figma node ID, or role and accessible name, matching exactly one element), and otherwise reports it not found. The rectangle is never used to find anything. Anchor target IDs are checked for format only, because "not found on this revision" is a real answer, not a broken graph.
- **Requests close through their lane (D38).** `laneFor` computes the lane: owner sign-off for a change to intent or behavior or a high-risk target, Auto for a contract-restoring request whose annotations are anchored and whose acceptance checks were all written or accepted by a person, and batch review for the rest. A person can escalate a request to a stricter lane. CIVIC resolves only in the Auto lane, after its own re-capture found every anchor and every check passed. The owner lane needs a named owner, and on a high-risk target the person who delegated the fix can't approve it.
- **History is the truth.** A request starts Open, its status is its last history entry, a claimed request has a claim, and a Fix ready request has a reported fix.

## Override forecasts

`forecastOverride` answers D29's question for each platform the screen ships on. Is the override **supported** by an existing extension point, does it **need a library change**, or is it **forbidden** by a contract rule? The answer is computed from the current graph rather than stored, and platforms are never merged into one answer. Only declared or observed `implements` links count, so a proposed mapping can't make an override look supported.

`reviewInstance` (`civic overrides <graph> <instance-id>`) is the design-time review of one instance from the [component change flow](../docs/component-change-flow.md). It forecasts every override, finds the conflict that tracks each one, and names who is asked (the person who made the change and the contract's design owners) and who is told (design engineering on each platform that needs a library change, and the engineers and QA of the screens and journeys the instance appears in). The design reads "not yet adoptable" until every override has a decision ([`src/overrides.ts`](src/overrides.ts)).

## Design completeness

`completenessOf` (`civic completeness <graph> <journey-id>`) is the static design completeness check (D32). It runs two rule sets and reports counts with denominators ([`src/completeness.ts`](src/completeness.ts)):

- **Component states.** For each screen and component, it counts the contract states that the design instances on the screen and its state targets account for. A state counts when an instance shows it, when the library renders it (it isn't a product state), or when an instance says it inherits the default. Only design instances count, because the check runs before code exists. `civic gaps` lists each missing product state with the instance's owners.
- **Journey shape.** Starting from the journey's entry screens, it reports dead ends (screens with no counted path on that aren't declared exits) and unreachable screens. An unmapped path still counts as a way on.

Which gaps block a release is the project's risk policy. Accessibility intent in designs isn't checked yet.

## Frame walk: `civic walk`

The frame walk (D33, [`src/walk.ts`](src/walk.ts)) steps through a journey's design frames along their prototype links, the way a person clicks through the prototype. It starts on the flow's start frame and goes breadth first. Only `navigates` links read from a design file count, so an app's own paths never join it. Each frame lists its components with their overrides and per-platform forecasts, the state frames it draws, and its prototype links. A link to a route no frame draws is shown as leaving the design. Dead ends and frames the start can't reach are marked where a person walking would hit them. Everything is labelled as design intent, never as behavior.

```sh
bin/civic walk demo/card/out/resolved.graph.json target:shop.checkout                            # the walk as text
bin/civic walk demo/card/out/resolved.graph.json target:shop.checkout --path "Apply promotion"   # a scripted walk; exits 1 where it stops
bin/civic walk demo/card/out/resolved.graph.json target:shop.checkout --html walk.html          # a page that plays it, opened from disk
```

## Contract export

Two read-only queries over a graph (D31). Both are deterministic and print Markdown, or JSON with `--json`.

- **`civic context <graph> <semantic-id> --platform <p> [--variant <key>]`** prints one work order: intent, states, slots, the platform's mapping and default, the other platforms' mappings, tokens, extension points, conflicts with their decisions, evidence by tier, acceptance, and the IDs to put in code ([`src/context.ts`](src/context.ts)).
- **`civic gaps <graph> [--scope <semantic-id>] [--platform <p>]`** lists what's expected but missing, each with owners: open conflicts, missing variants, missing product states in designs, platform-only variants, failing evidence, platforms with no run evidence, unconfirmed links, and approved exceptions with their revisit triggers ([`src/gaps.ts`](src/gaps.ts)).

## One screen: `civic screen`

`civic screen <target-id> [<file>...] [--json]` answers what the graphs know about one screen ([`src/screen.ts`](src/screen.ts)): the journeys that contain it, its paths on and whether they count, the evidence about it, and the gate's findings on it, its evidence or an open [collaboration record](#collaboration-records) about it (such as a coverage gap), each marked as blocking, advisory or held by the baseline, and which evidence is stale. With no files it reads the graphs and baseline in `civic.check.json` and uses the first graph that has the screen. It is how a viewer reads the graph: the journey canvas's Contract panel shows it for the selected screen (decision 0004). A `designs` list in `civic.check.json` names design files (`civic.design/0`), and the frames that name the screen are listed under Design: the viewports, themes and text scales the design shows it at. They are design intent, shown beside the runs and never counted as evidence. Laundry's Open Design reference is configured this way.

## The gate: `civic check`

`civic check` is roadmap step 8 ([`src/check.ts`](src/check.ts)). It runs every check above on one or more graphs and exits non-zero when there is a new finding nobody has decided. With no files it reads `civic.check.json`, which lists the graphs, the baseline and optionally which finding kinds block:

```json
{ "graphs": ["demo/card/out/resolved.graph.json"], "baseline": "civic.baseline.json", "blocking": ["open-conflict"] }
```

- **What blocks by default.** Findings that wait on a decision or undo one: an invalid graph, an open conflict, an override no conflict tracks, an approved exception past its `expires` date, a decided fix that failed or regressed ([the decision loop](#the-decision-loop)), failing evidence, a product state a design neither shows nor inherits, and a journey screen that is a dead end or unreachable. Recorded facts and evidence debt are reported as advisory: variants mapped to `none`, platform-only variants, no run evidence, unconfirmed links, screens a crawl discovered that nobody has confirmed (D34), stale evidence, approved exceptions, decided fixes not yet adopted or adopted but not verified, proposals waiting for a decision, and open [collaboration records](#collaboration-records).
- **Baseline.** Each finding has a stable key (kind, subject, platform and what tells it apart, such as the state). A baselined finding doesn't block, so old debt doesn't stop a change, and a new one is raised at the change that caused it. `--update-baseline` writes every current blocking finding to the baseline, which shows up in review as a diff. Findings that are gone are listed as fixed until the baseline is updated. An invalid graph can't be baselined.
- **Counts.** The report gives each check's count with its denominator, such as 1 of 4 conflicts open, never a score.
- **Status.** `--post` records the result as a `civic` commit status through the GitHub CLI, from a clean working tree, the way `bin/signoff` records `signoff`. There are no GitHub Actions.
- **Stale evidence.** Evidence proves the code at the revision it was captured at (roadmap step 6). A `freshness` rule in `civic.check.json` names a graph, the tools whose evidence proves code in this repository, and where that code lives. Evidence is stale when git shows a change there since its revision, uncommitted edits included, or when git doesn't know the revision. It's reported as advisory with a count, such as 0 of 27, and `civic screen` and the Contract panel mark it. Evidence pinned to an upstream release, such as Fluent's source, has no rule.

  ```json
  { "freshness": [{ "graph": "projects/laundry/out/graph.json", "tools": ["playwright"], "watch": ["journey-engine/source"] }] }
  ```

- **The change and the side that moved** (roadmap step 10, [`src/change.ts`](src/change.ts)). `--since <ref>` also runs the checks on the graphs as they were at the merge base of `<ref>` and HEAD, the last revision both shared, and lists only the findings this change introduced or resolved. Each introduced finding is traced to the side that moved: the records each side of a conflict rests on (its record and its evidence) are compared between the two revisions. The owners of the side that moved are **asked**, since the change is theirs to fix or decide; the other sides' owners are **told**. A side with no owners of its own, such as a design kit side backed only by a Figma export, takes the conflict's owners no other side claims. Recapturing evidence with the same result moves nothing. When neither side moved, as when a decision is withdrawn, everyone the finding names is asked. Stale evidence is left out of the comparison, since it is measured against the working tree. `--json` adds the result as `change`.
- **On the pull request.** `--comment <pr>` (with `--since`) puts that summary on the pull request as one comment, edited in place on every run and stamped with the commit it describes. `bin/signoff` does this for the branch's open pull request, against `CIVIC_BASE` (default `origin/main`).

  ```sh
  bin/civic check --since origin/main        # what this branch introduced, and who is asked and told
  ```

- **Library releases** (roadmap step 10, [`src/release.ts`](src/release.ts)). `civic release --since <ref>` treats every platform component whose record or extension points changed since the merge base as a release. For each one it lists the semantic variants left without a mapping (marking those that had one before), the new native variants no semantic variant covers, and the product overrides the release breaks: overrides whose forecast was `supported` before and isn't now. It also lists the overrides it makes expressible. The component's owners are asked, and each override's maker and instance owners are told. It exits 1 when a release breaks an override or unmaps a variant. `bin/signoff` prints it without gating, since the conflicts the gate raises are where someone decides a breaking release.
- **Dates.** Expiry is compared with today's date, or `--today <date>` for a repeatable run. The same graphs, date and checkout always give the same report.

A conflict counts as decided only when a Decision record is in force on it ([Decisions](#decisions)). An agent-written decision makes the graph invalid, so it never clears a finding.

## Commands

```sh
cd graph
pnpm install --frozen-lockfile
pnpm run check      # types
pnpm test           # validation, forecast, review, completeness, gate and boundary tests
pnpm run validate   # validate the example graphs
node src/cli.ts forecast examples/card-override.graph.json override:shop.order-summary.card.price-badge
node src/cli.ts overrides examples/card-override.graph.json instance:shop.order-summary.card
node src/cli.ts completeness examples/card-override.graph.json target:shop.checkout
node src/cli.ts gaps examples/fluent-button.graph.json
node src/cli.ts context examples/fluent-button.graph.json semantic:button --platform android --variant neutral-default
node src/cli.ts check ../demo/fluent-button/out/raised.graph.json     # fails: the brand outline conflict is undecided
node src/cli.ts fixes ../demo/fluent-button/out/resolved.graph.json   # the brand outline fix awaits adoption
cd .. && bin/civic screen target:laundry.intake.appliance                # one screen's journeys, paths, evidence and findings
cd graph
cd .. && bin/civic check                                             # the repository's gate
```

The package runs its TypeScript directly on Node 22.18 or later, with no build step. `bin/signoff` runs all of the above before the journey engine checks.
