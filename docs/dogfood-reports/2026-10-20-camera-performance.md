# Canvas camera performance

The Laundry overview regression came from publishing every wheel/pointer update through the full React canvas. The initial Electron CPU profile spent most samples creating React elements and updating their properties, including the hidden detail scene's 232 screen nodes. Detailed journeys also painted world-sized SVG surfaces.

Camera motion now paints screen and path transforms once per animation frame. React receives the settled camera for selection and outline updates; the small zoom control subscribes separately so its percentage remains live. Gesture geometry is read once instead of forcing layout after every transform. World bounds are memoized, identical coverage polls preserve their previous state, and detail paths share an SVG clipped to the visible canvas. Invisible hit regions are suspended during movement; visible arrows remain rendered. Live iframes retain their DOM and drafts.

## Measured Electron result

The checked-in `packages/local/desktop-camera.check.mjs` drives 120 pan frames and 60 zoom frames, samples animation-frame intervals, collects long tasks and a CPU profile, checks live zoom feedback, then verifies path retention, camera alignment and actual pointer dragging. It launches an isolated Electron profile against the existing read-only Laundry preview host. These are automated frame intervals on this Mac, not a physical trackpad or display scanout measurement.

| View | Median interval | 95th percentile | Frames over 25 ms / 179 | Long tasks |
| --- | ---: | ---: | ---: | ---: |
| Desktop overview, before | 25.0 ms | 41.8 ms | 73 | 5 |
| Desktop overview, after | 8.3 ms | 9.3 ms | 1 | 0 |
| 390 px overview, after | 8.3 ms | 9.2 ms | 0 | 0 |
| Desktop detail, after | 8.3 ms | 16.8 ms | 1 | 0 |

The final run retained all 14 overview relationships, all detailed path nodes, and aligned SVG/card transforms. Outline child nodes did not change during those gestures. The maximum final intervals were 32.9 ms in the desktop overview and 50 ms in detail, so this evidence does not claim every frame meets a fixed refresh budget. Narrow overview maximum was 9.3 ms.

Portable measurements: [before](assets/2026-10-20-camera-before.json), [after](assets/2026-10-20-camera-after.json). Full local profiles are under `/var/folders/fd/hz_x5rk15t31rk4cv4mx047w0000gn/T/civic-camera-uQpuj9`.

## Behavior checks

- Canvas and shell TypeScript checks passed; canvas 84 unit tests and shell 7 unit tests passed.
- The browser Notebook check passed at 1280 and 390 px: rapid wheel deltas accumulate correctly, zoom keeps the pointer anchored within half a CSS pixel, and the same live document and typed draft survive navigation.
- Electron path selection passed at 1440, 768, 390 and 360 px, including pointer/keyboard labels and opening an original member path. Evidence: `/var/folders/fd/hz_x5rk15t31rk4cv4mx047w0000gn/T/civic-electron-paths-HCOcLm`.
- React Doctor reported no changed-scope canvas findings. Its shell warning about passing data to a parent is a false positive: the resize effect calls this hook's own camera setter to clamp the current camera to changed world bounds. No warning was suppressed. Aggregate tool scores are not a clean repository-wide health claim.

No dependency was added, no external application checkout was edited, and no commit, push or cloud CI run was performed. The user's existing live-run window was preserved; only the separate Laundry review window was reloaded.
