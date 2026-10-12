# Rehearsal — Operate mode design handoff

Status: **design proposal**. Not implemented, and not verified in a browser or on a device.
Files: `index.html` (board), `app.html` (live prototype; URL states below), this file.

## Recommendation
Preview-first workbench: a **script rail** (journeys), a **dominant real-app preview**, and a **mark-driven inspector**.
It keeps the Claude Design structure and changes four things:

1. Context is **4 chips** (Persona · Permission · Condition · Display) that open one grouped popover (a sheet on mobile). Persona, permission and data condition stay separate fields. A non-Normal condition turns the chip amber.
2. **Spike marking** is the signature interaction. Press `P` or tap Mark; corner ticks snap to the region under the pointer or focus. Click or `Enter` pins a note that captures the region, app state, build, design revision and full context. *Reproduce* restores the whole context and re-marks the element.
3. **Four independent lanes** per note: working preview · design revision · browser verification · physical-device acceptance. Each status is written in words with an icon. Device acceptance is blocked until browser verification passes.
4. **Bounded inspector**: one selected note with a cropped capture, plus a two-line note list. No stacked screenshots.

Alternatives considered: A, journey/storyboard-led (the filmstrip costs about 20% of the height and doesn't scale to 34 scenarios); B, feedback/review-led (poor for exploring steps that have no notes). Ideas taken from both are folded into the recommendation: numbered steps with note counts, and Reproduce as the triage path.

## Tokens (workbench only)
| token | light | dark |
|---|---|---|
| bg / surface / stage | #F4F5F6 / #FFFFFF / #E6E8EB | #0F1113 / #171A1E / #0B0D0F |
| ink / muted / line | #15171A / #5A6068 / #DCDFE3 | #ECEEF0 / #A0A6AE / #2A2F35 |
| spike (marks only) | #C23A14 | #FF7A52 |
| ok / warn / err | #1C6E46 / #7F5300 / #B3261E | #5CC98F / #E6B44C / #FF8A80 |
| focus | #1F57C3 | #7FA8FF |

- Type: system SF stack. Titles 22/17 at weight 650; UI 15; note text 16/1.5; meta 12–13; mono 12 for IDs, builds and links.
- Spacing: 4 · 8 · 12 · 16 · 24 · 32 · 48.
- Radius: 6 / 10 / 12 / 16 (sheets).
- Motion: 150ms micro, 200ms popover and scrim, 220ms sheets. Ease-out on enter, ease-in on exit. Only transform and opacity animate. Under reduced motion everything is instant.

Reviewed-app styles are scoped to the preview root (`.lx`) and never leak out. The real build should isolate them with an iframe or a shadow root.

## Responsive contract
| width | journeys | context | preview | notes |
|---|---|---|---|---|
| ≥1024 | rail 264 | chips + popover | center, scaled to fit | inspector 368 |
| 768–1023 | left drawer | chips + popover | center | inspector 320 |
| <768 | sheet | sheet | full screen, opens first | sheet (opens after pinning) |

Preview sizes 320 / 393 / 1024 render at their true width and are scaled with `transform` only. The caption states the real size and the fit percentage.

## Interaction and durability rules
- **Draft guard**: if a draft exists, any change to step, journey, context or reproduction opens a confirm dialog. *Keep editing* has default focus; *Discard and switch* is explicit and red.
- **Saved notes and synthetic records are durable** and are never affected by discarding.
- **Save failure** keeps the text, pin and capture in place and shows the error inline. Retry re-sends the captured state, not the current one.
- **Keyboard**: `P` mark · `Esc` exit marking or close sheet · `[` `]` previous / next step. There is a skip link to the preview. All pins, chips and lanes are buttons with names. A live region announces pin, save, error, reproduce and copy.
- **Reproduction link** (plain text): `rehearsal://laundry/{journey}/{step}?persona&role&cond&size&scheme&text&build#{element}`.

## Prototype URL states
`app.html?state=saved|compose|confirm|pending|error|retry|empty`, plus `&sheet=journeys|context|notes`, `&theme=dark` and `&mark=1`.

## Risks
- The towel screens are a stand-in for the real Laundry components, using synthetic record TW-0081.
- Captures are DOM clones, not raster screenshots. Production needs stored, build-pinned evidence.
- Marks depend on stable region annotations (`data-el`) in the reviewed app.
- The 34-scenario → 5-journey mapping is assumed.
- A 1024 preview on a phone is about 36% scale and effectively read-only.
