# Local connected review workspace

The first usable review workspace is implemented in the `f0d3` checkout, based on
`0bffbbcf2e38ca3ec7e17da3eb6496b6f04f348d`. It uses real React task sheets with a
synthetic local adapter. It does not connect to a Convex deployment.

## Open and use

Run `pnpm --dir apps/web review` from this checkout, then open
`http://127.0.0.1:3010/review`. Enter the key from `.review-data/access-key`.
The server requires loopback, an authenticated session or bearer key, and a
matching origin for browser writes. Its access middleware runs before the dev
framework's file and route handlers. Private data, environment files and filesystem
requests outside this repository are rejected. Existing `/design-preview` keeps
its development guard; the review entries and API are development only.

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

Choose **Pin feedback** and click an element or drag a region. Keyboard users can
select a named target; the frame scrolls it into view. **Resume interaction** removes
the annotation overlay. Notes are kept in local browser storage as they are typed.
They become server records only after the screenshot and feedback write succeed.
A failed send retains the note and frozen capture for an idempotent retry.

The screenshot rasterizes the current frame's DOM, styles, form values and scroll
positions with JavaScript disabled and external resource requests blocked. It is
a reconstruction of the synthetic preview, not an operating-system screenshot.
The record also stores the selected drawer/tab, draft fields, normalized highlight,
viewport, rendered source receipt and selected canonical design hashes. Password
values and the access key are excluded. A changed source revision is marked stale.

Durable feedback and PNGs live in ignored `.review-data/`, using owner-only file
permissions and serialized, atomic feedback writes. Browser session cookies expire
when the server restarts; the key and saved feedback persist. Browser records and
unsent notes do not transfer to another browser. Reproduction opens the named
scenario and presets; the original screenshot and captured fields remain available
for comparison, rather than automatically restoring a historical draft.

Authorized agents use the same local key in a `Bearer` authorization header:

- `GET /api/review/index`: connected scenarios, transitions, discovered surfaces,
  source/design revisions, scoped check links and explicit coverage gaps.
- `GET /api/review/evidence?file=…`: an indexed component, check, design artifact or
  validation receipt. Arbitrary filesystem paths are not accepted.
- `GET /api/review/feedback`: saved notes, exact captured context, screenshot and
  reproduction links.
- `GET /api/review/screenshots/<feedback UUID>.png`: its authenticated attachment.
- `POST /api/review/feedback/<feedback UUID>/resolve`: JSON
  `{"evidence":"linked correction or passing check receipt"}`. Empty evidence is
  rejected; the resolution records the current source revision.

For example, read the index without putting the key in a URL or shell argument:

```js
import { readFile } from 'node:fs/promises'
const key = (await readFile('.review-data/access-key', 'utf8')).trim()
const response = await fetch('http://127.0.0.1:3010/api/review/index', {
  headers: { authorization: `Bearer ${key}` },
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
Web source and validation-receipt changes refresh the server inventory. Restart
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
