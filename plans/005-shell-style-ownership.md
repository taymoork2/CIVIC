# Plan 005: Give shell components one styling owner

> Executor: inspect legacy consumers before deleting rules. Reuse installed Base UI/shadcn primitives, Lucide icons, and CIVIC tokens. Root owns generated CSS and acceptance evidence. This is consolidation, not a visual redesign.

## Status and drift

- P2; effort M; change risk MED; category tech debt/accessibility; status DONE.
- Implemented at `b072d2c`. The two layout checks pass for Notebook and the guided Pantry extension at 1280×900, 768×900 and 390×844; the complete 36-test host suite and package typechecks pass. Manual CUA checks cover the picker, narrow viewport popover and command-menu focus return. Installed Electron 44.9.0 acceptance passes at 1440px, 480px and 360px using the owned 39051 host. Its existing runner now waits for lazy preview options before counting them. Screenshots remain in `.civic-canvas/electron-checkout-tabs-{desktop,narrow,titlebar}.png`; browser proof is in `/private/tmp/civic-project-picker-{desktop,narrow}.png` and `/private/tmp/civic-viewport-narrow-final.png`.
- Planned at `b99d37b2`, 2026-10-18, plus viewport working edits. Depends on 004. A read-only style inventory can happen earlier, but writes wait for stable component contracts.
- Run `rtk git status --short` and `rtk git diff --stat b99d37b2 -- packages/shell/styles packages/canvas/src`; root reconciles prerequisite changes and the generated-CSS baseline before edits.

## Why and current state

The live shell loads `shell.css`, `review.css`, generated shadcn CSS, and the three shell canvas stylesheets. Several files own the same broad selectors:

```css
/* packages/shell/styles/canvas.css:8,12 */
.rehearsal button { min-height: 44px; padding: 8px 16px; /* ... */ }
.rh-brand { gap: 20px; min-height: 66px; /* ... */ }
/* packages/shell/styles/canvas-chrome.css:4,5 */
.rehearsal button { min-height: 36px; padding: 7px 10px; /* ... */ }
.rh-brand { min-height: 52px; padding: 6px 12px; /* ... */ }
```

`ui.css` defines semantic `--civic-*` tokens, 36px control and 44px touch targets, title-bar insets, and component rules. `project-picker.css` also styles the project trigger. Existing layers make this a deliberate compatibility cascade, not proof of an active bug; removal must follow migrated consumers.

Match `packages/shell/components.json`: Base UI, `base-nova`, Lucide, `cv` prefix. `ui.generated.css` is generated from `styles/ui.css`; never edit it manually. ADR 0010 keeps external app adapters in their own repositories, so do not import/edit Example source to simplify CIVIC's stylesheet ownership.

## Scope

### Ownership map after the prerequisite changes

- `shell/src/ui/*` and `styles/ui.css` own shared control colors, type, radius, focus, disabled states and 36px/44px targets. Feature selectors must not override those properties for marked primitives.
- `styles/canvas-chrome.css` owns the current workspace header and map-bar layout, breakpoints, native title-bar insets and drag regions. `canvas.css` retains its exported legacy-host fallback without overriding the current workspace.
- `project-picker.css` owns picker layout; `app-canvas.css` owns scene and outline geometry; canvas `shell.css` owns standalone run-control layout. Existing host-extension rules in `review.css` remain supported.
- `ui.generated.css` remains derived from `ui.css`. Public stylesheet exports, safe-area handling, hidden panes and arrow geometry stay intact.

Edit `packages/shell/styles/{ui.css,canvas.css,canvas-chrome.css,app-canvas.css}` and `packages/canvas/src/{shell.css,review.css,project-picker.css}`. Read the existing shell primitives to identify which properties they already own; preserve their source/APIs in this unit. Root integrates `ui.generated.css`. Change raw shell controls to existing primitives only in `app-canvas.tsx`, `viewport-controls.tsx`, `source-browser.tsx`, `coverage-panel.tsx`, `review-panel.tsx`, and `project-picker.tsx` when required to remove their legacy rule. A required primitive implementation change is a scope review for root rather than permission to edit arbitrary UI files.

Add `packages/canvas/server/shell-layout.check.mjs` and root-owned test-runner registration. Do not change application preview styling, arrow geometry, navigation behavior, runtime code, public stylesheet export paths, connection state, or review data. Do not add a UI registry/library or rename every legacy class for cosmetics.

## Steps and verification

1. Record an ownership map in this file: primitives own control colors/type/focus/disabled states, one shell stylesheet owns chrome layout/breakpoints/title-bar insets, and feature styles own only feature layout. Search every candidate selector's consumers, including exported stylesheet paths. Preserve needed host-extension fallbacks.
   - Gate: `rtk rg -n 'rh-brand|rh-map-bar|rehearsal button|rh-project-trigger' packages/shell/styles packages/canvas/src -g '!ui.generated.css'` is reviewed against the map; no source outside scope is edited.
2. Add browser assertions before deletion using Notebook plus the existing guided-extension fixture: desktop 1280×900, narrow 768×900, phone 390×844; project/viewport menus fit their window; keyboard focus is visible; coarse/narrow control targets remain at least 44px; hidden panes stay hidden; menus scroll without moving their fixed actions. Measure computed layout instead of snapshotting every CSS declaration.
   - Gate: `rtk node --test packages/canvas/server/shell-layout.check.mjs` passes against the baseline or reports an explicit existing defect separately.
3. Consolidate one component family at a time. Replace its raw controls through installed primitives, remove only now-obsolete global overrides, and retain public stylesheet paths plus functional legacy fallbacks. Keep mobile safe areas, non-drag button regions, native window controls, and portal tokens. Keep return/branch connection styles intact.
   - Gate after each family: `rtk pnpm --dir packages/shell run build:styles`, `rtk pnpm --dir packages check`, and the shell-layout browser suite pass. Regenerate once more only after additional source-class/style changes.
4. Root dogfoods the installed Electron launcher at desktop and roughly 500px native width: header/project trigger, viewport picker, Cmd+K, modal scrolling, right pane, toast placement, and window controls. Recheck the actual runtime/launcher path first. Run `rtk pnpm --dir packages/local test:desktop` only on a prepared owned local host with a verified `CIVIC_ELECTRON_BINARY`; the current script expects Example/Example registrations and writes a screenshot into its store. Do not run it against someone else's active session. Use native browser/app controls for manual UI checks.
   - Gate: root records successful desktop/narrow browser and Electron screenshots plus failures/skips. `rtk pnpm --dir packages/canvas run test:host` passes with the new suite registered.

## Done / stop / maintenance

- [x] Each migrated family has one declared styling owner and no superseded conflicting override.
- [x] Public stylesheet paths and unconverted host-extension fallbacks remain functional.
- [x] Typechecks, browser layout suite, keyboard/touch acceptance, and source/generated consistency pass. Touch sizing was checked through narrow browser emulation; no physical device was tested.
- [x] Electron sandbox/context isolation and title-bar hit regions remain unchanged.

Use `refactor/shell-style-ownership`; Conventional Commit example `refactor(shell): consolidate chrome styling ownership`. No commit/publication without execution authority. Stop if deletion requires editing an external adapter, if installed Electron is unavailable for promised acceptance, or if a visual change requires new product direction. Report incomplete acceptance honestly. Future primitives should own their states; feature CSS should not restyle every button globally.
