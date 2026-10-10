import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { markFractionProblem, type LoadSize, type SoilLevel, type ProductLoadConfirmation, type SourceLoadCategory } from '@washcloset/planner'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { useId, useState, type ReactNode } from 'react'

import type { api } from '@/api'
import { bleachKindWords } from '@/products/bottle-sheet'
import { bottleUseWords, helpTipText, loadSizeWords, questionText, soilButtonWords, soilSentenceWords } from '@/copy'
import { questionLayoutText } from '@/copy-question'
import type { Machine } from '@/household/inventory-types'
import { AnswerRow, FooterLink, Note, SegmentChoice, TextField } from '@/laundry/laundry-ui'
import { HelpTip } from '@/kit/help-tip'
import { dismissQuestion, leaveOutProduct, withoutGarments, type DismissedAnswer, type Pass, type PlanQuestion } from '@/laundry/laundry-pass'
import { machineGroups } from '@/household/machine-sheet'
import { labelDoesntSayWords } from '@/laundry/plain-reasons'
import { CapMarks, CountMarks, GroupCaption, PickCard, ProductHead, RowsCard, SymbolTile, SymbolTiles, ToggleRow } from '@/laundry/question-parts'
import { TagQuestions, emptyTag, tagAnswers, tagEcho, type TagAnswers, type TagDraft } from '@/laundry/tag-step'
import { TaskFooter } from '@/kit/task-footer'
import { DoseFigure, HeLogo } from '@/kit/ui'
import { displayTemperature, doseParts, useUnits } from '@/kit/units'
import { DesignIcon } from '@/kit/design-icons'

/**
 * The question screens: one question, big answers, and "Leave it out this time". The card only
 * collects the answer; `questionEffect` carries it out (a mutation, a change to the pass, or both),
 * and the screen then plans again. Card copy never reads a reason code or a planner sentence.
 * Laid out as every task screen is: the instruction at 20, the answers as choice cards, the
 * quieter ways out below a divider, and the primary action held in the glass footer.
 */

type AnswerLabelRowArgs = FunctionArgs<typeof api.inventory.answerLabelRow>
type LabelDose = AnswerLabelRowArgs['dose']

export type QuestionAction =
  | { readonly kind: 'tag'; readonly textileIds: readonly string[]; readonly answers: TagAnswers }
  | { readonly kind: 'leave_garments'; readonly textileIds: readonly string[] }
  | { readonly kind: 'dry_clean'; readonly textileIds: readonly string[] }
  /** Each garment's own soil, all at once. */
  | { readonly kind: 'soil'; readonly soils: readonly { readonly textileId: string; readonly soilLevel: SoilLevel }[] }
  | { readonly kind: 'he'; readonly machineId: string; readonly highEfficiency: boolean }
  | { readonly kind: 'dismiss'; readonly answer: DismissedAnswer }
  | { readonly kind: 'leave_product'; readonly supplyId: string }
  | { readonly kind: 'label_row'; readonly args: AnswerLabelRowArgs }
  | { readonly kind: 'product_safety'; readonly args: FunctionArgs<typeof api.inventory.updateSupply> }
  | { readonly kind: 'product_load_confirmation'; readonly check: ProductLoadConfirmation }

type Call<Reference extends FunctionReference<'mutation'>> = (args: FunctionArgs<Reference>) => Promise<FunctionReturnType<Reference>>

export type QuestionCalls = {
  readonly answerTagQuestions: Call<typeof api.inventory.answerTagQuestions>
  readonly moveToDryCleaning: Call<typeof api.closet.moveToDryCleaning>
  readonly setTextileStatus: Call<typeof api.inventory.setTextileStatus>
  readonly updateMachine: Call<typeof api.inventory.updateMachine>
  readonly answerLabelRow: Call<typeof api.inventory.answerLabelRow>
  readonly updateSupply: Call<typeof api.inventory.updateSupply>
  /** The washer and its identical siblings, as `washerGroupIds` finds them. */
  readonly washerGroup: (machineId: string) => readonly string[]
}

/**
 * The washers one HE answer is for: the one asked about and its identical siblings ("Speed Queen
 * washer 1…4", one type, one place), that one first. Just that one when it stands alone.
 */
export function washerGroupIds(machineId: string, machines: readonly Machine[]): string[] {
  const washers = machines.filter((machine) => !machine.archived && machine.applianceType !== 'tumble_dryer')
  const group = machineGroups(washers).find((entry) => entry.machines.some((machine) => machine.machineId === machineId))
  return [machineId, ...(group?.machines ?? []).map((machine) => machine.machineId as string).filter((id) => id !== machineId)]
}

/**
 * Saves the HE logo to every washer in the group. One `updateMachine` each rather than
 * `updateMachineGroup`: only this call keeps a running load's plan (the logo changes doses only),
 * where a group edit would set every running load's plan aside.
 */
export async function saveWasherLogo(update: QuestionCalls['updateMachine'], machineIds: readonly string[], highEfficiency: boolean): Promise<void> {
  for (const machineId of machineIds) await update({ machineId: machineId as FunctionArgs<typeof api.inventory.updateMachine>['machineId'], highEfficiency })
}

export type QuestionOutcome = {
  readonly selection: readonly string[]
  readonly pass: Pass
  readonly toast: string | null
  /** Whether to plan again now. */
  readonly recompute: boolean
}

const soilLevels = ['light', 'normal', 'heavy'] as const satisfies readonly SoilLevel[]

const soilOf = (value: unknown): SoilLevel | null => (value === 'light' || value === 'normal' || value === 'heavy' ? value : null)

/** Carries out an answer: its mutation, then the selection and pass the next plan is made with. */
export async function questionEffect(action: QuestionAction, question: PlanQuestion, state: { readonly selection: readonly string[]; readonly pass: Pass }, calls: QuestionCalls): Promise<QuestionOutcome> {
  const same = { selection: state.selection, pass: state.pass, toast: null, recompute: true }
  const ids = (values: readonly string[]) => values as FunctionArgs<typeof api.inventory.answerTagQuestions>['textileIds']
  switch (action.kind) {
    case 'tag':
      await calls.answerTagQuestions({ textileIds: ids(action.textileIds), ...action.answers })
      return same
    case 'leave_garments':
      return { ...withoutGarments(state.selection, state.pass, action.textileIds), toast: null, recompute: true }
    case 'dry_clean':
      await calls.moveToDryCleaning({ textileIds: ids(action.textileIds) })
      return { ...withoutGarments(state.selection, state.pass, action.textileIds), toast: null, recompute: true }
    case 'soil':
      // One write per level: every garment gets its own answer, then one new plan.
      for (const soilLevel of soilLevels) {
        const textileIds = action.soils.filter((entry) => entry.soilLevel === soilLevel).map((entry) => entry.textileId)
        if (textileIds.length > 0) await calls.setTextileStatus({ textileIds: ids(textileIds), status: 'dirty', soilLevel })
      }
      return same
    case 'he':
      await saveWasherLogo(calls.updateMachine, calls.washerGroup(action.machineId), action.highEfficiency)
      return same
    case 'dismiss': {
      const toast = action.answer === 'label_doesnt_say' ? `${labelDoesntSayWords(question.product?.name ?? 'This product', soilOf(question.context.soilLevel))} Check the label.` : null
      return { selection: state.selection, pass: dismissQuestion(state.pass, question.key, action.answer), toast, recompute: true }
    }
    case 'leave_product':
      return { selection: state.selection, pass: leaveOutProduct(state.pass, action.supplyId), toast: null, recompute: true }
    case 'label_row':
      await calls.answerLabelRow(action.args)
      return same
    case 'product_safety':
      await calls.updateSupply(action.args)
      return same
    case 'product_load_confirmation':
      return { ...same, pass: { ...state.pass, productLoadConfirmations: [...(state.pass.productLoadConfirmations ?? []).filter((check) => check.supplyId !== action.check.supplyId || check.loadFingerprint !== action.check.loadFingerprint), action.check] } }
  }
}

// ---- Label rows ----------------------------------------------------------------------

/** The question's context, plus the drum's size when it is asked at the machine. */
export type LabelContext = PlanQuestion['context'] & { readonly loadSize?: LoadSize }

export type LabelDraft = {
  readonly dose: LabelDose | null
  readonly sameForAll: boolean
  readonly alsoVeryDirty: boolean
  readonly inDrawer: boolean
  readonly rowText: string
}

export const emptyLabelDraft: LabelDraft = { dose: null, sameForAll: false, alsoVeryDirty: false, inDrawer: false, rowText: '' }

const drawerUses = new Set(['booster', 'stain_remover', 'sanitizer'])

/** What the label card offers beyond the dose: which toggles apply to this product and context. */
export function labelOptions(question: Pick<PlanQuestion, 'product' | 'context'>, context: LabelContext, hasRows: boolean) {
  const dryer = context.stage === 'dryer'
  return {
    dryer,
    /** "It's the same for every load": a washer product's row with no size or soil condition. */
    sameForAll: !dryer,
    /** "This line also covers very dirty loads": asked at the machine, for a load that is not very dirty. */
    alsoVeryDirty: !dryer && context.loadSize !== undefined && context.soilLevel !== 'heavy',
    /** "It goes in the drawer": the first row of a booster, stain remover or sanitizer. */
    inDrawer: !dryer && !hasRows && drawerUses.has(question.product?.use ?? ''),
    /** "It depends on how full the washer is": only at plan time; at the machine the size is known. */
    dependsOnSize: context.loadSize === undefined,
  }
}

/** The one row `answerLabelRow` saves, for exactly the context asked. The typed line only when typed. */
export function labelRowArgs(supplyId: string, context: LabelContext, options: ReturnType<typeof labelOptions>, draft: LabelDraft & { readonly dose: LabelDose }): AnswerLabelRowArgs {
  const rowText = draft.rowText.trim()
  return {
    supplyId: supplyId as AnswerLabelRowArgs['supplyId'],
    context: {
      ...(context.loadSize === undefined ? {} : { loadSize: context.loadSize }),
      ...(options.dryer || context.soilLevel === undefined ? {} : { soilLevel: context.soilLevel }),
      ...(options.dryer || context.washerClass === undefined ? {} : { washerClass: context.washerClass }),
    },
    ...(options.sameForAll && draft.sameForAll ? { sameForAll: true } : {}),
    ...(options.alsoVeryDirty && draft.alsoVeryDirty ? { alsoVeryDirty: true } : {}),
    ...(options.inDrawer ? { inDrawer: draft.inDrawer } : {}),
    dose: draft.dose,
    ...(rowText.length === 0 ? {} : { rowText: rowText.slice(0, 80) }),
  }
}

/** Choosing between two fitting rows saves a row for the full context, with the chosen dose and its typed line. */
export function conflictChoiceArgs(question: Pick<PlanQuestion, 'context'>, supplyId: string, row: NonNullable<PlanQuestion['rows']>[number], loadSize?: LoadSize): AnswerLabelRowArgs {
  const { soilLevel, washerClass } = question.context
  return {
    supplyId: supplyId as AnswerLabelRowArgs['supplyId'],
    context: { ...(loadSize === undefined ? {} : { loadSize }), ...(soilLevel === undefined ? {} : { soilLevel }), ...(washerClass === undefined ? {} : { washerClass }) },
    dose: { amount: row.dose.amount, unit: row.dose.unit, ...(typeof row.dose.mark === 'string' ? { mark: row.dose.mark } : {}), ...(row.dose.fractionOfMark === undefined ? {} : { fractionOfMark: row.dose.fractionOfMark }), ...(row.dose.target === undefined ? {} : { target: row.dose.target }), ...(row.dose.approximate === undefined ? {} : { approximate: row.dose.approximate }) },
    ...(row.rowText === null ? {} : { rowText: row.rowText }),
  }
}

type Measure = NonNullable<NonNullable<PlanQuestion['product']>['measure']>

/** How the product's dose is picked: its cap or scoop marks, a count, or nothing to pick from. */
export function measurePick(measure: Measure | null | undefined): { kind: 'marks'; vessel: 'cap' | 'scoop'; marks: string[] } | { kind: 'count'; unit: string } | null {
  if (measure === null || measure === undefined) return null
  if (measure.kind === 'count') return { kind: 'count', unit: measure.countUnit ?? questionText.pod }
  const marks = (measure.marks ?? []).map((mark) => mark.label)
  if ((measure.kind === 'cap' || measure.kind === 'scoop') && marks.length > 0) return { kind: 'marks', vessel: measure.kind, marks }
  return null
}

/**
 * The label question in parts: "Grab the Tide bottle." then the question, with the load's words
 * in bold and the HE logo picture when the washer's class matters.
 */
export function labelQuestionParts(question: Pick<PlanQuestion, 'product'>, context: LabelContext) {
  const name = question.product?.name ?? questionText.product
  const pick = measurePick(question.product?.measure)
  const dryer = context.stage === 'dryer'
  const unit = pick?.kind === 'count' ? pick.unit : null
  const vessel = dryer ? 'box' : unit === 'pod' ? 'bag' : 'bottle'
  const words: (string | null)[] = [context.loadSize === undefined ? null : loadSizeWords[context.loadSize], dryer || context.soilLevel === undefined ? null : soilSentenceWords[context.soilLevel]]
  const bold = words.filter((word) => word !== null).join(', ')
  const he: 'with' | 'without' | null = dryer || context.washerClass === undefined ? null : context.washerClass === 'he' ? 'with' : 'without'
  const counted = unit === null ? null : `${unit}s`
  if (bold.length === 0) {
    return { lead: questionText.grab(name, vessel), before: counted === null ? questionText.labelAmount : questionText.countAmount(unit!), bold: null, he }
  }
  return { lead: questionText.grab(name, vessel), before: counted === null ? questionText.labelFor : questionText.countFor(unit!), bold, after: questionText.load, he }
}

function LabelQuestion({ question, context }: { question: Pick<PlanQuestion, 'product'>; context: LabelContext }) {
  const parts = labelQuestionParts(question, context)
  return (
    <>
      {parts.lead} {parts.before}
      {parts.bold === null ? null : <><strong>{parts.bold}</strong>{parts.after}</>}
      {parts.he === null ? null : <>{questionText.washerLogo(parts.he)}<HeLogo /></>}
      ?
    </>
  )
}

// ---- The card ------------------------------------------------------------------------

export type QuestionCardProps = {
  question: PlanQuestion
  /** A garment's name, as stored. */
  nameOf: (textileId: string) => string
  /** Whether the product already has saved label rows (the drawer toggle is for its first). */
  hasRows?: boolean
  /** Asked at the machine: the drum's size, which adds the size words and drops "It depends…". */
  loadSize?: LoadSize
  pending: boolean
  onAction: (action: QuestionAction) => void
  /** Headline above the question, such as "One question first". */
  eyebrow?: string
  /** Where the answer leads after it is chosen. */
  next?: string
  /** In the pass: the answer button sits docked at the bottom, in thumb reach. */
  docked?: boolean
}
type LeaveLink = { label: string; disabled: boolean; onClick: () => void }
type CommitProps = { echo: string | null; next?: string; docked: boolean; pending: boolean; onCommit: () => void; leave?: LeaveLink }

/**
 * The selected answer remains visible in the card; the button names the next action. Docked, the
 * button rides in the glass footer with "Leave it out this time" as its quiet link; undocked, they
 * sit under the answers.
 */
export function Commit({ echo, next, docked, pending, onCommit, leave }: CommitProps) {
  const button = (
    <Button type="button" size="lg" className="w-full text-balance" disabled={pending || echo === null} onClick={onCommit}>
      {echo === null ? questionText.pickAnswer : next ?? echo}
    </Button>
  )
  const link = leave === undefined ? null : <FooterLink disabled={leave.disabled} onClick={leave.onClick}>{leave.label}</FooterLink>
  if (docked) return <TaskFooter secondary={link}>{button}</TaskFooter>
  return (
    <div className="grid justify-items-center gap-1">
      <div className="grid w-full">{button}</div>
      {link}
    </div>
  )
}

/** Whether a question's garments are several identical ones answered together. */
const several = (question: PlanQuestion) => question.subjectIds.length > 1

const questionTitleClassName = 'm-0 max-w-none text-balance text-[length:var(--step-2)] font-semibold leading-[1.3]'

/** What the product is used for, when its record says. */
const useCaption = (use: string | null | undefined) => (use !== undefined && use !== null && use in bottleUseWords ? bottleUseWords[use as keyof typeof bottleUseWords] : undefined)

/** One question card, by kind. Answers are picked, then the primary button carries them out. */
export function QuestionCard({ question, nameOf, hasRows = false, loadSize, pending, onAction, eyebrow, next, docked = false }: QuestionCardProps) {
  const titleId = useId()
  const commit = (echo: string | null, action: QuestionAction | null, leave?: QuestionAction) => (
    <Commit
      echo={action === null ? null : echo}
      next={next}
      docked={docked}
      pending={pending}
      onCommit={() => (action === null ? undefined : onAction(action))}
      leave={leave === undefined ? undefined : { label: questionText.leaveOut, disabled: pending, onClick: () => onAction(leave) }}
    />
  )
  const frame = (title: ReactNode, body: ReactNode, options: { hint?: string; product?: boolean } = {}) => (
    <section className="grid gap-6" aria-labelledby={titleId}>
      {eyebrow === undefined ? null : <p className="m-0 text-[length:var(--step--1)] text-muted-foreground">{eyebrow}</p>}
      {options.product === true && question.product !== undefined ? <ProductHead name={question.product.name} caption={useCaption(question.product.use)} /> : null}
      <div className="grid gap-2">
        <p id={titleId} className={questionTitleClassName}>{title}</p>
        {options.hint === undefined ? null : <Note>{options.hint}</Note>}
      </div>
      {body}
    </section>
  )
  const name = (id: string | undefined) => (id === undefined ? questionText.this : nameOf(id))
  const props = { question, pending, onAction, commit, titleId }
  switch (question.kind) {
    case 'care_unknown': {
      const count = question.subjectIds.length
      return several(question)
        ? frame(questionText.tagSeveral(name(question.subjectIds[0]), count), <TagAnswer {...props} />, { hint: questionText.oneCoversAll(count) })
        : frame(questionText.tagOne(name(question.subjectIds[0])), <TagAnswer {...props} />)
    }
    case 'dry_clean_only':
      return frame(several(question) ? questionText.dryCleanSeveral(name(question.subjectIds[0]), question.subjectIds.length) : questionText.dryCleanOne(name(question.subjectIds[0])), <DryCleanAnswer {...props} />)
    case 'soil_level':
      return frame(
        question.product === undefined ? questionText.soilQuestion : questionText.soilWithProduct(question.product.name),
        <SoilAnswer {...props} nameOf={nameOf} />,
      )
    case 'washer_he':
      return frame(questionText.heQuestion(question.machine?.name ?? questionText.yourWasher), <LogoAnswer {...props} />)
    case 'product_safety':
      return frame(`Does ${question.product?.name ?? 'this product'} contain bleach?`, <ProductSafetyAnswer {...props} />, { hint: questionLayoutText.bleachHint })
    case 'product_load_confirmation':
      return frame('Check this product for this load', <ProductLoadAnswer {...props} nameOf={nameOf} />, { product: true, hint: 'These checks apply to the clothes and settings in this recipe. Changes require another review.' })
    case 'label_row': {
      const context: LabelContext = { ...question.context, ...(loadSize === undefined ? {} : { loadSize }) }
      return frame(<LabelQuestion question={question} context={context} />, <LabelAnswer {...props} context={context} hasRows={hasRows} />, { product: true })
    }
    case 'conflicting_rows':
      return frame(questionText.conflict(question.product?.name ?? questionText.productBare), <ConflictAnswer {...props} loadSize={loadSize} />, { product: true })
  }
}

type AnswerProps = {
  question: PlanQuestion
  pending: boolean
  onAction: (action: QuestionAction) => void
  commit: (echo: string | null, action: QuestionAction | null, leave?: QuestionAction) => ReactNode
  /** The question's text, which names the group of answers. */
  titleId: string
}

function ProductLoadAnswer({ question, pending, commit, titleId, nameOf }: AnswerProps & { nameOf: (id: string) => string }) {
  const { system } = useUnits()
  const [colorfastnessChecked, setColorfastness] = useState(false)
  const [ordinaryWashRouteChecked, setRoute] = useState(false)
  const [category, setCategory] = useState<SourceLoadCategory | ''>('')
  const product = question.product
  const requirement = question.productCheck
  if (product === undefined || requirement === undefined) return null
  const names = new Map<string, number>()
  for (const id of question.subjectIds) names.set(nameOf(id), (names.get(nameOf(id)) ?? 0) + 1)
  const ready = (!requirement.colorfastnessRequired || colorfastnessChecked) && (!requirement.ordinaryWashRouteRequired || ordinaryWashRouteChecked) && (requirement.sourceLoadCategories.length === 0 || requirement.sourceLoadCategories.includes(category))
  const check: ProductLoadConfirmation = { supplyId: product.supplyId, sourceDigest: requirement.sourceDigest, loadFingerprint: requirement.loadFingerprint, colorfastnessChecked,
    ...(category === '' ? {} : { sourceLoadCategory: category }),
    ...(requirement.ordinaryWashRouteRequired ? { ordinaryWashRouteChecked, washContextFingerprint: requirement.washContextFingerprint } : {}),
  }
  return <>
    <Note>{question.subjectIds.length} {question.subjectIds.length === 1 ? 'piece' : 'pieces'} · {requirement.cycle} · {requirement.temperatureC === null ? 'Temperature not recorded' : displayTemperature(requirement.temperatureC, system)}</Note>
    <p className="m-0">{[...names].map(([name, quantity]) => quantity === 1 ? name : `${name} (×${quantity})`).join(', ')}</p>
    {requirement.colorfastnessRequired ? <label className="flex min-h-11 items-start gap-3"><Checkbox disabled={pending} checked={colorfastnessChecked} onCheckedChange={(value) => setColorfastness(value === true)} /><span>I checked these clothes for colorfastness as this product’s directions require.</span></label> : null}
    {requirement.ordinaryWashRouteRequired ? <label className="flex min-h-11 items-start gap-3"><Checkbox disabled={pending} checked={ordinaryWashRouteChecked} onCheckedChange={(value) => setRoute(value === true)} /><span>I checked the selected washer, program and options for the intact-Pak warm/hot wash route. Cold-water preparation and soaking are outside this recipe.</span></label> : null}
    {requirement.sourceLoadCategories.length > 0 ? <><Note>Use the manufacturer’s load category; drum fullness and clothing weight don’t establish it.</Note><RadioGroup aria-labelledby={titleId} value={category} disabled={pending} onValueChange={(value) => setCategory(value as SourceLoadCategory)} className="grid gap-2">{requirement.sourceLoadCategories.map((value) => <PickCard key={value} value={value} title={`${value[0]!.toUpperCase()}${value.slice(1)} load`} />)}</RadioGroup></> : null}
    {commit(ready ? 'Product checks recorded for this load' : null, ready ? { kind: 'product_load_confirmation', check } : null, { kind: 'leave_product', supplyId: product.supplyId })}
  </>
}

function ProductSafetyAnswer({ question, pending, commit, titleId }: AnswerProps) {
  const [kind, setKind] = useState<'none' | 'oxygen' | 'chlorine' | ''>('')
  const product = question.product
  if (product === undefined) return null
  return <>
    <RadioGroup aria-labelledby={titleId} value={kind} disabled={pending} onValueChange={(value) => setKind(value as typeof kind)}>
      <SymbolTiles label={bleachKindWords.none}>
        <SymbolTile value="none" title={bleachKindWords.none} picture={<DesignIcon name="drop" size={30}  />} />
        <SymbolTile value="oxygen" title={bleachKindWords.oxygen} symbol="bleach_non_chlorine" />
        <SymbolTile value="chlorine" title={bleachKindWords.chlorine} symbol="bleach" />
      </SymbolTiles>
    </RadioGroup>
    {commit(kind === '' ? null : bleachKindWords[kind], kind === '' ? null : { kind: 'product_safety', args: { supplyId: product.supplyId, safety: { ...(product.safety ?? { incompatibleSupplyIds: [], incompatibleMaterials: [] }), bleachKind: kind } } }, { kind: 'leave_product', supplyId: product.supplyId })}
  </>
}

/**
 * The unknown-care card's answer: whatever the tag step reads, saved as-is — "Tag doesn't say" on the
 * washtub stores `washMethod: 'unknown'`, the same as the tag step does in Add clothes and bulk add, so
 * the garments wash fail-closed instead of vanishing from the wash. Leaving them out is a separate,
 * explicit choice (the "Leave it out this time" link), never an automatic side effect of this answer.
 */
export function tagAnswerAction(tag: TagDraft, textileIds: readonly string[]): QuestionAction | null {
  const answers = tagAnswers(tag)
  return answers === null ? null : { kind: 'tag', textileIds, answers }
}

/** "Check the tag inside": the tag step, then the button. */
function TagAnswer({ question, commit }: AnswerProps) {
  const [tag, setTag] = useState<TagDraft>(emptyTag)
  const action = tagAnswerAction(tag, question.subjectIds)
  return (
    <>
      <TagQuestions value={tag} onChange={setTag} />
      {commit(tagEcho(tag), action, { kind: 'leave_garments', textileIds: question.subjectIds })}
    </>
  )
}

function DryCleanAnswer({ question, pending, commit }: AnswerProps) {
  const [picked, setPicked] = useState(false)
  return (
    <>
      <ToggleRow variant="card" pressed={picked} disabled={pending} title={questionText.moveToDryCleaning} onClick={() => setPicked(!picked)} />
      {commit(questionText.moveToDryCleaning, picked ? { kind: 'dry_clean', textileIds: question.subjectIds } : null, { kind: 'leave_garments', textileIds: question.subjectIds })}
    </>
  )
}

const logoAnswers = [
  { key: 'yes', words: questionText.logo.yes, action: (machineId: string): QuestionAction => ({ kind: 'he', machineId, highEfficiency: true }) },
  { key: 'no', words: questionText.logo.no, action: (machineId: string): QuestionAction => ({ kind: 'he', machineId, highEfficiency: false }) },
  { key: 'cant_tell', words: questionText.logo.cantTell, action: (): QuestionAction => ({ kind: 'dismiss', answer: 'cant_tell' }) },
] as const

/** Yes, No or Can't tell; "Can't tell" is this card's way out. */
function LogoAnswer({ question, pending, commit, titleId }: AnswerProps) {
  const [picked, setPicked] = useState<(typeof logoAnswers)[number] | null>(null)
  const machineId = question.machine?.machineId ?? question.key.subjectId
  return (
    <>
      <div className="flex justify-center rounded-card bg-card py-5 shadow-[var(--shadow-sm)] [&_.he-logo]:size-14"><HeLogo size="large" /></div>
      <SegmentChoice labelledBy={titleId} value={picked?.key ?? ''} disabled={pending} onChange={(value) => setPicked(logoAnswers.find((answer) => answer.key === value) ?? null)}
        options={logoAnswers.map((answer) => ({ value: answer.key, label: answer.words }))} />
      {commit(picked?.words ?? null, picked === null ? null : picked.action(machineId))}
    </>
  )
}

/** One line per garment, by name; the button writes every garment its own soil once each has one. */
function SoilAnswer({ question, nameOf, pending, commit }: AnswerProps & { nameOf: (textileId: string) => string }) {
  const [answered, setAnswered] = useState<Readonly<Record<string, SoilLevel>>>({})
  const unanswered = question.subjectIds.filter((id) => answered[id] === undefined)
  const levels = [...new Set(Object.values(answered))]
  const echo = unanswered.length > 0 ? null : levels.length === 1 && question.subjectIds.length > 1 ? questionText.allSoil(soilButtonWords[levels[0]!].toLowerCase()) : levels.length === 1 ? soilButtonWords[levels[0]!] : questionText.saveSoil
  const action: QuestionAction | null = unanswered.length > 0 ? null : { kind: 'soil', soils: question.subjectIds.map((textileId) => ({ textileId, soilLevel: answered[textileId]! })) }
  return (
    <>
      <ul className="m-0 grid list-none gap-3 p-0">
        {question.subjectIds.map((textileId) => (
          <li key={textileId} className="grid gap-3 rounded-card bg-card p-4 shadow-[var(--shadow-sm)]">
            <span className="text-[length:var(--step-1)] font-semibold leading-[1.3]" aria-hidden="true">{nameOf(textileId)}</span>
            <RadioGroup variant="segment" aria-label={nameOf(textileId)} value={answered[textileId] ?? ''} disabled={pending} onValueChange={(value) => setAnswered({ ...answered, [textileId]: value as SoilLevel })}>
              {soilLevels.map((soil) => <RadioGroupItem key={soil} variant="segment" value={soil} className="min-h-11">{soilButtonWords[soil]}</RadioGroupItem>)}
            </RadioGroup>
          </li>
        ))}
      </ul>
      {commit(echo, action, unanswered.length === 0 ? undefined : { kind: 'leave_garments', textileIds: unanswered })}
    </>
  )
}

/** A picked dose in words: "Use line 3" for a cap's printed mark, "Use 2 pods" for a count. */
export function doseEcho(dose: LabelDose): string {
  if (dose.target !== undefined || dose.approximate || (dose.fractionOfMark !== undefined && dose.fractionOfMark !== 1)) return doseParts(dose, 'imperial').spoken
  if (typeof dose.mark === 'string') return dose.unit === 'scoop' ? questionText.useMark(dose.mark) : questionText.useLine(dose.mark)
  return questionText.useCount(dose.amount, dose.unit)
}

type LabelChoice = { readonly kind: 'dose' } | { readonly kind: 'dismiss'; readonly answer: 'depends_on_size' | 'label_doesnt_say' }

/** A quiet row that opens to its own field; the same look as the other rows in a card. */
function QuietFold({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex min-h-12 items-center justify-between gap-3 py-2 text-[length:var(--step-0)] font-semibold [&[data-panel-open]_svg]:rotate-180">
        {title}
        <DesignIcon name="chevronDown" size="1em" strokeWidth={2.2} className="size-4 flex-none text-muted-foreground" aria-hidden="true"  />
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  )
}

/**
 * The cap's own printed marks (or a count) as the answer, the optional toggles and typed line, then
 * the other answers below a divider. A bottle with no marks saved offers no lines to pick: nothing
 * is assumed. Marks, count and the other answers are one radio group: one answer at a time.
 */
function LabelAnswer({ question, context, hasRows, pending, commit, titleId }: AnswerProps & { context: LabelContext; hasRows: boolean }) {
  const [draft, setDraft] = useState<LabelDraft>(emptyLabelDraft)
  const [choice, setChoice] = useState<LabelChoice | null>(null)
  const typedId = useId()
  const set = (patch: Partial<LabelDraft>) => setDraft({ ...draft, ...patch })
  const pickDose = (dose: LabelDose) => {
    setDraft({ ...draft, dose })
    setChoice({ kind: 'dose' })
  }
  const supplyId = question.product?.supplyId ?? question.key.subjectId
  const options = labelOptions(question, context, hasRows)
  const pick = measurePick(question.product?.measure)
  const dose = choice?.kind === 'dose' ? draft.dose : null
  const validDose = dose !== null && markFractionProblem(dose) === null
  // Before the drum is seen, a washer line is saved only for every load; otherwise it's asked at the machine.
  const needsEveryLoad = validDose && options.sameForAll && options.dependsOnSize && !draft.sameForAll
  const toggle = (key: 'sameForAll' | 'alsoVeryDirty' | 'inDrawer', words: string) => (
    <ToggleRow pressed={draft[key]} title={words} disabled={pending} onClick={() => set({ [key]: !draft[key] })} />
  )
  const dependsWords = options.dryer ? questionText.dependsDryer : questionText.dependsWasher
  const dismissals = [
    ...(options.dependsOnSize ? [{ answer: 'depends_on_size' as const, words: dependsWords, echo: questionText.askAtMachine }] : []),
    { answer: 'label_doesnt_say' as const, words: questionText.labelSilent, echo: questionText.labelSilent },
  ]
  const picked = choice?.kind === 'dismiss' ? dismissals.find((entry) => entry.answer === choice.answer) ?? null : null
  const action: QuestionAction | null = needsEveryLoad ? null : validDose ? { kind: 'label_row', args: labelRowArgs(supplyId, context, options, { ...draft, dose: dose! }) }
    : picked !== null ? { kind: 'dismiss', answer: picked.answer } : null
  const value = dose !== null ? (typeof dose.mark === 'string' ? `mark:${dose.mark}` : `count:${dose.amount}`) : picked !== null ? `dismiss:${picked.answer}` : ''
  const onValueChange = (next: unknown) => {
    const text = String(next)
    if (text.startsWith('mark:') && pick?.kind === 'marks') pickDose({ amount: 1, unit: pick.vessel, mark: text.slice('mark:'.length) })
    else if (text.startsWith('count:') && pick?.kind === 'count') pickDose({ amount: Number(text.slice('count:'.length)), unit: pick.unit })
    else {
      const entry = dismissals.find((candidate) => `dismiss:${candidate.answer}` === text)
      if (entry !== undefined) setChoice({ kind: 'dismiss', answer: entry.answer })
    }
  }
  const sameQuestion = options.sameForAll && options.dependsOnSize
  const stepTwo = sameQuestion && (dose !== null || picked?.answer === 'depends_on_size')
  const quiet = (entry: (typeof dismissals)[number]) => (
    <PickCard key={entry.answer} value={`dismiss:${entry.answer}`} title={entry.words} disabled={pending} quiet />
  )
  const extras = (
    <>
      {dose?.mark == null ? null : (
        <QuietFold title={questionText.lessThanLine}>
          <div className="grid gap-2 pb-3">
            <label htmlFor={`${typedId}-fill-level`}>Fill level (% of {dose.mark})</label>
            <Input id={`${typedId}-fill-level`} type="number" inputMode="decimal" min="0.000001" max="100" step="any" value={(dose.fractionOfMark ?? 1) * 100}
              aria-invalid={!validDose || undefined} onChange={(event) => pickDose({ ...dose, fractionOfMark: Number(event.target.value) / 100 })} />
            <p>100% means the printed mark. Copy any lower fill level from the pack.</p>
          </div>
        </QuietFold>
      )}
      {options.alsoVeryDirty ? toggle('alsoVeryDirty', questionText.veryDirty) : null}
      {options.sameForAll && !options.dependsOnSize ? toggle('sameForAll', questionText.everyLoad) : null}
      {options.inDrawer ? toggle('inDrawer', questionText.inDrawer) : null}
      <QuietFold title={questionText.typePrinted}>
        <div className="pb-3">
          <TextField id={typedId} label={questionText.typeLine} value={draft.rowText} maxLength={80} autoComplete="off" onChange={(event) => set({ rowText: event.target.value })} />
        </div>
      </QuietFold>
    </>
  )
  return (
    <>
      <RadioGroup aria-labelledby={titleId} value={value} disabled={pending} onValueChange={onValueChange} className="grid gap-6">
        {stepTwo ? (
          <>
            <div className="grid gap-2">
              <GroupCaption>{questionText.sameEveryLoad}</GroupCaption>
              <AnswerRow label={questionText.sameEveryLoad} disabled={pending} answers={[
                { key: 'yes', label: questionText.yes, pressed: dose !== null && draft.sameForAll, onClick: () => { setDraft({ ...draft, sameForAll: true }); setChoice({ kind: 'dose' }) } },
                { key: 'depends', label: dependsWords, pressed: picked?.answer === 'depends_on_size', onClick: () => setChoice({ kind: 'dismiss', answer: 'depends_on_size' }) },
              ]} />
            </div>
            <RowsCard>{extras}</RowsCard>
            <div><FooterLink onClick={() => setChoice(null)}>{questionText.changeLine}</FooterLink></div>
          </>
        ) : (
          <>
            {pick?.kind === 'marks' ? (
              <div className="grid gap-2">
                <span className="flex items-center gap-1"><GroupCaption>{questionText.whichLine(options.dryer ? 'box' : 'bottle')}</GroupCaption><HelpTip topic={helpTipText.capLine.topic}>{helpTipText.capLine.words}</HelpTip></span>
                <CapMarks vessel={pick.vessel} marks={pick.marks} label={questionText.whichLine(options.dryer ? 'box' : 'bottle')} valueOf={(mark) => `mark:${mark}`} />
              </div>
            ) : pick?.kind === 'count' ? (
              <div className="grid gap-2">
                <GroupCaption>{questionText.howMany}</GroupCaption>
                <CountMarks unit={pick.unit} label={questionText.howMany} valueOf={(count) => `count:${count}`} />
              </div>
            ) : <Note>{questionText.noMarks(options.dryer ? 'box' : 'bottle')}</Note>}
            <RowsCard>
              {pick === null ? null : extras}
              {dismissals.filter((entry) => !(sameQuestion && pick !== null && entry.answer === 'depends_on_size')).map(quiet)}
            </RowsCard>
          </>
        )}
      </RadioGroup>
      {commit(validDose ? doseEcho(dose!) : picked?.echo ?? null, action, { kind: 'leave_product', supplyId })}
    </>
  )
}

/** Two fitting lines: pick the one used, then the button saves it for this load's full context. */
function ConflictAnswer({ question, pending, commit, loadSize, titleId }: AnswerProps & { loadSize?: LoadSize }) {
  const [picked, setPicked] = useState<string | null>(null)
  const supplyId = question.product?.supplyId ?? question.key.subjectId
  const rows = question.rows ?? []
  const index = rows.findIndex((row) => row.ruleId === picked)
  const row = index < 0 ? null : rows[index]!
  const echo = row === null ? null : row.rowText === null ? questionText.useLine(row.row ?? index + 1) : questionText.useTyped(row.rowText)
  return (
    <>
      <RadioGroup aria-labelledby={titleId} value={picked ?? ''} disabled={pending} onValueChange={(value) => setPicked(String(value))} className="grid gap-2">
        {rows.map((entry, position) => (
          <PickCard
            key={entry.ruleId}
            value={entry.ruleId}
            title={entry.rowText === null ? questionText.line(entry.row ?? position + 1) : `“${entry.rowText}”`}
            fact={<DoseFigure dose={entry.dose} size="inline" />}
          />
        ))}
      </RadioGroup>
      {commit(echo, row === null ? null : { kind: 'label_row', args: conflictChoiceArgs(question, supplyId, row, loadSize) }, { kind: 'leave_product', supplyId })}
    </>
  )
}
