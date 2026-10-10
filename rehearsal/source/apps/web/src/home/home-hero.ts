import { homeText, hubText } from '@/copy'
import { homeHeroText } from '@/copy-closet'
import { dryerWaitText, midCheckText } from '@/copy-drying'
import { homeClock } from '@/home/home-clock'
import { homeDockStep } from '@/home/home-dock'
import { passTarget, type HubState, type RunningRow } from '@/home/hub-state'
import type { MarkTone } from '@/kit/record-row'
import type { WashPlace } from '@/private-state'
import { exclusionWords } from '@/laundry/plain-reasons'

/**
 * Home is state-led: one hero for the most useful thing now, chosen from what the server says is
 * true. Nothing here decides care, dosing or whether a load can start; a load shows as ready only
 * when its plan says it can start, and a blocked one says so and never says "Start".
 */

export type HeroTarget =
  | { readonly to: 'add' }
  | { readonly to: 'closet' }
  | { readonly to: 'laundry' }
  | { readonly to: 'plan'; readonly planId: string }
  | { readonly to: 'session'; readonly sessionId: string }
  /** `run`: open that dryer run's check instead of the plan. */
  | { readonly to: 'drying'; readonly run?: string }
  | { readonly to: 'garment'; readonly textileId: string }
  | { readonly to: 'household'; readonly section: 'machines' | 'bottles' }
  /** The one setup checklist; Replay alone reopens the first-run chooser. */
  | { readonly to: 'setup'; readonly replay?: true }

export type HeroLoad = {
  readonly sessionId: string
  readonly machine: string
  readonly what: string
  readonly left: string
  readonly stage: string
  readonly fraction: number
  readonly tone: 'washing' | 'drying' | 'ready'
}

export type HeroScene = 'first' | 'one' | 'blocked' | 'planned' | 'running' | 'finished' | 'hamper' | 'drying' | 'calm'

export type HomeHeroView = {
  readonly scene: HeroScene
  readonly mark: { readonly tone: MarkTone; readonly text?: string }
  readonly kicker: string
  readonly title: string
  readonly detail: string | null
  readonly primary: { readonly label: string; readonly target: HeroTarget } | null
  /** A smaller second action: the next wash, when waiting pieces do not hold it back. */
  readonly secondary?: { readonly label: string; readonly target: HeroTarget }
  /** Trial builds only: where this step's estimate or our own number comes from. */
  readonly trial?: string
  /** Every running load, soonest to finish first; a single load also shows a progress bar. */
  readonly loads: readonly HeroLoad[]
  /** The progress of a single running load, 0 to 1. */
  readonly progress: number | null
  readonly loadsHeading: string | null
}

export type HeroFacts = {
  /** Garments (not guests) by their own record: identical pieces saved together count once. */
  readonly garmentGroups: number
  readonly pieces: number
  /** The first garment's name and whether its label has unknown answers, when there is one group. */
  readonly only: { readonly textileId: string; readonly name: string; readonly pieces: number; readonly careUnknown: boolean } | null
}

const noLoads: readonly HeroLoad[] = []

function loadRow(row: RunningRow, now: number): HeroLoad {
  const finished = row.stage === 'wash_done' || row.stage === 'dry'
  const minutes = row.doneAt === null ? null : Math.max(0, Math.ceil((row.doneAt - now) / 60_000))
  const fraction = row.doneAt === null || row.startedAt == null || row.doneAt <= row.startedAt ? 0 : Math.min(1, Math.max(0, (now - row.startedAt) / (row.doneAt - row.startedAt)))
  return {
    sessionId: row.sessionId,
    machine: row.machine,
    what: row.name ?? homeText.band.laundryLoad,
    left: finished || minutes === 0 ? homeHeroText.running.done : minutes === null ? homeHeroText.running.checkLater : hubText.duration(minutes),
    stage: homeText.band.stages[row.stage],
    fraction,
    tone: finished ? 'ready' : row.stage === 'drying' ? 'drying' : 'washing',
  }
}

/** The hero for Home's state: first use, one garment, loads planned, loads running, and the steps between. */
export function homeHeroView(state: HubState, facts: HeroFacts, now: number): HomeHeroView {
  const hasClothes = facts.garmentGroups > 0
  const base = { loads: noLoads, progress: null, loadsHeading: null, detail: null, primary: null } as const

  if (state.kind === 'finished' || state.kind === 'wet' || state.kind === 'dryer_check') {
    const step = homeDockStep(state, false, hasClothes)
    const early = state.kind === 'dryer_check' ? state.early : undefined
    return { ...base, scene: 'finished', mark: { tone: 'ready', text: early === undefined ? 'Done' : midCheckText.checkNowShort }, kicker: homeHeroText.needsYou,
      title: early !== undefined ? midCheckText.takeOutNow(early) : state.kind === 'dryer_check' ? dryerWaitText.dryerCheck(state.name) : step.title,
      detail: [step.clock, step.detail].filter(Boolean).join(' · ') || null,
      primary: { label: step.button, target: step.target },
      ...(step.secondary === undefined ? {} : { secondary: step.secondary }), ...(step.trial === undefined ? {} : { trial: step.trial }),
      loads: state.rows.map((row) => loadRow(row, now)), loadsHeading: state.rows.length === 0 ? null : homeHeroText.running.other }
  }

  if ((state.kind === 'running' || state.kind === 'pass') && state.step !== undefined) {
    // The home dryer is busy: the next wash now, or its held-back start (design 9.1).
    const step = homeDockStep(state, false, hasClothes)
    return { ...base, scene: state.kind === 'running' ? 'running' : 'planned', mark: { tone: 'drying' }, kicker: homeHeroText.planned.kicker, title: step.title, detail: step.detail,
      primary: { label: step.button, target: step.target }, ...(step.trial === undefined ? {} : { trial: step.trial }), loads: state.kind === 'running' ? state.rows.map((row) => loadRow(row, now)) : noLoads }
  }
  if (state.kind === 'running') {
    const loads = state.rows.map((row) => loadRow(row, now))
    if (state.rows.length === 1) {
      const row = state.rows[0]!
      const only = loads[0]!
      const timed = row.doneAt !== null && row.doneAt > now
      return { ...base, scene: 'running', mark: { tone: only.tone === 'drying' ? 'drying' : 'washing' }, kicker: homeHeroText.running.kickerOne,
        title: timed ? homeHeroText.running.left(only.left) : `${row.machine} · ${only.stage}`,
        detail: [only.what, row.doneAt === null ? null : hubText.doneAt(homeClock(row.doneAt))].filter(Boolean).join(' · '),
        primary: { label: homeHeroText.running.open(row.machine), target: { to: 'session', sessionId: row.sessionId } },
        loads: noLoads, progress: row.doneAt === null ? null : only.fraction }
    }
    return { ...base, scene: 'running', mark: { tone: 'washing' }, kicker: homeHeroText.running.kickerMany, title: homeHeroText.running.many(state.rows.length),
      detail: null, loads }
  }

  if (state.kind === 'pass') {
    if (state.dayDeferred) {
      const step = homeDockStep(state, false, hasClothes)
      return { ...base, scene: 'planned', mark: { tone: 'waiting' }, kicker: homeHeroText.planned.kicker, title: step.title, detail: step.detail, primary: { label: step.button, target: step.target } }
    }
    const load = hubText.loadOf(state.number, state.count)
    // Ready only when the plan says this load can start; otherwise say what is true and send them to review it.
    if (!state.ready) {
      return { ...base, scene: 'blocked', mark: { tone: 'waiting' }, kicker: homeHeroText.planned.kicker, title: homeHeroText.planned.blockedTitle(load),
        detail: state.blocker === undefined ? homeHeroText.planned.blockedDetail : [state.blocker.source === 'product' ? null : state.blocker.name, exclusionWords(state.blocker, { product: state.blocker.source === 'product' ? state.blocker.name : null }).text].filter(Boolean).join(': '),
        primary: { label: homeHeroText.planned.blockedButton(`Load ${state.number}`), target: { to: 'plan', planId: state.planId } } }
    }
    return { ...base, scene: 'planned', mark: { tone: 'ready' }, kicker: homeHeroText.planned.kicker, title: homeHeroText.planned.readyTitle,
      detail: homeHeroText.planned.readyDetail(state.count),
      primary: { label: homeHeroText.planned.readyButton, target: passTarget(state) } }
  }

  if (state.kind === 'hamper') {
    return { ...base, scene: 'hamper', mark: { tone: 'waiting' }, kicker: homeHeroText.hamper.kicker, title: homeHeroText.hamper.title(state.count),
      primary: { label: homeHeroText.hamper.primary, target: { to: 'laundry' } } }
  }

  if (state.kind === 'drying') {
    const step = homeDockStep(state, false, hasClothes)
    return { ...base, scene: 'drying', mark: { tone: 'drying' }, kicker: homeHeroText.drying.kicker, title: hubText.drying.short(state.count),
      detail: hubText.drying.reason, primary: { label: step.button, target: step.target } }
  }

  // Nothing is moving through the laundry.
  if (!hasClothes) {
    return { ...base, scene: 'first', mark: { tone: 'waiting', text: homeHeroText.mark.first }, kicker: homeHeroText.first.kicker, title: homeHeroText.first.title,
      detail: homeHeroText.first.detail, primary: { label: homeHeroText.first.primary, target: { to: 'add' } } }
  }
  if (facts.garmentGroups === 1 && facts.only !== null) {
    const { name, careUnknown, textileId } = facts.only
    return careUnknown
      ? { ...base, scene: 'one', mark: { tone: 'waiting', text: 'Needs a label check' }, kicker: homeHeroText.one.kicker, title: homeHeroText.one.checkLabelTitle(name),
        detail: homeHeroText.one.checkLabelDetail, primary: { label: homeHeroText.one.checkLabel, target: { to: 'garment', textileId } } }
      : { ...base, scene: 'one', mark: { tone: 'ready', text: homeHeroText.mark.calm }, kicker: homeHeroText.calm.kicker, title: homeHeroText.calm.title,
        detail: homeHeroText.calm.detail, primary: { label: homeHeroText.calm.button, target: { to: 'closet' } } }
  }
  return { ...base, scene: 'calm', mark: { tone: 'ready', text: homeHeroText.mark.calm }, kicker: homeHeroText.calm.kicker, title: homeHeroText.calm.title,
    detail: homeHeroText.calm.detail, primary: { label: homeHeroText.calm.button, target: { to: 'closet' } } }
}

export type SetupPart = 'where' | 'appliances' | 'products'

/** What is still unset, from data the app already has: where the household washes, appliances, products. */
export function setupParts(facts: { readonly machines: number; readonly supplies: number; readonly washPlace: WashPlace | null }): readonly SetupPart[] {
  return [
    ...(facts.washPlace === null && facts.machines === 0 ? ['where' as const] : []),
    ...(facts.machines === 0 ? ['appliances' as const] : []),
    ...(facts.supplies === 0 ? ['products' as const] : []),
  ]
}

/** "Finish setting up" opens the setup checklist, which covers every part and returns to itself. */
export const setupTarget: HeroTarget = { to: 'setup' }
