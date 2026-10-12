import { Alert, AlertActions } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { useQuery } from 'convex/react'
import { useContext, useId, useState, type ComponentProps, type ReactElement, type ReactNode, type Ref } from 'react'

import { api } from '@/api'
import { dryingText } from '@/copy'
import { washerPathText } from '@/copy-laundry'
import { trialText } from '@/copy-trial'
import { MediaTile, StatusMark, type MarkTone } from '@/kit/record-row'
import { doseParts, useUnits, type DoseLike } from '@/kit/units'
import { DesignIcon } from '@/kit/design-icons'
import { FeedbackContext } from '@/kit/feedback-context'

/**
 * The few shapes the laundry task screens share, built from the shared primitives: a task heading
 * (back, 30px title, status mark and a caption), a section (20px heading, caption, grouped card, an
 * optional action row inside the card), a banner, the numbered steps card, the change card, the
 * quantity stepper and the switch row. Presentation only: every screen keeps its own behaviour.
 */

const captionClassName = 'text-[length:var(--step--1)] leading-[1.45] text-muted-foreground'

/** The way back, top left of every task screen: a 44px target that is never the only exit. */
export function BackButton({ label, onClick, render, disabled }: { label: string; onClick?: () => void; render?: ReactElement; disabled?: boolean }) {
  return (
    <Button variant="ghost" size="icon" type="button" className="-ms-2 rounded-control" aria-label={label} disabled={disabled} onClick={onClick} render={render}>
      <DesignIcon name="arrowLeft" size="1em" className="size-[22px]" aria-hidden="true"  />
    </Button>
  )
}

/** Back, then the page title at 30, then a status mark with its caption. */
export function TaskHeading({ title, eyebrow, mark, caption, back, titleRef, compact = false }: {
  title: ReactNode
  /** A quiet line over the title, such as the load's place in the day. */
  eyebrow?: ReactNode
  mark?: { tone: MarkTone; text?: string }
  caption?: ReactNode
  back?: ReactNode
  titleRef?: Ref<HTMLHeadingElement>
  compact?: boolean
}) {
  const feedback = useContext(FeedbackContext)
  const [reporting, setReporting] = useState(false)
  const reportButton = feedback === null ? null : <Button type="button" variant="ghost" size="icon" aria-label="Report a problem" title="Report a problem" onClick={() => setReporting(true)}><DesignIcon name="chat" size="1em" aria-hidden="true" /></Button>
  const heading = <>
    {eyebrow === undefined ? null : <p className={cn(captionClassName, 'm-0 min-w-0 [overflow-wrap:anywhere]')}>{eyebrow}</p>}
    <h1 ref={titleRef} tabIndex={titleRef === undefined ? undefined : -1} className={cn('m-0 min-w-0 font-semibold leading-[1.2] tracking-normal text-balance [overflow-wrap:anywhere] focus:outline-none', compact ? 'text-[length:var(--step-0)] text-ink-2' : 'text-[length:var(--step-4)]')}>{title}</h1>
    {mark === undefined && caption === undefined ? null : <div className="flex flex-wrap items-center gap-2">
      {mark === undefined ? null : <StatusMark tone={mark.tone}>{mark.text}</StatusMark>}
      {caption === undefined ? null : <span className={cn(captionClassName, 'min-w-0 [overflow-wrap:anywhere]')}>{caption}</span>}
    </div>}
  </>
  return (
    <header className="grid min-w-0 gap-2">
      {compact ? <div className="flex min-w-0 items-start gap-2">{back}<div className="grid min-w-0 flex-1 gap-1 py-2">{heading}</div>{reportButton}</div> : <>
        {back === undefined && feedback === null ? null : <div className="-mb-1 flex min-h-12 items-center justify-between">{back}<span className="ms-auto">{reportButton}</span></div>}
        {heading}
      </>}
      {reporting && feedback !== null ? feedback(() => setReporting(false)) : null}
    </header>
  )
}

/** A heading with a caption on the right, over one grouped card of rows. `foot` is a row inside the card. */
export function Section({ heading, caption, children, foot, label }: {
  heading?: ReactNode
  caption?: ReactNode
  children: ReactNode
  foot?: ReactNode
  label?: string
}) {
  return (
    <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3" aria-label={heading === undefined ? label : undefined}>
      {heading === undefined && caption === undefined ? null : (
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
          <h2 className="m-0 min-w-0 text-[length:var(--step-2)] font-semibold leading-[1.3] [overflow-wrap:anywhere]">{heading}</h2>
          {caption === undefined ? null : <span className={cn(captionClassName, 'text-end')}>{caption}</span>}
        </div>
      )}
      <ItemGroup>{children}{foot}</ItemGroup>
    </section>
  )
}

/** Plain explanatory text between sections: caption size, muted. */
export function Note({ children, role }: { children: ReactNode; role?: 'status' }) {
  return <p className={cn('m-0 max-w-none', captionClassName)} role={role}>{children}</p>
}

/** The text with its first letter in capitals. */
export const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** A full-width large action button. */
export const largeClassName = cn(
  "large",
  "[.he-logo&]:w-[3rem] [.he-logo&]:h-[3rem]",
  "[.button&]:min-h-[3.5rem] [.button&]:w-full",
  "[.button&]:text-[length:var(--step-1)]",
)

const trialNoteClassName = cn(
  "trial-note",
  "m-0 max-w-none rounded-control border border-dashed border-line px-3 py-2",
  "text-[length:var(--step--1)] leading-[1.45] text-ink-2",
)

/**
 * For the owner's phone trial only: marks a place where the app's dose and care thinking is still
 * hand-fed, mocked or unfinished. Builds without VITE_TRIAL_NOTES=1 render nothing.
 */
export function TrialNote({ children }: { children: ReactNode }) {
  if (import.meta.env.VITE_TRIAL_NOTES !== '1') return null
  return <p className={trialNoteClassName}><strong className="font-semibold">{trialText.label} · </strong>{children}</p>
}

/** A boxed notice. Yellow needs a person to look, red cannot be used together, blue is already running. Actions only change this load. */
export function Callout({ tone = 'confirm', children, actions, role = 'status' }: {
  tone?: 'confirm' | 'conflict' | 'washing'
  children: ReactNode
  actions?: readonly { readonly label: string; readonly onClick: () => void }[]
  role?: 'status' | 'group' | 'alert'
}) {
  return (
    <Alert variant={tone === 'washing' ? 'default' : tone} role={role} className={cn('rounded-control px-3.5 pt-3 pb-1 gap-0.5', tone === 'washing' && 'bg-washing-bg text-washing-ink [box-shadow:none]')}>
      <p className="m-0 min-w-0 max-w-none pb-2 text-[length:var(--step-0)] leading-normal [overflow-wrap:anywhere]">{children}</p>
      {actions === undefined || actions.length === 0 ? null : (
        <AlertActions className="ps-0">
          {actions.map((action) => <Button key={action.label} variant="alert" size="unstyled" type="button" onClick={action.onClick}>{action.label}</Button>)}
        </AlertActions>
      )}
    </Alert>
  )
}

/**
 * Two or three short answers to one question: one row of equal-width buttons, 44px at least, that
 * wraps to a second row (never a stack of full-width bars) when the text is large. `label` names
 * the group for assistive technology; a visible question belongs above it.
 */
export function AnswerRow({ label, answers, disabled, large = false }: {
  label: string
  answers: readonly { readonly key?: string; readonly label: string; readonly onClick: () => void; readonly disabled?: boolean; readonly pressed?: boolean; readonly primary?: boolean; /** A symbol above the words. */ readonly icon?: ReactNode; readonly data?: Readonly<Record<`data-${string}`, string>> }[]
  disabled?: boolean
  /** In a task footer: 48px, the height of its primary. */
  large?: boolean
}) {
  return (
    <div role="group" aria-label={label} className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,5.5rem),1fr))] gap-2">
      {answers.map((answer) => (
        <Button key={answer.key ?? answer.label} type="button" variant={answer.pressed === true || answer.primary === true ? 'default' : 'outline'} aria-pressed={answer.pressed} disabled={disabled === true || answer.disabled === true}
          className={cn('min-w-0 whitespace-normal px-3 py-2 text-center leading-snug [overflow-wrap:anywhere]', large ? 'min-h-12 text-[length:var(--step-1)]' : 'min-h-11 text-[length:var(--step-0)]')} onClick={answer.onClick} {...answer.data}>{answer.icon === undefined ? answer.label : <span className="grid justify-items-center gap-1">{answer.icon}{answer.label}</span>}</Button>
      ))}
    </div>
  )
}

/** One choice out of a few kept as a setting (loads a day, rack size): the shared segment control, wrapping under large text. */
export function SegmentChoice({ label, value, options, onChange, disabled, labelledBy }: {
  label?: string
  labelledBy?: string
  value: string
  options: readonly { readonly value: string; readonly label: ReactNode }[]
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <RadioGroup variant="segment" aria-label={label} aria-labelledby={labelledBy} value={value} disabled={disabled} className="flex-wrap" onValueChange={(next) => onChange(String(next))}>
      {options.map((option) => <RadioGroupItem key={option.value} variant="segment" value={option.value} className="min-w-0 flex-[1_1_4.5rem] whitespace-normal py-2 text-center">{option.label}</RadioGroupItem>)}
    </RadioGroup>
  )
}

/**
 * Four or more actions: one grouped card of divider rows, the recommended action first, and rare or
 * final ones (Retire it, Remove) last with `quiet`. Two actions sit side by side in an `AnswerRow`.
 */
type ListAction = { readonly key?: string; readonly label: string; readonly hint?: string; readonly onClick: () => void; readonly disabled?: boolean; readonly quiet?: boolean; readonly data?: Readonly<Record<`data-${string}`, string>> }

export function ActionList({ label, actions, chevrons = false }: { label: string; actions: readonly ListAction[]; /** A caret at the end of each row: the row opens something. */ chevrons?: boolean }) {
  return (
    <ItemGroup aria-label={label}>
      {actions.map((action) => (
        <li key={action.key ?? action.label} className="[&+&]:[border-block-start:1px_solid_var(--line)]">
          <Item size="sm" variant="interactive" render={<Button variant="unstyled" size="unstyled" type="button" className="disabled:cursor-not-allowed disabled:opacity-60" disabled={action.disabled} onClick={action.onClick} {...action.data} />}>
            <ItemContent>
              <ItemTitle className={cn('text-[length:var(--step-0)]', action.quiet === true && 'font-normal text-muted-foreground')}>{action.label}</ItemTitle>
              {action.hint === undefined ? null : <ItemDescription>{action.hint}</ItemDescription>}
            </ItemContent>
            {chevrons ? <DesignIcon name="chevronRight" size="1em" strokeWidth={2.2} className="size-4 flex-none text-muted-foreground" aria-hidden="true"  /> : null}
          </Item>
        </li>
      ))}
    </ItemGroup>
  )
}

/** A piece that waits: its one plain line, then what to do about it as one short list. */
export function HeldNote({ title, label, actions }: { title: string; label: string; actions: readonly ListAction[] }) {
  return (
    <div className="m-[0_var(--space-3)_var(--space-3)] grid min-w-0 gap-2">
      <p className="text-[length:var(--step--1)] text-muted-foreground [overflow-wrap:anywhere]">{title}</p>
      <ActionList label={label} actions={actions} />
    </div>
  )
}

/** The right shape for however many actions there are: up to two side by side, three or more as one grouped list. */
export function ActionGroup({ label, actions }: { label: string; actions: readonly ListAction[] }) {
  return actions.length <= 2 ? <AnswerRow label={label} answers={actions} /> : <ActionList label={label} actions={actions} />
}

/** The numbered steps of a recipe or a dryer load, in a card; `unresolved` steps wear the amber mark in place of an amount. */
export function StepsCard({ heading, note, steps }: {
  heading: ReactNode
  note?: ReactNode
  steps: readonly { readonly text: ReactNode; readonly unresolved?: boolean; readonly muted?: boolean }[]
}) {
  return (
    <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 min-w-0 text-[length:var(--step-2)] font-semibold leading-[1.3] [overflow-wrap:anywhere]">{heading}</h2>
        {note === undefined || note === '' ? null : <span className="text-[length:var(--step--1)] font-semibold text-link">{note}</span>}
      </div>
      <ol className="m-0 rounded-card bg-card px-4 py-1 shadow-[var(--shadow-sm)]">
        {steps.map((step, index) => (
          <li key={index} className="flex min-w-0 flex-wrap gap-3 py-3 text-[length:var(--step-0)] leading-normal [&+&]:[border-block-start:1px_solid_var(--line)]">
            <span className="min-w-3.5 font-semibold text-link">{index + 1}</span>
            <span className={cn('min-w-0 flex-1 [overflow-wrap:anywhere]', step.muted === true && 'text-muted-foreground')}>{step.text}</span>
            {step.unresolved === true ? <StatusMark tone="waiting">Unresolved</StatusMark> : null}
          </li>
        ))}
      </ol>
    </section>
  )
}

/** What changes against another washer or product: the old line struck through, the new one beneath. */
export function ChangeCard({ heading, changes }: { heading: ReactNode; changes: readonly { readonly title?: string; readonly from?: string; readonly to: string }[] }) {
  return (
    <section className="grid gap-3">
      <h2 className="m-0 text-[length:var(--step-2)] font-semibold leading-[1.3]">{heading}</h2>
      <ul className="m-0 rounded-card bg-accent px-4 py-1 shadow-[var(--shadow-sm)]">
        {changes.map((change, index) => (
          <li key={index} className="grid gap-0.5 py-2.5 [&+&]:[border-block-start:1px_solid_var(--line)]">
            {change.title === undefined ? null : <span className="text-[length:var(--step--1)] font-semibold text-washing-ink">{change.title}</span>}
            {change.from === undefined ? null : <span className={cn(captionClassName, 'line-through')}>{change.from}</span>}
            <span className="text-[length:var(--step-0)] font-semibold">{change.to}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Fewer, the count and more: 44px targets, the count in tabular figures. Sits at the end of a row. */
export function QuantityStepper({ value, min = 0, max, onChange, label, disabled }: { value: number; min?: number; max: number; onChange: (next: number) => void; label: string; disabled?: boolean }) {
  // The design's stepper: 44px tonal squares at the control radius, a bare minus and plus, dimmed at the ends.
  const keyClassName = 'size-11 flex-none cursor-pointer touch-manipulation select-none rounded-control border-0 bg-surface-2 text-[length:1.25rem] font-semibold leading-none text-ink disabled:cursor-default disabled:opacity-35 motion-safe:[transition:transform_var(--dur-press)_var(--ease-out),_background-color_var(--dur-press)_var(--ease-out)] [@media_(hover:_hover)_and_(pointer:_fine)]:[&:hover:not(:disabled)]:[background:color-mix(in_srgb,_var(--surface-2)_85%,_var(--ink))] [&:active:not(:disabled)]:[background:color-mix(in_srgb,_var(--surface-2)_85%,_var(--ink))] motion-safe:[&:active:not(:disabled)]:[transform:scale(.97)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring'
  return (
    <span className="flex flex-none items-center gap-1" role="group" aria-label={label}>
      <button type="button" className={keyClassName} aria-label={`Fewer ${label}`} disabled={disabled === true || value <= min} onClick={() => onChange(value - 1)}>−</button>
      <span className="min-w-7 text-center text-[length:1rem] font-semibold tabular-nums" aria-live="polite">{value}</span>
      <button type="button" className={keyClassName} aria-label={`More ${label}`} disabled={disabled === true || value >= max} onClick={() => onChange(value + 1)}>+</button>
    </span>
  )
}

/** The whole row toggles; checklist selections use a checkbox rather than a setting switch. */
export function SwitchRow({ media, dot, title, fact, on, onToggle, issues, disabled, highlightSelected, role = 'switch' }: {
  media: ReactNode
  dot?: string
  title: ReactNode
  fact?: ReactNode
  on: boolean
  onToggle: () => void
  issues?: ReactNode
  disabled?: boolean
  role?: 'switch' | 'checkbox'
  /** Selected laundry pieces retain their selection fill as well as the check. */
  highlightSelected?: boolean
}) {
  return (
    <li className="[&+&]:[border-block-start:1px_solid_var(--line)]" data-state={on ? 'on' : 'off'}>
      <Item variant="interactive" className={highlightSelected && on ? 'bg-accent' : undefined} render={<Button variant="unstyled" size="unstyled" type="button" role={role} aria-checked={on} disabled={disabled} onClick={onToggle} />}>
        <MediaTile media={media} dot={dot} />
        <ItemContent>
          <ItemTitle>{title}</ItemTitle>
          {fact === undefined ? null : <ItemDescription>{fact}</ItemDescription>}
        </ItemContent>
        {role === 'checkbox' ? <CheckMark on={on} /> : <SwitchMark on={on} />}
      </Item>
      {issues}
    </li>
  )
}

export function SwitchMark({ on }: { on: boolean }) {
  return <span data-slot="switch-mark" className={cn('flex h-7 w-12 flex-none items-center rounded-full border-2 p-0.5', on ? 'justify-end border-link bg-link' : 'justify-start border-ink-2 bg-surface-2')} aria-hidden="true">
    <span className={cn('size-5 rounded-full shadow-sm', on ? 'bg-background' : 'bg-ink-2')} />
  </span>
}

export function CheckMark({ on }: { on: boolean }) {
  return <span data-slot="check-mark" className={cn('grid size-6 flex-none place-items-center rounded-[6px] border-2', on ? 'border-link bg-link text-[var(--bg)]' : 'border-ink-2 bg-surface')} aria-hidden="true">
    {on ? <DesignIcon name="check" size={16} strokeWidth={2.2} /> : null}
  </span>
}

/** A radio's ring and centre dot; never an independent on/off control. */
export function Ring({ on }: { on: boolean }) {
  return (
    <span className={cn('flex size-[22px] flex-none items-center justify-center rounded-full border-2', on ? 'border-link' : 'border-line')} aria-hidden="true">
      <span className={cn('size-2.5 rounded-full bg-link', on ? 'opacity-100' : 'opacity-0')} />
    </span>
  )
}

/** A labelled single-line field: the label at 16, the input at 48, an error under it in the conflict tone. */
/** `help`: a HelpTip beside the label, outside it, so the input's name stays the label alone. */
export function TextField({ label, error, hint, help, id, ...input }: { label: ReactNode; error?: string | null; hint?: ReactNode; help?: ReactNode } & ComponentProps<typeof Input>) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const hasError = error !== undefined && error !== null
  const hasHint = hint !== undefined && hint !== null
  const describedBy = [input['aria-describedby'], hasHint ? `${fieldId}-hint` : null, hasError ? `${fieldId}-error` : null].filter(Boolean).join(' ') || undefined
  return (
    <div className="grid gap-2">
      {help === undefined
        ? <label htmlFor={fieldId} className="text-[length:var(--step-1)] font-semibold">{label}</label>
        : <div className="flex items-center gap-1"><label htmlFor={fieldId} className="text-[length:var(--step-1)] font-semibold">{label}</label>{help}</div>}
      <Input {...input} id={fieldId} aria-invalid={hasError ? true : input['aria-invalid']} aria-describedby={describedBy} />
      {hasHint ? <span id={`${fieldId}-hint`} className={captionClassName}>{hint}</span> : null}
      {hasError ? <span id={`${fieldId}-error`} role="alert" className="text-[length:var(--step--1)] font-semibold text-warning-ink">{error}</span> : null}
    </div>
  )
}

/** Quiet text-style actions under a footer: accent, 15, 44px. */
export function FooterLink({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return <Button variant="link" size="sm" type="button" disabled={disabled} className="text-[length:var(--step-0)] font-semibold" onClick={onClick}>{children}</Button>
}

/** The amount box inside a step: a label and the figure at 20, from the product record only. */
export function HowMuch({ dose, label = 'How much' }: { dose: DoseLike; label?: string }) {
  const { system } = useUnits()
  const parts = doseParts(dose, system)
  const figure = `${parts.lead === null ? '' : `${parts.lead} `}${parts.tokens.map((token) => token.text).join('')}${parts.unitWord === null ? '' : ` ${parts.unitWord}`}`
  return (
    <div className="grid gap-0.5 rounded-control bg-surface-2 px-3.5 py-3">
      <span className="text-[length:var(--step--1)] font-semibold text-muted-foreground">{label}</span>
      <span className="text-[length:var(--step-2)] font-semibold"><span aria-hidden="true">{figure}</span><span className="sr-only">{parts.spoken}</span></span>
      {parts.secondary === null ? null : <span className={captionClassName}>{parts.secondary}</span>}
    </div>
  )
}

/** A machine the person may be at, with the name printed on it. */
export type MachineOption = { readonly machineId: string; readonly name: string }

/** The machine a typed label names: the same words, or the same number ("14" finds "Washer 14"). */
export function matchMachine(options: readonly MachineOption[], typed: string): MachineOption | null {
  const text = typed.trim().toLowerCase()
  if (text.length === 0) return null
  const digits = text.replace(/\D/g, '')
  return options.find((option) => option.name.toLowerCase() === text || (digits.length > 0 && option.name.replace(/\D/g, '') === digits)) ?? null
}

/** The words that make the entry a washer's or a dryer's. */
export type MachineEntryText = {
  readonly homeHeading: string
  readonly homeChoose: string
  readonly homeFact: string
  readonly label: string
  readonly placeholder: string
  readonly useMatch: (name: string) => string
  readonly matchFact: string
  readonly newMachine: (label: string) => string
  readonly newHint: string
  readonly usedBefore: string
  readonly shortcuts: string
  /** "All 20 dryers": every machine, in number order, behind a disclosure. */
  readonly showAll: (count: number) => string
  /** Names the few machines shown with no history, when a room has three or fewer. */
  readonly listLabel: string
}

/** The words of "Which dryer?" wherever a dryer is entered: its drying screen and a wash's own dryer step. */
export const dryerEntryWords: MachineEntryText = {
  homeHeading: dryingText.dryerTitle,
  homeChoose: dryingText.whichDryer,
  homeFact: dryingText.yourDryer,
  label: dryingText.whichDryer,
  placeholder: dryingText.labelHint,
  useMatch: (name) => `Use ${name}`,
  matchFact: 'Matches what you typed',
  newMachine: dryingText.newDryer,
  newHint: dryingText.newDryerHint,
  usedBefore: dryingText.usedBefore,
  showAll: dryingText.showAll,
  listLabel: dryingText.dryerTitleList,
  shortcuts: dryingText.shortcutsOnly,
}

/** The words of "Which washer?" wherever a washer is entered: its washer path and the mixed-room sheet. */
export const washerEntryWords: MachineEntryText = {
  homeHeading: washerPathText.homeHeading,
  homeChoose: washerPathText.homeChoose,
  homeFact: washerPathText.homeWasherFact,
  label: washerPathText.numberLabel,
  placeholder: washerPathText.numberPlaceholder,
  useMatch: washerPathText.useMatch,
  matchFact: washerPathText.matchFact,
  newMachine: washerPathText.newWasher,
  newHint: washerPathText.newWasherHint,
  usedBefore: washerPathText.usedBefore,
  showAll: washerPathText.showAll,
  listLabel: washerPathText.listLabel,
  shortcuts: washerPathText.shortcutsOnly,
}

/** The household's own most recent washers and dryers, newest first (three at most), from the loads it recorded. Never a sign that one is free. */
export function useRecentMachines(householdId: string | null, skip = false): { readonly washers: readonly string[]; readonly dryers: readonly string[] } {
  const recent = useQuery(api.execution.recentMachines, householdId === null || skip ? 'skip' : { householdId: householdId as never })
  return recent?.washers === undefined ? { washers: [], dryers: [] } : recent
}

const byNumber = (left: MachineOption, right: MachineOption) => left.name.localeCompare(right.name, undefined, { numeric: true })

/**
 * Where the machine is entered. At home the household's own machines are listed. In a shared room
 * or a laundromat nothing is assumed: the person types the number printed on the machine (a numeric
 * keypad), and the few machines this household used most recently are shortcuts, with every other
 * one behind "Show all", never shown as free or reserved. A typed label that names a known machine
 * is offered, not taken, so "1" never jumps ahead of "14".
 */
export function MachineEntry({ shared, options, recent = [], pending, onPick, onAddLabel, autoFocus, words, id }: {
  shared: boolean
  options: readonly MachineOption[]
  /** Machine ids this household used most recently, newest first; only these are shown as "Previously used". */
  recent?: readonly string[]
  pending: boolean
  onPick: (machineId: string) => void
  onAddLabel?: (name: string) => void
  autoFocus?: boolean
  words: MachineEntryText
  id: string
}) {
  const [typed, setTyped] = useState('')
  const [showAll, setShowAll] = useState(false)
  const label = typed.trim()
  const match = matchMachine(options, label)
  if (!shared) {
    return (
      <Section heading={words.homeHeading} caption={options.length > 1 ? words.homeChoose : undefined}>
        {options.map((option) => (
          <li key={option.machineId} className="[&+&]:[border-block-start:1px_solid_var(--line)]">
            <Item variant="interactive" render={<Button variant="unstyled" size="unstyled" type="button" aria-label={option.name} onClick={() => onPick(option.machineId)} />}>
              <ItemContent><ItemTitle>{option.name}</ItemTitle><ItemDescription>{words.homeFact}</ItemDescription></ItemContent>
              <DesignIcon name="chevronRight" size="1em" strokeWidth={2.2} className="size-4 flex-none text-muted-foreground" aria-hidden="true"  />
            </Item>
          </li>
        ))}
      </Section>
    )
  }
  const used = recent.flatMap((machineId) => options.find((option) => option.machineId === machineId) ?? []).slice(0, 3)
  const chip = (option: MachineOption) => <Button key={option.machineId} type="button" variant="outline" size="sm" className="min-h-11 rounded-control px-3.5 text-[length:var(--step-0)] font-semibold" disabled={pending} onClick={() => onPick(option.machineId)}>{option.name}</Button>
  return (
    <>
      <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); if (!pending && match !== null) onPick(match.machineId) }}>
        <TextField id={id} label={words.label} type="text" inputMode="numeric" enterKeyHint="go" autoComplete="off" maxLength={40} placeholder={words.placeholder} value={typed} onChange={(event) => setTyped(event.target.value)} autoFocus={autoFocus} disabled={pending} />
      </form>
      {label.length === 0 ? null : match !== null ? (
        <Section>
          <li><Item variant="interactive" render={<Button variant="unstyled" size="unstyled" type="button" disabled={pending} onClick={() => onPick(match.machineId)} />}>
            <ItemContent><ItemTitle>{words.useMatch(match.name)}</ItemTitle><ItemDescription>{words.matchFact}</ItemDescription></ItemContent>
            <DesignIcon name="chevronRight" size="1em" strokeWidth={2.2} className="size-4 flex-none text-muted-foreground" aria-hidden="true"  />
          </Item></li>
        </Section>
      ) : onAddLabel === undefined ? null : (
        <Section>
          <li><Item variant="interactive" render={<Button variant="unstyled" size="unstyled" type="button" disabled={pending} onClick={() => onAddLabel(label)} />}>
            <span className="flex size-11 flex-none items-center justify-center rounded-field bg-muted [&_svg]:size-6" aria-hidden="true"><DesignIcon name="plus" size="1em" strokeWidth={2.2}  /></span>
            <ItemContent><ItemTitle>{words.newMachine(label)}</ItemTitle><ItemDescription>{words.newHint}</ItemDescription></ItemContent>
          </Item></li>
        </Section>
      )}
      {used.length === 0 ? null : (
        <div className="grid gap-2">
          <span className="text-[length:var(--step-1)] font-semibold" id={`${id}-used-before`}>{words.usedBefore}</span>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`${id}-used-before`}>{used.map(chip)}</div>
        </div>
      )}
      {used.length === 0 && options.length > 0 && options.length <= 3 ? (
        // A small room: its few machines are the shortcuts, with nothing to hide.
        <div className="flex flex-wrap gap-2" role="group" aria-label={words.listLabel}>{[...options].sort(byNumber).map(chip)}</div>
      ) : options.length <= used.length ? null : (
        <div className="grid gap-2">
          <Button type="button" variant="unstyled" size="unstyled" className="flex min-h-11 items-center gap-1.5 justify-self-start text-[length:var(--step--1)] font-semibold text-ink-2" aria-expanded={showAll} aria-controls={`${id}-all`} onClick={() => setShowAll(!showAll)}>{words.showAll(options.length)}<DesignIcon name="chevronDown" size="1em" strokeWidth={2.2} className={cn('size-3.5 transition-transform motion-reduce:transition-none', showAll && 'rotate-180')} aria-hidden="true"  /></Button>
          {showAll ? <div id={`${id}-all`} className="flex flex-wrap gap-2">{[...options].sort(byNumber).map(chip)}</div> : null}
        </div>
      )}
      <Note>{words.shortcuts}</Note>
    </>
  )
}
