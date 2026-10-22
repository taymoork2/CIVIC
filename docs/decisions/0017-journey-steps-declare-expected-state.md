# 0017: A journey declares what must be true after a step, and a recorded run is read against it

- **Status:** Accepted
- **Date:** 2026-10-21
- **Decider:** Owner's request after dogfooding a local app; the shape decided by Claude under the standing rule that Claude decides and records design decisions; the owner may revise it
- **Builds on:** [0009](0009-recorded-runs-as-evidence.md) (a replay is run evidence), [0013](0013-journey-stories-replace-storybook.md) (journey stories)

## Context

Two bugs in a dogfooded app were a label that disagreed with the real state (work held back by a usage limit read "Working") and a toolbar that offered "Add to chat" when a queued message was open. Replay can't see either: it re-drives a recorded run and compares each step with what was recorded, so a run recorded while the label was wrong replays "correctly" forever. What was missing is a statement, made by a person, of what the screen should say.

## Decision

1. **Expectations are a file a team writes, `civic.expectations/0`, by scenario.** Each entry names the scenario a run starts from (as a replay record does), optionally the journey it describes, and steps. A step is chosen by its number in the tape, or by its gesture, its target's name and which one (`nth`), and lists what must be true after it.
2. **Four shapes of expectation, each optionally `absent`.** A control, by `role` and/or exact `name`, and optionally whether it is `disabled`, `pressed`, `selected`, `checked` or `expanded`. A `text`. A `component` marked by the app (D31), with its `state` or `variant`. A `route`. Names and texts match exactly: a label that is nearly right is the bug.
3. **A miss fails with a diff.** It names the step and what was done in words, what was expected, and what the step showed instead (the controls of that role, or those with that name; the texts it had), capped at eight. `civic expect <expectations> <tape>` prints it and exits 1.
4. **A replay that verified can still fail.** `readReplays` takes the expectations and the tapes by hash; the replay's evidence then fails, with the diff in its finding, and reaches the gate as failing evidence, which blocks. Without the tape on hand, the evidence keeps its outcome and says its expectations were not checked, rather than pass quietly.
5. **What a tape can say is what it records.** A step records its headings, dialog and tab names, the controls it offers with their names and states (when recorded with discovery on), the components the app marks, and its route. Arbitrary words on screen are not recorded, so a status like "Waiting" is checkable when it is a heading, a control's name, or a marked component's state or prop. A step with no recorded controls fails a control expectation and says why, never passes. Widening what the recorder keeps would change the engine's tape and every tape's replay (decision 0009), so it isn't done here.

## Consequences

- A team can write the check for the label bug in a line, and keep it as the journey changes.
- Expectations bind to a tape's steps by gesture, not to graph screens, since a replay's only tie to the graph is its starting screen (decision 0009).
- The same matcher can read a crawl's states, since a state lists its controls and texts too. It does not yet.
