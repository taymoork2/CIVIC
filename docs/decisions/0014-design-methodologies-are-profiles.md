# 0014: Design methodologies are profiles over a neutral graph, and Atomic Design is the first one

- **Status:** Accepted (direction for a backlog item; nothing is scheduled)
- **Date:** 2026-10-15
- **Decider:** Founder (question from the founder; the shape decided by Claude under the standing rule that Claude decides and records design decisions; the founder may revise it)
- **Builds on:** [0005](0005-what-civic-is.md) (the gate), [0011](0011-layered-design-libraries.md) (layered libraries, product components, forks), [0013](0013-journey-stories-replace-storybook.md) (stories), the spec's targets ("Primitive" is the term, not "atom")

## Context

The founder asked whether CIVIC can help teams practise [Atomic Design](https://atomicdesign.bradfrost.com/chapter-2/) without making it the only methodology CIVIC supports, since newer or more widely used ones exist and large companies write their own to fit their scale.

Atomic Design names five stages: atoms, molecules, organisms, templates and pages. Its own chapter 2 calls it a mental model rather than a linear process, and its main benefit is moving between the abstract parts and the concrete whole. Its weak spot is that the tier of a part is a judgment call (teams argue whether a card is a molecule or an organism).

What teams use beside it, or instead:

- **Token tiers.** Primitive (reference or global) tokens, semantic (system or alias) tokens, component tokens, now carried in the W3C Design Tokens (DTCG) format CIVIC already imports. Material 3, Fluent 2, Salesforce, Adobe Spectrum and most large systems are built this way.
- **Foundations, components, patterns.** Material, Apple's HIG, Carbon, Polaris and GOV.UK split the system this way, and GOV.UK's patterns are user tasks (ask for an address) rather than sizes.
- **Core, shared and local libraries.** Product teams wrap and extend a core system ([decision 0011](0011-layered-design-libraries.md) already models this lineage).
- **Headless and styled layers.** A behavior library (React Aria, Radix) under a styled one, which is two code libraries in one lineage.
- **Open code, copied in.** shadcn/ui and similar registries distribute components by copying their source into the product, so a copy is the intended way to adopt, not a fork.
- **Object-first and journey-first methods.** OOUX starts from the domain's objects, and CIVIC's own journeys start from tasks; neither is about component size.

CIVIC's graph is already neutral: it records tokens, components with what each contains, product components read once, screens, journeys and runs, and the spec picked "primitive" over "atom" on purpose. What it lacks is a way for a team to say which methodology it follows and have CIVIC check against it.

## Decision

1. **The graph stays methodology-neutral.** No tier names are added to the schema. Tiers, levels and composition are facts the graph already has (what contains what, which tokens reference which), and a methodology is a reading of them.
2. **A methodology is a profile the team declares.** A profile file (`civic.method/0`, data, no code) names the team's tiers in order, maps each to graph targets (by library layer from decision 0011, by an explicit list, or by a tag the owners set), and states its rules: which tiers may contain which, which token tier each kind of target may reference, and which copies are intended distribution rather than forks. A product may declare one profile, several (Atomic for components, token tiers for tokens), or none. An in-house methodology is just another profile, so a company's own vocabulary needs no change to CIVIC.
3. **CIVIC ships Atomic Design as the first bundled profile,** with a token-tier profile and a foundations/components/patterns profile beside it, so no one methodology is the default. With no profile declared, CIVIC runs no methodology checks.
4. **Tier placement is declared, never inferred silently.** A target's tier comes from its owners (point 2). CIVIC may suggest one from composition (a component that contains no other component is a leaf), and the suggestion counts only once a person confirms it, the same way inferred forks are confirmed in decision 0011.
5. **Methodology findings are advisory.** A composition rule broken (a molecule that contains an organism), a component reaching past semantic tokens to a primitive, or a target with no tier is an advisory gate finding with an owner, never a blocking one, because tier boundaries are judgment calls. A team may promote a rule to blocking in `civic.check.json` the way other findings are.
6. **Open-code registries are adoption, not drift.** A profile that names a registry (for example a shadcn `components.json`) turns a copy taken from it into a code instance with that registry as its library provenance, and the drift that matters becomes the copy's distance from the registry version it came from.
7. **Atomic Design's best idea is a view CIVIC already nearly has.** Moving from the part to the whole and back is the design lens, the rebrand blast radius and `civic screen`. Shown in the profile's vocabulary, a screen breaks down into its tiers and a component rolls up to every screen that uses it. Atomic's *pages* stage, a template tested with real content, is what CIVIC's persona runs already do: a run with a long name, an empty list or another locale is the page that tests the template.

Each of these is a comparison, a verdict or a view over the graph, which is the scope rule for what belongs in CIVIC ([roadmap](../roadmap.md#later-not-scheduled)).

## Consequences

- A team that practises Atomic Design gets its vocabulary in CIVIC's views and checks on its composition rules, and a team that doesn't sees nothing new.
- A large company's own methodology fits as a profile, with no change to CIVIC.
- shadcn-style products stop reading as all forks once their profile names the registry.
- Tier arguments stay with the owners: CIVIC never decides a tier and never blocks on one by default.

## Order of building

1. The `civic.method/0` profile format and the Atomic Design and token-tier profiles, with the Card demo declaring Atomic tiers for its library and Shop's product components.
2. The composition and token-tier rules as advisory gate findings.
3. The tier view: `civic screen` and the design lens in the profile's vocabulary.
4. Registry provenance for copied-in code (point 6).
