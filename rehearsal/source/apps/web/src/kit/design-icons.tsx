import type { SVGProps } from 'react'

import { iconPaths, type IconName } from '@washcloset/icons'

export { designIconPaths, type DesignIconName, type IconName } from '@washcloset/icons'

export type DesignIconProps = Omit<SVGProps<SVGSVGElement>, 'name'> & {
  name: IconName
  /** 20 in rows, links and the dock; 32 in the hero's media tile; '1em' follows the text. */
  size?: number | string
  /** 1.6 like the garment icons; heavier (about 2.2) where a control used to be a bold glyph. */
  strokeWidth?: number
}

/**
 * Any icon from `@washcloset/icons` (the design family, garments and controls): a 24-unit grid, stroke only,
 * round joins and caps. Decorative by default; pass `aria-hidden={undefined}` with a label to name it.
 */
export function DesignIcon({ name, size = 20, strokeWidth = 1.6, ...rest }: DesignIconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" aria-hidden="true" {...rest}>
    <path d={iconPaths[name]} />
  </svg>
}
