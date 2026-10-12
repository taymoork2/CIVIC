# CIVIC crawl

CIVIC's crawl loop, from [decision 0006](../docs/decisions/0006-deterministic-civic-for-agentic-teams.md) (D34). It discovers an existing app's states before anyone writes an adapter. It explores breadth first from a seed, one actionable element at a time, and treats screens with the same accessibility tree as one state. Everything it finds comes into the graph as discovered, and a person confirms it before it counts. It makes no model calls.

The loop ([`src/explore.ts`](src/explore.ts)) knows no platform. A driver opens a fresh session at the seed, reports what it sees, and acts. The web driver ([`src/playwright.ts`](src/playwright.ts)) uses Playwright. An Appium driver for native apps can implement the same three calls.

## What the crawl does and doesn't do

- **States.** A state is identified by a hash of its accessibility hierarchy (Playwright's `ariaSnapshot`), with input values left out. Its ID comes from where it lives (the URL path), then its title where two states share a location, then the hash.
- **Reaching a state again.** The crawl replays the actions from the seed in a fresh browser context, so no state leaks from one try into the next.
- **Destructive actions are blocked.** Links and buttons named delete, remove, pay, purchase, send, sign out and the rest of [`DESTRUCTIVE`](src/explore.ts) are never taken. `--block` adds more names. The web driver also aborts every request that isn't a GET to the app's own origin, so a crawl can't write to a backend or reach another site.
- **Inputs are allowlisted.** The crawl fills only the fields you give it values for. It doesn't submit a form with a required field it has no value for, and records that action as unreached.
- **Limits.** `--max-states` (50) and `--max-depth` (8) bound a crawl, and the result says when one stopped it.
- **Not yet.** It doesn't take screenshots, and it acts only on links and buttons, not on menus, tabs or text it would have to type.

## Output

A `civic.crawl/0` file: the seed, the driver, the revision it ran against, every state with the actions that reach it, every transition, and every action blocked or not reached. The importers' `readCrawl` turns it into discovered screens and proposed `navigates` links, and `applyConfirmations` applies a person's confirmations ([`importers/`](../importers)).

```sh
cd crawl
pnpm install --frozen-lockfile
pnpm run check
pnpm test                       # the loop on fake apps, and one crawl of a static site in a real browser
node src/cli.ts --folder ../rehearsal/source/apps/web/examples/discovery-app/src --seed index.html --revision HEAD --input "Title=Crawl note"
node src/cli.ts http://127.0.0.1:3000/ --revision <commit> --out crawl.json
```

It uses headless Chromium through `playwright-core`: Playwright's own Chromium if installed, otherwise Chrome. `CIVIC_BROWSER_PATH` or `CIVIC_BROWSER_CHANNEL` picks another browser.
