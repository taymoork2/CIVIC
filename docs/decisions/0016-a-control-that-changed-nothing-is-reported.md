# 0016: A control the crawl took that changed nothing is reported, unless it is a declared no-op

- **Status:** Accepted
- **Date:** 2026-10-21
- **Decider:** Owner's request after dogfooding a local app; the shape decided by Claude under the standing rule that Claude decides and records design decisions; the owner may revise it
- **Builds on:** [0006](0006-deterministic-civic-for-agentic-teams.md) (the crawl, D34), [0015](0015-actions-need-a-way-back.md) (controls the crawl saw)

## Context

A control that does nothing is a bug the unit tests of the code behind it never see: the handler is fine and the button is not wired to it, or the screen is showing a value that no longer follows its state. The crawl takes every allowed link and button and compares the screen afterwards by the hash of its accessibility tree, so it already knows when the tree came back the same.

## Decision

1. **Same tree after the action is a `noEffect` entry in the crawl.** The result lists each action taken from a state that landed on that same state, with its reason.
2. **A write the driver stopped is an effect.** The web driver aborts every request that isn't a GET to the app's own origin, so a button whose job is to POST would look dead only because the crawl wouldn't let it work. The driver counts the writes it aborted since the last action, the observation carries the count, and an action that attempted one is not reported.
3. **No-ops are declared, never guessed.** `NO_EFFECT_OK` names what changes nothing on screen by design: `copy`. `--noop <regex>` (the `noop` option) adds more. A name is matched as whole words, the way blocked names are.
4. **The importer keeps it as a control's outcome, `no-effect`, and the gate reports `control-no-effect`.** It names the screen, the control and its owners, and counts against the controls taken. It is advisory: the crawl sees one path through a fake-data build, so a control that needs a state the crawl didn't reach looks dead, and a person decides.

## Consequences

- A link to the page it is already on is reported too. That is a stale or redundant control, or a link to declare.
- A control that changes only what isn't in the accessibility tree (a colour, a sound) looks dead. The finding says what it saw, so a person can declare it.
