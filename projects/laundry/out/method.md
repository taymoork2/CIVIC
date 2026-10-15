# Laundry: Atomic Design tiers

Built by `node projects/laundry/build.ts` from [`method.json`](../method.json), a stand-in Atomic Design declaration (decision 0014). Screens are templates by the profile's own rule. Composition can't be checked yet: Laundry's graph records no component placed on any screen and no family inside another, because the design reference describes composition in prose and the web code that composes them isn't read. Findings are advisory.

## Atomic Design (follows the bundled atomic-design profile)

STAND-IN. Laundry's owners haven't declared tiers, so Claude placed the component families from their anatomy in the design reference's COMPONENTS.md, to exercise the profile. adaptive-task is left out on purpose: it is a layout rule for a whole task screen, which Atomic Design has no component tier for. Replace these with the owners' own placements.

| Tier | Holds | Placed by owners | By the profile's rule | Members |
|---|---|---|---|---|
| atom | components | 2 | 0 | choice-chip, garment-icon |
| molecule | components | 6 | 0 | action-feedback, action-row, answer-row, choice-tile, segment-choice, source-row |
| organism | components | 5 | 0 | action-list, draft-sheet, grouped-secondary-actions, load-summary, type-picker |
| template | screens | 0 | 231 | Add clothes · chooser, Appliance editor, Basic appliance intake, Basic product intake, Cotton/polyester towel · care, Cotton/polyester towel · color, Cotton/polyester towel · details, Cotton/polyester towel · dye, and 223 more |

### Composition the tiers don't allow: 0

Nothing to check: no tiered target contains another tiered target in this graph.

### No tier yet: 1

- adaptive-task has no Atomic Design tier (atom, molecule and organism). CIVIC can't suggest one: the graph doesn't record what a library component contains. (`semantic:laundry.adaptive-task`)
