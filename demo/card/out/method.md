# Card demo: Atomic Design tiers

Shop's tiers ([`contract/method.json`](../contract/method.json)) checked against what the resolved graph says each target contains (decision 0014). Screens are templates by the profile's own rule; the owners placed the components. Findings are advisory.

## Atomic Design (follows the bundled atomic-design profile)

Shop's design team follows Atomic Design and places the library's Card and its own components in its tiers. Fluent doesn't use Atomic Design, so the Card's tier is Shop's reading of it, not the library's. Illustrative, like the demo's decisions: placeholder owners, not a real team's call.

| Tier | Holds | Placed by owners | By the profile's rule | Members |
|---|---|---|---|---|
| atom | components | 0 | 0 |  |
| molecule | components | 2 | 0 | Card, Gift option (Shop component) |
| organism | components | 0 | 0 |  |
| template | screens | 0 | 3 | Gift options, Order Summary, Promo applied |

### Composition the tiers don't allow: 1

- Gift option (Shop component) is a molecule and contains Card, a molecule; Atomic Design lets a molecule contain only atoms. Its owners re-tier one of them or change the profile's rule. (`target:shop.component.gift-option`)

### No tier yet: 0

Every target the tiers hold has one.
