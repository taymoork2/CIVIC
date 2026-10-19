# Checkout tabs and shell consistency

Verified on macOS with the installed Electron 44.9.0 runtime and this working tree over `b99d37b2`.

## Changes

- Electron tabs identify the project, checkout and linked workspace. Different checkouts of one project retain separate views; reopening the same checkout reuses its tab.
- The desktop title bar measures 40 px. Narrow windows retain larger targets and use tab overflow.
- Shared shadcn InputGroup and runtime radius tokens fix the filter overlap and square small buttons. The project modal has no extra grid gap, duplicate project heading or horizontal action overflow.
- Identical recorded content has one commit heading with explicit branch checkout choices. Branch names remain attached to their own connection and saved evidence.
- Unsaved reviews, coverage drafts and live runs protect tab closing. Inactive tabs stop new coverage polling and snapshot requests. Closing the last lease stops its owned host; browser-pinned and original hosts remain alive.

## Evidence

- Workspace type/syntax checks: passed.
- Canvas unit tests: 74 passed across 16 files.
- Desktop controller, preload, project host and project API tests: 26 passed.
- Standalone Notebook canvas host smoke test: passed with a 90-second budget.
- Scoped React Doctor: no new findings. The repository-wide score remains 51/100; this was not a general React cleanup.
- Installed Electron acceptance: passed at 1440×1000, 480×800 and the 360 px minimum window width, including two Orca checkouts, a separate Laundry tab, reuse, retained local filtering, close cancellation, host shutdown, sandbox/context isolation and absent renderer Node access. A full polling interval produced no new coverage or snapshot requests in the inactive view. The final close guard also shares the picker's pending guided capture/save protection.
- Browser checks: 800 px, 480 px and 390 px. The 390 px filter input measured 44 px high, and the project modal measured 358 px with no horizontal overflow. Temporary verification tabs and viewport overrides were removed.

Screenshots are in the ignored local store: `electron-checkout-tabs-titlebar.png`, `electron-checkout-tabs-desktop.png` and `electron-checkout-tabs-narrow.png`. A browser proof of the expanded shared commit is at `/private/tmp/civic-picker-shared-commit-narrow.png`.

## Runtime and limits

The updated Electron launcher was reopened against the owned host on port 38951. The existing browser hosts on 3012/58966 were preserved and were not restarted. The launcher remains source-loaded through the installed runtime, rather than a separately signed/packaged CIVIC binary.

Some external Orca worktrees report unavailable previews because their dependencies cannot be resolved. Their checkout dependencies and backend were not changed. Tab/picker acceptance does not certify those app previews. Windows, Linux and physical touch devices were not tested. The first full canvas host attempt was stopped after sandbox port denials; its relevant standalone smoke test was rerun successfully with loopback permission. The workspace implementation was committed as `798afae`; exact-candidate local signoff and publication are the next execution gate. No GitHub CI was dispatched.
