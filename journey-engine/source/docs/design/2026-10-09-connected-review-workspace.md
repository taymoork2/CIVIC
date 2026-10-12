# Connected product review workspace

Date: October 9, 2026. Status: proposed; no review application delivered by this document.

## Outcome

The owner can open a journey, choose a persona and situation, explore its screens
and drawers, and attach feedback to the exact state without preparing a household,
repeating a long flow or manually taking a screenshot. The same workspace exposes
the intended design, platform implementation and current validation evidence.

This is a product review workspace for A Laundered Closet. OpenDesign remains the
authority for design intent; the repository remains the authority for working
application behavior. The workspace connects those sources and reports differences.

## Current evidence

- `apps/web/src/routes/design-preview.tsx` renders real screen components in a
  development-only route. Some samples update local state; others are visual-only
  or reject saves. It is not a complete journey simulator.
- `apps/web/e2e/journey-report.spec.ts` walks synthetic accounts and captures
  screens. `apps/web/scripts/journey-report.mjs` produces a screenshot report,
  not an interactive environment for exploring alternate paths.
- `apps/web/scripts/export-opendesign-reference.mjs` already records source hashes
  and capture conditions. A successful capture does not establish behavior or
  physical-device acceptance.
- `convex/feedback.ts` stores household-scoped feedback with optional screen,
  build and device information. It has no structured journey, persona, drawer,
  element anchor or screenshot attachment. The current Settings entry does not
  capture the state of a previously open drawer.
- The October 8 journey coverage audit identified at least 15 sheet tasks without
  dedicated design/generated references. That is a historical lower bound,
  not today's exhaustive count of missing scenarios.
- The available OpenDesign connector exposes project/artifact/file access. It
  does not expose a dedicated annotation retrieval tool; native comment access
  and synchronization must be verified before being promised.

## Review experience

One browser workspace provides a journey map and a live preview. Selecting a
journey node opens the exact screen or drawer rather than requiring the reviewer
to navigate from Home. The reviewer can also play the journey from its beginning.
Switching scenarios offers a clear restart; it does not silently discard edits.

Persona presets include a single adult, a student/new household, and a parent
managing several people. Personas are synthetic review presets, not demographic
rules or substitutes for permissions. Owner/member permissions, equipment,
inventory, care evidence and progress are independently recorded conditions.

Useful first scenarios come from recent feedback: adding a multicolor pack,
recording a cotton/polyester towel, adding an appliance/product with only basic
information, editing saved records, and dismissing a nested quick edit. Wash,
drying, stain recovery and account/household journeys extend the same index.

The preview offers phone/desktop widths, light/dark appearance and enlarged text.
Each state declares whether its interactions work, what is simulated and whether
it is a proposed design, implemented screen or released app state. Missing nodes
stay visible with their missing artifacts identified.

In feedback mode the reviewer can select an element or draw a region, highlight
it and add a comment. Submission preserves the scenario, state, active drawer/tab,
draft context, build, design revision, viewport and appearance. An attachment shows
what was visible at submission. Keyboard users can select a named target or leave
screen-level feedback. Interaction mode resumes without annotation controls
intercepting normal taps.

A successful submission is durable across reload. A failed submission retains
the note and shows retry; it never claims success. Review feedback is retrievable
by authorized agents, with the same context, attachments and reproduction link.
The reviewer can return to a resolved comment and compare the original with the
new state. Resolution requires linked evidence, not just a status toggle.

## One connected index

Every supported journey, scenario and screen state has a stable identifier. The
index connects design rules/components, canonical screens, journey transitions,
platform components, application entry points, feedback and validation receipts.
Labels and file paths can change without losing those connections.

Examples and tests reference that index rather than maintaining separate lists
that quietly diverge. A journey edge records the action, conditions, destination
and expected effect. Drawers, nested drawers, editors, confirmations and recovery
states are first-class entries alongside pages.

Coverage is reported separately for design, runnable preview, implementation,
behavior checks and device acceptance. Each evidence link names its revision and
conditions; stale or absent evidence is explicit. CI can detect broken links,
unregistered application surfaces and stale receipts. It cannot prove that every
product scenario has been imagined; a reviewed coverage inventory remains needed.

The coverage inventory includes empty/populated data, role/ownership differences,
missing or conflicting care/product evidence, pending/error/offline/recovery,
cancel/discard/restore and responsive/accessibility states where applicable.
Risk-relevant combinations are named scenarios; an unexplored combination is
never represented as validated merely because its individual settings were tested.

## Design and platform relationship

Design tokens and component roles retain stable identities. Web, iOS and Android
implement those roles using platform-appropriate controls and interaction rules.
The workspace exposes platform differences and missing implementations explicitly.
It does not claim native parity from a web preview.

A design edit identifies affected components and states for implementation and
validation. An application defect can produce a linked design correction. These
are reviewable changes with provenance, not automatic overwrites of one side by
the other. Existing generated-reference receipts provide the starting mechanism
for detecting drift between the actual sources.

## First usable delivery

Reuse the existing real React previews, capture receipts and feedback concepts.
Deliver an authenticated review environment, a searchable scenario navigator,
direct links/restart, working recent-feedback flows, and durable annotated
feedback that an authorized agent can read. Use an isolated synthetic dataset;
review actions cannot modify the personal trial household. Keep private runtime
data and credentials out of exported scenario links and captures.

Before exposing a preview on the phone URL, explicitly separate review access
and deployment from the app's existing development-only route. Do not remove its
production guard as a shortcut. Existing feedback authorization must remain
intact; cross-project review access requires its own scoped authorization.

The initial navigation can be a journey tree with connected steps. Freeform
canvas layout, simultaneous collaboration, native runners and automatic issue/PR
publication are later decisions, not prerequisites for direct scenario review.
They remain part of the larger direction without delaying the core feedback loop.

## Acceptance

- Open a shared review link and reach the exact scenario/drawer without manual setup.
- Run and restart the multicolor-pack and towel flows with local state persistence
  through their steps; controls do not silently no-op.
- Review saved product/appliance/item records, their tabs and nested editors.
- Change persona/role and conditions with visible effects and a clear restart boundary.
- Pin a comment to an element or region; submit, reload and retrieve it as an
  authorized reviewer/agent with the correct state and revision context.
- Show failed saves and retain unsent feedback; support keyboard-only review.
- Link each initial state to its canonical design, real component and scoped checks,
  or show exactly which link/evidence is missing or stale.
- Demonstrate that review interactions and exported feedback do not alter or expose
  the personal trial household.

## Delivery boundary

Local Codex remains the accountable implementation and verification owner in the
designated checkout. This proposal records direction; it does not authorize new
external services, credential changes, publication or modification of OpenDesign
itself. No new dependencies or provider runs are selected here. Current provider
quota/cost telemetry is unknown and is not a dependency for this document.

The next implementation scope is the first usable delivery above, with an
application-surface inventory before claiming complete coverage. Stop for
conflicting checkout/design ownership or a proposed change to private-data/access
boundaries. Keep app verification, canonical design reconciliation and real-device
acceptance separate throughout.
