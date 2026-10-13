import { createContext, useContext, useEffect, useState, type JSX, type ReactNode } from 'react'
import type { FunctionReturnType } from 'convex/server'
import { useConvexAuth, useQuery } from 'convex/react'
import type { RenderableServerComponent } from '@tanstack/react-start/rsc'

import { api } from './api'
import { authClient } from './auth-client'
import type { HouseholdSnapshot } from '@/household/household-data'

export type StartupData = {
  account: 'signed-out' | 'signed-in' | 'unknown'
  token: string | undefined
  sessionId?: string
  accountId?: string
  onboarding: FunctionReturnType<typeof api.households.onboardingStatus> | null
  brand: RenderableServerComponent<JSX.Element>
  homeSummary: RenderableServerComponent<JSX.Element> | null
  snapshot?: HouseholdSnapshot | null
}

const StartupContext = createContext<{ data: StartupData; seedActive: boolean } | null>(null)

/** Auth metadata seeds only the initial session check; a later sign-in must authenticate anew. */
export function StartupProvider({ data, children }: { data?: StartupData; children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession()
  const { isAuthenticated, isLoading } = useConvexAuth()
  const onboarding = useQuery(api.households.onboardingStatus, isAuthenticated ? {} : 'skip')
  const [seedActive, setSeedActive] = useState(true)
  useEffect(() => {
    if (!isPending && (session === null || (!isLoading && onboarding !== undefined))) setSeedActive(false)
  }, [isPending, session, isLoading, onboarding])
  // The document shell also renders during router errors and hot updates without loader data.
  const matchesSession = session?.session.id === data?.sessionId || (isPending && session === null)
  return <StartupContext.Provider value={data === undefined || !matchesSession ? null : { data, seedActive }}>{children}</StartupContext.Provider>
}

export function useStartup() {
  return useContext(StartupContext)
}
