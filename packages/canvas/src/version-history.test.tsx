import { expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HistoryList, HistoryMeta, historyAge, historyConnections, historyGraph, historyOrder, historyStatus, type VersionHistory } from './version-history'

const main: VersionHistory = { kind: 'code', status: 'same', main: true, key: 'repo:main', baseKey: 'repo:main', ahead: 0, behind: 0 }
test('history keeps committed inclusion distinct from local edits and unknown ancestry', () => {
  expect(historyStatus({ ...main, main: false, status: 'included', behind: 25 })).toBe('Commit in main · 25 behind')
  expect(historyStatus({ ...main, status: 'diverged', ahead: 1, behind: 78 })).toBe('1 ahead · 78 behind')
  expect(historyStatus({ kind: 'code', status: 'unknown' })).toBe('History unavailable')
  expect(historyStatus({ kind: 'design', status: 'reference' })).toBe('Design snapshot')
  expect(historyStatus({ kind: 'pull-request', status: 'draft' })).toBe('Draft PR')
})
test('ages handle boundaries, invalid dates and future clocks without inventing freshness', () => {
  const now = Date.parse('2026-10-19T03:00:00Z')
  expect(historyAge('2026-10-19T02:59:30Z', now)).toBe('just now')
  expect(historyAge('2026-10-19T02:58:00Z', now)).toBe('2m ago')
  expect(historyAge('2026-10-18T01:00:00Z', now)).toBe('1d ago')
  expect(historyAge('2026-10-19T03:05:00Z', now)).toBe('Clock ahead')
  expect(historyAge('missing', now)).toBeUndefined()
  const dates = renderToStaticMarkup(<HistoryMeta history={{ ...main, updatedAt: '2026-10-18T01:00:00Z', capturedAt: '2026-10-18T02:00:00Z' }} />)
  expect(dates).toContain('Committed')
  expect(dates).toContain('Captured')
  expect(dates).toContain('dateTime="2026-10-18T01:00:00Z"')
  expect(renderToStaticMarkup(<HistoryMeta history={{ kind: 'design', status: 'reference' }} />)).toContain('Age unavailable')
})
test('the rail connects only verified visible relationships, with direction for inclusion', () => {
  const items = [
    { id: 'old', label: 'Old work', history: { ...main, main: false, key: 'repo:old', status: 'included', behind: 25 } },
    { id: 'live', label: 'Running app', history: { ...main, main: false } },
    { id: 'main', label: 'Main', history: main },
    { id: 'mobile', label: 'Phone work', history: { ...main, main: false, key: 'repo:mobile', status: 'diverged', sharedBase: 'abc12345', ahead: 1, behind: 78 } },
    { id: 'unknown', label: 'Unknown', history: { kind: 'code' as const, status: 'unknown' } },
  ]
  const links = historyConnections(items)
  expect(links.find(link => link.from === 'old')).toMatchObject({ to: 'main', kind: 'ancestor' })
  expect(links.find(link => link.to === 'mobile')).toMatchObject({ from: 'main', kind: 'diverged' })
  expect(links.find(link => link.to === 'main' && link.kind === 'linked')?.label).toContain('same revision')
  expect(links.some(link => link.from === 'unknown' || link.to === 'unknown')).toBe(false)
  expect(historyConnections(items.filter(item => ['old', 'mobile'].includes(item.id)))).toEqual([])
})
test('design containment and PR revision links reuse the rail without claiming Git ancestry', () => {
  const items = [
    { id: 'file', label: 'Design file', history: { kind: 'design' as const, status: 'file', key: 'figma:file' } },
    { id: 'frame', label: 'Home', history: { kind: 'design' as const, status: 'frame', key: 'figma:frame', parentKey: 'figma:file' } },
    { id: 'work', label: 'Worktree', history: main },
    { id: 'pr', label: 'PR #3', history: { kind: 'pull-request' as const, status: 'open', key: main.key } },
  ]
  expect(historyConnections(items).map(link => link.kind)).toEqual(['linked', 'linked'])
  expect(historyConnections([{ ...items[1]!, history: { ...items[1]!.history, parentKey: undefined } }, items[2]!])).toEqual([])
  const html = renderToStaticMarkup(<HistoryList items={items.map(item => ({ ...item, content: <span>{item.label}</span> }))} />)
  expect(html).toContain('Home belongs to Design file')
  expect(html).toContain('PR #3 and Worktree share the same revision')
  expect(html).not.toContain('descends from')
})

test('main and included commits share the trunk while independent branches get separate lanes', () => {
  const items = [
    { id: 'main', label: 'Main', history: main },
    { id: 'old', label: 'Old', history: { ...main, main: false, key: 'repo:old', status: 'included' } },
    { id: 'ahead', label: 'Ahead', history: { ...main, main: false, key: 'repo:ahead', status: 'ahead' } },
    { id: 'mobile', label: 'Mobile', history: { ...main, main: false, key: 'repo:mobile', status: 'diverged', sharedBase: 'abc12345' } },
    { id: 'pr', label: 'PR', history: { kind: 'pull-request' as const, status: 'open', key: 'repo:ahead' } },
  ]
  const graph = historyGraph(items)
  expect(graph.lanes).toEqual({ main: 0, old: 0, ahead: 1, mobile: 2, pr: 1 })
  expect(graph.width).toBe(68)
  expect(historyGraph(items.filter(item => item.id === 'mobile')).links).toEqual([])
  const unrelated = historyGraph([...items, { id: 'unknown', label: 'Unknown', history: { kind: 'code', status: 'unknown' } }])
  expect(unrelated.lanes.unknown).not.toBe(unrelated.lanes.main)
  expect(unrelated.links.some(link => link.to === 'unknown' || link.from === 'unknown')).toBe(false)
})

test('history is newest first without pinning current or main, and capture time cannot reorder commits', () => {
  const items = [
    { id: 'selected', history: { ...main, main: false, key: 'repo:old', status: 'included', updatedAt: '2026-10-18T01:00:00Z', capturedAt: '2026-10-18T23:00:00Z' } },
    { id: 'main', history: { ...main, updatedAt: '2026-10-18T03:00:00Z' } },
    { id: 'docs', history: { ...main, main: false, key: 'repo:docs', status: 'ahead', updatedAt: '2026-10-18T19:00:00Z' } },
    { id: 'mobile', history: { ...main, main: false, key: 'repo:mobile', status: 'diverged', updatedAt: '2026-10-17T21:00:00Z' } },
    { id: 'unknown', history: { kind: 'code' as const, status: 'unknown', capturedAt: '2026-10-19T00:00:00Z' } },
  ]
  expect(historyOrder(items).map(item => item.id)).toEqual(['docs', 'main', 'selected', 'mobile', 'unknown'])
  expect(historyOrder(items.filter(item => item.id !== 'main')).map(item => item.id)).toEqual(['docs', 'selected', 'mobile', 'unknown'])
})

test('verified ancestry wins over skewed commit clocks and unknown design lineage stays date ordered', () => {
  const items = [
    { id: 'old', history: { ...main, main: false, key: 'repo:old', status: 'included', updatedAt: '2026-10-20T00:00:00Z' } },
    { id: 'main', history: { ...main, updatedAt: '2026-10-18T03:00:00Z' } },
    { id: 'child', history: { ...main, main: false, key: 'repo:child', status: 'ahead', updatedAt: '2026-10-16T00:00:00Z' } },
  ]
  expect(historyOrder(items).map(item => item.id)).toEqual(['child', 'main', 'old'])
  const designs = [{ id: 'older', history: { kind: 'design' as const, status: 'reference', capturedAt: '2026-10-17T00:00:00Z' } }, { id: 'newer', history: { kind: 'design' as const, status: 'reference', capturedAt: '2026-10-18T00:00:00Z' } }]
  expect(historyOrder(designs).map(item => item.id)).toEqual(['newer', 'older'])
})
