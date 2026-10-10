import { createFileRoute } from '@tanstack/react-router'

import { JoinInvite } from '@/account/join-flow'
import { RouteError } from '@/kit/route-error'

export const Route = createFileRoute('/join/$code')({
  errorComponent: RouteError,
  component: JoinRoute,
})

function JoinRoute() {
  const { code } = Route.useParams()
  return <JoinInvite code={code} />
}
