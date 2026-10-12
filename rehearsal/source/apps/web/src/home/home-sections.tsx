import { buttonVariants } from '@/components/ui/button'
import { ItemContent, ItemDescription, ItemGroup, ItemTitle, itemVariants } from '@/components/ui/item'
import { cn } from '@/lib/utils'
import { useState, type CSSProperties, type ReactNode } from 'react'

import { homeHeroText } from '@/copy-closet'
import { DesignIcon } from '@/kit/design-icons'
import type { HeroLoad, HeroTarget, HomeHeroView, SetupPart } from '@/home/home-hero'
import { recordText } from '@/copy'
import { chipClassName } from '@/closet/closet-parts'
import { MediaTile, StatusMark } from '@/kit/record-row'
import type { GuidanceAction } from '@/account/onboarding-state'
import { TrialNote } from '@/laundry/laundry-ui'
import { TapRow } from '@/laundry/laundry-kit'
import { Sheet } from '@/kit/sheet'
import { photoBlendClassName } from '@/products/product-ui'

export type HeroLink = (target: HeroTarget, props: { className: string; children: ReactNode; ariaLabel?: string }) => ReactNode

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
 * (never cropped); later states use the same tactile art family alongside their status. The
 * words carry the same state as the tone.
 */
export function HomeHero({ view, renderLink }: { view: HomeHeroView; renderLink: HeroLink }) {
  const first = view.scene === 'first'
  const mark = view.mark.text ?? recordText.marks[view.mark.tone]
  const timedLoad = view.scene === 'running' && view.progress !== null && view.progress < 1 && view.loads.length === 0
  return <section aria-labelledby="home-hero-title" className="home-hero overflow-hidden rounded-card bg-surface text-ink shadow-[var(--e2)] [container-type:inline-size]">
    {first
      ? <div className="px-5 pb-1 pt-6 [background:linear-gradient(180deg,var(--surface-2)_0%,var(--surface)_78%)]">
        <img src="/laundry-invitation.png" alt={homeHeroText.first.art} width={1877} height={838} loading="eager" decoding="async" className={cn('mx-auto block h-auto w-full max-w-[22rem] object-contain [aspect-ratio:1877/838]', photoBlendClassName)} />
      </div>
      : <div aria-hidden="true" className="px-4 pt-4 [background:linear-gradient(180deg,var(--surface-2)_0%,var(--surface)_100%)]">
        <img src="/design/home-care-scene.webp" alt="" width={960} height={429} loading="eager" decoding="async" className={cn('mx-auto block h-[136px] w-full max-w-[28rem] object-contain', photoBlendClassName)} />
      </div>}
    <div className={cn('grid gap-3', first ? 'p-4' : 'px-4 pt-3')}>
      <div className="grid gap-1">
        {timedLoad ? <StatusMark tone={view.mark.tone}>{mark}</StatusMark> : null}
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

const quickLinkClassName = 'flex min-h-18 min-w-0 flex-col items-center justify-center gap-1 border-0 bg-transparent px-2 py-3 text-center text-[length:var(--step--1)] font-semibold text-ink no-underline [overflow-wrap:anywhere] [&+&]:[border-inline-start:1px_solid_var(--line)] active:bg-surface-2 motion-safe:[transition:background-color_var(--dur-press)_var(--ease-out)] focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-ring [&_svg]:size-5 [&_svg]:text-link'

/** Closet, Add clothes and Plan a wash, in that order. */
export function HomeQuickLinks({ renderLink }: { renderLink: HeroLink }) {
  return <nav aria-label={homeHeroText.links.label} className="grid grid-cols-3 overflow-hidden rounded-control bg-surface shadow-[var(--e1)]">
    {renderLink({ to: 'closet' }, { className: quickLinkClassName, children: <><DesignIcon name="closet" />{homeHeroText.links.closet}</> })}
    {renderLink({ to: 'add' }, { className: quickLinkClassName, children: <><DesignIcon name="plus" />{homeHeroText.links.add}</> })}
    {renderLink({ to: 'laundry' }, { className: quickLinkClassName, children: <><DesignIcon name="laundry" />{homeHeroText.links.plan}</> })}
  </nav>
}

export type OverviewCount = { readonly key: string; readonly label: string; readonly count: number; readonly dot: string }

export function HomeOutfitAction({ children, summary, actionLabel = 'Choose today’s outfit' }: { children: ReactNode; summary?: ReactNode; actionLabel?: ReactNode }) {
  const [open, setOpen] = useState(false)
  return <section aria-labelledby="home-outfit-title" className="home-outfit grid overflow-hidden rounded-card bg-surface shadow-[var(--e1)]">
    <div className="grid gap-3 p-4">
      <div className="flex flex-wrap items-center gap-3"><span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-field bg-accent text-link"><DesignIcon name="tee" size={24} /></span>
      <h2 id="home-outfit-title" className="m-0 text-[length:var(--step-2)] font-semibold">Today’s outfit</h2></div>
      {summary ?? <p className="m-0 text-[length:var(--step--1)] text-ink-2">Choose from what’s ready. One less decision when you get dressed.</p>}
    </div>
    <button type="button" className={cn(heroRowClassName, 'bg-accent text-link font-semibold')} onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); setOpen(true) }}><span className="min-w-0 flex-1">{actionLabel}</span>{rowCaret}</button>
    {open ? <Sheet title="Today’s outfit" onClose={() => setOpen(false)}>{children}</Sheet> : null}
  </section>
}

/** The three everyday states stay glanceable, including zero; rarer states follow when present. */
export function HomeCareOverview({ title, caption, counts, labelFlag, renderLink }: {
  title: string
  caption: string
  counts: readonly OverviewCount[]
  labelFlag: { readonly text: string; readonly target: HeroTarget } | null
  renderLink: HeroLink
}) {
  const total = counts.reduce((sum, { count }) => sum + count, 0)
  return <section aria-labelledby="care-overview-title" className="grid gap-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="care-overview-title" className="m-0 text-[length:var(--step-2)] font-semibold">{title}</h2>
      <span className="text-[length:var(--step--1)] text-ink-2">{caption}</span>
    </div>
    <div className="overflow-hidden rounded-card bg-surface shadow-[var(--e1)] [container-type:inline-size]">
      {renderLink({ to: 'closet' }, {
        className: 'grid w-full gap-3 bg-transparent p-4 text-ink no-underline active:bg-surface-2 [@media_(hover:_hover)_and_(pointer:_fine)]:hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-ring',
        ariaLabel: counts.map(({ count, label }) => `${count} ${label}`).join(', '),
        children: <>
          <span aria-hidden="true" className="flex h-2 overflow-hidden rounded-full bg-surface-2">
            {counts.map(({ key, count, dot }) => <span key={key} className={cn('h-full motion-safe:[transition:width_var(--dur-step)_var(--ease-out)]', dot)} style={{ width: `${total === 0 ? 0 : count / total * 100}%` }} />)}
          </span>
          <span className="grid min-w-0 grid-cols-[repeat(var(--overview-columns),minmax(0,1fr))] gap-2 [@container_(width_<_10rem)]:grid-cols-2" style={{ '--overview-columns': counts.length } as CSSProperties}>
            {counts.map(({ key, label, count }, index) => <span key={key} className={cn('grid min-w-0 content-start justify-items-center gap-1 text-center [overflow-wrap:anywhere]', index > 0 && 'border-s border-line ps-2')}>
            <span className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[length:var(--step-1)] font-semibold tabular-nums"><DesignIcon name={key === 'ready' ? 'tee' : key === 'hamper' ? 'laundry' : key === 'washing' ? 'washer' : key === 'drying' ? 'hang' : key === 'refresh' ? 'spray' : 'fold'} size={18} className="shrink-0 text-ink-2" aria-hidden="true" />{count}</span>
            <span className="text-[length:var(--step--1)] text-ink-2">{label}</span>
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
          <span className="relative block h-[132px] shrink-0 [&_.garment-icon]:absolute [&_.garment-icon]:inset-0 [&_.garment-icon]:m-auto [&_.garment-icon]:size-16" aria-hidden="true">
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
