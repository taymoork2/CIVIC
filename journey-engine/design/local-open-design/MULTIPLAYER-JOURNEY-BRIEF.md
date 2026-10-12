# Multiplayer journey brief — Rehearsal (Oct 9, 2026)

Status: brief + critique only. No artifacts redrawn; index.html, app.html, HANDOFF.md, FOLLOWUP-BRIEF.md unchanged.

## Owner brief (as received)

New owner feedback: the independent review workspace must be multiplayer ready; the entire journey and its branching paths need static visualization and dynamic exploration through actual clicking. The owner prefers displayed concepts 1 Focus Workbench and 2 Observation Folio, but all are hard to understand at first glance. Help Codex combine 1+2 and make the journey map first-class. Do not redraw artifacts or access/edit a repository.

Proposed product: one journey with three plain-language views Map / Try it / Review changes, preserving current selection and context across views. First opening clearly says what app/journey is shown, where I am, and one obvious action Open this step. Map shows readable steps, labelled action/condition branches, expandable subflows, optional thumbnails and accessible outline. Clicking a node inspects its state; Open this step loads the real iframe safely. Clicking real app controls highlights the observed node and traversed edges. Jump-to-fixture is distinct from replay-from-start; hypothetical paths remain labelled and never count as observed. Stable IDs attach proposals at journey/screen/component/primitive/token scope. Proposed changes overlay approved path only when selected, with explicit target variants and unknown/untested branches. Do not claim exhaustive discovery from source scans.

Actual towel intake: type → whose → details → fabric → color → origin; origin newly-owned → dye → care, pre-owned → care; then stain → final → saved record → edit. Registry has 34 working and 93 partial specimens, not exhaustive branch coverage. Actual Fabric iframe is What's it made of?, cotton 80% / polyester 20% in Other material entries; do not invent Total control or care guidance.

Multiplayer semantics: shared versioned proposals, comments and scoped decisions; attributed people and agents; explicit reviewer/approver rights; stale decisions/conflicting edits surfaced, not silent overwrites. Presence and Follow someone are optional; each person normally has their own preview/camera/fixture session, so another click never resets my draft. Shared review sessions opt-in, freezes evidence, handles disconnect/rejoin; shared side effects need clear owner. No audio/chat/admin/dashboard/freeform editor feature inventory. Ready means architecture and interaction contracts, not claiming backend implemented.

Questions to challenge: which view opens first; how the map stays understandable with all branches available; whether 3 views preserve orientation; smallest multiplayer first slice; top 2 hidden interaction risks.

## Recommendations (Rehearsal collaborator)

1. **Open first: Map, scoped to "you are here."** Show a header that says "Laundry App › Towel intake › Step 4 Fabric", the spine with the current node selected, and one primary action, Open this step. After the first visit, reopen the person's last view.
2. **Keep the map legible.** Draw the observed main path as a straight spine. Branches start as labelled stubs ("pre-owned → skips dye") that expand one at a time, and subflows collapse to a single node. Use three line styles, each with a text label: observed (solid), hypothetical (dashed), untested (hollow). The outline is a full equivalent, not a fallback.
3. **Two places plus an overlay, not three peer views.** Review changes should be a toggle on top of both Map and Try it, not a separate view. Orientation comes from a persistent journey header and a small step strip in Try it that stays in sync with the map selection.
4. **Smallest multiplayer slice.** Versioned comments and proposals tied to stable node IDs, attributed to a person or an agent, with a reviewer/approver role and a visible stale or conflict state based on version checks. Preview sessions are private by default. Defer presence, Follow someone and shared sessions.
5. **Hidden risk A: false observation.** Jumping to a fixture, or reaching a state the map doesn't know, must not light up edges. An unmapped state should show "Off map" rather than snapping to the nearest node, and a fixture jump should show "Jumped, not traversed."
6. **Hidden risk B: anchors that drift.** When an ID is renamed or removed, proposals and decisions attached to it silently lose their target. They need tombstones, a re-anchor prompt and a stale badge. Records saved during Try it must stay in the person's own session unless a shared owner is declared.
