import { Link, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { RequireHousehold } from '@/account/account'
import { Closet } from '@/closet/closet-view'
import type { RenderLink } from '@/closet/garment-sheet'
import { RouteError } from '@/kit/route-error'
import { dismissItem } from '@/kit/item-navigation'
import { GarmentRecordTab } from '@/closet/garment-record'

export const Route = createFileRoute('/closet')({
  errorComponent: RouteError,
  validateSearch: (search: Record<string, unknown>): { add?: 'choose'; section?: 'ready' | 'care'; item?: string; group?: true; returnTo?: 'home'; tab?: 'history' } => ({
    ...(search.add === 'choose' ? { add: 'choose' as const } : {}),
    ...(search.section === 'ready' || search.section === 'care' ? { section: search.section } : {}),
    ...(typeof search.item === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(search.item) ? { item: search.item } : {}),
    ...(search.group === true ? { group: true as const } : {}),
    ...(search.returnTo === 'home' ? { returnTo: 'home' as const } : {}),
    // A load's piece link opens the piece's record on History.
    ...(search.tab === 'history' ? { tab: 'history' as const } : {}),
  }),
  component: ClosetPage,
})

/** The Closet's buttons that go somewhere: the Laundry tab, or a running load. */
function ClosetPage() {
  const { add, section, item, group, returnTo, tab } = Route.useSearch()
  const navigate = useNavigate()
  const router = useRouter()
  const routerLink: RenderLink = (target, { className, children, onClick, 'aria-label': ariaLabel }) => (target.to === 'laundry'
    ? <Link to="/laundry" search={{ ...(target.add === undefined ? {} : { add: target.add }), ...(target.item === undefined ? {} : { item: target.item }) }} state={target.item === undefined ? {} : { itemReturnTo: router.state.location.href }} resetScroll={false} className={className} onClick={onClick} aria-label={ariaLabel}>{children}</Link>
    : <Link to="/session/$sessionId" params={{ sessionId: target.sessionId }} search={{ from: 'closet' }} state={{ itemReturnTo: router.state.location.href }} className={className} onClick={onClick} aria-label={ariaLabel}>{children}</Link>)
  const [initialAdd] = useState(add === 'choose')
  useEffect(() => {
    if (add === 'choose') void navigate({ to: '/closet', search: {}, replace: true })
  }, [add, navigate])
  return (
    <RequireHousehold>
      {(household) => <GarmentRecordTab value={item === undefined ? undefined : tab}><Closet key={household.householdId} household={household} renderLink={routerLink} initialAdd={initialAdd} initialSection={section} initialItem={item} initialGroup={group}
        onItemOpen={(item, group) => void navigate({ to: '/closet', search: { ...(section === undefined ? {} : { section }), item, ...(group ? { group: true } : {}) }, state: { itemReturnTo: router.state.location.href }, resetScroll: false })}
        onItemClose={() => dismissItem(router, () => void navigate({ to: returnTo === 'home' ? '/' : '/closet', search: returnTo === 'home' || section === undefined ? {} : { section }, replace: true, resetScroll: false }))} /></GarmentRecordTab>}
    </RequireHousehold>
  )
}
