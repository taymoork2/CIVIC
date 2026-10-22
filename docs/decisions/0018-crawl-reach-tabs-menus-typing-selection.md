# 0018: The crawl reaches tabs, menu items, typed fields and selected text, under the same safety rules

- **Status:** Accepted
- **Date:** 2026-10-21
- **Decider:** Owner's request after dogfooding a local app; the shape decided by Claude under the standing rule that Claude decides and records design decisions; the owner may revise it
- **Builds on:** [0006](0006-deterministic-civic-for-agentic-teams.md) (the crawl, D34), [0016](0016-a-control-that-changed-nothing-is-reported.md)

## Context

The crawl acted only on links and buttons. A tab, an item in a menu, a search field and a passage of selected text each lead to states a link-and-button crawl never sees: the toolbar a selection raises (a citation flow) lives behind a text selection, and a menu's items exist in the accessibility tree only once its button has opened it.

## Decision

1. **Four more kinds of action.** A `tab` and a `menuitem` are clicked like buttons; the tab that is already selected is skipped. A menu's items appear in the state its trigger button leads to, so they are found there with no new rule. A `textbox` is typed into. A `text` selects a passage.
2. **Typing is allowlisted, and never submits.** A field is an action only when `--input` gave its label a value; one with no value is left alone and isn't reported as unreached, since leaving a field empty is not a failure to act. Typing fills the field and observes what the app does, such as results filtering, without submitting. Values stay out of states, as before. A field already holding its value is not filled again, since filling moves focus and drops a text selection.
3. **Selection is declared, not guessed.** `--select <text>` names a passage; the web driver offers it as an action where the page shows it, outside any link, button, field or tab, and selects it with a triple click, as a person would, then waits a moment for the selection change to be announced. The crawl never chooses what to select.
4. **The safety rules are unchanged and apply to every new action.** Names matching a destructive word are blocked, whether a menu item or a passage. The web driver still aborts every non-GET request and every request to another origin. The limits on states and depth still stop the crawl and say so.
5. **Typing and selecting are not "nothing happened" candidates** (decision 0016). Typed text is left out of a state, and most passages offer nothing when selected.

## Consequences

- A flow that starts with a selection can be crawled and its resulting controls recorded, and checked against an expectation (decision 0017) once the matcher reads crawl states.
- The native driver is unchanged: it offers only what it did.
- Each new action multiplies the states a crawl may reach, so the existing `--max-states` and `--max-depth` matter more; a crawl that wants reach should lower the depth first.
