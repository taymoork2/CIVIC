import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { useEffect, useRef, useState } from 'react'

import { RequireHousehold, type CurrentHousehold } from '@/account/account'
import { pageTitleClassName } from '@/account/account-page'
import { keepPageFocusVisible } from '@/kit/app-shell'
import { api } from '../api'
import { authClient } from '../auth-client'
import { meText } from '../copy-me'
import { RecordList, RecordRow } from '@/kit/record-row'
import { RouteError } from '@/kit/route-error'
import { useNow } from '@/laundry/session-view'
import { Loading } from '@/kit/ui'
import { useHouseholdData } from '@/household/household-data'
import { DesignIcon } from '@/kit/design-icons'

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
  const shared = useHouseholdData(householdId)
  const now = useNow(60_000)
  const navigate = useNavigate()
  const router = useRouter()
  const { data: session } = authClient.useSession()
  const members = useQuery(api.households.members, { householdId })
  const sessions = useQuery(api.execution.householdSessions, { householdId }) ?? shared?.sessions
  const costs = useQuery(api.costs.entries, { householdId })
  const role = members?.find((member) => member.isYou)?.role ?? null
  return (
    <Profile
      name={session?.user.name?.trim() || null}
      email={session?.user.email ?? null}
      householdName={household.name}
      role={role}
      loading={sessions === undefined}
      history={completedHistory(sessions ?? [], now, costs)}
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
 * Show the five latest loads, with the rest one tap away.
 */
export function Profile({ name, email, householdName, role, history = [], loading = false, onAccount, onSettings, onOpenWash }: {
  name: string | null
  email: string | null
  householdName: string
  role: CurrentHousehold['role'] | null
  history?: readonly CareHistoryRow[]
  loading?: boolean
  onAccount: () => void
  onSettings: () => void
  onOpenWash?: (sessionId: CareHistoryRow['sessionId']) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const pageRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Adding rows moves the focused disclosure toward the fixed navigation. Keep
    // that same control in view, without moving focus or animating keyboard use.
    keepPageFocusVisible(pageRef.current)
  }, [showAll])
  const shown = showAll ? history : history.slice(0, recentWashes)
  return (
    <div ref={pageRef} className={mePageClassName}>
      <h1 className={pageTitleClassName}>{meText.title}</h1>
      <RecordList>
        <RecordRow media={<DesignIcon name="me" strokeWidth={1.6} />} title={name ?? meText.title} fact={email ?? householdName} mark={role === null ? undefined : { tone: 'done', text: meText.roles[role] }} />
      </RecordList>
      {loading ? <Loading what={meText.loadingHistory} /> : <RecordList heading={meText.washes}>
        {history.length === 0
          ? <RecordRow media={<DesignIcon name="laundry" strokeWidth={1.6} />} title={meText.noWashes} />
          : shown.map((row) => <RecordRow
            key={row.sessionId}
            media={<DesignIcon name="laundry" strokeWidth={1.6} />}
            title={row.title}
            fact={<>{meText.pieces(row.textileCount)} · <time dateTime={new Date(row.completedAt).toISOString()}>{new Date(row.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time>{row.washPrice === undefined ? null : <> · {row.washPrice === null ? meText.washPriceUnknown : meText.washPrice(new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(row.washPrice))}</>}</>}
            onOpen={onOpenWash === undefined ? undefined : () => onOpenWash(row.sessionId)}
          />)}
        {history.length <= recentWashes ? null : <RecordRow
          media={<DesignIcon name="clock" strokeWidth={1.6} />}
          title={showAll ? meText.showFewerWashes : meText.showAllWashes(history.length)}
          expanded={showAll}
          onOpen={() => setShowAll(!showAll)}
        />}
      </RecordList>}
      <RecordList>
        <RecordRow media={<DesignIcon name="me" strokeWidth={1.6} />} title={meText.account} fact={meText.accountHint} onOpen={onAccount} />
        <RecordRow media={<DesignIcon name="gear" strokeWidth={1.6} />} title={meText.settings} fact={meText.settingsHint} onOpen={onSettings} />
      </RecordList>
    </div>
  )
}
