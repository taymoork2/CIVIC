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

function Home() {
  const { plan, load, add, make, item } = Route.useSearch()
  const navigate = useNavigate()
  const router = useRouter()
  const returnState = { itemReturnTo: router.state.location.href }
  const routerLink: LaundryLink = (target, { className, children }) => target.to === 'session'
    ? <Link to="/session/$sessionId" params={{ sessionId: target.sessionId }} state={returnState} className={className}>{children}</Link>
    : target.to === 'household' ? <Link to="/household" search={target.section === undefined ? {} : { section: target.section }} className={className}>{children}</Link>
      : target.to === 'drying' && target.run !== undefined ? <Link to="/drying" search={{ run: target.run }} className={className}>{children}</Link>
        : <Link to={target.to === 'drying' ? '/drying' : '/closet'} className={className}>{children}</Link>
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
          onItemOpen={(item) => void navigate({ to: '/laundry', search: { ...(plan === undefined ? {} : { plan, ...(load === undefined ? {} : { load }) }), item }, state: { itemReturnTo: router.state.location.href }, resetScroll: false })}
          onItemClose={() => dismissItem(router, () => void navigate({ to: '/laundry', search: plan === undefined ? {} : { plan, ...(load === undefined ? {} : { load }) }, replace: true, resetScroll: false }))}
          planId={plan ?? null}
          loadId={load ?? null}
          onOpenLoad={(planId, loadId) => void navigate({ to: '/laundry', search: { plan: planId, ...(loadId === null ? {} : { load: loadId }) } })}
          onPlan={(planId, replace) => void navigate({ to: '/laundry', search: planId === null ? {} : { plan: planId, ...(replace && load !== undefined ? { load } : {}) }, replace })}
          onSession={(sessionId) => void navigate({ to: '/session/$sessionId', params: { sessionId }, state: returnState })}
          renderLink={routerLink}
          openAddHamper={addHamper}
          openMakeLoads={makeLoads}
        />
      )}
    </RequireHousehold>
  )
}
