# Card demo

The second demo after the [Fluent Button](../fluent-button), from the [component change flow](../../docs/component-change-flow.md) and D29. A product designer changes the design system's Card on the Shop product's Order Summary screen and saves the file. CIVIC reads that file at design time, before anyone writes product code. It forecasts each change on each platform Shop ships on and raises every change as unreviewed drift for the Card's maintainers to decide. It also checks the design for missing states and journey dead ends (D32).

Everything in [`out/`](out) is built by `node build.ts` from the inputs below. The build is deterministic and makes no model calls ([decision 0006](../../docs/decisions/0006-deterministic-civic-for-agentic-teams.md)). `bin/signoff` fails if `out/` doesn't match what the inputs produce.

## What a reviewer sees

| Question | Where to look |
|---|---|
| Can each change be built, and on which platforms? | [`out/raised.overrides.md`](out/raised.overrides.md): one row per change, one column per platform. |
| Who is asked, and who is told? | The same file. The product designer and the Card's maintainers are asked to decide. Design engineering for each platform that needs a library change is told, and so are Shop's engineers and QA. |
| What did the design forget? | [`out/completeness.md`](out/completeness.md): the Card's loading, empty and error states, a dead-end screen, and a screen nothing links to. |
| What does the code build of the design? | [`out/design-and-code.md`](out/design-and-code.md): Shop's React code sets `selected`, the change the design asks for, and leaves out the rejected corner radius. Its `GiftOption` wrapper is read once, on the same product component as the design's Gift option. |
| Where does the product copy the Card instead of using it? | The same file, under Promo applied. The design file has a detached Card there, inferred by its name and the six library layers it keeps; Shop design confirmed it in [`contract/confirmations.json`](contract/confirmations.json), and the maintainers decided Shop goes back to a library Card with the illustration as its hero media. The code renders a copy of the Card from `code/src/vendor/react-card`, inferred by import and left for Shop engineering to confirm, so the gate reports it as a fork awaiting confirmation. |
| What does the checkout look like when you click through it? | [`out/walk.html`](out/walk.html), the frame walk (D33): Shop's frames along their prototype links, labelled as design intent. Open it from disk; [`out/walk.md`](out/walk.md) is the same walk as text. |
| How are the decisions kept? | [`out/resolved.overrides.md`](out/resolved.overrides.md) and [`out/resolved.graph.json`](out/resolved.graph.json). |
| What does every product inherit that a platform can't build? | The `[ios]` open conflicts in [`out/raised.gaps.md`](out/raised.gaps.md): the library Card's default body, footer and header action. |
| What is still missing, with owners? | [`out/raised.gaps.md`](out/raised.gaps.md) and [`out/resolved.gaps.md`](out/resolved.gaps.md). |

### The forecasts

The Fluent Card libraries show the two cases from the change flow. React's `Card` is a flexible library with slots and props. iOS's `CardView` is a brittle, widget-style library: a UIKit view with a title, a subtitle, an icon and a color style. Android's `BasicCard` sits between them: an empty container with one `content` slot and a token class.

Shop builds web with two frameworks (decision 0011): React for the checkout, and Fluent's web components for an order summary it embeds in partner sites. `<fluent-card>` has one default slot and a fill color, so web gets two answers, never merged. Each answer comes from the components in the package Shop declares for that framework in [`contract/product.json`](contract/product.json).

| Change in the Shop file | Web (React) | Web (web components) | iOS (UIKit) | Android (Compose) |
|---|---|---|---|---|
| The header's checkbox turned on, making the Card selectable | Supported (`selected` prop) | Needs a library change | Needs a library change | Needs a library change |
| A local corner radius of 20 | Forbidden by contract | Forbidden by contract | Forbidden by contract | Forbidden by contract |

Shop's Card also shows the header's quick action and the footer. The real Fluent 2 web kit draws both by default, so they aren't changes and aren't forecast. iOS `CardView` can't build either one. That's a gap between the library's default Card and iOS, not something Shop did, so the override forecast can't see it.

### Library defaults a platform can't build

`compareLibraryDefaults` compares what the library's Card shows by default with each platform's extension points. Every product using the Card as drawn inherits that content, so a platform with no way to express it is a gap for all of them. Each one is raised as an open conflict for that platform and listed in [`out/raised.gaps.md`](out/raised.gaps.md). The real web kit turns on the body, the footer and the header's quick action. Web and Android can express all three. iOS `CardView` can express none of them, so CIVIC raises three iOS conflicts: `conflict:card.ios.default.body`, `.actions` and `.header-action`. Illustrative decisions settle them: iOS `CardView` gains a body slot (Awaiting adoption), and iOS goes without the footer and the header action as an accepted limitation.

The corner radius is forbidden on every platform, even though Android's `basicCardTokens` could technically set one. The contract's `shape-from-token` rule decides, not what the code allows.

### The decisions

[`contract/decisions.json`](contract/decisions.json) holds illustrative Decision records with the demo's placeholder owners. It isn't a real Fluent team's call. The gate reads it: the decided override doesn't block, and the undecided one is held by the baseline.

- **Reject** the corner radius. Shop's design reverts it, and the Card reads Awaiting adoption until the file matches.
- The **selectable Card** is left undecided on purpose. Its drift stays open, so the design still reads "not yet adoptable".

Before the real kit, the stand-in library made the header action and the footer opt-in, so the demo also showed a temporary exception and a promotion. With the real kit they aren't overrides, so those two decisions were removed. "Approve as a product adaptation" would need every platform to forecast Supported, and neither remaining change does.

### The completeness check (D32)

Static rules read the design export, the Card contract and the journey's prototype links. They report counts with denominators.

- **Component states.** The contract's `productStates` are loading, empty and error, because their content depends on Shop's data. The real web kit's Card has no loading, empty or error state, so Shop's `Order Summary / Loading` frame can only show the Card at rest. Loading, empty and error are all missing: 4 of 7 states are accounted for. Hover, selected and disabled come from the library. An instance can also say it inherits the default for a product state (`inheritsStates`), which counts as an answer.
- **Journey shape.** The page's prototype flow is the Checkout journey, and its starting frame is the entry. Promo applied has no way on, so it's a dead end. Gift options links back to Order Summary, but nothing links to it, so it's unreachable. "Continue to payment" opens a URL, so it stays an unmapped path rather than a dead end.

Accessibility intent isn't checked yet. Which gaps block a release is the project's risk policy, not this check.

Query the graphs yourself:

```sh
bin/civic overrides demo/card/out/raised.graph.json instance:shop.order-summary.card
bin/civic forecast demo/card/out/raised.graph.json override:shop.order-summary.card.state-selected
bin/civic completeness demo/card/out/raised.graph.json target:shop.checkout
bin/civic gaps demo/card/out/resolved.graph.json --scope semantic:card
```

## Inputs

| Input | What it is | Read by |
|---|---|---|
| [`contract/card.json`](contract/card.json) | The semantic Card: its variants, states, product states, slots and the `shape-from-token` rule, declared by the design system maintainers | contract |
| [`contract/mappings.json`](contract/mappings.json) | How each platform's Fluent Card expresses the semantic variants, and which public APIs are extension points. Also how the library's Figma Card names its variants, states and properties. Declared by Design Engineering and the maintainers. | every importer checks its names against what it reads |
| [`contract/product.json`](contract/product.json) | Shop: its platforms, owners, the code libraries it builds with per framework, and design files as a lineage (decision 0011): the checkout file consumes the Fluent kit and Shop's patterns library | product file importer |
| [`sources/`](sources) | Fluent's own files, vendored at pinned revisions with their MIT licences ([`sources.json`](sources/sources.json)): `@fluentui/react-card@9.7.3` types and `useCard`, `@fluentui/web-components@2.6.1`'s `<fluent-card>` custom element definition, iOS `CardView.swift`, Android `BasicCard.kt` and `BasicCardTokens.kt` | static source readers ([`importers/src/source.ts`](../../importers/src/source.ts)) |
| [`design/library.figma.json`](design/library.figma.json) | The real Microsoft Fluent 2 Web Community kit's Card and `.Card header` component sets, from a Figma REST file export (`GET /v1/files/:key`) trimmed by [`design/trim.ts`](design/trim.ts) | `readFigmaLibraryComponent` |
| [`design/shop-checkout.figma.json`](design/shop-checkout.figma.json) | A stand-in for Shop's Checkout page: four frames, a prototype flow, two instances of the real kit's Card, three of its Button, one of Shop's Promo banner, Shop's own Gift option component (a Card), defined once and placed twice on Gift options, and a detached copy of the Card on Promo applied | `readFigmaProductFile` ([`importers/src/figma-product.ts`](../../importers/src/figma-product.ts)) |
| [`design/shop-patterns.figma.json`](design/shop-patterns.figma.json) | A stand-in for Shop's own patterns library, the product-level layer: it publishes a Promo banner | `readPublishedComponents` |
| [`code/src`](code) | A stand-in for Shop's React code: the Order Summary, Gift options and Promo applied screens, a `GiftOption` wrapper and a copy of the Card under `vendor/`, never compiled or run. `codeScreens` in `contract/product.json` says which file renders which screen | `readReactProductCode` ([`importers/src/react-code.ts`](../../importers/src/react-code.ts)) |
| [`contract/confirmations.json`](contract/confirmations.json) | Shop design's confirmation of the detached Card on Promo applied as a fork (decision 0011). The code's copy is left unconfirmed | `applyConfirmations` |

### The Figma exports

`design/library.figma.json` comes from the Microsoft Fluent 2 Web Community file, exported on 2026-10-12 (Figma version 2409330757852496286). The full export is about 147 MB, so [`design/trim.ts`](design/trim.ts) keeps only the file's identity, the Card and `.Card header` component sets with their property definitions, the icon component the header's swap defaults to, the layer outline of each set's default variant (names two levels deep, which a copy of the Card is compared with), and the key and name of every component set and standalone component the file publishes. The mapping finds the Card by its published key, and the product's instances are matched to it by that key, not by name (decision 0011). The kit has three sets named Button, two of them used from other libraries, which is why a name isn't enough. The importer reads the trimmed file and the full export the same way.

The real Card differs from the stand-in it replaced:

- **Style** is Filled, Filled alt, Outline or Subtle. The contract maps Filled and Outline. Filled alt and Subtle match React's `filled-alternative` and `subtle`, which the gaps already list as platform-only.
- **State** is Rest, Hover, Pressed, Draggable, Selected or Disabled. There's no loading, empty or error state.
- **Body** and **Footer** are on by default, and **Layout** is Default or Custom.
- The header is its own nested component set, `.Card header`, with a quick action (on by default), a checkbox, an avatar, a product icon and subtext. `parts` in [`contract/mappings.json`](contract/mappings.json) declares its properties, and the importer reads them from the nested header instance.

`design/shop-checkout.figma.json` is still a stand-in, because Shop is an illustrative product. Its name and `version` (`civic-stand-in-5`) say so. It's written in the shape Figma's REST API returns and uses the real kit's component names, property names and published keys, so a real product file built on the kit reads the same way. Shop's patterns library is a stand-in too, with made-up keys. Every component the checkout file places comes from a library it consumes; one that didn't would be a failing finding on its screen. Gift option is Shop's own component: its Card is read once, at the definition, and Gift options contains the component, so the completeness check counts that Card on Gift options and finds the same three missing product states it finds on Order Summary (baselined).

To refresh the library, export your own duplicate and trim it:

```sh
curl -H "X-Figma-Token: $FIGMA_TOKEN" "https://api.figma.com/v1/files/<library-file-key>" -o full-export.json
node demo/card/design/trim.ts full-export.json > demo/card/design/library.figma.json
node demo/card/build.ts
```

If the kit renames its sets, properties or options, update `library` in `contract/mappings.json`. The import fails loudly until every name matches.

## How the design file is read

- Each top-level frame on a page is a screen. A frame named `<Screen> / <State>` is a state of that screen, such as `Order Summary / Loading`.
- Each page with a prototype flow is one journey. The journey contains the page's screens and enters at the flow's starting frame.
- A prototype click to another frame is a declared path, named after the layer that was clicked. A click that opens a URL is an unmapped path to that URL.
- Each instance of the library's Card is a component instance. Its variant and state come from the declared options.
- A component property set to anything other than the library default is an override. So is a property of a declared nested part, such as the header, set on that part's instance. Properties marked `content`, such as the title text, are how every product fills in a Card, so they never count. A local style on the instance is an override too. A local style with no declared meaning becomes `unmapped.<field>`, so nothing is hidden.
- Any undeclared property, option or frame name fails the import.

## Evidence tiers

Everything here is static analysis. Source reading proves what each library declares, not how it behaves. The design export proves what the file contains, not what ships. `civic gaps` lists the missing run evidence for every platform, with QA as owner. The Fluent Button demo's Playwright harness is the pattern for adding web runs.

## Rebuilding

```sh
node demo/card/build.ts            # rewrite out/ from the inputs
node demo/card/build.ts --check    # what bin/signoff runs
```

To move to a newer Fluent release, update `sources/` and `sources.json` together, then rebuild. A renamed variant or a removed extension point makes the import fail and name the mapping to fix.

Fluent code is © Microsoft Corporation under the MIT licence. Figma Community kits are CC BY 4.0; the kit excerpt in `design/library.figma.json` is from Microsoft's Fluent 2 Web Community file.
