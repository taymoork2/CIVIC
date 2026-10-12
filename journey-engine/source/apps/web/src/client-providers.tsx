import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react'
import { ConvexReactClient } from 'convex/react'
import { useState, type ReactNode } from 'react'

import { authClient } from './auth-client'
import { convexUrl } from './convex-url'
import { UnitsProvider } from '@/kit/units'
import { StartupProvider, type StartupData } from './startup-context'
import { HouseholdDataProvider } from '@/household/household-data'

export function ClientProviders({ children, startup }: { children: ReactNode; startup?: StartupData }) {
  const [client] = useState(() => new ConvexReactClient(convexUrl()))
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
