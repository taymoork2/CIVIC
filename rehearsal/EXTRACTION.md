# Rehearsal as its own project

Product ownership is separate; package extraction is unfinished. The host remains in apps/web and includes Laundry presenters, Convex SDK types and planner/UI dependencies. This ZIP is not a framework-neutral distributable.

| Boundary | Existing files |
|---|---|
| Core | Canvas/camera/navigation, targets/review/capture/cache, coverage/project catalogue and harness receipts in src/review and scripts/review-*. |
| App contract | rehearsal.project.json, review-project.mjs, adapter.ts: contexts, graph, mount/publish/transition. |
| Generic previews | Authored Notebook and generated HTML/isolated React; module projects perform no Laundry overlays. |
| Laundry integration | review-laundry*.mjs, adapters/laundry.ts, laundry-frame, route/family/reminder previews, curated registry/actions/coverage. |
| Private local state | Ignored .review-data and rehearsal-projects; excluded. |
| Design bridge | Bounded briefs/exports and independent revisions; full automatic synchronization is absent. |

Writer recommendation: create an independent core entry/config, move Laundry behind the present adapter boundary, retain both non-Laundry examples as contract tests, then verify fresh install/external Laundry before retiring seams. Preserve review IDs, stores and historical source aliases. This adds no authority over the original app checkout/backend.

Keep one canonical scenario/expectation contract. Routine inventory/cache/coverage needs no model. Agents handle ambiguous intent, provider-aware adapters and proposal implementation; responses are not user acceptance. A deeper framework needs declared synthetic providers or an adapter, because grep cannot prove hidden state machines, permissions or backend success.

