import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import { DesignIcon } from '@/kit/design-icons'


/**
 * Presentation pieces the Closet, the garment record and the add-garment steps share, shaped like
 * the design's blocks: a search field, a segmented control, chips, a section head, a fact list, a
 * stepper and a swatch grid. They carry no care or planning logic; callers decide what they mean.
 */

/** Colour words people type, as a small dot beside a garment. Unknown words get no dot rather than a guess. */
const colourDots: Readonly<Record<string, string>> = {
  white: '#ffffff', 'off-white': '#f5f1e6', ivory: '#f5f1e6', cream: '#f2ead6', beige: '#dccfb3', tan: '#c9b18a', khaki: '#b7a67c', sand: '#d9c9a6',
  grey: '#9a9a96', gray: '#9a9a96', heather: '#b8b8b4', charcoal: '#4a4d52', black: '#1d1d1d', navy: '#1f2a4e', blue: '#3a64c8', denim: '#4b6a9b',
  red: '#c8485a', burgundy: '#6e1f2e', pink: '#e7a3b4', orange: '#e0862e', yellow: '#e6c24a', green: '#6f8669', olive: '#6b6f3a', teal: '#2f7a7a',
  purple: '#6f57cb', lilac: '#c9b8e6', brown: '#8a6a4a',
}

export function colourDot(color: string | null | undefined): string | undefined {
  const words = (color ?? '').toLowerCase().split(/[^a-z-]+/).filter(Boolean)
  for (const word of [...words].reverse()) if (colourDots[word] !== undefined) return colourDots[word]
  return undefined
}

/** A tappable choice: 44px, radius 16, a 1px line; selected takes the accent line and the selected fill. */
export const chipClassName = 'inline-flex min-h-11 flex-none cursor-pointer items-center gap-2 whitespace-nowrap rounded-control border border-solid border-line bg-surface px-3.5 text-[length:var(--step-0)] font-semibold text-ink motion-safe:[transition:transform_var(--dur-press)_var(--ease-out),background-color_var(--dur-step)_var(--ease-out)] [&:active]:[transform:scale(.96)] motion-reduce:[&:active]:transform-none aria-pressed:border-link aria-pressed:bg-accent aria-checked:border-link aria-checked:bg-accent [&:disabled]:opacity-45'

export function Chip({ pressed, role, onClick, disabled, swatch, className, children }: { pressed: boolean; role?: 'radio' | 'checkbox'; onClick: () => void; disabled?: boolean; swatch?: string; className?: string; children: ReactNode }) {
  const state = role === undefined ? { 'aria-pressed': pressed } : { role, 'aria-checked': pressed }
  return <button type="button" className={cn(chipClassName, className)} disabled={disabled} onClick={onClick} {...state}>
    {swatch === undefined ? null : <span className="size-3.5 rounded-full border border-solid border-line" style={{ background: swatch }} aria-hidden="true" />}
    {children}
  </button>
}

/** A titled group of chips that wrap, with an optional line of hint under the title. */
export function ChipGroup({ title, hint, multi = false, children }: { title: string; hint?: string | null; multi?: boolean; children: ReactNode }) {
  return <div className="grid gap-2">
    <span className="text-[length:var(--step-1)] font-semibold">{title}</span>
    {hint ? <span className="text-[length:var(--step--1)] leading-[1.45] text-ink-2">{hint}</span> : null}
    <div role={multi ? 'group' : 'radiogroup'} aria-label={title} className="flex flex-wrap gap-2">{children}</div>
  </div>
}

/** A horizontally scrolling row of chips, bleeding to the page edge. */
export function ChipScroller({ label, children }: { label: string; children: ReactNode }) {
  return <div role="group" aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">{children}</div>
}

/** The segmented control: 3px inset, 42px segments, the selected one raised on the surface. */
export function Segmented<Value extends string>({ label, value, options, onChange, tabs = false }: {
  label: string
  value: Value
  options: readonly { value: Value; label: string }[]
  onChange: (value: Value) => void
  /** Tabs switch a panel; otherwise the control is a single choice. */
  tabs?: boolean
}) {
  return <div role={tabs ? 'tablist' : 'radiogroup'} aria-label={label} className="flex rounded-control bg-surface-2 p-[3px]">
    {options.map((option) => <button key={option.value} type="button" role={tabs ? 'tab' : 'radio'} {...(tabs ? { 'aria-selected': value === option.value } : { 'aria-checked': value === option.value })}
      className="min-h-11 min-w-0 flex-1 cursor-pointer rounded-[13px] border-0 bg-transparent px-2 text-[length:.875rem] font-semibold text-ink [overflow-wrap:anywhere] aria-checked:bg-surface aria-checked:shadow-[var(--e1)] aria-selected:bg-surface aria-selected:shadow-[var(--e1)] motion-safe:[transition:background-color_var(--dur-step)_var(--ease-out)]"
      onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>
}

/** The search field: 48px, radius 14, on the secondary fill. */
export function SearchField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return <label className="flex min-w-0 min-h-12 items-center gap-2.5 rounded-field bg-surface-2 px-3.5 text-ink-2 focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-ring">
    <DesignIcon name="search" size="1em" strokeWidth={2.2} className="size-5 flex-none" aria-hidden="true"  />
    <input type="search" aria-label={label} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)}
      className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[length:var(--step-1)] text-ink outline-none placeholder:text-ink-2" />
  </label>
}

/** A section: a 20px heading with a caption at the end, then its card. */
export function SectionHead({ title, caption, id }: { title: string; caption?: string; id?: string }) {
  return <div className="flex flex-wrap items-baseline justify-between gap-2">
    <h2 id={id} className="m-0 text-[length:var(--step-2)] font-semibold">{title}</h2>
    {caption === undefined ? null : <span className="text-[length:var(--step--1)] text-ink-2">{caption}</span>}
  </div>
}

/** A fact list: rows of "label … value", each editable one with a chevron. */
export function Facts({ rows, label }: { rows: readonly { key: string; label: string; value: ReactNode; onEdit?: () => void }[]; label?: string }) {
  return <ul aria-label={label} className="m-0 list-none rounded-control bg-background p-0">
    {rows.map((row) => <li key={row.key} className="relative [&+&]:before:pointer-events-none [&+&]:before:absolute [&+&]:before:inset-x-3.5 [&+&]:before:top-0 [&+&]:before:h-px [&+&]:before:bg-line [&+&]:before:content-['']">
      {row.onEdit === undefined
        ? <div className="flex min-h-11 items-center justify-between gap-3 px-3.5 py-2.5 text-[length:var(--step-0)] leading-normal"><span className="text-ink-2">{row.label}</span><span className="min-w-0 text-end font-semibold [overflow-wrap:anywhere]">{row.value}</span></div>
        : <button type="button" onClick={row.onEdit} aria-label={typeof row.value === 'string' ? `${row.label}: ${row.value}. Edit.` : `${row.label}. Edit.`} className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent px-3.5 py-2.5 text-start text-[length:var(--step-0)] leading-normal text-ink [&:active]:bg-surface-2 [@media_(hover:_hover)_and_(pointer:_fine)]:hover:bg-surface-2 focus-visible:outline-offset-[-3px] [li:first-child_&]:rounded-t-control [li:last-child_&]:rounded-b-control">
          <span className="text-ink-2">{row.label}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-end font-semibold"><span className="[overflow-wrap:anywhere]">{row.value}</span><DesignIcon name="chevronRight" size="1em" strokeWidth={2.2} className="size-4 flex-none text-ink-2" aria-hidden="true"  /></span>
        </button>}
    </li>)}
  </ul>
}

/** The stepper row: a label, minus, the count, plus; 44px buttons on the secondary fill. */
export function CountRow({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const button = 'grid size-11 cursor-pointer place-items-center rounded-control border-0 bg-surface-2 text-[length:var(--step-2)] font-semibold text-ink [&:disabled]:opacity-35'
  return <div className="flex min-h-14 items-center justify-between gap-3">
    <span className="text-[length:var(--step-1)] font-semibold">{label}</span>
    <span className="flex flex-none items-center gap-1">
      <button type="button" aria-label="Fewer" className={button} disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <span className="min-w-7 text-center text-[length:var(--step-1)] font-semibold tabular-nums" aria-live="polite" aria-label={`${label}: ${value}`}>{value}</span>
      <button type="button" aria-label="More" className={button} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </span>
  </div>
}

/**
 * Whose a piece is, as the colour grid's circles: a person's initial, a house for shared things, a plus to
 * add someone. One short row for one person; a big family wraps to more rows instead of a long segment.
 */
export function PersonChoices({ label, options, value, onPick }: {
  label: string
  options: readonly { readonly value: string; readonly label: string; readonly mark: ReactNode }[]
  value: string
  onPick: (value: string) => void
}) {
  return <div role="radiogroup" aria-label={label} className="grid grid-cols-[repeat(auto-fill,minmax(4rem,1fr))] gap-x-1 gap-y-1">
    {options.map((option) => {
      const chosen = option.value === value
      return <button key={option.value} type="button" role="radio" aria-checked={chosen} onClick={() => onPick(option.value)} className="flex min-h-[72px] min-w-0 cursor-pointer flex-col items-center gap-1.5 rounded-control border-0 bg-transparent px-0 py-1 text-ink">
        <span className={cn('box-content grid size-11 place-items-center rounded-full p-0.5 shadow-[0_0_0_3px_transparent]', chosen ? 'shadow-[0_0_0_3px_var(--accent)]' : '')}>
          <span className={cn('grid size-11 place-items-center rounded-full text-[length:var(--step-1)] font-semibold', chosen ? 'bg-accent' : 'bg-muted')} aria-hidden="true">{option.mark}</span>
        </span>
        <span className="line-clamp-2 w-full text-center text-[length:var(--step--1)] font-semibold leading-tight [overflow-wrap:anywhere]">{option.label}</span>
      </button>
    })}
  </div>
}

/** One swatch of the colour grid: a 44px circle, ringed when chosen, its word under it. */
export function Swatch({ label, fill, chosen, dashed = false, onPick }: { label: string; fill: string; chosen: boolean; dashed?: boolean; onPick: () => void }) {
  return <button type="button" role="radio" aria-checked={chosen} onClick={onPick} className="flex min-h-[72px] cursor-pointer flex-col items-center gap-1.5 rounded-control border-0 bg-transparent px-0 py-1 text-ink">
    <span className={cn('relative box-content size-11 rounded-full p-0.5 shadow-[0_0_0_3px_transparent]', chosen ? 'shadow-[0_0_0_3px_var(--accent)]' : '')}>
      <span className={cn('block size-11 rounded-full border border-solid', dashed ? 'border-dashed border-ink-2' : 'border-line')} style={{ background: fill }} />
    </span>
    <span className="text-center text-[length:var(--step--1)] font-semibold">{label}</span>
  </button>
}
