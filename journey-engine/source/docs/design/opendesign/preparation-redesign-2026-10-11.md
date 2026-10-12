# Preparation refinement — October 11, 2026

Application source: `31fe2790a818f2b85f0589b1c138ee5bcbef6afc`.
Released build: `phone-31fe279-1791756352086723000` at
<https://your-machine.your-tailnet.ts.net>.

## Final layout and behavior

Back, Preparation and the load caption share one compact toolbar. One labeled
instruction bar leads directly to the task. The current overall care-stage label
remains accessible without another four-label visual row. Default task headers
elsewhere retain their existing layout and report-problem access.

The product, timing and dose share one destination card: 20px inset spacing,
semibold product name, smaller muted timing, tabular amount and a separated unit.
Why and Something different share a quiet flexible row with matching 18px icons,
medium text weight and at least 44px targets. Enlarged text wraps and scrolls;
it is not shrunk to fit. The existing fixed primary footer remains.

The neutral empty-drum image illustrates a destination, not a machine model,
capacity or measurement. Photos blend into their surface; icons remain unfaded.
Only a matching recorded full cap mark can have a calibrated fill picture.
Fractional, below-mark and unrecorded levels retain exact dose wording. Review
uses actual recorded usage instead of the planned dose.

Both supporting actions retain the existing explanation/recovery sheets, sourced
content and eligible choices. Triggers receive focus before opening for WebKit
focus return. Back, arrow and swipe review record nothing. Required Start minutes,
paused recovery gates, trial notes and explicit Laundry Day exit remain intact.
No planner, backend, dependency or care-inference changes are part of this pass.

## Revision history

`bead2709` introduced task focus but retained six context rows. The owner rejected
that hierarchy as busy on mobile; it was never deployed. `cfe093c` compacted the
toolbar and moved Before clothes into the card. After reviewing that dark phone
frame, the owner requested only small polish to the support actions and card.
`31fe2790` delivers that refinement. Earlier immutable reference folders remain
historical evidence, not current design authority or owner final acceptance.

## Application verification

- Final web suite: 824 tests in 95 files, plus thirteen script checks. Final
  focused presentation/dose/review coverage: 89 tests in four files. Types/styles
  pass; no class-collision or compile errors.
- Chrome Dev and WebKit: five compact wayfinding checks each, then two final
  sequence/reflow checks each. All pass with retries disabled. Coverage includes
  five instructions, previous-step review, both sheets and focus return, one dose,
  recorded cap marks, required 1–300 minutes, aligned utility actions and 44px
  targets. Both themes reflow at 320px double text and 1024px width.
- Connected synthetic 100/500/1,000-piece loops pass on isolated 3011/3230, through
  hamper, planning, preparation, running, drying, partial/all put-away, Home Ready
  counts and history. These ran at `cfe093c` before the final presentation polish.
  They use confirmed synthetic care and accelerated timers, not manual intake.
- Twelve final source-bound frames match geometry, with zero changed pixels
  outside photo rectangles. Embedded photo decoding is excluded from pixel
  comparison. Static frames preserve source CSS/assets and do not execute saves.

[Verification receipt](captures/preparation-polish-2026-10-11/verification.json)
and [source receipt](captures/preparation-polish-2026-10-11/source-reference/receipt.json).
Initial sandbox browser-launch, unused test-port and incompatible system-Python
failures are recorded separately from successful final checks.

## Design reconciliation

The registered local MCP writes to canonical project
`43227d24-ee04-414e-a939-eda64e3f4bec`. The
[current gallery](http://127.0.0.1:56713/api/projects/43227d24-ee04-414e-a939-eda64e3f4bec/raw/preview/preparation-redesign.html)
displays twelve exact final frames. Fifty-four file hashes are verified, with
fresh metadata guards and recovery copies; both earlier packages remain intact.
[Local sync receipt](captures/preparation-polish-2026-10-11/local-design-sync.json).

Claude Design project `09b06ef4-f7e2-4993-a507-8220e80798bb` supplied a separate
Preparation redesign proposal and imported both prior exact-source packages.
Its illustrative chemistry, optional-minute Start example and eye-positioned
markers were not adopted. The native desktop imported all twenty-five final files
into `preparation-polish-reference-2026-10-11/` and reports twelve matching HTML
hashes. `Trial preparation.dc.html` now displays those frames. Its saved identity
and light/dark task rendering were independently inspected. The initial and
compact folders remain historical; Final Synthesis and previous supplements stay
intact. [Claude sync record](captures/preparation-polish-2026-10-11/claude-design-sync.json).
Its current supplement and index also record the verified release; the saved
supplement's updated release status was independently inspected.

Claude's review found no obvious clipping at 393px. At 320px double text, the
product/support content requires scrolling and paused explanations are long;
that is an explicit accessibility follow-up, not proof that all content fits
above the fold. Native visual inspection is separate from reported hash checks
and the source-browser geometry/pixel comparison.

## Release and practice

The frontend-only swap preserves backend PID 8259, all 8,157 application records
across 39 tables, existing stored files and configuration. All 96 checked served
build files match; page/auth endpoints return 200. The new illustration is
verified separately. [Release receipt](captures/preparation-polish-2026-10-11/release.json).

[Practice preparation](http://127.0.0.1:3011/design-preview?screen=laundry-preparation&textScale=1)
uses local simulated actions and records nothing in a real household. Recorded-cap
and paused-recovery examples are linked from the current local gallery.
The [laundry-day testing guide](../../testing/laundry-day-2026-10-11.md)
distinguishes synthetic practice, connected QA and actual laundry-day acceptance.

Physical phone/PWA, VoiceOver, manual inventory effort and diverse chemistry
remain unchecked. Earlier backend deadline robustness is outside this frontend
pass. The older 24-frame Claude wayfinding package remains separate open sync
work; this preparation supplement does not claim it is imported.
