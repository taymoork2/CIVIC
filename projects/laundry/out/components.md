# Laundry: components

Built by `node projects/laundry/build.ts` from the design reference's component contract, [`journey-engine/design/laundry-reference/COMPONENTS.md`](../../../journey-engine/design/laundry-reference/COMPONENTS.md), and Laundry's web source (`journey-engine/source/apps/web/src`). Each of the contract's 14 component families is a Semantic component in [`graph.json`](graph.json). A web component exported under the family's name in PascalCase implements it. That link is inferred until someone confirms it, because a shared name is a guess.

## Found on web: 6 of 14

| Family | Web component | Where |
|---|---|---|
| `action-row` | `ActionRow` | `household/household-blocks.tsx` L63 |
| `answer-row` | `AnswerRow` | `laundry/laundry-ui.tsx` L146 |
| `segment-choice` | `SegmentChoice` | `laundry/laundry-ui.tsx` L164 |
| `action-list` | `ActionList` | `laundry/laundry-ui.tsx` L185 |
| `garment-icon` | `GarmentIcon` | `kit/garment-icon.tsx` L28 |
| `load-summary` | `LoadSummary` | `laundry/load-summary.tsx` L102 |

## No web component by that name: 8

`source-row`, `draft-sheet`, `adaptive-task`, `choice-tile`, `choice-chip`, `type-picker`, `action-feedback`, `grouped-secondary-actions`

These may be built under another name or as plain markup, such as a CSS class. They are listed, not raised. Naming a component after its family, or recording which component builds it, lets CIVIC follow it.
