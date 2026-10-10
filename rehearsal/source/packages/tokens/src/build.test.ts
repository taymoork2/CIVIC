import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

import { buildCss, buildTailwindTheme, DAY_ORDER, NIGHT_ORDER, SIG_ORDER, TAILWIND_COLOR_MAP } from '../build.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const committedPath = join(here, '../../../apps/web/src/generated/tokens.css')
const committedTailwindPath = join(here, '../../../apps/web/src/generated/tailwind-theme.css')

test('an in-memory rebuild through formatPlatform equals the committed generated file', async () => {
  const rebuilt = await buildCss()
  const committed = await readFile(committedPath, 'utf8')
  expect(rebuilt).toBe(committed)
})

test('the Tailwind theme mapping rebuilds to the committed tailwind-theme.css, and every mapped key still names a real WashCloset variable', async () => {
  const committedTokens = await readFile(committedPath, 'utf8')
  const rebuilt = buildTailwindTheme(committedTokens)
  const committedTailwind = await readFile(committedTailwindPath, 'utf8')
  expect(rebuilt).toBe(committedTailwind)
  for (const name of ['radius-card', 'radius-label', 'radius-control', 'radius-field', 'radius-mark', 'font-text', 'font-figure', 'ease-out']) {
    expect(committedTokens, name).toContain(`--${name}:`)
  }
})

test("no Tailwind color mapping uses one of shadcn's bare theme names", () => {
  const shadcnBareNames = new Set([
    'background', 'foreground', 'primary', 'primary-foreground', 'secondary', 'secondary-foreground',
    'muted', 'muted-foreground', 'accent', 'accent-foreground', 'destructive', 'destructive-foreground',
    'border', 'input', 'ring', 'card', 'card-foreground', 'popover', 'popover-foreground',
  ])
  for (const [twKey] of TAILWIND_COLOR_MAP) {
    expect(shadcnBareNames.has(twKey), twKey).toBe(false)
  }
})

/** The declarations inside the first rule whose selector is exactly `selector`, one per line, trimmed. */
async function ruleBody(selector: string): Promise<string[]> {
  const css = await readFile(committedPath, 'utf8')
  const at = css.indexOf(`${selector} {\n`)
  expect(at, selector).toBeGreaterThanOrEqual(0)
  const open = at + selector.length + 2
  const close = css.indexOf('\n}', open)
  return css.slice(open, close).split('\n').map((line) => line.trim()).filter((line) => line !== '' && line !== '}' && line !== 'color-scheme: dark;')
}

test('the two Night blocks (media query and forced) declare the same things', async () => {
  const media = await ruleBody("  :root:not([data-theme='light'])")
  const forced = await ruleBody(":root[data-theme='dark']")
  expect(media).toEqual(forced)
  expect(media.length).toBe(NIGHT_ORDER.length)
})

test('every declaration order names a real property exactly once per block', () => {
  for (const order of [DAY_ORDER, NIGHT_ORDER, SIG_ORDER]) {
    expect(new Set(order).size).toBe(order.length)
  }
})

test('typography keeps canonical families, rem roles and paired body settings', async () => {
  const day = await ruleBody(':root')
  for (const declaration of [
    "--font-text: 'Source Sans 3', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;",
    "--font-brand: 'Source Serif 4', Georgia, 'Times New Roman', serif;",
    '--font-mono: ui-monospace, Menlo, Monaco, Consolas, monospace;',
    '--step--1: 0.875rem;', '--step-0: 1rem;', '--step-1: 1rem;',
    '--step-2: 1.25rem;', '--step-3: 1.5rem;', '--step-4: 1.875rem;',
    '--type-value: 0.75rem;', '--type-dock: 0.8125rem;', '--type-wordmark: 1.375rem;',
    '--text-weight: 400;', '--text-leading: 1.5;', '--text-tracking: normal;',
  ]) expect(day).toContain(declaration)
  const night = await ruleBody(":root[data-theme='dark']")
  for (const declaration of ['--text-weight: 430;', '--text-leading: 1.55;', '--text-tracking: 0.005em;']) expect(night).toContain(declaration)
})

test('generated custom-property names are unique within each block', async () => {
  const day = await ruleBody(':root')
  const cobalt = await ruleBody(":root,\n:root[data-palette='cobalt']")
  const marigold = await ruleBody(":root[data-palette='marigold']")
  const forced = await ruleBody(":root[data-theme='dark']")
  for (const block of [day, cobalt, marigold, forced]) {
    const names = block.filter((line) => line.startsWith('--')).map((line) => line.slice(0, line.indexOf(':')))
    expect(new Set(names).size).toBe(names.length)
  }
})
