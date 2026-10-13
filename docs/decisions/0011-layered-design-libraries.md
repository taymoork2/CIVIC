# 0011: Design and code libraries are layered, and components are matched by published identity

- **Status:** Accepted
- **Date:** 2026-10-13
- **Decider:** Founder (decided by Claude under the standing rule that Claude decides and records design decisions; the founder may revise it)
- **Builds on:** [0005](0005-what-civic-is.md), [0007](0007-review-to-agent-loop.md) (D36), D29 ([component change flow](../component-change-flow.md))

## Context

Teams that design in Figma, or in a tool with shared libraries such as Penpot or Sketch, usually split design across three kinds of file:

1. **A design system file.** Tokens (Figma variables and styles), foundations and guidance. It may publish styles and variables.
2. **A component library file.** The design system's components drawn as Figma components, published as a library. It consumes the design system file.
3. **A product file.** The product team's screens. It consumes both, and often publishes its own shared components (product patterns built from library components) or forks a library component when the library can't do what the product needs.

What CIVIC has today:

- **The semantic contract is not a Figma file.** Variants, states, slots and forbidden overrides live in `contract/*.json` beside the code, owned by design system maintainers ([Card demo](../../demo/card/contract)). Tokens come in as DTCG (`importers/src/dtcg.ts`) or CSS custom properties (`css-tokens.ts`), because the Figma Variables REST API needs Enterprise access (roadmap step 2).
- **One library file and one product file.** `readFigmaLibraryComponent` reads a component set's options and property defaults from the library file. `readFigmaProductFile` reads the product's screens, prototype paths, and each instance of that component set with its overrides. The forecast (D29), drift, decisions and the library-default check (`compareLibraryDefaults`) run on what those two produce. The Card demo runs on Fluent's real web and iOS kits.
- **Releases and lines.** `civic release` checks a code library release against product overrides. Design files are lines and drafts (D36), and any tool's file can be one through `civic.design/0`.

What it doesn't do:

- **It matches by name.** `setNameOf` in `figma-product.ts` resolves an instance to a component set by the set's name. Two libraries with a `Card` collide, and a product's own local `Card` counts as the library's. Figma exports already carry the published `key` and `remote` flag of every component an instance uses; CIVIC ignores them.
- **Only one library per product read.** A product that uses the component library and its own shared library can't say which instance came from which.
- **No product-level components.** A product's shared `Order summary card` that wraps a library Card is read only where it is placed, so the same overrides are counted once per placement and nobody sees it is one component.
- **Detaches and forks are invisible.** The schema has `change: 'detach'` and the forecast treats it as a fork, but no importer emits it. A detached instance is a plain frame in a REST export, with no trace of where it came from.
- **No framework.** A platform component names its platform (`web`, `ios`, `android`, `desktop`) and package, but not its framework. A React and an Angular implementation of Card are both `web`, and the forecast (`graph/src/forecast.ts`) looks for an extension point among all of a platform's components, so a slot that only React has makes the override Supported for an Angular product too.
- **Products don't declare which code libraries they use.** The product manifest lists platforms, not the packages and versions it builds with, so the forecast and `civic release` can't say which implementation a product's code depends on.
- **Code instances aren't read.** The schema allows `origin: 'code'` instances, but no importer reads a product's code for uses of a library component, its props and slots, or wrappers and copies of it.
- **No design library versions.** The library file's version is recorded on its evidence, but nothing says which version a product file uses or what a library publish changes for each product.

## Decision

1. **Design files form a lineage.** Each design file CIVIC reads is declared with a layer (`design-system`, `component-library` or `product`; free text, so a team can add its own, such as a product's shared library) and the files it consumes, by tool and file key. The layer is a role, not a file count: one file may be both the design system and the component library, which is how the Fluent kits are built. This applies to Figma exports and to `civic.design/0` alike, so Penpot or Sketch libraries fit the same shape.
2. **Components are identified by their published key, not their name.** A library mapping names the component set's key in its library file (the name stays, for people to read). The product importer follows each instance's `componentId` to the file's `components` entry, takes its `key` and `remote` flag, and maps it to the library that published that key. Instances are recorded with that provenance (library file, component key). An instance of a key no consumed library publishes is a finding, not a guess. Matching by name stays only as a declared fallback for exports without keys, and is reported as weaker evidence.
3. **The semantic contract stays CIVIC's.** The design system file is evidence for tokens and guidance, not the contract's source of truth. Tokens keep coming in as DTCG or another export; where a team can read Figma variables, they are one more token source. Each layer's maintainers own their layer: the design system file's maintainers own the contract, the component library's design engineers own the library mapping, and the product team owns its file.
4. **A product's shared component is read once.** When the product file defines its own component, the library instances inside it are read at the definition, with their overrides, and each placement is recorded as an instance of that product component. A change to the shared component shows every screen that places it, and its overrides are counted once.
5. **A fork is drift, and it is never inferred silently.** A fork is a library component the product no longer uses as an instance: a detached instance, or a local component copied from one. Figma's plugin API reports where a detached frame came from (`detachedInfo`); the REST export does not. So:
   - With the Figma plugin ([later](../roadmap.md#later-not-scheduled)), a detach is read directly and recorded as an override with `change: 'detach'` on an instance of the component it came from.
   - Without it, CIVIC compares local components and frames with the consumed libraries' components by name and structure, and records a match as an **inferred** fork that a person confirms, the same way crawled states are confirmed (D34).
   - A confirmed fork goes through the existing D29 flow: forecast (a fork is never expressed by an extension point), owners asked and told, and a decision. Promoting it into the library is the usual way out.
6. **Code follows the same lineage.** Each code library is one implementation of the semantic contract, named by platform and **framework** (React, Angular, Vue, Web Components, SwiftUI, UIKit, Compose, Android Views and so on; free text). A platform component records its framework, and a product declares the code libraries it builds with, by package and version range, per platform. The forecast answers per platform and framework the product ships with, so an Angular product never borrows React's slots. Two frameworks on one platform get two answers, never merged, as platforms are today.
7. **Product code is read like the product file.** A code importer reads a product's uses of a library component (package and symbol, from imports, not names), the props and slots it sets, and the product's own wrappers and copies. Each use is a `code` instance on the screen it renders on, so design and code instances of the same screen can be compared. A wrapper is the code twin of a product shared component (read once, placements as instances). A copied or vendored component is a code fork: drift with an owner, found by import provenance, with a person confirming any inferred match.
8. **A library publish is a design release.** When a consumed library file gets a new version, CIVIC re-reads every product file that consumes it against the new keys and defaults, as `civic release` does for code: removed keys orphan instances, changed defaults re-run the forecast and the library-default check, and each affected product's owners are told.

## Consequences

- The Card demo keeps working with no new files: its stand-in product file already carries `key` and `remote` for each component, and the Fluent kit is one file in both the design system and component library roles.
- Two libraries with the same component names, and a product's local copy of a library component, no longer get confused.
- Forks are visible as drift with an owner instead of disappearing into plain frames, which is the composability warning sign the spec asks CIVIC to measure.
- A team with React and Angular libraries sees which one blocks an override, and a library release names the products that build with it.
- Detecting a detach exactly needs the Figma plugin. Until a team that designs in Figma uses CIVIC, forks are found by an inferred match and a person's confirmation.

## Order of building

1. Match design instances by published key and record each instance's library provenance; declare layers and consumed files in the product manifest. Add a second, product-level library to the Card demo's stand-in file.
2. Product shared components read once, placements as instances.
3. Framework on platform components, the product's declared code libraries, and the forecast per framework. A second web framework for the Card demo shows two answers on one platform.
4. A product code importer for React first (imports, props, slots, wrappers), then inferred forks in design and code with confirmations, then design library releases.
5. Exact detaches through the Figma plugin, when it is scheduled.
