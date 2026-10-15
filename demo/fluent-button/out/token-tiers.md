# Fluent Button: token tiers

The tokens each Button implementation reads, checked against the token-tier profile in [`contract/method.json`](../contract/method.json) (decision 0014). Only the React Button's token reads are in the graph, read from its styles; the iOS and Android token sets are read for their background colors as evidence, not as token reads. Findings are advisory.

## Token tiers (follows the bundled token-tiers profile)

Fluent 2 names two token layers: global tokens for raw sizes, spacing, type, strokes and motion, and alias tokens for colors and shadows, which a theme sets. This places them as primitive and semantic by path prefix. Illustrative, with the demo's placeholder owners, not Fluent's own declaration.

| Tier | Holds | Placed by owners | By the profile's rule | Members |
|---|---|---|---|---|
| primitive token | tokens | 23 | 0 | borderRadiusCircular, borderRadiusLarge, borderRadiusMedium, borderRadiusNone, borderRadiusSmall, curveEasyEase, durationFaster, fontFamilyBase, and 15 more |
| semantic token | tokens | 30 | 0 | colorBrandBackground, colorBrandBackgroundHover, colorBrandBackgroundPressed, colorNeutralBackground1, colorNeutralBackground1Hover, colorNeutralBackground1Pressed, colorNeutralBackgroundDisabled, colorNeutralForeground1, and 22 more |
| component token | tokens | 0 | 0 |  |

### Tokens read past their tier: 1

- Fluent React v9 Button reads 23 primitive tokens (borderRadiusCircular, borderRadiusLarge, borderRadiusMedium, borderRadiusNone, borderRadiusSmall, curveEasyEase, and 17 more); Token tiers lets a component implementation read only semantic tokens and component tokens. Its owners point it at a semantic token, add one, or change the profile's rule. (`platform:fluent-react-v9.button`)

### No tier yet: 0

Every target the tiers hold has one.
