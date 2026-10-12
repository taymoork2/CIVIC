# Project onboarding implementation

Owner-approved scope: replace implicit Laundry coupling with a portable manifest and explicit browser adapter. Root controller: this CIVIC chat. CIVIC owns f0d3, its local connection/store and port 3010. Laundry's owner owns f7ce and port 3011; this implementation never writes that checkout. No new model provider or dependency is needed.

Implementation sequence:

1. Validate a versioned project manifest, relative source/registry/coverage/preview paths, authored personas and separate roles/conditions. Keep absolute checkout paths and the private HTTPS origin in ignored local settings. Supply a non-overwriting init/check CLI.
2. Route the existing server/inventory through the selected project. Isolate review stores across project/worktree identities. Keep legacy Laundry discovery and temporary compatibility transforms in its explicit adapter, pending the product owner's native presenter handoff.
3. Load a project-owned browser mount adapter through a generic frame entry. Provide stable context, explicit state/transition reporting, allowlisted input capture and cleanup. The shared canvas and feedback must accept non-Laundry graphs and context choices without introducing a second workspace.
4. Verify a second dependency-free example app, conditional branches and return paths, feedback, source watching, invalid configurations and checkout preservation. Recheck Laundry's linked towel and family fixtures, then restart 3010 and preserve its Tailscale route.

Stop conditions: refuse invalid or escaping paths and duplicate identities; report adapter/source drift rather than changing product files. No arbitrary production app/backend execution, automatic component rewriting or inferred persona promotion. Full extraction into a standalone package, every framework/native adapter and design-file synchronization remain outside this slice.

## Delivered connection

`civic.project.json` is the portable project contract. `packages/vite-connector/src/review-project.mjs` validates it and supplies `init` and `check`. The default manifest describes Laundry explicitly; another application selects its own manifest. The dependency-free Notebook example is in `packages/canvas/examples/notebook` and has real DOM presenters, a separate synthetic adapter, four screen states, a conditional branch, return paths and project-specific context.

No model call is required for onboarding, source inventory, graph assembly, coverage comparison, input capture or refresh. Source discovery recognizes TanStack `createFileRoute` calls and named `*Sheet*` functions as unconfirmed candidates. Other frameworks can supply the same registry explicitly; discovery is deliberately incomplete. CIVIC does not infer unwritten requirements, complete journeys, personas, permissions or safe fixtures from code.

### Connect or create through the workspace

Open `/review` and click the project name beside CIVIC. The **Your projects** dialog lists saved connections and offers **Connect existing app** and **New project**.

- Existing app: enter its absolute folder on the CIVIC review host. An existing playable manifest is validated and registered. Otherwise choose **Discover screens**, confirm isolated HTML/React candidates, order, props, capture fields and paths, then **Generate preview**. CIVIC creates the registry and adapter under its own ignored `rehearsal-projects/` folder, leaving the app checkout untouched. **Keep inventory only** remains available. Provider-dependent states remain gaps. See [discovery and its limits](project-discovery.md).
- New project: enter a name. CIVIC creates a local note-writing starter with real DOM screens, a synthetic adapter, personas/roles/conditions, four states, a branch and return path. This is a working starting point, not an automatically designed complete application. The completion view shows the app and manifest paths.
- Open a saved connection: its preview restarts on the same port with rebuilt module bindings and a renewed review session. The selected manifest/root are persisted in ignored `.review-data/application.json`; the catalogue is `.review-data/project-picker.json`. The private HTTPS origin and other host settings are preserved. A phone enters/selects folders on this host, not files on the phone.

Switching is shared by everyone using this local preview. Other tabs must reload; their project-bound API requests are rejected rather than operating on another project's records. Finish pending captures and save proposal edits first. Ending an active preview requires explicit confirmation. Active agent deliveries prevent switching until their final receipt, to avoid interrupting the harness conversation. Saved reviews and captures remain on disk; in-memory app runs end. Native dialog focus, Escape and narrow layouts are supported.

The UI needs no CLI commands to add or switch projects or generate an isolated preview once the host is running. It does not install dependencies, run an arbitrary app server or configure native adapters. Complete router/auth/data fixtures still need a project-specific adapter; generated navigation does not establish production behavior.

### Optional CLI setup

Run these from the CIVIC repository, substituting the target checkout:

```sh
node packages/vite-connector/src/review-project.mjs init \
  --root /path/to/application --id my-app --name 'My App' --source src
```

This prints the proposed manifest, empty scenario registry and coverage contract without writing. Add `--write` to create those three files; existing files are never overwritten. The source directory must already exist. A greenfield app can begin inventory-only, then add screens and an adapter as its presenters are implemented. `--preview src/rehearsal.ts` connects an already existing preview module; init does not invent one.

```sh
node packages/vite-connector/src/review-project.mjs check --project /path/to/application/civic.project.json
CIVIC_PROJECT=/path/to/application/civic.project.json pnpm --dir apps/web run review
```

Explicit `CIVIC_PROJECT` selection ignores the old local Laundry source path. The application root defaults to the manifest directory; `CIVIC_APP_ROOT` explicitly selects another checkout. Only run one preview on 3010 at a time. To explore the included Notebook example without changing local settings:

```sh
CIVIC_PROJECT=packages/canvas/examples/notebook/civic.project.json \
  pnpm --dir apps/web run review
```

Any `module` app can also open in the standalone canvas, with no Laundry workspace. It binds to 127.0.0.1:3020 and keeps reviews and connections in `~/.civic/canvas` (or `--store`), never in the app:

```sh
node packages/canvas/bin/civic-canvas.mjs --project packages/canvas/examples/notebook/civic.project.json
```

The CLI remains available for scripted setup. The workspace picker supplies connection and starter creation without it. No package installation into the target app is required.

### Manifest fields and ownership

| Field | Contract |
|---|---|
| `version`, `id`, `name` | Version 1, stable project identity, display name. |
| `adapter` | `{ "kind": "module", "entry": "src/rehearsal.ts" }`; omit entry for inventory-only. `laundry` is the explicit legacy compatibility adapter. |
| `sources` | Nonempty relative directories in the selected application checkout. Include all presenter dependencies that should invalidate evidence. No glob expansion. |
| `scenarios`, `coverage` | Relative JSON files owned alongside the manifest, even when product code is in a different checkout. |
| `personas` | Authored synthetic situations: `{ id, label, description?, seed? }`. Seeds are passed to the adapter; they are not generated from users or production data. |
| `roles`, `conditions` | Separate authored choices. The adapter enforces their effects; a persona never grants permission. |
| `navigation` | Ordered section names, used by canvas and sidebar. This order does not invent action arrows. |
| `aliases`, `publicDir` | Optional paths relative to the application root for Vite module resolution and assets. |
| `design` | Optional `{ id, files }` references; `CIVIC_DESIGN_ROOT` selects local exports. Hashes do not attest design approval or visual fidelity. |

Paths are relative, bounded and validated. Generic projects reject traversal, secret paths and paths escaping their root through symlinks. Laundry retains its previously established adapter compatibility for existing checkout/test layout. Stable context and scenario IDs must be unique. Malformed connections fail visibly.

Machine-specific settings remain in ignored `.review-data/application.json`:

```json
{
  "project": "/path/to/owned-integration/civic.project.json",
  "root": "/path/to/read-only-product-checkout",
  "publicOrigin": "https://your-machine.your-tailnet.ts.net:10445"
}
```

Use this when the integration manifest/adapter should live separately from product code. For this installation, f0d3 owns the manifest, registry, coverage and adapter; ignored `root` continues to select f7ce. Product-owner port 3011 is not used or changed by CIVIC.

### Screen and path registry

Each scenario declares `id`, `label`, `journey`, optional stable `flow`, `section`, `component`, synthetic `fixture`, `captureFields` and `edges`. Flow defaults to the journey grouping. Generic screen IDs are scenario IDs, shared by runtime, canvas, feedback and server validation.

```json
{
  "id": "notes.edit",
  "label": "Compose note",
  "journey": "Write a note",
  "section": "Main",
  "component": "src/screens.tsx",
  "captureFields": ["Title"],
  "edges": [
    { "action": "Save", "destination": "notes.saved", "when": "Author and save available" },
    { "action": "Review first", "destination": "notes.review", "returnTo": "Compose note with its draft" }
  ]
}
```

Declare the destination as another scenario. `branchOf` places a branch vertically beneath a main-path screen in the same flow; normal steps remain horizontal. This first contract supports main-path parents, not nested branch layout. An edge can cross flows. `when` and `returnTo` describe product conditions and return behavior; they are not executable predicates. The presenter/adapter remains responsible for enforcing them. Unknown destinations stay coverage gaps; CIVIC never fills them with guessed screens.

### Browser adapter contract

The preview entry exports `mount(container, context)` and returns an optional disposer, synchronously or asynchronously. TypeScript projects can reference `packages/canvas/src/adapter.ts` (`@civic/canvas/adapter`); the runtime itself requires no project-side dependency on CIVIC.

Context contains the selected `config`, registered `scenario`, selected `persona`, `role`, `condition`, frozen source/design `snapshot`, and two callbacks:

```ts
export function mount(container, context) {
  // Mount real project presenters using memory-only data and effects.
  // After rendering, including a direct fixture jump:
  context.publish({ screen: context.scenario.id, dirty: false, pending: false })

  // In a confirmed action handler, before replacing the departing DOM:
  // context.transition('notes.saved', 'Save')
  // render the destination, then context.publish({ screen: 'notes.saved' })

  return () => { /* unmount project presenters and release listeners */ }
}
```

`publish` must report a registered screen. `transition` must match a declared source/action/destination edge. Authored adapters report transitions only when the app confirms them; failed saves retain the current screen and inputs. Generated adapters pass `transition(destination, action, 'synthetic')`; receipts label synthetic navigation and state carried by CIVIC, without attesting production behavior. Publish the first ready screen before mount resolves. CIVIC captures departing DOM and allowlisted inputs, then follows the same iframe. Direct fixture entry never implies preceding paths were traversed.

Project adapters are trusted executable code: use actual presenters with synthetic data, stub queries/mutations locally, and do not mount production providers. The generic frame blocks external connections through CSP and the review server rejects application/backend routes and writes. This is defense in depth, not a sandbox for untrusted plugins. Screenshots and frozen HTML include visible synthetic content; `captureFields` restricts structured inputs, not every visible pixel. Never put real credentials or household/user records in fixtures. Password/file/hidden input values are scrubbed by the capture helper.

Structured input labels must match accessible field labels; undeclared inputs are omitted, and secret/credential labels are excluded. Server validation also rejects fields outside the scenario's allowlist. Transition receipts persist screenshot, input/context, action description and source/design receipt. Current-tab run history is in Inspect; failed captures keep their payload in that tab, offer retry and warn before closing while unsaved. Successful receipts survive server restart. Generic proposal property editing is not yet supported; the UI disables it and the API refuses Laundry-only edits for module adapters.

### Update and isolation behavior

Source directories, preview-entry siblings, public assets, dependency files, manifest, registry and coverage contract are watched. Changes refresh inventory, coverage and fixture hashes; new frames compile the changed code. Open runs retain their DOM, draft and rendered receipt. Saving a review records both that rendered revision and the current server revision, so stale evidence remains explicit.

Changes to checkout identity, adapter entry/kind, aliases, public assets binding, coverage destination or private HTTPS origin require a server restart. The inventory becomes unavailable until the binding is repaired/restarted, rather than silently mixing stores or writing the old contract. Other presets and registry edits refresh automatically; reload the workspace to refresh its context menus. Incompatible old-run captures may need retry/reproduction against the changed registry.

Generic stores live in `.review-data/projects/<project-id-and-checkout-key>` on the CIVIC review host. The key includes the resolved manifest and product checkout paths, so another checkout receives another store. Note drafts are project-scoped. Laundry App's existing `.review-data` store and drafts remain in place for compatibility. `CIVIC_DATA_DIR` changes the store base; generic projects still get separate key subdirectories. Agent destinations belong to the selected store; they are not inherited from another project.

The only intentional repository write exposed by the coverage API is the selected, validated coverage contract, guarded by source and contract versions. Scanners and preview compilation never write linked product sources. Adding a manifest through `init --write` is a separate explicit setup operation.

### Laundry migration boundary

Laundry-specific imports now live in `laundry-frame.tsx` and its presenters; discovery and temporary compile transforms live in `review-laundry-inventory.mjs` and `review-laundry.mjs`. The shared connection uses `loadProject`, and generic adapters perform no Laundry transformations. Compatibility exports keep existing tests/callers working.

The product owner confirmed on October 11 that f7ce's release does not include native review exports/intake callbacks. Consequently Laundry compatibility overlays are retained, fail on source drift and remain local to compilation. Removing them entirely requires a separate product-owned presenter-seam handoff; CIVIC did not modify f7ce to force it. The product release remains its own evidence, separate from these synthetic runs.

## Verification

- `pnpm --dir apps/web run test:review`: 25 checks passed, including init/dry-run/overwrite rejection, invalid/symlink paths, duplicate identities, independent contexts and stores, source/preset watching, fixed contract writes and incompatible binding rejection.
- `pnpm --dir apps/web run check`: TypeScript and style checks passed.
- Focused Vitest: 14 app-map, review-panel and synthetic-store checks passed.
- Notebook Chromium: three browser checks passed for conditional branch/return input retention, stable iframe identity, durable capture context, saved reviews, role/condition failures, visible adapter failures and absence of Laundry presenter requests.
- Linked f7ce Chromium: seven checks passed for both towel origin branches, separate care substeps, proposal edits/recording, live annotations, branch comments, 100/500/1000-item presenters, five-load wash/dry/put-away continuity and visible-only snapshots.

The project picker and browser onboarding were added after the adapter verification above. Their current checks and screenshots are recorded in `project-picker.md` and the October 11 handoff package. Physical-phone acceptance, native/framework-specific adapter packages, generic proposal edits, design-tool synchronization and automatic exhaustive journey extraction remain open.
