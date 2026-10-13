# 0009: The engine's tape stays the recording; a replay of it is CIVIC evidence

- **Status:** Proposed
- **Date:** 2026-10-13
- **Decider:** Founder
- **Builds on:** [0006](0006-deterministic-civic-for-agentic-teams.md) (D30), [0007](0007-review-to-agent-loop.md) (D35)

## Context

Roadmap step 6 said to record journeys with Playwright's own tooling (Codegen, the reporter API, traces) rather than build a recorder. The journey engine built one anyway, and the v7 and v11 handoffs made it the canvas's way of recording and replaying live runs. Account switches, offline steps and viewport changes are all steps on the same tape. The order of work asks whether that tape becomes CIVIC's recording record.

What the tape is today (`packages/canvas/src/runtime-bridge.ts`, `packages/shell/server/review-recording.mjs`):

- It is `{ version, project, source, seed, now, initialRoute, steps[] }`. Each step holds a gesture, the route, field values, a view of the screen and the operations the app made. Targets are accessible names with an index, never selectors.
- Replay refuses a tape whose project, source fingerprint, seed or clock differs from the running app. It re-drives each gesture and compares the whole step. The first mismatch stops it with "Replay diverged at step N". A full pass returns the count of verified steps. It makes no model calls, so it meets D30 and step 6's "stop visibly on a miss".
- Saved tapes are local files in the worktree's `.review-data/runs/`. They hold synthetic data only, with a placeholder for credentials, and secret-looking keys are refused.

What it isn't: a CIVIC record. It has no stable ID, owner, git revision or line, no subjects in the graph, and no stored outcome. Nothing in CIVIC reads it.

There were three options:

- **The tape becomes a CIVIC record kind.** This gives every graph a second, engine-shaped schema and couples CIVIC's schema to the engine's internals.
- **Playwright's tooling replaces the tape**, as step 6 first said. This drops account switching, offline recovery and the run journal, which Playwright traces don't model, and throws away working, tested code.
- **The tape stays the engine's recording, and its replay becomes evidence.** This is the one decided below.

## Decision

1. **The tape stays the engine's format, owned by `@civic/canvas`.** CIVIC's schema doesn't copy it. Other recorders, such as Playwright traces or a native runner, can produce evidence the same way without becoming graph records either.
2. **A replay of a saved tape is run evidence.** An importer reads a replay result as `Evidence` with method `runtime`. It passes when every step verified and fails at the step that diverged, naming that step. Its subjects are the graph's screens the tape visited, matched by route through the project's journey index, never by name. Its source revision is the git commit it was replayed at. The tape's own content hash goes in `contentHash`, and its source fingerprint goes in the finding.
3. **Only a person or CI writes it** (D35). An agent may replay a tape and report a fix, but the evidence comes from CIVIC's own re-capture, as with any other run.
4. **Tapes are shared by reference, not copied into the graph.** A shared tape lives beside the review records it belongs to, under `refs/civic/records` ([0008](0008-team-records-on-a-git-ref.md)), and the evidence names it by content hash.
5. **Step 6's text changes.** For live runs, the engine's recorder is CIVIC's recorder. Playwright stays the source of test evidence (D26) and of the crawl's web driver.

## Consequences

- Recorded runs reach the gate, `civic screen` and the Contract panel as ordinary passing or failing evidence. They also go stale under the same freshness rule, because their revision is a commit.
- A failed or cancelled operation can't become a successful edge. Replay compares each step's operations, so a run whose save failed diverges on that step.
- Nothing about the tape's format is frozen by CIVIC. Changing it means changing only the importer.
- Still to build: the importer, sharing tapes through `civic sync`, and a `civic replay` that runs the saved tapes for a revision, as signoff does for tests.
