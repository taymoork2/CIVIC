import { cn } from '@/lib/utils'
import type { FunctionArgs } from 'convex/server'
import { useState } from 'react'

import type { api } from '@/api'

import { Button } from '@/components/ui/button'
import { CareSymbol, type CareSymbolKind } from '@/closet/care-symbols'
import { careSymbolWords } from '@/copy'
import { careQuestionText, type CareQuestion } from '@/copy-closet'
import type { Textile } from '@/household/inventory-types'
import { Sheet } from '@/kit/sheet'
import { TagRows, tagChoiceProblem, bleachWords, dryerWords, tubSymbol, tubWords, type DryerAnswer, type NaturalDrying, type TubAnswer } from '@/closet/tag-rows'
import { emptyTag, tagAnswers, tagDraftFromCare, tagRows, type TagBleach, type TagDraft, type TagMethod } from '@/laundry/tag-step'
import { TaskFooter } from '@/kit/task-footer'
import { GarmentIcon } from '@/kit/garment-icon'
import { errorMessage } from '@/kit/ui'
import { DesignIcon } from '@/kit/design-icons'

/**
 * The care label as the garment record shows it: three symbols (washing, bleach, drying) read from
 * what was recorded, and one question at a time to change them. Nothing here infers care: a
 * garment whose label was never checked, or whose pieces differ, reads as not checked or different.
 */

const methodTub: Readonly<Record<TagMethod, TubAnswer>> = { machine: 'machine', hand_wash: 'hand_wash', do_not_wash: 'do_not_wash', dry_clean_only: 'dry_clean_only', no_tag: 'unknown' }

/** The dashed outline with a question mark, in place of a symbol the label does not give. */
function UnknownSymbol({ size }: { size: number }) {
  return <svg viewBox="0 0 32 32" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" focusable="false" aria-hidden="true">
    <path d="M6 4h20v24H6z" strokeDasharray="3 3" />
    <path d="M12.5 12.5a3.5 3.5 0 1 1 5 3.2c-1 .5-1.5 1.2-1.5 2.3M16 22v.5" />
  </svg>
}

export type CareCell = {
  readonly key: CareQuestion
  readonly label: string
  readonly symbol: CareSymbolKind | null
  /** What is recorded, in the label's words; null when it was never answered. */
  readonly value: string | null
  /** True when the label does not ask this (a dry-clean-only tub has no bleach or dryer answer). */
  readonly notAsked: boolean
}

/** The three cells for pieces that share one care record; null when the pieces differ. */
export function careCells(members: readonly Pick<Textile, 'care'>[]): readonly CareCell[] | null {
  const first = members[0]?.care ?? null
  if (members.some((member) => JSON.stringify(member.care) !== JSON.stringify(first))) return null
  const checked = first !== null && first.status === 'confirmed'
  const draft = checked ? tagDraftFromCare(first) : emptyTag
  const wash = draft.method === null ? null : methodTub[draft.method]
  const washSymbol: CareSymbolKind | null = draft.method === 'machine' ? tubSymbol(draft.dots, draft.bars) : draft.method === 'hand_wash' ? 'hand_wash' : draft.method === 'do_not_wash' ? 'do_not_wash' : draft.method === 'dry_clean_only' ? 'dry_clean' : null
  const dry = draft.dryer
  const naturalSymbol: Readonly<Record<NaturalDrying, CareSymbolKind>> = { line: 'line_dry', flat: 'dry_flat', drip: 'drip_dry' }
  const drySymbol: CareSymbolKind | null = dry === null || dry === 'unknown' ? null
    : dry === 'no_tumble' ? (draft.natural === null ? 'do_not_tumble_dry' : naturalSymbol[draft.natural])
    : dry === 'tumble' ? 'tumble_dry' : dry === 'low' ? 'tumble_dry_low' : dry === 'medium' ? 'tumble_dry_medium' : dry === 'high' ? 'tumble_dry_high' : 'tumble_dry_no_heat'
  const crossed = wash === 'do_not_wash' || wash === 'dry_clean_only'
  const washAnswer = checked && draft.method === 'machine' && first.maxTemperatureC !== null
    ? `${first.maxTemperatureC}°C${draft.bars === 1 ? ' · permanent press' : draft.bars === 2 ? ' · delicate' : ''}`
    : wash === null ? null : wash === 'unknown' ? careQuestionText.notOnTag : tubWords({ wash, dots: draft.dots, bars: draft.bars })
  const washValue = washAnswer !== null && draft.washWithLikeColors && wash !== 'do_not_wash' && wash !== 'dry_clean_only' ? `${washAnswer} · with like colors` : washAnswer
  return [
    { key: 'wash', label: careQuestionText.wash.cell, symbol: washSymbol, value: washValue, notAsked: false },
    { key: 'bleach', label: careQuestionText.bleach.cell, symbol: draft.bleach === 'any' ? 'bleach' : draft.bleach === 'non_chlorine' ? 'bleach_non_chlorine' : draft.bleach === 'none' ? 'do_not_bleach' : null, value: crossed || draft.bleach === null ? null : bleachWords[draft.bleach], notAsked: crossed },
    { key: 'dry', label: careQuestionText.dry.cell, symbol: drySymbol, value: crossed || dry === null ? null : dry === 'no_tumble' && draft.natural !== null ? careSymbolWords[naturalSymbol[draft.natural]] : dryerWords[dry], notAsked: crossed },
  ]
}

/** Three symbols across: each opens its own question. Shown on the Care tab. */
export function CareSymbolRow({ cells, onOpen }: { cells: readonly CareCell[]; onOpen: ((key: CareQuestion) => void) | null }) {
  return <ul aria-label={careQuestionText.rowLabel} className="m-0 grid list-none grid-cols-3 rounded-control bg-background p-0">
    {cells.map((cell) => {
      const inner = <>
        <span className="grid size-9 place-items-center" aria-hidden="true">{cell.symbol === null ? <UnknownSymbol size={30} /> : <CareSymbol kind={cell.symbol} size={30} decorative />}</span>
        <span className="text-[length:.875rem] font-semibold leading-[1.25] [overflow-wrap:anywhere]">{cell.notAsked ? '—' : cell.value ?? careQuestionText.notChecked}</span>
        <span className="flex items-center gap-0.5 text-[length:.75rem] text-ink-2">{cell.label}{onOpen === null || cell.notAsked ? null : <DesignIcon name="chevronRight" size="1em" strokeWidth={2.2} className="size-3" aria-hidden="true"  />}</span>
      </>
      const className = 'flex min-h-24 w-full flex-col items-center gap-1 border-0 bg-transparent px-1.5 pb-2.5 pt-3 text-center text-ink'
      return <li key={cell.key} className="[&+&]:[border-inline-start:1px_solid_var(--line)]">
        {onOpen === null || cell.notAsked
          ? <div className={className}>{inner}</div>
          : <button type="button" className={cn(className, 'cursor-pointer [&:active]:bg-surface-2 motion-safe:[transition:background-color_var(--dur-press)_var(--ease-out)]')} aria-label={`${cell.label}: ${cell.value ?? careQuestionText.notChecked}. Edit.`} onClick={() => onOpen(cell.key)}>{inner}</button>}
      </li>
    })}
  </ul>
}

// ---- One question -------------------------------------------------------------------

type Tile = { readonly id: string; readonly words: string; readonly description?: string; readonly symbol: CareSymbolKind | null; readonly on: boolean; readonly pick: (draft: TagDraft) => TagDraft }

const bleachOrder = ['any', 'non_chlorine', 'none', 'unknown'] as const satisfies readonly TagBleach[]
const bleachSymbol: Readonly<Record<TagBleach, CareSymbolKind | null>> = { any: 'bleach', non_chlorine: 'bleach_non_chlorine', none: 'do_not_bleach', unknown: null }
const dryerOrder = ['tumble', 'low', 'medium', 'high', 'no_heat', 'no_tumble', 'unknown'] as const satisfies readonly DryerAnswer[]
const dryerSymbol: Readonly<Record<DryerAnswer, CareSymbolKind | null>> = { tumble: 'tumble_dry', low: 'tumble_dry_low', medium: 'tumble_dry_medium', high: 'tumble_dry_high', no_heat: 'tumble_dry_no_heat', no_tumble: 'do_not_tumble_dry', unknown: null }
const naturalOrder = ['line', 'flat', 'drip'] as const satisfies readonly NaturalDrying[]
const naturalSymbolOf: Readonly<Record<NaturalDrying, CareSymbolKind>> = { line: 'line_dry', flat: 'dry_flat', drip: 'drip_dry' }

const tubMethod: Readonly<Record<TubAnswer, TagMethod>> = { machine: 'machine', hand_wash: 'hand_wash', do_not_wash: 'do_not_wash', dry_clean_only: 'dry_clean_only', unknown: 'no_tag' }

function tilesFor(question: Exclude<CareQuestion, 'wash'>, draft: TagDraft): readonly Tile[] {
  if (question === 'bleach') {
    const descriptions = { any: 'Empty triangle', non_chlorine: 'Two lines inside', none: 'Crossed out', unknown: 'No label, or it is unreadable' }
    return bleachOrder.map((value) => ({ id: `bleach-${value}`, words: bleachWords[value], description: descriptions[value], symbol: bleachSymbol[value], on: draft.bleach === value, pick: (current) => ({ ...current, bleach: value }) }))
  }
  const dryerTiles = dryerOrder.map((value): Tile => ({ id: `dry-${value}`, words: dryerWords[value], symbol: dryerSymbol[value], on: draft.dryer === value && (value !== 'no_tumble' || draft.natural === null), pick: (current) => ({ ...current, dryer: value, natural: null }) }))
  const naturalTiles = naturalOrder.map((value): Tile => ({ id: `natural-${value}`, words: careSymbolWords[naturalSymbolOf[value]], symbol: naturalSymbolOf[value], on: draft.dryer === 'no_tumble' && draft.natural === value, pick: (current) => ({ ...current, dryer: 'no_tumble', natural: value }) }))
  return [...dryerTiles.slice(0, -1), ...naturalTiles, dryerTiles.at(-1)!]
}

function Tiles({ label, tiles, onPick, disabled, compact = false }: { label: string; tiles: readonly Tile[]; onPick: (tile: Tile) => void; disabled?: (tile: Tile) => boolean; compact?: boolean }) {
  return <div className="min-w-0 [container-type:inline-size]"><div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2 [@container_(width_<_16rem)]:grid-cols-1">
    {tiles.filter((tile) => !disabled?.(tile) || tile.on).map((tile) => <button key={tile.id} type="button" role="radio" aria-checked={tile.on} disabled={disabled?.(tile)} onClick={() => onPick(tile)}
      className={cn(
        'relative flex cursor-pointer items-start gap-1.5 rounded-control border-solid bg-surface p-3 text-start text-ink disabled:cursor-not-allowed disabled:opacity-40',
        compact ? 'min-h-16 flex-row items-center gap-2' : cn('flex-col', tile.symbol === null ? 'min-h-[4.5rem]' : 'min-h-28'),
        'motion-safe:[transition:transform_var(--dur-press)_var(--ease-out),background-color_var(--dur-step)_var(--ease-out)] [&:active]:[transform:scale(.97)] motion-reduce:[&:active]:transform-none',
        tile.on ? 'border-2 border-link bg-accent' : 'border border-line',
        tile.symbol === null ? 'bg-transparent' : '',
      )}>
      <span className={cn('grid shrink-0 place-items-center', compact ? 'size-6' : 'size-9')} aria-hidden="true">{tile.symbol === null ? <UnknownSymbol size={compact ? 24 : 30} /> : <CareSymbol kind={tile.symbol} size={compact ? 24 : 30} decorative />}</span>
      <span className={cn('font-semibold leading-[1.25]', compact ? 'text-[length:var(--step-0)]' : 'text-[length:var(--step-1)]')}>{tile.words}</span>
      {tile.description === undefined ? null : <span className="text-[length:var(--step--1)] leading-[1.45] text-ink-2">{tile.description}</span>}
    </button>)}
  </div></div>
}

/** Shared label choices for intake and garment edits; unknown answers stay explicit. */
export function CareChoices({ question, draft, onChange, material }: { question: CareQuestion; draft: TagDraft; onChange: (next: TagDraft) => void; material?: string | null }) {
  // Keep the less common temperature/cycle combinations available in the existing wash controls.
  if (question === 'wash') return <TagRows material={material} only="wash" value={tagRows(draft)} onChange={({ wash, ...rest }) => onChange({ ...draft, ...rest, ...(wash === undefined ? {} : { method: wash === null ? null : tubMethod[wash] }) })} />
  return <>
    {tagChoiceProblem(material, question === 'bleach' ? { bleach: 'any' } : { dryer: 'high' }) === null ? null : <p className="m-0 text-ink-2">{question === 'bleach' ? 'Bleach can damage this fabric. Check the label and choose Do not bleach or Tag doesn’t say.' : 'For wool, tumble dry only if the label permits low or no heat. Higher heat can shrink it.'}</p>}
    <Tiles compact={question === 'dry'} label={careQuestionText[question].title} tiles={tilesFor(question, draft)} disabled={(tile) => { const next = tile.pick(draft); return tagChoiceProblem(material, question === 'bleach' ? { bleach: next.bleach } : { dryer: next.dryer }) !== null }} onPick={(tile) => onChange(tile.pick(draft))} />
  </>
}

/**
 * Pieces of a garment with one care record, asked one question at a time. Saving writes the whole
 * record the way the label step does: anything the label does not give is stored as "Tag doesn't
 * say", which stays unknown and fails closed.
 */
export function CareQuestionSheet({ name, kicker, question, members, save, onClose, onSaved }: {
  name: string
  kicker?: string
  question: CareQuestion
  members: readonly Textile[]
  save: (args: FunctionArgs<typeof api.inventory.answerTagQuestions>) => Promise<unknown>
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const start = tagDraftFromCare(members[0]?.care ?? null)
  const [draft, setDraft] = useState<TagDraft>(start)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const text = careQuestionText[question]
  const dirty = JSON.stringify(draft) !== JSON.stringify(start)
  const answered = question === 'wash' ? draft.method !== null : question === 'bleach' ? draft.bleach !== null : draft.dryer !== null
  const commit = async () => {
    if (pending || !answered) return
    // Unanswered questions are stored as "Tag doesn't say", never guessed.
    const answers = tagAnswers({ ...draft, method: draft.method ?? 'no_tag', bleach: draft.bleach ?? 'unknown', dryer: draft.dryer ?? 'unknown' })
    if (answers === null) return
    setPending(true)
    setError(null)
    try {
      await save({ textileIds: members.map((member) => member.textileId) as FunctionArgs<typeof api.inventory.answerTagQuestions>['textileIds'], ...answers })
      onSaved(careQuestionText.saved)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setPending(false)
    }
  }
  const garment = members[0]
  return <Sheet title={text.title} kicker={kicker ?? name} media={garment === undefined ? undefined : <GarmentIcon kind={garment.kind} colorGroup={garment.colorGroup} className="size-9" />} onClose={onClose} dirty={dirty} closeAtTop
    footer={<>
      <TaskFooter><Button size="lg" disabled={pending || !answered || !dirty} onClick={() => void commit()}>{pending ? 'Saving…' : careQuestionText.save}</Button></TaskFooter>
    </>}>
    {error === null ? null : <p role="alert" className="m-0 rounded-control bg-conflict-bg p-3 text-[length:.875rem] text-conflict-ink">{error}</p>}
    <p className="m-0 text-[length:var(--step-0)] leading-normal text-ink-2">{text.lead}</p>
    <fieldset disabled={pending} className="m-0 min-w-0 border-0 p-0" aria-label={text.title}>
      <CareChoices material={garment?.care?.material} question={question} draft={draft} onChange={setDraft} />
    </fieldset>
  </Sheet>
}
