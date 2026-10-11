# How a project gets into CIVIC, and how CIVIC connects it

Proposal, 2026-10-10, with the decisions in section 5 approved the same day. It is put together from the product spec, decision 0001 (the Fluent 2 demo), and the v4 journey engine report ([`rehearsal/REPORT.md`](../rehearsal/REPORT.md)). Today only the Laundry web adapter exists. Everything else here is a plan, not a built feature.

## Short answer

Each role keeps working in its own tool. CIVIC does not copy their files. It reads each source into one graph, gives each item a stable identity, and links items across sources at shared **targets**. A target is a token, component, variant, screen, state, or journey. Where two sources disagree about the same target, CIVIC raises a **Contract Conflict** with owners. It never quietly picks a winner.

```
Design tool ──┐
Component lib ┼──▶ normalize ──▶ CIVIC graph (targets + typed links) ──▶ canvas, Contract, Coverage, conflicts
App code ─────┤      │                       ▲
QA / tests ───┘      └── identity + evidence ┘   proposals flow back out as owned records
```

**Vocabulary.** The "database" or "engine" is the **CIVIC graph**. It is an append-only store of events from every tool, plus the current-state graph built from them (section 4b). It has no screen of its own. Everything you see is a **view** over it: the journey canvas (the only one built today, from the journey engine fork), the Contract and Coverage panels, the inbox, and later readiness and variance views. "Dashboard" would name one future view, not the core.

## 1. Project onboarding (once per product)

These steps follow the v4 report's onboarding proposal, adapted to all four lanes:

1. **Create a project.** Name it and pick the platforms (web, iOS, Android). This works without a model provider or any account sign-up.
2. **Connect sources, one lane at a time.** Every lane is optional. A project is useful with only one lane connected; it simply shows the other lanes' evidence as unknown.
3. **Confirm the environment.** CIVIC shows the start commands, preview URLs, source scope, fixtures and reset method it found. It never runs a newly discovered command without asking. Anything unresolved starts in observe-only mode.
4. **Discover an initial inventory.** It reads route metadata, stories, tests, design frames and token files, and crawls the running app with Playwright or Appium (D34). Each item shows where it came from, and anything unresolved stays unmapped instead of being guessed.
5. **Record one real path.** A person walks one journey, or an existing test supplies the steps. Each recorded step has an identified state, an action, a screenshot and an assertion.
6. **Confirm the map.** CIVIC suggests groupings and links between sources. A person confirms them and declares states that are expected but not built yet.
7. **Stay current.** Sources are hashed. When one changes, only the affected evidence goes stale and is re-run, and open drafts are kept.

The result is a local project manifest (one file) plus one adapter per platform. The acceptance bar is a second small app that connects without any Laundry code.

## 2. What each role connects

| Role | Connects | CIVIC reads into the graph | Identity anchor | Writes back (as proposals only) |
|---|---|---|---|---|
| **Design** | Figma, Open Design, Claude Design, Paper | Frames, components and variants, styles and variables, prototype links, design-time states | Tool node ID plus file revision and snapshot | Proposal records and frame links; never edits the design file |
| **Design engineering** | Component library: tokens (DTCG, Style Dictionary, Tokens Studio), Tailwind config, shadcn registry, SwiftUI or Compose components, Storybook | Tokens and aliases, semantic components, platform components, variants and props, stories as declared states | Token path, component export name, story ID | Token and component proposals with a single owner per token set |
| **Engineering** | App repositories and preview builds | Routes, screens, component usage, state and transition hooks, fixtures, build revisions | Source path plus symbol, route ID, state ID from the adapter | Branches or patches only through an explicit adoption step |
| **QA** | Playwright (tests, Codegen, reporter, traces), XCUITest or Espresso later, accessibility and visual tools | Test cases mapped to scenarios, runs, assertions, screenshots, accessibility results | Test ID plus run ID plus the exact build | Coverage gaps and failed expectations as records |

How deep each lane goes depends on its inputs (from the v4 report). Design files alone show what was intended but prove no behavior. Code alone shows candidate screens but not that users can reach them. A running preview plus tests gives evidence that is tied to a revision. Only with all of them can CIVIC compare design, code and behavior on the same target.

### Design

- The first integration is already decided (D24): an optional link from a target to a Figma frame, stored with its snapshot and revision.
- Next is a structured import from a file export: frame IDs, components, prototype links and variables. The Variables REST API needs Enterprise access, so CIVIC can't depend on it.
- Open Design and Claude Design come in through their handoff artifacts. If those artifacts carried explicit frame and state IDs, import would need no guessing.
- Design states that have no code yet stay **planned** until something implements them.

### Design engineering (component library)

- This is where shared names live. The semantic component (for example `Button / Primary filled`) maps to each platform's component (React `primary`, iOS `accent`, Compose `Button`), as decision 0001's table shows.
- Tokens move as DTCG where the source supports it. Each token set has one owner, and edits in the other direction arrive as versioned proposals. This keeps the sync from running in circles.
- Stories, whether Storybook or SwiftUI previews, count as declared states with evidence. A story on its own is not a user journey.

### Engineering (app code)

- Cheap discovery comes first: framework route metadata and a source scan for candidates. Syntax-aware parsing is added only where it pays for itself.
- A small adapter gives stable state IDs, seeding and reset, a real-render preview and confirmed transitions. The Laundry adapter is the working example.
- URL-only observation still works without an adapter, but it can't distinguish tabs or dialogs that share a URL.

### QA

- The first choice is to import the tests QA already has, not to add a new test suite. The Playwright reporter emits steps, and its traces become evidence.
- Codegen records a person's journey. QA then reviews it, adds assertions, and labels states before it counts as a journey.
- Coverage is always reported as a fraction with its denominator, for example "observed edges / declared edges for these conditions". It is never reported as "entire app covered".

## 3. How CIVIC bridges the lanes

**Linking a target, strongest first:**

1. **Shared stable IDs.** The token path, component name, story ID and test annotation are the same string on both sides, so they link automatically.
2. **Explicit references.** Code imports a library component, a test tags a scenario, or a frame is linked to a target. These link automatically and show where the link came from.
3. **Suggestions.** Name or structure similarity, or image similarity. These are shown as suggestions and only become links once a person confirms them.

**Every link and edge carries a status:** declared, observed, inferred or proposed. Readiness is computed only from declared and observed links that have current evidence. Missing or old evidence reads as *Unknown / evidence stale*.

**Disagreement becomes a record, not a fix.** If two sources disagree on the same target, CIVIC creates a Contract Conflict. It is classified, given owners, and resolved by updating the design, changing the code, or approving an exception.

### Worked example: Fluent Button (the planned demo)

| Lane | Source | Becomes |
|---|---|---|
| Design | Fluent Android Figma kit, Button frame | Design intent for `Button`, variants from component properties |
| Design engineering | `FluentAliasTokens`, `@fluentui/tokens`, Swift `GlobalTokens` | Tokens linked by DTCG path to each variant |
| Engineering | Compose `Button`, React v9 `Button`, SwiftUI button | Platform components mapped to the semantic variants |
| QA | Storybook and Playwright on web; source and token checks on iOS and Android | Evidence for each variant and platform |

The Android kit says "Neutral default" exists, but Compose has no stock equivalent. CIVIC raises a Contract Conflict naming the target, both sources and the evidence, and assigns Design and Android Engineering as owners. The decision is recorded and the conflict links back to it.

## 4. Living in each role's workflow

Onboarding gets a project into CIVIC. Staying useful means CIVIC shows up inside the tools each role already uses, gets their changes back without extra steps, and routes what one role needs to the role that can act on it. This section is a proposal; none of it is built.

### 4a. Where CIVIC appears for each role

| Role | Their daily tool | How CIVIC shows up there | What they do in CIVIC itself |
|---|---|---|---|
| Design | Figma, Open Design, Paper | A plugin or panel showing each frame's target, alignment state, and open records. Records arrive as comments on the frame. | Review real screens on the canvas and approve adaptations |
| Design engineering | Component repo, Storybook, token pipeline | A CLI and a Storybook addon that publish tokens, components, and stories on each release. A status check flags variants with no mapping. | Map semantic variants to platform components and resolve token conflicts |
| Engineering | App repo, pull requests, IDE | A PR status check and one summary comment: affected targets, stale evidence, new divergence. Deep links open the exact scenario. | Play a state, take a proposal, record adoption |
| QA | Playwright, CI, test management | A reporter that sends runs, steps, traces, and screenshots tied to the build. Coverage gaps can turn into test tasks. | Plan coverage by journey and condition, and confirm evidence |
| PM and leadership | Issue tracker, chat | Digests and linked records in the tracker | Readiness, variance budget, and journey walkthroughs |

The rule: whatever a role does in its own tool should never need to be repeated in CIVIC. CIVIC is where the roles meet, not another inbox to keep up with.

### 4b. How data gets back to the engine

Every lane feeds one pipeline:

```
tool ──▶ connector ──▶ importer ──▶ event ──▶ CIVIC store ──▶ graph view (current state)
          (pull/push)   (maps to targets)  (append-only, versioned)
```

- **Three ways in.**
  - Pull: read a file export or API on demand or on a schedule.
  - Push: a CLI, test reporter, or CI step uploads after a run or release.
  - Watch: a local dev server notices changes, as the journey engine does today.

  Hosted webhooks need a reachable endpoint. A local-only CIVIC uses pull and push until a hosted relay exists.
- **One event shape.** Every importer emits the same envelope: source tool and revision, target ID (or "unmapped"), kind (artifact, state, transition, run, evidence, record, reply), status (declared, observed, inferred, proposed), actor and role, time, and a content hash.
- **Append-only, then viewed.** Evidence and records are never overwritten. The current graph state is computed from the event log, so staleness, history, and "who said what, when" come for free. This matches the spec's expected-version writes and immutable captures.
- **Idempotent.** Re-running an import with the same hash changes nothing. A new revision marks only the affected evidence stale.
- **Tools own artifacts; CIVIC owns records.** Frames, code, and tests stay in their tools. CIVIC stores links, snapshots, evidence, and the collaboration records (proposals, decisions, divergences, exceptions, adoption).

### 4c. Routing between roles

1. **Every record has a target, and every target has owners.** CIVIC builds the ownership map from what teams already maintain: CODEOWNERS, Figma file and library owners, component package owners, and test owners. People fill any gaps by hand. Ownership is stored per role, so one person can hold several roles (D25).
2. **The record type decides who is asked.** The spec's Dependency Triangle sets the defaults:
   - An Ambiguity goes to Design.
   - A Constraint goes from Engineering to Design.
   - A Coverage gap goes to QA, and to whoever owns the missing state.
   - A Divergence goes to the owners of both sides.
   - An Exception goes to the approver named by policy.
3. **Records are delivered where people work.** That might be a Figma comment, a PR comment or check, a test task, the issue tracker, chat, or the CIVIC inbox. Each person sets this per role. A person holding several roles gets one merged queue, not duplicates.
4. **Replies come back to the record.** A reply in Figma, GitHub, or chat syncs to the CIVIC record, which stays the single source of truth. If two places edit at once, the expected-version check catches it instead of silently picking one.
5. **Quiet by default.** Urgent items (failed evidence on a release, an expiring exception) notify right away. Everything else goes into a digest. A record with no owner escalates to the project lead rather than sitting unseen.
6. **The loop closes on evidence.** A record resolves only when evidence for the decided outcome arrives through the same pipeline: a new design revision, merged code, or a passing run. That keeps every role in check without anyone chasing anyone.

### 4d. Raising violations and drift to the right roles

People create most records, but CIVIC also raises some itself. A violation breaks a rule (for example a hard-coded color where a token is required, or a failed accessibility check). Drift means two sources that were aligned no longer agree. Both are routed by **what changed and who changed it**, not sent to everyone:

1. **Find the side that moved.** CIVIC compares each side against the last revision where they were aligned. Whoever's change introduced the difference is asked first: the PR author, the designer who published the frame, or the release that changed a token. The other side's owners are told, not asked.
2. **Raise it at the moment of change.** A violation from a code change appears on that pull request. One from a design change appears on that frame, and one from a library release appears on that release. It is cheapest to fix while the change is still open.
3. **The kind of problem picks the roles:**

| Detected | First asked | Also told |
|---|---|---|
| Token misuse or hard-coded value | Design engineering (in the library), or Engineering (in app code) | Design |
| Variant with no mapping on a platform | Design engineering | Design, and the platform's engineers |
| Design and implementation disagree | The side that moved | The other side, QA |
| Accessibility failure | Engineering | Design if the intent is missing; QA for the evidence |
| Expected state missing or unreachable | Engineering | QA, PM |
| Evidence stale after a change | QA | The owner of the change |
| Exception past its revisit date | The exception's owner | Its approver |

4. **Severity sets urgency and blocking.** Policy decides what blocks: for example, an accessibility failure on a release blocks, while a spacing drift does not. Blocking items appear as a failed check where the change lives. Everything else follows the quiet-by-default rule above.
5. **Repeats escalate instead of piling up.** The same root cause on many targets is one record (section 5). Unowned or ignored items move up to the area lead after a set time, and the variance budget shows the trend.

**Suggested build order:**
1. File exports, a CLI push, and the Playwright reporter.
2. A PR status check (the same idea as `bin/signoff`) that raises violations and drift on the change that caused them, plus the CIVIC inbox.
3. The ownership map from CODEOWNERS and package owners.
4. The Figma plugin and Storybook addon.
5. Chat and issue-tracker delivery with reply sync.

## 5. Keeping everyone in check without slowing anyone down

A core tenet of CIVIC is that Design, Design Engineering, Engineering and QA keep each other honest. In the spirit of the 200,000-mile Civic, a divergence should be like a dashboard light: it tells you clearly what's wrong, who should look at it, and the usual fix. It should never need a specialist to interpret.

The spec already models *why* a difference exists (platform convention, technical limitation, form factor, temporary gap, intentional differentiation, unapproved drift). It also models *what was decided* about it, as alignment states: approved adaptation, accepted limitation, unreviewed drift, awaiting adoption, and so on. The proposal below adds how CIVIC helps fix differences, not only flag them.

**Proposed: CIVIC helps remediate.**

1. **One record per root cause.** If one token alias mismatch shows up on 14 screens, CIVIC groups it into one Divergence with 14 affected targets rather than 14 tickets.
2. **The resolution paths come prepared.** Each divergence arrives with the three resolutions from decision 0001 drafted: update the design, change the implementation, or approve an exception. Each draft is real and reversible:
   - A design change is drafted as a proposal against the frame or variable, linked back to the design tool.
   - A code change is drafted as a token patch, a codemod, or an adapter fix on a branch.
   - An exception is drafted with user impact, an owner, and a revisit trigger already filled in.
3. **Fixes are checked before anyone decides.** CIVIC runs the proposed fix in the preview or the test runner and attaches before-and-after evidence, so the owner can see it works before choosing it. Testing a fix still isn't adopting it (D21).
4. **Accepted variance is revisited.** Approved adaptations and limitations carry a revisit trigger, for example "fluentui-android ships a neutral Button" or "iOS adds this capability". When a source update meets the trigger, CIVIC reopens the record with a proposal to converge.
5. **Variance has a visible budget.** Each product and platform shows its count of approved adaptations, accepted limitations, exceptions about to expire, and unreviewed drift, plus the trend. This feeds the Maintainability Index, so leaders can see when variance is quietly growing.
6. **The cheapest safe fix comes first.** Triage orders work by the size of the fix and its user impact. Many divergences are one token or one property, and those should be one click to propose.

Guardrails:
- CIVIC never adopts a change itself. The owner of the target decides, and adoption is a separate record.
- Drafts come from deterministic rules: token diffs, prop mappings, codemods. CIVIC makes no model calls (D30).
- A remediation that fails its own evidence is shown as failed. It never quietly becomes "aligned".

**Example: Fluent Button "Neutral default" on Android.** Compose has no stock equivalent, so CIVIC opens one Divergence for the Android target and drafts three options:
- Mark it in the Android Figma kit as an approved adaptation for web and iOS only.
- A Compose button built from Fluent alias tokens, rendered and compared against the kit.
- An accepted limitation with the trigger "fluentui-android adds a neutral variant".

Design and Android Engineering choose, and QA's evidence confirms the result.

For a full walk-through of a product team changing a design system component, see [component-change-flow.md](component-change-flow.md).

## 6. Validating onboarding

Two cases test the onboarding from opposite directions:

- **Fluent Button** starts from design and code across three platforms, with a known mismatch between design and code. It proves that importers, linking, and Contract Conflicts work across platforms.
- **Laundry's five unmapped destination states** start from an existing app with expected states that don't exist yet. These are Add clothes from the empty home, a garment's running wash, a hamper item in Laundry, moving washed pieces to Drying, and a garment's care history. Onboard Laundry through the manifest as if it were new. The five states should appear as owned coverage gaps, then turn observed as seeds and transitions land, with no Laundry-specific code in CIVIC.

## 7. What exists today

- **Built (Laundry, web only):** a curated scenario registry, a source scan, real-render preview through the adapter, observed towel transitions, revision-tied thumbnails, the Contract panel, a coverage contract with write-back, and 17 curated cross-route bindings.
- **Not built:** workflow plugins, the shared event pipeline, the ownership map and routing, remediation drafts, revisit triggers and the variance budget, the graph schema, any design-tool import, token or component library import, a test-report importer, native adapters, the project manifest and onboarding UI, and conflict records.

## 8. Decided

- **D25:** Design Engineering is a primary persona that owns the component library. Personas are roles, so one person can hold several. For example, an engineer can cover QA through browser end-to-end runs when a team has no QA group.
- **D26:** the first QA input is Playwright reports and traces.
- **D27:** the first design import after frame links is a Figma file export.
- **D28 ([decision 0005](decisions/0005-what-civic-is.md)):** CIVIC is the quality gate for product behavior across design, components, code, and tests. It is made of the graph, checks in each role's tools, and one shared space. The journey canvas is the first version of that space.

- **D30–D34 ([decision 0006](decisions/0006-deterministic-civic-for-agentic-teams.md)):** CIVIC makes no model calls. It adds a read-only contract export, a static design completeness check, a frame walk, and crawl-first discovery on Playwright and Appium.

D26 and D27 come with one condition: build for alternatives. Each source comes in through an importer that maps its items to targets and evidence and records where each item came from. Supporting another design tool, token system or test runner means adding an importer, never changing the schema. Any role can supply any source.
