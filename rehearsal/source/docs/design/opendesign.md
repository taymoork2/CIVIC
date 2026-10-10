# OpenDesign coordination

## Canonical workspace

**A Laundered Closet — Design System & Screens** is the canonical source for
design rules, reusable components and screen mockups.

- Project ID: `43227d24-ee04-414e-a939-eda64e3f4bec`.
- Local directory: `/Users/taymoor/Library/Application Support/Open Design/namespaces/release-stable/data/projects/43227d24-ee04-414e-a939-eda64e3f4bec`.
- Read `DESIGN.md`, `SKILL.md`, `README.md`, `colors_and_type.css`, `tokens.css`
  and the relevant screen/component bundle before UI work.
- Prefer the OpenDesign connector's `get_artifact` to retrieve a complete bundle.
  Select the project by ID so the active window cannot redirect work to a different project.
- Record the starting content hashes or revision in the linked change record.
  Refresh files before writing and reconcile intervening changes.

The HTML/JS kit supplies design and interaction references. Implement its roles
in the existing React/TanStack Start app; retain the actual Convex and planner
behavior. Example care, product and machine records are not real-use evidence.
Generated application CSS remains derived from the repository's token sources;
update source tokens and regenerate when adopting a coordinated token change.

## Ownership and changes

OpenDesign owns current design-system files and mockups. Application harnesses
own runnable application code and integration. One owner reconciles each design
change; overlapping workers must not overwrite the same design files.

| Finding | Required coordination |
| --- | --- |
| Implementation defect such as clipping or broken focus | Fix application code and verify it. Update the reference only if it has the same defect. |
| Missing state such as long content, offline recovery or permission denial | Add the state to the relevant mockup/component and application. |
| Intentional shared-pattern change | Update the canonical rule and affected examples, then propagate to application components. |

Carry one change record with reproduction steps, screenshot/recording, affected
screen/component, starting revision or hashes, decision and final verification.
An urgent authorized application fix may precede design reconciliation; keep that
reconciliation visibly pending and finish it before claiming the coordinated
change complete. Report application checks and design-package checks separately.

Connecting MCP supplies capabilities; it does not automatically synchronize
designs and application code. Do not assume a design update is implemented, or
that an implementation fix has reached OpenDesign, without inspecting both.

## Historical project

**A Laundered Closet — Legacy Archive**, ID
`1dee16e6-3eaa-46ef-a677-6376e4cdc75f`, is historical evidence only. Do not use
its old freeze instructions or source examples as the active design contract.
The canonical project's `source_examples/` and original assets preserve identical
copies of its mockups/assets. Original metadata and history remain in the legacy
project until separately authorized retirement.

Before retirement, every legacy project file was captured and verified in
[the archive](opendesign/archive/legacy-redesign-1dee16e6-2026-10-03.zip), with
[per-file hashes and comparison](opendesign/archive/legacy-redesign-1dee16e6-2026-10-03.json).
The file archive does not preserve OpenDesign's conversation database history.
Keep one workspace authoritative even while the clearly named archive remains visible.

## Current reconciliation

The October 9 saved-editor follow-up removes leftover disclosure inside product
and item tabs. Contents, warning routes, barcode lookup and garment fields use
visible named sections; applicable product safety routes use mounted tabs.
Guided optional intake and supporting-source explanations remain distinct.
Canonical rules and bounded examples are reconciled through the available
connector. [Application, design and release proof](opendesign/editor-sections-visible-2026-10-09.md)
records generated-reference and physical-device limits separately.

The October 9 trial completion pass shares a static green check across welcome
and load receipts, acknowledges the first confirmed intake save inside Saved,
and uses the existing brief notification for drying confirmations. Durable
milestone identity remains post-trial. Canonical rules and bounded examples are
patched locally while the connector is offline; generated references remain
Baseline stale. [Application and design proof](opendesign/trial-completion-feedback-2026-10-09.md)
keeps those boundaries separate.

The October 9 Closet cleanup removes persistent first-save and first-wash
milestone cards. The existing Saved sheet and brief notification confirm adding
items. The canonical rule is patched locally while the connector is offline;
the old generated first-wash snapshot is explicitly Baseline stale.
[Application and release evidence](opendesign/closet-confirmations-2026-10-09.md)
records the scope and remaining generated-reference limit.

The October 9 appliance editor shows model/size, checked wash programs and
manufacturer references as plain sections. Washer sanitizer evidence has its
own tab. Shared manufacturer references in product and garment More also remove
the Advanced layer. The canonical rules and bounded example are reconciled;
[application and release proof](opendesign/appliance-sections-2026-10-09.md)
separate scoped checks from generated-package and physical-device acceptance.

The October 9 app-wide pencil audit covers all five saved-record families.
Shared Sheet nesting now keeps parent pencils disabled through child dismissal,
including profile editors/confirmations and garment care/history drawers.
Replacement forms retain their editing header controls. The canonical rule and
bounded profile example are reconciled; [audit and release proof](opendesign/all-record-pencils-2026-10-09.md)
separate application, design and physical-device verification.

The October 9 nested garment quick-edit drawers retain the underlying record's
pencil in place, disabled until the editor closes. Save/Cancel restores it and
the selected record tab. Forms that replace the record keep their existing
header behavior. The canonical rule and bounded garment example are reconciled;
[application and release proof](opendesign/quick-edit-pencil-2026-10-09.md)
record verification limits.

The October 9 saved-record pencil extension covers garments, clothing profiles
and saved water results alongside products/appliances. Profiles open a compact
summary, then their existing editor; new profiles open directly into the form.
Cancel retains dirty-dismissal protection and enlarged-text footer reachability.
The canonical rule and bounded garment/profile/water examples are reconciled;
[application and phone release proof](opendesign/record-edit-extension-2026-10-09.md)
separate scoped checks from generated-package and physical-device acceptance.

The October 9 inventory record Edit action now uses a fixed, labeled pencil
button at the top left, beside Back when present. It opens the selected product
tab and hides during editing. This supersedes the earlier body-Edit placement.
The canonical rule and bounded product specimen are reconciled; [application
and release proof](opendesign/header-edit-2026-10-09.md) record verification limits.

The earlier October 9 manufacturer lookup pass moved lookup into Edit → Advanced
for appliances and products. The sectioned More pass above supersedes that
disclosure placement. Matched references and source directions remain in Edit. Nested lookup
cancellation retains manual drafts. The canonical rule and existing product
specimen are reconciled; [application and release proof](opendesign/manufacturer-edit-2026-10-09.md)
separate scoped browser checks from generated parity and physical acceptance.

The October 9 product record hides inactive panels from layout while retaining
draft state, placing Edit details below the selected tab. Appliances and products
use confirmed Remove actions and remain restorable under Removed. Canonical rules
and the bounded confirmation example are reconciled; application and release
proof are in [inventory-record-actions-2026-10-09.md](opendesign/inventory-record-actions-2026-10-09.md).

The October 9 guided appliance/product intake saves basic inventory through
applicable questions with Back, progress and one fixed action. Named optional
details and existing direct edits preserve evidence validation; missing product
facts do not authorize dosing or Start. Application and canonical checks pass;
the phone preview serves `1e7fc21`. [Proof and limits](opendesign/guided-intake-2026-10-09.md)
record served-browser, data preservation and physical-device acceptance separately.

The October 9 machine editor disables Save for invalid drafts, clears optional
rinse-contact records explicitly, and keeps errors in the scrolling form.
Washer-only fields do not block a dryer. The canonical appliance rule and example
are reconciled in [machine-validation-2026-10-09.md](opendesign/machine-validation-2026-10-09.md).
The phone preview serves `8f8a14c`; physical keyboard acceptance remains separate.

The October 9 shared discard panel fills compact footers. Fabric percentage
edits balance the remaining shares while keeping values optional and editable;
dark validation text uses a readable foreground. Canonical rules and the existing
fabric example are reconciled in
[care-polish-2026-10-09.md](opendesign/care-polish-2026-10-09.md).
The phone preview serves `35fb40e`; generated parity and physical keyboard
acceptance remain separate.

The October 8 bulk-color/fabric candidate adds one atomic assortment save,
independent color quantities and dye observations, shared-care confirmation,
expanded fibers and optional reported details separate from composition. The
color picker precedes quantity rows using shared −/+ controls; Advanced fabric
details stays collapsed beneath the basic tag composition. The main icon grid
has nine named fibers, including Elastane / spandex and Modal; Other moves into
More fibers. Normal phone quantities stay inline, reflowing below a 16rem
container. Enlarged headers move context into the scrolling body; care save
errors also scroll so they cannot consume the fixed footer.
Canonical rules and a bounded interactive example are reconciled in
[bulk-colors-and-fabric-details-2026-10-08.md](opendesign/bulk-colors-and-fabric-details-2026-10-08.md).
The phone preview serves `82b7369`; application checks, canonical reconciliation,
physical acceptance and full generated-design parity remain separate.

The October 8 intake/preferences follow-up moves short dye guidance below its
choices, selects and saves Not sure by default, and hides empty optional label
summaries. Wash & dry preferences uses compact selection, shared label details,
Wash/Dry tabs and shared recorded-label defaults; missing values block Save.
Shared help glyphs sit beside their labels while keeping 44px targets. Canonical
rules and bounded examples are reconciled in
[intake-preferences-2026-10-08.md](opendesign/intake-preferences-2026-10-08.md).
Application proof, generated parity and the separate drawer/Back-focus issues
are recorded independently.

The October 8 contextual intake change groups clothing and household textiles,
uses item-specific names, size examples and tag suggestions, and moves optional
iron/steam/photo details to Review. Unknown care is the default; applicable steps
and existing material constraints determine the path. Canonical rules and bounded
examples are reconciled in [contextual-intake-2026-10-08.md](opendesign/contextual-intake-2026-10-08.md).
Application verification and generated-package/physical-device limits are separate.

The October 8 dye-answer clarification replaces jargon with observed behavior
and shares tap/keyboard help between intake and edits. It preserves the existing
drawer, icons, centered progress dots and footer; the first plain-card design
specimen was rejected and corrected. Canonical rules and the bounded specimen
are reconciled in [dye-help-2026-10-08.md](opendesign/dye-help-2026-10-08.md).
Past washes remain observations, not a guarantee or product evidence.

The October 8 [selection-control audit](opendesign/selection-controls-2026-10-08.md)
replaces radio-looking boolean indicators with pill switches or square
checkboxes. Exclusive answers retain radios; dose-label alternatives join the
same group as their marks/counts. Settings reload displays the stored preference
correctly. Canonical rules and three bounded specimens are reconciled, with
before/after hashes and application captures. Generated baselines remain stale.

The October 8 Ingredients to avoid change reuses chip entry while keeping
ingredient names as a list from draft through save. Chemical punctuation and
ingredient-specific limits remain; unadded input has draft/recovery guards.
Canonical rules and a bounded interactive specimen are reconciled in
[ingredient-chips-2026-10-08.md](opendesign/ingredient-chips-2026-10-08.md).
Ingredient matching and evidence rules remain unchanged.

The October 8 app-wide copy audit removes repeated empty-state explanations and
shortens account, care, product, appliance and laundry guidance. Input rules,
privacy, recovery and evidence limits remain. Tags uses a compact title-only
header, with garment identity and errors in the scrolling body at enlarged text.
Canonical rules and bounded examples are reconciled in
[all-screen-copy-cleanup-2026-10-08.md](opendesign/all-screen-copy-cleanup-2026-10-08.md).
Full generated parity remains separate; the package verifier has an existing
preview-manifest mismatch recorded there.

The October 8 record/description pass keeps icons, places badges beside title
and fact lines, and combines linked household members by wearer ID. Me retains
account identity; Household opens clothing preferences. Link account and Remove
access live inside drawers, with draft and confirmation guards. Profile drawers
use one title; generic location subtitles and repetitive helper text are trimmed
across forms. Canonical rules and bounded components are reconciled in
[record-rows-and-description-clarity-2026-10-08.md](opendesign/record-rows-and-description-clarity-2026-10-08.md).
Full generated-design parity and physical-device acceptance remain separate.

The October 8 invitation redesign uses one household invitation in sharing and
onboarding, with a slim code row, equal-width outlined management buttons, a
member-permissions card and scoped enlarged-text gutters. Closet retains compact
tinted status icons and moves grouping
into Filters; Laundry gains a current-selection overview. Canonical rules and
bounded examples are reconciled in
[page-balance-and-invitation-2026-10-08.md](opendesign/page-balance-and-invitation-2026-10-08.md).
Generated baseline parity and physical-device acceptance remain separate.

The October 8 safe-update pass discovers releases on open, foreground return
and reconnect, applying them only outside forms, dialogs, writes and laundry
tasks. It preserves another tab's draft and guards stale-shell reload loops.
People now puts Whose clothes before Pending invitations. The top safe-area
surface is a candidate fix for native iPhone wordmark blur; device acceptance
remains pending. Canonical rules and bounded examples are reconciled in
[app-updates-and-status-area-2026-10-08.md](opendesign/app-updates-and-status-area-2026-10-08.md).

The October 8 independent-invitation change separates Pending invitations from
managed clothing profiles. Cancel removes only the invitation; profiles are
created intentionally, always open their details, and can explicitly link to an
account while retaining clothes/history. Canonical rules and the bounded People
example are reconciled. See
[invitations-and-managed-profiles-2026-10-08.md](opendesign/invitations-and-managed-profiles-2026-10-08.md)
for application/design proof, preservation and phone release. This supersedes
the earlier pending-person row and dual Cancel/Remove invite actions. Age,
guardian authority and moving profiles to an independent household remain open.

The October 8 specialist-form/day-continuity pass fixes the drawer header and
centered progress dots, conditional blend percentages, draft care reset and
separate pest treatment. Specialist editors retain drafts across named sections;
Home and Laundry share the day limit and unfinished hanging choices survive
replanning. Canonical rules and bounded examples are reconciled. See
[specialist-forms-and-day-continuity-2026-10-08.md](opendesign/specialist-forms-and-day-continuity-2026-10-08.md)
for application/design proof, recovery, release and the remaining distinct cases.

The October 8 household/navigation/form clarity pass makes People first and
default, keeps invite actions compact, removes page transition delays and uses
one intake heading with horizontal progress. Quantity/Size share a row, Brand
sits below, and percentages and shared helpers use less space. Canonical rules
and bounded examples are reconciled. See
[household-and-form-clarity-2026-10-08.md](opendesign/household-and-form-clarity-2026-10-08.md)
for that checkpoint's verification, recovery and phone delivery. The specialist
pass above supersedes its open-form list; other distinct cases remain in the audit.

The October 8 focused-edit pass opens only the selected garment fact and makes
appliance model/program/contact sections independent. Canonical rules and two
bounded examples are reconciled. The feedback audit distinguishes delivered
fixes from remaining specialist-form and laundry-day work. See
[focused-edits-2026-10-08.md](opendesign/focused-edits-2026-10-08.md) for
verification, recovery, the separate synthetic account and phone delivery.

The October 8 garment-destination and first-use clarity changes are reconciled
in canonical rules and bounded examples: explicit state for new/pre-owned
clothes, readable Closet counts, one setup action per missing item, and Care
label editors separate from garment Details. See
[first-use-simplification-2026-10-08.md](opendesign/first-use-simplification-2026-10-08.md)
for application/design checks, captures, recovery and phone release evidence.

The October 8 household people fix opens pending invitees in invite management,
with confirmed cancellation and profile removal. Accepted members retain the
Remove access flow. Canonical rules and a bounded example are reconciled.
See [people-management-2026-10-08.md](opendesign/people-management-2026-10-08.md)
for application/design checks, captures, recovery and phone release evidence.

The October 8 garment review confirms the save destination and recorded care
label. Pest treatment is an optional disclosure; low-heat drying is no longer
described as forbidden. Canonical rules and bounded examples are reconciled.
See [garment-review-2026-10-08.md](opendesign/garment-review-2026-10-08.md)
for application/design checks and phone release evidence.

The October 8 like-color instruction is available as a checkbox independent
of wash temperature, shared by intake and care edits. Canonical rules and a
bounded example are reconciled. See [like-colors-2026-10-08.md](opendesign/like-colors-2026-10-08.md)
for application/design checks, captures, compatibility and phone release evidence.

The October 8 pre-owned controls use checkbox rows, inline optional labels and
condition wording independent of vintage age. Existing rules and the example
are reconciled. See [pre-owned-controls-2026-10-08.md](opendesign/pre-owned-controls-2026-10-08.md)
for application/design checks, comparison captures, recovery and phone evidence.

The October 8 color-shade fix is reconciled in canonical rules and a bounded
six-hue example: Medium red stays in Bright sorting, and depth samples and
descriptions follow the chosen hue. See
[color-shades-2026-10-08.md](opendesign/color-shades-2026-10-08.md) for
application/design checks, comparison captures, recovery and release evidence.

The October 8 fabric-blend controls and conservative constituent checks are
reconciled in canonical rules and the production-patterns example. See
[fabric-blends-2026-10-08.md](opendesign/fabric-blends-2026-10-08.md) for
percentage/custom-name behavior, captures, checks, recovery and phone evidence.

The October 8 garment-details changes are reconciled in canonical rules and a
production-patterns example: visible brand/size and shared filter/create tags,
typed quantity, and a five-second default to Keep editing. See
[garment-details-2026-10-08.md](opendesign/garment-details-2026-10-08.md) for
application/design checks, captures, recovery hashes and phone release evidence.

The October 8 onboarding changes are reconciled into canonical rules and examples:
household creation confirms success within setup; location/machines/products precede
optional Add clothes and invite steps. One shared intake asks Ready to wear or
Needs washing; setup completeness never adds a second clothes entry.
Signup prose, onboarding Sign out and duplicate Later/Finish later actions are removed.
See [onboarding-2026-10-08.md](opendesign/onboarding-2026-10-08.md) for checks,
recovery hashes and the separate generated-reference/package-verifier limits.

The October 9 saved-record audit groups longer editors by concern and moves
setup/configuration into Edit. Canonical rules, bounded examples and shared
enlarged-text tab behavior are reconciled. See
[record-editor-sections-2026-10-09.md](opendesign/record-editor-sections-2026-10-09.md)
for coverage, application/design checks, recovery and phone release evidence.
Generated record baselines remain missing/stale.

The owner-approved laundry-day identity (2026-10-07) is the direction for every
screen: OpenDesign `IDENTITY.md` and `preview/laundry-day-identity.html`, recorded in
[laundry-day-identity-2026-10-07.md](opendesign/laundry-day-identity-2026-10-07.md).
It wins where an older rule below disagrees until that screen is redone.

The October 7 redesign pass (the app at `9503f60`) is recorded in
[redesign-2026-10-07.md](opendesign/redesign-2026-10-07.md): the shared answer
shapes, the line garment icon set, the redesigned laundry-day, dryer and stain
screens, with per-file hashes and verifier results. It supersedes the laundry-day
rules below where they differ (no machine-times question, no “The dryer is free.”
exception, no garment photography). The generated reference is still pending.

The October 6 laundry-day screens (`5200f1f`, `9f66231`) are reconciled into
the canonical workspace as implementation feedback: rules in `DESIGN.md`
(“Laundry days”) and `COMPONENTS.md`, and specimens in
`preview/production-patterns.html` (Laundry day) and
`preview/dryer-handoff.html`. See
[laundry-day-2026-10-06.md](opendesign/laundry-day-2026-10-06.md) for the
per-file hashes, verifier results, intentional differences and the reference
captures. The generated reference was regenerated with laundry-day
design-preview fixtures and imported on 2026-10-06: 134 cases, receipt
`0cf76b9e…`. Still Baseline missing: the open “Today’s order” strip, the
dryer-step early-check callout and Take out early at phone width. The export
refuses these three because their text renders as separate text nodes. Also
missing are the hang-now strip at 2× text (it overflows its card), the load
page's dryer wait and None free (no preview yet), and the states without a
sample. Each needs a production fix or a new preview first.
The consolidated journey report
([index.html](../audits/2026-10-05-consolidated-journey/index.html)) was
refreshed the same day with 82 captures, 20 of them laundry-day states (63 to
82), and one skipped laundry-day line (the history “Tumbled N min, then hung”
was not walked). Its review led to a third stage: `DESIGN.md` now limits
5-minute rounding to predicted or planned times, lets a shared room show
recorded start times and the person's own wash timer, and quotes the early
check's “The dryer is free.” as the person's own report. Four design questions
from the run are open in the record and the delivery list.

The October 6 garment-safety changes are reconciled into the canonical workspace
as implementation feedback (`829a0ee..d2b6fdb`). They cover old, set-in stains
and known marks, the stain check and “What next?”, fabric, the dose cap drawn
from recorded marks, the run sheet named “What goes in”, no underlined links and
the trial-only note. See
[garment-safety-2026-10-06.md](opendesign/garment-safety-2026-10-06.md) for the
per-file hashes, verifier results, intentional differences and pending captures.
The water setting is reconciled from the builder's uncommitted worktree copy
and needs a recheck once it is committed. The reference captures were
regenerated on 2026-10-06 with design-preview fixtures for the garment-safety
and water states: 112 cases, now receipt `587df5a7…` after the large-text
dose-cap overflow fix (Stage 5b). The consolidated journey report
([index.html](../audits/2026-10-05-consolidated-journey/index.html)) was refreshed
the same day with 62 captures, 19 of them October 6 states. Two states are still
Baseline missing. Stained drying with “Stain gone?” waits on a fix that renders
the method-sheet kicker in `drying-method.tsx` as one string. The Water sheet's
ZIP, bill and town steps have no fixture.

The October 5 experience consolidation (all eight approved consolidations,
implemented after the design freeze ended) is reconciled into the canonical
workspace as implementation feedback: the app leads and canonical describes it.
See [experience-consolidation-2026-10-05.md](opendesign/experience-consolidation-2026-10-05.md)
for the per-file hashes, verifier results, intentional differences and pending
captures.

The owner requested a drying handoff redesign and reconciliation of accepted
post-freeze app changes on 2026-10-03. The working brief is
`context/production-reconciliation-2026-10-03.md` in the canonical workspace.
The bounded design generation and React integration are complete. The final
owner-directed polish uses a compact load header, a 44px minimum action that
wraps when needed, and garment quantities in secondary metadata instead of title
suffixes. Canonical component, CSS and DESIGN.md now agree with those decisions.
The canonical receipt is `source/final-integration-2026-10-03.json`; it records
exact application/design hashes and separates final checks from historical proof.

Application verification: 14 focused drying/copy tests and type/style checks
passed; the approved phone-preview build passed. The synthetic HTTPS wash-to-
put-away journey passed before the final method-sheet copy edit. Phone, enlarged
dark text and desktop layouts were inspected. Current visual evidence is
[the compact dryer plan](fidelity-review/dryer-handoff-compact-counts-phone.png).
Design verification: the fresh local package verifier passed 21 HTML entries,
13 modules, eight preserved historical examples and bounded state/draft checks;
the canonical mobile screen was inspected after the final polish. The generated
package audit passed before that polish. Its original full-width-header composite
remains historical evidence.

The inherited web-test failures are resolved: all 444 web tests and 211 backend
tests pass, with four final HTTPS browser tests covering chemistry and AE1–AE5.
Trial chemistry is implemented and reconciled with the canonical chemistry
specimen, both preview manifests, the overview and DESIGN.md. Its package verifier
passes 22 HTML entries, 13 modules and eight preserved historical examples.
Phone and dark doubled-text chemistry examples fit without horizontal overflow.
Installed-phone push delivery and physical trial acceptance remain pending.
The latest live load-guidance fix and complete synthetic flow account are recorded
in [the linked change record](opendesign/load-guidance-2026-10-03.md). Routine
fit/heat explanations are collapsed touch disclosures outside garment lists;
missing capacity and conflicts remain visible. Manufacturer retrieval for capacity
is newly requested and remains unimplemented; the seeded account does not establish
real machine or garment facts.
The subsequent [drying cohesion record](opendesign/drying-cohesion-2026-10-03.md)
supersedes the repeated Air dry shortcut and inert indexed drying previews.
All queued methods share compact header actions; indexed preview operations now
update memory-only state through start, dryness checks and put-away.
The [responsive task record](opendesign/responsive-tasks-2026-10-03.md) adds an
opt-in two-column dryer preparation pattern and wide-touch drawer dismissal.
Canonical rules, width token and preparation specimen are reconciled; application
resize and synthetic touch acceptance preserve drafts, focus and drawer scroll.
Physical hinge and segmented-viewport behavior remain unverified.

No physical laundry, credential changes, production deployment or project deletion
is authorized by this contract. See [current trial evidence](../plans/2026-10-03-phone-trial-status.md).
