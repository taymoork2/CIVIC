# Laundry: run evidence by journey

Built by `node projects/laundry/build.ts` from the journey engine's review index and a Playwright report of Laundry's own review specs, both captured at commit `58a6c1a09fa8`. 204 screens, 27 tests: 24 passed, 3 failed.

A screen passes when every test that covers it passed, and fails when any did. The specs run against the review server's synthetic fixtures, not a household backend.

| Journey | Kind | Screens | Passing | Failing | No run evidence |
|---|---|---|---|---|---|
| Existing specimens | surface | 155 | 0 | 0 | 155 |
| Appliances | journey | 3 | 0 | 3 | 0 |
| Closet | journey | 3 | 3 | 0 | 0 |
| Cotton/polyester towel | journey | 10 | 0 | 10 | 0 |
| Drying | journey | 2 | 1 | 0 | 1 |
| Family simulation | journey | 4 | 3 | 1 | 0 |
| Home | journey | 3 | 2 | 0 | 1 |
| Multicolor pack | journey | 10 | 0 | 10 | 0 |
| Nested quick edits | journey | 2 | 0 | 2 | 0 |
| Products | journey | 3 | 0 | 3 | 0 |
| Saved records | journey | 6 | 0 | 6 | 0 |
| Washing & recovery | journey | 3 | 3 | 0 | 0 |

## Failing tests

- **returning to the family plan retains a completed wash and an unfinished drying selection** (`rehearsal/source/apps/web/e2e/review-family.spec.ts`, line 128): TimeoutError: locator.click: Timeout 15000ms exceeded. Covers 1 screen(s): `family.washing`.
- **review opens real synthetic sheets without a household connection** (`rehearsal/source/apps/web/e2e/review-workspace.spec.ts`, line 13): Error: expect(locator).toBeVisible() failed Covers 1 screen(s): `intake.pack.final`.
- **every initial named scenario renders a real task drawer** (`rehearsal/source/apps/web/e2e/review-workspace.spec.ts`, line 88): Error: route.home.reminder-visible Covers 34 screen(s): `intake.pack.type`, `intake.pack.whose`, `intake.pack.details`, `intake.pack.fabric`, `intake.pack.color`, `intake.pack.origin`, `intake.pack.dye`, `intake.pack.care`, `intake.pack.stain`, `intake.pack.final`, `records.pack`, `records.pack.edit`, `records.towel`, `records.towel.edit`, `records.profile`, `records.water`, `intake.towel.type`, `intake.towel.whose`, `intake.towel.details`, `intake.towel.fabric`, `intake.towel.color`, `intake.towel.origin`, `intake.towel.dye`, `intake.towel.care`, `intake.towel.stain`, `intake.towel.final`, `records.item.tags`, `records.item.care`, `intake.appliance`, `records.appliance`, `records.appliance.edit`, `intake.product`, `records.product`, `records.product.contents`.
