# CIVIC graph schema

Storage is plain JSON files until the Button demo shows what storage it needs. The event log from [onboarding and ingestion](../docs/onboarding-and-ingestion.md#4b-how-data-gets-back-to-the-engine) comes later; a graph document here is the current state that log would produce.

## A graph document

```json
{ "schema": "civic.graph/0", "records": [ ... ], "links": [ ... ] }
```

Types are in [`src/schema.ts`](src/schema.ts). Two worked examples validate cleanly:

- [`examples/fluent-button.graph.json`](examples/fluent-button.graph.json) is the decision 0001 Button: one semantic Button, its React v9, iOS and Compose components with each variant's mapping, and an open Contract Conflict for the Android kit's Neutral default. It is hand-entered from decision 0001's table, so its source revision is `decision-0001` and its evidence is static. It stays as a small test fixture; the [Fluent Button demo](../demo/fluent-button) builds the same Button from read data with the [importers](../importers).
- [`examples/card-override.graph.json`](examples/card-override.graph.json) is an illustrative Card with web and iOS libraries, a product screen, an instance on it, and two overrides to forecast. The [Card demo](../demo/card) builds a fuller Card from Fluent's source and Figma exports.
- [`examples/review-loop.graph.json`](examples/review-loop.graph.json) is an illustrative review to agent loop on Example: a person, their agent and CIVIC as actors, main and a worktree line, three annotations (anchored, a path, and an unanchored screenshot), and one work request in each lane.

## Records

Every record has a stable ID, `<prefix>:<dot.separated.path>`, a title, and optional owners, source and former IDs.

| Kind | ID prefix | What it holds |
|---|---|---|
| Intent | `intent:` | A requirement, business rule or accessibility rule that stays true on every platform |
| Target | `target:` | A journey, screen, state, surface or product **component**, either **expected** (declared) or only **discovered** in source or by a crawl. A journey can name its `entry` and `exits` screens. A product component is a product's own shared component (decision 0011): the library instances inside it are placed on it once, and each screen that places it `contains` it, so the completeness check and an instance's review count them on every such screen. |
| Token | `token:` | A design token, identified by its DTCG path |
| Semantic component | `semantic:` | The platform-independent contract: purpose, variants, states, slots and contract rules. `productStates` are the states whose content depends on the product's data, such as loading, empty and error. |
| Platform component | `platform:` | One platform's implementation, with its `framework` (such as `react`, `web-components` or `uikit`), how each semantic variant maps (`exact`, `closest` or `none`), its default variant, and any variants no semantic variant covers |
| Extension point | `extension:` | A slot, prop, token, style API or theming hook on a platform component, and the semantic properties it can express |
| Component instance | `instance:` | A use of a component on a product's screen, from design or code, with the contract `state` it shows, any product states it `inheritsStates` from the default, and for a design instance the `library` it comes from (file, published key, and whether it was matched by key or by name) |
| Override | `override:` | A local change to an instance: added content, a changed property, a local style, or a detach |
| Evidence | `evidence:` | What a source shows, tied to the exact revision it read, in one evidence tier |
| Contract Conflict | `conflict:` | Two sources that disagree on a target, as the import raised it: the sides and their evidence, owners, and the state it was raised in |
| Decision | `decision:` | A person's call on a conflict: outcome, classification, the alignment state it leaves, who decided, rationale, evidence, and for an exception its revisit trigger and expiry. A later decision `supersedes` an earlier one. |
| Collaboration record | `collab:` | An ambiguity, constraint, coverage gap, divergence, risk or exception: what it affects, the perspectives it needs, owners, a deadline, and once closed, how it closed and the artifact changes that resulted. An exception also has user impact, a revisit trigger and an end date. |
| Actor | `actor:` | Who wrote something: a person, an agent acting for a named person, or CIVIC's own deterministic process |
| Line | `line:` | A stream of work with revisions: main, a branch, a worktree, a PR with its preview, a design draft, or a library release (a package version or a design library publish, which never merges) |
| Annotation | `annotation:` | A comment on a journey, screen, part of a screen, path or branch, with layered anchors, a frozen capture, and the line and revision it was made on |
| Draft choice | `choice:` | A person's choice between design drafts from one base: the chosen line and revision, and the drafts passed over, which are marked abandoned |
| Object | `object:` | A domain object from a designer's ORCA grid (OOUX, decision 0014): its description, other names, attributes (core content or metadata), calls to action and the objects nested in it. Design owns it. What a screen shows of it is on the `shows` link that ties them. |
| Environment | `environment:` | Where a product runs for people, such as staging or production (decision 0013): its URL, whether it serves the journey canvas, and which revision of which line runs there as last observed (`civic environment`) |
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

A link is a traceable claim between two records: `implements`, `serves`, `uses-token`, `navigates`, `contains` or `shows`. Every link has a status, as in the journey engine:

- **declared**: a person, manifest or explicit reference says so.
- **observed**: a confirmed run showed it. It needs passing automated or physical-device evidence.
- **inferred**: read from structure or names, and never counted.
- **proposed**: a candidate a person hasn't confirmed.

Only declared and observed links count for readiness. A `navigates` link follows the journey engine's cross-route actions (action, route, condition, return context). It can leave out `to` when the destination isn't mapped yet, and then it says what is known in `unmapped`, so the gap stays visible.

A `shows` link ties a target to an object (decision 0014). From a journey it says the journey needs the object. From a screen it can say which `view` of the object the screen is (`detail` unless named, or a team's own, such as `card` or `editor`) and which `attributes` and `actions` it shows, by the object's keys. Leaving them out means not declared, so the comparisons skip that screen, rather than "shows none".

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

## Design and code

A design instance comes from a design file and a `code` instance from product source (decision 0011). A code instance lists the extension points it `uses`, each with the contract property it expresses. `designAndCode` ([`src/implementation.ts`](src/implementation.ts)) compares them screen by screen, including the screen's states and the product components it places. It shows which design changes the code sets, which it doesn't, and what the code sets that the design shows without a change. Each design change carries its decision, so a rejected change missing from the code reads as correct. A use of an extension point no library in the graph declares, such as one a release removed, is a validation warning.

A **fork** is an instance whose `fork` says the product uses a copy of the library component there instead of the component (decision 0011, point 5): a detached frame or a local component copied from it in design, a copied or vendored component in code. Its `library.matchedBy` is `inferred`, because an importer found it by name and structure or by import, and `fork.basis` says what the match rests on. An inferred fork counts for nothing until a person confirms it: the gate reports it as an advisory `unconfirmed-fork`, and the completeness check and `designAndCode` leave it out of the component's uses (`designAndCode` lists copies on their own). A confirmed fork names who confirmed it and carries a `detach` override on property `component`, which no extension point ever expresses, so it goes through the forecast, a conflict and a decision like any other override. Promoting what the copy does into the library is the usual way out.

## Override forecasts

`forecastOverride` answers D29's question for each platform the screen ships on. Is the override **supported** by an existing extension point, does it **need a library change**, or is it **forbidden** by a contract rule? The answer is computed from the current graph rather than stored, and platforms are never merged into one answer. Neither are frameworks (decision 0011). If the screen declares the code libraries it builds with (`builtWith`: platform, framework and package), each library gets its own answer from the components in its package. Otherwise each framework the platform's components name gets one, so an Angular product never borrows React's slots. Only declared or observed `implements` links count, so a proposed mapping can't make an override look supported.

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

## Journey stories: `civic stories` and `civic portal`

Journey stories ([decision 0013](../docs/decisions/0013-journey-stories-replace-storybook.md), [`src/story.ts`](src/story.ts)) are the first slice of CIVIC replacing Storybook stories. Each journey that contains a screen gets one story, in a `civic.stories/0` file. A story only points: at its journey, its screens in the order a person meets them (along paths from the journey's entry, then the rest), and for each screen the evidence about it, its open collaboration records, the design frames that name it and whether the frame walk can play from it. Nothing is recorded or copied for a story, so it is never older than the graph.

`civic portal` ([`src/portal.ts`](src/portal.ts)) writes the stories as a read-only static site that opens from disk: an index with each story's passing, failing and unproven steps, and a page per story. Every step is a `<civic-story>` element ([`src/civic-story.js`](src/civic-story.js)), the story player any page can host. It renders in tiers and upgrades only when a person asks:

- **Still.** The step drawn from the graph (evidence, paths, design intent and open records) as HTML in a declarative shadow root, so its styles stay scoped and it shows without scripts.
- **Frame.** The step played in a sandboxed iframe: the frame walk opened at the step's frame where the design links the journey's frames, or, with `--canvas <url>`, the screen live in that running journey canvas's review frame (`review-frame.html?scenario=<id>`).

- **Island.** With `--island <module-url>` (the app's preview module built for the browser, exporting the `mount(container, context)` the canvas mounts screens with), `--island-style <css-url>` and `--manifest civic.project.json`, a screen the journey engine read runs live inside its step: the module is imported and mounted into the element's shadow root with its stylesheets, as the manifest's first persona, role and condition, with the scenario's fixture. There is no backend and nothing is recorded; state and transitions the screen reports become `civic-story-state` events. Each island imports its own module, so frameworks never share a runtime. Islands load as ES modules, so the portal must be served over HTTP; the other tiers open from disk.
- **Recorded runs.** With `--tapes <dir>` (tapes by SHA-256, as `civic share-replays` keeps them), each tape replayed from a step's screen gets a replay player ([`src/replay-player.ts`](src/replay-player.ts)): a page that plays the recording back step by step, showing what was done, the route, the visible headings, the fields and the writes. It marks the step where the latest replay diverged. It reads the tape and runs nothing again, so it works from disk and for any platform whose runs are recorded (decision 0009).
- **Expected state.** A journey says what must be true after a step in a `civic.expectations/0` file ([decision 0017](../docs/decisions/0017-journey-steps-declare-expected-state.md), [`src/expectations.ts`](src/expectations.ts)): for a scenario, the step (by number, or by gesture and target name) and what it must show, as a control by role and exact name (with its pressed, selected, checked, expanded or disabled state), a text, a marked component's state, or a route, each optionally `absent`:

  ```json
  { "schema": "civic.expectations/0", "scenarios": [{ "scenario": "chat.queue", "journey": "Edit a queued message", "steps": [
    { "after": { "gesture": "click", "target": "Open queued message" },
      "expect": [{ "role": "button", "name": "Add to queued message" }, { "role": "button", "name": "Add to chat", "absent": true }] } ] }] }
  ```

  `civic expect <expectations> <tape> [--scenario <id>]` reads a recorded run against it and prints what failed, such as `Step 2 (Clicked button “Open queued message”): expected a button named “Add to queued message” / but the step offered button “Add to chat”`, exiting 1. The importers' `readReplays` takes the expectations and the tapes by hash, so a replay that verified every step still fails, as failing evidence, when its tape misses one. A tape records headings, dialog and tab names, the controls each step offers (when recorded with discovery on), marked components and the route, not every word on screen, so a status text is checkable as a heading, a control's name or a component's state.

The portal also has a page per semantic component ([`src/component-page.ts`](src/component-page.ts), decision 0013 point 2). It shows the contract and each platform's implementation, with inferred ones marked as unconfirmed, and a table of how each platform maps every variant, where a variant nothing maps reads `none`. It lists the design library files instances take the component from, every product use in design and code with its overrides and copies, the journey steps whose screens use it (linked to the step), and its conflicts with where each decision stands. Each story step links back to the components its screen uses.

A component page also lists the component's code stories per platform ([`src/component-story.ts`](src/component-story.ts), decision 0013 point 1). Nobody writes them: there is one per variant the implementation maps, one for the disabled state on its default variant (the one contract state props alone can set), and one for each product use in code that the variants don't already show, each naming the uses that show it. Pass `harnesses` to `renderPortal`, by platform component ID, and a story renders the real component on request: the harness is a module whose `mount(container, context)` renders the component with `context.component` (its variant expression and state), the canvas's own mount contract. The Fluent Button demo's React harness is the first. Native stories stay stills until device runners. A team moving off Storybook imports its stories once (`readStorybookStories` in [`importers/`](../importers)) and passes them as `imported`: an imported story the contract or a product use already shows is pruned into that story as a reference, and one that sets more props (a shape, a size) stays a story of its own, with any prop no extension point declares, such as `className`, listed on it. Recorded runs add real usage (`usageFromTapes`): a tape whose steps list the components they showed (an app marks them with `data-civic-component` and friends) gives one usage story per way it showed a component, linked to the run steps, and the portal does this for the tapes it is given.

A portal can be read through a lens ([`src/lens.ts`](src/lens.ts), decision 0013 point 3): one design line, one code line and one environment, from the review store (`civic lines --json` prints them). With `--lens "design=<line>&code=<line>&environment=<id>" --lines <file>`, each step adds what it looks like through the lens: the design line's frames that design the screen and whether each changed from the line's base, the run evidence taken on the code line's head or one of its previews (runs from other lines are set aside and counted), and whether the environment runs the code line at its head or behind it. An environment that serves the journey canvas gives each screen a frame to play it there. The lens goes into each story's link and each `<civic-story>`'s `lens` attribute. A library release is a line too (`civic release-line`), so a code line can be a package version.

## The object map: `civic objects`

The object map ([decision 0014](../docs/decisions/0014-design-methodologies-are-profiles.md), point 8, [`src/objects.ts`](src/objects.ts)) asks a designer's object-first questions of what was built, from object records and the `shows` links that tie targets to them. Only declared and observed ties count; a tie CIVIC suggested from a screen's name waits for a person to confirm or dismiss it.

- **An object a journey needs that none of its screens shows** (`object-not-shown`), naming any suggested tie on those screens that would answer it once confirmed.
- **An attribute shown on one screen of an object and missing from another** (`object-attribute-missing`). Screens are compared only with screens of the same view, since a card shows less than a detail screen on purpose, and only where they declare their attributes.
- **A call to action one platform offers on an object and another doesn't** (`object-action-platform`), once screens on two or more platforms declare the object's actions.
- **An action with no way back** (`object-action-no-inverse`, [decision 0015](../docs/decisions/0015-actions-need-a-way-back.md), [`src/inverses.ts`](src/inverses.ts)). An action that makes or starts something needs one that undoes it: add needs remove or archive, archive needs restore, send or queue needs cancel or edit, start needs stop, and so on for pin, open, connect, install, sign in and enable. An action declares its `kind` (the ORCA grid writes `Add project [add]`), so the check works in any language; with none, the title's words are read from a bundled English list. The inverse may be another action of the object or a control a crawl saw on a screen that shows it, even one the crawl blocked as destructive, since "Remove project" never clicked still proves it exists. An action a decision made deliberately one-way carries `oneWay: { decision, reason }` (in the grid, `Add forever [add; one-way docs/decisions/0042.md: Permanent records]`) and isn't a finding. A project teaches CIVIC its words and changes what a kind needs under `actions` in `civic.check.json`:

  ```json
  { "actions": { "labels": { "ta bort": "remove" }, "inverses": { "start": ["pause", "stop"] } } }
  ```
- **A suggested tie waiting for a person** (`unconfirmed-object-tie`).

The gate reports all five as advisory, to the object's Design owners with the screens' or platform's owners told, and counts each against what was compared. `civic objects <file>` prints the map: each object with how many screens show it, how many ties are suggested and how many journeys need it, then the findings.

## Methodology profiles: `civic method`

A team says which design methodology it follows in a `civic.method/0` file ([decision 0014](../docs/decisions/0014-design-methodologies-are-profiles.md), [`src/method.ts`](src/method.ts)). The graph stays neutral: no tier names go in it, and a methodology is a reading of what it already records, what contains what and which tokens a component reads. With no profile declared, nothing here runs.

- **Bundled profiles.** [`methods/`](methods) ships Atomic Design (`atomic-design`: atoms, molecules and organisms hold components, templates hold screens, with Atomic's rules on which may contain which) and token tiers (`token-tiers`: primitive, semantic and component tokens, with components and their implementations reading only semantic or component ones). Neither is the default. A team's file names one in `extends` and takes its tiers and rules, or gives its own tiers and rules for an in-house methodology.
- **Placement is declared.** A tier holds `components` (semantic components and product `component` targets), `screens` or `tokens`. When only one tier holds a kind, as templates hold screens, the profile's rule places every one. Otherwise the owners place targets by ID, or tokens by path prefix, each placement naming who declared it. States and surfaces have no tier: composition looks through them to what they place, and a component instance counts as its semantic component.
- **Composition** (`tier-composition`): a tiered target that contains a target in a tier its rule doesn't allow, such as a molecule containing a molecule.
- **Token tiers** (`token-tier`): a component or implementation that reads tokens past its tier, one finding per tier it reaches, with an extension point's reads counted as its implementation's. A rule for a tier wins over the rule for its kind.
- **No tier** (`no-tier`): a target the profile's tiers hold that nobody has placed. Where the graph records what a product component contains, CIVIC suggests the lowest tier whose rule allows all of it, and the suggestion counts only once an owner declares it. It suggests nothing for a library's semantic component, whose contents the graph doesn't record, nor while something it contains has no tier.

All three are advisory in the gate, to the target's owners and the profile's, since tier boundaries are judgment calls; a team that wants one to block lists it under `blocking`. A placement that names a missing record, a record the tier can't hold, or one record in two tiers is an invalid declaration and fails the gate. `methods` in `civic.check.json` names the profiles for each graph:

```json
{ "methods": [{ "graph": "demo/card/out/resolved.graph.json", "profiles": ["demo/card/contract/method.json"] }] }
```

## Contract export

Two read-only queries over a graph (D31). Both are deterministic and print Markdown, or JSON with `--json`.

- **`civic context <graph> <semantic-id> --platform <p> [--variant <key>]`** prints one work order: intent, states, slots, the platform's mapping and default, the other platforms' mappings, tokens, extension points, conflicts with their decisions, evidence by tier, acceptance, and the IDs to put in code ([`src/context.ts`](src/context.ts)).
- **`civic gaps <graph> [--scope <semantic-id>] [--platform <p>]`** lists what's expected but missing, each with owners: open conflicts, missing variants, missing product states in designs, platform-only variants, failing evidence, platforms with no run evidence, unconfirmed links, and approved exceptions with their revisit triggers ([`src/gaps.ts`](src/gaps.ts)).

## One screen: `civic screen`

`civic screen <target-id> [<file>...] [--json]` answers what the graphs know about one screen ([`src/screen.ts`](src/screen.ts)): the journeys that contain it, its paths on and whether they count, the evidence about it, and the gate's findings on it, its evidence or an open [collaboration record](#collaboration-records) about it (such as a coverage gap), each marked as blocking, advisory or held by the baseline, and which evidence is stale. With no files it reads the graphs and baseline in `civic.check.json` and uses the first graph that has the screen. It is how a viewer reads the graph: the journey canvas's Contract panel shows it for the selected screen (decision 0004). A `designs` list in `civic.check.json` names design files (`civic.design/0`), and the frames that name the screen are listed under Design: the viewports, themes and text scales the design shows it at. They are design intent, shown beside the runs and never counted as evidence. Example's Open Design reference is configured this way.

## The gate: `civic check`

`civic check` is roadmap step 8 ([`src/check.ts`](src/check.ts)). It runs every check above on one or more graphs and exits non-zero when there is a new finding nobody has decided. With no files it reads `civic.check.json`, which lists the graphs, the baseline and optionally which finding kinds block:

```json
{ "graphs": ["demo/card/out/resolved.graph.json"], "baseline": "civic.baseline.json", "blocking": ["open-conflict"] }
```

- **What blocks by default.** Findings that wait on a decision or undo one: an invalid graph, an open conflict, an override no conflict tracks, an approved exception past its `expires` date, a decided fix that failed or regressed ([the decision loop](#the-decision-loop)), failing evidence, a product state a design neither shows nor inherits, and a journey screen that is a dead end or unreachable. Recorded facts and evidence debt are reported as advisory: variants mapped to `none`, platform-only variants, no run evidence, unconfirmed links, [methodology findings](#methodology-profiles-civic-method), screens a crawl discovered that nobody has confirmed (D34), controls a crawl took that changed nothing (`control-no-effect`, [decision 0016](../docs/decisions/0016-a-control-that-changed-nothing-is-reported.md)), forks an importer inferred that nobody has confirmed (decision 0011), stale evidence, approved exceptions, decided fixes not yet adopted or adopted but not verified, proposals waiting for a decision, and open [collaboration records](#collaboration-records).
- **Baseline.** Each finding has a stable key (kind, subject, platform and what tells it apart, such as the state). A baselined finding doesn't block, so old debt doesn't stop a change, and a new one is raised at the change that caused it. `--update-baseline` writes every current blocking finding to the baseline, which shows up in review as a diff. Findings that are gone are listed as fixed until the baseline is updated. An invalid graph can't be baselined.
- **Counts.** The report gives each check's count with its denominator, such as 1 of 4 conflicts open, never a score.
- **Status.** `--post` records the result as a `civic` commit status through the GitHub CLI, from a clean working tree, the way `bin/signoff` records `signoff`. There are no GitHub Actions.
- **Stale evidence.** Evidence proves the code at the revision it was captured at (roadmap step 6). A `freshness` rule in `civic.check.json` names a graph, the tools whose evidence proves code in this repository, and where that code lives. Evidence is stale when git shows a change there since its revision, uncommitted edits included, or when git doesn't know the revision. It's reported as advisory with a count, such as 0 of 27, and `civic screen` and the Contract panel mark it. Evidence pinned to an upstream release, such as Fluent's source, has no rule. When the code is in another repository, as Example's is ([decision 0010](../docs/decisions/0010-project-dependency-boundary.md)), the rule names it under `checkout`, with an environment variable that holds the path to a checkout of it; `watch` is then relative to that checkout. With the variable unset there's nothing to compare with, so no evidence is called stale, and the gate prints how old the newest capture is and which variable to set.

- **The change and the side that moved** (roadmap step 10, [`src/change.ts`](src/change.ts)). `--since <ref>` also runs the checks on the graphs as they were at the merge base of `<ref>` and HEAD, the last revision both shared, and lists only the findings this change introduced or resolved. Each introduced finding is traced to the side that moved: the records each side of a conflict rests on (its record and its evidence) are compared between the two revisions. The owners of the side that moved are **asked**, since the change is theirs to fix or decide; the other sides' owners are **told**. A side with no owners of its own, such as a design kit side backed only by a Figma export, takes the conflict's owners no other side claims. Recapturing evidence with the same result moves nothing. When neither side moved, as when a decision is withdrawn, everyone the finding names is asked. Stale evidence is left out of the comparison, since it is measured against the working tree. `--json` adds the result as `change`.
- **Story differences** (decision 0013 point 4, [`src/story-diff.ts`](src/story-diff.ts)). With `--since`, the summary also shows the change as differences in the stories each role reads. A component that moved (its contract, an implementation, an extension point, a product use or an override) lists every journey step whose screen uses it and the code stories it adds or removes. A journey step lists when it is new or gone, when its outcome changed (it now fails, or now passes), or when its screen or a component it uses moved. Sources are ignored, so a recapture with the same results shows nothing. `--json` adds them as `change.stories`.
- **On the pull request.** `--comment <pr>` (with `--since`) puts that summary on the pull request as one comment, edited in place on every run and stamped with the commit it describes. `bin/signoff` does this for the branch's open pull request, against `CIVIC_BASE` (default `origin/main`).

  ```sh
  bin/civic check --since origin/main        # what this branch introduced, and who is asked and told
  ```

- **Library releases** (roadmap step 10, [`src/release.ts`](src/release.ts)). `civic release --since <ref>` treats every platform component whose record or extension points changed since the merge base as a release. For each one it lists the semantic variants left without a mapping (marking those that had one before), the new native variants no semantic variant covers, and the product overrides the release breaks: overrides whose forecast was `supported` before and isn't now. It also lists the overrides it makes expressible. The component's owners are asked, and each override's maker and instance owners are told. It exits 1 when a release breaks an override or unmaps a variant. `bin/signoff` prints it without gating, since the conflicts the gate raises are where someone decides a breaking release.
- **Dates.** Expiry is compared with today's date, or `--today <date>` for a repeatable run. The same graphs, date and checkout always give the same report.

A conflict counts as decided only when a Decision record is in force on it ([Decisions](#decisions)). An agent-written decision makes the graph invalid, so it never clears a finding.

## Commands

The package runs its TypeScript directly on Node 22.18 or later, with no build step. `bin/signoff` runs all of the above before the journey engine checks.
