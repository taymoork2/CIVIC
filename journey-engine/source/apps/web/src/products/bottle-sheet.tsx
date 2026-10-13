import { Field, FieldLabel, FieldSet, FieldLegend } from '@/components/ui/field'
import { Button, buttonVariants } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { productBleachKinds, stainKinds, stainChemistries } from '@washcloset/planner'
import { cn } from '@/lib/utils'
import { useIntakeRecovery } from '@/kit/device-state'
import { validBottleIntake } from '@/kit/intake-validation'
import { HelpTip } from '@/kit/help-tip'
import { useEffect, useId, useReducer, useRef, useState, type ReactNode } from 'react'
import { useQuery } from 'convex/react'
import type { FunctionArgs } from 'convex/server'

import { api } from '@/api'
import { CatalogReference } from '@/products/catalog-reference'
import { TrialNote } from '@/laundry/laundry-ui'
import { trialText } from '@/copy-trial'
import { ProductCapabilities } from '@/products/product-capabilities'
import { bottleUseHints, bottleUseWords, productText } from '@/copy'
import { productContentsCopy as contentsCopy } from '@/copy-household'
import type { Supply } from '@/household/inventory-types'
import { DesignIcon, type DesignIconName } from '@/kit/design-icons'
import { Disclosure } from '@/kit/disclosure'
import { IconChoiceGrid, type IconChoice } from '@/kit/icon-choice-grid'
import { Sheet } from '@/kit/sheet'
import { focusLabeledControl } from '@/kit/focus-field'
import { ConfirmRow, FactsCard, SheetText, segListClassName, segTabClassName, type FactRow } from '@/household/household-blocks'
import { Choices, ErrorNotice, choiceChipVariants, label as placementLabel, loadSizeLabels, soilLabels, useConvexCall } from '@/kit/ui'
import { doseParts, useUnits, type UnitSystem } from '@/kit/units'

/**
 * The product sheet: what it is (liquid, pods, powder, sheets), its name, what it is for, and the
 * marks on its cap or scoop exactly as printed. Where it goes and when come from what it is for;
 * the dose for a load is asked on laundry day. Evidence and formulation stay behind the screen.
 */

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

const bulkRowClassName = cn(
  "bulk-row",
  "grid gap-2",
)

const bottleMarksClassName = cn(
  "bottle-marks",
  "p-3 rounded-control bg-background",
  "[border:var(--rule-width)_solid_var(--line)]",
)

const bulkHintClassName = cn(
  "bulk-hint",
  "text-muted-foreground leading-[1.4]",
  "text-[length:var(--step--1)]",
  "[.machine-he_&]:flex [.machine-he_&]:items-center [.machine-he_&]:gap-2",
)

const bottleTypedClassName = cn(
  "bottle-typed",
  "grid grid-cols-[minmax(0,_1fr)_auto] gap-2 mt-2",
  "[&_input]:min-h-[3.5rem]",
  "[&_input]:text-[length:max(16px,_var(--step-0))]",
)

const visuallyHiddenClassName = cn(
  "visually-hidden",
  "absolute w-[1px] h-[1px] overflow-hidden whitespace-nowrap",
  "[clip-path:inset(50%)]",
)

const bottleLookupClassName = cn(
  "bottle-lookup",
  "grid gap-2 pb-4",
  "[border-block-end:var(--rule-width)_solid_var(--line)]",
  "[&_>_label]:font-semibold",
  "[&_>_div]:grid [&_>_div]:grid-cols-[minmax(0,_1fr)_auto] [&_>_div]:gap-2",
  "[&_input]:min-w-0 [&_input]:min-h-[3rem]",
  "[&_p]:m-0",
  "[.bottle-lookup-more_&]:py-[var(--space-3)_0] [.bottle-lookup-more_&]:border-0",
  "max-[24rem]:[&_>_div]:grid-cols-[1fr]",
)

const mutedClassName = cn(
  "muted",
  "text-ink-2",
)

const noticeClassName = cn(
  "notice",
  "[.sheet.has-compact-actions_.sheet-foot_>_&]:[flex:1_0_100%]",
  "grid gap-2 p-[var(--space-3)_var(--space-4)] rounded-label",
  "[border:var(--rule-width)_solid_var(--line)]",
  "[background:var(--label)]",
  "text-[length:var(--step-0)]",
)

const bottleLookupMoreClassName = cn(
  "bottle-lookup-more",
  "[border-block-start:var(--rule-width)_solid_var(--line)]",
  "pt-3",
)

const secondaryButtonClassName = cn(
  buttonVariants({ variant: 'outline', size: 'sm' }),
  "[&.danger]:text-destructive",
)

const bottleArchiveClassName = cn(
  "bottle-archive",
  "[justify-self:start]",
  "mt-6",
)

export type BottleForm = 'liquid' | 'pods' | 'powder' | 'beads' | 'sheets' | 'balls' | 'dispenser'
export type BottleUse = 'detergent' | 'booster' | 'scent_booster' | 'softener' | 'sanitizer' | 'rinse_sanitizer' | 'dryer_sheet' | 'dryer_ball'

export const bottleForms: readonly BottleForm[] = ['liquid', 'pods', 'powder', 'beads', 'sheets', 'balls', 'dispenser']
const formWords: Readonly<Record<BottleForm, string>> = productText.forms
export const formIcons: Readonly<Record<BottleForm, DesignIconName>> = { liquid: 'bottle', pods: 'pod', powder: 'powder', beads: 'beads', sheets: 'dryerSheet', balls: 'dryerBalls', dispenser: 'dispenser' }
const productFormChoices: readonly IconChoice<BottleForm>[] = bottleForms.map((form) => ({ value: form, label: formWords[form], art: <DesignIcon name={formIcons[form]} size={32} strokeWidth={1.5} /> }))

/** Product type as picture tiles. A new form keeps, picks or clears the use and drops marks it cannot have (withForm). */
export function ProductFormGrid({ draft, onChange }: { draft: BottleDraft; onChange: (draft: BottleDraft) => void }) {
  return <IconChoiceGrid label={productText.type} options={productFormChoices} value={draft.form} onPick={(form) => onChange(withForm(draft, form))} columns={3} />
}
const useWords: Readonly<Record<BottleUse, string>> = bottleUseWords
/** The marks most caps and scoops print; anything else is typed. */
export const markChips = ['1', '2', '3', '4', '5', 'Max'] as const
const maxMarks = 12
const taps = { source: 'label_taps', confidence: 'observed' as const }

export type BottleDraft = {
  readonly form: BottleForm | null
  readonly use: BottleUse | null
  readonly name: string
  /** The marks on the cap or scoop, as printed; only a liquid or a powder has them. */
  readonly marks: readonly string[]
  readonly safety?: NonNullable<FunctionArgs<typeof api.inventory.createSupply>['safety']>
  readonly pendingMark?: string
}

export function newBottleDraft(): BottleDraft {
  return { form: null, use: null, name: '', marks: [] }
}

/** Catalog words are suggestions, never evidence for a dose or a chemical warning. */
export function suggestedBottle(name: string, categories: readonly string[]): Pick<BottleDraft, 'form' | 'use'> {
  const words = `${name} ${categories.join(' ')}`.toLowerCase()
  const form: BottleForm | null = /\b(downy[\s-]+ball|dispens(?:er|ing)[\s-]+ball)\b/.test(words) ? 'dispenser'
    : /\b(dryer|wool)[\s-]+balls?\b/.test(words) ? 'balls'
    : /\b(unstopables|scent[\s-]+(?:beads?|boosters?)|in[\s-]+wash[\s-]+scent)\b/.test(words) ? 'beads'
    : /\b(pods?|pac[sk]?s?|capsules?)\b/.test(words) ? 'pods'
    : /\b(dryer sheets?|fabric sheets?)\b/.test(words) ? 'sheets'
    : /\b(powder|scoop)\b/.test(words) ? 'powder'
    : /\b(liquid|gel)\b/.test(words) ? 'liquid' : null
  const use: BottleUse | null = form === 'balls' ? 'dryer_ball'
    : form === 'sheets' ? 'dryer_sheet'
    : form === 'beads' ? 'scent_booster'
    : /\b(rinse sanitiz|laundry sanitiz)/.test(words) ? 'rinse_sanitizer'
    : /\b(booster|oxi|oxygen bleach)\b/.test(words) ? 'booster'
    : /\b(softener|fabric conditioner)\b/.test(words) ? 'softener'
    : /\bdetergent\b/.test(words) || form === 'pods' ? 'detergent' : null
  return { form, use: use !== null && usesFor(form).includes(use) ? use : null }
}

/** What a form may be used for. Pods are a detergent, scent beads only add scent and sheets go in the dryer; the rest can be anything washed in. */
export function usesFor(form: BottleForm | null): readonly BottleUse[] {
  if (form === 'dispenser') return []
  if (form === 'beads') return ['scent_booster']
  if (form === 'balls') return ['dryer_ball']
  if (form === 'pods') return ['detergent']
  if (form === 'sheets') return ['dryer_sheet']
  return ['detergent', 'booster', 'softener', 'sanitizer', 'rinse_sanitizer']
}

const hasMarks = (form: BottleForm | null) => form === 'liquid' || form === 'powder' || form === 'beads'
const sameMark = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase()

/** A new form keeps the use only when it still fits; a form with one use takes it. */
export function withForm(draft: BottleDraft, form: BottleForm): BottleDraft {
  const uses = usesFor(form)
  const use = uses.length === 1 ? uses[0]! : draft.use !== null && uses.includes(draft.use) ? draft.use : null
  return { ...draft, form, use, marks: hasMarks(form) ? draft.marks : [], pendingMark: hasMarks(form) ? draft.pendingMark : undefined }
}

/** Taps a mark on or off; a typed mark that is already there is not added twice. */
export function toggleMark(marks: readonly string[], mark: string): readonly string[] {
  const label = mark.trim()
  if (label === '') return marks
  if (marks.some((entry) => sameMark(entry, label))) return marks.filter((entry) => !sameMark(entry, label))
  return marks.length >= maxMarks ? marks : [...marks, label]
}

/**
 * The sheet's answers for a bottle already added. A product the sheet has no words for (stain
 * remover, dryer balls, or an older product without a use) leaves that answer to a tap.
 */
export function draftFromSupply(supply: Supply): BottleDraft {
  const suggested = suggestedBottle(supply.name, [])
  const formText = supply.formulation?.form?.toLowerCase() ?? ''
  const form: BottleForm | null = supply.kind === 'dispensing_device' ? 'dispenser'
    : supply.use === 'dryer_balls' || supply.kind === 'wool_dryer_ball' ? 'balls'
    : supply.use === 'pods' || supply.kind === 'single_use' ? 'pods'
    : supply.use === 'dryer_sheets' || supply.kind === 'dryer_sheet' ? 'sheets'
    : supply.use === 'scent_booster' || formText === 'beads' ? 'beads'
    : supply.measure?.kind === 'scoop' ? 'powder'
    : supply.measure?.kind === 'cap' ? 'liquid'
    : formText === 'powder' ? 'powder'
    : formText === 'liquid' || formText === 'gel' ? 'liquid'
    : suggested.form
  const use: BottleUse | null = supply.use === 'dryer_balls' || supply.kind === 'wool_dryer_ball' ? 'dryer_ball'
    : supply.use === 'pods' || supply.kind === 'single_use' ? 'detergent'
    : supply.use === 'dryer_sheets' || supply.kind === 'dryer_sheet' ? 'dryer_sheet'
    : supply.use === 'detergent' || supply.use === 'booster' || supply.use === 'scent_booster' || supply.use === 'softener' || supply.use === 'sanitizer' || supply.use === 'rinse_sanitizer' ? supply.use
    : suggested.use
  const marks = hasMarks(form) ? (supply.measure?.marks ?? []).map((mark) => mark.label) : []
  return { form, use: use !== null && usesFor(form).includes(use) ? use : null, name: supply.name, marks, ...(supply.safety === undefined ? {} : { safety: supply.safety }) }
}

/** What is still missing, in plain words, or null when the sheet can save. */
export function bottleDraftProblem(draft: BottleDraft): string | null {
  if (draft.form === null) return productText.problems.form
  if (draft.name.trim() === '') return productText.problems.name
  if (draft.form === 'dispenser') return null
  if (draft.use === null || !usesFor(draft.form).includes(draft.use)) return productText.problems.use
  if (draft.pendingMark?.trim()) return 'Add the mark or clear it before continuing.'
  const treatment = draft.safety?.pretreatment
  if (treatment !== undefined && (treatment.stainChemistry === undefined || !Number.isFinite(treatment.dose.amount) || treatment.dose.amount <= 0 || treatment.stainKinds.length === 0 || treatment.safeMaterials.length === 0 || !treatment.timing.trim())) return 'Copy the pretreatment chemistry, dose, stain types, materials and directions from the label.'
  const lipase = draft.safety?.lipase
  if (draft.safety?.capabilities?.some((fact) => !fact.variant.trim() || !fact.market.trim() || !fact.formulationRevision.trim() || !fact.source.trim() || !Number.isFinite(fact.retrievedAt) || fact.retrievedAt <= 0)) return 'Add the exact variant, market, disclosure revision, source and date for each recorded capability, or leave it unknown.'
  if (lipase !== undefined && lipase.status !== 'unknown' && (!lipase.formulation.trim() || !lipase.source.trim())) return 'Add this exact pack’s variant and the source of its lipase information.'
  const sanitizing = draft.safety?.sanitizing
  if (sanitizing !== undefined && (!Number.isFinite(sanitizing.minimumContactMinutes) || sanitizing.minimumContactMinutes <= 0 || sanitizing.minimumContactMinutes > 1440 || !sanitizing.formulation.trim() || !sanitizing.source.trim())) return 'Copy the exact pack, its rinse contact time and the label source, or leave that route unrecorded.'
  const soak = treatment?.soak
  if (soak !== undefined && (!Number.isFinite(soak.waterLitres) || soak.waterLitres <= 0 || soak.waterLitres > 50 || !Number.isInteger(soak.minimumMinutes) || !Number.isInteger(soak.maximumMinutes) || soak.minimumMinutes < 1 || soak.maximumMinutes < soak.minimumMinutes || soak.maximumMinutes > 1440 || soak.maximumTemperatureC <= 0 || soak.maximumTemperatureC > 100 || !soak.transfer.trim())) return 'Copy the label’s measured water volume, time range, temperature limit and directions after soaking.'
  return null
}

type CreateArgs = FunctionArgs<typeof api.inventory.createSupply>
type Fields = Pick<CreateArgs, 'kind' | 'use' | 'measure' | 'formulation' | 'safety'> & { provenance: typeof taps }

/**
 * Label facts come from the pack. When Contents changed, the source is the pack's label; otherwise
 * the record keeps the source it already had. Nothing here reads the product name.
 */
function withFactSource(safety: Safety, saved: Safety | undefined): Safety {
  if (!contentsChanged(saved, safety)) return safety
  const { factSource: _, ...rest } = safety
  const recorded = safety.bleachKind !== 'unknown' || safety.fragrance === 'free' || safety.fragrance === 'scented' || safety.dye === 'free' || safety.dye === 'dyed' || safety.ingredients !== undefined
  return recorded ? { ...rest, factSource: 'pack_label' } : rest
}

/**
 * The answers as the supply calls take them. The measure is the cap's or scoop's marks as printed,
 * or a count of pods or sheets; nothing is assumed about how much a mark holds. An edit keeps the
 * formulation's other words.
 */
export function bottleFieldsFrom(draft: BottleDraft, existing: Supply | null = null): Fields {
  const form = draft.form ?? 'liquid'
  const kept = existing?.formulation ?? {}
  const safety = withFactSource(draft.safety ?? { bleachKind: 'unknown' as const, incompatibleSupplyIds: [], incompatibleMaterials: [] }, existing?.safety)
  if (form === 'dispenser') return { kind: 'dispensing_device', provenance: taps }
  if (form === 'balls') {
    return { kind: 'wool_dryer_ball', use: 'dryer_balls', measure: { kind: 'count', countUnit: 'ball' }, provenance: taps }
  }
  if (form === 'sheets') {
    return { kind: 'dryer_sheet', use: 'dryer_sheets', ...(contentsOf(safety).fragrance === 'unknown' && contentsOf(safety).dye === 'unknown' && safety.ingredients === undefined ? {} : { safety }), measure: { kind: 'count', countUnit: 'sheet' }, provenance: taps }
  }
  if (form === 'pods') {
    return { kind: 'single_use', use: 'pods', safety, measure: { kind: 'count', countUnit: 'pod' }, formulation: { ...kept, name: kept.name ?? draft.name.trim(), form: 'pod' }, provenance: taps }
  }
  const use = draft.use === null || draft.use === 'dryer_sheet' || draft.use === 'dryer_ball' ? 'detergent' : draft.use
  return {
    kind: 'chemical',
    safety,
    use,
    ...(draft.marks.length === 0 ? {} : { measure: { kind: form === 'powder' ? 'scoop' as const : 'cap' as const, marks: draft.marks.map((label) => ({ label: label.trim() })) } }),
    formulation: { ...kept, name: kept.name ?? draft.name.trim(), form },
    provenance: taps,
  }
}

export type TabName = 'facts' | 'contents' | 'directions'
const hasContents = (form: BottleForm | null) => form === 'liquid' || form === 'powder' || form === 'beads' || form === 'pods' || form === 'sheets'
const hasDirections = (form: BottleForm | null) => form === 'liquid' || form === 'powder' || form === 'beads' || form === 'pods'
const tabsFor = (form: BottleForm | null): readonly TabName[] => ['facts', ...(hasContents(form) ? ['contents' as const] : []), ...(hasDirections(form) ? ['directions' as const] : [])]

type BottleStep = 'form' | 'purpose' | 'identity' | 'measurement' | 'review'
export function bottleIntakeSteps(draft: BottleDraft): readonly BottleStep[] {
  return ['form', ...(usesFor(draft.form).length > 1 ? ['purpose' as const] : []), 'identity', ...(hasMarks(draft.form) ? ['measurement' as const] : []), 'review']
}

export function bottleStepProblem(draft: BottleDraft, step: BottleStep): string | null {
  if (step === 'form') return draft.form === null ? productText.problems.form : null
  if (step === 'purpose') return draft.use === null || !usesFor(draft.form).includes(draft.use) ? productText.problems.use : null
  return bottleDraftProblem(draft)
}

export function bottleProblemTarget(draft: BottleDraft, step?: BottleStep): { tab: TabName; step: BottleStep; label: string; direction?: string } | null {
  if (step !== undefined && step !== 'review' && bottleStepProblem(draft, step) !== null) return { tab: step === 'measurement' ? 'directions' : 'facts', step, label: step === 'form' ? productText.type : step === 'purpose' ? productText.use : step === 'measurement' ? productText.anotherMark : productText.name }
  const problem = bottleDraftProblem(draft)
  if (problem === null) return null
  if (problem === productText.problems.form) return { tab: 'facts', step: 'form', label: productText.type }
  if (problem === productText.problems.name) return { tab: 'facts', step: 'identity', label: productText.name }
  if (problem === productText.problems.use) return { tab: 'facts', step: 'purpose', label: productText.use }
  if (draft.pendingMark?.trim()) return { tab: 'directions', step: 'measurement', label: productText.anotherMark }
  const treatment = draft.safety?.pretreatment
  if (treatment !== undefined && (treatment.stainChemistry === undefined || !Number.isFinite(treatment.dose.amount) || treatment.dose.amount <= 0 || treatment.stainKinds.length === 0 || treatment.safeMaterials.length === 0 || !treatment.timing.trim())) return { tab: 'directions', step: 'review', direction: 'pretreatment', label: treatment.stainChemistry === undefined ? 'Treatment type on the label' : !Number.isFinite(treatment.dose.amount) || treatment.dose.amount <= 0 ? `Pretreatment dose (${treatment.dose.unit === 'g' ? 'g' : 'mL'})` : !treatment.timing.trim() ? 'Pretreatment directions' : 'Materials the label permits' }
  if (draft.safety?.capabilities?.some((fact) => !fact.variant.trim() || !fact.market.trim() || !fact.formulationRevision.trim() || !fact.source.trim() || !Number.isFinite(fact.retrievedAt) || fact.retrievedAt <= 0)) return { tab: 'contents', step: 'review', label: 'Exact variant and pack code' }
  if (draft.safety?.lipase !== undefined && draft.safety.lipase.status !== 'unknown' && (!draft.safety.lipase.formulation.trim() || !draft.safety.lipase.source.trim())) return { tab: 'contents', step: 'review', label: !draft.safety.lipase.formulation.trim() ? 'Exact variant, market and pack code' : 'Read from (pack or manufacturer URL)' }
  const sanitizing = draft.safety?.sanitizing
  if (sanitizing !== undefined && (!Number.isFinite(sanitizing.minimumContactMinutes) || sanitizing.minimumContactMinutes <= 0 || sanitizing.minimumContactMinutes > 1440 || !sanitizing.formulation.trim() || !sanitizing.source.trim())) return { tab: 'directions', step: 'review', direction: 'sanitizing', label: !sanitizing.formulation.trim() ? 'Exact sanitizing variant, market and pack' : !sanitizing.source.trim() ? 'Rinse sanitizing label source' : 'Label’s minimum rinse contact time (minutes)' }
  return { tab: 'directions', step: 'review', direction: 'pretreatment', label: 'Label water volume (liters)' }
}

/** The sheet's fields, without saving, so it can be drawn in tests. Facts, Contents and Directions are tabs; all stay mounted. */
export function BottleFields({ draft, onChange, supplies = [], focus, step, more, repair }: { draft: BottleDraft; onChange: (draft: BottleDraft) => void; supplies?: readonly Supply[]; focus?: { readonly tab: TabName; readonly at: number }; step?: BottleStep; more?: ReactNode; repair?: { tab: TabName; label: string; direction?: string; at: number } }) {
  const handledRepair = useRef<number | undefined>(undefined)
  const fields = useRef<HTMLDivElement>(null)
  const set = (patch: Partial<BottleDraft>) => onChange({ ...draft, ...patch })
  const nameId = useId()
  const typedId = useId()
  const marksId = useId()
  const typed = draft.pendingMark ?? ''
  const [selected, setSelected] = useState<TabName | 'more'>(focus?.tab ?? 'facts')
  // An edit opens on the tapped section; a failed Save opens the tab holding the missing answer, so the message never points at a hidden field.
  useEffect(() => { if (focus !== undefined) setSelected(focus.tab) }, [focus])
  useEffect(() => {
    if (repair === undefined || handledRepair.current === repair.at) return
    if (step === undefined && selected !== repair.tab) { setSelected(repair.tab); return }
    const frame = requestAnimationFrame(() => {
      handledRepair.current = repair.at
      focusLabeledControl(fields.current, repair.label)
    })
    return () => cancelAnimationFrame(frame)
  }, [repair, selected, step])
  const tabs: readonly (TabName | 'more')[] = more === undefined ? tabsFor(draft.form) : [...tabsFor(draft.form), 'more']
  const tab = tabs.includes(selected) ? selected : 'facts'
  const tool = draft.form === 'powder' ? productText.tools.scoop : productText.tools.cap
  const typedMarks = draft.marks.filter((mark) => !markChips.some((chip) => sameMark(chip, mark)))
  const addTyped = () => {
    if (typed.trim() === '') return
    set({ marks: draft.marks.some((mark) => sameMark(mark, typed)) ? draft.marks : toggleMark(draft.marks, typed), pendingMark: undefined })
  }
  const identity = <Field className={fieldClassName}>
            <FieldLabel htmlFor={nameId}>{productText.name}</FieldLabel>
            <Input id={nameId} value={draft.name} maxLength={120} autoComplete="off" placeholder={productText.namePlaceholder}
              onChange={(event) => set({ name: event.target.value })} />
          </Field>
  const form = <><ProductFormGrid draft={draft} onChange={onChange} /><div className="flex items-center gap-1 text-ink-2">Product type<HelpTip topic="Product type">Type is its physical form, such as liquid, powder or pods. Used for is its job, such as detergent or softener. Copy the pack; its name alone does not establish bleach or other ingredients.</HelpTip></div></>
  const purpose = draft.form === null || usesFor(draft.form).length <= 1 ? null : (
            <Choices label={productText.use} options={usesFor(draft.form)} value={draft.use} onPick={(use) => set({ use })} words={(use) => useWords[use]}
              hint={draft.use === null ? undefined : bottleUseHints[draft.use]} />
          )
  const measurement = <>
          {hasMarks(draft.form) ? (
            <FieldSet className={cn(bulkRowClassName, bottleMarksClassName, 'gap-3')}><FieldLegend id={marksId}>{productText.marksSummary(tool, draft.marks)}</FieldLegend>
              <p className={bulkHintClassName}>{draft.form === 'beads' ? productText.beadMarksHint : productText.marksHint(tool)}</p>
              <div className="flex flex-wrap gap-2">
                {[...markChips, ...typedMarks].map((mark) => (
                  <Toggle key={mark} type="button" className={choiceChipVariants()} pressed={draft.marks.some((entry) => sameMark(entry, mark))}
                    onClick={() => set({ marks: toggleMark(draft.marks, mark) })}>{mark}</Toggle>
                ))}
              </div>
              <div className={bottleTypedClassName}>
                <FieldLabel className={visuallyHiddenClassName} htmlFor={typedId}>{productText.anotherMark}</FieldLabel>
                <Input id={typedId} value={typed} maxLength={40} autoComplete="off" placeholder={productText.anotherMarkPlaceholder}
                  onChange={(event) => set({ pendingMark: event.target.value || undefined })}
                  onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTyped() } }} />
                <Button type="button" variant="outline" disabled={typed.trim() === '' || draft.marks.length >= maxMarks} onClick={addTyped}>{productText.add}</Button>
              </div>
            </FieldSet>
          ) : null}
          {step === 'measurement' ? <Button variant="outline" aria-pressed={draft.marks.length === 0 && !typed} onClick={() => set({ marks: [], pendingMark: undefined })}>Not recorded yet</Button> : null}
          {typed.trim() ? <p className={bulkHintClassName} role="status">Add the mark or clear it before continuing.</p> : null}
          {hasMarks(draft.form) ? <p className={bulkHintClassName}>{productText.marksNext}</p> : null}
  </>
  if (step !== undefined) return <div ref={fields} className={machineFieldsClassName}>{step === 'form' ? form : step === 'purpose' ? purpose : step === 'identity' ? identity : step === 'measurement' ? measurement : null}</div>
  return (
    <div ref={fields} className={machineFieldsClassName}>
      <ProductTabs value={tab} onValueChange={setSelected} tabs={tabs}
        facts={<section className="grid gap-4" aria-label="Product details">{identity}{form}{purpose}</section>}
        contents={hasContents(draft.form) ? <ContentsFields form={draft.form} safety={draft.safety} onChange={(safety) => set({ safety })} /> : null}
        directions={hasDirections(draft.form) ? <>{measurement}<WarningsFields form={draft.form} use={draft.use} safety={draft.safety} supplies={supplies} repair={repair} onChange={(safety) => set({ safety })} /></> : null}
        more={more}
      />
    </div>
  )
}

/** Facts / Contents / Directions: one tab bar for viewing and editing a product. Panels stay mounted so a draft is never lost. */
function ProductTabs({ value, onValueChange, tabs, facts, contents, directions, more }: {
  value: TabName | 'more'
  onValueChange: (value: TabName | 'more') => void
  tabs: readonly (TabName | 'more')[]
  facts: ReactNode
  contents: ReactNode
  directions: ReactNode
  more?: ReactNode
}) {
  const panels = { facts, contents, directions, more }
  return <Tabs value={value} onValueChange={(next) => onValueChange(next as TabName | 'more')} className="gap-4">
    {tabs.length < 2 ? null : <TabsList aria-label={contentsCopy.tabsLabel} className={segListClassName}>{tabs.map((name) => <TabsTrigger key={name} value={name} className={segTabClassName}>{name === 'more' ? 'More' : contentsCopy.tabs[name]}</TabsTrigger>)}</TabsList>}
    <div>
      {tabs.map((name) => <TabsContent key={name} value={name} keepMounted className="gap-4">{panels[name]}</TabsContent>)}
    </div>
  </Tabs>
}

export const bleachKindWords = { none: 'No bleach', oxygen: 'Oxygen / non-chlorine bleach', chlorine: 'Chlorine bleach', unknown: 'Not sure' } as const
const chemistryWords = { protease: 'Protease (protein enzyme)', lipase: 'Lipase (fat enzyme)', oxygen_bleach: 'Oxygen bleach', surfactant: 'Surfactant', chlorine_bleach: 'Chlorine bleach', rust_remover: 'Rust remover' } as const
const stainWords = { protein: 'Blood, egg or dairy', tannin: 'Coffee, tea, wine or fruit', oil_grease: 'Oil or grease', starch_sauce: 'Starch or sauce', dye_ink_transfer: 'Dye, ink or color transfer', rust_mineral: 'Rust or mineral', combination: 'Mixed', unknown: 'Unknown' } as const
type Safety = NonNullable<CreateArgs['safety']>
const materialsFrom = (value: string) => [...new Set(value.split(',').map((entry) => entry.trim()).filter(Boolean))]
export const listFrom = (value: string) => [...new Map(value.split(/[,\n]/).map((entry) => entry.trim()).filter(Boolean).map((entry) => [entry.toLowerCase(), entry])).values()]
const blankSafety = (): Safety => ({ bleachKind: 'unknown', incompatibleSupplyIds: [], incompatibleMaterials: [] })

/** What the pack's label says, normalized: absent is not recorded. */
function contentsOf(safety: Safety | undefined) {
  return {
    bleach: safety?.bleachKind ?? 'unknown',
    fragrance: safety?.fragrance ?? 'unknown',
    dye: safety?.dye ?? 'unknown',
    ingredients: safety?.ingredients === undefined ? null : safety.ingredients.map((entry) => entry.trim().toLowerCase()).sort(),
    lipase: safety?.lipase ?? null,
  }
}

export function contentsChanged(before: Safety | undefined, after: Safety | undefined): boolean {
  return JSON.stringify(contentsOf(before)) !== JSON.stringify(contentsOf(after))
}

const bleachStrictness = { none: 0, oxygen: 1, chlorine: 2 } as const

/**
 * A Contents change that could let a load use this product: a permissive answer where there was a
 * different or unrecorded one. Only a move to something stricter (scented, dyed, a stronger bleach, more
 * ingredients) can never unblock, so only that is saved without "I've checked the pack".
 */
export function contentsChangeCouldUnblock(before: Safety | undefined, after: Safety | undefined, form: BottleForm | null = null): boolean {
  if (!hasContents(form) && form !== null) return false
  const was = contentsOf(before)
  const now = contentsOf(after)
  if (!contentsChanged(before, after)) return false
  const bleach = form !== 'sheets' && now.bleach !== was.bleach && now.bleach !== 'unknown' && !(was.bleach !== 'unknown' && bleachStrictness[now.bleach] > bleachStrictness[was.bleach])
  const fragrance = now.fragrance === 'free' && was.fragrance !== 'free'
  const dye = now.dye === 'free' && was.dye !== 'free'
  const ingredients = now.ingredients !== null && (was.ingredients === null || was.ingredients.some((entry) => !now.ingredients!.includes(entry)))
  return bleach || fragrance || dye || ingredients || now.lipase?.status === 'present' && JSON.stringify(now.lipase) !== JSON.stringify(was.lipase)
}

function ContentsFields({ form, safety: saved, onChange }: { form: BottleForm | null; safety?: Safety; onChange: (safety: Safety) => void }) {
  const safety = saved ?? blankSafety()
  const set = (patch: Partial<Safety>) => onChange({ ...safety, ...patch })
  const ingredientsId = useId()
  const [text, setText] = useState((safety.ingredients ?? []).join(', '))
  return <section className="grid gap-4" aria-label={contentsCopy.tabs.contents}>
    <SheetText>{contentsCopy.caption}</SheetText>
    {form === 'sheets' ? null : <Choices label={contentsCopy.bleach} options={productBleachKinds} value={safety.bleachKind} onPick={(bleachKind) => set({ bleachKind })} words={(kind) => contentsCopy.bleachChoices[kind]} />}
    <Choices label={contentsCopy.fragrance} options={['free', 'scented', 'unknown'] as const} value={safety.fragrance ?? 'unknown'} onPick={(fragrance) => set({ fragrance })} words={(value) => contentsCopy.fragranceChoices[value]} />
    <Choices label={contentsCopy.dye} options={['free', 'dyed', 'unknown'] as const} value={safety.dye ?? 'unknown'} onPick={(dye) => set({ dye })} words={(value) => contentsCopy.dyeChoices[value]} />
    <Field className={fieldClassName}>
      <FieldLabel htmlFor={ingredientsId}>{contentsCopy.ingredients}</FieldLabel>
      <Textarea id={ingredientsId} value={text} maxLength={1500} autoComplete="off" placeholder={contentsCopy.ingredientsPlaceholder}
        onChange={(event) => { setText(event.target.value); const list = listFrom(event.target.value); set({ ingredients: list.length === 0 ? undefined : list }) }} />
      <p className={bulkHintClassName}>{contentsCopy.ingredientsHint}</p>
    </Field>
    <FieldSet className="gap-3"><FieldLegend>Lipase on this pack</FieldLegend>
      <p className="text-sm text-ink-2">Check this pack’s named ingredients or the manufacturer’s record. “Enzymes” doesn’t confirm lipase; absence needs explicit confirmation.</p>
      <Field><FieldLabel htmlFor={`${ingredientsId}-lipase`}>Lipase</FieldLabel><NativeSelect id={`${ingredientsId}-lipase`} value={safety.lipase?.status ?? 'unknown'} onChange={(event) => set({ lipase: { formulation: '', source: '', ...safety.lipase, status: event.target.value as NonNullable<Safety['lipase']>['status'] } })}><NativeSelectOption value="unknown">Not established</NativeSelectOption><NativeSelectOption value="present">Explicitly listed</NativeSelectOption><NativeSelectOption value="absent">Confirmed absent</NativeSelectOption></NativeSelect></Field>
      <Field><FieldLabel htmlFor={`${ingredientsId}-formula`}>Exact variant, market and pack code</FieldLabel><Input id={`${ingredientsId}-formula`} maxLength={200} value={safety.lipase?.formulation ?? ''} onChange={(event) => set({ lipase: { status: 'unknown', source: '', ...safety.lipase, formulation: event.target.value } })} /></Field>
      <Field><FieldLabel htmlFor={`${ingredientsId}-source`}>Read from (pack or manufacturer URL)</FieldLabel><Input id={`${ingredientsId}-source`} maxLength={300} value={safety.lipase?.source ?? ''} onChange={(event) => set({ lipase: { status: 'unknown', formulation: '', ...safety.lipase, source: event.target.value } })} /></Field>
    </FieldSet>
    <FieldSet className="gap-3"><FieldLegend>Product capabilities and sources</FieldLegend><ProductCapabilities facts={safety.capabilities} onChange={(capabilities) => set({ capabilities })} /></FieldSet>
    <IngredientRoles />
  </section>
}

/** Label warnings and a measured pretreatment: what the label forbids or directs, copied as printed. */
function WarningsFields({ form, use, safety: saved, supplies, onChange, repair }: { form: BottleForm | null; use: BottleUse | null; safety?: Safety; supplies: readonly Supply[]; onChange: (safety: Safety) => void; repair?: { direction?: string; label: string; at: number } }) {
  const handledRepair = useRef<number | undefined>(undefined)
  const id = useId()
  const fields = useRef<HTMLFieldSetElement>(null)
  const [section, setSection] = useState('warnings')
  useEffect(() => {
    if (repair?.direction === undefined || handledRepair.current === repair.at) return
    if (section !== repair.direction) { setSection(repair.direction); return }
    const frame = requestAnimationFrame(() => {
      handledRepair.current = repair.at
      focusLabeledControl(fields.current, repair.label)
    })
    return () => cancelAnimationFrame(frame)
  }, [repair, section])
  const safety = saved ?? blankSafety()
  const canSanitize = use === 'rinse_sanitizer' || safety.sanitizing !== undefined
  const canPretreat = (form === 'liquid' || form === 'powder') && (use === 'detergent' || use === 'booster') || safety.pretreatment !== undefined
  const activeSection = section === 'sanitizing' && !canSanitize || section === 'pretreatment' && !canPretreat ? 'warnings' : section
  const set = (patch: Partial<Safety>) => onChange({ ...safety, ...patch })
  const treatment = safety.pretreatment
  const setTreatment = (patch: Partial<NonNullable<Safety['pretreatment']>>) => treatment === undefined ? undefined : set({ pretreatment: { ...treatment, ...patch } })
  return <FieldSet ref={fields} className="gap-3"><FieldLegend>Label directions</FieldLegend>
      <Tabs value={activeSection} onValueChange={(value) => { if (value !== null) setSection(String(value)) }}>
      {canSanitize || canPretreat ? <TabsList aria-label="Label direction sections"><TabsTrigger value="warnings">Warnings</TabsTrigger>{canSanitize ? <TabsTrigger value="sanitizing">Sanitizing</TabsTrigger> : null}{canPretreat ? <TabsTrigger value="pretreatment">Pretreatment</TabsTrigger> : null}</TabsList> : null}
      {canSanitize ? <TabsContent value="sanitizing" keepMounted>
      <label className="flex items-center gap-2 min-h-11"><Checkbox checked={safety.sanitizing !== undefined} onCheckedChange={(checked) => set({ sanitizing: checked ? { route: 'rinse', minimumContactMinutes: 0, formulation: '', source: '' } : undefined })} />Label gives a rinse sanitizing route</label>
      {safety.sanitizing === undefined ? null : <div className="grid gap-3">
        <p className="text-sm text-ink-2">Copy this pack’s rinse contact time. Presoak and full-cycle times don’t count.</p>
        <Field><FieldLabel htmlFor={`${id}-sanitizing-pack`}>Exact sanitizing variant, market and pack</FieldLabel><Input id={`${id}-sanitizing-pack`} maxLength={200} value={safety.sanitizing.formulation} onChange={(event) => set({ sanitizing: { ...safety.sanitizing!, formulation: event.target.value } })} /></Field>
        <Field><FieldLabel htmlFor={`${id}-sanitizing-time`}>Label’s minimum rinse contact time (minutes)</FieldLabel><Input id={`${id}-sanitizing-time`} type="number" inputMode="decimal" min="1" max="1440" step="any" value={safety.sanitizing.minimumContactMinutes || ''} onChange={(event) => set({ sanitizing: { ...safety.sanitizing!, minimumContactMinutes: Number(event.target.value) } })} /></Field>
        <Field><FieldLabel htmlFor={`${id}-sanitizing-source`}>Rinse sanitizing label source</FieldLabel><Input id={`${id}-sanitizing-source`} maxLength={300} value={safety.sanitizing.source} onChange={(event) => set({ sanitizing: { ...safety.sanitizing!, source: event.target.value } })} /></Field>
      </div>}
      </TabsContent> : null}
      <TabsContent value="warnings" keepMounted>
      <Field><FieldLabel htmlFor={`${id}-materials`}>Do not use on these materials</FieldLabel><Input id={`${id}-materials`} maxLength={300} defaultValue={safety.incompatibleMaterials.join(', ')} placeholder="e.g. wool, silk — separated by commas" onChange={(event) => set({ incompatibleMaterials: materialsFrom(event.target.value) })} /></Field>
      <fieldset className="grid gap-2"><legend>Do not combine with</legend>{supplies.length === 0 ? <p className="text-sm text-ink-2">Add other household products to record label warnings about them.</p> : supplies.map((supply) => <label key={supply.supplyId} className="flex items-center gap-2 min-h-11"><Checkbox checked={safety.incompatibleSupplyIds.includes(supply.supplyId)} onCheckedChange={(checked) => set({ incompatibleSupplyIds: checked === true ? [...safety.incompatibleSupplyIds, supply.supplyId] : safety.incompatibleSupplyIds.filter((entry) => entry !== supply.supplyId) })} />{supply.name}</label>)}</fieldset>
      </TabsContent>
      {canPretreat ? <TabsContent value="pretreatment" keepMounted>
      <label className="flex items-center gap-2 min-h-11"><Checkbox checked={treatment !== undefined} onCheckedChange={(checked) => { const { pretreatment: _, ...rest } = safety; onChange(checked === true ? { ...rest, pretreatment: { stainKinds: [], dose: { amount: 0, unit: 'ml' }, timing: '', safeMaterials: [] } } : rest) }} />Label gives a measured pretreatment</label>
      {treatment === undefined ? null : <div className="grid gap-3">
        <p className="text-sm text-ink-2">Use the label’s ingredients and directions. Unknown ingredients need review.</p>
        <Field><FieldLabel htmlFor={`${id}-chemistry`}>Treatment type on the label</FieldLabel><NativeSelect id={`${id}-chemistry`} value={treatment.stainChemistry ?? ''} onChange={(event) => setTreatment({ stainChemistry: event.target.value === '' ? undefined : event.target.value as typeof treatment.stainChemistry })}><NativeSelectOption value="">Choose from the label</NativeSelectOption>{stainChemistries.map((kind) => <NativeSelectOption key={kind} value={kind}>{chemistryWords[kind]}</NativeSelectOption>)}</NativeSelect></Field>
        <label className="flex min-h-11 items-center gap-2"><Checkbox checked={treatment.soak !== undefined} onCheckedChange={(checked) => setTreatment({ soak: checked ? { waterLitres: 0, minimumMinutes: 0, maximumMinutes: 0, maximumTemperatureC: 0, transfer: '' } : undefined })} />Label supports a container soak</label>
        {treatment.soak === undefined ? null : <div className="grid gap-3">
          <p className="text-sm text-ink-2">Dose for the measured water volume, not the washer drum. Copy both time limits and after-soak instructions.</p>
          {([['waterLitres', 'Label water volume (liters)'], ['minimumMinutes', 'Minimum soak time (minutes)'], ['maximumMinutes', 'Maximum soak time (minutes)'], ['maximumTemperatureC', 'Maximum water temperature (°C)']] as const).map(([key, label]) => <Field key={key}><FieldLabel htmlFor={`${id}-${key}`}>{label}</FieldLabel><Input id={`${id}-${key}`} type="number" inputMode="decimal" min="0" step="any" value={treatment.soak![key] || ''} onChange={(event) => setTreatment({ soak: { ...treatment.soak!, [key]: Number(event.target.value) } })} /></Field>)}
          <Field><FieldLabel htmlFor={`${id}-transfer`}>After soaking: removal, rinse and transfer instructions</FieldLabel><Textarea id={`${id}-transfer`} maxLength={300} value={treatment.soak.transfer} onChange={(event) => setTreatment({ soak: { ...treatment.soak!, transfer: event.target.value } })} /></Field>
        </div>}
        <fieldset className="grid gap-2"><legend>Stain types named on the label</legend>{stainKinds.filter((kind) => kind !== 'unknown' && kind !== 'combination').map((kind) => <label key={kind} className="flex items-center gap-2 min-h-11"><Checkbox checked={treatment.stainKinds.includes(kind)} onCheckedChange={(checked) => setTreatment({ stainKinds: checked === true ? [...treatment.stainKinds, kind] : treatment.stainKinds.filter((entry) => entry !== kind) })} />{stainWords[kind]}</label>)}</fieldset>
        <Field><FieldLabel htmlFor={`${id}-dose`}>Pretreatment dose ({treatment.dose.unit === 'g' ? 'g' : 'mL'})</FieldLabel><Input id={`${id}-dose`} type="number" min="0.01" step="any" value={treatment.dose.amount || ''} onChange={(event) => setTreatment({ dose: { amount: Number(event.target.value), unit: treatment.dose.unit } })} /></Field>
        <Field><FieldLabel htmlFor={`${id}-unit`}>Label dose unit</FieldLabel><NativeSelect id={`${id}-unit`} value={treatment.dose.unit} onChange={(event) => setTreatment({ dose: { ...treatment.dose, unit: event.target.value } })}><NativeSelectOption value="ml">mL</NativeSelectOption><NativeSelectOption value="g">g</NativeSelectOption></NativeSelect></Field>
        <Field><FieldLabel htmlFor={`${id}-directions`}>Pretreatment directions</FieldLabel><Input id={`${id}-directions`} maxLength={120} value={treatment.timing} onChange={(event) => setTreatment({ timing: event.target.value })} /></Field>
        <Field><FieldLabel htmlFor={`${id}-safe`}>Materials the label permits</FieldLabel><Input id={`${id}-safe`} maxLength={300} defaultValue={treatment.safeMaterials.join(', ')} placeholder="e.g. cotton — separated by commas" onChange={(event) => setTreatment({ safeMaterials: materialsFrom(event.target.value) })} /></Field>
        <Field><FieldLabel htmlFor={`${id}-temp`}>Maximum temperature on label (°C, optional)</FieldLabel><Input id={`${id}-temp`} type="number" min="0" max="100" value={treatment.maximumTemperatureC ?? ''} onChange={(event) => setTreatment({ maximumTemperatureC: event.target.value === '' ? undefined : Number(event.target.value) })} /></Field>
        <Field><FieldLabel htmlFor={`${id}-ph`}>Maximum pH on label (optional)</FieldLabel><Input id={`${id}-ph`} type="number" min="0" max="14" step="any" value={treatment.maximumPH ?? ''} onChange={(event) => setTreatment({ maximumPH: event.target.value === '' ? undefined : Number(event.target.value) })} /></Field>
      </div>}
      </TabsContent> : null}
      </Tabs>
  </FieldSet>
}

/**
 * The product record and its editor share one tab. An edit opens the editor on the tapped row's
 * section and keeps the record tab it came from; Cancel and a saved edit both return there. A
 * failed Save points the editor at the section holding the missing answer.
 */
export type ProductRecordView = { readonly editing: boolean; readonly tab: TabName; readonly focus?: { readonly tab: TabName; readonly at: number } }
export type ProductRecordEvent =
  | { readonly kind: 'view'; readonly tab: TabName }
  | { readonly kind: 'edit' | 'invalid'; readonly section: TabName; readonly at: number }
  | { readonly kind: 'cancel' | 'saved' }

export function productRecordView(view: ProductRecordView, event: ProductRecordEvent): ProductRecordView {
  switch (event.kind) {
    case 'view': return { ...view, tab: event.tab }
    case 'edit': return { editing: true, tab: view.tab, focus: { tab: event.section, at: event.at } }
    case 'invalid': return { ...view, focus: { tab: event.section, at: event.at } }
    case 'cancel':
    case 'saved': return { editing: false, tab: view.tab }
  }
}

/**
 * The bottle sheet. With `supply` it edits or removes that product; otherwise it adds
 * one. `onSaved` runs after the save lands, so the caller can plan again. A save returns to the
 * record; Contents changes that could unblock a load require "I've checked the pack".
 */
export function BottleSheet({ householdId, supply = null, supplies = [], title, headerArt, initialTab, onClose, onSaved }: {
  householdId: string
  supply?: Supply | null
  supplies?: readonly Supply[]
  title?: string
  headerArt?: ReactNode
  initialTab?: TabName
  onClose: () => void
  onSaved?: (message: string) => void
}) {
  // The dirty guard compares against the product as it was when this edit began, so it is taken again for every edit.
  const [baseline, setBaseline] = useState<BottleDraft>(() => (supply === null ? newBottleDraft() : draftFromSupply(supply)))
  const [draft, setDraft] = useState<BottleDraft>(baseline)
  const [checked, setChecked] = useState(false)
  const [view, dispatch] = useReducer(productRecordView, { editing: supply === null || initialTab !== undefined, tab: initialTab ?? 'facts', ...(initialTab === undefined ? {} : { focus: { tab: initialTab, at: 0 } }) })
  const editing = view.editing
  const [step, setStep] = useState<BottleStep>('form')
  const [correctingReview, setCorrectingReview] = useState(false)
  const [repair, setRepair] = useState<{ tab: TabName; label: string; direction?: string; at: number }>()
  const confirmation = useRef<HTMLDivElement>(null)
  const correctReview = (target: BottleStep) => { setCorrectingReview(true); setStep(target) }
  const [createdId, setCreatedId] = useState<Supply['supplyId'] | null>(null)
  const recovery = useIntakeRecovery({ name: 'product-intake', title: 'this product', value: { draft, step, correctingReview }, valid: validBottleIntake, active: supply === null && createdId === null, dirty: JSON.stringify(draft) !== JSON.stringify(baseline),
    restore: (saved) => { setDraft(saved.draft); setStep(saved.step); setCorrectingReview(saved.correctingReview ?? false) }, close: onClose })
  const closeIntake = () => { if (supply === null && !recovery.attempted) recovery.clear(); onClose() }
  const [detail, setDetail] = useState<TabName | undefined>()
  const [removing, setRemoving] = useState(false)
  const inventory = useQuery(api.inventory.list, createdId === null ? 'skip' : { householdId: householdId as CreateArgs['householdId'], textileIds: [] })
  const [barcode, setBarcode] = useState('')
  const [lookingUp, setLookingUp] = useState(false)
  const [lookupMessage, setLookupMessage] = useState<string | null>(null)
  const create = useConvexCall(api.inventory.createSupply)
  const update = useConvexCall(api.inventory.updateSupply)
  const problem = bottleDraftProblem(draft)
  const needsCheck = contentsChangeCouldUnblock(supply?.safety, draft.safety, draft.form)
  const checkProblem = needsCheck && !checked ? contentsCopy.checkedProblem : null
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(baseline)
  const pending = create.pending || update.pending || lookingUp
  const stepProblem = supply === null ? bottleStepProblem(draft, step) : problem
  const fixProblem = () => {
    if (problem === null && checkProblem !== null) {
      confirmation.current?.querySelector<HTMLElement>('[role="checkbox"]')?.focus()
      confirmation.current?.scrollIntoView({ block: 'center' })
      return
    }
    const target = bottleProblemTarget(draft, supply === null ? step : undefined)
    if (target === null) return
    if (supply === null) setStep(target.step)
    setRepair((current) => ({ ...target, at: (current?.at ?? 0) + 1 }))
  }
  const startEdit = (section: TabName) => {
    if (supply === null) return
    const saved = draftFromSupply(supply)
    setBaseline(saved)
    setDraft(saved)
    setRepair(undefined)
    setChecked(false)
    setBarcode('')
    setLookupMessage(null)
    update.clearError()
    dispatch({ kind: 'edit', section, at: Date.now() })
  }
  const cancelEdit = () => {
    if (supply === null) return onClose()
    dispatch({ kind: 'cancel' })
  }
  const lookup = async () => {
    setLookingUp(true)
    setLookupMessage(null)
    try {
      const response = await fetch(`/product-lookup?barcode=${encodeURIComponent(barcode.trim())}`)
      const result: unknown = await response.json()
      if (typeof result !== 'object' || result === null) throw new Error(productText.lookupFailed)
      if (!response.ok) throw new Error('error' in result && typeof result.error === 'string' ? result.error : productText.lookupFailed)
      if (!('name' in result) || typeof result.name !== 'string' || !('categories' in result) || !Array.isArray(result.categories)) throw new Error(productText.lookupFailed)
      const name = result.name
      const hint = suggestedBottle(name, result.categories.filter((value): value is string => typeof value === 'string'))
      setDraft((current) => ({ ...current, name, form: hint.form ?? current.form, use: hint.use ?? current.use }))
      setChecked(false)
      setLookupMessage(productText.lookupFound)
    } catch (caught) {
      setLookupMessage(caught instanceof Error ? caught.message : productText.lookupFailed)
    } finally {
      setLookingUp(false)
    }
  }
  const save = async () => {
    if (problem !== null || checkProblem !== null) {
      const tab: TabName = problem === productText.problems.cap || problem === productText.problems.scoop ? 'directions' : problem === null ? 'contents' : 'facts'
      dispatch({ kind: 'invalid', section: tab, at: Date.now() })
      return
    }
    const name = draft.name.trim()
    if (supply === null) {
      const intakeKey = recovery.saveKey()
      if (intakeKey === null) return
      const created = await create.run({ householdId: householdId as CreateArgs['householdId'], name, ...bottleFieldsFrom(draft), intakeKey })
      if (created === undefined) return
      setCreatedId(created)
      recovery.clear()
      onSaved?.(productText.addedToast(name))
    } else {
      const result = await update.run({ supplyId: supply.supplyId, name, ...bottleFieldsFrom(draft, supply) })
      if (result === undefined) return
      onSaved?.(productText.savedToast(name))
      dispatch({ kind: 'saved' })
      return
    }
  }
  const changeArchived = async () => {
    if (supply === null) return
    const result = await update.run({ supplyId: supply.supplyId, archived: !supply.archived })
    if (result === undefined) return
    onSaved?.(supply.archived ? productText.restoredToast(supply.name) : productText.archivedToast(supply.name))
    onClose()
  }
  const lookupFields = <div className={bottleLookupClassName}>
    <FieldLabel htmlFor="bottle-barcode">{productText.barcode}</FieldLabel>
    <div><Input id="bottle-barcode" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={14} value={barcode} placeholder={productText.barcodePlaceholder} onChange={(event) => setBarcode(event.target.value)} /><Button type="button" variant="outline" disabled={lookingUp || !/^\d{8,14}$/.test(barcode.trim())} onClick={() => void lookup()}>{lookingUp ? productText.lookingUp : productText.findProduct}</Button></div>
    <p className={mutedClassName}>{productText.namesFrom} <a href="https://world.openproductsfacts.org/" target="_blank" rel="noopener noreferrer">{productText.openProductsFacts}</a>{productText.checkOwnLabel}</p>
    {lookupMessage === null ? null : <p className={mutedClassName} role="status">{lookupMessage}</p>}
  </div>
  const steps = bottleIntakeSteps(draft)
  const index = steps.indexOf(step)
  const titles: Record<BottleStep, string> = { form: 'Add a product', purpose: 'What is it for?', identity: 'What is it called?', measurement: draft.form === 'powder' ? 'Marks on the scoop' : 'Marks on the cap', review: 'Check your product' }
  const savedSupply = inventory?.supplies.find((entry) => entry.supplyId === createdId)
  if (recovery.prompt !== null) return recovery.prompt
  if (createdId !== null) {
    if (detail !== undefined && savedSupply !== undefined) return <BottleSheet key={createdId} householdId={householdId} supply={savedSupply} supplies={inventory!.supplies} initialTab={detail} onClose={onClose} onSaved={onSaved} />
    return <Sheet title="Product added" onClose={onClose} closeAtTop footer={<Button onClick={onClose}>Done</Button>}>
      <SheetText>{draft.name.trim()}</SheetText>
      {hasDirections(draft.form) ? <SheetText>Dose not recorded. We’ll ask for the label directions when you use it.</SheetText> : null}
      {hasContents(draft.form) || hasDirections(draft.form) ? <Disclosure summary="Add details"><div className="grid gap-2">
        {hasContents(draft.form) ? <Button variant="outline" disabled={savedSupply === undefined} onClick={() => setDetail('contents')}>Contents and ingredients</Button> : null}
        {hasDirections(draft.form) ? <Button variant="outline" disabled={savedSupply === undefined} onClick={() => setDetail('directions')}>Marks, warnings and treatment directions</Button> : null}
      </div></Disclosure> : null}
    </Sheet>
  }
  if (removing && supply !== null) return <Sheet title={`Remove ${supply.name}?`} onClose={onClose} onBack={() => { if (!pending) setRemoving(false) }} dirty={dirty} closeAtTop compactActions busy={pending} step="remove"
    footer={<><Button variant="outline" disabled={pending} onClick={() => setRemoving(false)}>Keep product</Button><Button variant="destructive" disabled={pending} onClick={() => void changeArchived()}>{productText.remove}</Button></>}>
    <SheetText>It won’t be used in future laundry plans. Past laundry history stays, and you can restore it from Removed.</SheetText>
    <ErrorNotice error={update.error} />
  </Sheet>
  return (
    <Sheet
      key={editing ? 'edit' : 'record'}
      title={supply === null ? step === 'form' ? title ?? titles.form : titles[step] : title ?? supply.name}
      headerArt={editing ? undefined : headerArt}
      step={supply === null ? step : editing ? 'edit' : 'details'}
      progress={supply === null ? { step: index + 1, total: steps.length } : undefined}
      onBack={supply === null && (index > 0 || correctingReview) ? () => { if (!pending) { setStep(correctingReview ? 'review' : steps[index - 1]!); setCorrectingReview(false) } } : undefined}
      onEdit={supply === null || editing ? undefined : () => startEdit(view.tab === 'contents' && !tabsFor(draftFromSupply(supply).form).includes('contents') ? 'facts' : view.tab)}
      editLabel="Edit details"
      onClose={supply !== null && editing ? cancelEdit : closeIntake}
      onKeepDraft={recovery.canKeep ? recovery.keep : undefined}
      closeLabel="Cancel"
      dirty={dirty && !recovery.attempted}
      busy={pending}
      closeAtTop={supply === null || !editing}
      tall
      compactActions={supply !== null}
      footer={(
        <>
        {supply === null ? <Button disabled={pending || stepProblem !== null || checkProblem !== null} onClick={() => { if (step === 'review') void save(); else if (correctingReview && problem === null) { setStep('review'); setCorrectingReview(false) } else setStep(steps[index + 1]!) }}>{step === 'review' ? productText.save : correctingReview && problem === null ? 'Back to review' : 'Next'}</Button> : editing ? <>
          <Button type="button" disabled={pending || problem !== null || checkProblem !== null} onClick={() => void save()}>{productText.save}</Button>
        </> : <Button onClick={onClose}>Done</Button>}</>
      )}
    >
      {recovery.notice}
      {editing ? <fieldset disabled={pending} className="m-0 grid min-w-0 gap-4 border-0 p-0">
      {supply === null && step === 'identity' ? <Disclosure className={bottleLookupMoreClassName} summary={productText.findByBarcode}>{lookupFields}</Disclosure> : null}
      {supply !== null && supply.use === null && draft.use !== null && usesFor(draft.form).length > 1 ? <p className={noticeClassName}>{productText.suggestedUseHint}</p> : null}
      <BottleFields draft={draft} repair={repair} onChange={(next) => { setDraft(next); setChecked(false) }} step={supply === null ? step : undefined} focus={view.focus} supplies={supplies.filter((other) => other.supplyId !== supply?.supplyId && !other.archived)} more={supply === null ? undefined : <>
        <FieldSet className="gap-3"><FieldLegend>{productText.findByBarcode}</FieldLegend>{lookupFields}</FieldSet>
        <CatalogReference holding={{ kind: 'product', id: supply.supplyId }} binding={supply.catalogBinding} name={supply.name} disabled={pending} />
        <Button variant="unstyled" size="unstyled" type="button" className={cn(secondaryButtonClassName, bottleArchiveClassName)} disabled={pending} onClick={() => { update.clearError(); if (supply.archived) void changeArchived(); else setRemoving(true) }}>{supply.archived ? productText.restore : productText.remove}</Button>
      </>} />
      {supply === null && step === 'review' ? <FactsCard label="Product review" rows={[
        ['Name', draft.name.trim(), () => correctReview('identity')],
        ['Type', draft.form === null ? 'Not recorded' : formWords[draft.form], () => correctReview('form')],
        ...(draft.use === null ? [] : [['Used for', useWords[draft.use], usesFor(draft.form).length > 1 ? () => correctReview('purpose') : undefined] as FactRow]),
        ...(hasMarks(draft.form) ? [[draft.form === 'powder' ? 'Scoop marks' : 'Cap marks', draft.marks.join(' · ') || 'Not recorded', () => correctReview('measurement')] as FactRow] : []),
      ]} /> : null}
      {needsCheck ? <div ref={confirmation} className="grid gap-2"><ConfirmRow checked={checked} onCheckedChange={setChecked}>{contentsCopy.checked}</ConfirmRow><SheetText>{contentsCopy.checkedHint}</SheetText></div> : null}
      <ErrorNotice error={create.error ?? update.error} />
      {(stepProblem ?? checkProblem) === null ? null : <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-field bg-surface-2 px-3 py-2" role="status"><p className="m-0 min-w-0 flex-1 text-[length:var(--step--1)] text-ink-2">{stepProblem ?? checkProblem}</p>{supply !== null || step === 'review' ? <Button variant="ghost" disabled={pending} onClick={fixProblem}>Review details<DesignIcon name="chevronRight" size="1em" aria-hidden="true" /></Button> : null}</div>}
      </fieldset> : supply === null ? null : <ProductOverview supply={supply} tab={view.tab} onTab={(tab) => dispatch({ kind: 'view', tab })} onEdit={startEdit} />}
    </Sheet>
  )
}

/** A product marked "Ran out" at the machine stays out of plans until restocked; nothing was swapped in for it. */
function RanOutBanner({ supplyId }: { supplyId: Supply['supplyId'] }) {
  const restock = useConvexCall(api.inventory.setRanOut)
  return <div className="grid gap-2 rounded-control bg-hamper-bg p-3 text-hamper-ink" role="status">
    <p className="m-0 font-semibold">Ran out</p>
    <p className="m-0 text-[length:var(--step--1)]">Excluded until restocked. No replacement is selected.</p>
    <Button type="button" variant="alert" size="unstyled" className="justify-self-start" disabled={restock.pending} onClick={() => void restock.run({ supplyId, ranOut: false })}>Mark restocked</Button>
  </div>
}

type Rule = Supply['rules'][number]

/** Each record row opens the editor on the section that holds its answer; cap marks are edited beside the directions. */
export function productRecordRows(supply: Supply, onEdit: (section: TabName) => void): Readonly<Record<TabName, readonly FactRow[]>> {
  const { form, use } = draftFromSupply(supply)
  const accessory = supply.kind === 'wool_dryer_ball' || supply.kind === 'dispensing_device'
  const marks = supply.measure?.marks?.map((mark) => mark.label).join(' · ')
  const safety = supply.safety
  const edit = (section: TabName) => () => onEdit(section)
  return {
    facts: [
      ['Type', form === null ? 'Not recorded' : formWords[form], edit('facts')],
      ['Used for', supply.use === null || use === null ? 'Not confirmed' : useWords[use], edit('facts')],
      ...(marks ? [[supply.measure?.kind === 'scoop' ? 'Scoop marks' : 'Cap marks', marks, edit('directions')] as FactRow] : []),
    ],
    contents: [
      ...(form === 'sheets' ? [] : [[contentsCopy.bleach, contentsCopy.bleachChoices[safety?.bleachKind ?? 'unknown'], edit('contents')] as FactRow]),
      [contentsCopy.fragrance, contentsCopy.fragranceChoices[safety?.fragrance ?? 'unknown'], edit('contents')],
      [contentsCopy.dye, contentsCopy.dyeChoices[safety?.dye ?? 'unknown'], edit('contents')],
      [contentsCopy.ingredients, safety?.ingredients === undefined ? contentsCopy.notRecorded : safety.ingredients.join(', '), edit('contents')],
      ...(safety?.factSource === undefined ? [] : [[contentsCopy.source, contentsCopy.sourceWords[safety.factSource] ?? safety.factSource] as FactRow]),
      ['Lipase', safety?.lipase?.status === 'present' ? `Explicitly listed · ${safety.lipase.formulation} · ${safety.lipase.source}` : safety?.lipase?.status === 'absent' ? `Confirmed absent · ${safety.lipase.formulation} · ${safety.lipase.source}` : 'Not established', edit('contents')],
    ],
    // Saved directions are listed as their own read-only rows; this row stands in only when there are none.
    directions: [
      ...(accessory || supply.rules.length === 0 ? [[contentsCopy.directionsLabel, accessory ? 'Reusable accessory' : contentsCopy.directionsNone, edit('directions')] as FactRow] : []),
      ...(safety === undefined || safety.incompatibleMaterials.length === 0 ? [] : [['Do not use on', safety.incompatibleMaterials.join(', '), edit('directions')] as FactRow]),
    ],
  }
}

/** "Small or medium", "Normal": a rule's condition values in the words of the planner's buttons. */
const conditionWords = (values: readonly string[] | undefined, words: Readonly<Record<string, string>>): string | null =>
  values === undefined || values.length === 0 ? null : values.map((value, index) => { const word = words[value] ?? value; return index === 0 ? word : word.toLowerCase() }).join(' or ')

/** Where a saved rule came from, as a word; an unknown source reads "Recorded", never its stored id. */
const directionSource = (source: string): string =>
  contentsCopy.directionSources[source] ?? (source.startsWith('catalog-directions:') ? contentsCopy.directionSources.catalog! : contentsCopy.directionSourceFallback)

/**
 * One saved direction as the record reads it back: the label row it was copied from (or its load
 * size and soil), the dose as recorded, where and when it goes, and its source. A cap mark is never
 * turned into a volume unless the rule saved one.
 */
export function directionSummary(rule: Rule, system: UnitSystem): { readonly heading: string; readonly dose: string; readonly placement: string; readonly source: string } {
  const rowText = rule.rowText?.trim() ?? ''
  return {
    heading: rowText !== '' ? rowText : contentsCopy.directionLoad(conditionWords(rule.conditions?.loadSizes, loadSizeLabels), conditionWords(rule.conditions?.soilLevels, soilLabels)),
    dose: doseParts(rule.dose, system).spoken,
    placement: contentsCopy.directionPlacement(placementLabel(rule.placement), rule.timing.trim()),
    source: directionSource(rule.provenance.source),
  }
}

/** The saved directions, read-only. A catalog-bound product is corrected through its source directions, below. */
function SavedDirections({ rules, catalogBound }: { rules: readonly Rule[]; catalogBound: boolean }) {
  const { system } = useUnits()
  const headingId = useId()
  return <section className="grid gap-2" aria-labelledby={headingId}>
    <h3 id={headingId} className="m-0 px-1 text-[length:var(--step-0)] font-semibold">{contentsCopy.savedDirections}</h3>
    <ul className="m-0 grid list-none rounded-control bg-background p-0 px-3.5">
      {rules.map((rule) => {
        const line = directionSummary(rule, system)
        return <li key={rule.ruleId} className="grid gap-0.5 py-2.5 text-[length:var(--step-0)] leading-normal [&+&]:[border-block-start:1px_solid_var(--line)]">
          <span className="text-muted-foreground [overflow-wrap:anywhere]">{line.heading}</span>
          <span className="font-semibold">{line.dose}</span>
          <span>{line.placement}</span>
          <span className="text-[length:var(--step--1)] text-muted-foreground">{line.source}</span>
        </li>
      })}
    </ul>
    {catalogBound ? <SheetText>{contentsCopy.directionsCatalogHint}</SheetText> : null}
    {catalogBound ? null : <TrialNote>{trialText.handEntered}</TrialNote>}
  </section>
}

/**
 * A saved product as the prototype shows it: tabs (Facts / Contents / Directions) of fact rows, each
 * opening the edit. Contents are what the pack's label says, with where they were read from; the
 * name is never the source. Not recorded stays "Not recorded".
 */
export function ProductOverview({ supply, tab, onTab, onEdit }: { supply: Supply; tab: TabName; onTab: (tab: TabName) => void; onEdit: (section: TabName) => void }) {
  const { form } = draftFromSupply(supply)
  const accessory = supply.kind === 'wool_dryer_ball' || supply.kind === 'dispensing_device'
  const tabs: readonly TabName[] = [...tabsFor(form).filter((name) => name !== 'directions'), 'directions']
  const shown = tabs.includes(tab) ? tab : 'facts'
  const safety = supply.safety
  const rows = productRecordRows(supply, onEdit)
  return <div className="grid gap-4">
    {supply.archived ? <SheetText>Removed</SheetText> : null}
    {supply.ranOutAt === null || supply.ranOutAt === undefined ? null : <RanOutBanner supplyId={supply.supplyId} />}
    <ProductTabs
      value={shown}
      onValueChange={(next) => { if (next !== 'more') onTab(next) }}
      tabs={tabs}
      facts={<FactsCard rows={rows.facts} label={contentsCopy.tabs.facts} />}
      contents={<><FactsCard rows={rows.contents} label={contentsCopy.tabs.contents} /><IngredientRoles /></>}
      directions={<>
        {rows.directions.length === 0 ? null : <FactsCard rows={rows.directions} label={contentsCopy.tabs.directions} />}
        {supply.rules.length === 0 ? null : <SavedDirections rules={supply.rules} catalogBound={supply.catalogBinding !== undefined} />}
        {safety?.pretreatment === undefined ? null : <div className="grid gap-2"><strong>Recorded pretreatment directions</strong><p>{safety.pretreatment.timing}</p>{safety.pretreatment.soak === undefined ? null : <p>{safety.pretreatment.dose.amount} {safety.pretreatment.dose.unit} per {safety.pretreatment.soak.waterLitres} L · {safety.pretreatment.soak.minimumMinutes}–{safety.pretreatment.soak.maximumMinutes} min · up to {safety.pretreatment.soak.maximumTemperatureC}°C. {safety.pretreatment.soak.transfer}</p>}</div>}
        {!accessory && supply.rules.length === 0 ? <div className="flex items-start gap-3 rounded-control bg-warn-bg p-3 text-warn-ink"><DesignIcon name="alert" size="1em" className="size-5 shrink-0" aria-hidden="true"  /><p className="text-[length:var(--step-0)]">Dose not recorded. Check the product label.</p></div> : null}
      </>}
    />
  </div>
}

/** Ingredient explanations stay visible within Contents. */
function IngredientRoles() {
  return <FieldSet className="gap-3"><FieldLegend>What these ingredients do</FieldLegend><dl className="grid gap-2 text-sm">
    <div><dt className="font-semibold">Surfactants</dt><dd>Help lift oily soil into wash water.</dd></div>
    <div><dt className="font-semibold">Protease and lipase</dt><dd>Protease targets protein soil; lipase targets fats. Check their presence and usable directions for this exact product.</dd></div>
    <div><dt className="font-semibold">Oxygen and chlorine bleach</dt><dd>Different oxidizing treatments with different restrictions. Follow the product directions and the garment’s bleach symbol.</dd></div>
    <div><dt className="font-semibold">Fragrance and dyes</dt><dd>Recorded separately for clothing profiles that avoid them.</dd></div>
  </dl><p className="text-sm text-ink-2">Ingredient roles don’t establish doses or compatibility. Follow the recorded warnings and directions when combining products.</p></FieldSet>
}
