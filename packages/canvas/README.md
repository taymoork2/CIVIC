# @civic/canvas

CIVIC's journey canvas: the review page (`review.html`), the frame that mounts an app's screens (`review-frame.html`), the UI in `src/`, and a host that runs it on its own for any app with a `civic.project.json`.

## Opening an app

```sh
node packages/canvas/bin/civic-canvas.mjs --project /path/to/app/civic.project.json
```

Then open `http://127.0.0.1:3020/review`. Five examples are included: `examples/notebook` (screens only), `examples/tasks` (live runs against its own HTTP API), `examples/team-board` (the same, behind sign-in), `examples/reading-list` (live runs through TanStack Start server functions) and `examples/pantry` (live runs against named backend functions, with its own canvas extension). The canvas binds to loopback only. Reviews, connections and fixture snapshots live in the store, `~/.civic/canvas` by default (`--store` or `CIVIC_STORE` to change it), so nothing is written into the app. Later runs reopen the last app chosen in the canvas's project picker, which can also connect more apps or create a starter from the Notebook example (`examples/notebook`). Snapshots use an installed Chrome, or Playwright's Chromium when there is none (`CIVIC_BROWSER` names another channel).

Without a connector, the standalone host opens `module` apps: a manifest, a scenario registry, and a preview entry that exports `mount(container, context)` (see [`@civic/vite-connector`](../vite-connector) for `init` and `check`).

## Hosting it elsewhere

`canvasPlugins({ store, connectors, runtime, review })` returns the Vite plugins for a host of your own: React, and `civicReview` from `@civic/vite-connector` pointed at this package. A host that already has its own Vite config, like Laundry's `apps/web`, passes `canvas: canvasRoot` (from `@civic/canvas/root`) to `civicReview` instead.

## Extending the canvas

A connector's `canvasExtension(project)` names a module whose default export is a `CanvasExtension` (`src/extension.ts`). Every field is optional: its own journey graph, flow order and sections, a guided run (a flow played continuously in its own frame, with presentation proposals), the scenarios that run through the preview adapter, extra frame parameters, and an older workspace. Laundry's extension is `apps/web/src/review/canvas-extension.ts`. An app without a connector names its own in its manifest (`"adapter": { "extension": "src/canvas-extension.js" }`); `examples/pantry` files its flows under the manifest's navigation and orders them. Without either, the canvas uses CIVIC's own layout. A guided run (`guidedFlow` and `useGuidedSession`) is offered only to connector apps; the canvas's checks drive one with a check fixture (`src/check-fixtures/guided-extension.tsx`) on the Pantry app under a connector of its own.

The canvas imports only React, `@civic/shell`, its own virtual modules and itself; its checks enforce that.

## Live runs

An app with a runtime entry (`adapter.runtime`) runs live in an isolated worker per run (`server/runtime-service.mjs`). Three backends are supported:

- **HTTP APIs** (`createFetchRuntime(seed)` returning `{ fetch(request) }`): the preview calls `context.startRuntime({ routes: ['/api/'], ... })`, and the page's own `fetch` calls go to the run. Writes are recorded with their requests and responses and checked on replay. See `examples/tasks`.
- **TanStack Start server functions** (`createServerFnRuntime(seed)` returning `{ seed?, state?(), context?(), fetch?(request) }`): the canvas rewrites each app module's `@tanstack/react-start` import (`server/server-functions.mjs`). In the preview, `createServerFn(...)` calls go to the run, GET functions as queries and POST functions as recorded mutations named `serverFn:<file>:<name>`; handler and `.server()` bodies are removed, with the imports only they used, so server-only modules never load in the page. In the run's worker the same module runs its real validators, function middleware and handlers, against module state that belongs to that run alone; the entry seeds it and `context()` stands in for what the app's auth middleware would add. Dates, maps, sets and bigints survive the trip. See `examples/reading-list`.
- **Function backends** (`createRuntime(seed)` returning `{ seed, state(), execute(kind, name, args) }`): the backend's named queries and mutations. The preview calls them through `query(name, args)` and `mutation(name, args)` from `context.startRuntime`, usually behind the app's own client; mutations are recorded and checked on replay. See `examples/pantry`. Laundry's Convex functions use the same entry through its own client.

Either way the run's clock, random IDs and browser storage are pinned (`src/runtime-session.ts`).

### Apps with sign-in

Give each persona a synthetic review identity and say how the app signs in. Emails must be on a reserved domain (`@team.example`, `@example.com`, `.test`, `.invalid`); the manifest never holds a password.

```json
"identity": {
  "signIn": { "path": "/api/session", "body": { "email": "{email}", "password": "{credential}" } },
  "signedOut": ["signed-out"]
},
"personas": [{ "id": "lead", "label": "Team lead", "identity": { "id": "alex", "name": "Alex Rivera", "email": "alex@team.example" } }]
```

Each run gets a fresh review credential for its persona. The runtime entry receives it as `seed.identity` (`{ id, name, email, credential, signedIn }`) and makes that identity an account whose password is the credential, through the app's own user and password code. The run then starts signed in by sending the `signIn` request to the app's real handler (`token` names a field in its response to send as a bearer header), or by calling the runtime's own `signIn(identity)`, which returns `{ cookies?, headers? }`. It starts signed out for the conditions listed in `signedOut` and for screens marked `"identity": "signed-out"` in the scenario registry, such as a sign-in screen.

The session lives in the run, not the page: cookies the app sets are kept and sent by the run, and cleared when it expires them on sign-out. On a sign-in screen, password fields are filled with the run's credential, as a password manager would, so a reviewer types only the persona's email. The page swaps the credential for `[review credential]` before anything is recorded, and the run swaps it back, so recordings never hold it and replay in later runs. `context.startRuntime` returns the persona's `identity` without the credential, and its `load` option reads what the app needs before its first screen is known, such as who is signed in. See `examples/team-board`.

Function backends (`createRuntime`) receive the same `seed.identity` and sign in their own way.

## Not covered yet

- Sign-in through a third-party identity provider (OAuth redirects, magic links, one-time codes) and tokens the page itself keeps and sends; sign-in covers apps whose own API checks a password and keeps a session in cookies or a bearer header.
- Other RPC transports that don't go through `fetch` under a route prefix. For TanStack Start: request middleware, `@tanstack/react-start/server` helpers (cookies, headers, `getRequest`) and redirects thrown as `Response` objects; plain values thrown by a server function do reach the caller.
- Other bundlers are not verified. See `docs/design/review-product/platform-adapters.md`.

## Checks

```sh
pnpm --filter @civic/canvas test   # unit tests, the import boundary, and the Notebook app in a browser
```
