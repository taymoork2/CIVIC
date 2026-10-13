16 gap(s)

## open-conflict (1)

- The product design changes the Card's state.selected (set-property, true) and no maintainer has reviewed it. Classification unclassified. Owners: design shop-design, design design-system-maintainers. (`conflict:shop.order-summary.card.state-selected`)

## missing-variant (3)

- [ios] No ios equivalent for Card outline: CardView has no style without a background. Owners: design-engineering fluent-ios. (`platform:fluent-apple.card-view`)
- [web] No web equivalent for Card filled: fluent-card has no appearance attribute; it always draws a neutral fill layer with an elevation shadow. Owners: design-engineering fluent-web-components. (`platform:fluent-web-components.card`)
- [web] No web equivalent for Card outline: fluent-card has no outline style. Owners: design-engineering fluent-web-components. (`platform:fluent-web-components.card`)

## missing-state (2)

- Gift options has no design for the Card's loading, empty, error state(s); show them or say the instance inherits the default. Owners: design shop-design. (`target:shop.gift-options`)
- Order Summary has no design for the Card's loading, empty, error state(s); show them or say the instance inherits the default. Owners: design shop-design. (`target:shop.order-summary`)

## platform-only-variant (4)

- [ios] ios offers `appColor`, which no Card variant covers. Design decides whether the contract adds it. Owners: design design-system-maintainers. (`platform:fluent-apple.card-view`)
- [ios] ios offers `custom`, which no Card variant covers. Design decides whether the contract adds it. Owners: design design-system-maintainers. (`platform:fluent-apple.card-view`)
- [web] web offers `filled-alternative`, which no Card variant covers. Design decides whether the contract adds it. Owners: design design-system-maintainers. (`platform:fluent-react-v9.card`)
- [web] web offers `subtle`, which no Card variant covers. Design decides whether the contract adds it. Owners: design design-system-maintainers. (`platform:fluent-react-v9.card`)

## no-run-evidence (4)

- [android] No automated or device evidence for Fluent Android Compose BasicCard; only static analysis. Owners: qa card-qa. (`platform:fluent-android.basic-card`)
- [ios] No automated or device evidence for Fluent iOS CardView; only static analysis. Owners: qa card-qa. (`platform:fluent-apple.card-view`)
- [web] No automated or device evidence for Fluent React v9 Card; only static analysis. Owners: qa card-qa. (`platform:fluent-react-v9.card`)
- [web] No automated or device evidence for Fluent Web Components fluent-card; only static analysis. Owners: qa card-qa. (`platform:fluent-web-components.card`)

## approved-exception (2)

- [ios] Default actions in the Card on ios: accepted as accepted-limitation. Revisit when: iOS CardView gains a footer or actions slot. Owners: design design-system-maintainers, design-engineering fluent-ios. (`conflict:card.ios.default.actions`)
- [ios] Default header.action in the Card on ios: accepted as accepted-limitation. Revisit when: iOS CardView gains a header accessory slot. Owners: design design-system-maintainers, design-engineering fluent-ios. (`conflict:card.ios.default.header-action`)
