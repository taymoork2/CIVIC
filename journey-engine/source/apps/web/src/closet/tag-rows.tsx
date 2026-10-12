import { Button, buttonVariants } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { tagTemperatures, type TagTemperature } from '@washcloset/planner'
import { useId, useState } from 'react'

import { CareSymbol, type CareSymbolKind } from '@/closet/care-symbols'
import { careSymbolWords, tagText } from '@/copy'
import { materialCareProblem } from '@washcloset/planner'
import type { TagAnswers, TagBleach } from '@/laundry/tag-step'
import { choiceChipVariants } from '@/kit/ui'

/**
 * The tag asked as its symbols, one row per symbol: the washtub, the bleach triangle, the dryer
 * square, then iron and steam. Shared by bulk add and the one-at-a-time tag step,
 * so both show the same tiles and the same words.
 */

const bulkRowClassName = cn(
  "bulk-row",
  "grid min-w-0 gap-2 [container-type:inline-size]",
)

const bulkRowLabelClassName = cn(
  "bulk-row-label",
  "font-semibold",
)

const bulkChoicesClassName = cn(
  "bulk-choices",
  "grid grid-cols-[repeat(2,_minmax(0,_1fr))] gap-2",
  "[@container_(width_<_16rem)]:grid-cols-1",
)

const secondaryButtonClassName = cn(
  buttonVariants({ variant: 'outline', size: 'sm' }),
  "[&.danger]:text-destructive",
)

const bulkMoreClassName = cn(
  "bulk-more",
  "[justify-self:start]",
)

const bulkHintClassName = cn(
  "bulk-hint",
  "text-ink-2",
  "text-[length:var(--step-0)]",
  "[.machine-he_&]:flex [.machine-he_&]:items-center [.machine-he_&]:gap-2",
)

export type TubAnswer = 'machine' | 'hand_wash' | 'do_not_wash' | 'dry_clean_only' | 'unknown'
/** Dots in the tub: none, then 1 cold to 4 very hot. */
export type TubDots = 0 | 1 | 2 | 3 | 4
/** Bars under the tub: none, 1 permanent press, 2 gentle. */
export type TubBars = 0 | 1 | 2
/** The dryer square as tapped. */
export type DryerAnswer = 'tumble' | 'low' | 'medium' | 'high' | 'no_heat' | 'no_tumble' | 'unknown'
/** How a garment that may not be tumbled dries instead. */
export type NaturalDrying = 'line' | 'flat' | 'drip'
/** The iron on the tag, kept for the care guide. */
export type IronAnswer = 'low' | 'medium' | 'high' | 'no' | 'unknown'

/** The rows as answered. Null is not tapped yet; "Tag doesn't say" is `unknown`. */
export type TagRowsValue = {
  readonly wash: TubAnswer | null
  /** The tub's dots and bars; read only for a machine tub. */
  readonly dots: TubDots
  readonly bars: TubBars
  /** A recorded numeric wash limit that dots cannot express, including hand-wash limits. */
  readonly maxTemperatureC?: number
  readonly washWithLikeColors?: boolean
  readonly bleach: TagBleach | null
  readonly dryer: DryerAnswer | null
  /** Read only when the dryer square is crossed out; unanswered is "do not tumble dry" alone. */
  readonly natural: NaturalDrying | null
  /** Optional. `allowed` is recorded care that may be ironed with no dots kept: no tile shows it, and it is stored again as it was. */
  readonly iron: IronAnswer | 'allowed'
  /** Explicit steam wording; iron dots alone grant no steam permission. */
  readonly steamPermission?: 'allowed' | 'not_allowed' | 'unknown'
}

/** What a tap changes: the rows only ever set an iron tile. */
export type TagRowsPatch = Partial<Omit<TagRowsValue, 'iron'> & { readonly iron: IronAnswer }>

/** Check the proposed choice independently so an old conflicting answer can be corrected. */
export function tagChoiceProblem(material: string | null | undefined, patch: TagRowsPatch): string | null {
  return materialCareProblem(material, {
    washMethod: patch.wash,
    cycle: patch.bars === undefined ? undefined : barsCycle[patch.bars],
    maxTemperatureC: patch.maxTemperatureC ?? (patch.dots === undefined ? undefined : patch.dots === 0 ? 95 : tagTemperatures[dotsWater[patch.dots]]),
    bleach: patch.bleach,
    dryMethod: patch.dryer === undefined ? undefined : ['tumble', 'low', 'medium', 'high', 'no_heat'].includes(patch.dryer ?? '') ? 'tumble_dry' : undefined,
    dryHeat: patch.dryer,
    ironHeat: patch.iron,
  })
}

/** A row an unanswered form waits on, as named by the row's `data-need`. */
export type TagNeed = 'wash' | 'bleach' | 'dryer'

const notOnTag = tagText.notOnTag

/** The tub symbol for dots and bars: "wash", "wash_1", "wash_1_delicate", "wash_permanent_press". */
export function tubSymbol(dots: TubDots, bars: TubBars): CareSymbolKind {
  const cycle = bars === 1 ? 'permanent_press' : 'delicate'
  if (dots === 0) return bars === 0 ? 'wash' : `wash_${cycle}`
  return bars === 0 ? `wash_${dots}` : `wash_${dots}_${cycle}`
}

/** One tile of the washtub grid: what it stores and what it shows. */
type TubTile = { readonly wash: TubAnswer; readonly dots: TubDots; readonly bars: TubBars; readonly words: string }

/** The washtub grid, the common tubs first; rarer dots and bars are under "Something else". */
export const tubTiles: readonly TubTile[] = [
  { wash: 'machine', dots: 0, bars: 0, words: tagText.tubTiles[0]! },
  { wash: 'machine', dots: 1, bars: 0, words: tagText.tubTiles[1]! },
  { wash: 'machine', dots: 2, bars: 0, words: tagText.tubTiles[2]! },
  { wash: 'machine', dots: 3, bars: 0, words: tagText.tubTiles[3]! },
  { wash: 'machine', dots: 1, bars: 1, words: tagText.tubTiles[4]! },
  { wash: 'machine', dots: 1, bars: 2, words: tagText.tubTiles[5]! },
  { wash: 'hand_wash', dots: 0, bars: 0, words: careSymbolWords.hand_wash },
  { wash: 'do_not_wash', dots: 0, bars: 0, words: careSymbolWords.do_not_wash },
  // The professional-care circle: the tag sends it to a cleaner rather than a washer.
  { wash: 'dry_clean_only', dots: 0, bars: 0, words: tagText.dryCleanOnly },
  { wash: 'unknown', dots: 0, bars: 0, words: notOnTag },
]

const tileSymbol = (tile: TubTile): CareSymbolKind | null =>
  tile.wash === 'machine' ? tubSymbol(tile.dots, tile.bars) : tile.wash === 'unknown' ? null : tile.wash === 'dry_clean_only' ? 'dry_clean_p' : tile.wash

/** Whether a tile is the tub as answered; the hand, crossed tub and no answer have no dots or bars. */
const tileMatches = (tile: TubTile, wash: TubAnswer | null, dots: TubDots, bars: TubBars) =>
  tile.wash === wash && (wash !== 'machine' || (tile.dots === dots && tile.bars === bars))

type TubRows = Pick<TagRowsValue, 'wash' | 'dots' | 'bars' | 'maxTemperatureC' | 'washWithLikeColors'>

/** A machine tub the grid has no tile for, so the dots and bars rows show it. */
export const rareTub = (rows: TubRows) =>
  rows.wash === 'machine' && !tubTiles.some((tile) => tileMatches(tile, rows.wash, rows.dots, rows.bars))

/** The washtub in words: its tile's words, or the symbol's own words for a tub the grid has no tile for. */
export function tubWords(rows: TubRows): string | null {
  if (rows.wash === null) return null
  if (rows.wash === 'dry_clean_only') return tagText.dryCleanOnly
  const words = rows.maxTemperatureC !== undefined && (rows.wash === 'machine' || rows.wash === 'hand_wash')
    ? `${rows.wash === 'hand_wash' ? 'Hand wash' : barsWords[rows.bars]} · ${rows.maxTemperatureC} °C maximum`
    : tubTiles.find((tile) => tileMatches(tile, rows.wash, rows.dots, rows.bars))?.words ?? careSymbolWords[tubSymbol(rows.dots, rows.bars)]
  return rows.washWithLikeColors && asksWashing(rows.wash) ? `${words} · with like colors` : words
}

const tubDots = [0, 1, 2, 3, 4] as const satisfies readonly TubDots[]
const dotsWords: Readonly<Record<TubDots, string>> = tagText.dots
const tubBars = [0, 1, 2] as const satisfies readonly TubBars[]
const barsWords: Readonly<Record<TubBars, string>> = tagText.bars
/** The dots as the tag's water limit, in the values the tag answers accept. */
const dotsWater: Readonly<Record<Exclude<TubDots, 0>, TagTemperature>> = { 1: 'cold', 2: 'warm', 3: 'hot', 4: 'very_hot' }
/** The bars as the cycle names the tag answers store. */
const barsCycle = { 0: 'normal', 1: 'permanent_press', 2: 'delicate' } as const satisfies Record<TubBars, string>

const bleaches = ['any', 'non_chlorine', 'none', 'unknown'] as const satisfies readonly TagBleach[]
const bleachSymbols: Readonly<Record<TagBleach, CareSymbolKind | null>> = { any: 'bleach', non_chlorine: 'bleach_non_chlorine', none: 'do_not_bleach', unknown: null }
export const bleachWords: Readonly<Record<TagBleach, string>> = { any: careSymbolWords.bleach, non_chlorine: careSymbolWords.bleach_non_chlorine, none: careSymbolWords.do_not_bleach, unknown: notOnTag }

const dryers = ['tumble', 'low', 'medium', 'high', 'no_heat', 'no_tumble', 'unknown'] as const satisfies readonly DryerAnswer[]
const dryerSymbols: Readonly<Record<DryerAnswer, CareSymbolKind | null>> = {
  tumble: 'tumble_dry', low: 'tumble_dry_low', medium: 'tumble_dry_medium', high: 'tumble_dry_high', no_heat: 'tumble_dry_no_heat', no_tumble: 'do_not_tumble_dry', unknown: null,
}
export const dryerWords: Readonly<Record<DryerAnswer, string>> = {
  tumble: tagText.dryer.tumble, low: tagText.dryer.low, medium: tagText.dryer.medium, high: 'High heat', no_heat: tagText.dryer.no_heat, no_tumble: careSymbolWords.do_not_tumble_dry, unknown: notOnTag,
}

const naturals = ['line', 'flat', 'drip'] as const satisfies readonly NaturalDrying[]
const naturalSymbols: Readonly<Record<NaturalDrying, CareSymbolKind>> = { line: 'line_dry', flat: 'dry_flat', drip: 'drip_dry' }
const naturalWords: Readonly<Record<NaturalDrying, string>> = { line: careSymbolWords.line_dry, flat: careSymbolWords.dry_flat, drip: careSymbolWords.drip_dry }

const irons = ['low', 'medium', 'high', 'no', 'unknown'] as const satisfies readonly IronAnswer[]
const ironSymbols: Readonly<Record<IronAnswer, CareSymbolKind | null>> = { low: 'iron_low', medium: 'iron_medium', high: 'iron_high', no: 'do_not_iron', unknown: null }
const ironWords: Readonly<Record<IronAnswer, string>> = { low: careSymbolWords.iron_low, medium: careSymbolWords.iron_medium, high: careSymbolWords.iron_high, no: careSymbolWords.do_not_iron, unknown: notOnTag }

/** Neither a crossed tub nor an explicitly recorded dry-clean-only instruction permits washing. */
export const asksWashing = (wash: TubAnswer | null) => wash !== 'do_not_wash' && wash !== 'dry_clean_only'

/**
 * The tag rows as stored care. "Tag doesn't say" is left out, so it stays unknown and fails closed
 * (the load washes cold, the garment hangs, and no bleach goes in on the tag's word). The crossed
 * tub prohibits washing without granting professional-cleaning permission. The tub's dots are the water limit and its
 * bars the cycle; a tub with no dots leaves the water unknown. Iron dots retain an iron heat limit.
 * Null until every row that applies is answered.
 */
export function tagRowsAnswers(rows: TagRowsValue): TagAnswers | null {
  const { wash, dots, bars, bleach, dryer, natural, iron } = rows
  if (wash === null) return null
  const ironing = {
    ...(rows.washWithLikeColors === undefined ? {} : { washWithLikeColors: rows.washWithLikeColors }),
    ...(iron === 'unknown' ? {} : { ironSteam: iron === 'no' ? 'not_allowed' as const : 'allowed' as const }),
    ...(iron === 'low' || iron === 'medium' || iron === 'high' ? { ironHeat: iron } : {}),
    ...(rows.steamPermission === undefined || rows.steamPermission === 'unknown' ? {} : { steamPermission: rows.steamPermission }),
  }
  if (wash === 'do_not_wash' || wash === 'dry_clean_only') return { washMethod: wash, ...ironing }
  if (bleach === null || dryer === null) return null
  const bleaching = bleach === 'unknown' ? {} : { bleach }
  const drying = dryer === 'tumble' ? { dryMethod: 'tumble_dry' as const }
    : dryer === 'low' || dryer === 'medium' || dryer === 'high' || dryer === 'no_heat' ? { dryMethod: 'tumble_dry' as const, dryHeat: dryer }
    : dryer === 'no_tumble' ? { dryMethod: natural === 'line' ? 'line_dry' as const : natural === 'flat' ? 'dry_flat' as const : natural === 'drip' ? 'drip_dry' as const : 'do_not_tumble_dry' as const }
    : {}
  const temperature = rows.maxTemperatureC ?? (wash === 'machine' && dots !== 0 ? tagTemperatures[dotsWater[dots]] : undefined)
  const water = asksWashing(wash) && wash !== 'unknown' && temperature !== undefined ? { maxTemperatureC: temperature } : {}
  if (wash !== 'machine') return { washMethod: wash, ...water, ...bleaching, ...drying, ...ironing }
  return {
    washMethod: 'machine',
    ...water,
    cycle: barsCycle[bars],
    ...bleaching,
    ...drying,
    ...ironing,
  }
}

// ---- The rows ------------------------------------------------------------------------

/** "Tag doesn't say": a plain tag outline with a question mark, in place of a care symbol. */
function NoSymbol() {
  return (
    <svg viewBox="0 0 32 32" width={32} height={32} fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" focusable="false" aria-hidden="true">
      <path d="M6 4h20v24H6z" strokeDasharray="3 3" />
      <path d="M12.5 12.5a3.5 3.5 0 1 1 5 3.2c-1 .5-1.5 1.2-1.5 2.3M16 22v.5" />
    </svg>
  )
}

/** One tag answer: the symbol as printed on the tag, above its words. */
function SymbolTile({ symbol, words, pressed, onPick, disabled = false }: { symbol: CareSymbolKind | null; words: string; pressed: boolean; onPick: () => void; disabled?: boolean }) {
  return (
    <Toggle type="button" className={choiceChipVariants({ variant: 'symbol' })} pressed={pressed} onClick={onPick} disabled={disabled}>
      {symbol === null ? <NoSymbol /> : <CareSymbol kind={symbol} decorative />}
      <span>{words}</span>
    </Toggle>
  )
}

/** A row of symbol tiles, two across. */
function SymbolRow<Value extends string | number>({ label, options, pressed, symbols, words, onPick, need, disabled }: {
  label: string
  options: readonly Value[]
  pressed: (value: Value) => boolean
  symbols: (value: Value) => CareSymbolKind | null
  words: (value: Value) => string
  onPick: (value: Value) => void
  /** The row a form waits on, for scrolling to it. */
  need?: TagNeed
  disabled?: (value: Value) => boolean
}) {
  const id = useId()
  return (
    <div className={bulkRowClassName} role="group" aria-labelledby={id} data-need={need}>
      <p id={id} className={bulkRowLabelClassName}>{label}</p>
      <div className={bulkChoicesClassName}>
        {options.filter((option) => !disabled?.(option) || pressed(option)).map((option) => (
          <SymbolTile key={option} symbol={symbols(option)} words={words(option)} pressed={pressed(option)} onPick={() => onPick(option)} disabled={disabled?.(option)} />
        ))}
      </div>
    </div>
  )
}

/**
 * The tag as its symbols, one row per symbol: the washtub (a grid of the common tubs, with "Something
 * else" for other dots and bars), the bleach triangle and the dryer square, then the natural drying
 * when the square is crossed out, and the iron under "More on the tag".
 */
/** One question of the tag at a time: the washtub, the bleach triangle, the dryer square (with how it dries instead), or the extras. */
export type TagQuestion = 'wash' | 'bleach' | 'dryer' | 'more'

export function TagRows({ value, onChange, only, material }: { value: TagRowsValue; onChange: (patch: TagRowsPatch) => void; only?: TagQuestion; material?: string | null }) {
  const [rareOpen, setRareOpen] = useState(false)
  const rare = rareTub(value)
  const showRare = rareOpen || rare
  const machine = value.wash === 'machine'
  const shows = (question: TagQuestion) => only === undefined || only === question
  return (
    <>
      {shows('wash') ? <>
      {tagChoiceProblem(material, { wash: 'machine', bars: 0 }) === null ? null : <p className={bulkHintClassName}>Machine-wash wool only if its label allows a gentle wool or delicate cycle. Heat and vigorous cycles can shrink it.</p>}
      {value.wash === 'dry_clean_only' ? <p className={bulkHintClassName}>Recorded instruction: Dry clean only</p> : null}
      {value.maxTemperatureC === undefined ? null : <p className={bulkHintClassName}>Recorded wash limit: {value.maxTemperatureC} °C</p>}
      <SymbolRow label={tagText.washtub} need="wash" options={tubTiles.map((_, index) => index)}
        pressed={(index) => value.maxTemperatureC === undefined && tileMatches(tubTiles[index]!, value.wash, value.dots, value.bars)}
        symbols={(index) => tileSymbol(tubTiles[index]!)} words={(index) => tubTiles[index]!.words}
        disabled={(index) => tagChoiceProblem(material, tubTiles[index]!) !== null}
        onPick={(index) => onChange({ wash: tubTiles[index]!.wash, dots: tubTiles[index]!.dots, bars: tubTiles[index]!.bars, maxTemperatureC: undefined })} />
      {rare ? null : (
        <Button variant="unstyled" size="unstyled" type="button" className={cn(secondaryButtonClassName, bulkMoreClassName)} aria-expanded={showRare} onClick={() => setRareOpen(!showRare)}>{tagText.somethingElse}</Button>
      )}
      {showRare ? (
        <>
          <SymbolRow label={tagText.tubDots} options={tubDots} pressed={(dots) => machine && value.maxTemperatureC === undefined && value.dots === dots}
            symbols={(dots) => tubSymbol(dots, 0)} words={(dots) => dotsWords[dots]}
            disabled={(dots) => tagChoiceProblem(material, { wash: 'machine', dots }) !== null}
            onPick={(dots) => onChange({ wash: 'machine', dots, bars: machine ? value.bars : 0, maxTemperatureC: undefined })} />
          <SymbolRow label={tagText.tubBars} options={tubBars} pressed={(bars) => machine && value.bars === bars}
            symbols={(bars) => tubSymbol(0, bars)} words={(bars) => barsWords[bars]}
            disabled={(bars) => tagChoiceProblem(material, { wash: 'machine', bars }) !== null}
            onPick={(bars) => onChange({ wash: 'machine', bars, dots: machine ? value.dots : 0 })} />
        </>
      ) : null}
      {asksWashing(value.wash) ? <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <Checkbox checked={value.washWithLikeColors === true} onCheckedChange={(checked) => onChange({ washWithLikeColors: checked === true })} />
        <span>Wash with like colors</span>
      </label> : null}
      </> : null}
      {asksWashing(value.wash) && (shows('bleach') || shows('dryer')) ? (
        <>
          {shows('bleach') ? <SymbolRow label={tagText.bleach} need="bleach" options={bleaches} pressed={(bleach) => value.bleach === bleach}
            symbols={(bleach) => bleachSymbols[bleach]} words={(bleach) => bleachWords[bleach]} disabled={(bleach) => tagChoiceProblem(material, { bleach }) !== null} onPick={(bleach) => onChange({ bleach })} /> : null}
          {shows('dryer') ? <SymbolRow label={tagText.dryerSquare} need="dryer" options={dryers} pressed={(dryer) => value.dryer === dryer}
            symbols={(dryer) => dryerSymbols[dryer]} words={(dryer) => dryerWords[dryer]} disabled={(dryer) => tagChoiceProblem(material, { dryer }) !== null} onPick={(dryer) => onChange({ dryer })} /> : null}
          {shows('dryer') && value.dryer === 'no_tumble' ? (
            <SymbolRow label={tagText.naturalDrying} options={naturals} pressed={(natural) => value.natural === natural}
              symbols={(natural) => naturalSymbols[natural]} words={(natural) => naturalWords[natural]} onPick={(natural) => onChange({ natural })} />
          ) : null}
        </>
      ) : null}
      {only === undefined || only === 'more' ? (
        <>
          {tagChoiceProblem(material, { iron: 'high' }) === null ? null : <p className={bulkHintClassName}>High iron heat can damage wool. Check the iron symbol on the label.</p>}
          <SymbolRow label={tagText.iron} options={irons} pressed={(iron) => value.iron === iron}
            symbols={(iron) => ironSymbols[iron]} words={(iron) => ironWords[iron]} disabled={(iron) => tagChoiceProblem(material, { iron }) !== null} onPick={(iron) => onChange({ iron })} />
          <SymbolRow label="Steam instruction on the label" options={['allowed', 'not_allowed', 'unknown'] as const}
            pressed={(answer) => (value.steamPermission ?? 'unknown') === answer} symbols={(answer) => answer === 'allowed' ? 'steam' : answer === 'not_allowed' ? 'do_not_steam' : null}
            words={(answer) => answer === 'allowed' ? 'Steam allowed' : answer === 'not_allowed' ? 'Do not steam' : notOnTag}
            onPick={(steamPermission) => onChange({ steamPermission })} />
        </>
      ) : null}
    </>
  )
}
