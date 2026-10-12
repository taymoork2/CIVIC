# Changes since v6

context/since-v6.patch and source-delta-v6.json compare exported source trees, including Laundry reference changes as evidence. They are not a proposal to merge this snapshot wholesale into Laundry.

- Framework-independent recorder/replay, semantic DOM driver, source/seed/clock guards and bounded adapter commands.
- Project-bound isolated runtime API/workers executing actual Laundry queries/mutations/authorization; external requests/server actions blocked.
- Actual route mount, static route registration, Home Wear and Drying presets/branches/returns with real receipts and saved replay.
- Shared Laundry session for identity/data, memory storage, reset, frozen clock and review-only deterministic UUIDs.
- First curated migration: towel mounts actual AddClothesFlow rather than the simulated mutation switch; branches, care steps, retained inputs, proposal commands, recovery and fresh replay work.
- Durable recording endpoints and recording links in live reviews/cards/agent briefs; nested sensitive payloads, malformed commands and context mismatches rejected.
- Runtime snapshots/fingerprints and portal readiness check; Saved creates its outcome only in a dedicated isolated run.
- Notebook and generated preview adapters share the recorder; existing mount/publish adapters remain compatible.
- Researched connector/runtime/driver recommendation: Vite/TanStack/Convex first, later native iOS/Android and other bundlers.

The package includes newer linked Laundry source and six checked compatibility seams. Original app source/backend was not edited or restarted. source-provenance.json and bundled-laundry-seams.json distinguish inputs from exported outputs. Design exports remain historical; no cloud/provider/native acceptance or deployment is implied.
