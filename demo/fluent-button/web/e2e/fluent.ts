// What both web evidence specs read: the web mapping, Fluent's DTCG tokens, and the rest
// background each appearance takes in Fluent's Button styles.
import { readFileSync } from 'node:fs'
import mappings from '../../contract/mappings.json' with { type: 'json' }

export const tokens = JSON.parse(readFileSync(new URL('../../tokens/fluent-web-light.tokens.json', import.meta.url), 'utf8')) as Record<string, { $value: string }>
export const web = mappings.platforms.find((platform) => platform.platform === 'web')!

/** The rest-state background token Fluent's Button styles give each appearance. */
export const restBackground: Record<string, string> = {
  primary: 'colorBrandBackground',
  secondary: 'colorNeutralBackground1',
  outline: 'colorTransparentBackground',
  subtle: 'colorSubtleBackground',
  transparent: 'colorTransparentBackground',
}

/** Every semantic variant the web mapping expresses, with its Fluent appearance. */
export const mapped = Object.entries(web.variants).flatMap(([variant, mapping]) => ('expression' in mapping && mapping.expression ? [{ variant, appearance: mapping.expression }] : []))

/** A DTCG colour as getComputedStyle reports it. */
export function cssColor(value: string): string {
  if (value === 'transparent') return 'rgba(0, 0, 0, 0)'
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (!hex) throw new Error(`Unsupported colour ${value}`)
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(hex[1]!.slice(offset, offset + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}
