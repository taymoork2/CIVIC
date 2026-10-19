import { expect, test } from 'vitest'
import { checkoutGroup } from './project-choice'

test('identical-content checkouts share a commit label while preserving their branch names', () => {
  const version = { kind: 'implementation', name: 'Docs checkpoint', history: { kind: 'code' as const, status: 'ahead', revision: 'b2ea7f2b12345678' }, connections: [
    { kind: 'implementation', sourceName: 'docs/checkpoint · b2ea7f2b' },
    { kind: 'implementation', sourceName: 't3/redesign · b2ea7f2b' },
  ] }
  expect(checkoutGroup(version)).toEqual({ label: 'Commit b2ea7f2b', shared: true, branches: ['docs/checkpoint', 't3/redesign'] })
  expect(checkoutGroup({ ...version, connections: version.connections.slice(0, 1) }).shared).toBe(false)
  expect(checkoutGroup({ ...version, history: undefined }).shared).toBe(false)
  expect(checkoutGroup({ ...version, kind: 'instance' }).shared).toBe(false)
})
import { matchingDraftScreens, preferredConnection, versionCaption, versionDetails, versionChoices, projectShortcut, projectWindowHref, projectWindowDestination } from './project-choice'

test('the project command shortcut respects composition, other handlers and modified shortcuts', () => {
  const key = { key: 'k', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, repeat: false, isComposing: false }
  expect(projectShortcut(key)).toBe(true)
  expect(projectShortcut({ ...key, metaKey: false, ctrlKey: true })).toBe(true)
  for (const field of ['shiftKey', 'altKey', 'defaultPrevented', 'repeat', 'isComposing']) expect(projectShortcut({ ...key, [field]: true })).toBe(false)
  expect(projectShortcut({ ...key, metaKey: false })).toBe(false)
})
test('new-window links encode registered identities and reject unsafe destinations', () => {
  expect(new URL(projectWindowHref('app:one', 'http://127.0.0.1:3013'), 'http://127.0.0.1:3012').searchParams.get('workspace')).toBe('http://127.0.0.1:3013')
  expect(projectWindowDestination('http://127.0.0.1:4001/review', 'darwin')).toBe('http://127.0.0.1:4001/review?desktop=darwin')
  for (const value of ['https://example.com/review', 'javascript:alert(1)', 'http://user@127.0.0.1/review', 'http://127.0.0.1/review?openProject=loop']) expect(() => projectWindowDestination(value)).toThrow()
})

test('version captions keep the revision separate without dropping edited state or design dates', () => {
  expect(versionCaption('Draft h · model selection · edited · d5669ece')).toEqual({ name: 'Draft h · model selection · edited', revision: 'd5669ece' })
  expect(versionCaption('Running build · d1d9d02')).toEqual({ name: 'Running build', revision: 'd1d9d02' })
  expect(versionCaption('orca-redesign · 2026-10-18')).toEqual({ name: 'orca-redesign · 2026-10-18', revision: undefined })
})

test('version rows separate their title, revision and uncommitted state without parsing design dates', () => {
  expect(versionDetails('Draft h · model selection · edited · d5669ece')).toEqual({ name: 'Draft h · model selection', revision: 'd5669ece', edited: true })
  expect(versionDetails('Main · d1d9d02e')).toEqual({ name: 'Main', revision: 'd1d9d02e', edited: false })
  expect(versionDetails('orca-redesign · 2026-10-18')).toEqual({ name: 'orca-redesign · 2026-10-18', revision: undefined, edited: false })
})

const rows = [
  { key: 'design', kind: 'design', available: true },
  { key: 'live', kind: 'live', available: true },
  { key: 'isolated', kind: 'isolated', workspace: 'http://127.0.0.1:3013', available: true },
]
test('opening an app prefers its remembered work, then its local live implementation', () => {
  expect(preferredConnection(rows)?.key).toBe('live')
  expect(preferredConnection(rows, rows[2])).toEqual(rows[2])
  expect(preferredConnection(rows, { key: 'isolated' })?.key).toBe('live')
  expect(preferredConnection(rows.map(row => ({ ...row, available: row.key !== 'isolated' })), rows[2])?.key).toBe('live')
})
test('apps with no live connection open available implementation work or design drafts', () => {
  expect(preferredConnection(rows.filter(row => row.kind !== 'live'))?.key).toBe('isolated')
  expect(preferredConnection(rows.slice(0, 1))?.key).toBe('design')
  expect(preferredConnection([])).toBeUndefined()
})
test('screen drafts match a stable identity or declared route, never a similar title', () => {
  const selected = { id: 'home', label: 'Home', route: '/', component: 'pages.tsx' }
  const drafts = [{ id: 'isolated.home', label: 'Home', route: '/' }, { id: 'study', label: 'Home' }, { id: 'home', label: 'Alternate home' }, { id: 'project', label: 'Home', route: '/project' }]
  expect(matchingDraftScreens(drafts, selected, 'screen').map(row => row.id)).toEqual(['isolated.home', 'home'])
  expect(matchingDraftScreens(drafts, { id: 'unknown', label: 'Home' }, 'screen')).toEqual([])
})
test('component drafts respect a recorded export, while a file scope can include several screens', () => {
  const drafts = [{ id: 'a', label: 'A', component: 'pages.tsx', componentExport: 'Home' }, { id: 'b', label: 'B', component: 'pages.tsx', componentExport: 'Project' }, { id: 'unknown', label: 'Unspecified', component: 'pages.tsx' }]
  expect(matchingDraftScreens(drafts, { id: 'live', label: 'Home', component: 'pages.tsx', componentExport: 'Home' }, 'component').map(row => row.id)).toEqual(['a'])
  expect(matchingDraftScreens(drafts, { id: 'live', label: 'File', component: 'pages.tsx' }, 'component')).toHaveLength(3)
  expect(matchingDraftScreens(drafts, { id: 'live', label: 'Unknown' }, 'component')).toEqual([])
})
test('registered targets match across design and implementation and reject conflicting route guesses', () => {
  const selected = { id: 'live.home', label: 'Home', route: '/', targetId: 'orca.screen.home' }
  const drafts = [{ id: 'design.empty', label: 'Empty home', targetId: 'orca.screen.home' }, { id: 'other.home', label: 'Home', route: '/', targetId: 'other.screen.home' }]
  expect(matchingDraftScreens(drafts, selected, 'screen')).toEqual([drafts[0]])
})
test('component identity is library-scoped even when exports share a file or name', () => {
  const selected = { id: 'live', label: 'Tabs', componentId: 'orca.web.tabs' }
  const drafts = [{ id: 'work', label: 'Work', componentId: 'orca.web.tabs' }, { id: 'settings', label: 'Settings', componentId: 'orca.web.tabs' }, { id: 'foreign', label: 'Tabs', componentId: 'laundry.web.tabs' }]
  expect(matchingDraftScreens(drafts, selected, 'component')).toEqual(drafts.slice(0, 2))
})

test('a version keeps its current connection and all alternate previews, including isolated evidence', () => {
  const versions = [{ id: 'build', name: 'Main', kind: 'implementation', connections: rows.slice(1) }]
  const choices = versionChoices(versions, {}, undefined, 'live')
  expect(choices).toHaveLength(1)
  expect(choices[0]?.current).toBe(true)
  expect(choices[0]?.preview.row).toEqual(rows[1])
  expect(choices[0]?.previews.map(item => item.row)).toEqual(rows.slice(1))
  expect(versionChoices(versions, {}, undefined, 'unrelated')[0]?.preview.row.key).toBe('live')
})

test('screen selection survives grouping and excludes connections without that registered screen', () => {
  const versions = [{ id: 'build', name: 'Main', kind: 'implementation', connections: rows.slice(1) }]
  const home = { id: 'test.home', label: 'Home', targetId: 'home' }
  const inventories = { ':live': [{ id: 'live.home', label: 'Home', targetId: 'home' }], 'http://127.0.0.1:3013:isolated': [home] }
  const choices = versionChoices(versions, inventories, inventories[':live'][0], 'live')
  expect(choices[0]?.previews.map(item => item.screen?.id)).toEqual(['live.home', 'test.home'])
  expect(versionChoices(versions, inventories, { id: 'missing', label: 'Home', targetId: 'other' }, 'live')).toEqual([])
})

test('different design states stay individually selectable under a shared screen identity', () => {
  const drafts = [{ id: 'ready', label: 'Ready', targetId: 'home' }, { id: 'empty', label: 'Empty', targetId: 'home' }]
  const choices = versionChoices([{ id: 'reference', name: 'Design', kind: 'design', connections: rows.slice(0, 1) }], { ':design': drafts }, { id: 'home', label: 'Home', targetId: 'home' }, 'other')
  expect(choices.map(item => item.preview.screen?.id)).toEqual(['ready', 'empty'])
  expect(new Set(choices.map(item => item.id)).size).toBe(2)
})

test('search can reach an alternate preview beyond the first hundred without matching unrelated copies', () => {
  const connections = Array.from({ length: 120 }, (_, index) => ({ key: `copy-${index}`, kind: 'implementation', available: true, sourceName: `Draft ${index}` }))
  const choices = versionChoices([{ id: 'same-content', name: 'Main', kind: 'implementation', connections }], {}, undefined, 'copy-0', 'draft 119')
  expect(choices).toHaveLength(1)
  expect(choices[0]?.preview.row.key).toBe('copy-119')
  expect(choices[0]?.previews).toHaveLength(1)
  expect(choices[0]?.current).toBe(false)
})

test('switching a component version keeps its selected state instead of taking the first sibling state', () => {
  const selected = { id: 'current.codex', label: 'Segmented · codex', targetId: 'segmented', fixture: { state: 'codex' } }
  const drafts = [{ id: 'other.claude', label: 'Segmented · claude', targetId: 'segmented', state: 'claude' }, { id: 'other.codex', label: 'Segmented · codex', targetId: 'segmented', state: 'codex' }]
  const choices = versionChoices([{ id: 'other', name: 'Draft', kind: 'implementation', connections: rows.slice(1, 2) }], { ':live': drafts }, selected, 'current')
  expect(choices[0]?.preview.screen?.id).toBe('other.codex')
  expect(choices[0]?.previews).toHaveLength(2)
})

test('running and test instances stay outside branch drafts even when they render identical content', () => {
  const connections = [...rows.slice(1), { key: 'main', kind: 'implementation', available: true }]
  const choices = versionChoices([{ id: 'same-build', name: 'Main', kind: 'implementation', connections }], {}, undefined, 'main')
  expect(choices.map(item => item.kind)).toEqual(['implementation', 'instance'])
  expect(choices[0]?.previews.map(item => item.row.key)).toEqual(['main'])
  expect(choices[1]?.previews.map(item => item.row.key)).toEqual(['live', 'isolated'])
  expect(choices[0]?.current).toBe(true)
  expect(choices[1]?.current).toBe(false)
})

test('history follows the selected connection rather than another checkout with identical rendered content', () => {
  const old = { kind: 'code' as const, status: 'included', updatedAt: '2026-10-17T00:00:00Z' }, newer = { kind: 'code' as const, status: 'ahead', updatedAt: '2026-10-18T00:00:00Z' }
  const connections = [{ key: 'old', kind: 'implementation', available: true, version: { history: old } }, { key: 'new', kind: 'implementation', available: true, version: { history: newer } }]
  const choices = versionChoices([{ id: 'same-content', name: 'Draft', kind: 'implementation', history: old, connections }], {}, undefined, 'new')
  expect(choices[0]?.history).toEqual(newer)
})
