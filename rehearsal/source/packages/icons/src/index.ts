// One source of icon geometry: pure data, no imports. Every icon is one or more subpaths on a 24-unit grid,
// drawn with stroke and no fill (round caps and joins; the web draws them at 1.6). Web renders these today;
// an Xcode asset catalog and Android VectorDrawables are generated from the same paths later.
import { lucidePaths } from './lucide-paths.ts'

/**
 * The design's own stroke icons (LaundryApp.dc.html `IC`), drawn exactly as the prototype draws
 * them: a 24-unit grid, no fill, round joins and caps. Home and the dock use these so the live
 * screens read as the frozen design rather than a different icon family.
 */
export const designIconPaths = {
  home: 'M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z',
  closet: 'M4 3h16v18H4zM12 3v18M9.5 11v2M14.5 11v2',
  laundry: 'M5 2h14v20H5zM5 6h14M12 9a5 5 0 110 10 5 5 0 010-10z',
  washer: 'M5 2h14a1 1 0 011 1v18a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1zM4 6h16M12 9a5 5 0 110 10 5 5 0 010-10z',
  people: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3 3-5 6-5s6 2 6 5M16 5a3 3 0 010 6M18 15c2 .5 3 2 3 5',
  me: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6',
  plus: 'M12 5v14M5 12h14',
  wind: 'M3 8h11a3 3 0 10-3-3M3 12h15a3 3 0 11-3 3M3 16h8',
  tee: 'M8 3L3 6l2 4 2-1v12h10V9l2 1 2-4-5-3q-4 3-8 0z',
  dryer: 'M5 2h14a1 1 0 011 1v18a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1zM4 6h16M12 9a5 5 0 110 10 5 5 0 010-10zM10 12c1 1 3 1 4 2',
  hang: 'M12 5a2 2 0 112 2c0 1-2 1-2 3M3 19l9-7 9 7z',
  fold: 'M4 7h16v10H4zM4 12h16',
  // Products: flat, front-on outlines in the garments' family, drawn from scratch against product photos
  // (2026-10-07). Powder is the scoop heaped with it; the dispensing ball has its wide lid.
  bottle: 'M5 3h5v3l2 1 2-3h3q3 2 3 6v10q0 1-1 1H5q-2 0-2-2v-9q0-3 2-4zM5 6h5M14 9l1-2h2l1 4h-4z',
  softener: 'M6 2.5h5V8l2 1 2-1q3 1 3 4v4l-1 2 1 2q0 1-2 1H7q-2 0-2-2l1-4-1-3q0-2 1-4zM6 8h5M13 11h2q1 0 1 2v3h-3z',
  sanitizer: 'M9.5 2.5h5V5h-5zM9.5 5L8 7v14h8V7l-1.5-2M8 12h8',
  spray: 'M8 3h8l4 2v3h-7v3l4 3 1 7H5l1-7 4-3V8H8zM13 8l4 3',
  pod: 'M6 4Q12 2 18 4Q20 6 20 10Q21 16 18 20Q12 22 6 20Q3 17 4 12Q3 7 6 4zM6 4Q6 10 12 12Q18 14 18 20M12 12Q14 7 20 10',
  powder: 'M3 13h12l5-4 1 2-6 4-1.5 5q-4 2-7.5 0zM3 13l3-5 2 1Q10 4 12 6l3 7',
  dryerSheet: 'M3 13h18v8H3zM7 13L6 4q3-1 6 1t6-1l-1 9',
  /** A dosing cap heaped with scent beads. */
  beads: 'M5 12.5h14l-1.6 8.5H6.6zM8.4 10.6a1.6 1.6 0 110-.01M12 10.6a1.6 1.6 0 110-.01M15.6 10.6a1.6 1.6 0 110-.01M10.2 7.4a1.6 1.6 0 110-.01M13.8 7.4a1.6 1.6 0 110-.01',
  dryerBalls: 'M7 12a4.5 4.5 0 110 9 4.5 4.5 0 010-9zM16 12a4.5 4.5 0 110 9 4.5 4.5 0 010-9zM11.5 4.2a4.5 4.5 0 110 9 4.5 4.5 0 010-9z',
  dispenser: 'M7 3.5h10v3C20 8 21.5 10.5 21 14C20.5 18 17 21 12 21C7 21 3.5 18 3 14C2.5 10.5 4 8 7 6.5zM7 6.5h10M3 14h18',
  drop: 'M12 3C10 6 5.5 10.5 5.5 14.5a6.5 6.5 0 0013 0C18.5 10.5 14 6 12 3zM8.5 14.5a3.5 3.5 0 003.5 3.5',
  pin: 'M12 21s-6-5.4-6-10a6 6 0 1112 0c0 4.6-6 10-6 10zM12 8.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5z',
  key: 'M8 14a4 4 0 110-8 4 4 0 010 8zM11 10h10M18 10v3M15 10v2',
  mail: 'M3 6h18v12H3zM3 6l9 7 9-7',
  gear: 'M12 9a3 3 0 110 6 3 3 0 010-6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  clock: 'M12 3a9 9 0 110 18 9 9 0 010-18zM12 7v5l3 2',
  signout: 'M14 4h6v16h-6M10 8l-4 4 4 4M6 12h10',
  trash: 'M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13',
  hand: 'M4 13h16l-2 7H6zM8 10q1.5-2 0-4M12 10q1.5-2 0-4M16 10q1.5-2 0-4',
  door: 'M6 3h12v18H6zM15 12v.01',
  drawer: 'M4 7h16v12H4zM4 11h16M10 15h4',
  trousers: 'M6 3h12l1 18h-5l-2-11-2 11H5z',
} as const

/**
 * One line icon per clothing type, in the app's icon family (the design family above): a 24-unit grid, no
 * fill, round caps and joins. The first eight are the OpenDesign type tiles; the rest are drawn to match.
 */
export const garmentIconPaths = {
  t_shirt: 'M8 3L3 6l2 4 2-1v12h10V9l2 1 2-4-5-3q-4 3-8 0z',
  shirt: 'M8 3L3 6l2 4 2-1v12h10V9l2 1 2-4-5-3l-4 4zM12 7v14',
  sweater: 'M8 3q4 3 8 0l5 4-1 12h-3V10v11H7V10v9H4L3 7z',
  pants: 'M6 3h12l1 18h-5l-2-11-2 11H5z',
  shorts: 'M5 4h14l1 11h-6l-2-5-2 5H4z',
  skirt: 'M8 4h8l4 16q-8 1.5-16 0zM7.1 7.5h9.8M10 7.5l-1 12.3M14 7.5l1 12.3',
  dress: 'M9 3h6l-1 5 5 13H5l5-13z',
  outerwear: 'M9 3L4 6l-1 13h4l1-8v10h8V11l1 8h4L20 6l-5-3q-3 6-6 0zM12 8.5V21',
  suit: 'M9 3L4 6l-1 13h4l1-8v10h8V11l1 8h4L20 6l-5-3-3 9-3-9zM12 12v9M12 15.5h.01M12 18.5h.01',
  pajamas: 'M9 3L4 6l-1 13h4l1-8v10h8V11l1 8h4L20 6l-5-3-3 3.5zM12 6.5V21M12 10h.01M12 13.5h.01M12 17h.01',
  underwear: 'M4 6h16l-.6 5.5q-5 1.2-6.4 7.5h-4q-1.4-6.3-6.4-7.5zM4.3 9h15.4',
  socks: 'M9 3h6v9l-4 7a3 3 0 01-5-3l3-4z',
  workout: 'M8 3v5q0 2.5-2.5 3.5V21h13V11.5Q16 10.5 16 8V3q0 4.5-4 4.5T8 3zM5.5 16h13',
  baby_bodysuit: 'M8 3L3.5 5.5l1 4L7 9v6.5q0 2.5 2.5 4V21h5v-1.5q2.5-1.5 2.5-4V9l2.5.5 1-4L16 3q-4 2.5-8 0zM10 19.5h4',
  towel: 'M5 4h14v16H5zM5 16h14',
  sheets: 'M12 4l9 4-9 4-9-4zM3 8v8l9 4 9-4V8M3 12l9 4 9-4',
  other: 'M10 6a2 2 0 114 0c0 1.5-2 1.8-2 3.5V12L3 19h18l-9-7',
} as const

/**
 * Generic controls (arrows, chevrons, close, search, warning ...). Most are vendored from Lucide (ISC, see
 * LICENSE-lucide) by scripts/vendor-lucide.mjs; flask, tag and storefront are drawn here in the family above.
 */
export const controlIconPaths = {
  ...lucidePaths,
  pencil: 'M4 15L16 3l5 5L9 20l-6 1zM13 6l5 5M4 15l5 5',
  flask: 'M9 3h6M10 3v6l-5.2 9.4q-1 2.1 1.2 2.1h12q2.2 0 1.2-2.1L14 9V3M7.6 15h8.8',
  tag: 'M3 3h8.5L21 12.5 12.5 21 3 11.5zM7.5 7.5h.01',
  storefront: 'M4 4h16l1 5q0 2-2 2t-2-2q0 2-2 2t-2-2q0 2-2 2T8 9q0 2-2 2T3 9zM5 11v9h14v-9M10 20v-5h4v5',
} as const

/** Every icon by name: the design family, the garments, and the controls. */
export const iconPaths = { ...designIconPaths, ...garmentIconPaths, ...controlIconPaths } as const

export type DesignIconName = keyof typeof designIconPaths
export type GarmentIconName = keyof typeof garmentIconPaths
export type ControlIconName = keyof typeof controlIconPaths
export type IconName = keyof typeof iconPaths
