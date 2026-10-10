import { FieldLabel } from '@/components/ui/field'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import type { OptimisticLocalStore } from 'convex/browser'
import type { FunctionArgs, FunctionReturnType } from 'convex/server'
import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { isDryerPhase } from '@washcloset/planner'

import type { Id } from '@convex/_generated/dataModel'
import { api } from '@/api'
import { cycleWord, loadSizeWords, loadText, machineStepText, sessionText } from '@/copy'
import { garmentLabel, loadPieces, loadStageAt, loadSummaryActionClassName } from '@/laundry/load-summary'
import { ChemistryScreen, byHandActions, byHandDue, chemistryGroups, chemistrySettings, machineTypeWord, type ChemistryAction } from '@/laundry/chemistry-view'
import { chemistryText, preparationText, runningScreenText, runningText } from '@/copy-laundry'
import { addTimeText, chemRunText, timerText } from '@/copy-run'
import { AddTimeSheet } from '@/kit/add-time-sheet'
import type { Machine, Textile } from '@/household/inventory-types'
import { DoseBody, FullnessBlock, GarmentList, StepBlock, StepProgress, WhichDryer, dryerChoices, machineProduct, secondaryButtonClassName, stepOptionsTriggerId, stepView, type FullnessOutcome, type MachineFacts, type StepChoice } from '@/laundry/machine-step'
import type { SessionProjection } from '@/private-state'
import { clearPendingStep, pendingSteps, savePendingStep } from '@/pending-step'
import { washerGroupIds } from '@/laundry/question-card'
import { Sheet } from '@/kit/sheet'
import { MachineProblemSheet } from '@/laundry/machine-problem'
import { drawerText } from '@/copy-drawer'
import { machineProblemText } from '@/copy-laundry'
import { detergentText } from '@/copy-detergent'
import { SessionDetergentSheet, isDetergentSupply } from '@/products/detergent-sheet'
import { toast } from 'sonner'
import { TaskFooter } from '@/kit/task-footer'
import { afterWashStage, loadNextAction, sessionStage, stageReached, type AfterWashStage, type SessionStage, type StageFacts } from '@/laundry/session-stage'
import { Cup, DoseFigure, ErrorNotice, StatusBadge, clockTime, relativeTime, useConvexCall } from '@/kit/ui'
import { AnswerRow, BackButton, Callout, FooterLink, MachineEntry, Note, Section, TaskHeading, TrialNote, dryerEntryWords, useRecentMachines, largeClassName } from '@/laundry/laundry-ui'
import { dryerWaitText, noDryerText } from '@/copy-drying'
import { dryerWaitTrialText } from '@/copy-trial'
import { DryerWaitCallout, SmellCheck } from '@/drying/drying-view'
import { dryingFacts, homeDryer, rackFull, satWetLong } from '@/home/hub-state'
import { RecordRow } from '@/kit/record-row'
import { dryingValue } from '@/closet/garment-record'
import { dismissItem } from '@/kit/item-navigation'
import { DesignIcon } from '@/kit/design-icons'
import { GarmentIcon } from '@/kit/garment-icon'
import { privateCareWords, type PrivatePiece } from '@/laundry/private-piece'
import { LoadCard, ReceiptRows, RunningRing, type KitFact } from '@/laundry/laundry-kit'
import { CompletionMark } from '@/kit/completion-mark'
import { useUnsynced } from '@/connectivity'
import { useWakeLock } from '@/wake-lock'
import { PreparationPaused } from '@/laundry/preparation-paused'
import { AdviceExplanation, AdviceReminderControls } from '@/closet/garment-advice'
import { displayDose, doseParts, formatDose, localizeTemperatures, storedAmount, useUnits, type UnitSystem } from '@/kit/units'
import '@/styles/laundry-motion.css'

export const sessionPageClassName = cn(
  "page",
  "[.app-shell.is-focus_&]:max-w-[30rem]",
  "grid gap-6 max-w-[36rem] mx-auto pt-2",
  "md:max-w-[45rem]",
  "[.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:w-full [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:max-w-[none] [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:mx-0 [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:pt-0 [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:content-start [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:gap-4",
)

const machineStepNoteClassName = cn(
  "machine-step-note",
  "m-0 text-ink-2",
  "text-[length:var(--step-1)]",
)

const amountFormClassName = cn(
  "amount-form",
  "grid gap-3",
)

const fieldLabelClassName = cn(
  "field-label",
  "text-[length:var(--step-0)]",
  "font-semibold text-ink-2",
)

const amountInputClassName = cn(
  "amount-input",
  "grid grid-cols-[1fr_auto] items-center gap-2",
  "[&_input]:font-text [&_input]:font-extrabold [&_input]:min-h-[3.5rem] [&_input]:tabular-nums",
  "[&_input]:text-[length:var(--figure-md)]",
  "[&_span]:font-text [&_span]:font-extrabold",
  "[&_span]:text-[length:var(--figure-sm)]",
)

const actionsClassName = cn(
  "actions",
  "flex flex-wrap gap-2 items-center",
)

const splitClassName = cn(
  "split",
  "[.actions&]:grid [.actions&]:grid-cols-[1fr_auto]",
)

const machineStepFigureClassName = cn(
  "machine-step-figure",
  "m-0 font-text font-black leading-[0.95] tabular-nums",
  "text-[length:var(--figure-lg)]",
)

export type SessionDetail = FunctionReturnType<typeof api.execution.sessionDetail>
type ServerAction = SessionDetail['actions'][number]

/** One step on the checklist, flattened so a task and a product step read the same way. */
export type Action = {
  advice?: Extract<ServerAction, { kind: 'task' }>['advice']
  id: string
  kind: 'treatment' | 'task'
  task?: Extract<ServerAction, { kind: 'task' }>['task']
  phase: string
  order: number
  title?: string
  detail?: string | null
  supplyId: string
  supplyName: string | null
  textileId?: string
  textileName?: string
  temperatureC?: number | null
  dose: { amount: number; unit: string; mark?: string | null; fractionOfMark?: number; target?: 'below' | 'just_below'; approximate?: boolean; marks?: readonly string[]; equivalent?: { amount: number; unit: string } | null; measurementCue?: string | null } | null
  /** Comes back out of the dryer, so confirming it uses nothing up. */
  reusable?: boolean
  /** A dose decided at the machine: the label's lines by how full the drum or dryer is. */
  atMachine?: Extract<ServerAction, { kind: 'treatment' }>['atMachine']
  soak?: Extract<ServerAction, { kind: 'treatment' }>['soak']
  soakStarted?: Extract<ServerAction, { kind: 'treatment' }>['soakStarted']
  /** The garments a drying step names, with how each one dries when it stays out. */
  garments?: Extract<ServerAction, { kind: 'task' }>['garments']
  stage: string
  placement: string
  timing: string | null
  dueAt?: number
  windowStartAt?: number
  windowEndAt?: number
  confidence: string
  /** Why this dose, as the plan recorded it. */
  basis?: string
  /** Minutes after Start the product record puts a mid-cycle step at, when it gives a time. */
  offsetMinutes?: number | null
  status: 'pending' | 'confirmed' | 'skipped' | 'missed'
}

/** The load checklist shared by the live route and the offline copy saved on this device. */
export type Detail = Omit<SessionDetail, 'actions' | 'timelineRevision'> & { actions: Action[]; timelineRevision?: number }

/** A device tap survives closing the app; only a backend acknowledgment clears it. */
type StepReceipt = Pick<FunctionArgs<typeof api.actions.recordAction>, 'sessionId' | 'actionId' | 'status'> & { receiptId: string }

function useStepRecord(detail: Detail, onAccepted?: (receipt: StepReceipt) => void) {
  const call = useConvexCall(api.actions.recordAction, recordLocally)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [pendingActions, setPendingActions] = useState<readonly string[]>([])
  const run = async (args: FunctionArgs<typeof api.actions.recordAction>) => {
    const action = detail.actions.find((entry) => entry.id === args.actionId)
    const saved = savePendingStep(detail.householdId, action?.title ?? action?.supplyName ?? 'Load step', { ...args, expectedTimelineRevision: detail.timelineRevision })
    if (saved === null) {
      setStorageError('This phone could not save the step. Free storage or allow site storage, then try again.')
      return undefined
    }
    setStorageError(null)
    setPendingActions((ids) => [...ids, saved.args.actionId])
    const result = await call.run(saved.args)
    setPendingActions((ids) => ids.filter((id) => id !== saved.args.actionId))
    if (result !== undefined) {
      clearPendingStep(saved.args.receiptId)
      onAccepted?.(saved.args)
    }
    return result
  }
  return { ...call, run, pending: pendingActions.length > 0, pendingActions, error: storageError ?? call.error }
}

function RecoveredSteps({ detail, online, onAccepted }: { detail: Detail; online: boolean; onAccepted: (receipt: StepReceipt) => void }) {
  const [entries, setEntries] = useState(() => pendingSteps(detail.householdId, detail.sessionId))
  const retry = useConvexCall(api.actions.recordAction)
  useEffect(() => { setEntries(pendingSteps(detail.householdId, detail.sessionId)) }, [detail.sessionId, detail.householdId])
  const remove = (receiptId: string) => {
    clearPendingStep(receiptId)
    setEntries(pendingSteps(detail.householdId, detail.sessionId))
  }
  if (entries.length === 0) return null
  return <Section heading="Saved steps need a check" caption="Check what you actually did before resending saved steps. Nothing is sent automatically.">
    {entries.map((entry) => <div key={entry.args.receiptId} className="grid gap-2">
      <strong>{entry.title}</strong>
      <Note>{entry.args.status === 'confirmed' ? 'Marked done' : entry.args.status === 'skipped' ? 'Left out' : 'Marked missed'} · {clockTime(entry.args.at!)}{entry.args.usage === undefined ? '' : ` · ${entry.args.usage.amount} ${entry.args.usage.unit}${entry.args.usage.mark ? ` to ${entry.args.usage.mark}` : ''}`}{entry.args.minutes === undefined ? '' : ` · ${entry.args.minutes} minutes`}</Note>
      <Button type="button" variant="outline" disabled={!online || retry.pending} onClick={() => void retry.run(entry.args).then((result) => { if (result !== undefined) { remove(entry.args.receiptId); onAccepted(entry.args) } })}>Send saved step</Button>
      <Button type="button" variant="outline" disabled={retry.pending} onClick={() => remove(entry.args.receiptId)}>Discard saved tap</Button>
    </div>)}
    <ErrorNotice error={retry.error} />
  </Section>
}

function step(action: ServerAction): Action {
  if (action.kind === 'task') {
    return { id: action.id, kind: 'task', task: action.task, phase: action.phase, order: action.order, title: action.title, detail: action.detail, ...(action.advice === undefined ? {} : { advice: action.advice }), ...(action.garments === undefined ? {} : { garments: action.garments }), supplyId: '', supplyName: null, dose: null, stage: '', placement: '', timing: null, confidence: 'verified', status: action.status }
  }
  return { ...action, dose: action.dose }
}

/** The one mapping from the server's session to what the checklist shows. */
export function sessionModel(detail: SessionDetail): Detail {
  return { ...detail, actions: detail.actions.map((row) => {
    const action = step(row)
    const textile = detail.textiles.find((piece) => piece.textileId === action.textileId)
    return textile?.private ? { ...action, textileName: `${garmentLabel(textile)} · ${privateCareWords(textile.privateCare)}` } : action
  }) }
}

/** What the session's own record says about its stage. */
export function stageFacts(detail: Pick<Detail, 'status' | 'machineStartedAt' | 'estimatedFinishAt' | 'washFinishedAt' | 'dryerStartedAt' | 'drying' | 'actions'>): StageFacts {
  return {
    status: detail.status,
    machineStartedAt: detail.machineStartedAt,
    washFinishAt: detail.estimatedFinishAt,
    washFinishedAt: detail.washFinishedAt,
    dryerStartedAt: detail.dryerStartedAt,
    dryMinutes: detail.drying?.status === 'ready' ? detail.drying.minutes : null,
    hasDrying: detail.actions.some((action) => action.phase === 'dryer_start' && action.status !== 'skipped'),
    dryerStepRecorded: detail.actions.some((action) => isDryerPhase(action.phase) && action.status === 'confirmed'),
    dryerUnloaded: detail.actions.some((action) => action.phase === 'dryer_unload' && action.status !== 'pending'),
  }
}

/**
 * The step in front of you: the first unrecorded one in physical order. Mid-cycle steps wait for
 * the machine to start, and drying steps for the wash to be done, so nothing is offered while a
 * front-loader's door is still locked.
 */
export function currentStep<Step extends { readonly status: string; readonly phase: string; readonly order: number }>(actions: readonly Step[], stage: SessionStage): Step | null {
  if (stage === 'finished') return null
  const ordered = [...actions].sort((left, right) => left.order - right.order)
  return ordered.find((action) => action.status === 'pending'
    && (action.phase !== 'cycle' || stageReached(stage, 'washing'))
    && (!isDryerPhase(action.phase) || stageReached(stage, 'wash_done'))) ?? null
}

/** A step of Preparation: everything before the machine starts. Mid-cycle and drying steps are not. */
export function isPrepStep(action: { readonly phase: string }): boolean {
  return action.phase !== 'cycle' && !isDryerPhase(action.phase)
}

function dueTime(action: { dueAt?: number | null; windowStartAt?: number }): number | null {
  return action.dueAt ?? action.windowStartAt ?? null
}

/**
 * A recorded step shows as done at once, so the next one is in hand even with no signal: Convex
 * queues the mutation and the server's answer replaces this when it arrives. Start and the dryer's
 * start show their clock from the phone's own time, with the cycle length on record; nothing else
 * is worked out here.
 */
export function recordLocally(store: OptimisticLocalStore, args: FunctionArgs<typeof api.actions.recordAction>) {
  const query = { sessionId: args.sessionId }
  const detail = store.getQuery(api.execution.sessionDetail, query)
  if (detail === undefined) return
  const action = detail.actions.find((entry) => entry.id === args.actionId)
  if (action === undefined || action.status !== 'pending') return
  const at = args.at ?? Date.now()
  const confirmedTask = (task: string) => action.kind === 'task' && action.task === task && args.status === 'confirmed'
  const actions = detail.actions.map((entry) => (entry.id === args.actionId ? { ...entry, status: args.status } : entry))
  if (confirmedTask('start') && detail.machineStartedAt === null) {
    const finish = detail.cycleMinutes === null ? null : at + detail.cycleMinutes * 60_000
    store.setQuery(api.execution.sessionDetail, query, { ...detail, actions, timelineRevision: detail.timelineRevision + 1, machineStartedAt: at, estimatedFinishAt: finish, estimatedDoneAt: finish })
    return
  }
  if (confirmedTask('dryer_start') && detail.dryerStartedAt === null) {
    const drying = detail.drying
    const readyAt = drying !== null && drying.status === 'ready' && drying.minutes !== null ? at + drying.minutes * 60_000 : null
    store.setQuery(api.execution.sessionDetail, query, { ...detail, actions, timelineRevision: detail.timelineRevision + 1, dryerStartedAt: at, ...(drying === null ? {} : { drying: { ...drying, startedAt: at, readyAt } }) })
    return
  }
  store.setQuery(api.execution.sessionDetail, query, { ...detail, actions, timelineRevision: detail.timelineRevision + 1 })
}

/**
 * "It finished" shows at once, so the drying steps are in hand even with no signal. The dryer's
 * estimate runs from the phone's time, as the server's does from the recorded finish.
 */
export function washFinishedLocally(store: OptimisticLocalStore, args: FunctionArgs<typeof api.execution.washFinished>) {
  const query = { sessionId: args.sessionId }
  const detail = store.getQuery(api.execution.sessionDetail, query)
  if (detail === undefined || detail.machineStartedAt === null || detail.washFinishedAt !== null) return
  const at = Math.max(detail.machineStartedAt, args.at ?? Date.now())
  const drying = detail.drying
  const minutes = drying !== null && drying.status === 'ready' && detail.dryerStartedAt === null ? drying.minutes : null
  const readyAt = minutes === null ? drying?.readyAt ?? null : at + minutes * 60_000
  const dryerRuns = detail.actions.some((action) => action.phase === 'dryer_start' && action.status !== 'skipped')
  store.setQuery(api.execution.sessionDetail, query, {
    ...detail,
    washFinishedAt: at,
    estimatedDoneAt: dryerRuns && readyAt !== null ? readyAt : at,
    ...(drying === null ? {} : { drying: { ...drying, readyAt } }),
  })
}

/** The dryer tapped in "Which dryer?" shows as chosen at once, named from the household's machines when they are loaded. */
export function chooseDryerLocally(store: OptimisticLocalStore, args: FunctionArgs<typeof api.execution.chooseDryer>) {
  const query = { sessionId: args.sessionId }
  const detail = store.getQuery(api.execution.sessionDetail, query)
  if (detail === undefined || detail.drying === null) return
  const machines = store.getQuery(api.inventory.list, { householdId: detail.householdId })?.machines
  const dryerName = machines?.find((machine) => machine.machineId === args.dryerId)?.name ?? detail.drying.dryerName
  store.setQuery(api.execution.sessionDetail, query, { ...detail, drying: { ...detail.drying, dryerId: args.dryerId, dryerChosen: true, dryerName } })
}

/**
 * Whether there is something to do at the machine right now: the step in hand, unless it is a
 * mid-cycle step still waiting for its time. The screen stays on only then.
 */
export function stepToDoNow(current: { readonly phase: string; readonly dueAt?: number | null; readonly windowStartAt?: number } | null, now: number): boolean {
  if (current === null) return false
  const due = dueTime(current)
  return current.phase !== 'cycle' || due === null || due <= now
}

/** Only an acknowledged tap matching this load's record earns feedback; reloads start quiet. */
export function acceptedStepFeedback(detail: Detail, receipt: StepReceipt | null, now: number): { recorded: string; next: string; target: 'task' | 'timer' } | null {
  if (receipt === null || receipt.sessionId !== detail.sessionId || detail.status !== 'running') return null
  const recorded = detail.actions.find((action) => action.id === receipt.actionId)
  if (recorded === undefined || recorded.status !== receipt.status) return null
  const name = recorded.title ?? recorded.supplyName ?? 'Load step'
  const summary = `${recorded.status === 'confirmed' ? 'Recorded' : recorded.status === 'skipped' ? 'Left out' : 'Marked missed'}: ${name}.`
  const next = currentStep(detail.actions, sessionStage(stageFacts(detail), now).stage)
  if (queueReady(detail)) return { recorded: summary, next: 'Next: move these pieces to the drying queue.', target: 'task' }
  const startedTimer = recorded.kind === 'task' && recorded.status === 'confirmed' && (recorded.task === 'start' || recorded.task === 'dryer_start')
  if (!startedTimer && next !== null && stepToDoNow(next, now)) return { recorded: summary, next: `Next: ${next.title ?? next.supplyName ?? 'load step'}.`, target: 'task' }
  const dryer = detail.dryerStartedAt !== null
  const until = dryer ? detail.drying?.readyAt ?? null : detail.estimatedFinishAt
  if (detail.machineStartedAt !== null && (dryer || detail.washFinishedAt === null)) {
    const timer = until === null ? 'No finish time is recorded. Check the machine.'
      : until <= now ? dryer ? 'Time is up. Check whether the pieces are dry.' : 'Time is up. Check the washer.'
      : `Timer: ${minutesLeft(until, Math.max(now, dryer ? detail.dryerStartedAt! : detail.machineStartedAt))} left.`
    const due = next === null ? null : dueTime(next)
    return { recorded: summary, next: `${timer}${next !== null && due !== null ? ` Next: ${next.title ?? next.supplyName ?? 'load step'} at ${clockTime(due)}.` : ''}`, target: 'timer' }
  }
  return { recorded: summary, next: 'Review the recorded steps before continuing.', target: 'task' }
}

/** The clock, ticking every `intervalMs`, and at once when the app comes back into view (iOS pauses timers). */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const timer = window.setInterval(tick, intervalMs)
    const visible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('pageshow', tick)
    window.addEventListener('focus', tick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', visible)
      window.removeEventListener('pageshow', tick)
      window.removeEventListener('focus', tick)
    }
  }, [intervalMs])
  return now
}

/** Due steps, plus a vibration (and a generic notification when hidden) the first time each becomes due. */
function useDueReminders(detail: Detail, now: number) {
  const alerted = useRef(new Set<string>())
  const due = detail.status === 'running' ? detail.actions.filter((action) => action.status === 'pending' && (dueTime(action) ?? Infinity) <= now) : []
  const dueKey = due.map((action) => action.id).join()
  useEffect(() => {
    for (const action of due) {
      if (alerted.current.has(action.id)) continue
      alerted.current.add(action.id)
      navigator.vibrate?.([200, 100, 200])
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
        // Generic text: nothing about garments or products appears on a lock screen.
        new Notification('WashCloset', { body: sessionText.notification, tag: `washcloset-${action.id}` })
      }
    }
  }, [dueKey])
  return due
}

/** A whole load's time, "1 h 12 min" or "45 min". */
function totalTime(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000))
  return minutes < 60 ? sessionText.minutes(minutes) : sessionText.hoursMinutes(Math.floor(minutes / 60), minutes % 60)
}

export function minutesLeft(until: number, now: number): string {
  // `now` ticks once a second, so it can trail a time recorded a moment ago; that second never adds a minute.
  const minutes = Math.ceil((until - now - 1000) / 60_000)
  if (minutes <= 0) return sessionText.now
  if (minutes < 60) return sessionText.minutes(minutes)
  return sessionText.hoursMinutes(Math.floor(minutes / 60), minutes % 60)
}

/**
 * The washer is done and nothing but drying is left: its pieces move to the drying queue, where
 * dryer loads are planned apart from wash loads. A load already in its own dryer (from before the
 * queue) carries on there.
 */
export function queueReady(detail: Pick<Detail, 'status' | 'machineStartedAt' | 'washFinishedAt' | 'dryerStartedAt' | 'actions'>): boolean {
  return detail.status === 'running' && detail.machineStartedAt !== null && detail.washFinishedAt !== null && detail.dryerStartedAt === null
    && detail.actions.every((action) => action.status !== 'pending' || isDryerPhase(action.phase))
}

/**
 * What the running page is titled. Between the confirmed wash finish and a dryer starting, the pieces
 * are washed, not drying: a pending dryer step does not make the page say "Drying", and the timer
 * running out alone confirms nothing.
 */
export function runningPhase(detail: Pick<Detail, 'washFinishedAt' | 'dryerStartedAt'>, stage: SessionStage, current: Pick<Action, 'phase'> | null): 'washing' | 'washed' | 'drying' {
  if (detail.dryerStartedAt !== null) return 'drying'
  if (detail.washFinishedAt !== null && stage === 'wash_done') return 'washed'
  return current !== null && isDryerPhase(current.phase) ? 'drying' : 'washing'
}

/** The design offers "Machine problem?" at loading the clothes, pressing Start and adding detergent or softener. */
function problemStep(action: Pick<Action, 'kind' | 'task' | 'stage'>): boolean {
  if (action.kind === 'task') return action.task === 'load' || action.task === 'start'
  return action.stage === 'wash' || action.stage === 'rinse'
}

export function wrongWasherVisible(machineStartedAt: number | null): boolean {
  return machineStartedAt === null
}

/**
 * "Wrong washer?": cancels the session (asking no confirm question, since nothing has been started),
 * then returns to the pass so Start on that load reopens "Which washer?" there. `cancel` follows
 * `useConvexCall`'s own contract: it resolves to `undefined` on a refusal, whose message is left on
 * screen by the caller's own error state, so a failed cancel is simply not navigated away from.
 */
export async function wrongWasher(cancel: () => Promise<unknown>, on: { readonly navigated: () => void }): Promise<void> {
  const result = await cancel()
  if (result !== undefined) on.navigated()
}

/**
 * A finished wash's heading by its stage after the wash (session-stage.ts): not complete while any
 * piece waits to dry, dries or waits to be put away. A due timer asks for a check; it never says dry.
 */
export function afterWashHeading(stage: AfterWashStage | null): { readonly title: string; readonly mark: { readonly tone: 'waiting' | 'drying' | 'ready'; readonly text: string } } {
  switch (stage) {
    case 'queued_to_dry': return { title: sessionText.loadWaitingToDry, mark: { tone: 'waiting', text: sessionText.loadWaitingToDry } }
    case 'pieces_drying': return { title: sessionText.loadDrying, mark: { tone: 'drying', text: runningScreenText.drying } }
    case 'check_due': return { title: sessionText.loadCheckDue, mark: { tone: 'waiting', text: sessionText.loadCheckDue } }
    case 'to_put_away': return { title: sessionText.loadToPutAway, mark: { tone: 'waiting', text: sessionText.loadToPutAway } }
    case 'put_away':
    case null: return { title: sessionText.loadComplete, mark: { tone: 'ready', text: runningScreenText.completeMark } }
  }
}

export type LoadRecord = FunctionReturnType<typeof api.sessions.loadRecord>
/** A piece's own record, opened on History; the caller supplies a router link with its return state and the row's look. */
export type PieceLink = (textileId: string, label: string, children: ReactNode, className: string) => ReactNode

const pieceRowClassName = "flex min-h-14 w-full flex-wrap items-center gap-3.5 px-[18px] py-3 text-start text-ink no-underline focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-ring"

/**
 * A finished or canceled load: a done moment (or its stage, while pieces still dry), how it was cared
 * for as a receipt, and one row per piece that opens its own History. Assessments stay on History.
 */
export function LoadSummaryView({ detail, record, now, system, back, footer, error = null, pieceLink, nextLink, kindOf }: {
  detail: Pick<Detail, 'status' | 'machineName' | 'cycle' | 'completedAt' | 'usage' | 'doorLocks' | 'textiles' | 'dryerCheckAt'> & Partial<Pick<Detail, 'startedAt' | 'putAwayAt' | 'loadName'>>
  record: LoadRecord | undefined
  now: number
  system: UnitSystem
  back: ReactNode
  footer: ReactNode
  /** A step that failed after the load completed, such as hanging the pieces once they reached the drying queue. */
  error?: string | null
  pieceLink: PieceLink
  /** Opens the drying screens when the load's next action is there; the summary itself records nothing. */
  nextLink?: (props: { className: string; children: string }) => ReactNode
  /** A piece's garment kind, for its picture. */
  kindOf?: (textileId: string) => string | null
}) {
  const completed = detail.status === 'completed'
  const afterWash = completed ? afterWashStage({ pieces: detail.textiles, dryerCheckAt: detail.dryerCheckAt ?? null }, now) : null
  const heading = completed ? afterWashHeading(afterWash) : null
  const done = completed && (afterWash === null || afterWash === 'put_away')
  const next = loadNextAction(afterWash ?? 'finished')
  // Matching pieces count together only when they also came out with the same status, wash count and drying state.
  const washedFact = (textile: Detail['textiles'][number]) => completed ? sessionText.washedStatus(textile.status === 'clean' ? sessionText.clean : textile.status ?? '', textile.washCount ?? 0).replace(/^ · /, '') : null
  const pieceFacts = (textile: Detail['textiles'][number]) => [textile.drying === undefined ? null : sessionText.pieceDrying[textile.drying], washedFact(textile)].filter((part) => part !== null).join(' · ')
  const cycle = cycleWord(detail.cycle)
  const washer = washerName(detail.machineName)
  const rows = loadPieces(detail.textiles, pieceFacts)
  // One drying line, when every recorded piece dried the same way; otherwise each piece's History says.
  const dried = [...new Set((record?.pieces ?? []).map((piece) => dryingValue(piece.wash.drying)))]
  const used = detail.usage.map((use) => `${use.supplyName ?? sessionText.productCapital} · ${doseParts(use, system).spoken}`)
  const facts: KitFact[] = [
    ...(completed ? [{ key: 'washed', tone: 'wash' as const, icon: <DesignIcon name="washer" strokeWidth={1.6} />, label: sessionText.receipt.washed, value: cycle === null ? washer : `${washer} · ${cycle}` }] : []),
    ...(completed && dried.length === 1 ? [{ key: 'dried', tone: 'dry' as const, icon: <DesignIcon name="dryer" strokeWidth={1.6} />, label: sessionText.receipt.dried, value: dried[0]! }] : []),
    ...(used.length > 0 ? [{ key: 'used', tone: 'used' as const, icon: <DesignIcon name="bottle" strokeWidth={1.6} />, label: sessionText.receipt.used, value: used.join('; ') }] : []),
  ]
  const finished = detail.completedAt === null ? '' : sessionText.finishedAt(relativeTime(detail.completedAt, now)).replace(/^, f/, 'f')
  // Start to last put-away, when both were kept; otherwise the line says when it finished.
  const total = detail.startedAt != null && detail.putAwayAt != null && detail.putAwayAt > detail.startedAt ? totalTime(detail.putAwayAt - detail.startedAt) : null
  const doneLine = afterWash === null ? [sessionText.piecesWashed(detail.textiles.length), finished || null] : total !== null ? [sessionText.piecesWashedDriedPutAwayIn(detail.textiles.length, total)] : [sessionText.piecesWashedDriedPutAway(detail.textiles.length), finished || null]
  return (
    <div className={cn(sessionPageClassName, 'grid-cols-1')}>
      {done ? (
        <>
          <div className="-mb-4 flex min-h-12 items-center">{back}</div>
          {/* The moment breathes: room under the mark, the headline and its line kept together, space before the receipt. */}
          <header className="grid justify-items-center gap-6 pt-4 pb-3 text-center">
            <CompletionMark />
            <div className="grid gap-2">
            <h1 className="m-0 text-balance text-[length:var(--step-3)] font-semibold leading-tight">{detail.loadName ? sessionText.loadDoneNamed(detail.loadName) : sessionText.loadComplete}</h1>
            <p className="m-0 text-ink-2">{doneLine.filter((part) => part !== null).join(' · ')}</p>
            </div>
          </header>
        </>
      ) : (
        <TaskHeading
          title={heading === null ? sessionText.loadCancelled : heading.title}
          back={back}
          {...(heading === null ? { mark: { tone: 'waiting' as const, text: runningScreenText.cancelledMark } } : {})}
          caption={`${washer}${cycle === null ? '' : ` · ${chemistryText.cycleName(cycle)}`}${detail.completedAt === null ? '' : sessionText.finishedAt(relativeTime(detail.completedAt, now))}`}
        />
      )}
      {facts.length === 0 ? null : <ReceiptRows label={sessionText.howCaredFor} facts={facts} />}
      {completed && !done && next.target === 'drying' && nextLink !== undefined ? nextLink({ className: loadSummaryActionClassName, children: next.label }) : null}
      {rows.length === 0 ? null : (
        <section aria-label={sessionText.loadSummary} className="grid gap-2.5">
          <h2 className="m-0 px-1 text-[length:var(--step-2)] font-semibold leading-[1.3]">{done ? sessionText.backInCloset : sessionText.inThisLoad}</h2>
          <ul role="list" className="m-0 list-none overflow-hidden rounded-card bg-surface p-0 shadow-[var(--e1)]">
            {rows.map((row) => {
              const first = row.first
              const label = row.count > 1 && !row.private ? `${row.label} ×${row.count}` : row.label
              const state = first.drying === undefined ? (first.status === 'clean' ? sessionText.cleanPill : null) : sessionText.pieceDrying[first.drying]
              const content = (
                <>
                  <span className="grid size-10 flex-none place-items-center rounded-full bg-surface-2"><GarmentIcon kind={kindOf?.(first.textileId) ?? null} colorGroup={first.colorGroup} /></span>
                  <span className="min-w-0 flex-[1_1_8rem] font-semibold [overflow-wrap:anywhere]">{label}{row.private ? <span className="block font-normal text-ink-2">{privateCareWords(first.privateCare)}</span> : null}{row.guest ? <span className="font-normal text-ink-2"> ({loadText.guestItem})</span> : null}</span>
                  {state === null ? null : <span className={cn('flex-none rounded-full px-2.5 py-0.5 text-[length:var(--step--1)] font-semibold', first.status === 'clean' && first.drying === undefined || first.drying === 'put_away' ? 'bg-ready-bg text-ready-ink' : 'bg-surface-2 text-ink')}>{state}</span>}
                </>
              )
              // A guest's piece leaves the household at put-away; it has no record to open.
              return (
                <li key={row.key} className="[&+&]:[border-block-start:1px_solid_var(--line)]">
                  {row.guest || first.name === null
                    ? <div className={pieceRowClassName}>{content}</div>
                    : pieceLink(first.textileId, sessionText.pieceHistoryLabel(row.label), <>{content}<DesignIcon name="chevronRight" size="1em" strokeWidth={2.2} className="size-4 flex-none text-ink-2" aria-hidden="true"  /></>, pieceRowClassName)}
                </li>
              )
            })}
          </ul>
        </section>
      )}
      <ErrorNotice error={error} />
      <TaskFooter>{footer}</TaskFooter>
    </div>
  )
}

export type SessionFrom = 'me' | 'closet'

/** Where Back goes from a load opened elsewhere: the page that opened it, else Laundry. */
export function sessionOrigin(from: SessionFrom | undefined): { label: string; to: '/me' | '/closet' | '/laundry' } {
  if (from === 'me') return { label: sessionText.backToMe, to: '/me' }
  if (from === 'closet') return { label: sessionText.backToCloset, to: '/closet' }
  return { label: sessionText.backToLaundry, to: '/laundry' }
}

export function SessionView({ detail, now, online, savedAt, from }: { detail: Detail; now: number; online: boolean; savedAt?: number; from?: SessionFrom }) {
  const { system } = useUnits()
  const navigate = useNavigate()
  const router = useRouter()
  // The copy saved on this phone can't record: its steps lack what the server needs. The live load
  // records even with no signal; Convex sends each step when the connection returns.
  const readOnly = savedAt !== undefined
  const unsynced = useUnsynced()
  const due = useDueReminders(detail, now)
  const complete = useConvexCall(api.sessions.complete)
  const cancel = useConvexCall(api.execution.cancel)
  const washFinished = useConvexCall(api.execution.washFinished, washFinishedLocally)
  const toQueue = useConvexCall(api.dryingQueue.queueFromWasher)
  const hang = useConvexCall(api.dryingQueue.hangWhileDryerBusy)
  const remind = useConvexCall(api.dryingQueue.remindWhenDone)
  // Washed and waiting: whether the home dryer still holds another of this household's loads.
  const dryingQueue = useQuery(api.dryingQueue.queue, queueReady(detail) && !readOnly ? { householdId: detail.householdId } : 'skip')
  // Only a load with something for the dryer waits for it; an air-dry load just hangs (garment safety first).
  const dryerNow = dryingQueue === undefined || !stageFacts(detail).hasDrying ? null : homeDryer([], dryingFacts(dryingQueue), now)
  const dryerHeld = dryerNow === null || dryerNow.kind === 'free' ? null : dryerNow
  const [accepted, setAccepted] = useState<StepReceipt | null>(null)
  // Keep pending/refusal state here: the optimistic next step can unmount its submitter.
  const record = useStepRecord(detail, setAccepted)
  const leaveProductOut = useStepRecord(detail)
  const recoverPlacement = useConvexCall(api.execution.recoverPreparationPlacement)
  const preparationPage = useRef<HTMLDivElement>(null)
  const pending = detail.actions.filter((action) => action.status === 'pending')
  const running = detail.status === 'running'
  const started = detail.machineStartedAt !== null
  const [cancelling, setCancelling] = useState(false)
  const [problemOpen, setProblemOpen] = useState(false)
  const [addingTime, setAddingTime] = useState(false)
  const [switchOpen, setSwitchOpen] = useState(false)
  const [startMinutes, setStartMinutes] = useState('')
  useEffect(() => { setStartMinutes('') }, [detail.sessionId])
  // What the last "How full?" answer left, kept here so its question survives the step moving on.
  const [outcome, setOutcome] = useState<FullnessOutcome | null>(null)
  // Why the server refused a "How full?" answer: it arrives after that step has been swapped out.
  const [refused, setRefused] = useState<string | null>(null)
  const ordered = [...detail.actions].sort((left, right) => left.order - right.order)
  const stage = sessionStage(stageFacts(detail), now)
  const current = currentStep(ordered, stage.stage)
  // The screen stays on only while there is a step to do at the machine: not while a mid-cycle step
  // waits for its time, so a pocketed phone neither drains nor takes pocket taps.
  useWakeLock(running && (stepToDoNow(current, now) || due.length > 0))
  // Kept while offline: the last answer stays on screen until the connection returns.
  const inventory = useQuery(api.inventory.list, running && !readOnly ? { householdId: detail.householdId } : 'skip')
  const loadRecord = useQuery(api.sessions.loadRecord, !running && detail.status === 'completed' && !readOnly ? { sessionId: detail.sessionId } : 'skip')
  // Before the machine starts, only preparation exists: nothing mid-cycle or for drying belongs to it.
  const preparing = running && detail.machineStartedAt === null
  const preparationIssues = useQuery(api.execution.preparationIssues, preparing && !readOnly ? { sessionId: detail.sessionId } : 'skip')
  const preparationIssue = preparationIssues?.[0] ?? null
  const recoveryOptions = useQuery(api.execution.preparationRecoveryOptions, preparationIssue !== null && !readOnly ? { sessionId: detail.sessionId, actionId: preparationIssue.actionId } : 'skip')
  const focusPreparation = () => {
    const heading = preparationPage.current?.querySelector<HTMLHeadingElement>('h1')
    if (heading === undefined || heading === null) return
    heading.tabIndex = -1
    heading.focus({ preventScroll: true })
    heading.scrollIntoView({ block: 'nearest', behavior: 'instant' })
  }
  const recoverPreparation = async (placement: 'direct_to_drum' | 'downy_ball') => {
    if (preparationIssue === null || readOnly || !online) return
    if (await recoverPlacement.run({ sessionId: detail.sessionId, actionId: preparationIssue.actionId, placement }) !== undefined) focusPreparation()
  }
  const leavePausedProductOut = async () => {
    if (preparationIssue === null || readOnly || !online) return
    if (await leaveProductOut.run({ sessionId: detail.sessionId, actionId: preparationIssue.actionId, status: 'skipped', at: Date.now() }) !== undefined) focusPreparation()
  }
  const prepSteps = ordered.filter(isPrepStep)
  const prepCurrent = prepSteps.findIndex((action) => action.status === 'pending')
  const prepAt = prepCurrent < 0 ? prepSteps.length : prepCurrent
  const prepDone = prepSteps.filter((action) => action.status !== 'pending').length
  // Chemistry comes first when nothing has been recorded.
  const [chemistryOpen, setChemistryOpen] = useState(() => preparing && prepDone === 0 && !ordered.some((action) => action.kind === 'treatment' && action.soakStarted !== undefined))
  // A step before the current one, looked at again: recorded steps are shown, never recorded twice.
  const [review, setReview] = useState<number | null>(null)
  useEffect(() => { setReview(null) }, [prepAt])
  const reviewing = preparing && !chemistryOpen && review !== null && review < prepAt ? review : null
  const feedback = readOnly ? null : acceptedStepFeedback(detail, accepted, now)
  const [shownFeedback, setShownFeedback] = useState<{ receiptId: string; sessionId: string; words: NonNullable<typeof feedback> } | null>(null)
  const nextTask = useRef<HTMLDivElement>(null)
  const timerRegion = useRef<HTMLDivElement>(null)
  const focusedReceipt = useRef<string | null>(null)
  useEffect(() => {
    if (accepted === null || feedback === null || focusedReceipt.current === accepted.receiptId) return
    focusedReceipt.current = accepted.receiptId
    setShownFeedback({ receiptId: accepted.receiptId, sessionId: detail.sessionId, words: feedback })
    // A late acknowledgment must not interrupt a draft, a review or an open drawer.
    if (chemistryOpen || reviewing !== null || document.hidden || document.querySelector('[role="dialog"]') !== null) return
    const active = document.activeElement
    if (active !== null && active !== document.body && !preparationPage.current?.contains(active)) return
    if (active?.matches('input, textarea, select, [contenteditable="true"]')) return
    const target = feedback.target === 'timer' ? timerRegion.current : nextTask.current?.querySelector<HTMLElement>('h2, button, a')
    if (target === null || target === undefined) return
    if (!target.matches('button, a')) target.tabIndex = -1
    target.focus({ preventScroll: true })
  }, [accepted, feedback, chemistryOpen, reviewing])
  // Timer ticks do not repeat the earned acknowledgment or replay it after an interruption.
  useEffect(() => {
    if (shownFeedback === null) return
    const timer = window.setTimeout(() => setShownFeedback(null), 6000)
    return () => window.clearTimeout(timer)
  }, [shownFeedback])
  const visibleFeedback = shownFeedback === null || shownFeedback.sessionId !== detail.sessionId || feedback === null
    || shownFeedback.words.next !== feedback.next || record.pending || record.error !== null || reviewing !== null ? null : shownFeedback

  // Opened from Me or Closet, Back returns there (history first, preserving its state); else Laundry.
  const origin = sessionOrigin(from)
  const leave = () => dismissItem(router, () => void navigate({ to: origin.to, replace: true }))
  const backLink = from === undefined
    ? <BackButton label={origin.label} render={<Link to="/laundry" />} />
    : <BackButton label={origin.label} onClick={leave} />

  // Hang and Wait run after queueFromWasher completed the load, so their failure shows on the summary.
  if (!running) {
    return (
      <LoadSummaryView detail={detail} record={loadRecord} now={now} system={system} back={backLink}
        error={hang.error ?? remind.error}
        footer={from === undefined
          ? <Link className={cn(buttonVariants({ size: 'lg' }), 'w-full')} to="/laundry">{origin.label}</Link>
          : <Button type="button" size="lg" className="w-full" onClick={leave}>{origin.label}</Button>}
        nextLink={({ className, children }) => <Link className={className} to="/drying">{children}</Link>}
        kindOf={(textileId) => inventory?.textiles.find((item) => item.textileId === textileId)?.kind ?? null}
        pieceLink={(textileId, label, children, className) => (
          <Link className={className} to="/closet" search={{ item: textileId, tab: 'history' }} state={{ itemReturnTo: router.state.location.href }} aria-label={label}>{children}</Link>
        )} />
    )
  }

  const total = preparing ? prepSteps.length : ordered.length
  const recordedCount = preparing ? prepDone : total - pending.length
  const progress = preparing ? preparationText.stepOf(Math.min(prepAt + 1, total), total) : `${Math.min(recordedCount + 1, total)} of ${total}`
  const facts: MachineFacts = { doorLocks: detail.doorLocks, cycle: detail.cycle || null, cycleMinutes: detail.cycleMinutes, washerName: washerName(detail.machineName), drying: detail.drying,
    preparationSettings: ordered.find((action) => action.kind === 'task' && action.task === 'start')?.detail ?? null,
    productUse: (supplyId) => inventory?.supplies.find((entry) => entry.supplyId === supplyId)?.use ?? null }
  const textileName = (textileId: string) => garmentLabel(detail.textiles.find((textile) => textile.textileId === textileId))
  const names = {
    product: (supplyId: string) => {
      const supply = inventory?.supplies.find((entry) => entry.supplyId === supplyId)
      return supply === undefined ? null : machineProduct(supply)
    },
    machineName: (machineId: string) => inventory?.machines.find((machine) => machine.machineId === machineId)?.name ?? null,
    washerGroup: (machineId: string) => washerGroupIds(machineId, inventory?.machines ?? []),
  }
  const finish = () => { if (detail.planInputHash !== null) void complete.run({ sessionId: detail.sessionId, planInputHash: detail.planInputHash, idempotencyKey: detail.idempotencyKey }) }
  const dryerRunning = detail.dryerStartedAt !== null
  const washer = washerName(detail.machineName)
  const stepBack = (index: number) => (index > 0 ? { label: preparationText.previousStep, onClick: () => setReview(index - 1) } : undefined)
  const pieces = loadPieces(detail.textiles).map(({ first, ...piece }) => {
    const garment = inventory?.textiles.find((item) => item.textileId === first.textileId)
    return { ...piece, care: first.private ? privateCareWords(first.privateCare) : undefined, kind: garment?.kind ?? null, colorGroup: garment?.colorGroup ?? null, media: garment === undefined ? undefined : <GarmentIcon kind={garment.kind} colorGroup={garment.colorGroup} /> }
  })
  // "Ran out? Switch product" and "Machine problem?" sit in the step card's recovery group; what
  // each can do lives in its sheet. Which of them a step offers is stepActions' call.
  const detergent = current === null || current.kind !== 'treatment' ? undefined : inventory?.supplies.find((supply) => supply.supplyId === current.supplyId && isDetergentSupply(supply))
  const recovery: StepRecoveryFacts = {
    preparing, isDetergent: detergent !== undefined, hasLoad: detail.loadId !== null,
    onSwitchProduct: () => setSwitchOpen(true), onMachineProblem: () => setProblemOpen(true),
  }
  const notices = (
    <>
      {!readOnly ? <RecoveredSteps detail={detail} online={online} onAccepted={(receipt) => { record.clearError(); setAccepted(receipt) }} /> : null}
      {savedAt !== undefined ? (
        <Callout>{sessionText.offlineCopy(relativeTime(savedAt, now))}</Callout>
      ) : !online && !unsynced ? (
        <Callout>{sessionText.offlineLive}</Callout>
      ) : null}
      {unsynced && !readOnly ? (
        <Callout><strong>{sessionText.savedOnPhone}</strong> {sessionText.keepOpen}</Callout>
      ) : null}
      <ErrorNotice error={record.error} />
    </>
  )

  if (preparing && chemistryOpen) {
    const startTask = ordered.find((action) => action.kind === 'task' && action.task === 'start')
    const groups = chemistryGroups(ordered, detail.doorLocks, { clothes: true, productUse: facts.productUse })
    const rows = groups.flatMap((group) => group.rows)
    const washerRecord = inventory?.machines.find((entry) => washerName(entry.name) === washer)
    return (
      <div ref={preparationPage} className={cn(sessionPageClassName, "machine-screen")}>
        {notices}
        <ChemistryScreen
          back={backLink}
          place={detail.loadName == null || detail.loadNumber == null || detail.loadCount == null ? null : { name: detail.loadName, number: detail.loadNumber, count: detail.loadCount }}
          machineFact={chemRunText.machineLine(washer, machineTypeWord(washerRecord?.highEfficiency))}
          groups={groups}
          settings={chemistrySettings({ cycle: detail.cycle || null, cycleMinutes: detail.cycleMinutes, startDetail: startTask?.detail ?? null })}
          pieces={pieces}
          washer={washer}
          unrecorded={rows.some((row) => row.amount.kind === 'not_recorded')}
          startAmounts={rows.some((row) => row.amount.kind === 'at_machine')}
          continueLabel={prepSteps.length === 0 ? chemRunText.resolveOpen : prepDone > 0 ? chemistryText.continuePreparation : chemistryText.startPreparation}
          disabled={readOnly || prepSteps.length === 0 || preparationIssue !== null || preparationIssues === undefined}
          onContinue={() => setChemistryOpen(false)}
          extra={preparationIssue === null ? undefined : <PreparationPaused issue={preparationIssue} options={recoveryOptions} disabled={readOnly || !online} pending={leaveProductOut.pending || recoverPlacement.pending} error={recoverPlacement.error ?? leaveProductOut.error} onRecover={recoverPreparation}
            onMachineProblem={() => { setChemistryOpen(false); setProblemOpen(true) }} onLeaveOut={leavePausedProductOut} />}
        />
      </div>
    )
  }

  const phase = runningPhase(detail, stage.stage, current)
  // One load card on every laundry screen; while a machine runs it follows the ring, as on the dryness check.
  const loadCard = <LoadCard label={sessionText.loadSummary} at={loadStageAt(stage.stage)}
    pieces={pieces.map((piece) => ({ key: piece.key, kind: piece.kind, colorGroup: piece.colorGroup, label: piece.guest ? `${piece.label} (${loadText.guestItem})` : piece.label, count: piece.count }))} />
  const dots = preparing ? prepSteps.map((action, index) => (action.status !== 'pending' ? 'done' as const : index === prepAt ? 'current' as const : 'todo' as const)) : undefined
  const startedAt = dryerRunning ? detail.dryerStartedAt : detail.machineStartedAt

  // A preparation step is a task screen: Back and the progress segments on top, no load card (the clothes were just shown).
  const stepping = dots !== undefined && (reviewing !== null || (current !== null && prepSteps.includes(current)))
  return (
    <div ref={preparationPage} className={cn(sessionPageClassName, "machine-screen")}>
      {stepping ? (
        <header className="-mb-2 flex items-center gap-2">
          {backLink}
          <StepProgress dots={dots} />
          <h1 className="sr-only">{preparationText.title}</h1>
        </header>
      ) : (
        <>
          <TaskHeading
            title={preparing ? preparationText.title : phase === 'washed' ? timerText.washed : phase === 'drying' ? runningScreenText.drying : runningScreenText.washing}
            back={backLink}
            // The load card carries the stage; the heading adds only the start time.
            caption={preparing || startedAt === null ? undefined : runningScreenText.startedAt(clockTime(startedAt))}
          />
          {started ? null : loadCard}
        </>
      )}

      {notices}
      {due.length > 0 ? (
        <Callout role="alert"><strong>{sessionText.dueSteps(due.length)}</strong> {sessionText.recordDue}</Callout>
      ) : null}

      <div role="status" aria-live="polite" aria-atomic="true" className={visibleFeedback === null || visibleFeedback.words.target === 'timer' ? 'sr-only' : undefined}>
        {visibleFeedback === null ? null :
          <p key={visibleFeedback.receiptId} className="laundry-accepted-feedback m-0 text-[length:var(--step-0)] text-ink-2"><strong>{visibleFeedback.words.recorded}</strong> {visibleFeedback.words.next}</p>}
      </div>
      {started ? <div ref={timerRegion} role="group" tabIndex={-1} aria-label={dryerRunning ? 'Drying timer' : 'Wash timer'}>
        {!dryerRunning ? <TimerCard detail={detail} now={now} washer={washer} /> : <DryTimer readyAt={detail.drying?.readyAt ?? null} now={now} drying={detail.drying} />}
      </div> : null}
      {started ? loadCard : null}

      <ErrorNotice error={refused} />
      <div ref={nextTask} className="contents">
      {queueReady(detail) ? (
        <>
          {satWetLong(detail.washFinishedAt, now) ? <SmellCheck /> : null}
          {dryerHeld === null ? null : <DryerWaitCallout dryer={dryerHeld} rackIsFull={rackFull(dryingFacts(dryingQueue!))}
            onUnload={() => void navigate({ to: '/drying' })}
            onHang={readOnly || !online ? undefined : () => {
              if (toQueue.pending || hang.pending) return
              void toQueue.run({ sessionId: detail.sessionId, at: Date.now() }).then(async (queued) => {
                if (queued === undefined) return
                if (await hang.run({ householdId: detail.householdId, washSessionId: detail.sessionId, at: Date.now() }) !== undefined) void navigate({ to: '/drying' })
              })
            }}
            onWait={readOnly || !online || dryerHeld.kind !== 'busy' || dryerHeld.runId === null || dryerHeld.until === null ? undefined : () => {
              if (toQueue.pending || remind.pending) return
              const runId = dryerHeld.runId as Id<'dryingRuns'>
              void toQueue.run({ sessionId: detail.sessionId, at: Date.now() }).then(async (queued) => {
                if (queued !== undefined && await remind.run({ runId }) !== undefined) void navigate({ to: '/drying' })
              })
            }} />}
          <ErrorNotice error={hang.error ?? remind.error} />
          <Note>{sessionText.queueNote}</Note>
          <ErrorNotice error={toQueue.error} />
          <TaskFooter>
            <Button type="button" size="lg" className="w-full" disabled={toQueue.pending || readOnly || !online} onClick={() => void toQueue.run({ sessionId: detail.sessionId, at: Date.now() }).then((result) => { if (result !== undefined) void navigate({ to: '/drying' }) })}>{sessionText.moveToQueue}</Button>
          </TaskFooter>
        </>
      ) : reviewing !== null ? (
        <ReviewStep
          key={'review-' + prepSteps[reviewing]!.id}
          action={prepSteps[reviewing]!}
          actualUsage={detail.usage.find((use) => use.actionId === prepSteps[reviewing]!.id)}
          facts={facts}
          progress={preparationText.stepOf(reviewing + 1, total)}
          drumFullness={detail.drumFullness}
          previous={stepBack(reviewing)}
          onNext={() => setReview(reviewing + 1 >= prepAt ? null : reviewing + 1)}
        />
      ) : current !== null ? (
        <MachineStep
          key={current.id}
          hang={hang}
          action={current}
          record={record}
          previous={preparing && prepSteps.includes(current) ? stepBack(prepSteps.indexOf(current)) : undefined}
          detail={detail}
          facts={facts}
          progress={progress}
          dots={preparing && prepSteps.includes(current) ? dots : undefined}
          canRecord={!readOnly}
          online={online}
          minutes={startMinutes}
          onMinutesChange={setStartMinutes}
          pausedReason={preparationIssue !== null ? 'Choose an option' : preparing && !readOnly && preparationIssues === undefined ? 'Checking washer setup' : undefined}
          outcome={outcome}
          onOutcome={(value) => {
            setOutcome(value)
            // FullnessBlock calls this only after recordDrumFullness accepts the answer.
            if (value !== null && current.kind === 'task' && (current.task === 'drum_fullness' || current.task === 'dryer_fullness')) {
              setAccepted({ sessionId: detail.sessionId, actionId: current.id, status: 'confirmed', receiptId: `fullness-${current.id}-${Date.now()}` })
            }
          }}
          onRefused={setRefused}
          names={names}
          dryers={inventory?.machines ?? null}
          adviceTextiles={inventory?.textiles.filter((piece) => current.garments?.some((garment) => garment.textileId === piece.textileId)) ?? []}
          textileName={textileName}
          recovery={recovery}
        />
      ) : pending.length === 0 && stage.stage !== 'washing' ? (
        <StepBlock
          titleId="finish-title"
          eyebrow={washerName(detail.machineName)}
          title={sessionText.everything}
          primary={{ label: sessionText.finishLoad, onClick: finish, disabled: complete.pending || detail.planInputHash === null || readOnly }}
        >
          <p className={machineStepNoteClassName}>{sessionText.finishing}</p>
          <ErrorNotice error={complete.error} />
        </StepBlock>
      ) : started ? (
        <>
          <ErrorNotice error={washFinished.error} />
          <TaskFooter
            note={detail.estimatedFinishAt === null ? undefined : sessionText.nothingToAdd(clockTime(detail.estimatedFinishAt))}
            secondary={readOnly ? undefined : <FooterLink disabled={!online} onClick={() => setAddingTime(true)}>{addTimeText.link}</FooterLink>}
          >
            <Button type="button" size="lg" className="w-full" disabled={washFinished.pending || readOnly} onClick={() => void washFinished.run({ sessionId: detail.sessionId, at: Date.now() })}>{sessionText.washerDone(washer)}</Button>
          </TaskFooter>
        </>
      ) : null}
      </div>

      {/* Preparation names every garment going in, with its art, as the loading list; once running, the summary holds the contents. */}
      {started || (stepping && !(current?.kind === 'task' && current.task === 'load')) ? null : <Section heading={sessionText.goingInto(washer)} caption={sessionText.pieces(detail.textiles.length)}>
        {pieces.map((piece) => <RecordRow key={piece.key} media={piece.private ? undefined : piece.media ?? <DesignIcon name="tee" size="1em" strokeWidth={2.2}  />} title={piece.count > 1 && !piece.private ? `${piece.label} ×${piece.count}` : piece.label} fact={piece.private ? piece.care : piece.guest ? loadText.guestItem : undefined} />)}
      </Section>}
      {preparing && prepDone > 0 ? <Note>{preparationText.progressNote(prepDone, prepSteps.length)}</Note> : null}
      {preparationIssue === null ? null : <PreparationPaused issue={preparationIssue} options={recoveryOptions} disabled={readOnly || !online} pending={leaveProductOut.pending || recoverPlacement.pending} error={recoverPlacement.error ?? leaveProductOut.error} onRecover={recoverPreparation}
        onMachineProblem={() => setProblemOpen(true)} onLeaveOut={leavePausedProductOut} />}

      {started && !dryerRunning ? <ByHandCard actions={ordered} now={now} /> : null}
      {started ? <RecipeReceipt actions={ordered} doorLocks={detail.doorLocks} /> : null}

      {problemOpen && !started ? (
        <MachineProblemSheet sessionId={detail.sessionId} washer={washer} online={online} onClose={() => setProblemOpen(false)}
          onMoved={(name) => { setProblemOpen(false); toast(machineProblemText.moved(name)) }}
          onRecalculated={() => { setProblemOpen(false); toast(drawerText.recalculated) }}
          onCancel={() => { setProblemOpen(false); setCancelling(true) }} />
      ) : null}

      {addingTime && started && !readOnly ? (
        <AddTimeSheet sessionId={detail.sessionId} washer={washer} online={online} onClose={() => setAddingTime(false)}
          onDone={() => { setAddingTime(false); toast(addTimeText.updated) }} />
      ) : null}

      {switchOpen && !started && detergent !== undefined && detail.loadId !== null ? (
        <SessionDetergentSheet sessionId={detail.sessionId} planId={detail.planId} loadId={detail.loadId} householdId={detail.householdId}
          current={{ supplyId: detergent.supplyId, name: detergent.name }}
          added={(() => {
            const done = ordered.find((action) => action.kind === 'treatment' && action.supplyId === detergent.supplyId && action.status === 'confirmed')
            return done === undefined ? null : { amount: done.dose === null ? null : doseParts(done.dose, system).spoken }
          })()}
          online={online}
          onClose={() => setSwitchOpen(false)}
          onSwitched={(planId) => { setSwitchOpen(false); void navigate({ to: '/laundry', search: { plan: planId } }) }} />
      ) : null}

      {cancelling ? (
        <Sheet
          title={sessionText.cancelTitle}
          subtitle={sessionText.cancelDetail}
          closeLabel={sessionText.keepLoad}
          onClose={() => setCancelling(false)}
          footer={(
            <Button className={cn(largeClassName, "danger")} type="button" disabled={cancel.pending || !online} onClick={() => {
              setCancelling(false)
              void cancel.run({ sessionId: detail.sessionId })
            }}>{sessionText.confirmCancel}</Button>
          )}
        />
      ) : null}
    </div>
  )
}

/** The recipe a load started with, as receipt rows: where each product went, what it was, how much. */
function RecipeReceipt({ actions, doorLocks }: { actions: readonly Action[]; doorLocks: boolean }) {
  const rows = chemistryGroups(actions.filter((action) => action.phase !== 'cycle'), doorLocks).flatMap((group) => group.rows)
  if (rows.length === 0) return null
  const facts: KitFact[] = rows.map((row, index) => ({
    key: `${index}`, tone: 'used', icon: <DesignIcon name="bottle" strokeWidth={1.6} />, label: row.where,
    value: <>{row.product}{row.amount.kind === 'dose' ? <> · <DoseFigure dose={row.amount.dose} size="inline" /></> : row.amount.kind === 'at_machine' ? ` · ${chemistryText.chosenAtDrum}` : ` · ${chemistryText.notRecorded}`}</>,
  }))
  return (
    <section className="grid gap-2">
      <h2 className="m-0 px-1 text-[length:var(--step-1)] font-semibold">{runningText.recipeUsed}</h2>
      <ReceiptRows label={runningText.recipeUsed} facts={facts} />
    </section>
  )
}

/**
 * The washer's time: minutes left from the machine's recorded time, a bar for how far along, never a
 * guess. Once the finish is recorded (the same wash_done boundary the timer notices use), it is only
 * a record of when: no countdown, no bar, and the tab title stops counting.
 */
export function TimerCard({ detail, now, washer }: { detail: Detail; now: number; washer: string }) {
  const finishedAt = detail.washFinishedAt
  const finish = finishedAt === null ? detail.estimatedFinishAt : null
  useEffect(() => {
    if (finish === null) return
    const previous = document.title
    document.title = finish <= now ? sessionText.documentDone : sessionText.documentMinutes(minutesLeft(finish, now))
    return () => { document.title = previous }
  }, [finish, Math.floor(now / 30_000)])
  if (finishedAt !== null) return <TimeCard big={timerText.finished} sub={timerText.finishedAt(washer, clockTime(finishedAt))} />
  if (finish === null) return <TimeCard big={runningScreenText.running} sub={sessionText.runningUnknown} />
  // The minutes read off the machine ("observed") are the timer's own length: the design says so.
  const entered = detail.finishConfidence === 'observed' && detail.cycleMinutes !== null
  if (finish <= now) return <TimeCard big={runningScreenText.timeIsUp} sub={entered ? timerText.check(washer) : sessionText.loadDone} expired tone="washing" />
  const total = detail.cycleMinutes !== null ? detail.cycleMinutes * 60_000 : detail.machineStartedAt === null ? null : finish - detail.machineStartedAt
  return <RunningRing label={washer} minutes={Math.max(1, Math.ceil((finish - now - 1000) / 60_000))} remaining={total === null || total <= 0 ? 1 : (finish - now) / total}
    chips={[detail.cycle ? chemistryText.cycleName(detail.cycle).replace(/^./, (first) => first.toUpperCase()) : null, detail.doorLocks ? sessionText.doorLocked : null]}
    note={entered ? timerText.fromEntered(detail.cycleMinutes!) : undefined} />
}

/** The dryer's time, the same card: minutes left or "Time is up". */
export function DryTimer({ readyAt, now, drying = null }: { readyAt: number | null; now: number; drying?: Pick<NonNullable<Detail['drying']>, 'dryerName' | 'heatLabel' | 'minutes'> & { readonly startedAt?: number | null } | null }) {
  if (readyAt === null) return <TimeCard big={runningScreenText.drying} sub={sessionText.dryUnknown} />
  if (readyAt <= now) return <TimeCard big={runningScreenText.timeIsUp} sub="Check whether the pieces are dry" tone="drying" expired />
  const dryer = drying?.dryerName ?? sessionText.theDryer
  // The ring's whole is the set minutes, else the run so far; full only when neither is known.
  const total = drying?.minutes ? drying.minutes * 60_000 : drying?.startedAt == null ? null : readyAt - drying.startedAt
  return <RunningRing label={dryer} minutes={Math.max(1, Math.ceil((readyAt - now - 1000) / 60_000))}
    remaining={total === null || total <= 0 ? 1 : (readyAt - now) / total}
    chips={[drying?.heatLabel ?? null]} />
}

export function TimeCard({ big, sub, progress = null, tone = 'washing', expired = false, label }: { big: string; sub: string; progress?: number | null; tone?: 'washing' | 'drying'; expired?: boolean; label?: string }) {
  return (
    <section className="grid gap-3 rounded-card bg-card px-4 py-6 shadow-[var(--shadow-sm)]" aria-label={label ?? sessionText.doneTime}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex-none whitespace-nowrap text-[length:var(--step-4)] font-semibold leading-[1.1] tabular-nums" role="timer" aria-live="off">{big}</span>
        <span className="min-w-0 flex-1 ps-3 text-end text-[length:var(--step--1)] leading-[1.45] text-muted-foreground text-pretty">{sub}</span>
      </div>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{expired ? `${big}. ${sub}` : ''}</span>
      {progress === null ? null : (
        <div className="h-2 overflow-hidden rounded-[4px] bg-surface-2" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className={cn('laundry-timer-progress h-full motion-safe:[transition:width_600ms_linear]', tone === 'washing' ? 'bg-washing' : 'bg-hanging')} style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
    </section>
  )
}

/** A washer's own name, without the sample fixture's "pool" grouping word. */
export function washerName(name: string | null): string {
  return name === null ? sessionText.theWasher : name.replace(/ pool$/i, '')
}

/**
 * The step in hand as the block: "How full?" as pictures, a dose in XL with its slot and one Done
 * that records the planned amount, or a task with its one button. "Used a different amount", Skip
 * and "I missed it" fold into Step options; switching product and a machine problem are recovery.
 */
function MachineStep({ action, record, detail, facts, progress, dots, canRecord, online, outcome, onOutcome, onRefused, names, dryers, adviceTextiles, textileName, previous, recovery, pausedReason, minutes, onMinutesChange, hang }: {
  action: Action
  record: ReturnType<typeof useStepRecord>
  /** What the controller knows for this step's recovery group, and the sheets it opens. */
  recovery: StepRecoveryFacts
  pausedReason?: string
  minutes: string
  onMinutesChange: (value: string) => void
  dots?: readonly ('done' | 'current' | 'todo')[]
  /** The step before this one, in Preparation: Back goes here first. */
  previous?: { label: string; onClick: () => void }
  detail: Detail
  facts: MachineFacts
  progress: string
  /** False for the copy saved on this phone; the live load records even offline. */
  canRecord: boolean
  online: boolean
  outcome: FullnessOutcome | null
  onOutcome: (outcome: FullnessOutcome | null) => void
  onRefused: (reason: string | null) => void
  names: Parameters<typeof FullnessBlock>[0]['names']
  dryers: readonly Machine[] | null
  adviceTextiles: readonly Textile[]
  textileName: (textileId: string) => string
  /** Owned by the page: hanging runs after the load completes and MachineStep unmounts, so its error shows on the summary. */
  hang: ReturnType<typeof useConvexCall<typeof api.dryingQueue.hangWhileDryerBusy>>
}) {
  const choose = useConvexCall(api.execution.chooseDryer, chooseDryerLocally)
  // "None free" at the identical dryers: the wash moves to the drying queue, to hang or to wait there.
  const [noneFree, setNoneFree] = useState(false)
  const toQueue = useConvexCall(api.dryingQueue.queueFromWasher)
  const navigate = useNavigate()
  const recentDryers = useRecentMachines(detail.householdId).dryers
  const rackQueue = useQuery(api.dryingQueue.queue, noneFree ? { householdId: detail.householdId } : 'skip')
  const rackIsFull = rackQueue !== undefined && rackFull(dryingFacts(rackQueue))
  const startSoak = useConvexCall(api.actions.beginSoak)
  const [water, setWater] = useState('')
  const [temperature, setTemperature] = useState('')
  const [clock, setClock] = useState(Date.now())
  useEffect(() => { if (action.soakStarted === undefined) return; const interval = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(interval) }, [action.soakStarted?.at])
  const { system } = useUnits()
  const titleId = useId()
  const [mode, setMode] = useState<'idle' | 'amount' | 'skipped' | 'missed'>('idle')
  // Step options stay open across a sub-step, and Back returns focus to their trigger.
  const [optionsOpen, setOptionsOpen] = useState(false)
  const returnFocus = useRef(false)
  useEffect(() => {
    if (mode !== 'idle' || !returnFocus.current) return
    returnFocus.current = false
    document.getElementById(stepOptionsTriggerId(titleId))?.focus()
  }, [mode, titleId])
  const backToStep = () => { returnFocus.current = true; setMode('idle') }
  const unit = action.dose?.unit ?? 'ml'
  // The amount is typed in the unit this device shows and stored in the unit the label uses.
  const shownUnit = displayDose(1, unit, system).unit
  const [amount, setAmount] = useState(action.dose == null ? '' : String(displayDose(action.dose.amount, unit, system).amount))
  const partialMark = action.dose?.fractionOfMark !== undefined
  const [fillPercent, setFillPercent] = useState(String((action.dose?.fractionOfMark ?? 1) * 100))
  const [nativeTarget, setNativeTarget] = useState<'below' | 'just_below' | ''>(action.dose?.target ?? '')
  const actualFraction = Number(fillPercent) / 100
  const partialAmountValid = (!partialMark || Number.isInteger(Number(amount)) && Number(amount) >= 1 && Number(amount) <= 4 && actualFraction > 0 && actualFraction <= 1) && (nativeTarget === '' || Number(amount) === 1)
  // At Start in Preparation the design asks for the minutes the washer shows; the timer counts from them.
  const asksMinutes = dots !== undefined && action.kind === 'task' && action.task === 'start'
  const minutesValue = Number.parseInt(minutes, 10)
  const minutesOk = minutesValue > 0 && minutesValue <= 300
  const view = stepView(action, facts)
  // A queued offline tap may advance; only the same action waits for its own acknowledgment.
  const disabled = record.pendingActions.includes(action.id) || !canRecord || pausedReason !== undefined
  const sessionId = detail.sessionId

  if (action.kind === 'task' && action.task === 'garment_advice') return <StepBlock titleId={titleId} eyebrow="Optional preparation" title={action.title ?? 'Optional handling tip'} progress={progress} previous={previous}
    primary={{ label: 'Done', disabled, onClick: () => void record.run({ sessionId, actionId: action.id, status: 'confirmed' }) }}
    secondary={<Button type="button" variant="outline" className="whitespace-normal" disabled={disabled} onClick={() => void record.run({ sessionId, actionId: action.id, status: 'skipped' })}>Skip this tip</Button>}>
    {action.advice === undefined ? <Note>{action.detail}</Note> : <AdviceExplanation advice={action.advice} />}
    <GarmentList garments={action.garments ?? []} name={textileName} privatePieces={detail.textiles.filter((piece) => piece.private)} />
    {adviceTextiles.length === 0 || action.advice?.tipId.startsWith('pre_owned') ? null : <AdviceReminderControls textiles={adviceTextiles} disabled={!online || !canRecord} />}
  </StepBlock>

  if (action.soak !== undefined && action.kind === 'treatment') {
    const label = action.soak
    const started = action.soakStarted
    const elapsed = started === undefined ? 0 : Math.max(0, clock - started.at)
    const overdue = elapsed > label.maximumMinutes * 60_000
    const ready = started !== undefined && elapsed >= label.minimumMinutes * 60_000 && !overdue
    const valid = Number(water) >= 0.1 && Number(water) <= 50 && temperature !== '' && Number(temperature) >= 0 && Number(temperature) <= label.maximumTemperatureC
    const amount = action.dose === null ? 0 : action.dose.amount * Number(water) / label.waterLitres
    return <StepBlock titleId={titleId} eyebrow="Preparation" title={`Soak ${textileName(action.textileId ?? '')}`} progress={progress} previous={previous}
      primary={{ label: started === undefined ? 'Start measured soak' : overdue ? 'Removed · needs review' : ready ? 'Removed and followed label directions' : 'Soaking', disabled: disabled || startSoak.pending || started === undefined && (!valid || !online) || started !== undefined && !ready && !overdue, onClick: () => {
        if (started === undefined) void startSoak.run({ sessionId, actionId: action.id, waterLitres: Number(water), temperatureC: Number(temperature) })
        else if (overdue) void record.run({ sessionId, actionId: action.id, status: 'missed', at: Date.now() })
        else if (action.dose !== null) void record.run({ sessionId, actionId: action.id, status: 'confirmed', usage: { supplyId: action.supplyId as Id<'supplies'>, amount: action.dose.amount, unit: action.dose.unit, placement: action.placement }, at: Date.now() })
      } }}
      secondary={started === undefined ? <Button variant="outline" onClick={() => void record.run({ sessionId, actionId: action.id, status: 'skipped', at: Date.now() })} disabled={disabled}>Leave this pretreatment out</Button> : undefined}>
      <p>{started?.productName ?? action.supplyName} · {label.minimumMinutes}–{label.maximumMinutes} minutes · up to {label.maximumTemperatureC}°C</p>
      <p>{started === undefined ? action.timing : `Recorded ${started.amount} ${action.dose?.unit} of ${started.productName}.`}</p>
      {started === undefined ? <div className="grid gap-3">
        <FieldLabel htmlFor={`${titleId}-water`}>Measured water (liters)</FieldLabel><Input id={`${titleId}-water`} type="number" inputMode="decimal" min="0.1" max="50" step="any" value={water} onChange={(event) => setWater(event.target.value)} />
        <FieldLabel htmlFor={`${titleId}-temperature`}>Measured water temperature (°C)</FieldLabel><Input id={`${titleId}-temperature`} type="number" inputMode="decimal" min="0" max={label.maximumTemperatureC} step="any" value={temperature} onChange={(event) => setTemperature(event.target.value)} />
        <p>{valid ? `Add ${Number(amount.toFixed(3))} ${action.dose?.unit} for ${water} L, then start the timer when the garment enters the solution.` : `Label basis: ${action.dose?.amount} ${action.dose?.unit} per ${label.waterLitres} L. Measure the container water first.`}</p>
        <p className="text-sm text-ink-2">Starting records this actual dose. Connect before starting; a timer cannot monitor the garment for you.</p>
      </div> : <p role="status">{started.waterLitres} L · {started.temperatureC}°C · {Math.floor(elapsed / 60_000)} minutes elapsed{overdue ? '. Maximum time passed: remove the garment as the label directs, inspect it and review before any further treatment.' : ready ? '. Ready to remove according to the label.' : ` · Ready after ${new Date(started.at + label.minimumMinutes * 60_000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}</p>}
      <strong>After soaking</strong><p>{label.transfer}</p>
      <ErrorNotice error={startSoak.error} />
    </StepBlock>
  }

  if (view.kind === 'fullness') {
    if (pausedReason !== undefined) return <StepBlock titleId={titleId} eyebrow={view.eyebrow} title={view.title} progress={progress} previous={previous}
      note={`Paused · ${pausedReason}`} primary={{ label: preparationText.doneNext, onClick: () => {}, disabled: true }} />
    const value = view.machine === 'dryer' ? detail.dryerFullness : detail.drumFullness
    return <FullnessBlock titleId={titleId} view={view} progress={progress} previous={previous} action={action} sessionId={sessionId} value={value} outcome={outcome} onOutcome={onOutcome} onRefused={onRefused} names={names} canRecord={canRecord} />
  }

  // "Which dryer?" comes first at the dryer, when there are identical dryers and nobody has said.
  const drying = detail.drying
  const dryerPending = detail.actions.some((entry) => entry.kind === 'task' && entry.task === 'dryer_start' && entry.status === 'pending')
  const siblings = drying !== null && drying.status === 'ready' && !drying.dryerChosen && dryerPending && isDryerPhase(action.phase) && dryers !== null
    ? dryerChoices(drying.dryerId, dryers)
    : []
  if (siblings.length > 0 && noneFree) {
    // "None free" (design 11): hang what may hang, or wait in the drying queue. The app never calls a dryer free.
    const queued = () => toQueue.run({ sessionId, at: Date.now() })
    const wait = () => void queued().then((done) => { if (done !== undefined) void navigate({ to: '/drying' }) })
    // A rack still loading is unknown: neither choice until it is known, so Hang never shows for a full rack.
    const busy = toQueue.pending || hang.pending || !canRecord || !online || rackQueue === undefined
    return (
      <StepBlock titleId={titleId} eyebrow={sessionText.theDryer} machine="dryer" progress={progress} title={machineStepText.whichDryer} previous={previous}
        primary={rackIsFull ? { label: noDryerText.wait, disabled: busy, onClick: wait } : null}
        secondary={<Button type="button" variant="ghost" disabled={busy} onClick={() => setNoneFree(false)}>{noDryerText.pickOne}</Button>}>
        <Callout>{`${noDryerText.title}. ${rackIsFull ? noDryerText.rackFull : noDryerText.detail}`}</Callout>
        {rackIsFull ? null : <AnswerRow label={noDryerText.title} disabled={busy} answers={[
          { key: 'hang', label: dryerWaitText.hang, primary: true, onClick: () => void queued().then(async (done) => {
            if (done !== undefined && await hang.run({ householdId: detail.householdId, washSessionId: sessionId, at: Date.now() }) !== undefined) void navigate({ to: '/drying' })
          }) },
          { key: 'wait', label: noDryerText.wait, onClick: wait },
        ]} />}
        <TrialNote>{dryerWaitTrialText.rack}</TrialNote>
        <ErrorNotice error={toQueue.error ?? hang.error} />
      </StepBlock>
    )
  }
  if (siblings.length > 0) {
    // A shared room can have dozens of identical dryers: type the number, with the few used last as shortcuts.
    const shared = siblings.every((dryer) => dryer.location === 'shared')
    return (
      <StepBlock titleId={titleId} eyebrow={sessionText.theDryer} machine="dryer" progress={progress} title={machineStepText.whichDryer} previous={previous}
        secondary={<Button type="button" variant="ghost" disabled={choose.pending || !canRecord} onClick={() => setNoneFree(true)}>{noDryerText.noneFree}</Button>}>
        {shared
          ? <MachineEntry id="session-dryer-label" words={dryerEntryWords} shared options={siblings.map((dryer) => ({ machineId: dryer.machineId as string, name: dryer.name }))} recent={recentDryers} pending={choose.pending || !canRecord}
            onPick={(dryerId) => void choose.run({ sessionId, dryerId: dryerId as Id<'machines'> })} />
          : <>
            <p className={machineStepNoteClassName}>{sessionText.tapDryerNumber}</p>
            <WhichDryer dryers={siblings} current={null} pending={choose.pending || !canRecord} onPick={(dryerId) => void choose.run({ sessionId, dryerId: dryerId as Id<'machines'> })} />
          </>}
        <ErrorNotice error={choose.error} />
      </StepBlock>
    )
  }

  const confirm = () => {
    // The phone's own time goes with each step: a tap queued with no signal keeps when it was done.
    const at = Date.now()
    if (asksMinutes) return void record.run({ sessionId, actionId: action.id, status: 'confirmed', at, minutes: minutesValue })
    if (action.kind === 'task' || action.reusable === true) return void record.run({ sessionId, actionId: action.id, status: 'confirmed', at })
    const dose = action.dose
    if (dose === null) return
    void record.run({ sessionId, actionId: action.id, status: 'confirmed', usage: { supplyId: action.supplyId as Id<'supplies'>, amount: dose.amount, unit: dose.unit, ...(dose.mark ? { mark: dose.mark } : {}), ...(dose.fractionOfMark === undefined ? {} : { fractionOfMark: dose.fractionOfMark }), ...(dose.target === undefined ? {} : { target: dose.target }), ...(dose.approximate === undefined ? {} : { approximate: dose.approximate }), placement: action.placement }, at })
  }

  if (mode === 'amount' && action.kind === 'treatment') {
    return (
      <StepBlock titleId={titleId} eyebrow={view.eyebrow} machine={view.machine} progress={progress} title={view.title}>
        <form className={amountFormClassName} onSubmit={(event) => {
          event.preventDefault()
          const mark = action.dose?.mark
          if (!partialAmountValid) return
          void record.run({ sessionId, actionId: action.id, status: 'confirmed', usage: { supplyId: action.supplyId as Id<'supplies'>, amount: storedAmount(Number(amount), unit, system), unit, ...(mark ? { mark } : {}), ...(partialMark ? { fractionOfMark: actualFraction } : {}), ...(nativeTarget === '' ? {} : { target: nativeTarget }), ...(action.dose?.approximate === undefined ? {} : { approximate: action.dose.approximate }), placement: action.placement }, at: Date.now() })
        }}>
          <FieldLabel htmlFor={`amount-${action.id}`} className={fieldLabelClassName}>{partialMark ? 'Number of fills' : action.dose?.mark ? sessionText.timesFilled(action.dose.mark) : sessionText.amountAdded(shownUnit)}</FieldLabel>
          <div className={amountInputClassName}>
            <Input id={`amount-${action.id}`} type="number" inputMode="decimal" enterKeyHint="done" min={partialMark ? '1' : '0.01'} max={partialMark ? '4' : undefined} step={partialMark ? '1' : 'any'} value={amount} onChange={(event) => setAmount(event.target.value)} required autoFocus />
            {action.dose?.mark ? null : <span aria-hidden="true">{shownUnit}</span>}
          </div>
          {partialMark ? <>
            <FieldLabel htmlFor={`fill-level-${action.id}`} className={fieldLabelClassName}>Fill level (% of {action.dose?.mark})</FieldLabel>
            <Input id={`fill-level-${action.id}`} type="number" inputMode="decimal" min="0.000001" max="100" step="any" value={fillPercent} onChange={(event) => setFillPercent(event.target.value)} required />
            <p>100% means the printed mark.</p>
          </> : null}
          {action.dose?.target === undefined ? null : <><FieldLabel htmlFor={`native-fill-${action.id}`} className={fieldLabelClassName}>Actual fill level</FieldLabel><NativeSelect id={`native-fill-${action.id}`} value={nativeTarget} onChange={(event) => setNativeTarget(event.target.value as typeof nativeTarget)}><option value="below">Below {action.dose.mark}</option><option value="just_below">Just below {action.dose.mark}</option><option value="">To the printed {action.dose.mark} mark</option></NativeSelect><p>Qualitative levels do not establish a numerical fraction or volume.</p></>}
          <div className={cn(actionsClassName, splitClassName)}>
            <Button className={largeClassName} type="submit" disabled={disabled || !partialAmountValid}>{sessionText.save}</Button>
            <Button variant="outline" type="button" onClick={backToStep}>{sessionText.back}</Button>
          </div>
        </form>
      </StepBlock>
    )
  }

  if (mode === 'skipped' || mode === 'missed') {
    return (
      <StepBlock titleId={titleId} eyebrow={view.eyebrow} machine={view.machine} progress={progress} title={mode === 'skipped' ? sessionText.skipTitle(view.title) : sessionText.missedTitle(view.title)}
        previous={previous}
        primary={{ label: mode === 'skipped' ? sessionText.confirmSkipped : sessionText.confirmMissed, onClick: () => void record.run({ sessionId, actionId: action.id, status: mode, at: Date.now() }), disabled }}
        secondary={<Button variant="unstyled" size="unstyled" className={secondaryButtonClassName} type="button" onClick={backToStep}>{sessionText.back}</Button>}
      />
    )
  }

  const eligible = stepActions(action, { ...recovery, paused: pausedReason !== undefined, readOnly: !canRecord })
  const optionModes = { amount: 'amount', skip: 'skipped', missed: 'missed' } as const
  const options = eligible.options.map((key): StepChoice => ({ key, label: stepOptionLabels[key], disabled, onClick: () => setMode(optionModes[key]) }))
  const recoveryChoices = eligible.recovery.map((key): StepChoice => ({ key, label: stepRecoveryLabels[key], onClick: key === 'switch' ? recovery.onSwitchProduct : recovery.onMachineProblem }))
  return (
    <MachineStepPresenter
      titleId={titleId}
      action={action}
      facts={facts}
      progress={progress}
      previous={previous}
      note={pausedReason === undefined ? asksMinutes && !minutesOk ? minutes === '' ? preparationText.enterMinutes : undefined : view.kind === 'task' && action.task === 'start' ? preparationText.timerNote : undefined : `Paused · ${pausedReason}`}
      primary={{ label: dots !== undefined && !(action.kind === 'task' && action.task === 'start') ? preparationText.doneNext : view.primary, onClick: confirm, disabled: disabled || (asksMinutes && !minutesOk) || (action.kind === 'treatment' && action.reusable !== true && action.dose === null) }}
      options={options}
      recovery={recoveryChoices}
      optionsOpen={optionsOpen}
      onOptionsOpenChange={setOptionsOpen}
      canRecord={canRecord}
      error={null}
      textileName={textileName}
      privatePieces={detail.textiles.filter((piece) => piece.private)}
      minutesField={asksMinutes ? <StartMinutesField washer={facts.washerName} value={minutes} onChange={onMinutesChange} /> : undefined}
    />
  )
}

export function StartMinutesField({ washer, value, onChange }: { washer: string; value: string; onChange: (value: string) => void }) {
  const fieldId = useId()
  const fieldRef = useRef<HTMLDivElement>(null)
  const invalid = value !== '' && (!Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 300)
  useEffect(() => {
    let frame = 0
    const keepVisible = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const field = fieldRef.current
        if (field === null || !field.contains(document.activeElement)) return
        const viewport = window.visualViewport
        const top = (viewport?.offsetTop ?? 0) + 16
        const viewportBottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight)
        const footer = field.closest('.machine-screen')?.querySelector('[data-slot="task-footer"]')?.getBoundingClientRect()
        const bottom = Math.min(viewportBottom, footer?.top ?? viewportBottom) - 16
        const bounds = field.getBoundingClientRect()
        const delta = bounds.bottom > bottom ? bounds.bottom - bottom : bounds.top < top ? bounds.top - top : 0
        if (delta !== 0) window.scrollBy({ top: delta, behavior: 'instant' })
      })
    }
    const field = fieldRef.current
    field?.addEventListener('focusin', keepVisible)
    window.addEventListener('resize', keepVisible)
    window.visualViewport?.addEventListener('resize', keepVisible)
    keepVisible()
    return () => {
      cancelAnimationFrame(frame)
      field?.removeEventListener('focusin', keepVisible)
      window.removeEventListener('resize', keepVisible)
      window.visualViewport?.removeEventListener('resize', keepVisible)
    }
  }, [invalid])
  return <div ref={fieldRef} className="grid gap-1.5">
    <label htmlFor={fieldId} className="text-[length:var(--step-0)] font-semibold">{preparationText.minutesShown(washer)}</label>
    <Input id={fieldId} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${fieldId}-error` : undefined} inputMode="numeric" enterKeyHint="done" value={value} onChange={(event) => onChange(event.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
      className="min-h-12 rounded-[14px] bg-background px-3.5 text-[1.25rem] font-semibold" />
    {invalid ? <div id={`${fieldId}-error`}><ErrorNotice error={preparationText.minutesRange} /></div> : null}
  </div>
}

/** A departure from the planned step, folded into "Step options". */
export type StepOption = 'amount' | 'skip' | 'missed'
/** A way out when something is wrong at the machine, in the "Something wrong?" group. */
export type StepRecovery = 'switch' | 'problem'

export const stepOptionLabels: Readonly<Record<StepOption, string>> = { amount: sessionText.differentAmount, skip: sessionText.skip, missed: sessionText.missed }
export const stepRecoveryLabels: Readonly<Record<StepRecovery, string>> = { switch: detergentText.stepPill, problem: sessionText.machineProblem }

/** The controller's facts for a step's recovery group, with the sheets it opens. */
export type StepRecoveryFacts = {
  readonly preparing: boolean
  readonly isDetergent: boolean
  readonly hasLoad: boolean
  readonly onSwitchProduct: () => void
  readonly onMachineProblem: () => void
}

/**
 * Which options and recovery a step offers. Options: a different amount for a measured treatment,
 * Skip for a treatment or a dryer step, "I missed it" for a mid-cycle treatment; none while paused.
 * Recovery, only while preparing and recording: switching product on a detergent step of a planned
 * load, and a machine problem at loading, Start and wash or rinse treatments. Read-only copies keep
 * their options visible (disabled by the caller) and lose recovery.
 */
export function stepActions(
  action: Pick<Action, 'kind' | 'task' | 'phase' | 'stage' | 'reusable'>,
  { paused, readOnly, preparing, isDetergent, hasLoad }: { paused: boolean; readOnly: boolean; preparing: boolean; isDetergent: boolean; hasLoad: boolean },
): { options: StepOption[]; recovery: StepRecovery[] } {
  const options: StepOption[] = []
  if (!paused && action.kind === 'treatment' && action.reusable !== true) options.push('amount')
  if (!paused && (action.kind === 'treatment' || isDryerPhase(action.phase))) options.push('skip')
  if (!paused && action.kind === 'treatment' && action.phase === 'cycle') options.push('missed')
  const recovery: StepRecovery[] = []
  if (!readOnly && preparing && problemStep(action)) {
    if (action.kind === 'treatment' && isDetergent && hasLoad) recovery.push('switch')
    recovery.push('problem')
  }
  return { options, recovery }
}

/** Shared step presentation; recording, recovery and minute-entry dependencies stay with the caller. */
export function MachineStepPresenter({ action, facts, titleId, progress, previous, primary, options, recovery, optionsOpen, onOptionsOpenChange, note, minutesField, canRecord, error, textileName, privatePieces, rememberExplanation = true }: {
  action: Action
  facts: MachineFacts
  titleId: string
  progress: string
  previous?: { label: string; onClick: () => void }
  primary: { label: string; onClick: () => void; disabled?: boolean }
  options?: readonly StepChoice[]
  recovery?: readonly StepChoice[]
  optionsOpen?: boolean
  onOptionsOpenChange?: (open: boolean) => void
  note?: ReactNode
  minutesField?: ReactNode
  canRecord: boolean
  error: string | null
  textileName: (textileId: string) => string
  privatePieces?: readonly PrivatePiece[]
  rememberExplanation?: boolean
}) {
  const { system } = useUnits()
  const view = stepView(action, facts)
  const pouring = action.kind === 'treatment' && action.textileId === undefined && action.phase === 'drum'
    && action.placement === 'direct_to_drum' && action.dose !== null
    && ['ml', 'mL', 'l', 'L', 'tsp', 'tbsp', 'fl_oz'].includes(action.dose.unit)
  const title = pouring ? preparationText.pourIntoEmptyDrum(formatDose(action.dose!.amount, action.dose!.unit, system)) : view.title
  const instructionNote = minutesField != null && action.task === 'start' ? action.detail : view.note
  const readableNote = action.task === 'start' && instructionNote ? instructionNote[0]!.toUpperCase() + instructionNote.slice(1) : instructionNote
  // The cap, drawn only from its recorded marks and filled to the planned one, is the step's picture.
  const cap = view.kind === 'dose' && action.dose !== null && action.dose.marks?.length && action.dose.mark ? action.dose : null
  return (
    <StepBlock titleId={titleId} eyebrow={view.eyebrow} machine={view.machine} progress={progress}
      picture={cap === null ? undefined : <Cup amount={cap.amount} unit={cap.unit} marks={cap.marks} mark={cap.mark} />}
      title={localizeTemperatures(title, system)} previous={previous} note={note} primary={primary}
      options={options} recovery={recovery} optionsOpen={optionsOpen} onOptionsOpenChange={onOptionsOpenChange}>
      {pouring && action.supplyName !== null ? <p className={machineStepNoteClassName}>{action.supplyName}</p> : null}
      {view.kind === 'dose' ? <DoseBody action={action} slot={pouring ? null : view.note} doorLocks={facts.doorLocks} rememberExplanation={rememberExplanation} showCup={cap === null} /> : null}
      {view.figure === null || minutesField != null ? null : <p className={machineStepFigureClassName}>{view.figure}</p>}
      {view.kind === 'task' && action.advice !== undefined ? <AdviceExplanation advice={action.advice} /> : view.kind === 'task' && readableNote != null ? <p className={machineStepNoteClassName}>{localizeTemperatures(readableNote, system)}</p> : null}
      {minutesField}
      {/* The garments themselves are listed under the step, in "Going into". */}
      {action.kind === 'task' && (action.task === 'hold_out' || action.task === 'dryer_load') ? <GarmentList garments={action.garments ?? []} name={textileName} privatePieces={privatePieces} /> : null}
      {canRecord ? null : <p className={machineStepNoteClassName}>{sessionText.reconnect}</p>}
      <ErrorNotice error={error} />
    </StepBlock>
  )
}

const recordedStamp: Record<Action['status'], string> = { pending: '', confirmed: preparationText.doneStamp, skipped: preparationText.skippedStamp, missed: preparationText.missedStamp }

/**
 * An earlier Preparation step, looked at again by swiping. It is already recorded, so it is shown as
 * it was and only moves on; nothing here records the step a second time.
 */
export function ReviewStep({ action: plannedAction, actualUsage, facts, progress, drumFullness, previous, onNext, rememberExplanation = true }: {
  action: Action
  actualUsage?: Pick<Detail['usage'][number], 'amount' | 'unit' | 'mark' | 'fractionOfMark' | 'target' | 'approximate'>
  facts: MachineFacts
  progress: string
  drumFullness: Detail['drumFullness']
  previous?: { label: string; onClick: () => void }
  onNext: () => void
  rememberExplanation?: boolean
}) {
  const titleId = useId()
  const { system } = useUnits()
  const action = plannedAction.kind !== 'treatment' || actualUsage === undefined ? plannedAction : { ...plannedAction, dose: {
    amount: actualUsage.amount, unit: actualUsage.unit, mark: actualUsage.mark,
    ...(actualUsage.fractionOfMark === undefined ? {} : { fractionOfMark: actualUsage.fractionOfMark }),
    ...(actualUsage.target === undefined ? {} : { target: actualUsage.target }),
    ...(actualUsage.approximate === undefined ? {} : { approximate: actualUsage.approximate }),
  } }
  const view = stepView(action, facts)
  return (
    <StepBlock titleId={titleId} eyebrow={view.eyebrow} machine={view.machine} progress={progress} title={localizeTemperatures(view.title, system)} previous={previous} nextRecorded={onNext} primary={{ label: preparationText.nextStep, onClick: onNext }}>
      <p className={machineStepNoteClassName}><StatusBadge tone={action.status === 'confirmed' ? 'good' : 'neutral'}>{recordedStamp[action.status]}</StatusBadge></p>
      {view.kind === 'dose' ? <DoseBody action={action} slot={view.note} doorLocks={facts.doorLocks} rememberExplanation={rememberExplanation} /> : null}
      {view.kind === 'fullness' && drumFullness !== null ? <p className={machineStepNoteClassName}>{preparationText.drumWas(loadSizeWords[drumFullness])}</p> : null}
      {view.kind === 'task' && action.advice !== undefined ? <AdviceExplanation advice={action.advice} /> : view.kind === 'task' && view.note !== null ? <p className={machineStepNoteClassName}>{localizeTemperatures(view.note, system)}</p> : null}
    </StepBlock>
  )
}

/**
 * What to add by hand during the cycle, only where the product record says when. A reminder is
 * promised only when the record gives a time; otherwise the step waits for the person to look.
 */
function ByHandCard({ actions, now }: { actions: readonly Action[]; now: number }) {
  const { system } = useUnits()
  const steps = byHandActions<ChemistryAction & Action>(actions)
  if (steps.length === 0) return null
  const rows = chemistryGroups(steps, false).flatMap((group) => group.rows)
  return (
    <Section heading={runningText.byHand}>
      {rows.map((row) => {
        const step = steps.find((entry) => entry.id === row.id)!
        const due = byHandDue(step)
        const fact = [
          row.amount.kind === 'dose' ? doseParts(row.amount.dose, system).spoken : chemistryText.notRecorded,
          row.when === null ? null : chemistryText.when(row.when),
          row.done ? null : due !== null && (dueTime(step) ?? Infinity) <= now ? sessionText.dueNow : due ?? row.reminder,
        ].filter((part): part is string => part !== null).join(' · ')
        return <RecordRow key={row.id} media={<DesignIcon name="drop" size="1em" strokeWidth={2.2}  />} title={row.product} fact={fact}
          mark={row.done ? { tone: step.status === 'confirmed' ? 'done' : 'waiting', text: step.status === 'confirmed' ? runningText.byHandDone : runningText.byHandLeftOut } : undefined} />
      })}
    </Section>
  )
}

/** The last synced copy of a running load, read-only until the connection returns. */
export function OfflineSessionView({ projection }: { projection: SessionProjection }) {
  const now = useNow(1000)
  // Ids in the saved copy came from the server; nothing is sent back until the connection returns.
  const detail: Detail = {
    cycle: '',
    drumFullness: null,
    dryerFullness: null,
    sessionId: projection.sessionId as Id<'sessions'>,
    householdId: projection.householdId as Id<'households'>,
    planId: '' as Id<'plans'>,
    loadId: null,
    planInputHash: null,
    idempotencyKey: '',
    status: 'running',
    revision: projection.revision,
    machineName: projection.machineName,
    startedAt: projection.startedAt,
    completedAt: null,
    putAwayAt: null,
    loadName: null,
    loadNumber: null,
    loadCount: null,
    machineStartedAt: projection.machineStartedAt,
    cycleMinutes: projection.cycleMinutes,
    doorLocks: projection.doorLocks,
    estimatedFinishAt: projection.estimatedFinishAt,
    finishConfidence: projection.finishConfidence as Detail['finishConfidence'],
    washFinishedAt: null,
    dryerStartedAt: null,
    estimatedDoneAt: projection.estimatedFinishAt,
    drying: null,
    textiles: projection.textiles.map((textile) => ({ ...textile, textileId: textile.textileId as Id<'textiles'>, color: null, status: null, washCount: null })),
    actions: projection.actions.map((action) => ({
      id: action.id,
      kind: action.kind,
      task: action.task,
      phase: action.phase ?? 'dispenser',
      order: action.order,
      title: action.title,
      detail: action.detail,
      ...(action.advice === undefined ? {} : { advice: action.advice }),
      garments: action.garments.map((garment) => ({ textileId: garment.textileId as Id<'textiles'>, ...(garment.method === null ? {} : { method: garment.method }) })),
      supplyId: '',
      supplyName: action.supplyName,
      ...(action.textileId == null ? {} : { textileId: action.textileId, textileName: action.textileName ?? undefined, temperatureC: action.temperatureC }),
      dose: action.dose,
      ...(action.soak === undefined ? {} : { soak: action.soak, soakStarted: action.soakStarted }),
      stage: action.stage ?? '',
      placement: action.placement ?? '',
      timing: action.timing,
      ...(action.dueAt === null ? {} : { dueAt: action.dueAt }),
      confidence: 'unknown',
      status: action.status as Action['status'],
    })),
    reminders: [],
    usage: [],
  }
  return <SessionView detail={detail} now={now} online={false} savedAt={projection.savedAt} />
}
