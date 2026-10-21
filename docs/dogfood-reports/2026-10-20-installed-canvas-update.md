# Installed canvas update and landing verification

## Installed Electron

The source-backed Electron launcher was restarted against the updated CIVIC checkout, retaining its existing `.civic-canvas/desktop` profile and local host on port 3012. This installation uses Electron 44.9.0 from the existing local runtime; there is no packaged CIVIC.app bundle to replace.

Manual installed-app acceptance confirmed Orca's version relationships, Laundry's real Git branches and their relationship to main, per-screen camera actions, and the native Command-comma settings shortcut. [Installed Laundry picker](assets/2026-10-20-installed-laundry-picker.png).

The separate-profile Electron settings check passed at 1440, 768, 390 and 360px, covering picker overflow, project tabs, native settings, appearance persistence, canvas defaults, shortcuts, About and project connections. Sandbox and context isolation remained enabled, with Node integration disabled. [Narrow picker](assets/2026-10-20-installed-picker-360.png), [narrow settings](assets/2026-10-20-installed-settings-narrow.png).

The final capture check passed after replacing screenshot request state/effects with a direct review-panel action. At 1440 and 390px, a real Laundry screen saved a 786×1704 PNG for a 393×852 viewport; its region annotation, comment and exact image bytes survived reopening. [Final capture receipt](assets/2026-10-20-installed-capture-result.json).

## Gondolin remains experimental

The [frozen snapshot findings](2026-10-20-frozen-previews-and-screen-captures.md) remain evidence for a future decision, with no Gondolin dependency or default-backend integration. Startup through rendered Home cost 20.55–59.90 seconds and QEMU's physical footprint was 4.1–4.3GiB. Those costs do not justify adoption for active local worktrees.

The earlier cleanup removed 4376.75MiB of owned guest snapshots, dependencies, disks and sockets. Follow-up cleanup verified that no guest remained, then removed the spike-only QEMU 11.1.2 installation (729MB reported by Homebrew) and its known Gondolin image cache (331420KiB). Shared Homebrew prerequisites were retained. Only small reports, scripts and evidence assets remain in this repository; no guest runtime is retained.

## Verification boundary

The final local gate is `bin/signoff --no-post`, run from a clean detached checkout of the committed candidate. It includes graph, review, crawl, importer and package types/tests, example validation, the civic gate and an empty-app package installation/browser check. The landing response records the exact candidate and result after this command finishes; this report does not predeclare that result.

React Doctor's final changed-file scan retained two warnings: a test fetch whose status is explicitly asserted, and the camera hook's world-size effect. Its screenshot-effect and download accessibility warnings were resolved. The scanner still reported 46/100; that score is not a clean bill of health.

Earlier measured gestures improved to approximately 60fps at p95, but one cold-load workload still recorded a 402ms stall. This verification covers macOS Electron and local Chromium; native mobile/TV execution and other desktop operating systems remain unverified. Older incompatible previews remain explicitly unavailable rather than being run against mismatched dependencies.
