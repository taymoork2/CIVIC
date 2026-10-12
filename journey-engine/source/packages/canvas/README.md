# @civic/canvas

CIVIC's journey canvas: the review page (`review.html`), the frame that mounts an app's screens (`review-frame.html`), the UI in `src/`, and a host that runs it on its own for any app with a `civic.project.json`.

## Opening an app

```sh
node packages/canvas/bin/civic-canvas.mjs --project /path/to/app/civic.project.json
```

Then open `http://127.0.0.1:3020/review`. Three examples are included: `examples/notebook` (screens only), `examples/tasks` (live runs against its own HTTP API) and `examples/reading-list` (live runs through TanStack Start server functions). The canvas binds to loopback only. Reviews, connections and fixture snapshots live in the store, `~/.civic/canvas` by default (`--store` or `CIVIC_STORE` to change it), so nothing is written into the app. Later runs reopen the last app chosen in the canvas's project picker, which can also connect more apps or create a starter from the Notebook example (`examples/notebook`). Snapshots use an installed Chrome, or Playwright's Chromium when there is none (`CIVIC_BROWSER` names another channel).

Without a connector, the standalone host opens `module` apps: a manifest, a scenario registry, and a preview entry that exports `mount(container, context)` (see [`@civic/vite-connector`](../vite-connector) for `init` and `check`).

## Hosting it elsewhere

`canvasPlugins({ store, connectors, runtime, review })` returns the Vite plugins for a host of your own: React, and `civicReview` from `@civic/vite-connector` pointed at this package. A host that already has its own Vite config, like Laundry's `apps/web`, passes `canvas: canvasRoot` (from `@civic/canvas/root`) to `civicReview` instead.

## Extending the canvas

A connector's `canvasExtension(project)` names a module whose default export is a `CanvasExtension` (`src/extension.ts`). Every field is optional: its own journey graph, flow order and sections, a guided run (a flow played continuously in its own frame, with presentation proposals), the scenarios that run through the preview adapter, extra frame parameters, and an older workspace. Laundry's extension is `apps/web/src/review/canvas-extension.ts`. Module apps get none and use CIVIC's own layout.

The canvas imports only React, `@civic/shell`, its own virtual modules and itself; its checks enforce that.

## Live runs

An app with a runtime entry (`adapter.runtime`) runs live in an isolated worker per run (`server/runtime-service.mjs`). Three backends are supported:

- **HTTP APIs** (`createFetchRuntime(seed)` returning `{ fetch(request) }`): the preview calls `context.startRuntime({ routes: ['/api/'], ... })`, and the page's own `fetch` calls go to the run. Writes are recorded with their requests and responses and checked on replay. See `examples/tasks`.
- **TanStack Start server functions** (`createServerFnRuntime(seed)` returning `{ seed?, state?(), context?(), fetch?(request) }`): the canvas rewrites each app module's `@tanstack/react-start` import (`server/server-functions.mjs`). In the preview, `createServerFn(...)` calls go to the run, GET functions as queries and POST functions as recorded mutations named `serverFn:<file>:<name>`; handler and `.server()` bodies are removed, with the imports only they used, so server-only modules never load in the page. In the run's worker the same module runs its real validators, function middleware and handlers, against module state that belongs to that run alone; the entry seeds it and `context()` stands in for what the app's auth middleware would add. Dates, maps, sets and bigints survive the trip. See `examples/reading-list`.
- **Function backends** (`createRuntime(seed)` returning `{ execute(kind, name, args) }`): Laundry's Convex functions, through its own client.

Either way the run's clock, random IDs and browser storage are pinned (`src/runtime-session.ts`).

## Not covered yet

- Identity is whatever the runtime entry seeds from the persona and role; there is no generic auth adapter.
- Other RPC transports that don't go through `fetch` under a route prefix. For TanStack Start: request middleware, `@tanstack/react-start/server` helpers (cookies, headers, `getRequest`) and redirects thrown as `Response` objects; plain values thrown by a server function do reach the caller.
- Other bundlers are not verified. See `docs/design/review-product/platform-adapters.md`.

## Checks

```sh
pnpm --filter @civic/canvas test   # unit tests, the import boundary, and the Notebook app in a browser
```
