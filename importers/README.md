# CIVIC importers

Importers read what each role's tools already produce and turn it into [CIVIC graph](../graph) records ([onboarding and ingestion](../docs/onboarding-and-ingestion.md), D27). Each importer is a plain function from a tool's output to records and links. Supporting a new tool means adding an importer; the schema doesn't change. Importers have no runtime dependencies and make no model calls ([decision 0006](../docs/decisions/0006-deterministic-civic-for-agentic-teams.md)). A test enforces both.

| Importer | Reads | Produces |
|---|---|---|
| `readFigmaComponentSet` | A Figma file export (`GET /v1/files/:key`), one component set's variant options, or for a kit drawn before Figma variants, the components named `<Option> / <State>` in one frame | `design-export` evidence and the semantic variants the kit draws |
| `readFigmaLibraryComponent` | A design system library's Figma export: one component set's variant and state options and its property defaults | `design-export` evidence and the defaults an instance is compared with |
| `readFigmaProductFile` | A product team's Figma export: frames, prototype links and flow starting points, and instances of the library component, matched by its published key (by name only when the mapping has no key, reported as weaker). With the product's declared lineage, every other placed component is traced to a consumed library | Screens and state targets, a journey with its entry, declared `navigates` and `contains` links, component instances with their state and library provenance, overrides, and a failing finding for a component from no consumed library |
| `readPublishedComponents` | A library's Figma export | The key and name of every component set and standalone component the file publishes |
| `readDtcgTokens` | A DTCG tokens file | Token records keyed by DTCG path |
| `readCssTokens`, `compareCssTokens` | Stylesheets' custom properties for the default theme, design and code | Token records for the names both set, and an open Contract Conflict for each set differently |
| `readComponentFamilies`, `findWebComponents` | A component contract's "Component families" Markdown table, and web source | Semantic components, and Platform components for web components exported under a family's name, with inferred `implements` links |
| `readPlatformComponent` | A declared variant mapping plus facts from platform source | A platform component, its extension points, `source-analysis` evidence and an `implements` link |
| Source readers (`source.ts`) | TypeScript declarations, compiled JS, Swift and Kotlin | Narrow facts: a prop's union, an enum's cases and deprecations, defaults, public members, tokens per style arm |
| `readPlaywrightReport` | Playwright's JSON reporter output | `automated` evidence for each test that names CIVIC IDs in a `civic.subject` annotation. A `civic.method` annotation (such as `storybook`) and a `civic.source` of `<path>#<anchor>` (such as a story file and story ID) say how and where the test observed them. For a suite with no annotations, `subjectsFor` takes the subjects from the project's own declared mapping. |
| `CivicReporter` (`playwright-reporter.ts`, roadmap step 10) | A Playwright run, as a reporter beside the suite's own | The same evidence as `readPlaywrightReport`, written as a `civic.run/0` file (`output`) that `readCivicRun` reads back. With `graph`, the end of the run prints what it covered compared with that graph: subjects that now fail that passed, subjects that now pass, and the expected subjects it left uncovered (expected screens, and every subject the graph's run evidence on that platform covers) with their QA owners. The revision comes from `revision`, the `civic.revision` metadata, or the git commit, marked `+uncommitted` on a dirty tree. The Button demo's web suite uses it. |
| `readJourneyIndex` | The journey engine's review index (`GET /api/review/index`): scenarios, their journeys, declared paths, the cross-route actions found in source, and each scenario's checks | An expected screen per scenario, a journey (or, for a catalog of specimens, a surface) that contains them, declared `navigates` links with route and source anchor, and the targets each check file is declared to cover |
| `readCoverageContract` | The journey engine's coverage contract (`coverage.json`): the screens, interactions and journeys a project declares, with their expected scenarios | An expected target per expectation, and an open Coverage gap collaboration record for each one no scenario shows, whose scenario isn't in the index, or that no passing run covers |
| `readRenderReceipt` | A design system's source-render receipt (Open Design's `source-reference/receipt.json`): each case is one screen rendered from the app's own components at a viewport, theme and text scale, with the hash of its reference image | A `civic.design/0` file: one frame per case on a page per screen, fingerprinted by the reference image and render settings, naming the targets it designs; `civic design` and `civic draft` register it as a design line |
| `readReplays` | The journey engine's replays of recorded runs (`civic.replay/0`, kept by the review server in `.review-data/replays/`): the tape by content hash, the commit and source, and whether every step verified | `runtime` run evidence about the screen the run starts from, one per tape from its latest replay, passing or failing at the step that diverged ([decision 0009](../docs/decisions/0009-recorded-runs-as-evidence.md)) |
| `readCrawl` | A crawl from CIVIC's crawl loop (`civic.crawl/0`, D34) | A discovered screen per state and a proposed `navigates` link per transition; neither counts until confirmed |
| `applyConfirmations` | A person's confirmation file (`civic.confirmations/0`) | Confirmed screens made expected, confirmed paths declared, and declared journeys over confirmed screens; confirming what the crawl didn't find fails |
| `compareDesignKit` | A design kit and the same platform's component | Open, unclassified Contract Conflicts, one per variant they disagree on |
| `compareLibraryDefaults` | A library component's facts and each platform component with its extension points | Open, unclassified Contract Conflicts, one per platform and per content the library shows by default that the platform has no extension point for |
| `raiseOverrideDrift` | A product's overrides on a library component | Open, unclassified Contract Conflicts in Unreviewed drift, one per override, asking its maker and the contract's design owners |
| `applyDecisions` | A decision file (`civic.decisions/0`): proposals, decisions, adoptions and verifications | The raised graph with those records added. A conflict the import no longer raises is settled when its decision was adopted, and its records are left out (`settledConflicts` lists them); a decision on a conflict that vanished without an adoption fails |
| `assemble` | Fragments from the importers above | One graph document in a stable order |

## Rules every importer follows

- **Declared, then checked.** People declare mappings, such as "Compose `TextButton` is the Subtle variant". Importers check every declared name against what they read and fail when it's missing or deprecated. They never guess a mapping.
- **Nothing hidden.** A native variant no mapping uses becomes `extraVariants` on the platform component, and a missing equivalent is recorded as `none`.
- **Honest tiers.** Reading source, tokens or a design file is `static-analysis` evidence. Only a run, such as a Playwright test, is `automated`, and a test that didn't pass is a `fail`.
- **Pinned.** Every record carries the tool, importer, exact revision and, for files, a content hash.
- **Deterministic.** The same inputs give byte-identical output.

The [Fluent Button demo](../demo/fluent-button), the [Card demo](../demo/card) and [Laundry's graph](../projects/laundry) and the [discovery example](../projects/discovery-app) use the importers here.

```sh
cd importers
pnpm install --frozen-lockfile
pnpm run check   # types, including the demo and project build scripts
pnpm test        # readers, importers, boundary and demo-output tests
```
