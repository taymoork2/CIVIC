# Laundry: tokens

Built by `node projects/laundry/build.ts` from the design reference's stylesheets (`colors_and_type.css`, `tokens.css`) and the web tokens Laundry's token build generates (`apps/web/src/generated/tokens.css` in taymoork2/washcloset, captured at `e6542c4b3f2f`). It compares the custom properties each sets by name, with `var()` aliases resolved, for the default theme and for the dark theme laid over it. A name set differently is a Contract Conflict in [`graph.json`](graph.json), decided in [`decisions.json`](../decisions.json) once someone has said whether the design or the code changes. Names only the reference sets are its own short color names and the layout and motion roles the code writes as literals; they are listed, not raised.

## Default theme

The design reference sets 120 and the code 133; 18 names are compared. 0 are set differently, 18 the same, and 102 only in the reference.

Nothing is set differently.

Compared under the app's own name, because the two use the same name for different things ([`token-map.json`](../token-map.json)): `--accent` as `--reference-accent`, `--space-2` as `--reference-space-2`, `--space-4` as `--reference-space-4`, `--space-6` as `--reference-space-6`. The app's own `--accent`, `--space-2`, `--space-4`, `--space-6` keep their meaning and aren't compared with the reference.

Set the same: `--accent`, `--bg`, `--conflict-bg`, `--e1`, `--e2`, `--font-mono`, `--glass`, `--ink`, `--radius-card`, `--radius-control`, `--radius-mark`, `--ready-bg`, `--selection`, `--space-2`, `--space-4`, `--space-6`, `--surface`, `--washing-bg`.

Only in the design reference: `--ac`, `--accent-hover`, `--amB`, `--amF`, `--amI`, `--amT`, `--app-max-width`, `--blB`, `--blT`, `--border`, `--card-padding`, `--conflict-fg`, `--conflict-text`, `--control-height`, `--dock-height`, `--drying-bg`, `--drying-fg`, `--ease-drawer-open`, `--ease-journey`, `--ease-standard`, `--fg`, `--focus-ring`, `--font-body`, `--font-display`, `--font-wordmark`, `--gEdge`, `--gHi`, `--leading-body`, `--leading-title`, `--liB`, `--liT`, `--ln`, `--motion-base`, `--motion-drawer-close`, `--motion-drawer-open`, `--motion-fast`, `--motion-sheet`, `--motion-slow`, `--motion-tap`, `--mu`, `--muted`, `--neutral-hover`, `--npB`, `--npL`, `--on-primary`, `--onAm`, `--onRu`, `--page-gutter`, `--pr`, `--primary-hover`, `--radius-group-label`, `--radius-pill`, `--radius-tile`, `--ready-fg`, `--row-min`, `--ruB`, `--ruF`, `--ruI`, `--ruT`, `--s2`, `--sel`, `--sf`, `--sfA`, `--sgB`, `--sgT`, `--shadow-card`, `--shadow-sheet`, `--sheet-padding`, `--space-10`, `--space-12`, `--space-14`, `--space-16`, `--space-18`, `--space-20`, `--space-24`, `--space-28`, `--space-32`, `--space-40`, `--space-44`, `--space-48`, `--space-64`, `--space-8`, `--space-unit`, `--surface-glass`, `--surface-warm`, `--target-min`, `--task-max-width`, `--task-wide-max-width`, `--type-body`, `--type-caption`, `--type-control`, `--type-page`, `--type-section`, `--type-sheet`, `--waiting-bg`, `--waiting-fg`, `--waiting-text`, `--washing-fg`, `--weight-body`, `--weight-control`, `--weight-identity`, `--weight-title`.

## Dark theme

Only the names the dark theme sets itself, on either side, are compared again: 12 of them. 0 are set differently, 12 the same, and 50 only in the reference.

Nothing is set differently.

Compared under the app's own name, because the two use the same name for different things ([`token-map.json`](../token-map.json)): `--accent` as `--reference-accent`. The app's own `--accent` keeps its meaning and isn't compared with the reference.

Set the same: `--accent`, `--bg`, `--conflict-bg`, `--e1`, `--e2`, `--glass`, `--ink`, `--ready-bg`, `--selection`, `--surface`, `--text-tracking`, `--washing-bg`.

Only in the design reference: `--ac`, `--accent-hover`, `--amB`, `--amF`, `--amI`, `--amT`, `--blB`, `--blT`, `--border`, `--conflict-fg`, `--conflict-text`, `--drying-bg`, `--drying-fg`, `--fg`, `--focus-ring`, `--gEdge`, `--gHi`, `--leading-body`, `--liB`, `--liT`, `--ln`, `--mu`, `--muted`, `--neutral-hover`, `--npB`, `--npL`, `--onAm`, `--onRu`, `--pr`, `--primary-hover`, `--ready-fg`, `--ruB`, `--ruF`, `--ruI`, `--ruT`, `--s2`, `--sel`, `--sf`, `--sfA`, `--sgB`, `--sgT`, `--shadow-card`, `--shadow-sheet`, `--surface-glass`, `--surface-warm`, `--waiting-bg`, `--waiting-fg`, `--waiting-text`, `--washing-fg`, `--weight-body`.
