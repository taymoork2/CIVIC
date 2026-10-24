# CIVIC

**Every journey. Every part. One maintainable system.**

CIVIC is a cross-platform product system for Design, Engineering, and QA. Open an app's screens and journeys on a canvas, comment on the screens themselves, and hand each comment to a coding agent as a work request with the evidence attached. Records stay on your machine, nothing is written into your app, and CIVIC makes no model calls. The long version is in the [vision](docs/vision.md).

## Try it

You need [git](https://git-scm.com), [Node.js](https://nodejs.org) 26 (22.18 or newer works) and [pnpm](https://pnpm.io) (`corepack enable pnpm`). Google Chrome is recommended for screen snapshots.

```sh
git clone https://github.com/taymoork2/CIVIC.git && cd CIVIC
bin/civic doctor    # checks your machine and says how to fix anything missing
bin/civic demo      # opens the Notebook example in your browser at http://127.0.0.1:3020/review
bin/civic desktop   # the same in the CIVIC desktop window (downloads Electron on first run)
```

Both commands install the canvas packages on first run. To review your own app, give it a `civic.json` ([how](docs/getting-started.md#your-own-app)) and add `--project /path/to/your-app/civic.json`. Everything CIVIC saves goes to `~/.civic`, not into your app. Press Ctrl+C to stop.

[Getting started](docs/getting-started.md) has the walkthrough, what works today, and what doesn't yet.

## Documentation

- [Getting started](docs/getting-started.md) and the [release notes](docs/release-notes/v0.1.0.md).
- [Vision](docs/vision.md) and the full [product specification](docs/product-spec.md).
- [Architecture decisions](docs/decisions). The first demo uses [Microsoft Fluent 2](docs/decisions/0001-fluent-2-demo-design-system.md).
- The [review loop](review/README.md), the [canvas](packages/canvas/README.md), and the [Claude Code and Codex plugin](integrations/claude-code/README.md).

## For contributors

Before a pull request merges, run [`bin/signoff`](bin/signoff) from a clean checkout of its branch. It runs the [graph](graph), [review loop](review), [crawl](crawl), [importer](importers), Button demo, Card demo, and discovery example checks, the `civic check` gate, and CIVIC's [packages](packages) with a check that installs them from git into an empty app, then posts a green `signoff` commit status and a `civic` gate status on GitHub through the GitHub CLI. `bin/civic check --post` posts the `civic` status on its own, red or green. On a branch with an open pull request, signoff also comments the findings that branch introduced, each with the owners it asks (the side that moved) and the owners it tells (roadmap step 10). Add `--browser` to include the Button demo's web evidence. CIVIC uses local signoffs instead of GitHub Actions to keep CI costs down.

## Status

The canvas supports project manifests, synthetic preview adapters, isolated runtime
runs, recordings, snapshots, annotations, and source-version selection. Public
examples exercise these boundaries independently of private connected applications.
