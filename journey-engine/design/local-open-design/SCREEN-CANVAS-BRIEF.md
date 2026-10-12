# Screen canvas brief — Rehearsal (Oct 9, 2026)

Status: brief + critique only. No artifacts redrawn; existing HTML, HANDOFF.md, FOLLOWUP-BRIEF.md and MULTIPLAYER-JOURNEY-BRIEF.md unchanged.

## Owner revision (as received)

The journey nodes should show actual screens, not text boxes. Clicking a screen focuses it in place on the journey canvas, exposing its full real controls. Edit / Play toggles between editing a proposed screen and operating the real app. Actual actions advance to the next screen and carry captured inputs. Owner is unsure whether Dev mode should exist or be default, and how designers would feel.

Proposed direction: a screen-based journey canvas with captured real screen thumbnails for inactive nodes, one live focused app surface at a time, labelled action/condition connectors and branch joins. Zoomed-out screens are pictures, not dozens of live iframes. First click selects/focuses a screen; it must not accidentally click a scaled form control. Default Play; app events advance the trace and camera only when appropriate, retain session/draft and inputs, then freeze the prior step capture. Browsing another node does not replace the current run until explicit Start here/draft protection. Carry actual state through real app transitions; do not remount each node as its independent seed. Fixture jumps and observed traversal stay distinct; Back/loops create ordered visits, not conflicting new canonical nodes. Collect allowlisted synthetic fixture field changes and resulting state at transition, not keystrokes/secrets. Side effects remain inside the synthetic session, saves/failures count only when application confirms them.

Edit means selecting screen/component/primitive and editing a VERSIONED PROPOSAL candidate (supported copy/props/styles/transitions); baseline is protected, overrides labelled, changes are reversible, adoption still requires code integration and proof. Unsupported editing surfaces become a scoped proposal/agent request instead of arbitrary DOM mutation. Edit→Play tries an isolated candidate when runnable; otherwise explicit static specimen, never fake live functionality. Inspector can select/copy tokens, code refs, target implementation, transition inputs and source/design evidence; access technical details via optional Inspect panel, not default Dev mode and not role-based Designer/Developer identity. Editing permission independent of mode. Candidate changes don't reset an unsaved run or mutate another person's session. Existing comments/proposals are shared but preview/camera/drafts personal.

Real towel fork: Type → Whose → Details → Fabric → Color → Origin; newly owned → Dye → Care; pre-owned → Care skipping Dye; then Stain → Final → Saved item → Edit. Runtime Fabric screenshot: What's it made of?, cotton 80% / polyester 20% in Other material text entries, separate percent fields empty. No invented care instructions/Total control or verification passes. Original map illustration is only a proposal, not runtime.

Do not assume the current app supports editing code from the canvas or full runtime tracing.

## Recommendations (Rehearsal collaborator)

- **Default Play, with no Dev mode.** Play is the only mode that tells the truth about the app. Make Inspect an optional side panel that anyone can open, not tied to a role.
- **Rename Edit to "Propose."** "Edit" suggests the app itself changes. When a screen is in Propose, label it on the screen itself as "Proposal vN — not in app." If the candidate can't run, Play shows a labelled static specimen.
- **Map real state to screens through an adapter contract.** On every confirmed transition, the app reports a screen ID, the route and allowlisted state. A state the map doesn't recognise appears as a pending "Unmapped screen" and never snaps to the nearest node. Each thumbnail is labelled with its build and the run it was captured from.
- **Privacy of captured inputs.** Capture only fields from the fixture schema. Free text is redacted unless allowlisted. Show a "Recorded: Other material entries" chip so people can see exactly what was captured.
- **First-glance guidance.** One line: "Towel intake · 12 screens · Click a screen to focus, then use it." Pre-focus Type and show a single primary action, Start here. The guidance disappears after the first focus.
- **Biggest hidden failure: comments on a picture rather than the run.** A thumbnail can come from an older build or a different run than the live session. Comments must attach to the live focused screen or to a frozen capture, along with its run ID and build, and never to a bare thumbnail.
- **Smallest complete first slice.**
  - One journey: towel intake.
  - The canvas shows captured thumbnails of the observed path and the pre-owned branch, with Dye shown as "not yet observed" unless it has actually been traversed.
  - One live screen in Play, where confirmed transitions advance the trace and freeze each capture.
  - Fixture jumps are labelled.
  - Comments anchor to a screen ID plus a run.
  - Propose starts as a scoped text request for the agent. Live candidate editing comes later.
