# 0012: A rebrand is a token release, read for its blast radius and the overrides that won't follow

- **Status:** Accepted
- **Date:** 2026-10-13
- **Decider:** Founder (decided by Claude under the standing rule that Claude decides and records design decisions; the founder may revise it)
- **Builds on:** [0011](0011-layered-design-libraries.md) (library releases), D29 ([component change flow](../component-change-flow.md)), the roadmap's "rebrand demo" from [Later](../roadmap.md#later-not-scheduled)

## Context

A rebrand changes a design system's token values: brand colors, corner radii, sometimes type. Components that read those tokens follow on their own. What doesn't follow is where the problem is:

- **Literal overrides.** A product instance that sets a property to a literal value, such as a Card with a 20px corner radius, keeps that value. The rebrand changes the radius around it, so the product now looks half-migrated, and nobody can see why from the token file.
- **Forks.** A detached or copied component no longer reads the library's styles at all ([decision 0011](0011-layered-design-libraries.md), point 5), so it keeps the old brand everywhere it appears.
- **Platforms that bind the token differently.** A token one platform reads may be a hard-coded value on another, which a rebrand of the token file doesn't reach.

CIVIC already has the pieces: DTCG tokens with `uses-token` links from the web Button's styles, product instances with their overrides and forks in the Card demo, and design library releases that ask maintainers and tell product owners (0011).

## Decision

1. **A rebrand is a token release.** CIVIC reads it as two DTCG token sets, the current brand and the new one, and compares them by token path. A token whose value changes is in the rebrand; one that only the new set has, or that it drops, is listed too.
2. **The blast radius follows links that are already in the graph.** It runs from a changed token, to the platform components that use it (`uses-token`), to the semantic component they implement, to every product instance of that component and the screen it's on. The blast radius is a list with counts per level, not a score.
3. **An override that pins a property a changed token sets is a hidden override.** The component's style source says which token sets which property, such as the Card's corner radius reading `borderRadiusMedium`. A `local-style` override of that property with a literal value doesn't follow the rebrand. A fork doesn't follow any of it. Each becomes an open Divergence collaboration record, owned by the product team and raised by the design system maintainers, with the old value, the new value and the literal.
4. **The migration table is the output.** For each changed token it lists the old and new values, the components and instances that follow on their own, and the hidden overrides that don't. Each hidden override gets one suggested action, deterministic and with no model call (D30): replace the literal with the token, keep it with a recorded exception, or re-attach the fork. The product owner decides, and CIVIC never edits a design or code file.
5. **The second brand is a stand-in.** The demo's new brand is a made-up theme ("Harbor") over Fluent 2 web light, which changes the brand color ramp and the corner radius scale. Like the Fluent demos, it shows the mechanism on real library sources. Fluent is only an example design system.

## Consequences

- The rebrand demo is the third demo, after Button and Card. It lives in `demo/rebrand` and reads the Button and Card demos' graphs rather than copying them.
- The Card's web styles are vendored from `@fluentui/react-card`, so the Card has `uses-token` links as the Button does.
- Native platforms bind Fluent tokens through their own token sets (Swift and Kotlin). Their blast radius is listed as not read, because the demo reads only the web token file. It is never counted as unaffected.
