# The discovery example, onboarded by a crawl

Roadmap [step 4](../../docs/roadmap.md#4-the-journey-engine-as-a-graph-viewer): a second app connects without importing Laundry code, discovered by crawling first (D34). The app is the journey engine's manifest-free example, now in [`app/`](app): four static HTML pages for writing and archiving notes, plus two React components nothing links to.

[`out/crawl.md`](out/crawl.md) shows what CIVIC's [crawl](../../crawl) found: 4 screens and 6 paths, with nothing blocked and nothing out of reach. The crawl filled the note title, the one field on its allowlist. Every screen is discovered and every path proposed, so `civic check` reports the 4 screens as awaiting confirmation and nothing counts for readiness yet.

The crawl can't see the two React components (Counter, and Account, which needs a provider), because no page renders them. The journey engine's static discovery finds them in source. That's the case D34 leaves for an adapter: states a crawl can't reach.

## Confirming what the crawl found

A person confirms the crawl in a `confirmations.json` file next to the inputs (`civic.confirmations/0`). Confirmed screens become expected, confirmed paths become declared, and a declared journey over confirmed screens gets the journey shape checks (dead ends and unreachable screens). Confirming something the crawl no longer finds fails the build. Nobody has confirmed this example yet, and CIVIC doesn't confirm on anyone's behalf.

```json
{
  "schema": "civic.confirmations/0",
  "by": { "role": "product-management", "who": "taymoork2" },
  "at": "2026-10-12",
  "screens": ["target:notes.index", "target:notes.draft", "target:notes.saved"],
  "paths": [{ "from": "target:notes.index", "to": "target:notes.draft", "action": "Write note" }],
  "journeys": [{ "id": "target:notes.journey.write", "title": "Write a note", "entry": ["target:notes.index"], "exits": ["target:notes.saved"], "screens": ["target:notes.index", "target:notes.draft", "target:notes.saved"] }]
}
```

## Recapturing

```sh
node projects/discovery-app/capture.ts   # from the repository root, with the example committed
node projects/discovery-app/build.ts     # rebuild out/, applying confirmations.json if there is one
bin/civic check
```
