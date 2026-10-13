# Frame walk: Checkout

Design intent: frames and prototype links from the design file, not behavior from running code. Read at design revision civic-stand-in-5.

Starts on: Order Summary.

## Order Summary

- Card on Order Summary: semantic:card, filled, rest
  - Override Local cornerRadius 20 (`corner-radius`): web (react) forbidden, web (web-components) forbidden, ios (uikit) forbidden, android (compose) forbidden
  - Override .Card header / Checkbox set to true (`state.selected`): web (react) supported, web (web-components) needs-library-change, ios (uikit) needs-library-change, android (compose) needs-library-change
- Card in OrderSummary.tsx: semantic:card, filled
- States drawn: Order Summary / Loading
- **Apply promotion** goes to Promo applied
- **Continue to payment** leaves the design for /checkout/payment

## State: Order Summary / Loading

- Card on Order Summary / Loading: semantic:card, filled, rest

## Promo applied

- Card on Promo applied: semantic:card
  - Override Card on Promo applied is a copy of the library component (`component`): web (react) needs-library-change, web (web-components) needs-library-change, ios (uikit) needs-library-change, android (compose) needs-library-change
- Copy of Card in PromoApplied.tsx: semantic:card
- No prototype link leads on, and the journey doesn't name this frame as an exit.

## Gift options (not reachable from the start)

- **Back to order** goes to Order Summary
