import { garmentIconPaths } from '@washcloset/icons'

import { cn } from '@/lib/utils'

export { garmentIconPaths } from '@washcloset/icons'

/** Category illustration, never a personal photo or evidence of fiber/care facts. */
export function garmentCategoryPhoto(kind: string | null, colorGroup: string | null) {
  return kind === 't_shirt' && colorGroup === 'white' ? '/design/ivory-tee.png' : undefined
}

/** The colour dot beside the icon: the planner's colour groups. Bright is striped and mixed is a grey hatch. */
const dotFills: Readonly<Record<string, string>> = {
  white: '#fbfbf9',
  very_light: '#efe9dc',
  light: '#cfdde8',
  medium: '#7b95a8',
  dark: '#2f4152',
  black: 'var(--garment-black)',
  saturated: 'linear-gradient(135deg, #d9453b 0 33%, #1f9a57 33% 66%, #2f5fd0 66%)',
  unknown: 'repeating-linear-gradient(135deg, #c9ccd3 0 2px, #8f949e 2px 4px)',
}

/**
 * A garment as a line icon. `colorGroup` adds the small colour dot (null reads as mixed); leave it
 * out where no colour is meant, like the type tiles. Decorative: the row or tile already names it.
 */
export function GarmentIcon({ kind, colorGroup, className }: { kind: string | null; colorGroup?: string | null; className?: string }) {
  const path = garmentIconPaths[(kind ?? 'other') as keyof typeof garmentIconPaths] ?? garmentIconPaths.other
  return <span className={cn('garment-icon relative inline-block size-6 flex-none text-ink', className)} aria-hidden="true">
    <svg className="block size-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
    {colorGroup === undefined ? null : <span data-colour={colorGroup ?? 'unknown'} className="absolute -bottom-[3px] -end-[3px] size-[44%] rounded-full border border-solid border-line shadow-[0_0_0_1.5px_var(--surface)]" style={{ background: dotFills[colorGroup ?? 'unknown'] ?? dotFills.unknown }} />}
  </span>
}
