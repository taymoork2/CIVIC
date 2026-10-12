# Project picker and onboarding

The owner requested connection and new-project setup without the CLI. This builds on the existing versioned manifest and adapter, without creating a second graph or application configuration format.

## Surface and scope

The project name beside the Rehearsal brand opens a native modal. Saved projects lead; connect/create forms and their completion state share that modal. Controls retain the existing canvas typography, blue actions and neutral chrome. All fields have accessible names, errors retain input, Escape returns focus to the trigger and the dialog fits a 393px viewport.

Connecting an app with a playable manifest validates paths, contexts, scenario identities, branches and coverage before selection. Otherwise onboarding offers source discovery and confirmation of isolated screens, props, capture fields and paths. **Generate preview** writes an owned registry and adapter; **Keep inventory only** retains the earlier option. Provider-dependent states remain gaps. [Discovery scope and proof](project-discovery.md). New projects copy the dependency-free Notebook starter. No model call or dependency installation is required.

App folders remain read-only during onboarding. Files are created under Rehearsal's ignored `rehearsal-projects/`; connection and selection settings live in its private `.review-data/`. Only trusted local app/adapter code should be connected. Symlink/traversal/secret paths and invalid manifests fail visibly. A phone uses the host filesystem; this is not a phone upload/file picker.

## Switch boundary

`scripts/review-projects.mjs` owns catalogue validation, starter creation and atomic settings writes. `review-server.mjs` exposes GET/POST `/api/review/projects` through existing session and origin checks. The UI submits `action: add`, `action: discover`, `action: generate` with a frozen discovery ticket and confirmed candidates, or `action: select` with a saved key. Product roots and manifests are never accepted from an arbitrary selection payload.

Selection waits for the serialized review-write queue, refuses an active agent delivery, saves the resolved connection and requests a Vite restart after the response finishes. Restart rebuilds aliases, public assets, filesystem access, adapter and store bindings on the same port. The UI waits for the selected project key before reloading. Environment overrides supplied at launch take precedence on a future process launch; switching updates them inside this running process. For normal launches without those overrides, the saved UI selection is used.

`project-request.ts` adds the rendered project key to browser API requests. Old tabs receive a conflict response after another project is selected. An old view cannot submit its reviews, proposals or expectations to the newly active project. Saved records stay in their own store. Laundry App's legacy store remains at the base directory; generic stores are keyed subdirectories even when a custom store base is used.

Switch controls are disabled during proposal edits, app writes or pending/failed input captures. Ending an active run requires a checkbox. Review-note drafts retain their existing local-storage behavior. Current-tab run state is not restored by switching back; durable review and capture records are.

## Verification and design boundary

Closest checks: `review-projects.check.mjs` covers app-write preservation, starter registry/entry, catalogue persistence, path/symlink rejection, settings retention, unavailable connections, authentication, foreign origins, stale keys and restart receipts. `review-project-picker.spec.ts` exercises actual restart and selection, an inventory connection, a new app's branch/return/save inputs, isolated reviews, switching back, phone width and keyboard focus.

October 11 results: 27 review service checks, 14 focused graph/review/store tests, TypeScript/style checks, two onboarding Chromium tests and the linked Laundry canvas draft/review/proposal continuity test passed. The canvas browser test now derives its expected node count from the registered graph instead of an obsolete fixed count, and uses current review controls. Both 3010 and private HTTPS returned the f7ce connection. A Git-free source snapshot produced a content-hashed inventory with a zero revision HEAD and unavailable application HEAD; it does not invent commit evidence.

The shell follows the existing local design direction recorded in `proposals.md` and `screen-canvas.md`. The later discovery/toolbar pass received a text critique from the existing local Rehearsal design conversation; [its decisions and verification](project-discovery.md) are recorded separately. This is not a new Claude Design web artifact or visual-fidelity approval. Historical screenshots do not attest the updated UI.

No generic design authoring, cloud repository onboarding, remote harness provisioning, mobile upload, automatic complete-app generation, destructive project removal or native framework adapter was added. These are outside this owner's request.
