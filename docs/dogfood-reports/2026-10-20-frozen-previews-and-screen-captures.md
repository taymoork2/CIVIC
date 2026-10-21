# Frozen Laundry preview and screen capture checks

## Result

The canvas now attaches paths to the visible preview body, keeps headings outside connection routes, restores Laundry's native gutters for legacy specimens, and exposes a camera action on each screen. Screenshots save immediately as 2× PNGs and can be downloaded, marked with a rectangle and commented on using the existing review editor. Comments reuse the saved image bytes rather than recapturing a changed screen.

The frozen Gondolin guest renders Laundry Home in Electron at desktop and narrow widths. Keep it as a feasibility spike: measured startup/refresh cost and memory do not justify replacing the local preview host yet. No Gondolin dependency or backend switch was added to CIVIC.

## Screen geometry and navigation

- Screen headings occupy 72px plus a 12px gap. The routing model and rendered body now agree; the previous model reserved 65px that the card did not render.
- Forward paths enter the side of a preview; return paths use its bottom. Cross-journey paths avoid the flow header and complete screen cards, including their captions. The previous top port produced the loop above Home's captions.
- Snapshot outlines no longer shrink the image viewport. Shared button sizing explicitly preserves the preview's aspect ratio.
- CIVIC wraps legacy Laundry presenters in Laundry's own `AppShell`. The 393px Home specimen now has 16px gutters and `scrollWidth === 393`; previously its title started at x=0 and its body overflowed to 409px. The Laundry source checkout was not edited.
- The scene no longer gains and loses one giant compositor layer at every gesture. Stable flow layers reduced the largest observed surface from about 2.35 billion pixels to about 111 million. Snapshot visibility and image swaps wait until camera motion settles.

The final detailed-screen check measured p95 frame intervals of 17.4ms and 16.5ms across two gesture runs, with zero image swaps and no long tasks. The broader Electron workload measured p95 15.7ms for desktop overview, 10.2ms at 390px, and 16.9ms for detail. That workload still recorded one 402ms cold-load stall; this is an improvement, not proof that all stutter is eliminated.

Evidence: [screen geometry and layers](assets/2026-10-20-screens-result.json), [gutter screenshot](assets/2026-10-20-screens-frame.png), [canvas paths](assets/2026-10-20-screens-screen.png), [overview/narrow/detail timings](assets/2026-10-20-camera-all-sizes.json).

## Screenshot and annotation acceptance

The Electron check exercised a real Laundry Home specimen on an isolated host and separate desktop profile. It saved a 786×1704 PNG for a 393×852 viewport, set a region to x=10%, y=10%, width=30%, height=20%, saved a comment, reopened it, and compared the review PNG byte-for-byte with the original capture. The exact image, screen identity, region and label survived reopening. Both 1440px and 390px window layouts had no horizontal overflow.

Saved capture references are UUID validated and must match the source revision and complete screen context. A different screen or viewport cannot borrow an existing screenshot. Explicit 2× fixtures have separate cache identities and browser contexts with matching viewport and pixel density.

Evidence: [capture result](assets/2026-10-20-capture-result.json), [desktop annotation](assets/2026-10-20-capture-annotation-1440.png), [narrow annotation](assets/2026-10-20-capture-annotation-390.png). The reusable checks are `packages/local/desktop-capture.check.mjs` and `packages/local/desktop-screens.check.mjs`.

## Gondolin frozen snapshot

Source: read-only `/Users/taymoor/.codex/worktrees/c15d/laundry-app`, HEAD `8ec1724605f733043feac1c708b827ecf408992b`. The clean Git status was checked again after the spike. SDK 0.13.0, QEMU 11.1.2, 2 vCPUs, 3GiB guest RAM, 8GiB disposable COW disk, Alpine Chromium, Electron 44.9.0. One authored `app.home` scenario was enabled.

The host copied an allowlisted source tree into an owned temporary archive. Gondolin mounted only the archive read-only; Vite and the synthetic runtime read an extracted, read-only snapshot on the guest filesystem. No active source checkout, `.git`, `.env` or production data was mounted. Synthetic journals and caches used separate writable guest directories. Root writes failed with `Read-only file system`; the app user also failed to write. After setup, runtime egress to `example.com` was rejected with HTTP 403.

Blockers resolved in the spike:

1. Replace live shared-filesystem source traversal with an archive extracted into the guest.
2. Resolve synthetic backend dependencies from the installed web workspace and expose the installed Playwright package to the managed adapter.
3. Keep extension files inside CIVIC's existing source allowlist, without weakening the route guard.
4. Put Chromium configuration/cache in guest `/tmp`, without changing HOME.
5. Raise ingress's documented 2-second upstream-header timeout to a bounded 60 seconds for cold SSR and capture requests.

A host-side marker edit did not change the old guest or its live document. Explicit replacement loaded marker 2 and a different source digest. The replacement passed strict Home/"Care overview" rendering, fonts/images readiness, a real PNG capture, three fully rendered reloads, and desktop/narrow window checks with no page errors or HTTP 5xx responses.

| Measurement | Baseline | Explicit replacement |
| --- | ---: | ---: |
| Guest boot ready | 0.70s | 3.34s |
| Copy and freeze | 7.52s | 23.72s |
| HTTP ready, from VM start | 12.91s | 35.69s |
| Electron launch through rendered Home | 7.64s | 24.21s |
| VM start through rendered Home | 20.55s | 59.90s |
| Fully rendered reloads | 1.66–1.78s | 2.99–5.74s |
| QEMU physical footprint | 4.1GiB | 4.3GiB |

The replacement ran alongside local browser regression checks, so this is observed local workload cost, not a controlled comparative benchmark. The baseline renderer needed the subsequent Playwright and ingress corrections before the final replacement passed the explicit PNG assertion. Dependencies were pre-provisioned in a Linux checkpoint; these timings exclude first-time installation. The original guest had no `.git`, so the UI's Git HEAD was zero; the host-side source receipt retains the real HEAD. A production backend must carry that receipt into its provenance model.

Evidence: [baseline Electron](assets/2026-10-20-frozen-one-electron.json), [replacement Electron](assets/2026-10-20-frozen-two-electron.json), [replacement guest](assets/2026-10-20-frozen-refresh.json), [source receipt](assets/2026-10-20-frozen-source.json), [replacement memory](assets/2026-10-20-frozen-refresh-memory.txt), [desktop](assets/2026-10-20-frozen-refresh-desktop.png), [narrow](assets/2026-10-20-frozen-refresh-narrow.png), [guest PNG](assets/2026-10-20-frozen-fixture.png). Preparation, guest, controller and Electron scripts plus the Linux lock are retained beside these assets with the `2026-10-20-frozen-` prefix.

## Cleanup and limits

The guest/controller exited, ingress stopped, the owned COW disk and sockets disappeared, and the 4376.75MiB temporary snapshot/dependency tree was removed. SDK dependencies were confined to that tree. QEMU and the pre-existing Gondolin image cache were retained. [Cleanup receipt](assets/2026-10-20-frozen-cleanup.json).

Follow-up: the user requested removal of the remaining spike runtime. QEMU and the known image cache have since been removed; see [installed update and cleanup](2026-10-20-installed-canvas-update.md). The receipt above records the earlier cleanup state.

For actively edited worktrees, keep the normal host preview for fast feedback. A future Gondolin mode should explicitly freeze a content manifest, detect concurrent changes, and refresh by replacing the guest. Never mount the mutable worktree into an active preview. This spike used a clean checkout; dirty/untracked snapshot policy and native app execution were not implemented or verified.

Verification: 85 canvas unit tests, 7 shell unit tests, 24 review-server/module-adapter checks, canvas/shell type checks, generated shell styles, and the Laundry wrapper regression passed. The broad 48-case host/browser run initially passed 47 and found the outside-canvas image bug; that case passed its focused rerun after the fix. Electron capture and camera checks passed independently. The full 48-case command was not repeated after that focused fix.

No commit, push, release, installed-app replacement, or persistent-source mutation was performed. Existing user app sessions were preserved; Electron checks loaded this checkout using isolated desktop profiles and test hosts.
