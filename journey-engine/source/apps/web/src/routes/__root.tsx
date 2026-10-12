import { cn } from '@/lib/utils'
import { ClientOnly, HeadContent, Link, Outlet, Scripts, createRootRoute, useRouter, useRouterState } from '@tanstack/react-router'
import { useConvexAuth, useQuery } from 'convex/react'
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { Toaster } from 'sonner'
import dayColors from '../../../../packages/tokens/src/color/day.tokens.json'
import nightColors from '../../../../packages/tokens/src/color/night.tokens.json'

import { api } from '../api'
import { AppShell, currentTab, isFocusPath, navigationItems, productName, showsNavigation } from '@/kit/app-shell'
import { authClient } from '../auth-client'
import { appearanceBootScript, applyAppearance, loadAppearance, resolvedTheme } from '@/kit/appearance'
import { ClientProviders } from '../client-providers'
import { useOnline } from '../connectivity'
import { DesignIcon, type DesignIconName } from '@/kit/design-icons'
import { useOnboardingActive } from '@/account/onboarding-state'
import { appText } from '../copy'
import { LaundryDock, type DockLink } from '@/laundry/laundry-day'
import { PwaUpdates } from '../pwa'
import { NotFound, RouteErrorView } from '@/kit/route-error'
import { useNow } from '@/kit/use-now'
import { getStartup } from '../startup'
import { useStartup } from '../startup-context'
import { TimerNotices } from '@/laundry/timer-notices'
import { FeedbackContext, feedbackScreen } from '@/kit/feedback-context'
import { Button } from '@/components/ui/button'
import { errorCode, Loading } from '@/kit/ui'
import { purgePrivateState } from '@/private-state'

const FeedbackSheet = lazy(() => import('@/dev/feedback-sheet').then(module => ({ default: module.FeedbackSheet })))

import '../app.css'
import '../generated/tokens.css'

const tabIconWrapClassName = cn(
  "tab-icon-wrap",
  "relative place-items-center",
  "[display:inline-grid]",
)

const connectionOfflineClassName = cn(
  "connection-offline",
  "p-[2px_var(--space-2)] rounded-full bg-warn-bg text-warn-ink font-semibold",
)

const connectionClassName = cn(
  "connection",
  "inline-flex items-center gap-1 text-ink-2",
)

const visuallyHiddenClassName = cn(
  "visually-hidden",
  "absolute w-[1px] h-[1px] overflow-hidden whitespace-nowrap",
  "[clip-path:inset(50%)]",
)

export const Route = createRootRoute({
  // The initial request owns this snapshot; live Convex queries take over after hydration.
  staleTime: Infinity,
  loader: ({ location }) => getStartup({ data: { pathname: location.pathname } }),
  head: () => ({
    meta: [
      { title: productName },
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      {
        name: 'description',
        content: appText.description,
      },
      { name: 'theme-color', content: dayColors.color.day.bg.$value, media: '(prefers-color-scheme: light)' },
      { name: 'theme-color', content: nightColors.color.night.bg.$value, media: '(prefers-color-scheme: dark)' },
      { name: 'apple-mobile-web-app-title', content: 'Laundered Closet' },
    ],
    links: [
      { rel: 'manifest', href: '/manifest.webmanifest' },
      { rel: 'icon', href: '/icons/laundered-closet.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/icons/laundered-closet-apple-touch.png', sizes: '180x180' },
    ],
  }),
  component: RootDocument,
  errorComponent: RootErrorDocument,
  // Unknown addresses render for everyone (not behind RequireHousehold).
  notFoundComponent: NotFound,
})

/** A revoked query may arrive before Better Auth's session refresh; never leave private UI mounted. */
function RootErrorDocument({ error }: { error: unknown }) {
  const router = useRouter()
  const revoked = errorCode(error) === 'unauthenticated'
  useEffect(() => {
    if (!revoked) return
    purgePrivateState()
    // Reload auth from the current cookie; signing out here could revoke a newly switched account.
    window.location.replace('/sign-in')
  }, [revoked])
  return <html lang="en" suppressHydrationWarning><head><HeadContent /></head><body>
    <AppShell focus>{revoked ? <Loading what="sign-in" startup /> : <RouteErrorView error={error} onRetry={() => void router.invalidate()} />}</AppShell>
    <Scripts />
  </body></html>
}

// The design's own dock icons (home, closet, washer, people, person).
const navigationIcons = { '/': 'home', '/laundry': 'laundry', '/closet': 'closet', '/household': 'people', '/me': 'me' } as const satisfies Record<string, DesignIconName>

function Navigation() {
  const visualPreview = useRouterState({ select: (state) => import.meta.env.DEV && state.location.pathname === '/design-preview' })
  const path = useRouterState({ select: (state) => {
    if (import.meta.env.DEV && state.location.pathname === '/design-preview') {
      const screen = String((state.location.search as { screen?: unknown }).screen)
      if (screen.startsWith('home-')) return '/'
      if (screen === 'laundry-session') return '/'
      if (screen.startsWith('closet-')) return '/closet'
      if (screen.startsWith('me-')) return '/me'
      if (screen === 'laundry-index') return '/laundry'
      if (['household-index', 'household-people', 'household-invite', 'household-profile'].includes(screen)) return '/household'
    }
    return state.location.pathname
  } })
  const tab = currentTab(path)
  const { isAuthenticated } = useConvexAuth()
  const status = useQuery(api.households.onboardingStatus, isAuthenticated ? {} : 'skip')
  const householdId = status?.households[0]?.householdId
  const now = useNow(60_000)
  const attention = useQuery(api.closet.attention, visualPreview || householdId === undefined ? 'skip' : { householdId, now: Math.floor(now / 60_000) * 60_000 })
  const hamperCount = attention?.hamper.count ?? 0
  return (
    <ul>
      {navigationItems.map((item) => {
        // The mark follows currentTab, so Me stays lit on Settings.
        const current = item.to === tab
        return (
          <li key={item.to}>
            <Link to={item.to} activeOptions={{ exact: item.to === '/' }} aria-current={current ? 'page' : undefined}
              aria-label={item.to === '/laundry' && hamperCount > 0 ? appText.laundryTabWithHamper(hamperCount) : item.label}>
              <span className={tabIconWrapClassName}><DesignIcon name={navigationIcons[item.to]} /></span>
              <span>{item.label}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/** Whether the tabs and dock show: signed in, with a household (first run done). Unknown reads as no. */
function useShowsNavigation(): boolean {
  const { data: session, isPending } = authClient.useSession()
  const startup = useStartup()
  const { isAuthenticated, isLoading } = useConvexAuth()
  const status = useQuery(api.households.onboardingStatus, isAuthenticated ? {} : 'skip')
  // Creating or joining a household makes membership appear before the celebration and setup have been seen.
  const onboarding = useOnboardingActive()
  const guidance = (status ?? startup?.data.onboarding)?.households[0]?.guidance
  if (onboarding || (guidance?.status === 'started' && ['intent', 'setup'].includes(guidance.stage))) return false
  if (startup?.seedActive && startup.data.account === 'signed-in' && (isPending || (session !== null && (isLoading || (isAuthenticated && status === undefined))))) return ((status ?? startup.data.onboarding)?.households.length ?? 0) > 0
  return showsNavigation({ signedIn: session !== null && session !== undefined && isAuthenticated, household: status === undefined ? undefined : status.households.length > 0 })
}

export const dockLink: DockLink = (target, { className, children }) => {
  switch (target.to) {
    case 'add': return <Link to="/laundry" search={{ add: 'hamper' }} className={className}>{children}</Link>
    case 'make': return <Link to="/laundry" search={{ make: 'loads' }} className={className}>{children}</Link>
    case 'laundry': return <Link to="/laundry" className={className}>{children}</Link>
    case 'plan': return <Link to="/laundry" search={{ plan: target.planId }} className={className}>{children}</Link>
    case 'session': return <Link to="/session/$sessionId" params={{ sessionId: target.sessionId }} className={className}>{children}</Link>
    case 'closet': return <Link to="/closet" className={className}>{children}</Link>
    case 'drying': return <Link to="/drying" search={target.run === undefined ? {} : { run: target.run }} className={className}>{children}</Link>
  }
}

function Dock() {
  const onOwnDock = useRouterState({ select: (state) => state.location.pathname === '/' || state.location.pathname === '/laundry' || (import.meta.env.DEV && state.location.pathname === '/design-preview') })
  const { isAuthenticated } = useConvexAuth()
  const status = useQuery(api.households.onboardingStatus, isAuthenticated ? {} : 'skip')
  const householdId = status?.households[0]?.householdId ?? null
  const now = useNow(30_000)
  if (onOwnDock) return null
  return <LaundryDock householdId={householdId === null ? null : householdId as string} now={now} renderLink={dockLink} idle={false} />
}

/**
 * Home and Laundry place their own dock; other tabs float only a time-sensitive next step.
 */
function SignedInShell({ focus, children }: { focus: boolean; children: ReactNode }) {
  const navigation = useShowsNavigation()
  const startup = useStartup()
  const { isAuthenticated } = useConvexAuth()
  const status = useQuery(api.households.onboardingStatus, isAuthenticated ? {} : 'skip')
  const path = useRouterState({ select: (state) => state.location.pathname })
  const [reporting, setReporting] = useState(false)
  const householdId = status?.households[0]?.householdId
  const feedback = householdId === undefined ? null : (onClose: () => void, step?: string) => <FeedbackContext.Provider value={null}><Suspense fallback={<Loading what="feedback" />}><FeedbackSheet householdId={householdId} screen={feedbackScreen(path, step)} onClose={onClose} /></Suspense></FeedbackContext.Provider>
  return (
    <FeedbackContext.Provider value={feedback}>
    <AppShell brand={startup?.data.brand} navigation={navigation ? <Navigation /> : undefined} status={<ClientOnly><HeaderStatus />{feedback === null ? null : <Button type="button" variant="ghost" size="icon" aria-label="Report a problem" title="Report a problem" onClick={() => setReporting(true)}><DesignIcon name="chat" size="1em" aria-hidden="true" /></Button>}</ClientOnly>} dock={<Dock />} focus={focus}>
      {children}
      {navigation ? <ClientOnly><TimerNotices householdId={status?.households[0]?.householdId ?? null} /></ClientOnly> : null}
    </AppShell>
    {reporting && feedback !== null ? feedback(() => setReporting(false)) : null}
    </FeedbackContext.Provider>
  )
}

/** The connection, in the header. Sign out lives in Me. */
function HeaderStatus() {
  const online = useOnline()
  return (
    <span className={cn(connectionClassName, online ? '' : connectionOfflineClassName)} role="status">
      {online ? <span className={visuallyHiddenClassName}>{appText.online}</span> : <><DesignIcon name="offline" size="1em" strokeWidth={2.2} aria-hidden="true"  /> {appText.offline}</>}
    </span>
  )
}

/** Keeps this device's appearance on <html>, and follows a change made in another tab. */
function AppearanceSync() {
  useEffect(() => {
    applyAppearance(loadAppearance())
    const sync = (event: StorageEvent) => { if (event.key === null || event.key.startsWith('washcloset:prefs:')) applyAppearance(loadAppearance()) }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  return null
}

/** The toaster's theme, kept in step with `<html data-theme>` (this device's own choice; System follows the OS). */
function useToastTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => {
      const explicit = document.documentElement.getAttribute('data-theme')
      setTheme(explicit === 'light' || explicit === 'dark' ? explicit : resolvedTheme('system', media.matches))
    }
    sync()
    // data-theme changes from Settings (this tab) or AppearanceSync (another tab); both land as an attribute mutation.
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    media.addEventListener('change', sync)
    return () => { observer.disconnect(); media.removeEventListener('change', sync) }
  }, [])
  return theme
}

/**
 * Bottom-center on phone and tablet, above the tab bar and the laundry dock; bottom-right on desktop
 * (Tailwind's `lg`, 64rem), where there is no floating bar to clear.
 */
function useToastPosition(): 'top-center' {
  // Notices come down from the top on every size, clear of the docked footers and the tab bar.
  return 'top-center'
}

/**
 * The one Toaster in the app: top-center on every size, below the safe area. Errors stay inline next to what failed.
 */
function Toasts() {
  const theme = useToastTheme()
  const position = useToastPosition()
  return (
    <Toaster
      theme={theme}
      position={position}
      duration={4000}
      offset={{ top: 'calc(env(safe-area-inset-top) + var(--space-3))' }}
      mobileOffset={{ top: 'calc(env(safe-area-inset-top) + var(--space-3))' }}
      // Important: Sonner's own [data-sonner-theme] rules are more specific and would paint a black toast in dark mode.
      className="font-text [--normal-bg:var(--surface)]! [--normal-border:var(--line)]! [--normal-text:var(--ink)]! [--border-radius:var(--radius-card)]!"
      toastOptions={{ classNames: {
        toast: 'font-text! text-[length:var(--step-0)]! font-semibold! shadow-[var(--glass-shadow)]! p-4! gap-3!',
        actionButton: 'bg-surface-2! text-link! font-semibold! text-[length:var(--step--1)]! rounded-control! min-h-9! px-3!',
        icon: 'text-ready',
      } }}
    />
  )
}

function RootDocument() {
  const startup = Route.useLoaderData()
  const focus = useRouterState({ select: (state) => isFocusPath(state.location.pathname, state.location.search as { plan?: unknown; screen?: unknown }) })
  return (
    // The boot script sets data-theme and data-palette before hydration.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceBootScript }} />
        <HeadContent />
      </head>
      <body>
        <ClientProviders startup={startup}>
          <SignedInShell focus={focus}>
            <Outlet />
          </SignedInShell>
          <PwaUpdates />
          <AppearanceSync />
          <Toasts />
        </ClientProviders>
        <Scripts />
        {/* CIVIC's capture overlay (decision 0007): dev builds only, when `civic overlay` is running and VITE_CIVIC_OVERLAY names it. */}
        {import.meta.env.DEV && import.meta.env.VITE_CIVIC_OVERLAY ? <script src={`${import.meta.env.VITE_CIVIC_OVERLAY}/overlay.js`} defer /> : null}
      </body>
    </html>
  )
}
