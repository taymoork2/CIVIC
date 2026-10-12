import type { ReactNode } from 'react'

import { careSymbolWords } from '@/copy'

/**
 * The care-tag symbols, drawn to the US ASTM D5489 shapes (the same shapes as ISO 3758): the wash
 * tub, the bleach triangle, the dryer square, the iron and the dry-clean circle. Each is an inline
 * SVG on a 32-unit grid, stroked in currentColor at 1.75, so it takes the text color of wherever
 * it sits and scales with `size`. The words each symbol stands for live in copy.ts.
 */

/** Water dots in the tub: 1 cold, 2 warm, 3 hot, 4 very hot; 5 and 6 are rare, hotter still. */
const careSymbolClassName = "care-symbol"

type WashDots = 1 | 2 | 3 | 4 | 5 | 6
/** Bars under the tub: one is permanent press, two is delicate. */
type WashCycle = 'permanent_press' | 'delicate'

const washDots = [1, 2, 3, 4, 5, 6] as const satisfies readonly WashDots[]
const washCycles = ['permanent_press', 'delicate'] as const satisfies readonly WashCycle[]

/** Every symbol, in the order a tag reads: wash, bleach, dry, iron, dry clean. */
export const careSymbolKinds = [
  'wash',
  ...washDots.map((dots) => `wash_${dots}` as const),
  ...washCycles.map((cycle) => `wash_${cycle}` as const),
  ...washDots.flatMap((dots) => washCycles.map((cycle) => `wash_${dots}_${cycle}` as const)),
  'hand_wash',
  'do_not_wash',
  'bleach',
  'bleach_non_chlorine',
  'do_not_bleach',
  'tumble_dry',
  'tumble_dry_low',
  'tumble_dry_medium',
  'tumble_dry_high',
  'tumble_dry_no_heat',
  'do_not_tumble_dry',
  'line_dry',
  'drip_dry',
  'dry_flat',
  'iron_low',
  'iron_medium',
  'iron_high',
  'do_not_iron',
  'steam',
  'do_not_steam',
  'dry_clean',
  'dry_clean_p',
  'do_not_dry_clean',
] as const

export type CareSymbolKind =
  | 'wash'
  | `wash_${WashDots}`
  | `wash_${WashCycle}`
  | `wash_${WashDots}_${WashCycle}`
  | 'hand_wash'
  | 'do_not_wash'
  | 'bleach'
  | 'bleach_non_chlorine'
  | 'do_not_bleach'
  | 'tumble_dry'
  | 'tumble_dry_low'
  | 'tumble_dry_medium'
  | 'tumble_dry_high'
  | 'tumble_dry_no_heat'
  | 'do_not_tumble_dry'
  | 'line_dry'
  | 'drip_dry'
  | 'dry_flat'
  | 'iron_low'
  | 'iron_medium'
  | 'iron_high'
  | 'do_not_iron'
  | 'steam'
  | 'do_not_steam'
  | 'dry_clean'
  | 'dry_clean_p'
  | 'do_not_dry_clean'

// The list and the type name the same symbols: neither can gain one the other lacks.
type Listed = (typeof careSymbolKinds)[number]
const sameKinds: [Listed, CareSymbolKind] extends [CareSymbolKind, Listed] ? true : never = true
void sameKinds

const dot = (cx: number, cy: number, key: number | string) => <circle key={key} cx={cx} cy={cy} r="1.35" fill="currentColor" stroke="none" />

/** A row of `count` dots centred on x = 16, 4.5 apart. */
const dotRow = (count: number, cy: number, keyFrom = 0) => Array.from({ length: count }, (_, index) => dot(16 + (index - (count - 1) / 2) * 4.5, cy, keyFrom + index))

/** Tub dots: up to three in one row, four to six in two rows (the top row takes the odd one). */
function tubDots(count: number) {
  if (count <= 3) return dotRow(count, 15.5)
  const top = Math.ceil(count / 2)
  return [...dotRow(top, 13), ...dotRow(count - top, 18, top)]
}

const cross = <path d="M5 5 27 27M27 5 5 27" />

const tub = (
  <>
    <path d="M3 5 6.5 23h19L29 5" />
    <path d="M3.4 8q3.1-2.6 6.2 0t6.2 0 6.2 0 6.2 0" />
  </>
)
const bars = (count: number) => (
  <>
    <path d="M6.5 26.5h19" />
    {count > 1 ? <path d="M6.5 30h19" /> : null}
  </>
)
const hand = <path d="M13 21c-1.5 0-2.2-1.2-2.8-2.4l-1.6-3.2a1.1 1.1 0 0 1 1.9-1.1l2.3 2.7v-4.4a1.1 1.1 0 0 1 2.2 0v3.9-4.9a1.1 1.1 0 0 1 2.2 0v4.9-4.4a1.1 1.1 0 0 1 2.2 0v4.4-2.4a1.1 1.1 0 0 1 2.2 0v4.9c0 1.8-1.2 3-3 3z" />
const triangle = <path d="M16 4 29 27H3z" />
const square = <rect x="4" y="4" width="24" height="24" rx="1" />
const drum = <circle cx="16" cy="16" r="8.5" />
const iron = (
  <>
    <path d="M3 25q1.5-10 10-11h16v11z" />
    <path d="M13 14V9h16v5" />
  </>
)

/** The strokes and dots of one symbol, on the 32-unit grid. */
function drawing(kind: CareSymbolKind): ReactNode {
  const wash = /^wash(?:_(\d))?(?:_?(permanent_press|delicate))?$/.exec(kind)
  if (wash) {
    const dots = wash[1] === undefined ? 0 : Number(wash[1])
    const cycle = wash[2] as WashCycle | undefined
    return <>{tub}{tubDots(dots)}{cycle ? bars(cycle === 'delicate' ? 2 : 1) : null}</>
  }
  switch (kind) {
    case 'hand_wash': return <>{tub}{hand}</>
    case 'do_not_wash': return <>{tub}{cross}</>
    case 'bleach': return triangle
    case 'bleach_non_chlorine': return <>{triangle}<path d="M10 27 19.5 10.2M16 27l6.5-11.5" /></>
    case 'do_not_bleach': return <>{triangle}{cross}</>
    case 'tumble_dry': return <>{square}{drum}</>
    case 'tumble_dry_low': return <>{square}{drum}{dotRow(1, 16)}</>
    case 'tumble_dry_medium': return <>{square}{drum}{dotRow(2, 16)}</>
    case 'tumble_dry_high': return <>{square}{drum}{dotRow(3, 16)}</>
    case 'tumble_dry_no_heat': return <>{square}<circle cx="16" cy="16" r="8.5" fill="currentColor" /></>
    case 'do_not_tumble_dry': return <>{square}{drum}{cross}</>
    case 'line_dry': return <>{square}<path d="M4.5 6Q16 16 27.5 6" /></>
    case 'drip_dry': return <>{square}<path d="M11 9v14M16 9v14M21 9v14" /></>
    case 'dry_flat': return <>{square}<path d="M9 16h14" /></>
    case 'iron_low': return <>{iron}{dotRow(1, 20)}</>
    case 'iron_medium': return <>{iron}{dotRow(2, 20)}</>
    case 'iron_high': return <>{iron}{dotRow(3, 20)}</>
    case 'do_not_iron': return <>{iron}{cross}</>
    // Steam wording has a pictogram, not an additional standardized care symbol.
    case 'steam': return <>{iron}<path d="M10 7q-2-2 0-4M17 7q-2-2 0-4M24 7q-2-2 0-4" /></>
    case 'do_not_steam': return <>{iron}<path d="M10 7q-2-2 0-4M17 7q-2-2 0-4M24 7q-2-2 0-4" />{cross}</>
    case 'dry_clean': return <circle cx="16" cy="16" r="11.5" />
    case 'dry_clean_p': return <><circle cx="16" cy="16" r="11.5" /><path d="M12 23V9h6a4 4 0 0 1 0 8h-6" /></>
    case 'do_not_dry_clean': return <><circle cx="16" cy="16" r="11.5" />{cross}</>
    default: return null
  }
}

/**
 * One care symbol. Screen readers hear its words ("Tumble dry, low heat") unless it is
 * `decorative`, when the words beside it already say the same and the drawing is hidden.
 */
export function CareSymbol({ kind, size = 32, decorative = false, className }: {
  kind: CareSymbolKind
  size?: number
  decorative?: boolean
  className?: string
}) {
  const a11y = decorative ? { 'aria-hidden': true as const } : { role: 'img', 'aria-label': careSymbolWords[kind] }
  return (
    <svg
      className={className ? `${careSymbolClassName} ${className}` : careSymbolClassName}
      data-symbol={kind}
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...a11y}
    >
      {drawing(kind)}
    </svg>
  )
}

/** Every symbol with its words, for tests (and a quick look while drawing). No screen shows it. */
export function CareSymbolGallery({ size }: { size?: number }) {
  return (
    <ul className="care-symbol-gallery">
      {careSymbolKinds.map((kind) => (
        <li key={kind}>
          <CareSymbol kind={kind} size={size} decorative />
          <span>{careSymbolWords[kind]}</span>
        </li>
      ))}
    </ul>
  )
}
