# Source rendering and proposal workflow

Read this before creating or refining any app screen, mockup or redesign proposal. This is the shared rendering workflow for OpenDesign and application harnesses.

## Two distinct references

- `source-render-reference.html` shows generated snapshots of what the React app actually renders. The matching `source-reference/receipt.json` records the source checkpoint, input hashes, screen/state, dimensions, theme, text scale and checks. Keep generated examples intact.
- `DESIGN.md`, canonical tokens and maintained components govern the editable design system. A proposed font or interaction may intentionally depart from the app baseline. Record the departure instead of presenting the proposal as current application behavior.

Installing Tailwind here is unnecessary. Source exports already contain the original compiled CSS and local asset bytes. Do not approximate their button, heading, badge or row geometry with another hand-written stylesheet and call that source parity.

## Required screen record

For every current or future screen, identify:

1. The corresponding React screen and synthetic state, or explicitly say the state does not exist yet.
2. A matching generated case and verified receipt. Check current inputs through the application harness; a timestamp or matching title alone is insufficient.
3. A source-baseline view beside the proposed view at equal **content viewport** dimensions. Phone frames must sit outside that viewport. A linked full-size baseline is acceptable when the comparison page cannot fit both.
4. Every intentional difference: typography, anatomy, wording, action priority, interaction or responsive behavior. Unlisted drift requires correction.
5. Checks at phone width, narrow/large-text width and wide width, including paired themes and touch targets. Verify meaningful interactions in the real app separately.

If a source case is missing or stale, mark the comparison **Baseline missing** or **Baseline stale**, and have the application owner capture it. Do not substitute a different screen, historical source example or guessed rendering. Novel states may proceed as clearly labeled proposals; parity cannot be accepted until a corresponding implementation exists.

Generated baseline controls are static. Use the live React link for behavior tests; prototype controls must clearly state their simulated scope. A visual match does not prove care decisions, capacity, doses or machine activity.

## Specimens follow the app

Since the implementation pass, the app is the source for consolidated patterns; canonical describes them.

- An app capture renders the actual presenter (the shipped component) with synthetic fixture state, never a re-drawn copy. A canonical HTML specimen follows that presenter's anatomy, labels and states and names the case it follows.
- Callbacks in a specimen or capture that do nothing are labeled as simulated on the page (“Preview only · nothing is recorded”). Never present a no-op as working.
- Each consolidation needs a receipt case before parity is claimed. Clothing intake, the product form, the wash preparation step, matching-piece counts (drying plan, “Is it dry?” and put-away), the load summary and account recovery have cases. Setup checklist and resume, record field editing, task drafts and not-found have no preview specimen yet, so their comparison stays **Baseline missing**; the application's browser journeys cover their behavior.
- October 6 garment-safety refresh: the receipt's source checkpoint now includes the garment-safety states. Cases whose screens changed carry `"refreshed": "2026-10-06"`: `intake-stains-phone`, `preparation-phone-light`, `preparation-phone-dark`, `preparation-large-text` (now with the “How much” box), `load-summary-running-phone`, `drying-check-phone` and `drying-putaway-phone` (×n counts). The new `garment-care-tab-phone` case captures the Care tab (`closet-record`); its Stain and Fabric (“Not recorded”) rows are in the reference HTML below the 852px screenshot.
- October 6 preview fixtures: the design preview now feeds fixture state to the actual presenters for the garment-safety and water states, and each has a phone light case:
  - `intake-stain-set-in-phone` (`closet-add-stain-set-in`): Food or drink with “Old, set in” chosen and the known-mark hint.
  - `intake-details-fabric-phone` (`closet-add-details`): “What's it made of?” with Cotton chosen.
  - `garment-stain-check-phone` (`closet-stain-check`, 393 × 1400): the Care tab asking “Stain gone?”.
  - `garment-stain-next-phone` (`closet-stain-next`, 393 × 1400): the Care tab's Stain check row and “What next?” with its hint.
  - `preparation-cap-phone-light`, `preparation-cap-phone-dark` and `preparation-cap-large-text` (`laundry-preparation-cap`): the cap drawn beside “How much” from three synthetic marks, planned at the middle one. At 320px with 2× text the row wraps and the cap sits above “How much”; that case is 320 × 1760 so both are in frame. The first import of `preparation-cap-large-text` (receipt `913c830d…`) recorded a page overflow at that size and was not a valid reference; it was replaced after the application fix.
  - `household-water-phone` (`household-water`, 393 × 1180): Household → Appliances with the Water row.
  - `household-water-sheet-phone` (`household-water-sheet`): the Water sheet's result (Water, From, ZIP code and “Did you test it yourself?”). The sample's saves are refused locally.
  - `load-completed-history-phone` (`laundry-completed`): a completed load with matching tees as one ×2 history entry.
- October 6 laundry-day fixtures: the design preview feeds fixture server facts through the app's own `hubState` (or fixture drying-queue state) into the actual presenters. A fixture Convex client answers only the queries those presenters read and refuses every save. A step the presenter keeps in its own state (a tap, typed minutes, an opened disclosure) is taken once after mount. The trial-only notes are off on the capture server. Each state has a phone light case at 393 px unless noted:
  - Laundry tab, at home with one washer and one dryer: `laundry-next-joined-phone` (“Move them to the dryer, then start load 2”), `laundry-next-held-phone` (“Next at about 12:35 PM: start load 2”, the reminder line and Dryer says), `laundry-times-phone` (393 × 1100, “How long do your machines take?”), `laundry-day-plan-phone` (the two choices and “2 small loads could go together”), `laundry-day-home-until-phone`, `laundry-day-spread-phone` (with two wearers, so “Whose day is it?” shows), `laundry-day-strip-phone` (the closed strip) and `laundry-day-hang-now-phone` (“Lights won’t fit today.” with “Hang them to dry now; wash first tomorrow”).
  - Laundry tab, shared room at 320 px: `laundry-shared-ask-320` (“What’s free right now?” in the footer) and `laundry-shared-answered-320` (3+ washers and 1 dryer: Start now / Later marks, “Start 2 washes now” and “Start all 3 now”).
  - Home: `home-dryer-busy-phone` and `home-dryer-busy-large-text` (320 × 1280, dark, 2× text): “Dryer busy until about 12:30 PM” with “Hang or wait”. `home-check-now-phone`: “Check now: White cotton tee”.
  - Drying: `drying-wait-phone` and `drying-wait-phone-dark` (the home dryer busy: Hang them / Wait for the dryer), `drying-wait-smell-phone` (the smell check, with the rack full), `drying-none-free-phone` (“Which dryer?” after None free), `drying-check-marks-phone` (393 × 1000, “Check in 12 min” and “Check now: Navy everyday tee”), `drying-take-out-early-large-text` (320 × 1760, dark, 2× text: the Take out early screen) and `drying-check-missed-phone` (the missed-check callout). The share line with “Hang the tees” is in the `drying-phone-*`, `drying-large-text` and `drying-wide` cases.
  - `load-completed-early-phone` (`laundry-completed-early`): the history line “Tumbled 25 min in Dryer 3, then hung”.
  - `household-laundry-day-phone` (393 × 1380): Appliances with the Water row and the Laundry day section, as the app now shows them.
  - In the drying fixtures, the pieces now leave the washer 25 minutes before the sample's time. They used to be dated 1970, which made every drying case show the smell check.
- Still **Baseline missing** for laundry days:
  - Three states that have previews but are refused by the export because the presenter builds the text from separate text nodes: the strip opened to “Today’s order” (`laundry-day-strip-open`), the early-check callout at the dryer step (`drying-early-check`) and the Take out early screen at phone width (`drying-take-out-early`; its 2× case passes).
  - The hang-now strip at 320 px with 2× text: it records a 12 px overflow of the strip's card, so it is not a valid reference until the app is fixed.
  - The load page's dryer wait callout and None free at its “Which dryer?” step. The load page has no preview; the same callouts are captured on the Drying page.
  - The missed-check reminder on Home and the late-start refit message.
- Still **Baseline missing**: the stained air-dry case with “Stain gone?” (a `drying-stain` preview exists, but its method-sheet kicker renders as separate text nodes, so the static copy differs from the source by a few pixels and the export refuses it) and the Water sheet's ZIP, bill and town steps. The household index cases still show Appliances without the Water row; `household-water-phone` covers it. The trial-only note is never captured.
- Counts in documentation (screens, cards, cases) come from the registry or receipt, or are left out.

## Refresh and verify

The application harness owns capture and import. From the application repository:

```sh
node apps/web/scripts/export-opendesign-reference.mjs
node apps/web/scripts/export-opendesign-reference.mjs --cases apps/web/scripts/opendesign-onboarding-cases.json
# For a different combined bundle, pass its capture-matrix.json instead.
node apps/web/scripts/check-opendesign-reference.mjs '/absolute/path/to/this/OpenDesign/project' drying-phone-dark
```

Default captures cover drying and wash review. A custom matrix is a nonempty JSON array. For example:

```json
[
  { "name": "drying-phone-dark", "screen": "drying-home", "width": 393, "height": 852, "theme": "dark", "scale": 1, "readySelector": "h1", "readyText": "Drying" }
]
```

Use an appropriate expected visible element for each requested state; optional `state` supports `invalid`, `error` or `busy`. Include all cases needed in an imported bundle: importing a focused bundle does not preserve other cases in its receipt automatically. Use a separate output directory via `OD_REFERENCE_OUTPUT` while preparing additions, then publish one consistent bundle/receipt. Do not merge independently dated receipts by hand.

The exporter invalidates prior evidence before capture, waits for hydrated styles, fingerprints application source/public assets/planner fixtures/dependencies, verifies source/reference geometry and control pixels, and produces a version-2 `status: verified` receipt only after success. Some photo rasterization differences are recorded separately. A failed capture must never be imported.

The checker rejects stale, missing or modified reference cases. It checks the captured app inputs and bundle, not whether a proposal's new design is good. Refresh destination files before import, preserve an exact recovery copy, and keep one owner for each edit. Regenerate after application changes; refresh comparisons after deliberate design changes.

## Current coverage and outstanding comparisons

`source-reference/receipt.json` lists the current cases and their source checkpoint. Besides drying, wash review, onboarding, sign-in and the account, invite and profile cases, the reference covers the consolidated states: clothing intake (type grid at phone light/dark, 2× text and wide; search, color, care and stains), the product form (new, barcode-matched and dryer sheets), the wash preparation step (light/dark and 2× text), the load summary on the running-load sheet, drying (plan, “Is it dry?” and put-away), the garment Care tab with its stain check and “What next?”, the intake stain age and fabric, the dose cap, the completed load's history, the household water setting, and the laundry-day states listed above. **setup-first-use** reuses the actual FirstUseChoices component with synthetic callbacks. **sign-in** reuses AccountForm in normal, invalid, error and busy states. Each onboarding state has light/dark pairs at 393 × 852 (1×), 320 × 852 (2× text) and 1024 × 900 (1×). These are appearance references, not authenticated setup or sign-in flow proof. The standalone Welcome remains a new proposed state.

Refresh this combined coverage with `apps/web/scripts/opendesign-onboarding-cases.json`; a default five-case export would reduce the imported receipt coverage. The bundle is not coverage of every indexed screen or state.

| Existing proposal | Source comparison needed |
| --- | --- |
| `laundry-exceptions-proposal.html` | Start with `laundry-review`; compare the deliberate issue-priority/layout differences. Initial phone source exists. |
| `laundry-workspace-proposal.html` | Use the matching wash-review and relevant task states, including a wide source capture. Initial phone wash review exists; other cases need capture. |
| `laundry-guided-proposal.html` | Compare with the `preparation-*` cases (`laundry-preparation` at phone light/dark and 2× text). Demonstrated later task states still need capture. |
| `laundry-onboarding-proposal.html` | Task choice: `setup-first-use-*`; sign-in: `signin-*`, including invalid/error/busy. The proposal links matching phone baselines and lists intentional flow/type departures. Welcome has no standalone implementation. Actual household creation and authentication remain separately unverified. |
| `app-review-proposal.html` | Overview of proposals: link each example's source case and difference record; do not claim blanket parity. |

Apply the same record to all other current screens when touched, and to every new screen. Keep uncovered work visible until the matched capture and comparison pass. OpenDesign's ongoing font/UX work can continue with explicit proposal differences; it must not silently rewrite the implementation baseline.

## Owner prompt

> Work in A Laundered Closet — Design System & Screens (project 43227d24-ee04-414e-a939-eda64e3f4bec). Read `source/render-reference-workflow.md`, `source-render-reference.html`, its receipt and the current design rules before editing. Identify the matching app screen/state and verified source case first. Show the source baseline alongside your proposal, list intentional differences, and verify matching viewport, theme and text-scale cases. If the baseline is absent or stale, say so and request a capture; do not invent a source match.

Do not rely on automatic prompt loading alone. In the result, report the files/case/receipt used, intentional differences and checks. That evidence lets the owner verify that this workflow was followed.
