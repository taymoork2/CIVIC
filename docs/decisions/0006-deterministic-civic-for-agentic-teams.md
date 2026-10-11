# 0006: CIVIC stays deterministic, and agents use it from outside

- **Status:** Accepted
- **Date:** 2026-10-11
- **Decider:** Founder
- **Builds on:** [0005](0005-what-civic-is.md)

## Context

Coding agents make UI code cheap to write. They don't make it any cheaper to know what to build or to prove it was built right, and that's the contract and the gate CIVIC already provides ([decision 0005](0005-what-civic-is.md)). The first proposal for CIVIC's role in agentic development also put agents inside CIVIC: as actors in the graph, as drafters of TV adaptations and adapters, and as builders of throwaway prototypes. The founder rejected that direction for now. The full answer to the founder's questions is in [agentic development](../agentic-development.md).

## Decision

**CIVIC makes no model calls.** Everything it does comes from existing non-AI tools and from static analysis of what can be read from designs and codebases (D30). Teams can use agents to write code, but those agents sit outside CIVIC, and their code reaches CIVIC like anyone else's: through a pull request, a CI push, or an import. An interface for agents (an MCP server, a CLI, or similar) is expected eventually. Its first piece is the read-only export below. How agents write back, if at all, is decided later.

Four changes follow:

1. **A read-only contract export (D31).** `civic context <target> --platform <p>` prints a target's contract: intent, states, transitions, fixtures, component and token mappings, extension points, open records, acceptance criteria, and the stable IDs to put in the code. `civic gaps <scope>` lists what's expected but missing, with owners. Both are plain queries over the graph. The Button demo shows the Android variant's contract as one exported work order.
2. **A static design completeness check (D32).** On design save, rules read the design export, component contracts, and the project's declared conditions and platforms. They find missing states (loading, empty, error, validation, offline, permission), dead ends, unreachable frames, and missing accessibility intent. "Inherits the component's default" is an accepted answer. Risk policy decides which gaps block. Results are counts with denominators. It starts with component-contract and journey-shape rules on the Card demo and Laundry.
3. **Frame walk now, prototypes later (D33).** The scenario player can walk design frames joined by their prototype links, labelled as design intent and never as behavior. Prototypes are deferred. When they come up, the non-AI option is a preview assembled from the component mappings. CIVIC doesn't become a WYSIWYG or no-code builder.
4. **Crawl first to discover existing products (D34).** Existing crawlers and end-to-end drivers find an existing product's states before anyone writes an adapter. Crawled states come in as discovered and need a person to confirm them. An adapter is needed only where a crawl can't tell states apart, reach them, or reset them, and CIVIC can generate a template scaffold for it.

## The crawler choice

The founder asked for the best-maintained open-source crawler, ideally one that covers every platform. Findings on 2026-10-11:

| Tool | Platforms | State |
|---|---|---|
| Crawljax | Web | Apache-2.0. Builds a state-flow graph of DOM states and transitions. Last release 5.2.3 in June 2023. |
| AppCrawler (seveniruby) | Android, iOS, web, HarmonyOS, through Appium | Last release 2.7.4 in December 2021 |
| DroidBot | Android | MIT. Builds a UI transition graph. No GitHub releases; its only PyPI release is an alpha. |
| Fastbot (ByteDance) | Android, iOS | Uses reinforcement learning, so it's out of scope under D30. Last changelog entry September 2023. |
| gremlins.js | Web | Random monkey testing, with no state graph. Last release June 2022. |
| Maestro | Android, iOS, web | Well maintained, but runs scripted flows only, with no crawling |
| **Playwright** | Web | Apache-2.0. 1.64.0 released 2026-10-07. Already CIVIC's first QA input (D26). |
| **Appium** | iOS and tvOS (XCUITest), Android (UiAutomator2, Espresso), macOS (Mac2), Windows, Chromium | Apache-2.0. 3.8.0 released 2026-10-09, with every driver listed released within the last month |

No maintained open-source crawler covers every platform. The dedicated crawlers are either stale or use learning-based exploration. The well-maintained pieces are the drivers.

**Choice:** one small CIVIC-owned crawl loop with platform-specific drivers. It does breadth-first exploration of actionable elements, groups states by a hash of the DOM or accessibility hierarchy, blocks destructive actions (delete, pay, sign out, send), allowlists inputs, takes a screenshot per state, and emits CIVIC events. It runs on Playwright for web and Appium for native. Crawljax's state-flow graph model is the design reference, not a dependency. This keeps one crawl design for every scenario and the best driver on each platform. Hosted crawlers such as Firebase Test Lab Robo can be added later as importers.

## Consequences

- No CIVIC feature calls a model. The roadmap's acceptance that refresh and replay make zero model calls now applies to everything CIVIC does.
- The graph has no agent actor. The author of a change is whoever opened the pull request. For high-risk changes, segregation of duties still applies to the author, whatever tools they used.
- Device profiles for TV, watches, and other surfaces are not added to the schema. TV was an example, and those devices haven't been researched yet.
- A return path to Figma and a rebrand demo stay later work.
