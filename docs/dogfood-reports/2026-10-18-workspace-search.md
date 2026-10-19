# Current-instance command search

The journey rail's search and the project picker's command menu now use one workspace search. Open it from the rail, the header, the project picker, or Cmd+K/Ctrl+K. The shortcut also works inside the same-origin live preview.

The index uses only the current instance's already-loaded flows and screen states, and exists only while search is open. No project/connection requests are made by the search component. At most ten matching items render; searching can reach items beyond the first ten. Other projects and versions remain available through the project picker, which loads their inventories only when explicitly opened.

Search reaches journeys, screen/component states, Inspect, Review, Contract, Coverage, project/version management, connection management, Play, proposal editing, canvas tools and zoom, viewport presets, and canvas detail. Commands reuse the existing action handlers and disabled guards. Choosing a screen focuses its canvas card without replacing the running preview. Escape returns focus to the header search control, navigation returns focus to the canvas, and modal handoffs retain the destination dialog's focus.

## Verified

- All 68 canvas unit tests passed, including current-instance indexing, multiword/case-insensitive search, ten-result limits, and matches beyond the initial result window. Canvas TypeScript and `git diff --check` passed; shared styles rebuilt successfully.
- Orca: both header and rail open the same menu; keyboard selection focuses Dialog → Dialog · open; Coverage opens its panel; Projects & versions opens its existing modal; Cmd+K from that modal returns to search. Disabled Edit proposal cannot execute. Cmd+K also opens search while focus is inside the live Home iframe.
- Scope: Orca returns no Laundry results. Laundry's independent host returns its family laundry screens and no Orca/Codex results.
- Browser at 1440×900 and 320×740: no horizontal overflow. At 320 px the dialog is 288 px wide and fits inside the viewport.
- Electron: Cmd+K and component-state results verified in the existing task-owned QA app with its isolated browser profile. The normal CIVIC and Orca processes were not interrupted. The QA app was closed afterward.
- React Doctor reported the existing large-component, effect-dependency, adapter-loop, and composed-anchor warnings; its score API was unavailable. No unrelated cleanup was performed.

## Evidence

- [Desktop](assets/2026-10-18-workspace-search-desktop.png)
- [320 px](assets/2026-10-18-workspace-search-phone.png)
- [Isolated Electron](assets/2026-10-18-workspace-search-electron.png)

No new dependencies, source checkouts, or persistent search index were added. Physical mobile keyboards and native narrow-window resizing were not tested in this pass.
