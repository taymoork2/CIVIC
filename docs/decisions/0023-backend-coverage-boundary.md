# 0023: Backend coverage covers what the app calls, in three tiers, and imports contract verification

- **Status:** Accepted
- **Date:** 2026-11-16
- **Decider:** Owner, 16 Nov 2026, after the Laundry trial; the shape proposed by Claude and approved by the owner
- **Builds on:** [0005](0005-what-civic-is.md) (the quality gate, D28), [0009](0009-recorded-runs-as-evidence.md) (recorded runs as evidence), [0019](0019-review-a-running-app-through-a-proxy.md) (the proxy), D26 (pluggable importers)

## Context

Backend coverage reports the routes, handlers and RPCs each journey's passing replays reach, and the ones no journey reaches. It was built for TanStack Start server functions. The Laundry trial (16 Nov) showed the next gaps: a Convex backend has no derived operation list, so nothing can be called unreached, and passing replays that were never shared make coverage read zero.

The owner's projects are Node with Vite, often with Convex. Other teams run Java, Scala, Go, Python and Rust backends, sometimes as many services. CIVIC must serve both without a parser for every web framework, and without turning into a tracing or project-management tool.

## Decision

1. **CIVIC covers the surface the reviewed app calls.** That is the operations the app invokes directly: server functions, Convex functions and routes, and HTTP, GraphQL or gRPC operations of the APIs it is built against. Service-to-service calls behind that edge are out of scope.
2. **Three tiers of depth:**
   - **Native (Node, Vite, TanStack Start, Convex).** Operations are derived from source by the same scan that finds server functions; Convex functions are recognised by their import from Convex's generated server module, with public and internal functions told apart. The backend runs in process as a synthetic test backend, so reach is exact. Hosted-only behaviour (scheduling, real sign-in, rate limits, load) is reported as not exercised, never as passed.
   - **Contract (any language).** Operations come from the API contract the app is built against: OpenAPI, GraphQL schema, protobuf or AsyncAPI. Reach comes from the requests replays make, captured in the browser or through the proxy, matched to contract operations. Requests that match no operation are reported as outside the contract. When the backend is served by mocks generated from the contract, the evidence is labelled contract only.
   - **Traces (only when a team asks).** Behind-the-edge calls can be imported from OpenTelemetry traces through the importer pattern. Nothing is built for this until a team needs it.
3. **No hand-written operation lists.** Every operation comes from source, a contract file or a generated file.
4. **Each journey step gets a status from evidence:** working (a shared replay reached it and passed), built but not tested (in code, reached by no journey), designed but not built (in the contract, or reachable only through a mock, but not in code), and missing (a step needs it, but neither the contract nor the code has it). Nobody sets these by hand.
5. **Dates and owners stay in the team's tracker.** A step that is designed but not built links to its work item the way requests already do (`{ system, id, url }`), and CIVIC shows the item's status and due date as read from the tracker. CIVIC stores no dates or estimates of its own. It can chart actual progress from its append-only evidence, for example how many of a journey's steps were working each week.
6. **CIVIC reports journey coverage of contracts; it does not reimplement contract testing.** Consumer-driven contract tests (Pact) and schema conformance (Schemathesis, Dredd) are imported as evidence on the same operations, as Playwright reports are. Checking recorded bodies against schemas waits until someone asks, and would be labelled as checked on journey traffic only.
7. **Only shared replays count as coverage.** Sharing stays a person's or CI's step (`civic share-replays`). Passing replays that were recorded but not shared are reported with how to share them, not counted.

## Consequences

- Backend coverage shows inside journey and screen views and in each role's CI check, not on a separate backend screen. Engineering and QA read operations; Design and PM read step statuses.
- A connector or operation source named by a checkout runs or reads that checkout's code, so a connector loads only when the owner trusts its file (`CIVIC_TRUSTED_CONNECTORS`).
- The contract tier gives every backend language the same treatment with one matcher per contract format, at the price of not seeing inside the backend.
- An app whose contract is missing or stale shows many requests outside the contract; that is a finding, not a failure of CIVIC.
