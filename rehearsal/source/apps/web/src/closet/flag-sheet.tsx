import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Button } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import { cn } from '@/lib/utils'
import { flagReasons, soilForFlag, soilLevels, stainReasons, stainKinds, type FlagReason, type SoilLevel } from '@washcloset/planner'
import type { FunctionArgs, FunctionReturnType } from 'convex/server'
import { useEffect, useId, useRef, useState } from 'react'

import type { api } from '@/api'
import { flagReasonWords, flagText, soilButtonWords } from '@/copy'
import { attemptName } from '@/household/inventory-types'
import { Sheet } from '@/kit/sheet'
import { ChipRow, choiceChipVariants, errorMessage } from '@/kit/ui'

const answerChipClassName = choiceChipVariants({ variant: 'answer' })

const noticeClassName = cn(
  "notice",
  "[.sheet.has-compact-actions_.sheet-foot_>_&]:[flex:1_0_100%]",
  "grid gap-2 p-[var(--space-3)_var(--space-4)] rounded-label",
  "[border:var(--rule-width)_solid_var(--line)]",
  "[background:var(--label)]",
  "text-[length:var(--step-0)]",
)

const badClassName = cn(
  "bad",
  "[.notice&]:[border-color:var(--danger)]",
  "[.notice&]:[color:var(--danger)]",
  "[.notice&]:[background:var(--label)]",
  "[.notice&]:font-semibold",
)

const largeClassName = cn(
  "large",
  "[.he-logo&]:w-[3rem] [.he-logo&]:h-[3rem]",
  "[.button&]:min-h-[3.5rem] [.button&]:w-full",
  "[.button&]:text-[length:var(--step-1)]",
)

const fieldClassName = cn(
  "field",
  "grid gap-1",
  "[&_label]:text-[length:var(--step-0)]",
  "[&_label]:font-semibold [&_label]:text-ink-2",
  "[.sheet_&_input:not([type='checkbox']):not([type='radio']):not([type='file'])]:[background-color:var(--sheet)]",
  "[.sheet_&_select]:[background-color:var(--sheet)]",
  "[.sheet_&_textarea]:[background-color:var(--sheet)]",
  "[.sheet_&_:is(input,_select,_textarea):focus-visible]:[border-color:var(--focus)]",
  "[.sheet_&_:is(input,_select,_textarea)]:bg-surface [.sheet_&_:is(input,_select,_textarea)]:rounded-[.75rem]",
)

export type FlagCall = (args: FunctionArgs<typeof api.closet.flagDirty>) => Promise<FunctionReturnType<typeof api.closet.flagDirty>>

/** A garment being flagged; dry-clean-only ones skip the washing questions. */
export type FlagGarment = { readonly textileId: string; readonly name: string; readonly dryCleanOnly: boolean }

export type FlagStep = 'reasons' | 'soil' | 'needed' | 'stain'
type Needed = 'none' | 'today' | 'tomorrow' | 'pick'

export type FlagDraft = {
  readonly reasons: readonly FlagReason[]
  /** Null until chosen: the reasons preselect it. */
  readonly soil: SoilLevel | null
  readonly needed: Needed
  /** The picked day as the date input holds it, `YYYY-MM-DD`. */
  readonly day: string
  readonly stainNote: string
  readonly stainKind?: typeof stainKinds[number]
  readonly priorTreatment?: 'none' | 'yes' | 'unknown'
  readonly treatmentNote?: string
  /** Treatments the app recorded on this flag; kept as records while the note still names exactly them. */
  readonly recordedAttempts?: readonly TreatmentAttempt[]
  readonly observation?: FunctionArgs<typeof api.closet.flagDirty>['observation']
  readonly observationEdited?: boolean
}

type TreatmentAttempt = Exclude<NonNullable<FunctionArgs<typeof api.closet.flagDirty>['stainReport']>['priorTreatmentAttempts'], 'unknown'>[number]

const emptyDraft: FlagDraft = { reasons: [], soil: null, needed: 'none', day: '', stainNote: '' }

/** The current garment's answers differ from what it opened with: closing would drop them. */
export function flagDraftChanged(start: FlagDraft, draft: FlagDraft): boolean {
  const keys = new Set([...Object.keys(start), ...Object.keys(draft)] as (keyof FlagDraft)[])
  return [...keys].some((key) => JSON.stringify(start[key]) !== JSON.stringify(draft[key]))
}

/** A local day's last millisecond: how a needed-by day is stored. */
export function endOfDay(timestamp: number, addDays = 0): number {
  const day = new Date(timestamp)
  day.setDate(day.getDate() + addDays)
  day.setHours(23, 59, 59, 999)
  return day.getTime()
}

/** A date input's `YYYY-MM-DD` as that local day's end, or null when it is not a date. */
export function dayInputEnd(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match === null) return null
  const day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59, 999)
  return Number.isNaN(day.getTime()) ? null : day.getTime()
}

/** A timestamp as the date input's value, in this device's time zone. */
export function dayInputValue(timestamp: number): string {
  const day = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
}

/** A garment's current flag as the sheet's answers, for "Change how dirty". */
export function draftFromFlag(flag: { reasons: readonly FlagReason[]; neededBy?: number; stainNote?: string; stainReport?: FunctionArgs<typeof api.closet.flagDirty>['stainReport']; observation?: FlagDraft['observation'] } | null, soil: SoilLevel | null, now: number): FlagDraft {
  if (flag === null) return { ...emptyDraft, soil }
  const neededBy = flag.neededBy
  const needed: Needed = neededBy === undefined ? 'none' : neededBy === endOfDay(now) ? 'today' : neededBy === endOfDay(now, 1) ? 'tomorrow' : 'pick'
  const attempts = flag.stainReport?.priorTreatmentAttempts
  return { reasons: flag.reasons, soil, needed, day: needed === 'pick' ? dayInputValue(neededBy!) : '', stainNote: flag.stainNote ?? '', stainKind: flag.stainReport?.kind ?? 'unknown', priorTreatment: Array.isArray(attempts) ? attempts.length === 0 ? 'none' : 'yes' : 'unknown', treatmentNote: Array.isArray(attempts) ? attempts.map(attemptName).join(', ') : '', ...(Array.isArray(attempts) && attempts.some((entry) => typeof entry !== 'string') ? { recordedAttempts: attempts } : {}), ...(flag.observation === undefined ? {} : { observation: flag.observation }) }
}

/** The steps this flag asks, in order: a dry-clean-only garment is asked only what happened. */
export function flagSteps(reasons: readonly FlagReason[], dryCleanOnly: boolean): FlagStep[] {
  if (dryCleanOnly) return ['reasons']
  const stained = reasons.some((reason) => (stainReasons as readonly FlagReason[]).includes(reason))
  return stained ? ['reasons', 'soil', 'needed', 'stain'] : ['reasons', 'soil', 'needed']
}

/** The arguments `flagDirty` receives for these answers. */
export function flagArgs(garments: readonly FlagGarment[], draft: FlagDraft, now: number): FunctionArgs<typeof api.closet.flagDirty> {
  const stained = flagSteps(draft.reasons, false).includes('stain')
  const neededBy = draft.needed === 'today' ? endOfDay(now) : draft.needed === 'tomorrow' ? endOfDay(now, 1) : draft.needed === 'pick' ? dayInputEnd(draft.day) : null
  const note = draft.stainNote.trim()
  const treatment = draft.treatmentNote?.trim()
  const recorded = draft.recordedAttempts !== undefined && treatment === draft.recordedAttempts.map(attemptName).join(', ') ? [...draft.recordedAttempts] : undefined
  return {
    textileIds: garments.map((garment) => garment.textileId) as FunctionArgs<typeof api.closet.flagDirty>['textileIds'],
    reasons: flagReasons.filter((reason) => draft.reasons.includes(reason)),
    soilLevel: draft.soil ?? soilForFlag(draft.reasons),
    ...(draft.observation === undefined ? {} : { observation: draft.observation }),
    ...(draft.observationEdited && draft.observation === undefined ? { clearObservation: true as const } : {}),
    ...(neededBy === null ? {} : { neededBy }),
    ...(stained && note.length > 0 ? { stainNote: note } : {}),
    ...(stained ? { stainReport: { kind: draft.stainKind ?? 'unknown', priorTreatmentAttempts: draft.priorTreatment === 'none' ? [] : draft.priorTreatment === 'yes' && treatment ? recorded ?? [treatment] : 'unknown' as const } } : {}),
  }
}

/**
 * What the toast says after a flag. The heads-up line names the laundry person, so it is added
 * only when their name is known.
 */
export function flagToast(garments: readonly FlagGarment[], result: FunctionReturnType<typeof api.closet.flagDirty>, laundryPersonName: string | null = null): string | null {
  if (result.changed === 0) return null
  const dryClean = garments.filter((garment) => result.toDryClean.includes(garment.textileId as never))
  const hamper = result.changed - dryClean.length
  const parts: string[] = []
  if (hamper === 1) parts.push(flagText.hamperOne(garments.find((garment) => !dryClean.includes(garment))?.name ?? garments[0]!.name))
  else if (hamper > 1) parts.push(flagText.hamperMany(hamper))
  if (dryClean.length === 1) parts.push(flagText.dryCleanOne(dryClean[0]!.name))
  else if (dryClean.length > 1) parts.push(flagText.dryCleanMany(dryClean.length))
  if (result.alerted && laundryPersonName !== null) parts.push(flagText.headsUp(laundryPersonName))
  return parts.join(' ')
}

const neededWords: Readonly<Record<Needed, string>> = flagText.needed

/**
 * "It's dirty": what happened, how dirty, needed by when, and where the stain is, one question per
 * step. Selected garments are answered and saved one at a time.
 */
export function FlagSheet({ garments, now, flag, onClose, onDone, initial, initials, start = 'reasons', laundryPersonName = null, stainOnly = false, saveLabel, saveAriaLabel }: {
  garments: readonly FlagGarment[]
  now: number
  flag: FlagCall
  onClose: () => void
  /** After saving, with the toast to show. */
  onDone: (message: string | null) => void
  initial?: FlagDraft
  initials?: readonly FlagDraft[]
  start?: FlagStep
  laundryPersonName?: string | null
  /** Inspect an existing stain without revisiting its hamper reasons, soil or needed-by date. */
  stainOnly?: boolean
  saveLabel?: string
  saveAriaLabel?: string
}) {
  const [garmentIndex, setGarmentIndex] = useState(0)
  const [draft, setDraft] = useState<FlagDraft>(initials?.[0] ?? initial ?? emptyDraft)
  const [step, setStep] = useState<FlagStep>(garments[0]?.dryCleanOnly ? 'reasons' : start)
  const [saved, setSaved] = useState<FunctionReturnType<typeof api.closet.flagDirty>>({ changed: 0, skipped: 0, toDryClean: [], alerted: false })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (error !== null) errorRef.current?.focus() }, [error])
  const dayId = useId()
  const garment = garments[garmentIndex]
  const dryCleanOnly = garment?.dryCleanOnly ?? false
  const steps: FlagStep[] = stainOnly ? ['stain'] : flagSteps(draft.reasons, dryCleanOnly)
  const index = Math.max(0, steps.indexOf(step))
  const last = index === steps.length - 1
  const soil = draft.soil ?? soilForFlag(draft.reasons)
  const pickMissing = step === 'needed' && draft.needed === 'pick' && dayInputEnd(draft.day) === null
  const set = (patch: Partial<FlagDraft>) => setDraft((current) => ({ ...current, ...patch }))
  // Earlier garments are already saved; only this one's answers can be lost.
  const startDraft = initials?.[garmentIndex] ?? (garmentIndex === 0 ? initial : undefined) ?? emptyDraft
  const dirty = flagDraftChanged(startDraft, draft)

  const save = async () => {
    if (garment === undefined || pending) return
    setPending(true)
    setError(null)
    try {
      const result = await flag(flagArgs([garment], draft, now))
      const total = {
        changed: saved.changed + result.changed,
        skipped: saved.skipped + result.skipped,
        toDryClean: [...saved.toDryClean, ...result.toDryClean],
        alerted: saved.alerted || result.alerted,
      }
      if (garmentIndex === garments.length - 1) onDone(flagToast(garments, total, laundryPersonName))
      else {
        const nextIndex = garmentIndex + 1
        setSaved(total)
        setGarmentIndex(nextIndex)
        setDraft(initials?.[nextIndex] ?? emptyDraft)
        setStep(garments[nextIndex]?.dryCleanOnly ? 'reasons' : start)
      }
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setPending(false)
    }
  }
  const next = () => (last ? void save() : setStep(steps[index + 1]!))
  const title = flagText.titles[step]
  const subtitle = garment === undefined ? '' : garments.length === 1 ? garment.name : flagText.itemProgress(garment.name, garmentIndex + 1, garments.length)
  const action = !last ? flagText.next : garmentIndex < garments.length - 1 ? flagText.nextItem : saveLabel ?? (dryCleanOnly ? flagText.putInDryCleaning : flagText.putInHamper)

  return (
    <Sheet
      title={title}
      subtitle={<span aria-live="polite">{subtitle}</span>}
      onClose={onClose}
      closeLabel={garmentIndex === 0 ? flagText.cancel : flagText.close}
      onBack={index === 0 ? undefined : () => setStep(steps[index - 1]!)}
      step={`${garmentIndex}:${step}`}
      dirty={dirty}
      busy={pending}
      footer={(
        <>
          <Button type="button" aria-label={last ? saveAriaLabel : undefined} aria-busy={pending} className={largeClassName} disabled={pending || pickMissing} onClick={next}>
            {pending ? flagText.saving : action}
          </Button>
        </>
      )}
    >
      {error === null ? null : <p ref={errorRef} tabIndex={-1} className={cn(noticeClassName, badClassName, 'min-w-0 px-[16px] py-[12px] [overflow-wrap:anywhere]')} role="alert">{error}</p>}
      {step === 'reasons' ? (
        <ChipRow
          label={flagText.titles.reasons}
          hideLabel
          options={flagReasons.map((reason) => ({ value: reason, label: flagReasonWords[reason] }))}
          values={draft.reasons}
          // Changing the reasons preselects how dirty again; the person can still change it.
          onToggle={(reason) => set({ soil: null, reasons: draft.reasons.includes(reason) ? draft.reasons.filter((entry) => entry !== reason) : [...draft.reasons, reason] })}
        />
      ) : null}
      {step === 'soil' ? (
        <div className="grid gap-2" role="group" aria-label={flagText.titles.soil}>
          {soilLevels.map((level) => (
            <Toggle key={level} type="button" className={answerChipClassName} pressed={soil === level} onClick={() => set({ soil: level })}>
              {soilButtonWords[level]}
            </Toggle>
          ))}
        </div>
      ) : null}
      {step === 'needed' ? (
        <>
          <div className="grid gap-2" role="group" aria-label={flagText.titles.needed}>
            {(['none', 'today', 'tomorrow', 'pick'] as const).map((needed) => (
              <Toggle key={needed} type="button" className={answerChipClassName} pressed={draft.needed === needed} onClick={() => set({ needed })}>
                {neededWords[needed]}
              </Toggle>
            ))}
          </div>
          {draft.needed === 'pick' ? (
            <Field className={fieldClassName}>
              <FieldLabel htmlFor={dayId}>{flagText.needed.pick}</FieldLabel>
              <Input id={dayId} type="date" value={draft.day} min={dayInputValue(now)} onChange={(event) => set({ day: event.target.value })} />
            </Field>
          ) : null}
        </>
      ) : null}
      {step === 'stain' ? <StainFields draft={draft} onChange={set} disabled={pending} /> : null}
      {step === 'needed' ? <LaundryObservationFields draft={draft} onChange={set} disabled={pending} /> : null}
    </Sheet>
  )
}

/** Optional context available for odor-only loads too. It never diagnoses the cause. */
export function LaundryObservationFields({ draft, onChange, disabled }: { draft: FlagDraft; onChange: (patch: Partial<FlagDraft>) => void; disabled?: boolean }) {
  const id = useId()
  const observation = draft.observation
  const set = (patch: Partial<NonNullable<FlagDraft['observation']>>) => onChange({ observation: { problem: 'odor', timing: 'unknown', recurring: false, ...observation, ...patch } })
  return <details className="grid gap-3"><summary className="min-h-11 cursor-pointer py-3 font-semibold">Odor or residue keeps coming back?</summary><div className="grid gap-3 pt-3">
    <Field><FieldLabel htmlFor={`${id}-problem`}>What do you notice?</FieldLabel><NativeSelect id={`${id}-problem`} disabled={disabled} value={observation?.problem ?? ''} onChange={(event) => onChange({ observationEdited: true, observation: event.target.value ? { problem: event.target.value as NonNullable<FlagDraft['observation']>['problem'], timing: observation?.timing ?? 'unknown', recurring: observation?.recurring ?? false, previousWash: observation?.previousWash } : undefined })}><NativeSelectOption value="">Nothing to record</NativeSelectOption><NativeSelectOption value="odor">Odor</NativeSelectOption><NativeSelectOption value="oily">Oily feel</NativeSelectOption><NativeSelectOption value="stiff">Stiff fabric</NativeSelectOption><NativeSelectOption value="waxy">Waxy residue</NativeSelectOption></NativeSelect></Field>
    {observation === undefined ? null : <>
      <Field><FieldLabel htmlFor={`${id}-timing`}>When does it appear?</FieldLabel><NativeSelect id={`${id}-timing`} disabled={disabled} value={observation.timing} onChange={(event) => set({ timing: event.target.value as typeof observation.timing })}>{Object.entries({ unknown: 'Not sure', after_wash: 'After washing', after_drying: 'After drying', during_storage: 'While stored', after_wearing: 'After wearing' }).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></Field>
      <Field><FieldLabel htmlFor={`${id}-recurring`}>Has it happened before?</FieldLabel><NativeSelect id={`${id}-recurring`} disabled={disabled} value={observation.recurring ? 'yes' : 'no'} onChange={(event) => set({ recurring: event.target.value === 'yes' })}><NativeSelectOption value="no">First time</NativeSelectOption><NativeSelectOption value="yes">Yes, it keeps returning</NativeSelectOption></NativeSelect></Field>
      <Field><FieldLabel htmlFor={`${id}-wash`}>Previous wash, additives or machine issues (optional)</FieldLabel><Input id={`${id}-wash`} disabled={disabled} maxLength={300} value={observation.previousWash ?? ''} onChange={(event) => set({ previousWash: event.target.value })} /></Field>
      <p className="text-sm text-ink-2">Saved for review; this does not diagnose a cause or add treatment.</p>
    </>}
  </div></details>
}

/** Shared by the hamper flow and the clothing drawer's care editor. */
export function StainFields({ draft, onChange: set, disabled = false }: { draft: FlagDraft; onChange: (patch: Partial<FlagDraft>) => void; disabled?: boolean }) {
  const stainId = useId()
  return <div className="grid gap-4">
        <Field>
          <FieldLabel htmlFor={`${stainId}-kind`}>What caused the stain?</FieldLabel>
          <NativeSelect id={`${stainId}-kind`} disabled={disabled} value={draft.stainKind ?? 'unknown'} onChange={(event) => set({ stainKind: event.target.value as typeof stainKinds[number] })}>
            {stainKinds.map((kind) => <NativeSelectOption key={kind} value={kind}>{({ protein: 'Blood, egg or dairy', tannin: 'Coffee, tea, wine or fruit', oil_grease: 'Oil or grease', starch_sauce: 'Starch or sauce', dye_ink_transfer: 'Dye, ink or color transfer', rust_mineral: 'Rust or mineral', combination: 'A mix of stains', unknown: 'Not sure' })[kind]}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${stainId}-prior`}>Already treated?</FieldLabel>
          <NativeSelect id={`${stainId}-prior`} disabled={disabled} value={draft.priorTreatment ?? 'unknown'} onChange={(event) => set({ priorTreatment: event.target.value as FlagDraft['priorTreatment'] })}>
            <NativeSelectOption value="unknown">Not sure</NativeSelectOption><NativeSelectOption value="none">No treatment yet</NativeSelectOption><NativeSelectOption value="yes">Yes</NativeSelectOption>
          </NativeSelect>
        </Field>
        {draft.priorTreatment === 'yes' ? <Field><FieldLabel htmlFor={`${stainId}-treatment`}>What did you use?</FieldLabel><Input id={`${stainId}-treatment`} disabled={disabled} maxLength={120} value={draft.treatmentNote ?? ''} onChange={(event) => set({ treatmentNote: event.target.value })} /><p className="text-sm text-ink-2">Earlier treatments need review before adding another product.</p></Field> : null}
        <Field className={fieldClassName}>
          <FieldLabel htmlFor={stainId}>{flagText.stainOptional}</FieldLabel>
          <Input id={stainId} disabled={disabled} value={draft.stainNote} maxLength={80} placeholder={flagText.stainExample} onChange={(event) => set({ stainNote: event.target.value })} />
        </Field>
        <LaundryObservationFields draft={draft} onChange={set} disabled={disabled} />
        </div>
}
