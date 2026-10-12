// Builds apps/web/src/generated/tokens.css and apps/web/src/generated/tailwind-theme.css from
// the DTCG sources in src/.
//
// Style Dictionary v5 (see package.json), usesDtcg: true, no transformGroup and no value
// transforms - only the custom "name/verbatim" name transform (last path segment, unchanged)
// so DTCG group nesting never leaks into the CSS custom-property name. The custom
// "washcloset/css-blocks" format wraps an exact, hand-specified declaration order (matching
// the established palette order) in the exact selectors appearance.ts drives, and relies
// on Style Dictionary's own outputReferences-aware property formatter for var(--x) references
// (including ones embedded inside color-mix()/rgba()). A token may keep a DTCG-canonical $value
// (an array for cubicBezier, an object for a provisional native spring) that would not print as
// valid CSS; when that happens $extensions["com.washcloset.web"].css is the literal declaration
// text to use instead - the format always prefers it when present.
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import StyleDictionary from 'style-dictionary'
import { createPropertyFormatter } from 'style-dictionary/utils'

const here = dirname(fileURLToPath(import.meta.url))
const outFile = join(here, '../../apps/web/src/generated/tokens.css')
const tailwindOutFile = join(here, '../../apps/web/src/generated/tailwind-theme.css')

// ---- Exact declaration order, one array per selector block --------------------------------
// Keep declaration ordering stable for review and repeatable token generation.

export const DAY_ORDER = [
  'glass-shadow', 'band', 'bg', 'surface', 'surface-2', 'surface-3', 'sheet', 'choice',
  'choice-line', 'line', 'ink', 'brand-ink', 'ink-2', 'ink-3', 'fill', 'fill-2', 'accent', 'accent-fill',
  'accent-strong', 'accent-soft', 'accent-container', 'on-accent-container', 'on-accent',
  'button', 'on-button', 'button-end', 'button-edge', 'chip-on', 'on-chip-on', 'selected-ring', 'focus', 'ok', 'on-ok', 'scrim',
  'ready-bg', 'ready-ink', 'ready', 'hamper-bg', 'hamper-ink', 'hamper', 'washing-bg',
  'washing-ink', 'washing', 'hanging-bg', 'hanging-ink', 'hanging', 'warn-bg', 'warn-ink',
  'conflict-bg', 'conflict-ink', 'e1', 'e2', 'glass-hi', 'surface-fade', 'plate', 'garment-outline', 'garment-black', 'text-weight', 'text-leading', 'text-tracking', 'load-dark',
  'glass', 'glass-solid', 'glass-border', 'tab-pill', 'sig', 'on-sig', 'on-sig-2', 'sig-ink',
  'now-bg', 'now-ink', 'now-btn-bg', 'now-btn-ink', 'font-brand', 'font-text', 'font-figure', 'font-mono', 'type-value', 'type-dock', 'type-wordmark', 'step--1',
  'step-0', 'step-1', 'step-2', 'step-3', 'step-4', 'figure-sm', 'figure-md', 'figure-lg',
  'figure-xl', 'space-1', 'space-2', 'space-3', 'space-4', 'space-5', 'space-6', 'space-7',
  'radius-card', 'radius-label', 'radius-control', 'radius-field', 'radius-mark', 'rule-width',
  'dur-press', 'dur-step', 'dur-sheet', 'bar-h', 'bar-bottom', 'toast-bottom', 'gutter', 'ease-out', 'spring', 'spring-fast', 'effect', 'paper',
  'label', 'label-sunk', 'rule', 'caution', 'caution-ink', 'caution-tint', 'danger', 'selection',
]

export const NIGHT_ORDER = [
  'bg', 'surface', 'surface-2', 'surface-3', 'sheet', 'choice', 'choice-line', 'band', 'line',
  'ink', 'brand-ink', 'ink-2', 'ink-3', 'fill', 'fill-2', 'button', 'on-button', 'button-end', 'button-edge', 'chip-on',
  'on-chip-on', 'selected-ring', 'accent', 'accent-strong', 'accent-soft', 'accent-container',
  'on-accent-container', 'focus', 'tab-pill', 'ok', 'on-ok', 'scrim', 'ready-bg', 'ready-ink', 'ready',
  'hamper-bg', 'hamper-ink', 'hamper', 'washing-bg', 'washing-ink', 'washing', 'hanging-bg',
  'hanging-ink', 'hanging', 'warn-bg', 'warn-ink', 'conflict-bg', 'conflict-ink', 'e1', 'e2',
  'glass-hi', 'surface-fade', 'plate', 'garment-outline', 'garment-black', 'load-dark', 'glass', 'glass-solid', 'glass-border', 'glass-shadow', 'sig', 'on-sig',
  'sig-ink', 'text-weight', 'text-leading', 'text-tracking',
]

export const SIG_ORDER = [
  'sig-day', 'on-sig-day', 'sig-ink-day', 'sig-night', 'on-sig-night', 'sig-ink-night',
]

// ---- Custom hooks ---------------------------------------------------------------------------

/** The CSS custom-property name is always the last DTCG path segment, unchanged. */
const nameVerbatim = {
  type: 'name',
  transform: (token) => token.path[token.path.length - 1],
}

/** Picks tokens out of a (file-filtered) dictionary by name, in a fixed order. */
function pickByName(dictionary, order) {
  return order.map((name) => {
    const token = dictionary.allTokens.find((candidate) => candidate.name === name)
    if (!token) throw new Error(`washcloset/css-blocks: no token named "${name}" in this file's filtered set`)
    return token
  })
}

/**
 * Wraps an ordered set of declarations in the exact selector(s) for one CSS rule (or a rule
 * nested inside an @media block). `wrap` lists the open/close lines from outermost to
 * innermost; declarations are indented to sit one level past the innermost open line.
 */
const cssBlocks = ({ dictionary, options, file }) => {
  const { order, colorScheme, wrap, declIndent } = file.options
  const formatProperty = createPropertyFormatter({
    outputReferences: options.outputReferences,
    dictionary,
    format: 'css',
    usesDtcg: true,
    formatting: { indentation: declIndent },
  })
  const formatToken = (token) => {
    const override = token.$extensions?.['com.washcloset.web']?.css
    return override === undefined ? formatProperty(token) : `${declIndent}--${token.name}: ${override};`
  }
  const declarations = pickByName(dictionary, order).map(formatToken)
  const body = [
    ...(colorScheme ? [`${declIndent}color-scheme: ${colorScheme};`] : []),
    ...declarations,
  ].join('\n')
  const opens = wrap.map((level) => level.open).join('\n')
  const closes = [...wrap].reverse().map((level) => level.close).join('\n')
  return `${opens}\n${body}\n${closes}\n`
}

// ---- Config -----------------------------------------------------------------------------------

const DAY_GROUPS = new Set(['type', 'space', 'radius', 'motion', 'elevation', 'layout', 'legacy'])
const dayFilter = (token) =>
  (token.path[0] === 'color' && token.path[1] === 'day') || DAY_GROUPS.has(token.path[0])
const nightFilter = (token) => token.path[0] === 'color' && token.path[1] === 'night'
const cobaltFilter = (token) => token.path[0] === 'palette' && token.path[1] === 'cobalt'
const marigoldFilter = (token) => token.path[0] === 'palette' && token.path[1] === 'marigold'

export const config = {
  usesDtcg: true,
  log: { warnings: 'disabled', verbosity: 'silent' },
  source: [
    join(here, 'src/color/day.tokens.json'),
    join(here, 'src/color/night.tokens.json'),
    join(here, 'src/palette/cobalt.tokens.json'),
    join(here, 'src/palette/marigold.tokens.json'),
    join(here, 'src/legacy.tokens.json'),
    join(here, 'src/type.tokens.json'),
    join(here, 'src/space.tokens.json'),
    join(here, 'src/radius.tokens.json'),
    join(here, 'src/motion.tokens.json'),
    join(here, 'src/elevation.tokens.json'),
    join(here, 'src/layout.tokens.json'),
  ],
  hooks: {
    transforms: { 'name/verbatim': nameVerbatim },
    formats: { 'washcloset/css-blocks': cssBlocks },
  },
  platforms: {
    day: {
      transforms: ['name/verbatim'],
      options: { outputReferences: true },
      files: [{
        destination: 'day.css',
        format: 'washcloset/css-blocks',
        filter: dayFilter,
        options: {
          order: DAY_ORDER,
          colorScheme: 'light',
          declIndent: '  ',
          wrap: [{ open: ':root {', close: '}' }],
        },
      }],
    },
    cobalt: {
      transforms: ['name/verbatim'],
      options: { outputReferences: true },
      files: [{
        destination: 'cobalt.css',
        format: 'washcloset/css-blocks',
        filter: cobaltFilter,
        options: {
          order: SIG_ORDER,
          declIndent: '  ',
          wrap: [{ open: ":root,\n:root[data-palette='cobalt'] {", close: '}' }],
        },
      }],
    },
    marigold: {
      transforms: ['name/verbatim'],
      options: { outputReferences: true },
      files: [{
        destination: 'marigold.css',
        format: 'washcloset/css-blocks',
        filter: marigoldFilter,
        options: {
          order: SIG_ORDER,
          declIndent: '  ',
          wrap: [{ open: ":root[data-palette='marigold'] {", close: '}' }],
        },
      }],
    },
    night: {
      transforms: ['name/verbatim'],
      options: { outputReferences: true },
      files: [
        {
          destination: 'night-media.css',
          format: 'washcloset/css-blocks',
          filter: nightFilter,
          options: {
            order: NIGHT_ORDER,
            colorScheme: 'dark',
            declIndent: '    ',
            wrap: [
              { open: '@media (prefers-color-scheme: dark) {', close: '}' },
              { open: "  :root:not([data-theme='light']) {", close: '  }' },
            ],
          },
        },
        {
          destination: 'night-forced.css',
          format: 'washcloset/css-blocks',
          filter: nightFilter,
          options: {
            order: NIGHT_ORDER,
            colorScheme: 'dark',
            declIndent: '  ',
            wrap: [{ open: ":root[data-theme='dark'] {", close: '}' }],
          },
        },
      ],
    },
  },
}

const HEADER = '/* Generated by @washcloset/tokens (packages/tokens/build.mjs). Do not edit; edit the DTCG sources in src/ instead. */\n'

/** Formats every platform in-memory and concatenates them into the single generated CSS text. */
export async function buildCss() {
  const sd = new StyleDictionary(config)
  await sd.hasInitialized
  const day = await sd.formatPlatform('day')
  const cobalt = await sd.formatPlatform('cobalt')
  const marigold = await sd.formatPlatform('marigold')
  const night = await sd.formatPlatform('night')
  const blocks = [...day, ...cobalt, ...marigold, ...night].map((file) => file.output)
  return `${HEADER}\n${blocks.join('\n')}`
}

// ---- The Tailwind v4 theme mapping (packages/tokens' second output) ------------------------
// `@theme { --*: initial }` in app.css clears Tailwind's own defaults, so every Tailwind theme
// key Tailwind should know about has to be re-declared here. Colour/radius/font/ease keys read
// the live WashCloset custom property via var(...) - not its resolved value - so switching
// data-theme/data-palette at runtime still repaints Tailwind-generated utilities. None of these
// are shadcn's bare theme names (--accent, --primary, etc.): WashCloset's own names are used
// throughout, since no shadcn component reads the Tailwind theme yet (see T4).
export const TAILWIND_COLOR_MAP = [
  ['ink', 'ink'], ['ink-2', 'ink-2'], ['ink-3', 'ink-3'],
  ['surface', 'surface'], ['surface-2', 'surface-2'], ['surface-3', 'surface-3'],
  ['line', 'line'],
  ['sig', 'sig'], ['on-sig', 'on-sig'], ['sig-ink', 'sig-ink'],
  ['ready', 'ready'], ['ready-bg', 'ready-bg'], ['ready-ink', 'ready-ink'],
  ['hamper', 'hamper'], ['hamper-bg', 'hamper-bg'], ['hamper-ink', 'hamper-ink'],
  ['washing', 'washing'], ['washing-bg', 'washing-bg'], ['washing-ink', 'washing-ink'],
  ['hanging', 'hanging'], ['hanging-bg', 'hanging-bg'], ['hanging-ink', 'hanging-ink'],
  ['warn-bg', 'warn-bg'], ['warn-ink', 'warn-ink'],
  ['conflict-bg', 'conflict-bg'], ['conflict-ink', 'conflict-ink'],
]
export const TAILWIND_FONT_SIZE_MAP = [
  ['step--1', 'step--1'], ['step-0', 'step-0'], ['step-1', 'step-1'], ['step-2', 'step-2'],
  ['step-3', 'step-3'], ['step-4', 'step-4'],
  ['figure-sm', 'figure-sm'], ['figure-md', 'figure-md'], ['figure-lg', 'figure-lg'], ['figure-xl', 'figure-xl'],
]
export const TAILWIND_RADIUS_MAP = [
  ['card', 'radius-card'], ['label', 'radius-label'], ['control', 'radius-control'], ['field', 'radius-field'], ['mark', 'radius-mark'],
]
export const TAILWIND_FONT_MAP = [['text', 'font-text'], ['figure', 'font-figure']]
export const TAILWIND_EASE_MAP = [['out', 'ease-out']]

/** Tailwind defaults `--*: initial` wipes; re-added literally (not tied to any WashCloset token). */
export const TAILWIND_STATIC = [
  ['--breakpoint-sm', '40rem'],
  ['--breakpoint-md', '48rem'],
  ['--breakpoint-lg', '64rem'],
  ['--breakpoint-xl', '80rem'],
  ['--breakpoint-2xl', '96rem'],
  ['--default-transition-duration', '150ms'],
  ['--default-transition-timing-function', 'cubic-bezier(0.4, 0, 0.2, 1)'],
  ['--spacing', '0.25rem'],
]

/**
 * The `@theme inline` block Tailwind reads its design tokens from. Built independently of the
 * Style Dictionary platforms above (it is a straight var() re-mapping, not a value
 * transformation), but validated against the SAME generated tokens.css text so a renamed or
 * removed WashCloset variable fails the build immediately.
 */
export function buildTailwindTheme(tokensCss) {
  const missing = []
  const declares = (name) => {
    if (!tokensCss.includes(`--${name}:`)) missing.push(name)
    return name
  }
  const lines = [
    ...TAILWIND_COLOR_MAP.map(([twKey, token]) => `  --color-${twKey}: var(--${declares(token)});`),
    ...TAILWIND_FONT_SIZE_MAP.map(([twKey, token]) => `  --text-${twKey}: var(--${declares(token)});`),
    ...TAILWIND_RADIUS_MAP.map(([twKey, token]) => `  --radius-${twKey}: var(--${declares(token)});`),
    ...TAILWIND_FONT_MAP.map(([twKey, token]) => `  --font-${twKey}: var(--${declares(token)});`),
    ...TAILWIND_EASE_MAP.map(([twKey, token]) => `  --ease-${twKey}: var(--${declares(token)});`),
    ...TAILWIND_STATIC.map(([twKey, value]) => `  ${twKey}: ${value};`),
  ]
  if (missing.length > 0) {
    throw new Error(`washcloset/tailwind-theme: not declared in tokens.css: ${missing.join(', ')}`)
  }
  return `${HEADER}\n@theme inline {\n${lines.join('\n')}\n}\n`
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const css = await buildCss()
  await writeFile(outFile, css, 'utf8')
  console.log(`wrote ${outFile} (${css.length} bytes)`)
  const tailwindCss = buildTailwindTheme(css)
  await writeFile(tailwindOutFile, tailwindCss, 'utf8')
  console.log(`wrote ${tailwindOutFile} (${tailwindCss.length} bytes)`)
}
