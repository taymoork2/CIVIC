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

## Still inside the Laundry adapter

This is the first extraction step, not a finished plugin contract. These remain in `apps/web/src/review` because they still import Laundry components, fixtures or vocabulary:

- The canvas composition (`app-canvas.tsx`), journey graph (`app-map.ts`, `journey.ts`), towel runtime (`canvas.tsx`), review and contract panels.
- The Vite plugin and inventory (`apps/web/scripts/review-plugin.mjs`, `review-inventory.mjs`), which scan Laundry design references and previews.
- The feedback context vocabulary in `server/review-server.mjs` (personas, roles and conditions) is still Laundry's.

Prove a second, minimal integration before generalizing any of these.

## Checks

```sh
pnpm --filter @civic/shell run check
pnpm --filter @civic/shell run test
```
