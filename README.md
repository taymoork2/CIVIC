# CIVIƆ

**Every journey. Every part. One maintainable system.**

CIVIƆ (pronounced and searchable as **CIVIC**) is a cross-platform product system for Design, Engineering, and QA. It connects product intent, design systems, user journeys, platform-specific component libraries, application code, tests, and runtime evidence in one traceable, bidirectional experience.

## Vision

Teams should be able to move from a design system to designed screens, user journeys, per-platform components, app implementation, and validated app behavior, then trace back again. Every layer should stay connected and agree with the others.

CIVIƆ helps teams:

- Explore personas, scenarios, states, transitions, edge cases, and platform variants.
- Review and annotate complete experiences in context, without screenshot-based feedback loops.
- Trace intent and design decisions to components, code, tests, builds, and runtime evidence.
- Find undocumented states, implementation drift, accessibility issues, regressions, and coverage gaps.
- Connect bugs, feature requests, customer feedback, and UX/UI reviews to the affected product intent, implementation, owners, and evidence.
- Maintain composable component contracts with replaceable implementations and coordinated migrations.
- Preserve shared intent while documenting native platform constraints and approved differences.

## Who it serves

Designers, engineers, and QA are the primary users. They share ownership of a versioned product contract: Design protects intent, Engineering makes it operable and maintainable, and QA makes correctness observable and provable. Product Management and Leadership get shared visibility into coverage, readiness, quality, and risk.

## Principles

Like a Honda Civic or Toyota Corolla, CIVIƆ favors understandable systems, standardized interfaces, replaceable parts, and long-term maintainability over unnecessary complexity. Its core should work for startups and scale to enterprise teams with optional governance, ownership, and risk-based assurance.

## Documentation

The full [product vision and specification](docs/product-spec.md) preserves the founding product discussion, decisions, diagrams, MVP, positioning, and business model.

Architecture decisions live in [docs/decisions](docs/decisions). The first demo uses [Microsoft Fluent 2](docs/decisions/0001-fluent-2-demo-design-system.md).

## Running today

Implementation is underway on the [Rehearsal](docs/synthesis-rehearsal.md) base (decision [0002](docs/decisions/0002-rehearsal-is-civic-base.md)): a persistent journey canvas for the Laundry App with contextual review and a three-way Product Contract panel. It runs as the `rehearsal` orb service (`amp orb services ensure`) behind an authenticated Amp portal, or locally with `pnpm --dir rehearsal/source/apps/web run review`. The current roadmap is in [docs/roadmap.md](docs/roadmap.md).

## Status

The Rehearsal handoff is imported, verified, and running in an orb. Web implementation evidence covers all 173 registered screens; design reference, native, and QA evidence are the next gaps.
