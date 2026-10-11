# Work order: Button, Neutral default, on android

Trigger an action, with the emphasis set by its variant.

## IDs to put in code

- `semantic:button`
- `platform:fluent-android.compose-button`
- `extension:fluent-android.compose-button.buttonTokens`
- `extension:fluent-android.compose-button.icon`
- `extension:fluent-android.compose-button.size`
- Variant key `neutral-default`

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
- neutral-default: none. No stock ButtonStyle.

## Other platforms

- ios: exact as `outlineNeutral`
- web: exact as `secondary`

## Tokens

- No tokens linked on android.

## Extension points

- token `buttonTokens` expresses appearance, shape, size (`extension:fluent-android.compose-button.buttonTokens`)
- prop `icon` expresses icon (`extension:fluent-android.compose-button.icon`)
- prop `size` expresses size (`extension:fluent-android.compose-button.size`)

## Records

- **resolved** Neutral default Button on android: The Microsoft Fluent Android Figma kit has a Neutral default Button that Fluent Android Compose Button cannot express. Classification temporary-gap, accepted-limitation. Owners: design design-system-maintainers, design-engineering fluent-android. (`conflict:button.android.neutral-default`) Decided: approve-exception by design design-system-maintainers. Neutral default stays in the contract and the Android kit. Compose has no stock ButtonStyle for it, so an Android product that needs one builds it through the buttonTokens extension point with its own ButtonTokens subclass until the library adds a style. Revisit when: Fluent Android adds a neutral ButtonStyle, or a second Android product builds its own neutral Button.

## Evidence

- static-analysis / design-export / finding: Button draws Style: Primary, Outlined, Neutral, Text; State: Rest, Pressed, Disabled. (`evidence:figma.android-kit.button`)
- static-analysis / token-analysis / finding: ButtonTokens backgroundBrush by ButtonStyle: Button reads BrandBackground1, BrandBackground1Pressed, BrandBackground1Selected, Background5; OutlinedButton reads no background token; TextButton reads no background token. (`evidence:fluent-android.compose-button.background-tokens`)
- static-analysis / source-analysis / finding: ButtonStyle declares Button, OutlinedButton, TextButton; the default is Button. (`evidence:fluent-android.compose-button.variants`)

## Acceptance

- A button has an accessible name: Every button exposes an accessible name, including icon-only buttons.
- A button triggers one action: Activating a button performs exactly one action, and its emphasis tells the user how important that action is.
- android has no equivalent for neutral-default (No stock ButtonStyle).
- Follow the decision on Neutral default Button on android: Neutral default stays in the contract and the Android kit. Compose has no stock ButtonStyle for it, so an Android product that needs one builds it through the buttonTokens extension point with its own ButtonTokens subclass until the library adds a style.
- No automated or device evidence on android yet; static analysis shows what the source says, not how it behaves.

