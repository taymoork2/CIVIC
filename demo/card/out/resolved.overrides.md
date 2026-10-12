# Changes to Card on Order Summary

Forecasts are computed from the libraries' extension points and the contract's rules as they are in this graph. Each platform gets its own answer.

| Override | web | ios | android | Record |
|---|---|---|---|---|
| Local cornerRadius 20 (`corner-radius`) | Forbidden by contract | Forbidden by contract | Forbidden by contract | Decided, rejected: update the design; awaiting-adoption (`conflict:shop.order-summary.card.corner-radius`) |
| .Card header / Checkbox set to true (`state.selected`) | Supported | Needs a library change | Needs a library change | Unreviewed drift, open (`conflict:shop.order-summary.card.state-selected`) |

## Why

- **Local cornerRadius 20** (`override:shop.order-summary.card.corner-radius`)
  - web: Card contract: Corner radius comes from the shape token; a local radius is not allowed.
  - ios: Card contract: Corner radius comes from the shape token; a local radius is not allowed.
  - android: Card contract: Corner radius comes from the shape token; a local radius is not allowed.
  - Decided by design design-system-maintainers: Reject. The contract takes corner radius from the shape token, and a local 20 breaks it on every platform. Shop design reverts the radius, and the Card reads Awaiting adoption until the file matches.
- **.Card header / Checkbox set to true** (`override:shop.order-summary.card.state-selected`)
  - web: prop `selected` expresses state.selected.
  - ios: No ios extension point expresses state.selected.
  - android: No android extension point expresses state.selected.

## People

- Asked to decide: design shop-design, design design-system-maintainers.
- Told: design-engineering fluent-android (android), design-engineering fluent-ios (ios), engineering shop-engineering, qa shop-qa.
- Shown on: Order Summary (`target:shop.order-summary`), Checkout (`target:shop.checkout`).

## Readiness

Design not yet adoptable: 1 of 2 override(s) have no decision.
