# CIVIC

**Every journey. Every part. One maintainable system.**

CIVIC is a cross-platform product system for Design, Engineering, and QA. It connects product intent, design systems, user journeys, platform-specific component libraries, application code, tests, and runtime evidence in one traceable, bidirectional experience.

## Vision

Teams should be able to move from a design system to designed screens, user journeys, per-platform components, app implementation, and validated app behavior, then trace back again. Every layer should stay connected and agree with the others.

CIVIC helps teams:

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

Like a Honda Civic or Toyota Corolla, CIVIC favors understandable systems, standardized interfaces, replaceable parts, and long-term maintainability over unnecessary complexity. Its core should work for startups and scale to enterprise teams with optional governance, ownership, and risk-based assurance.

## Documentation

The full [product vision and specification](docs/product-spec.md) preserves the founding product discussion, decisions, diagrams, MVP, positioning, and business model.

Architecture decisions live in [docs/decisions](docs/decisions). The first demo uses [Microsoft Fluent 2](docs/decisions/0001-fluent-2-demo-design-system.md).

## Running today

CIVIC provides a generic journey canvas, review shell, and artifact graph. Connect a project through its manifest and Vite integration. Public examples cover synthetic Notebook, Tasks, Team board, Reading list, and Pantry apps; real-project adapters and evidence remain local.

The canvas runs on its own for any app with a `civic.project.json`. To try it locally you need Node.js 26 (22 works), pnpm 12.5.1 and Google Chrome:

```sh
(cd packages && pnpm install --frozen-lockfile)
packages/canvas/bin/civic-canvas.mjs --project packages/canvas/examples/notebook/civic.project.json
```

Before a pull request merges, run [`bin/signoff`](bin/signoff) from a clean checkout of its branch. It runs the [graph](graph), [review loop](review), [crawl](crawl), [importer](importers), Button demo, Card demo, and discovery example checks, the `civic check` gate, and CIVIC's [packages](packages) with a check that installs them from git into an empty app, then posts a green `signoff` commit status and a `civic` gate status on GitHub through the GitHub CLI. `bin/civic check --post` posts the `civic` status on its own, red or green. On a branch with an open pull request, signoff also comments the findings that branch introduced, each with the owners it asks (the side that moved) and the owners it tells (roadmap step 10). Add `--browser` to include the Button demo's web evidence. CIVIC uses local signoffs instead of GitHub Actions to keep CI costs down.

## Status

The canvas supports project manifests, synthetic preview adapters, isolated runtime
runs, recordings, snapshots, annotations, and source-version selection. Public
examples exercise these boundaries independently of private connected applications.
