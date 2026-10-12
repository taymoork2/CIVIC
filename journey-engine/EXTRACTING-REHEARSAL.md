# Rehearsal as its own project

Ownership is separate; package extraction remains open. The host lives in apps/web with Laundry dependencies. This snapshot can start a new checkout, but is not a framework-neutral published SDK.

| Boundary | Files to move together |
|---|---|
| Core | Canvas/camera/path selection, reviews/capture/cache, coverage/project catalogue, agent receipts and runtime-bridge.ts. |
| Browser driver | frame.tsx, runtime-dom.ts, adapter.ts, project request binding and recording validation/storage. |
| Build connector | review-plugin.mjs, inventory/project/discovery/fingerprint modules; move Laundry discovery/overlays behind an adapter. |
| Laundry | adapters/laundry*.ts(x), convex-runtime-client.ts, legacy store/presenters, authored fixtures/scenarios/actions. |
| Examples | Notebook plus generated HTML/React discovery, retained as non-Laundry contract tests. |
| Private host state | .review-data, generated user projects, credentials/destinations and Tailscale settings; excluded. |

Writer recommendation: finish curated migration in verified batches, then create an independent core entry/config and move Laundry behind a package boundary. Preserve review/journey IDs, hashes, stores and source-alias history. Keep discovered candidates, declared paths, observed replay and acceptance distinct.

Read source/docs/design/review-product/platform-adapters.md for connector/runtime/driver separation. Reuse envelopes and semantic IDs across native platforms; implement actual drivers in Swift/Kotlin. No additional bundler connector, native SDK or package release is shipped here.
