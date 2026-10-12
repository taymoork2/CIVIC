# Laundry: run evidence by journey

Built by `node projects/laundry/build.ts` from the journey engine's review index and a Playwright report of Laundry's own review specs, both captured at commit `4984688f2e17`. 221 screens, 35 tests: 35 passed, 0 failed.

A screen passes when every test that covers it passed, and fails when any did. The specs run against the review server's synthetic fixtures, not a household backend.

| Journey | Kind | Screens | Passing | Failing | No run evidence |
|---|---|---|---|---|---|
| Existing specimens | surface | 158 | 0 | 0 | 158 |
| Appliances | journey | 3 | 3 | 0 | 0 |
| Closet | journey | 3 | 3 | 0 | 0 |
| Cotton/polyester towel | journey | 10 | 10 | 0 | 0 |
| Drying | journey | 2 | 1 | 0 | 1 |
| Family laundry day | journey | 4 | 2 | 0 | 2 |
| Home | journey | 3 | 2 | 0 | 1 |
| Live application | journey | 14 | 14 | 0 | 0 |
| Multicolor pack | journey | 10 | 10 | 0 | 0 |
| Nested quick edits | journey | 2 | 2 | 0 | 0 |
| Products | journey | 3 | 3 | 0 | 0 |
| Saved records | journey | 6 | 6 | 0 | 0 |
| Washing & recovery | journey | 3 | 3 | 0 | 0 |

## Failing tests

None.
