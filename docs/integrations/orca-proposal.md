# CIVIC review from Orca

This is a proposal for the Orca controller. CIVIC makes no model calls, starts no
agents, and never calls Orca. Orca calls CIVIC through its MCP gateway.

Register `civic-mcp` over stdio in Orca's integration settings. Pass the selected
worktree explicitly as `cwd`. A work reference is `{ system, id, url? }`; CIVIC
treats those values as outside identifiers and knows nothing about Orca's types.

Offer **Review in CIVIC** on a work item. Call `open_review` with its worktree and
work reference, then show the returned link to the owner. CIVIC opens or attaches
the worktree's own preview. The owner comments there; each comment becomes a
request linked to that item. Subscribe to
`civic://requests?system=<encoded-system>&id=<encoded-id>` and read it after an
update notice. Route new requests through Orca's existing attention rules.
Keep the session ID and call `close_review` when that review ends; CIVIC must stop
only processes started by that session.

For a project Orca manages, offer **Make a work item** on unlinked CIVIC requests.
Read `get_request`, create the item in Orca, and call `link_request` with the
request's `id@version` and the new work reference. If the version is stale, read
the request again before retrying. Agents then use the existing claim, comment
and report-fix tools. Linking changes no review outcome.

Expose `changed_screens` and `coverage` through the gateway for the agent's current
worktree. Show screen, journey and backend coverage together, preserving missing
evidence and the reported limits. Subscribe to `civic://coverage/{project}` when
the owner keeps coverage open; unsubscribe when the view closes. Update notices
replace polling.

No coordinator action resolves a request, accepts a check, or writes an owner
annotation. The owner acts through CIVIC's review UI. Review sessions and links
carry context, never approval.

## Current implementation boundary

The MCP surface includes `changed_screens`, `open_review`, `close_review`,
`coverage`, work-reference links and request filtering. Request and coverage
resources support subscriptions; store file changes produce debounced update
notifications. Unsubscribe when the view closes; stdin end closes all watchers
and reviews owned by that coordinator connection.

Review sessions use `civic preview` and its process identities. A session that
attaches to an existing preview leaves that preview running when closed; another
session's ID cannot close it. The overlay reads the session's work reference on
the server and ignores a reference supplied by the page.

Tagged captures live in the repository's review store, under
`tagged-captures/<project-hash>/<scenario-hash>.json`. Each scenario replaces its
previous capture and records the preview inventory's source fingerprint. Screen
discovery uses only captures matching the current source and reports files with
no rendered tags. Opening a review collects missing captures with one browser
page, visiting scenarios sequentially. This establishes rendered synthetic
coverage, not real-device or deployment acceptance.

## Known limit

The coverage resource announces changes to CIVIC's shared records. A replay saved only inside a running preview updates the backend part of the coverage report when it is read, but does not send a change notice yet; a coordinator that needs it right away reads the resource again.
