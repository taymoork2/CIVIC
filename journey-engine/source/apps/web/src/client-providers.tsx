import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react'
import { ConvexReactClient } from 'convex/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { authClient } from './auth-client'
import { convexUrl } from './convex-url'
import { UnitsProvider } from '@/kit/units'
import { StartupProvider, type StartupData } from './startup-context'
import { HouseholdDataProvider } from '@/household/household-data'
import { PrivateAccount } from '@/kit/device-state'
import { rememberedPrivateAccount, rememberPrivateAccount } from './private-state'
import { toast } from 'sonner'

export function ClientProviders({ children, startup }: { children: ReactNode; startup?: StartupData }) {
  const { data: session, isPending, error } = authClient.useSession()
  const sessionId = session?.session.id ?? (isPending ? startup?.sessionId : undefined)
  const accountId = session?.user.id ?? (isPending ? startup?.accountId : undefined)
  const [remembered, setRemembered] = useState(rememberedPrivateAccount)
  useEffect(() => {
    if (accountId !== undefined) { rememberPrivateAccount(accountId); setRemembered(accountId) }
    else if (!isPending && !error) setRemembered(null)
  }, [accountId, isPending, error])
  const recoveryAccount = accountId ?? (isPending || error && (error.status ?? 0) < 400 ? remembered : null)
  // The auth bridge caches a token; a new session needs its own token and query cache.
  return <PrivateAccount value={recoveryAccount}><SessionProviders key={sessionId ?? 'signed-out'} startup={sessionId === startup?.sessionId ? startup : undefined}>{children}</SessionProviders></PrivateAccount>
}

function SessionProviders({ children, startup }: { children: ReactNode; startup?: StartupData }) {
  const [client] = useState(() => new ConvexReactClient(convexUrl()))
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      // React's effect replay reuses this client; close only after a real unmount.
      queueMicrotask(() => { if (!mounted.current) { toast.dismiss(); void client.close() } })
    }
  }, [client])
  const [providerAuthClient] = useState(() => {
    let checkingInitialSession = true
    // Inherit the client's proxy-backed API; spreading it loses dynamic token methods.
    return Object.assign(Object.create(authClient), {
      useSession() {
        const result = authClient.useSession()
        if (!result.isPending) checkingInitialSession = false
        // Only the bridge's first check consumes this ID; app session checks stay live.
        return checkingInitialSession && result.data == null && startup?.sessionId
          ? { ...result, data: { session: { id: startup.sessionId } } }
          : result
      },
    })
  })
  return (
    // The provider's AuthClient type does not unify with the plugin-inferred client type; the runtime shapes match.
    <ConvexBetterAuthProvider client={client} authClient={providerAuthClient as any} initialToken={startup?.token}>
      <StartupProvider data={startup}><HouseholdDataProvider><UnitsProvider>{children}</UnitsProvider></HouseholdDataProvider></StartupProvider>
    </ConvexBetterAuthProvider>
  )
}
