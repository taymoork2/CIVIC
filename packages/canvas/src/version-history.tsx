import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { RailMarker } from '@civic/shell/ui/rail-marker'
import { arrowPath } from './arrow-routing'
import { historyOrder, type VersionHistory } from '@civic/shell/version-choices'
export { historyOrder, type VersionHistory } from '@civic/shell/version-choices'

type HistoryItem = { id: string; label: string; history?: VersionHistory; current?: boolean; marker?: ReactNode; content: ReactNode }
const laneX = (lane: number) => 10 + lane * 20

export function historyStatus(history?: VersionHistory) {
  if (!history) return 'History unavailable'
  if (history.kind === 'pull-request') return history.status === 'draft' ? 'Draft PR' : 'Open PR'
  if (history.kind === 'design') return ({ reference: 'Design snapshot', file: 'Design file', frame: 'In design file', 'design-branch': 'Design branch' })[history.status] ?? 'Design version'
  if (history.main && history.status === 'same') return 'Local main'
  if (history.status === 'same') return 'Same commit as main'
  if (history.status === 'included') return `Commit in main · ${history.behind} behind`
  if (history.status === 'ahead') return `${history.ahead} ahead of main`
  if (history.status === 'diverged') return `${history.ahead} ahead · ${history.behind} behind`
  return 'History unavailable'
}

export function historyAge(value: string, now = Date.now()) {
  const elapsed = now - Date.parse(value)
  if (!Number.isFinite(elapsed)) return undefined
  if (elapsed < -60_000) return 'Clock ahead'
  if (elapsed < 60_000) return 'just now'
  for (const [size, unit] of [[86400_000, 'd'], [3600_000, 'h'], [60_000, 'm']] as const) if (elapsed >= size) return `${Math.floor(elapsed / size)}${unit} ago`
}

export function HistoryMeta({ history }: { history?: VersionHistory }) {
  const timestamp = history?.updatedAt ?? history?.capturedAt
  const age = timestamp && historyAge(timestamp)
  const prefix = history?.updatedAt ? history.kind === 'code' ? 'Committed' : history.status === 'frame' ? 'File updated' : 'Updated' : 'Captured'
  const dates = [history?.updatedAt && `${prefix}: ${new Date(history.updatedAt).toLocaleString()}`, history?.capturedAt && `Preview captured: ${new Date(history.capturedAt).toLocaleString()}`].filter(Boolean).join('\n')
  const status = historyStatus(history)
  const capturedAge = history?.updatedAt && history.capturedAt && historyAge(history.capturedAt)
  return <span className="civic-history-meta"><span title={status}>{status}</span>{age ? <time dateTime={timestamp} title={dates}>{prefix} {age}</time> : <span>Age unavailable</span>}{capturedAge && <time dateTime={history!.capturedAt} title={dates}>Captured {capturedAge}</time>}</span>
}

export function historyConnections(items: Pick<HistoryItem, 'id' | 'label' | 'history'>[]) {
  return items.flatMap((item, index) => {
    const h = item.history
    if (!h) return []
    const parent = items.find(other => other.id !== item.id && other.history?.key && other.history.key === h.parentKey)
    if (parent) return [{ from: parent.id, to: item.id, kind: 'linked', label: `${item.label} belongs to ${parent.label}` }]
    const base = items.filter(other => other.id !== item.id && other.history?.key && other.history.key === h.baseKey).sort((a, b) => Number(Boolean(b.history?.main)) - Number(Boolean(a.history?.main)))[0]
    if (base && h.key !== h.baseKey) {
      if (h.status === 'included') return [{ from: item.id, to: base.id, kind: 'ancestor', label: `${item.label}: commit included in ${base.label}` }]
      if (h.status === 'ahead') return [{ from: base.id, to: item.id, kind: 'ancestor', label: `${item.label} descends from ${base.label}` }]
      if (h.status === 'diverged' && h.sharedBase) return [{ from: base.id, to: item.id, kind: 'diverged', label: `${item.label} and ${base.label} share base ${h.sharedBase.slice(0, 8)}` }]
    }
    const peer = items.slice(0, index).find(other => h.key && other.history?.key === h.key)
    return peer ? [{ from: peer.id, to: item.id, kind: 'linked', label: `${item.label} and ${peer.label} share the same revision` }] : []
  })
}


export function historyGraph(items: Pick<HistoryItem, 'id' | 'label' | 'history'>[]) {
  const missing = items.flatMap(item => {
    const h = item.history
    return h?.kind === 'code' && h.key && h.baseKey && ['same', 'included', 'ahead', 'diverged'].includes(h.status) && !items.some(other => other.history?.key === h.baseKey) ? [h.baseKey] : []
  })
  const references = [...new Set(missing)].map(key => ({ id: `reference:${key}`, label: 'Local main', history: { kind: 'code' as const, status: 'same', main: true, key } }))
  const ordered = historyOrder(items)
  const nodes: Pick<HistoryItem, 'id' | 'label' | 'history'>[] = [...references, ...ordered]
  // Comparison anchors have no commit date and must not reorder captured versions.
  const order = ordered.map(item => item.id)
  for (const reference of references) {
    const older = ordered.find(item => item.history?.baseKey === reference.history.key && item.history.status === 'included')
    const newer = ordered.filter(item => item.history?.baseKey === reference.history.key && item.history.status === 'ahead').at(-1)
    order.splice(older ? order.indexOf(older.id) : newer ? order.indexOf(newer.id) + 1 : 0, 0, reference.id)
  }
  const links = historyConnections(nodes)
  const lanes: Record<string, number> = {}
  const roots = new Map<string, number>()
  let nextLane = 0, unknownLane: number | undefined
  for (const item of nodes) if (item.history?.key && (item.history.main || nodes.some(other => other.history?.baseKey === item.history!.key || other.history?.parentKey === item.history!.key)) && !roots.has(item.history.key)) roots.set(item.history.key, nextLane++)
  if (!nextLane) nextLane = 1
  for (const item of nodes) {
    const h = item.history
    const peer = nodes.find(other => other.id !== item.id && h?.key && other.history?.key === h.key && lanes[other.id] !== undefined)
    const trunk = h?.key && roots.get(h.key), included = h?.status === 'included' && h.baseKey ? roots.get(h.baseKey) : undefined
    lanes[item.id] = peer ? lanes[peer.id]! : typeof trunk === 'number' ? trunk : typeof included === 'number' ? included : links.some(link => link.to === item.id && (link.kind === 'diverged' || link.kind === 'ancestor' || h?.parentKey)) ? nextLane++ : (unknownLane ??= nextLane++)
  }
  return { links, lanes, width: 20 + nextLane * 20, references, order }
}

export function historyRoutes({ links, lanes }: Pick<ReturnType<typeof historyGraph>, 'links' | 'lanes'>, points: Record<string, number>) {
  const trunks = new Map<number, number[]>(), outer = Math.max(0, ...Object.values(lanes))
  const paths = links.flatMap(link => {
    const from = points[link.from], to = points[link.to]
    if (from === undefined || to === undefined) return []
    const a = lanes[link.from]!, b = lanes[link.to]!
    // Outer branches leave nearer the base so they never cut through an inner lane.
    const fork = a === b ? to : link.kind === 'diverged' ? Math.max(from, to) + 16 : from + Math.sign(to - from) * Math.min(12 + (outer - b) * 12, Math.abs(to - from) / 2)
    trunks.set(a, [...(trunks.get(a) ?? []), from, fork])
    if (a === b) return []
    const route = [{ x: laneX(a), y: fork }, { x: laneX(b), y: fork }, { x: laneX(b), y: to }]
    return [{ ...link, lane: b, fork, points: route, path: arrowPath(route, 6) }]
  })
  return { trunks: [...trunks].map(([lane, ys]) => ({ lane, path: arrowPath([{ x: laneX(lane), y: Math.min(...ys) }, { x: laneX(lane), y: Math.max(...ys) }]) })), paths }
}

// Rows can expand and wrap; measure their actual anchors instead of assuming a fixed row height.
export function HistoryList({ items: rows, className = '' }: { items: HistoryItem[]; className?: string }) {
  const { links, lanes, width, references, order } = useMemo(() => historyGraph(rows), [rows])
  const items = order.map(id => rows.find(row => row.id === id)).filter((item): item is HistoryItem => Boolean(item))
  const root = useRef<HTMLDivElement>(null)
  const [points, setPoints] = useState<Record<string, number>>({})
  useEffect(() => {
    const element = root.current!
    const measure = () => {
      const top = element.getBoundingClientRect().top
      const positions: Record<string, number> = {}
      for (const row of element.querySelectorAll<HTMLElement>('[data-history-id]')) {
        const box = (row.querySelector('[data-history-anchor]') ?? row.firstElementChild ?? row).getBoundingClientRect()
        positions[row.dataset.historyId!] = box.top - top + Math.min(box.height / 2, 20)
      }
      for (const reference of references) {
        const next = order.slice(order.indexOf(reference.id) + 1).find(id => positions[id] !== undefined)
        positions[reference.id] = next ? Math.max(6, positions[next]! - 14) : element.clientHeight - 10
      }
      setPoints(previous => JSON.stringify(previous) === JSON.stringify(positions) ? previous : positions)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    for (const row of element.querySelectorAll('[data-history-id]')) observer.observe(row)
    measure()
    return () => observer.disconnect()
  }, [order, references])
  const graph = links.length > 0 || references.length > 0 || items.some(item => item.history?.main)
  const { trunks, paths } = historyRoutes({ links, lanes }, points)
  return <div className="civic-history" data-graph={graph || undefined} style={{ '--history-width': `${graph ? width : 32}px` } as CSSProperties} ref={root}>
    <svg className="civic-history-rail" width={width} height="100%" role="img" aria-label={links.length ? `Version relationships. ${links.map(link => link.label).join('. ')}` : 'No verified relationships in this list'}>
      {trunks.map(({ lane, path }) => <path key={lane} className="civic-history-trunk" data-lane={lane} d={path} />)}
      {paths.map(link => <g key={`${link.from}:${link.to}`} data-relation={link.kind} data-lane={link.lane}><title>{link.label}</title><path d={link.path} />{link.kind === 'diverged' && <circle cx={laneX(lanes[link.from]!)} cy={link.fork} r="3" />}</g>)}
      {references.map(reference => points[reference.id] !== undefined && <g key={reference.id} data-reference="main" data-lane={lanes[reference.id]} pointerEvents="auto"><title>Local main · comparison reference, no captured preview</title><circle cx={laneX(lanes[reference.id]!)} cy={points[reference.id]} r="4" /></g>)}
    </svg>
    <ul className={`civic-history-list ${className}`}>{items.map(item => <li key={item.id} data-history-id={item.id} data-main={item.history?.main || undefined} data-lane={lanes[item.id]} style={{ '--history-node-x': `${laneX(lanes[item.id]!) - 6}px` } as CSSProperties}><RailMarker active={item.current} className={`civic-history-marker${graph ? ' civic-history-node' : ''}`}>{graph ? <span className="civic-rail-dot" /> : item.marker ?? <span className="civic-rail-dot" />}</RailMarker>{item.content}</li>)}</ul>
  </div>
}
