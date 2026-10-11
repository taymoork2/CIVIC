# Work order: Button, Brand outline, on android

Trigger an action, with the emphasis set by its variant.

## IDs to put in code

- `semantic:button`
- `platform:fluent-android.compose-button`
- `extension:fluent-android.compose-button.buttonTokens`
- `extension:fluent-android.compose-button.icon`
- `extension:fluent-android.compose-button.size`
- Variant key `brand-outline`

## Intent

- A button has an accessible name (accessibility-rule): Every button exposes an accessible name, including icon-only buttons. `intent:button.accessible-name`
- A button triggers one action (requirement): Activating a button performs exactly one action, and its emphasis tells the user how important that action is. `intent:button.triggers-action`

## States

- rest, hover, pressed, focused, disabled

## Slots

- icon, label

## Mapping on android

- Fluent Android Compose Button: `Button` from `microsoft/fluentui-android` (`platform:fluent-android.compose-button`)
- Renders primary-filled when no variant is given.
- brand-outline: exact as `OutlinedButton`

## Other platforms

- ios: exact as `outlineAccent`
- web: closest as `outline`

## Tokens

- No tokens linked on android.

## Extension points

- token `buttonTokens` expresses appearance, shape, size (`extension:fluent-android.compose-button.buttonTokens`)
- prop `icon` expresses icon (`extension:fluent-android.compose-button.icon`)
- prop `size` expresses size (`extension:fluent-android.compose-button.size`)

## Records

- **decided** Brand outline Button on android: Fluent Android Compose Button offers Brand outline, which the Microsoft Fluent Android Figma kit does not draw. Classification outdated-design-source, awaiting-adoption. Owners: design design-system-maintainers, design-engineering fluent-android. (`conflict:button.android.brand-outline`) Decided: update-design by design design-system-maintainers (`decision:button.android.brand-outline`). The Android kit predates Fluent Android's Compose controls and draws only Primary and Text buttons. Compose ships OutlinedButton for Brand outline, and the contract keeps it, so Design adds an Outlined button to the kit. Until it lands, Android designers take Brand outline from the contract, not the kit. Revisit when: The kit gains an Outlined button, or Compose drops OutlinedButton.

## Evidence

- static-analysis / design-export / finding: Button draws Style: Primary, Text; each drawn as Default, Pressed, Disabled; Light, Dark. (`evidence:figma.android-kit.button`)
- static-analysis / token-analysis / finding: ButtonTokens backgroundBrush by ButtonStyle: Button reads BrandBackground1, BrandBackground1Pressed, BrandBackground1Selected, Background5; OutlinedButton reads no background token; TextButton reads no background token. (`evidence:fluent-android.compose-button.background-tokens`)
- static-analysis / source-analysis / finding: ButtonStyle declares Button, OutlinedButton, TextButton; the default is Button. (`evidence:fluent-android.compose-button.variants`)

## Acceptance

- A button has an accessible name: Every button exposes an accessible name, including icon-only buttons.
- A button triggers one action: Activating a button performs exactly one action, and its emphasis tells the user how important that action is.
- Follow the decision on Brand outline Button on android: The Android kit predates Fluent Android's Compose controls and draws only Primary and Text buttons. Compose ships OutlinedButton for Brand outline, and the contract keeps it, so Design adds an Outlined button to the kit. Until it lands, Android designers take Brand outline from the contract, not the kit.
- No automated or device evidence on android yet; static analysis shows what the source says, not how it behaves.

