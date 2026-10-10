import { Link, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { RequireHousehold } from '@/account/account'
import { laundrySearch } from '@/laundry/laundry-search'
import { Laundry, type LaundryLink } from '@/laundry/laundry-view'
import { RouteError } from '@/kit/route-error'
import { dismissItem } from '@/kit/item-navigation'

export const Route = createFileRoute('/laundry')({
  errorComponent: RouteError,
  validateSearch: laundrySearch,
  component: Home,
})

const routerLink: LaundryLink = (target, { className, children }) => (target.to === 'session'
  ? <Link to="/session/$sessionId" params={{ sessionId: target.sessionId }} className={className}>{children}</Link>
  : target.to === 'drying' && target.run !== undefined ? <Link to="/drying" search={{ run: target.run }} className={className}>{children}</Link>
  : <Link to={target.to === 'household' ? '/household' : target.to === 'drying' ? '/drying' : '/closet'} className={className}>{children}</Link>)

function Home() {
  const { plan, add, make, item } = Route.useSearch()
  const navigate = useNavigate()
  const router = useRouter()
  // `/laundry?add=hamper` opens Add dirty clothes once.
  const [addHamper] = useState(add === 'hamper')
  const [makeLoads] = useState(make === 'loads')
  useEffect(() => {
    if (add === 'hamper' || make === 'loads') void navigate({ to: '/laundry', search: ({ add: _add, make: _make, ...rest }) => rest, replace: true })
  }, [add, make])
  return (
    <RequireHousehold>
      {(household) => (
        <Laundry
          key={household.householdId}
          household={household}
          initialItem={item}
          onItemOpen={(item) => void navigate({ to: '/laundry', search: { ...(plan === undefined ? {} : { plan }), item }, state: { itemReturnTo: router.state.location.href }, resetScroll: false })}
          onItemClose={() => dismissItem(router, () => void navigate({ to: '/laundry', search: plan === undefined ? {} : { plan }, replace: true, resetScroll: false }))}
          planId={plan ?? null}
          onPlan={(planId, replace) => void navigate({ to: '/laundry', search: planId === null ? {} : { plan: planId }, replace })}
          onSession={(sessionId) => void navigate({ to: '/session/$sessionId', params: { sessionId } })}
          renderLink={routerLink}
          openAddHamper={addHamper}
          openMakeLoads={makeLoads}
        />
      )}
    </RequireHousehold>
  )
}
