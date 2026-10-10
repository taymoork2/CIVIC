# Review workspace

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A product owner, designers, developers and collaborators exploring and proposing changes to an application's working journeys, with coding agents retrieving, reproducing and resolving feedback. Desktop is the primary workspace; a narrow browser must open directly on a usable preview. People and agents must have visible attribution and explicit decision authority. Interaction modes describe the task, not the person's profession.

## Product Purpose

Explore a real application in synthetic scenarios, attach feedback to its exact state, and inspect a fix with its evidence. Laundry App is the first integration. The workspace is an independent product that may later move to its own repository; its identity and shell do not inherit Laundry App's design system.

## Operating Context

One persistent canvas holds the application journey, actual screen snapshots and a live preview in its screen's position. Claude Design's Workbench, Storyboard and Review structures describe capabilities within this workspace: live interaction, journey context and contextual evidence. They are not separate destinations. Flows and primary paths run left to right; alternate branches stack below and reconnect. Selecting a flow fits its bounds and expands its screen list; selecting a screen focuses it. The sidebar follows the camera when its center falls on a screen. A whole-app overview fits the timeline; the initial camera starts at sign-in/setup, while scenario links focus their screen. Play is the default. Edit proposal changes supported, versioned presentation properties that can be tested on the real towel screen. Inspect and Review share the optional right pane. Review filters by screen, flow or status; selecting a review focuses its target while retaining the live run. Frozen screenshots and captured inputs remain historical evidence, without implying that focusing a fixture replays them. Capture happens before writing a review; navigation, pane changes and save retries retain that capture. Mobile provides closable outline and inspector overlays. See [the screen-canvas revision](screen-canvas.md) for the earlier interaction contract and [current build evidence](build-evidence.md) for implementation and limits.

## Capabilities and Constraints

- The current first integration provides 34 working scenarios and 139 partial specimens (176 map nodes after separating the towel care states). These counts describe the initial implementation, not the eventual product model.
- Keep persona, permission and evidence conditions separate. A persona must not imply a permission or care rule.
- Changes of scenario or review conditions require explicit confirmation before discarding an unsaved application draft. Saved synthetic records and feedback persist.
- Feedback retains its screenshot, anchor, visible state, source/design revisions and reproduction link. A retry retains the original capture. A resolution requires evidence.
- Distinguish working preview, design reconciliation, browser checks and physical-device acceptance. Never collapse them into a single complete badge.
- Keep local authentication, trust-boundary validation, safe retries and error visibility. Do not expose credentials in links, screenshots or design briefs.
- Existing Laundry App styling remains inside the application being reviewed. Its canonical design workspace is not the design authority for this independent shell.
- The journey model relates stable states through labelled actions and conditions. It must support branching, return paths, subflows and alternate outcomes. Declared, proposed and observed paths remain distinct; an incomplete registry cannot claim exhaustive coverage.
- Inactive screen nodes use captured thumbnails with revision/run or fixture provenance. The running preview remains mounted while browsing; interaction is shielded unless its screen is focused at a usable scale. Selecting a thumbnail never activates a scaled application control accidentally. Selection outside the running path does not replace the run; Start here uses explicit fixture-jump and draft protection. A fixture jump is not a replay of preceding steps.
- Confirmed runtime transitions produce an ordered trace tied to the target, revisions, fixture and conditions. Preserve one continuous application session across nodes. Allowlisted synthetic inputs are captured at transitions as entered, without collecting credentials/keystrokes or guessing normalized values. Back/loops create repeat visits; failures do not become successful edges.
- Edit changes a reversible candidate, with shared-instance scope visible. Supported candidate edits require an adapter or source integration; arbitrary DOM changes are not adoption. Static candidates remain labelled. Switching modes preserves the run, and candidate activation is explicit. The towel adapter implements heading, primary-action copy and accessible button-color edits, durable optimistic versions, and confirmed transition/input recording. Arbitrary component, token and behavioral editing remains open.
- Unmapped runtime states stay visibly off map. Stable target IDs that disappear require retained identity history and explicit re-anchoring; no automatic nearest-node match may manufacture observation or approval evidence.
- Proposals can target a journey, screen, component, primitive or token. Shared contracts, target variants, approval decisions, implementation adoption and verification evidence remain distinct. Intentional platform adaptations and accepted limitations do not silently erase drift.
- Multiplayer readiness is required. Shared proposals, comments and decisions need stable identities, attribution, scoped permissions and explicit conflict handling. Private draft/preview/fixture sessions are the default. Another collaborator's navigation cannot discard or overwrite a person's draft.
- Presence, following a reviewer and a synchronized review session are optional modes. Joining, leaving, disconnecting and rejoining must be explicit; shared side effects have a visible owner. Shared storage, synchronization and multiplayer authorization are not implemented by this brief.
- No marketing hero, analytics dashboard, unrelated chat/audio/team-admin features, publishing, native runner or generic plugin framework is needed for this design pass.

## Brand Commitments

No product name or final visual direction is approved yet. Rehearsal is a tentative exploration name. The owner prefers the displayed Focus Workbench and Observation Folio concepts and requested a clearer combined proposal with a first-class journey map. The first screen must identify the app/journey, current position and one obvious next action. Favor clarity, readable typography, a strong preview hierarchy, precise grouping, accessible contrast and purposeful short interactions. Identity should come from exploring, annotating and revisiting working product states.

## Design Collaboration

Codex owns the brief, comparison, integration and verification. Claude Design and the user's local Open Design desktop app provide bounded design proposals and completed handoffs. They are separate collaborators and must not be silently substituted for each other.

The initial Claude Design artifact is `09ab05e9-aca3-4553-a601-a42fc144eddd`, in conversation `cse_01RDvjo76ZzDMpw5FDXAGhQT`. The new local desktop project is `c2383e11-71dc-463a-aea0-a7f2aaefac7f`, conversation `7960b5e2-1eb2-4f06-b42f-c715c9bfa042`. These are proposal workspaces; their contents are not implementation approval or verification.
