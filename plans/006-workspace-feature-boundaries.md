# Plan 006: Separate workspace composition from navigation and preview controllers

> Executor: this is the last unit, after behavior and styling settle. Move existing behavior incrementally; do not redesign it. Root is the sole integrator and owns final signoff. Do not run this unit concurrently with Plans 001–005 source edits.

## Status and drift

- P3; effort L; change risk HIGH; category maintainability; status DONE.
- Root refreshed the implementation baseline to `b072d2c` after Plans 001–005. Characterization extends the existing real-browser host suite before extraction; no camera/routing algorithms or external adapter sources enter this unit.
- Characterization found two prerequisite guard defects, repaired separately before extraction: queued replacement ignored failed captures, and the frame's runtime observer cleared adapter-published draft flags when no runtime status provider existed. `frame.tsx` joins only this bounded prerequisite fix; recording/runtime formats stay unchanged.
- Extraction is committed through `e8c6639`: inspector, header/map bar, preview session, canvas selection, scene presentation and paged picker data retain their existing guards and shared helpers. All package typechecks/tests and isolated installed-Electron acceptance passed before final clean-checkout signoff.
- Final manual notification acceptance found a prerequisite source-refresh defect: Vite's default HMR reloaded a mounted draft. `0a2da39` confines app source changes to the existing inventory refresh path; a real file-edit regression proves the toast, stale revision and draft/iframe retention. `605075c` repairs an existing browser assertion that measured its expected row count after submitting the post. No runtime protocol or authorization changed.
- Exact-code `bin/signoff --no-post` passed at `605075c49e2384467477a003bfad1724601c7ec1`, including all 38 host/browser checks and the fresh Git-package installation gate. Browser/Electron evidence and explicit environment limits are recorded in [the acceptance report](../docs/dogfood-reports/2026-10-19-workspace-consolidation.md). The documentation commit also requires exact-head signoff before landing.
- Planned at `b99d37b2`, 2026-10-18, plus viewport working edits. Depends on 005 and therefore all focused fixes/readiness.
- Run `rtk git status --short` and `rtk git diff --stat b99d37b2 -- packages/canvas/src packages/canvas/server/canvas-host.check.mjs`. Prerequisite extraction changes are expected; root updates the live excerpts/baseline before this unit. Do not mechanically apply an old file split.

## Why and current state

`app-canvas.tsx:41`'s single AppCanvas function owns viewport state, selected app/flow/screen, camera, preview iframe, transition capture, replay, command actions, and the entire outline/canvas/inspector tree. Its import block includes `useGuidedSession`, `captureScreen`, `useCanvasCamera`, `RunControls`, `ProjectPicker`, `ReviewPanel`, and `useCoverage`. `project-picker.tsx:33-59` likewise mixes modal navigation, requests, draft inventories, comparisons, selection, connection forms, and their UI.

```tsx
const [focused, setFocused] = useState(extension.guidedFlow ?? '')
const [preview, setPreview] = useState<MapScreen | null>(null)
const [adapterVisits, setAdapterVisits] = useState(/* captured visits */)
// later: frame event subscriptions, replay/capture actions, command list, full layout
```

Use `workspace-tools.tsx` and `workspace-search.tsx` as exemplars: small components with explicit inputs, existing shared primitives, and app-scoped behavior. `extension.ts` is an established host seam; it supports a guided session and optional host pages. `canvas-host.check.mjs` enforces the canvas import boundary and currently permits flat relative module paths. Keep the flat layout unless a separate decision justifies folders; this task does not need barrels or a new plugin/state framework.

## Scope and intended boundaries

Edit `packages/canvas/src/app-canvas.tsx`, `project-picker.tsx`, and the helper modules created by prior plans where ownership is moved. Add only cohesive flat modules as needed: `workspace-layout.tsx` for chrome composition, `workspace-inspector.tsx` for pane presentation, `canvas-stage.tsx` for the scene/rendering tree, `use-canvas-selection.ts` for app/flow/screen navigation, `use-preview-session.ts` for iframe/capture/replay lifecycle, and `use-project-versions.ts` for picker data. Small leaf presentations may stay in their existing files. Do not create empty forwarding components, one-function wrappers, or an all-purpose context/store.

Tests in scope: the existing canvas test suites, `server/canvas-host.check.mjs` only when a regression needs it, and the browser suites introduced by Plans 001/003/005. Keep the already extracted viewport controller and API client authoritative. Root owns runner edits and any generated styles. Server APIs, runtime bridge/recording formats, source connections, graph/importer/crawl packages, camera and connection routing algorithms, public package exports and external adapters are out of scope.

## Steps and gates

1. Establish characterization coverage in the existing browser suites before moving code: app→flow→screen focus; selection follows a running frame; pan stops automatic following; dirty drafts and pending captures block replacement; retry retains failed captures; replay errors remain visible; closing/reopening a pane does not duplicate subscriptions; Cmd+K restores focus; switching versions preserves identity and refuses unsafe replacement.
   - Gate: `rtk pnpm --dir packages/canvas exec vitest run` and `rtk pnpm --dir packages/canvas run test:host` pass against the integrated pre-extraction baseline. Fix a confirmed prerequisite defect separately before moving behavior.
2. Extract presentation first, one boundary per change: inspector, scene, then header/outline layout. Pass explicit data/actions and preserve DOM roles, stable keys, event capture order, iframe mounting identity, and CSS classes. Keep AppCanvas as composition; avoid replacing one huge prop object with another catch-all object.
   - Gate after each extraction: `rtk pnpm --dir packages/canvas run check` and the relevant existing browser suite pass. No iframe reload or draft loss occurs solely because a component moved.
3. Extract selection and preview lifecycle only where doing so removes a cohesive responsibility. Preserve refs/generation checks, asynchronous error propagation, event listener cleanup, source-pinned capture/replay, and guided extension hook ordering. Move the settled picker data loading into `use-project-versions.ts` without changing Plan 003's caching, cancellation or request budgets. Keep feature-specific state close to its owner.
   - Gate: all canvas Vitest and host tests pass, including the import-boundary assertion and Plans 001/003/005 suites. `rtk pnpm --dir packages check` exits 0.
4. Root reviews the full extraction against the pre-extraction tree for lost guards/cleanup/error branches and unnecessary abstraction. Run `rtk pnpm --dir packages test`. On the final committed candidate, run `rtk bash bin/signoff --no-post` from a clean checkout that preserves unrelated primary work; the fresh Git-package install gate must pass. Recheck desktop, narrow browser, and installed Electron; retain evidence separately from portable test results.
   - Gate: exact candidate signoff exits 0, all required new test files participate, and final tree/commit identity matches the reviewed candidate. Missing external/device acceptance remains an explicit limit.

## Done / stop / maintenance

- [x] Workspace layout, selection, preview lifecycle, and picker data have explicit owners; AppCanvas composes them.
- [x] No duplicate viewport state, request helper, loader cache, permission model, or camera controller was introduced.
- [x] Existing exports, source identities, runtime journals, captured feedback and drafts remain intact.
- [x] Focus, pan/zoom arrows, replacement guards, listeners and replay behavior retain their characterization results.
- [x] Typecheck, all package tests, fresh-install signoff and promised browser/Electron acceptance are recorded for the code candidate, with existing-window reload and external-device limits explicit.

Branch suggestion `refactor/workspace-feature-boundaries`; concern-based Conventional Commits such as `refactor(canvas): separate workspace pane composition` and `refactor(canvas): isolate preview lifecycle ownership`. No push/merge without execution authority. Stop if extraction requires a new framework, source/recording migration, auth change, import-boundary weakening, or a material behavior change. New features should enter their existing owner module; they should not rebuild a second workspace orchestrator.
