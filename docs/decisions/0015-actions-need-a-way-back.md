# 0015: An action that makes or starts something needs a way back, and a missing one is advisory

- **Status:** Accepted
- **Date:** 2026-10-21
- **Decider:** Owner's request after dogfooding a local app; the shape decided by Claude under the standing rule that Claude decides and records design decisions; the owner may revise it
- **Builds on:** [0014](0014-design-methodologies-are-profiles.md) (the object map, point 8), [0006](0006-deterministic-civic-for-agentic-teams.md) (the crawl, D30, D34)

## Context

A dogfooded app shipped "Add project" with no "Remove project": a person could make a project and never get rid of it. It had unit and browser tests, and none of them asked the question, because a test checks what someone thought to write down. The object map already knows each object's calls to action, and the crawl already records the destructive controls it refuses to take. The two together can ask, for any app, whether everything that can be made can be unmade.

## Decision

1. **An action has a kind, and some kinds need an inverse.** An object's action may declare `kind` (`add`, `remove`, `archive`, `send`, `start`, `pin`, `open`, `connect`, `install`, `sign-in`, `enable` and their opposites). The bundled pairs are: add needs remove or archive; archive needs restore; send or queue needs cancel or edit; start needs stop; pin needs unpin; open needs close; connect needs disconnect; install needs uninstall; sign in needs sign out; enable needs disable. The check is directional: a "remove" with no "add" is not a finding, since what it removes may come from elsewhere.
2. **Kinds are declared, so the check works in any language.** Only when an action declares no kind does CIVIC read its title's words, from a bundled English list. A project extends both in `civic.check.json`: `actions.labels` maps its words to kinds (`"ta bort": "remove"`) and `actions.inverses` replaces what a kind needs (`"start": ["pause"]`). The ORCA grid declares a kind in brackets, `Add project [add]`.
3. **Declared or seen both count.** The inverse may be an action of the object, or a control the crawl saw on a screen a person confirmed shows the object. A control the crawl blocked as destructive counts: "Remove project" was never clicked, but it proves the app offers it. The crawl importer keeps every control it saw on a screen (`controls`, with its outcome `taken`, `blocked` or `unreached`), and a control seen with a kind that needs an inverse is checked too, even when the grid never listed it. A suggested tie doesn't count until a person confirms it, like every other tie.
4. **One-way is a recorded decision, never a silent skip.** An action marked `oneWay` names the decision that made it so and its reason, and is then not a finding. It still counts in the check's denominator.
5. **The finding, `object-action-no-inverse`, is advisory by default.** It goes to the object's Design owners. It is advisory because the bundled words are a heuristic, a crawl can't see every screen, some one-way actions are right (a permanent record, a sent email), and the gate's blocking list is for findings that wait on a decision already owed. A team that has declared its kinds promotes it in `blocking`. The gate counts it against what was checked, such as 1 of 4 actions.

## Consequences

- A missing "Remove project" is reported without anyone writing a test for it, and a queued message's send, cancel and edit pass.
- A control credits every object its screen shows. Where a screen shows several objects, the object's own actions are the exact record; this errs toward missing a finding, not toward a false one.
- Observed `open` and `connect` controls are checked too, so an app full of "Open" links will see advisory findings until its owners declare which ones are navigation. That is the cost of not guessing which controls matter.
