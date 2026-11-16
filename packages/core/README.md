# @civic/core

Pure durable-machine decisions shared by CIVIC's runtime packages. `initial`
rejects startup effects. `decide` rejects executable effects and accepts emitted
intents only through a caller's closed-union predicate. No intents are allowed
by default. The caller owns validation, authorization and persistence.

`commit` reads and persists, retrying once on a classified conflict. The persist
callback must compare the version read with the stored version inside its
transaction. Other failures propagate immediately.

`@civic/core/testing` checks static analysis, serialization and shortest paths,
including declared event coverage and terminal refusal. Its replay helper globs
JSON fixtures containing `events` and `expected`, with optional `input` or a
restored `state` and `context`. Graph exploration is bounded by XState's traversal
limit and the supplied event representatives; it is not exhaustive payload proof.
