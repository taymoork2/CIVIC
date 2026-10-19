import { Button } from '@civic/shell/ui/button'
import { ArrowRight } from '@civic/shell/icons'
import type { AppFlow } from './app-map'
import type { ConnectionBundle, RoutedConnection } from './connection-routing'

export function SharedNavigation({ flows, group, select }: { flows: AppFlow[]; group?: ConnectionBundle; select: (edge: RoutedConnection) => void }) {
  if (!group) return null
  const label = (id: string, qualified: boolean) => { const flow = flows.find(flow => flow.id === id || flow.screens.some(screen => screen.id === id)), screen = flow?.screens.find(screen => screen.id === id); return screen ? `${qualified ? flow!.label + ' / ' : ''}${screen.label}` : flow?.label ?? id }
  const crossJourney = (edge: RoutedConnection) => !flows.some(flow => flow.screens.some(screen => screen.id === edge.from) && flow.screens.some(screen => screen.id === edge.to))
  return <section className="rh-shared-navigation" aria-label={`Connections for ${group.action}`} data-shared-path={group.id}>
    <h3>{group.action}<small>{group.members.length} paths</small></h3>
    <ul className="cv:m-0 cv:list-none cv:p-0">{group.members.map(edge => {
      const from = label(edge.from, crossJourney(edge)), to = label(edge.to, crossJourney(edge)), description = `${from} → ${to}`
      return <li key={edge.id}><Button variant="ghost" className="cv:w-full cv:min-w-0 cv:justify-start cv:gap-2 cv:text-left" aria-label={description} title={description} onClick={() => select(edge)}><span className="cv:min-w-0 cv:flex-1 cv:truncate">{from}</span><ArrowRight className="cv:size-3 cv:shrink-0" aria-hidden="true" /><span className="cv:min-w-0 cv:flex-1 cv:truncate">{to}</span></Button></li>
    })}</ul>
  </section>
}
