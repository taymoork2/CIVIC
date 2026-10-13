# Rebrand demo

The third demo, after the [Fluent Button](../fluent-button) and the [Card](../card), from [decision 0012](../../docs/decisions/0012-rebrand-blast-radius.md). A design system changes brand. Components that read the brand's tokens follow on their own; the question is what doesn't. CIVIC reads the rebrand as a token release, follows each changed token through the graph to every product instance and screen, and raises each override that won't follow as an open divergence for the product team that owns it.

Everything in [`out/`](out) is built by `node build.ts` from the inputs below and the Button and Card demos' resolved graphs. The build is deterministic and makes no model calls ([decision 0006](../../docs/decisions/0006-deterministic-civic-for-agentic-teams.md)). `bin/signoff` fails if `out/` doesn't match what the inputs produce.

## What a reviewer sees

| Question | Where to look |
|---|---|
| What does the rebrand change? | [`out/harbor.tokens.json`](out/harbor.tokens.json), the new brand as a DTCG file, compared by path with Fluent 2 web light: 58 tokens change. |
| How far does it reach? | [`out/rebrand.md`](out/rebrand.md), the blast radius with counts per level, and the migration table: one row per changed token a component reads, with the components and instances it reaches. |
| What won't follow? | The same file, under Hidden overrides, with one suggested action each. |
| Who decides? | The open divergences in [`out/graph.json`](out/graph.json): owned by Shop's design team, raised by the Card's maintainers. CIVIC never edits a design or code file. |
| What wasn't read? | The same file, under Not read: the native and web components implementations, whose styles bind tokens their own way. They are never counted as unaffected. |

## Harbor, the stand-in brand

Harbor is made up. [`tokens/harbor.theme.json`](tokens/harbor.theme.json) swaps Fluent's brand ramp for a teal one, slot by slot, and doubles the corner radius scale, the way a Fluent theme is made from a brand ramp. `build.ts` applies it to the Fluent web light tokens the Button demo exports and writes the result as a DTCG file, so the comparison reads two token files as it would for a real rebrand. Fluent is only an example design system.

## What it finds

- **The brand colors reach the Button, and no product.** The web Button reads 5 of the changed brand tokens. The Button demo has no product instances, so the blast radius stops at the component.
- **The radius reaches the Card on 3 screens.** The web Card's styles, vendored from `@fluentui/react-card` 9.7.3 in [`sources/`](sources), read `borderRadiusSmall`, `Medium` and `Large`, one per size. Shop's design and code Cards follow on their own: Gift option, Order Summary, Order Summary / Loading, and the React files that build them.
- **Two hidden overrides.** Shop's Order Summary design sets a literal 20px corner radius over `borderRadiusMedium`, the token a default-size Card reads (`useCard.js` defaults `size` to `medium`). Harbor moves the token from 4px to 8px and the literal stays. The Card's maintainers already rejected the literal, so the suggested action is to replace it with the token, and the rebrand is one more reason to land that. Shop's Promo applied design detaches the Card, a confirmed fork, so CIVIC can't tell whether it follows; the suggested action is the one already decided, re-attaching it.
- **One fork waits for confirmation.** The copied Card in `PromoApplied.tsx` is an inferred fork. It is listed, and it becomes a divergence once Shop engineering confirms it.

Each instance is reached by every token its component's styles read, whatever its size, because the graph doesn't record an instance's size. The design instances follow the web tokens because Shop's design file uses the Fluent 2 web kit, whose variables follow them; `build.ts` declares that.
