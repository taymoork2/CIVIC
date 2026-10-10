import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { fitDay, type DayFit, type DayOptions, type FitLoad } from '@washcloset/planner'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionArgs, FunctionReturnType } from 'convex/server'
import { useState, type ReactNode } from 'react'

import { api } from '@/api'
import { listWords } from '@/copy-drying'
import { countWord, cycleWord, helpTipText, temperatureWord } from '@/copy'
import { dayPlanText, planReviewText } from '@/copy-laundry'
import { dryerWaitTrialText } from '@/copy-trial'
import { coloursClash, couldGoTogether, dayLists, defaultHomeUntil, defaultLoadsPerDay, mayHang, pieceNeededBy, remainingDay, restBy, spreadDay, stained, startOfDay, todayAt, togetherPins } from '@/laundry/day-plan'
import { DesignIcon } from '@/kit/design-icons'
import { GarmentIcon } from '@/kit/garment-icon'
import { aboutTime, dryingFacts, homeDryer, hubRows, machineOccupancy, moveMinutes, rackRoom, waitLimit, type HubState, type NextLoad, type PlannedLoad, type RunningRow } from '@/home/hub-state'
import type { Inventory, Textile } from '@/household/inventory-types'
import { dayPickStore as pickStore, phoneStore, useDryerSays } from '@/laundry/laundry-day'
import { emptyPass, type Pass, type Pin } from '@/laundry/laundry-pass'
import { HelpTip } from '@/kit/help-tip'
import { TapRow } from '@/laundry/laundry-kit'
import { AnswerRow, Note, SegmentChoice, TextField, TrialNote, capital } from '@/laundry/laundry-ui'
import { loadNames } from '@/laundry/load-card'
import { Sheet } from '@/kit/sheet'
import { sourceGroups } from '@/products/source-issues'
import { minutesLeft } from '@/laundry/session-view'
import { clockTime, useConvexCall } from '@/kit/ui'

/** The settings card on Household: a plain card on the page, with the app's own heading, rows and segment control inside. */
const cardClassName = cn(
  "day-plan-card",
  "grid min-w-0 gap-4 rounded-card bg-card p-4 shadow-[var(--shadow-sm)]",
)

const questionClassName = cn(
  "day-plan-question",
  "m-0 text-[length:var(--step-1)] font-semibold leading-[1.3]",
)

const sourcesClassName = cn(
  "day-plan-sources",
  "grid min-w-0 gap-1",
)

const sourcesSummaryClassName = cn(
  "day-plan-sources-summary",
  "flex min-h-11 cursor-pointer items-center font-semibold text-link",
)

const orderListClassName = cn(
  "day-plan-order",
  "m-0 grid gap-1 ps-5 text-[length:var(--step--1)] text-ink-2",
)

const surfaceClassName = 'rounded-card bg-surface shadow-[var(--e1)]'
const headingClassName = 'm-0 text-[length:var(--step-2)] font-bold leading-[1.3]'

/**
 * The plan picked for a day, on this phone only (design 12.2 items 5 and 6): which plan it shaped, and
 * what to say about the rest. Nothing here is a stored schedule; tomorrow is planned again.
 */
export type DayPick = {
  readonly planId: string
  readonly mode: 'all' | 'spread'
  readonly day: number
  readonly end: number | null
  readonly until: string | null
  readonly rest: number
  readonly perDay: number
  /** Loads left for tomorrow or to hang now, by name: they left the replanned plan, so only their words remain. */
  readonly rolled: readonly string[]
  /**
   * The garments of the loads washed today and hung, by id. A replan gives loads new ids and names ("Whites"
   * becomes "Whites · White blouse" when another whites load joins), so only the garments say which load hangs.
   */
  readonly hang: readonly string[]
  readonly hangNow: readonly string[]
  /** 2: `hang` holds garment ids; an older pick (load names) is dropped and the day is picked again. */
  readonly v: 2
}

const untilStore = phoneStore<{ readonly until: string; readonly day: number }>('washcloset:private:home-until', 'washcloset:home-until', (value) => typeof value.until === 'string')

type HouseholdId = FunctionArgs<typeof api.dryingQueue.queue>['householdId']

// ---- The Laundry tab's day: a Today card, the loads, and what waits ------------------------------------

/** The one next task, as the row at the foot of the Today card. */
export type UpNext = { readonly title: ReactNode; readonly fact?: ReactNode; readonly onOpen: () => void; readonly disabled?: boolean; readonly media?: ReactNode }

/** One load on today's timeline: its name over its start time ("now" for the next one), so four or more still fit. */
type TimelineItem = { readonly key: string; readonly name: string; readonly when: string | null; readonly weight: number; readonly next: boolean }

/**
 * Today at a glance: one card with the pace, how many loads and when they are done, a slim timeline of
 * today's loads, and the way into the next task as a row you tap (no filled button on a tab).
 */
export function TodayCard({ pace, headline, done, timeline, upNext }: { pace?: ReactNode; headline: string; done?: string | null; timeline: readonly TimelineItem[]; upNext: UpNext | null }) {
  return (
    <section aria-label={dayPlanText.region} className={cn(surfaceClassName, 'grid min-w-0 overflow-hidden')}>
      <div className="grid gap-3.5 px-4 pt-4 pb-4">
        <div className="flex min-h-8 items-center justify-between gap-3">
          <span className="text-[length:var(--step-0)] font-semibold text-ink-2">{dayPlanText.todayLabel}</span>
          {pace}
        </div>
        <div className="grid gap-0.5">
          <h2 className={headingClassName}>{headline}</h2>
          {done == null ? null : <p className="m-0 text-[length:var(--step-0)] text-ink-2">{done}</p>}
        </div>
        {timeline.length === 0 ? null : (
          <div className="grid gap-1.5">
            <div className="flex h-2.5 gap-1" aria-hidden="true">
              {timeline.map((item) => <span key={item.key} style={{ flex: `${item.weight} 1 0` }} className={cn('min-w-0 rounded-full', item.next ? 'bg-[var(--sig)]' : 'bg-accent')} />)}
            </div>
            <ol aria-label={dayPlanText.timeline} className="m-0 flex list-none gap-1 p-0 text-[length:var(--step--1)] text-ink-2">
              {timeline.map((item) => <li key={item.key} style={{ flex: `${item.weight} 1 0` }} className={cn('grid min-w-0 leading-tight', item.next && 'font-semibold text-[var(--sig-ink)]')}><span className="truncate">{item.name}</span>{item.when === null ? null : <span className="truncate text-[length:0.75rem]">{item.when}</span>}</li>)}
            </ol>
          </div>
        )}
      </div>
      {upNext === null ? null : (
        <div className="border-0 border-t border-solid border-line">
          <TapRow highlight media={upNext.media ?? <DesignIcon name="washer" size={24} strokeWidth={1.6} />} eyebrow={dayPlanText.upNext} title={upNext.title} fact={upNext.fact} onClick={upNext.onOpen} disabled={upNext.disabled} />
        </div>
      )}
    </section>
  )
}

type Icon = { readonly kind: string | null }
type RowView = { readonly key: string; readonly icons: readonly Icon[] | 'washer' | 'dryer' | 'hang' | 'laundry'; readonly title: string; readonly fact?: string; readonly status?: string; readonly accent?: boolean; readonly label?: string; readonly onOpen?: () => void }

/** A load's pieces as an overlapping cluster of garment icons. */
function IconCluster({ icons }: { icons: RowView['icons'] }) {
  const circle = 'grid size-[34px] flex-none place-items-center rounded-full border-2 border-solid border-surface bg-surface-2 [&:not(:first-child)]:-ms-3'
  if (typeof icons === 'string') return <span className="flex w-14 flex-none"><span className={circle}><DesignIcon name={icons} size={20} strokeWidth={1.6} /></span></span>
  return <span className="flex w-14 flex-none">{icons.map((icon, index) => <span key={`${icon.kind}${index}`} className={circle}><GarmentIcon kind={icon.kind} className="size-5" /></span>)}</span>
}

const rowClassName = 'flex w-full min-h-16 items-center gap-3.5 border-0 bg-transparent px-4 py-3 text-start text-ink focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-ring'

function RowBody({ row, chevron = false }: { row: RowView; chevron?: boolean }) {
  return <>
    <IconCluster icons={row.icons} />
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="text-[length:1.0625rem] font-semibold [overflow-wrap:anywhere]">{row.title}</span>
      {row.fact === undefined ? null : <span className="text-[length:var(--step--1)] text-ink-2">{row.fact}</span>}
    </span>
    {row.status === undefined ? null : <span className={cn('flex-none text-[length:var(--step--1)] font-semibold', row.accent ? 'rounded-full bg-accent px-2.5 py-1 text-[var(--sig-ink)]' : 'text-ink-2')}>{row.status}</span>}
    {chevron ? <DesignIcon name="chevronRight" size="1em" strokeWidth={2.2} className="size-[18px] flex-none text-ink-2" aria-hidden="true"  /> : null}
  </>
}

/** Today's loads, one list: a cluster of icons, the name, short facts and a status or time on the right. */
function LoadList({ rows, options }: { rows: readonly RowView[]; options: readonly { readonly key: string; readonly label: string; readonly disabled?: boolean; readonly onClick: () => void }[] }) {
  const [open, setOpen] = useState(false)
  return (
    <section aria-label={dayPlanText.loadsHeading} className="grid min-w-0 gap-2.5">
      <div className="flex items-center justify-between px-1">
        <h2 className={headingClassName}>{dayPlanText.loadsHeading}</h2>
        {options.length === 0 ? null : (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger render={<Button variant="ghost" size="icon" type="button" className="-my-2 -me-2 size-11 text-ink-2" aria-label={dayPlanText.options} />}><DesignIcon name="ellipsis" size="1em" strokeWidth={2.2} className="size-6" aria-hidden="true"  /></PopoverTrigger>
            <PopoverContent align="end" className="grid w-auto min-w-44 gap-1 p-1">
              {options.map((option) => <Button key={option.key} type="button" variant="ghost" className="min-h-11 justify-start" disabled={option.disabled} onClick={() => { setOpen(false); option.onClick() }}>{option.label}</Button>)}
            </PopoverContent>
          </Popover>
        )}
      </div>
      <ul role="list" className={cn(surfaceClassName, 'm-0 list-none overflow-hidden p-0')}>
        {rows.map((row) => (
          <li key={row.key} className="[&+&]:[border-block-start:1px_solid_var(--line)]">
            {row.onOpen === undefined
              ? <div className={rowClassName}><RowBody row={row} /></div>
              : <button type="button" aria-label={row.label} className={cn(rowClassName, 'cursor-pointer')} onClick={row.onOpen}><RowBody row={row} /></button>}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Pieces held out of the plan, each a row that opens the plan where its note and options are. */
function WaitingList({ rows }: { rows: readonly (RowView & { readonly tint: true })[] }) {
  return (
    <section aria-label={dayPlanText.waiting} className="grid min-w-0 gap-2.5">
      <h2 className={cn(headingClassName, 'px-1')}>{dayPlanText.waiting}</h2>
      <ul role="list" className={cn(surfaceClassName, 'm-0 list-none overflow-hidden p-0')}>
        {rows.map((row) => <li key={row.key} className="[&+&]:[border-block-start:1px_solid_var(--line)]"><button type="button" aria-label={row.label} className={cn(rowClassName, 'cursor-pointer')} onClick={row.onOpen}><RowBody row={row} chevron /></button></li>)}
      </ul>
    </section>
  )
}

type DayContext = { readonly home: boolean; readonly rack: number; readonly options: Omit<DayOptions, 'rackFull'> }
type StoredPlan = NonNullable<FunctionReturnType<typeof api.plans.get>>

const noPick = { planId: '', mode: 'all', day: 0, end: null, until: null, rest: 0, perDay: 0, rolled: [], hang: [], hangNow: [], v: 2 } as const satisfies DayPick

type DayProps = {
  householdId: string
  state: HubState
  inventory: Inventory
  now: number
  pending: boolean
  run: (work: () => Promise<string | null | void>) => Promise<void>
  /** Plans again with this selection and pass, staying on this screen; the new plan's id. */
  onReplan: (selection: readonly string[], pass: Pass) => Promise<string | null>
  /** A running load's page. */
  onSession: (sessionId: string) => void
  /** One planned load's review, and the plan's own. */
  onOpenLoad: (planId: string, loadId: string) => void
  onOpenPlan: (planId: string) => void
  /** A status the tab owns for a load (to resolve, shared-room picks); null leaves the day's own. */
  loadMark: (load: PlannedLoad) => string | null
  /** The next task, opened from the Today card. */
  upNext: UpNext | null
  /** What the ⋯ on the Loads heading offers. */
  options: readonly { readonly key: string; readonly label: string; readonly disabled?: boolean; readonly onClick: () => void }[]
  /** A plan that does not say which garment each load holds: one row that opens it. */
  fallback: { readonly title: string; readonly fact?: string; readonly status: string } | null
}

/**
 * Laundry tab, laundry day (design 6, 9.2): a Today card with the pace, the day's end and the next
 * task; the loads as one list; and held-out pieces under Waiting. At home with one dryer and every
 * minute known, times say "about"; in a shared room, or without minutes, only the order and the
 * counts (invariant 11). Nothing here is a stored schedule.
 */
export function DayPlan(props: DayProps) {
  const pick = pickStore.useValue()
  const next = nextOf(props.state)
  const loads = next?.loads ?? []
  const picked = next !== null && pick !== null && pick.planId === next.planId && pick.day === startOfDay(props.now) ? pick : null
  // The pick is offered for 3 or more loads, before any has started (design 6).
  const offer = picked === null && props.state.kind === 'pass' && next !== null && loads.length >= 3 && loads.length === next.count
  const body = { ...props, next, loads, pick: picked, offer }
  // Only a plan that says which garment each load holds has times, settings and held pieces to read.
  return next !== null && loads.length > 0 ? <DayPlanLive {...body} next={next} /> : <DayBody {...body} queue={undefined} saved={null} />
}

type BodyProps = DayProps & { next: NextLoad | null; loads: readonly PlannedLoad[]; pick: DayPick | null; offer: boolean }

function DayPlanLive(props: BodyProps & { next: NextLoad }) {
  const queue = useQuery(api.dryingQueue.queue, { householdId: props.householdId as HouseholdId })
  const saved = useQuery(api.plans.get, { planId: props.next.planId as FunctionArgs<typeof api.plans.get>['planId'] })
  return <DayBody {...props} queue={queue} saved={saved}  />
}

function DayBody({ householdId, state, inventory, now, pending, run, onReplan, onSession, onOpenLoad, onOpenPlan, loadMark, upNext, options, fallback, next, loads, pick, offer, queue, saved }: BodyProps & {
  queue: FunctionReturnType<typeof api.dryingQueue.queue> | undefined
  saved: StoredPlan | null | undefined
}) {
  const dryerSays = useDryerSays()
  const lastUntil = untilStore.useValue()
  const [hungNow, setHungNow] = useState(false)
  const stored = saved ?? null
  const facts = queue === undefined ? null : dryingFacts(queue)
  const rows = hubRows(state)
  // What the machines are doing now: loads in the washer and dryer, a typed "Dryer says" and an extended
  // run all move when the washer and dryer are free, so the day is fitted from them, not from the pick.
  const free = facts === null ? null : machineOccupancy(rows, homeDryer(rows, facts, now, dryerSays), now)
  const day: DayContext = {
    // A clock only at home with one dryer the app tracks (design 11); a shared room keeps order and counts.
    home: facts !== null && facts.homeDryerId !== null,
    rack: facts === null ? 0 : rackRoom(facts),
    options: { waitLimit, move: moveMinutes, dryerFreeAt: free?.dryerFreeAt ?? null, washerFreeAt: free?.washerFreeAt ?? null },
  }
  const byId = new Map(inventory.textiles.map((textile) => [textile.textileId as string, textile]))
  const loadNamed = loadNames(loads, (id) => byId.get(id))
  const name = (load: PlannedLoad) => loadNamed.get(load.loadId) ?? ''
  const { home } = day
  const settled = pick ?? noPick
  const limitText = pick !== null ? pick.until ?? defaultHomeUntil : lastUntil !== null && lastUntil.day === startOfDay(now) ? lastUntil.until : defaultHomeUntil
  const limitAt = todayAt(limitText, now)
  // After a pick the rest of the day is worked out again on every render from what the washer and dryer are
  // doing now, so a late first wash or an extended dryer moves the end and rolls what no longer fits before
  // "Home until" (invariant 13). Without minutes there is no clock, and the pick's end stands.
  const rest = home ? remainingDay(fitLoads(loads, byId, true), now, pick === null ? null : limitAt, day.rack, day.options) : null
  const schedule = rest?.plan ?? null
  const end = home ? (rest === null ? settled.end : rest.end) : null
  const refit = rest?.refit ?? null
  const lateIds = refit === null ? [] : [...refit.roll, ...refit.hangNow]
  const late = lateIds.map((id) => nameOf(loads, name, id))
  // One place for each load: rolled to tomorrow or washed now and hung, never both.
  const lists = dayLists(settled, late)
  const hangTextiles = new Set(settled.hang)
  // Before the pick, "All today" never offers a finish past the day's end: past it, say how many loads fit.
  const overLimit = pick === null && end !== null && limitAt !== null && end > limitAt
  const fitsByLimit = !overLimit || limitAt === null || limitAt <= now ? 0 : (() => { const result = fitDay(fitLoads(loads, byId, home), now, limitAt, day.rack, day.options); return result.timed ? result.today.length : 0 })()
  const done = pick === null
    ? offer && home && end === null ? dayPlanText.noClock : overLimit ? capital(dayPlanText.fitsBy(fitsByLimit, loads.length, clockTime(limitAt!))) : end === null ? null : dayPlanText.endLine(clockTime(aboutTime(end)))
    : pick.mode === 'spread' && pick.rest > 0 ? dayPlanText.restLine(dayWord(restBy(pick.rest, pick.perDay, now), now)) : end === null ? null : dayPlanText.endLine(clockTime(aboutTime(end)))

  const doneStage = (row: RunningRow) => row.stage === 'wash_done' || row.stage === 'dry'
  const runningRows: RowView[] = rows.map((row) => {
    const inDryer = row.stage === 'drying' || row.stage === 'dry'
    const finished = doneStage(row)
    const title = row.name ?? row.machine
    const status = finished ? dayPlanText.status.done : row.doneAt === null ? (inDryer ? dayPlanText.status.drying : dayPlanText.status.washing) : dayPlanText.left(minutesLeft(row.doneAt, now))
    return { key: row.sessionId, icons: inDryer ? 'dryer' : 'washer', title, fact: row.machine, status, label: `${row.machine}. ${status}`, onOpen: () => onSession(row.sessionId) }
  })
  // Each load shows once: today's rows leave out what waits for tomorrow or must hang now.
  // The loads left for tomorrow are not in this plan any more; the live refit's late loads leave by id, never by a name another load may share.
  const todayLoads = loads.filter((load) => !lateIds.includes(load.loadId))
  const startOf = (load: PlannedLoad) => schedule?.steps.find((entry) => entry.id === load.loadId)
  const startWord = (load: PlannedLoad) => { const step = startOf(load); return step === undefined ? null : step.washStart <= now + 5 * 60_000 ? dayPlanText.nowShort : clockTime(aboutTime(step.washStart)) }
  const plannedRows: RowView[] = todayLoads.map((load, index) => {
    const title = name(load)
    const textiles = load.textileIds.flatMap((id) => byId.get(id) ?? [])
    const planned = stored?.result.loads.find((entry) => entry.id === load.loadId)
    const hung = load.textileIds.length > 0 && load.textileIds.every((id) => hangTextiles.has(id))
    const time = startWord(load)
    const status = loadMark(load) ?? (hung ? dayPlanText.status.hang : index === 0 ? dayPlanText.status.next : time ?? planReviewText.ready)
    const pieces = countWord(load.textileIds.length, 'piece')
    const settings = planned === undefined ? null : [cycleWord(planned.cycle), temperatureWord(planned.temperatureC)].filter((word) => word !== null).join(', ')
    return { key: load.loadId, icons: distinctKinds(textiles), title, fact: [pieces, settings, hung ? dayPlanText.rowFact.hang : null].filter(Boolean).join(' · '), status, accent: index === 0 && !hung && loadMark(load) === null,
      label: `${title} · ${pieces}. ${status}`, onOpen: () => next !== null && onOpenLoad(next.planId, load.loadId) }
  })
  const rolledRows: RowView[] = lists.rolled.map((title) => ({ key: `tomorrow-${title}`, icons: 'laundry', title, fact: dayPlanText.rowFact.tomorrow, status: dayPlanText.status.tomorrow }))
  const hangNowRows: RowView[] = hungNow ? [] : lists.hangNow.map((title) => ({ key: `hang-now-${title}`, icons: 'hang', title, fact: dayPlanText.rowFact.hangNow, status: dayPlanText.status.hangNow }))
  const fallbackRows: RowView[] = loads.length > 0 || fallback === null || next === null ? [] : [{ key: 'plan', icons: 'laundry', title: fallback.title, ...(fallback.fact === undefined ? {} : { fact: fallback.fact }), status: fallback.status, label: `${fallback.title}. ${fallback.status}`, onOpen: () => onOpenPlan(next.planId) }]
  const listRows = [...runningRows, ...plannedRows, ...rolledRows, ...hangNowRows, ...fallbackRows]

  // The held pieces: a wool piece waiting for a wool-safe detergent is one row; its note and options open with the plan.
  const supplies = new Map(inventory.supplies.map((supply) => [supply.supplyId as string, supply.name]))
  const waiting = stored === null || next === null ? [] : sourceGroups(stored.excludedItems ?? [], stored.result.reasons, [], null, {
    garment: (id) => byId.get(id)?.name ?? null, product: (id) => supplies.get(id) ?? null, washer: () => null,
    icon: (id) => { const textile = byId.get(id); return textile === undefined ? null : { kind: textile.kind, colorGroup: textile.colorGroup } } })
    .flatMap((group) => {
      const held = group.issues.find((issue) => issue.held)
      return held === undefined ? [] : [{ key: `${group.source.kind}:${group.source.id}`, icons: [{ kind: group.icon?.kind ?? null }], title: group.name, fact: held.title, label: `${group.name}. ${held.title}`, tint: true as const, onOpen: () => onOpenPlan(next.planId) }]
    })

  const toDryer = state.kind === 'finished' && state.toDryer ? state : null
  const moving: UpNext | null = toDryer === null ? null : { title: dayPlanText.moveToDryer, onOpen: () => onSession(toDryer.row.sessionId), disabled: pending, media: <DesignIcon name="dryer" size={24} strokeWidth={1.6} /> }
  const timeline = todayLoads.length === 0 ? [] : todayLoads.map((load, index) => {
    const time = startWord(load)
    return { key: load.loadId, name: name(load), when: time, weight: todayLoads.every((entry) => entry.wash != null) ? Math.max(1, (load.wash?.minutes ?? 0) + (load.dry?.minutes ?? 0)) : 1, next: index === 0 }
  })
  const pace = offer && next !== null && facts !== null
    ? <PaceControl householdId={householdId} next={next} loads={loads} plan={stored} inventory={inventory} byId={byId} name={name} now={now} day={day} pending={pending} run={run} onReplan={onReplan} end={end} overLimit={overLimit} fitsByLimit={fitsByLimit} limitAt={limitAt} />
    : pick === null || next === null ? null
    : <span className="inline-flex min-h-8 items-center rounded-full bg-surface-2 px-3 text-[length:var(--step-0)] font-semibold">{pick.mode === 'all' ? dayPlanText.allToday : dayPlanText.spread}</span>
  const fitting = refit === null ? next?.count ?? 0 : refit.today.length

  return <>
    {next === null ? null : <TodayCard pace={pace} headline={dayPlanText.loads(next.count)} done={done} timeline={timeline} upNext={moving ?? (next.dayDeferred ? null : upNext)} />}
    {listRows.length === 0 ? null : <LoadList rows={listRows} options={options} />}
    {waiting.length === 0 ? null : <WaitingList rows={waiting} />}
    {limitAt === null || pick === null || lists.rolled.length === 0 ? null : <Note role={late.length > 0 ? 'status' : undefined}>{fitting === 0 ? dayPlanText.noFit(listWords(lists.rolled)) : dayPlanText.fitBefore(fitting, clockTime(limitAt))}</Note>}
    {lists.hangNow.length === 0 || hungNow || pick === null ? null : <Button type="button" variant="outline" className="h-auto w-full whitespace-normal py-2" onClick={() => { setHungNow(true); pickStore.save({ ...pick, hangNow: [] }) }}>{dayPlanText.hangNow}</Button>}
    {hungNow ? <Note role="status">{dayPlanText.hungNow}</Note> : null}
    {next === null || !home || !loads.some((load) => load.wash != null) ? null : (
      <details className={sourcesClassName}>
        <summary className={sourcesSummaryClassName}>{dayPlanText.sources}</summary>
        <ol className={orderListClassName}>
          {loads.map((load) => (
            <li key={load.loadId}>{dayPlanText.orderLine(dayPlanText.loadOf(load.number, next.count), name(load), load.wash == null ? null : {
              minutes: dayPlanText.minutes(`${load.wash.minutes} min`, load.dry == null || load.dryerRuns === 0 ? null : `${load.dry.minutes} min`),
              sources: `${load.wash.source === 'learned' ? dayPlanText.minuteSource.learned(load.wash.count ?? 3) : dayPlanText.minuteSource[load.wash.source]}${load.dry == null || load.dryerRuns === 0 ? '' : `; ${dayPlanText.dryerSource[load.dry.source]}`}`,
            })}</li>
          ))}
        </ol>
        <TrialNote>{dryerWaitTrialText.dayPlan}</TrialNote>
      </details>
    )}
  </>
}

/** Up to three different pieces of a load, as icons. */
function distinctKinds(textiles: readonly Textile[]): Icon[] {
  const kinds = [...new Set(textiles.map((textile) => textile.kind))].slice(0, 3)
  return kinds.length === 0 ? [{ kind: null }] : kinds.map((kind) => ({ kind }))
}

/**
 * The pace of the day, a pill on the Today card ("All today" or "Spread out"). It opens one sheet with
 * today's choices; "Plan today" there is the confirmation (design 6).
 */
function PaceControl({ householdId, next, loads, plan, inventory, byId, name, now, day, pending, run, onReplan, end, overLimit, fitsByLimit, limitAt }: {
  householdId: string
  next: NextLoad
  loads: readonly PlannedLoad[]
  plan: StoredPlan | null
  inventory: Inventory
  byId: ReadonlyMap<string, Textile>
  name: (load: PlannedLoad) => string
  now: number
  day: DayContext
  pending: boolean
  run: (work: () => Promise<string | null | void>) => Promise<void>
  onReplan: (selection: readonly string[], pass: Pass) => Promise<string | null>
  end: number | null
  overLimit: boolean
  fitsByLimit: number
  limitAt: number | null
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<DayPick['mode']>('all')
  const [apart, setApart] = useState(false)
  const lastUntil = untilStore.useValue()
  const [until, setUntil] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [wearer, setWearer] = useState<string | null>(null)
  const saveDay = useConvexCall(api.inventory.setLaundryDay)
  const hangOnce = useMutation(api.plans.hangOnce)
  const perDay = inventory.planning.day?.loadsPerDay ?? defaultLoadsPerDay
  const fit = fitLoads(loads, byId, day.home)
  const timed = day.home && fitDay(fit, now, Infinity, day.rack, day.options).timed
  const names = (ids: readonly string[]) => listWords(ids.flatMap((id) => { const load = loads.find((entry) => entry.loadId === id); return load === undefined ? [] : [name(load)] }))
  // The last answer prefilled (design 6.1).
  const homeUntil = until ?? lastUntil?.until ?? defaultHomeUntil

  // "2 small loads could go together": only a preference split, never preselected.
  const pinned = new Set<string>(plan?.pass.loadPins.map((pin) => pin.textileId) ?? [])
  const pair = plan === null || apart ? null : couldGoTogether(plan.result.loads.map((load) => ({ id: load.id, textileIds: load.textileIds, machineId: load.machineId, cycle: load.cycle, temperatureC: load.temperatureC,
    bulkUnits: load.bulkUnits, capacityUnits: load.capacityUnits, drying: load.drying === null ? null : { dryerId: load.drying.dryerId, heat: load.drying.heatLabel ?? null, bulkUnits: load.drying.bulkUnits, capacityUnits: load.drying.capacityUnits } })),
  plan.result.reasons, (textileId) => pinned.has(textileId) || (byId.get(textileId) !== undefined && stained(byId.get(textileId)!)),
  (one, other) => { const left = byId.get(one); const right = byId.get(other); return left === undefined || right === undefined || coloursClash(left, right) })
  const joined = pair === null ? null : loads.find((load) => load.loadId === pair[1])
  const saves = joined === undefined || joined === null || !day.home || joined.wash == null ? null : joined.wash.minutes + (joined.dry?.minutes ?? 0)

  /** Today's loads go to `recompute` as the selection; the rest stays in the hamper for another day. */
  const apply = (chosen: DayPick['mode'], today: readonly string[], result: Extract<DayFit, { timed: true }> | null, chosenUntil: string | null) => void run(async () => {
    if (today.length === 0) {
      setProblem(result !== null && result.hangNow.length > 0 ? `${dayPlanText.noFit(names(result.hangNow))} ${dayPlanText.hangNow}.` : dayPlanText.earlier)
      return
    }
    const selection = loads.filter((load) => today.includes(load.loadId)).flatMap((load) => load.textileIds)
    const planId = today.length === loads.length ? next.planId : await onReplan(selection, plan?.pass ?? emptyPass)
    if (planId === null) return
    // "Wash now, hang to dry" goes on the plan, so those loads lose their dryer run and queue on a rack.
    const hung = loads.filter((load) => result?.hang.includes(load.loadId) === true).flatMap((load) => load.textileIds)
    if (hung.length > 0) await hangOnce({ planId: planId as FunctionArgs<typeof api.plans.hangOnce>['planId'], textileIds: hung as FunctionArgs<typeof api.plans.hangOnce>['textileIds'] })
    const each = (ids: readonly string[] | undefined) => (ids ?? []).map((id) => names([id]))
    pickStore.save({ planId, mode: chosen, day: startOfDay(now), end: result?.end ?? null, until: chosenUntil, rest: loads.length - today.length, perDay,
      ...dayLists({ rolled: each(result?.roll), hangNow: each(result?.hangNow) }), hang: hung, v: 2 })
  })
  const everyLoad = loads.map((load) => load.loadId)

  const allToday = () => {
    if (!timed) { apply('all', everyLoad, null, null); return }
    const at = todayAt(homeUntil, now)
    if (at === null || at <= now) { setProblem(dayPlanText.earlier); return }
    untilStore.save({ until: homeUntil, day: startOfDay(now) })
    const result = fitDay(fit, now, at, day.rack, day.options)
    if (result.timed) apply('all', result.today, result, homeUntil)
    else apply('all', everyLoad, null, homeUntil)
  }
  const candidates = loads.map((load) => {
    const textiles = load.textileIds.flatMap((id) => byId.get(id) ?? [])
    const needed = textiles.map(pieceNeededBy).filter((value): value is number => value !== null)
    const planned = plan?.result.loads.find((entry) => entry.id === load.loadId)
    return { id: load.loadId, urgent: load.urgent === true, neededBy: needed.length === 0 ? null : Math.min(...needed),
      wearerIds: textiles.flatMap((textile) => textile.wearerId === null ? [] : [textile.wearerId as string]), fullness: planned === undefined ? 0 : planned.bulkUnits / planned.capacityUnits }
  })
  // Urgent loads always go, so today can hold more than the count a day; the fact says what really happens.
  const spreadToday = spreadDay(candidates, perDay, now, wearer)
  const spreadOut = () => {
    // The same end-of-day limit as All today: the last "Home until" today, else 9 pm. Past it, or with
    // nothing fitting before it, the day keeps the count without a clock: there is no field to change it here.
    const limit = limitAt
    const result = timed && limit !== null && limit > now ? fitDay(fit.filter((load) => spreadToday.includes(load.id)), now, limit, day.rack, day.options) : null
    if (result !== null && result.timed && (result.today.length > 0 || result.hangNow.length > 0)) apply('spread', result.today, result, null)
    else apply('spread', spreadToday, null, null)
  }
  const allHint = end === null ? dayPlanText.loads(loads.length) : overLimit ? dayPlanText.fitsBy(fitsByLimit, loads.length, clockTime(limitAt!)) : dayPlanText.doneAbout(clockTime(aboutTime(end)))
  const spreadHint = dayPlanText.perDay(perDay, dayWord(restBy(loads.length - spreadToday.length, perDay, now), now), spreadToday.length)
  const close = () => { setOpen(false); setProblem(null) }
  return <>
    <button type="button" className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-full border-0 bg-surface-2 px-3 text-[length:var(--step-0)] font-semibold text-ink" aria-haspopup="dialog" onClick={() => setOpen(true)}>
      {mode === 'all' ? dayPlanText.allToday : dayPlanText.spread}<DesignIcon name="chevronDown" size="1em" strokeWidth={2.2} className="size-3.5" aria-hidden="true"  />
    </button>
    {!open ? null : (
      <Sheet title={dayPlanText.question} onClose={close} compactActions footer={
        <Button type="button" size="lg" className="w-full" disabled={pending || saveDay.pending} onClick={mode === 'all' ? allToday : spreadOut}>{dayPlanText.planToday}</Button>}>
        <div className="grid gap-4">
          {pair === null ? null : (
            <div className="grid gap-3 rounded-control bg-surface-2 p-3" role="group" aria-label={dayPlanText.together}>
              <p className="m-0 text-[length:var(--step-0)] leading-normal"><strong className="font-semibold">{dayPlanText.togetherTitle}</strong> · {dayPlanText.togetherSaves(saves)}</p>
              <AnswerRow label={dayPlanText.together} disabled={pending} answers={[
                { key: 'together', label: dayPlanText.putTogether, disabled: plan === null, onClick: () => void run(async () => {
                  if (plan === null) return
                  await onReplan(plan.textileIds ?? loads.flatMap((load) => load.textileIds), { ...plan.pass, loadPins: togetherPins(plan.result.loads, pair[0], pair[1]) as Pin[] })
                  close()
                }) },
                { key: 'apart', label: dayPlanText.keepApart, onClick: () => setApart(true) },
              ]} />
              <TrialNote>{dryerWaitTrialText.together}</TrialNote>
            </div>
          )}
          <div className="grid gap-2">
            <p id="day-pace" className={questionClassName}>{dayPlanText.pace}<HelpTip topic={helpTipText.dayPlan.topic}>{helpTipText.dayPlan.words}</HelpTip></p>
            <SegmentChoice labelledBy="day-pace" value={mode} disabled={pending}
              options={[{ value: 'all', label: dayPlanText.allToday }, { value: 'spread', label: dayPlanText.spread }]}
              onChange={(value) => { setProblem(null); setMode(value === 'spread' ? 'spread' : 'all') }} />
            <Note>{mode === 'all' ? capital(allHint) : capital(spreadHint)}</Note>
          </div>
          {mode !== 'all' || !timed ? null : (
            <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); allToday() }}>
              <TextField label={dayPlanText.homeUntil} type="time" value={homeUntil} hint={dayPlanText.homeUntilHint} error={problem}
                onChange={(event) => { setUntil(event.target.value); setProblem(null) }} />
            </form>
          )}
          {mode !== 'spread' ? null : (
            <>
              <div className="grid gap-2">
                <p id="day-per-day" className={questionClassName}>{dayPlanText.perDayQuestion}</p>
                <SegmentChoice labelledBy="day-per-day" value={String(perDay)} disabled={saveDay.pending}
                  options={[1, 2, 3].map((count) => ({ value: String(count), label: dayPlanText.loadsChip(count) }))}
                  onChange={(value) => void saveDay.run({ householdId: householdId as HouseholdId, loadsPerDay: Number(value) })} />
                {saveDay.error === null ? null : <p role="alert" className="m-0 text-[length:var(--step--1)] font-semibold text-warning-ink">{saveDay.error}</p>}
              </div>
              {/* Person days only when there is more than one wearer (design 6.3). */}
              {inventory.wearers.length < 2 ? null : (
                <div className="grid gap-2">
                  <p id="day-whose" className={questionClassName}>{dayPlanText.whose}</p>
                  <SegmentChoice labelledBy="day-whose" value={wearer ?? 'anyone'}
                    options={[{ value: 'anyone', label: dayPlanText.anyone }, ...inventory.wearers.map((entry) => ({ value: entry.wearerId as string, label: entry.name }))]}
                    onChange={(value) => setWearer(value === 'anyone' ? null : value)} />
                </div>
              )}
            </>
          )}
          {mode === 'all' && timed ? null : problem === null ? null : <p role="alert" className="m-0 text-[length:var(--step--1)] font-semibold text-warning-ink">{problem}</p>}
          {/* The times note only under times: a shared room, or a home without minutes, shows counts. */}
          {mode === 'spread' ? <TrialNote>{dryerWaitTrialText.spread}</TrialNote> : day.home && timed ? <TrialNote>{dryerWaitTrialText.dayPlan}</TrialNote> : null}
        </div>
      </Sheet>
    )}
  </>
}

/** Household > Appliances: the rack size (design 5.6) and loads a day (6.2), 1 · 2 · 3 each, saved on tap. */
export function LaundryDaySection({ householdId, day }: { householdId: string; day: Inventory['planning']['day'] }) {
  const save = useConvexCall(api.inventory.setLaundryDay)
  const block = (id: string, label: string, field: 'rackLoads' | 'loadsPerDay', value: number, hint?: string) => (
    <div className="grid gap-2">
      <p id={id} className={questionClassName}>{label}</p>
      {hint === undefined ? null : <Note>{hint}</Note>}
      <SegmentChoice labelledBy={id} value={String(value)} disabled={save.pending}
        options={[1, 2, 3].map((count) => ({ value: String(count), label: dayPlanText.loadsChip(count) }))}
        onChange={(next) => void save.run({ householdId: householdId as HouseholdId, [field]: Number(next) })} />
    </div>
  )
  return (
    <section className="grid gap-3" aria-label={dayPlanText.settings}>
      <h2 className="m-0 px-1 text-[length:var(--step-2)] font-semibold">{dayPlanText.settings}</h2>
      <div className={cardClassName}>
        {block('laundry-day-rack', dayPlanText.rack, 'rackLoads', day?.rackLoads ?? 1, dayPlanText.rackHint)}
        {block('laundry-day-per-day', dayPlanText.perDaySetting, 'loadsPerDay', day?.loadsPerDay ?? defaultLoadsPerDay)}
        {save.error === null ? null : <p role="alert" className="m-0 text-[length:var(--step--1)] font-semibold text-warning-ink">{save.error}</p>}
      </div>
      <TrialNote>{dryerWaitTrialText.rack}</TrialNote>
    </section>
  )
}

/** The plan whose loads the hub is counting: the one still to start, or the one under way. */
function nextOf(state: HubState): NextLoad | null {
  return state.kind === 'pass' ? state : state.kind === 'running' || state.kind === 'wet' || state.kind === 'finished' ? state.next ?? null : null
}

const nameOf = (loads: readonly PlannedLoad[], name: (load: PlannedLoad) => string, id: string) => { const load = loads.find((entry) => entry.loadId === id); return load === undefined ? '' : name(load) }

/** "today", "tomorrow" or the weekday of a day's midnight. */
function dayWord(midnight: number, now: number): string {
  const days = Math.round((midnight - startOfDay(now)) / 86_400_000)
  return days <= 0 ? dayPlanText.today : days === 1 ? dayPlanText.tomorrow : new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(midnight)
}

/** Each load for `fitDay`, with the long minutes (design 10); none in a shared room, so no clock. */
function fitLoads(loads: readonly PlannedLoad[], byId: ReadonlyMap<string, Textile>, home: boolean): FitLoad[] {
  return loads.map((load) => ({ id: load.loadId, urgent: load.urgent === true, dryerRuns: load.dryerRuns,
    washMinutes: home ? load.wash?.long ?? null : null, dryMinutes: home ? load.dry?.long ?? null : null,
    mayHang: mayHang(load.textileIds.flatMap((id) => byId.get(id) ?? [])) }))
}
