# Laundry: coverage gaps

Built by `node projects/laundry/build.ts` from the journey engine's coverage contract and the same run evidence, at commit `4984688f2e17`. 12 of 13 declared expectations can't yet be shown and proven with a passing run. Each is an open Coverage gap record in [`graph.json`](graph.json), and the gate reports it as advisory.

| Expectation | Gap | Record |
|---|---|---|
| Hanging reminder · visible, dismissed, changed task and exact run check | No passing run covers `route.home.reminder-changed`, `route.drying.reminder-check`. | `collab:coverage-gap.laundry.journey-hanging-reminder` |
| Family of five · complete care loop at 100, 500 and 1000 items | No passing run covers `family.drying`, `family.putaway`. | `collab:coverage-gap.laundry.journey-family-scale-care-loop` |
| First complete care cycle | No passing run covers `legacy.sign-in`, `legacy.setup-first-use`, `legacy.home-one`, `legacy.laundry-hamper`, `legacy.laundry-review`, `legacy.laundry-session`, `legacy.drying-index`, `legacy.put-away`. | `collab:coverage-gap.laundry.journey-first-care-cycle` |
| Change garment wash and dry preferences | `apps/web/src/closet/personal-routine.tsx` exists, but no scenario shows it, so no run can prove it. | `collab:coverage-gap.laundry.interaction-garment-routine` |
| Delete account confirmation | `apps/web/src/account/account-settings.tsx#DeleteSheet` exists, but no scenario shows it, so no run can prove it. | `collab:coverage-gap.laundry.screen-account-delete` |
| Active-use wash cadence and reminders | Declared, but nothing shows it yet: no scenario and no code. | `collab:coverage-gap.laundry.planned-active-use-cadence` |
| Condition checks and replacement tracking | Declared, but nothing shows it yet: no scenario and no code. | `collab:coverage-gap.laundry.planned-condition-replacement` |
| Additional item-specific care warnings | Declared, but nothing shows it yet: no scenario and no code. | `collab:coverage-gap.laundry.planned-item-warnings` |
| Storage, folding and put-away guidance | Declared, but nothing shows it yet: no scenario and no code. | `collab:coverage-gap.laundry.planned-storage-guidance` |
| Delegated care with helper permissions | Declared, but nothing shows it yet: no scenario and no code. | `collab:coverage-gap.laundry.planned-helper-delegation` |
| Native platform journey variants | Declared, but nothing shows it yet: no scenario and no code. | `collab:coverage-gap.laundry.planned-native` |
| Recover from a washer problem | `apps/web/src/laundry/machine-problem.tsx#MachineProblemSheet` exists, but no scenario shows it, so no run can prove it. | `collab:coverage-gap.laundry.screen-machine-problem` |
