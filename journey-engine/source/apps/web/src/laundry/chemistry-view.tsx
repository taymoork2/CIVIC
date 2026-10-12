import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DesignIcon } from '@/kit/design-icons'
import { useState, type ReactNode } from 'react'

import { cycleWord, countWord, loadSizeWords, loadText } from '@/copy'
import { chemistryText } from '@/copy-laundry'
import { chemRunText } from '@/copy-run'
import { stageWord, type MachineFacts, type MachineStepAction } from '@/laundry/machine-step'
import { LoadCard } from '@/laundry/laundry-kit'
import { Callout, Note, Section, TaskHeading } from '@/laundry/laundry-ui'
import { RecordRow, StatusMark } from '@/kit/record-row'
import { TaskFooter } from '@/kit/task-footer'
import { DoseFigure, clockTime, slotName } from '@/kit/ui'
import { localizeTemperatures, useUnits, type DoseLike } from '@/kit/units'

/**
 * Chemistry: what goes in the drum and each dispenser, and how much, read only from the steps the
 * plan recorded for this load and washer. A dose the record does not hold says "Not recorded"; the
 * screen never turns garment weight and a rated capacity into a "how full" figure, and it asks
 * nothing itself: a product whose label goes by how full the drum is waits for the person to look
 * at the drum once the clothes are in. By-hand additions during the cycle are listed only when the
 * product record says when, and a reminder is promised only when it gives a time.
 */

/** What the screen reads from a session's step. */
export type ChemistryAction = Pick<MachineStepAction, 'id' | 'kind' | 'task' | 'phase' | 'title' | 'detail' | 'supplyId' | 'supplyName' | 'textileId' | 'textileName' | 'timing' | 'dose' | 'placement' | 'atMachine'> & {
  readonly soak?: import('@washcloset/planner').TreatmentStep['soak']
  readonly soakStarted?: { readonly at: number }
  readonly order: number
  readonly status: string
  readonly basis?: string
  /** Minutes after Start the record puts this step at, when it gives a time. */
  readonly offsetMinutes?: number | null
  readonly dueAt?: number | null
  readonly windowStartAt?: number
  readonly windowEndAt?: number
}

export type ChemistryAmount =
  | { readonly kind: 'at_container' }
  | { readonly kind: 'dose'; readonly dose: DoseLike }
  /** The label goes by how full the drum is: the lines it may choose between, decided at the machine. */
  | { readonly kind: 'at_machine'; readonly lines: readonly { readonly size: string; readonly dose: DoseLike; readonly rowText: string | null }[] }
  | { readonly kind: 'not_recorded' }
  /** A row with no amount to give: the clothes going in, in their place in the drum's order. */
  | { readonly kind: 'none' }

export type ChemistryRow = {
  readonly id: string
  /** What the step is for, above its name: Clothes, Detergent, Softener, Pretreat. */
  readonly stage: string
  readonly product: string
  readonly where: string
  readonly amount: ChemistryAmount
  /** The record's own words for when (a by-hand addition), and what the app will remind about. */
  readonly when: string | null
  readonly reminder: string | null
  readonly basis: string | null
  readonly done: boolean
}

export type ChemistryGroupKey = 'pretreat' | 'drum' | 'dispenser' | 'cycle'
export type ChemistryGroup = { readonly key: ChemistryGroupKey; readonly title: string; readonly rows: readonly ChemistryRow[] }

const groupOrder: readonly ChemistryGroupKey[] = ['pretreat', 'drum', 'dispenser', 'cycle']

/** `clothes` lets the load task stand in the drum's order, between what goes in before and with them. */
function groupKey(action: ChemistryAction, clothes = false): ChemistryGroupKey | null {
  if (action.kind === 'task') return clothes && action.task === 'load' ? 'drum' : null
  if (action.phase === 'drum') return action.textileId === undefined ? 'drum' : 'pretreat'
  // What goes in with the clothes is part of the drum's order.
  if (action.phase === 'with_load') return 'drum'
  if (action.phase === 'dispenser') return 'dispenser'
  // A by-hand addition during the cycle is listed only when the product record says when.
  if (action.phase === 'cycle') return action.timing == null || action.timing.trim().length === 0 ? null : 'cycle'
  return null
}

/** Whether the load has a by-hand addition the record times: only these are shown during the cycle. */
export function byHandActions<Step extends ChemistryAction>(actions: readonly Step[]): Step[] {
  return actions.filter((action) => groupKey(action) === 'cycle')
}

/** When a by-hand step is due, from the clock the record's offset gave once the machine started; null before. */
export function byHandDue(action: Pick<ChemistryAction, 'dueAt' | 'windowStartAt' | 'windowEndAt'>): string | null {
  if (action.dueAt !== undefined && action.dueAt !== null) return chemistryText.dueAt(clockTime(action.dueAt), false)
  if (action.windowStartAt !== undefined && action.windowEndAt !== undefined) return chemistryText.dueAt(clockTime(action.windowStartAt + (action.windowEndAt - action.windowStartAt) / 2), true)
  return null
}

function amountOf(action: ChemistryAction): ChemistryAmount {
  const dose = action.dose
  if (action.kind === 'task') return { kind: 'none' }
  if (action.soak !== undefined && action.soakStarted === undefined) return { kind: 'at_container' }
  if (dose === null || dose.unit === 'unknown') return { kind: 'not_recorded' }
  if (dose.unit === 'at_machine') {
    const lines = (action.atMachine?.candidates ?? []).map((candidate) => ({ size: candidate.size, dose: { ...candidate.dose, mark: candidate.dose.mark ?? null } as DoseLike, rowText: candidate.rowText }))
    return { kind: 'at_machine', lines }
  }
  return { kind: 'dose', dose: { ...dose, mark: dose.mark ?? null, equivalent: dose.equivalent ?? null } }
}

function reminderOf(action: ChemistryAction): string | null {
  const minutes = action.offsetMinutes
  return minutes === undefined || minutes === null ? chemistryText.noReminder : chemistryText.reminderAt(Math.max(1, Math.round(minutes)))
}

export function chemistryGroups(
  actions: readonly ChemistryAction[],
  doorLocks: boolean,
  options: { readonly clothes?: boolean; readonly productUse?: MachineFacts['productUse'] } = {},
): ChemistryGroup[] {
  const ordered = [...actions].sort((left, right) => left.order - right.order)
  return groupOrder.flatMap((key) => {
    const rows = ordered.filter((action) => groupKey(action, options.clothes) === key).map((action): ChemistryRow => ({
      id: action.id,
      stage: stageWord(action, { doorLocks, productUse: options.productUse }),
      product: action.kind === 'task' ? action.title ?? chemistryText.thisGarment : action.supplyName ?? chemistryText.aProduct,
      where: action.kind === 'task' ? action.detail ?? '' : key === 'pretreat' ? chemistryText.applyTo(action.textileName ?? chemistryText.thisGarment) : slotName(action.placement, doorLocks),
      amount: amountOf(action),
      when: key === 'cycle' || key === 'pretreat' ? action.timing ?? null : null,
      reminder: key === 'cycle' ? reminderOf(action) : null,
      basis: action.basis === undefined || action.basis.length === 0 ? null : action.basis,
      done: action.status !== 'pending',
    }))
    return rows.length === 0 ? [] : [{ key, title: chemRunText.groups[key], rows }]
  })
}

/** The cycle, then its length when the washer's record has one. Never a guessed time. */
export function chemistrySettings(facts: { readonly cycle: string | null; readonly cycleMinutes: number | null; readonly startDetail: string | null }): readonly string[] {
  return [
    facts.startDetail ?? (cycleWord(facts.cycle) === null ? null : chemistryText.cycleName(cycleWord(facts.cycle)!)),
    facts.cycleMinutes === null ? chemistryText.cycleLengthNotRecorded : chemistryText.cycleLength(facts.cycleMinutes),
  ].filter((line): line is string => line !== null)
}

// ---- Drawing it ------------------------------------------------------------------------

const amountClassName = cn(
  "chemistry-amount",
  "flex-none max-w-[40%] text-end text-[length:var(--step-0)] font-semibold tabular-nums",
)

function Amount({ amount }: { amount: ChemistryAmount }) {
  if (amount.kind === 'none') return null
  if (amount.kind === 'at_container') return <span className={cn(amountClassName, "font-normal text-muted-foreground")}>Measured at the container</span>
  if (amount.kind === 'not_recorded') return <span className={cn(amountClassName, "text-hamper-ink")}>{chemistryText.notRecorded}</span>
  if (amount.kind === 'at_machine') return <span className={cn(amountClassName, "font-normal text-muted-foreground")}>{chemistryText.chosenAtDrum}</span>
  return <span className={amountClassName}><DoseFigure dose={amount.dose} size="inline" /></span>
}

function SizeLines({ lines }: { lines: Extract<ChemistryAmount, { kind: 'at_machine' }>['lines'] }) {
  if (lines.length === 0) return null
  return (
    <ul className="m-0 grid gap-1 text-[length:var(--step--1)] leading-[1.45] text-muted-foreground">
      {lines.map((line) => (
        <li key={`${line.size}-${line.dose.amount}-${line.dose.mark ?? ''}-${line.dose.fractionOfMark ?? 1}`}>
          {chemistryText.sizeLine(loadSizeWords[line.size as keyof typeof loadSizeWords] ?? line.size)}: <DoseFigure dose={line.dose} size="inline" />{line.rowText === null ? null : ` “${line.rowText}”`}
        </li>
      ))}
    </ul>
  )
}

const stageClassName = "text-[length:var(--step--1)] font-semibold leading-[1.3] text-muted-foreground"

/** One step of the recipe: its stage, the bottle, where it goes, the amount at the end, and the rule behind it a tap away. */
function ChemistryLine({ row, roomy = false }: { row: ChemistryRow; /** In the one "Into the washer" list: a 48px picture tile and room around the row. */ roomy?: boolean }) {
  const [basis, setBasis] = useState(false)
  const lines = row.amount.kind === 'at_machine' ? row.amount.lines : []
  return (
    <li className={cn('grid gap-1 [&+&]:[border-block-start:1px_solid_var(--line)]', roomy ? 'px-4 py-3.5' : 'py-2')}>
      <div className="flex items-center gap-3">
        <span className={cn('flex flex-none items-center justify-center text-ink', roomy ? 'size-12 rounded-[14px] bg-[var(--bg)] [&_svg]:size-7' : 'size-9 rounded-[12px] bg-surface-2 [&_svg]:size-5')} aria-hidden="true"><DesignIcon name={row.amount.kind === 'none' ? 'tee' : row.amount.kind === 'dose' && /^sprays?$/i.test(row.amount.dose.unit) ? 'spray' : 'bottle'} strokeWidth={1.6} /></span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          {row.stage === '' ? null : <span className={stageClassName}>{row.stage}</span>}
          <span className="text-[length:var(--step-0)] font-semibold leading-[1.3]">{row.product}</span>
          {row.where === '' ? null : <span className="text-[length:var(--step--1)] leading-[1.45] text-muted-foreground">{row.where}</span>}
          {row.done ? <span className="mt-1 flex"><StatusMark tone="done" /></span> : null}
        </span>
        <Amount amount={row.amount} />
      </div>
      <div className={cn('grid gap-1', roomy ? 'ps-[60px]' : 'ps-12')}>
        {row.when === null ? null : <span className="text-[length:var(--step--1)] text-muted-foreground">{chemistryText.when(row.when)}</span>}
        {row.reminder === null ? null : <span className="text-[length:var(--step--1)] text-muted-foreground">{row.reminder}</span>}
        <SizeLines lines={lines} />
        {row.basis === null ? null : (
          <>
            <Button variant="ghost" size="sm" type="button" className="min-h-11 justify-self-start px-0 text-[length:var(--step--1)] text-[var(--sig-ink)]" aria-expanded={basis} onClick={() => setBasis(!basis)}>{basis ? chemistryText.hideBasis : chemistryText.basis}</Button>
            {basis ? <span className="text-[length:var(--step--1)] leading-[1.45] text-muted-foreground">{row.basis}</span> : null}
          </>
        )}
      </div>
    </li>
  )
}

/** The washer's recorded type beside "This load": HE, standard, or not recorded. Never assumed. */
export function machineTypeWord(highEfficiency: boolean | null | undefined): string {
  return highEfficiency === true ? chemRunText.machineHe : highEfficiency === false ? chemRunText.machineStandard : chemRunText.machineHeNotRecorded
}

/** What goes in the drum and each dispenser, grouped as the machine is filled, in one card. */
export function ChemistryGroups({ groups, heading, caption, settings }: {
  groups: readonly ChemistryGroup[]
  heading?: ReactNode
  caption?: ReactNode
  settings?: readonly string[]
}) {
  return (
    <section className="grid gap-3" aria-label={typeof heading === 'string' ? heading : chemistryText.thisLoad}>
      {heading === undefined ? null : (
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="m-0 text-[length:var(--step-2)] font-semibold leading-[1.3]">{heading}</h2>
          {caption === undefined ? null : <span className="text-end text-[length:var(--step--1)] text-muted-foreground">{caption}</span>}
        </div>
      )}
      <div className="grid gap-3.5 rounded-card bg-card p-4 shadow-[var(--shadow-sm)]">
        {groups.map((group) => (
          <div key={group.key} className="grid">
            <h3 className="pb-1 text-[length:var(--step--1)] font-semibold text-muted-foreground">{group.title}</h3>
            <ul className="m-0 grid">{group.rows.map((row) => <ChemistryLine key={row.id} row={row} />)}</ul>
          </div>
        ))}
        {settings === undefined || settings.length === 0 ? null : (
          <div className="grid">
            <h3 className="pb-1 text-[length:var(--step--1)] font-semibold text-muted-foreground">{chemRunText.settings}</h3>
            <div className="flex items-center gap-3 py-2">
              <span className="flex size-9 flex-none items-center justify-center rounded-[12px] bg-surface-2 text-ink [&_svg]:size-5" aria-hidden="true"><DesignIcon name="washer" strokeWidth={1.6} /></span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className={stageClassName}>{chemRunText.settings}</span>
                <span className="text-[length:var(--step-0)] font-semibold leading-[1.3]">{settings[0]}</span>
                {settings.length > 1 ? <span className="text-[length:var(--step--1)] leading-[1.45] text-muted-foreground">{settings.slice(1).join(' · ')}</span> : null}
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

/** One row of matching pieces going in ("White tee ×2"); `key` is the matching key when the row comes from one. */
export type LoadPiece = { readonly key?: string; readonly label: string; readonly count: number; readonly guest?: boolean; readonly media?: ReactNode; readonly kind?: string | null; readonly colorGroup?: string | null }

/** The pieces going into the machine, with counts; the loading order is named only when a record has one. */
export function GoingInto({ title, pieces, washer, children }: { title: string; pieces: readonly LoadPiece[]; washer: string; children?: ReactNode }) {
  const total = pieces.reduce((sum, piece) => sum + piece.count, 0)
  return (
    <>
      <Section heading={title} caption={countWord(total, 'piece')} label={chemistryText.goingInto(washer)}>
        {pieces.map((piece) => <RecordRow key={piece.key ?? piece.label} media={piece.media ?? <DesignIcon name="tee" strokeWidth={1.6} />} title={piece.count > 1 ? `${piece.label} ×${piece.count}` : piece.label} fact={piece.guest ? loadText.guestItem : undefined} />)}
      </Section>
      {children}
    </>
  )
}

/** The steps in the order the machine is filled, then the cycle, as one list of picture rows. */
function IntoTheWasher({ groups, settings, machineFact }: { groups: readonly ChemistryGroup[]; settings: readonly string[]; machineFact: string }) {
  return (
    <section aria-label={chemistryText.intoTheWasher} className="grid gap-2.5">
      <h2 className="m-0 px-1 text-[length:var(--step-2)] font-semibold leading-[1.3]">{chemistryText.intoTheWasher}</h2>
      <ul role="list" className="m-0 grid list-none overflow-hidden rounded-card bg-surface p-0 shadow-[var(--e1)]">
        {groups.flatMap((group) => group.rows).map((row) => <ChemistryLine key={row.id} row={row} roomy />)}
        {settings.length === 0 ? null : (
          <li className="flex items-center gap-3 px-4 py-3.5 [&+&]:[border-block-start:1px_solid_var(--line)]">
            <span className="flex size-12 flex-none items-center justify-center rounded-[14px] bg-[var(--bg)] text-ink [&_svg]:size-7" aria-hidden="true"><DesignIcon name="washer" strokeWidth={1.6} /></span>
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="text-[length:var(--step-0)] font-semibold leading-[1.3]">{settings[0]}</span>
              <span className="text-[length:var(--step--1)] leading-[1.45] text-muted-foreground">{[machineFact, ...settings.slice(1)].join(' · ')}</span>
            </span>
          </li>
        )}
      </ul>
    </section>
  )
}

/**
 * The whole "What goes in" screen, as the design draws it: the one load card (its pieces and where it is),
 * "Into the washer" as one list (each product with its dose, then the cycle), a yellow notice for what is
 * still unsettled; the footer carries the one way forward and says preparation is not the start.
 */
export function ChemistryScreen({ groups, settings, pieces, washer, unrecorded, startAmounts, onContinue, continueLabel, disabled, extra, back, machineFact, place }: {
  groups: readonly ChemistryGroup[]
  settings: readonly string[]
  pieces: readonly LoadPiece[]
  washer: string
  /** Some row has no recorded dose. */
  unrecorded: boolean
  /** The drum's fullness picture is asked after the clothes are in. */
  startAmounts: boolean
  onContinue: () => void
  continueLabel: string
  disabled: boolean
  extra?: ReactNode
  back: ReactNode
  /** The washer with its recorded type, on the cycle row. */
  machineFact?: string
  /** Where the load sits in the day, when the plan kept it. */
  place?: { readonly name: string; readonly number: number; readonly count: number } | null
}) {
  const { system } = useUnits()
  return (
    <>
      <TaskHeading title={chemistryText.title} back={back} {...(place == null ? {} : { eyebrow: chemistryText.loadLine(place.number, place.count, place.name) })} {...(unrecorded ? { mark: { tone: 'waiting' as const } } : {})} />
      <LoadCard label={chemistryText.thisLoad} at={0}
        pieces={pieces.map((piece) => ({ key: piece.key ?? piece.label, kind: piece.kind ?? null, colorGroup: piece.colorGroup ?? null, label: piece.guest === true ? `${piece.label} (${loadText.guestItem})` : piece.label, count: piece.count }))} />
      {groups.length === 0
        ? <Note>{chemistryText.nothingRecorded}</Note>
        : <IntoTheWasher groups={groups} machineFact={machineFact ?? washer} settings={settings.map((line) => localizeTemperatures(line, system))} />}
      {startAmounts ? <Callout>{chemistryText.fullnessAfterLoading}</Callout> : null}
      {unrecorded ? <Callout>{chemistryText.unrecordedNote}</Callout> : null}
      {extra}
      <TaskFooter note={chemRunText.preparationNote}>
        <Button type="button" size="lg" className="w-full" disabled={disabled} onClick={onContinue}>{continueLabel}</Button>
      </TaskFooter>
    </>
  )
}
