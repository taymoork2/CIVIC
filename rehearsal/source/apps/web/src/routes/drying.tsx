import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { RequireHousehold } from '@/account/account'
import { Drying } from '@/drying/drying-view'
import { RouteError } from '@/kit/route-error'
import { useNow } from '@/laundry/session-view'

export const Route = createFileRoute('/drying')({
  errorComponent: RouteError,
  /** `run`: a dryer run whose check opens straight away, from a timer card on Home or Laundry. */
  validateSearch: (search: Record<string, unknown>): { run?: string } => typeof search.run === 'string' ? { run: search.run } : {},
  component: DryingRoute,
})

function DryingRoute() {
  const navigate = useNavigate()
  const now = useNow(30_000)
  const { run } = Route.useSearch()
  return (
    <RequireHousehold>
      {(household) => <Drying key={`${household.householdId}${run ?? ''}`} householdId={household.householdId} now={now} openRun={run} onBack={() => void navigate({ to: '/laundry' })} />}
    </RequireHousehold>
  )
}
