import { expect, test } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { DrumPictures } from '@/kit/ui'
import { utilityCss } from '@/test/markup'

import { appearanceBootScript, appearanceFrom, applyAppearance, defaultAppearance, resolvedTheme } from '@/kit/appearance'

const element = () => {
  const attributes = new Map<string, string>()
  return {
    attributes,
    root: {
      setAttribute: (name: string, value: string) => { attributes.set(name, value) },
      removeAttribute: (name: string) => { attributes.delete(name) },
    } as unknown as HTMLElement,
  }
}

test('System and Cobalt are the default, and anything unreadable falls back to them', () => {
  expect(defaultAppearance).toEqual({ theme: 'system', palette: 'cobalt' })
  expect(appearanceFrom(null)).toEqual(defaultAppearance)
  expect(appearanceFrom('not json')).toEqual(defaultAppearance)
  expect(appearanceFrom('null')).toEqual(defaultAppearance)
  expect(appearanceFrom(JSON.stringify({ theme: 'sepia', palette: 'red' }))).toEqual(defaultAppearance)
  expect(appearanceFrom(JSON.stringify({ theme: 'dark', palette: 'marigold' }))).toEqual({ theme: 'dark', palette: 'marigold' })
})

test('the choice lands on the root as data-theme and data-palette; System leaves the theme to the device', () => {
  const { attributes, root } = element()
  applyAppearance({ theme: 'dark', palette: 'marigold' }, root)
  expect(Object.fromEntries(attributes)).toEqual({ 'data-theme': 'dark', 'data-palette': 'marigold', 'data-material': 'glass', 'data-motion': 'system' })
  applyAppearance({ theme: 'system', palette: 'cobalt' }, root)
  expect(Object.fromEntries(attributes)).toEqual({ 'data-palette': 'cobalt', 'data-material': 'glass', 'data-motion': 'system' })
  applyAppearance({theme:'system',palette:'cobalt',material:'tonal'},root)
  expect(attributes.get('data-material')).toBe('tonal')
  expect(appearanceFrom('{"material":"tonal"}')).toEqual({...defaultAppearance,material:'tonal'})
  expect(appearanceFrom('{"material":"unknown"}')).toEqual(defaultAppearance)
  expect(() => applyAppearance(defaultAppearance, null)).not.toThrow()
})

test('System resolves to the device preference; Light and Dark are themselves', () => {
  expect(resolvedTheme('system', true)).toBe('dark')
  expect(resolvedTheme('system', false)).toBe('light')
  expect(resolvedTheme('light', true)).toBe('light')
  expect(resolvedTheme('dark', false)).toBe('dark')
})

test('the boot script reads the same key and fails quietly', () => {
  expect(appearanceBootScript).toContain('washcloset:prefs:appearance')
  expect(appearanceBootScript).toContain('catch(e){}')
})

// The tokens the switch drives, and the utilities that consume them.

// Read from disk: Vitest serves CSS imports empty. The app has no Node types, so the one call is typed here.
const nodeFs = 'node:fs'
const { readFileSync } = await import(/* @vite-ignore */ nodeFs) as { readFileSync: (path: URL, encoding: 'utf8') => string }
const css = readFileSync(new URL('../generated/tokens.css', import.meta.url), 'utf8')

function renderedCss(element: Parameters<typeof renderToStaticMarkup>[0]): string {
  return utilityCss([...renderToStaticMarkup(element).matchAll(/class="([^"]*)"/g)].map(match => match[1].replaceAll('&amp;', '&').replaceAll('&#x27;', "'").replaceAll('&gt;', '>').replaceAll('&lt;', '<').replaceAll('&quot;', '"')).join(' '))
}

function componentCss(file: string, name: string): string {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8')
  const definition = source.match(new RegExp(`const ${name} = cn\\(([\\s\\S]*?)\\n\\)`))?.[1]
  expect(definition).toBeDefined()
  return utilityCss([...definition!.matchAll(/^\s*("(?:\\.|[^"\\])*")/gm)].map(match => JSON.parse(match[1]!)).join(' '))
}

/** The declarations inside the first rule whose selector is exactly `selector`. */
function ruleBody(selector: string): string {
  const at = css.indexOf(`${selector} {\n`)
  expect(at, selector).toBeGreaterThanOrEqual(0)
  const open = at + selector.length + 2
  return css.slice(open, css.indexOf('}', open)).split('\n').map((line) => line.trim()).filter((line) => line !== '').join('\n')
}

test('System dark and forced Dark set the same Night tokens', () => {
  const system = ruleBody("  :root:not([data-theme='light'])")
  const forced = ruleBody(":root[data-theme='dark']")
  expect(system).toBe(forced)
  expect(forced).toContain('--bg: #090d19;')
  expect(forced).toContain('--selected-ring: inset 0 0 0 2px var(--accent);')
  expect(forced).toContain('--plate: var(--surface-2);')
  expect(forced).toContain('--garment-black: #24262a;')
})

test('a palette only swaps the signature', () => {
  const marigold = ruleBody(":root[data-palette='marigold']")
  const names = marigold.split('\n').map((line) => line.slice(0, line.indexOf(':')))
  expect(names).toEqual(['--sig-day', '--on-sig-day', '--sig-ink-day', '--sig-night', '--on-sig-night', '--sig-ink-night'])
  expect(marigold).toContain('--sig-day: #f0a92e;')
  expect(marigold).toContain('--sig-night: #e3a53d;')
})

test('an unpicked answer or choice stands off the sheet in Night', () => {
  const forced = ruleBody(":root[data-theme='dark']")
  expect(forced).toContain('--choice: var(--surface-2);')
  expect(forced).not.toContain('--choice: #13161b;')
  const answer = renderedCss(createElement(RadioGroup, { children: createElement(RadioGroupItem, { variant: 'card', value: 'cold', children: 'Cold' }) }))
  expect(answer).toContain('background-color: var(--surface);')
  expect(answer).toContain('border-color: var(--line);')
  // The shared icon tile rests on the same surface and line as a card answer.
  const tile = componentCss('./icon-choice-grid.tsx', 'iconChoiceTileClassName')
  expect(tile).toContain('background-color: var(--surface);')
  expect(tile).toContain('inset 0 0 0 1px var(--tw-shadow-color, var(--line))')
})

test('a drum picture waiting on a save never fades; one that can’t be recorded here does', () => {
  const styles = renderedCss(createElement(DrumPictures, { legend: 'How full?', value: null, onPick: () => {}, disabled: true }))
  const opacity = styles.split('\n\n').filter(rule => /opacity:/.test(rule))
  expect(opacity).toHaveLength(1)
  expect(opacity[0]).toContain('.drum-pictures.is-read-only')
  expect(opacity[0]).toContain('opacity: 0.5;')
})

test('shared actions retain touch handling and the minimum target size', () => {
  const styles = renderedCss(createElement(Button, { size: 'icon', children: 'Edit' }))
  expect(styles).toContain('touch-action: manipulation;')
  expect(styles).toContain('user-select: none;')
  expect(styles).toContain('calc(0.25rem * 11)')
  const document = readFileSync(new URL('../app.css', import.meta.url), 'utf8')
  expect(document).toContain('-webkit-tap-highlight-color: transparent;')
  expect(document).toContain("button, a, summary, [role='button'], label:has(input)")
  expect(document).toContain('-webkit-touch-callout: none;')
})
