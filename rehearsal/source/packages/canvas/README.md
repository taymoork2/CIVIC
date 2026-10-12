# @civic/canvas

CIVIC's journey canvas: the review page (`review.html`), the frame that mounts an app's screens (`review-frame.html`), the UI in `src/`, and a host that runs it on its own for any app with a `civic.project.json`.

## Opening an app

```sh
node packages/canvas/bin/civic-canvas.mjs --project /path/to/app/civic.project.json
```

Then open `http://127.0.0.1:3020/review`. The canvas binds to loopback only. Reviews, connections and fixture snapshots live in the store, `~/.civic/canvas` by default (`--store` or `CIVIC_STORE` to change it), so nothing is written into the app. Later runs reopen the last app chosen in the canvas's project picker, which can also connect more apps or create a starter from the Notebook example (`examples/notebook`). Snapshots use an installed Chrome, or Playwright's Chromium when there is none (`CIVIC_BROWSER` names another channel).

Without a connector, the standalone host opens `module` apps: a manifest, a scenario registry, and a preview entry that exports `mount(container, context)` (see [`@civic/vite-connector`](../vite-connector) for `init` and `check`).

## Hosting it elsewhere

`canvasPlugins({ store, connectors, runtime, review })` returns the Vite plugins for a host of your own: React, and `civicReview` from `@civic/vite-connector` pointed at this package. A host that already has its own Vite config, like Laundry's `apps/web`, passes `canvas: canvasRoot` (from `@civic/canvas/root`) to `civicReview` instead.

## Extending the canvas

A connector's `canvasExtension(project)` names a module whose default export is a `CanvasExtension` (`src/extension.ts`). Every field is optional: its own journey graph, flow order and sections, a guided run (a flow played continuously in its own frame, with presentation proposals), the scenarios that run through the preview adapter, extra frame parameters, and an older workspace. Laundry's extension is `apps/web/src/review/canvas-extension.ts`. Module apps get none and use CIVIC's own layout.

The canvas imports only React, `@civic/shell`, its own virtual modules and itself; its checks enforce that.

## Not covered yet

- Runtime and data adapters (seed, identity, clock, isolated effects) exist only for Laundry's Convex backend, so live runs against a backend need the Laundry host.
- Other bundlers are not verified. See `docs/design/review-product/platform-adapters.md`.

## Checks

```sh
pnpm --filter @civic/canvas test   # unit tests, the import boundary, and the Notebook app in a browser
```
