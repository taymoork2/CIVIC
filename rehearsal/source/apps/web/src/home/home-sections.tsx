import { buttonVariants } from '@/components/ui/button'
import { ItemContent, ItemDescription, ItemGroup, ItemTitle, itemVariants } from '@/components/ui/item'
import { cn } from '@/lib/utils'
import { useState, type ReactNode } from 'react'

import { homeHeroText } from '@/copy-closet'
import { DesignIcon, type DesignIconName } from '@/kit/design-icons'
import type { HeroLoad, HeroScene, HeroTarget, HomeHeroView, SetupPart } from '@/home/home-hero'
import { recordText } from '@/copy'
import { chipClassName } from '@/closet/closet-parts'
import { MediaTile, StatusMark } from '@/kit/record-row'
import type { GuidanceAction } from '@/account/onboarding-state'
import { TrialNote } from '@/laundry/laundry-ui'
import { TapRow } from '@/laundry/laundry-kit'

export type HeroLink = (target: HeroTarget, props: { className: string; children: ReactNode; ariaLabel?: string }) => ReactNode

/** The hero's media band takes the tone of what the card is about: sage ready, yellow waiting, blue washing, lilac drying. */
const mediaToneClassName: Record<HomeHeroView['mark']['tone'], string> = {
  ready: 'bg-ready-bg',
  waiting: 'bg-hamper-bg',
  confirm: 'bg-hamper-bg',
  washing: 'bg-washing-bg',
  drying: 'bg-hanging-bg',
  conflict: 'bg-conflict-bg',
  done: 'bg-ready-bg',
}

// The design's hero tile shows the laundry icon by default and the washer once loads exist.
const sceneIcon: Record<HeroScene, DesignIconName> = {
  first: 'laundry', one: 'laundry', blocked: 'washer', planned: 'washer', running: 'washer',
  finished: 'washer', hamper: 'laundry', drying: 'wind', calm: 'laundry',
}

const barToneClassName: Record<HeroLoad['tone'], string> = { washing: 'bg-washing-ink', drying: 'bg-hanging-ink', ready: 'bg-ready-ink' }

export function Progress({ fraction, tone, thick = false }: { fraction: number; tone: HeroLoad['tone']; thick?: boolean }) {
  return <span className={cn('block overflow-hidden rounded-[3px] bg-surface-2', thick ? 'h-1.5' : 'h-1')} aria-hidden="true">
    <span className={cn('block h-full motion-safe:[transition:width_1s_linear]', barToneClassName[tone])} style={{ width: `${Math.round(fraction * 100)}%` }} />
  </span>
}

const heroRowClassName = 'flex min-h-14 w-full items-center gap-3 border-0 px-4 py-3 text-start text-[length:1.0625rem] text-ink no-underline [&+&]:[border-block-start:1px_solid_var(--line)] active:bg-surface-2 focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-ring'
const rowCaret = <DesignIcon name="chevronRight" size="1em" strokeWidth={2.2} className="size-[18px] flex-none text-ink-2" aria-hidden="true"  />

const loadRowClassName = 'flex min-h-[60px] w-full flex-col gap-1.5 border-0 [border-block-start:1px_solid_var(--line)] bg-transparent py-2.5 text-start text-ink no-underline [li:first-child_&]:[border-block-start-color:transparent] [&:active]:bg-surface-2 motion-safe:[transition:background-color_var(--dur-press)_var(--ease-out)] focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-ring'

/**
 * The one floating hero: the most useful thing to do now. First use shows the illustration contained
 * (never cropped); every other state gets a tinted media band with its icon and status mark. The
 * words carry the same state as the tone.
 */
export function HomeHero({ view, renderLink }: { view: HomeHeroView; renderLink: HeroLink }) {
  const first = view.scene === 'first'
  const mark = view.mark.text ?? recordText.marks[view.mark.tone]
  return <section aria-labelledby="home-hero-title" className="home-hero overflow-hidden rounded-card bg-surface text-ink shadow-[var(--e2)]">
    {first
      ? <div className="px-5 pb-1 pt-6 [background:linear-gradient(180deg,var(--surface-2)_0%,var(--surface)_78%)]">
        <img src="/laundry-invitation.png" alt={homeHeroText.first.art} width={1877} height={838} loading="eager" decoding="async" className="mx-auto block h-auto w-full max-w-[22rem] object-contain [aspect-ratio:1877/838]" />
      </div>
      : <div className="flex items-center gap-3 px-4 pt-4">
        <span className={cn('grid size-12 flex-none place-items-center rounded-field text-ink', mediaToneClassName[view.mark.tone])} aria-hidden="true"><DesignIcon name={sceneIcon[view.scene]} size={26} strokeWidth={1.5} /></span>
        <span className="flex min-w-0 flex-col items-start gap-1">
          <StatusMark tone={view.mark.tone}>{mark}</StatusMark>
          <span className="text-[length:var(--step--1)] text-ink-2">{view.kicker}</span>
        </span>
      </div>}
    <div className={cn('grid gap-3', first ? 'p-4' : 'px-4 pt-3')}>
      <div className="grid gap-1">
        {first ? <span className="text-[length:var(--step--1)] text-ink-2">{view.kicker}</span> : null}
        <h2 id="home-hero-title" className="m-0 font-text text-[length:var(--step-3)] font-semibold leading-[1.2] tracking-[-.015em] [overflow-wrap:break-word] text-balance">{view.title}</h2>
        {view.detail === null ? null : <p className="m-0 text-[length:var(--step-0)] leading-normal text-ink-2">{view.detail}</p>}
      </div>
      {view.loads.length === 0 ? null : <div className="grid gap-1">
        {view.loadsHeading === null ? null : <h3 className="m-0 text-[length:var(--step--1)] font-semibold text-ink-2">{view.loadsHeading}</h3>}
        <ul className="m-0 list-none p-0">
          {view.loads.map((load) => <li key={load.sessionId}>{renderLink({ to: 'session', sessionId: load.sessionId }, {
            className: loadRowClassName,
            ariaLabel: `${load.machine}, ${load.what}, ${load.stage}, ${load.left}`,
            children: <>
              <span className="flex w-full items-center gap-2">
                <span className="min-w-0 flex-1 text-[length:var(--step-0)] font-semibold">{load.machine}</span>
                <StatusMark tone={load.tone === 'ready' ? 'done' : load.tone}>{load.stage}</StatusMark>
                <span className="min-w-14 text-end text-[length:var(--step-0)] font-semibold tabular-nums">{load.left}</span>
              </span>
              <span className="text-[length:var(--step--1)] text-ink-2">{load.what}</span>
              <Progress fraction={load.tone === 'ready' ? 1 : load.fraction} tone={load.tone} />
            </>,
          })}</li>)}
        </ul>
      </div>}
      {view.progress === null ? null : <Progress fraction={view.progress} tone={view.mark.tone === 'drying' ? 'drying' : 'washing'} thick />}
      {view.trial === undefined ? null : <TrialNote>{view.trial}</TrialNote>}
    </div>
    {/* One quiet row into the next task, never a filled button. */}
    {view.primary === null && view.secondary === undefined ? <div className="h-4" /> : <div className="mt-3 border-0 [border-block-start:1px_solid_var(--line)]">
      {view.primary === null ? null : renderLink(view.primary.target, { className: cn(heroRowClassName, 'bg-accent font-semibold'), children: <><span className="min-w-0 flex-1">{view.primary.label}</span>{rowCaret}</> })}
      {view.secondary === undefined ? null : renderLink(view.secondary.target, { className: cn(heroRowClassName, 'font-semibold text-link'), children: <><span className="min-w-0 flex-1">{view.secondary.label}</span>{rowCaret}</> })}
    </div>}
  </section>
}

const setupWords: Record<SetupPart, string> = { where: homeHeroText.setup.where, appliances: homeHeroText.setup.appliances, products: homeHeroText.setup.products }

/** The compact "Finish setting up" row: an icon tile, what is still unset, and a yellow "To do". */
export function HomeSetupCard({ parts, target, renderLink }: { parts: readonly SetupPart[]; target: HeroTarget; renderLink: HeroLink }) {
  if (parts.length === 0) return null
  const fact = parts.map((part) => setupWords[part]).join(', ')
  return <section aria-label={homeHeroText.setup.title}><ItemGroup><li>{renderLink(target, {
    className: cn(itemVariants({ variant: 'interactive' }), 'focus-visible:outline-3 focus-visible:outline-ring'),
    children: <>
      <MediaTile media={<DesignIcon name="home" />} />
      <ItemContent>
        <ItemTitle>{homeHeroText.setup.title}</ItemTitle>
        <ItemDescription>{`${fact.charAt(0).toUpperCase()}${fact.slice(1)}`}</ItemDescription>
        <span className="mt-1 flex"><StatusMark tone="waiting">{homeHeroText.setup.todo}</StatusMark></span>
      </ItemContent>
      <DesignIcon name="chevronRight" size="1em" strokeWidth={2.2} className="size-4 flex-none text-ink-2" aria-hidden="true"  />
    </>,
  })}</li></ItemGroup></section>
}

/** Replay sits after the quick links as quiet text, never as a peer of the hero's action. */
const replayLinkClassName = cn('home-replay', buttonVariants({ variant: 'link' }), 'justify-self-center focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring')

/**
 * Home's guidance row: the unfinished first-load task by name as a secondary button, or a quiet
 * Replay link once guidance is complete. Resume saves the stage before it navigates, so it is a
 * button; `notice` carries that save's error.
 */
export function HomeGuidance({ action, pending, onResume, renderLink, notice }: {
  action: GuidanceAction | null
  pending: boolean
  onResume: () => void
  renderLink: HeroLink
  notice?: ReactNode
}) {
  if (action === null) return null
  if (action.kind === 'replay') return renderLink({ to: 'setup', replay: true }, { className: replayLinkClassName, children: action.label })
  return <div className="grid gap-2">
    <div className="overflow-hidden rounded-card bg-surface shadow-[var(--e1)]"><TapRow media={<DesignIcon name="laundry" />} title={action.label} disabled={pending} onClick={onResume} /></div>
    {notice}
  </div>
}

const quickLinkClassName = 'flex min-h-16 flex-col items-center justify-center gap-1 rounded-card border-0 bg-surface p-2 text-[length:var(--step--1)] font-semibold text-ink no-underline shadow-[var(--e1)] active:bg-surface-2 motion-safe:[transition:transform_var(--dur-press)_var(--ease-out)] [&:active]:[transform:scale(.96)] motion-reduce:[&:active]:transform-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-5 [&_svg]:text-link'

/** Closet, Add clothes and Plan a wash, in that order. */
export function HomeQuickLinks({ renderLink }: { renderLink: HeroLink }) {
  return <nav aria-label={homeHeroText.links.label} className="grid grid-cols-3 gap-2">
    {renderLink({ to: 'closet' }, { className: quickLinkClassName, children: <><DesignIcon name="closet" />{homeHeroText.links.closet}</> })}
    {renderLink({ to: 'add' }, { className: quickLinkClassName, children: <><DesignIcon name="plus" />{homeHeroText.links.add}</> })}
    {renderLink({ to: 'laundry' }, { className: quickLinkClassName, children: <><DesignIcon name="laundry" />{homeHeroText.links.plan}</> })}
  </nav>
}

export type OverviewCount = { readonly key: string; readonly label: string; readonly count: number; readonly dot: string }

/** The proportion bar and counts share one Closet destination and one continuous target. */
export function HomeCareOverview({ title, caption, counts, labelFlag, renderLink }: {
  title: string
  caption: string
  counts: readonly OverviewCount[]
  labelFlag: { readonly text: string; readonly target: HeroTarget } | null
  renderLink: HeroLink
}) {
  return <section aria-labelledby="care-overview-title" className="grid gap-3">
    <div className="flex items-baseline justify-between gap-2">
      <h2 id="care-overview-title" className="m-0 text-[length:var(--step-2)] font-semibold">{title}</h2>
      <span className="text-[length:var(--step--1)] text-ink-2">{caption}</span>
    </div>
    <div className="overflow-hidden rounded-card bg-surface shadow-[var(--e1)]">
      {renderLink({ to: 'closet' }, {
        className: 'grid w-full gap-3 bg-transparent pt-4 pb-3 text-ink no-underline active:bg-surface-2 [@media_(hover:_hover)_and_(pointer:_fine)]:hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-ring',
        ariaLabel: counts.map(({ count, label }) => `${count} ${label}`).join(', '),
        children: <>
          <span aria-hidden="true" className="mx-4 flex h-2 gap-[3px]">
            {counts.map(({ key, count, dot }) => <span key={key} className={cn('rounded-[4px] opacity-85', dot)} style={{ flex: count, minWidth: count > 0 ? 6 : 0 }} />)}
          </span>
          <span className="grid min-w-0 auto-cols-[minmax(max-content,1fr)] grid-flow-col overflow-x-auto">
            {counts.map(({ key, label, count, dot }) => <span key={key} className="flex min-h-[60px] flex-col items-start justify-center gap-1 px-4 py-3 max-[360px]:px-2">
            <span className={cn('text-[length:var(--step-3)] font-semibold leading-none tabular-nums', count > 0 ? 'text-ink' : 'text-ink-2')}>{count}</span>
            <span className="flex items-center gap-1.5 whitespace-nowrap text-[length:var(--step--1)] leading-[1.2] text-ink-2"><span className={cn('size-1.5 flex-none rounded-full', dot)} aria-hidden="true" />{label}</span>
            </span>)}
          </span>
        </>,
      })}
      {labelFlag === null ? null : renderLink(labelFlag.target, {
        className: 'flex min-h-11 w-full items-center justify-between gap-3 border-0 [border-block-start:1px_solid_var(--line)] bg-transparent px-4 py-3 text-ink no-underline active:bg-surface-2 [@media_(hover:_hover)_and_(pointer:_fine)]:hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-ring',
        children: <>
          <span className="min-w-0 text-[length:var(--step--1)] font-semibold leading-[1.45]">{labelFlag.text}</span>
          <DesignIcon name="chevronRight" size="1em" strokeWidth={2.2} className="size-5 shrink-0 text-ink-2" aria-hidden="true"  />
        </>,
      })}
    </div>
  </section>
}

export type ReadyTile = {
  readonly key: string
  readonly name: string
  readonly count: number
  readonly tags: readonly string[]
  readonly art: ReactNode
  readonly label: string
  readonly link: (props: { className: string; children: ReactNode; ariaLabel: string }) => ReactNode
}

/** Ready clothes in three-row swipe pages, filtered by tag; tiles open the garment record. */
export function HomeReadyTiles({ title, closetLabel, closetLink, tiles }: {
  title: string
  closetLabel: string
  closetLink: (props: { className: string; children: ReactNode }) => ReactNode
  tiles: readonly ReadyTile[]
}) {
  const [picked, setPicked] = useState<string | null>(null)
  const tags = [...new Set(tiles.flatMap((tile) => tile.tags))]
  // A tag that no ready garment carries any more falls back to All.
  const tag = picked !== null && tags.includes(picked) ? picked : null
  const shown = tiles.filter((tile) => tag === null || tile.tags.includes(tag))
  const pages = Array.from({ length: Math.ceil(shown.length / 6) }, (_, index) => shown.slice(index * 6, index * 6 + 6))
  return <section aria-labelledby="home-ready" className="grid min-w-0 gap-3">
    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
      <h2 id="home-ready" className="m-0 text-[length:var(--step-2)] font-semibold">{title}</h2>
      {closetLink({ className: buttonVariants({ variant: 'secondary', size: 'sm' }), children: <>{closetLabel}<DesignIcon name="chevronRight" size="1em" strokeWidth={2.2} className="size-4 shrink-0" aria-hidden="true"  /></> })}
    </div>
    {tags.length === 0 ? null : <div role="group" aria-label="Filter by tag" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
      <button type="button" className={chipClassName} aria-pressed={tag === null} onClick={() => setPicked(null)}>All</button>
      {tags.map((value) => <button key={value} type="button" className={chipClassName} aria-pressed={tag === value} onClick={() => setPicked(value)}>{value}</button>)}
    </div>}
    <div key={tag ?? ''} role="region" aria-label={`${title} pages`} tabIndex={pages.length > 1 ? 0 : undefined} className="-mx-4 grid auto-cols-[100%] grid-flow-col snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-3 pt-1 [scrollbar-width:none] focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-ring">
      {pages.map((page, index) => <ul key={index} aria-label={`${title}, page ${index + 1} of ${pages.length}`} className="m-0 grid content-start list-none grid-cols-2 gap-3 p-0 snap-start snap-always min-[45rem]:grid-cols-3">
      {page.map((tile) => <li key={tile.key} className="min-w-0">{tile.link({
        className: 'flex h-full flex-col gap-1.5 overflow-hidden rounded-card border-0 bg-surface pb-3 text-start text-ink no-underline shadow-[var(--e1)] active:bg-surface-2 motion-safe:[transition:transform_var(--dur-press)_var(--ease-out)] [&:active]:[transform:scale(.98)] motion-reduce:[&:active]:transform-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring',
        ariaLabel: tile.label,
        children: <>
          <span className="relative block h-[132px] shrink-0 bg-surface-2 [&_.garment-icon]:absolute [&_.garment-icon]:inset-0 [&_.garment-icon]:m-auto [&_.garment-icon]:size-16" aria-hidden="true">
            {tile.art}
            {tile.count > 1 ? <span className="absolute right-2 top-2 rounded-field bg-surface px-2 py-1 text-[length:var(--step--1)] font-semibold tabular-nums text-ink shadow-[var(--e1)]">×{tile.count}</span> : null}
          </span>
          <span className="px-3 text-[length:var(--step-0)] font-semibold leading-[1.3] text-pretty [overflow-wrap:anywhere]" aria-hidden="true">{tile.name}</span>
          {tile.tags.length > 0 ? <span className="px-3 text-[length:var(--step--1)] text-ink-2" aria-hidden="true">{tile.tags.join(' · ')}</span> : null}
        </>,
      })}</li>)}
      </ul>)}
    </div>
  </section>
}
