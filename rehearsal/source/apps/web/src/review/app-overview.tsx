import type { AppFlow } from './app-map'
import { useMemo } from 'react'
import { arrowPath, routeArrow } from './arrow-routing'

export function AppOverview({ flows, source, ready, missing, focused, pan, focus }: {
  flows: AppFlow[]; source: string; ready: boolean; missing: string[]; focused: string;
  pan: boolean; focus: (id: string) => void;
}) {
  const connections = useMemo(() => {
    let lane = 0
    return flows.flatMap((from) => flows.flatMap((to) => {
    if (from === to) return []
    const actions = [...new Set(from.screens.flatMap((screen) => screen.edges.filter((edge) => to.screens.some((node) => node.id === edge.destination)).map((edge) => edge.action)))]
    if (!actions.length) return []
    const currentLane = lane++, offset = 16 + currentLane * 3
    const vertical = from.x === to.x, forward = vertical ? to.y > from.y : to.x > from.x
    const a = vertical ? { x: from.x + from.width / 2 + offset, y: from.y + (forward ? from.height : 0) } : { x: from.x + (forward ? from.width : 0), y: from.y + 170 + offset }
    const b = vertical ? { x: to.x + to.width / 2 + offset, y: to.y + (forward ? 0 : to.height) } : { x: to.x + (forward ? 0 : to.width), y: to.y + 170 + offset }
    const direction = forward ? 1 : -1
    const start = vertical ? { x: a.x, y: a.y + direction * 16 } : { x: a.x + direction * 16, y: a.y }
    const end = vertical ? { x: b.x, y: b.y - direction * 16 } : { x: b.x - direction * 16, y: b.y }
    const points = routeArrow(start, end, flows, currentLane)
    if (!points.length) return []
    return [{ id: `${from.id}-${to.id}`, from: from.id, to: to.id, action: actions.join('; '), d: arrowPath([a, ...points, b]), returning: actions.every((action) => /^back\b|return\b/i.test(action)) }]
  }))
  }, [flows])
  return <div className="app-overview" aria-label="Application flow overview">
    <svg className="app-overview-edges" aria-label="Declared actions between flows">
      <defs><marker id="overview-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8" fill="context-stroke" /></marker></defs>
      {connections.map((edge) => <g key={edge.id} aria-label={edge.action} opacity={focused === edge.from || focused === edge.to ? 1 : .6}><title>{edge.action}</title><path d={edge.d} fill="none" stroke={edge.returning ? '#526880' : '#2456d6'} strokeDasharray={edge.returning ? '8 6' : undefined} strokeWidth="3" markerEnd="url(#overview-arrow)" /></g>)}
    </svg>
    {flows.map((flow, i) => <section key={flow.id} className={`app-overview-flow ${focused === flow.id ? 'is-focused' : ''}`} style={{ left: flow.x, top: flow.y, width: flow.width, height: flow.height }}>
      {(i === 0 || flows[i - 1]!.section !== flow.section) && <h2 className="app-overview-area">{flow.section}</h2>}
      <button aria-label={`Open ${flow.label} flow`} disabled={pan} onClick={() => focus(flow.id)}>
        <strong>{flow.label}</strong><span>{flow.screens.length} screens{flow.screens.every((screen) => screen.partial) ? ' · partial' : ''}</span>
        <div className="app-overview-filmstrip" aria-hidden="true">{flow.screens.slice(0, 3).map((screen) => ready && !missing.includes(screen.id) ? <img key={screen.id} src={`/api/review/fixture.png?screen=${encodeURIComponent(screen.id)}&source=${source}`} alt="" /> : <span key={screen.id} />)}<span className="app-overview-more">+{Math.max(0, flow.screens.length - 3)}</span></div>
      </button>
    </section>)}
  </div>
}
