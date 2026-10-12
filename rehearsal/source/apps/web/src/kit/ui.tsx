import { Field as ShadcnField, FieldLabel } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { cva } from 'class-variance-authority'
import { useMutation } from 'convex/react'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { ConvexError } from 'convex/values'
import type { OptimisticUpdate } from 'convex/browser'
import { useId, useState, type ReactNode } from 'react'

import type { DryMethod, DryerHeat, EvidenceLevel, LoadSize, WasherClass } from '@washcloset/planner'

import { GarmentIcon } from '@/kit/garment-icon'
import { appText, drumPictures, monthWord, shortMonthWord, soilButtonWords, uiText } from '@/copy'
import { countedUnit, displayDose, doseParts, useUnits, type DoseLike } from '@/kit/units'
import { DesignIcon } from '@/kit/design-icons'

const stampCautionClassName = cn(
  "stamp-caution",
  "[.stamp&]:[border-color:var(--caution)]",
  "[.stamp&]:[color:var(--caution-ink)]",
)

const stampClassName = cn(
  "stamp",
  "inline-flex items-center gap-1 p-[1px_6px] rounded-mark font-semibold leading-[1.3] whitespace-nowrap",
  "[border:2px_solid_var(--now-bg)]",
  "[color:var(--accent)]",
  "text-[length:var(--step--1)]",
  "[&.tilt]:[transform:rotate(-6deg)]",
  "motion-safe:[&.fresh]:[animation:stamp-in_220ms_var(--ease-out)]",
)

const stampMutedClassName = cn(
  "stamp-muted",
  "[.stamp&]:border-ink-2 [.stamp&]:text-ink-2",
)

const isDoneClassName = cn(
  "is-done",
)

const cupClassName = cn(
  "cup",
  "[.machine-step-cap_&]:w-[4rem]",
  "[.step.is-recorded_&]:opacity-[0.55]",
  "[.cup-pick_&]:w-auto [.cup-pick_&]:h-full [.cup-pick_&]:min-h-[9rem] [.cup-pick_&]:max-h-[16rem]",
  "[.cup-pick_&]:[aspect-ratio:40_/_46]",
  "w-[2rem] h-auto flex-none text-ink [&.is-done]:text-ink-2",
)

const cupFillClassName = cn(
  "cup-fill",
  "[fill:var(--accent-container)] opacity-75",
  "[.cup.is-now_&]:[fill:var(--washing-bg)]",
  "[.cup.is-done_&]:[fill:var(--surface-2)]",
)

const cupBodyClassName = cn(
  "cup-body",
  "fill-none stroke-current",
)

const cupTickClassName = cn(
  "cup-tick",
  "fill-none stroke-current [stroke-width:1.6] opacity-60",
  "[&.is-planned]:[stroke-width:1.8] [&.is-planned]:opacity-100",
)

const cupPickClassName = cn(
  "cup-pick",
  "grid grid-cols-[auto_1fr] items-stretch gap-4",
)

const cupPickMarksClassName = cn(
  "cup-pick-marks",
  "grid content-center gap-2",
)

const cupPickMarkClassName = cn(
  "cup-pick-mark",
  "[&[aria-pressed='true']]:[background:var(--accent-container)]",
  "[&[aria-pressed='true']]:[color:var(--on-accent-container)]",
  "[&[aria-pressed='true']]:shadow-[inset_0_0_0_1px_var(--accent)]",
  "min-h-[2.75rem] p-[0_var(--space-4)] border-0 rounded-control bg-surface shadow-[inset_0_0_0_1px_var(--line)] text-ink font-figure font-extrabold text-start cursor-[pointer]",
  "text-[length:var(--step-2)]",
)

const glyphItemClassName = cn(
  "glyph-item",
  "[.count-glyph_&]:[fill:color-mix(in_srgb,_var(--now-bg)_55%,_var(--label))]",
  "[.count-glyph_&]:stroke-ink",
  "[.count-glyph_&]:[stroke-width:1.5]",
  "[.count-glyph.is-now_&]:[fill:var(--now-bg)]",
  "[.count-glyph.is-done_&]:[fill:var(--rule)]",
  "[.count-glyph.is-done_&]:stroke-ink-2",
)

const glyphLineClassName = cn(
  "glyph-line",
  "[.count-glyph_&]:[fill:none]",
  "[.count-glyph_&]:stroke-ink",
  "[.count-glyph_&]:[stroke-width:1.25]",
  "[.count-glyph_&]:[stroke-linecap:round]",
  "[.count-glyph.is-done_&]:stroke-ink-2",
)

const countGlyphClassName = cn(
  "count-glyph",
  "w-[2rem] h-auto flex-none",
)

const doseInlineClassName = cn(
  "dose-inline",
  "whitespace-nowrap",
)

const markFigureClassName = cn(
  "mark-figure",
  "[.dose-inline_&]:font-text [.dose-inline_&]:font-extrabold",
  "[.dose-inline_&]:text-[length:1.15em]",
)

const markWordClassName = cn(
  "mark-word",
  "[.now-mark_&]:font-text [.now-mark_&]:font-semibold [.now-mark_&]:leading-[1.1]",
  "[.now-mark_&]:text-[length:var(--step-3)]",
  "[.row-mark_&]:font-text [.row-mark_&]:font-semibold [.row-mark_&]:leading-[1.25]",
  "[.row-mark_&]:text-[length:var(--step-0)]",
)

const visuallyHiddenClassName = cn(
  "visually-hidden",
  "absolute w-[1px] h-[1px] overflow-hidden whitespace-nowrap",
  "[clip-path:inset(50%)]",
)

const doseFigureClassName = cn(
  "dose-figure",
  "grid gap-1 min-w-0",
  "[&.now_.basis]:text-[length:var(--step-0)]",
)

const doseLineClassName = cn(
  "dose-line",
  "[.dose-figure.now_&]:leading-[1.05]",
)

const nowLeadClassName = cn(
  "now-lead",
  "text-[length:var(--step-2)]",
  "font-semibold",
)

const nowMarkClassName = cn(
  "now-mark",
  "font-text tabular-nums font-black leading-[0.85]",
  "text-[length:var(--figure-xl)]",
  "[&_small]:text-[length:0.42em]",
  "[&_small]:font-extrabold [&_small]:ms-[0.06em]",
)

const rowMarkClassName = cn(
  "row-mark",
  "font-text tabular-nums font-extrabold leading-[0.95]",
  "text-[length:1.875rem]",
  "[&_small]:text-[length:0.55em]",
  "[&_small]:font-extrabold [&_small]:ms-[0.08em]",
  "[.step_&]:text-[length:var(--figure-sm)]",
)

const equivalentClassName = cn(
  "equivalent",
  "text-ink-2 font-text font-extrabold tabular-nums leading-[1.1]",
  "text-[length:var(--step-1)]",
  "[.dose-figure.now_&]:text-[length:var(--figure-sm)]",
)

const stepperClassName = cn(
  "stepper",
  "flex flex-wrap min-w-0 gap-2 items-center justify-between min-h-14",
  "[justify-items:start]",
  "[.edit-clothes-extra_&]:flex [.edit-clothes-extra_&]:items-center [.edit-clothes-extra_&]:justify-between [.edit-clothes-extra_&]:gap-2",
  "[.laundry-care-group_&]:flex [.laundry-care-group_&]:flex-wrap [.laundry-care-group_&]:items-center [.laundry-care-group_&]:justify-between [.laundry-care-group_&]:gap-[.75rem]",
  "[.laundry-care-editor_>_&]:flex [.laundry-care-editor_>_&]:flex-wrap [.laundry-care-editor_>_&]:items-center [.laundry-care-editor_>_&]:justify-between [.laundry-care-editor_>_&]:gap-[.75rem]",
)

const fieldLabelClassName = cn(
  "field-label",
  "text-[length:var(--step-1)]",
  "font-semibold text-ink",
)

const stepperControlsClassName = cn(
  "stepper-controls",
  "[.bulk-count_&]:grid-cols-[4rem_minmax(5rem,_auto)_4rem]",
  "[display:inline-grid]",
  "w-[8rem] max-w-full min-w-0 grid-cols-[minmax(44px,_1fr)_minmax(1.75rem,_auto)_minmax(44px,_1fr)] items-center gap-1",
  "[.bulk-count_&]:w-auto [.edit-clothes-extra_&]:w-auto",
  "[.edit-clothes-extra_&]:grid-cols-[2.75rem_minmax(3.25rem,_auto)_2.75rem]",
)

const stepperButtonClassName = cn(
  "stepper-button",
  "[.bulk-count_&]:min-h-[4rem]",
  "min-h-[2.75rem] border-0 rounded-control font-text font-semibold leading-[1] cursor-[pointer] select-none",
  "[background:var(--surface-2)]",
  "text-[length:1.25rem]",
  "[touch-action:manipulation]",
  "[-webkit-user-select:none]",
  "[-webkit-touch-callout:none]",
  "[&:active:not(:disabled)]:[background:var(--surface-3)]",
  "[&:disabled]:cursor-[not-allowed] [&:disabled]:opacity-[0.45]",
  "[&:disabled]:[transition:opacity_150ms_var(--effect)_150ms]",
  "[.edit-clothes-extra_&]:min-h-[2.75rem]",
  "[.edit-clothes-extra_&]:text-[length:1.25rem]",
)

const stepperValueClassName = cn(
  "stepper-value",
  "[.bulk-count_&]:text-[length:var(--figure-lg)]",
  "grid place-items-center px-1 font-text font-semibold tabular-nums whitespace-nowrap",
  "text-[length:var(--step-1)]",
  "[.edit-clothes-extra_&]:text-[length:var(--step-1)]",
)

const amountClassName = cn(
  "amount",
  "[.step_&]:text-[length:var(--figure-sm)]",
  "font-text font-extrabold leading-[0.95] tabular-nums whitespace-nowrap",
  "text-[length:1.875rem]",
  "[&_small]:text-[length:0.55em]",
  "[&_small]:font-extrabold [&_small]:ms-[0.08em]",
)

const fieldClassName = cn(
  "field",
  "grid gap-2",
  "[&_label]:text-[length:var(--step-1)]",
  "[&_label]:font-semibold [&_label]:text-ink [&_label]:leading-normal",
  "[.sheet_&_input:not([type='checkbox']):not([type='radio']):not([type='file'])]:[background-color:var(--sheet)]",
  "[.sheet_&_select]:[background-color:var(--sheet)]",
  "[.sheet_&_textarea]:[background-color:var(--sheet)]",
  "[.sheet_&_:is(input,_select,_textarea):focus-visible]:[border-color:var(--focus)]",
  "[.sheet_&_:is(input,_select,_textarea)]:bg-surface [.sheet_&_:is(input,_select,_textarea)]:rounded-field",
)

const fieldHintClassName = cn(
  "field-hint",
  "text-ink-2",
  "text-[length:var(--step--1)]",
)

const noticeClassName = cn(
  "notice",
  "[.sheet.has-compact-actions_.sheet-foot_>_&]:[flex:1_0_100%]",
  "grid gap-2 p-[var(--space-3)_14px] rounded-[1rem] max-w-none",
  "[background:var(--label)]",
  "text-[length:var(--step-0)] leading-normal",
)

const badClassName = cn(
  "bad",
  "[.notice&]:[background:var(--conflict-bg)]",
  "[.notice&]:[color:var(--conflict-ink)]",
  "[.notice&]:font-semibold",
)

const appLoadingClassName = cn(
  "app-loading",
  "w-full max-w-[26rem] mx-auto text-center text-ink-2",
  "text-[length:var(--step-0)]",
)

const skeletonClassName = cn(
  "skeleton",
  "grid gap-3 w-full max-w-[36rem]",
)

const appLoadingArtClassName = cn(
  "app-loading-art",
  "grid place-items-center w-[7rem] h-[7rem] m-[0_auto_var(--space-4)] bg-surface-2 rounded-[2rem]",
  "motion-safe:[animation:pulse_1.8s_ease-in-out_infinite]",
)

const skeletonRowClassName = cn(
  "skeleton-row",
  "flex items-center gap-3 px-4 py-3 rounded-card bg-surface shadow-[var(--e1)]",
)


const skeletonCopyClassName = cn(
  "skeleton-copy",
  "grid gap-[.65rem] flex-1",
)


const countPickerClassName = cn(
  "count-picker",
  "grid gap-2",
)

const countPickerOptionsClassName = cn(
  "count-picker-options",
  "grid grid-cols-[repeat(4,_minmax(3.5rem,_1fr))] gap-2",
)

const countPickerOptionClassName = cn(
  "count-picker-option",
  "min-h-[4rem] border-0 rounded-control bg-surface shadow-[inset_0_0_0_1px_var(--line)] text-ink font-figure font-semibold cursor-[pointer] select-none",
  "text-[length:var(--figure-md)]",
  "[transition:transform_120ms_var(--ease-out),_background-color_120ms_var(--effect)]",
  "[touch-action:manipulation]",
  "[-webkit-user-select:none]",
  "[-webkit-touch-callout:none]",
  "[&[aria-pressed='true']]:[background:var(--accent-container)]",
  "[&[aria-pressed='true']]:[color:var(--on-accent-container)]",
  "[&[aria-pressed='true']]:shadow-[inset_0_0_0_1px_var(--accent)]",
  "[&:active:not(:disabled)]:[transform:scale(0.97)]",
  "motion-reduce:[&:active:not(:disabled)]:transform-none",
)

const heLogoClassName = cn(
  "he-logo",
  "inline-block w-[1.4em] h-[1.4em]",
  "[vertical-align:-0.35em]",
  "[&_text]:font-text",
)

const heLabelClassName = cn(
  "he-label",
  "inline-flex items-center gap-[0.3em]",
)

const drumPicturesClassName = cn(
  "drum-pictures",
  "grid gap-3",
)

const drumPicturesLegendClassName = cn(
  "drum-pictures-legend",
  "text-[length:var(--step-2)]",
  "font-semibold",
)

const drumPicturesOptionsClassName = cn(
  "drum-pictures-options",
  "grid grid-cols-[repeat(2,_1fr)] gap-2",
  "min-[30rem]:grid-cols-[repeat(4,_1fr)]",
)

const drumPictureClassName = cn(
  "drum-picture",
  "[&[aria-pressed='true']]:[background:var(--accent-container)]",
  "[&[aria-pressed='true']]:[color:var(--on-accent-container)]",
  "[&[aria-pressed='true']]:shadow-[inset_0_0_0_1px_var(--accent)]",
  "grid gap-1 min-h-[7rem] p-[var(--space-3)_var(--space-2)] border-0 rounded-label bg-surface shadow-[inset_0_0_0_1px_var(--line)] text-ink font-semibold cursor-[pointer]",
  "[justify-items:center]",
  "text-[length:var(--step-0)]",
  "[&:disabled]:cursor-[progress]",
  "[.drum-pictures.is-read-only_&:disabled]:opacity-[0.5] [.drum-pictures.is-read-only_&:disabled]:cursor-[not-allowed]",
  "[&:disabled:not([aria-pressed='true'])]:text-ink-2",
  "[&:disabled:not([aria-pressed='true'])]:[transition:color_150ms_var(--effect)_150ms]",
)

const drumArtClassName = cn(
  "drum-art",
  "w-[3.5rem] h-auto",
)

const drumCabinetClassName = cn(
  "drum-cabinet",
  "[.drum-art_&]:fill-surface-2 [.drum-art_&]:stroke-ink-3",
  "[.drum-art_&]:[stroke-width:1.5]",
)

const drumPanelClassName = cn(
  "drum-panel",
  "[.drum-art_&]:stroke-ink-3",
  "[.drum-art_&]:[stroke-width:2]",
  "[.drum-art_&]:[stroke-linecap:round]",
)

const drumClothesClassName = cn(
  "drum-clothes",
  "[.drum-art_&]:fill-washing",
)

const drumDoorClassName = cn(
  "drum-door",
  "[.drum-art_&]:[fill:none]",
  "[.drum-art_&]:stroke-ink",
  "[.drum-art_&]:[stroke-width:2.5]",
)

const dotsPictureClassName = cn(
  "dots-picture",
  "w-auto h-[0.75rem] flex-none",
  "[&.is-tub]:h-[2rem]",
  "[&.is-dryer]:h-[2rem]",
)

const dotClassName = cn(
  "dot",
  "[.dots-picture_&]:[fill:none]",
  "[.dots-picture_&]:[stroke:currentColor]",
  "[.dots-picture_&]:[stroke-width:1.5]",
  "[.dots-picture_&.is-on]:[fill:currentColor]",
)

const tagLineClassName = cn(
  "tag-line",
  "[.dots-picture_&]:[fill:none]",
  "[.dots-picture_&]:[stroke:currentColor]",
  "[.dots-picture_&]:[stroke-width:2]",
  "[.dots-picture_&]:[stroke-linejoin:round]",
)

const hangerChipClassName = cn(
  "hanger-chip",
  "inline-flex items-center gap-[2px] p-[0_6px] rounded-full bg-surface-2 text-ink-2 font-semibold leading-[1.5] whitespace-nowrap",
  "text-[length:0.75rem]",
  "[&_svg]:w-[0.875rem] [&_svg]:h-[0.875rem]",
)

const chipRowClassName = cn(
  "chip-row",
  "grid gap-2",
)

const chipRowLabelClassName = cn(
  "chip-row-label",
  "text-[length:var(--step-1)]",
  "font-semibold text-ink",
)

/** The answers share the row evenly and use its full width; a long set wraps rather than squeezing. */
const chipRowChipsClassName = cn(
  "chip-row-chips",
  "grid gap-2 grid-cols-[repeat(auto-fit,minmax(min(100%,6rem),1fr))]",
)

/**
 * The app's one choice chip, in three sizes. `text` is a short answer sized to its words, `answer`
 * a full-width answer block in a list, `symbol` a care-tag tile with the symbol above its words.
 * A picked chip takes the accent fill and a thicker ring, so the choice never rests on colour alone.
 */
export const choiceChipVariants = cva(
  cn(
    "relative min-w-0 border-0 font-semibold text-ink cursor-pointer select-none [-webkit-touch-callout:none]",
    "motion-safe:[transition:transform_var(--dur-press)_var(--ease-out),background-color_var(--dur-step)_var(--ease-out)]",
    "motion-safe:[&:active:not(:disabled)]:scale-[.97] disabled:opacity-45",
    "aria-pressed:bg-accent aria-pressed:text-accent-foreground aria-pressed:shadow-[var(--selected-ring)]",
  ),
  {
    variants: {
      variant: {
        text: cn(
          "inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-control bg-card px-3.5 text-center leading-[1.2] [overflow-wrap:break-word]",
          "text-[length:var(--step-0)] shadow-[inset_0_0_0_1px_var(--line)]",
        ),
        answer: cn(
          "flex w-full min-h-14 items-center justify-between gap-3 rounded-label p-[var(--space-3)_var(--space-4)] text-start [background:var(--choice)]",
          "text-[length:var(--step-1)] shadow-[inset_0_0_0_1px_var(--choice-line)]",
        ),
        symbol: cn(
          "flex min-h-[5.25rem] flex-col items-center justify-center gap-1 rounded-label p-2 text-center leading-[1.2] [background:var(--choice)] [overflow-wrap:anywhere]",
          "text-[length:var(--step-0)] shadow-[inset_0_0_0_1px_var(--choice-line)]",
          "[&>svg]:size-8 [&>svg]:flex-none aria-pressed:after:absolute aria-pressed:after:top-1 aria-pressed:after:end-2",
        ),
      },
    },
    defaultVariants: { variant: 'text' },
  },
)

const choicesRowClassName = "grid min-w-0 gap-2"

const choicesHintClassName = cn(
  "text-muted-foreground leading-[1.4] text-[length:var(--step--1)]",
  "[.machine-he_&]:flex [.machine-he_&]:items-center [.machine-he_&]:gap-2",
)

export const evidenceOptions = uiText.evidenceOptions

export type { EvidenceLevel }

/** Washer placements only: a washer form must never offer the dryer drum. */
export const placementLabels: Readonly<Record<string, string>> = uiText.placements
/** Washer stages only, for the same reason. */
export const stageLabels: Readonly<Record<string, string>> = uiText.stages
/** Every placement and stage a rule or step can carry, washer and dryer, for reading them back. */
export const rulePlacementLabels: Readonly<Record<string, string>> = { ...placementLabels, dryer_drum: uiText.dryerDrum }
export const ruleStageLabels: Readonly<Record<string, string>> = { ...stageLabels, dry: uiText.dryingStage }

export const loadSizeLabels = uiText.loadSizes
export const soilLabels = soilButtonWords
/** Drying care in the words of the tag step's answers. */
export const dryMethodLabels = uiText.dryMethods
/** Generic heat words; a dryer's own buttons are shown in the dryer's words instead. */
export const dryerHeatLabels = uiText.dryerHeats
/** What to do at the machine with a garment that stays out of the dryer. */
export const holdOutLabels: Readonly<Record<string, string>> = uiText.holdOut

/** A garment's drying care as one phrase: "Dryer, low heat", "Dryer, any heat", "Lay flat". */
export function dryingCareText(method: string | null | undefined, heat: string | null | undefined): string {
  if (method !== 'tumble_dry') return dryMethodLabels[(method ?? 'unknown') as DryMethod] ?? dryMethodLabels.unknown
  if (heat === null || heat === undefined || heat === 'high') return uiText.dryerAnyHeat
  return uiText.dryerWithHeat((dryerHeatLabels[heat as DryerHeat] ?? heat).toLowerCase())
}

export function label(value: string | null | undefined): string {
  if (value === null || value === undefined || value.length === 0) return uiText.notRecorded
  return rulePlacementLabels[value] ?? ruleStageLabels[value] ?? value.replaceAll('_', ' ').replace(/^./, (first) => first.toUpperCase())
}

/** Where a product goes, in the words on the washer. A dispenser slot says whether it is a drawer. */
export function slotName(placement: string, doorLocks = false): string {
  const slot = slotNames[placement]
  if (slot === undefined) return label(placement)
  return placement.endsWith('_compartment') ? uiText.slot(slot, doorLocks) : slot
}

const slotNames: Record<string, string> = uiText.slotNames

const toneClass = { good: '', warn: stampCautionClassName, neutral: stampMutedClassName, bad: stampCautionClassName } as const

export function StatusBadge({ tone, children, tilt = false, fresh = false }: { tone: 'good' | 'warn' | 'neutral' | 'bad'; children: ReactNode; tilt?: boolean; fresh?: boolean }) {
  return <span className={cn(stampClassName, toneClass[tone], tilt ? 'tilt' : '', fresh ? 'fresh' : '')}>{children}</span>
}

type MarkState = 'idle' | 'now' | 'done'
const stateClass = (state: MarkState) => (state === 'now' ? 'is-now' : state === 'done' ? isDoneClassName : '')
const sameMark = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase()

/**
 * A measuring cup filled to the dose: the eye reads how much before it reads the number. With the
 * product's marks it shows one tick per mark, bottom to top, filled to the planned one. The ticks
 * are a picture, not the cap's geometry; the printed mark beside it carries the instruction.
 *
 * With `onPick` it becomes the answer to "What does the back say?": each printed mark is its own
 * button beside the picture, highest first, and the picture fills to the one picked. A scoop
 * product draws a scoop instead of a cap.
 */
export function Cup({ amount, unit, marks, mark, state = 'idle', vessel = unit === 'scoop' ? 'scoop' : 'cap', onPick, label: groupLabel }: {
  amount: number | null
  unit: string
  marks?: readonly string[] | null
  mark?: string | null
  state?: MarkState
  vessel?: 'cap' | 'scoop'
  /** Pick mode: called with the printed mark, exactly as the cap prints it. */
  onPick?: (mark: string) => void
  /** Pick mode: what the marks answer, for screen readers. */
  label?: string
}) {
  const clipId = useId()
  const ticks = marks ?? []
  const tickLevel = (index: number) => (0.9 * (index + 1)) / ticks.length
  const planned = ticks.length > 0 && typeof mark === 'string' ? ticks.findIndex((entry) => sameMark(entry, mark)) : -1
  const capacity = unit === 'g' ? 60 : unit === 'ml' ? 120 : 4
  // A mark that is not on the cap fills nothing rather than guessing a level.
  const level = ticks.length > 0 && typeof mark === 'string' ? (planned < 0 ? 0 : tickLevel(planned))
    : amount === null ? 0 : Math.max(0.12, Math.min(1, amount / capacity))
  const scoop = vessel === 'scoop'
  const height = (fraction: number) => (scoop ? 40 - fraction * 28 : 42 - fraction * 34)
  const inset = (y: number) => (scoop ? 4 : 5 + (y - 4) * 0.105)
  const right = scoop ? 30 : 40
  const top = height(level)
  const picture = (
    <svg className={cn(cupClassName, scoop ? 'is-scoop' : '', ticks.length > 0 ? 'has-marks' : '', stateClass(state))} viewBox="0 0 40 46" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {scoop ? (
        <>
          <defs><clipPath id={clipId}><path d={scoopBowl} /></clipPath></defs>
          {level > 0 ? <rect className={cupFillClassName} x="4" y={top} width="26" height={40 - top} stroke="none" clipPath={`url(#${clipId})`} /> : null}
          <path className={cupBodyClassName} d={scoopBowl} vectorEffect="non-scaling-stroke" />
          <path className={cupBodyClassName} d="M30 13h7v4h-7M4 10q13 3 26 0" vectorEffect="non-scaling-stroke" />
        </>
      ) : (
        <>
          {level > 0 ? <path className={cupFillClassName} d={`M${inset(top)} ${top}H${40 - inset(top)}L31 42H9z`} stroke="none" /> : null}
          <path className={cupBodyClassName} d="M5 4l4 38h22l4-38M5 4a15 2 0 1130 0 15 2 0 01-30 0z" vectorEffect="non-scaling-stroke" />
        </>
      )}
      {ticks.map((entry, index) => {
        const y = height(tickLevel(index))
        const start = inset(y) + 1.5
        return <g key={entry}>
          <path className={cn(cupTickClassName, index === planned ? 'is-planned' : '')} d={`M${start} ${y}h${index === planned ? 7 : 5}`} vectorEffect="non-scaling-stroke" />
          <text x={scoop ? right - 2 : right - inset(y) - 1.5} y={y + 2.5} fill="currentColor" stroke="none" textAnchor="end" fontSize="7" fontWeight={index === planned ? 600 : 400} opacity={index === planned ? 1 : 0.6}>{entry.replace(/^line\s+/i, '')}</text>
        </g>
      })}
    </svg>
  )
  if (onPick === undefined || ticks.length === 0) return picture
  return (
    <div className={cupPickClassName} role="group" aria-label={groupLabel ?? uiText.cupLines}>
      {picture}
      <div className={cupPickMarksClassName}>
        {[...ticks].reverse().map((entry) => (
          <Toggle key={entry} type="button" className={cupPickMarkClassName} pressed={planned >= 0 && sameMark(ticks[planned]!, entry)} onClick={() => onPick(entry)}>
            {entry}
          </Toggle>
        ))}
      </div>
    </div>
  )
}

const scoopBowl = 'M4 10H30V34a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6Z'

function countedShape(kind: string, x: number, y: number, key: number) {
  if (kind === 'sheet') return <rect key={key} className={glyphItemClassName} x={x - 4.5} y={y - 5.5} width="9" height="11" rx="1.5" />
  if (kind === 'tablet') return <rect key={key} className={glyphItemClassName} x={x - 5} y={y - 4} width="10" height="8" rx="2.5" />
  return (
    <g key={key}>
      <circle className={glyphItemClassName} cx={x} cy={y} r="5" />
      <path className={glyphLineClassName} d={kind === 'ball' ? `M${x - 4} ${y - 1.5}q4 3 8 0` : `M${x - 2.5} ${y + 1}a2.6 2.6 0 0 1 5 -1.6`} />
    </g>
  )
}

/** A counted dose drawn as the things themselves: up to six pods, sheets, balls or tablets. */
export function CountGlyph({ amount, unit, state = 'idle' }: { amount: number; unit: string; state?: MarkState }) {
  const kind = countedUnit(unit) ?? 'pod'
  const shown = Math.max(1, Math.min(6, Math.round(amount)))
  const rows = Math.ceil(shown / 3)
  return (
    <svg className={cn(countGlyphClassName, stateClass(state))} viewBox="0 0 40 46" aria-hidden="true">
      {Array.from({ length: shown }, (_, index) => {
        const row = Math.floor(index / 3)
        const inRow = Math.min(3, shown - row * 3)
        const x = 20 + ((index % 3) - (inRow - 1) / 2) * 12.5
        const y = 23 + (row - (rows - 1) / 2) * 13.5
        return countedShape(kind, x, y, index)
      })}
    </svg>
  )
}

/**
 * A dose as printed: the cap's own mark first (words and figures, never converted), a count, or a
 * measured amount in this device's units. The printed volume follows, smaller. On the step in hand
 * the instruction opens the same sentence ("Fill the cap to Line 2"), never as a label stacked
 * above it. The inline form is the dose alone inside a sentence ("Line 1 or Line 3").
 */
export function DoseFigure({ dose, size = 'row', id }: { dose: DoseLike; size?: 'now' | 'row' | 'inline'; id?: string }) {
  const { system } = useUnits()
  const parts = doseParts(dose, system)
  if (size === 'inline') {
    return (
      <span className={doseInlineClassName} id={id}>
        <span aria-hidden="true">
          {parts.tokens.map((token, index) => <span key={index} className={token.figure ? markFigureClassName : markWordClassName}>{token.text}</span>)}
          {parts.unitWord === null ? null : ` ${parts.unitWord}`}
        </span>
        <span className={visuallyHiddenClassName}>{parts.kind === 'mark' && parts.lead !== null ? parts.spoken.slice(parts.lead.length + 1) : parts.spoken}</span>
      </span>
    )
  }
  return (
    <div className={cn(doseFigureClassName, size)}>
      <p className={doseLineClassName} id={id}>
        <span aria-hidden="true">
          {size === 'now' && parts.lead !== null ? <><span className={nowLeadClassName}>{parts.lead}</span>{' '}</> : null}
          <span className={size === 'now' ? nowMarkClassName : rowMarkClassName}>
            {parts.tokens.map((token, index) => <span key={index} className={token.figure ? markFigureClassName : markWordClassName}>{token.text}</span>)}
            {parts.unitWord === null ? null : <small>{parts.unitWord}</small>}
          </span>
        </span>
        <span className={visuallyHiddenClassName}>{parts.spoken}</span>
      </p>
      {parts.secondary === null ? null : <p className={equivalentClassName}>{parts.secondary}</p>}
    </div>
  )
}

/** A whole-step counter for fills or counts: big targets either side of the figure. */
export function Stepper({ label: text, value, min, max, step = 1, onChange, format = String }: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  format?: (value: number) => string
}) {
  const id = useId()
  const to = (next: number) => onChange(Math.min(max, Math.max(min, Math.round(next / step) * step)))
  return (
    <div className={cn(stepperClassName, '[content-visibility:auto] [contain-intrinsic-size:auto_4rem]')} role="group" aria-labelledby={id}>
      <span id={id} className={cn(fieldLabelClassName, 'min-w-0 flex-[1_1_8rem] [overflow-wrap:anywhere]')}>{text}</span>
      <div className={stepperControlsClassName}>
        <Button variant="unstyled" size="unstyled" className={stepperButtonClassName} type="button" aria-label={uiText.less(text)} disabled={value <= min} onClick={() => to(value - step)}>−</Button>
        <output className={stepperValueClassName} aria-live="polite">{format(value)}</output>
        <Button variant="unstyled" size="unstyled" className={stepperButtonClassName} type="button" aria-label={uiText.more(text)} disabled={value >= max} onClick={() => to(value + step)}>+</Button>
      </div>
    </div>
  )
}

/** A dose as figures: the amount large, the unit beside it. */
export function Amount({ amount, unit, className = amountClassName }: { amount: number | null; unit: string; className?: string }) {
  const { system } = useUnits()
  if (amount === null) return <span className={className}>?</span>
  const shown = displayDose(amount, unit, system)
  // The space is for reading aloud and searching; the figure itself sets the unit tight.
  return <span className={className}>{Number.isInteger(shown.amount) ? shown.amount : shown.amount.toFixed(1)}<span className={visuallyHiddenClassName}> </span><small>{shown.unit}</small></span>
}

export function Field({ label: text, hint, children }: { label: string; hint?: string; children: (id: string, hintId?: string) => ReactNode }) {
  const id = useId()
  const hintId = hint === undefined ? undefined : `${id}-hint`
  return (
    <ShadcnField className={fieldClassName}>
      <FieldLabel htmlFor={id}>{text}</FieldLabel>
      {children(id, hintId)}
      {hint === undefined ? null : <p className={fieldHintClassName} id={hintId}>{hint}</p>}
    </ShadcnField>
  )
}

export function ErrorNotice({ error }: { error: string | null }) {
  if (error === null) return null
  return <p className={cn(noticeClassName, badClassName)} role="alert">{error}</p>
}

/**
 * What went wrong, in words a person can act on. The backend throws `ConvexError`s carrying
 * `{ code, message }` for anything a person should read; anything else is an unexpected failure.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    const data: unknown = error.data
    if (typeof data === 'object' && data !== null && typeof (data as { message?: unknown }).message === 'string') return (data as { message: string }).message
    if (typeof data === 'string') return data
  }
  return uiText.genericError
}

/** The backend's error code, when the error is one a person was meant to see. */
export function errorCode(error: unknown): string | null {
  if (!(error instanceof ConvexError)) return null
  const data: unknown = error.data
  return typeof data === 'object' && data !== null && typeof (data as { code?: unknown }).code === 'string' ? (data as { code: string }).code : null
}

/** Calls a Convex mutation from a form or button, with pending and error state. */
export function useConvexCall<Reference extends FunctionReference<'mutation'>>(reference: Reference, optimisticUpdate?: OptimisticUpdate<FunctionArgs<Reference>>) {
  const plain = useMutation(reference)
  const mutate = optimisticUpdate === undefined ? plain : plain.withOptimisticUpdate(optimisticUpdate)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (args: FunctionArgs<Reference>): Promise<FunctionReturnType<Reference> | undefined> => {
    setPending(true)
    setError(null)
    try {
      return await mutate(args)
    } catch (caught) {
      setError(errorMessage(caught))
      return undefined
    } finally {
      setPending(false)
    }
  }
  return { run, pending, error, clearError: () => setError(null) }
}

/** Startup has no private data to preview; screen placeholders resemble the rows to come. */
export function Loading({ what, startup = false }: { what: string; startup?: boolean }) {
  return (
    <div className={startup ? appLoadingClassName : skeletonClassName} role="status">
      <span className={startup ? visuallyHiddenClassName : 'text-ink-2'}>{uiText.loading(what)}</span>
      {startup ? <div aria-hidden="true">
        <div className={appLoadingArtClassName}><GarmentIcon kind="t_shirt" className="size-[4.5rem]" /></div>
        <p>{uiText.gettingReady}</p>
      </div> : [0, 1, 2].map((row) => <div className={skeletonRowClassName} aria-hidden="true" key={row}>
        <Skeleton className="size-11 flex-none rounded-field" />
        <div className={skeletonCopyClassName}><Skeleton className="w-[70%] h-3" /><Skeleton className="w-[45%] h-[.6rem]" /></div>
      </div>)}
    </div>
  )
}

export function relativeTime(timestamp: number, now: number): string {
  const seconds = Math.round((timestamp - now) / 1000)
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const absolute = Math.abs(seconds)
  if (absolute < 60) return format.format(seconds, 'second')
  if (absolute < 3600) return format.format(Math.round(seconds / 60), 'minute')
  if (absolute < 86_400) return format.format(Math.round(seconds / 3600), 'hour')
  return format.format(Math.round(seconds / 86_400), 'day')
}

export function clockTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(timestamp)
}

/**
 * A count answered with one tap: "1" "2" "3" "4" pods, sheets or balls. Each is a big target; the
 * unit is spoken with the number.
 */
export function CountPicker({ label: text, value, unit, max = 4, onPick }: {
  label: string
  value: number | null
  /** The counted thing: pod, sheet or ball. */
  unit: string
  max?: number
  onPick: (count: number) => void
}) {
  const id = useId()
  const kind = countedUnit(unit) ?? 'pod'
  return (
    <div className={countPickerClassName} role="group" aria-labelledby={id}>
      <span id={id} className={fieldLabelClassName}>{text}</span>
      <div className={countPickerOptionsClassName}>
        {Array.from({ length: max }, (_, index) => index + 1).map((count) => (
          <Toggle key={count} type="button" className={countPickerOptionClassName} pressed={value === count} onClick={() => onPick(count)}>
            <span aria-hidden="true">{count}</span>
            <span className={visuallyHiddenClassName}>{count} {count === 1 ? kind : `${kind}s`}</span>
          </Toggle>
        ))}
      </div>
    </div>
  )
}

/**
 * The high-efficiency logo, drawn: the only way the app shows HE. Its accessible name is spoken
 * words, never the letters.
 */
export function HeLogo({ size = 'inline' }: { size?: 'inline' | 'large' }) {
  return (
    <svg className={cn(heLogoClassName, size)} viewBox="0 0 32 32" role="img" aria-label={appText.highEfficiencyLogo}>
      <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <text x="16" y="21.5" textAnchor="middle" fill="currentColor" fontWeight="700" fontSize="15">he</text>
    </svg>
  )
}

/** A washer's class in picture words: "Has this logo [logo]" or "No [logo] logo". */
export function WasherClassLabel({ value }: { value: WasherClass }) {
  return value === 'he'
    ? <span className={heLabelClassName}>{uiText.hasHeLogo} <HeLogo /></span>
    : <span className={heLabelClassName}>{uiText.noHeLogo} <HeLogo /> {uiText.logo}</span>
}

/**
 * "How full is the drum?" as four pictures, emptiest first. What the person sees is the load size;
 * nothing else ever chooses a size-dependent dose.
 */
export function DrumPictures({ legend, value, onPick, machine = 'washer', disabled = false, readOnly = false }: {
  legend: string
  value: LoadSize | null
  onPick: (size: LoadSize) => void
  machine?: 'washer' | 'dryer'
  disabled?: boolean
  /** Can't be answered here at all (the copy saved on this phone): the pictures show as off. */
  readOnly?: boolean
}) {
  const id = useId()
  return (
    <div className={cn(drumPicturesClassName, `is-${machine}`, readOnly && 'is-read-only')} role="group" aria-labelledby={id}>
      <p id={id} className={drumPicturesLegendClassName}>{legend}</p>
      <div className={drumPicturesOptionsClassName}>
        {drumPictures.map((picture) => (
          <Toggle key={picture.size} type="button" className={drumPictureClassName} pressed={value === picture.size} disabled={disabled || readOnly} onClick={() => onPick(picture.size)}>
            <DrumArt fill={picture.fill} machine={machine} />
            <span>{picture.word}</span>
          </Toggle>
        ))}
      </div>
    </div>
  )
}

function DrumArt({ fill, machine }: { fill: number; machine: 'washer' | 'dryer' }) {
  const clipId = useId()
  // The door is a circle of radius 15 centred at (24, 29); clothes fill it from the bottom.
  const top = 44 - fill * 30
  return (
    <svg className={drumArtClassName} viewBox="0 0 48 52" aria-hidden="true">
      <rect className={drumCabinetClassName} x="2" y="2" width="44" height="48" rx="8" />
      {machine === 'washer' ? <path className={drumPanelClassName} d="M8 7h14" /> : <path className={drumPanelClassName} d="M8 7h32" />}
      <defs><clipPath id={clipId}><circle cx="24" cy="29" r="15" /></clipPath></defs>
      <rect className={drumClothesClassName} x="9" y={top} width="30" height={45 - top} clipPath={`url(#${clipId})`} />
      <circle className={drumDoorClassName} cx="24" cy="29" r="15" />
    </svg>
  )
}

/**
 * Dots, as a care tag or a soil level draws them. `dots` shows a plain row of `of` dots with
 * `dots` filled (soil: one, two or three of three); `tub` is the wash-tub symbol with its water
 * dots; `dryer` is the tumble-dry square with its heat dots (none: any heat). Decorative unless
 * given a label.
 */
export function DotsPicture({ dots, of = 3, symbol = 'dots', label: text }: { dots: number; of?: number; symbol?: 'dots' | 'tub' | 'dryer'; label?: string }) {
  const a11y = text === undefined ? { 'aria-hidden': true as const } : { role: 'img', 'aria-label': text }
  if (symbol === 'dots') {
    return (
      <svg className={dotsPictureClassName} viewBox={`0 0 ${of * 12} 12`} {...a11y}>
        {Array.from({ length: of }, (_, index) => <circle key={index} className={index < dots ? cn(dotClassName, "is-on") : dotClassName} cx={6 + index * 12} cy="6" r="4.5" />)}
      </svg>
    )
  }
  const shown = Math.max(0, Math.min(4, Math.round(dots)))
  const row = (cy: number) => Array.from({ length: shown }, (_, index) => <circle key={index} className={cn(dotClassName, "is-on")} cx={20 + (index - (shown - 1) / 2) * 6} cy={cy} r="2" />)
  return (
    <svg className={cn(dotsPictureClassName, `is-${symbol}`)} viewBox="0 0 40 32" {...a11y}>
      {symbol === 'tub'
        ? <>
            <path className={tagLineClassName} d="M4 8l4 20h24l4-20" />
            <path className={tagLineClassName} d="M4 8q4 4 8 0t8 0 8 0 8 0" />
            {row(19)}
          </>
        : <>
            <rect className={tagLineClassName} x="6" y="2" width="28" height="28" rx="2" />
            <circle className={tagLineClassName} cx="20" cy="16" r="10" />
            {row(16)}
          </>}
    </svg>
  )
}

/**
 * The quiet "not worn since" mark on a hanger: a clock and the short month ("Jun"). Screen readers
 * hear "Not worn since June". It is never a card or a notification.
 */
export function NotWornSymbol({ since, now }: { since: number; now: number }) {
  return (
    <span className={cn(hangerChipClassName, "not-worn")}>
      <DesignIcon name="clock" size="1em" strokeWidth={2.2} aria-hidden="true"  />
      <span aria-hidden="true">{shortMonthWord(since)}</span>
      <span className={visuallyHiddenClassName}>{uiText.notWornSince(monthWord(since, now))}</span>
    </span>
  )
}

export type ChipOption<Value extends string> = { readonly value: Value; readonly label: string }

type ChipRowProps<Value extends string> = {
  label: string
  /** The label is for screen readers only; the chips speak for themselves on screen. */
  hideLabel?: boolean
  options: readonly ChipOption<Value>[]
} & ({ value: Value; onChange: (value: Value) => void; values?: never } | { values: readonly Value[]; onToggle: (value: Value) => void; value?: never })

/**
 * A row of chips that wraps rather than scrolls, so every chip stays in reach and in view. One
 * chip on at a time with `value`, several with `values`.
 */
export function ChipRow<Value extends string>(props: ChipRowProps<Value>) {
  const id = useId()
  const on = (value: Value) => (props.values === undefined ? props.value === value : props.values.includes(value))
  const pick = (value: Value) => (props.values === undefined ? props.onChange(value) : props.onToggle(value))
  return (
    <div className={chipRowClassName} role="group" aria-labelledby={id}>
      <span id={id} className={props.hideLabel ? visuallyHiddenClassName : chipRowLabelClassName}>{props.label}</span>
      <div className={chipRowChipsClassName}>
        {props.options.map((option) => (
          <Toggle key={option.value} type="button" className={choiceChipVariants()} pressed={on(option.value)} onClick={() => pick(option.value)}>
            {option.label}
          </Toggle>
        ))}
      </div>
    </div>
  )
}

/** One row of answer chips under a label; a tap picks, and the picked ones show filled and checked. Several are on when `value` is a list. */
export function Choices<Value extends string>({ label: text, options, value, onPick, words, hint }: {
  label: string
  options: readonly Value[]
  value: Value | null | readonly Value[]
  onPick: (value: Value) => void
  words: (value: Value) => ReactNode
  hint?: ReactNode
}) {
  const id = useId()
  const on = (option: Value) => (Array.isArray(value) ? value.includes(option) : value === option)
  return (
    <div className={choicesRowClassName} role="group" aria-labelledby={id}>
      <p id={id} className={chipRowLabelClassName}>{text}</p>
      {hint === undefined ? null : <p className={choicesHintClassName}>{hint}</p>}
      <div className={chipRowChipsClassName}>
        {options.map((option) => (
          <Toggle key={option} type="button" className={choiceChipVariants()} pressed={on(option)} onClick={() => onPick(option)}>{words(option)}</Toggle>
        ))}
      </div>
    </div>
  )
}

/** "Worn 3×" on a hanger: rewearing is normal, so it is a quiet chip and never a nudge. */
export function WornChip({ times }: { times: number }) {
  return (
    <span className={cn(hangerChipClassName, "worn")}>
      <span aria-hidden="true">{uiText.wornTimes(times)}</span>
      <span className={visuallyHiddenClassName}>{uiText.wornTimesDetail(times)}</span>
    </span>
  )
}
