# 0013: Journey stories replace Storybook stories

- **Status:** Accepted (direction for a backlog item; nothing is scheduled)
- **Date:** 2026-10-14
- **Decider:** Founder (direction from the founder; the shape decided by Claude under the standing rule that Claude decides and records design decisions; the founder may revise it)
- **Builds on:** [0007](0007-review-to-agent-loop.md) (lines, D36), [0009](0009-recorded-runs-as-evidence.md) (replays), [0011](0011-layered-design-libraries.md) (layered libraries), the *journey stories* entry in the [roadmap](../roadmap.md#later-not-scheduled)

## Context

The roadmap's *journey stories* entry first kept Storybook as an input beside CIVIC. The founder wants CIVIC to replace Storybook stories, because the journey canvas already shows every component in context, and wants the journey engine extended to component libraries, shared Figma components and every line of work (in progress, PR, draft, staging), working in both directions across personas, with a Dev Portal where the pieces can be played in the browser.

Storybook covers components between unit and end-to-end tests and renders on the web (React Native has its own on-device Storybook). It has no journeys, no design intent and no native SwiftUI or Compose stories. CIVIC already has a canvas that plays screens inside scenarios, replays, lines with previews, design drafts and a component graph with design and code lineage.

## Decision

1. **A component story is the smallest journey.** A component harness adapter mounts one platform component with props and a fixture, as the canvas mounts an app screen. Stories are not hand-written. They come from the library contract's variant matrix, from real usage harvested from replays (each component instance a run passes through, with its props and data at that step), and from a one-time import of Storybook stories, SwiftUI `#Preview` and Compose `@Preview` blocks. Variant stories are pruned to what the contract and real usage need.
2. **A component page joins design and code.** It shows the Figma main component and variants (matched by published key, 0011), the product files that use or detach it, the code stories per platform and framework, and every journey step that uses it.
3. **Every line and environment is a lens.** Library releases become lines (a design library publish, a code package version), and a new Environment record says which revision of which line runs on staging or production. A story plays through a lens of one design line, one code line and one environment, and that lens is part of its link.
4. **Both directions meet at the gate.** A change from any role shows as a story difference to the others: a design library change shows every journey it touches, and a failing journey points back to its component and design frame. The owner decides (the divergence tenet), and engineering owns every code library change (0011).
5. **The Dev Portal is the graph, published.** Journeys explained step by step, each step opening into its screens, components, tests and later API calls, playable in the browser: web live from a module build, a PR preview or staging with synthetic identities; native from recorded replays and device captures until a device runner exists.
6. **A story player, not a sandbox.** Storybook renders stories only inside a published Storybook, and other pages reach them only as an iframe of it. CIVIC's portable unit is a `<civic-story>` custom element that any page can use, so the Dev Portal, docs sites, wikis and PR comments are all just hosts. It renders in three tiers and upgrades on demand: a **still** (pre-rendered HTML in a declarative shadow root so its styles stay scoped, or a captured image where there is no HTML render, as on native); an **island** (one live component mounted into the shadow root through the existing `mount(container, context)` contract, each framework on its own); and a **frame** (the story's own build in an isolated frame, as the canvas's `review-frame.html` already runs, for whole journeys, clashing framework versions or global styles, live runtimes and native replays). Mixed frameworks never share a runtime, so they don't conflict. A streamed server render stays an option for heavy pages, not the default, because it needs a live server per framework.
7. **Platform-neutral (D8).** A story is defined by the graph, never by a web renderer. Native harnesses wait on device runners, as the native crawl does.

## Consequences

- The roadmap's *journey stories* entry says CIVIC replaces Storybook stories; teams' Storybooks become a migration source and stay readable as `storybook` evidence until they switch.
- `Line` gains release lines and the graph gains an Environment record when this is built; neither is built now.
- 2026-10-15: the first slice is built: `civic.stories/0` story records that point at the graph, and a read-only portal whose steps are `<civic-story>` players with the still and frame tiers, on Laundry and the Card demo ([roadmap](../roadmap.md#order-of-work)). The island tier, replay players, component stories, release lines and the Environment record are not built yet.
- Unchanged: CIVIC makes no model calls (0006, 0007), the playground composes library components rather than drawing (D24), and the order of work is not reordered.
