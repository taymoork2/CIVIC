import { renderToStaticMarkup } from './test/markup'
import { beforeEach, expect, test, vi } from 'vitest'
import type { ReactNode } from 'react'
import { getFunctionName } from 'convex/server'

const mock = vi.hoisted(() => ({ provider: vi.fn(), authenticated: false, authLoading: true, sessionPending: true,
  session: null as { user: { name: string } } | null, status: undefined as unknown }))
vi.mock('@convex-dev/better-auth/react', () => ({
  ConvexBetterAuthProvider: (props: { children: ReactNode; initialToken?: string }) => { mock.provider(props); return props.children },
}))
vi.mock('convex/react', () => ({
  ConvexReactClient: class {},
  useConvexAuth: () => ({ isAuthenticated: mock.authenticated, isLoading: mock.authLoading }),
  useQuery: (query: Parameters<typeof getFunctionName>[0]) => getFunctionName(query) === 'households:onboardingStatus' ? mock.status : undefined,
}))
vi.mock('./auth-client', () => ({ authClient: { useSession: () => ({ data: mock.session, isPending: mock.sessionPending }) } }))
vi.mock('./convex-url', () => ({ convexUrl: () => 'http://localhost:3210' }))

import { ClientProviders } from './client-providers'
import { useStartup, type StartupData } from './startup-context'
import { useHouseholdData } from '@/household/household-data'

function Probe() { return <p>{useStartup()?.data.account ?? 'awaiting live auth'}</p> }
beforeEach(() => { vi.clearAllMocks(); Object.assign(mock, { authenticated: false, authLoading: true, sessionPending: true, session: null, status: undefined }) })

test('the shell can render without a startup snapshot and continues through live auth', () => {
  expect(renderToStaticMarkup(<ClientProviders><Probe /></ClientProviders>)).toContain('awaiting live auth')
  expect(mock.provider.mock.calls[0][0].initialToken).toBeUndefined()
})

test('startup seeds the token and bridge session ID without changing the app session', () => {
  const startup = { account: 'signed-in', token: 'initial-token', sessionId: 'session-a', onboarding: null, brand: null, homeSummary: null } as unknown as StartupData
  expect(renderToStaticMarkup(<ClientProviders startup={startup}><Probe /></ClientProviders>)).toContain('signed-in')
  expect(mock.provider.mock.calls[0][0].initialToken).toBe('initial-token')
  expect(mock.provider.mock.calls[0][0].authClient.useSession().data.session.id).toBe('session-a')
  expect(mock.session).toBeNull()
  mock.sessionPending = false
  expect(mock.provider.mock.calls[0][0].authClient.useSession().data).toBeNull()
  mock.sessionPending = true
  expect(mock.provider.mock.calls[0][0].authClient.useSession().data).toBeNull()
})

test('private data seeds the initial check, but never a resolved sign-out, rejected token or different household', () => {
  const startup = { account: 'signed-in', token: 'initial-token', onboarding: null, brand: null, homeSummary: null,
    snapshot: { householdId: 'household-a', inventory: { textiles: [{ name: 'Private shirt' }] } } } as unknown as StartupData
  function PrivateProbe() { return <p>{useHouseholdData('household-a')?.inventory?.textiles[0]?.name ?? 'No private data'}</p> }
  const render = () => renderToStaticMarkup(<ClientProviders startup={startup}><PrivateProbe /></ClientProviders>)
  expect(render()).toContain('Private shirt')
  Object.assign(mock, { sessionPending: false, authLoading: false })
  expect(render()).toContain('No private data')
  mock.session = { user: { name: 'Someone' } }
  expect(render()).toContain('No private data')
  mock.authenticated = true
  mock.status = { households: [] }
  expect(render()).toContain('No private data')
  mock.status = { households: [{ householdId: 'household-b' }] }
  expect(render()).toContain('No private data')
})
