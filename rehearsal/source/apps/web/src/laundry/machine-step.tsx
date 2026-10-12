import { Button, buttonVariants } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import { cn } from '@/lib/utils'
import type { LoadSize } from '@washcloset/planner'
import type { OptimisticLocalStore } from 'convex/browser'
import { useMutation } from 'convex/react'
import type { FunctionArgs } from 'convex/server'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

import type { Id } from '@convex/_generated/dataModel'
import { api } from '@/api'
import { bottleUseWords, countWord, cycleWord, fullnessText, machineStepText } from '@/copy'
import { FullnessPictures, MachineQuestionCard, machineAnswer, waitingQuestions, type FullnessMachine, type FullnessStep, type MachineAction, type MachineCalls, type MachineProduct } from '@/laundry/fullness-step'
import type { Machine, Supply } from '@/household/inventory-types'
import { machineGroups, machineNumber } from '@/household/machine-sheet'
import { TrialNote } from '@/laundry/laundry-ui'
import { trialText } from '@/copy-trial'
import { TaskFooter } from '@/kit/task-footer'
import { DesignIcon, type IconName } from '@/kit/design-icons'
import { Sheet } from '@/kit/sheet'
import { Cup, DoseFigure, ErrorNotice, dryerHeatLabels, errorMessage, holdOutLabels, slotName } from '@/kit/ui'
import { markWhySeen, whyKey, whyLine } from '@/laundry/why-lines'
import { preparationText } from '@/copy-laundry'
import { stageWords } from '@/copy-run'
import { PrivatePieceRows, type PrivatePiece } from '@/laundry/private-piece'

/**
 * At the machine, the step in hand is the block: one thing to do, printed large, with one button
 * that records it. The order is the server's physical order (in, how full, the dose, the door,
 * Start; then the dryer), and every word here comes from the load's own record: nothing is guessed.
 */

/** What the block needs from a step: the server's step with its dose, task and garments. */
const machineStepClassName = cn(
  "machine-step",
  "grid min-w-0 grid-cols-1 gap-3.5 text-ink [overflow-wrap:anywhere]",
)

const machineStepEyebrowClassName = cn(
  "machine-step-eyebrow",
  "m-0 flex justify-between gap-3 font-semibold text-ink-2",
  "text-[length:var(--step-0)]",
)

const machineStepEyebrowLabelClassName = cn(
  "machine-step-eyebrow-label",
  "inline-flex items-center gap-2",
)

const machineStepTitleClassName = cn(
  "machine-step-title",
  "m-0 font-text font-semibold leading-[1.15] tracking-[-.01em] text-balance",
  "text-[length:var(--step-4)]",
)

const machineStepQuestionClassName = cn(
  "machine-step-question",
  "grid gap-3",
)

/** A single quiet action on a step (leave it out, Back from a confirmation), drawn as a pill. */
export const secondaryButtonClassName = cn(
  buttonVariants({ variant: 'outline', size: 'sm' }),
  "min-h-11 rounded-control px-3.5 text-[length:.875rem] font-semibold",
  "[&.danger]:text-destructive",
)

/** The step's one quiet way out: a row you tap, never a stack of buttons. */
const stepDifferentClassName = cn(
  "step-different",
  "flex min-h-11 w-fit max-w-full items-center gap-2 rounded-control text-start font-medium text-link",
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring",
  "text-[length:var(--step-0)]",
)

/** The step's picture (a cap filled to its line): the one card on a step screen. */
const stepPictureClassName = cn(
  "step-picture",
  "grid min-h-56 place-items-center rounded-[28px] bg-surface shadow-[var(--e1)]",
  "[&_svg]:h-44 [&_svg]:w-auto",
)

const machineStepNoteClassName = cn(
  "machine-step-note",
  "m-0 text-ink leading-[1.5]",
  "text-[length:var(--step-0)]",
)

/** The explanation is a quiet link under the instruction, not a peer of the step's actions. */
const machineStepWhyTriggerClassName = cn(
  "machine-step-why-trigger",
  "inline-flex min-h-11 items-center gap-2 rounded-control font-medium text-link",
  "text-[length:var(--step-0)]",
  "cursor-pointer focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring",
)

const machineStepWhyTextClassName = cn(
  "machine-step-why-text",
  "m-[0_0_var(--space-2)] text-ink-2",
  "text-[length:var(--step-0)]",
)

const machineStepWhySourceClassName = cn(
  "machine-step-why-source",
  "[font-style:italic]",
)

const machineStepDoseClassName = cn(
  "machine-step-dose",
  "grid gap-2",
)

export const machineTilesClassName = cn(
  "machine-tiles",
  "grid grid-cols-[repeat(auto-fill,_minmax(5rem,_1fr))] gap-3",
)

export const machineTileClassName = cn(
  "machine-tile",
  "grid place-items-center min-h-[5.5rem] border-0 rounded-label cursor-[pointer] select-none",
  "[background:var(--accent-fill)]",
  "[color:var(--on-accent)]",
  "[font:inherit]",
  "[touch-action:manipulation]",
  "[-webkit-user-select:none]",
  "[-webkit-touch-callout:none]",
  "[&:disabled]:opacity-[1] [&:disabled]:text-ink-2 [&:disabled]:cursor-[default]",
  "[&:disabled]:[background:var(--fill-2)]",
  "[&:focus-visible]:[outline:3px_solid_var(--focus)]",
  "[&:focus-visible]:[outline-offset:3px]",
  "motion-safe:[transition:transform_120ms_var(--ease-out)]",
  "motion-safe:[&:active:not(:disabled)]:[transform:scale(0.97)]",
)

const machineTileNumberClassName = cn(
  "machine-tile-number",
  "font-text font-extrabold leading-[1] tabular-nums",
  "text-[length:var(--figure-lg)]",
)

const machineStepGarmentsClassName = cn(
  "machine-step-garments",
  "grid gap-2 m-0 p-0",
  "[list-style:none]",
  "[&_li]:flex [&_li]:flex-wrap [&_li]:items-baseline [&_li]:gap-[0_var(--space-2)] [&_li]:font-semibold",
  "[&_li]:text-[length:var(--step-1)]",
  "[&_svg]:self-center",
  "[&_svg]:[color:var(--now-bg)]",
)

const machineStepMethodClassName = cn(
  "machine-step-method",
  "text-ink-2 font-medium",
)

export type MachineStepAction = {
  readonly id: string
  readonly kind: 'treatment' | 'task'
  readonly task?: string
  readonly phase: string
  readonly title?: string
  readonly detail?: string | null
  readonly supplyId: string
  readonly supplyName: string | null
  readonly textileId?: string
  readonly textileName?: string
  readonly temperatureC?: number | null
  readonly timing?: string | null
  readonly dose: { readonly amount: number; readonly unit: string; readonly mark?: string | null; readonly fractionOfMark?: number; readonly target?: 'below' | 'just_below'; readonly approximate?: boolean; readonly marks?: readonly string[]; readonly equivalent?: { readonly amount: number; readonly unit: string } | null } | null
  readonly placement: string
  /** The label's stage, for the "Why?" line only; not read anywhere else in this block. */
  readonly stage?: string
  readonly reusable?: boolean
  readonly atMachine?: { readonly machine: FullnessMachine; readonly candidates: readonly { readonly size: LoadSize; readonly rowText: string | null; readonly dose: { readonly amount: number; readonly unit: string; readonly mark?: string; readonly fractionOfMark?: number; readonly target?: 'below' | 'just_below'; readonly approximate?: boolean } }[] }
  readonly garments?: readonly { readonly textileId: string; readonly method?: string }[]
}

/** The load facts the words come from. */
export type MachineFacts = {
  readonly doorLocks: boolean
  readonly cycle: string | null
  readonly cycleMinutes: number | null
  readonly washerName: string
  /** Accepted start-step instructions, including the chosen temperature; never a current-machine default. */
  readonly preparationSettings?: string | null
  /** What a product is for ("detergent", "softener"), from the household's records; names the step's stage. */
  readonly productUse?: (supplyId: string) => string | null
  readonly drying: { readonly status: string; readonly dryerName: string | null; readonly heat: string | null; readonly heatLabel: string | null; readonly minutes: number | null } | null
}

/** The block's words for one step. `figure` is the big line (the heat, the minutes); null when none is on record. */
export type StepView = {
  readonly kind: 'fullness' | 'dose' | 'task'
  readonly machine: FullnessMachine
  readonly eyebrow: string
  readonly title: string
  readonly figure: string | null
  readonly note: string | null
  readonly primary: string
}

const isDryerStep = (phase: string) => phase.startsWith('dryer_') || phase === 'hold_out'

/** The eyebrow's small icon: which machine this step is at, echoing variant E's ActionBlock. */
const machineIcons: Record<FullnessMachine, IconName> = { washer: 'washer', dryer: 'wind' }

/** A dose that waits for how full the drum or dryer is, and has no amount yet. */
export function waitsForFullness(action: Pick<MachineStepAction, 'kind' | 'dose' | 'task'>): boolean {
  if (action.kind === 'task') return action.task === 'drum_fullness' || action.task === 'dryer_fullness'
  return action.dose?.unit === 'at_machine'
}

/**
 * The stage a step belongs to, after "Step n of N" on the card and above a row in Chemistry: the
 * design's words (Clothes, Door, Start, Detergent, Softener, Pretreat). A product is named by what
 * it is for when the record says; otherwise by where it goes. Empty when nothing fits.
 */
export function stageWord(
  action: Pick<MachineStepAction, 'kind' | 'task' | 'phase' | 'textileId' | 'supplyId'>,
  facts: Pick<MachineFacts, 'doorLocks' | 'productUse' | 'preparationSettings'>,
): string {
  if (action.kind === 'task') {
    switch (action.task) {
      case 'load': return stageWords.clothes
      case 'close': return facts.preparationSettings?.trim() ? stageWords.settings : facts.doorLocks ? stageWords.door : stageWords.lid
      case 'start': return stageWords.start
      case 'drum_fullness': return stageWords.drum
      case 'hold_out': return stageWords.hang
      case 'dryer_fullness':
      case 'dryer_load':
      case 'dryer_start':
      case 'dryer_unload': return stageWords.dryer
      default: return ''
    }
  }
  if (action.textileId !== undefined) return stageWords.pretreat
  const use = facts.productUse?.(action.supplyId) ?? null
  const named = use === null ? undefined : bottleUseWords[use as keyof typeof bottleUseWords]
  if (named !== undefined) return named
  switch (action.phase) {
    case 'drum': return stageWords.beforeClothes
    case 'with_load': return stageWords.onTopOfClothes
    case 'dispenser': return facts.doorLocks ? stageWords.drawer : stageWords.dispenser
    case 'cycle': return stageWords.duringCycle
    default: return isDryerStep(action.phase) ? stageWords.dryer : stageWords.product
  }
}

export function stepView(action: MachineStepAction, facts: MachineFacts): StepView {
  const dryer = isDryerStep(action.phase)
  const machine: FullnessMachine = action.atMachine?.machine ?? (dryer ? 'dryer' : 'washer')
  const eyebrow = stageWord(action, facts)
  const base = { machine, eyebrow, figure: null, note: null }
  if (waitsForFullness(action)) {
    const before = action.kind === 'treatment' && action.phase === 'drum'
    return { ...base, kind: 'fullness', title: machine === 'dryer' ? fullnessText.dryerQuestion : before ? fullnessText.beforeQuestion : fullnessText.drumQuestion, note: action.kind === 'treatment' ? action.supplyName : null, primary: '' }
  }
  if (action.kind === 'treatment') {
    if (action.textileId !== undefined) return { ...base, kind: 'dose', title: action.supplyName ?? machineStepText.thisProduct, note: `Apply to ${action.textileName ?? 'this garment'} before loading`, primary: machineStepText.done }
    return { ...base, kind: 'dose', title: action.supplyName ?? machineStepText.thisProduct, note: slotName(action.placement, facts.doorLocks), primary: machineStepText.done }
  }
  const garments = action.garments?.length ?? 0
  switch (action.task) {
    case 'load':
      return { ...base, kind: 'task', title: machineStepText.putClothesIn, note: action.title ?? null, primary: machineStepText.clothesIn }
    case 'close': {
      const settings = facts.preparationSettings?.trim()
      return settings ? { ...base, kind: 'task', title: preparationText.chooseSettings(settings[0]!.toUpperCase() + settings.slice(1)),
        note: [preparationText.closeAfterSettings(facts.doorLocks), action.detail].filter(Boolean).join(' '), primary: preparationText.doneNext }
        : { ...base, kind: 'task', title: facts.doorLocks ? machineStepText.closeDoor : machineStepText.closeLid, note: action.detail ?? null, primary: facts.doorLocks ? machineStepText.doorClosed : machineStepText.lidClosed }
    }
    case 'start':
      return {
        ...base,
        kind: 'task',
        title: machineStepText.pressStart,
        figure: facts.cycleMinutes === null ? null : machineStepText.minutes(facts.cycleMinutes),
        note: [action.detail ?? cycleWord(facts.cycle), facts.cycleMinutes === null ? machineStepText.noCycleTime : null].filter((part) => part !== null).join(' · ') || null,
        primary: preparationText.ivStarted(facts.washerName),
      }
    case 'hold_out':
      return facts.drying?.status === 'ready'
        ? { ...base, kind: 'task', title: machineStepText.pullHangItems, note: machineStepText.staysOut(garments), primary: machineStepText.clothesOut }
        : { ...base, kind: 'task', title: machineStepText.takeAndHang, note: null, primary: machineStepText.hanging }
    case 'dryer_load':
      return { ...base, kind: 'task', title: machineStepText.intoDryer, note: countWord(garments, 'laundry item'), primary: machineStepText.clothesIn }
    case 'dryer_start': {
      const heat = facts.drying?.heatLabel ?? (facts.drying?.heat == null ? null : dryerHeatLabels[facts.drying.heat as keyof typeof dryerHeatLabels] ?? null)
      return { ...base, kind: 'task', title: machineStepText.startDryer, figure: heat, note: facts.drying?.minutes == null ? machineStepText.allDryHint : machineStepText.minutes(facts.drying.minutes), primary: machineStepText.dryerStarted }
    }
    case 'dryer_unload':
      return { ...base, kind: 'task', title: machineStepText.collectDryer, note: action.detail ?? null, primary: machineStepText.allDry }
    default:
      return { ...base, kind: 'task', title: action.title ?? machineStepText.nextStep, note: action.detail ?? null, primary: machineStepText.done }
  }
}

/**
 * The dryers the person may be at: the planned one and its identical siblings ("Dryer 1…4"). Empty
 * when there is only one, so "Which dryer?" is not asked.
 */
export function dryerChoices(plannedId: string | null, machines: readonly Machine[]): Machine[] {
  if (plannedId === null) return []
  const dryers = machines.filter((machine) => !machine.archived && machine.applianceType === 'tumble_dryer')
  const group = machineGroups(dryers).find((entry) => entry.machines.some((machine) => machine.machineId === plannedId))
  return group === undefined || group.machines.length < 2 ? [] : [...group.machines]
}

/** A product as the question cards need it, from `inventory.list`. */
export function machineProduct(supply: Supply): MachineProduct {
  return { supplyId: supply.supplyId, name: supply.name, use: supply.use, measure: supply.measure, hasRows: supply.rules.length > 0 }
}

/**
 * "How full" shows at once, so the step moves on with no signal: the fullness step is done, and a
 * dose with exactly one planned row at that size shows it. Anything else stays waiting until the
 * server, which reads the labels as they are now, answers.
 */
export function drumFullnessLocally(store: OptimisticLocalStore, args: FunctionArgs<typeof api.execution.recordDrumFullness>) {
  const query = { sessionId: args.sessionId }
  const detail = store.getQuery(api.execution.sessionDetail, query)
  if (detail === undefined) return
  const washer = args.machine === 'washer'
  const fullnessTask = washer ? 'drum_fullness' : 'dryer_fullness'
  const actions = detail.actions.map((action) => {
    if (action.kind === 'task') return action.task === fullnessTask && action.status === 'pending' ? { ...action, status: 'confirmed' as const } : action
    if (action.status !== 'pending' || action.atMachine?.machine !== args.machine) return action
    const { resolvedSize: _size, lineText: _line, ...waiting } = action.atMachine
    const fitting = waiting.candidates.filter((candidate) => candidate.size === args.size)
    const only = fitting.length === 1 ? fitting[0]! : null
    return only === null
      ? { ...action, dose: { amount: 0, unit: 'at_machine' }, atMachine: waiting }
      : { ...action, dose: only.dose, atMachine: { ...waiting, resolvedSize: args.size, ...(only.rowText === null ? {} : { lineText: only.rowText }) } }
  })
  store.setQuery(api.execution.sessionDetail, query, { ...detail, actions, timelineRevision: detail.timelineRevision + 1, ...(washer ? { drumFullness: args.size } : { dryerFullness: args.size }) })
}

// ---- Drawing it ------------------------------------------------------------------------

/**
 * The block itself: eyebrow, the step in big type and the body. Its one primary action, a quieter
 * previous step and the secondary links sit in the shared task footer, held above the page's foot.
 */
export function reviewSwipe(dx: number, dy: number): 'previous' | 'next' | null {
  return Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.5 ? (dx > 0 ? 'previous' : 'next') : null
}

/** A step option or recovery action: the caller supplies the handler, StepBlock draws the row. */
export type StepChoice = { readonly key: string; readonly label: string; readonly onClick: () => void; readonly disabled?: boolean }

/** The id of a step's "Step options" trigger, so a caller can return focus to it. */
export const stepOptionsTriggerId = (titleId: string) => `${titleId}-options`

/** What each choice shows beside its words: a symbol and one plain line. Keyed by the step's own choice keys. */
const choiceLooks: Readonly<Record<string, { readonly icon: ReactNode; readonly hint: string; readonly danger?: boolean }>> = {
  amount: { icon: <DesignIcon name="bottle" size={22} strokeWidth={1.6} />, hint: machineStepText.hints.amount },
  skip: { icon: <DesignIcon name="skip" strokeWidth={2.2} size={22} aria-hidden="true"  />, hint: machineStepText.hints.skip },
  missed: { icon: <DesignIcon name="clock" size={22} strokeWidth={1.6} />, hint: machineStepText.hints.missed },
  switch: { icon: <DesignIcon name="swap" strokeWidth={2.2} size={22} aria-hidden="true"  />, hint: machineStepText.hints.switch },
  problem: { icon: <DesignIcon name="washer" size={22} strokeWidth={1.6} />, hint: machineStepText.hints.problem, danger: true },
}

/** Every departure and recovery for a step as one list of symbol rows; each calls the same handler it always did. */
export function StepChoiceList({ choices, onPick }: { choices: readonly StepChoice[]; onPick: (choice: StepChoice) => void }) {
  const base = useId()
  return (
    <ul role="list" aria-label={machineStepText.somethingDifferent} className="m-0 list-none overflow-hidden rounded-[20px] bg-[var(--bg)] p-0">
      {choices.map((choice, index) => {
        const look = choiceLooks[choice.key]
        const hintId = `${base}-${choice.key}`
        return (
          <li key={choice.key} className={index > 0 ? '[border-block-start:1px_solid_var(--line)]' : undefined}>
            <Button variant="unstyled" size="unstyled" type="button" aria-label={choice.label} aria-describedby={look === undefined ? undefined : hintId} disabled={choice.disabled} onClick={() => onPick(choice)}
              className="flex min-h-16 w-full items-center gap-3.5 px-4 py-3.5 text-start text-ink disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-ring">
              {look === undefined ? null : <span className={cn('grid size-10 flex-none place-items-center rounded-[12px] bg-surface', look.danger === true ? 'text-destructive' : 'text-ink')} aria-hidden="true">{look.icon}</span>}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[length:1.0625rem] font-semibold" aria-hidden="true">{choice.label}</span>
                {look === undefined ? null : <span id={hintId} className="text-[length:var(--step--1)] text-ink-2">{look.hint}</span>}
              </span>
            </Button>
          </li>
        )
      })}
    </ul>
  )
}

/** One segment per step beside Back: done, the one in hand, still to come. */
export function StepProgress({ dots, label }: { dots: readonly ('done' | 'current' | 'todo')[]; label?: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      {label === undefined ? null : <span className="font-semibold text-ink-2 text-[length:var(--step--1)]">{label}</span>}
      <div className="grid min-w-[7.5rem] flex-1 gap-1" style={{ gridTemplateColumns: `repeat(${dots.length}, minmax(0, 1fr))` }} aria-hidden="true">
      {dots.map((dot, index) => <span key={index} className={cn('h-[5px] rounded-full [transition:background-color_var(--dur-step)]', dot === 'todo' ? 'bg-surface-3' : 'bg-[var(--sig)]')} />)}
      </div>
    </div>
  )
}

export function StepBlock({ titleId, eyebrow, progress, title, picture, children, primary, secondary, options, recovery, optionsOpen, onOptionsOpenChange, previous, nextRecorded, note }: {
  titleId: string
  /** The stage of the wash this step is (Clothes, Start, Detergent...), after "Step n of N". */
  eyebrow: string
  /** Which machine this step is at; kept for callers that name it, the card no longer draws an icon. */
  machine?: FullnessMachine
  progress?: string
  title: string
  /** The step's picture, when it has one (the cap filled to its line); the one card on the screen. */
  picture?: ReactNode
  children?: ReactNode
  primary?: { label: string; onClick: () => void; disabled?: boolean } | null
  /** One quiet action for this step (leave it out, Back), drawn as a pill inside the card. */
  secondary?: ReactNode
  /** Departures from the plan (a different amount, Skip, missed), listed in the "Something different?" sheet; omitted when empty. */
  options?: readonly StepChoice[]
  /** Recovery (switch product, machine problem), after the options in the same sheet; omitted when empty. */
  recovery?: readonly StepChoice[]
  /** Controls the "Something different?" sheet, so a caller can keep it in step with a sub-step. */
  optionsOpen?: boolean
  onOptionsOpenChange?: (open: boolean) => void
  /** Review navigation never records or undoes a step. */
  previous?: { label: string; onClick: () => void }
  nextRecorded?: () => void
  /** A line above the primary action, such as why it is unavailable. */
  note?: ReactNode
}) {
  const touch = useRef<{ x: number; y: number; id: number } | null>(null)
  const canReview = previous !== undefined || nextRecorded !== undefined
  const choices = [...(options ?? []), ...(recovery ?? [])]
  const [ownOpen, setOwnOpen] = useState(false)
  const open = choices.length > 0 && (optionsOpen ?? ownOpen)
  const setOpen = (next: boolean) => { setOwnOpen(next); onOptionsOpenChange?.(next) }
  const [step, total] = progress?.split(' of ').map(Number) ?? []
  const segments = step !== undefined && total !== undefined && Number.isInteger(step) && Number.isInteger(total) && step > 0 && step <= total && total <= 1000
    ? Array.from({ length: total }, (_, index): 'done' | 'current' | 'todo' => index + 1 < step ? 'done' : index + 1 === step ? 'current' : 'todo') : null
  return (
    <>
      <section className={cn(machineStepClassName, canReview && 'touch-pan-y')} aria-labelledby={titleId} aria-live="polite"
        tabIndex={canReview ? 0 : undefined} aria-describedby={canReview ? `${titleId}-review` : undefined}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return
          if (event.key === 'ArrowLeft' && previous !== undefined) { event.preventDefault(); previous.onClick() }
          if (event.key === 'ArrowRight' && nextRecorded !== undefined) { event.preventDefault(); nextRecorded() }
        }}
        onTouchStart={(event) => {
          touch.current = null
          if (!canReview || event.touches.length !== 1 || (event.target as Element).closest('button, a, input, select, textarea, [role="button"]')) return
          const first = event.touches[0]!
          touch.current = { x: first.clientX, y: first.clientY, id: first.identifier }
        }}
        onTouchCancel={() => { touch.current = null }}
        onTouchEnd={(event) => {
          const start = touch.current
          touch.current = null
          const end = Array.from(event.changedTouches).find((point) => point.identifier === start?.id)
          if (start === null || end === undefined) return
          const direction = reviewSwipe(end.clientX - start.x, end.clientY - start.y)
          if (direction === 'previous') previous?.onClick()
          if (direction === 'next') nextRecorded?.()
        }}>
        {segments === null ? null : <StepProgress dots={segments} label={`Step ${progress}`} />}
        {eyebrow === '' ? null : <p className={machineStepEyebrowClassName}><span>{segments !== null || progress === undefined ? eyebrow : `Step ${progress} · ${eyebrow}`}</span></p>}
        <h2 id={titleId} className={machineStepTitleClassName}>{title}</h2>
        {picture === undefined ? null : <div className={stepPictureClassName}>{picture}</div>}
        {children}
        {secondary == null && choices.length === 0 ? null : <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1">
        {secondary}
        {choices.length === 0 ? null : (
          <Button variant="unstyled" size="unstyled" type="button" id={stepOptionsTriggerId(titleId)} className={stepDifferentClassName} aria-haspopup="dialog" aria-expanded={open} onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); setOpen(true) }}>
            <DesignIcon name="sliders" size="1em" strokeWidth={1.6} className="size-[18px] flex-none" aria-hidden="true"  />
            <span className="flex-1">{machineStepText.somethingDifferent}</span>
          </Button>
        )}</div>}
        {canReview ? <p id={`${titleId}-review`} className="sr-only">Swipe to review recorded steps. Or focus this card and use the left and right arrow keys.</p> : null}
      </section>
      {open ? (
        <Sheet title={machineStepText.somethingDifferent} onClose={() => setOpen(false)}>
          <StepChoiceList choices={choices} onPick={(choice) => { setOpen(false); choice.onClick() }} />
        </Sheet>
      ) : null}
      {primary === null || primary === undefined ? null : (
        <TaskFooter note={note}>
          <Button type="button" size="lg" className="w-full" disabled={primary.disabled} onClick={primary.onClick}>
            {primary.label}
          </Button>
        </TaskFooter>
      )}
    </>
  )
}

/**
 * Sends a "How full?" answer without waiting: the step moves on at once. A refusal comes back
 * after the block that sent it has been swapped for the next step, so the reason goes to the
 * screen above it, which outlives the step.
 */
export async function answerFullness(call: () => Promise<{ readonly steps: readonly FullnessStep[] }>, on: {
  readonly answered: (steps: readonly FullnessStep[]) => void
  readonly refused: (reason: string | null) => void
}): Promise<void> {
  on.refused(null)
  let steps: readonly FullnessStep[]
  try {
    steps = (await call()).steps
  } catch (caught) {
    on.refused(errorMessage(caught))
    return
  }
  on.answered(steps)
}

/** What a fullness answer left, kept above the block so a question survives the step moving on. */
export type FullnessOutcome = { readonly machine: FullnessMachine; readonly size: LoadSize; readonly steps: readonly FullnessStep[] }

type Names = { readonly product: (supplyId: string) => MachineProduct | null; readonly machineName: (machineId: string) => string | null; readonly washerGroup: (machineId: string) => readonly string[] }

/**
 * How full, at the machine: the four pictures, and then, for a product whose label needs an answer at
 * that size, the same card as Make loads. A dose the server settles comes back on the step itself.
 */
export function FullnessBlock({ titleId, view, progress, previous, action, sessionId, value, outcome, onOutcome, onRefused, names, canRecord }: {
  titleId: string
  /** The step before this one: Back goes here first. */
  previous?: { label: string; onClick: () => void }
  view: StepView
  progress: string
  action: MachineStepAction
  sessionId: Id<'sessions'>
  value: LoadSize | null
  outcome: FullnessOutcome | null
  onOutcome: (outcome: FullnessOutcome | null) => void
  /** Why the server refused an answer; held by the screen, since this block is gone by then. */
  onRefused: (reason: string | null) => void
  names: Names
  /** False for the copy saved on this phone; the live load records even offline. */
  canRecord: boolean
}) {
  const recordDrumFullness = useMutation(api.execution.recordDrumFullness).withOptimisticUpdate(drumFullnessLocally)
  const answerLabelRow = useMutation(api.inventory.answerLabelRow)
  const updateMachine = useMutation(api.inventory.updateMachine)
  const recordAction = useMutation(api.actions.recordAction)
  const calls: MachineCalls = { recordDrumFullness, answerLabelRow, updateMachine, recordAction, washerGroup: names.washerGroup }
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const machine = view.machine
  const question = action.kind === 'treatment' && outcome !== null && outcome.machine === machine
    ? waitingQuestions(outcome.steps, machine, names).get(action.id) ?? null
    : null

  const run = async (work: () => Promise<void>) => {
    setPending(true)
    setError(null)
    try {
      await work()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setPending(false)
    }
  }
  // Not awaited: the answer shows at once and the step moves on; the server's reading of the labels
  // arrives when it answers, and an answer it refuses is put back with the reason.
  const pick = (size: LoadSize) => {
    setError(null)
    void answerFullness(() => recordDrumFullness({ sessionId, machine, size }), {
      answered: (steps) => onOutcome({ machine, size, steps }),
      refused: onRefused,
    })
  }
  const answer = (choice: MachineAction) => run(async () => {
    if (outcome === null) return
    const result = await machineAnswer(choice, { sessionId, actionId: action.id, machine, size: outcome.size, product: action.supplyName ?? machineStepText.thisProduct }, calls)
    if (result.steps !== null) onOutcome({ ...outcome, steps: result.steps })
    setNote(result.toast)
  })
  const skip = () => run(async () => {
    await recordAction({ sessionId, actionId: action.id, status: 'skipped', at: Date.now() })
  })

  if (question !== null && outcome !== null) {
    const questionIcon = machineIcons[view.machine]
    return (
      <div className={machineStepQuestionClassName}>
        <p className={machineStepEyebrowClassName}><span className={machineStepEyebrowLabelClassName}><DesignIcon name={questionIcon} size={16} strokeWidth={2.2} />{view.eyebrow === '' ? `Step ${progress}` : `Step ${progress} · ${view.eyebrow}`}</span></p>
        <MachineQuestionCard question={question} size={outcome.size} pending={pending || !canRecord} onAction={(choice) => void answer(choice)} />
        <ErrorNotice error={error} />
      </div>
    )
  }
  const lines = action.kind === 'treatment' && action.phase === 'drum'
    ? (action.atMachine?.candidates ?? []).map((candidate) => ({ size: candidate.size, dose: candidate.dose, rowText: candidate.rowText }))
    : []
  return (
    <StepBlock
      titleId={titleId}
      eyebrow={view.eyebrow}
      machine={view.machine}
      progress={progress}
      title={view.note ?? view.title}
      previous={previous}
      secondary={action.kind === 'treatment' ? <Button variant="unstyled" size="unstyled" type="button" className={secondaryButtonClassName} disabled={pending || !canRecord} onClick={() => void skip()}>{machineStepText.leaveOut}</Button> : undefined}
    >
      <FullnessPictures machine={machine} value={value} before={action.kind === 'treatment' && action.phase === 'drum'} lines={lines} pending={pending} readOnly={!canRecord} onPick={pick} />
      {note === null ? null : <p className={machineStepNoteClassName} role="status">{note}</p>}
      <ErrorNotice error={error} />
    </StepBlock>
  )
}

/**
 * One sourced placement/timing explanation in the existing sheet, opened only when asked.
 */
export function DoseWhy({ action, doorLocks = false, remember = true }: { action: MachineStepAction; doorLocks?: boolean; remember?: boolean }) {
  const key = whyKey(action.supplyId, doorLocks)
  const line = whyLine(action)
  const label = whyLabel(action)
  const [open, setOpen] = useState(false)
  useEffect(() => { if (remember && open) markWhySeen(key) }, [key, remember, open])
  if (line === null) return null
  return (
    <>
      <Button variant="unstyled" size="unstyled" className={machineStepWhyTriggerClassName} aria-haspopup="dialog" aria-expanded={open} onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); setOpen(true) }}><DesignIcon name="help" size={18} strokeWidth={1.6} aria-hidden="true" />{label}</Button>
      {open ? <Sheet title={label} onClose={() => setOpen(false)}>
        <p className={machineStepWhyTextClassName}>{line.text} <span className={machineStepWhySourceClassName}>{line.source}</span></p>
      </Sheet> : null}
    </>
  )
}

/**
 * What the "why" link is called: named by what it explains. Each why-line explains a place (the
 * empty drum before the clothes) or a moment (a rinse product mid-cycle), never the amount itself.
 */
export function whyLabel(action: Pick<MachineStepAction, 'placement' | 'phase'>): string {
  return action.placement === 'direct_to_drum' && action.phase === 'drum' ? machineStepText.whyHere : machineStepText.whyNow
}

/** The dose in hand: how much (from the product record), the cap line when it prints one, and where it goes. */
export function DoseBody({ action, slot, picture }: { action: MachineStepAction; slot: string | null; picture?: ReactNode }) {
  const dose = action.dose
  const cap = dose?.marks?.includes(dose.mark ?? '') && (dose.fractionOfMark ?? 1) === 1 && dose.target === undefined ? dose : null
  return (
    <div className={machineStepDoseClassName}>
      <div className="overflow-hidden rounded-card bg-surface shadow-[var(--e1)]">
        {cap ? <div className="machine-step-cap grid min-h-48 place-items-center p-4 [&_svg]:h-36 [&_svg]:w-auto"><Cup amount={cap.amount} unit={cap.unit} marks={cap.marks} mark={cap.mark} /></div> : picture}
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0 flex-1 basis-[9rem]">
            <p className="m-0 font-semibold leading-[1.35] text-[length:var(--step-0)]">{action.supplyName ?? machineStepText.thisProduct}</p>
            {slot === null ? null : <p className="m-0 mt-1 text-[length:var(--step--1)] leading-[1.45] text-ink-2">{slot}</p>}
          </div>
          {dose === null ? null : <div className="min-w-0 max-w-full tabular-nums [&_small]:ms-1"><DoseFigure dose={dose} /></div>}
        </div>
      </div>
      {action.textileId === undefined ? null : <div className="grid gap-2"><p className={machineStepNoteClassName}>{action.timing}</p>{action.temperatureC == null ? null : <p className={machineStepNoteClassName}>Use water at {action.temperatureC} °C or cooler.</p>}</div>}
      {action.dose === null || action.textileId !== undefined ? null : <TrialNote>{trialText.dose}</TrialNote>}
    </div>
  )
}

/** "Which dryer?": big numbered tiles, one per identical dryer. */
export function WhichDryer({ dryers, current, pending, onPick }: { dryers: readonly Machine[]; current: string | null; pending: boolean; onPick: (dryerId: string) => void }) {
  return (
    <div className={machineTilesClassName} role="group" aria-label={machineStepText.whichDryer}>
      {dryers.map((dryer, index) => (
        <Toggle key={dryer.machineId} type="button" className={machineTileClassName} aria-label={dryer.name} pressed={current === dryer.machineId} disabled={pending} onClick={() => onPick(dryer.machineId)}>
          <span className={machineTileNumberClassName} aria-hidden="true">{machineNumber(dryer.name, index)}</span>
        </Toggle>
      ))}
    </div>
  )
}

/**
 * The garments a step names, with how each one dries when it stays out. Indistinguishable pieces
 * (same words, same handling) read once with a count rather than once per piece.
 */
export function GarmentList({ garments, name, privatePieces = [] }: { garments: readonly { textileId: string; method?: string }[]; name: (textileId: string) => string; privatePieces?: readonly PrivatePiece[] }) {
  if (garments.length === 0) return null
  const hidden = privatePieces.filter((piece) => garments.some((garment) => garment.textileId === piece.textileId))
  const hiddenIds = new Set(hidden.map((piece) => piece.textileId))
  const rows = new Map<string, { textileId: string; label: string; method?: string; count: number }>()
  for (const garment of garments) {
    if (hiddenIds.has(garment.textileId)) continue
    const label = name(garment.textileId)
    const key = JSON.stringify([label, garment.method ?? null])
    const row = rows.get(key)
    if (row === undefined) rows.set(key, { textileId: garment.textileId, label, ...(garment.method === undefined ? {} : { method: garment.method }), count: 1 })
    else row.count += 1
  }
  return (
    <ul className={machineStepGarmentsClassName}>
      <PrivatePieceRows pieces={hidden} />
      {[...rows.values()].map((row) => (
        <li key={row.textileId}>
          <DesignIcon name="check" size="1em" strokeWidth={2.2} aria-hidden="true"  />
          <span>{row.count > 1 ? `${row.label} ×${row.count}` : row.label}</span>
          {row.method === undefined ? null : <span className={machineStepMethodClassName}>{holdOutLabels[row.method] ?? machineStepText.hangToDry}</span>}
        </li>
      ))}
    </ul>
  )
}
