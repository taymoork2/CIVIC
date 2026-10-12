# Automatic snapshot refresh

Inventory polls and source watching already update automatically. Live runs retain their starting revision and unsaved inputs; automatic refresh does not discard a run. The short update notice clears after six seconds.

Snapshot storage is persistent under the selected private review store's `fixtures/`. Each screen now has a content fingerprint derived from its declared fixture, component/import closure, adapter bootstrap and shared rendering inputs. Shared CSS, assets, packages and backend source are conservatively included. Unknown/generic adapter closures are conservative; this is source hashing, not perfect per-export or semantic analysis. Git identity and expectation-only changes do not force unrelated fixture renders.

The server keeps a content-addressed image plus a source-version alias for historical review evidence. A changed aggregate inventory can reuse an unchanged screen fingerprint without launching a browser. Fresh pixels get written atomically. The latest-pointer file allows a newly opened canvas to display its last cached image while the current revision renders. Older caches are read as explicitly stale; they are never silently promoted to current proof.

Only visible/near-visible pictures request rendering. Offscreen requests are cancelled; Play and reviews keep separate access to the server. Old images stay visible with Updating or Retrying labels. Failed requests automatically retry with exponential backoff capped at 30 seconds while visible. The frozen-fixture review path requests its exact source; it does not use the stale display fallback.

The reported Home failure exposed a capture readiness bug: reminder presenters were treated as modal dialogs. They now wait for their actual page heading. No synthetic care data, source app or backend was changed by this repair.

A cold Vite dependency-optimization reload can reject the initial preview import. An unmounted frame retries that transient import failure up to twice, preserving its starting parameters. This never reloads an already published run or handles ordinary app/validation failures by discarding state. A browser regression explicitly aborts the first module request and verifies recovery.

Verification: two service regressions cover dependency/shared-style invalidation, exclusion of Git/expectation identity, disk reuse across unrelated revisions and restart, changed-input rendering and historical evidence. Two Chromium cases cover old-image retention during automatic refresh, recovery from a 503 and visible-only nonblocking loading. The previously failing reminder screenshot returned a valid PNG from the live server. All 32 service checks and types/styles passed.

Deliberate limits: broad shared dependencies may still invalidate several screens; no AST/per-export visual dependency engine was added. Historical captures are retained because saved reviews may reference them; cache garbage collection needs an explicit retention policy. Opening a cached picture never establishes an observed product transition, design approval, backend or physical-device acceptance.
