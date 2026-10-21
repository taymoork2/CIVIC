import type { PreviewAppearance } from './viewport-presets'
import { Button } from '@civic/shell/ui/button'
import { crossFlowConnections, type AppFlow } from './app-map'
import { connectionBundles, routeConnections, type Connection, type ConnectionBundle, type RoutedConnection } from './connection-routing'
import { ConnectionPaths } from './connection-paths'
import { FixturePicture, fixtureURL } from './fixture-picture'
import { interactionOf } from './connection-semantics'

export function overviewConnections(flows: AppFlow[]) {
  const groups = new Map<string, { from: AppFlow; to: AppFlow; members: Connection[] }>()
  for (const edge of crossFlowConnections(flows)) {
    const from = flows.find(flow => flow.screens.some(screen => screen.id === edge.from))!, to = flows.find(flow => flow.screens.some(screen => screen.id === edge.to))!
    const id = `overview:${JSON.stringify([from.id, to.id, interactionOf(edge), Boolean(edge.when)])}`
    const group = groups.get(id) ?? { from, to, members: [] }
    group.members.push(edge); groups.set(id, group)
  }
  const raw = [...groups].map<Connection>(([id, { from, to, members }]) => {
    const vertical = from.x === to.x, forward = vertical ? to.y > from.y : to.x > from.x
    return { ...members[0]!, id, from: from.id, to: to.id, action: id, returning: false, branch: false,
      source: { box: from, node: from.id, side: vertical ? forward ? 'bottom' : 'top' : forward ? 'right' : 'left' },
      target: { box: to, node: to.id, side: vertical ? forward ? 'top' : 'bottom' : forward ? 'left' : 'right' },
    }
  })
  return routeConnections(raw, flows).flatMap(route => {
    const { from, to, members } = groups.get(route.id)!
    const bundle = { id: route.id, label: `${from.label} → ${to.label}`, d: '', arrowD: route.d, x: route.x, y: route.y }
    // Journey-scale geometry is shared; review selection keeps every original screen path.
    return members.map(edge => ({ ...route, ...edge, bundle, branchD: '', branchArrow: false }))
  })
}

export function AppOverview({ appearance, flows, connections, source, active, focused, pan, focus, reviewConnection, selectBundle, selectedBundle }: {
  appearance?: Pick<PreviewAppearance, 'theme' | 'appTheme'>; flows: AppFlow[]; connections: RoutedConnection[]; source: string; active: boolean; focused: string;
  pan: boolean; focus: (id: string) => void; reviewConnection: (edge: RoutedConnection) => void; selectBundle: (bundle: ConnectionBundle) => void; selectedBundle: string | null;
}) {
  const groups = connectionBundles(connections)
  return <div className="app-overview" aria-label="Application flow overview">
    <svg className="app-overview-edges" aria-label="Declared actions between flows">
      <ConnectionPaths edges={connections} markerId="overview-arrow" disabled={pan} selectedBundle={selectedBundle} select={edge => { const group = groups.find(group => group.id === edge.bundle?.id); if (group) selectBundle(group); else reviewConnection(edge) }} selectBundle={selectBundle} />
    </svg>
    {flows.map((flow) => <section key={flow.id} className={`app-overview-flow ${focused === flow.id ? 'is-focused' : ''}`} style={{ left: flow.x, top: flow.y, width: flow.width, height: flow.height }}>
      {flow.y === 40 && <h2 className="app-overview-area">{flow.section}</h2>}
      <Button variant="outline" className="cv:block cv:h-full cv:w-full cv:rounded-xl cv:p-5 cv:text-left cv:whitespace-normal cv:aria-[current=location]:border-primary" aria-current={focused === flow.id ? 'location' : undefined} aria-label={`Open ${flow.label} flow`} disabled={pan} onClick={() => focus(flow.id)}>
        <strong>{flow.label}</strong><span>{flow.screens.length} screens{flow.screens.every((screen) => screen.partial) ? ' · partial' : ''}</span>
        <div className="app-overview-filmstrip" aria-hidden="true">{flow.screens.slice(0, 3).map((screen) => <FixturePicture key={screen.id} viewport={screen.viewport} active={active} src={fixtureURL(screen.id, source, screen.viewport, 1, appearance)} alt="" />)}<span className="app-overview-more">+{Math.max(0, flow.screens.length - 3)}</span></div>
      </Button>
    </section>)}
  </div>
}
