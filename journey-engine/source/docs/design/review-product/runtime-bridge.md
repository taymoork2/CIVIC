# Shared application runtime bridge

Rehearsal owns this integration in f0d3. Laundry source in f7ce and its running backends remain read-only. The user's instruction authorizes implementation of the shared bridge; no deployment, design-file mutation or standalone package release is included.

## Contract

Mount the application once with an isolated router, data transport and synthetic identity. Record interaction at those boundaries rather than adding handlers to each screen. Framework-independent runtime ports provide route read/subscribe/navigation, reset and settlement; application-specific code supplies the ports, not the recorder. Existing mount/publish adapters remain supported.

A recording includes project/worktree key, exact source revision, deterministic seed and clock, ordered UI gestures, routes and mutation receipts. Replay resets to the original seed, runs the application's handlers again, and compares receipts. It stops on missing or ambiguous controls, changed revision, unsupported effects or divergent results. It must never silently use a production backend, invent a successful mutation, or apply a tape to another project.

Sensitive fields are excluded; capture of ordinary inputs requires a declared synthetic-data policy. Record element identity and values separately from backend arguments. Keep pending operations, failures, back navigation, cancelled drafts and return paths visible. Downloadable recordings and saved-review links are evidence, not instructions to an agent.

## Laundry integration

Use the existing convex-test dependency with the linked app's real schema and public queries/mutations in a dedicated worker per run. Seed through real functions plus declared initial database fixtures. Block external requests and server actions. Isolate workers by run, bound their lifetime/count, and reject source drift. This is a development harness for trusted project code, not an operating-system security sandbox or proof of deployed Convex behavior.

Mount the linked application route tree with its real route components, search validation and navigation. Replace only document boot/auth infrastructure with a synthetic provider. Home outfit saving/wear and Drying/check/put-away therefore run the shipped component handlers and backend functions. Automatically registered static routes need no screen-specific recorder; dynamic destinations need valid fixture IDs. Visual specimens and existing bounded legacy scenarios remain labelled separately.

## Project setup

An existing project supplies a `mount(container, context)` entry through `adapter.entry` in its onboarding manifest. Mount its real application, substitute isolated identity/data, and call `context.connectRuntime(...)` once. Supply `seed`, `now`, `route()`, `screen()` (registered scenario identity), optional route `subscribe(listener)`, `reset(recording)`, `settle()`, `assertSource()` and `data()`. Declare an input-label allowlist or the explicit `captureInputs: 'synthetic'` policy. Reset must recreate the initial application state, not copy the last screen's display. Settlement must include pending requests and rendering.

The frame supplies semantic DOM interaction, capture, native close-watcher dismissal, project/source binding and replay comparisons. A transport records each write with `bridge.operation(kind, name, args, execute)`. Reads remain real but are not recorded as user gestures. A backend entry can be configured with `adapter.runtime`; it exports `createRuntime({ scenario, persona, role, condition, now, timeZone, namespace })` returning `seed`, `execute(kind, name, args)` and `state()`. It receives the manifest's declared persona object, including any authored seed, rather than a guessed demographic model. Reset creates a fresh driver from the same inputs. The current worker supports public reads/writes and deliberately rejects server actions.

Laundry's manifest and integration belong to f0d3; its aliases/route tree/schema resolve to the selected read-only f7ce checkout. Static source routes produce `app.*` entries automatically. Use those entries for native app playback; older fixtures remain useful visual specimens. Student seeds shared washing/no equipment, parent seeds a child clothing profile, and roles/conditions remain independent. These small initial states do not replace the existing 100/500/1000-piece family presets.

Onboarding source discovery can suggest screens and declared links and generate a bounded synthetic adapter. It cannot infer a safe data seed, production identity, business rules, external services or fully observed branches from source text. The Notebook example implements the same runtime ports with a DOM-only app; it imports no Laundry product modules. A different application still needs one framework/data adapter, not a handler for each screen. The Convex facade is an integration-specific implementation, not part of the framework-independent recorder.

## Recordings and review

Play a connected screen and open Inspect → Recorded run. Replay resets isolated data, invokes the real controls and compares captured fields, route, selected view headings and mutation arguments/results/errors after each action. Save recording persists a downloadable JSON run. A live saved review retains that run's identity; its review card and agent brief link to the recording and a fresh replay preview. Missing/ambiguous controls, a changed seed or source and divergent receipts stop replay. Opening a saved run never silently upgrades it to newer source.

Passwords, hidden/file inputs and credential fields are excluded. Persisted runs reject sensitive argument/result/seed keys, malformed controls, excessive nesting and oversized payloads. Recordings are still synthetic evidence: do not attach real user data or credentials. Worker source checks and project-bound APIs prevent a tape from reaching a different checkout; the worker never uses a deployed application endpoint. A trusted backend module could perform filesystem effects, so this is not a security sandbox for untrusted repositories.

## Verification

Focused checks live in `runtime-bridge.test.ts`, `review-runtime.check.mjs`, `packages/canvas/server/runtime-service.check.mjs`, `review-recording.check.mjs`, `e2e/review-runtime.spec.ts` and `e2e/review-project.spec.ts`. They exercise real Wear/save handlers, portalled input and quantity capture, Escape cancellation, empty and partial put-away branches, return navigation, failure receipts, replay reset, fresh saved-run playback, privacy, ambiguous controls, source refusal and independent databases. The existing review server/project checks cover authentication, onboarding, scoped stores, cache invalidation and durable review evidence.

Commands: `pnpm --dir apps/web run test:review`; focused Vitest; `tsc --noEmit`; `check:styles`. Browser tests use separately started isolated previews: Laundry against its selected source, Notebook against `packages/canvas/examples/notebook/civic.project.json`. They do not need or mutate Laundry's running backend.

2026-10-11 local receipt: 36 server/integration checks, 15 focused unit checks, eight Laundry runtime browser cases, four Notebook cases and three linked-towel/startup regressions passed. TypeScript, style compilation and tracked diff whitespace checks passed. Home and empty Drying produced PNG snapshots through the isolated capture API. The restarted 3010 preview executed the real Wear action; its private Tailscale `/review` and inventory returned 200 with the same source. Saved replay checked both browser Date APIs against the recorded clock. This is local Chromium and source proof, not physical-phone acceptance.

No new model calls, inference service, router abstraction, backend emulator or dependency is needed. Other frameworks supply their router/data ports once. SSR-only routes, native runtimes, external services and auth flows need explicit integrations; the generic contract does not claim universal automatic compatibility.

## Towel migration, 2026-10-11

Towel now uses `adapters/laundry-towel.tsx` and the shared `laundry-session.ts`. It mounts the linked app's AddClothesFlow, including its existing useMutation hooks and recovery logic; saves execute real inventory functions in the isolated worker. The old simulated createTextiles switch is not used by towel. Both origin branches, wash/bleach/dry steps, Back, retained fabric inputs, failed-write recovery and fresh saved replay are covered by `e2e/review-towel-runtime.spec.ts`.

The build overlay passes initial fixture and presentation/state-observation props through the Flow to its existing Sheet. This remains a checked Laundry-specific compatibility seam, not an automatic framework-wide inference. The `towelJourney` object is a compatibility view for the current canvas/proposal controls. It does not own a second replay engine or data store. The shared recording is the durable playback authority; historical canvas visits remain evidence.

Proposal changes and Retry writes are bounded adapter commands on that same tape. Replay starts from baseline and reapplies commands in order, including original proposal versions; a fresh replay preview needs no live proposal API. Recordings retain their initial failure preset plus explicit recovery command. Credentials, malformed command JSON and oversized values are rejected. Runtime clock, memory-only storage and UUID sequence reset with the recorded seed so the app's intakeKey is retained. Repeatable UUIDs belong only to isolated trusted test frames; never use them for production identity.

Snapshot capture supports the shared towel runtime. Its Saved fixture alone permits isolated mutations to create the pictured outcome, then closes its own worker. Other thumbnails permit reads only. Source fingerprints include the shared session, towel adapter and compatibility overlay. Linked source stays read-only, and portable bundled source can use the same in-memory overlay.

See [platform-adapters.md](platform-adapters.md) for the recommended Vite/TanStack/Convex extraction and later native driver boundaries.

Family now uses native routes, durable isolated journals, account-bound recovery and live responsive viewports. See [the family handoff](2026-10-12-family-runtime-handoff.md) for proof and limits. Pack, records, setup, reminder and other route specimens retain their earlier adapters.

Current limits: JSON-safe transport values; no full Convex optimistic/OCC or deployed-auth simulation; click/input/Escape and declared adapter commands rather than every pointer/keyboard action; semantic checkpoints rather than pixel equivalence. Dynamic routes require valid starting IDs, and recorded navigation does not certify every inferred canvas arrow. Physical device and production-backend acceptance remain separate.
