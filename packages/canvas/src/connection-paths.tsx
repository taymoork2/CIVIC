import { connectionBundles, type ConnectionBundle, type RoutedConnection } from './connection-routing'
import { SelectablePath } from './selectable-path'
import { connectionDescription, connectionStyle, interactionOf, type Interaction } from './connection-semantics'

export function ConnectionMarker({ id, interaction }: { id: string; interaction: Interaction }) {
  return <marker id={id} markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
    {interaction === 'return' ? <path d="M2,1 L8,5 L2,9" fill="none" stroke="context-stroke" strokeWidth="1.5" /> : <>
      {interaction === 'update' && <path d="M1,1 L1,9" stroke="context-stroke" strokeWidth="1.5" />}
      <path d="M2,1 L9,5 L2,9 Z" fill="context-stroke" />
    </>}
  </marker>
}

export function ConnectionPaths({ edges, markerId, disabled, selectedPath, selectedBundle, observed = () => false, select, selectBundle }: {
  edges: RoutedConnection[]; markerId: string; disabled: boolean; selectedPath?: string; selectedBundle?: string | null
  observed?: (edge: RoutedConnection) => boolean; select: (edge: RoutedConnection) => void; selectBundle: (bundle: ConnectionBundle) => void
}) {
  const paint = (edge: RoutedConnection, recorded = observed(edge)) => { const style = connectionStyle(edge); return { fill: 'none', stroke: style.stroke, strokeDasharray: style.strokeDasharray, strokeWidth: recorded ? 3 : 1.5, vectorEffect: 'non-scaling-stroke' } }
  const marker = (edge: RoutedConnection) => `url(#${markerId}-${interactionOf(edge)})`
  return <>
    <defs>{(['navigate', 'update', 'return'] as const).map(interaction => <ConnectionMarker key={interaction} id={`${markerId}-${interaction}`} interaction={interaction} />)}</defs>
    {connectionBundles(edges).map(group => {
      const edge = group.members[0]!, bundle = edge.bundle!, style = paint(edge, group.members.every(observed))
      return <SelectablePath key={group.id} id={`bundle:${group.id}`} action={`${group.action} · ${group.members.length} paths`} description={connectionDescription(edge)} d={`${bundle.d} ${bundle.arrowD}`} disabled={disabled} selected={selectedBundle === group.id} select={() => selectBundle(group)}>
        <path d={bundle.d} {...style} />{bundle.arrowD && <path d={bundle.arrowD} {...style} markerEnd={marker(edge)} />}
        <text x={bundle.x} y={bundle.y} textAnchor="middle" fontSize="18" fill="#526880">{group.action} · {group.members.length} paths</text>
      </SelectablePath>
    })}
    {edges.map(edge => <SelectablePath key={edge.id} id={edge.id} action={edge.action} description={`${connectionDescription(edge)}${observed(edge) ? ' · Captured visit' : ''}`} d={edge.d} hitD={edge.branchD} disabled={disabled} selected={selectedPath === edge.id} select={() => select(edge)}>
      <path d={edge.branchD ?? edge.d} {...paint(edge)} markerEnd={edge.branchArrow ? marker(edge) : undefined} />
      {!edge.bundle && <text x={edge.x} y={edge.y} textAnchor="middle" fontSize="18" fill="#526880">{edge.action}</text>}
    </SelectablePath>)}
  </>
}
