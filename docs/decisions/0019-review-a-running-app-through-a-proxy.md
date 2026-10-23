# 0019: A running app is reviewed through a loopback proxy that adds the overlay

- **Status:** Accepted
- **Date:** 2026-10-22
- **Decider:** Owner's request to review a connected app's branch by commenting on its screens; the shape decided by Claude under the standing rule that Claude decides and records design decisions; the owner may revise it
- **Builds on:** [0007](0007-review-to-agent-loop.md) (the capture overlay, D40; records, D39)

## Context

The capture overlay needs its script tag in the page. An app's own dev build can add it, as Example's does, but a connected app's source is read-only to CIVIC, and asking its authors for a dev-only tag per app doesn't scale. The owner wants to open one link to an app's branch, comment on its screens, and have those comments land on that branch and revision.

## Decision

1. **CIVIC proxies; the app is untouched.** `civic review-app --upstream <url>` serves any loopback http app on a second loopback port. The proxy adds the overlay's script tag to the HTML it returns and passes everything else, WebSockets included, through byte for byte. It serves only loopback callers and proxies only a loopback app, so it adds no network exposure.
2. **CIVIC doesn't start the app.** Each app has its own launcher, its own ports and its own sign-in. The reviewer starts it, gives it the proxy's origin where it checks origins (`--port` fixes the proxy's port beforehand), and gives CIVIC its address.
3. **The preview is registered on the checkout's line.** The command registers the proxy as the preview of the checkout it runs from, so annotations land on that line at that revision (D36). A detached copy of a branch's head may be filed under the branch's name with `--branch`, only when the copy is at that branch's head. A checkout with uncommitted changes is refused, because its revision wouldn't describe what is on screen. Stopping the command removes the preview, so another app later given the same port isn't taken for it.
4. **Records go where the checkout's store is.** Annotations and captures are written to the repository's store and nothing is committed to a branch. This decision first put the store in the git common directory (D39); [0020](0020-records-live-in-the-civic-folder.md) moved it to `.civic/`.

## Consequences

- Any app that serves HTML on loopback can be reviewed without changing it. Annotations made on it are anchored by the page's `data-civic-id` where the app has any, and by role, accessible name or test ID otherwise.
- The screenshot is rendered from the page's DOM with scripts off, so a screen that draws only with scripts (a canvas, say) is captured without that drawing.
- A redirect to the app's own address leaves the proxy. An app that checks the browser's origin, as a sign-in or a WebSocket origin check does, must be told the proxy's origin.
