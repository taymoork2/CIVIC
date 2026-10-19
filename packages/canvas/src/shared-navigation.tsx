import { Button } from '@civic/shell/ui/button'
import type { AppFlow } from './app-map'
import type { ConnectionBundle, RoutedConnection } from './connection-routing'

export function SharedNavigation({ flows, groups, selected, select }: { flows: AppFlow[]; groups: ConnectionBundle[]; selected?: string | null; select: (edge: RoutedConnection) => void }) {
  if (!groups.length) return null
  const label = (id: string, qualified: boolean) => { const flow = flows.find(flow => flow.screens.some(screen => screen.id === id)), screen = flow?.screens.find(screen => screen.id === id); return screen ? `${qualified ? flow!.label + ' / ' : ''}${screen.label}` : id }
  const crossJourney = (edge: RoutedConnection) => !flows.some(flow => flow.screens.some(screen => screen.id === edge.from) && flow.screens.some(screen => screen.id === edge.to))
  return <section className="rh-shared-navigation" aria-label="Shared navigation">
    <h3>Shared navigation</h3><p>Matching actions share a line on the canvas. Select a branch or choose a connection below to review it.</p>
    {groups.map(group => <details key={group.id} data-shared-path={group.id} open={selected === group.id ? true : undefined}><summary>{group.action} <small>{group.members.length} paths</small></summary><ul>{group.members.map(edge => <li key={edge.id}><Button variant="outline" onClick={() => select(edge)}>{label(edge.from, crossJourney(edge))} → {label(edge.to, crossJourney(edge))}</Button></li>)}</ul></details>)}
  </section>
}
