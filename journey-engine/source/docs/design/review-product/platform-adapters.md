# Integration direction

The user asked how Rehearsal should adopt existing projects, prioritizing Vite/Vite+ with TanStack Start and Convex, then native iOS and Android. This is the recommended sequence, not a claim that every adapter exists.

## Three responsibilities

| Boundary | Responsibility | Current proof |
|---|---|---|
| Build connector | Resolve the selected checkout, discover source routes/components, load a review entry, substitute declared providers, watch dependencies and invalidate affected snapshots. | Local Vite plugin; source discovery and portable Notebook example. |
| Runtime/data adapter | Mount the app, report stable screen/step identities, choose authored fixtures and synthetic identity, expose reset/settlement, and run the app's real effects in isolation. | Laundry's shared session, real route tree and Convex functions; towel's real intake Flow. |
| Interaction driver | Execute controls, capture semantic inputs/navigation/effect receipts, and compare replay checkpoints. | Browser DOM driver plus bounded adapter commands for presentation and failed-write recovery. |

A build plugin can replace imports and discover candidate code. It cannot infer a safe database seed, user permissions or the intended journey. Keep those in a reviewed adapter/manifest. A new ordinary screen that already uses the application's router and transport should require no new recorder or mutation handler. New external services, auth, dynamic start parameters or platform gestures require explicit support and remain visible gaps until verified.

## First supported stack

Keep one framework-independent recording contract and a Vite connector, TanStack router adapter and Convex data adapter. The existing native Laundry route mount demonstrates those boundaries. TanStack Start server functions require their own isolated server-function transport; replacing Convex does not cover them. `@civic/canvas` now provides it for module apps: the canvas rewrites each module's `@tanstack/react-start` import so the preview's `createServerFn` calls go to the live run, and the run's worker executes the app's real handlers (`createServerFnRuntime` in the runtime entry; see the Reading list example). [TanStack server functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions) separate that execution boundary.

Greenfield applications should inject their data, identity and clock at the app root and expose stable state IDs. Existing applications can initially use checked build-time substitutions, then replace brittle source overlays with an exported mount/provider contract. The towel migration passes fixture props through the existing AddClothesFlow; it leaves that flow's useMutation hooks, recovery and validation intact. The overlay fails when its expected source shape changes. It never silently rewrites the selected checkout.

Use Vite+ through its Vite configuration where supported by the project's installed version; no separate Vite+ adapter was installed or verified here. Package extraction remains open: today's host is a monorepo development snapshot, not a published SDK.

## Additional connectors

| Toolchain | Available mechanism | Recommendation |
|---|---|---|
| Vite | Virtual modules, resolve/load/transform, server middleware and HMR hooks. | First-class connector; keep it development-only. [Plugin API](https://vite.dev/guide/api-plugin). |
| Webpack | Compiler/compilation plugins and loaders. | Thin build connector around the same runtime ports, after a real project needs it. [Plugin API](https://webpack.js.org/concepts/plugins/). |
| esbuild | Build API plugins with resolve/load hooks; plugins are unavailable in transform-only mode. | Separate watcher/host lifecycle, same recording contract. [Plugins](https://esbuild.github.io/plugins/). |
| Bun | Runtime/bundler plugins can intercept import resolution/loading. | Thin connector; do not assume exact compatibility with Vite hooks. [Plugins](https://bun.sh/docs/bundler/plugins). |
| Turbopack | Aliases and a subset of webpack loaders; webpack plugins are unsupported. | An explicit review entry/provider injection avoids depending on a general plugin system. [Configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack), [known gaps](https://nextjs.org/docs/pages/api-reference/turbopack). |
| React Native / Expo | Metro resolver/transformer customization. | Native host and semantic interaction driver; browser iframe/DOM replay is not reusable unchanged. [Metro configuration](https://metrobundler.dev/docs/configuration/). |

## Native direction

Prioritize SwiftUI and Kotlin/Compose adapters when there is a real native app to integrate. Reuse stable journey IDs, fixture provenance, proposal/review IDs and the recording envelope. Implement the driver in the platform's language/runtime rather than trying to put native views in a DOM iframe.

For iOS, inject the isolated service/identity/clock through the application's dependency boundary, observe its navigation state, and drive accessibility-identified controls in a simulator. SwiftUI supports environment values and navigation paths; codable navigation elements permit serializing a path. Those APIs are useful seams, not proof that all application state can be captured. [Environment](https://developer.apple.com/documentation/swiftui/environment), [NavigationPath](https://developer.apple.com/documentation/swiftui/navigationpath).

For Android, inject isolated repositories and a test navigation controller into the same app composables. Drive and assert semantic controls with Compose UI tests; system Back, lifecycle restoration and platform-specific behavior require explicit receipts. Google's testing guidance uses a TestNavHostController supplied to the app's navigation host. [Compose navigation testing](https://developer.android.com/guide/navigation/testing/compose).

One platform's successful run does not certify another. Bind each capture and replay receipt to platform, source, driver and fixture versions. Approved platform constraints belong in the proposal/exception record; unexplained behavior or visual drift remains a review item. Shared semantic IDs make comparison possible, while platform-specific gestures, rendering and architecture stay explicit.

## Migration order and limits

1. Native Laundry routes and Home/Drying already use the shared runtime.
2. Towel is the first curated migration: both origin branches, real save, input capture, proposal commands, recovery and saved replay.
3. Multicolor intake can reuse the same real Flow/session with its own authored initial state; saved records/nested editors should enter the actual Closet route with concrete seeded IDs.
4. Appliances/products, profile/water, route specimens and family/reminder presets still need their authored initial data reconciled against actual backend functions. Their legacy fixtures remain labelled; do not merely wrap the simulated switch and call the debt paid.

No model call is required to discover code, track revisions, record controls, invalidate snapshots or compare replay receipts. Models help with ambiguous requirements and new adapter implementation. No Webpack/Bun/esbuild/Metro/native connector, standalone package release or production auth/server-function simulation was implemented in this migration.
