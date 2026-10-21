# Private integrations and preview themes implementation plan

> **For agentic workers:** Use superpowers:executing-plans in this session.
> The root agent is the sole writer; no subagents, external models, or new dependencies.

**Status:** Approved and implemented; validation is recorded in ignored local storage. Full release signoff and publication remain pending.

**Goal:** Remove private project coupling from tracked CIVIC and provide consistent canvas preview themes.

**Architecture:** Keep Vite hosting generic and load optional local integrations explicitly.
Extend the existing manifest, frame, viewport, recording, and capture contracts rather
than introducing another host or settings system.

**Tech stack:** Existing Node, Vite, React, shared shadcn/Base UI, Playwright, Electron.

**Spec:** [Approved scope](006-private-integrations-and-preview-themes.md).

## Global constraints

- Connected app checkouts and their dependencies remain read-only.
- Preserve local connection identities, saved reviews, drafts, and recordings.
- No history rewriting, commits, pushes, or full release signoff in this slice.
- Preserve unrelated untracked files. No eager cross-project indexing or capture.
- One root controller owns implementation and focused acceptance, sequentially.
- Stop for conflicting ownership, failed preservation checks, or a required irreversible change.
- Use the current harness only. Additional provider quota/cost is unknown and unnecessary.

## Review focus

- Missing private integrations: generic startup still succeeds with a synthetic manifest.
- Hidden private assets: removal includes images, archives, generated inputs, and filenames.
- System changes during capture: evidence records the resolved scheme used for that capture.
- Failed theme application: live inputs and the prior usable theme survive.
- Old evidence: absent new fields retain their existing rendering and replay meanings.

## Task 1: Separate optional local integrations from the generic host

**Files:** `packages/local/{start.mjs,vite.config.mjs,package.json,README.md}`, project-specific
local modules, `bin/signoff`, `civic.check.json`, `civic.baseline.json`, affected graph/importer/review
fixtures, and the tracked-reference/asset inventory collected before editing.

**Interfaces:** Keep `canvasPlugins(options)` and `startCanvas({project,store,port})` as the
generic hosting seams. Let local startup optionally load a configured Vite configuration
by explicit path; without one use the standard canvas host and selected manifest.

- [x] Capture an owned-file inventory; copy private integrations and validation inputs to
  `.civic-canvas/private-integrations/` and verify matching hashes before removing originals.
  Keep relative adapter dependencies working through explicit engine paths.
- [x] Add a startup regression using a synthetic project with private integration paths absent.
  Test a missing explicitly configured integration as an actionable error.
- [x] Implement generic startup and preserve existing desktop window/lease lifecycle.
  Configure this machine's private host through ignored configuration only.
- [x] Replace private fixture dependencies with small synthetic fixtures; remove private
  project trees, captured assets, historical reports, and references from tracked contents.
  Update signoff and documentation to use only public examples.
- [x] Run the affected host/window and fixture checks. Inspect the surviving tracked text,
  filenames, and binary inventory. Confirm local validation connections still resolve.

## Task 2: Carry appearance and app themes through preview evidence

**Files:** `packages/vite-connector/src/review-project.mjs`,
`packages/canvas/src/{adapter.ts,viewport-presets.ts,use-preview-viewport.ts,frame.tsx,runtime-bridge.ts,use-preview-session.ts,fixture-picture.tsx,review-panel.tsx}`,
`packages/canvas/server/module-adapter.mjs`, `packages/shell/server/{review-server.mjs,review-recording.mjs}`,
and their focused tests and synthetic example adapter.

**Interfaces:** Keep `ReviewConfig.theme` resolved to `light | dark` for compatibility;
add optional `appearance: system | light | dark` and `appTheme: string` fields.
Declare optional `appearance: { themes: {id,label}[], defaultTheme?: string }` in the
project manifest. Add optional preview-module export
`setAppearance({theme, appTheme}): void | Promise<void>` for application-owned theme APIs.
Validate declared theme IDs at server boundaries; unknown themes are errors.

- [x] Add tests for bounded/duplicate/unknown theme declarations and old manifests/recordings.
- [x] Apply initial appearance before mounting; apply live changes through the same bridge.
  Keep runs, inputs, scroll, and review drafts. Roll back configuration on hook failure.
  Test actual CSS/media-query behavior, not only attributes.
- [x] Resolve system appearance in the canvas and subscribe only while needed. Release
  listeners and ignore obsolete async updates after navigation.
- [x] Carry resolved theme and appTheme through frame URLs, snapshot URLs/cache keys,
  captures, review evidence, reproduction links, and recorded viewport steps. Retain
  legacy capture lookup when these optional fields are absent.
- [x] Test two themes, both schemes, cached/current/historical captures, and replay.
  Keep the existing capture queue and visible-screen demand; no all-project refresh.

## Task 3: Add compact toolbar controls and focused acceptance

**Files:** `packages/canvas/src/{workspace-layout.tsx,workspace-tools.tsx,viewport-controls.tsx,app-canvas.tsx,canvas-stage.tsx,app-overview.tsx}`,
`packages/shell/styles/workspace.css`, existing viewport browser checks, and generic Electron acceptance.

**Interfaces:** Pass the shared viewport controller through the toolbar. Render device,
appearance, and optional app-theme controls together. App themes come only from the
selected public project profile; they are not discovered from application source.

- [x] Add shared shadcn controls beside device/resolution. Collapse labels sensibly at
  narrow widths; preserve accessible names, keyboard use, focus, and loading/error states.
- [x] Verify browser desktop/narrow and Electron with the synthetic themed project:
  shell independence, System changes, theme consistency across live frames and snapshots,
  input preservation, and hidden app-theme control for projects without named themes.
- [x] Check the ignored real-project adapters separately for local compatibility and
  consistent initial/live appearance. Preserve their private acceptance evidence locally.
- [x] Run affected package checks once after integration. Record exactly which checks
  passed and any existing failures; leave publication and release signoff pending.
