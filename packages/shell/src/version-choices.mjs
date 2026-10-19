export function matchingDraftScreens(rows, selected, scope) {
  if (scope === 'screen' && selected.targetId) return rows.filter(row => row.targetId === selected.targetId)
  if (scope === 'component' && selected.componentId) return rows.filter(row => row.componentId === selected.componentId)
  if (scope === 'component') return rows.filter(row => Boolean(selected.component) && row.component === selected.component && (!selected.componentExport || row.componentExport === selected.componentExport))
  return rows.filter(row => row.id === selected.id || Boolean(selected.route) && row.route === selected.route)
}

export function preferredConnection(rows, remembered) {
  const available = rows.filter(row => row.available)
  return available.find(row => row.key === remembered?.key && row.workspace === remembered.workspace)
    ?? available.find(row => !row.workspace && row.kind === 'live')
    ?? available.find(row => !row.workspace && row.kind !== 'design')
    ?? available.find(row => row.kind !== 'design')
    ?? available[0]
}

export function versionChoices(versions, inventories, selected, active, query = '') {
  const needle = query.trim().toLowerCase()
  const state = selected?.state ?? (selected?.fixture && typeof selected.fixture === 'object' && 'state' in selected.fixture && typeof selected.fixture.state === 'string' ? selected.fixture.state : undefined)
  const groups = versions.flatMap(version => {
    const instances = version.connections.filter(row => ['live', 'isolated'].includes(row.kind))
    const drafts = version.connections.filter(row => !instances.includes(row))
    return [drafts.length ? { ...version, connections: drafts } : null, instances.length ? { ...version, id: drafts.length ? `${version.id}:instances` : version.id, kind: 'instance', connections: instances } : null].filter(Boolean)
  })
  return groups.flatMap(version => {
    const previews = version.connections.flatMap(row => {
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

export function historyOrder(items) {
  const remaining = new Set(items), ordered = []
  const before = new Map(items.map(item => [item, new Set()]))
  for (const item of items) {
    const h = item.history
    const bases = items.filter(other => other !== item && h?.baseKey && other.history?.key === h.baseKey && h.key !== h.baseKey)
    if (h?.status === 'ahead') for (const base of bases) before.get(base).add(item)
    if (h?.status === 'included') for (const base of bases) before.get(item).add(base)
  }
  const time = item => {
    const h = item.history, value = h?.updatedAt ?? (h?.kind !== 'code' ? h?.capturedAt : undefined)
    const date = value ? Date.parse(value) : NaN
    return Number.isFinite(date) ? date : -Infinity
  }
  while (remaining.size) {
    const ready = [...remaining].filter(item => ![...before.get(item)].some(parent => remaining.has(parent)))
    // Contradictory imported relationships must not hang the picker.
    const next = (ready.length ? ready : [...remaining]).sort((a, b) => time(b) - time(a))[0]
    ordered.push(next); remaining.delete(next)
  }
  return ordered
}
