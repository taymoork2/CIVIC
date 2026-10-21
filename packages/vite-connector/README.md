# @civic/vite-connector

CIVIC's build connector for Vite apps. It is the dev-only Vite plugin that turns a review host into the journey canvas for one connected app, plus the modules it needs: the project manifest (`civic.project.json`) and its `init`/`check` CLI, the project picker, static discovery, the review index, per-screen fixture fingerprints and the coverage bridge.

An app connects read-only through its manifest. The connector indexes the screens the manifest's scenario registry names, fingerprints each one by its own import closure, serves the review entries and the app's sources to them, refreshes on change, and mounts the [`@civic/shell`](../shell) review server. Nothing is written into the app's checkout, and routine indexing, refresh and serving make no model calls.

## Connecting an app

A `module` app needs only its manifest and a preview entry that exports `mount(container, context)`. Start one with:

```sh
node packages/vite-connector/src/review-project.mjs init --root /path/to/app --id my-app --name "My app" --source src --preview src/preview.ts --write
node packages/vite-connector/src/review-project.mjs check --project /path/to/app/civic.project.json
```

Then open it with the standalone canvas (`node packages/canvas/bin/civic-canvas.mjs --project /path/to/app/civic.project.json`, see [`@civic/canvas`](../canvas)), select it in a host's project picker, or start a host with `CIVIC_PROJECT=/path/to/app/civic.project.json`.

## Hosting the canvas

```js
import { civicReview } from '@civic/vite-connector'

civicReview({
  host,                 // the Vite root
  canvas,               // folder with review.html, review-frame.html and their src/ (normally @civic/canvas); defaults to host
  repo,                 // workspace that owns the review store (.review-data)
  connectors: {},       // adapter kind -> app connector, for apps that aren't plain modules
  review: ({ project, repo, dataDir }) => ({ adapter, coverage, agents, shared, publicHost }),
  runtime,              // optional: (project, source) -> isolated backend for live runs
})
```

`review` returns the shell's options; `runtime` starts the isolated backend when the app declares one. An adapter kind other than `module` needs a connector. A connector without its own `inventory` is indexed from the scenario registry, like a module app. Example's (`apps/web/scripts/review-example-connector.mjs`) shows the whole interface: its own index and fixture fingerprint inputs, module substitutes for app boot, auth and server routes, a checked in-memory source overlay, the packages the app and review must share, the app's CSS for review frames, and a canvas extension (`canvasExtension`) with its flow layout and guided towel run. The connector itself names nothing from Example, and its checks enforce that it imports only Node, Vite and the shell. A module app can name its own canvas extension in its manifest (`adapter.extension`); a connector's `canvasExtension` takes its place.

## CIVIC's shared store

```js
import { civicShared } from '@civic/vite-connector/civic'

review: () => ({ adapter, shared: civicShared({ repo, product: 'example' }) })
```

`civicShared` runs CIVIC's `civic` CLI, so canvas notes become annotations in the reviewed repository's git common directory and can be handed to agents as work requests (decision 0007). It finds the CLI through `CIVIC_ROOT`, or else in the CIVIC checkout this package came from, and returns null when there is none. `product` is the app's product ID in CIVIC's graphs: a whole-screen note anchors to `target:<product>.<scenario>`, and the Contract panel reads that target with `civic screen`.

## Not covered yet

- Live runs: `@civic/canvas` supplies the run service for HTTP APIs and function backends (see its README). TanStack Start server functions are not covered.
- Other bundlers (Webpack, esbuild, Bun, Turbopack, Metro) and Vite+ are not verified. See `docs/design/review-product/platform-adapters.md`.

## Checks

```sh
pnpm --filter @civic/vite-connector test
```
