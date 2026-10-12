# Changes to Card on Order Summary

Forecasts are computed from the libraries' extension points and the contract's rules as they are in this graph. Each platform gets its own answer.

| Override | web | ios | android | Record |
|---|---|---|---|---|
| Local cornerRadius 20 (`corner-radius`) | Forbidden by contract | Forbidden by contract | Forbidden by contract | Unreviewed drift, open (`conflict:shop.order-summary.card.corner-radius`) |
| .Card header / Checkbox set to true (`state.selected`) | Supported | Needs a library change | Needs a library change | Unreviewed drift, open (`conflict:shop.order-summary.card.state-selected`) |

## Why

- **Local cornerRadius 20** (`override:shop.order-summary.card.corner-radius`)
  - web: Card contract: Corner radius comes from the shape token; a local radius is not allowed.
  - ios: Card contract: Corner radius comes from the shape token; a local radius is not allowed.
  - android: Card contract: Corner radius comes from the shape token; a local radius is not allowed.
- **.Card header / Checkbox set to true** (`override:shop.order-summary.card.state-selected`)
  - web: prop `selected` expresses state.selected.
  - ios: No ios extension point expresses state.selected.
  - android: No android extension point expresses state.selected.

## People

- Asked to decide: design shop-design, design design-system-maintainers.
- Told: design-engineering fluent-android (android), design-engineering fluent-ios (ios), engineering shop-engineering, qa shop-qa.
- Shown on: Order Summary (`target:shop.order-summary`), Checkout (`target:shop.checkout`).

## Readiness

Design not yet adoptable: 2 of 2 override(s) have no decision.
