import { renderToStaticMarkup } from '@/test/markup'
import { expect, test } from 'vitest'

import { controlIconPaths, garmentIconPaths } from '@washcloset/icons'

import { DesignIcon, designIconPaths } from '@/kit/design-icons'

test('every product form has a stroke icon that stays hidden from screen readers', () => {
  for (const name of ['bottle', 'pod', 'powder', 'beads', 'dryerSheet', 'dryerBalls', 'dispenser'] as const) {
    expect(designIconPaths[name]).toMatch(/^M/)
    const markup = renderToStaticMarkup(<DesignIcon name={name} size={32} strokeWidth={1.5} />)
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).toContain('viewBox="0 0 24 24"')
    expect(markup).toContain(`d="${designIconPaths[name]}"`)
  }
})

test('the three icon families share no name and every control icon is one path on the 24 grid', () => {
  const names = [...Object.keys(designIconPaths), ...Object.keys(garmentIconPaths), ...Object.keys(controlIconPaths)]
  expect(new Set(names).size).toBe(names.length)
  for (const d of Object.values(controlIconPaths)) expect(d).toMatch(/^M/)
  expect(renderToStaticMarkup(<DesignIcon name="chevronRight" />)).toContain('stroke-width="1.6"')
})
