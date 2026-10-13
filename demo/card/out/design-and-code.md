# Design and code

What Shop's React code builds of each design change, screen by screen (decision 0011). Read from the stand-in code in `code/src` and the design file; static analysis, not behavior.

## Order Summary: Card

2 design instance(s) and 1 code instance(s).

- Design changes `corner-radius` (Local cornerRadius 20). The code does not set it. Decided: update-design.
- Design changes `state.selected` (.Card header / Checkbox set to true). The code sets `selected` prop. Not decided yet.
- The code also sets `CardFooter` slot (actions), `CardHeader.header` slot (header.title), `CardHeader.description` slot (header.description), `CardHeader.action` slot (header.action), which the design shows without a change.

## Gift options: Card

1 design instance(s) and 1 code instance(s).

- The design uses the component as the library draws it.
- The code also sets `CardHeader.header` slot (header.title), `CardHeader.description` slot (header.description), which the design shows without a change.
