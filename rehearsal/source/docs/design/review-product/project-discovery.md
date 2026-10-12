# Existing-app discovery and canvas refinement

Delivered October 11, 2026, in f0d3. Rehearsal remains on 3010, reading Laundry's f7ce checkout without editing it. Owner port 3011 and backend 3230/3231 remain separate. The v5 ZIP predates this pass and remains immutable.

## Connect through the UI

Project picker → Connect existing app → host app folder and relative source folder → Discover screens → confirm screens, order, props, allowlisted input labels and paths → Generate preview → Open project. Apps with an existing playable manifest reuse that connection. Inventory-only connections can generate an isolated preview; keeping inventory only is still available.

Discovery reads source without importing modules or using a model. It recognizes HTML pages, exported React presenters, literal links/forms and some route declarations. Scans cap candidates, files and total bytes, and skip files larger than 500KB before reading them. Findings are heuristic candidates, not complete journey extraction. Screen IDs derive from file/export identity. Unresolved destinations and provider-dependent states stay visible. Personas, roles and conditions remain separately authored synthetic presets; scanning does not infer real users, permission rules or care requirements.

The user confirms the selected graph before writing. Generation rechecks the source hash and rejects stale scans. It validates identities, paths, props and unique action destinations, and creates these files under an owned `rehearsal-projects/<connection>/` folder:

- `rehearsal.project.json`: existing portable connection contract.
- `rehearsal.scenarios.json`: confirmed screen order, declared branch/return paths, props and capture labels.
- `rehearsal.coverage.json`: remaining source candidates, including states requiring context.
- `discovered.screens.json`: real source bindings for the generated preview.
- `discovery.evidence.json`: original scan findings and revision.
- `rehearsal.ts`: entry using the shared discovered-screen adapter.

Product source is read-only. Generated integration files remain on the Rehearsal host and are excluded from Git by the existing local-project rule. Opening a project uses the existing guarded restart and project-isolated stores. Source watchers invalidate inventory/receipts; discovery is not a continuously rewritten scenario registry. Rescan/merge tooling for evolving generated registries is still open.

## What Play proves

HTML previews use actual source markup, local styles/assets and native form validation; scripts and inline handlers are removed. React previews import actual isolated components with confirmed JSON props. Mounted screens retain DOM/component state on returns. Allowlisted input fields and frozen departing screens are captured through the existing review API. Generated edges are synthetic navigation, with conditions and return descriptions as notes, not executable production predicates.

The canvas labels **Synthetic navigation · state carried by Rehearsal · app behavior unverified**. Captures persist that distinction in their message and state context. Traversing a generated edge does not mark a production path observed. Auth, router/data providers, backend saves, arbitrary dependencies and native apps are not automatically connected. Unsupported components fail visibly; source candidates requiring common providers are disabled and remain coverage gaps. Only trusted local app code should be connected: importing React executes that code, and the existing CSP/server restrictions are defense in depth rather than a plugin sandbox.

The dependency-free example `apps/web/examples/discovery-app` deliberately has no manifest. It contains HTML composition/save/archive branches and returns, a real React counter and an Account component requiring context. This verifies generation rather than reuse of a prewritten integration.

## Top bar and arrows

The desktop toolbar is 52px tall, separates the primary Play action from contextual panels, retains the project picker and removes the duplicate coverage announcement. All journeys names the application overview. Phone panels retain Inspect/Review/Coverage labels with 44px targets across two compact rows. Snapshot placeholders do not block navigation or Play.

Overview arrows use different ports for opposing directions, small open heads, obstacle avoidance and an extra routing cost for overlapping/crossing existing paths. Lane offsets are bounded to avoid growing detours. Unrelated paths remain readable but subdued; selection highlights the relevant flow. Declared actions, branch conditions and return paths retain their review targets. This is an incremental router improvement, not a claim of globally optimal graph layout.

## Local design critique

The existing local Rehearsal project `c2383e11-71dc-463a-aea0-a7f2aaefac7f`, conversation `7960b5e2-1eb2-4f06-b42f-c715c9bfa042`, received a bounded text-only brief. Its Claude-labelled collaborator endorsed the compact toolbar, All journeys, distinct ports/open heads, screen/path confirmation and explicit provider gaps. It requested labelled narrow controls, readable muted arrows, synthetic transition provenance and clear state ownership; these are incorporated.

Its suggestion to replace dashed returns was deferred: the current legend consistently defines dashed as return, and this pass does not introduce a second dashed meaning for hypothetical paths. No canonical design files were edited. This is a local desktop text critique, not a new Claude Design web artifact or pixel-level design approval.

## Verification

- 30 review service checks: discovery, validation, stale source rejection, owned files, app preservation, server access, isolation and existing agent/coverage behavior.
- 17 focused graph/router/review/store unit checks and TypeScript/style checks.
- Three disposable-host browser cases: discovery/generation, native validation, both branches and return inputs, frozen captures, real React counter, no external POST, inventory-only onboarding, new-project creation, project switching, review isolation and narrow dialog focus. Final discovery rerun also asserts synthetic receipt provenance.
- Linked Laundry browser checks: overview/branch layout and real towel draft, review and proposal continuity. A stale Home screen-count assumption was removed after the product owner added a state.
- Desktop, 612px, 393px and 320px captures: no document overflow; desktop/tablet header 52px, phone header 105px; phone panel targets 44px high.

The product owner's preparation handoff (source `31fe2790`, documentation `82724ab`) is consumed through read-only f7ce source; Rehearsal does not claim that owner's device/care acceptance. Physical-phone acceptance, complete-framework onboarding and complete inferred journey coverage remain unchecked.
