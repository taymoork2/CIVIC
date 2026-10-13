# Frame walk: Checkout

Design intent: frames and prototype links from the design file, not behavior from running code. Read at design revision civic-stand-in-3.

Starts on: Order Summary.

## Order Summary

- Card on Order Summary: semantic:card, filled, rest
  - Override Local cornerRadius 20 (`corner-radius`): web forbidden, ios forbidden, android forbidden
  - Override .Card header / Checkbox set to true (`state.selected`): web supported, ios needs-library-change, android needs-library-change
- States drawn: Order Summary / Loading
- **Apply promotion** goes to Promo applied
- **Continue to payment** leaves the design for /checkout/payment

## State: Order Summary / Loading

- Card on Order Summary / Loading: semantic:card, filled, rest

## Promo applied

- No prototype link leads on, and the journey doesn't name this frame as an exit.

## Gift options (not reachable from the start)

- **Back to order** goes to Order Summary
