---
name: A Laundered Closet
description: Your own care labels, product labels, and washer turned into exact loads.
status: historical implementation reference
canonicalDesignContract: ../../docs/design/opendesign.md
colors:
  paper: "#f7f5ee"
  label: "#fffdf9"
  label-sunk: "#eeece5"
  ink: "#20211e"
  ink-2: "#596059"
  cobalt: "#164be0"
  rule: "#c9d3d1"
  teal: "#0e7c73"
  teal-ink: "#07524c"
  teal-tint: "#e3f3f1"
  on-teal: "#ffffff"
  caution: "#d9601f"
  caution-ink: "#8f370c"
  caution-tint: "#fff3ea"
  danger: "#b3261e"
  paper-dark: "#0d1413"
  label-dark: "#162120"
  ink-dark: "#e8efee"
  teal-dark: "#0d6d65"
  teal-ink-dark: "#74d3c8"
  swatch-white: "#ffffff"
  swatch-very-light: "#f3efe6"
  swatch-light: "#d9e4ec"
  swatch-medium: "#7b95a8"
  swatch-dark: "#2f4152"
  swatch-black: "#121212"
  swatch-saturated-red: "#dd3333"
  swatch-saturated-green: "#1a8f4e"
  swatch-saturated-blue: "#2a55c9"
typography:
  brand:
    fontFamily: "'Iowan Old Style', 'Palatino Linotype', Georgia, serif"
    fontSize: "1.1rem"
    fontWeight: 600
    lineHeight: 1.2
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "clamp(5rem, 26vw, 7.25rem)"
    fontWeight: 900
    lineHeight: 0.85
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "2.5rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.01em"
  figure:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 0.95
    fontFeature: "tnum"
  figure-sm:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
  figure-md:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "2rem"
    fontWeight: 800
  figure-lg:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "3.25rem"
    fontWeight: 800
  figure-xl:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "4rem"
    fontWeight: 900
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 700
    lineHeight: 1.3
rounded:
  mark: "4px"
  field: "10px"
  control: "12px"
  label: "14px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
  "7": "48px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.label}"
    rounded: "{rounded.control}"
    height: "48px"
    padding: "0 24px"
  button-large:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.label}"
    rounded: "{rounded.control}"
    height: "56px"
    width: "100%"
  button-secondary:
    backgroundColor: "{colors.label}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "48px"
  label-card:
    backgroundColor: "{colors.label}"
    textColor: "{colors.ink}"
    rounded: "{rounded.label}"
    padding: "16px"
  time-band:
    backgroundColor: "{colors.teal}"
    textColor: "{colors.on-teal}"
    rounded: "{rounded.label}"
    padding: "12px 16px 16px"
  slot-pill:
    textColor: "{colors.teal-ink}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
  slot-pill-current:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.label}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
  caution-panel:
    backgroundColor: "{colors.caution-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.label}"
    padding: "12px 16px"
  field:
    backgroundColor: "{colors.label}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    height: "48px"
---

# Design System: A Laundered Closet

Current design authority is **A Laundered Closet — Design System & Screens** in
OpenDesign. Read the [shared coordination contract](../../docs/design/opendesign.md)
before UI work. The legacy token tables and visual rules below are retained as
historical implementation evidence; they must not override the current canonical
workspace or be silently reapplied to the app.

## Current product direction

The 2026-09-29 rewrite uses warm paper, matte image panels and cobalt actions. A small,
lowercase serif wordmark adds personality; everyday task text uses the platform system sans.
The brand font is Iowan Old Style, with Palatino and Georgia platform fallbacks, defined
in `packages/tokens/src/type.tokens.json`. No font download is needed for the identity.

Home composes an illustrative folded-clothing photograph, fade, real next step and action
in one panel. Active loads use the recorded stage and machine instead. Closet consolidates
matching pieces into tiles and filters All / Ready / Needs care. Household preserves
Appliances / Products / People navigation. Me separates overview and completed care history
from App settings. Actual care labels, machine times and product directions remain the source
of planning decisions; unknowns stay unknown.

Glass is reserved for navigation chrome, with solid fallbacks for reduced transparency and
contrast. Tonal navigation is a persisted alternative. Phone, tablet and desktop share the
same panels and controls; desktop uses a compact floating navigation rail. Press, selection
and entrance motion use transform and opacity, with reduced-motion support.

Web elevation uses shared `--shadow-sm`, `--shadow-md` and `--shadow-lg` tokens: garment
and appliance tiles sit just above the page, heroes have a little more separation, and sheets
and menus float above both. Content remains opaque; glass stays on navigation. Missing
garment photography falls back to generated category photography on a softly lit tabletop,
with real textile texture and full image-panel fades. Coats, suits, pajama sets, bodysuits,
paired socks, bottoms and linens retain recognizable compositions. Underwear cut follows
explicit item naming, not the owner's gender; unclassified underwear uses neutral folded cloth.
Matching tee color variants are used where available. Recorded colors remain visible and
independent of wash-planning groups; never tint an entire photograph to fake a match.
Appliance and packaging photos use recognizable proportions and closures; generated images
represent categories, not verified brand identity, exact models or care evidence. Icons are one stroke family
(24-unit grid, 1.6 stroke) from `packages/icons`: our own laundry and garment drawings plus vendored Lucide controls, with no icon library at runtime.
Native apps use Liquid Glass/Material platform components;
web uses shared shadcn controls and Tailwind utilities.

### Styling implementation

All screen and component presentation lives in static Tailwind class expressions.
Shared buttons, fields, inputs, textareas, selects and segmented controls use the
shadcn primitives in `src/components/ui/`. The native dialog and popover behavior
remains in the shared sheet and menu components.

`src/app.css` contains Tailwind setup, generated theme tokens, document defaults,
keyframes and native View Transition rules. It contains no component selectors;
the former `styles.css` and `product.css` are removed. Token sources remain in
`packages/tokens/src/`, with generated Tailwind font sizes using `--text-*`.

Run `pnpm --filter @washcloset/web check:styles` to compile the app's static
utility candidates and reject additional component stylesheets. This guard also
runs with the normal type check.

The rest of this document records the earlier label-inspired direction. Its legacy teal and
condensed headline examples do not override the current token sources or product composition.

> Historical reference. Current colors and type are defined in `packages/tokens/src/`.

## Overview

**Creative North Star: "The Back-Label Directions"**

Every laundry product carries a small panel of directions on its back label: a coloured band, a measuring cup, a dose, where it goes. WashCloset is that panel rewritten for one household's own load. Screens are label stock (white, ruled in ink, corners gently rounded) laid on a cool green-grey ground; one teal band per screen carries time; amounts and times are set in condensed figures you can read at arm's length; words are set in a face designed for low vision. Nothing floats and nothing glows: elevation is the ink rule.

The system is built for the laundry room first: one hand, wet fingers, harsh or dim light, a shared front-loader whose door locks. The step in hand is printed large with its single action; everything else is the record. Setup at a desk uses the same stock, wider, with a rail instead of tabs. Anything unconfirmed or held back is set apart in the caution colour and never hidden.

**Key Characteristics:**
- Label stock on paper: white cards with a 2px ink rule, no shadows.
- One teal band per screen, and it always means time.
- Condensed tabular figures for every amount and time; hyperlegible words for everything else.
- A measuring cup filled to the dose, outlined slot pills for where it goes, tilted stamps for what happened.
- Caution panels (orange rule, warm tint) for held-back garments, unconfirmed labels, and blockers.

## Colors

A restrained palette: cool neutrals, one teal that means time and state, one caution orange that means "not yet confirmed".

### Primary
- **Rinse Teal** (#0e7c73; dark #0d6d65): the time band (cycle length before Start, ready time after), the brand mark, the fill of the current step's cup, switch-on state. Never used as decoration or as a card header.
- **Deep Teal Ink** (#07524c; dark #74d3c8): teal text on label stock, slot pill text, "Label read" and "Done" stamps, links.
- **Teal Tint** (#e3f3f1; dark #133330): the row of the step in hand, positive notices.

### Secondary
- **Caution Orange** (#d9601f; dark #f08a4b) with **Caution Ink** (#8f370c; dark #ffb98f) on **Caution Tint** (#fff3ea; dark #2a1a10): held-back garments, unconfirmed care and product labels, reasons a load cannot start.

### Neutral
- **Paper** (#eef2f1; dark #0d1413): the page ground and the browser theme colour.
- **Label Stock** (#ffffff; dark #162120): every card and field.
- **Sunk Stock** (#f5f8f7; dark #1b2826): nested forms and planned-load headers.
- **Ink** (#111a19; dark #e8efee): text, the 2px card rule, primary buttons, the filled slot pill of the step in hand, focus rings.
- **Second Ink** (#4a5a58; dark #a2b3b0): metadata, cues, phase titles.
- **Rule** (#c9d3d1; dark #2f3e3b): 1px dividers inside a card.
- **Danger** (#b3261e; dark #ff8f86): destructive actions and error text only.

### Data colours
- **Garment swatches** (white #ffffff, very light #f3efe6, light #d9e4ec, medium #7b95a8, dark #2f4152, black #121212, saturated as a red/green/blue split, unknown as a hatched rule): a small outlined square beside a garment showing its colour group. They encode data, never decoration, and appear nowhere else.

### Named Rules
**The Teal Means Time Rule.** The teal band appears at most once per screen and only carries time (a cycle length or a ready time) or the brand. Load headers, section headers, and decoration never use it.

**The Caution Is Visible Rule.** Anything unconfirmed, held back, or blocking is shown in a caution panel or caution stamp. It is never hidden, greyed out, or folded away.

## Typography

**Display Font:** Barlow Condensed 700/800/900, self-hosted (with Arial Narrow)
**Body Font:** Atkinson Hyperlegible Next Variable, self-hosted (with system-ui)

**Character:** The condensed face prints figures the way a label prints a dose: big, narrow, and tabular. Atkinson carries every word, chosen for legibility at arm's length in poor light.

### Hierarchy
- **Display** (900, clamp(5rem, 26vw, 7.25rem), line-height 0.85): the ready time on the band; 4rem when shown on Home.
- **Headline** (800, 2.5rem, line-height 1): page titles; the load checklist and load titles use `--figure-md`.
- **Figure** (800, 1.875rem): every dose amount in a list or plan, with its unit set small beside it and a visually hidden space so it reads "30 ml".
- **Figure ramp** (`--figure-sm` 1.5rem, `--figure-md` 2rem, `--figure-lg` 3.25rem, `--figure-xl` 4rem): sequence amounts and the wordmark; the checklist title, task titles and counts; the cycle length and welcome title; the step in hand's amount and the ready time on Home.
- **Title** (700, 1.0625rem): product names, card headings.
- **Body** (400, 1.0625rem, line-height 1.45, max 60ch): prose and descriptions.
- **Label** (700, 0.8125rem): stamps, slot pills, phase titles, metadata.

### Named Rules
**The Figures Are Condensed Rule.** Amounts, times, counts and invite codes use Barlow Condensed with tabular numerals; words never do.

**The Units Follow The Device Rule.** Doses are stored as the label prints them and temperatures in °C; each device shows US units (fl oz, oz, °F) or metric by its region, overridable in Household.

## Layout

Single column. Phone first: a slim header, pages up to 36rem, 16px gutters, and a 64px bottom tab bar (Home, Wardrobe, Plan a load, Household) within thumb reach. From 64rem wide the tabs become a 15rem rail on the left and pages widen to 44rem, left-aligned beside it. The load checklist runs in focus mode: no header, no tabs, a 30rem column, and a back link. Spacing steps are 4, 8, 12, 16, 24, 32 and 48px; sections sit 24px apart; card sections pad 16px.

## Elevation & Depth

Flat. Depth is conveyed by the 2px ink rule around label stock, 1px rules between rows, and the sunk stock of nested forms. There are no box shadows anywhere; the current step is marked with a 4px inner teal-tint ring, not a lift.

### Named Rules
**The Ink Rule Is Elevation Rule.** A surface that matters gets a 2px ink border. Nothing gets a drop shadow, and cards never nest inside cards.

## Shapes

Gently rounded label corners (14px), controls (12px), fields (10px); pills (999px) only for small marks such as slot pills, choices and switches; stamps are nearly square (4px) and tilted -6° once recorded. The measuring cup is a trapezoid filled to the dose; the brand mark is the same cup on a rounded teal square.

## Components

### Buttons
- **Shape:** control corners (12px), 2px ink border.
- **Primary:** ink fill with label-stock text, 48px tall; the large variant is 56px and full width for the one action at the machine.
- **Hover / Active / Focus:** hover shifts the fill slightly toward teal; press moves it down 1px; focus is a 3px ink outline offset 2px.
- **Secondary:** label stock with ink text and border. **On-teal:** white with deep-teal text (constant in both themes) on the band. **Text button:** underlined teal-ink words for secondary actions.

### Label card
- **Corner Style:** 14px. **Background:** label stock. **Border:** 2px ink. **Internal Padding:** 16px, with sections divided by 1px rules.

### Time band
- Rinse Teal with white text and a 2px ink rule. Before Start it shows the cycle length; after Start the ready time in display figures, minutes left, and an 8px progress meter.

### The step in hand
- A label card with an inner teal-tint ring. The cup (52px), the amount in 4rem figures, the product, a filled black slot pill, the label's cue, then one 56px button. Products ask for the amount actually added; tasks are one tap.

### Sequence and stamps
- The load's steps grouped by where they happen (into the empty drum, load, with the garments, close the door, fill the drawer, start, during the cycle). Each row has a cup or task icon, the figure, the product and its slot pill. Recorded rows dim and take a tilted stamp: Done, Skipped or Missed.

### Inputs / Fields
- **Style:** label stock, 2px ink border, 10px corners, 48px tall, label above. **Focus:** 3px ink outline. **Error:** a bold danger notice below the form.

### Navigation
- Phone: fixed bottom tabs with the stroke icons (heavier stroke when current) and labels. Desktop: a rail where the current item sits on label stock with an ink ring.

### Caution panel
- Caution orange 2.5px rule on caution tint, a caution-ink heading, and square orange bullets.

## Do's and Don'ts

### Do:
- **Do** print the step in hand first and large, with exactly one primary action.
- **Do** set every amount and time in Barlow Condensed tabular figures, with the unit small beside it.
- **Do** show where each product goes as a slot pill, saying "in the drawer" on a locked-door washer.
- **Do** name garments by name and colour wherever loads are compared.
- **Do** keep AA contrast in light and dark; give text on teal and white-on-teal buttons their own tokens.

### Don't:
- **Don't** use the teal band for anything but time or the brand.
- **Don't** add drop shadows, nested cards, or a coloured left border to mark state.
- **Don't** add kickers or eyebrow labels above headings.
- **Don't** hide or grey out anything unconfirmed; put it in a caution panel.
- **Don't** show a disabled primary button for "not yet": say what is left as a status line instead.
