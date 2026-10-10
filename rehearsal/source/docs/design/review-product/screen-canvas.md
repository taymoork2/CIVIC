# Screens as the journey

## Implemented first slice

The proposal below preserves the pre-build decisions and evidence. The first
implementation now provides the real towel journey, both ownership branches,
transition captures and a reversible heading/action/color proposal editor.
Workbench starts in Play with optional Inspect. Storyboard shows cached actual
screens on a bounded horizontal application timeline; alternate branches sit
below the primary path. Its sidebar expands each flow into screens, fits a whole
flow on selection and focuses individual screens. Panning follows the viewed
screen without replacing the live draft. Review is currently the existing evidence
view in a separate tab; a unified queue and captured-run restoration remain open.

See [build evidence](build-evidence.md), [workspace observations](workspace-observations.md)
and [design QA](../../../design-qa.md). The broader multiplayer and proposal
alignment contracts remain requirements, not delivered capabilities.

Status: revised visual and interaction proposal, October 9, 2026. No application UI, canvas editing or transition-recording implementation changed in this pass.

The owner requested actual screens in the journey map, clicking a screen to expose its interactive controls, Edit / Play, and actions carrying captured inputs into the next screen. The owner also asked whether Dev mode should exist or be the default. This revision supersedes the previous separate Map / Try it navigation and selected-screen side pane. The earlier [journey/collaboration proposal](journeys-and-collaboration.md) still supplies branching, proposal, alignment and multiplayer contracts.

## One canvas, two tasks

The journey map uses actual captured screens as its nodes. In overview, these are static thumbnails with readable screen names, action/condition connectors and capture provenance. Selecting one focuses it in place, enlarging to usable controls; only one application runtime is active. A full-journey view and focused-screen view preserve selection, camera history and run context. On mobile, the focused screen dominates with a compact path strip and access to the full map/outline. No set of tiny live iframes competes for input or runs concurrent side effects.

Play is the proposed default. The first screen identifies the app, journey and current live screen, and says Use the screen. The journey follows. First clicking a thumbnail selects/focuses it; it does not submit an underlying scaled form. Normal application controls then accept input. The canvas pans outside the active screen; text selection, scrolling and keyboard input inside it belong to the application. Explicit zoom/focus affordances and a keyboard-accessible outline avoid requiring unfamiliar canvas gestures.

Edit is deliberate and visually distinct. App clicks select a screen/component/primitive instead of running its actions. Edit works on a reversible, versioned proposal candidate, with a persistent Proposal label and its baseline revision. It needs an explicit local-instance/shared-component/token scope, because an apparent one-screen change can affect many journeys and targets. It must not silently modify the approved baseline or production records.

The editing boundary remains a product decision: a scoped agent proposal is feasible before direct property/copy/style editing; directly editing arbitrary source behavior requires a larger implementation. The first implementation must only expose controls it can actually persist and render. Unsupported changes remain scoped requests, not cosmetic DOM mutations presented as code changes. A candidate runs in Play only when its isolated implementation can run; otherwise it is a labelled static specimen with unavailable interaction controls. Merely adding an Edit button is not delivery of editing.

## Developer details

Do not make Dev mode the default or use Designer / Developer identity switches. Use an optional Inspect panel available to anyone with the corresponding capability:

- Selected component properties, layout and token references.
- Source/component links, target implementation and design/source revisions.
- Current transition, recorded input changes and runtime errors.
- Evidence and alignment at the selected scope.

Inspect reads and explains; it does not turn form clicks into edits. Editing authority and candidate activation remain separate from inspection. A developer can remember an open inspector locally without changing the default for collaborators. Designers can inspect constraints and tokens without entering a different product or losing their preview.

## Inputs and transitions

The same application session moves from screen to screen. Remounting independent seeded fixtures for each selected node would erase the user's inputs and break the requested experience. Confirmed application state transitions update the current node, freeze the previous screen capture, and append the action, allowlisted input changes, resulting state and revisions to an ordered run trace. Follow the current run's focus while the user is playing; do not pull their camera away while they deliberately browse another branch.

Capture synthetic fixture fields at a confirmed transition, not keystrokes or credentials. Preserve raw and semantic values separately only when the application explicitly supplies both. For the actual Fabric fixture, Other material 1 contains cotton 80%, Other material 2 contains polyester 20%, and the separate percentage inputs are empty. The capture must retain those exact facts instead of inventing valid numeric percentages. Missing inputs remain missing. Shared evidence follows the same allowlist/redaction rules.

An attempted Next that fails validation stays on the same state. A pending or failed save is not a successful saved-item edge. Back and loops append numbered visits to the same canonical state; each visit retains its capture. Branch choices come from the confirmed application's state, rather than guessed click labels. Unmapped states remain Off map, with their context preserved.

Browsing a thumbnail from another branch or run does not replace the current runtime. Show Your run is elsewhere and offer Resume run or explicit Start here with draft protection. The seed jump remains labelled Jumped, not traversed. Switching Edit / Play does not discard inputs. Activating a changed candidate with an incompatible state requires an explicit choice to preserve the existing run or start a candidate run; arbitrary baseline-to-candidate state migration is not assumed.

## Captures and shared review

A thumbnail identifies whether it is a capture from this run, a fixture preview, a stale capture or a static candidate. Comments reference a stable state/element ID plus their frozen capture, run, target and revisions. A bare screenshot tile is insufficient: visually similar screens can be from different builds or branches. A newer thumbnail must not silently move an old comment or approval.

Versioned comments/proposals/decisions remain shared, while previews, inputs, camera and unsaved drafts remain personal by default. An optional follow/shared-driving mode cannot transfer write authority implicitly. The existing multiplayer conflict and re-anchoring requirements continue to apply. This revision adds no synchronization backend or permission changes.

## Completed collaboration

Codex sent the revision to the existing Claude Design conversation and local Open Design desktop project. Both returned text-only critiques. Local Open Design saved `SCREEN-CANVAS-BRIEF.md`, which Codex read. Original `index.html`, `app.html`, `HANDOFF.md` and `FOLLOWUP-BRIEF.md` hashes matched the prior recorded values.

| Issue | Claude Design | Local Open Design | Integration position |
| --- | --- | --- | --- |
| Default and technical controls | Play, optional Inspect, no Dev mode. | Same. | Play default; Inspect independent of role. |
| Edit naming | Rename to Propose to avoid promising changes to the app. | Same, with Proposal vN — not in app label. | Preserve the owner's Edit / Play control in this revision; make the proposal boundary explicit. Naming remains selectable. |
| Runtime identity | Report screen IDs; retain repeated visits; never infer from pixels/URLs. | Report state/route and allowlisted fields through an adapter. | Instrument confirmed application state transitions; configuration URLs alone are insufficient. |
| Input capture | Record exact allowlisted synthetic fields; no normalization guess. | Show what fields were recorded; redact other free text. | Visible capture summary and bounded transition data. |
| Hidden failure | Selecting the other branch quietly changes the live run. | Comments attach to an old picture instead of the correct run/build. | Explicit run-versus-selection state and capture provenance. |
| First slice | One towel journey, one live screen, confirmed transitions, shared comments; defer Propose. | Same; Propose initially a scoped agent request. | Implement the screen journey coherently first; retain the requested editing requirement as explicit pending scope rather than marking a text request as full editing. |

Both collaborators' suggested observed-path thumbnails are qualified here: traversing a subset does not establish complete journey coverage. Untested branches can have fixture captures, clearly identified separately.

## Current application evidence

The review frame already renders real application components. Its intake starts from a fixture and can advance through the real AddClothesSheet within one mounted session. The frame's configuration URL remains the initial scenario even as the screen changes; a future map cannot use that URL to identify the current screen. Changing review configuration currently reloads the frame, so map focus must be separated from configuration changes before continuous run navigation is delivered.

In a temporary, authenticated synthetic preview at 393 × 852, Codex clicked the real controls through Fabric → Color → Origin → Dye → Care and saved screenshots of each state. No form values were changed, no save occurred, and no records/feedback were written. The temporary tab was closed and the viewport override reset. This confirms those transitions can run in the existing application; it does not verify a screen canvas, transition/input recorder, pre-owned branch in this run, full replay or multiplayer.

The current sources expose fixture configuration, data and revisions and a feedback capture path. They do not expose a complete application screen/transition/input event contract or a live candidate editor. Those are implementation work. The existing feedback capture path should be reused where appropriate; it is not automatically a traversal recorder.

## Revised visual and limitations

The new Image Gen result was displayed once in this chat:

`/Users/taymoor/.codex/generated_images/01a12354-2b94-7df3-aff2-45fe8e90641e/exec-ed51bfac-9a4c-4269-84de-31a1be9b4b66.png`.

It attached the owner's previous image plus fresh actual Fabric, Color, Origin and Care screenshots. The separately captured Dye screenshot was inspected but not attached: the tool accepts at most five image paths. The local focus illustrates Dye as a continuation rather than inventing its screen. The result shows desktop and mobile Play states, with Edit / Inspect affordances. It does not demonstrate the Edit state or functioning controls.

Generated pixels are illustrations. The Via dye (above) line does not prove a rendered offscreen Dye node, and the thumbnail layout does not establish graph geometry or exact pixel fidelity. The captured-input example omits the empty percentage fields from its table; implementation must retain and show them. The Color image omits some scrollable lower content; the real live screen must retain its full controls. No inferred care guidance or check passes are approved by the mock.

Documentation checks passed. No application build/tests, accessibility measurements, candidate edits, recorded-input storage or multiplayer conflict tests were performed in this proposal pass. Product Design's feedback workflow calls for selecting the revised visual before replacing the application UI.
