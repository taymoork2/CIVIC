import { FieldSet, FieldLegend } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import type { FunctionArgs, FunctionReturnType } from 'convex/server'
import { useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { materialCareProblem, clothingTags, flagReasons, soilForFlag, soilLevels, stainCleanerFirst, stainReasons, stainWashLimit, usedClothingTags, type SoilLevel } from '@washcloset/planner'
import { toast } from 'sonner'
import { confirmTrash, type RestoreTextiles } from '@/closet/trash-undo'

import type { api } from '@/api'
import { closetState, notWornSince, type ClosetState } from '@/closet/closet-groups'
import { closetText, colorDisplay, colourWord, countWord, dayWord, flagReasonWords, garmentText, kindWords, monthWord, soilButtonWords, statusWords } from '@/copy'
import { dayInputEnd, dayInputValue, draftFromFlag, flagArgs, flagToast, StainFields, type FlagCall, type FlagDraft } from '@/closet/flag-sheet'
import type { Textile } from '@/household/inventory-types'
import { attemptName, effectiveWashMethod } from '@/household/inventory-types'
import { Sheet } from '@/kit/sheet'
import { Button, buttonVariants } from '@/components/ui/button'
import { ItemGroup, itemVariants } from '@/components/ui/item'
import { IssueNote } from '@/kit/record-row'
import { ActionGroup, ActionList, AnswerRow, SegmentChoice } from '@/laundry/laundry-ui'
import { DesignIcon } from '@/kit/design-icons'
import { CountRow, Facts } from '@/closet/closet-parts'
import { CareQuestionSheet, CareSymbolRow, careCells } from '@/closet/garment-care'
import { TaskFooter } from '@/kit/task-footer'
import { GarmentIcon, garmentCategoryPhoto } from '@/kit/garment-icon'
import { CategoryPhoto } from '@/products/product-ui'
import { ChipRow, Stepper, clockTime, errorMessage } from '@/kit/ui'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { backInClosetToast } from '@/closet/washed-sheet'
import { GarmentRecordTabs } from '@/closet/garment-record'
import { addGarmentText, garmentRecordCaveats, garmentTabText, type CareQuestion } from '@/copy-closet'
import { TagsSheet, type TagsCall } from '@/closet/tags-sheet'
import type { EditField, EditOutcome } from '@/closet/add-clothes'
import { CareInstructions } from '@/closet/care-instructions'
import { PersonalRoutine } from '@/closet/personal-routine'
import { GarmentPrintDetails, factGroups } from '@/closet/garment-advice'

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

const garmentStatusClassName = cn(
  "garment-status",
  "grid gap-[.25rem] text-ink-2",
  "text-[length:.875rem]",
  "[&_p]:m-0",
)

const knownMarkActionsClassName = cn(
  "known-mark-actions",
  "grid gap-2",
)

const laundryCareFormClassName = cn(
  "laundry-care-form",
  "p-4 rounded-[1rem] bg-surface-2",
  "[&_fieldset]:grid [&_fieldset]:gap-3 [&_fieldset]:min-w-0 [&_fieldset]:p-0 [&_fieldset]:m-0 [&_fieldset]:border-0",
  "[&_legend]:p-[0_0_var(--space-3)] [&_legend]:font-semibold",
  "[&_legend]:text-[length:1rem]",
)

const laundryCareScopeClassName = cn(
  "laundry-care-scope",
  "m-0 text-ink-2",
  "text-[length:var(--step--1)]",
)

const laundryCareGroupsClassName = cn(
  "laundry-care-groups",
  "grid gap-3",
)

const laundryCareGroupClassName = cn(
  "laundry-care-group",
  "grid gap-3 p-3 rounded-[.85rem] bg-surface",
  "[&_>_strong]:text-[length:var(--step-0)]",
  "[&_>_strong]:[overflow-wrap:anywhere]",
  "[&_>_[data-slot='button']]:[justify-self:start]",
  "[&_>_[data-slot='button']]:whitespace-normal [&_>_[data-slot='button']]:min-h-[2.75rem] [&_>_[data-slot='button']]:bg-surface [&_>_[data-slot='button']]:border-line",
  "[&_>_[data-slot='button']]:[color:var(--accent)]",
)

const laundryCareEditorClassName = cn(
  "laundry-care-editor",
  "grid gap-4 pt-4",
  "[border-block-start:1px_solid_var(--line)]",
  "[&_h3]:m-0",
  "[&_h3]:text-[length:1rem]",
)

const laundryCareFieldsClassName = cn(
  "laundry-care-fields",
  "grid gap-3",
)

const laundryCareReasonsClassName = cn(
  "laundry-care-reasons",
  "grid gap-3",
)

const laundryCareSaveClassName = cn(
  "laundry-care-save",
  "flex flex-wrap items-center gap-3",
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

export type LinkTarget = { readonly to: 'laundry'; readonly add?: 'hamper'; readonly item?: string } | { readonly to: 'session'; readonly sessionId: string }
export type RenderLink = (target: LinkTarget, props: { className: string; children: ReactNode; onClick?: () => void; 'aria-label'?: string }) => ReactNode

/** Plain links, for tests and anywhere without the router. */
export const plainLink: RenderLink = (target, { className, children, onClick, 'aria-label': ariaLabel }) => (
  <a className={className} onClick={onClick} aria-label={ariaLabel} href={target.to === 'laundry' ? `/laundry${target.item === undefined ? target.add === undefined ? '' : `?add=${target.add}` : `?item=${encodeURIComponent(target.item)}`}` : `/session/${target.sessionId}`}>{children}</a>
)

type Mutation<Name extends keyof typeof api.closet> = (typeof api.closet)[Name]
type Call<Name extends 'setRefresh' | 'unflag' | 'refreshed' | 'pickedUp' | 'allDry' | 'droppedAtCleaner'> =
  (args: FunctionArgs<Mutation<Name>>) => Promise<FunctionReturnType<Mutation<Name>>>

export type GarmentCalls = {
  readonly flagDirty: FlagCall
  readonly setRefresh: Call<'setRefresh'>
  readonly unflag: Call<'unflag'>
  readonly refreshed: Call<'refreshed'>
  readonly pickedUp: Call<'pickedUp'>
  readonly allDry: Call<'allDry'>
  readonly droppedAtCleaner: Call<'droppedAtCleaner'>
  /** Writes tags on every piece; when absent, "Edit tags" opens the full details form instead. */
  readonly updateTags?: TagsCall
  /** Writes one question's answer on every piece of a garment with one care record; when absent the label is checked in the full form. */
  readonly answerCare?: (args: FunctionArgs<typeof api.inventory.answerTagQuestions>) => Promise<unknown>
  /** A known mark (an old, set-in stain): try treating it at the next wash, or remove it. Without them the mark is only shown. */
  readonly treatKnownStain?: (args: FunctionArgs<typeof api.closet.treatKnownStain>) => Promise<{ changed: number; toDryClean: readonly string[] }>
  readonly removeKnownStain?: (args: FunctionArgs<typeof api.closet.removeKnownStain>) => Promise<{ changed: number }>
  /** A washed stain: "Stain gone?", then one more try, the cleaner, a known mark or retiring it. Without them it is only shown. */
  readonly answerStainCheck?: (args: FunctionArgs<typeof api.closet.answerStainCheck>) => Promise<{ changed: number }>
  readonly resolveStain?: (args: FunctionArgs<typeof api.closet.resolveStain>) => Promise<{ changed: number; skipped: number }>
  readonly retire?: (args: FunctionArgs<typeof api.inventory.trashTextiles>) => Promise<{ changed: number; trashedAt?: number; revisions?: FunctionReturnType<typeof api.inventory.trashTextiles>['revisions'] }>
  readonly restoreTextiles?: RestoreTextiles
}

/** The toast after treating known marks: dry cleaning when every changed piece went there, otherwise the hamper. */
export function markTreatToast(changed: number, toDryClean: number): string | null {
  return changed === 0 ? null : toDryClean === changed ? garmentTabText.markToDryClean : garmentTabText.markTreating(changed)
}

/** The recorded fiber or blend in words; "Not recorded" when it was never entered. */
function fabricWords(material: string | null): string {
  if (material === null || material.trim() === '') return garmentTabText.fabricNotRecorded
  return (addGarmentText.fabrics as Record<string, string>)[material] ?? material
}

export type GarmentActionId = 'dirty' | 'refresh' | 'unflag' | 'change' | 'washed' | 'refreshed' | 'wash_instead' | 'dropped' | 'picked' | 'all_dry' | 'open' | 'treat_mark' | 'remove_mark'

/** A matching record can contain both ready pieces and pieces already in a load. Never send the whole record to a hamper action. */
export function hamperActionMembers(action: 'dirty' | 'unflag', members: readonly Textile[]): readonly Textile[] {
  return members.filter((member) => closetState(member) === (action === 'dirty' ? 'ready' : 'dirty'))
}

export type GarmentAction = {
  readonly id: GarmentActionId
  readonly label: string
  /** A second line under the label. */
  readonly hint?: string
  readonly disabled?: boolean
}

const noSteam = /do not iron|no steam/i

/** Whether the tag explicitly allows steaming; unknown is never permission to steam. */
export function steamAnswer(members: readonly Pick<Textile, 'care'>[]): 'not_allowed' | 'unknown' | 'allowed' {
  if (members.some((member) => member.care?.steamPermission === 'not_allowed' || member.care?.ironSteam === 'not_allowed' || member.care?.restrictions.some((entry) => noSteam.test(entry)) === true)) return 'not_allowed'
  return members.length > 0 && members.every((member) => member.care?.steamPermission === 'allowed') ? 'allowed' : 'unknown'
}

export type GarmentSheetFacts = {
  readonly members: readonly Textile[]
  readonly wearerName: string | null
  readonly now: number
  readonly notWornDays: number
  /** When the running load holding it is done, when known. */
  readonly doneAt: number | null
  /** The finished load it is hanging from, when known. */
  readonly hangingSessionId: string | null
}

/** Everything the Garment sheet says and offers, for the tile's state. */
export function garmentSheetView({ members, wearerName, now, notWornDays, doneAt, hangingSessionId }: GarmentSheetFacts) {
  const first = members[0]!
  const state: ClosetState = closetState(first)
  const lines: string[] = []
  if (members.length > 1) {
    if (state !== 'ready') lines.push(state === 'in_wash' ? garmentText.inWash : statusWords[state])
  } else {
    if (first.wearsSinceClean > 0) lines.push(garmentText.wornSinceWash(first.wearsSinceClean))
    if (state === 'ready') {
      const date = notWornSince(first, now, notWornDays)
      if (date !== null) lines.push(garmentText.notWornSince(monthWord(date, now)))
    }
    const since = dayWord(first.statusSince, now)
    switch (state) {
    case 'dirty': {
      const neededBy = first.flag?.neededBy
      lines.push([statusWords.dirty, first.flag?.reasons.map((reason) => flagReasonWords[reason]).join(', ') || null, first.soilLevel === null ? null : soilButtonWords[first.soilLevel], neededBy === undefined ? null : garmentText.needed(dayWord(neededBy, now))].filter((part) => part !== null).join(' · '))
      break
    }
    case 'at_cleaner':
      lines.push(garmentText.atCleanerSince(since, first.cleanerPickupBy === null ? null : dayWord(first.cleanerPickupBy, now)))
      break
    case 'hanging':
      lines.push(garmentText.hangingSince(since))
      break
    case 'needs_dry_clean':
    case 'needs_refresh':
      lines.push(garmentText.statusSince(statusWords[state], since))
      break
    case 'in_wash':
      lines.push(doneAt === null ? garmentText.inWash : garmentText.washDoneAt(clockTime(doneAt)))
      break
    case 'ready':
      break
    }
  }

  const actions: GarmentAction[] = (() => {
    switch (state) {
      case 'ready':
        return [
          { id: 'dirty', label: garmentText.needsWashing },
          { id: 'refresh', label: garmentText.needsRefresh },
        ]
      case 'dirty':
        return first.guest
          ? [{ id: 'unflag', label: garmentText.removeGuest }]
          : [{ id: 'change', label: garmentText.updateCare, hint: garmentText.updateCareHint }, { id: 'washed', label: garmentText.washedAnotherWay, hint: garmentText.washedAnotherWayHint }]
      case 'needs_refresh':
        return [{ id: 'refreshed', label: garmentText.refreshed }, { id: 'wash_instead', label: garmentText.washInstead }]
      case 'needs_dry_clean':
        return [{ id: 'dropped', label: garmentText.droppedOff }]
      case 'at_cleaner':
        return [{ id: 'picked', label: garmentText.pickedUp }]
      case 'hanging':
        return hangingSessionId === null ? [] : [{ id: 'all_dry', label: garmentText.allDry, hint: garmentText.marksLoadDry }]
      case 'in_wash':
        return first.inLoad === null ? [] : [{ id: 'open', label: garmentText.open }]
    }
  })()

  return {
    state,
    title: first.name,
    subtitle: `${wearerName ?? garmentText.sharedItem} · ${colorDisplay(first)}`,
    lines,
    actions,
  }
}

/** What the Garment sheet hands back to the Closet: a sheet to open next, or a toast. */
export type GarmentSheetNext =
  | { readonly kind: 'flag'; readonly textileIds: readonly string[]; readonly mode: 'dirty' | 'change' | 'wash_instead' }
  | { readonly kind: 'washed'; readonly textileIds: readonly string[] }
  | { readonly kind: 'dropped'; readonly textileIds: readonly string[] }
  | { readonly kind: 'edit'; readonly textileIds: readonly string[]; readonly careOnly?: 'all' | 'more'; readonly focusField?: EditField }

/** Edit over the record: which pieces, whether only their care label, and the answer a row was tapped for. */
export type GarmentEdit = Extract<GarmentSheetNext, { readonly kind: 'edit' }>

/** A group stays together; each care action asks how many matching pieces it affects. */
export function GarmentSheet({ facts, careGroups = [facts], calls, renderLink = plainLink, renderRecord, renderEdit, planning, knownTags, onRemoveGuest, onClose, onDone, onNext }: {
  facts: GarmentSheetFacts
  calls: GarmentCalls
  /** Tags already used in the household, offered when editing tags. */
  knownTags?: readonly string[]
  renderLink?: RenderLink
  /** Supply record data separately when the sheet is rendered outside its connected route. */
  renderRecord?: (panels: { details: ReactNode; care: ReactNode }) => ReactNode
  /**
   * The edit form, opened over this still-mounted record so Cancel and Save return to the same tab.
   * Without it, Edit is handed back through `onNext` to replace the record.
   */
  renderEdit?: (edit: GarmentEdit, onClose: (outcome?: EditOutcome) => void) => ReactNode
  /** Status/load scopes for actions; the record itself always shows all matching pieces. */
  careGroups?: readonly GarmentSheetFacts[]
  planning?: { readonly selectedIds: readonly string[]; readonly onGroupCountChange: (textileIds: readonly string[], count: number) => void }
  onRemoveGuest?: (textileId: string) => Promise<void>
  onClose: () => void
  onDone: (message: string | null) => void
  onNext: (next: GarmentSheetNext) => void
}) {
  const [careCount, setCareCount] = useState(1)
  // Which row of the care list is open: the routine sheet, the print details or a group's label-notes sheet.
  const [careRow, setCareRow] = useState<string | null>(null)
  const [editingTags, setEditingTags] = useState(false)
  const [editing, setEditing] = useState<GarmentEdit | null>(null)
  const [asking, setAsking] = useState<CareQuestion | null>(null)
  const [quantityAction, setQuantityAction] = useState<GarmentAction | null>(null)
  const [actionMembers, setActionMembers] = useState(facts.members)
  const [refreshStep, setRefreshStep] = useState<'reason' | 'method' | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const quantityHeadingRef = useRef<HTMLHeadingElement>(null)
  const recordBodyRef = useRef<HTMLDivElement>(null)
  const returnActionRef = useRef<string | null>(null)
  useEffect(() => {
    if (quantityAction !== null) quantityHeadingRef.current?.focus({ preventScroll: true })
    else if (returnActionRef.current !== null) {
      const origin = [...(recordBodyRef.current?.closest('.sheet')?.querySelectorAll<HTMLButtonElement>('button[data-garment-action]') ?? [])].find((button) => button.dataset.garmentAction === returnActionRef.current)
      origin?.focus({ preventScroll: true })
      returnActionRef.current = null
    }
  }, [quantityAction])
  const view = garmentSheetView(facts)
  const unchecked = facts.members.filter((member) => member.care?.status !== 'confirmed')
  const readyMembers = facts.members.filter((member) => closetState(member) === 'ready')
  const hamperMembers = facts.members.filter((member) => closetState(member) === 'dirty')
  const hamperCount = hamperMembers.length
  const name = actionMembers.length === 1 ? actionMembers[0]!.name : countWord(actionMembers.length, 'laundry item')

  const run = async <Result extends { changed: number },>(call: () => Promise<Result>, message: (changed: number, result: Result) => string | null) => {
    setPending(true)
    setError(null)
    try {
      const result = await call()
      onDone(message(result.changed, result))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setPending(false)
    }
  }
  const act = (id: GarmentActionId, chosen: readonly Textile[]) => {
    const ids = chosen.map((member) => member.textileId)
    const textileIds = ids as FunctionArgs<typeof api.closet.unflag>['textileIds']
    switch (id) {
      case 'refresh': setActionMembers(chosen); return setRefreshStep('reason')
      case 'unflag': return chosen.every((member) => member.guest) && onRemoveGuest !== undefined
        ? void run(async () => { for (const member of chosen) await onRemoveGuest(member.textileId); return { changed: chosen.length } }, () => null)
        : void run(() => calls.unflag({ textileIds }), (changed) => changed === 0 ? null : garmentText.careRemoved(changed))
      case 'refreshed': setActionMembers(chosen); return setRefreshStep('method')
      case 'picked': return void run(() => calls.pickedUp({ textileIds }), (changed) => backInClosetToast(chosen.map((member) => member.name), changed))
      case 'all_dry': {
        const sessionId = careGroups.find((group) => group.members.some((member) => member.textileId === chosen[0]?.textileId))?.hangingSessionId ?? null
        return sessionId === null ? undefined : void run(() => calls.allDry({ sessionId: sessionId as FunctionArgs<typeof api.closet.allDry>['sessionId'] }), () => null)
      }
      case 'dirty': {
        const garments = chosen.map((member) => ({ textileId: member.textileId, name: member.name, dryCleanOnly: effectiveWashMethod(member) === 'dry_clean_only' }))
        return void run(() => calls.flagDirty(flagArgs(garments, { reasons: ['worn'], soil: null, needed: 'none', day: '', stainNote: '' }, facts.now)), (_changed, result) => flagToast(garments, result))
      }
      case 'change': return onNext({ kind: 'flag', textileIds: ids, mode: 'change' })
      case 'wash_instead': return onNext({ kind: 'flag', textileIds: ids, mode: 'wash_instead' })
      case 'washed': return onNext({ kind: 'washed', textileIds: ids })
      case 'dropped': return onNext({ kind: 'dropped', textileIds: ids })
      case 'open': return undefined
      case 'treat_mark': return calls.treatKnownStain === undefined ? undefined
        : void run(() => calls.treatKnownStain!({ textileIds }), (changed, result) => markTreatToast(changed, result.toDryClean.length))
      case 'remove_mark': return calls.removeKnownStain === undefined ? undefined
        : void run(() => calls.removeKnownStain!({ textileIds }), (changed) => changed === 0 ? null : garmentTabText.markRemoved)
    }
  }

  const first = facts.members[0]!
  const refreshIds = (members: readonly Textile[]) => members.map((member) => member.textileId)
  const choose = (action: GarmentAction, candidates: readonly Textile[] = facts.members) => {
    const members = action.id === 'dirty' || action.id === 'unflag' ? hamperActionMembers(action.id, candidates) : candidates
    if (members.length === 0) return
    setActionMembers(members)
    setError(null)
    if ((members.length > 1 || action.id === 'dirty' || action.id === 'unflag') && action.id !== 'all_dry') {
      setCareCount(action.id === 'dirty' || action.id === 'unflag' ? 1 : members.length)
      setQuantityAction(action)
    } else act(action.id, members)
  }
  const dryCleanOnly = (members: readonly Textile[]) => members.length > 0 && members.every((member) => effectiveWashMethod(member) === 'dry_clean_only')
  const dirtyLabel = dryCleanOnly(quantityAction?.id === 'dirty' ? actionMembers.slice(0, careCount) : readyMembers) ? 'Add to dry cleaning' : 'Add to hamper'
  const labelOf = (action: GarmentAction, members: readonly Textile[]) => action.id === 'dirty' ? (dryCleanOnly(members) ? 'Add to dry cleaning' : 'Add to hamper')
    : action.id === 'unflag' && members.every((member) => member.guest) && onRemoveGuest !== undefined ? garmentText.removeGuest : action.label

  // Each choice saves as it is tapped, so there is no draft to guard; only a pending save holds the sheet.
  if (refreshStep !== null) return <Sheet title={refreshStep === 'reason' ? garmentText.refreshReason : garmentText.refreshMethod} onClose={onClose} closeAtTop busy={pending}>
    {error === null ? null : <IssueNote kind="conflict" title={error} actions={[]} />}
    <ItemGroup>
      {refreshStep === 'reason'
        ? (['wrinkles', 'odor', 'stored_long'] as const).map((reason) => <li key={reason}><Button variant="unstyled" size="unstyled" type="button" className={cn(itemVariants({ variant: 'interactive' }), 'font-semibold')} disabled={pending} onClick={() => void run(() => calls.setRefresh({ textileIds: refreshIds(actionMembers) as FunctionArgs<typeof api.closet.setRefresh>['textileIds'], reason }), (changed) => changed === 0 ? null : garmentText.refreshWaiting)}>{garmentText.refreshReasons[reason]}</Button></li>)
        : <>
          <li><Button variant="unstyled" size="unstyled" type="button" className={cn(itemVariants({ variant: 'interactive' }), 'font-semibold')} disabled={pending} onClick={() => void run(() => calls.refreshed({ textileIds: refreshIds(actionMembers) as FunctionArgs<typeof api.closet.refreshed>['textileIds'], method: 'air_out' }), (changed) => changed === 0 ? null : garmentText.refreshedReady(name, actionMembers.length === 1))}>{garmentText.refreshMethods.air_out}</Button></li>
          {steamAnswer(actionMembers) === 'allowed' ? <li><Button variant="unstyled" size="unstyled" type="button" className={cn(itemVariants({ variant: 'interactive' }), 'font-semibold')} disabled={pending} onClick={() => void run(() => calls.refreshed({ textileIds: refreshIds(actionMembers) as FunctionArgs<typeof api.closet.refreshed>['textileIds'], method: 'steam' }), (changed) => changed === 0 ? null : garmentText.refreshedReady(name, actionMembers.length === 1))}>{garmentText.refreshMethods.steam}</Button></li> : null}
        </>}
    </ItemGroup>
  </Sheet>

  const openEdit = (edit: GarmentEdit) => renderEdit === undefined ? onNext(edit) : setEditing(edit)
  const editAll = (focusField?: EditField) => openEdit({ kind: 'edit', textileIds: refreshIds(facts.members), ...(focusField === undefined ? {} : { focusField }) })
  const checkLabel = () => openEdit({ kind: 'edit', careOnly: 'all', textileIds: unchecked.filter((member) => JSON.stringify(member.care) === JSON.stringify(unchecked[0]!.care)).map((member) => member.textileId) })

  /** The actions this garment offers, as data: the first is the primary one, the rest sit under the tabs. */
  type Offer = { readonly key: string; readonly id?: GarmentActionId; readonly label: string; readonly run: () => void; readonly link?: LinkTarget; readonly disabled?: boolean }
  const offers: Offer[] = (() => {
    const fromAction = (action: GarmentAction, group: GarmentSheetFacts): Offer => ({
      key: `${action.id}:${group.members[0]!.textileId}`,
      id: action.id,
      label: labelOf(action, group.members),
      run: () => choose(action, group.members),
      disabled: action.disabled === true,
      ...(action.id !== 'open' ? {} : group.members[0]!.inLoad === null ? { disabled: true } : { link: { to: 'session', sessionId: group.members[0]!.inLoad } as LinkTarget }),
    })
    if (planning !== undefined) return hamperCount === 0 ? [] : [fromAction({ id: 'unflag', label: first.guest ? garmentText.removeGuest : 'Remove from hamper' }, facts)]
    return careGroups.flatMap((group) => {
      const groupView = garmentSheetView(group)
      return groupView.state === 'dirty'
        ? [fromAction({ id: 'unflag', label: group.members.every((member) => member.guest) ? garmentText.removeGuest : 'Remove from hamper' }, group), ...(group.members.every((member) => member.guest) ? [] : [fromAction({ id: 'washed', label: 'Record a wash' }, group)])]
        : groupView.actions.map((action) => fromAction(action, group))
    })
  })()

  const offerButton = (offer: Offer, primary: boolean) => offer.link !== undefined
    ? <Button key={offer.key} variant={primary ? 'default' : 'outline'} size={primary ? 'lg' : 'default'} className={primary ? 'w-full' : 'min-w-0 flex-[1_1_9rem] whitespace-normal'} render={renderLink(offer.link, { className: cn(buttonVariants({ variant: primary ? 'default' : 'outline', size: primary ? 'lg' : 'default' }), primary ? 'w-full' : 'min-w-0 flex-[1_1_9rem] whitespace-normal'), children: offer.label }) as ReactElement} />
    : <Button key={offer.key} type="button" data-garment-action={offer.key} variant={primary ? 'default' : 'outline'} size={primary ? 'lg' : 'default'} className={primary ? undefined : 'min-w-0 flex-[1_1_9rem] whitespace-normal'} disabled={pending || offer.disabled === true} onClick={() => { returnActionRef.current = offer.key; offer.run() }}>{offer.label}</Button>

  /** The other actions are departures from the main one: one quiet list of rows, never a second row of buttons (a link stays a link, so those keep their buttons). */
  const moreActions = (label: string) => secondary.some((offer) => offer.link !== undefined)
    ? <div className="flex flex-wrap gap-2" role="group" aria-label={label}>{secondary.map((offer) => offerButton(offer, false))}</div>
    : <ActionList label={label} actions={secondary.map((offer) => ({ key: offer.key, label: offer.label, disabled: pending || offer.disabled === true, data: { 'data-garment-action': offer.key }, onClick: () => { returnActionRef.current = offer.key; offer.run() } }))} />

  const quantityCard = quantityAction === null ? null : <section className="grid gap-1 rounded-card bg-surface p-4 shadow-[var(--e1)]" aria-label={quantityAction.id === 'dirty' ? dirtyLabel : quantityAction.label}>
    <h3 ref={quantityHeadingRef} tabIndex={-1} className="m-0 text-[length:var(--step-1)] font-semibold outline-none">{quantityAction.id === 'dirty' ? dirtyLabel : quantityAction.label}</h3>
    <CountRow label={quantityAction.id === 'dirty' ? 'How many to add?' : quantityAction.id === 'unflag' ? 'How many to remove?' : quantityAction.id === 'wash_instead' ? 'How many need washing?' : quantityAction.id === 'washed' ? 'How many were washed?' : 'How many items?'} value={careCount} min={1} max={actionMembers.length} onChange={setCareCount} />
    <p className="m-0 text-[length:var(--step--1)] text-ink-2">{careCount} of {actionMembers.length} {quantityAction.id === 'dirty' ? 'ready pieces' : quantityAction.id === 'unflag' ? 'pieces in the hamper' : 'pieces'}</p>
    {quantityAction.id !== 'unflag' || actionMembers.every((member) => member.guest) ? null : <p className="m-0 text-[length:var(--step--1)] leading-[1.45] text-ink-2">They’ll be marked ready. This won’t record a wash.</p>}
  </section>

  const labelNote = unchecked.length === 0 ? null : <IssueNote kind="confirm" title={garmentTabText.labelTitle} detail={garmentTabText.labelDetail} actions={[{ label: garmentTabText.checkLabel, onClick: checkLabel }]} />
  const errorNote = error === null ? null : <IssueNote kind="conflict" title={error} actions={[]} />
  const wearerLabel = facts.wearerName ?? garmentText.sharedItem
  const colorName = colorDisplay(first)
  const kicker = [colorName, kindWords[first.kind as keyof typeof kindWords] ?? null, wearerLabel].filter(Boolean).join(' · ')
  const tagList = clothingTags(first)
  const preOwned = facts.members.find((member) => member.preOwned !== undefined)?.preOwned
  const dyeRuns = new Set(facts.members.map((member) => member.dyeRun ?? 'unknown'))
  const cells = careCells(facts.members)
  const stains = [...new Set(facts.members.flatMap((member) => member.flag?.reasons ?? []))].filter((reason) => (stainReasons as readonly string[]).includes(reason))
  const marked = facts.members.filter((member) => member.knownStain !== undefined)
  // Treating skips pieces in a running load or away (at the cleaner, drying), as the server does.
  const treatable = marked.filter((member) => member.inLoad === null && ['clean', 'dirty', 'needs_refresh'].includes(member.status))
  const markWords = [...new Set(marked.map((member) => garmentTabText.knownMarkWords(member.knownStain!)))].join(', ')
  const markActions = planning === undefined && calls.treatKnownStain !== undefined && calls.removeKnownStain !== undefined && marked.length > 0
  // A washed stain shows until it is gone or decided; a piece back in the hamper with a stain shows its stain row instead.
  const checked = facts.members.filter((member) => member.stainCheck !== undefined && !(member.flag?.reasons.some((reason) => (stainReasons as readonly string[]).includes(reason)) ?? false))
  const unanswered = checked.filter((member) => member.stainCheck!.answer === undefined)
  // "Stain gone?" asks about the unchecked pieces first; once all are answered it stays open for "Gone".
  const asked = unanswered.length > 0 ? unanswered : checked
  // On matching pieces, a stain answer covers only the pieces it names, as a known mark does.
  const stainOn = (count: number) => count === facts.members.length ? null : garmentTabText.knownMarkOn(count, facts.members.length)
  // What next is chosen once the piece is dry and not in a load, as the server allows.
  const stayed = checked.filter((member) => member.stainCheck!.answer !== undefined && member.inLoad === null && ['clean', 'dirty', 'needs_refresh'].includes(member.status))
  const firstCheck = checked[0]?.stainCheck
  // The fabric sets the home tries and whether the cleaner comes first, as the server checks; a stain that got worse gets no home try.
  const worse = stayed.some((member) => member.stainCheck!.answer === 'worse')
  const cleanerFirst = worse || stayed.some((member) => stainCleanerFirst(member.care?.material, effectiveWashMethod(member)))
  const tryAgain = !worse && stayed.every((member) => member.stainCheck!.washes < stainWashLimit(member.care?.material, effectiveWashMethod(member)))
  const stainHint = worse ? garmentTabText.stainWorse : cleanerFirst ? garmentTabText.stainCleanerFirst : tryAgain ? garmentTabText.stainValuable : stayed.some((member) => !member.care?.material || member.care.material === 'other') ? garmentTabText.stainFabricNeeded : null
  const stainIds = (members: readonly Textile[]) => members.map((member) => member.textileId) as FunctionArgs<typeof api.closet.answerStainCheck>['textileIds']
  const askQuestion = cells === null ? null : (key: CareQuestion) => { if (calls.answerCare === undefined) checkLabel(); else setAsking(key) }
  const statusCounts = [...new Set(facts.members.map(closetState))].map((state) => ({ state, count: facts.members.filter((member) => closetState(member) === state).length }))
  const summaryLines = statusCounts.length > 1 ? statusCounts.map(({ state, count }) => `${count} ${state === 'dirty' ? 'in hamper' : closetText.states[state]}`) : view.state === 'dirty' && facts.members.length > 1 ? [] : view.lines
  const pieceSummary = planning !== undefined || (facts.members.length < 2 && hamperCount === 0) ? null : <div className="flex flex-wrap items-center gap-x-1 text-[length:var(--step--1)] leading-[1.45] text-ink-2" aria-label="Matching pieces">
    <span>{countWord(facts.members.length, facts.members.length > 1 ? 'matching piece' : 'piece')}</span>
    {statusCounts.map(({ state, count }) => <span key={state} className="inline-flex items-center gap-1"><span aria-hidden="true">·</span>{state === 'dirty' ? renderLink({ to: 'laundry', item: hamperMembers[0]!.textileId }, {
      className: 'inline-flex min-h-11 items-center rounded-control px-1 -mx-1 text-link font-semibold touch-manipulation focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-surface-2 [@media_(hover:_hover)_and_(pointer:_fine)]:hover:bg-surface-2',
      children: `${count} in the hamper`,
    }) : `${count} ${closetText.states[state]}`}</span>)}
  </div>

  // Label notes show once for matching pieces; differing pieces are named by what differs.
  const instructionGroups = factGroups(facts.members, (member) => member.care === null ? 'no label' : member.care.instructions ?? null,
    (member) => member.care === null ? 'no care label recorded' : member.care.instructions === undefined ? 'no label notes recorded' : `label notes from ${member.care.instructions.source}`)

  const detailsPanel = <>
    <Facts rows={[
      { key: 'privacy', label: 'Visibility', value: facts.members.every((piece) => piece.private === true) ? 'Private' : facts.members.every((piece) => piece.private !== true) ? 'Shared' : 'Varies by piece' },
      { key: 'name', label: 'Name', value: first.name, onEdit: () => editAll('name') },
      { key: 'type', label: garmentTabText.type, value: kindWords[first.kind as keyof typeof kindWords] ?? garmentTabText.notSet, onEdit: () => editAll('kind') },
      { key: 'whose', label: garmentTabText.whose, value: wearerLabel, onEdit: () => editAll('whose') },
      { key: 'color', label: garmentTabText.color, value: colorName, onEdit: () => editAll('color') },
      { key: 'fabric', label: garmentTabText.fabric, value: fabricWords(first.care?.material ?? null), onEdit: () => editAll('material') },
      { key: 'brand', label: garmentTabText.brand, value: first.identity?.brand || garmentTabText.notSet, onEdit: () => editAll('brand') },
      { key: 'size', label: 'Size', value: first.identity?.size || garmentTabText.notSet, onEdit: () => editAll('size') },
      { key: 'quantity', label: garmentTabText.quantity, value: String(facts.members.length), ...(first.guest ? {} : { onEdit: () => editAll('quantity') }) },
      { key: 'tags', label: garmentTabText.tags, value: tagList.length === 0 ? garmentTabText.noTags : tagList.join(', '), onEdit: () => calls.updateTags === undefined ? editAll() : setEditingTags(true) },
    ]} />
    <p className="m-0 text-[length:var(--step--1)] leading-[1.45] text-ink-2">{garmentRecordCaveats.photo}</p>
    {facts.members.some((piece) => piece.decoration !== undefined) ? <GarmentPrintDetails textiles={facts.members} expanded editable={false} /> : null}
  </>

  const hamperControls = planning === undefined && !facts.members.some((member) => member.guest) && (readyMembers.length > 0 || hamperCount > 0)
  const primary: Offer | undefined = planning !== undefined ? undefined : hamperControls ? offers.find((offer) => offer.id === 'dirty') ?? { key: 'add', label: 'Add to hamper', run: () => undefined, disabled: true } : offers[0]
  const remove = hamperControls || planning !== undefined ? offers.find((offer) => offer.id === 'unflag') : undefined
  const secondary = offers.filter((offer) => offer !== primary && offer !== remove)
  const routine = facts.members.some((member) => !member.guest)
  // One grouped list for what opens more care detail (not three pills of different widths).
  const careRows = planning === undefined ? [] : [
    ...(routine ? [{ key: 'routine', label: 'Wash & dry preferences', onClick: () => setCareRow('routine') }] : []),
    ...instructionGroups.flatMap(({ key, first: member, label }) => member.care === null ? [] : [{ key: `label-${key}`, label: 'Additional label instructions', hint: label, onClick: () => setCareRow(`label-${key}`) }]),
  ]
  const materialProblem = facts.members.map((member) => materialCareProblem(member.care?.material, member.care)).find((problem) => problem !== null)
  const carePanel = <>
    {materialProblem === undefined ? null : <p role="alert" className="m-0 rounded-control bg-conflict-bg p-3 text-conflict-ink">{materialProblem} Correct the recorded label before planning.</p>}
    {summaryLines.length === 0 ? null : <Facts rows={[{ key: 'status', label: garmentTabText.status, value: summaryLines.join(' · ') }]} />}
    {cells === null
      ? <Facts rows={[{ key: 'label', label: 'Care label', value: 'Different care instructions', onEdit: () => openEdit({ kind: 'edit', careOnly: 'all', textileIds: refreshIds(facts.members) }) }]} />
      : <CareSymbolRow cells={cells} onOpen={planning === undefined ? askQuestion : null} />}
    {labelNote}
    {routine ? <PersonalRoutine textiles={facts.members} open={careRow === 'routine'} onClose={() => setCareRow(null)} /> : null}
    {instructionGroups.map(({ key, first: member, label }) => <CareInstructions key={key} textile={member} pieceLabel={label} open={careRow === `label-${key}`} onClose={() => setCareRow(null)} />)}
    {careRows.length === 0 ? null : <ActionList label="More about this care" chevrons actions={careRows} />}
    <Facts rows={[
      ...(stains.length === 0 ? [] : [{ key: 'stain', label: garmentTabText.stain, value: stains.map((reason) => flagReasonWords[reason]).join(', ') }]),
      ...(firstCheck === undefined ? [] : [
        { key: 'stain-check', label: garmentTabText.stainCheck, value: [garmentTabText.stainWords(firstCheck), stainOn(checked.length), garmentTabText.stainStatus(firstCheck.answer, firstCheck.washes)].filter((part) => part !== null).join(' · ') },
        // What it was pretreated with is its own row, not a clause of the stain's status.
        ...(firstCheck.tried.length === 0 ? [] : [{ key: 'stain-tried', label: garmentTabText.stainTried, value: firstCheck.tried.map(attemptName).join(', ') }]),
      ]),
      ...(marked.length === 0 ? [] : [{ key: 'mark', label: garmentTabText.knownMark, value: marked.length === facts.members.length ? markWords : `${markWords} · ${garmentTabText.knownMarkOn(marked.length, facts.members.length)}` }]),
      { key: 'sort', label: garmentTabText.sort, value: first.colorGroup === 'white' ? 'Whites' : colourWord(first.colorGroup), onEdit: () => editAll('color') },
      { key: 'dye', label: garmentTabText.dye, value: dyeRuns.size > 1 ? garmentTabText.differentDyeRuns : addGarmentText.dyeRuns[first.dyeRun ?? 'unknown'], onEdit: () => editAll('dyeRun') },
      ...(preOwned === undefined ? [] : [{ key: 'pre-owned', label: garmentTabText.preOwned, value: [preOwned.smell === undefined ? null : garmentTabText.preOwnedSmell(addGarmentText.preOwned.smells[preOwned.smell]), preOwned.fragile === true ? addGarmentText.preOwned.fragile : null].filter((part) => part !== null).join(' · ') || garmentTabText.preOwned }]),
    ]} />
    {!markActions || quantityAction !== null ? null : <div className={knownMarkActionsClassName} role="group" aria-label={garmentTabText.knownMark}>
      <p className="m-0 text-[length:var(--step--1)] leading-[1.45] text-ink-2">{garmentTabText.treatMarkHint}</p>
      <AnswerRow label={garmentTabText.knownMark} disabled={pending} answers={[
        ...(treatable.length === 0 ? [] : [{ key: 'treat_mark', label: garmentTabText.treatMark, data: { 'data-garment-action': 'treat_mark' } as const, onClick: () => { returnActionRef.current = 'treat_mark'; choose({ id: 'treat_mark', label: garmentTabText.treatMark }, treatable) } }]),
        { key: 'remove_mark', label: garmentTabText.removeMark, data: { 'data-garment-action': 'remove_mark' } as const, onClick: () => { returnActionRef.current = 'remove_mark'; choose({ id: 'remove_mark', label: garmentTabText.removeMark }, marked) } },
      ]} />
    </div>}
    {planning !== undefined || quantityAction !== null || asked.length === 0 || calls.answerStainCheck === undefined ? null : <div className={knownMarkActionsClassName} role="group" aria-label={garmentTabText.stainGone}>
      <p className="m-0 text-[length:var(--step-1)] font-semibold">{garmentTabText.stainGoneOn(stainOn(asked.length))}</p>
      <AnswerRow label={garmentTabText.stainGone} disabled={pending} answers={(unanswered.length > 0 ? ['gone', 'lighter', 'still_there'] as const : ['gone'] as const).map((answer) => ({ key: answer, label: garmentTabText.stainAnswers[answer],
        onClick: () => void run(() => calls.answerStainCheck!({ textileIds: stainIds(asked), answer }), (changed) => changed === 0 ? null : answer === 'gone' ? garmentTabText.stainNotes.gone : garmentTabText.stainNotes.answered) }))} />
    </div>}
    {planning !== undefined || quantityAction !== null || stayed.length === 0 || calls.resolveStain === undefined ? null : <div className={knownMarkActionsClassName} role="group" aria-label={garmentTabText.stainNext}>
      <p className="m-0 text-[length:var(--step-1)] font-semibold">{garmentTabText.stainNext}</p>
      {stainHint === null ? null : <p className="m-0 text-[length:var(--step--1)] leading-[1.45] text-ink-2">{stainHint}</p>}
      {/* The suggested step first; retiring the piece is rare and final, so it sits last and quiet. */}
      <ActionGroup label={garmentTabText.stainNext} actions={[
        ...[
          ...(cleanerFirst ? ['cleaner'] as const : []),
          ...(tryAgain ? ['try_again'] as const : []),
          ...(cleanerFirst ? [] : ['cleaner'] as const),
          'keep' as const,
        ].map((choice) => ({ key: choice, disabled: pending, label: choice === 'try_again' ? garmentTabText.stainTryAgain : choice === 'cleaner' ? garmentTabText.stainCleaner : garmentTabText.stainKeep,
          onClick: () => void run(() => calls.resolveStain!({ textileIds: stainIds(stayed), choice }), (changed) => changed === 0 ? null : garmentTabText.stainNotes[choice === 'try_again' ? 'retry' : choice === 'cleaner' ? 'cleaner' : 'kept']) })),
        ...(calls.retire === undefined ? [] : [{ key: 'retire', quiet: true, disabled: pending, label: garmentTabText.stainRetire,
          onClick: () => void run(() => calls.retire!({ textileIds: stainIds(stayed) }), (changed, result) => {
            if (changed > 0) confirmTrash(garmentTabText.stainNotes.retired, result.trashedAt === undefined || result.revisions === undefined ? undefined : { textileIds: stainIds(stayed), trashedAt: result.trashedAt, revisions: result.revisions }, calls.restoreTextiles)
            return null
          }) }]),
      ]} />
    </div>}
    {secondary.length === 0 || quantityAction !== null ? null : moreActions(garmentTabText.more)}
  </>

  const footer = quantityAction !== null
    ? <TaskFooter secondary={<Button type="button" variant="outline" disabled={pending} onClick={() => setQuantityAction(null)}>Cancel</Button>}><Button size="lg" disabled={pending} onClick={() => act(quantityAction.id, actionMembers.slice(0, careCount))}>{quantityAction.id === 'washed' ? 'Continue' : quantityAction.id === 'dirty' ? dirtyLabel : quantityAction.label}</Button></TaskFooter>
    : <TaskFooter secondary={remove === undefined ? null : offerButton(remove, false)}>{planning !== undefined || primary === undefined ? <Button size="lg" onClick={onClose}>{garmentText.done}</Button> : offerButton(primary, true)}</TaskFooter>

  return (
    <Sheet title={view.title} kicker={kicker} tall
      headerArt={garmentCategoryPhoto(first.kind, first.colorGroup) === undefined ? undefined : <CategoryPhoto src={garmentCategoryPhoto(first.kind, first.colorGroup)!} fallback={<GarmentIcon kind={first.kind} colorGroup={first.colorGroup} className="size-9" />} className="size-full object-cover" loading="eager" />}
      media={<GarmentIcon kind={first.kind} colorGroup={first.colorGroup} className="size-9" />}
      onEdit={planning === undefined && quantityAction === null && facts.members.every((member) => !member.guest) ? () => editAll() : undefined}
      editLabel="Edit item details" busy={pending}
      onClose={onClose} closeAtTop footer={footer}>
      {planning !== undefined ? <div ref={recordBodyRef} className="grid gap-4">
        {quantityCard}
        <div hidden={quantityAction !== null} className="grid gap-4 [&[hidden]]:hidden">
          {summaryLines.length === 0 ? null : <div className={garmentStatusClassName}>{summaryLines.map((line) => <p key={line}>{line}</p>)}</div>}
          {labelNote}
          <LaundryCareForm key={first.textileId} members={facts.members} selectedIds={planning.selectedIds} onGroupCountChange={planning.onGroupCountChange} now={facts.now} flag={calls.flagDirty} onPendingChange={setPending} />
          {secondary.length === 0 ? null : moreActions(garmentTabText.more)}
        </div>
        {errorNote}
      </div> : <div ref={recordBodyRef} className="grid gap-4">
        {quantityCard}
        <div hidden={quantityAction !== null} className="grid gap-4 [&[hidden]]:hidden">
          {pieceSummary}
          {renderRecord === undefined ? <GarmentRecordTabs key={first.textileId} textileId={first.textileId} details={detailsPanel} care={carePanel} /> : renderRecord({ details: detailsPanel, care: carePanel })}
        </div>
        {errorNote}
      </div>}
      {editingTags && calls.updateTags !== undefined ? <TagsSheet name={first.name} kind={first.kind} textileIds={refreshIds(facts.members)} initial={tagList} knownTags={knownTags ?? usedClothingTags(facts.members)} save={calls.updateTags}
        onClose={() => setEditingTags(false)} onSaved={(message) => { setEditingTags(false); toast.success(message) }} /> : null}
      {editing === null || renderEdit === undefined ? null : renderEdit(editing, (outcome) => outcome?.removedAll ? onClose() : setEditing(null))}
      {asking !== null && calls.answerCare !== undefined ? <CareQuestionSheet name={first.name} kicker={kicker} question={asking} members={facts.members} save={calls.answerCare}
        onClose={() => setAsking(null)} onSaved={(message) => { setAsking(null); toast.success(message) }} /> : null}
    </Sheet>
  )
}

/** Group today's care needs, independently of the history kept on each garment. */
export function laundryCareGroups(members: readonly Textile[], now: number) {
  const groups = new Map<string, { key: string; label: string; draft: FlagDraft; members: Textile[] }>()
  for (const member of members) {
    const draft = draftFromFlag(member.flag, member.soilLevel, now)
    const args = flagArgs([], draft, now)
    const reasons = args.reasons.filter((reason) => reason !== 'worn')
    const key = JSON.stringify([reasons, args.soilLevel, args.neededBy, args.stainNote, args.stainReport, args.observation])
    const group = groups.get(key)
    if (group !== undefined) group.members.push(member)
    else groups.set(key, {
      key, draft, members: [member],
      label: [reasons.map((reason) => flagReasonWords[reason]).join(', ') || 'Everyday wear', args.stainNote,
        args.soilLevel === 'heavy' ? 'Very dirty' : args.soilLevel === 'light' ? 'Light soil' : null,
        args.neededBy === undefined ? null : `Needed ${dayWord(args.neededBy, now)}`].filter(Boolean).join(' · '),
    })
  }
  return [...groups.values()]
}

/** Laundry changes the current care need; identity and care-label editing stay in the garment editor. */
function LaundryCareForm({ members, selectedIds, onGroupCountChange, now, flag, onPendingChange }: { members: readonly Textile[]; selectedIds: readonly string[]; onGroupCountChange: (textileIds: readonly string[], count: number) => void; now: number; flag: FlagCall; onPendingChange: (pending: boolean) => void }) {
  const id = useId()
  const groups = laundryCareGroups(members, now)
  const [editing, setEditing] = useState<{ members: readonly Textile[]; initial: FlagDraft; draft: FlagDraft; count: number } | null>(null)
  const summaryRef = useRef<HTMLParagraphElement>(null)
  const editorRef = useRef<HTMLHeadingElement>(null)
  const isEditing = editing !== null
  useEffect(() => { if (isEditing) editorRef.current?.focus() }, [isEditing])
  const targets = editing?.members.slice(0, editing.count) ?? []
  const draft = editing?.draft
  const garments = targets.map((member) => ({ textileId: member.textileId, name: member.name, dryCleanOnly: effectiveWashMethod(member) === 'dry_clean_only' }))
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const selectedCount = members.filter((member) => selectedIds.includes(member.textileId)).length
  const changed = editing !== null && JSON.stringify(flagArgs([], editing.draft, now)) !== JSON.stringify(flagArgs([], editing.initial, now))
  const set = (patch: Partial<FlagDraft>) => { setEditing((current) => current === null ? null : { ...current, draft: { ...current.draft, ...patch } }); setMessage(null) }
  const save = async () => {
    if (pending || !changed || draft === undefined || (draft.needed === 'pick' && dayInputEnd(draft.day) === null)) return
    setPending(true); onPendingChange(true); setError(null)
    try {
      const result = await flag(flagArgs(garments, draft, now))
      if (result.skipped > 0 || result.toDryClean.length > 0) setError('Some pieces are no longer waiting for this wash. Close this view and check Laundry.')
      else {
        setEditing(null)
        setMessage(`Care saved for ${countWord(targets.length, 'item')}`)
        summaryRef.current?.focus()
      }
    } catch (caught) { setError(errorMessage(caught)) }
    finally { setPending(false); onPendingChange(false) }
  }
  return <form className={laundryCareFormClassName} onSubmit={(event) => { event.preventDefault(); void save() }}>
    <FieldSet disabled={pending}>
      <FieldLegend>{editing === null ? 'Choose for this wash' : 'Stains and notes'}</FieldLegend>
      <p className={laundryCareScopeClassName} aria-live="polite" tabIndex={-1} ref={summaryRef}>{editing === null ? `${selectedCount} ${selectedCount === 1 ? 'item' : 'items'} selected. Anything you don’t choose stays in the hamper.` : `Adding care details to items you’ve chosen to wash.`}</p>
      {editing !== null ? null : <div className={laundryCareGroupsClassName}>
        {groups.map((group) => {
          const ids = group.members.map((member) => member.textileId)
          const count = ids.filter((textileId) => selectedIds.includes(textileId)).length
          const special = group.draft.reasons.some((reason) => reason !== 'worn') || group.draft.needed !== 'none' || group.draft.soil === 'heavy'
          return <section className={laundryCareGroupClassName} aria-label={group.label} key={group.key}>
            {groups.length === 1 && !special ? null : <strong>{group.label}</strong>}
            <Stepper label="Wash now" value={count} min={0} max={ids.length} onChange={(value) => onGroupCountChange(ids, value)} format={(value) => `${value} of ${ids.length}`} />
            <Button type="button" variant="outline" disabled={count === 0} onClick={() => {
              setEditing({ members: group.members.filter((member) => selectedIds.includes(member.textileId)), initial: group.draft, draft: group.draft, count: 1 })
              setMessage(null); setError(null)
            }}><DesignIcon name="sliders" size="1em" aria-hidden="true"  />{special ? 'Edit stains and notes' : 'Add stains or a note'}</Button>
          </section>
        })}
      </div>}
      {editing === null || draft === undefined ? null : <div className={laundryCareEditorClassName}>
      <h3 tabIndex={-1} ref={editorRef}>How many have these care needs?</h3>
      {editing.members.length > 1 ? <Stepper label="Affected clothes" value={editing.count} min={1} max={editing.members.length} onChange={(count) => setEditing((current) => current === null ? null : { ...current, count })} format={(value) => `${value} of ${editing.members.length} selected`} /> : null}
      <p className={laundryCareScopeClassName}>Only {countWord(editing.count, 'selected item')} will change. Other items keep their own stains and notes.</p>
      <div className={laundryCareFieldsClassName}>
        <Field><FieldLabel id={`${id}-soil`}>How dirty?</FieldLabel><SegmentChoice labelledBy={`${id}-soil`} value={draft.soil ?? soilForFlag(draft.reasons)} onChange={(soil) => set({ soil: soil as SoilLevel })} options={soilLevels.map((level) => ({ value: level, label: <span className="inline-flex items-center justify-center gap-1.5"><span className="inline-flex" aria-hidden="true">{Array.from({ length: soilLevels.indexOf(level) + 1 }, (_, drop) => <DesignIcon key={drop} name="drop" size={14} />)}</span>{soilButtonWords[level]}</span> }))} /></Field>
        <Field><FieldLabel id={`${id}-needed`}>Needed by?</FieldLabel><SegmentChoice labelledBy={`${id}-needed`} value={draft.needed} onChange={(needed) => set({ needed: needed as FlagDraft['needed'] })} options={[['none', 'No rush'], ['today', 'Today'], ['tomorrow', 'Tomorrow'], ['pick', 'Pick a day']].map(([value, label]) => ({ value: value!, label: label! }))} /></Field>
        {draft.needed !== 'pick' ? null : <Field><FieldLabel htmlFor={`${id}-day`}>Pick a day</FieldLabel><Input id={`${id}-day`} type="date" value={draft.day} min={dayInputValue(now)} required onChange={(event) => set({ day: event.target.value })} /></Field>}
      </div>
      <div className={laundryCareReasonsClassName}>
          <ChipRow label="What happened?" options={flagReasons.map((reason) => ({ value: reason, label: flagReasonWords[reason] }))} values={draft.reasons} onToggle={(reason) => set({ soil: null, reasons: draft.reasons.includes(reason) ? draft.reasons.filter((entry) => entry !== reason) : [...draft.reasons, reason] })} />
          {draft.reasons.some((reason) => (stainReasons as readonly string[]).includes(reason)) ? <StainFields draft={draft} onChange={set} /> : null}
      </div>
      <div className={laundryCareSaveClassName}><Button type="submit" disabled={!changed || (draft.needed === 'pick' && dayInputEnd(draft.day) === null)}>{pending ? 'Saving…' : 'Save care details'}</Button><Button type="button" variant="outline" onClick={() => { setEditing(null); setError(null); summaryRef.current?.focus() }}>Cancel</Button></div>
      </div>}
      {message === null ? null : <p className={laundryCareScopeClassName} role="status">{message}</p>}
      {error === null ? null : <p className={cn(noticeClassName, badClassName)} role="alert">{error}</p>}
    </FieldSet>
  </form>
}

/** "Dropped off" at the cleaner, with an optional note and pick-up day. The note starts as the one the pieces share (a stain's), to show the cleaner. */
export function DroppedOffSheet({ garments, now, dropped, onClose, onDone }: {
  garments: readonly { readonly textileId: string; readonly name: string; readonly cleanerNote?: string | null }[]
  now: number
  dropped: GarmentCalls['droppedAtCleaner']
  onClose: () => void
  onDone: (message: string | null) => void
}) {
  const notes = new Set(garments.map((garment) => garment.cleanerNote ?? ''))
  const initialNote = notes.size === 1 ? [...notes][0]! : ''
  const [note, setNote] = useState(initialNote)
  const [day, setDay] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const noteId = useId()
  const dayId = useId()
  const save = async () => {
    setPending(true)
    setError(null)
    const pickupBy = dayInputEnd(day)
    try {
      await dropped({
        textileIds: garments.map((garment) => garment.textileId) as FunctionArgs<typeof api.closet.droppedAtCleaner>['textileIds'],
        // Leaving the field empty keeps each piece's own note; emptying a shared note clears it.
        ...(note.trim().length === 0 && initialNote === '' ? {} : { note: note.trim() }),
        ...(pickupBy === null ? {} : { pickupBy }),
      })
      onDone(null)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setPending(false)
    }
  }
  return (
    <Sheet title={garmentText.droppedOff} subtitle={garments.length === 1 ? garments[0]!.name : countWord(garments.length, 'laundry item')} onClose={onClose} closeLabel={garmentText.cancel} compactActions
      footer={(
        <>
          {error === null ? null : <p className={cn(noticeClassName, badClassName)} role="alert">{error}</p>}
          <Button type="button" className={largeClassName} disabled={pending} onClick={() => void save()}>{garmentText.droppedOff}</Button>
        </>
      )}>
      <Field className={fieldClassName}>
        <FieldLabel htmlFor={noteId}>{garmentText.noteOptional}</FieldLabel>
        <Input id={noteId} value={note} maxLength={120} placeholder={garmentText.stainNotePlaceholder} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <Field className={fieldClassName}>
        <FieldLabel htmlFor={dayId}>{garmentText.pickupOptional}</FieldLabel>
        <Input id={dayId} type="date" value={day} min={dayInputValue(now)} onChange={(event) => setDay(event.target.value)} />
      </Field>
    </Sheet>
  )
}
