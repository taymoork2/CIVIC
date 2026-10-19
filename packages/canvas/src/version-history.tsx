import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { RailMarker } from '@civic/shell/ui/rail-marker'
import { arrowPath } from './arrow-routing'

export type VersionHistory = {
  kind: 'code' | 'design' | 'pull-request'
  status: string
  key?: string
  baseKey?: string
  parentKey?: string
  sharedBase?: string
  revision?: string
  main?: boolean
  ahead?: number
  behind?: number
  updatedAt?: string
  capturedAt?: string
}
type HistoryItem = { id: string; label: string; history?: VersionHistory; current?: boolean; marker?: ReactNode; content: ReactNode }

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

export function historyOrder<T extends { id: string; history?: VersionHistory }>(items: T[]) {
  const remaining = new Set(items), ordered: T[] = []
  const before = new Map(items.map(item => [item, new Set<T>()]))
  for (const item of items) {
    const h = item.history
    const bases = items.filter(other => other !== item && h?.baseKey && other.history?.key === h.baseKey && h.key !== h.baseKey)
    if (h?.status === 'ahead') for (const base of bases) before.get(base)!.add(item)
    if (h?.status === 'included') for (const base of bases) before.get(item)!.add(base)
  }
  const time = (item: T) => {
    const h = item.history, value = h?.updatedAt ?? (h?.kind !== 'code' ? h?.capturedAt : undefined)
    const date = value ? Date.parse(value) : NaN
    return Number.isFinite(date) ? date : -Infinity
  }
  while (remaining.size) {
    const ready = [...remaining].filter(item => ![...before.get(item)!].some(parent => remaining.has(parent)))
    // Contradictory imported relationships must not hang the picker.
    const next = (ready.length ? ready : [...remaining]).sort((a, b) => time(b) - time(a))[0]!
    ordered.push(next); remaining.delete(next)
  }
  return ordered
}

export function historyGraph(items: Pick<HistoryItem, 'id' | 'label' | 'history'>[]) {
  const links = historyConnections(items)
  const lanes: Record<string, number> = {}
  const roots = new Map<string, number>()
  let nextLane = 0, unknownLane: number | undefined
  for (const item of items) if (item.history?.key && (item.history.main || items.some(other => other.history?.baseKey === item.history!.key || other.history?.parentKey === item.history!.key)) && !roots.has(item.history.key)) roots.set(item.history.key, nextLane++)
  if (!nextLane) nextLane = 1
  for (const item of items) {
    const h = item.history
    const peer = items.find(other => other.id !== item.id && h?.key && other.history?.key === h.key && lanes[other.id] !== undefined)
    const trunk = h?.key && roots.get(h.key), included = h?.status === 'included' && h.baseKey ? roots.get(h.baseKey) : undefined
    lanes[item.id] = peer ? lanes[peer.id]! : typeof trunk === 'number' ? trunk : typeof included === 'number' ? included : links.some(link => link.to === item.id && (link.kind === 'diverged' || link.kind === 'ancestor' || h?.parentKey)) ? nextLane++ : (unknownLane ??= nextLane++)
  }
  return { links, lanes, width: 20 + nextLane * 16 }
}

// Rows can expand and wrap; measure their actual anchors instead of assuming a fixed row height.
export function HistoryList({ items: rows, className = '' }: { items: HistoryItem[]; className?: string }) {
  const items = historyOrder(rows)
  const root = useRef<HTMLDivElement>(null)
  const [points, setPoints] = useState<Record<string, number>>({})
  const ids = items.map(item => item.id).join('\n')
  useEffect(() => {
    const element = root.current!
    const measure = () => {
      const top = element.getBoundingClientRect().top
      const positions: Record<string, number> = {}
      for (const row of element.querySelectorAll<HTMLElement>('[data-history-id]')) {
        const box = (row.querySelector('[data-history-anchor]') ?? row.firstElementChild ?? row).getBoundingClientRect()
        positions[row.dataset.historyId!] = box.top - top + Math.min(box.height / 2, 20)
      }
      setPoints(previous => JSON.stringify(previous) === JSON.stringify(positions) ? previous : positions)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    for (const row of element.querySelectorAll('[data-history-id]')) observer.observe(row)
    measure()
    return () => observer.disconnect()
  }, [ids])
  const { links, lanes, width } = historyGraph(items)
  const graph = links.length > 0 || items.some(item => item.history?.main)
  const x = (lane: number) => 10 + lane * 16
  const trunks = new Map<number, number[]>()
  const paths = links.flatMap(link => {
    const from = points[link.from], to = points[link.to]
    if (from === undefined || to === undefined) return []
    const a = lanes[link.from]!, b = lanes[link.to]!
    const fork = a === b ? to : link.kind === 'diverged' ? Math.max(from, to) + 16 : from + Math.sign(to - from) * Math.min(12 + b * 8, Math.abs(to - from) / 2)
    trunks.set(a, [...(trunks.get(a) ?? []), from, fork])
    if (a === b) return []
    return [{ ...link, lane: b, fork, path: arrowPath([{ x: x(a), y: fork }, { x: x(b), y: fork }, { x: x(b), y: to }], 5) }]
  })
  return <div className="civic-history" data-graph={graph || undefined} style={{ '--history-width': `${graph ? width : 32}px` } as CSSProperties} ref={root}>
    <svg className="civic-history-rail" width={width} height="100%" role="img" aria-label={links.length ? `Version relationships. ${links.map(link => link.label).join('. ')}` : 'No verified relationships in this list'}>
      {[...trunks].map(([lane, ys]) => <path key={lane} className="civic-history-trunk" data-lane={lane} d={`M ${x(lane)} ${Math.min(...ys)} L ${x(lane)} ${Math.max(...ys)}`} />)}
      {paths.map(link => <g key={`${link.from}:${link.to}`} data-relation={link.kind} data-lane={link.lane}><title>{link.label}</title><path d={link.path} />{link.kind === 'diverged' && <circle cx={x(lanes[link.from]!)} cy={link.fork} r="3" />}</g>)}
    </svg>
    <ul className={`civic-history-list ${className}`}>{items.map(item => <li key={item.id} data-history-id={item.id} data-main={item.history?.main || undefined} data-lane={lanes[item.id]} style={{ '--history-node-x': `${x(lanes[item.id]!) - 6}px` } as CSSProperties}><RailMarker active={item.current} className={`civic-history-marker${graph ? ' civic-history-node' : ''}`}>{graph ? <span className="civic-rail-dot" /> : item.marker ?? <span className="civic-rail-dot" />}</RailMarker>{item.content}</li>)}</ul>
  </div>
}
