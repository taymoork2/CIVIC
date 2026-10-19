# Connection meanings

The canvas now separates interaction meaning from route geometry. Previously, links to screens positioned earlier in a flow were drawn as returns, while cross-journey links used a separate label rule. Both now use one classifier and renderer.

Navigation uses a filled blue arrow, state updates use a purple arrow with a bar, and Back/Cancel uses a dashed line with an open arrowhead. A declared `when` condition adds a dotted line to navigation or updates. Captured visits increase line weight without changing the interaction color. Tooltips, accessible descriptions, and selected-path review details expose the meaning; the footer's Connections key shows the symbols on desktop and narrow screens.

Registries can explicitly set `interaction` to `navigate`, `update`, or `return`. Older edges infer common labels, with inference identified in the UI. Ambiguous labels still need explicit metadata; classification does not prove that an action executed. Bundles cannot merge different interaction types. Existing path IDs, review targets, and saved evidence are unchanged.

The overview now follows the app's declared navigation section order rather than the first section encountered in the scenario registry. Laundry displays Start, Home, Closet, Laundry, Household, and Me from left to right. Links to earlier destinations retain their real direction and their action type.

## Verification

- All 65 canvas unit tests passed, including spatial backtracking, conditional updates, mixed-type bundle separation, marker rendering, captured-visit styling, section order, and existing obstacle routing.
- Six registry/adapter checks passed, including explicit interaction retention and invalid-type rejection.
- Canvas and shell TypeScript checks and `git diff --check` passed.
- Laundry browser checks at 1440×900 and 320×740: the key fits without horizontal overflow; all 25 cross-journey paths remain mounted through zooming and panning. Family laundry day shows separate conditional update and return styles. Keyboard selection of “Confirm selected pieces dry” exposes its type and condition in Review.
- Refreshed Electron desktop: Orca navigation, shared trunks, and the connection key render using the same implementation. Native narrow-window resizing was not verified in this pass; narrow layout was checked in the browser.
- Refreshed the existing local CIVIC servers on 3012 and 3013, retaining their stores. Laundry reopened in its independent host. No application writes were exercised in this presentation-only pass.

## Screenshots

- [Desktop overview and key](assets/2026-10-18-connection-meanings-desktop.png)
- [320 px canvas and key](assets/2026-10-18-connection-meanings-phone.png)
- [Electron desktop](assets/2026-10-18-connection-meanings-electron-desktop.png)
