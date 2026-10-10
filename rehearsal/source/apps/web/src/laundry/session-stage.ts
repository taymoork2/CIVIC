import { sessionText } from '@/copy'

/**
 * Where a running load is, from what has been recorded and the clock. The wash stays "washing"
 * until its finish time passes, the person says it finished, or a drying step is recorded: an
 * unknown finish never unlocks a front-loader's door on its own. The legacy "dry" stage
 * means a dryer check is due or unloading was recorded; it never establishes physical dryness.
 */
export const sessionStages = ['preparing', 'washing', 'wash_done', 'drying', 'dry', 'finished'] as const
export type SessionStage = (typeof sessionStages)[number]

export type StageFacts = {
  readonly status: string
  readonly machineStartedAt: number | null
  /** The wash finish by the washer's recorded cycle length; null when no length is recorded. */
  readonly washFinishAt: number | null
  /** When the person said the wash finished (or a drying step implied it). */
  readonly washFinishedAt: number | null
  readonly dryerStartedAt: number | null
  /** Minutes one dryer start buys, when recorded. */
  readonly dryMinutes: number | null
  /** The load dries in the dryer here, and nobody has skipped drying. */
  readonly hasDrying: boolean
  readonly dryerStepRecorded: boolean
  readonly dryerUnloaded: boolean
}

export type StageTimes = {
  readonly stage: SessionStage
  readonly washReadyAt: number | null
  readonly dryReadyAt: number | null
  /** The dry time counts from the wash finish because the dryer has not started yet. */
  readonly dryEstimated: boolean
  /** Next timer/check time: not confirmation that the pieces are dry or put away. */
  readonly doneAt: number | null
}

const minute = 60_000

export function sessionStage(facts: StageFacts, now: number): StageTimes {
  const washReadyAt = facts.washFinishedAt ?? facts.washFinishAt
  const dryLength = facts.dryMinutes === null ? null : facts.dryMinutes * minute
  const dryerRunning = facts.dryerStartedAt !== null
  const dryReadyAt = !facts.hasDrying || dryLength === null ? null
    : dryerRunning ? facts.dryerStartedAt! + dryLength
    : washReadyAt === null ? null : washReadyAt + dryLength
  const times = { washReadyAt, dryReadyAt, dryEstimated: facts.hasDrying && !dryerRunning, doneAt: facts.hasDrying ? dryReadyAt : washReadyAt }
  return { stage: stageOf(facts, now, dryReadyAt), ...times }
}

function stageOf(facts: StageFacts, now: number, dryReadyAt: number | null): SessionStage {
  if (facts.status !== 'running') return 'finished'
  if (facts.machineStartedAt === null) return 'preparing'
  if (facts.dryerStartedAt !== null) {
    if (facts.dryerUnloaded) return 'dry'
    return dryReadyAt === null || now < dryReadyAt ? 'drying' : 'dry'
  }
  const washOver = facts.washFinishedAt !== null || facts.dryerStepRecorded || (facts.washFinishAt !== null && now >= facts.washFinishAt)
  return washOver ? 'wash_done' : 'washing'
}

/** Whether a load has reached a stage: the stages only move forward. */
export function stageReached(stage: SessionStage, target: SessionStage): boolean {
  return sessionStages.indexOf(stage) >= sessionStages.indexOf(target)
}

// ---- After the wash ---------------------------------------------------------------------

/**
 * Where a finished wash's pieces are in the household drying queue (`dryingPieces` by wash
 * session). It is derived for display only and never completes the session. "pieces_drying"
 * is distinct from the in-session dryer's "drying", which belongs to the running load. A dryer's timer
 * only makes a check due: a piece is dry only when someone says so, and put away is its own event.
 */
export const afterWashStages = ['queued_to_dry', 'pieces_drying', 'check_due', 'to_put_away', 'put_away'] as const
export type AfterWashStage = (typeof afterWashStages)[number]
export type LoadStage = SessionStage | AfterWashStage

export type PieceDrying = 'queued' | 'drying' | 'dry' | 'put_away'

export type AfterWashFacts = {
  /** Each piece's place in the queue; absent when it never entered it. */
  readonly pieces: readonly { readonly drying?: PieceDrying }[]
  /** When the soonest dryer timer for this load's drying pieces runs out; null without one. */
  readonly dryerCheckAt: number | null
}

/** The load is as far along as its least advanced piece; null when none entered the drying queue. */
export function afterWashStage({ pieces, dryerCheckAt }: AfterWashFacts, now: number): AfterWashStage | null {
  const has = (drying: PieceDrying) => pieces.some((piece) => piece.drying === drying)
  if (has('queued')) return 'queued_to_dry'
  if (has('drying')) return dryerCheckAt !== null && now >= dryerCheckAt ? 'check_due' : 'pieces_drying'
  if (has('dry')) return 'to_put_away'
  return has('put_away') ? 'put_away' : null
}

/** Where a load's next action opens: its own page or the drying screens. It never records anything. */
export type LoadActionTarget = 'session' | 'drying'
export type LoadNextAction = { readonly label: string; readonly target: LoadActionTarget }

const actionTargets: Readonly<Record<LoadStage, LoadActionTarget>> = {
  preparing: 'session', washing: 'session', wash_done: 'session', drying: 'session', dry: 'session', finished: 'session',
  queued_to_dry: 'drying', pieces_drying: 'drying', check_due: 'drying', to_put_away: 'drying', put_away: 'session',
}

/** The one next action for a load at this stage. Callers keep their own routes for each target. */
export function loadNextAction(stage: LoadStage): LoadNextAction {
  return { label: sessionText.loadNext[stage], target: actionTargets[stage] }
}
