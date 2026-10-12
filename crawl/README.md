# CIVIC crawl

CIVIC's crawl loop, from [decision 0006](../docs/decisions/0006-deterministic-civic-for-agentic-teams.md) (D34). It discovers an existing app's states before anyone writes an adapter. It explores breadth first from a seed, one actionable element at a time, and treats screens with the same accessibility tree as one state. Everything it finds comes into the graph as discovered, and a person confirms it before it counts. It makes no model calls.

The loop ([`src/explore.ts`](src/explore.ts)) knows no platform. A driver opens a fresh session at the seed, reports what it sees, and acts. The web driver ([`src/playwright.ts`](src/playwright.ts)) uses Playwright. The native driver ([`src/appium.ts`](src/appium.ts)) uses Appium.

## What the crawl does and doesn't do

- **States.** A state is identified by a hash of its accessibility hierarchy (Playwright's `ariaSnapshot` on the web, Appium's page source on native), with input values left out. Its ID comes from where it lives (the URL path), then its title where two states share a location, then the hash.
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
node src/cli.ts --folder ../journey-engine/source/apps/web/examples/discovery-app/src --seed index.html --revision HEAD --input "Title=Crawl note"
node src/cli.ts http://127.0.0.1:3000/ --revision <commit> --out crawl.json
```

It uses headless Chromium through `playwright-core`: Playwright's own Chromium if installed, otherwise Chrome. `CIVIC_BROWSER_PATH` or `CIVIC_BROWSER_CHANNEL` picks another browser.

## Native apps

The native driver speaks the W3C WebDriver protocol to an Appium server you run, with no client library. It reads each state from the page source (UiAutomator2 on Android, XCUITest on iOS) and reduces it to roles and accessible names: a button, a text field named by its hint or label, a switch and whether it's on. What was typed into a field is never part of a state.

- **Actions.** On Android, anything clickable and enabled with a name, from its content description, its text, or the text inside it. On iOS, buttons, links and cells. The same destructive names are blocked.
- **Fresh sessions.** Every try ends the session and starts a new one, so the app starts clean. `appium:noReset` is refused.
- **Staying in the app.** On Android, a state whose package isn't the app's (`appium:appPackage`) is recorded, such as a browser the app opened, but nothing in it is touched.
- **Locations.** An Android state's location is its activity without the `Activity` suffix. An iOS state's location is its navigation bar's name. Where those repeat, the title or the hash tells states apart.
- **Unlike the web,** the driver can't stop the app from writing to its backend. Crawl a test build pointed at a test backend.

```sh
appium --port 4723              # with the uiautomator2 or xcuitest driver installed
node src/cli.ts --appium http://127.0.0.1:4723 --platform android --capabilities caps.json --revision <commit> --out crawl.json
```

`caps.json` holds the session's capabilities, such as `{"platformName": "Android", "appium:automationName": "UiAutomator2", "appium:app": "/path/app.apk", "appium:appPackage": "com.example.notes"}`. The tests run the driver against a stand-in server with Android and iOS sources. `CIVIC_APPIUM_URL`, `CIVIC_APPIUM_CAPS` and `CIVIC_APPIUM_PLATFORM` run one more test against a real Appium server.
