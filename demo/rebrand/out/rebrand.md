# Harbor rebrand: blast radius and migration

Harbor is a token release: Fluent 2 web light to Harbor (a stand-in brand). 58 tokens change, and the components in this graph read 8 of them.

## Blast radius

| Level | Count |
|---|---|
| Changed tokens | 58 |
| Read by a component here | 8 |
| Platform components that read them | 2 |
| Semantic components | 2 |
| Product instances that follow on their own | 5 |
| Screens they're on | 3 |
| Hidden overrides (open divergences) | 2 |
| Forks awaiting confirmation | 1 |
| Platform components not read | 5 |

## Migration table

A component's instances are reached by every token its styles read, whatever size or variant they use: the graph doesn't record an instance's size.

| Token | Before | After | Components | Instances reached | Hidden overrides |
|---|---|---|---|---|---|
| `borderRadiusLarge` | 6px | 12px | Fluent React v9 Button; Fluent React v9 Card | Card on Gift option; Card in GiftOption.tsx; Card on Order Summary; Card on Order Summary / Loading; Card in OrderSummary.tsx | Card on Promo applied; Copy of Card in PromoApplied.tsx |
| `borderRadiusMedium` | 4px | 8px | Fluent React v9 Button; Fluent React v9 Card | Card on Gift option; Card in GiftOption.tsx; Card on Order Summary / Loading; Card in OrderSummary.tsx | Card on Order Summary; Card on Promo applied; Copy of Card in PromoApplied.tsx |
| `borderRadiusSmall` | 2px | 4px | Fluent React v9 Button; Fluent React v9 Card | Card on Gift option; Card in GiftOption.tsx; Card on Order Summary; Card on Order Summary / Loading; Card in OrderSummary.tsx | Card on Promo applied; Copy of Card in PromoApplied.tsx |
| `colorBrandBackground` | #0f6cbd | #117b88 | Fluent React v9 Button | none | none |
| `colorBrandBackgroundHover` | #115ea3 | #0f6d79 | Fluent React v9 Button | none | none |
| `colorBrandBackgroundPressed` | #0c3b5e | #09434a | Fluent React v9 Button | none | none |
| `colorNeutralForeground2BrandHover` | #0f6cbd | #117b88 | Fluent React v9 Button | none | none |
| `colorNeutralForeground2BrandPressed` | #115ea3 | #0f6d79 | Fluent React v9 Button | none | none |

## Hidden overrides

| Instance | Screen | Why it doesn't follow | Suggested action | Already decided |
|---|---|---|---|---|
| Card on Order Summary | Order Summary | Literal corner-radius 20 over `borderRadiusMedium` (4px to 8px) | Replace the literal with the token | Reject Shop's local corner radius (awaiting-adoption) |
| Card on Promo applied | Promo applied | Confirmed fork; misses 3 changed tokens | Re-attach the fork to the library component | Put Shop's promotion illustration in the Card's media slot (awaiting-adoption) |
| Copy of Card in PromoApplied.tsx | Promo applied | Inferred fork; misses 3 changed tokens | Confirm whether this is a fork, then re-attach it | No |

Each confirmed hidden override is an open divergence in `graph.json`, owned by the product team and raised by the design system's maintainers. The product owner decides; CIVIC never edits a design or code file. An inferred fork counts once a person confirms it (decision 0011).

## Not read

These implement a component the rebrand reaches, but their styles weren't read here, so their blast radius is unknown. They are never counted as unaffected.

- Fluent Android Compose BasicCard (android), implementing Card
- Fluent Android Compose Button (android), implementing Button
- Fluent iOS Button (ios), implementing Button
- Fluent iOS CardView (ios), implementing Card
- Fluent Web Components fluent-card (web), implementing Card

50 changed tokens are read by no component in this graph.
