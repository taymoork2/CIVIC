import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DeviceScope } from '@/kit/device-state'
import { useConvexAuth, useQuery } from 'convex/react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'

import type { FunctionReturnType } from 'convex/server'

import { api } from '@/api'
import { authClient } from '@/auth-client'
import { accountText } from '@/copy'
import { useOnline } from '@/connectivity'
import { purgePrivateState, rememberPrivateAccount } from '@/private-state'
import { Loading, errorMessage } from '@/kit/ui'
import { endOnboarding, useOnboardingActive } from '@/account/onboarding-state'
import { safeRedirect } from '@/account/safe-redirect'
import { useStartup } from '@/startup-context'
import { clearPushDevice } from '@/account/push-settings'

const FirstRun = lazy(() => import('@/account/first-run').then(module => ({ default: module.FirstRun })))
const OfflineNotice = lazy(() => import('@/offline-view').then(module => ({ default: module.OfflineNotice })))

const welcomeClassName = cn(
  "welcome",
  "grid gap-4 max-w-[26rem] m-[var(--space-5)_auto_0]",
)

const labelCardClassName = cn(
  "label-card",
  "bg-surface rounded-card overflow-hidden",
  "[.household-page_>_&]:overflow-hidden [.household-page_>_&]:rounded-[1.25rem] [.household-page_>_&]:bg-transparent [.household-page_>_&]:border-0 [.household-page_>_&]:shadow-none",
  "[.household-page_>_&_h2]:font-text [.household-page_>_&_h2]:font-semibold [.household-page_>_&_h2]:leading-[1.3]",
  "[.household-page_>_&_h2]:text-[length:var(--step-2)]",
  "[.settings-page_&_h2]:font-text [.settings-page_&_h2]:font-semibold [.settings-page_&_h2]:leading-[1.3]",
  "[.settings-page_&_h2]:text-[length:var(--step-2)]",
  "[.settings-page_&]:border-0 [.settings-page_&]:shadow-[var(--shadow-sm)] [.settings-page_&]:rounded-[1.25rem]",
)

const paddedClassName = cn(
  "padded",
  "[.label-card&]:p-4 [.label-card&]:grid [.label-card&]:gap-3",
  "[.settings-page_.label-card&]:gap-4",
)

const mutedClassName = cn(
  "muted",
  "text-ink-2",
)

export type CurrentHousehold = FunctionReturnType<typeof api.households.onboardingStatus>['households'][number]

/** Signed-out people belong on the sign-in route, which brings them back to where they were going. */
function RedirectToSignIn() {
  const router = useRouter()
  const navigate = useNavigate()
  // The destination is fixed at mount. The router commits the new location before the sign-in
  // route has loaded, so this stays mounted with href already at /sign-in; reading it live (or
  // rendering <Navigate>, which navigates again on every render) would feed that URL back as
  // the redirect and restart the navigation without end.
  const [search] = useState<{ redirect?: string }>(() => {
    const href = router.state.location.href
    const redirect = href === '/' ? undefined : safeRedirect(href)
    return redirect === undefined ? {} : { redirect }
  })
  useEffect(() => { void navigate({ to: '/sign-in', search, replace: true }) }, [navigate, search])
  return <Loading what={accountText.loadingHousehold} startup />
}

/**
 * Renders children only for a signed-in member of a household. Losing membership
 * (removed, or the account deleted) purges this device's private state. On a load's page,
 * `sessionId` names the load, so offline it shows that load's saved copy and no other.
 */
export function RequireHousehold(props: { sessionId?: string; children: (household: CurrentHousehold) => ReactNode }) {
  return <Suspense fallback={<Loading what={accountText.loadingHousehold} startup />}><HouseholdAccess {...props} /></Suspense>
}

function HouseholdAccess({ sessionId, children }: { sessionId?: string; children: (household: CurrentHousehold) => ReactNode }) {
  const onboarding = useOnboardingActive()
  const startup = useStartup()
  const { data: session, isPending, error } = authClient.useSession()
  const online = useOnline()
  const { isAuthenticated, isLoading } = useConvexAuth()
  const status = useQuery(api.households.onboardingStatus, isAuthenticated ? {} : 'skip')
  const household = status?.households[0]

  // Neither a network failure nor an auth server error is a sign-out: keep device state and say what happened.
  const authError = session === null && error !== null && error !== undefined
  const unreachable = !online || (authError && !((error.status ?? 0) >= 400))
  useEffect(() => {
    if (unreachable || authError) return
    if (!isPending && session === null) purgePrivateState()
    if (status !== undefined && household === undefined) purgePrivateState()
    // First-run cleanup precedes household creation; restore the offline binding once access is established.
    if (isAuthenticated && household !== undefined && session !== null) rememberPrivateAccount(session.user.id)
  }, [unreachable, authError, isPending, session, status, household, isAuthenticated])

  if (unreachable && (session === null || !isAuthenticated || status === undefined)) return <OfflineNotice sessionId={sessionId} />
  if (authError) {
    return <SignInUnavailable />
  }
  if (isPending || (session !== null && (isLoading || (isAuthenticated && status === undefined)))) {
    // A cached public shell is signed out; wait for the live session before redirecting.
    if (startup?.seedActive && startup.data.account === 'signed-in' && startup.data.onboarding !== null) {
      const initialStatus = status ?? startup.data.onboarding
      const initialHousehold = initialStatus.households[0]
      if (initialHousehold === undefined) return <FirstRun displayName={initialStatus.displayName} />
      return <DeviceScope key={`${initialStatus.principalKey}:${initialHousehold.householdId}`} value={`${initialStatus.principalKey}:${initialHousehold.householdId}`}>{onboarding ? <FirstRun displayName={initialStatus.displayName} household={initialHousehold} /> : children(initialHousehold)}</DeviceScope>
    }
    return <Loading what={accountText.loadingHousehold} startup />
  }
  if (session === null || !isAuthenticated) return <RedirectToSignIn />
  // Full-screen setup belongs to this tab's first-run hold. Guidance started elsewhere shows the
  // app, and Home names the unfinished task instead of trapping every route.
  if (household === undefined) return <FirstRun displayName={status?.displayName ?? session.user.name ?? null} />
  return <DeviceScope key={`${status!.principalKey}:${household.householdId}`} value={`${status!.principalKey}:${household.householdId}`}>{onboarding ? <FirstRun displayName={status!.displayName} household={household} /> : children(household)}</DeviceScope>
}

export function SignInUnavailable() {
  return <section className={cn(labelCardClassName, paddedClassName, welcomeClassName)} role="alert">
    <h1>{accountText.signInUnavailable}</h1>
    <p className={mutedClassName}>{accountText.signInUnavailableDetail}</p>
    <Button type="button" onClick={() => window.location.reload()}>{accountText.tryAgain}</Button>
  </section>
}

export async function signOut() {
  await clearPushDevice()
  endOnboarding()
  purgePrivateState()
  await authClient.signOut()
}

/** Deletes the account. Convex removes household access and uploaded photos in the same transaction. */
export async function deleteAccount(password: string): Promise<string | null> {
  try {
    const result = await authClient.deleteUser({ password })
    if (result.error) return result.error.message || accountText.deletionFailed
    endOnboarding()
    purgePrivateState()
    await authClient.signOut().catch(() => undefined)
    return null
  } catch (error) {
    return errorMessage(error)
  }
}
