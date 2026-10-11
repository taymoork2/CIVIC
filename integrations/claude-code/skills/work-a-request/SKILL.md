---
description: Work a CIVIC work request end to end. Use when asked to pick up, fix or report on a CIVIC request or annotation, or when the session starts with open CIVIC requests.
---

CIVIC work requests are review notes a person handed to agents. You act for that person, who is accountable for what you write. CIVIC makes no model calls; you do the work, CIVIC tracks it and checks it.

1. **Choose.** Call `list_requests` with `cwd` set to the worktree you are working in. Pick an Open or Reopened request.
2. **Claim.** Call `claim`. If someone else holds it, pick another; never work a request someone else claimed. Claims are leases, so claim again to renew on long work.
3. **Read.** Call `get_request`. Look at every frozen capture, the anchors (target IDs, locator), where it was seen, and the acceptance checks. Pass `graph` when the request names contract IDs, to get the `civic context` export.
4. **Reproduce.** Start your worktree's preview and open each URL from `repro`. Annotations anchor by `data-civic-id` and exact role and name: keep those stable, and add `data-civic-id` where the contract export lists IDs to put in code.
5. **Fix.** Make the smallest change that does what the request asks. If the ask changes intent or behavior and is unclear, `comment` with your question instead of guessing.
6. **Commit, then report.** Commit on your line, then call `report_fix` with your preview URL and a one-line note. CIVIC re-captures the scenario on that preview. In the Auto lane it resolves or reopens the request; otherwise a person reviews the before and after.
7. **Never resolve.** You can't resolve, accept checks or change a lane. If you add a check with `add_check`, it counts only once a person accepts it.

If the tools are missing, the plugin can't find CIVIC: ask the person to set `CIVIC_HOME` to a CIVIC checkout.
