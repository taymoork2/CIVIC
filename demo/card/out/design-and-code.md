# Design and code

What Shop's React code builds of each design change, screen by screen, and where either uses a copy of the Card (decision 0011). Read from the stand-in code in `code/src` and the design file; static analysis, not behavior.

## Order Summary: Card

2 design instance(s) and 1 code instance(s) of the library component.

- Design changes `corner-radius` (Local cornerRadius 20). The code does not set it. Decided: update-design.
- Design changes `state.selected` (.Card header / Checkbox set to true). The code sets `selected` prop. Not decided yet.
- The code also sets `CardFooter` slot (actions), `CardHeader.header` slot (header.title), `CardHeader.description` slot (header.description), `CardHeader.action` slot (header.action), which the design shows without a change.

## Gift options: Card

1 design instance(s) and 1 code instance(s) of the library component.

- The design uses the component as the library draws it.
- The code also sets `CardHeader.header` slot (header.title), `CardHeader.description` slot (header.description), which the design shows without a change.

## Promo applied: Card

0 design instance(s) and 0 code instance(s) of the library component, and 2 copies of it.

- The design uses a copy of the Card instead of the library's: Card on Promo applied (named "Card"; keeps 6 of the library Card's 9 layers (body, body container, footer, footer container, header, header container)). Confirmed as a fork. Decided: update-design.
- The code uses a copy of the Card instead of the library's: Copy of Card in PromoApplied.tsx (renders code/src/vendor/react-card/Card.tsx, which exports Card, the name of @fluentui/react-card's component; mentions @fluentui/react-card; lives in a vendored folder). Inferred; a person confirms or dismisses it.
