# Family presets and review evidence

Rehearsal is served at http://127.0.0.1:3010/review, in f0d3, reading Laundry App in f7ce without writing that checkout. The linked app owner supplied `DryingPreview.pieceCount` in e589b397aec431ffd2a5a090293374274998add1. Rehearsal's HomeOverview adapter also follows the extracted `home/home-page.tsx` presenter.

## Try it

Select **Family simulation** in the journey outline, choose a screen, then Play. **Simulation settings** opens the family size (100/500/1000) and starting stage controls. Changes require **Restart simulation**; **Keep current run** preserves the existing preview. Reset affects only this memory preview, retaining saved reviews and proposals.

Direct starting screens:

- http://127.0.0.1:3010/review-frame.html?scenario=family.planning
- http://127.0.0.1:3010/review-frame.html?scenario=family.washing
- http://127.0.0.1:3010/review-frame.html?scenario=family.drying
- http://127.0.0.1:3010/review-frame.html?scenario=family.putaway

Append `&familySize=100` or `500`; default is 1000. Review reproduction links retain size and starting stage; the screenshot and captured input fields remain the evidence for actions made after starting. Opening a reproduction link restores a starting preset, not every previous mutation.

## What runs

Planning and washing fixtures have five synthetic wearers: two adults and three children. The Laundry presenter receives a declared partition of 20 pieces per load: 5, 25 or 50 loads. It does not call the wash planner or generate chemistry. Open the next load, finish its wash using the real SessionView, then Move to drying queue. Only that completed load's original textile IDs transfer; the others remain awaiting wash. Repeat for every load. Returning to Laundry retains a completed wash, and the plan removes transferred loads.

Drying and put-away reuse the linked app's real DryingView with a retained memory queue and declared line-drying fixtures. Start drying, open a dryness check, select dry pieces, then put away the selected subset. Damp and unselected items remain. Wash next load and View drying queue retain both recorded actions and unsaved drying selections. The original five wearers and textile IDs remain throughout; put-away returns those textiles to clean inventory and retains their wash count. Starting directly at drying or put-away still seeds the corresponding synthetic starting state.

Actual sign-in, household authorization, wash-plan generation, chemistry, persistence and backend history remain outside these presets. Unsupported method/preferences, machine, stain and reminder operations fail visibly without advancing. The family loop uses air drying; it does not attest tumble-dryer safety or calibration. This adapter no longer requires DryingPreview.pieceCount; it uses the linked production presenters and injectable operations. Saved reviews retain screenshots and visible inputs; reproduction links restore a starting preset, not a full replay of memory mutations.

## Review and agent workflow

Select the app, flow, screen or arrow and open Review → Comment on selection. Static screenshots support region selection. Live screenshots additionally capture inputs and allow targeting controls. Comments retain target identities, branch conditions/return paths, source receipts and frozen screenshots. Download agent brief includes the exact scope and evidence. It is a handoff, not an automatic authorization to mutate another owner's source.

Family review context validates size/stage on the server, persists them alongside feedback and includes them in the reproduction link. Real accounts and household credentials are never involved.

## Verification

`e2e/review-family.spec.ts` covers all twelve size/stage presets without backend requests; 1000-item selection and partial put-away; reset cancellation; a 500-item run transferring only its original first twenty textile IDs; all five 100-item loads finishing through partial drying and put-away with the same 100 IDs clean and washed once; failed operations retaining items/selections; return paths retaining completed washes and unsaved drying selections; and a saved 500-item canvas review with its agent brief. AppShell provides the real TaskFooter clearance. Preview notices use the app's top placement and leave family controls clickable.

`e2e/review-snapshots.spec.ts` checks visible-only loading and navigation, Play and map-review saving while image responses are blocked. `e2e/review-annotations.spec.ts` covers durable app/flow/path/region/control reviews and retained agent conversation receipts. The focused Node checks include cancelled snapshot work, shared visible consumers, feedback validation, source adapter isolation, coverage and proposals. Current execution totals and runtime evidence are recorded in [build evidence](build-evidence.md).

App-owner connected care-loop and release results are separate evidence. This document records local Rehearsal checks and does not attest chemistry, backend or physical device acceptance.
