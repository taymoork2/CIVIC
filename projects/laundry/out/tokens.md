# Laundry: tokens

Built by `node projects/laundry/build.ts` from the design reference's stylesheets (`colors_and_type.css`, `tokens.css`) and the web tokens Laundry's token build generates (`journey-engine/source/apps/web/src/generated/tokens.css`), comparing the custom properties each sets for the default theme by name, with `var()` aliases resolved. The design reference sets 120 and the code 129; 18 names are set by both.

## Set differently: 4

Each is an open Contract Conflict in [`graph.json`](graph.json) until a person decides whether the design or the code changes.

| Token | Design reference | Code |
|---|---|---|
| `--accent` | #164be0 | #1f45ff |
| `--space-2` | 2px | 0.5rem |
| `--space-4` | 4px | 1rem |
| `--space-6` | 6px | 2rem |

## Set the same: 14

`--bg`, `--conflict-bg`, `--e1`, `--e2`, `--font-mono`, `--glass`, `--ink`, `--radius-card`, `--radius-control`, `--radius-mark`, `--ready-bg`, `--selection`, `--surface`, `--washing-bg`

## Only in the design reference: 102

Roles the reference names that the generated tokens don't. Some are the reference's own short names for the same colors, and some are layout and motion roles the code writes as literals. Neither is raised as a conflict.

`--ac`, `--accent-hover`, `--amB`, `--amF`, `--amI`, `--amT`, `--app-max-width`, `--blB`, `--blT`, `--border`, `--card-padding`, `--conflict-fg`, `--conflict-text`, `--control-height`, `--dock-height`, `--drying-bg`, `--drying-fg`, `--ease-drawer-open`, `--ease-journey`, `--ease-standard`, `--fg`, `--focus-ring`, `--font-body`, `--font-display`, `--font-wordmark`, `--gEdge`, `--gHi`, `--leading-body`, `--leading-title`, `--liB`, `--liT`, `--ln`, `--motion-base`, `--motion-drawer-close`, `--motion-drawer-open`, `--motion-fast`, `--motion-sheet`, `--motion-slow`, `--motion-tap`, `--mu`, `--muted`, `--neutral-hover`, `--npB`, `--npL`, `--on-primary`, `--onAm`, `--onRu`, `--page-gutter`, `--pr`, `--primary-hover`, `--radius-group-label`, `--radius-pill`, `--radius-tile`, `--ready-fg`, `--row-min`, `--ruB`, `--ruF`, `--ruI`, `--ruT`, `--s2`, `--sel`, `--sf`, `--sfA`, `--sgB`, `--sgT`, `--shadow-card`, `--shadow-sheet`, `--sheet-padding`, `--space-10`, `--space-12`, `--space-14`, `--space-16`, `--space-18`, `--space-20`, `--space-24`, `--space-28`, `--space-32`, `--space-40`, `--space-44`, `--space-48`, `--space-64`, `--space-8`, `--space-unit`, `--surface-glass`, `--surface-warm`, `--target-min`, `--task-max-width`, `--task-wide-max-width`, `--type-body`, `--type-caption`, `--type-control`, `--type-page`, `--type-section`, `--type-sheet`, `--waiting-bg`, `--waiting-fg`, `--waiting-text`, `--washing-fg`, `--weight-body`, `--weight-control`, `--weight-identity`, `--weight-title`
