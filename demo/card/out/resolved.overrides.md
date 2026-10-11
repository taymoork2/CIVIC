# Changes to Card on Order Summary

Forecasts are computed from the libraries' extension points and the contract's rules as they are in this graph. Each platform gets its own answer.

| Override | web | ios | android | Record |
|---|---|---|---|---|
| Show footer set to true (`actions`) | Supported | Needs a library change | Supported | Decided, promoted into the system; awaiting-adoption (`conflict:shop.order-summary.card.actions`) |
| Local cornerRadius 20 (`corner-radius`) | Forbidden by contract | Forbidden by contract | Forbidden by contract | Decided, rejected: update the design; awaiting-adoption (`conflict:shop.order-summary.card.corner-radius`) |
| Header action set to Badge / Price (`header.action`) | Supported | Needs a library change | Supported | Decided, exception approved; accepted-limitation (`conflict:shop.order-summary.card.header-action`) |
| Selectable set to true (`state.selected`) | Supported | Needs a library change | Needs a library change | Unreviewed drift, open (`conflict:shop.order-summary.card.state-selected`) |

## Why

- **Show footer set to true** (`override:shop.order-summary.card.actions`)
  - web: slot `CardFooter` expresses actions.
  - ios: No ios extension point expresses actions.
  - android: slot `content` expresses actions.
  - Decided by design design-system-maintainers: Promote. Footer actions are useful beyond Shop, and the contract already has an actions slot. Design engineering adds actions to iOS CardView with a migration note; Shop's footer waits on that release.
- **Local cornerRadius 20** (`override:shop.order-summary.card.corner-radius`)
  - web: Card contract: Corner radius comes from the shape token; a local radius is not allowed.
  - ios: Card contract: Corner radius comes from the shape token; a local radius is not allowed.
  - android: Card contract: Corner radius comes from the shape token; a local radius is not allowed.
  - Decided by design design-system-maintainers: Reject. The contract takes corner radius from the shape token, and a local 20 breaks it on every platform. Shop design reverts the radius, and the Card reads Awaiting adoption until the file matches.
- **Header action set to Badge / Price** (`override:shop.order-summary.card.header-action`)
  - web: slot `CardHeader.action` expresses header.action.
  - ios: No ios extension point expresses header.action.
  - android: slot `content` expresses header.action.
  - Decided by design design-system-maintainers: Temporary exception. Web builds the price badge in CardHeader's action slot and Android inside BasicCard's content. iOS CardView has no header accessory, so Shop shows the price in the subtitle on iOS until the library adds one. Revisit when: Fluent iOS CardView gains a header accessory, or a second product asks for a badge in the Card header. Expires 2027-04-01.
- **Selectable set to true** (`override:shop.order-summary.card.state-selected`)
  - web: prop `selected` expresses state.selected.
  - ios: No ios extension point expresses state.selected.
  - android: No android extension point expresses state.selected.

## People

- Asked to decide: design shop-design, design design-system-maintainers.
- Told: design-engineering fluent-android (android), design-engineering fluent-ios (ios), engineering shop-engineering, qa shop-qa.
- Shown on: Order Summary (`target:shop.order-summary`), Checkout (`target:shop.checkout`).

## Readiness

Design not yet adoptable: 1 of 4 override(s) have no decision.
