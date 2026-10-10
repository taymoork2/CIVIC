import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

import { countWord, homeText } from '@/copy'
import { DesignIcon } from '@/kit/design-icons'
import { dayPlanText } from '@/copy-laundry'
import { dockBlockedText } from '@/copy-closet'
import { homeClock } from '@/home/home-clock'
import { dryerWaitText } from '@/copy-drying'
import { dryerWaitTrialText } from '@/copy-trial'
import { hubBlockView, nextStepWords, passTarget, rowAction, wetWaitWords, type HubState, type RunningRow, type WetWait } from '@/home/hub-state'

const homeDockClassName = cn(
  "home-dock",
  "[@media_(min-width:_48rem)_and_(max-width:_63.999rem)]:[.page.home-overview_&]:static [@media_(min-width:_48rem)_and_(max-width:_63.999rem)]:[.page.home-overview_&]:max-w-[24rem]",
  "[@media_(min-width:_48rem)_and_(max-width:_63.999rem)]:[.page.home-overview_&]:[inset:auto]",
  "[@media_(min-width:_48rem)_and_(max-width:_63.999rem)]:[.page.home-overview_&]:[justify-self:end]",
  "fixed",
  "[z-index:25]",
  "[inset-inline:max(8px,_calc(50%_-_18rem))]",
  "[inset-block-end:calc(var(--bar-bottom)_+_var(--bar-h)_+_8px)]",
  "[.app-shell:has(.app-main_.primary-dock)_&]:hidden",
  "lg:[.page.wash:not(.wash-pass)_&]:static",
  "lg:[.page.wash:not(.wash-pass)_&]:[inset:auto]",
  "lg:[.page.home-overview_&]:static lg:[.page.home-overview_&]:max-w-[none]",
  "lg:[.page.home-overview_&]:[inset:auto]",
  "lg:[.app-shell:not(:has(.page.wash,_.page.home-overview))_&]:[inset-inline-end:max(var(--gutter),_calc(50%_-_25.75rem))]",
  "lg:[.app-shell:not(:has(.page.wash,_.page.home-overview))_&]:[inset-block-end:var(--space-6)]",
)

/** The nudge is one quiet "Up next" row on a frosted surface, never a filled bar with a filled button. */
const homeDockRowClassName = cn(
  "home-dock-row glass",
  "flex min-h-16 items-center gap-3.5 rounded-[24px] px-4 py-3 text-start text-ink no-underline",
  "[background:var(--glass)]",
  "[-webkit-backdrop-filter:blur(16px)_saturate(1.5)]",
  "[backdrop-filter:blur(16px)_saturate(1.5)]",
  "shadow-[var(--glass-hi),_var(--e2)]",
  "[border:1px_solid_var(--glass-border)]",
  "[@media_(prefers-reduced-transparency:_reduce)]:[background:var(--glass-solid)]",
  "[@media_(prefers-reduced-transparency:_reduce)]:[backdrop-filter:none]",
  "focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-ring",
)

/** The second action (the next wash) is one quiet line under the row, not a second card. */
const homeDockNextClassName = "home-dock-next mt-1 flex min-h-11 items-center gap-2 rounded-[18px] px-4 text-start text-[length:var(--step--1)] font-semibold text-ink no-underline focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-ring"

type Target = { to: 'laundry' | 'closet' | 'add' } | { to: 'drying'; run?: string } | { to: 'plan'; planId: string } | { to: 'session'; sessionId: string }
type Link = (target: Target, props: { className: string; children: ReactNode }) => ReactNode

/** "Start load 2", or "Review load 2" when its plan is blocked: a blocked load is never offered to start. */
const loadTitle = (name: string | undefined, number: number, things: number | undefined, ready: boolean) => {
  const generic = name === undefined || (things !== undefined && (name === countWord(things, 'thing') || name === countWord(things, 'laundry item')))
  const lower = generic ? '' : `${name.charAt(0).toLocaleLowerCase()}${name.slice(1)}`
  return ready ? (generic ? homeText.dock.startLoad(number) : homeText.dock.startNamedLoad(lower)) : (generic ? dockBlockedText.reviewLoad(number) : dockBlockedText.reviewNamed(lower))
}

export type HomeDockStep = { urgent: boolean; machine?: string; clock?: string; title: string; detail: string; button: string; target: Target
  /** A second action, for the next wash when waiting pieces do not hold it back. */
  secondary?: { label: string; target: Target }
  /** Trial builds only: where an estimate or our own number on this step comes from. */
  trial?: string }

/** The trial note for a wet wait: the smell check's six hours, else where the dryer's end time came from. */
const waitTrial = (wait: WetWait | undefined): string | undefined => wait === undefined ? undefined : wait.smell ? dryerWaitTrialText.smell
  : wait.dryer?.kind === 'busy' && wait.dryer.until !== null ? dryerWaitTrialText.busyUntil(wait.dryer.source) : undefined

const washedAt = (row: RunningRow) => row.doneAt === null ? undefined : homeText.dock.washedAt(homeClock(row.doneAt))

export function homeDockStep(state: HubState, hamperSetAside = false, hasClothes = false): HomeDockStep {
  if (state.kind === 'finished') {
    const row = state.row
    const held = wetWaitWords(state.wait)
    // A wash done while the home dryer is busy or still holds its load: it says so, never "move them".
    if (held !== null) return { urgent: true, machine: row.machine, clock: washedAt(row), title: held.title, detail: held.detail,
      button: held.unload === null ? dryerWaitText.hangOrWaitButton : dryerWaitText.checkDryness, target: held.unload ?? { to: 'session', sessionId: row.sessionId }, trial: waitTrial(state.wait) }
    if (state.step !== undefined) {
      // Moving it into the free home dryer, joined with the next wash or with its held-back start time.
      const words = nextStepWords(state.step, true)
      return { urgent: true, machine: row.machine, clock: washedAt(row), title: words.title, detail: words.detail, button: rowAction(row), target: { to: 'session', sessionId: row.sessionId }, trial: dryerWaitTrialText.nextStep }
    }
  }
  if (state.kind === 'wet' || state.kind === 'dryer_check') {
    const block = hubBlockView(state)
    const secondary = block.secondary === undefined ? {} : { secondary: { label: block.secondary.label, target: block.secondary.target as Target } }
    // The top line names where it is; the title says what to do, so neither repeats the other.
    // A mid-run check: an estimate, so no clock time; the pieces it names are the title.
    if (state.kind === 'dryer_check' && state.early !== undefined) return { urgent: true, machine: state.name, title: block.title, detail: block.reason ?? '', button: block.button, target: block.target as Target, trial: dryerWaitTrialText.midCheck }
    return state.kind === 'dryer_check'
      ? { urgent: true, machine: state.name, clock: homeText.dock.checkSince(homeClock(state.doneAt)), title: dryerWaitText.checkDryness, detail: block.reason ?? '', button: block.button, target: block.target as Target }
      : { urgent: true, machine: dryerWaitText.toDry, title: block.title, detail: block.reason ?? '', button: block.button, target: block.target as Target, ...secondary, trial: waitTrial(state.wait) }
  }
  if (state.kind === 'pass' && state.dayDeferred) {
    const block = hubBlockView(state)
    return { urgent: false, title: block.title, detail: block.reason ?? '', button: block.button, target: { to: 'laundry' } }
  }
  if (state.kind === 'pass' && state.step !== undefined) {
    const words = nextStepWords(state.step, false)
    return { urgent: false, title: words.title, detail: words.detail, button: homeText.dock.start, target: passTarget(state), trial: dryerWaitTrialText.nextStep }
  }
  if (state.kind === 'running' && state.step !== undefined) {
    const words = nextStepWords(state.step, false)
    const row = state.rows[0]!
    const action: Pick<HomeDockStep, 'button' | 'target'> = state.step.at === null ? { button: homeText.dock.start, target: { to: 'plan', planId: state.step.planId } } : { button: rowAction(row), target: { to: 'session', sessionId: row.sessionId } }
    return { urgent: false, title: words.title, detail: words.detail, ...action, trial: dryerWaitTrialText.nextStep }
  }
  if (state.kind === 'finished') {
    const row = state.row
    const dry = row.stage === 'dry'
    return { urgent: true, machine: row.machine, clock: row.doneAt === null ? undefined : dry ? homeText.dock.checkSince(homeClock(row.doneAt)) : homeText.dock.washedAt(homeClock(row.doneAt)),
      title: dry ? homeText.dock.checkClothes(row.name ?? homeText.dock.clothes) : !state.toDryer ? homeText.dock.takeClothesOut(row.name ?? homeText.dock.clothes) : homeText.dock.moveClothes(row.name ?? homeText.dock.clothes),
      detail: dry ? homeText.dock.drynessUnknown : state.toDryer ? [row.heat, row.dryMinutes == null ? null : homeText.dock.aboutMinutes(row.dryMinutes), row.price].filter(Boolean).join(' · ') || homeText.dock.openLoadToChooseDryer : '', button: rowAction(row), target: { to: 'session', sessionId: row.sessionId } }
  }
  if (state.kind === 'running') {
    const row = state.rows[0]!
    return { urgent: false, title: row.doneAt === null ? row.stage === 'preparing' ? homeText.dock.machinePreparing(row.machine) : homeText.dock.machineRunning(row.machine) : homeText.dock.checkAround(homeClock(row.doneAt)),
      detail: homeText.dock.thenCheck(row.name ?? homeText.dock.load), button: rowAction(row), target: { to: 'session', sessionId: row.sessionId } }
  }
  if (state.kind === 'pass') return { urgent: false, title: loadTitle(state.name, state.number, state.things, state.ready), detail: [state.ready ? state.dose : undefined, state.things === undefined ? null : countWord(state.things, 'laundry item')].filter(Boolean).join(' · ') || homeText.dock.loadOf(state.number, state.count), button: state.ready ? homeText.dock.start : homeText.dock.open, target: state.ready ? passTarget(state) : { to: 'plan', planId: state.planId } }
  if (state.kind === 'drying') return { urgent: false, title: homeText.dock.airDrying, detail: homeText.dock.hangingToDry(state.count), button: state.sessionIds.length > 0 ? homeText.dock.allDry : homeText.dock.seeThem, target: { to: state.sessionIds.length > 0 ? 'laundry' : 'closet' } }
  if (state.kind === 'hamper') return { urgent: false, title: hamperSetAside ? homeText.dock.everythingSetAside : homeText.dock.inHamper(state.count), detail: '', button: hamperSetAside ? homeText.dock.addClothes : homeText.dock.reviewWaiting, target: { to: hamperSetAside ? 'add' : 'laundry' } }
  if (hasClothes) return { urgent: false, title: homeText.dock.checkCloset, detail: '', button: homeText.careForClothes, target: { to: 'closet' } }
  return { urgent: false, title: homeText.dock.hamperEmpty, detail: '', button: homeText.dock.addClothes, target: { to: 'add' } }
}

export function HomeDock({ state, renderLink, hamperSetAside = false, hasClothes = false }: { state: HubState; renderLink?: Link; hamperSetAside?: boolean; hasClothes?: boolean }) {
  const step = homeDockStep(state, hamperSetAside, hasClothes)
  const fact = [step.machine, step.clock, step.detail].filter(Boolean).join(' · ')
  const row = renderLink?.(step.target, { className: homeDockRowClassName, children: <>
    <span className="grid size-11 flex-none place-items-center rounded-field bg-surface text-[var(--sig-ink)] [&_svg]:size-6" aria-hidden="true"><DesignIcon name={step.target.to === 'drying' || step.machine?.toLowerCase().includes('dryer') ? 'dryer' : step.target.to === 'session' || step.target.to === 'plan' ? 'washer' : 'laundry'} strokeWidth={1.6} /></span>
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="text-[length:var(--step--1)] font-semibold text-[var(--sig-ink)]">{dayPlanText.upNext}</span>
      <span className="text-[length:1.0625rem] font-semibold">{step.title}</span>
      {fact ? <span className="truncate text-[length:var(--step--1)] text-ink-2">{fact}</span> : null}
    </span>
    <DesignIcon name="chevronRight" size="1em" strokeWidth={2.2} className="size-[18px] flex-none text-ink-2" aria-hidden="true"  />
  </> })
  const next = step.secondary === undefined ? null : renderLink?.(step.secondary.target, { className: homeDockNextClassName, children: <><span className="min-w-0 flex-1 truncate">{step.secondary.label}</span><DesignIcon name="chevronRight" size="1em" strokeWidth={2.2} className="size-4 flex-none text-ink-2" aria-hidden="true"  /></> })
  return <aside className={homeDockClassName} aria-label={homeText.dock.nextStep}>{row}{next}</aside>
}
