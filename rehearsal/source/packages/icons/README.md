# @washcloset/icons

One source of icon geometry. Every icon is path data on a 24-unit grid, drawn with stroke and no fill
(round caps and joins, width 1.6). The web app renders it today (`DesignIcon` in `apps/web/src/kit/design-icons.tsx`);
an Xcode asset catalog and Android VectorDrawables for the Swift and Kotlin apps are generated from the same
paths later. There is no runtime icon library and no React in this package.

- `src/index.ts`: `designIconPaths` (home, dock, products, machines), `garmentIconPaths` (one per clothing type),
  `controlIconPaths` (arrows, chevrons, close, search, warning ...), and `iconPaths`, all three together.
- `svg/`: one SVG per icon, written by `node scripts/export-svg.mjs` (stroke `currentColor`, width 1.6). Re-run it after editing paths.

## Lucide paths

`controlIconPaths` is mostly vendored from [Lucide](https://lucide.dev) (ISC; licence in `LICENSE-lucide`).
`scripts/vendor-lucide.mjs` reads Lucide's icon nodes (`{ "icon-name": [[tag, attrs], ...] }`), turns each
`path`, `circle`, `rect`, `line`, `polyline`, `polygon` and `ellipse` into path data, joins them into ONE `d` string
per icon (a leading relative `m` is made absolute so joined pieces do not inherit the pen), and writes
`src/lucide-paths.ts`. The `wanted` map in that script is the list of icons we use (our name -> Lucide name);
add a line and re-run to vendor another. `flask`, `tag` and `storefront` are drawn here in the garment family.
