# Identity: one thing at a time, pictures first

Approved by the owner on 2026-10-07 for laundry day
([preview/laundry-day-identity.html](preview/laundry-day-identity.html); canvas
https://claude.ai/artifact/6yG224CSCzxH7RSJPfVW5w). It is the direction for every
screen: Home, Closet and intake, Household, Me, sign-in and onboarding follow it in
waves. Where an older rule in DESIGN.md or COMPONENTS.md disagrees, this file wins
and the older rule is updated when its screen is redone.

The people: busy, non-technical households on phones, often with one hand. They
should know where things stand at a glance and do the next thing in one tap.

## Rules

1. **Tab screens glance; task screens act.** A screen with the dock shows status and
   one way into each task, as a row you tap (symbol, small eyebrow, the task, where;
   a caret). Filled confirmation buttons, Back links and Save live in sheets and
   task screens, which have no dock, in their footer.
2. **One card per thing; a fact appears once.** A load has one card (its pieces as
   tiles and the four steps: Get ready, Wash, Dry, Put away). Never repeat the
   washer name, piece count or garment list in a caption, a second card and a list.
   One surface level: never a card inside a card.
3. **Pictures before words.** Garments as line tiles, choices with their symbols,
   facts as short values (Normal, warm). Sentences only where a reason matters.
4. **One question or instruction per screen.** A step is its instruction, its
   picture and one plain line. Departures (a different amount, ran out, skip, a
   machine problem) sit behind one quiet "Something different?" row that opens a
   sheet with one list of symbol rows.
5. **Choices are rows or tiles, never stacks of buttons.** Two or three answers share
   one row; four or more are a short list or symbol tiles; a choice that changes a
   whole screen (today's pace) is a small switch that opens a sheet.
6. **A wash is remembered as three facts, as rows.** Washed, dried, used: each row a
   tinted symbol, the word and its value, top to bottom so a value has room and the
   history scrolls (owner, 2026-10-07: vertical, not three columns). A stain result is
   one tinted line under its wash. The date is a quiet heading; the place sits beside it.
7. **Finishing acknowledges the actual task, then keeps its receipt.** Use one
   green check for Saved, membership and completed loads, with a short sans-serif
   heading and actual items/counts or household name. Only a newly confirmed first
   intake save gets a brief 240ms acknowledgement; reduced motion is static.
   Welcome and historical load receipts stay static on open and reload. Keep the
   task's next action. Routine notifications disappear; reminders stay actionable.
8. **Thumb reach.** Single-purpose screens (sign-in, create account when it fits,
   onboarding steps, not found) center their illustration and inputs vertically;
   footers carry the one action.
9. **Held, not blocked.** A piece the app cannot wash safely waits on its own row with
   its reason and options; the rest goes ahead.
10. **Basic first.** Assume what everyone has: a washer and a dryer where recorded, a
   hanger to hang a piece, a towel to lay one flat. Equipment few people own (a heated
   hanging dryer, a steam closet such as an LG Styler, a drying rack) is never offered
   or assumed until the household records it and it is free to use; the add-appliance
   sheet shows Washer and Dryer first and the rest under "Something else?".

## Parts (app: apps/web/src/laundry-kit.tsx)

| Part | Use |
| --- | --- |
| `GarmentTiles` | A load's pieces, three across; the last tile counts the rest |
| `StageBar` | Get ready, Wash, Dry, Put away |
| `LoadCard` | The one load card: tiles and steps; the screen's facts below |
| `TapRow` | The way into a task from a tab screen ("Up next") |
| `ReceiptRows` | How a wash went, as rows (Washed, Dried, Used): Load complete and each wash in a garment's history |
| `CompletionMark` | Shared green check in Saved, membership and completed-load receipts; static by default |

Existing parts keep their roles: `AnswerRow`, `SegmentChoice`, `ActionList`,
symbol tiles, `HelpTip` (a "?" that opens on tap), person circles, colour swatches.

## Look

Warm paper ground, white surfaces at 24px radius with the soft e1 shadow, one
electric-blue action colour, status tints (washing blue, drying yellow, ready
green, conflict red) for symbol tiles and pills. Source Sans 3 for everything;
Source Serif 4 italic only for the wordmark; completion headings use Source Sans 3.
