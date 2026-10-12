# Home and Closet refinement — October 11, 2026

Application source: `fecb82f233b92b232b162d4414c9fde3eebdb8d6`.
Released frontend: `phone-fecb82f-1791759575027692000`.
Application, local design and Claude reconciliation are complete within the
verification boundaries below.

## Owner feedback and final behavior

The floating Hanging to dry reminder previously linked to the Laundry landing
without opening its check, and could not be dismissed. Home and the reminder now
open the first active air-drying run's existing check. The entry says Check dryness,
not All dry; opening it records nothing. Other task targets remain intact.
The separate 44px X names the reminder, returns focus to main without scrolling,
and saves only device/household/task-scoped dismissal. A changed run, stage or
piece count can appear again. Care data, notifications and Home/Laundry access
are unaffected. Existing blocked-storage memory fallback is retained.

Home's detached status and small washer illustration are replaced by a contained,
136px rail/linen scene with status beside the task heading. Comparing the explored
generated scene with the preserved Final Synthesis reference led to selecting an
optimized copy of that original artwork: 55,318 bytes, SHA-256
`3d14c0a6eb1659111f75c623ae06f4c1cb0618ec007e5463fb7e4dc46ca66503`.
The generated alternative remains outside the application. The illustration is
decorative, not a machine or garment record, and blends into its own surface.

The owner rejected the interim Closet thumbnail and separate Add row, then the
stacked search/summary/Whose clothes rows. The final populated Closet has a cropped
decorative folded-clothes photo band, faded behind its title, and compact Add in
that title row. Its accessible name remains Add clothes and its target is at
least 44px. The empty Closet retains its full intake action. Photos fade; icons
and controls remain unfaded. The photographic crop is an intentional change from
the contained thumbnail, not a distortion or a claim about real inventory.

The four Closet counts sit on one surface-2 inset, 16px radius and no extra shadow.
Owner scope, piece count, Search and Manage share a compact toolbar. The native
selector retains its accessible Whose clothes label; the repeated Everyone summary
and visible label row are gone. Person selection preserves its previous search/
status-reset behavior. Desktop search stays visible; compact-touch search keeps
the existing gesture and explicit Search control. Grouping, filters, paging,
bulk selection and saved-record controls remain in their existing paths.

Claude's first frame review exposed a real enlarged-text defect: inherited
anywhere wrapping and font-scaled spacing squeezed count labels into letters.
The first `3ccc8df3` runtime was held and never deployed. The final presenter
keeps spacing compact, lets count labels wrap by words, hides decorative photo/
icons when enlarged text needs the space, and wraps the toolbar before the owner
selector can overlap Manage. The accessibility regression checks bound the count
height, owner-control position and control overlap. The original source frames
remain immutable, explicitly superseded evidence.

Home's care bar retains proportional segments and zero counts. Four counts share
one row at normal 320/393px widths, with an explicit two-column layout at enlarged
text. Today's outfit is one named card with an icon, the existing saved summary
and one entry row. Its summary no longer adds a nested card. Existing choice,
household suggestions and wear tracking remain; broader future outfit planning,
growth experiments and recommendations are unimplemented.

## Application verification

- Web: 825 tests in 95 files plus thirteen script checks pass. Types/styles pass;
  1,659 static utilities compile and no class-collision failures remain.
- Final Chrome Dev and WebKit checks pass without retries. Both themes cover
  320/393/1024px, doubled text, four-count alignment, saved outfit display, owner
  filtering, compact Add target/alignment, intake entry and focus return. The
  final enlarged-text cases also prove readable count height and non-overlapping
  owner and Manage controls.
- Connected synthetic 100/500/1,000-item full care loops passed on isolated
  3011/3230 before the final Closet presentation refinement. The 100-item check
  additionally exercises the reminder's exact run link, dismissal/reload,
  unchanged care data, Home check access, four-count row and outfit entry.
  Its final focus-return check passed. Labels are synthetic and timers accelerated;
  this does not validate manual intake or diverse chemistry.
- One concurrent 1,000-item run hit the already-recorded one-second backend
  mutation deadline. A fresh serial run passed in 2.3 minutes. This remains an
  open reliability finding; the successful run does not resolve it.
- Twelve exact source-bound frames match geometry and have zero changed pixels
  outside image regions. One wide Home photo has 13,352 rasterization differences
  inside its image region; the original image bytes and this limit are recorded.

The first narrow-count implementation failed at 320px and was corrected. An
initial WebKit navigation/hydration race and Add focus-return failure were fixed
and rechecked. Old unit selectors referencing the removed visible label were
updated to verify the accessible native selector. Setup-only missing-lsof-path
and empty test-filter attempts were corrected before any release mutation.

## Design reconciliation

The canonical local project is `43227d24-ee04-414e-a939-eda64e3f4bec`.
[Current gallery](http://127.0.0.1:56713/api/projects/43227d24-ee04-414e-a939-eda64e3f4bec/raw/preview/root-polish.html)
and `root-experience-current.html` display twelve current exact references.
Fifty-five final file hashes are verified in a new
`source/root-polish-accessible-reference-2026-10-11/` package. The first twelve
frames in `source/root-polish-reference-2026-10-11/` are preserved as superseded.
Earlier 41-frame roots, Final Synthesis,
preparation and other supplements are preserved; this is not a fresh blanket
verification of the older package. Scoped rules and registry entries use the
existing screens/flows roles. An absent registry entry interrupted the first
sync; completed writes were verified against exact bytes and the guarded recovery
snapshot was used to finish, with no duplicate rule append or unrelated overwrite.

Claude Design's bounded critique informed scene height, task-named sibling
dismissal, focus return, normal/enlarged count layouts and preserved outfit cases.
The final 25-file exact package is imported in native project
`09b06ef4-f7e2-4993-a507-8220e80798bb` under
`root-polish-accessible-reference-2026-10-11/`. Claude reports byte-identical
imports and twelve matching HTML hashes. The saved Trial root polish supplement
identifies final source `fecb82f2` and the verified release; the earlier folder
is linked separately as historical. A wrong current-index link was corrected
and its saved destination inspected. Final light/dark imported Closet files
were independently opened and visually inspected in the native canvas. That
canvas responds to its available width; recorded phone/doubled-text dimensions
are verified separately by the source exporter and application browser checks.
The IAB could not open the Claudeusercontent reference (client block); native
file preview supplied the rendering inspection. No regular Chrome was used.

Claude's final review records the enlarged-text photo as hidden, the toolbar at
y 917 instead of 1,758 and first garment at y 1,413 instead of 2,149. Its static
metrics do not measure label word wrapping; browser screenshots and assertions
cover that. Floating reminder states are absent from the twelve static frames;
their functional proof comes from the connected 100-item check. Saved release
notes explicitly attribute runtime checks to Codex, not a new Claude backend
test. Physical acceptance and future outfit work remain separate.

## Release boundary

The released build changes only the frontend. Backend, planner, dependencies and
care inference are unchanged. A private backup preceded the guarded swap.
Page/auth return 200; all 96 served files match the prepared build. The optimized
Home asset returns 200 with its expected 55,318 bytes and SHA-256. All 8,157
pre-existing application records across 39 tables, stored files and configuration
are unchanged; no new stored files exist. Backend PID 8259 remains running.
Frontend PID 90952 serves the final source. See the sanitized
[release receipt](captures/root-polish-final-2026-10-11/release.json) and
[verification record](captures/root-polish-final-2026-10-11/verification.json).

Physical phone/PWA, VoiceOver, touch gesture acceptance, real laundry, manual
inventory effort and diverse chemistry remain unchecked. The known concurrent
backend deadline and older 24-frame Claude wayfinding import remain separate.
