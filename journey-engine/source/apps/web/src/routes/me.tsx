import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { usePaginatedQuery, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { useEffect, useRef, useState } from 'react'

import { RequireHousehold, type CurrentHousehold } from '@/account/account'
import { keepPageFocusVisible } from '@/kit/app-shell'
import { api } from '../api'
import { authClient } from '../auth-client'
import { meText } from '../copy-me'
import { RecordList, RecordRow } from '@/kit/record-row'
import { RouteError } from '@/kit/route-error'
import { useNow } from '@/kit/use-now'
import { Loading } from '@/kit/ui'
import { DesignIcon } from '@/kit/design-icons'
import { CareHero } from '@/products/product-ui'
import { Button, buttonVariants } from '@/components/ui/button'

export const Route = createFileRoute('/me')({
  errorComponent: RouteError,
  component: Me,
})

type CostEntry = FunctionReturnType<typeof api.costs.entries>[number]
type SessionRow = FunctionReturnType<typeof api.execution.householdSessions>[number]

/** The signed-in person's profile. Never the Closet: clothes live there. Settings sit in the last row. */
function Me() {
  return <RequireHousehold>{(household) => <MePage household={household} />}</RequireHousehold>
}

/** The same page frame as the other tabs, so Me lines up with Home, Closet, Laundry and Household. */
const mePageClassName = cn(
  "page",
  "me-page",
  "grid min-w-0 w-full gap-5 max-w-[36rem] mx-auto pt-2 pb-8",
  "md:max-w-[45rem]",
  "[.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:max-w-[none] [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:mx-0 [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:pt-0 [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:content-start",
)

function MePage({ household }: { household: CurrentHousehold }) {
  const householdId = household.householdId
  const now = useNow(60_000)
  const navigate = useNavigate()
  const router = useRouter()
  const { data: session } = authClient.useSession()
  const members = useQuery(api.households.members, { householdId })
  const { results: sessions, status, loadMore } = usePaginatedQuery(api.execution.completedHistory, { householdId }, { initialNumItems: 5 })
  const role = members?.find((member) => member.isYou)?.role ?? null
  return (
    <Profile
      name={session?.user.name?.trim() || null}
      email={session?.user.email ?? null}
      householdName={household.name}
      role={role}
      loading={status === 'LoadingFirstPage'}
      history={completedHistory(sessions, now, sessions.map(row => ({ id: `wash:${row.sessionId}`, price: row.washPrice })))}
      canLoadMore={status === 'CanLoadMore'}
      loadingMore={status === 'LoadingMore'}
      onLoadMore={() => loadMore(20)}
      onAccount={() => void navigate({ to: '/account' })}
      onSettings={() => void navigate({ to: '/settings' })}
      onOpenWash={(sessionId) => void navigate({ to: '/session/$sessionId', params: { sessionId }, search: { from: 'me' }, state: { itemReturnTo: router.state.location.href } })}
    />
  )
}

export type CareHistoryRow = Pick<SessionRow, 'sessionId' | 'textileCount'> & { readonly title: string; readonly completedAt: number; readonly washPrice?: number | null }

/** Finished loads, newest first. Running, cancelled and future records are not history. */
export function completedHistory(sessions: readonly Pick<SessionRow, 'sessionId' | 'status' | 'completedAt' | 'machineName' | 'textileCount' | 'garments'>[], now: number, costs?: readonly Pick<CostEntry, 'id' | 'price'>[]): CareHistoryRow[] {
  // The cost query identifies each washer start by its exact session ID. Dryer payments
  // can cover several wash loads and have no durable session link; do not invent a total.
  const prices = new Map(costs?.map((entry) => [entry.id, entry.price]))
  return sessions.flatMap((row) => row.status === 'completed' && row.completedAt !== null && row.completedAt <= now ? [{ sessionId: row.sessionId, title: [...new Set(row.garments.map((garment) => garment.name).filter(Boolean))].join(', ') || row.machineName || 'Completed load', textileCount: row.textileCount, completedAt: row.completedAt, washPrice: costs === undefined ? undefined : prices.get(`wash:${row.sessionId}`) ?? null }] : []).sort((left, right) => right.completedAt - left.completedAt)
}

const recentWashes = 5

/**
 * Completed loads show their recorded washer price directly in each history row.
 * Show five latest loads, then request older history in bounded pages.
 */
export function Profile({ name, email, householdName, role, history = [], loading = false, canLoadMore = false, loadingMore = false, onLoadMore, onAccount, onSettings, onOpenWash }: {
  name: string | null
  email: string | null
  householdName: string
  role: CurrentHousehold['role'] | null
  history?: readonly CareHistoryRow[]
  loading?: boolean
  canLoadMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
  onAccount: () => void
  onSettings: () => void
  onOpenWash?: (sessionId: CareHistoryRow['sessionId']) => void
}) {
  const [limit, setLimit] = useState(recentWashes)
  // Keep the first render identical on server and device, then use the device's locale and zone.
  const [format, setFormat] = useState({ locale: 'en-US', timeZone: 'UTC' })
  useEffect(() => { setFormat(Intl.DateTimeFormat().resolvedOptions()) }, [])
  const pageRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Adding rows moves the focused disclosure toward the fixed navigation. Keep
    // that same control in view, without moving focus or animating keyboard use.
    keepPageFocusVisible(pageRef.current)
  }, [limit, history.length])
  const shown = history.slice(0, limit)
  return (
    <div ref={pageRef} className={mePageClassName}>
      <CareHero variant="feature" photo title={meText.title} art={<img src={history.length === 0 ? '/welcome-household.webp' : '/design/care-complete.webp'} alt="" width={960} height={640} />}
        detail={<><p className="m-0 text-[length:var(--step-2)] font-semibold text-ink">{name ?? householdName}</p><p className="m-0">{householdName}{role === null ? '' : ` · ${meText.roles[role]}`}</p>{!loading && history.length === 0 ? <p className="m-0">Completed care appears here, with the items and settings you used.</p> : null}</>}
        action={loading ? undefined : history.length === 0 ? <Link to="/laundry" className={buttonVariants({ variant: 'ghost' })}>Go to Laundry<DesignIcon name="chevronRight" size="1em" aria-hidden="true" /></Link> : onOpenWash === undefined ? undefined : <Button type="button" variant="ghost" onClick={() => onOpenWash(history[0]!.sessionId)}>Review latest load<DesignIcon name="chevronRight" size="1em" aria-hidden="true" /></Button>} />
      {loading ? <Loading what={meText.loadingHistory} /> : history.length === 0
        ? <p className="m-0 text-ink-2">{meText.noWashes}</p>
        : <RecordList heading={meText.washes}>
        {shown.map((row) => <RecordRow
            key={row.sessionId}
            media={<DesignIcon name="laundry" strokeWidth={1.6} />}
            title={row.title}
            fact={<>{meText.pieces(row.textileCount)} · <time dateTime={new Date(row.completedAt).toISOString()}>{new Date(row.completedAt).toLocaleDateString(format.locale, { month: 'short', day: 'numeric', year: 'numeric', timeZone: format.timeZone })}</time>{row.washPrice === undefined ? null : <> · {row.washPrice === null ? meText.washPriceUnknown : meText.washPrice(new Intl.NumberFormat(format.locale, { style: 'currency', currency: 'USD' }).format(row.washPrice))}</>}</>}
            onOpen={onOpenWash === undefined ? undefined : () => onOpenWash(row.sessionId)}
          />)}
        {history.length <= limit && !canLoadMore && !loadingMore ? null : <RecordRow
          media={<DesignIcon name="clock" strokeWidth={1.6} />}
          title={loadingMore ? 'Loading older loads…' : 'Older loads'}
          disabled={loadingMore}
          onOpen={() => { if (history.length <= limit) onLoadMore?.(); setLimit(limit + 20) }}
        />}
      </RecordList>}
      <RecordList>
        <RecordRow media={<DesignIcon name="me" strokeWidth={1.6} />} title={meText.account} fact={email ?? meText.accountHint} onOpen={onAccount} />
        <RecordRow media={<DesignIcon name="gear" strokeWidth={1.6} />} title={meText.settings} fact={meText.settingsHint} onOpen={onSettings} />
      </RecordList>
    </div>
  )
}
