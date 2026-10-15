# Laundry: objects

**Stand-in.** No ORCA grid exists for Laundry yet. [`inputs/orca-grid.csv`](../inputs/orca-grid.csv) and [`objects.json`](../objects.json) were written from the review index's scenario names, components and path actions to exercise the object map, and a designer's own grid and ties replace them.

Built by `node projects/laundry/build.ts`. The ORCA grid's 3 objects are object records in [`graph.json`](graph.json), owned by Design, and `objects.json` ties journeys and screens to them. A journey's tie says it needs the object; a screen's tie says what it shows of it: its view (detail unless named), and, where declared, its attributes and calls to action. CIVIC suggests a tie wherever a screen's name names an object or one of its other names; a suggestion counts once a person moves it into `objects.json`, and a wrong one goes under `dismissed`. Every finding is advisory and goes to Design. Laundry is built for web only, so no call to action is compared across platforms yet.

| Object | Attributes | Calls to action | Screens that show it | Suggested | Journeys that need it |
|---|---|---|---|---|---|
| Care routine | 5 | 2 | 1 | 9 | 3 |
| Garment | 9 | 3 | 28 | 4 | 6 |
| Load | 5 | 5 | 7 | 13 | 3 |

## Needed by a journey, shown on none of its screens: 2

- Cotton/polyester towel needs Care routine, but none of its 10 screen(s) shows it. CIVIC suggests Cotton/polyester towel · care; a person confirms or dismisses each. (`target:laundry.journey.cotton-polyester-towel`)
- Multicolor pack needs Care routine, but none of its 10 screen(s) shows it. CIVIC suggests Multicolor pack · care; a person confirms or dismisses each. (`target:laundry.journey.multicolor-pack`)

## Attributes shown on one screen and missing on another: 0

Screens with the same view of an object show the same attributes, where they say which they show.

## Calls to action one platform offers and another does not: 0

No object is shown with its calls to action on more than one platform, or every platform offers the same ones.

## Ties CIVIC suggested, waiting for a person: 26

- Drying · one item to put away may show Garment (inferred, suggested by the name "item"); a person confirms or dismisses it before it counts. (`target:laundry.app.drying.putaway-one`)
- Multicolor pack · care may show Care routine (inferred, suggested by the name "care"); a person confirms or dismisses it before it counts. (`target:laundry.intake.pack.care`)
- Cotton/polyester towel · care may show Care routine (inferred, suggested by the name "care"); a person confirms or dismisses it before it counts. (`target:laundry.intake.towel.care`)
- care-family may show Care routine (inferred, suggested by the name "care"); a person confirms or dismisses it before it counts. (`target:laundry.legacy.care-family`)
- closet-add-care may show Care routine (inferred, suggested by the name "care"); a person confirms or dismisses it before it counts. (`target:laundry.legacy.closet-add-care`)
- closet-care-dry may show Care routine (inferred, suggested by the name "care"); a person confirms or dismisses it before it counts. (`target:laundry.legacy.closet-care-dry`)
- closet-care-question-pending may show Care routine (inferred, suggested by the name "care"); a person confirms or dismisses it before it counts. (`target:laundry.legacy.closet-care-question-pending`)
- closet-care-question may show Care routine (inferred, suggested by the name "care"); a person confirms or dismisses it before it counts. (`target:laundry.legacy.closet-care-question`)
- closet-care-wash may show Care routine (inferred, suggested by the name "care"); a person confirms or dismisses it before it counts. (`target:laundry.legacy.closet-care-wash`)
- closet-care-wash may show Load (inferred, suggested by the name "wash"); a person confirms or dismisses it before it counts. (`target:laundry.legacy.closet-care-wash`)
- closet-first-wash may show Load (inferred, suggested by the name "wash"); a person confirms or dismisses it before it counts. (`target:laundry.legacy.closet-first-wash`)
- drying-second-wash may show Load (inferred, suggested by the name "wash"); a person confirms or dismisses it before it counts. (`target:laundry.legacy.drying-second-wash`)
- household-laundry-day may show Load (inferred, suggested by the name "laundry day"); a person confirms or dismisses it before it counts. (`target:laundry.legacy.household-laundry-day`)
- laundry-day-hang-now may show Load (inferred, suggested by the name "laundry day"); a person confirms or dismisses it before it counts. (`target:laundry.legacy.laundry-day-hang-now`)
- laundry-day-home-until may show Load (inferred, suggested by the name "laundry day"); a person confirms or dismisses it before it counts. (`target:laundry.legacy.laundry-day-home-until`)
- laundry-day-plan may show Load (inferred, suggested by the name "laundry day"); a person confirms or dismisses it before it counts. (`target:laundry.legacy.laundry-day-plan`)
- laundry-day-scale may show Load (inferred, suggested by the name "laundry day"); a person confirms or dismisses it before it counts. (`target:laundry.legacy.laundry-day-scale`)
- laundry-day-spread may show Load (inferred, suggested by the name "laundry day"); a person confirms or dismisses it before it counts. (`target:laundry.legacy.laundry-day-spread`)
- laundry-day-strip-open may show Load (inferred, suggested by the name "laundry day"); a person confirms or dismisses it before it counts. (`target:laundry.legacy.laundry-day-strip-open`)
- laundry-day-strip may show Load (inferred, suggested by the name "laundry day"); a person confirms or dismisses it before it counts. (`target:laundry.legacy.laundry-day-strip`)
- load-review may show Load (inferred, suggested by the name "load"); a person confirms or dismisses it before it counts. (`target:laundry.legacy.load-review`)
- Item · nested care may show Garment (inferred, suggested by the name "item"); a person confirms or dismisses it before it counts. (`target:laundry.records.item.care`)
- Add clothes · chooser may show Garment (inferred, suggested by the name "clothes"); a person confirms or dismisses it before it counts. (`target:laundry.route.closet.add-choose`)
- Garment · care history may show Care routine (inferred, suggested by the name "care"); a person confirms or dismisses it before it counts. (`target:laundry.route.closet.history`)
- Garment · in running wash may show Load (inferred, suggested by the name "wash"); a person confirms or dismisses it before it counts. (`target:laundry.route.closet.running`)
- Drying · washed pieces queued may show Garment (inferred, suggested by the name "piece"); a person confirms or dismisses it before it counts. (`target:laundry.route.drying.washer-queued`)
