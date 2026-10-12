# 0008: Team records sync through a git ref, behind a replaceable remote

- **Status:** Accepted
- **Date:** 2026-10-12
- **Decider:** Founder
- **Builds on:** [0007](0007-review-to-agent-loop.md) (D39)

## Context

Roadmap step 5 asks for real identities, scoped permissions, and versioned shared records, following the spec's [multiplayer boundary](../product-spec.md#multiplayer-and-ownership). D39 put each repository's records in its git common directory, so they were shared by worktrees but not by people. Work requests are already versioned, and `civic.access.json` on the default branch already scopes who may read, write, approve, and resolve. The open question was where a team's records live. There were three options: a git ref on the repository's own remote, a hosted service with sign-in, or deciding later.

## Decision

1. **A git ref now.** Each person's local store syncs with `refs/civic/records` on the repository's remote (`civic sync`). Each sync is one commit holding the records and their captures, with the syncing person in a `Civic-Actor:` trailer. There's no server, no cost, and nothing to repair beyond git. Who can share records at all is decided by who can push to the repository, so the host's access control is the authentication.
2. **Built to be replaced by a hosted service.** Sync talks to a `RecordsRemote` interface: fetch the latest snapshot, list changes since a revision, and publish on top of a base, refused when the remote has moved. A hosted service with sign-in, live sync, and presence can implement the same interface without changing the records, the merge, or the commands.
3. **Nothing is silently overwritten.** A sync merges record by record against the last snapshot it shared. A record changed on one side only takes that side. Comments made on both sides at once are both kept. Any other change made on both sides keeps the shared version and sets this side's aside as a conflict, until a person runs `civic settle --keep mine|theirs`. Keeping your version over a shared one needs the resolve scope.
4. **Every shared change is checked before it's merged.** The person a sync names may change only what they, their agents, or CIVIC's own re-capture wrote, with the scopes the default branch's `civic.access.json` gives them. Nobody deletes a shared record. A sync that breaks this is refused whole, naming the commit, and nothing is merged.

## Consequences

- People and agents now share requests, claims, fixes, and captures across machines. One person per clone is the model: a sync speaks for the person who runs it and their agents.
- The `Civic-Actor:` trailer alone is a claim, not a proof, because anyone who can push could name someone else. Signed syncs close that gap. Each person's Ed25519 public keys are listed in `civic.access.json` on the default branch. Once any key is listed, a shared sync counts only when a key listed for the person it names signs it. The signature covers the snapshot, so a hosted service can carry the same proof or authenticate at sign-in instead.
- Presence, following, and shared driving stay out of scope until there's a live remote.
