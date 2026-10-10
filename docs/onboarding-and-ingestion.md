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

## 1. Project onboarding (once per product)

These steps follow the v4 report's onboarding proposal, adapted to all four lanes:

1. **Create a project.** Name it and pick the platforms (web, iOS, Android). This works without a model provider or any account sign-up.
2. **Connect sources, one lane at a time.** Every lane is optional. A project is useful with only one lane connected; it simply shows the other lanes' evidence as unknown.
3. **Confirm the environment.** CIVIC shows the start commands, preview URLs, source scope, fixtures and reset method it found. It never runs a newly discovered command without asking. Anything unresolved starts in observe-only mode.
4. **Discover an initial inventory.** It reads route metadata, stories, tests, design frames and token files. Each item shows where it came from, and anything unresolved stays unmapped instead of being guessed.
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

## 4. What exists today

- **Built (Laundry, web only):** a curated scenario registry, a source scan, real-render preview through the adapter, observed towel transitions, revision-tied thumbnails, the Contract panel, a coverage contract with write-back, and 17 curated cross-route bindings.
- **Not built:** the graph schema, any design-tool import, token or component library import, a test-report importer, native adapters, the project manifest and onboarding UI, and conflict records.

## 5. Decided

- **D25:** Design Engineering is a primary persona that owns the component library. Personas are roles, so one person can hold several. For example, an engineer can cover QA through browser end-to-end runs when a team has no QA group.
- **D26:** the first QA input is Playwright reports and traces.
- **D27:** the first design import after frame links is a Figma file export.

D26 and D27 come with one condition: build for alternatives. Each source comes in through an importer that maps its items to targets and evidence and records where each item came from. Supporting another design tool, token system or test runner means adding an importer, never changing the schema. Any role can supply any source.
