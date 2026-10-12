import { cn } from '@/lib/utils'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { appText } from '@/copy'

const appShellClassName = cn(
  "app-shell",
  "[&.is-focus_.dock]:[inset-block-end:calc(env(safe-area-inset-bottom)_+_var(--space-3))]",
  "[&.is-focus_.app-main_>_.page]:w-full [&.is-focus_.app-main_>_.page]:max-w-none [&.is-focus_.app-main_>_.page]:mx-0 [&.is-focus_.app-main_>_.page]:pt-0 [&.is-focus_.app-main_>_.page]:gap-5",
  "[&.has-navigation:not(.is-focus)_.app-main_>_.page]:gap-5 [&.has-navigation:not(.is-focus)_.app-main_>_.page]:grid-cols-1",
)

const skipLinkClassName = cn(
  "skip-link",
  "absolute p-[var(--space-2)_var(--space-3)] bg-ink rounded-field",
  "[inset-block-start:var(--space-2)]",
  "[inset-inline-start:var(--space-2)]",
  "[z-index:60]",
  "[color:var(--bg)]",
  "[transform:translateY(-200%)]",
  "[&:focus]:transform-none",
)

const appBodyClassName = cn(
  "app-body",
  "contents",
  "[.app-shell:has(.app-loading)_&]:flex [.app-shell:has(.app-loading)_&]:flex-col [.app-shell:has(.app-loading)_&]:min-h-[100dvh]",
)

/** One centred column, 720px at most, from phone to desktop: the page and the dock share its edges. */
const columnClassName = 'mx-auto w-full max-w-[45rem]'

const appHeaderClassName = cn(
  "app-header",
  columnClassName,
  "flex flex-wrap min-h-12 items-center justify-between gap-3 p-[calc(env(safe-area-inset-top)_+_2px)_var(--space-2)_0]",
  "[.app-shell.is-focus_&]:hidden",
  "[.app-shell:has(.account-page)_&]:hidden",
  "[.app-shell:not(.has-navigation)_&]:max-w-[calc(26rem_+_2_*_var(--gutter))] [.app-shell:not(.has-navigation)_&]:px-[var(--gutter)] [.app-shell:not(.has-navigation)_&]:pt-[calc(env(safe-area-inset-top)_+_var(--space-3))] [.app-shell:not(.has-navigation)_&]:pb-[var(--space-3)]",
  "[.app-shell:has(.app-loading)_&]:w-full",
)

/** The blue serif wordmark, top right on every root page. */
const wordmarkClassName = cn(
  "wordmark",
  "[.app-shell.has-navigation_.app-header:has(.connection-offline)_&]:hidden",
  "inline-flex min-w-0 items-center gap-2 font-normal leading-[1.2] tracking-normal [&>span]:min-w-0 [&>span]:[overflow-wrap:anywhere]",
  "[color:var(--brand-ink)]",
  "[font-family:var(--font-brand)]",
  "text-[length:var(--type-wordmark)]",
  "[.app-shell.has-navigation_&]:ms-auto [.app-shell.has-navigation_&]:pe-3",
  "[.app-shell.has-navigation_&]:min-w-[min(100%,14rem)]",
  "[.app-shell:not(.has-navigation)_&]:-order-1",
  "[&_svg]:w-[1.75rem] [&_svg]:h-[1.75rem]",
  "[&_small]:block [&_small]:mt-[.25rem] [&_small]:text-ink-2 [&_small]:font-normal [&_small]:leading-[1.4] [&_small]:font-text [&_small]:normal-case",
  "[&_small]:text-[length:.875rem]",
  "[.app-shell.has-navigation_&_small]:hidden",
)

const headerStatusClassName = cn(
  "header-status",
  "flex items-center gap-2",
  "text-[length:var(--step--1)]",
)

const appMainClassName = cn(
  "app-main",
  columnClassName,
  "[&:has(.task-layout)]:max-w-[72rem]",
  "px-[var(--gutter)] pt-1 pb-[calc(var(--bar-bottom)_+_var(--bar-h)_+_var(--space-6))]",
  "[&:focus]:[outline:none]",
  "[.app-shell.is-focus:not(:has(.account-page))_&]:p-[calc(env(safe-area-inset-top)_+_2px)_var(--gutter)_var(--task-footer-clearance,200px)]",
  "[.app-shell:has(.primary-dock)_&]:pb-[calc(var(--bar-bottom)_+_var(--bar-h)_+_3.5rem_+_var(--space-7))]",
  "[.app-shell:has(.closet-now)_&]:pb-[calc(var(--bar-bottom)_+_var(--bar-h)_+_6rem_+_var(--space-6))]",
  "[.app-shell:has(.home-dock):not(:has(.app-main_.primary-dock))_&]:pb-[calc(var(--bar-bottom)_+_var(--bar-h)_+_160px)]",
  // Root task actions sit above the tabs; the last content row must clear both layers.
  "[.app-shell:has(.tabs):not(.is-focus):has(.app-main_[data-slot=task-footer])_&]:pb-[var(--task-footer-clearance,calc(var(--bar-bottom)_+_var(--bar-h)_+_200px))]",
  "[.app-shell:not(:has(.tabs)):not(.is-focus):not(:has(.primary-dock))_&]:pb-[calc(env(safe-area-inset-bottom)_+_var(--space-6))]",
  "[.app-shell:has(.app-loading)_&]:flex-1 [.app-shell:has(.app-loading)_&]:grid [.app-shell:has(.app-loading)_&]:items-center",
  "[.app-shell:has(.account-page)_&]:p-0",
)

/** The floating frosted dock: 64px tall, five equal tabs, centred in the same column as the page. */
const tabsClassName = cn(
  "tabs",
  "fixed min-w-0 mx-auto h-[var(--bar-h)] max-w-[calc(45rem_-_2_*_var(--gutter))] px-1.5 rounded-card",
  "min-[45rem]:max-w-[32.5rem]",
  "[inset-block-end:var(--bar-bottom)]",
  "[inset-inline:var(--gutter)]",
  "[z-index:30]",
  "[&_ul]:flex [&_ul]:h-full [&_ul]:items-center [&_ul]:overflow-x-auto [&_ul]:overscroll-x-contain [&_li]:flex-1 [&_li]:min-w-max",
  "max-[360px]:[&_li:nth-child(4)]:flex-[1.3]",
  "[&_a]:flex [&_a]:flex-col [&_a]:items-center [&_a]:justify-center [&_a]:gap-[3px] [&_a]:w-full [&_a]:min-h-12 [&_a]:rounded-control [&_a]:text-ink-2 [&_a]:no-underline [&_a]:font-semibold [&_a]:select-none",
  "[&_a]:text-[length:var(--type-dock)]",
  "[&_a]:min-w-[44px] [&_a]:px-1 [&_a_>_span:last-child]:whitespace-nowrap [&_a_>_span:last-child]:text-center [&_a_>_span:last-child]:leading-[1.2]",
  "[&_a]:[transition:transform_var(--dur-press)_var(--ease-out),_background-color_160ms_var(--ease-out),_color_160ms_var(--ease-out)]",
  "[&_a]:[touch-action:manipulation]",
  "[&_a]:[-webkit-user-select:none]",
  "[&_a]:[-webkit-touch-callout:none]",
  "[&_a_svg]:w-[1.25rem] [&_a_svg]:h-[1.25rem]",
  "[&_a[aria-current='page']]:[color:var(--accent)]",
  "[&_a:focus-visible]:[outline-offset:-3px]",
  "[.app-shell.is-focus_&]:hidden",
  "motion-reduce:[&_a]:animate-none motion-reduce:[&_a]:transition-none",
  "[&_a:active]:[transform:scale(.96)]",
  "[&_a:active]:bg-surface-2",
  "[:root[data-material='tonal']_&_a[aria-current='page']]:[background:var(--accent-container)]",
  "[:root[data-material='tonal']_&_a[aria-current='page']]:[color:var(--on-accent-container)]",
  "motion-reduce:[&_a:active]:transform-none",
  "[@media_(forced-colors:_active)]:[&_a[aria-current='page']]:[outline:2px_solid_Highlight]",
)

const glassClassName = cn(
  "glass",
  "[background:var(--glass)]",
  "[-webkit-backdrop-filter:blur(16px)_saturate(1.5)]",
  "[backdrop-filter:blur(16px)_saturate(1.5)]",
  "shadow-[var(--glass-hi),_var(--e2)]",
  "[border:1px_solid_var(--glass-border)]",
  "[@supports_not_((backdrop-filter:_blur(1px))_or_(-webkit-backdrop-filter:_blur(1px)))]:[background:var(--glass-solid)]",
  "[@media_(prefers-reduced-transparency:_reduce)]:[background:var(--glass-solid)]",
  "[@media_(prefers-reduced-transparency:_reduce)]:[-webkit-backdrop-filter:none]",
  "[@media_(prefers-reduced-transparency:_reduce)]:[backdrop-filter:none]",
  "[@media_(prefers-contrast:_more)]:bg-surface [@media_(prefers-contrast:_more)]:shadow-none",
  "[@media_(prefers-contrast:_more)]:[-webkit-backdrop-filter:none]",
  "[@media_(prefers-contrast:_more)]:[backdrop-filter:none]",
  "[@media_(prefers-contrast:_more)]:[border:1.5px_solid_var(--ink)]",
  "[:root[data-material='tonal']_&]:bg-surface-2 [:root[data-material='tonal']_&]:shadow-none",
  "[:root[data-material='tonal']_&]:[backdrop-filter:none]",
  "[:root[data-material='tonal']_&]:[-webkit-backdrop-filter:none]",
  "[:root[data-material='tonal']_&]:[border-color:transparent]",
  "[@media_(prefers-reduced-transparency:_reduce),_(prefers-contrast:_more)]:[background:var(--glass-solid)]",
  "[@media_(prefers-reduced-transparency:_reduce),_(prefers-contrast:_more)]:[backdrop-filter:none]",
  "[@media_(prefers-reduced-transparency:_reduce),_(prefers-contrast:_more)]:[-webkit-backdrop-filter:none]",
)

export const productName = appText.productName

/**
 * Home at `/` is the glance; Laundry at `/laundry` holds the hamper, pass and running loads. Closet
 * `/closet`, Household `/household` (machines, products and people) and Me `/me` (the signed-in
 * person's profile, with device preferences at `/settings` and account management at `/account`). `/session/$sessionId` is kept for
 * reminder links.
 */
export type NavigationItem = { label: string; to: '/' | '/laundry' | '/closet' | '/household' | '/me' }

export const navigationItems: readonly NavigationItem[] = [
  { label: appText.tabs.home, to: '/' },
  { label: appText.tabs.closet, to: '/closet' },
  { label: appText.tabs.laundry, to: '/laundry' },
  { label: appText.tabs.household, to: '/household' },
  { label: appText.tabs.me, to: '/me' },
]

/**
 * The tab a path belongs to, for the current-tab mark. Adding lives inside each tab; there is no
 * global +. Settings is opened from the cog on Me, so Me stays lit there.
 */
export function currentTab(path: string): NavigationItem['to'] | null {
  if (path === '/') return '/'
  if (path === '/settings' || path === '/account') return '/me'
  return navigationItems.find((item) => item.to !== '/' && (path === item.to || path.startsWith(`${item.to}/`)))?.to ?? null
}

/**
 * The tabs and the dock are for a signed-in person who has finished first run. Signed out, while
 * the sign-in is still being checked, during first run and in the server-rendered shell there is no
 * navigation at all: the screen shows only the product name, so nothing flashes and then goes.
 */
export function showsNavigation(state: { readonly signedIn: boolean; readonly household: boolean | undefined }): boolean {
  return state.signedIn && state.household === true
}

/** Focus mode: the load at the machine, and an open Laundry pass, belong to the step at hand. */
export function isFocusPath(path: string, search: { readonly plan?: unknown; readonly screen?: unknown }): boolean {
  if (import.meta.env.DEV && path === '/design-preview' && typeof search.screen === 'string' && (search.screen.startsWith('home-') || search.screen.startsWith('closet-') || search.screen.startsWith('me-') || ['settings-index', 'settings-password', 'settings-password-saved', 'laundry-index', 'laundry-session', 'household-index', 'household-people', 'household-invite', 'household-profile'].includes(search.screen))) return false
  return path.startsWith('/session/') || path.startsWith('/join/') || path === '/drying' || path === '/sign-in' || path === '/create-account' || path === '/forgot-password' || path === '/setup' || path === '/design-preview' || (path === '/laundry' && typeof search.plan === 'string')
}

type AppShellProps = {
  /** The shared brand can arrive as server-rendered markup. */
  brand?: ReactNode
  /** Navigation links, only for a signed-in person past first run; without them there are no tabs and no dock. */
  navigation?: ReactNode
  /** Header status area (connection and account). */
  status?: ReactNode
  /** The next laundry step, in a strip above the tabs on every tab. */
  dock?: ReactNode
  /** At the washer: the screen belongs to the load, so the header and tabs step aside. */
  focus?: boolean
  children: ReactNode
}

/** The brand mark: a measuring cup filled to the line. */
export function Mark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--accent-fill)" />
      <path fill="var(--on-accent)" fillRule="evenodd" d="M6.8 5.8h18.4l-2.75 20.9H9.55zM9.2 8.2h13.6l-2.45 16.1h-8.7z" />
      <path d="M9.6 15.5h12.8l-1.3 10H10.9z" fill="var(--accent)" />
    </svg>
  )
}

/** Keep a page control and its focus ring above the floating navigation. */
export function keepPageFocusVisible(page: HTMLElement | null) {
  const active = document.activeElement
  if (!(active instanceof HTMLElement) || active === page || !page?.contains(active) || active.closest('.task-footer, .dock')) return
  const overlays = page.closest('.app-shell')?.querySelectorAll('.tabs, .task-footer, .dock') ?? []
  const bottoms = [...overlays].filter((element) => getComputedStyle(element).position === 'fixed')
    .map((element) => element.getBoundingClientRect()).filter((bounds) => bounds.height > 0).map((bounds) => bounds.top)
  const bottom = Math.min(window.innerHeight, ...bottoms)
  const overflow = active.getBoundingClientRect().bottom - bottom + 12
  if (overflow > 0) window.scrollBy({ top: overflow, behavior: 'instant' })
}

export function AppShell({ brand, navigation, status, dock, focus = false, children }: AppShellProps) {
  const [hydrated, setHydrated] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  useEffect(() => setHydrated(true), [])
  useEffect(() => {
    const list = navRef.current?.querySelector('ul')
    const current = list?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!list || !current) return
    const revealCurrent = () => {
      const bounds = list.getBoundingClientRect()
      const tab = current.getBoundingClientRect()
      if (tab.left < bounds.left) list.scrollLeft += tab.left - bounds.left
      else if (tab.right > bounds.right) list.scrollLeft += tab.right - bounds.right
    }
    revealCurrent()
    if (typeof ResizeObserver === 'undefined') return
    const resize = new ResizeObserver(revealCurrent)
    resize.observe(list)
    return () => resize.disconnect()
  }, [navigation])
  return (
    // Keep server-rendered controls visible but inert until their handlers are attached.
    <div inert={!hydrated} className={cn(appShellClassName, focus ? 'is-focus' : '', navigation === undefined ? '' : 'has-navigation')}>
      {/* Opaque iOS edge boundary; ponytail: confirm native blur behavior on a physical phone. */}
      <div aria-hidden="true" data-slot="status-area" className="pointer-events-none fixed inset-x-0 top-0 z-40 h-[env(safe-area-inset-top)] bg-background" />
      <a className={skipLinkClassName} href="#main-content">
        {appText.skipToContent}
      </a>
      {/* Header and main stack in one column, so a desktop sidebar can sit beside them as the other. */}
      <div className={appBodyClassName}>
        <header className={appHeaderClassName}>
          {/* Status first, wordmark last: with the dock present the wordmark sits top right. */}
          <div className={headerStatusClassName}>{status}</div>
          <span className={wordmarkClassName}>
            {navigation !== undefined ? <span className="inline-block first-letter:italic">{productName}</span> : brand ?? <span className="inline-block first-letter:italic">{productName}<small>your closet, cared for.</small></span>}
          </span>
        </header>
        {/* Only keyboard focus scrolls: a mouse press focuses first, and scrolling then would move the control before its release. */}
        <main id="main-content" className={appMainClassName} tabIndex={-1} onFocusCapture={(event) => { if (event.target instanceof HTMLElement && event.target.matches(':focus-visible')) keepPageFocusVisible(event.currentTarget) }}>
          {children}
        </main>
      </div>
      {focus || navigation === undefined ? null : dock}
      {navigation === undefined ? null : (
        // A floating frosted dock at every width, centred in the page column.
        <nav ref={navRef} className={cn(tabsClassName, glassClassName)} aria-label={appText.primaryNavigation}>
          {navigation}
        </nav>
      )}
    </div>
  )
}
