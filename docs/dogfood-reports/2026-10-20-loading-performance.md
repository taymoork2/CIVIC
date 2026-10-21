# Project loading and snapshot costs

Two CIVIC bottlenecks were measured and fixed. A separate Orca CPU stress test was also running throughout the investigation; it was not stopped because it belongs to another task.

## Host load

The script `/tmp/claude/orca/polish2/spin.sh 24` creates 24 infinite shell loops. Its parent was PID 14551, reparented to launchd, and the workers had been running for over 20 minutes. This is deliberate CPU saturation outside Electron/CIVIC. It is a substantial competing workload, although no fan sensor measurement or clean comparison with that test stopped was taken. Those processes and all external source checkouts were left untouched.

## CIVIC changes

Selected Orca preview discovery inspected every Git worktree before filtering to the configured `orcaPreviewSources`. The filter now runs before status inspection and skips unrelated branch enumeration. Full source discovery remains searchable and unchanged when no selection is configured.

Visible snapshot requests launched and closed Chrome for every uncached screen. They now share one browser while draining the serial capture queue. Each screen still uses a fresh isolated browser context, preserving its storage and synthetic-runtime boundary. The browser closes after one idle second or host shutdown. A failed launch can retry; a disconnected renderer is replaced. Cached images continue to bypass rendering.

| Workload | Before | After |
| --- | --- | --- |
| Configured one-worktree discovery | 324 Git commands; 1,663 ms | 5 Git commands; 66 ms |
| Three uncached Home captures | 3 Chrome launches | 1 Chrome launch |
| Second/third captures on otherwise equivalent temporary hosts | 4,020 / 3,753 ms | 2,016 / 2,087 ms |
| Repeated cached image | 1 ms | 1 ms |

The controlled capture runs use the same source manifest, isolated backend, viewport sequence and host configuration; the control disables the shared browser. Cold first-render timings vary with compilation, OS caches and competing CPU load, so they are recorded rather than treated as a reliable speedup. The existing installed host separately took about 12.5–13 seconds per uncached image before restart. These costs belong to CIVIC's capture path and project rendering, not solely the visible Electron window.

[Recorded measurements](assets/2026-10-20-loading-metrics.json)

## Verification and limits

Focused regression coverage checks selected-only Git inspection, unchanged full discovery, separate contexts and viewport caches, cancelled offscreen requests, idle shutdown, host shutdown and disconnected-renderer recovery. The real Orca probe captures three fresh sizes and a cache hit using synthetic data. No model or host commands are executed.

The focused run passed 40 tests with one opt-in source integration skipped. The complete connector suite passed 61 tests; local tests passed 31 with three opt-in integrations skipped. Electron rendered all eleven Orca screens and verified a saved 2× screenshot, comment and agent brief at 1440 px and 390 px, without startup refusal toasts or page errors. The installed CIVIC host and Electron launcher were restarted to apply the changes.

The broader picker still performs Git history reads for its saved versions; those measured about 0.1–0.7 seconds in this loaded environment. Frozen inventory scans measured about 0.3–0.9 seconds. Those paths were not given speculative caches in this change. A quiet-machine fan/CPU comparison remains pending until the separate stress test can be stopped by its owner or with the user's approval.

## CIVIC renderer compilation and loading

CIVIC now uses `react({ compiler: true })` with `oxc-transform-react@0.145.0`, matching plugin-react 6.1.1's peer range. This is the experimental native compiler described in [the 6.1.0 release](https://github.com/vitejs/vite-plugin-react/releases/tag/plugin-react%406.1.0). It compiles CIVIC's canvas and shared shell; connected projects keep their own build configuration. The superseded Babel integration was removed.

The workspace loads through React lazy/Suspense with shared loading and retry controls. Shared UI imports are scanned before startup to prevent dependency rebundles during rendering. Compiler output confirms memoization for snapshots, overview cards and search. The parent AppCanvas still has ref patterns that the compiler skips; this change does not claim every component is optimized or prove an FPS improvement. No blanket memo/useCallback wrappers or uncached `use(fetch(...))` calls were added. The picker callback is stable and its owner updates the focus ref. Electron retains Settings requests while the workspace subscribes.

Final focused browser checks passed cold loading, failed-module retry, live-draft/zoom preservation, and TanStack save/replay. Canvas unit tests passed 85, connector tests 61, and desktop lifecycle tests seven. An earlier broad browser run passed 22 of 23 checks; its reading-list failure passed after the dependency scan fix. React Doctor's new compiler immutability error was removed; two existing anchor-role warnings remain because Base UI's non-button download control requires link semantics. No lint rule was suppressed.

Electron acceptance passed at desktop and 390 px: settings, themes, current-checkout switching, cancellation, explicit new tabs and sandbox boundaries. Startup checks wait for workspace controls rather than treating early theme initialization as application readiness. The local deletion guard refused recursive removal of this run's temporary Vite caches; they remain intact.

Resource use is a product constraint: project loading stays on demand, routine indexing/capture makes no model calls, inactive tabs pause polling, and cached screenshots avoid rendering. Loading feedback alone is not performance evidence. The separate stress workload still prevents a quiet-machine thermal claim.

This report records acceptance before landing; Git history and the delivery summary record the final shipping candidate. Source checkouts, saved reviews and recordings were preserved.
