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

Implementation is underway on the [v0 journey engine](docs/synthesis-v0-import.md), codename Rehearsal (decision [0002](docs/decisions/0002-v0-journey-engine-is-civic-base.md)): a persistent journey canvas for the Laundry App with contextual review and a three-way Product Contract panel. The app-independent shell lives in [`@civic/shell`](journey-engine/source/packages/shell) and Laundry App plugs into it as the first adapter (decision [0003](docs/decisions/0003-civic-shell-package.md)). Per decision [0004](docs/decisions/0004-graph-first-journey-engine-as-viewer.md), the journey engine is one viewer and the first web adapter. The core is a CIVIC-owned artifact graph. The current roadmap is in [docs/roadmap.md](docs/roadmap.md). The `civic check` gate (step 8) runs every check on the graphs in [`civic.check.json`](civic.check.json) and fails on new findings nobody has decided; existing ones sit in [`civic.baseline.json`](civic.baseline.json). A conflict counts as decided only when a Decision record (step 3) is in force on it; `civic decide` records one. The current milestone is real inputs (step 9): [Laundry's graph](projects/laundry) is built from the journey engine's real journeys and Laundry's own Playwright runs. CIVIC's [crawl](crawl) discovers an existing app's screens before anyone writes an adapter (D34), shown on [a second app](projects/discovery-app). The CIVIC graph schema (roadmap step 1) is in [`graph/`](graph). The Fluent 2 Button conflict demo (roadmap step 2) is in [`demo/fluent-button/`](demo/fluent-button), built by the importers in [`importers/`](importers). The Card demo, where a product team changes the design system's Card and CIVIC forecasts each change per platform and checks the design for missing states, is in [`demo/card/`](demo/card). Decision [0005](docs/decisions/0005-what-civic-is.md) states what the product is: the quality gate for product behavior across design, components, code, and tests. It has three parts: the CIVIC graph, checks in each role's own tools, and one shared space for decisions that need several roles. The journey canvas is the first version of that shared space. How each role's tools feed the graph is in [docs/onboarding-and-ingestion.md](docs/onboarding-and-ingestion.md). Decision [0006](docs/decisions/0006-deterministic-civic-for-agentic-teams.md) keeps CIVIC free of model calls and describes how agentic teams use it ([docs/agentic-development.md](docs/agentic-development.md)). Decision [0007](docs/decisions/0007-review-to-agent-loop.md) lets people hand review on the journey to agents as work requests, tracked across branches, worktrees, PR previews, and design drafts ([docs/agent-review-loop.md](docs/agent-review-loop.md)). Its local store, `civic` CLI, capture overlay and MCP server are in [`review/`](review); run them with [`bin/civic`](bin/civic). Decision [0008](docs/decisions/0008-team-records-on-a-git-ref.md) shares those records across a team: `civic sync` merges them through a git ref on the repository's remote, and `civic.access.json` says who may read, write, approve, and resolve. Agents in Claude Code use the [CIVIC plugin](integrations/claude-code): `/plugin install civic --marketplace taymoork2/CIVIC`.

It runs as the `journey-engine` orb service (`amp orb services ensure`) behind an authenticated Amp portal. To run it locally you need Node.js 26 (22 works), pnpm 12.5.1 and Google Chrome:

```sh
cd journey-engine/source
pnpm install --frozen-lockfile
mkdir -p .review-data/fixtures && cp -n ../fixtures/*.png .review-data/fixtures/
pnpm --dir apps/web run review
```

Open <http://127.0.0.1:3010/review>. A browser on loopback needs no key. CIVIC's own tools (`civic recapture`, `civic repro --capture`) and Amp portal visitors who aren't collaborators use the key in `journey-engine/source/.review-data/access-key`. The bundled thumbnails predate v6's per-screen fingerprints, so they show as stale placeholders until current snapshots render.

Before a pull request merges, run [`bin/signoff`](bin/signoff) from a clean checkout of its branch. It runs the [graph](graph), [review loop](review), [crawl](crawl), [importer](importers), Button demo, Card demo, Laundry and discovery example checks, the `civic check` gate, `pnpm run check`, `pnpm test` and the review-server tests locally, then posts a green `signoff` commit status and a `civic` gate status on GitHub through the GitHub CLI. `bin/civic check --post` posts the `civic` status on its own, red or green. On a branch with an open pull request, signoff also comments the findings that branch introduced, each with the owners it asks (the side that moved) and the owners it tells (roadmap step 10). Add `--browser` to include the Button demo's web evidence and the Playwright review-canvas journey while the review server is running. CIVIC uses local signoffs instead of GitHub Actions to keep CI costs down.

## Status

The journey engine is at the v7 handoff: the real Laundry app runs in review with real effects in an isolated backend per run, and runs can be recorded, saved and replayed. It keeps v6's project manifest and picker, static discovery and per-screen snapshot fingerprints, alongside the Contract panel. It runs in an orb. Web implementation evidence covers all 204 registered screens; design reference, native, and QA evidence are the next gaps.
