# Home/Closet release reconciliation

Laundry owner handoff: application `fecb82f233b92b232b162d4414c9fde3eebdb8d6`, documentation `992e16fd4401e255e8a2ad91cff3f64b98a4508a`. The linked f7ce checkout was verified at that documentation HEAD. Rehearsal reads it from f0d3; no owner app, runtime or backend was edited.

The existing watcher recompiles the released Home/Closet presenters and invalidates snapshots by source hash. New frames consume them; open runs preserve their original receipt. A Rehearsal-only image guard defect blocked `/design/*.webp`; bounded image paths are now allowed, with nonimage/secret/app routes still denied. A disposable server check verifies the new allowance and retained restrictions.

Four explicit states now supplement the static graph:

- `route.home.reminder-visible`: real Closet, global hanging reminder and its task-named dismissal.
- `route.home.reminder-dismissed`: the same care records and previously dismissed task, with Home/Laundry access retained.
- `route.home.reminder-changed`: a declared synthetic run/count change that differs from the dismissed task and allows the reminder to reappear.
- `route.drying.reminder-check`: the real check at `/drying?run=<runId>`, with check → drying list → Laundry return paths.

They branch within the existing Home/Drying areas. Conditions and effects stay declared in the registry; generic source navigation is not evidence of traversing these product branches. The wrapper uses the released `LaundryDock`, `HomeOverview`, `ClosetView`, `DryingView`, existing `FixtureConvex` and `SeedPhone`. The latter restores preceding device values on unmount. Queries are synthetic, household effects are refused and explicit task changes belong to fixture controls. Garment editors, full auth/provider behavior and production mutations are outside this bounded reminder fixture.

Verification: browser cases cover visible/dismissed/changed states, exact run IDs, unchanged textile/run records on opening and dismissal, focus return, Home access and return navigation. All requests outside same-origin GET are blocked in these tests. Rehearsal's 30 service checks, types/styles and six graph checks pass; the changed asset guard has its own final two-check rerun. Captures are retained in local `.review-data/reminder-{visible,dismissed,changed,check}.png`.

Canonical design package: `source/root-polish-accessible-reference-2026-10-11`, gallery `preview/root-polish.html`, project `43227d24-ee04-414e-a939-eda64e3f4bec`. Its twelve static frames omit the floating reminder; Rehearsal records this gap rather than claiming those frames cover it. The owner reports completed Claude reconciliation and connected care-loop checks; this update adds no fresh Claude visual approval or backend acceptance. The owner's concurrent one-second mutation deadline remains open. Physical-device, VoiceOver and real-care acceptance remain separate.
