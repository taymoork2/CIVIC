# Home state labels — October 11, 2026

Source: `9954ebbc7b11a7c5f8281936a7a3b53fd78cb220`.
Released frontend: `phone-9954ebb-1791760949378676000`.

The owner rejected Nothing waiting above Nothing is waiting and Drying above
the drying-count heading. The shared HomeHero now lets its heading carry the
state. Calm, drying count, hamper, planned/blocked, finished, stage-named and
multiple-running-load heroes omit their top badge. Only a single timed running
load with progress below one retains Washing/Drying: its heading gives time
remaining and would otherwise lose the stage. When the timer ends, the heading
names the stage and the badge disappears. Per-load status badges, progress,
care counts, navigation and all care/confirmation behavior remain unchanged.

## Application checks

- Sixty-one focused Home/Hub/reminder tests pass, including untimed and expired
  timers without duplicate badges and timed wash/dry stages with their label.
- Final Chrome Dev and WebKit checks pass with no retries: light/dark,
  320/393/1024px and doubled text; no badges in calm/drying-count heroes; normal
  care-count alignment; preserved outfit, owner controls, Add and focus return.
- A live synthetic single-load preview independently retains Washing above
  30 min left. Types/styles pass with 1,659 static utilities.
- Twelve exact source frames match geometry and pixels with no image-decoding
  differences. Earlier references remain immutable historical evidence.

The first unit assertion used a data attribute stripped by the existing markup
test helper; it was corrected to assert rendered stage words. That test failure
was a harness mismatch, not an application defect. A timer-boundary review then
added the progress-below-one guard before the final release. The first prepared
`2c68a1d5` runtime was not deployed; the final runtime contains that guard.

This narrow presentation change does not rerun the full web suite, connected
care loop, physical phone, VoiceOver, manual intake or physical laundry. Their
earlier evidence and the concurrent backend deadline remain in the
[root closure](root-polish-2026-10-11.md).

## Design reconciliation

Canonical local project: `43227d24-ee04-414e-a939-eda64e3f4bec`.
The scoped hero rule and twelve current exact frames are saved under
`source/home-state-reference-2026-10-11/`. Current gallery pointers select this
package; 55 file hashes are verified. Earlier root packages, Final Synthesis and
other supplements remain preserved. The gallery records the verified release.

Claude Design project `09b06ef4-f7e2-4993-a507-8220e80798bb` reports 25
byte-identical imports and twelve matching HTML hashes under
`home-state-reference-2026-10-11/`. Its existing Trial root polish supplement
now identifies source `9954ebbc`, the current index and verified release; their
saved UI state was independently inspected and captured. Its markup review
confirms calm/drying headings without duplicate labels. The timed exception is
not among these twelve frames and rests on the separate browser/unit checks.
Prior root packages and other supplements are linked/preserved unchanged.

## Release

The guarded swap changes only the frontend. Page/auth return 200; all 96 served
assets match. All 8,157 pre-existing application records across 39 tables,
stored files and configuration are unchanged; no new stored files exist.
Backend PID 8259 remains running. Sanitized
[release evidence](captures/home-state-label-2026-10-11/release.json),
[checks](captures/home-state-label-2026-10-11/verification.json) and
[local sync hashes](captures/home-state-label-2026-10-11/local-design-sync.json)
retain the boundaries above.
