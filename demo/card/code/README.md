# Shop's web code (stand-in)

A stand-in for Shop's React checkout. Shop is an illustrative product, so this code is illustrative too. It is written the way a product built on Fluent React v9 would be. It is never compiled or run; CIVIC reads it as text (`readReactProductCode`, decision 0011).

- `OrderSummary.tsx` renders the Order Summary screen: a selectable Card with a header and a footer.
- `GiftOption.tsx` is Shop's wrapper around the Card, the code twin of the Gift option component in the design file.
- `GiftOptions.tsx` renders the Gift options screen with two Gift options.
- `PromoApplied.tsx` renders the Promo applied screen with `vendor/react-card/Card.tsx`, a copy of the library Card that Shop made to show an illustration. CIVIC infers it as a code fork by import: it exports `Card`, the library's name, from Shop's own code. Nobody has confirmed it yet, so it shows up in the gate as a fork awaiting confirmation.
