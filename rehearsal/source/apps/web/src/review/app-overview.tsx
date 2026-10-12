import type { AppFlow } from './app-map'
import { useMemo } from 'react'
import { arrowPath, routeArrow, type Point } from './arrow-routing'
import { SelectablePath } from './selectable-path'
import { FixturePicture } from './fixture-picture'

export function overviewConnections(flows: AppFlow[]) {
  const raw = flows.flatMap((from) => flows.flatMap((to) => {
    if (from === to) return []
    const paths = from.screens.flatMap((screen) => screen.edges.filter((edge) => to.screens.some((node) => node.id === edge.destination)))
    const actions = [...new Set(paths.map((edge) => edge.action))]
    if (!actions.length) return []
    const vertical = from.x === to.x, forward = vertical ? to.y > from.y : to.x > from.x
    return [{ from, to, action: actions.join('; '), returning: actions.every((action) => /^back\b|return\b|cancel\b/i.test(action)), branch: paths.some((path) => path.when), fromSide: vertical ? forward ? 'bottom' : 'top' : forward ? 'right' : 'left', toSide: vertical ? forward ? 'top' : 'bottom' : forward ? 'left' : 'right' }]
  }))
  const used = new Map<string, number>(), totals = new Map<string, number>(), occupied: Point[][] = []
  for (const edge of raw) for (const [flow, side] of [[edge.from, edge.fromSide], [edge.to, edge.toSide]] as const) { const key = flow.id + ':' + side; totals.set(key, (totals.get(key) ?? 0) + 1) }
  const port = (flow: AppFlow, side: string) => {
    const key = flow.id + ':' + side, ordinal = used.get(key) ?? 0
    used.set(key, ordinal + 1)
    const offset = (ordinal - ((totals.get(key) ?? 1) - 1) / 2) * 24
    const vertical = side === 'top' || side === 'bottom'
    const point = vertical ? { x: flow.x + flow.width / 2 + offset, y: flow.y + (side === 'bottom' ? flow.height : 0) } : { x: flow.x + (side === 'right' ? flow.width : 0), y: flow.y + flow.height / 2 + offset }
    const stub = { x: point.x + (side === 'right' ? 18 : side === 'left' ? -18 : 0), y: point.y + (side === 'bottom' ? 18 : side === 'top' ? -18 : 0) }
    return { point, stub }
  }
  return raw.flatMap((edge, lane) => {
    const a = port(edge.from, edge.fromSide), b = port(edge.to, edge.toSide)
    const points = routeArrow(a.stub, b.stub, flows, lane, occupied)
    if (!points.length) return []
    const complete = [a.point, ...points, b.point]; occupied.push(complete)
    return [{ id: `${edge.from.id}-${edge.to.id}`, from: edge.from.id, to: edge.to.id, action: edge.action, returning: edge.returning, branch: edge.branch, points: complete, d: arrowPath(complete, 14) }]
  })
}

export function AppOverview({ flows, source, active, focused, pan, focus, reviewConnection }: {
  flows: AppFlow[]; source: string; active: boolean; focused: string;
  pan: boolean; focus: (id: string) => void; reviewConnection: (id: string) => void;
}) {
  const connections = useMemo(() => overviewConnections(flows), [flows])
  return <div className="app-overview" aria-label="Application flow overview">
    <svg className="app-overview-edges" aria-label="Declared actions between flows">
      <defs><marker id="overview-arrow" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto"><path d="M1,1 L9,5 L1,9" fill="none" stroke="context-stroke" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></marker></defs>
      {connections.map((edge) => { const highlighted = edge.from === focused || edge.to === focused; return <SelectablePath key={edge.id} id={edge.id} action={`${edge.action} · choose a specific path`} d={edge.d} selected={false} disabled={pan} select={() => reviewConnection(edge.from)}><path d={edge.d} fill="none" stroke={edge.returning ? '#76808e' : edge.branch ? highlighted ? '#258579' : '#5f8c84' : highlighted ? '#2456d6' : '#758397'} strokeDasharray={edge.returning ? '7 6' : undefined} strokeWidth={highlighted ? 2.8 : 2} markerEnd="url(#overview-arrow)" /></SelectablePath> })}
    </svg>
    {flows.map((flow, i) => <section key={flow.id} className={`app-overview-flow ${focused === flow.id ? 'is-focused' : ''}`} style={{ left: flow.x, top: flow.y, width: flow.width, height: flow.height }}>
      {(i === 0 || flows[i - 1]!.section !== flow.section) && <h2 className="app-overview-area">{flow.section}</h2>}
      <button aria-label={`Open ${flow.label} flow`} disabled={pan} onClick={() => focus(flow.id)}>
        <strong>{flow.label}</strong><span>{flow.screens.length} screens{flow.screens.every((screen) => screen.partial) ? ' · partial' : ''}</span>
        <div className="app-overview-filmstrip" aria-hidden="true">{flow.screens.slice(0, 3).map((screen) => <FixturePicture key={screen.id} active={active} src={`/api/review/fixture.png?screen=${encodeURIComponent(screen.id)}&source=${source}`} alt="" />)}<span className="app-overview-more">+{Math.max(0, flow.screens.length - 3)}</span></div>
      </button>
    </section>)}
  </div>
}
