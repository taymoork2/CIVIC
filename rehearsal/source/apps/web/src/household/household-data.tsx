import { createContext, useContext, useRef, type ReactNode } from 'react'
import { useConvexAuth, useQuery } from 'convex/react'
import type { FunctionReturnType, FunctionArgs } from 'convex/server'
import { api } from '@/api'
import { authClient } from '@/auth-client'
import { useStartup } from '@/startup-context'
import { useNow } from '@/kit/use-now'

export type HouseholdSnapshot = {
  householdId: FunctionArgs<typeof api.inventory.list>['householdId']
  inventory: FunctionReturnType<typeof api.inventory.list>
  sessions: FunctionReturnType<typeof api.execution.householdSessions>
  attention: FunctionReturnType<typeof api.closet.attention>
  today: FunctionReturnType<typeof api.closet.today>
  plan: FunctionReturnType<typeof api.plans.upNext>
}

type HouseholdData = { [K in keyof HouseholdSnapshot]: HouseholdSnapshot[K] | undefined }
const Context = createContext<HouseholdData | null>(null)

/** One live subscription set survives tab changes; auth and household changes discard it. */
export function HouseholdDataProvider({ children }: { children: ReactNode }) {
  const startup = useStartup()
  const { data: session, isPending } = authClient.useSession()
  const { isAuthenticated, isLoading } = useConvexAuth()
  const status = useQuery(api.households.onboardingStatus, isAuthenticated ? {} : 'skip')
  const seed = startup?.seedActive && (isPending || (session != null && (isLoading || isAuthenticated))) ? startup.data.snapshot : null
  const householdId = isAuthenticated ? (status === undefined ? seed?.householdId : status.households[0]?.householdId) : seed?.householdId
  return <Subscriptions key={householdId ?? 'signed-out'} householdId={householdId} authenticated={isAuthenticated} seed={seed}>{children}</Subscriptions>
}

function Subscriptions({ householdId, authenticated, seed, children }: {
  householdId: HouseholdSnapshot['householdId'] | undefined
  authenticated: boolean
  seed: HouseholdSnapshot | null | undefined
  children: ReactNode
}) {
  const now = useNow(30_000)
  const args = householdId !== undefined && authenticated ? { householdId } : 'skip'
  const inventory = useQuery(api.inventory.list, args === 'skip' ? 'skip' : { ...args, textileIds: [] })
  const sessions = useQuery(api.execution.householdSessions, args)
  const attention = useQuery(api.closet.attention, args === 'skip' ? 'skip' : { ...args, now: Math.floor(now / 60_000) * 60_000 })
  const today = useQuery(api.closet.today, args === 'skip' ? 'skip' : { ...args, summaryOnly: true })
  const plan = useQuery(api.plans.upNext, args)
  // These ancillary screens also arrive from the same live Convex cache.
  useQuery(api.households.members, args)
  const previousAttention = useRef(attention)
  if (attention !== undefined) previousAttention.current = attention
  // Keep the authorized startup snapshot until each live query arrives. The keyed parent
  // discards it on auth/household changes; ending auth bootstrap must not unmount open forms.
  const initial = useRef(seed?.householdId === householdId ? seed : null).current
  return <Context.Provider value={{ householdId, inventory: inventory ?? initial?.inventory,
    sessions: sessions ?? initial?.sessions, attention: attention ?? previousAttention.current ?? initial?.attention,
    today: today ?? initial?.today, plan: plan === undefined ? initial?.plan : plan }}>{children}</Context.Provider>
}

export function useHouseholdData(householdId: string | null) {
  const data = useContext(Context)
  return data?.householdId === householdId ? data : null
}
