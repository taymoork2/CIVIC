# Picker targets and source-update notifications

Version summaries now have one action: disclose their previews. Clicking the name, background, or chevron does the same thing, including for versions with a single preview. The expanded area has explicit Open or Update actions. Viewing identifies the current version independently of expansion. Existing active-run confirmation and pending-edit guards remain in place.

The picker uses darker secondary text, larger metadata, and controls at least 44 px high. The header's project trigger fits its contents with a 200 px maximum instead of stretching across spare space. Laundry App / Test copy measured 111 × 44 px on desktop and at a 390 px viewport.

Routine source refreshes use the existing Base UI Toast dependency: one low-priority notification, a four-second timeout, and a dismiss button. The initial load is silent. The toast sits outside the canvas layout; actionable errors retain their existing alerts. No dependency was added.

## Verified

- Browser: desktop at 1440 × 900, picker at 320 × 760, compact header at 390 × 844. The picker remains inside the viewport, its list scrolls, and Open actions can be reached by keyboard without horizontal overflow.
- Clicking Running app's label, Enter, and Space only change disclosure state. Open stages the existing confirmation during a live run. Cancel retains the selected Choose codex checkout.
- Inspected picker buttons, project/window controls, and search input are at least 44 px high. Normal secondary text measures 7.79:1 against the white surface; selected metadata also exceeds 4.5:1.
- Electron: the same Running app disclosure and separate Live app / Test copy Open controls work in the task-owned CIVIC History QA app. The normal CIVIC and Orca applications were not interrupted. The QA app was closed afterward.
- Update notification: changed only a copied Notebook fixture in `/private/tmp/civic-picker-polish`. Its scenario name refreshed while a live title input retained `Draft survives a preview refresh`. The canvas rectangle remained identical (x 248, y 96, width 1032, height 596). Automatic dismissal and the dismiss button both worked. Final toast title uses the shared 13 px typography.
- Canvas and shell TypeScript checks passed, all 70 canvas unit tests passed, shared styles rebuilt, `git diff --check` passed, and the Impeccable detector returned no findings.
- React Doctor completed after allowing registry access: 42/100, with the same five diagnostics recorded in the prior search pass (adapter loop, large AppCanvas, two effect dependencies, and a composed-anchor warning). The anchor has a named icon action in the rendered UI; the scanner does not follow Base UI's render composition. No diagnostics point to VersionRow or Notifications. No unrelated cleanup or suppressions were added.

The temporary Notebook host and isolated Electron QA app were stopped. Source checkouts, connection identities, reviews, and existing evidence were preserved. Physical touch devices, dark mode, native narrow-window resizing, and packaged Electron distribution were not tested in this pass.

## Evidence

- [Desktop disclosure](assets/2026-10-18-picker-disclosure-desktop.png)
- [320 px disclosure and explicit actions](assets/2026-10-18-picker-disclosure-narrow.png)
- [Compact project trigger](assets/2026-10-18-project-trigger-compact.png)
- [Source update toast and retained draft](assets/2026-10-18-preview-update-toast.png)
- [Electron disclosure](assets/2026-10-18-picker-disclosure-electron.png)
