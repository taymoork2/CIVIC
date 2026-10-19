import type { VersionHistory } from './version-history'
export function projectWindowHref(key: string, workspace?: string) {
  const params = new URLSearchParams({ openProject: key })
  if (workspace) params.set('workspace', workspace)
  return `/review?${params}`
}

export function projectWindowDestination(value: string, desktop?: string | null) {
  const url = new URL(value)
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/review' || url.search || url.hash) throw Error('The project window did not return a local CIVIC address')
  if (desktop) url.searchParams.set('desktop', desktop)
  return url.href
}
export function projectShortcut(event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; defaultPrevented: boolean; repeat: boolean; isComposing: boolean }) {
  return event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && !event.defaultPrevented && !event.repeat && !event.isComposing
}
type Choice = { key: string; workspace?: string; kind: string; available: boolean; sourceName?: string; workspaceName?: string; version?: { history?: VersionHistory } }
export type DraftScreen = { id: string; label: string; targetId?: string; componentId?: string; route?: string; component?: string; componentExport?: string; state?: string; fixture?: unknown }
export type AppVersion<T> = { id: string; name: string; description?: string; kind: string; history?: VersionHistory; connections: T[] }

export function versionChoices<T extends Choice>(versions: AppVersion<T>[], inventories: Record<string, DraftScreen[]>, selected: DraftScreen | undefined, active: string | undefined, query = '') {
  const needle = query.trim().toLowerCase()
  const state = selected?.state ?? (selected?.fixture && typeof selected.fixture === 'object' && 'state' in selected.fixture && typeof selected.fixture.state === 'string' ? selected.fixture.state : undefined)
  const groups = versions.flatMap(version => {
    const instances = version.connections.filter(row => ['live', 'isolated'].includes(row.kind))
    const drafts = version.connections.filter(row => !instances.includes(row))
    return [drafts.length ? { ...version, connections: drafts } : null, instances.length ? { ...version, id: drafts.length ? `${version.id}:instances` : version.id, kind: 'instance', connections: instances } : null].filter((row): row is AppVersion<T> => row !== null)
  })
  return groups.flatMap(version => {
    const previews = version.connections.flatMap<{ id: string; row: T; screen: DraftScreen | undefined }>(row => {
      const identity = `${row.workspace ?? ''}:${row.key}`
      return selected ? matchingDraftScreens(inventories[identity] ?? [], selected, 'screen').map(screen => ({ id: `${identity}:${screen.id}`, row, screen })) : [{ id: identity, row, screen: undefined }]
    }).filter(item => `${version.name} ${item.row.sourceName ?? ''} ${item.row.workspaceName ?? ''} ${item.screen?.label ?? ''}`.toLowerCase().includes(needle))
    const current = previews.find(item => !item.row.workspace && item.row.key === active && (!selected || item.screen?.id === selected.id))
    const preferred = preferredConnection(previews.map(item => item.row))
    const preview = current ?? (state ? previews.find(item => item.row === preferred && item.screen?.state === state) : undefined) ?? previews.find(item => item.row === preferred) ?? previews[0]
    if (!preview) return []
    // Design states are authored alternatives, even when they share a connection.
    return version.kind === 'design' ? previews.map(item => ({ ...version, history: item.row.version?.history ?? version.history, id: `${version.id}:${item.id}`, preview: item, previews: [item], current: item === current })) : [{ ...version, history: preview.row.version?.history ?? version.history, ...(version.kind === 'instance' ? { name: preview.row.kind === 'live' ? 'Running app' : 'Test instance' } : {}), preview, previews, current: Boolean(current) }]
  })
}

export function versionCaption(value: string) {
  const revision = value.match(/ · ([a-f0-9]{7,40})$/i)
  return { name: revision ? value.slice(0, -revision[0].length) : value, revision: revision?.[1] }
}

export function versionDetails(value: string) {
  const caption = versionCaption(value)
  const name = caption.name.replace(/ · edited$/, '')
  return { ...caption, name, edited: name !== caption.name }
}

export function checkoutGroup(version: { kind: string; name: string; history?: VersionHistory; connections: { kind: string; sourceName?: string; name?: string }[] }) {
  const branches = [...new Set(version.connections.filter(row => !['live', 'isolated', 'design'].includes(row.kind)).map(row => versionDetails(row.sourceName ?? row.name ?? '').name).filter(Boolean))]
  const revision = version.history?.revision
  const shared = version.kind === 'implementation' && branches.length > 1 && Boolean(revision)
  return { branches, shared, label: shared ? `Commit ${revision!.slice(0, 8)}` : version.name }
}

export function matchingDraftScreens(rows: DraftScreen[], selected: DraftScreen, scope: 'screen' | 'component') {
  if (scope === 'screen' && selected.targetId) return rows.filter(row => row.targetId === selected.targetId)
  if (scope === 'component' && selected.componentId) return rows.filter(row => row.componentId === selected.componentId)
  if (scope === 'component') return rows.filter(row => Boolean(selected.component) && row.component === selected.component && (!selected.componentExport || row.componentExport === selected.componentExport))
  return rows.filter(row => row.id === selected.id || Boolean(selected.route) && row.route === selected.route)
}

export function preferredConnection<T extends Choice>(rows: T[], remembered?: Pick<Choice, 'key' | 'workspace'>) {
  const available = rows.filter(row => row.available)
  return available.find(row => row.key === remembered?.key && row.workspace === remembered.workspace)
    ?? available.find(row => !row.workspace && row.kind === 'live')
    ?? available.find(row => !row.workspace && row.kind !== 'design')
    ?? available.find(row => row.kind !== 'design')
    ?? available[0]
}
