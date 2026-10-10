# CIVIƆ product vision and specification

**Every journey. Every part. One maintainable system.**

CIVIƆ, pronounced and searchable as **CIVIC**, is a unified, cross-platform product system for Design, Engineering, and QA. It connects product intent, design systems, user journeys, platform-specific component libraries, application code, tests, and runtime evidence so teams can build, verify, and maintain coherent experiences.

This document preserves the founding product discussion. It is a product direction and specification, not evidence of implemented functionality.

## Source and decision status

The source is the Amp discussion in [thread T-01a0dc96-9004-70a8-92a7-d7364d854ae1](https://ampcode.com/threads/T-01a0dc96-9004-70a8-92a7-d7364d854ae1). References such as `M1` identify messages in that thread.

| Status | Meaning |
|---|---|
| **Founder decision** | The founder stated or explicitly requested it. |
| **Proposed direction** | Assistant-developed product design that responds to founder requirements. It still requires validation and prioritization. |
| **Project fact** | A repository or project event confirmed by tools. |

### Founder decisions

| ID | Decision or requirement | Source |
|---|---|---|
| D1 | The product name is **CIVIƆ**, pronounced "civic," with a reversed final **Ɔ**. | M1 |
| D2 | CIVIƆ must unify: design system → designed screens → user journey → per-platform component library → screen implementation/code → actual app validation. | M1 |
| D3 | The chain must work top down and in both directions, with each layer remaining in accordance with the others. | M1 |
| D4 | Users need a website or Figma-like canvas for clicking through scenarios and personas, including states that are not otherwise documented. | M1 |
| D5 | Users must highlight, comment on, and annotate experiences in context instead of waiting for changes, recreating them, taking screenshots, and sending feedback back. | M1 |
| D6 | The system should be as easy to build, maintain, run, diagnose, and repair as a Honda Civic or Toyota Corolla, not like a German car engine. | M1 |
| D7 | Design and Engineering are central. Product Management and Leadership/Executives have important roles. | M3 |
| D8 | CIVIƆ is cross-platform and must not be limited to web. | M3 |
| D9 | QA is a primary persona alongside Design and Engineering. | M5 |
| D10 | The model must address bugs, feature requests, accessibility, customer complaints that cause UX/UI changes, composability, platform restrictions and quirks, and component-library coordination with product teams. | M7 |
| D11 | The model must address the mutual dependence between Design, Engineering, and QA. | M9 |
| D12 | The model must work for startups, mid-size companies, and enterprises. | M11 |
| D13 | The product starts as the Amp-hosted `tay/CIVIC` project, followed by a GitHub repository. | M13, M15 |
| D14 | The full discussion must be documented and stored safely. | M25 |
| D15 | The artifact graph is CIVIƆ's core. Rehearsal is one viewer and the first web adapter, and the Fluent 2 Button conflict demo comes before more Laundry work. | [Decision 0004](decisions/0004-graph-first-rehearsal-as-viewer.md) |

### Project facts

- The Amp-hosted project is [tay/CIVIC](https://ampcode.com/@tay/CIVIC).
- The concise README was committed as `f5b9e0f`.
- Creating `taymoork2/CIVIC` on GitHub failed because the available GitHub integration returned `403 Resource not accessible by integration`.
- Amp-hosted projects cannot switch their primary repository to GitHub mode through project settings.

## Core problem

Product intent is scattered across design files, tickets, component libraries, source code, screenshots, chat, and individual memory. Many app states and scenarios are not documented in user journeys. Teams cannot easily answer:

- What does a persona experience in a specific scenario and platform?
- Which journeys, screens, platforms, and products use a component or rule?
- Does the shipped implementation match approved intent?
- What will a design-system or code change affect?
- Where can someone review the complete experience without rebuilding it manually?

Feedback is slow because a reviewer must wait for implementation, reproduce the state, capture a screenshot, explain the context, and pass it back. Context such as persona, data, platform, build, and version is often lost.

## Business idea

CIVIƆ provides a living, connected model of a product. It lets teams explore every important journey and state, review it in context, trace each part across design and implementation, and verify that intended and shipped behavior still agree.

Early positioning: CIVIƆ sits between design tools, component catalogs, product analytics, visual testing, and QA tools. It integrates with them rather than replacing all of them.

Proposed positioning statement:

> CIVIƆ is the living service manual for your product: explore every journey, review every state, trace every part, and verify that design and implementation still agree.

Cross-platform positioning:

> CIVIƆ connects product design and software engineering across every platform, from system-level intent to validated application behavior.

## Cross-platform scope

CIVIƆ models shared intent and platform-native expression. Cross-platform does not mean identical visuals or behavior.

Potential surfaces include:

- Responsive web.
- iOS and iPadOS.
- Android.
- macOS, Windows, and Linux desktop apps.
- Wearables, TV, embedded, and automotive interfaces.
- Voice and conversational interfaces.
- CLI and terminal experiences.
- Spatial interfaces.
- Email, push notifications, and other service touchpoints.

Example: a semantic **Primary Action** may map to a SwiftUI `PrimaryButton`, a Jetpack Compose `PrimaryButton`, a React `Button`, a desktop-native control, a voice intent, or a CLI command. Each must satisfy the same intent while respecting platform conventions.

```diagram
                      ┌──────────────────────┐
                      │ Shared product intent│
                      │ Goal, rule, semantics│
                      └──────────┬───────────┘
                                 │
                    ┌────────────┴────────────┐
                    │ Shared design language  │
                    └────────────┬────────────┘
                                 │
       ┌─────────────┬───────────┼───────────┬─────────────┐
       ▼             ▼           ▼           ▼             ▼
┌────────────┐ ┌───────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐
│ Web/React  │ │ iOS/Swift │ │ Android │ │ Desktop │ │ Other UI │
│ components │ │ components│ │ Compose │ │ native  │ │ surfaces │
└─────┬──────┘ └─────┬─────┘ └────┬────┘ └────┬────┘ └────┬─────┘
      └───────────────┴────────────┼───────────┴────────────┘
                                   ▼
                      ┌────────────────────────┐
                      │ Cross-platform journeys│
                      │ and runtime validation │
                      └────────────────────────┘
```

## Personas

### Primary personas

| Persona | Responsibility | Core question |
|---|---|---|
| **Design** | Experience intent | What should happen? |
| **Engineering** | Implementation integrity | How does it work? |
| **QA** | Evidence | Can we prove it works under every relevant condition? |

**Design** owns design systems, tokens, semantic components, screens, interactions, journeys, responsive and platform behavior, and loading, empty, error, permission, and accessibility states. Design reviews implemented experiences against intent and annotates components, screens, and transitions.

**Engineering** owns platform component libraries, connections between specifications and source, deterministic states and fixtures, dependency and change-impact analysis, runtime instrumentation, and validation of real builds.

**QA** turns journeys and scenarios into coverage across platforms, devices, and environments. QA exercises happy paths, edge cases, failure, and recovery; captures evidence tied to exact state and build; finds undocumented or ambiguous behavior; verifies accessibility and cross-platform outcomes; and separates intentional platform variance from defects. QA participates during design and implementation, not only at the end.

### Supporting personas

**Product Management** defines requirements, business rules, and acceptance criteria; reviews journey and scenario coverage; resolves scope and behavioral ambiguity; and evaluates release readiness with Design, Engineering, and QA.

**Coding agents** are consumers as well as people. An agent retrieves a review item, reproduces its exact state from the link, proposes a fix with its revision and evidence, and hands the item back for a person to verify. The agent has visible attribution and no decision authority of its own. This persona comes from the Rehearsal and Claude Design review-workspace work.

**Leadership and Executives** review product-system health and risk, quality, platform coverage, maintainability, divergence, and release confidence. They can explore intended or shipped experiences without local setup.

```diagram
┌────────────┐      ┌──────────────┐      ┌────────────┐
│   Design   │◀────▶│ Engineering  │◀────▶│     QA     │
│  Intention │      │Implementation│      │  Evidence  │
└─────┬──────┘      └──────┬───────┘      └─────┬──────┘
      │                    │                    │
      └────────────────────┼────────────────────┘
                           ▼
              ┌────────────────────────┐
              │         CIVIƆ          │
              │ Intent                 │
              │ Design systems         │
              │ Journeys and scenarios │
              │ Platform variants      │
              │ Application code       │
              │ Tests and evidence     │
              │ Runtime validation     │
              └───────────┬────────────┘
                          │
                 ┌────────┴────────┐
                 ▼                 ▼
          ┌─────────────┐   ┌────────────┐
          │ Product Mgmt│   │ Leadership │
          │ Scope/rules │   │ Health/risk│
          └─────────────┘   └────────────┘
```

## Three-way Product Contract

Design, Engineering, and QA co-own a versioned **Product Contract** for a capability, journey, or change. It is a continuous three-way contract, not a linear handoff and not only Design's specification.

```diagram
Brittle handoff:

Design ──▶ Engineering ──▶ QA ──▶ Defects ──▶ Rework
```

```diagram
                    ┌───────────────┐
                    │ Shared product│
                    │   contract    │
                    └───────┬───────┘
                            │
               ┌────────────┼────────────┐
               ▼            ▼            ▼
         ┌──────────┐ ┌───────────┐ ┌──────────┐
         │  Design  │ │Engineering│ │    QA    │
         │  Intent  │ │ Mechanism │ │ Evidence │
         └────┬─────┘ └─────┬─────┘ └────┬─────┘
              └─────────────┼─────────────┘
                            ▼
                  Refined shared contract
                            ▼
                     Shipped behavior
                            ▼
                 Runtime/customer evidence
                            └──────▶ Next refinement
```

| Dimension | Primary contribution | Shared responsibility |
|---|---|---|
| User outcome | Design | Engineering and QA challenge feasibility and ambiguity. |
| Interaction behavior | Design | Engineering and QA define constraints and edge cases. |
| Technical contract | Engineering | Design and QA verify it preserves intent. |
| States and transitions | All three | No single discipline owns the complete state model. |
| Platform adaptations | Design and Engineering | QA verifies equivalent outcomes. |
| Acceptance criteria | QA | Design and Engineering confirm meaning and observability. |
| Accessibility | All three | Design intent, engineering semantics, QA evidence. |
| Evidence | QA | Design and Engineering define correctness. |
| Maintainability | Engineering | Design limits exceptions; QA protects behavior. |

A contract is ready only when all three perspectives are represented.

### Reciprocal dependencies

| Persona | Needs from Design | Needs from Engineering | Needs from QA |
|---|---|---|---|
| Design | — | Feasibility, real data and state constraints, performance boundaries, native capabilities, maintainable options, accurate interactive builds | Uncovered states, accessibility evidence, behavioral inconsistencies, risk-based scenario priority, confirmation of intent |
| Engineering | Semantic intent, interaction decisions, content hierarchy, accessibility expectations, alternatives when constraints apply | — | Executable acceptance criteria, reproducible failures, regression protection, platform and environment coverage, refactoring confidence |
| QA | Expected outcomes, visual and interaction rationale, intentional variance, accessibility requirements, ambiguity rules | Controllable fixtures, stable test interfaces, logs and instrumentation, deterministic builds, technical failure details | — |

Each contract can show a **Dependency Triangle** of unresolved needs among the three disciplines.

### Collaboration records

Collaboration uses typed, actionable records instead of passive comments:

- **Ambiguity:** expected behavior is unclear.
- **Constraint:** a technical, platform, business, or policy limit.
- **Coverage gap:** a state, platform, or condition lacks validation.
- **Divergence:** artifacts or shipped behavior disagree.
- **Risk:** a possible harmful or costly outcome.
- **Proposal:** a candidate change.
- **Decision:** an approved direction and rationale.
- **Exception:** a temporary, owned, expiring departure from policy or contract.

Each record identifies the affected contract or scenario, required perspectives, owner, deadline, resolution, and resulting artifact changes.

### Collaboration cycle

1. **Frame together:** start from a shared scenario, not a mockup, ticket, or test case. Design proposes the outcome, Engineering identifies system and platform constraints, and QA identifies ambiguity, risk, and testability.
2. **Model together:** define personas, goals, preconditions, data, states, transitions, happy and failure paths, platform adaptations, accessibility, side effects, and observable success criteria.
3. **Build in parallel:** Design refines interactions and adaptations, Engineering builds components, fixtures, instrumentation, and behavior, and QA prepares scenario suites, accessibility checks, and expected evidence.
4. **Reconcile continuously:** compare intent, designed experience, implementation, and evidence. A disagreement is a **Contract Conflict**, not automatically a bug.
5. **Validate jointly:** Design checks intent, Engineering checks correctness, observability, and maintainability, and QA checks evidence across relevant conditions.

Example scenario:

> Given a returning customer with an expired payment method, when renewal occurs offline, what must they understand and what recovery path must remain available?

### Readiness

Avoid status labels such as "Design complete," "Dev complete," and "Ready for QA." Readiness is inspectable confidence across intent clarity, technical feasibility, scenario coverage, accessibility evidence, platform coverage, and runtime validation. Risk determines the required thresholds.

```diagram
Product Contract: Account Recovery

Intent clarity              █████████░  90%
Technical feasibility       ████████░░  80%
Scenario coverage           ███████░░░  70%
Accessibility evidence      █████░░░░░  50%
Platform coverage           ██████░░░░  60%
Runtime validation          ███░░░░░░░  30%
```

### Evidence integrity

Adopted from Rehearsal. Readiness is only as strong as its evidence:

- Alignment is never stated more strongly than the evidence supports. Missing or old evidence reads as **Unknown / evidence stale**, never as aligned.
- A fixture jump, failed operation, inferred edge, or old screenshot is never runtime evidence.
- Evidence is tied to the exact revision it proves. When the source changes it becomes visibly stale, and it is not relabelled current.
- Evidence tiers stay separate and never collapse into one "complete" badge. The tiers are working preview, design reconciliation, automated browser or simulator checks, and physical-device acceptance.

Shared outcome metrics include undocumented-state reduction, escaped regressions, time from ambiguity to decision, cross-platform contract coverage, accessibility-evidence coverage, design and implementation divergence, reusable-component adoption, defect reproduction and validation time, and recurrence of customer problems.

## Artifact graph and traceability

CIVIƆ is an artifact graph, not only a canvas or web preview.

```diagram
Intent
  ├── Requirement
  ├── Business rule
  └── Accessibility rule
          │
          ▼
Design language
  ├── Token
  ├── Semantic component
  └── Interaction pattern
          │
          ▼
Experience
  ├── Persona
  ├── Scenario
  ├── Journey
  ├── Screen or surface
  └── State and transition
          │
          ▼
Implementation
  ├── Web
  ├── iOS
  ├── Android
  ├── Desktop
  └── Other platform adapters
          │
          ▼
Evidence
  ├── Build
  ├── Test
  ├── Screenshot or recording
  ├── Accessibility result
  └── Runtime behavior
```

Core entity groups:

- **Intent:** requirement, business rule, accessibility rule.
- **Design language:** token, semantic component, interaction pattern.
- **Experience:** persona, scenario, journey, screen or surface, state, transition.
- **Contract and governance:** Product Contract, decision, constraint, divergence, conflict, exception, risk, Product Change Record, signal, problem.
- **Implementation:** platform component, adapter, source mapping, app code, build, fixture, instrumentation.
- **Evidence:** acceptance criterion, test, scenario suite, screenshot, recording, log, accessibility result, runtime behavior, waiver.
- **Change and adoption:** product adoption, migration contract, compatibility, version, rollout, deprecation.
- **Organization:** organization, business unit, portfolio, product, platform, team, owner, shared system, policy.

Traceability works in both directions:

- **Forward:** token → component → screen → journey → code → runtime validation.
- **Reverse:** a runtime mismatch traces to implementation, specification, and source component.
- **Relationship view:** Button → variant → screens → journeys → code → tests → runtime instances.

The graph answers which journeys and platforms a change affects, which platform states are missing, whether a difference is intentional, and whether shipped behavior still matches the documented system.

### Stable identity and path honesty

Adopted from Rehearsal:

- Every journey, state, screen, component, primitive, token, and platform variant has a stable identity. When a target disappears or moves, its identity history is kept and someone re-anchors it explicitly. Nothing is matched automatically to the nearest node, because that would manufacture evidence or approval.
- States connect through labelled actions and conditions, with branches, return paths, subflows, and alternate outcomes.
- **Declared**, **proposed**, and **observed** paths stay distinct. An observed path comes only from a confirmed runtime transition. Back and loops create repeat visits, and a failed operation never becomes a successful edge.
- A runtime state that matches no known node stays visibly unmapped.
- An incomplete registry never claims exhaustive coverage.

## Journeys, scenarios, and contextual feedback

### Journey canvas

The journey canvas shows personas and goals, happy and alternate routes, loading, empty, error, offline, and permission states, entry and exit points, platform variants, business rules, and branches.

The canvas is one view over the artifact graph, not the product's core. Rehearsal proved this layout on a real app, and CIVIƆ keeps it as the reference design:

- **One persistent canvas** with selection, zoom, and contextual panels. Explore, play, and review are capabilities on that canvas, not separate destinations.
- Flows and the main path run left to right like a timeline, and alternate branches stack below with labelled reconnecting arrows. Navigation order, declared transitions, and verified runtime transitions look different.
- Inactive screens show cached snapshots that carry their revision or fixture provenance. Only the focused screen runs live.
- An outline follows the app's own entry, tab, and navigation order and tracks what the camera shows. Selecting a flow fits the flow, and selecting a screen focuses it.

### Scenario player

The scenario player lets a reviewer choose persona, journey, scenario, platform, and state or edge case. It plays the intended experience without waiting for production or manually recreating data.

Example: New customer → iPhone → poor connection → payment declined.

Adopted from Rehearsal:

- **Play is the default.** Inspect and edit are optional.
- Persona, permission, and condition are separate dimensions. A persona never implies a permission or rule.
- **Scenario inputs** and **presentation inputs** behave differently. Scenario inputs are persona, access, condition, and step, and changing one reloads the fixture. Presentation inputs are viewport, theme, and text size, and they apply live.
- A **fixture jump** to a state is labelled as a jump and is never presented as a replay of the steps before it. Replay from start is a separate capability.
- A live run survives browsing, panel changes, and proposal switches. Anything that would discard an unsaved draft asks first.
- Inputs are captured at confirmed transitions from an allowlist, exactly as entered. Credentials and raw keystrokes are never captured.

### Contextual review

Highlights, comments, annotations, and typed collaboration records attach to components, screens, transitions, journey branches, persona and scenario combinations, and design and implementation discrepancies. Feedback keeps state, platform, build, version, and ownership automatically. Exact-scenario links remove screenshot archaeology.

Adopted from Rehearsal:

- Feedback freezes its capture before it is written. The capture includes the screenshot, anchor, visible state, captured inputs, source and design revisions, and an exact-scenario link.
- Retries keep the original capture and request identity.
- Resolving feedback requires evidence. Items move from **Open** to **Fix ready for review** to **Resolved**, and a queue filtered by status lives in the inspector rather than on its own screen.
- An exact-scenario link restores the step, the scenario and presentation inputs, and the open item.
- On a narrow screen, the preview comes first. Journey, context, and notes open as sheets.
- Staleness against the current source is recomputed when feedback is read, while the original receipt stays unchanged.

## Change management

### Product Change Record

Bugs, feature requests, complaints, accessibility findings, and platform gaps are connected product evidence, not unrelated tickets. A **Product Change Record** is a traceable proposal to change product intent, implementation, validation, or all three.

```diagram
┌───────────────────────────────────────────────────────────┐
│                      Incoming signals                     │
│ Bug · Feature · Complaint · Accessibility · Platform gap │
└────────────────────────────┬──────────────────────────────┘
                             ▼
                 ┌────────────────────────┐
                 │ Product Change Record  │
                 │ Problem · Evidence     │
                 │ Impact · Ownership     │
                 │ Decision · Resolution  │
                 └───────────┬────────────┘
                             ▼
       ┌─────────────────────┼─────────────────────┐
       ▼                     ▼                     ▼
┌────────────┐       ┌───────────────┐       ┌────────────┐
│   Intent   │       │Implementations│       │ Validation │
│ UX/rules   │       │ Per platform  │       │Tests/proof │
└────────────┘       └───────────────┘       └────────────┘
```

CIVIƆ is not another ticket tracker. Jira, Linear, GitHub, support systems, and accessibility tools can execute work; CIVIƆ maintains the product knowledge graph and lifecycle that connects them.

### Proposal, decision, adoption, verification

Adopted from Rehearsal. These are four separate records, never one "done" flag:

1. **Proposal:** a target, scope (journey, screen, component, primitive, or token), baseline and candidate revisions, rationale, author, and expected behavior. A candidate can be played on the real experience as a reversible change. Testing a candidate is not adopting it.
2. **Decision:** the exact approved candidate and the platform variants it covers.
3. **Adoption:** the link from a decision to the implementation revision that carries it.
4. **Verification:** independent evidence per tier and platform that the adopted change behaves as decided.

### Bugs

A bug is a verified discrepancy between expected and observed behavior. It links the persona, journey, scenario, state, expected artifact, build, platform, device, environment, implementation, fixture or state snapshot, evidence, affected versions, regression tests, and final verification.

| Classification | Meaning |
|---|---|
| Implementation defect | Code violates documented intent. |
| Design defect | Documented behavior is harmful or incomplete. |
| Specification gap | Expected behavior was never defined. |
| System defect | A shared token or component causes widespread failure. |
| Platform defect | An OS or framework condition causes failure. |
| Environment or data defect | Code is correct, but dependencies or data are not. |

Each bug exposes its blast radius across screens, journeys, platforms, and products.

### Feature requests

A feature request begins as a capability proposal, not a predetermined UI. It records the user problem and outcome, personas, journeys, evidence, business objectives and constraints, proposed capabilities, platform coverage, accessibility, component changes, acceptance criteria, validation, rollout, and compatibility.

```diagram
Capability proposal
       │
       ├──▶ Journey and UX changes
       ├──▶ Design-system changes
       ├──▶ Platform implementations
       ├──▶ Product-team adoption
       ├──▶ Test and accessibility coverage
       └──▶ Runtime success measures
```

### Customer complaints and UX/UI feedback

Complaints are signals, not immediate requirements or defects. Related signals become an **Experience Problem**, such as: "Customers cannot tell whether a payment is still processing."

An Experience Problem links original reports and support conversations, customer segments, journey and platform distribution, frequency, severity, analytics, design rationale, related bugs or requests, candidate interventions, and post-change outcomes.

Classifications are usability problem, missing capability, accessibility barrier, performance perception, content or terminology issue, platform inconsistency, product education problem, misunderstood expected behavior, and isolated preference. CIVIƆ preserves customer evidence while letting Design choose the response.

### Durable lifecycle

```diagram
Signal
  ▼
Problem
  ▼
Decision
  ▼
Contract
  ▼
Implementation
  ▼
Product adoption
  ▼
Validation evidence
  ▼
Runtime/customer outcomes
  └──────────────────────▶ New signals
```

## Accessibility

Accessibility is a first-class constraint and continuous validation dimension, not a final checklist. Requirements attach to semantic components, interaction patterns, screens, journeys, platform implementations, content, localization, tests, and runtime evidence.

| Layer | Content |
|---|---|
| Policy | WCAG target, organization standards, platform human-interface requirements, legal and contractual obligations. |
| Specification | Roles, labels, descriptions, focus order, keyboard, switch, and assistive navigation, contrast, text scaling, reduced motion, announcements, target sizes, error identification and recovery. |
| Evidence | Automated results, manual review, screen-reader recordings, keyboard traces, device validation, and waivers with owner, rationale, scope, and expiration. |

Design specifies intent, Engineering implements semantics, and QA provides evidence. Policy violations can carry mandatory severity and block release approval. Accessibility support is not a premium feature.

## Platform restrictions and quirks

Every cross-platform artifact records:

1. **Invariant intent:** what remains true everywhere.
2. **Native adaptation:** how each platform expresses it.
3. **Restriction:** what the platform cannot support.
4. **Fallback:** the approved alternative.
5. **Evidence:** proof that the adaptation still meets intent.

```diagram
Semantic capability: Confirm a destructive action
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
     Web           iOS/iPadOS       Android
 Modal/dialog    Confirmation      Platform-native
 or inline undo  dialog/action     dialog or undo
        │              │              │
        └──────────────┴──────────────┘
             Same safety outcome;
             different native behavior
```

Differences are classified as platform convention, technical limitation, form factor or input method, temporary implementation gap, intentional product differentiation, or unapproved divergence.

### Alignment states

Adopted from Rehearsal. Every contract target per platform has exactly one alignment state:

| State | Meaning |
|---|---|
| **Aligned** | Every dimension is proven by current evidence. |
| **Approved adaptation** | A recorded decision accepts a platform-native difference that preserves intent. |
| **Accepted limitation** | A recorded decision accepts a constraint, with user impact, alternative, and revisit condition. |
| **Unreviewed drift** | Artifacts or behavior disagree, and no decision covers it yet. |
| **Awaiting adoption** | A decision is approved, but the implementation has not adopted it. |
| **Unknown / evidence stale** | Evidence is missing or no longer matches the current revision. |

A library or platform restriction is a reason to ask for a decision, not an implicit approval. Drift stays **Unreviewed drift** until an owner accepts a specific adaptation or limitation.

## Component system

### Semantic and platform implementations

- **Semantic component:** platform-independent purpose and contract.
- **Platform component:** React, SwiftUI, Jetpack Compose, native desktop, or other implementation.
- **Product adoption:** how a product consumes, configures, and rolls out the component.

```diagram
┌──────────────────────┐
│ Semantic component   │
│ Contract and intent  │
└──────────┬───────────┘
           │
  ┌────────┼────────┬──────────┐
  ▼        ▼        ▼          ▼
 Web      iOS     Android    Desktop
  └────────┴────────┴──────────┘
           ▼
┌──────────────────────┐
│ Product integrations │
│ Adoption and rollout │
└──────────────────────┘
```

Lifecycle statuses are tracked separately: proposed, contract approved, designed, implemented per platform, validated per platform, available for adoption, partially adopted, fully adopted, deprecated, and removed. A component is not done merely because one library published it.

### Composability

A component contract defines purpose, semantic role, inputs, outputs, events, state ownership, supported content and layout ranges, extension points, valid composition, forbidden combinations, accessibility, platform mappings, versioning, and compatibility.

Composability is measured through content, layout, behavioral, styling, and state flexibility, semantic stability, and platform adaptability.

Warning signs include boolean-prop explosions, product logic inside system components, copied or forked components, undocumented overrides, one-off platform APIs, nested components fighting over state, single-use components, and frequent downstream patching.

### Adoption and migrations

Every shared-system change has a **migration contract** covering the reason, affected products and usages, compatible versions, breaking status, codemods or automated migration, visual and behavioral changes, required product-team work, validation, owner, deadline, deprecation policy, and temporary exceptions.

| Product | Platform | Current version | Compatibility | Owner | Validation | Status |
|---|---|---:|---|---|---|---|
| Consumer App | iOS | 4.2 | Migration required | Mobile team | Partial | In progress |
| Consumer App | Android | 4.3 | Compatible | Mobile team | Passed | Adopted |
| Admin | Web | 3.8 | Breaking | Admin team | Not run | Blocked |

Product teams can accept a migration, request clarification, report unsupported use, propose a contract extension, request an exception, attach evidence, or report a system defect. Adoption is a feedback loop, not a one-way design-system mandate.

## Company scale

CIVIƆ uses one product model with progressive governance. It scales by increasing coordination, assurance, and governance, not by replacing its core workflow.

| Scale | Primary need | Product mode | Value |
|---|---|---|---|
| Startup | Shared understanding | Minimal setup, lightweight contracts, automatic capture, one journey map, flexible roles, few required fields, optional approvals | Build quickly without undocumented behavior or accidental complexity becoming tomorrow's architecture. |
| Mid-size | Coordinated autonomy | Formal ownership, dependency graphs, semantic contracts and platform implementations, versioned releases, adoption and migrations, impact analysis, readiness policies, portfolio coverage | Keep autonomous teams aligned without making the design system a bottleneck. |
| Enterprise | Federated assurance | Federated domains, inherited policies, multiple brands and systems, local extensions, risk-based approvals, immutable audit, residency and retention, SSO, SCIM, RBAC, ABAC, supplier access, private deployment | Establish organization-wide confidence without forcing one stack or removing local autonomy. |

```diagram
┌───────────────────────────────────────────────┐
│ Enterprise layer                              │
│ Federation · Compliance · Audit · Policy      │
├───────────────────────────────────────────────┤
│ Coordination layer                            │
│ Ownership · Dependencies · Versions · Adoption│
├───────────────────────────────────────────────┤
│ Universal CIVIƆ core                          │
│ Contracts · Journeys · Components · Evidence  │
└───────────────────────────────────────────────┘
```

Governance follows risk, not company size alone. Risk factors include user harm, financial impact, data sensitivity, regulation, reversibility, platform reach, dependency blast radius, and customer exposure.

| Risk | Expected process |
|---|---|
| Low | Contract plus automated checks. |
| Moderate | Cross-discipline review and validation evidence. |
| High | Explicit Design, Engineering, and QA approval. |
| Critical | Segregated approval, complete traceability, and audit retention. |

Progressive triggers:

- A second team adds ownership boundaries.
- Multiple implementations add semantic contracts.
- A shared dependency adds adoption tracking.
- A breaking change adds a migration contract.
- Regulated behavior adds evidence retention.
- Autonomous business units add federation.
- Repeated exceptions trigger policy or contract revision.

```diagram
Shared understanding
        ▼
Coordinated autonomy
        ▼
Federated assurance
```

## Multiplayer and ownership

Adopted from Rehearsal's multiplayer boundary:

- **Shared:** proposals, observations, decisions, status, immutable captures, and verification evidence.
- **Private by default:** camera, selection, the running session, entered drafts, persona and fixture experiments, and unsent comments.
- Shared records need real identities, attribution, and scoped read, write, approve, and resolve permissions.
- Writes carry expected versions, and conflicts are visible and recoverable. Last write wins must never silently overwrite a candidate or evidence.
- No collaborator's navigation can discard another person's draft.
- Presence, following, and shared driving are optional. Each needs an explicit driver and explicit join, leave, and rejoin.

## Maintainability principles

The founder's metaphor is a 200,000-mile Honda Civic or Toyota Corolla: easy to build, maintain, run for a long time, diagnose, and repair with readily available parts. CIVIƆ avoids systems that require a specialist every time a warning light appears.

Principles:

- Use a small set of standardized primitives.
- Keep interfaces stable and parts interchangeable.
- Make dependencies explicit.
- Prefer predictable behavior.
- Favor repairability over cleverness.
- Support long lifecycles and incremental upgrades instead of rewrites.
- Make systems inspectable rather than opaque.
- Add only necessary parts, and keep them standardized and replaceable.

A proposed **Maintainability Index** considers component reuse, undocumented screens and states, design and code divergence, one-off styling, dependency complexity, test and journey coverage, accessibility consistency, and obsolete variants.

## MVP

The strongest entry point is an interactive journey registry generated from a product's component library and application, with scenario switching and contextual annotation.

The MVP must be platform-neutral from the first release:

1. Artifact graph for intent, components, screens, states, and journeys.
2. Persona and scenario modeling.
3. Journey canvas and scenario player.
4. Contextual annotations and exact-scenario links.
5. Platform variants and documented intentional differences.
6. Source and build linkage.
7. Impact and coverage reporting.
8. Initial adapters for React, SwiftUI, and Jetpack Compose.

The earlier web-first idea of importing a web app or Storybook is superseded by D8. Native support must not be retrofitted later.

Rehearsal already covers items 3 and 4, and part of item 6, for one web app. The other items are built CIVIƆ-first, in the order given in [decision 0004](decisions/0004-graph-first-rehearsal-as-viewer.md).

## Integrations

CIVIƆ connects to design and prototyping tools, token systems, web and native component catalogs, source repositories, CI and build systems, device and browser testing, visual regression and accessibility tools, requirements and issue trackers, analytics, and observability tools.

## Target customers

Initial candidates are:

- Teams maintaining substantial, long-lived products across web and native platforms.
- Design-system teams supporting multiple products or platforms.
- Agencies handing products to clients.
- Regulated organizations that need traceability and evidence.
- Distributed teams with expensive design-review loops.

Likely users include designers, engineers, QA, product managers, and stakeholders who review without local setup.

## Business model

CIVIƆ is proposed as B2B SaaS. Pricing should charge for scale, administration, assurance, and infrastructure, not accessibility support or basic QA capabilities. Casual reviewers should not be charged.

| Plan | Proposed contents |
|---|---|
| Starter or Team | Core contracts, journey canvas, source connections, comments, basic integrations, small-team limits, per-editor pricing, unlimited reviewers. |
| Team or Organization | Multiple products and platforms, shared systems, ownership and dependencies, adoption and migrations, advanced validation, analytics, governance, SSO. |
| Enterprise | Federation, SSO, SCIM, granular access, compliance and audit, data residency and retention, supplier access, private networking or deployment, approvals, and support. |
| Services | Import, normalization, and implementation support for existing systems. |

No dollar prices were proposed.

## Demo design system

CIVIƆ will use Microsoft Fluent 2 as its first public demo design system. See [decision 0001](decisions/0001-fluent-2-demo-design-system.md).

Design-token import and export are expected future requirements. The platform-neutral token model should support standard formats such as DTCG and tools such as Tokens Studio and Style Dictionary.

## Open questions

- Which customer segment and platform pair should the first pilot prove?
- Which design, source, and test systems are required for the first integration set?
- How should scenario fixtures be created for each supported platform?
- What minimum evidence makes a Product Contract ready for low- and high-risk changes?
- How should CIVIƆ create and link the GitHub repository once integration permissions allow it?
