import { expect, test } from 'vitest'
import { workspaceIndex, workspaceResults } from './workspace-search'
import type { AppFlow } from './app-map'

const flows: AppFlow[] = [{ id: 'dialog', label: 'Dialog', section: 'Components', x: 0, y: 0, width: 100, height: 100,
  screens: [{ id: 'open', label: 'Dialog · open', scenario: 'open', partial: false, edges: [] }, { id: 'closed', label: 'Dialog · closed', scenario: 'closed', partial: false, edges: [] }],
}]

test('the search index contains only the supplied current-instance journeys and screen states', () => {
  const index = workspaceIndex(flows)
  expect(index.map(item => item.id)).toEqual(['flow:dialog', 'screen:open', 'screen:closed'])
  expect(workspaceResults(index, 'components OPEN').map(item => item.id)).toEqual(['screen:open'])
  expect(workspaceResults(index, 'screen open').map(item => item.id)).toEqual(['screen:open'])
  expect(workspaceResults(index, 'laundry')).toEqual([])
  expect(workspaceIndex([])).toEqual([])
})

test('search renders at most ten matches and can still reach items beyond the initial ten', () => {
  const index = Array.from({ length: 1000 }, (_, i) => ({ id: String(i), label: `Screen ${i}`, detail: 'Journey', keywords: '', kind: 'screen' as const }))
  expect(workspaceResults(index, '')).toHaveLength(10)
  expect(workspaceResults(index, 'screen 999').map(item => item.id)).toEqual(['999'])
  expect(workspaceResults(index, 'no match')).toEqual([])
})

test('disabled commands remain identifiable and group labels do not collide with screen identities', () => {
  const action = { id: 'play', label: 'Play selected screen', detail: 'Action', keywords: 'preview', kind: 'action' as const, disabled: true }
  expect(workspaceResults([action, ...workspaceIndex(flows)], 'PREVIEW')).toEqual([action])
  expect(new Set(workspaceIndex(flows).map(item => item.id)).size).toBe(3)
})
