# @civic/shell

The parts of the CIVIƆ review shell that know nothing about the application under review. Laundry App (`apps/web`) is the first adapter that consumes them.

| Export | Responsibility |
|---|---|
| `canvas-camera`, `use-canvas-camera` | Bounded pan/zoom camera with a 240px outside margin |
| `canvas-controls` | Select/Hand tools, zoom menu and keyboard shortcuts |
| `reveal-navigation` | Keeps the active outline entry visible without moving the page |
| `contract` | Three-way Product Contract dimensions, alignment and coverage |
| `capture` | Freezes a rendered screen's DOM and allowlisted field values |
| `styles/*.css` | Shell chrome (`.rehearsal`, `.rh-*`, `.app-*`); no application tokens |
| `server` | Loopback review storage: access key, feedback, proposals, captures, fixture thumbnails |

## What an adapter supplies

`reviewMiddleware` takes an `adapter`:

- `screens`: the adapter's declared journey nodes (`{ id, scenario }`), used to validate review targets and proposal edits and to enumerate fixture thumbnails.
- `proposalProperties`: the presentation properties a proposal may edit on those screens.
- `captureFixture(node, { origin, cookie, browser })`: renders one fixed synthetic fixture to PNG.
- `launchFixtureBrowser()` (optional): a shared browser for bulk snapshot runs.

It also takes an optional `coverage({ dataDir, metadata })` factory that opens the app's coverage bridge. The shell guards access, origin and stale inventory for `/api/review/coverage`; the bridge owns expectations, candidates and their versions.

## Still inside the Laundry adapter

The canvas UI itself is now [`@civic/canvas`](../canvas), and the Vite plugin, manifest, picker, discovery, inventory and coverage bridge are [`@civic/vite-connector`](../vite-connector). These remain in `apps/web` because they import Laundry components, fixtures or vocabulary:

- Laundry's connector (`apps/web/scripts/review-laundry-connector.mjs`) and its canvas extension (`apps/web/src/review/canvas-extension.ts`): the flow layout, the towel journey's guided run (`towel-session.tsx`) and the older workspace.
- The fixture frames, synthetic store and Convex runtime adapter (`laundry-frame.tsx`, `store.ts`, `adapters/`, `scripts/review-runtime.mjs`), and the cross-route bindings (`route-actions.json`).
- The feedback context vocabulary in `server/review-server.mjs` (personas, roles and conditions) is still Laundry's.

## Checks

```sh
pnpm --filter @civic/shell run check
pnpm --filter @civic/shell run test
```
