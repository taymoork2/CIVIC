# 0005: What CIVIC is

- **Status:** Accepted
- **Date:** 2026-10-11
- **Decider:** Founder
- **Builds on:** [0004](0004-graph-first-journey-engine-as-viewer.md)

## Context

The only visual, working feature is the journey canvas from the v0 journey engine. That made it easy to read CIVIC as "the user-journey dashboard". At the same time, the onboarding and ingestion plan ([onboarding-and-ingestion.md](../onboarding-and-ingestion.md)) puts most of what each role sees inside that role's own tools. Engineering is flagged in CI the way SonarQube does it, QA in test runs, Design in Figma, and Design Engineering on library releases. Both readings can't define the product, so this decision states what CIVIC is.

## Decision

**CIVIC is the quality gate for product behavior across design, components, code, and tests.** Other tools gate code quality (SonarQube) or UI snapshots (Chromatic). CIVIC gates the contract between Design, Design Engineering, Engineering, and QA: whether intent, the component library, the app, and the evidence still agree, and what was decided where they don't.

It has three parts, and only one of them is a screen:

1. **The CIVIC graph.** This is the core: an append-only store of what every tool says about each token, component, screen, state, and journey, plus the evidence and every collaboration record (proposal, decision, divergence, exception, adoption). Tools keep their own artifacts, and CIVIC keeps the links, evidence, and decisions.
2. **Checks and flags in each role's own tools.** Violations and drift are raised at the change that caused them, through integrations. Most people meet CIVIC here, and nobody has to repeat in CIVIC what they already did in their own tool.
3. **One shared space for decisions that need more than one role.** Here people resolve a Contract Conflict, walk a journey across platforms, approve or revisit variance, and see readiness and the variance budget. The journey canvas is the first version of this space, not the product.

## Consequences

- Roadmap acceptance is judged on all three parts, not on the canvas alone. The Fluent 2 Button demo exercises them together: both sides are imported into the graph, the Android mismatch appears as a failed check, and the owners decide in the shared space.
- New capability starts as data in the graph and a check or flag in a role's tool. A new screen in the shared space is added only when a decision truly needs several roles at once.
- "Dashboard" names one possible view of the shared space. It is not the product's name or core.
- Importers stay pluggable (D26, D27), and personas are roles that one person can combine (D25), so the gate works for a solo builder as well as a large organization.
