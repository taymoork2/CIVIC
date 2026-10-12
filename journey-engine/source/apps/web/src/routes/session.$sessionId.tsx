import { createFileRoute } from '@tanstack/react-router'
import { useConvexConnectionState, useQuery } from 'convex/react'
import { useEffect } from 'react'

import { RequireHousehold } from '@/account/account'
import type { Id } from '../../../../convex/_generated/dataModel'
import { api } from '../api'
import { RouteError } from '@/kit/route-error'
import { useOnline } from '../connectivity'
import { loadSessionProjection, saveSessionProjection } from '../private-state'
import { OfflineSessionView, SessionView, sessionModel, type SessionFrom } from '@/laundry/session-view'
import { useNow } from '@/kit/use-now'
import { Loading } from '@/kit/ui'

export const Route = createFileRoute('/session/$sessionId')({
  errorComponent: RouteError,
  // The page that opened the load, so Back returns there; absent on Laundry's own links.
  validateSearch: (search: Record<string, unknown>): { from?: SessionFrom } => (search.from === 'me' || search.from === 'closet' ? { from: search.from } : {}),
  component: SessionRoute,
})

function SessionRoute() {
  const { sessionId } = Route.useParams()
  return <RequireHousehold sessionId={sessionId}>{() => <SessionPage sessionId={sessionId} />}</RequireHousehold>
}

function SessionPage({ sessionId }: { sessionId: string }) {
  const { from } = Route.useSearch()
  // The route parameter is validated as a session id by the backend.
  const served = useQuery(api.execution.sessionDetail, { sessionId: sessionId as Id<'sessions'> })
  const detail = served === undefined ? undefined : sessionModel(served)
  const online = useOnline()
  const now = useNow(1000)
  const unconfirmed = useConvexConnectionState().inflightMutations > 0

  useEffect(() => {
    // A step not yet confirmed shows as done only on screen; the saved copy waits for the server,
    // so a closed app never comes back claiming a step the server never got.
    if (detail !== undefined && !unconfirmed) saveSessionProjection(detail)
  }, [served, unconfirmed])

  if (detail === undefined) {
    const projection = online ? null : loadSessionProjection(sessionId)
    return projection === null ? <Loading what="this load" /> : <OfflineSessionView projection={projection} />
  }
  return <SessionView detail={detail} now={now} online={online} from={from} />
}
