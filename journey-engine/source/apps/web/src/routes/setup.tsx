import { createFileRoute } from '@tanstack/react-router'

import { RequireHousehold } from '@/account/account'
import { FirstRun } from '@/account/first-run'
import { RouteError } from '@/kit/route-error'

export const Route = createFileRoute('/setup')({
  errorComponent: RouteError,
  validateSearch: (search: Record<string, unknown>): { replay?: true } => (search.replay === true || search.replay === 'true' || search.replay === 1 || search.replay === '1' ? { replay: true } : {}),
  component: Setup,
})

/** The same household checklist for first run, later setup and Replay. */
function Setup() {
  const { replay } = Route.useSearch()
  return <RequireHousehold>{(household) => <FirstRun key={household.householdId + String(replay)} displayName={null} household={household} initialStep="setup" />}</RequireHousehold>
}
