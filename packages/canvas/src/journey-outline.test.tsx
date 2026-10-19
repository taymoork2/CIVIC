import { expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { JourneyOutline, outlineRows } from './journey-outline'
import type { AppFlow } from './app-map'

const flows: AppFlow[] = [{ id: 'notes', label: 'Write a note', section: 'Screens', x: 0, y: 0, width: 100, height: 100, screens: [
  { id: 'home', label: 'Home', scenario: 'home', partial: false, edges: [] },
  { id: 'saved', label: 'Saved note', scenario: 'saved', partial: false, edges: [] },
] }, { id: 'dialog', label: 'Dialog', section: 'Components', x: 0, y: 0, width: 100, height: 100, screens: [
  { id: 'open', label: 'Open', scenario: 'open', partial: true, edges: [] },
] }]

test('local filtering matches visible section, journey and screen words without changing screen ordinals', () => {
  expect(outlineRows(flows, ' NOTE saved ')).toEqual([{ flow: flows[0], screens: [{ screen: flows[0]!.screens[1], index: 1 }] }])
  expect(outlineRows(flows, 'components')[0]?.flow.id).toBe('dialog')
  expect(outlineRows(flows, 'write')[0]?.screens).toHaveLength(2)
  expect(outlineRows(flows, '  ')).toHaveLength(2)
  expect(outlineRows(flows, 'unavailable')).toEqual([])
  expect(flows[0]!.screens).toHaveLength(2)
})

test('filter results expand matching journeys and retain accessible screen selection', () => {
  const html = renderToStaticMarkup(<JourneyOutline flows={flows} sections={['Screens', 'Components']} query="saved" setQuery={() => {}} focused="notes" expanded={null} viewed="saved" focus={() => {}} focusScreen={() => {}} close={() => {}} />)
  expect(html).toContain('aria-label="Filter journeys and screens"')
  expect(html).toContain('aria-label="Clear navigation filter"')
  expect(html).toContain('aria-expanded="true"')
  expect(html).toContain('aria-current="page"')
  expect(html).toContain('02')
  expect(html).toContain('Saved note')
  expect(html).not.toContain('>Home<')
  expect(html).not.toContain('>Dialog<')
})
