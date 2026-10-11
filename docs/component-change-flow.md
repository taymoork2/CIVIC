# A design-system component changed by a product team

Proposal, 2026-10-11. This walks one scenario through CIVIC as described in [decision 0005](decisions/0005-what-civic-is.md) and [onboarding and ingestion](onboarding-and-ingestion.md). None of it is built. Today the spec has the building blocks: semantic and platform components, a composability contract with extension points, alignment states, and migration contracts. The journey canvas models only Laundry screens.

## The scenario

1. Design system maintainers own a **Card** (the semantic component, with its design in the library file).
2. Design engineers build Card into the component library on each platform (the platform components).
3. A product designer changes Card to fit their product's use case and saves it in their design tool.
4. Product engineers would normally discover the problem at implementation time. CIVIC's job is to surface it when the design is saved instead.

## What the graph needs to know

| Entity | Owner | Example |
|---|---|---|
| Semantic component and its contract | Design system maintainers (Design) | Card: purpose, slots, variants, states, accessibility |
| Platform component and its **extension points** | Design engineering | React Card exposes `media`, `header`, `actions` slots and a `density` prop; the iOS Card exposes only `title`, `body`, `style` |
| **Component instance** on a screen | Product team | The Card on the product's Order Summary screen, in two journeys |
| **Override** on an instance | Whoever made it | Added a price badge in the header, changed the corner radius |

Extension points are read from code by the importer: props, slots, style APIs, and documented theming hooks. Overrides are read from the design file, from detached instances, changed properties, and local styles on a library component. These two lists are the core of the check. For each override, CIVIC asks whether the target platform's library offers a supported way to express it.

**Recommendation:** add Component instance, Override, and Extension point to the graph schema in roadmap step 1, next to Semantic and Platform component.

## How the change flows

### 1. The designer saves the change (design time, not implementation time)

The design importer runs when the file version is saved or a design branch is opened for review, and it finds the overrides on the Card instance. For each override and each platform the product ships on, CIVIC computes a **feasibility forecast**:

| Forecast | Meaning |
|---|---|
| **Supported** | Maps to an extension point that exists today, such as a slot, prop, or token. |
| **Needs a library change** | No extension point exists. It needs design engineering work and a library release. |
| **Forbidden by contract** | It breaks a rule in the semantic contract, such as a forbidden combination, an accessibility rule, or a removed state. |

The same override can get a different forecast on each platform. A header badge may be Supported on web (there's a `header` slot) and Needs a library change on iOS (the brittle widget-style API). CIVIC shows each platform separately and never merges them into one answer.

### 2. CIVIC raises it to the right people (section 4d of the onboarding plan)

- **Asked:** the product designer, who made the change, and the design system maintainers, who own Card's contract.
- **Told:** design engineering for each platform marked Needs a library change, and the product team's engineers and QA, because the affected journeys change.
- **Shown:** every screen and journey where this Card instance appears, with the proposed and current Card side by side on the canvas.

The designer is never blocked from saving. The design is marked **Unreviewed drift** against the system, and the product's readiness shows "design not yet adoptable" until a decision exists.

### 3. The maintainers decide

They have four outcomes, each recorded as a Decision on the Card's contract:

| Decision | When | What follows |
|---|---|---|
| **Reject** | It breaks the system's intent | The designer is asked to revert or rework, and the drift record stays open until the design matches. |
| **Approve as a product adaptation** | Every target platform forecasts Supported | The override is allowed for this product only, as an Approved adaptation. Engineering builds it with existing props and slots. |
| **Promote into the system** | Useful beyond this product, or repeated by other teams | A proposal goes to design engineering for a new variant, slot, or prop. It comes with a migration contract and a release. The product team's work shows Awaiting adoption until the release lands. |
| **Temporary exception** | The product can't wait for a release | An owned, expiring exception with a revisit trigger ("Card 4.2 ships `header` on iOS"). Any local workaround is tracked so it can be removed. |

### 4. Implementation and evidence

Product engineers build against a decided record, not a guess. QA gets the affected journeys and states as coverage targets. The record closes only when evidence arrives: the product screen renders the approved Card on each platform, and any library release is adopted.

## The four cases

| Case | What CIVIC does |
|---|---|
| **Brittle, widget-style library** (few extension points) | Most overrides forecast Needs a library change. The cost is visible at design time: which platforms, which release, and who owns it. The choice becomes reject, promote, or exception, not a surprise during implementation. |
| **Flexible library** (slots, props, theming) | Most overrides forecast Supported. Being technically possible is not approval: whether it needs a maintainer's sign-off is set by policy and risk (spec, Company scale). Low-risk changes can be auto-approved with a record. |
| **Change made without maintainer approval** | Saved changes are still imported, and an unapproved override is Unreviewed drift. Nothing is hidden or reverted automatically. It's raised to the designer and the maintainers right away, and the product can't reach "ready" until it's decided. |
| **Catching it early** | The forecast runs when the design is saved, using the library's current extension points and release plan. Breaking changes are visible before any product code is written, and repeated overrides across teams signal that a variant should be promoted. |

## Why this keeps the system healthy

- Design system maintainers see every local change to their components across products, with the reason, instead of finding forks later.
- Design engineers get demand-driven input: which extension points are missing, on which platforms, and how often teams hit them. That measures the spec's composability warning signs (forked components, undocumented overrides, frequent downstream patching).
- Product teams know the cost of a design choice before they commit to it.
- The variance budget shows how many approved product adaptations each component carries. When it grows, CIVIC prompts promotion or a contract revision ("repeated exceptions trigger policy or contract revision").
