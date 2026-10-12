13 gap(s)

## open-conflict (4)

- The product design changes the Card's state.selected (set-property, true) and no maintainer has reviewed it. Classification unclassified. Owners: design shop-design, design design-system-maintainers. (`conflict:shop.order-summary.card.state-selected`)
- [ios] The library's Card shows actions by default (Footer), and Fluent iOS CardView has no extension point that expresses it. Classification unclassified. Owners: design design-system-maintainers, design-engineering fluent-ios. (`conflict:card.ios.default.actions`)
- [ios] The library's Card shows body by default (Body), and Fluent iOS CardView has no extension point that expresses it. Classification unclassified. Owners: design design-system-maintainers, design-engineering fluent-ios. (`conflict:card.ios.default.body`)
- [ios] The library's Card shows header.action by default (.Card header / Header quick action), and Fluent iOS CardView has no extension point that expresses it. Classification unclassified. Owners: design design-system-maintainers, design-engineering fluent-ios. (`conflict:card.ios.default.header-action`)

## missing-variant (1)

- [ios] No ios equivalent for Card outline: CardView has no style without a background. Owners: design-engineering fluent-ios. (`platform:fluent-apple.card-view`)

## missing-state (1)

- Order Summary has no design for the Card's loading, empty, error state(s); show them or say the instance inherits the default. Owners: design shop-design. (`target:shop.order-summary`)

## platform-only-variant (4)

- [ios] ios offers `appColor`, which no Card variant covers. Design decides whether the contract adds it. Owners: design design-system-maintainers. (`platform:fluent-apple.card-view`)
- [ios] ios offers `custom`, which no Card variant covers. Design decides whether the contract adds it. Owners: design design-system-maintainers. (`platform:fluent-apple.card-view`)
- [web] web offers `filled-alternative`, which no Card variant covers. Design decides whether the contract adds it. Owners: design design-system-maintainers. (`platform:fluent-react-v9.card`)
- [web] web offers `subtle`, which no Card variant covers. Design decides whether the contract adds it. Owners: design design-system-maintainers. (`platform:fluent-react-v9.card`)

## no-run-evidence (3)

- [android] No automated or device evidence for Fluent Android Compose BasicCard; only static analysis. Owners: qa card-qa. (`platform:fluent-android.basic-card`)
- [ios] No automated or device evidence for Fluent iOS CardView; only static analysis. Owners: qa card-qa. (`platform:fluent-apple.card-view`)
- [web] No automated or device evidence for Fluent React v9 Card; only static analysis. Owners: qa card-qa. (`platform:fluent-react-v9.card`)
