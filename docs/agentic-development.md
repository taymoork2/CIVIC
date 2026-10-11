# CIVIC's role in agentic development

Proposal, 2026-10-11, revised the same day, answering the founder's questions in the CIVIC project thread. The approved parts are recorded in [decision 0006](decisions/0006-deterministic-civic-for-agentic-teams.md) and spec decisions D30–D34. It builds on [decision 0005](decisions/0005-what-civic-is.md) (CIVIC is the quality gate: graph, in-tool checks, shared space), the [onboarding and ingestion plan](onboarding-and-ingestion.md), and the [component change flow](component-change-flow.md). Nothing here is built. Each answer separates **already in the spec** (what `docs/product-spec.md` and the decisions already say) from **new proposal** (what this note adds). The decisions are collected at the end.

**Revision (founder, 2026-10-11):** CIVIC doesn't integrate agents and makes no model calls. Everything it does comes from existing non-AI tools and static analysis of what it can read from designs and codebases. Coding agents, if a team uses them, sit outside CIVIC like any other tool an engineer uses: they can read the same contract export a person reads, and their code reaches CIVIC only through the normal PR and import path. This revision removed the agent-actor schema, the agent write interface, model-suggested states, agent-drafted TV adaptations and adapters, and agent-built prototypes.

**Amendment (founder, 2026-10-11):** [decision 0007](decisions/0007-review-to-agent-loop.md) loosens part of this. Review on the journey can be handed to agents as work requests, agents get a narrow write path and act for a named person, and CIVIC still makes no model calls. See [review to agent](agent-review-loop.md).

## Short answer

Agents make writing UI code cheap. They don't make knowing *what* to build, or proving it was built right, any cheaper. Those two things are what CIVIC already is: a contract (the graph) and a gate (checks plus evidence). CIVIC stays deterministic itself, and gives agentic teams three things:

1. **A precise contract to build against.** For any target (a journey, screen, state, or component), CIVIC can export everything needed to build it: intent, states and transitions, component and token mappings for the platform, extension points, acceptance criteria, and the stable IDs to put in the code. It's computed statically from the graph. A person reads it, and so can any tool or agent the team runs on its own. That replaces "read this Figma file and guess".
2. **A gate that doesn't care who wrote the code.** Code written by a person, a codegen tool, or an agent comes back through the same importers and checks. It gets evidence, and nothing is done until the evidence says so. A human owner decides, and verification is independent of the author.
3. **Memory that outlives any session.** The graph keeps decisions, exceptions, and why a difference was approved, so the next change (from whoever or whatever) doesn't undo them.

---

## 1. What is CIVIC's role in agentic development, especially greenfield?

**Already in the spec**
- The graph links intent, design, components, code, and evidence, with stable identities and typed links (spec, "Artifact graph and traceability").
- Proposal, Decision, Adoption, and Verification are four separate records. Testing a candidate is not adopting it (D21).
- Model help is optional, attributed, and budgeted. Discovery and replay are deterministic, and refresh and replay make zero model calls (roadmap steps 4 and 6).
- Design states with no code yet stay **planned**, and expected-but-missing states become coverage gaps (onboarding plan, sections 2 and 6).
- Startup mode: minimal setup, lightweight contracts, flexible roles (spec, "Company scale").

**New proposal**

*No agents inside CIVIC.* CIVIC has no agent actors, makes no model calls, and has no write interface for agents today. Code from any author arrives the usual way: a PR, a CI push, or an import.

*A read-only contract export.* A deterministic CLI command, `civic context <target> --platform ios`, prints the target's contract as JSON and Markdown: intent, states, transitions, fixtures, semantic and platform component mappings, extension points, tokens, open records, acceptance criteria, and the IDs to use. `civic gaps <scope>` lists what's expected but missing, with owners. Both are plain queries over the graph. They help an engineer starting a ticket, and a team that uses coding agents can hand the same output to them.

*Eventually, an agent interface.* The founder expects agents will need a way to use and interact with CIVIC (an MCP server, a CLI, or similar). The read-only export is its first piece: the same queries can later be offered over MCP. How agents write back to CIVIC, if at all, is left open for later. Until then, code from any author reaches CIVIC through the normal PR and import path.

*Greenfield is where the contract matters most,* because nothing exists to reverse-engineer. In a greenfield project the graph starts from intent and design only, with every target **planned**. Building turns planned targets into observed ones, one target at a time. Three things CIVIC checks statically that a Figma link can't:
- **Library before screens.** If the design uses a Card and no semantic Card exists, CIVIC says so before anyone writes a one-off, and points at building the library component first, owned by Design Engineering. That keeps the spec's composability warning signs (forked components, one-off styling, undocumented overrides) out from day one. Fast code generation, by agents or otherwise, produces those warning signs quickly when nothing checks.
- **IDs from the start.** The contract lists the stable state and target IDs to put in the code (a `data-civic-state` attribute, a test tag, a SwiftUI accessibility identifier). That makes the strongest link type in the onboarding plan, shared stable IDs, free, and greenfield code never needs fuzzy matching later. A lint rule can check that each planned state's ID appears in the code.
- **Done means evidence.** A built target is **Awaiting adoption** or **Unknown** until the gate sees a real render and a passing check on the platform it claims.

---

## 2. How does CIVIC help agents (and people) implement designs and mocked user journeys?

**Already in the spec**
- Figma file export is the first design import (D27). It brings frames, components, variants, prototype links, and variables. Frame links come first (D24).
- A person confirms the map and declares states that are expected but not built yet (onboarding step 6).
- Semantic to platform component mappings, tokens as DTCG, one owner per token set.
- Scenarios separate persona, permission, and condition, and fixtures seed states.

**New proposal: the journey work order**

Prototype links in a Figma file are an untyped graph of frames. CIVIC turns that into a typed journey and then into work anyone, or any tool, can take:

1. **Import.** Frames become screen and state targets. Prototype links become *declared* transitions with their trigger. Component instances and overrides come in (D29).
2. **Confirm.** The designer (or, in a startup, whoever mocked it up) confirms which frames are states of the same screen, names the conditions on branches, and marks frames that are only notes or explorations. This is the existing onboarding step 6, applied to a mock.
3. **Derive fixtures.** The placeholder content in the mock (names, prices, list lengths) is the first draft of the fixture for each state. CIVIC records it as a proposed fixture that the engineer turns into real seed data.
4. **Issue work orders.** Each journey becomes ordered, target-sized work: for each state, the frame, the components and tokens it maps to on this platform, the fixture, the transition in and out, the acceptance criteria, and the IDs to use. Each work order is one `civic context` export (section 1), and it can be filed into the team's tracker as a ticket.
5. **Check what comes back.** The build runs in the preview. The adapter reports the state IDs, CIVIC captures each one and compares it with the frame at the design reconciliation tier, and any difference becomes a Divergence routed to the side that moved, which is the PR that introduced it.

The enterprise case and the startup case differ only in governance. An enterprise has maintainers, policies, and approvals on every override. A startup has one designer and one engineer (who may use an agent), few required fields, and optional approvals (spec, "Company scale"). The work order looks the same.

One honest limit: a mock tells you the happy path the designer drew. It doesn't tell you what happens on error, offline, or with no data. That's the next question.

---

## 3. How does CIVIC find coverage gaps in designs when no implementation exists?

**Already in the spec**
- The journey canvas is meant to show loading, empty, error, offline, and permission states, entry and exit points, and branches.
- A Coverage gap is a record type. Expected states with nothing behind them stay visible as gaps. An incomplete registry never claims exhaustive coverage, and coverage is always a count with its denominator.
- Component contracts define states, valid composition, and accessibility (spec, "Composability").

**New proposal: a design completeness check**

This is a check that runs on the design graph alone, at design-save time, like the D29 override forecast. It asks what the design implies must exist and whether a frame exists for it. The rules are deterministic, and each comes from something already in the graph:

| Rule source | Example of what it finds |
|---|---|
| **Component contracts** | The screen uses a Button that triggers an async action, and the Button contract has *loading* and *error* states, but no frame shows either. A list has no *empty* frame. A form field has no *validation error* frame. |
| **Journey shape** | A frame with no way out (dead end). A frame no link reaches. A branch that never rejoins. A destructive action with no confirm or undo. A modal with no dismiss. |
| **Condition matrix** | The project declares conditions such as offline, permission denied, signed out, slow network, and first run. For each journey step, is each condition designed, inherited from a default, or missing? |
| **Content range** | Zero, one, many, very long text, a long localized string, right-to-left layout, the largest text size. |
| **Platform matrix** | The project ships on web, iOS, Android, and TV, and the journey has frames for web and iOS only. |
| **Accessibility intent** | No focus order, no accessible name on an icon-only control, contrast failures between token pairs. |

Three design choices keep this from becoming a nag:
- **"Use the default" is an answer.** Design can mark a gap as "inherits the component's default state" or "same as web". That's an Approved adaptation with a record, not a missing frame. It closes most gaps cheaply.
- **Risk decides what matters.** Policy picks which rules block. A payment journey might require error and offline states, and a settings screen might not. This is the spec's risk table, applied to design coverage.
- **Report as a count.** "Checkout: 14 of 31 expected states designed for these 4 conditions on 2 platforms", never "73% complete".

Every rule is static: it reads the design export, the component contracts, and the project's declared conditions and platforms. There's no model-suggested state. If a team wants a new kind of state checked, it becomes a new rule or a new state on a component contract.

Why it matters for agentic teams: an engineer or agent given an incomplete design invents the missing states, each one differently. The completeness check moves that decision back to Design *before* building starts, and anything still missing shows up in the contract export as an explicit "not designed: ask, don't invent".

Laundry's five unmapped destination states (roadmap step 4) are already a validation case for this from the implementation side. The Card demo could add the design side: a product Card mock with no empty or error state.

---

## 4. How does CIVIC help build screens on several devices, including TV?

**Already in the spec**
- Cross-platform scope names TV, wearables, embedded, automotive, voice, and others (D8).
- Semantic components map to platform components. Every cross-platform artifact records invariant intent, native adaptation, restriction, fallback, and evidence.
- A target, a platform, and a device are different things, and a narrow web preview never counts as native acceptance.
- Evidence tiers stay separate, including physical-device acceptance.

**New proposal: surface profiles, and the semantic layer as the thing that transfers**

Figma gives usable values for web because its canvas is close to CSS (Dev Mode shows CSS). Those values don't carry to a TV running tvOS, Android TV, Tizen, webOS, or Roku, and Netflix-style teams design each of those separately. CIVIC's answer is that the pixel values were never the thing to transfer. The semantic layer is: what the screen is for, its content hierarchy, which semantic components it uses, its states and transitions. CIVIC already models that layer.

**Skipped for now (founder, 2026-10-11):** TV was an example, and no TV or watch project is expected to use CIVIC soon. Many device types haven't been researched yet, so nothing below goes into the schema. It stays here as a sketch of how a new device class would fit later.

A **surface profile** would sit on the platform target. It holds what's needed to adapt a semantic screen to a surface, and what static checks run against it:

| Field | TV example |
|---|---|
| Input model | Directional focus (D-pad or remote), no pointer, no touch; sometimes voice |
| Viewing distance and density | Ten-foot UI, larger type scale, safe area for overscan |
| Navigation pattern | Rows and focus memory, Back as the main exit |
| Runtime and component library | tvOS SwiftUI, Compose for TV, a web runtime on Tizen or webOS, Roku SceneGraph |
| Capabilities and limits | Memory and performance budget, no text input or an on-screen keyboard, video playback rules |
| Token mode | A TV type and spacing scale as a DTCG mode on the same semantic tokens |
| Evidence available | Simulator or emulator, partner device lab, physical device |

How it's used for a TV screen:
1. The contract export for the TV target gives the semantic screen, the TV surface profile, and the platform component mappings for the TV library.
2. If Design drew TV frames, they're the target, as on any other platform.
3. If Design didn't, the completeness check (section 3) already raised "TV not designed" as a gap owned by Design. CIVIC doesn't generate a TV design. What it can do statically is check the semantic screen against the TV profile before anyone designs it: a hover-only interaction, a free-text field, a gesture with no remote equivalent, or a component with no TV mapping in the library. Those findings go to Design and Design Engineering with the gap.
4. TV adds contract items other surfaces barely need, chiefly the **focus graph**: every action reachable by D-pad, focus never lost, a predictable start and return position. Where TV frames exist, a first focus order can be read from their layout order and checked for dead ends. On the running app, the existing non-AI tools verify it: UI test runners driving the emulator with remote key events, then the physical device tier.

Each TV operating system is its own platform target with its own alignment state, as Android and iOS are today. A difference between tvOS and Tizen is classified (platform convention, technical limitation, form factor) and decided, never averaged into one "TV" answer.

---

## 5. How does CIVIC turn designs and mockups into an interactive experience before any implementation exists?

**Already in the spec**
- CIVIC isn't a drawing or authoring tool (D24). Drawing stays in design tools.
- The scenario player plays the intended experience. Edit changes a real, versioned, testable proposal, and testing it isn't adopting it (D21).
- Fixture jumps are labelled as jumps, evidence tiers stay separate, and a fixture jump or old screenshot is never runtime evidence.
- The journey engine already generates a durable candidate per coverage gap: an editable prototype plus a React form scaffold (`rehearsal/REPORT.md`). It's labelled as not implementing the feature.

**New proposal: three levels of "walkable", and a firm line before no-code**

| Level | What plays | Built by | Labelled as |
|---|---|---|---|
| **1. Frame walk** | Design frames joined by declared transitions in the scenario player. Persona and condition switches pick the branch. Hotspots come from the prototype links. | Nobody; it's the imported design | Design intent. Not behavior. |
| **2. Assembled preview** (optional) | Frames rendered with the real library components: each design component instance is swapped for its mapped code component (the same mapping idea as Figma Code Connect), with props from its variant properties, text from the fixture, and layout from auto layout. Only frames where every instance maps cleanly qualify. | Deterministic composition from the mappings, no model | A new **preview** evidence tier. Never product evidence. |
| **3. Product** | The real app through its adapter | Engineering | Runtime evidence, as today |

Level 1 is cheap and honest, and it's what most reviews need. It's the scenario player pointed at design targets instead of app states. Level 2 is optional and comes later, if at all. Its value would be showing real component behavior (focus, hover, sizing) before the product exists, and its main byproduct is a mapping check: a frame that can't be assembled has an instance with no clean mapping, which is a finding in itself. Either way the same IDs and fixtures carry into the product, so a journey **graduates**: each state moves from frame to product, and the canvas shows which level each state is at.

The line: CIVIC shouldn't become a WYSIWYG or no-code builder. That's a different and crowded market, and it breaks D24. Edits made while playing a prototype go back as proposals against the design (to the design tool) or against the prototype's code (as a patch). CIVIC never keeps a second, hand-edited copy of the UI.

---

## 6. How does an existing product connect back to CIVIC to render the real experience for guided journeys?

**Already in the spec and roadmap**
- Onboarding: a local manifest plus one adapter per platform. URL-only observation works without an adapter. Playwright reports, Codegen, and traces are the first QA lane (D26).
- The adapter supplies stable state IDs, seed and reset, real-render preview, and confirmed transitions. Laundry is the working example.
- Cached snapshots on the canvas carry their revision, only the focused screen runs live, and replay from start is a separate capability (roadmap step 6).

**New proposal: crawl first with existing tools, adapter only where a crawl isn't enough, and guided journeys from three sources**

the founder's point (2026-10-11): tools already exist that walk a live app, click everything, and take a picture of each state, and several are cross-platform. CIVIC should import their output instead of asking engineers to write an adapter up front. Candidates, all non-AI, to evaluate:

| Tool | Platforms | What it produces |
|---|---|---|
| **Crawljax** | Web | Clicks through a running web app and builds a state-flow graph (states, the click that moved between them, a screenshot of each). This is close to CIVIC's discovered states and observed edges. |
| A small **Playwright crawler** (CIVIC-owned, or Crawlee as the crawling base) | Web | The same idea on the tool CIVIC already uses (D26), with traces as evidence |
| **Firebase Test Lab Robo** | Android, iOS (beta) | Explores the app, records screenshots and an activity map. No test code needed. |
| **DroidBot** and similar research crawlers | Android | A UI transition graph with a screenshot per state |
| **Appium**-based crawlers | iOS, Android, desktop, and other platforms through Appium drivers | One crawl approach over many platforms, using the same e2e library QA may already use |
| **Maestro** | iOS, Android, web | Not a crawler, but recorded flows with screenshots that become declared paths |

**Checked 2026-10-11:** no maintained open-source crawler covers every platform. Crawljax's last release was June 2023, AppCrawler's December 2021, DroidBot has only an alpha on PyPI, gremlins.js stopped in 2022, and Fastbot uses reinforcement learning (out of scope). The well-maintained pieces are the drivers: Playwright 1.64.0 (2026-10-07) for web and Appium 3.8.0 (2026-10-09) with drivers for iOS and tvOS, Android, macOS, Windows, and Chromium. **Choice:** one small CIVIC-owned crawl loop with platform-specific drivers, Playwright for web and Appium for native, using Crawljax's state-flow graph as the design reference. Details are in decision 0006.

How a crawl fits the existing rules:
1. **A crawl is discovery, not a journey.** Crawled states come in as *discovered*, and crawled edges as *observed* only for the build and fixture they ran on. A person confirms which ones are real states and journeys (onboarding step 6). States nobody places stay **unmapped**.
2. **Crawl safely.** Crawl against a test environment with seeded fixtures, with a denylist for destructive actions (delete, pay, sign out, send) and allowlisted inputs. Credentials are never captured.
3. **Group by structure.** States are merged by a hash of the DOM or view hierarchy, not by screenshot, so a different list item isn't a new state.
4. **The adapter becomes optional and smaller.** It's needed only where a crawl can't tell states apart (tabs or dialogs on one URL), can't reach them (states that need specific data), or can't reset. For those, CIVIC can generate an adapter scaffold from templates (state registry, seed and reset stubs) for engineers to fill in an ordinary PR.
5. **Recorded journeys** (Playwright Codegen, Maestro, existing tests) are confirmed by QA and become declared paths.

A guided journey then plays from whichever source is strongest for that platform:
- **Live**: the real app in the preview, seeded by fixture, for web today and later for streamed simulators and emulators.
- **Replay**: a recorded, verified path (Playwright trace, XCUITest, or Espresso recording), replayed step by step and stopping visibly on a miss.
- **Captured**: revision-tied screenshots and recordings when nothing can run, labelled with their age.

The canvas shows which one is playing. The spec's rules already cover the honesty part: a jump is never a replay, and stale evidence says so.

---

## 7. How does a product's implementation get back to Figma through CIVIC?

**Already in the spec**
- Design write-back is proposals only. CIVIC never edits the design file.
- The planned Figma plugin shows each frame's target, alignment state, and open records, and records arrive as frame comments (onboarding plan, 4a).
- Token edits that go the other way arrive as versioned proposals to the token set's owner.

**New proposal: three return paths, all into a place the designer merges from**

Figma's REST API can read files and write comments, but it can't create layers (and writing Variables needs Enterprise). Putting real UI into a Figma file needs the Plugin API, run by a designer. So every return path goes through the plugin into a branch or a dedicated page, and the designer decides what to merge:

| Return path | What arrives in Figma | When to use it |
|---|---|---|
| **Reference captures** | Revision-tied screenshots of real states placed next to their frames on a "Shipped" page, with the alignment state | Always. Cheap, honest, and it closes the loop on "what actually shipped". |
| **Rebuilt frames** | Real states rebuilt as Figma layers using **library component instances**, through the component mappings in the graph | Only where the mapping is clean. Anything that doesn't map becomes a visible Divergence, not a hand-drawn approximation. Good for screens that were built without a design, or a redesign baseline. |
| **Token and variable proposals** | Changes to Variables for token sets that code owns, from the DTCG diff | When code is the owner of a token set. |

The useful framing for designers: CIVIC tells them where design and product disagree, offers the real state as a starting point, and leaves the file in their control. In an agentic world this matters more, because more UI ships without a matching frame. The reverse path keeps the design file from silently becoming fiction.

---

## 8. How does CIVIC handle a design system redesign or a full rebrand, such as after an acquisition?

**Already in the spec**
- Every shared-system change has a migration contract, with adoption tracked per product and platform. Teams can accept, ask, report unsupported use, propose extensions, or request exceptions.
- Component lifecycle statuses, including deprecated and removed.
- Enterprise mode supports multiple brands and systems, and federated domains with local extensions.
- Impact analysis: which journeys and platforms a change affects (spec, "Artifact graph").

**New proposal: a redesign is a new contract baseline, and the graph turns it into target-sized work**

Redesigns come in two kinds, and CIVIC handles them differently:

*A reskin* (new brand, same product). If the semantic layer is intact, a rebrand is mostly a new token mode and new platform component styling. CIVIC:
1. Records the new brand as a token mode on the same semantic tokens.
2. Computes the blast radius per product and platform: every target using each token and component.
3. Surfaces the hidden debt first. Hard-coded values, local overrides, and one-off styling don't follow the token change, and that's exactly where a rebrand breaks. CIVIC already detects these as violations, and a rebrand is when they get expensive.
4. Issues one work order per root cause (onboarding plan, section 5): mostly token swaps and codemods (jscodeshift, ts-morph, or the platform's refactoring tools) that run in batches.
5. Re-captures every affected state and diffs it against the new design, so progress reads as a migration table, not a feeling.
6. Treats any old-brand token in a new build as a violation after the cutover date.

*A structural redesign* (new components, new information architecture, changed journeys). This is a new major version of the contract:
1. Old and new semantic components are linked by a **crosswalk**: old Card maps to new Card, or old Tabs maps to new Navigation rail, or there's no equivalent.
2. Journeys get diffed: states added, removed, merged, reordered. Removed states need a decision, not a silent delete.
3. Both versions coexist during rollout, and each product's state is tracked in the migration contract.

*An acquisition* adds a step before either: crosswalk the acquired company's semantic components and tokens onto the acquirer's contract. Components the acquirer lacks become a decision: promote into the acquirer's system, keep as an approved local extension, or rebuild. Behavior differences, such as how each company confirms destructive actions, become decisions too, not side effects of a reskin.

Approval at this scale follows risk (spec, "Company scale"). Low-risk token swaps with clean before-and-after evidence can be approved in batches by policy, still recorded. Changes to journeys or accessibility-relevant states need named owners. The variance budget shows how much of the old brand is left.

A future demo candidate fits this well: re-theme the Fluent Button and Card to a second brand and show the blast radius, the hidden overrides, and the migration table.

---

## 9. How does CIVIC keep compliance in all of these scenarios?

**Already in the spec**
- Accessibility as policy, specification, and evidence, with waivers that have an owner, scope, and expiry. Policy violations can block release.
- Governance follows risk: critical changes need segregated approval, complete traceability, and audit retention.
- Enterprise: immutable audit, residency and retention, SSO, SCIM, RBAC, ABAC, supplier access, private deployment.
- Evidence integrity, append-only records, and inputs captured from an allowlist, never credentials or raw keystrokes.

**New proposal: compliance is a policy attached to targets, checked the same way whoever wrote the code**

1. **Compliance rules are policies on targets.** WCAG level, platform and store rules, brand rules, legal requirements (consent, disclosures, cancellation flows, regional accessibility law such as the European Accessibility Act, and for TV video apps US rules on captions and accessible menus), and company rules. Each attaches to the targets it covers, with the evidence it needs per platform and tier. A rule with no current evidence is Unknown, never passed.
2. **The rule is checked at the earliest point it can be.** The same rule shows up in design (the completeness check finds no consent state, or a contrast failure between tokens), in the prototype, in the PR, and in the release. It's cheapest at design time.
3. **Segregation of duties applies to the change, not the tool.** For high and critical risk, the author of a change can't be its only approver. That holds whether they typed the code or had an agent write it, because CIVIC only sees the PR and its author.
4. **No data leaves for a model.** CIVIC makes no model calls, so designs, code, captures, and fixtures never go to a model provider through CIVIC. Fixtures are synthetic, and captures go through the same allowlist and redaction. Every check is a static rule or an existing tool's result, so an auditor can rerun it and get the same answer.

How it applies in each scenario:

| Scenario | What compliance looks like |
|---|---|
| Greenfield | Required states (consent, error recovery, accessible names) are expected targets before code exists, so they're built from the start. |
| Mock to journey | The completeness check includes the compliance rules for that journey's risk level. |
| Multi-device and TV | Rules are per surface profile: focus reachability, caption controls, store and partner certification requirements. Physical-device evidence where the rule needs it. |
| Frame walks and previews | Labelled design or preview tier. They can never satisfy a compliance rule for the product. |
| Existing product onboarding | Captures and recorded journeys go through redaction. Adapter scaffolds are reviewed as ordinary PRs. |
| Return to Figma | Proposals only, with the alignment and compliance state visible on the frame. |
| Redesign or acquisition | Every rule re-runs against the new tokens and components (rebrands often break contrast). The acquirer's policies are inherited per enterprise federation, and the audit trail covers both companies' history. |

---

## Decisions

These would change or extend the roadmap. Nothing has been changed in the repo.

| # | Decision | Recommendation | Roadmap effect |
|---|---|---|---|
| A | ~~Make agents first-class actors~~ | **Withdrawn** (founder, 2026-10-11): no agents inside CIVIC | None |
| B | A read-only, deterministic contract export (`civic context`, `civic gaps`) | **Approved** (founder, 2026-10-11), in the Button demo | Step 2 |
| C | Add a static design completeness check (section 3) | **Approved** (founder, 2026-10-11), starting with component-contract and journey-shape rules | Card demo (step 2) and Laundry validation (step 4) |
| D | ~~Add surface profiles to the schema for TV and other surfaces~~ | **Skipped** (founder, 2026-10-11): TV was an example; devices not yet researched | None |
| H | Discover existing products by importing output from existing crawlers (section 6), with the adapter only where a crawl isn't enough | **Approved** (founder, 2026-10-11): one CIVIC crawl loop on Playwright (web) and Appium (native) | Step 4 (onboarding) |
| E | Add the frame-walk player; prototypes later | **Approved** (founder, 2026-10-11): frame walk now, prototypes later. A deterministic assembled preview is the non-AI option to weigh when prototypes come up. Not WYSIWYG or no-code. | Step 4 |
| F | Return path to Figma (captures, rebuilt frames, variable proposals) | **Later**, after Figma import and the plugin exist | No change now |
| G | A rebrand demo (Fluent Button and Card re-themed to a second brand) | **Candidate third demo**, after Card | No change now |

B, C, E and H are approved and recorded as D31–D34 in the spec, with D30 for the deterministic rule. Roadmap steps 2, 4 and 6 carry the work.
