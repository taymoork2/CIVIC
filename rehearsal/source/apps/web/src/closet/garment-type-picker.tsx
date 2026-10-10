import { cn } from '@/lib/utils'
import type { GarmentKind } from '@washcloset/planner'
import { useId, useState, type KeyboardEvent } from 'react'

import { kindTileWords } from '@/copy'
import { garmentSearchText } from '@/copy-closet'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { searchArticles } from '@/closet/garment-articles'
import { IconChoiceGrid } from '@/kit/icon-choice-grid'
import { GarmentIcon } from '@/kit/garment-icon'

/** A picked type: a plain tile has no article; "Add … as Other" carries the typed words. */
export type TypePick = { readonly kind: GarmentKind; readonly article: string | null; readonly typed?: string }

const typePickerClassName = cn(
  "garment-type-picker",
  "grid min-w-0 gap-3",
)

const typeResultsClassName = cn(
  "garment-type-results",
  "m-0 p-0 grid gap-2 list-none",
)

const typeResultClassName = cn(
  "garment-type-result",
  "flex w-full min-h-11 items-center gap-3 rounded-label bg-surface p-[var(--space-2)_var(--space-3)] text-start text-ink",
  "shadow-[inset_0_0_0_1px_var(--line)] cursor-[pointer]",
  "text-[length:var(--step-0)] leading-[1.25] [overflow-wrap:anywhere]",
  "focus-visible:[outline:3px_solid_var(--focus)] focus-visible:[outline-offset:2px]",
)

const typeResultArtClassName = cn(
  "garment-type-result-art",
  "grid flex-none place-items-center w-8",
)

const typeResultTextClassName = cn(
  "garment-type-result-text",
  "grid min-w-0 gap-[2px]",
)

const typeResultTypeClassName = cn(
  "garment-type-result-type",
  "text-ink-2 font-normal text-[length:var(--step--1)]",
)

/** The match count, for screen readers only: the list itself shows the results. */
const typeCountClassName = cn(
  "garment-type-count",
  "sr-only",
)

/**
 * The clothing type step, shared by intake and Edit: a search over specific articles above the type
 * tiles. Nothing typed shows the tiles; typing replaces them with matching articles, each with its
 * type's picture and word, or one "Add … as Other" when nothing matches.
 */
export function GarmentTypePicker({ labelledBy, kinds, value, onPick, initialQuery = '' }: {
  /** The heading that names the tiles. */
  labelledBy: string
  kinds: readonly GarmentKind[]
  value: GarmentKind | null
  onPick: (pick: TypePick) => void
  initialQuery?: string
}) {
  const id = useId()
  const [query, setQuery] = useState(initialQuery)
  const typed = query.trim()
  const results = searchArticles(typed, { baby: kinds.includes('baby_bodysuit') }).filter((article) => kinds.includes(article.kind))
  const other = kinds.includes('other')
  const pickFirst = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || typed === '') return
    // Enter picks the first match rather than submitting the step.
    event.preventDefault()
    const first = results[0]
    if (first !== undefined) onPick({ kind: first.kind, article: first.name })
    else if (other) onPick({ kind: 'other', article: null, typed })
  }
  return (
    <div className={typePickerClassName}>
      <Field>
        <FieldLabel htmlFor={`${id}-search`}>{garmentSearchText.label}</FieldLabel>
        <Input id={`${id}-search`} type="search" value={query} autoComplete="off" placeholder={garmentSearchText.placeholder} aria-controls={`${id}-results`} onChange={(event) => setQuery(event.target.value)} onKeyDown={pickFirst} />
      </Field>
      <p className={typeCountClassName} aria-live="polite">{typed === '' ? '' : garmentSearchText.matches(results.length)}</p>
      <div id={`${id}-results`}>
        {typed === '' ? (
          <div className="grid gap-4" aria-labelledby={labelledBy}>
            {[{ label: 'Clothing', kinds: kinds.filter((kind) => !['towel', 'sheets', 'other'].includes(kind)) }, { label: 'Household textiles', kinds: kinds.filter((kind) => kind === 'towel' || kind === 'sheets') }, { label: 'Other items', kinds: kinds.filter((kind) => kind === 'other') }].filter((group) => group.kinds.length > 0).map((group) => <IconChoiceGrid key={group.label} label={group.label} columns={4} value={value}
              options={group.kinds.map((kind) => ({ value: kind, label: kindTileWords[kind], art: <GarmentIcon kind={kind} className="size-8" /> }))}
              onPick={(kind) => onPick({ kind, article: null })} />)}
          </div>
        ) : results.length > 0 ? (
          <ul className={typeResultsClassName} aria-labelledby={labelledBy}>
            {results.map((article) => <li key={article.name}>
              <Button type="button" variant="unstyled" size="unstyled" className={typeResultClassName} aria-label={garmentSearchText.result(article.name, kindTileWords[article.kind])} onClick={() => onPick({ kind: article.kind, article: article.name })}>
                <span className={typeResultArtClassName}><GarmentIcon kind={article.kind} className="size-8" /></span>
                <span className={typeResultTextClassName}>
                  <span className="font-semibold">{article.name}</span>
                  <span className={typeResultTypeClassName}>{kindTileWords[article.kind]}</span>
                </span>
              </Button>
            </li>)}
          </ul>
        ) : other ? (
          <Button type="button" variant="unstyled" size="unstyled" className={typeResultClassName} onClick={() => onPick({ kind: 'other', article: null, typed })}>
            <span className={typeResultArtClassName}><GarmentIcon kind="other" className="size-8" /></span>
            <span className="font-semibold">{garmentSearchText.asOther(typed)}</span>
          </Button>
        ) : null}
      </div>
    </div>
  )
}
