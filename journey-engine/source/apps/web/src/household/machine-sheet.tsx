import { Field, FieldLabel, FieldSet, FieldLegend } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { useIntakeRecovery } from '@/kit/device-state'
import { previousMachineDraftNames, validMachineIntake } from '@/kit/intake-validation'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useQuery } from 'convex/react'
import type { FunctionArgs } from 'convex/server'
import { dryerHeats, machineRole, washProcessProblem, mechanicalSeverities, type MechanicalSeverity, type DryerHeat } from '@washcloset/planner'

import { api } from '@/api'
import { CatalogReference } from '@/products/catalog-reference'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { machineText, uiText } from '@/copy'
import { applianceCopy } from '@/copy-household'
import { capacityWords } from '@/household/household-facts'
import type { Machine } from '@/household/inventory-types'
import { loadWashPlace } from '@/private-state'
import { Sheet } from '@/kit/sheet'
import { focusLabeledControl } from '@/kit/focus-field'
import { ActionRow, FactsCard, SheetText, actionClassName, type FactRow } from '@/household/household-blocks'
import { DesignIcon } from '@/kit/design-icons'
import { IconChoiceGrid } from '@/kit/icon-choice-grid'
import { Choices, ErrorNotice, HeLogo, Stepper, dryerHeatLabels, useConvexCall } from '@/kit/ui'

const rinsePlacements = ['softener_compartment', 'direct_to_drum', 'center_agitator', 'downy_ball'] as const

/**
 * The machine sheet: one entry for a washer or dryer, or a shared room's row of identical ones
 * ("How many like it?"). Only what the pass and the machine screen use is asked: where it is, what
 * it is, the door, the HE logo, the price, the minutes, the heat buttons as the dryer prints them,
 * and a name. Evidence, "How sure is this?" and sizes stay behind the screen.
 */

const bulkRowLabelClassName = cn(
  "bulk-row-label",
  "text-[length:var(--step-1)] font-semibold",
)

const bulkHintClassName = cn(
  "bulk-hint",
  "text-muted-foreground leading-[1.4]",
  "text-[length:var(--step--1)]",
  "[.machine-he_&]:flex [.machine-he_&]:items-center [.machine-he_&]:gap-2",
)

const machineFieldsClassName = cn(
  "machine-fields",
  "grid gap-4",
)

const fieldClassName = cn(
  "field",
  "grid gap-2",
  "[&_label]:text-[length:var(--step-1)]",
  "[&_label]:font-semibold [&_label]:text-ink",
  "[.sheet_&_:is(input,_select,_textarea):focus-visible]:[border-color:var(--focus)]",
  "[.sheet_&_:is(input,_select,_textarea)]:bg-surface [.sheet_&_:is(input,_select,_textarea)]:rounded-field",
)

const machineNumberClassName = cn(
  "machine-number",
  "max-w-[9rem]",
  "text-[length:max(1rem,_var(--step-1))]",
)

const fieldHintClassName = cn(
  "field-hint",
  "text-muted-foreground leading-[1.4]",
  "text-[length:var(--step--1)]",
)

const machineDetailsClassName = cn(
  "machine-details",
)

const machineDetailsTriggerClassName = cn(
  "flex min-h-11 items-center justify-between font-semibold",
)

const machineDetailsPanelClassName = cn(
  "grid gap-3 pt-3",
)

const machineHeatClassName = cn(
  "machine-heat",
  "grid gap-3 m-0 p-0 border-0",
)

const bulkCarriedClassName = cn(
  "bulk-carried",
  "text-ink-2 p-[var(--space-2)_var(--space-3)] rounded-label bg-surface",
  "text-[length:var(--step-0)]",
)

const bulkCountClassName = cn(
  "bulk-count",
  "grid gap-1",
  "[justify-items:start]",
)

const machineHeatRowClassName = cn(
  "machine-heat-row",
  "grid grid-cols-[7.5rem_minmax(0,_1fr)] items-center gap-3",
  "[&_label]:font-semibold",
  "[&_input]:min-h-[3rem]",
  "[&_input]:text-[length:max(1rem,_var(--step-0))]",
)

type Place = 'home' | 'shared'
type Kind = 'washer' | 'dryer' | 'hanging'
type Door = 'front' | 'top'
type HeAnswer = 'yes' | 'no' | 'not_sure'
/** The drawer or under-the-lid slots; the drum always takes a product too. */
type Slot = 'detergent_compartment' | 'softener_compartment' | 'bleach_compartment'

export const maxLikeIt = 24
const slots: readonly Slot[] = ['detergent_compartment', 'softener_compartment', 'bleach_compartment']
const slotWords: Readonly<Record<Slot, string>> = machineText.slotWords
/** What the owner may type: the words a shared dryer's buttons often say, as hints only. */
const heatExamples: Readonly<Record<DryerHeat, string>> = machineText.heatExamples
const taps = { source: 'machine_taps', confidence: 'observed' as const }

export type MachineDraft = {
  readonly place: Place | null
  readonly kind: Kind | null
  readonly door: Door | null
  readonly he: HeAnswer | null
  readonly slots: readonly Slot[]
  readonly price: string
  /** Minutes one payment buys, for a shared dryer sold by time. */
  readonly block: string
  readonly minutes: string
  readonly programMode?: 'fixed' | 'sensor' | 'unknown'
  readonly rinseContact?: Machine['rinseContact']
  readonly washProcesses?: Machine['washProcesses']
  /** The words on each heat button; empty when the dryer has no such button. */
  readonly heat: Readonly<Record<DryerHeat, string>>
  readonly name: string
  readonly model: string
  readonly volume: string
  /** Until the name is typed, it follows the kind ("Washer", "Dryer"). */
  readonly named: boolean
  readonly count: number
}

const noHeat: Readonly<Record<DryerHeat, string>> = { no_heat: '', delicate: '', low: '', medium: '', high: '' }
const defaultName = (kind: Kind | null) => (kind === 'dryer' ? machineText.defaultNames.dryer : kind === 'washer' ? machineText.defaultNames.washer : kind === 'hanging' ? applianceCopy.hangingDryer : '')

/** A new entry. The place comes from first run when it was one place; nothing else is preset. */
export function newMachineDraft({ place = null, kind = null }: { place?: Place | null; kind?: Kind | null } = {}): MachineDraft {
  return { place, kind, door: null, he: null, slots: [], price: '', minutes: '', heat: noHeat, name: defaultName(kind), model: '', volume: '', named: false, count: 1, block: '' }
}

/** First run's "Where do you wash?" as the sheet's starting place; "Both" leaves it to a tap. */
export function washPlace(householdId: string, savedPlace?: 'home' | 'shared' | 'laundromat' | 'both' | null): Place | null {
  const place = savedPlace ?? loadWashPlace(householdId)
  return place === 'laundromat' ? 'shared' : place === 'home' || place === 'shared' ? place : null
}

/** Identical machines, as the Household list and the edit sheet treat them. */
export type MachineGroup = {
  readonly key: string
  /** The shared name without its number, or the one machine's own name. */
  readonly name: string
  readonly machines: readonly Machine[]
}

const numbered = /^(.*\S)\s+#?(\d{1,2})$/

/** The number on a sibling's tile: the one in its name ("Speed Queen washer 3"), else its place in the list. */
export function machineNumber(name: string, index: number): string {
  return /\s#?(\d{1,2})$/.exec(name)?.[1] ?? String(index + 1)
}

/**
 * Siblings share recorded settings, capacity and price, and differ only by a trailing number
 * ("Speed Queen washer 1…4"). Different equipment stays distinguishable. Order follows the list.
 */
export function machineGroups(machines: readonly Machine[]): MachineGroup[] {
  const groups = new Map<string, { name: string; machines: Machine[] }>()
  for (const machine of machines) {
    const base = numbered.exec(machine.name)?.[1] ?? null
    const key = base === null ? `one:${machine.machineId}` : JSON.stringify({
      name: base.toLowerCase(), type: machine.applianceType, location: machine.location, model: machine.model,
      he: machine.highEfficiency, capacity: machine.capacityUnits, confidence: machine.capacityConfidence, volume: machine.drumVolume,
      heat: machine.heatSettings.map(({ heat, label }) => ({ heat, label })).sort((left, right) => left.heat.localeCompare(right.heat)),
      cycles: [...machine.supportedCycles].sort(), placements: [...machine.placements].sort(),
      minutes: Object.entries(machine.cycleMinutes).sort(([left], [right]) => left.localeCompare(right)),
      rinseContact: machine.rinseContact ?? {},
      washProcesses: machine.washProcesses ?? {},
      price: machine.pricePerStart, block: machine.blockMinutes, archived: machine.archived,
    })
    const group = groups.get(key)
    if (group === undefined) groups.set(key, { name: base ?? machine.name, machines: [machine] })
    else group.machines.push(machine)
  }
  return [...groups.entries()].map(([key, group]) => ({
    key,
    name: group.machines.length === 1 ? group.machines[0]!.name : group.name,
    machines: group.machines,
  }))
}

const money = (amount: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)

/** "Speed Queen washer ×4 · Shared · $2.50": a price only when every sibling costs the same. */
export function machineGroupLine(group: MachineGroup, currency = 'USD'): { readonly title: string; readonly meta: string } {
  const first = group.machines[0]!
  const count = group.machines.length
  const prices = new Set(group.machines.map((machine) => machine.pricePerStart))
  const price = prices.size === 1 && first.pricePerStart !== null && first.location === 'shared' ? money(first.pricePerStart, currency) : null
  const place = first.location === 'shared' ? machineText.shared : first.location === 'home' ? machineText.atHome : null
  const out = group.machines.every((machine) => machine.archived) ? machineText.notInUse : null
  return {
    title: count > 1 ? `${group.name} ×${count}` : group.name,
    meta: [place, price, out].filter((part): part is string => part !== null).join(' · '),
  }
}

/** The sheet's answers for a group, from its first machine; the kind cannot change. */
export function draftFromGroup(group: MachineGroup): MachineDraft {
  const first = group.machines[0]!
  const role = machineRole(first)
  const kind: Kind = role === 'hanging' ? 'hanging' : role
  const minutes = kind === 'hanging' ? undefined : first.cycleMinutes[kind === 'dryer' ? 'timed' : 'normal']?.durationMinutes
  const heat = { ...noHeat }
  for (const setting of first.heatSettings) heat[setting.heat] = setting.label
  return {
    place: first.location,
    kind,
    door: first.applianceType === 'front_load_washer' ? 'front' : first.applianceType === 'top_load_washer' ? 'top' : null,
    he: first.highEfficiency === true ? 'yes' : first.highEfficiency === false ? 'no' : kind === 'washer' ? 'not_sure' : null,
    slots: slots.filter((slot) => first.placements.includes(slot)),
    price: first.pricePerStart === null ? '' : String(first.pricePerStart),
    block: first.blockMinutes === null || first.blockMinutes === undefined ? '' : String(first.blockMinutes),
    minutes: minutes === undefined ? '' : String(minutes),
    ...(kind === 'dryer' ? { programMode: first.cycleMinutes.timed?.mode ?? 'unknown' } : {}),
    ...(first.rinseContact === undefined ? {} : { rinseContact: first.rinseContact }),
    ...(first.washProcesses === undefined ? {} : { washProcesses: first.washProcesses }),
    heat,
    name: group.name,
    model: first.model ?? '',
    volume: first.drumVolume?.unit === 'cu_ft' ? String(first.drumVolume.amount) : '',
    named: true,
    count: group.machines.length,
  }
}

const parsed = (value: string, min: number, max: number): number | null | 'bad' => {
  if (value.trim() === '') return null
  const number = Number(value.replace(/^\$/, ''))
  return Number.isFinite(number) && number >= min && number <= max ? number : 'bad'
}

const blockProblem = (value: string) => value.trim() !== '' && !(Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 120)

/** What is still missing, in plain words, or null when the sheet can save. */
export function machineDraftProblem(draft: MachineDraft): string | null {
  if (draft.place === null) return machineText.problems.place
  if (draft.kind === null) return machineText.problems.kind
  if (draft.kind === 'washer' && draft.door === null) return machineText.problems.door
  if (draft.name.trim() === '') return machineText.problems.name
  if (draft.place === 'shared' && parsed(draft.price, 0.01, 100) === 'bad') return machineText.problems.price
  if (draft.kind !== 'hanging' && parsed(draft.minutes, 1, 300) === 'bad') return machineText.problems.minutes
  if (draft.kind === 'dryer' && draft.place === 'shared' && blockProblem(draft.block)) return applianceCopy.blockMinutesProblem
  if (draft.kind !== 'hanging' && parsed(draft.volume, 0.5, 12) === 'bad') return machineText.problems.volume
  if (draft.kind === 'washer' && Object.values(draft.washProcesses ?? {}).some((process) => washProcessProblem(process) !== null)) return 'Record the checked program and source, or remove its incomplete settings.'
  if (draft.kind === 'washer' && Object.values(draft.rinseContact ?? {}).some((contact) => !Number.isFinite(contact.minutes) || contact.minutes <= 0 || contact.minutes > 300 || !contact.source.trim() || !contact.placement.trim() || contact.placement === 'direct_to_drum' && !contact.timing?.trim())) return 'Complete the rinse contact time and source, or clear this optional record.'
  return null
}

type Fields = Omit<FunctionArgs<typeof api.inventory.updateMachineGroup>, 'machineIds' | 'name' | 'provenance'> & { provenance: typeof taps }

/**
 * The answers as the machine calls take them. A home machine has no price; unanswered minutes and
 * prices are left out, never guessed; "Not sure" leaves HE unrecorded, so a dose that depends on it
 * is asked at the machine. On an edit, other cycles' minutes are kept.
 */
export function machineFieldsFrom(draft: MachineDraft, existing: Machine | null = null): Fields {
  const dryer = draft.kind === 'dryer'
  const hanging = draft.kind === 'hanging'
  const price = draft.place === 'shared' ? parsed(draft.price, 0.01, 100) : null
  const minutes = parsed(draft.minutes, 1, 300)
  const cycle = dryer ? 'timed' : 'normal'
  const kept = existing === null || draft.model.trim() !== (existing.model ?? '') ? {} : Object.fromEntries(Object.entries(existing.cycleMinutes)
    .filter(([name]) => name !== cycle && !dryer)
    .map(([name, entry]) => [name, entry.durationMinutes]))
  const cycleMinutes = { ...kept, ...(typeof minutes === 'number' ? { [cycle]: minutes } : {}) }
  const volume = parsed(draft.volume, 0.5, 12)
  const block = dryer && draft.place === 'shared' && draft.block.trim() !== '' && !blockProblem(draft.block) ? Number(draft.block) : null
  return {
    location: draft.place ?? undefined,
    ...(draft.model.trim() === '' ? {} : { model: draft.model.trim() }),
    ...(!hanging && typeof volume === 'number' ? { drumVolume: { amount: Number(draft.volume), unit: 'cu_ft' as const } } : {}),
    applianceType: hanging ? 'heated_hanging_dryer' : dryer ? 'tumble_dryer' : draft.door === 'top' ? 'top_load_washer' : 'front_load_washer',
    ...(hanging ? {} : dryer
      ? { heatSettings: dryerHeats.filter((heat) => draft.heat[heat].trim() !== '').map((heat) => ({ heat, label: draft.heat[heat].trim() })) }
      : { highEfficiency: draft.he === 'yes' ? true : draft.he === 'no' ? false : null, placements: [...draft.slots, 'direct_to_drum' as const] }),
    ...(!dryer && !hanging && (existing === null || draft.washProcesses !== undefined) ? { supportedCycles: [...new Set([...(existing?.supportedCycles ?? ['normal']), ...Object.keys(draft.washProcesses ?? {})])] } : {}),
    ...(typeof price === 'number' ? { pricePerStart: price } : {}),
    ...(block === null ? {} : { blockMinutes: block }),
    ...(hanging || (existing === null && Object.keys(cycleMinutes).length === 0) ? {} : { cycleMinutes }),
    ...(dryer && typeof minutes === 'number' ? { cycleModes: { timed: draft.programMode ?? 'unknown' } } : {}),
    ...(draft.kind !== 'washer' || draft.rinseContact === undefined ? {} : { rinseContact: draft.rinseContact }),
    ...(draft.kind !== 'washer' || draft.washProcesses === undefined ? {} : { washProcesses: draft.washProcesses }),
    provenance: taps,
  }
}

type MachineStep = 'type' | 'controls' | 'identity' | 'review'
type MachineSection = Exclude<MachineStep, 'review'> | 'washer' | 'cycle' | 'programs' | 'contact' | 'specifications'
export type MachineFocus = 'capacity' | 'model' | MachineSection

export function machineProblemTarget(draft: MachineDraft): { section: MachineSection; label: string; occurrence?: number } | null {
  const problem = machineDraftProblem(draft)
  if (problem === null) return null
  if (problem === machineText.problems.place) return { section: 'type', label: machineText.where }
  if (problem === machineText.problems.kind) return { section: 'type', label: machineText.kind }
  if (problem === machineText.problems.door) return { section: 'controls', label: machineText.door }
  if (problem === machineText.problems.name) return { section: 'identity', label: applianceCopy.numberOrLabel }
  if (problem === machineText.problems.price) return { section: 'identity', label: machineText.pricePerStart }
  if (problem === applianceCopy.blockMinutesProblem) return { section: 'identity', label: applianceCopy.blockMinutes }
  if (problem === machineText.problems.minutes) return { section: 'cycle', label: draft.kind === 'dryer' ? machineText.dryerMinutes : machineText.washerMinutes }
  if (problem === machineText.problems.volume) return { section: 'specifications', label: machineText.drumSize }
  const processes = ['normal', 'permanent_press', 'delicate']
  const invalidProcess = processes.find((cycle) => draft.washProcesses?.[cycle] !== undefined && washProcessProblem(draft.washProcesses[cycle]!) !== null)
  if (invalidProcess !== undefined || Object.values(draft.washProcesses ?? {}).some((process) => washProcessProblem(process) !== null)) {
    const sourceMissing = invalidProcess !== undefined && draft.washProcesses![invalidProcess]!.programLabel.trim() && !draft.washProcesses![invalidProcess]!.source.trim()
    return { section: 'programs', label: sourceMissing ? 'Where these settings were checked' : 'Checked program and selected options', occurrence: invalidProcess === undefined ? 0 : (sourceMissing ? processes.filter((cycle) => draft.washProcesses?.[cycle] !== undefined) : processes).indexOf(invalidProcess) }
  }
  const contacts = [...new Set(['normal', ...Object.keys(draft.rinseContact ?? {})])]
  const cycle = contacts.find((cycle) => {
    const contact = draft.rinseContact?.[cycle]
    return contact !== undefined && (!Number.isFinite(contact.minutes) || contact.minutes <= 0 || contact.minutes > 300 || !contact.source.trim() || !contact.placement.trim() || contact.placement === 'direct_to_drum' && !contact.timing?.trim())
  })
  const contact = cycle === undefined ? undefined : draft.rinseContact?.[cycle]
  const label = contact === undefined || !Number.isFinite(contact.minutes) || contact.minutes <= 0 || contact.minutes > 300 ? 'Rinse contact minutes'
    : !contact.placement.trim() ? 'Sanitizer release used for this contact time'
    : contact.placement === 'direct_to_drum' && !contact.timing?.trim() ? 'By-hand addition timing from the directions' : 'Where the program contact time was checked'
  return { section: 'contact', label, occurrence: cycle === undefined ? 0 : contacts.indexOf(cycle) }
}

export function machineIntakeSteps(draft: MachineDraft): readonly MachineStep[] {
  return ['type', ...(draft.kind === 'hanging' ? [] : ['controls' as const]), 'identity', 'review']
}

export function machineStepProblem(draft: MachineDraft, step: MachineStep): string | null {
  if (step === 'type') return draft.place === null ? machineText.problems.place : draft.kind === null ? machineText.problems.kind : null
  if (step === 'controls') return draft.kind === 'washer' && draft.door === null ? machineText.problems.door : null
  return machineDraftProblem(draft)
}

const machineDetailNames: Readonly<Partial<Record<MachineFocus, string>>> = {
  washer: 'HE logo and dispensers', cycle: 'Cycle time', specifications: 'Model and drum size',
  programs: 'Checked wash programs', contact: 'Sanitizer contact time',
}
const machineDetailSections: Readonly<Record<Kind, readonly MachineSection[]>> = {
  washer: ['washer', 'cycle', 'specifications', 'programs', 'contact'],
  dryer: ['cycle', 'specifications'], hanging: ['specifications'],
}

/**
 * The sheet's fields, without saving, so it can be drawn in tests. `ask="required"` puts where it
 * is, what it is and the door first; optional settings and checked specifications have separate entries.
 * `focusField` opens "Model and drum size" and moves focus to that input once it is drawn.
 */
export function MachineFields({ draft, editing, onChange, ask = 'all', focusField, section, placeKnown = false, kindKnown = false, more, repair }: {
  draft: MachineDraft
  editing: boolean
  onChange: (draft: MachineDraft) => void
  ask?: 'all' | 'required'
  focusField?: MachineFocus
  section?: MachineSection
  /** New appliances inherit the household's place; saved appliances can still change it. */
  placeKnown?: boolean
  /** The sheet was opened for one kind ("Add your washer"), so washer or dryer is not asked. */
  kindKnown?: boolean
  more?: ReactNode
  repair?: { section: MachineSection; label: string; occurrence?: number; at: number }
}) {
  const fields = useRef<HTMLDivElement>(null)
  const handledRepair = useRef<number | undefined>(undefined)
  const [tab, setTab] = useState('details')
  useEffect(() => {
    if (repair === undefined || handledRepair.current === repair.at) return
    const target = repair.section === 'programs' || repair.section === 'cycle' ? 'programs' : repair.section === 'contact' ? 'sanitizer' : repair.section === 'specifications' ? 'more' : 'details'
    if (section === undefined && tab !== target) { setTab(target); return }
    const frame = requestAnimationFrame(() => {
      handledRepair.current = repair.at
      focusLabeledControl(fields.current, repair.label, repair.occurrence)
    })
    return () => cancelAnimationFrame(frame)
  }, [repair, section, tab])
  const set = (patch: Partial<MachineDraft>) => onChange({ ...draft, ...patch })
  const [otherKinds, setOtherKinds] = useState(draft.kind === 'hanging')
  const priceId = useId()
  const blockId = useId()
  const minutesId = useId()
  const nameId = useId()
  const modelId = useId()
  const volumeId = useId()
  const minutesHintId = useId()
  const rinseId = useId()
  const dryer = draft.kind === 'dryer'
  const hanging = draft.kind === 'hanging'
  const shared = draft.place === 'shared'
  const kindWords = (kind: Kind) => (kind === 'hanging' ? applianceCopy.hangingDryer : machineText.defaultNames[kind])
  // A hanging dryer has no drum: its Capacity row lands on the model instead.
  const focusId = focusField === 'capacity' && !hanging ? volumeId : focusField === 'model' || focusField === 'capacity' ? modelId : null
  useEffect(() => {
    if (focusId === null) return
    // After the panel has opened, so the input can take focus and be scrolled to.
    const frame = requestAnimationFrame(() => {
      const input = document.getElementById(focusId)
      input?.focus({ preventScroll: true })
      input?.scrollIntoView({ block: 'center' })
    })
    return () => cancelAnimationFrame(frame)
  }, [focusId])
  const required = (
    <section className="grid gap-4" aria-label="Appliance details">
      {!editing && placeKnown && draft.place !== null ? null : <Choices label={machineText.where} options={['home', 'shared'] as const} value={draft.place} onPick={(place) => set({ place })}
        words={(place) => <span className="grid justify-items-center gap-1 py-1"><DesignIcon name={place === 'home' ? 'home' : 'people'} size={22} strokeWidth={1.6} />{place === 'home' ? machineText.atHome : machineText.sharedRoom}</span>} />}
      {editing || kindKnown ? null : (
        <>
          {/* Most homes have a washer and a dryer; a heated hanging dryer is offered only when asked for. */}
          <IconChoiceGrid label={machineText.kind} options={(otherKinds ? ['washer', 'dryer', 'hanging'] as const : ['washer', 'dryer'] as const).map((kind) => ({ value: kind, label: kindWords(kind), art: <DesignIcon name={kind === 'hanging' ? 'hang' : kind} size={32} strokeWidth={1.6} /> }))} value={draft.kind} columns={otherKinds ? 3 : 2}
            onPick={(kind) => set({ kind, ...(draft.named ? {} : { name: defaultName(kind) }) })}
          />
          {hanging ? <p className={fieldHintClassName}>{applianceCopy.hangingDryerHint}</p> : null}
          {otherKinds ? null : <Button type="button" variant="ghost" size="sm" className="-mt-2 min-h-11 justify-self-start px-0 font-semibold text-[var(--sig-ink)]" onClick={() => setOtherKinds(true)}>{machineText.otherKind}</Button>}
        </>
      )}
    </section>
  )
  const door = draft.kind === 'washer' ? (
        <Choices label={machineText.door} options={['front', 'top'] as const} value={draft.door} onPick={(door) => set({ door, ...(door === draft.door ? {} : { rinseContact: {}, washProcesses: {} }) })}
          words={(door) => (door === 'front' ? machineText.front : machineText.top)} />
      ) : null
  const washPrograms = <>
      {draft.kind !== 'washer' ? null : <FieldSet>
        <FieldLegend>Checked wash programs and options</FieldLegend>
          <p className={fieldHintClassName}>Use this machine’s manual and controls. Include extraction between rinses in speed and time limits. Leave unknowns blank.</p>
          {(['normal', 'permanent_press', 'delicate'] as const).map((cycle) => {
            const process = draft.washProcesses?.[cycle]
            const update = (next: NonNullable<MachineDraft['washProcesses']>[string] | undefined, phaseChecked = false) => {
              const all = { ...draft.washProcesses }
              if (next === undefined) delete all[cycle]
              else all[cycle] = phaseChecked ? next : { ...next, washMinutes: undefined }
              set({ washProcesses: all })
            }
            return <FieldSet key={cycle}><FieldLegend>{cycle === 'normal' ? 'Normal care' : cycle === 'permanent_press' ? 'Mild care' : 'Very mild care'}</FieldLegend>
              <Field><FieldLabel htmlFor={`${rinseId}-${cycle}-program`}>Checked program and selected options</FieldLabel><Input id={`${rinseId}-${cycle}-program`} maxLength={160} value={process?.programLabel ?? ''} onChange={(event) => update({ source: '', ...process, programLabel: event.target.value })} /></Field>
              {process === undefined ? null : <>
                <Field><FieldLabel htmlFor={`${rinseId}-${cycle}-program-source`}>Where these settings were checked</FieldLabel><Input id={`${rinseId}-${cycle}-program-source`} maxLength={300} value={process.source} onChange={(event) => update({ ...process, source: event.target.value })} /></Field>
                <Field><FieldLabel htmlFor={`${rinseId}-${cycle}-severity`}>Checked mechanical severity</FieldLabel><NativeSelect id={`${rinseId}-${cycle}-severity`} value={process.mechanicalSeverity ?? ''} onChange={(event) => update({ ...process, mechanicalSeverity: event.target.value === '' ? undefined : event.target.value as MechanicalSeverity })}><option value="">Not recorded or unclear</option>{mechanicalSeverities.map((severity) => <option key={severity} value={severity}>{severity === 'very_mild' ? 'Very mild' : severity === 'mild' ? 'Mild' : 'Normal'}</option>)}</NativeSelect><p className={fieldHintClassName}>Check the manual and selected options. A care group or program name doesn’t establish severity or compatibility.</p></Field>
                <Field><FieldLabel htmlFor={`${rinseId}-${cycle}-wash-minutes`}>Documented washing-phase duration (minutes)</FieldLabel><Input id={`${rinseId}-${cycle}-wash-minutes`} type="number" min={0} max={300} step="any" value={process.washMinutes ?? ''} onChange={(event) => update({ ...process, washMinutes: event.target.value === '' ? undefined : Number(event.target.value) }, true)} /><p className={fieldHintClassName}>Use an exact documented duration above 0 and at most 300 minutes for these options. Leave variable, conflicting or unknown times blank. Exclude soak, rinse, spin and full-cycle timers. Program, source or option changes clear this value. Actual phase time isn’t measured.</p></Field>
                {([['maximumFillFraction', 'Maximum drum fill (fraction, for example 0.5)', 1], ['extraRinses', 'Additional rinses selected', 10], ['rinseTemperatureC', 'Highest rinse temperature (°C)', 95], ['spinRpm', 'Highest spin speed in any phase (rpm; 0 means none)', 3000], ['spinMinutes', 'Longest extraction time (minutes)', 120]] as const).map(([key, words, maximum]) => <Field key={key}><FieldLabel htmlFor={`${rinseId}-${cycle}-${key}`}>{words}</FieldLabel><Input id={`${rinseId}-${cycle}-${key}`} type="number" min={0} max={maximum} step="any" value={process[key] ?? ''} onChange={(event) => update({ ...process, [key]: event.target.value === '' ? undefined : Number(event.target.value) })} /></Field>)}
                <Button type="button" variant="outline" onClick={() => update(undefined)}>Remove checked program</Button>
              </>}
            </FieldSet>
          })}
      </FieldSet>}
  </>
  const rinseContact = <>
      {draft.kind !== 'washer' ? null : <FieldSet>
        <FieldLegend>Rinse contact time for sanitizer</FieldLegend>
          <p className={fieldHintClassName}>Check time from product release to draining for this program. Leave blank if unknown; the full-cycle timer doesn’t count.</p>
          {[...new Set(['normal', ...Object.keys(draft.rinseContact ?? {})])].map((cycle) => {
            const contact = draft.rinseContact?.[cycle]
            const update = (next: NonNullable<MachineDraft['rinseContact']>[string] | undefined) => {
              const all = { ...draft.rinseContact }
              if (next === undefined) delete all[cycle]
              else all[cycle] = next
              set({ rinseContact: all })
            }
            return <FieldSet key={cycle}>
              <FieldLegend>{cycle === 'normal' ? 'Normal wash' : cycle}</FieldLegend>
              <Choices label="Sanitizer release used for this contact time" options={rinsePlacements} value={rinsePlacements.find((placement) => placement === contact?.placement) ?? null} words={(placement) => uiText.placements[placement]} onPick={(placement) => update({ minutes: contact?.minutes ?? 0, source: contact?.source ?? '', ...contact, placement, timing: undefined })} />
              {contact?.placement !== 'direct_to_drum' ? null : <Field><FieldLabel htmlFor={`${rinseId}-${cycle}-timing`}>By-hand addition timing from the directions</FieldLabel><Input id={`${rinseId}-${cycle}-timing`} maxLength={300} value={contact.timing ?? ''} onChange={(event) => update({ ...contact, timing: event.target.value })} /></Field>}
              <Field><FieldLabel htmlFor={`${rinseId}-${cycle}-minutes`}>Rinse contact minutes</FieldLabel><Input id={`${rinseId}-${cycle}-minutes`} type="number" inputMode="decimal" min="1" max="300" step="any" value={contact?.minutes || ''} onChange={(event) => update(event.target.value === '' ? undefined : { source: '', placement: '', ...contact, minutes: Number(event.target.value) })} /></Field>
              <Field><FieldLabel htmlFor={`${rinseId}-${cycle}-source`}>Where the program contact time was checked</FieldLabel><Input id={`${rinseId}-${cycle}-source`} maxLength={300} value={contact?.source ?? ''} onChange={(event) => update({ minutes: 0, placement: '', ...contact, source: event.target.value })} /></Field>
              {contact === undefined ? null : <Button type="button" variant="outline" onClick={() => update(undefined)}>Clear rinse contact time</Button>}
            </FieldSet>
          })}
      </FieldSet>}
  </>
  const specifications = <>
      {draft.kind === null ? null : <FieldSet>
        <FieldLegend>{hanging ? applianceCopy.hangingDryer + ' model' : machineText.modelAndSize}</FieldLegend>
          <Field className={fieldClassName}>
            <FieldLabel htmlFor={modelId}>{machineText.modelNumber}</FieldLabel>
            <Input id={modelId} value={draft.model} maxLength={80} autoComplete="off" placeholder={machineText.modelPlaceholder} onChange={(event) => set({ model: event.target.value, minutes: '', programMode: 'unknown', rinseContact: {}, washProcesses: {} })} />
          </Field>
          {hanging ? null : <Field className={fieldClassName}>
            <FieldLabel htmlFor={volumeId}>{machineText.drumSize}</FieldLabel>
            <Input id={volumeId} value={draft.volume} inputMode="decimal" autoComplete="off" placeholder={machineText.drumExample} onChange={(event) => set({ volume: event.target.value })} />
          </Field>}
      </FieldSet>}
  </>
  const washerDetails = <>
      {draft.kind === 'washer' ? (
        <section className="grid gap-4" aria-label="Washer details">
          <div className="machine-he">
            <Choices label={machineText.heQuestion} options={['yes', 'no', 'not_sure'] as const} value={draft.he} onPick={(he) => set({ he })}
              hint={<><HeLogo size="large" /> {machineText.heHint}</>}
              words={(he) => (he === 'yes' ? machineText.yes : he === 'no' ? machineText.no : machineText.notSure)} />
          </div>
          <Choices label={machineText.slots} options={slots} value={draft.slots}
            hint={draft.door === 'top' ? machineText.underLidHint : machineText.drawerHint}
            onPick={(slot) => set({ slots: draft.slots.includes(slot) ? draft.slots.filter((entry) => entry !== slot) : [...draft.slots, slot] })}
            words={(slot) => slotWords[slot]} />
        </section>
      ) : null}
  </>
  const cost = <>
      {shared ? (
        <Field className={fieldClassName}>
          <FieldLabel htmlFor={priceId}>{machineText.pricePerStart}</FieldLabel>
          <Input id={priceId} className={machineNumberClassName} type="text" inputMode="decimal" autoComplete="off" placeholder={machineText.priceExample} value={draft.price}
            onChange={(event) => set({ price: event.target.value })} />
        </Field>
      ) : null}
      {dryer && shared ? (
        <Field className={fieldClassName}>
          <FieldLabel htmlFor={blockId}>{applianceCopy.blockMinutes}</FieldLabel>
          <Input id={blockId} className={machineNumberClassName} type="text" inputMode="numeric" autoComplete="off" value={draft.block}
            onChange={(event) => set({ block: event.target.value.replace(/\D/g, '').slice(0, 3) })} />
          <p className={fieldHintClassName}>{applianceCopy.blockMinutesHint}</p>
        </Field>
      ) : null}
  </>
  const cycleTime = <>
      {draft.kind === null || hanging ? null : (
        <Field className={fieldClassName}>
          <FieldLabel htmlFor={minutesId}>{dryer ? machineText.dryerMinutes : machineText.washerMinutes}</FieldLabel>
          <Input id={minutesId} className={machineNumberClassName} type="text" inputMode="numeric" autoComplete="off" aria-describedby={minutesHintId} value={draft.minutes}
            onChange={(event) => set({ minutes: event.target.value.replace(/\D/g, '').slice(0, 3) })} />
          <p className={fieldHintClassName} id={minutesHintId}>{machineText.minutesHint}</p>
        </Field>
      )}
      {!dryer ? null : <Field>
        <FieldLabel htmlFor={`${minutesId}-mode`}>Checked dryer program mode</FieldLabel>
        <NativeSelect id={`${minutesId}-mode`} value={draft.programMode ?? 'unknown'} onChange={(event) => set({ programMode: event.target.value as 'fixed' | 'sensor' | 'unknown' })}>
          <option value="unknown">Not recorded or unclear</option><option value="fixed">Fixed time, checked on this machine</option><option value="sensor">Sensor program, checked on this machine</option>
        </NativeSelect>
        <p className={fieldHintClassName}>Check this program’s manual or controls; sensor times vary. Enter program minutes above. At Start, enter the actual display time.</p>
      </Field>}
  </>
  const heat = dryer ? (
        <FieldSet className={machineHeatClassName}>
          <FieldLegend className={bulkRowLabelClassName}>{machineText.heatQuestion}</FieldLegend>
          <p className={bulkHintClassName}>{machineText.heatHint}</p>
          {dryerHeats.map((heat) => (
            <HeatRow key={heat} heat={heat} value={draft.heat[heat]} onChange={(words) => set({ heat: { ...draft.heat, [heat]: words } })} />
          ))}
          {dryerHeats.every((heat) => draft.heat[heat].trim() === '') ? <p className={bulkCarriedClassName}>{machineText.noHeatButton}</p> : null}
        </FieldSet>
      ) : null
  const identity = <>
      {draft.kind === null ? null : (
        <Field className={fieldClassName}>
          <FieldLabel htmlFor={nameId}>{applianceCopy.numberOrLabel}</FieldLabel>
          <Input id={nameId} value={draft.name} maxLength={116} autoComplete="off" placeholder={shared ? applianceCopy.numberOrLabelPlaceholder : dryer ? machineText.dryerNameExample : hanging ? applianceCopy.hangingDryer : machineText.washerNameExample}
            onChange={(event) => set({ name: event.target.value, named: true })} />
        </Field>
      )}
      {editing || draft.kind === null ? null : (
        <div className={bulkCountClassName}>
          <Stepper label={machineText.howMany} value={draft.count} min={1} max={maxLikeIt} onChange={(count) => set({ count })} />
          {draft.count > 1 && draft.name.trim() !== '' ? <p className={bulkHintClassName}>{machineText.addsNumbered(draft.name.trim(), draft.count)}</p> : null}
        </div>
      )}
      {cost}
  </>
  const optional = <>{washerDetails}{cycleTime}{heat}{identity}</>
  if (section !== undefined) {
    const sections: Record<MachineSection, ReactNode> = { type: required, controls: <>{door}{heat}</>, identity, washer: washerDetails, cycle: cycleTime, programs: washPrograms, contact: rinseContact, specifications }
    return <div ref={fields} className={machineFieldsClassName}>{sections[section]}</div>
  }
  if (editing) return <div ref={fields}><Tabs value={tab} onValueChange={(value) => { if (value !== null) setTab(value) }}>
    <TabsList aria-label="Appliance editor sections"><TabsTrigger value="details">Details</TabsTrigger>{hanging ? null : <TabsTrigger value="programs">Programs</TabsTrigger>}{draft.kind === 'washer' ? <TabsTrigger value="sanitizer">Sanitizer</TabsTrigger> : null}<TabsTrigger value="more">More</TabsTrigger></TabsList>
    <TabsContent value="details" keepMounted className={machineFieldsClassName}>{required}{door}{washerDetails}{identity}</TabsContent>
    <TabsContent value="programs" keepMounted className={machineFieldsClassName}>{cycleTime}{heat}{washPrograms}</TabsContent>
    {draft.kind === 'washer' ? <TabsContent value="sanitizer" keepMounted className={machineFieldsClassName}>{rinseContact}</TabsContent> : null}
    <TabsContent value="more" keepMounted className={cn(machineFieldsClassName, 'gap-6')}>{specifications}{more}</TabsContent>
  </Tabs></div>
  return (
    <div className={machineFieldsClassName}>
      {required}
      {door}
      {ask === 'all' ? optional : (
        <Collapsible className={machineDetailsClassName}>
          <CollapsibleTrigger className={machineDetailsTriggerClassName}>{draft.kind === 'washer' ? 'Washer details (optional)' : 'Dryer details (optional)'}<DesignIcon name="chevronDown" size="1em" strokeWidth={2.2} aria-hidden="true"  /></CollapsibleTrigger>
          <CollapsiblePanel className={machineDetailsPanelClassName}>{optional}</CollapsiblePanel>
        </Collapsible>
      )}
      {specifications}
      {washPrograms}
      {rinseContact}
    </div>
  )
}

function HeatRow({ heat, value, onChange }: { heat: DryerHeat; value: string; onChange: (words: string) => void }) {
  const id = useId()
  return (
    <div className={machineHeatRowClassName}>
      <FieldLabel htmlFor={id}>{dryerHeatLabels[heat]}</FieldLabel>
      <Input id={id} value={value} maxLength={24} autoComplete="off" placeholder={machineText.heatPlaceholder(heatExamples[heat])} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

/**
 * The machine sheet. With `group` it edits those machines together; otherwise it adds one entry of
 * `count` machines. `onSaved` runs after the save lands, so the caller can plan again (and toast).
 * `ask="required"` opens a new entry at where, what and the door, as the plan's "Add your washer" does.
 */
export function MachineSheet({ householdId, group = null, place = null, kind = null, ask = 'all', headerArt, currency = 'USD', initialFocus, onClose, onSaved }: {
  householdId: string
  group?: MachineGroup | null
  place?: Place | null
  kind?: Kind | null
  ask?: 'all' | 'required'
  headerArt?: ReactNode
  currency?: string
  initialFocus?: MachineFocus
  onClose: () => void
  onSaved?: (message: string) => void
}) {
  const [baseline, setBaseline] = useState<MachineDraft>(() => (group === null ? newMachineDraft({ place, kind }) : draftFromGroup(group)))
  const [draft, setDraft] = useState<MachineDraft>(baseline)
  // Closing a sheet with changes asks first, and discards them; nothing is written until Save.
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline)
  const [editing, setEditing] = useState(group === null || initialFocus !== undefined)
  const [focus, setFocus] = useState<MachineFocus | undefined>(initialFocus)
  const [repair, setRepair] = useState<{ section: MachineSection; label: string; occurrence?: number; at: number }>()
  const [step, setStep] = useState<MachineStep>(kind !== null && place !== null ? kind === 'hanging' ? 'identity' : 'controls' : 'type')
  const [correctingReview, setCorrectingReview] = useState(false)
  const [recovered, setRecovered] = useState(false)
  const correctReview = (target: MachineStep) => { setCorrectingReview(true); setStep(target) }
  const [createdIds, setCreatedIds] = useState<readonly Machine['machineId'][] | null>(null)
  const recovery = useIntakeRecovery({ name: 'machine-intake', title: 'this appliance', previousNames: previousMachineDraftNames, value: { draft, step, correctingReview }, valid: validMachineIntake, active: group === null && createdIds === null, dirty,
    restore: (saved) => { setDraft(saved.draft); setStep(saved.step); setCorrectingReview(saved.correctingReview ?? false); setRecovered(true) }, close: onClose })
  const closeIntake = () => { if (group === null && !recovery.attempted) recovery.clear(); onClose() }
  const [detail, setDetail] = useState<MachineFocus | undefined>()
  const [removing, setRemoving] = useState(false)
  const inventory = useQuery(api.inventory.list, createdIds === null ? 'skip' : { householdId: householdId as FunctionArgs<typeof api.inventory.list>['householdId'], textileIds: [] })
  const create = useConvexCall(api.inventory.createMachines)
  const update = useConvexCall(api.inventory.updateMachineGroup)
  const archive = useConvexCall(api.inventory.updateMachine)
  const problem = machineDraftProblem(draft)
  const stepProblem = group === null ? machineStepProblem(draft, step) : problem
  const fixProblem = () => {
    const target = machineProblemTarget(draft)
    if (target === null) return
    if (group === null) setStep(target.section === 'type' || target.section === 'controls' ? target.section : 'identity')
    else setFocus(undefined)
    setRepair((current) => ({ ...target, at: (current?.at ?? 0) + 1 }))
  }
  const pending = create.pending || update.pending || archive.pending
  // Editing starts from the facts as they are now, at the row's own input when it named one.
  const startEdit = (field?: MachineFocus) => {
    if (group === null) return
    const current = draftFromGroup(group)
    setBaseline(current)
    setDraft(current)
    setRepair(undefined)
    setFocus(field)
    setEditing(true)
  }
  const showFacts = () => {
    setRepair(undefined)
    setFocus(undefined)
    setEditing(false)
  }
  const cancelEdit = () => {
    if (group === null) return onClose()
    setDraft(draftFromGroup(group))
    update.clearError()
    archive.clearError()
    showFacts()
  }
  const changeArchived = async () => {
    if (group === null) return
    const archived = !group.machines.every((machine) => machine.archived)
    for (const machine of group.machines) {
      if (await archive.run({ machineId: machine.machineId, archived }) === undefined) return
    }
    onSaved?.(archived ? machineText.removedToast(group.name) : machineText.restoredToast(group.name))
    onClose()
  }
  const save = async () => {
    if (problem !== null) return
    const name = draft.name.trim()
    if (group === null) {
      const intakeKey = recovery.saveKey()
      if (intakeKey === null) return
      const created = await create.run({ householdId: householdId as FunctionArgs<typeof api.inventory.createMachines>['householdId'], name, count: draft.count, ...machineFieldsFrom(draft), intakeKey })
      if (created === undefined) return
      setCreatedIds(created)
      recovery.clear()
      onSaved?.(draft.count > 1 ? machineText.addedManyToast(draft.count, name) : machineText.addedToast(name))
    } else {
      const first = group.machines[0]!
      const result = await update.run({
        machineIds: group.machines.map((machine) => machine.machineId),
        ...(name === group.name ? {} : { name }),
        ...machineFieldsFrom(draft, first),
      })
      if (result === undefined) return
      onSaved?.(machineText.savedToast(name))
    }
    if (group !== null) showFacts()
  }
  const noun = draft.kind === 'hanging' ? 'hanging dryer' : machineText.nouns[draft.kind ?? 'machine']
  const steps = machineIntakeSteps(draft).filter((entry) => entry !== 'type' || kind === null || place === null || correctingReview || recovered)
  const index = steps.indexOf(step)
  const titles: Record<MachineStep, string> = { type: 'Add a machine', controls: draft.kind === 'dryer' ? 'What do the heat buttons say?' : 'Front or top loading?', identity: 'Name and number', review: 'Check your appliance' }
  const savedMachines = inventory?.machines.filter((machine) => createdIds?.includes(machine.machineId))
  if (recovery.prompt !== null) return recovery.prompt
  if (createdIds !== null) {
    if (detail !== undefined && savedMachines?.length === createdIds.length) return <MachineSheet key={createdIds.join(',')} householdId={householdId} group={{ key: createdIds.join(','), name: draft.name.trim(), machines: savedMachines }} initialFocus={detail} currency={currency} onClose={onClose} onSaved={onSaved} />
    return <Sheet title="Appliance added" onClose={onClose} closeAtTop footer={<Button onClick={onClose}>Done</Button>}>
      <SheetText>{draft.count > 1 ? `${draft.name.trim()} ×${draft.count}` : draft.name.trim()}</SheetText>
      <Collapsible><CollapsibleTrigger className={machineDetailsTriggerClassName}>Add details <DesignIcon name="chevronDown" size="1em" /></CollapsibleTrigger><CollapsiblePanel className={machineDetailsPanelClassName}>
        {machineDetailSections[draft.kind ?? 'washer'].map((entry) => <Button key={entry} variant="outline" disabled={savedMachines?.length !== createdIds.length} onClick={() => setDetail(entry)}>{machineDetailNames[entry]}</Button>)}
      </CollapsiblePanel></Collapsible>
    </Sheet>
  }
  if (removing && group !== null) return <Sheet title={group.machines.length > 1 ? `Remove ${group.machines.length} appliances?` : `Remove ${group.name}?`} onClose={onClose} onBack={() => { if (!pending) setRemoving(false) }} dirty={dirty} closeAtTop compactActions busy={pending} step="remove"
    footer={<><Button variant="outline" disabled={pending} onClick={() => setRemoving(false)}>Keep {group.machines.length > 1 ? 'appliances' : 'appliance'}</Button><Button variant="destructive" disabled={pending} onClick={() => void changeArchived()}>Remove {group.machines.length > 1 ? 'appliances' : 'appliance'}</Button></>}>
    <SheetText>{group.machines.length > 1 ? 'They won’t' : 'It won’t'} be used in future laundry plans. Past laundry history stays, and you can restore {group.machines.length > 1 ? 'them' : 'it'} from Removed.</SheetText>
    <ErrorNotice error={archive.error} />
  </Sheet>
  return (
    <Sheet
      key={editing ? 'edit' : 'record'}
      title={group === null ? titles[step] : editing && focus !== undefined ? machineDetailNames[focus] ?? group.name : group.machines.length > 1 ? `${group.name} ×${group.machines.length}` : group.name}
      subtitle={editing && group !== null && group.machines.length > 1 ? machineText.groupSubtitle : undefined}
      headerArt={editing ? undefined : headerArt}
      step={group === null ? step : editing ? `edit:${focus ?? 'all'}` : 'details'}
      progress={group === null ? { step: index + 1, total: steps.length } : undefined}
      onBack={group === null && (index > 0 || correctingReview) ? () => { if (!pending) { setStep(correctingReview ? 'review' : steps[index - 1]!); setCorrectingReview(false) } } : undefined}
      onEdit={group === null || editing ? undefined : () => startEdit()}
      editLabel="Edit settings"
      onClose={group !== null && editing ? cancelEdit : closeIntake}
      onKeepDraft={recovery.canKeep ? recovery.keep : undefined}
      closeLabel="Cancel"
      dirty={editing && dirty && !recovery.attempted}
      busy={pending}
      closeAtTop={group === null || !editing}
      tall
      compactActions={group !== null}
      footer={(
        <>
        {group === null ? <Button disabled={pending || stepProblem !== null} onClick={() => { if (step === 'review') void save(); else if (correctingReview && problem === null) { setStep('review'); setCorrectingReview(false) } else setStep(steps[index + 1]!) }}>{step === 'review' ? draft.count > 1 ? machineText.saveN(draft.count, noun) : machineText.saveOne(noun) : correctingReview && problem === null ? 'Back to review' : 'Next'}</Button> : editing ? <>
          <Button type="button" disabled={pending || problem !== null} onClick={() => void save()}>
            {machineText.saveOne(noun)}
          </Button>
        </> : <Button onClick={onClose}>Done</Button>}</>
      )}
    >
      {recovery.notice}
      {editing ? <fieldset disabled={pending} className="m-0 grid min-w-0 gap-4 border-0 p-0">
        {group === null && step === 'review' ? <FactsCard label="Appliance review" rows={[
          ['Name', draft.name.trim(), () => correctReview('identity')],
          ['Quantity', String(draft.count), () => correctReview('identity')],
          ['Location', draft.place === 'home' ? machineText.atHome : machineText.sharedRoom, () => correctReview('type')],
          ['Type', defaultName(draft.kind), () => correctReview('type')],
          ...(draft.kind === 'washer' ? [['Loading', draft.door === 'front' ? machineText.front : machineText.top, () => correctReview('controls')] as FactRow] : []),
          ...(draft.kind === 'dryer' ? [['Heat buttons', dryerHeats.map((heat) => draft.heat[heat]).filter(Boolean).join(' · ') || 'Not recorded', () => correctReview('controls')] as FactRow] : []),
        ]} /> : <MachineFields draft={draft} editing={group !== null} onChange={setDraft} ask={ask} repair={repair} section={group === null ? step as MachineSection : focus === 'capacity' || focus === 'model' ? 'specifications' : focus} focusField={focus} placeKnown={place !== null && !correctingReview && !recovered} kindKnown={kind !== null && !correctingReview && !recovered} more={group === null ? null : <>
          {group.machines.map((machine) => <div className="grid gap-2" key={machine.machineId}>{group.machines.length < 2 ? null : <p className="m-0">{machine.name}</p>}<CatalogReference holding={{ kind: 'machine', id: machine.machineId }} binding={machine.catalogBinding} name={machine.name} disabled={pending} /></div>)}
          <div className="border-t border-border pt-4"><ActionRow><Button variant="unstyled" size="unstyled" className={actionClassName} disabled={pending} onClick={() => { archive.clearError(); if (group.machines.every((machine) => machine.archived)) void changeArchived(); else setRemoving(true) }}>{group.machines.every((machine) => machine.archived) ? machineText.restore : `Remove ${group.machines.length > 1 ? 'appliances' : 'appliance'}`}</Button></ActionRow></div>
        </>} />}
        <ErrorNotice error={create.error ?? update.error} />
        <ErrorNotice error={archive.error} />
        {stepProblem === null ? null : <div className="grid w-full gap-1" role="status"><p className="m-0 text-[length:var(--step--1)] text-ink-2">{stepProblem}</p><Button variant="ghost" className="justify-self-start" disabled={pending} onClick={fixProblem}>Fix</Button></div>}
      </fieldset> : group === null ? null : <MachineOverview group={group} currency={currency} onEdit={startEdit} />}
    </Sheet>
  )
}

const placeWords = (location: Machine['location']) => location === 'shared' ? applianceCopy.shared : location === 'home' ? applianceCopy.atHome : undefined

/**
 * A saved appliance as facts: every row says what is recorded (or "Not recorded") and opens the
 * settings to change it; Capacity and Model open at their own input. Capacity is only what the
 * sticker gave, never a "how full" figure.
 */
function MachineOverview({ group, currency, onEdit: openEdit }: { group: MachineGroup; currency: string; onEdit: (field?: MachineFocus) => void }) {
  const first = group.machines[0]!
  const role = machineRole(first)
  const dryer = role === 'dryer'
  const common = (read: (machine: Machine) => string) => {
    const values = new Set(group.machines.map(read))
    return values.size === 1 ? [...values][0]! : 'Varies by appliance'
  }
  const price = (machine: Machine) => machine.pricePerStart === null ? 'Not recorded' : machine.blockMinutes === null || machine.blockMinutes === undefined
    ? applianceCopy.perStart(money(machine.pricePerStart, currency))
    : applianceCopy.perBlock(money(machine.pricePerStart, currency), machine.blockMinutes)
  const rows: FactRow[] = [
    ['Location', placeWords(first.location) ?? 'Not set', () => openEdit('type')],
    ...(role === 'washer' ? [
      ['Loading', common((machine) => machine.applianceType === 'front_load_washer' ? applianceCopy.loading.front : machine.applianceType === 'top_load_washer' ? applianceCopy.loading.top : 'Not recorded'), () => openEdit('controls')] as FactRow,
      ['High efficiency', common((machine) => machine.highEfficiency === null ? 'Not confirmed' : machine.highEfficiency ? 'Yes' : 'No'), () => openEdit('washer')] as FactRow,
      [applianceCopy.softenerCompartment, common((machine) => machine.placements.includes('softener_compartment') ? 'Yes' : 'None recorded'), () => openEdit('washer')] as FactRow,
    ] : []),
    ...(role === 'hanging' ? [] : [[dryer ? applianceCopy.timedDry : 'Normal cycle', common((machine) => {
      const time = machine.cycleMinutes[dryer ? 'timed' : 'normal']?.durationMinutes
      return time === undefined ? 'Not recorded' : `${time} min`
    }), () => openEdit('cycle')] as FactRow]),
    ['Price', first.location === 'home' ? applianceCopy.noPayment : common(price), () => openEdit('identity')],
    ...(dryer && first.location === 'shared' ? [[applianceCopy.blockMinutes, common((machine) => machine.blockMinutes === null || machine.blockMinutes === undefined ? 'Not recorded' : `${machine.blockMinutes} min`), () => openEdit('identity')] as FactRow] : []),
    ...(dryer ? [['Heat settings', common((machine) => machine.heatSettings.map((setting) => setting.label).join(' · ') || 'Not recorded'), () => openEdit('controls')] as FactRow] : []),
    ['Capacity', common((machine) => capacityWords(machine) ?? 'Not recorded'), () => openEdit('capacity')],
    ['Model', common((machine) => machine.model || 'Not recorded'), () => openEdit('model')],
  ]
  return <div className="grid gap-4">
    {group.machines.every((machine) => machine.archived) ? <SheetText>Removed</SheetText> : null}
    <FactsCard rows={rows} label="Appliance facts" />
  </div>
}
