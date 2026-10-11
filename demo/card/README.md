# Card demo

The second demo after the [Fluent Button](../fluent-button), from the [component change flow](../../docs/component-change-flow.md) and D29. A product designer changes the design system's Card on the Shop product's Order Summary screen and saves the file. CIVIC reads that file at design time, before anyone writes product code. It forecasts each change on each platform Shop ships on and raises every change as unreviewed drift for the Card's maintainers to decide. It also checks the design for missing states and journey dead ends (D32).

Everything in [`out/`](out) is built by `node build.ts` from the inputs below. The build is deterministic and makes no model calls ([decision 0006](../../docs/decisions/0006-deterministic-civic-for-agentic-teams.md)). `bin/signoff` fails if `out/` doesn't match what the inputs produce.

## What a reviewer sees

| Question | Where to look |
|---|---|
| Can each change be built, and on which platforms? | [`out/raised.overrides.md`](out/raised.overrides.md): one row per change, one column per platform. |
| Who is asked, and who is told? | The same file. The product designer and the Card's maintainers are asked to decide. Design engineering for each platform that needs a library change is told, and so are Shop's engineers and QA. |
| What did the design forget? | [`out/completeness.md`](out/completeness.md): the Card's empty and error states, a dead-end screen, and a screen nothing links to. |
| How are the decisions kept? | [`out/resolved.overrides.md`](out/resolved.overrides.md) and [`out/resolved.graph.json`](out/resolved.graph.json). |
| What is still missing, with owners? | [`out/raised.gaps.md`](out/raised.gaps.md) and [`out/resolved.gaps.md`](out/resolved.gaps.md). |

### The forecasts

The three Fluent Card libraries show the two cases from the change flow. React's `Card` is a flexible library with slots and props. iOS's `CardView` is a brittle, widget-style library: a UIKit view with a title, a subtitle, an icon and a color style. Android's `BasicCard` sits between them: an empty container with one `content` slot and a token class.

| Change in the Shop file | Web | iOS | Android |
|---|---|---|---|
| A price badge swapped into the header action | Supported (`CardHeader` `action` slot) | Needs a library change | Supported (`content` slot) |
| The footer turned on for two actions | Supported (`CardFooter`) | Needs a library change | Supported (`content` slot) |
| The Card made selectable | Supported (`selected` prop) | Needs a library change | Needs a library change |
| A local corner radius of 20 | Forbidden by contract | Forbidden by contract | Forbidden by contract |

The corner radius is forbidden on every platform, even though Android's `basicCardTokens` could technically set one. The contract's `shape-from-token` rule decides, not what the code allows.

### The decisions

[`contract/decisions.json`](contract/decisions.json) holds illustrative Decision records with the demo's placeholder owners. They aren't a real Fluent team's calls. The gate reads them: the three decided overrides don't block, and the undecided one is held by the baseline.

- **Reject** the corner radius. Shop's design reverts it, and the Card reads Awaiting adoption until the file matches.
- **Temporary exception** for the header badge, with a revisit trigger and an expiry date. Web and Android build it, and iOS shows the price in the subtitle.
- **Promote** the footer actions into the system. Shop's footer waits on an iOS library release.
- The **selectable Card** is left undecided on purpose. Its drift stays open, so the design still reads "not yet adoptable".

"Approve as a product adaptation" would need every platform to forecast Supported. None of these changes do, so the demo doesn't use that outcome.

### The completeness check (D32)

Static rules read the design export, the Card contract and the journey's prototype links. They report counts with denominators.

- **Component states.** The contract's `productStates` are loading, empty and error, because their content depends on Shop's data. Shop draws a rest Card and an `Order Summary / Loading` frame, so empty and error are missing: 5 of 7 states are accounted for. Hover, selected and disabled come from the library. An instance can also say it inherits the default for a product state (`inheritsStates`), which counts as an answer.
- **Journey shape.** The page's prototype flow is the Checkout journey, and its starting frame is the entry. Promo applied has no way on, so it's a dead end. Gift options links back to Order Summary, but nothing links to it, so it's unreachable. "Continue to payment" opens a URL, so it stays an unmapped path rather than a dead end.

Accessibility intent isn't checked yet. Which gaps block a release is the project's risk policy, not this check.

Query the graphs yourself:

```sh
bin/civic overrides demo/card/out/raised.graph.json instance:shop.order-summary.card
bin/civic forecast demo/card/out/raised.graph.json override:shop.order-summary.card.header-action
bin/civic completeness demo/card/out/raised.graph.json target:shop.checkout
bin/civic gaps demo/card/out/resolved.graph.json --scope semantic:card
```

## Inputs

| Input | What it is | Read by |
|---|---|---|
| [`contract/card.json`](contract/card.json) | The semantic Card: its variants, states, product states, slots and the `shape-from-token` rule, declared by the design system maintainers | contract |
| [`contract/mappings.json`](contract/mappings.json) | How each platform's Fluent Card expresses the semantic variants, and which public APIs are extension points. Also how the library's Figma Card names its variants, states and properties. Declared by Design Engineering and the maintainers. | every importer checks its names against what it reads |
| [`contract/product.json`](contract/product.json) | Shop: its platforms and owners | product file importer |
| [`sources/`](sources) | Fluent's own files, vendored at pinned revisions with their MIT licences ([`sources.json`](sources/sources.json)): `@fluentui/react-card@9.7.3` types and `useCard`, iOS `CardView.swift`, Android `BasicCard.kt` and `BasicCardTokens.kt` | static source readers ([`importers/src/source.ts`](../../importers/src/source.ts)) |
| [`design/library.figma.json`](design/library.figma.json) | The design system's Card component set, in the shape of a Figma REST file export | `readFigmaLibraryComponent` |
| [`design/shop-checkout.figma.json`](design/shop-checkout.figma.json) | Shop's Checkout page: four frames, a prototype flow, and two Card instances | `readFigmaProductFile` ([`importers/src/figma-product.ts`](../../importers/src/figma-product.ts)) |

### The Figma exports are stand-ins

This environment can't reach Figma, so both design files are small stand-ins written in the shape Figma's REST API returns for `GET /v1/files/:key`. Their names and `version` (`civic-stand-in-1`) say so. That shape includes component property names with their `#id` suffixes, `componentProperties` and `overrides` on instances, `components` and `componentSets` for remote library components, `reactions` for prototype links, and `flowStartingPoints`. There's no Fluent Card in Figma's Community files that matches these names, so the library is an illustration as well. To use real files, export them with a personal access token, then update `library` in `contract/mappings.json` to your library's names. The import fails loudly until every name matches.

```sh
curl -H "X-Figma-Token: $FIGMA_TOKEN" "https://api.figma.com/v1/files/<library-file-key>" > design/library.figma.json
curl -H "X-Figma-Token: $FIGMA_TOKEN" "https://api.figma.com/v1/files/<product-file-key>" > design/shop-checkout.figma.json
```

## How the design file is read

- Each top-level frame on a page is a screen. A frame named `<Screen> / <State>` is a state of that screen, such as `Order Summary / Loading`.
- Each page with a prototype flow is one journey. The journey contains the page's screens and enters at the flow's starting frame.
- A prototype click to another frame is a declared path, named after the layer that was clicked. A click that opens a URL is an unmapped path to that URL.
- Each instance of the library's Card is a component instance. Its variant and state come from the declared options.
- A component property set to anything other than the library default is an override. Properties marked `content`, such as the title text, are how every product fills in a Card, so they never count. A local style on the instance is an override too. A local style with no declared meaning becomes `unmapped.<field>`, so nothing is hidden.
- Any undeclared property, option or frame name fails the import.

## Evidence tiers

Everything here is static analysis. Source reading proves what each library declares, not how it behaves. The design export proves what the file contains, not what ships. `civic gaps` lists the missing run evidence for every platform, with QA as owner. The Fluent Button demo's Playwright harness is the pattern for adding web runs.

## Rebuilding

```sh
node demo/card/build.ts            # rewrite out/ from the inputs
node demo/card/build.ts --check    # what bin/signoff runs
```

To move to a newer Fluent release, update `sources/` and `sources.json` together, then rebuild. A renamed variant or a removed extension point makes the import fail and name the mapping to fix.

Fluent code is © Microsoft Corporation under the MIT licence.
