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

This checkout implements work references on records, inheritance when a request
is created, `link_request`, and the `list_requests` work-reference filter.
The other tools, preview-session bridge, and subscribed resources described above
remain required before these three flows can be enabled in Orca.
