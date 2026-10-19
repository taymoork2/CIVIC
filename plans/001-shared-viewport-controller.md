# Plan 001: Keep every viewport control on one state and resize action

> Executor: read this file fully, keep edits within scope, run each gate, and report evidence to the root controller. Root alone updates `plans/README.md`. Work from the baseline that includes the existing uncommitted viewport picker, not bare `b99d37b2`.

## Status and drift

- Priority P1; effort M; change risk MED; category correctness/tech debt; status TODO.
- Planned at `b99d37b2`, 2026-10-18, plus the viewport edits fingerprinted in `plans/README.md`.
- Depends on: baseline only. May run alongside Plan 002; owns `app-canvas.tsx` until integrated.
- First run `rtk git status --short` and `rtk git diff --stat b99d37b2 -- packages/canvas/src`. Confirm the current-state excerpts and baseline fingerprints. Root must reconcile unexpected drift before edits.

## Why

The header picker stores viewport state in AppCanvas. The inspector stores another copy, initialized only when its iframe reference changes. Changing size in the header can leave inspector appearance/rotation actions holding older dimensions. One controller must own the full viewport, busy/error state, persistence, and the existing frame command; controls remain small presentations of that state.

## Current state and constraints

`packages/canvas/src/app-canvas.tsx:44-67` contains:

```tsx
const [viewport, setViewport] = useState<PreviewViewport>(() => { /* saved app-scoped value */ })
const changeViewport = async (size: Pick<PreviewViewport, 'width' | 'height'>) => {
  const previous = viewport, next = { ...viewport, width: size.width, height: size.height }
  // validViewport, busy, frame.reviewPreview.setViewport, remember, rollback
}
```

`packages/canvas/src/viewport-controls.tsx:8-24` separately initializes state and uses `useEffect(..., [frame])`, then calls `preview.setViewport(value)`. `run-controls.tsx:67` always renders those controls. `app-canvas.tsx:352` passes only `onViewportChange={rememberViewport}` back up.

`viewport-presets.ts` already owns all twelve presets, `presetOf`, and validation. Valid dimensions are integer width 200–1920 and height 200–1600; theme is light/dark; text scale is 1/2. `frame.tsx` owns actual resize and runtime recording. Match `workspace-tools.tsx`'s existing Base UI/shadcn composition and `workspace-tools.test.tsx`'s Vitest style. ADR 0010's boundary is: “Laundry depends on CIVIC”; external app source is not an edit target.

## Scope

Edit `packages/canvas/src/app-canvas.tsx`, `viewport-controls.tsx`, `run-controls.tsx`, `workspace-tools.tsx`, and their focused tests. Add `use-preview-viewport.ts`, `use-preview-viewport.test.ts` if a pure testable helper is warranted, and `packages/canvas/server/viewport-controls.check.mjs`. Root alone registers that suite in `packages/canvas/package.json` and rebuilds generated CSS if needed.

Do not change viewport bounds, recording schemas, frame/runtime authorization, source checkouts, saved localStorage keys, camera/arrow behavior, or the compact picker design. `@civic/canvas/run-controls` is an exported path: retain existing standalone callers through the same controller, rather than duplicating its resize logic or silently breaking props.

## Steps and gates

1. Add a browser regression using the temporary-store/dynamic-port fixture in `server/canvas-host.check.mjs`. Mount a real Notebook/Tasks preview, open the inspector, change the header size, then change inspector appearance. Assert the size stays current and the same iframe/draft survives. Confirm that it reproduces the stale-state behavior; if not, report the actual result and still characterize the shared-state contract before refactoring.
   - Gate: `rtk node --test packages/canvas/server/viewport-controls.check.mjs`; the new regression demonstrates the failure before the fix, with no fixture setup error.
2. Move persistence, default restoration, preset normalization, serialized resize and rollback into `use-preview-viewport.ts`. Accept full viewport patches so theme/text changes preserve the latest dimensions. Resolve the current frame at action time; ignore late results from a replaced frame/project. AppCanvas uses one controller for the header, inspector, and Cmd+K. Any standalone RunControls fallback must instantiate this same controller, never a second controller beside an already supplied owner.
   - Gate: `rtk pnpm --dir packages/canvas run check` exits 0.
3. Make inspector controls consume controlled state/actions. Keep size/device selection in the compact header; retain inspector appearance, enlarged text, rotate, and fold actions using the same state. Clear a preset when custom dimensions cease to match. Failed/not-ready frame changes restore the last successful value and do not persist a false success.
   - Gate: `rtk node --test packages/canvas/server/viewport-controls.check.mjs` passes.
4. Add cases for custom size → appearance, preset → rotation/fold, empty/decimal/out-of-range rejection, rapid actions while busy, not-ready/replaced frame rollback, reload persistence, and older saved viewport values. Use native validity plus existing validation, not a new form library. Add only tests for real behavioral branches.
   - Gate: `rtk pnpm --dir packages/canvas exec vitest run` and `rtk pnpm --dir packages/canvas run test:host` pass; the new suite is included by the root-owned runner edit.

## Done and maintenance

- [ ] One active controller owns header/inspector/commands for a workspace; no independent inspector viewport copy.
- [ ] New regression passes, draft contents and iframe identity survive resizing, and recorded viewport steps still replay in the existing host tests.
- [ ] Typecheck and all canvas tests pass; desktop and 390px picker remain usable.
- [ ] Root reviews scope and updates index status after integration.

Use a task branch such as `fix/shared-viewport-controller`; scoped Conventional Commit example: `fix(canvas): share viewport state across workspace controls`. Do not commit/push unless the execution task authorizes it. Stop on a required public API break, source/evidence reset, unrelated dirty-file conflict, or two failures after a focused repair. Future device additions belong in the existing preset list; the shared controller must remain independent of any particular app.
