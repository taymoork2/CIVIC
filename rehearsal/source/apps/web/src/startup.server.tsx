import { cn } from '@/lib/utils'
import { getRequestHeader, setResponseHeader } from '@tanstack/react-start/server'
import { renderServerComponent } from '@tanstack/react-start/rsc'

import { api } from './api'
import { appText, countWord, homeText } from './copy'
import { getToken, fetchAuthQuery } from './convex-site.server'
import type { StartupData } from './startup-context'

/** Only Convex-authorized, request-scoped data enters the initial server render. */
const careHeroClassName = cn(
  "care-hero",
  "relative isolate grid gap-3 min-h-[7.5rem] p-4 rounded-[1rem] bg-surface text-ink overflow-clip shadow-[0_0_0_1px_var(--surface-edge),_var(--shadow-md)]",
  "[&_h1]:m-0 [&_h1]:font-semibold [&_h1]:leading-[1.2]",
  "[&_h1]:text-[length:var(--step-4)]",
  "[&_h1]:font-text",
  "[&_h1]:[overflow-wrap:anywhere]",
  "[&_p]:m-[.6rem_0_0] [&_p]:max-w-[32rem] [&_p]:leading-normal [&_p]:text-ink-2",
  "[&_p]:text-[length:var(--step-0)]",
  "[.closet_&]:grid [.closet_&]:grid-cols-[minmax(0,_1fr)_auto] [.closet_&]:items-center [.closet_&]:gap-3 [.closet_&]:overflow-visible",
  "[.wash_>_&_p]:text-[length:.875rem]",
  "[&.has-photo]:min-h-[22rem] [&.has-photo]:content-end [&.has-photo]:pt-[11rem]",
  "[&.has-photo_img]:w-full [&.has-photo_img]:h-full [&.has-photo_img]:object-cover",
  "[&.has-photo_img]:[object-position:center_30%]",
  "[&.has-photo::after]:[content:'']",
  "[&.has-photo::after]:absolute [&.has-photo::after]:pointer-events-none",
  "[&.has-photo::after]:[inset:0]",
  "[&.has-photo::after]:[z-index:0]",
  "[&.has-photo::after]:[background:linear-gradient(to_bottom,_transparent_24%,_color-mix(in_srgb,_var(--surface)_55%,_transparent)_47%,_var(--surface)_76%)]",
  "[.home-overview_&.has-photo]:min-h-[18rem] [.home-overview_&.has-photo]:pt-[10rem]",
  "[.home-overview_&.has-photo::after]:[background:none]",
  "[.page.wash_>_&]:col-[1_/_-1]",
  "max-[30rem]:[.closet_>_&]:min-h-[9rem]",
  "max-[30rem]:[.wash_>_&]:min-h-[9rem]",
  "[.settings-page_&]:grid-cols-[auto_minmax(0,_1fr)] [.settings-page_&]:items-center",
  "min-[37.5rem]:p-6",
  "min-[37.5rem]:[&.has-photo]:min-h-[24rem] min-[37.5rem]:[&.has-photo]:pt-[13rem]",
  "min-[37.5rem]:[.home-overview_&.has-photo]:pt-[12rem]",
  "lg:[.home-overview_&.has-photo]:min-h-[20rem]",
  "motion-reduce:animate-none",
  "[@media_(forced-colors:_active)]:[border:1px_solid_CanvasText]",
)

const careHeroArtClassName = cn(
  "care-hero-art",
  "absolute w-[5rem] h-[5rem] grid place-items-center",
  "[inset-inline-end:var(--space-4)]",
  "[inset-block-start:var(--space-4)]",
  "[&_svg]:w-full [&_svg]:h-full",
  "[.closet_&]:w-[3rem] [.closet_&]:h-[3rem]",
  "[.care-hero.has-photo_&]:[inset:0]",
  "[.care-hero.has-photo_&]:w-full [.care-hero.has-photo_&]:h-full",
  "[.home-overview_.care-hero.has-photo_&]:h-[10rem]",
  "[.home-overview_.care-hero.has-photo_&]:[mask-image:linear-gradient(to_bottom,_#000_55%,_transparent)]",
  "min-[37.5rem]:[.home-overview_.care-hero.has-photo_&]:h-[12rem]",
)

const careHeroCopyClassName = cn(
  "care-hero-copy",
  "relative pe-[5rem] self-center",
  "[z-index:1]",
  "[.closet_&]:pe-0",
  "[.closet_&_p]:text-[length:.875rem]",
  "[.care-hero.has-photo_&]:pe-0",
  "[.settings-page_&]:col-[2] [.settings-page_&]:row-[1] [.settings-page_&]:p-0",
  "min-[37.5rem]:[.care-hero.has-photo_&]:max-w-[34rem]",
)

export async function buildStartup(pathname: string): Promise<StartupData> {
  setResponseHeader('Cache-Control', 'private, no-store')
  setResponseHeader('Vary', 'Cookie, Authorization')
  const brand = await renderServerComponent(<span className="inline-block first-letter:italic">{appText.productName}<small>your closet, cared for.</small></span>)
  const base = { brand, token: undefined, onboarding: null, homeSummary: null } as const
  // No credentials means there is nothing to check with the auth backend.
  if (!getRequestHeader('cookie') && !getRequestHeader('authorization')) {
    setResponseHeader('Cache-Control', 'no-cache')
    return { ...base, account: 'signed-out' }
  }
  try {
    const token = await getToken()
    if (!token) return { ...base, account: 'signed-out' }
    const onboarding = await fetchAuthQuery(api.households.onboardingStatus, {})
    const household = onboarding.households[0]
    const args = household === undefined ? null : { householdId: household.householdId }
    const snapshot = args === null ? null : await Promise.all([
      fetchAuthQuery(api.inventory.list, { ...args, textileIds: [] }), fetchAuthQuery(api.execution.householdSessions, args),
      fetchAuthQuery(api.closet.attention, { ...args, now: Math.floor(Date.now() / 60_000) * 60_000 }),
      fetchAuthQuery(api.closet.today, { ...args, summaryOnly: true }), fetchAuthQuery(api.plans.upNext, args),
    ]).then(([inventory, sessions, attention, today, plan]) => ({ ...args, inventory, sessions, attention, today, plan }))
    const attention = pathname === '/' ? snapshot?.attention ?? null : null
    const homeSummary = attention === null ? null : await renderServerComponent(
      <header className={cn(careHeroClassName, attention.hamper.count > 0 ? ' has-photo' : '')}>
        {attention.hamper.count > 0 ? <div className={careHeroArtClassName} aria-hidden="true"><img src="/design/folded-tees.png" alt="" /></div> : null}
        <div className={careHeroCopyClassName}>
          <h1>{attention.hamper.count > 0 ? `${countWord(attention.hamper.count, 'piece')} waiting for care` : homeText.loadingTitle}</h1>
          <p>Getting your care overview ready…</p>
        </div>
      </header>,
    )
    // This token was accepted by the authorized queries above. Seed only its session ID,
    // so Better Auth's pending → resolved handoff doesn't reset Convex authentication.
    const { sessionId } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as { sessionId?: string }
    return { account: 'signed-in', token, sessionId, onboarding, brand, homeSummary, snapshot }
  } catch {
    // An unreachable auth service or rejected membership is not evidence of a sign-out.
    return { ...base, account: 'unknown' }
  }
}
