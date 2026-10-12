# Fluent Button conflict demo

Roadmap step 2, from [decision 0001](../../docs/decisions/0001-fluent-2-demo-design-system.md): one semantic Button across Fluent's web, iOS and Android libraries. The real Android Figma kit disagrees with Compose, and CIVIC raises that as a Contract Conflict. The conflict is classified, given owners and resolved, and the decision stays in the graph.

Everything in [`out/`](out) is built by `node build.ts` from the inputs below. The build is deterministic and makes no model calls ([decision 0006](../../docs/decisions/0006-deterministic-civic-for-agentic-teams.md)). `bin/signoff` fails if `out/` doesn't match what the inputs produce.

## What a reviewer sees

| Question | Where to look |
|---|---|
| What disagrees? | [`out/raised.gaps.md`](out/raised.gaps.md): Compose's `ButtonStyle` has `Button`, `OutlinedButton` and `TextButton`, and the Android kit draws only Primary and Text buttons. Brand outline exists in code with no design. The iOS kit draws Accent, Outline accent, Outline and Subtle, so iOS's Danger and Transparent neutral buttons have no design either. |
| Why does it matter? | [`out/raised.context.android.brand-outline.md`](out/raised.context.android.brand-outline.md): the work order an Android engineer gets. It shows the open conflict, both sides' evidence, and that nothing on Android has run evidence yet. |
| Who must act? | Both files name owners: Design for the kit and Design Engineering for the Compose library. |
| How is the decision kept? | [`out/resolved.context.android.brand-outline.md`](out/resolved.context.android.brand-outline.md) and [`out/resolved.graph.json`](out/resolved.graph.json): a Decision record classifies the kit as an outdated design source and decides the conflict as a design update, with its evidence and the trigger for revisiting it. |

The two graphs are the same import before and after the Decision record in [`contract/decisions.json`](contract/decisions.json). The conflicts are real; the decisions are illustrations with the demo's placeholder owners. It is not a real Fluent team's call. `civic check` fails on the raised graph. On the resolved graph all three are decided: the Android kit and the iOS kit each gain the button they don't draw (Brand outline, Danger), and Transparent neutral stays an iOS-only button. Record your own call with `civic decide` ([graph README](../../graph/README.md#decisions)) and rebuild.

Query the graphs yourself:

```sh
node graph/src/cli.ts gaps demo/fluent-button/out/raised.graph.json
node graph/src/cli.ts context demo/fluent-button/out/raised.graph.json semantic:button --platform android --variant brand-outline
node graph/src/cli.ts context demo/fluent-button/out/resolved.graph.json semantic:button --platform web --json
```

## Inputs

| Input | What it is | Read by |
|---|---|---|
| [`contract/button.json`](contract/button.json) | The semantic Button and its intents, declared by Design | contract |
| [`contract/mappings.json`](contract/mappings.json) | Decision 0001's variant table: which native variant and Figma option express each semantic variant, and which public APIs are extension points. Declared by Design Engineering. | every importer checks its names against what it reads |
| [`sources/`](sources) | Fluent's own files, vendored at pinned revisions with their MIT licences ([`sources.json`](sources/sources.json)): React v9 Button types, defaults and styles; iOS `Button.swift` and `ButtonTokenSet.swift`; Android `Button.kt` and `ButtonTokens.kt` | static source readers ([`importers/src/source.ts`](../../importers/src/source.ts)) |
| [`tokens/fluent-web-light.tokens.json`](tokens/fluent-web-light.tokens.json) | Fluent's web light theme as DTCG, exported from `@fluentui/tokens` by [`web/export-tokens.mjs`](web/export-tokens.mjs) | DTCG importer |
| [`design/android-kit.figma.json`](design/android-kit.figma.json) | The real [Microsoft Fluent Android](https://www.figma.com/community/file/836835062056249539/microsoft-fluent-android) kit's Buttons frame, from a Figma REST file export (`GET /v1/files/:key`) trimmed by [`design/trim.ts`](design/trim.ts) | Figma file importer |
| [`design/ios-kit.figma.json`](design/ios-kit.figma.json) | The real Microsoft Fluent 2 iOS Community kit's Button component set, exported and trimmed the same way | Figma file importer |
| [`sources/react-button-stories/`](sources/react-button-stories) | Fluent's own Button stories at the tag `@fluentui/react-button_v9.11.1`, the release of the vendored types | built into Storybook by [`web/`](web) |
| [`evidence/playwright-report.json`](evidence/playwright-report.json) | A Playwright JSON report from rendering Fluent React v9 Buttons, in CIVIC's harness and in Fluent's stories, in Chromium ([`web/`](web)) | Playwright report importer |

### The Figma exports

Each design kit in `designKits` is its own Figma file, read from `design/<kit id>.figma.json`.

`design/android-kit.figma.json` comes from the Microsoft Fluent Android Community file, duplicated to a draft and exported on 2026-10-11 with a read-only personal access token. Its `version` is the draft's Figma version. The full export is about 6.7 MB of artwork, so [`design/trim.ts`](design/trim.ts) keeps only the file's identity and the path to the Buttons frame, in Figma's own shape. The importer reads the trimmed file and the full export the same way.

The kit was drawn before Figma had variants. It has no Button component set: each option is a component named like `01. Primary / ⚪️ B. Pressed - Light`, grouped in a Buttons frame. `componentFrame` in [`contract/mappings.json`](contract/mappings.json) tells the importer to read it that way. The kit draws only Primary and Text buttons, each as Default, Pressed and Disabled, in Light and Dark.

`design/ios-kit.figma.json` comes from the Microsoft Fluent 2 iOS Community file, exported on 2026-10-12 (Figma version 2409334717272340147). The full export is about 147 MB, and the trim keeps only the path to the Button component set. That set uses variants: Style is Accent, Outline accent, Subtle or Outline, with Size (Large, Medium, Small) and State (Rest, Pressed, Focus, Disabled), 48 components in all. Fluent iOS code also has Danger and Transparent neutral buttons, which the kit doesn't draw, so CIVIC raises both as conflicts. Nobody has decided them yet, so they stay open in both graphs.

To refresh a kit, export your own duplicate and trim it by kit id:

```sh
curl -H "X-Figma-Token: $FIGMA_TOKEN" "https://api.figma.com/v1/files/<your-file-key>" -o full-export.json
node demo/fluent-button/design/trim.ts ios-kit full-export.json > demo/fluent-button/design/ios-kit.figma.json
node demo/fluent-button/build.ts
```

If a kit renames its frame, set or options, update `designKits` in `contract/mappings.json`. The import fails loudly until the names match.

## Evidence tiers

- **Web** has automated evidence: 13 Playwright checks render every mapped appearance and check its accessible name, its rest background against the DTCG token value, the default appearance, and disabled versus `disabledFocusable` focus. They run against `@fluentui/react-components@9.74.9`, which resolves `@fluentui/react-button@9.11.1`, the same version as the vendored types.
- **Web also has Storybook evidence**: 13 more Playwright checks open Fluent's own Button stories, the ones Fluent publishes in its Storybook, vendored at the pinned release in [`sources/react-button-stories/`](sources/react-button-stories) and built with Storybook 8 ([`web/.storybook/`](web/.storybook)). They check that the Appearance story shows every mapped appearance with an accessible name and on its rest token, that the Default story renders the neutral default, and that the Disabled story's `disabled` and `disabledFocusable` buttons behave as the contract says. Each test carries `civic.method: storybook` and the story ID, so it becomes `storybook` evidence anchored to that story. The harness checks what CIVIC's mapping declares; the stories check that Fluent's own examples agree.
- **iOS and Android** have static analysis only: variants, defaults, public API and background tokens read from source. That proves what the source declares, never how it behaves, and `civic gaps` lists the missing run evidence with QA as owner. Native captures need a Mac runner and an Android device runner (decision 0001's evidence plan).

## Rebuilding

```sh
node demo/fluent-button/build.ts            # rewrite out/ from the inputs
node demo/fluent-button/build.ts --check    # what bin/signoff runs

cd demo/fluent-button/web
pnpm install --frozen-lockfile
pnpm run tokens            # re-export DTCG tokens from @fluentui/tokens
pnpm run evidence          # bundle the harness, build Fluent's stories in Storybook, run the Playwright checks
pnpm run evidence:record   # same, and rewrite evidence/playwright-report.json
```

Playwright needs Chromium (`pnpm exec playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_PATH` to an existing build). To move to a newer Fluent release, update `sources/` and `sources.json` together. Then rebuild. A renamed or removed variant makes the import fail and name the mapping to fix.

Fluent code is © Microsoft Corporation under the MIT licence. Figma Community kits are CC BY 4.0; the kit excerpts in `design/` are from Microsoft's [Microsoft Fluent Android](https://www.figma.com/community/file/836835062056249539/microsoft-fluent-android) and Microsoft Fluent 2 iOS Community files.
