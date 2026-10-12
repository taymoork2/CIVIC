# Local connected review workspace

The first usable review workspace is implemented in the `f0d3` checkout, based on
`0bffbbcf2e38ca3ec7e17da3eb6496b6f04f348d`. It uses real React task sheets with a
synthetic local adapter. It does not connect to a Convex deployment.

## Open and use

Run `pnpm --dir apps/web review` from this checkout, then open
`http://127.0.0.1:3010/review`. No review key or sign-in is needed. Opening a review
entry automatically starts or renews a local session with an HttpOnly,
SameSite=Strict cookie. The server requires loopback, that session for its API,
and a matching origin for browser writes. Its access middleware runs before the dev
framework's file and route handlers. Private data, environment files and filesystem
requests outside this repository are rejected. Existing `/design-preview` keeps
its development guard; the review entries and API are development only.

### Separate application checkout

This machine now connects Rehearsal in `f0d3` to Laundry App in `f7ce`.
The ignored `.review-data/application.json` stores the connection:

```json
{ "root": "<laundry-app checkout>" }
```

The usual review command retains this setting across restarts. Override it for
one run with `REHEARSAL_APP_ROOT=/absolute/path/to/laundry-app pnpm --dir apps/web review`.
An absent setting uses the Rehearsal checkout itself; an invalid saved path fails
instead of silently previewing a different app. Rehearsal uses its own installed
tooling; the connected checkout needs its app dependencies available as well.

Application presenters, copy, styles, public assets, planner and Convex source
are read from the connected checkout. Rehearsal's code, scenario/transition registry,
coverage expectations, synthetic adapters, feedback, proposals and snapshots stay
here. No files are copied back to the application, no commits are merged, and its
server, backend and environment files are not used. API evidence reads application
files from the connected source; review files and review checks remain local.
The index's `connection` identifies both roots and the application's HEAD, while
source hashes include uncommitted application changes and local adapter code.

The server watches both source locations. Linked edits refresh discovery and
coverage, invalidate compiled modules for new frames, and invalidate source-bound
snapshots. The canvas polls for updates and prepares fresh captures automatically.
Existing open runs and proposal drafts keep their rendered revision and inputs;
restart a run when ready to use changed application behavior. A new route can be
discovered without a runnable synthetic state; adding its scenario/fixture remains
an explicit adapter task. A new component API or dependency may require an adapter
update or server restart.

Until Laundry App exports review hooks, a bounded in-memory overlay adds the
intake observation/presentation props and specimen exports during compilation.
It preserves application behavior and refuses incompatible source anchors. It never
writes those hooks into `f7ce`. The app-owning chat has received the proposed adapter
contract; adopting it and removing the temporary overlay awaits its completed handoff.

Search the scenario navigator or copy a scenario link. Links include scenario,
persona, role, condition, appearance, text scale and frame width, without credentials.
The initial set has 34 named states, including the multicolor pack and 80/20
cotton/polyester towel steps, basic appliance/product intake, all five saved-record
families, item editors, tags, care and product Contents. Existing specimens are
separately labeled partial. A source-discovered route/sheet inventory identifies
surfaces without a named review entry; it is not an exhaustive journey audit.

The pack and towel play through the real intake sheet. Save creates local pieces;
their saved-item links open that batch. New appliance/product links similarly
retain the newly saved record. Basic records retain unknown capacity and directions
instead of inheriting fixture facts. Tags and Contents save through real forms.

Changing a scenario or preset asks before discarding its open draft. Saved records
remain in this browser; persona, role and condition each select a separate dataset.
Only **Restart scenario** resets that dataset. Saved feedback remains. **Retry
writes** keeps the current draft and enables its next local save. Owner/member and
offline behavior are simulations, not backend authorization or offline acceptance.

## Feedback and retrieval

In the persistent canvas, select **App**, a flow in the outline, a screen, or an
arrow, then open **Review → Comment on selection**. Overview arrows open the origin
flow's path list so an aggregated connection is not mistaken for a single branch.
Detailed arrows can be selected with the pointer, Enter, or Space; the right pane
also lists declared paths with their destination and condition.

Draw a rectangle on the frozen evidence, click a visible live control, or use the
named control selector. Keyboard users can set normalized region coordinates.
Live control targets retain a selector and label bound to that rendered revision;
selectors are evidence, not a promise of stability after a source change.
Static screen reviews copy the saved synthetic starting PNG and have no captured
run inputs. Live reviews retain the current form inputs and scroll position.
Flow/path/app reviews freeze the visible canvas; embedded live frames are omitted.
Notes are kept in local browser storage as they are typed.
They become server records only after the screenshot and feedback write succeed.
A failed send retains the note and frozen capture for an idempotent retry.

The record has an explicit app/flow/screen/region/path identity. Path identities
include origin, destination and action; conditions and return paths come from the
same declared graph that draws the canvas. These are declared branches, not proof
that a run traversed them. Historical PNGs and rendered receipts remain unchanged.
Source bindings attached at save time are separately bound to `serverRevision`.
Deep links focus the saved target; they never replace the retained live draft.

Use **Copy agent brief** or **Download agent brief** on a saved review to hand it
to the coding/design agent. The brief includes the request, target, highlight,
source receipts, checkout ownership, affected components/checks, captured inputs
and local evidence links. It does not dispatch an agent or grant authority to
modify another owner's checkout. Resolve only after attaching correction evidence.

The screenshot rasterizes the current frame's DOM, styles, form values and scroll
positions with JavaScript disabled and external resource requests blocked. It is
a reconstruction of the synthetic preview, not an operating-system screenshot.
The record also stores the selected drawer/tab, draft fields, normalized highlight,
viewport, rendered source receipt and selected canonical design hashes. Password
values and session cookies are excluded. A changed source revision is marked stale.

Durable feedback and PNGs live in ignored `.review-data/`, using owner-only file
permissions and serialized, atomic feedback writes. Browser session cookies expire
when the server restarts; reopening the preview renews the session automatically,
and saved feedback persists. Browser records and
unsent notes do not transfer to another browser. Reproduction opens the named
scenario and presets; the original screenshot and captured fields remain available
for comparison, rather than automatically restoring a historical draft.

Local agents open `/review` once and retain its session cookie for API requests:

- `GET /api/review/index`: connected scenarios, transitions, discovered surfaces,
  source/design revisions, scoped check links and explicit coverage gaps.
- `GET /api/review/evidence?file=…`: an indexed component, check, design artifact or
  validation receipt. Arbitrary filesystem paths are not accepted.
- `GET /api/review/feedback`: saved notes, exact captured context, screenshot and
  reproduction links.
- `GET /api/review/screenshots/<feedback UUID>.png`: its authenticated attachment.
- `GET /api/review/feedback/<feedback UUID>/handoff`: downloadable Markdown agent
  brief with a machine-readable record. Source staleness is evaluated at retrieval.
- `POST /api/review/feedback/<feedback UUID>/resolve`: JSON
  `{"evidence":"linked correction or passing check receipt"}`. Empty evidence is
  rejected; the resolution records the current source revision.

For isolated checks, `REHEARSAL_DATA_DIR=/absolute/temporary/path` chooses a
separate local store. Production-style user data remains in `.review-data` by
default. Browser annotation checks warm only their two test fixtures; they do not
claim that every app snapshot was regenerated or every journey was exercised.

For example, open a local session and read the index:

```js
const origin = 'http://127.0.0.1:3010'
const entry = await fetch(`${origin}/review`)
if (!entry.ok) throw new Error(`Review entry: ${entry.status}`)
const cookie = entry.headers.get('set-cookie').split(';')[0]
const response = await fetch(`${origin}/api/review/index`, {
  headers: { cookie },
})
if (!response.ok) throw new Error(`Review index: ${response.status}`)
console.log(await response.json())
```

Feedback creation uses the browser workspace's explicit schema: a UUID requestId,
kind/message, validated scenario/preset/state/viewport context, normalized anchor,
captured HTML and rendered `snapshot: { revision, design }`. An authorized agent
must supply the same captured context; index metadata alone does not prove a UI
state was reviewed. There is no automatic issue, PR or design publication.

## Evidence and boundaries

[The validation receipt](review-validation.json) binds local check results to HEAD
and a SHA-256 digest of application sources, unit tests, registered browser checks,
review scripts, configuration and lockfile. The index labels it stale when those
inputs change. Canonical artifacts have their own hashes and existing generated
reference receipt. A bounded static reference does not establish behavior parity.
Web source in either checkout and validation-receipt changes refresh the server inventory. Restart
the review server after changing check scripts, configuration or canonical artifacts,
and reload the preview after code changes: hot replacement is disabled so an open
draft keeps its rendered revision. The digest covers the named web inputs; unchanged
shared packages and backend modules are identified by the base HEAD.

Checks: `pnpm --dir apps/web check`, `pnpm --dir apps/web test`,
`pnpm --dir apps/web test:review`, and the explicit review browser suite:

```sh
WASHCLOSET_REVIEW_E2E=1 WASHCLOSET_E2E_BASE_URL=http://127.0.0.1:3010 \
  pnpm --dir apps/web exec playwright test e2e/review-workspace.spec.ts \
  --project isolated --workers 1 --retries 0
```

Set `WASHCLOSET_E2E_BROWSER=webkit` for WebKit. Browser traces are disabled for these
checks to keep login credentials out of artifacts. Screenshot capture reuses the
installed Playwright dependency and Chrome; no dependency or browser is installed
by the review command. A missing capture browser fails visibly and retains the note.

No personal household is loaded or written. The source checkout and its
3005/3258/3259 runtime, and the owner trial's 3006/3220/3221 runtime, remain outside
this workspace. The implementation has no backend changes, credential changes,
commit, push, deployment or canonical OpenDesign writes.

Photo uploads, research, planning and garment care actions are not simulated;
unsupported writes fail. Real saved editors are reused, but complete application
journeys and every preset combination are not validated. Native implementation,
canvas layout, simultaneous collaboration, phone deployment and physical-device
acceptance remain open. OpenDesign native annotation retrieval is unverified;
the review API is the explicit agent path. The review shell still needs canonical
design reconciliation; existing task component rules were reused.

Scoped simplification and a manual source/security pass were performed in the main
thread. Code review: skipped (ce-code-review unavailable). Its independent reviewer
dispatch conflicts with this checkout's sequential-main-thread instruction; no
independent review receipt is claimed. The manual pass found and corrected a dev
middleware ordering defect, now covered by protected-file browser checks.

The [original proposal](2026-10-09-connected-review-workspace.md) preserves the
broader direction. [Current delivery status](../plans/2026-10-03-delivery-status.md)
records this local delivery separately from design reconciliation and device proof.
