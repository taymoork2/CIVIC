# Workspace observations

These are concrete dogfood findings from the first build. They are independent
of application design approval and retain the owner's corrections as evidence.

| Observation | Correction | Evidence |
| --- | --- | --- |
| Scrolling a large page was presented as canvas pan; zoom and branches were hard to follow. | Shared bounded camera for Storyboard and towel Workbench, with wheel/drag pan and pointer zoom. | Camera test; `timeline-screen-focus-desktop.jpg`. |
| Flows stacked vertically despite the requested timeline. | Every flow lies on a horizontal band, in entry/tab order; declared cross-flow actions remain connected. Navigation-order connectors are dashed. | `timeline-neighbor-flows-desktop.jpg`; app-map test. |
| Dye sat above the main path; branch labels overlapped after changing lanes. | Dye moved below; its curved path rejoins Care. Pre-owned skips it on the primary line. Labels occupy separate positions. | `timeline-ownership-branches-desktop.jpg`. |
| Sidebar only listed flow names and could not identify a viewed screen. | Active flow expands into individual screens. Flow fits all screens; screen focuses its card; camera-center detection follows visible screen. | `timeline-camera-follows-screen.jpg`; `timeline-screen-focus-mobile.jpg`. |
| A focused snapshot could hide the Play action below the canvas edge. | Fit includes the action's height. | `timeline-screen-focus-mobile-controls.jpg`. |
| Resize or temporarily hiding one canvas could reset its camera. | Ignore zero-sized hidden stages and refit the active live screen on resize. | Storyboard return/resume check; phone/tablet captures. |
| Automatic navigation reveal could move the entire mobile page. | Scroll only the outline and navigator containers. | Navigator scrolling test; active screen remains visible. |
| Fabric looked like a valid numeric composition although percentages were never entered. | Capture raw visible fields, including empty numeric fields, instead of inferred values. | Recorded Fabric transition; candidate v3 proof. |
| Scenario changes could discard an open run silently. | Browse independently; Start here and preview replacement require a concrete draft-replacement choice. | Cancelled branch-jump browser check. |
| A Save click could have been mistaken for success. | Record the Saved edge only after the real operation confirms success. | Failed-save/retry browser check and `canvas-save-recovery.png`. |
| Separate Workbench and Storyboard destinations felt indistinguishable; Review could share the edit pane. | Owner-approved one persistent canvas. Live interaction, journey context and review are capabilities reached through selection, zoom and the right pane. | `single-canvas-desktop.jpg`, `single-canvas-review-phone.jpg`; retained-input and frozen-review checks. |
| Source discovery treated `typeof search.screen === 'string'` as a screen. | Match only the actual screen identifier; assert that the phantom entry cannot reappear. | Review inventory check. |

The whole-app fit necessarily makes thumbnails tiny across a long timeline. Flow
and screen fit controls provide readable inspection. A future overview treatment
can simplify distant content without changing the underlying state identities.
