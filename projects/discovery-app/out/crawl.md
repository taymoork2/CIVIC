# Notes example: what the crawl found

Built by `node projects/discovery-app/build.ts` from CIVIC's crawl of the journey engine's manifest-free discovery example at commit `08350211dadd`. 4 screens and 6 paths. Nobody has confirmed them yet, so every screen is discovered and every path proposed; none counts for readiness.

## Screens

| Screen | Location | Presence |
|---|---|---|
| Notes (`index`) | `index.html` | discovered |
| Compose (`draft`) | `draft.html` | discovered |
| Archive (`archive`) | `archive.html` | discovered |
| Saved (`saved`) | `saved.html` | discovered |

## Paths

| From | Action | To | Status |
|---|---|---|---|
| `index` | Write note | `draft` | proposed |
| `index` | Browse archive | `archive` | proposed |
| `draft` | Save note | `saved` | proposed |
| `draft` | Back home | `index` | proposed |
| `archive` | Back home | `index` | proposed |
| `saved` | Back home | `index` | proposed |

## Not taken

Every action was taken.
