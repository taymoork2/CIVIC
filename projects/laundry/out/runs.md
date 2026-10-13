# Laundry: run evidence by journey

Built by `node projects/laundry/build.ts` from Laundry's review index and a Playwright report of its own review specs, both captured from a Laundry checkout at taymoork2/washcloset commit `783e0742dc07`. 229 screens, 37 tests and replayed runs: 37 passed, 0 failed. No recorded run has been replayed at this commit.

A screen passes when every test that covers it passed, and fails when any did. The specs run against the review server's synthetic fixtures, not a household backend.

| Journey | Kind | Screens | Passing | Failing | No run evidence |
|---|---|---|---|---|---|
| Existing specimens | surface | 166 | 0 | 0 | 166 |
| Appliances | journey | 3 | 3 | 0 | 0 |
| Closet | journey | 3 | 3 | 0 | 0 |
| Cotton/polyester towel | journey | 10 | 10 | 0 | 0 |
| Drying | journey | 2 | 1 | 0 | 1 |
| Family laundry day | journey | 4 | 4 | 0 | 0 |
| Home | journey | 3 | 2 | 0 | 1 |
| Live application | journey | 14 | 14 | 0 | 0 |
| Multicolor pack | journey | 10 | 10 | 0 | 0 |
| Nested quick edits | journey | 2 | 2 | 0 | 0 |
| Products | journey | 3 | 3 | 0 | 0 |
| Saved records | journey | 6 | 6 | 0 | 0 |
| Washing & recovery | journey | 3 | 3 | 0 | 0 |

## Failing tests

None.
