# CIVIC roadmap

Ordered next steps after [decision 0004](decisions/0004-graph-first-journey-engine-as-viewer.md). The artifact graph is the core, and the journey engine is one viewer and the first web adapter. Each step should end with evidence, not a claim.

Every step follows [decision 0006](decisions/0006-deterministic-civic-for-agentic-teams.md): CIVIC makes no model calls and works from existing non-AI tools and static analysis. [Decision 0007](decisions/0007-review-to-agent-loop.md) lets agents outside CIVIC claim and report work through a narrow interface.

## Order of work

Reprioritized on 2026-10-13. The 2026-10-12 order is built: step 10's checks in each role's tools, design drafts as review lines, step 3's collaboration records and alignment states, and the frame walk (D33) as `civic walk`. What it left is the canvas showing the walk. Step numbers are stable names that other documents cite, so the order of work is listed here rather than by renumbering:

1. **Finish the v11 port.** Live runs switch accounts, go offline and recover, and change viewport on one tape ([step 4](#4-the-journey-engine-as-a-graph-viewer)). Before it merges, Laundry's product end-to-end suite and `bin/signoff --browser` run on it, because v11's sheet shows its discard prompt as its own dialog, which may affect product specs.
2. **A design input for Laundry.** Laundry's design system is kept in Claude Design and Open Design, not Figma, so design drafts, the design lens, the frame walk and the completeness check run only on the Fluent demos today. Read Laundry's reference (its tokens, components and React frame exports with their receipts) as design lines, so those checks run on the real product. Figma stays one design input among several ([onboarding and ingestion](onboarding-and-ingestion.md)). *Built:* any design tool's file can be a design line through a `civic.design/0` file, and Laundry's Open Design source-render reference is one: [`projects/laundry/out/design.json`](../projects/laundry/out/design.md), 134 frames designing 76 of Laundry's screens. Still to come: newer references and proposals from Claude Design as drafts, and Laundry's tokens.
3. **The frame walk in the canvas** ([step 4](#4-the-journey-engine-as-a-graph-viewer)), beside a screen's runs, on Laundry's frames rather than the Card demo's. *Built for Laundry as frames beside runs:* Laundry's reference frames have no prototype links to walk, so `civic screen` and the Contract panel list the design frames that name the selected screen next to its run evidence. A walk for Laundry waits on a linked prototype.
4. **Decide the recording record** ([step 6](#6-journey-completeness-and-replay)): whether the engine's recorder tape becomes CIVIC's recording record, now that account switches, offline steps and viewport changes live on it. *Decided:* [decision 0009](decisions/0009-recorded-runs-as-evidence.md) keeps the tape as the engine's recording and makes a replay of it run evidence. *Built:* the canvas keeps each finished replay as a `civic.replay/0` record, and `readReplays` turns it into `runtime` evidence about the screen the run starts from. `civic share-replays` keeps those replays and their tapes in the local store, and `civic sync` shares them with the team, so Laundry's capture counts replays others made at the same commit.
5. **[Step 7](#7-repository-hygiene)** happens opportunistically.

Waiting on something other than a build:

- **A device.** The first native crawl and native captures (steps 4 and 6) need a device or simulator. The cloud has none, so the iOS crawl runs on the founder's Mac. A runtime and data adapter for native apps follows it.
- **A hosted remote.** Presence, following and shared driving ([step 5](#5-identity-permissions-and-multiplayer)) need a live service; records sync through git today.

The Figma plugin, and with it findings on a Figma frame, moved to [later](#later-not-scheduled) until a team that designs in Figma uses CIVIC. The design input for Laundry comes before the canvas walk because a walk of a demo's frames shows nothing about the product CIVIC is checking.

## 1. CIVIC graph schema

Define a small, CIVIC-owned schema outside `journey-engine/` for Intent, Semantic component, Platform component, Component instance, Override, Extension point, Evidence, and Contract Conflict (D29). Instances, overrides, and extension points let CIVIC forecast at design time whether a product team's change to a library component is supported on each platform ([component change flow](component-change-flow.md)). Use stable identities and the alignment states from the [spec](product-spec.md#alignment-states). Keep it plain and file-based until the demo shows what storage it needs.

Reuse the journey engine's distinctions rather than inventing new ones: a connection is declared, observed, inferred, or proposed, and a target is either expected or only discovered in source. Its cross-route actions (`journey-engine/source/apps/web/src/review/route-actions.json`) show the edge shape: route, condition, return context, and whether the destination is mapped. The schema copies these ideas; it never imports the engine.

Built in [`graph/`](../graph): schema v0 types, a validator for the spec's identity, evidence and conflict rules, per-platform override forecasts, and two example graphs (the decision 0001 Button and an illustrative Card). `bin/signoff` runs its checks.

## 2. Fluent 2 Button conflict demo

Build the [decision 0001](decisions/0001-fluent-2-demo-design-system.md) demo on that schema:

- One semantic Button with its variants mapped to Fluent React v9, iOS, and Android Compose.
- Web evidence from Storybook and Playwright. iOS and Android evidence from source and token analysis.
- The Android Figma kit compared with Compose, which raises a Contract Conflict that is classified, given owners, and resolved.
- Tokens move as DTCG where the source supports it. Read Figma structure from a file export; the Variables REST API needs Enterprise access, so the demo can't depend on it.

A design-system Card changed by a product team is the second demo after Button.

Also part of this step ([decision 0006](decisions/0006-deterministic-civic-for-agentic-teams.md)):

- **Contract export (D31).** `civic context` prints the Android Button variant's contract as one work order: intent, states, mappings, tokens, extension points, open records, and the IDs to put in code. `civic gaps` lists what's missing, with owners. Both are read-only queries.
- **Design completeness check (D32).** On the Card demo, static rules flag the states the product team's Card mock is missing (for example empty and error) from the Card contract and the journey's shape.

The demo succeeds when a reviewer can see what disagrees, why it matters, who must act, and how the decision is preserved.

Built in [`demo/fluent-button/`](../demo/fluent-button) on the importers in [`importers/`](../importers). The Button's web, iOS and Android mappings are checked against Fluent's own source at pinned revisions. Web has 13 passing Playwright checks against DTCG token values; iOS and Android have static evidence only. A Figma-export-shaped stand-in for the Android kit raises the Neutral default conflict, and an illustrative decision resolves it as an approved exception. `civic context` and `civic gaps` are in the graph CLI. Native runs are still to come.

Progress, 2026-10-11: the Button's web evidence now also comes from Fluent's own Button stories, vendored from the React v9 repository at the release the demo pins and built in Storybook. 13 Playwright checks open those stories and record `storybook` evidence: every mapped appearance is shown with an accessible name and rests on its DTCG token, the Default story is the neutral default, and the Disabled story's `disabled` and `disabledFocusable` buttons behave as the contract says.

The Card demo is built in [`demo/card/`](../demo/card), on Fluent's real Card libraries: React `Card` (flexible, with slots), iOS `CardView` (a brittle UIKit widget) and Android `BasicCard` (one content slot). A product design for Shop changes the Card in four ways. `civic overrides` forecasts each change per platform, raises it as unreviewed drift, and names who is asked and who is told. Illustrative decisions reject one change, approve a temporary exception, promote one into the system and leave one undecided. `civic completeness` is the D32 check: it finds the Card's missing empty and error states, a dead-end screen and an unreachable screen in the journey, as counts with denominators. Both Figma files are stand-ins in the REST export shape, and all evidence is static. Accessibility intent in designs isn't checked yet.

## Next: the review to agent loop

Built ahead of the Card demo ([decision 0007](decisions/0007-review-to-agent-loop.md), [review to agent](agent-review-loop.md)):

1. **Records.** Line, Annotation, WorkRequest, and Actor go into the graph as the start of step 3. Built in [`graph/`](../graph#the-review-to-agent-loop), with validation for D35 to D38, `laneFor` and `resolveAnchor`.
2. **A first slice on the journey engine with Laundry.** Records move from each worktree's `.review-data/` to the git common directory. Annotations get ID and locator anchors, and screenshot import arrives. The canvas gets a lens to switch between worktrees. The CLI gets `civic annotate`, `requests`, `claim`, `report-fix`, and `repro`, with the resolution policy's Auto, batch review, and owner sign-off lanes. Then come the capture overlay for dev and preview builds, the MCP server, and the Claude Code plugin. The store, the CLI and CIVIC's re-capture are built in [`review/`](../review), with the acceptance below as an end-to-end test on a repository with a linked worktree. Laundry's review now records each canvas note as a shared annotation, anchored to the scenario's target or to the element's role and name, and can hand annotations to agents. Its "Across lines of work" section is the first lens. Re-capture signs in to the review server with its local key. The capture overlay (`civic overlay`, injected into Laundry's dev build by `VITE_CIVIC_OVERLAY`), the MCP server and the [Claude Code plugin](../integrations/claude-code) complete the slice.
3. **PR previews and design drafts** follow, once real Figma exports ([step 9](#9-real-inputs-replace-the-stand-ins)) bring drafts in. Codex packaging can come earlier, since it only repackages the MCP server. These come after the gate, the Decision record and real inputs (see [order of work](#order-of-work)).

   Progress, 2026-10-12: Codex packaging is built. The [plugin](../integrations/claude-code#codex) carries a Codex manifest next to the Claude Code one, so Codex installs it from the same marketplace with the same skill and hook, and runs the MCP server as `codex`. PR previews and design drafts wait on real Figma inputs.

   Progress, 2026-10-12: PR previews are built. `civic pr <number> --preview <url>` (or the MCP `register_pr` call an agent makes after opening one) records a pull request as its own line at the head its remote serves (`refs/pull/<n>/head`), with its hosted preview. Annotations made on that preview land on the PR's line and revision, and fixes can be re-captured there. Running it again follows the PR as it moves, and it marks the line merged once the head is on the default branch. Design drafts were waiting on real Figma inputs, which are now in ([step 9](#9-real-inputs-replace-the-stand-ins)), so they are next in this item.

   Progress, 2026-10-12: design drafts are built. `civic design` and `civic draft` read a Figma file export as a design line or a draft branched from it, and list the draft's frames. Annotations on a draft frame anchor by Figma node ID and stay on that draft; registering a new version says which annotated frames are still there. A person chooses between drafts with `civic choose-draft`, which writes a draft choice and marks the other drafts abandoned. See [the review store](../review#lines). The design lens is built: `civic lens <draft>` compares a draft's frames with its base by node ID and content fingerprint, and reads each changed frame on the checkout's code line through the graphs that anchor targets to the same Figma nodes. Laundry's review shows it for the selected draft, and names the other open lines (drafts, and code lines with a claimed request) changing the screen under review. See [the review store](../review#lines).

Acceptance: an annotation made in one worktree is claimed by an agent in another, the reported fix is re-captured on that worktree's preview with no model call, and the request resolves through its lane.

## 3. Typed contract and change records

Start with the Decision record alone, because the gate (step 8) needs a stored, owned decision to stop flagging a conflict a person already decided. Then store Proposal, Adoption, and Verification as separate, owned records, along with the collaboration record types (Ambiguity, Constraint, Coverage gap, Divergence, Risk, Exception). Alignment states read from records instead of being recomputed.

The journey engine already has working examples: `coverage.json` is a Coverage gap record with versioned write-back, and its coverage candidates are proposals that never count as adoption.

The Decision record is built in [`graph/`](../graph#decisions). A conflict keeps what the import raised, and its status, classification and alignment state are read from the Decision in force on it. A changed call supersedes the earlier decision instead of overwriting it, and an agent can't write one (D35). Each demo keeps its decisions in a `civic.decisions/0` file next to its contract, and `civic decide` records a new one after checking it against the graph. The gate counts a conflict as decided only when a Decision is in force on it, so the Button's brand outline conflict fails on the raised graph and passes once its decision is recorded.

Progress, 2026-10-12: the decision loop is built ([`graph/`](../graph#the-decision-loop)). Proposal, Adoption and Verification are separate records in the same decision file, written by `civic propose`, `civic adopt` and `civic verify` after a check against the graph. A decision names the proposal it approves, and an `update-contract` decision must approve one. Each decided fix has a stage read from its records: awaiting adoption, adopted, verified (the conflict then reads aligned), failed or regressed. The gate re-checks every fix on every run. It blocks when an import that read the adopted revision still raises the conflict, when a verification fails, and when evidence a verification cited fails later; unadopted and unverified fixes and undecided proposals are advisory. A re-import that no longer raises an adopted conflict settles it, and its records stay in the file as history. Agents may propose and record an adoption but never verify (D35). The collaboration record types (Ambiguity, Constraint, Coverage gap, Divergence, Risk, Exception) are still to come.

Progress, 2026-10-12: collaboration records are built ([`graph/`](../graph#collaboration-records)). The six types are one owned record kind kept in the decision file. Each record names what it affects, the perspectives it needs, its owners, a deadline, and once closed, how it closed and the artifact changes that resulted. `civic raise` and `civic close` write them after a check against the graph. Agents may raise them but not record an exception or close a record (D35). The gate reports open records as advisory and fails an exception past its end date. `civic gaps` lists them with owners. The journey engine's `coverage.json` is imported as Coverage gap records: Laundry's graph raises one for each declared expectation that no passing run covers yet ([`projects/laundry`](../projects/laundry#how-the-graph-is-built)).

Progress, 2026-10-12: alignment states are read from records. `civic alignment` gives each semantic component one state on each platform that implements it, from its conflicts and the decisions in force, the fix stages, exceptions and accepted limitations, and its evidence. A platform without a passing run is unknown, never aligned. See [`graph/`](../graph#alignment-civic-alignment).

## 4. The journey engine as a graph viewer

Point the journey engine's canvas and Contract panel at the graph, with Laundry as one web adapter. Generalize the `@civic/shell` adapter boundary now that Fluent is a second consumer ([decision 0003](decisions/0003-civic-shell-package.md) was paused until then). Follow the v4 handoff's onboarding direction: a local project manifest plus a supported web adapter.

Discover the app by crawling first (D34): one CIVIC crawl loop, on Playwright for web and Appium for native, explores from seeded fixtures with destructive actions blocked, and groups states by DOM or accessibility hierarchy. Crawled states come in as discovered until a person confirms them. Write or generate an adapter only where a crawl can't tell states apart, reach them, or reset them. Add the frame walk (D33): the scenario player walks imported design frames along their prototype links, labelled as design intent.

Validate onboarding with two cases ([onboarding and ingestion](onboarding-and-ingestion.md#6-validating-onboarding)): the Fluent Button, and Laundry's five unmapped destination states brought in through the manifest as expected states.

Acceptance: a second small web app connects without importing Laundry code, unsupported features stay visibly unavailable, and source refresh, capture, and replay make zero model calls with providers disabled.

Progress, 2026-10-12: the v6 handoff of the journey engine brings a project manifest (`rehearsal.project.json`), a project picker, static discovery for existing apps with a confirm step, and two example apps that don't import Laundry ([v6 notes](synthesis-v0-import.md#v6-handoff-update)). What step 4 still needs: the canvas reading the CIVIC graph back (the [Laundry graph](../projects/laundry) now carries the engine's journeys into it), crawl-first discovery (D34), and the frame walk (D33).

Progress, 2026-10-12: crawl-first discovery is built for web. CIVIC's [crawl loop](../crawl) explores an app breadth first on Playwright, groups states by accessibility tree, blocks destructive actions and non-GET requests, and fills only allowlisted inputs. It onboarded the engine's manifest-free example as a [second app](../projects/discovery-app): 4 screens and 6 paths, all discovered until a person confirms them in a confirmation file, which can also declare journeys for the shape checks. The gate reports unconfirmed screens as advisory. Still to come: an Appium driver for native and the frame walk (D33).

Progress, 2026-10-12: the canvas reads the graph. `civic screen` answers what the graphs know about one screen, and the journey canvas's Contract panel shows it for the selected screen: run evidence with the failing tests, paths on, and the gate's findings marked new or baselined. The engine runs CIVIC's CLI for it, as it does for shared annotations, so neither imports the other.

Progress, 2026-10-12: the crawl has a native driver. It speaks WebDriver to an Appium server (UiAutomator2 for Android, XCUITest for iOS), reads each state from the page source as roles and accessible names, starts every try in a fresh session, and records but doesn't explore another app it lands in. It is tested against a stand-in server on Android and iOS sources and against a real Appium 3 server with Appium's fake driver. No emulator or device runs in the cloud, so no native app has been crawled yet. Native crawls can't block network writes the way the web driver does, so they need a test build. Still to come: a first native crawl on a device or emulator, and the frame walk (D33).

Progress, 2026-10-12: the v7 handoff of the journey engine mounts the real Laundry app in review with real effects in an isolated backend per run, records runs with one shared recorder, and proposes splitting adapters into a build connector, a runtime and data adapter, and an interaction driver ([v7 notes](synthesis-v0-import.md#v7-handoff-update)). CIVIC's crawl drivers (Playwright and Appium) are its interaction drivers; a runtime and data adapter for native apps is still to come.

Progress, 2026-10-12: the build connector is a package. [`@civic/vite-connector`](../journey-engine/source/packages/vite-connector) holds the Vite plugin, the project manifest and picker, discovery, the review index, fixture fingerprints and the coverage bridge, and imports only Node, Vite and `@civic/shell`. Laundry is one connector registered by the host (kind `laundry`); a plain `module` app connects through the package with no app connector, which its checks prove. Still to come: the canvas UI outside the Laundry monorepo host, and a runtime and data adapter beyond Laundry's Convex.

Progress, 2026-10-12: the canvas runs on its own. [`@civic/canvas`](../journey-engine/source/packages/canvas) holds the journey canvas UI, its frame entry, the Notebook example and a standalone host (`civic-canvas --project <app>/civic.project.json`) that keeps its store outside the app. Laundry-only layout and the towel journey's guided run reach the canvas through a canvas extension that Laundry's connector supplies; a module app gets CIVIC's own layout. Still to come: a runtime and data adapter beyond Laundry's Convex.

Progress, 2026-10-12: live runs work beyond Laundry's Convex. The run service is in `@civic/canvas`, and an app whose screens call their own HTTP API runs against an isolated copy of that API per run: its `fetch` calls are routed to the app's real handler over seeded in-memory data, with a fixed clock, and writes are recorded and checked on replay. The [Tasks example](../journey-engine/source/packages/canvas/examples/tasks) proves it in a browser check. Still to come: an auth adapter.

Progress, 2026-10-12: TanStack Start server functions run live too. In the preview, each `createServerFn` call goes to the run (GET as a query, POST as a recorded mutation); in the run's worker the app's own handlers, middleware and validators execute against that run's module state. The page never loads a handler or a module only handlers use. The [Reading list example](../journey-engine/source/packages/canvas/examples/reading-list) proves it in a browser check.

Progress, 2026-10-12: apps with sign-in run live too. Personas carry synthetic review identities (reserved example domains only), each run gets a fresh credential and starts signed in through the app's own sign-in, and the session stays in the run. Password fields are filled with the credential and recordings hold only a placeholder. The [Team board example](../journey-engine/source/packages/canvas/examples/team-board) proves it in a browser check.

Progress, 2026-10-12: live runs change context without leaving the run. The v11 port ([notes](synthesis-v0-import.md#v11-port-accounts-offline-and-viewport)) adds same-run account switching, actual offline with saved steps a person resends, durable run journals, and viewport, fold, orientation, theme and text-size steps, all on the run's one tape. The Team board example and Laundry's 1,000-piece family day prove it in browser checks.

Progress, 2026-10-12: the frame walk (D33) is built in [`graph/`](../graph/README.md#frame-walk-civic-walk). `civic walk` steps through a journey's design frames along their Figma prototype links. For each frame it shows the components, their overrides with per-platform forecasts, the state frames, and links that leave the design. It marks dead ends and unreachable frames, and labels everything as design intent. `--path` scripts a walk, and `--html` writes a self-contained page that plays it. The Card demo builds one for Shop's checkout ([`demo/card/out/walk.html`](../demo/card/out/walk.html)). Still to come: the journey canvas showing the walk beside a screen's runs.

## 5. Identity, permissions, and multiplayer

Real identities, scoped permissions, and versioned shared records, following the spec's [multiplayer boundary](product-spec.md#multiplayer-and-ownership). The single local access key and the portal's collaborator access are not this model.

Progress, 2026-10-12: shared records are versioned and permissions are scoped. Each work request counts its changes. A write that names the version it read (`<id>@<version>`, as `civic requests` and `civic queue` print it) is refused if the request changed since then, naming the change, and nothing is written. `civic.access.json` on the default branch gives each person the read, write, approve and resolve scopes. An agent has its person's scopes, and the graph's rules still stop it from resolving. Still to come: the team-wide store, which brings authenticated identities.

Progress, 2026-10-12 ([decision 0008](decisions/0008-team-records-on-a-git-ref.md)): `civic sync` shares each person's store with the team through `refs/civic/records` on the repository's remote, behind a remote interface that a hosted service can implement later. The merge goes record by record. Comments made at once are both kept, and any other change made on both sides is set aside as a conflict for a person to settle. Shared changes are checked against `civic.access.json` before they're merged. Progress, 2026-10-12: signed syncs. `civic keygen` gives each person an Ed25519 key, and `civic.access.json` lists their public keys. Once any key is listed, a shared sync counts only when a key listed for the person it names signs it. The trailer stops being a mere claim. Still to come: presence, following and shared driving, once there's a live remote.

## 6. Journey completeness and replay

Add fixture capture to `bin/signoff` so evidence can be regenerated and becomes visibly stale. Then add replay from start to the scenario player, and native captures as runners allow.

Discovery and replay are deterministic by default. Record journeys with existing Playwright tooling (Codegen, the reporter API, traces) instead of building a recorder, and replay only verified paths, stopping visibly on a miss. Report counts and denominators rather than confidence percentages. CIVIC makes no model calls (D30).

Acceptance: ordinary refresh and replay make zero model calls with providers disabled, and failed or cancelled operations never become successful edges.

Progress, 2026-10-12: evidence becomes visibly stale. A freshness rule in `civic.check.json` says which evidence proves code in this repository and where that code is. The gate reports evidence whose code changed since its revision as advisory, with a count, and `civic screen` and the journey canvas's Contract panel mark it. `bin/signoff --capture` recaptures Laundry's evidence when it's stale and stops so the new evidence is reviewed and committed. Still to come: replay from start in the scenario player, and native captures.

Progress, 2026-10-12: replay from start is built for project adapters. In the Inspect panel, "Replay from start" opens a fresh run at the journey's first screen and walks the shortest chain of declared paths to the selected screen, clicking each path's action by its accessible name and waiting for the adapter to land where the path says. A missing control or a wrong landing stops the replay with an alert naming the step, and nothing past it is claimed. Only the app's own transitions are captured, so a failed save never becomes an edge. Laundry's towel journey keeps its own player. Still to come: native captures.

Progress, 2026-10-12: the v7 handoff adds a deterministic recorder with saved, downloadable runs that replay from the same seed and stop on drift ([v7 notes](synthesis-v0-import.md#v7-handoff-update)). It is the engine's own recorder rather than Playwright's tooling; whether its tape becomes CIVIC's recording record is open.

## 7. Repository hygiene

- Done: the repository is on GitHub at [taymoork2/CIVIC](https://github.com/taymoork2/CIVIC), with local signoffs (`bin/signoff`) instead of GitHub Actions.
- Done, 2026-10-12: `rehearsal/` is now `journey-engine/`. Rehearsal stays only as the engine's codename and in the vendored handoff files.
- Done, 2026-10-12: the handoff material stays vendored (Taymoor's call). `journey-engine/design/skills` (2.7 MB), the fixture PNGs (about 18 MB) and the handoff manifest stay in the tree, so a handoff merge and its notes keep working from a plain clone. Revisit if the repository grows enough to slow clones.

## 8. The gate: `civic check`

One command that runs every check on a graph (contract conflicts, override drift, completeness, gaps) and exits non-zero when there are new findings nobody has decided. A baseline file records existing findings so old debt doesn't block a change. It prints a short Markdown summary and can post a `civic` commit status the way `bin/signoff` does, with no GitHub Actions. This is the SonarQube shape from [decision 0005](decisions/0005-what-civic-is.md): a finding is raised at the change that caused it.

Acceptance: on the Fluent Button and Card demo graphs, `civic check` fails on an undecided conflict, passes once a recorded decision covers it, ignores baselined findings, and reports counts with denominators. It makes no model calls.

Built in [`graph/`](../graph#the-gate-civic-check) and run by `bin/signoff` on the graphs in [`civic.check.json`](../civic.check.json). Undecided findings block: open conflicts, overrides no conflict tracks, expired exceptions, failing evidence, missing product states, dead ends and unreachable screens. Recorded facts and evidence debt (variants mapped to `none`, platform-only variants, missing run evidence, unconfirmed links, approved exceptions) are reported without blocking, and a project can choose its own list. The Card's undecided selectable override, its missing empty and error states, and the Checkout journey's dead end and unreachable screen are in [`civic.baseline.json`](../civic.baseline.json). Decisions come from Decision records (step 3).

## 9. Real inputs replace the stand-ins

The Figma importers already read the real `GET /v1/files/:key` export shape; what's missing is real files. This cloud environment can't reach Figma, so the founder exports the [Microsoft Fluent Android](https://www.figma.com/community/file/836835062056249539/microsoft-fluent-android) Community file with a personal access token (steps in the [Button demo](../demo/fluent-button/README.md)). Laundry's real Playwright reports feed `readPlaywrightReport`. Storybook web evidence for the Button is built (step 2).

Acceptance: the Button conflict is raised from the real export, or the demo records that the real kit doesn't disagree. Either result is evidence; decision 0001 was based on a reading of the kit, not an export.

Progress, 2026-10-11: the Button demo reads the real Android kit export. The kit predates Figma variants and draws only Primary and Text buttons, so there is no Neutral button to conflict with. The real conflict runs the other way: Compose ships `OutlinedButton` (Brand outline) and the kit doesn't draw it.

Progress, 2026-10-12: [Laundry's graph](../projects/laundry) is built from real inputs. `readJourneyIndex` reads the journey engine's review index (204 scenarios, their journeys and declared paths), and Laundry's own review specs run unchanged into a Playwright report that `readPlaywrightReport` ties to those scenarios through the checks each one declares. The gate reads it with the demo graphs: 3 of 27 tests fail and 12 of 49 journey screens are dead ends, all held by the baseline. This is also the first piece of [step 4](#4-the-journey-engine-as-a-graph-viewer): the engine's journey graph now reaches the CIVIC graph. Still to come: the Card demo's library file from a real Fluent kit export (the Shop product file stays illustrative), and Laundry's full browser suite, which needs its local Convex backend.

Progress, 2026-10-12: the demos read real Fluent 2 kits, trimmed to what they use. The Card's library file is the Fluent 2 Web kit, and the Button's iOS side reads the Fluent 2 iOS kit, which raises two conflicts: iOS ships Danger and Transparent neutral buttons the kit doesn't draw. The Card raises three more where iOS `CardView` can't build library-default content (body, footer, header action). Fluent is the demo's example design system, not one CIVIC's team owns, so illustrative decisions settle all five: the iOS kit gains a Danger button, Transparent neutral stays iOS-only, iOS `CardView` gains a body slot, and iOS goes without the footer and header action as an accepted limitation. The Shop product file stays illustrative. Laundry's review suite is 39 of 39 passing after stale tests were fixed.

## 10. Checks where each role works

Part 2 of [decision 0005](decisions/0005-what-civic-is.md): raise each finding at the change that caused it, in the tool where that change lives ([onboarding and ingestion, 4d](onboarding-and-ingestion.md#4d-raising-violations-and-drift-to-the-right-roles)). Today the gate posts one `civic` commit status, and its summary is read only by whoever runs `bin/signoff`.

- **Find the side that moved.** Compare each side with the last revision where they agreed, ask the owner of the change that introduced the difference, and tell the other side's owners. *Built:* `civic check --since <ref>` compares with the merge base ([graph README](../graph/README.md#the-gate-civic-check)).
- **Engineering:** a pull request check whose summary lists the new findings with their owners, through the same local signoff and no GitHub Actions. *Built:* `bin/signoff` puts that summary on the open pull request as one comment, edited in place, beside the `civic` status.
- **QA:** a Playwright reporter that writes run evidence into the graph and prints the scenarios a run left uncovered. *Built:* `CivicReporter` in [`importers/`](../importers/README.md) writes a `civic.run/0` file and prints what now fails, what now passes and what was left uncovered, with QA owners; the Button demo's web suite runs it.
- **Design Engineering:** a check on a library release that names the variants left without a mapping and the product overrides the release breaks. *Built:* `civic release --since <ref>`, printed by `bin/signoff`.
- **Design:** findings on a Figma frame wait for the Figma plugin ([later](#later-not-scheduled)); until then they reach designers through the review loop. Laundry's designers work in Claude Design and Open Design, so its design input (see [order of work](#order-of-work)) comes first.

Acceptance: a change to one side of the Button or Card raises its finding on that change only, names who is asked and who is told, and makes no model calls.

## Later, not scheduled

These came out of [agentic development](agentic-development.md) and wait until the steps above give them a base:

- **CIVIC launching agents.** Starting a coding agent on a new worktree from "Hand to agent". The agent interface itself moved to the next build ([decision 0007](decisions/0007-review-to-agent-loop.md)).
- **A capture browser extension** for pages a preview build can't inject the overlay into, such as production.
- **Prototypes.** If reviews need more than the frame walk (D33), the non-AI option is a preview assembled from the component mappings. CIVIC stays out of WYSIWYG and no-code.
- **The Figma plugin.** Findings on a Figma frame (step 10's Design check), scheduled once a team that designs in Figma uses CIVIC.
- **A return path to Figma.** Reference captures, frames rebuilt from library instances, and token proposals, all through a plugin into a page the designer merges from. This needs the Figma import and plugin first.
- **A rebrand demo.** The Fluent Button and Card re-themed to a second brand, showing the blast radius, hidden overrides, and the migration table. A candidate third demo after Card.
- **New device classes** such as TV and watches. They aren't modelled until they've been researched.
