# Design library release: Microsoft Fluent 2 Web (Community)

`fluent-2-web` from version 2409330757852496286 to 2409330757852496286 + civic-stand-in-next. Asked: design-system-maintainers (design).

## What the library publishes

- Removed: Button (key 3ed418e09baacd9f725e0dda0a225630a628cf29).

## Defaults that changed

- Footer: true before, false now.

## The library-default check, run again

- Cleared: Default actions in the Card on ios; the library no longer shows it by default.

## Shop: shop-checkout

Told: shop-design (design), shop-engineering (engineering), shop-qa (qa).

Orphaned by the release:

- "Apply promotion" on Order Summary is an instance of Button, which the new version no longer publishes.
- "Continue to payment" on Order Summary is an instance of Button, which the new version no longer publishes.
- "Back to order" on Gift options is an instance of Button, which the new version no longer publishes.

New overrides, because the library default moved and the product kept its setting:

- Footer set to true on instance:shop.component.gift-option.card: web (react) supported, web (web-components) supported, ios (uikit) needs-library-change, android (compose) supported.
- Footer set to true on instance:shop.order-summary.card: web (react) supported, web (web-components) supported, ios (uikit) needs-library-change, android (compose) supported.
- Footer set to true on instance:shop.order-summary.loading.card: web (react) supported, web (web-components) supported, ios (uikit) needs-library-change, android (compose) supported.
