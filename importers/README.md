# CIVIC importers

Importers read what each role's tools already produce and turn it into [CIVIC graph](../graph) records ([onboarding and ingestion](../docs/onboarding-and-ingestion.md), D27). Each importer is a plain function from a tool's output to records and links. Supporting a new tool means adding an importer; the schema doesn't change. Importers have no runtime dependencies and make no model calls ([decision 0006](../docs/decisions/0006-deterministic-civic-for-agentic-teams.md)). A test enforces both.

| Importer | Reads | Produces |
|---|---|---|
| `readFigmaComponentSet` | A Figma file export (`GET /v1/files/:key`), one component set's variant options | `design-export` evidence and the semantic variants the kit draws |
| `readDtcgTokens` | A DTCG tokens file | Token records keyed by DTCG path |
| `readPlatformComponent` | A declared variant mapping plus facts from platform source | A platform component, its extension points, `source-analysis` evidence and an `implements` link |
| Source readers (`source.ts`) | TypeScript declarations, compiled JS, Swift and Kotlin | Narrow facts: a prop's union, an enum's cases and deprecations, defaults, public members, tokens per style arm |
| `readPlaywrightReport` | Playwright's JSON reporter output | `automated` evidence for each test that names CIVIC IDs in a `civic.subject` annotation |
| `compareDesignKit` | A design kit and the same platform's component | Open, unclassified Contract Conflicts, one per variant they disagree on |
| `applyDecisions` | People's recorded decisions | Conflicts classified and resolved inline, until roadmap step 3 adds Decision records |
| `assemble` | Fragments from the importers above | One graph document in a stable order |

## Rules every importer follows

- **Declared, then checked.** People declare mappings, such as "Compose `TextButton` is the Subtle variant". Importers check every declared name against what they read and fail when it's missing or deprecated. They never guess a mapping.
- **Nothing hidden.** A native variant no mapping uses becomes `extraVariants` on the platform component, and a missing equivalent is recorded as `none`.
- **Honest tiers.** Reading source, tokens or a design file is `static-analysis` evidence. Only a run, such as a Playwright test, is `automated`, and a test that didn't pass is a `fail`.
- **Pinned.** Every record carries the tool, importer, exact revision and, for files, a content hash.
- **Deterministic.** The same inputs give byte-identical output.

The [Fluent Button demo](../demo/fluent-button) uses every importer here.

```sh
cd importers
pnpm install --frozen-lockfile
pnpm run check   # types, including the demo build script
pnpm test        # readers, importers, boundary and demo-output tests
```
