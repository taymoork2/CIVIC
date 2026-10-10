# 0001: Use Fluent 2 as the demo design system

- **Status:** Accepted
- **Date:** 2026-10-10
- **Decider:** Founder

## Context

CIVIƆ needs a realistic public design system to prove its core loop:

```diagram
Shared intent ──▶ Platform implementations ──▶ Evidence ──▶ Drift and coverage
```

The founder has no usable Figma content of their own. The demo source must be public, legally reusable, actively maintained, and implemented on web, iOS, and Android.

## Options considered

| Option | Result |
|---|---|
| Now in Android with Material 3 | Good native app and Figma file, but no official web app. The official Material Web library has been in maintenance mode since June 2024. |
| Skyscanner Backpack | Best visible token pipeline, but its public web repository was archived in August 2026. |
| Kiwi.com Orbit | Good public Figma files, but its iOS and Android libraries were archived in May 2025. |
| Adobe Spectrum 2 | Strong token data and web implementations, but no public iOS or Android component libraries. |
| **Microsoft Fluent 2** | **Chosen.** It has active, MIT-licensed web, iOS, and Android implementations and public Figma kits for web and iOS. |

## Decision

Use Fluent 2 as CIVIƆ's first demo design system. CIVIƆ reads Fluent; it does not fork or redistribute it.

| Layer | Source |
|---|---|
| Design intent | [Fluent 2 guidance](https://fluent2.microsoft.design/), [Fluent 2 Web Figma kit](https://www.figma.com/community/file/836828295772957889/microsoft-fluent-2-web), and [Fluent 2 iOS Figma kit](https://www.figma.com/community/file/836833645402438850/microsoft-fluent-2-ios) |
| Web | [`microsoft/fluentui`](https://github.com/microsoft/fluentui): React v9 and Fluent web components |
| iOS | [`microsoft/fluentui-apple`](https://github.com/microsoft/fluentui-apple): UIKit and SwiftUI |
| Android | [`microsoft/fluentui-android`](https://github.com/microsoft/fluentui-android): Jetpack Compose and legacy Views |
| Tokens | Published platform packages: `@fluentui/tokens`, Swift `GlobalTokens` and `FluentTheme`, Kotlin `FluentGlobalTokens`, `FluentAliasTokens`, and control tokens |

Free Figma Community files use CC BY 4.0, so CIVIƆ must credit Microsoft when it copies or adapts them. Fluent code libraries are MIT licensed. Check separate asset and icon licenses before redistributing them.

## First demo component: Button

Button exists on every platform and exposes useful differences.

| CIVIƆ semantic variant | React v9 | Web component | iOS | Android Compose |
|---|---|---|---|---|
| Primary filled | `primary` | `appearance="primary"` | `accent` | `Button` |
| Brand outline | `outline`, closest match | `appearance="outline"` | `outlineAccent` | `OutlinedButton` |
| Neutral default | `secondary` | No `appearance` | `outlineNeutral` | No stock equivalent |
| Subtle or text | `subtle` | `appearance="subtle"` | `subtle` | `TextButton` |
| Transparent neutral | `transparent` | `appearance="transparent"` | `transparentNeutral` | No stock equivalent |
| Danger | No base appearance | None | `danger`, `dangerOutline`, `dangerSubtle` | Custom tokens |

Known differences to show:

- Only web exposes rounded, circular, and square shapes.
- Web supports focusable disabled buttons; native platforms use normal disabled behavior.
- No platform has a first-class loading state.
- Icon and accessible-name APIs differ by platform.
- iOS has danger and floating variants that web and Android Button do not.

## Evidence plan

| Platform | Initial evidence | Constraint |
|---|---|---|
| Web | Storybook and Playwright screenshots, DOM, and accessibility checks | Runs in a Linux orb. |
| Android | Source and token analysis first; add JVM screenshot tests or use a device runner | Fluent Android has instrumentation tests, not JVM screenshot tests. Orbs cannot run Android emulators. |
| iOS | Source and token analysis first; capture simulator screenshots later | Requires a Mac orb. Fluent iOS has XCUITest smoke coverage, not snapshot tests. |

## Consequences

- CIVIƆ can demonstrate one semantic component across three real platform implementations.
- Fluent's canonical token source is private, so CIVIƆ must normalize tokens from published code packages.
- Microsoft's official Android Figma short link redirected to Bing on 2026-10-10. The public [Microsoft Fluent Android](https://www.figma.com/community/file/836835062056249539/microsoft-fluent-android) Community file is the Android design source for the demo. Figma lists it as last updated six years ago, but the founder observed a v2 label in the file. It only needs to be a realistic example, not a verified current source. Any mismatch with the Fluent Android Compose `V2` controls becomes drift for CIVIƆ to show.
- Figma's Variables REST API is Enterprise-only. Code packages, not Figma variables, are the initial token source.
- Design-token export is likely to matter later. CIVIƆ should keep a platform-neutral token model that can import and export standard formats such as DTCG and support tools such as Tokens Studio and Style Dictionary.
