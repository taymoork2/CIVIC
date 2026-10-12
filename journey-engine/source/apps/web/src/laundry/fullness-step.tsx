import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { LoadSize } from '@washcloset/planner'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'

import type { api } from '@/api'
import { drumPictures, fullnessText, loadSizeWords } from '@/copy'
import type { PlanQuestion } from '@/laundry/laundry-pass'
import { fallbackWords } from '@/laundry/plain-reasons'
import { QuestionCard, saveWasherLogo, type QuestionAction } from '@/laundry/question-card'
import { DoseFigure, DrumPictures } from '@/kit/ui'
import type { DoseLike } from '@/kit/units'

/**
 * How full the drum (or the dryer) is, at the machine: the four pictures, and for each product step
 * whose label goes by it, what the answer settled. A step with one fitting line gets its dose from the
 * server; one with no fitting line, two fitting lines, or a washer whose logo is not on record shows the
 * same question card as Make loads, inline, and is read again after the answer. Anything else that
 * cannot be followed is left out of this load.
 */

const questionCardClassName = cn(
  "question-card",
  "grid gap-4 p-[var(--space-5)_var(--space-4)_var(--space-4)] rounded-card bg-surface",
)

const questionClassName = cn(
  "question",
  "[.question-card_&]:text-[length:var(--step-3)]",
  "[.question-card_&]:font-semibold [.question-card_&]:leading-[1.2] [.question-card_&]:tracking-[-0.01em] [.question-card_&]:text-balance",
)

const largeClassName = cn(
  "large",
  "[.he-logo&]:w-[3rem] [.he-logo&]:h-[3rem]",
  "[.button&]:min-h-[3.5rem] [.button&]:w-full",
  "[.button&]:text-[length:var(--step-1)]",
)

const questionEyebrowClassName = cn(
  "question-eyebrow",
  "text-ink-2 font-semibold",
  "text-[length:var(--step-0)]",
)

const questionLeaveClassName = cn(
  "question-leave",
  "w-full",
  "[.button&]:min-h-[3.5rem]",
)

export type FullnessMachine = 'washer' | 'dryer'
export type FullnessStep = FunctionReturnType<typeof api.execution.recordDrumFullness>['steps'][number]

type Call<Reference extends FunctionReference<'mutation'>> = (args: FunctionArgs<Reference>) => Promise<FunctionReturnType<Reference>>

export type MachineCalls = {
  readonly recordDrumFullness: Call<typeof api.execution.recordDrumFullness>
  readonly answerLabelRow: Call<typeof api.inventory.answerLabelRow>
  readonly updateMachine: Call<typeof api.inventory.updateMachine>
  readonly recordAction: Call<typeof api.actions.recordAction>
  /** The washer and its identical siblings, as `washerGroupIds` finds them. */
  readonly washerGroup: (machineId: string) => readonly string[]
}

type Product = NonNullable<PlanQuestion['product']>

/** A product as the card needs it, from `inventory.list`; `hasRows` when it has saved label lines. */
export type MachineProduct = Product & { readonly hasRows: boolean }

/** What a step still waiting at the machine asks the person. */
export type MachineQuestion =
  | { readonly kind: 'card'; readonly question: PlanQuestion; readonly hasRows: boolean }
  /** The fitting line can't be followed with this product's cap or count: it can only be skipped. */
  | { readonly kind: 'invalid_dose'; readonly product: string }
  /** The label needs an answer no card asks at the machine: it can only be left out. */
  | { readonly kind: 'left_out'; readonly product: string }

type Named = { readonly product: (supplyId: string) => MachineProduct | null; readonly machineName: (machineId: string) => string | null }

/**
 * The question a fullness answer left a step with, as the same card Make loads shows. The card's key
 * is built here from the step the server returned; the web never builds a key from reason codes.
 */
export function machineQuestion(step: FullnessStep, machine: FullnessMachine, names: Named): MachineQuestion | null {
  if (step.status === 'resolved') return null
  const known = names.product(step.supplyId)
  const product: Product = known ?? { supplyId: step.supplyId, name: fullnessText.thisProduct, use: null, measure: null }
  const stage = machine === 'dryer' ? 'dryer' as const : 'washer' as const
  switch (step.status) {
    case 'label_row_needed':
    case 'conflicting_rows': {
      const { soilLevel, washerClass } = step.context
      const context = { ...(soilLevel === undefined ? {} : { soilLevel }), ...(washerClass === undefined ? {} : { washerClass }) }
      const question = {
        kind: step.status === 'label_row_needed' ? 'label_row' : 'conflicting_rows',
        key: { kind: step.status === 'label_row_needed' ? 'label_row' : 'conflicting_rows', subjectId: step.supplyId, context },
        subjectIds: [],
        context: { ...context, stage },
        product,
        ...(step.status === 'conflicting_rows' ? { rows: step.rows } : {}),
      } as PlanQuestion
      return { kind: 'card', question, hasRows: known?.hasRows ?? false }
    }
    case 'needs_input':
      if (step.missing === 'washer_class' && step.machineId !== undefined) {
        const question = {
          kind: 'washer_he',
          key: { kind: 'washer_he', subjectId: step.machineId, context: {} },
          subjectIds: [],
          context: { stage },
          product,
          machine: { machineId: step.machineId, name: names.machineName(step.machineId) ?? fullnessText.yourWasher },
        } as PlanQuestion
        return { kind: 'card', question, hasRows: known?.hasRows ?? false }
      }
      return { kind: 'left_out', product: product.name }
    case 'invalid_dose':
      return { kind: 'invalid_dose', product: product.name }
  }
}

/** An answer at the machine: a card's answer, or "Skip it this time" on a line that can't be followed. */
export type MachineAction = QuestionAction | { readonly kind: 'skip' }

export type MachineOutcome = {
  /** The steps read again after an answer that saved something; null when the step was left out instead. */
  readonly steps: readonly FullnessStep[] | null
  readonly toast: string | null
}

/**
 * Carries out an answer at the machine. A saved label line or the washer's logo is followed by
 * reading the steps again at the same fullness; "The label doesn't say", "Can't tell" and "Leave it
 * out this time" skip that product's step for this load.
 */
export async function machineAnswer(action: MachineAction, step: { readonly sessionId: string; readonly actionId: string; readonly machine: FullnessMachine; readonly size: LoadSize; readonly product: string }, calls: MachineCalls): Promise<MachineOutcome> {
  const sessionId = step.sessionId as FunctionArgs<typeof api.execution.recordDrumFullness>['sessionId']
  const again = async (toast: string | null = null): Promise<MachineOutcome> => ({ steps: (await calls.recordDrumFullness({ sessionId, machine: step.machine, size: step.size })).steps, toast })
  const skip = async (toast: string | null = null): Promise<MachineOutcome> => {
    await calls.recordAction({ sessionId, actionId: step.actionId, status: 'skipped', at: Date.now() })
    return { steps: null, toast }
  }
  switch (action.kind) {
    case 'label_row':
      await calls.answerLabelRow(action.args)
      return again()
    case 'he':
      await saveWasherLogo(calls.updateMachine, calls.washerGroup(action.machineId), action.highEfficiency)
      return again()
    case 'dismiss':
      return action.answer === 'label_doesnt_say'
        ? skip(fullnessText.notDosed(step.product, loadSizeWords[step.size]))
        : skip()
    case 'leave_product':
    case 'skip':
      return skip()
    default:
      // Garment answers (tag, soil, dry cleaning) are asked at Make loads, never here.
      return { steps: null, toast: null }
  }
}

/** The cards a fullness answer left, by step: only steps still waiting ask anything. */
export function waitingQuestions(steps: readonly FullnessStep[], machine: FullnessMachine, names: Named): ReadonlyMap<string, MachineQuestion> {
  const questions = new Map<string, MachineQuestion>()
  for (const step of steps) {
    const question = machineQuestion(step, machine, names)
    if (question !== null) questions.set(step.actionId, question)
  }
  return questions
}

// ---- Drawing it ------------------------------------------------------------------------

/** A label line a product step may use, as printed: the fullness it is for, its dose, and the typed line. */
export type CandidateLine = { readonly size: LoadSize; readonly dose: DoseLike; readonly rowText: string | null }

const pictureWord = (size: LoadSize) => drumPictures.find((picture) => picture.size === size)?.word ?? loadSizeWords[size]

/**
 * "How full is the drum?" with its four pictures. Before the clothes go in (a product that goes in the
 * empty drum first), it asks "How full will the drum be?" and shows the label's lines with the
 * fullness each is for, so the estimate of the pile picks the line.
 */
export function FullnessPictures({ machine, value, before = false, lines = [], pending, readOnly = false, onPick }: {
  machine: FullnessMachine
  value: LoadSize | null
  before?: boolean
  lines?: readonly CandidateLine[]
  pending: boolean
  /** Can't be recorded from here (the copy saved on this phone). */
  readOnly?: boolean
  onPick: (size: LoadSize) => void
}) {
  const legend = machine === 'dryer' ? fullnessText.dryerQuestion : before ? fullnessText.beforeQuestion : fullnessText.drumQuestion
  return (
    <div className="fullness-step">
      {lines.length === 0 ? null : (
        <ul className="fullness-lines" aria-label={fullnessText.labelSays}>
          {lines.map((line) => (
            <li key={line.size}>
              <span className="fullness-line-size">{pictureWord(line.size)}</span>
              <DoseFigure dose={line.dose} size="inline" />
              {line.rowText === null ? null : <span className="fullness-line-typed">“{line.rowText}”</span>}
            </li>
          ))}
        </ul>
      )}
      <DrumPictures legend={legend} value={value} machine={machine} disabled={pending} readOnly={readOnly} onPick={onPick} />
    </div>
  )
}

/** A step waiting at the machine: the Make loads card for it, or the one way out when there is no card. */
export function MachineQuestionCard({ question, size, pending, onAction }: {
  question: MachineQuestion
  size: LoadSize
  pending: boolean
  onAction: (action: MachineAction) => void
}) {
  switch (question.kind) {
    case 'card':
      return <QuestionCard question={question.question} nameOf={() => ''} hasRows={question.hasRows} loadSize={size} pending={pending} onAction={onAction} />
    case 'invalid_dose':
      return (
        <section className={questionCardClassName} aria-label={question.product}>
          <p className={questionClassName}>{fullnessText.invalidLine}</p>
          <Button type="button" className={largeClassName} disabled={pending} onClick={() => onAction({ kind: 'skip' })}>{fullnessText.skip}</Button>
        </section>
      )
    case 'left_out':
      return (
        <section className={questionCardClassName} aria-label={question.product}>
          <p className={questionEyebrowClassName}>{question.product}</p>
          <p className={questionClassName}>{fallbackWords}</p>
          <Button type="button" className={cn("secondary", questionLeaveClassName)} disabled={pending} onClick={() => onAction({ kind: 'leave_product', supplyId: '' })}>{fullnessText.leaveProduct}</Button>
        </section>
      )
  }
}
