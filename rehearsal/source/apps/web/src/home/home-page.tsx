import { cn } from '@/lib/utils'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import type { FunctionArgs } from 'convex/server'
import type { ReactNode } from 'react'

import { RequireHousehold } from '@/account/account'
import { api } from '../api'
import { homeText } from '../copy'
import { homeHeroText } from '../copy-closet'
import { homeHeroView, setupParts, setupTarget, type HeroFacts, type HeroTarget } from '@/home/home-hero'
import { HomeCareOverview, HomeGuidance, HomeHero, HomeOutfitAction, HomeQuickLinks, HomeReadyTiles, HomeSetupCard, type HeroLink, type OverviewCount } from '@/home/home-sections'
import { useLaundryDay } from '@/laundry/laundry-day'
import type { WashPlace } from '../private-state'
import { useNow } from '@/kit/use-now'
import { ErrorNotice, Loading, useConvexCall } from '@/kit/ui'
import { guidanceAction, guidanceDestination, type GuidanceStage, type GuidanceStatus } from '@/account/onboarding-state'
import { CareHero, CategoryPhoto, photoBlendClassName } from '@/products/product-ui'
import type { Inventory, Textile } from '@/household/inventory-types'
import type { Today } from '@/closet/closet-view'
import { dryingFacts, earlyChecks, type EarlyCheck, type HubState } from '@/home/hub-state'
import { EarlyChecks } from '@/drying/early-check-card'
import { useStartup } from '../startup-context'
import { garmentKey, groupGarments } from '@/closet/garment-groups'
import { GarmentIcon, garmentCategoryPhoto } from '@/kit/garment-icon'
import { useHouseholdData } from '@/household/household-data'
import { DailyOutfit, DailyOutfitSummary } from '@/closet/daily-outfit'

const pageClassName = cn(
  "page",
  "[.app-shell.is-focus_&]:max-w-[30rem]",
  "grid gap-5 max-w-[36rem] mx-auto pt-1",
  "md:max-w-[45rem]",
  "[.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:w-full [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:max-w-[none] [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:mx-0 [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:pt-0 [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:content-start",
)

const homeOverviewClassName = cn(
  "home-overview",
  "[.page&]:grid [.page&]:grid-cols-[minmax(0,_1fr)] [.page&]:pt-0 [.page&]:items-start",
  "[@media_(min-width:_48rem)_and_(max-width:_63.999rem)]:[.page&]:max-w-[42rem]",
  "lg:[.page&]:max-w-[45rem] lg:[.page&]:content-start",
)

/** Home's links as router links; each target is one the hero, setup row or quick links names. */
const homeLink: HeroLink = (target: HeroTarget, { className, children, ariaLabel }) => {
  switch (target.to) {
    case 'session': return <Link to="/session/$sessionId" params={{ sessionId: target.sessionId }} className={className} aria-label={ariaLabel}>{children}</Link>
    case 'plan': return <Link to="/laundry" search={{ plan: target.planId }} className={className} aria-label={ariaLabel}>{children}</Link>
    case 'closet': return <Link to="/closet" className={className} aria-label={ariaLabel}>{children}</Link>
    case 'add': return <Link to="/closet" search={{ add: 'choose' }} className={className} aria-label={ariaLabel}>{children}</Link>
    case 'garment': return <Link to="/closet" search={{ item: target.textileId, returnTo: 'home' }} mask={{ to: '/closet', search: { item: target.textileId } }} state={{ itemReturnTo: '/' }} resetScroll={false} className={className} aria-label={ariaLabel}>{children}</Link>
    case 'household': return <Link to="/household" search={{ section: target.section }} className={className} aria-label={ariaLabel}>{children}</Link>
    case 'laundry': return <Link to="/laundry" className={className} aria-label={ariaLabel}>{children}</Link>
    case 'drying': return <Link to="/drying" search={target.run === undefined ? {} : { run: target.run }} className={className} aria-label={ariaLabel}>{children}</Link>
    case 'setup': return <Link to="/setup" search={target.replay ? { replay: true } : {}} className={className} aria-label={ariaLabel}>{children}</Link>
  }
}


export function Home() {
  return <RequireHousehold>{(household) => <HomePage householdId={household.householdId} washPlace={household.washPlace} />}</RequireHousehold>
}

/** A glance at the real laundry day; detailed decisions and edits stay in Laundry. */
function HomePage({ householdId, washPlace }: { householdId: string; washPlace: WashPlace | null }) {
  const navigate = useNavigate()
  const guidanceCall = useConvexCall(api.households.setGuidance)
  const startup = useStartup()
  const shared = useHouseholdData(householdId)
  const now = useNow(30_000)
  const state = useLaundryDay(householdId, now)
  const queue = useQuery(api.dryingQueue.queue, { householdId: householdId as FunctionArgs<typeof api.dryingQueue.queue>['householdId'] })
  const inventory = useQuery(api.inventory.list, { householdId: householdId as FunctionArgs<typeof api.inventory.list>['householdId'], textileIds: [] }) ?? shared?.inventory
  const overview = useQuery(api.inventoryBrowse.summary, { householdId: householdId as FunctionArgs<typeof api.inventoryBrowse.summary>['householdId'], search: '', section: 'all', tags: [] })
  const readyPreview = useQuery(api.inventoryBrowse.readyPreview, { householdId: householdId as FunctionArgs<typeof api.inventoryBrowse.readyPreview>['householdId'] })
  const today = useQuery(api.closet.today, { householdId: householdId as FunctionArgs<typeof api.closet.today>['householdId'], summaryOnly: true }) ?? shared?.today
  const status = useQuery(api.households.onboardingStatus, {}) ?? startup?.data.onboarding
  const initialSummary = startup?.data.onboarding?.households[0]?.householdId === householdId ? startup.data.homeSummary : null
  if (state === undefined || inventory === undefined || today === undefined || overview === undefined) return <div className={cn(pageClassName, homeOverviewClassName)}>{initialSummary ?? <CareHero variant="home" title={homeText.loadingTitle} />}<Loading what={homeText.loadingLaundry} /></div>

  const meWearerId = inventory.wearers.find((wearer) => wearer.principalKey !== null && wearer.principalKey === status?.principalKey)?.wearerId ?? null
  const guidance = status?.households.find((household) => household.householdId === householdId)?.guidance
  return <HomeOverview inventory={inventory} overview={overview} readyPreview={readyPreview ?? []} today={today} state={state} now={now} washPlace={washPlace} checks={earlyChecks(queue === undefined ? undefined : dryingFacts(queue))}
    guidance={guidance === undefined ? undefined : { status: guidance, pending: guidanceCall.pending, notice: <ErrorNotice error={guidanceCall.error} />, onResume: (stage) => {
      if (guidanceCall.pending) return
      void (async () => {
        // Saving the stage moves an unchosen start off the chooser, so no device reopens it.
        const saved = await guidanceCall.run({ householdId: householdId as FunctionArgs<typeof api.households.setGuidance>['householdId'], command: 'resume', stage })
        if (saved !== undefined) void navigate(guidanceDestination(saved.stage))
      })()
    } }}
    outfitSummary={<DailyOutfitSummary householdId={householdId} now={now} wearerId={meWearerId ?? inventory.wearers[0]?.wearerId ?? null} />}
    outfit={<DailyOutfit key={householdId} householdId={householdId} inventory={inventory} now={now} meWearerId={meWearerId} />} />
}

/** The garments by their own record, so identical pieces saved together read as one garment. */
export function heroFacts(textiles: readonly Textile[]): HeroFacts {
  const groups = new Map<string, Textile[]>()
  for (const textile of textiles) {
    if (textile.guest) continue
    const key = JSON.stringify([garmentKey(textile), textile.kind, textile.wearerId])
    const group = groups.get(key)
    if (group) group.push(textile)
    else groups.set(key, [textile])
  }
  const only = groups.size === 1 ? [...groups.values()][0]! : null
  return {
    garmentGroups: groups.size,
    pieces: [...groups.values()].reduce((sum, group) => sum + group.length, 0),
    only: only === null ? null : { textileId: only[0]!.textileId, name: only[0]!.name, pieces: only.length, careUnknown: only.some((textile) => textile.care === null || textile.care.status !== 'confirmed') },
  }
}

/** Home's guidance row inputs: the saved state, and how Resume saves its stage before navigating. */
export type HomeGuidanceInput = {
  readonly status: GuidanceStatus
  readonly pending: boolean
  readonly notice?: ReactNode
  readonly onResume: (stage: Exclude<GuidanceStage, 'intent'>) => void
}

export function HomeOverview({ inventory, today, state, now, outfit, outfitSummary, guidance, washPlace = null, checks = [], overview: inventoryOverview, readyPreview }: { inventory: Inventory; today: Today; state: HubState; now: number; outfit?: ReactNode; outfitSummary?: ReactNode; guidance?: HomeGuidanceInput; washPlace?: WashPlace | null; checks?: readonly EarlyCheck[]; overview?: import('convex/server').FunctionReturnType<typeof api.inventoryBrowse.summary>; readyPreview?: import('convex/server').FunctionReturnType<typeof api.inventoryBrowse.readyPreview> }) {
  const readyIds = new Set<string>(today.ready.map((textile) => textile._id))
  const facts = inventoryOverview?.facts ?? heroFacts(inventory.textiles)
  const hasClothes = facts.garmentGroups > 0
  const readyTiles = readyPreview ?? groupGarments(inventory.textiles.filter(textile => !textile.guest && readyIds.has(textile.textileId))).slice(0, 6).map(group => ({ textile: group.members[0]!, count: group.members.length }))
  const needsCare = inventory.textiles.filter((textile) => !textile.guest && textile.care?.status !== 'confirmed')
  const firstNeedsCare = inventoryOverview === undefined ? needsCare[0]?.textileId ?? null : inventoryOverview.needsCare
  const machines = inventory.machines as Inventory['machines'] | undefined
  const supplies = inventory.supplies as Inventory['supplies'] | undefined
  const parts = machines === undefined || supplies === undefined ? [] : setupParts({ machines: machines.length, supplies: supplies.length, washPlace })
  const overview = homeHeroText.overview
  const hero = homeHeroView(state, facts, now)
  // Resume follows the setup card; Replay is quiet text after everything else.
  const action = guidanceAction(guidance?.status, hero.scene)
  const guidanceRow = guidance === undefined ? null : <HomeGuidance action={action} pending={guidance.pending} notice={guidance.notice} renderLink={homeLink}
    onResume={() => { if (action?.kind === 'resume') guidance.onResume(action.stage) }} />
  const resume = action?.kind === 'resume' ? guidanceRow : null
  // Ready, Hamper and Washing always show; the rarer states appear only when a garment is in them.
  const counts: OverviewCount[] = [
    { key: 'ready', label: overview.ready, count: today.readyCount, dot: 'bg-ready' },
    { key: 'hamper', label: overview.hamper, count: today.notReady.dirty, dot: 'bg-hamper' },
    { key: 'washing', label: overview.washing, count: today.notReady.in_wash, dot: 'bg-washing' },
    ...([
      { key: 'drying', label: overview.drying, count: today.notReady.hanging, dot: 'bg-hanging' },
      { key: 'refresh', label: homeText.refresh, count: today.notReady.needs_refresh, dot: 'bg-hamper' },
      { key: 'cleaner', label: homeText.cleaner, count: today.notReady.needs_dry_clean + today.notReady.at_cleaner, dot: 'bg-hanging' },
    ] satisfies OverviewCount[]).filter((entry) => entry.count > 0),
  ]

  return (
    <div className={cn(pageClassName, homeOverviewClassName)}>
      <h1 className="m-0 font-text text-[length:var(--step-4)] font-semibold leading-[1.2] tracking-normal">{hasClothes ? homeHeroText.title.today : homeHeroText.title.first}</h1>
      <HomeHero view={hero} renderLink={homeLink} />
      {/* A running dryer's early check: its countdown, then the one action, so the check is never something to remember. */}
      <EarlyChecks checks={checks} now={now} skipDue={state.kind === 'dryer_check' && state.early !== undefined} renderOpen={(run, props) => homeLink({ to: 'drying', run }, props)} />
      {hasClothes ? <>
        <HomeCareOverview title={overview.title} caption={overview.pieces(facts.pieces)} counts={counts} renderLink={homeLink}
          labelFlag={firstNeedsCare === null || (hero.primary?.target.to === 'garment' && hero.primary.target.textileId === firstNeedsCare) ? null : { text: overview.labelFlag, target: { to: 'garment', textileId: firstNeedsCare } }} />
        <HomeQuickLinks renderLink={homeLink} />
        {outfit === undefined ? null : <HomeOutfitAction summary={outfitSummary}>{outfit}</HomeOutfitAction>}
        {readyTiles.length === 0 ? null : <HomeReadyTiles title="Ready to wear or use" closetLabel="Closet" closetLink={props => homeLink({ to: 'closet' }, props)} tiles={readyTiles.map(({ textile, count }) => ({
          key: textile.textileId, name: textile.name, count, tags: [],
          art: garmentCategoryPhoto(textile.kind, textile.colorGroup) === undefined ? <GarmentIcon kind={textile.kind} colorGroup={textile.colorGroup} /> : <CategoryPhoto src={garmentCategoryPhoto(textile.kind, textile.colorGroup)!} fallback={<GarmentIcon kind={textile.kind} colorGroup={textile.colorGroup} />} className={cn('size-full object-cover', photoBlendClassName)} />,
          label: `${textile.name}, ${count} ready`, link: props => homeLink({ to: 'garment', textileId: textile.textileId }, props),
        }))} />}
      </> : null}
      {resume}
      <HomeSetupCard parts={parts} target={setupTarget} renderLink={homeLink} />
      {action?.kind === 'replay' ? guidanceRow : null}
    </div>
  )
}
