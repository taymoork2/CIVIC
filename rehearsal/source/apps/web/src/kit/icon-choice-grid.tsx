import { Toggle } from '@/components/ui/toggle'
import { cn } from '@/lib/utils'
import { useId, type CSSProperties, type ReactNode } from 'react'

/**
 * Choices people recognize by sight — clothing type, product form — as tiles: a picture above a short
 * visible label. Short answers stay chips and answers that need a sentence stay cards; this is only
 * for categories with recognizable art. The pressed tile is tinted and its outline thickens, so the choice
 * never depends on color alone, and each tile's accessible name is its visible label.
 */
export type IconChoice<Value extends string> = { value: Value; label: string; art: ReactNode }

const iconChoiceGroupClassName = cn(
  "icon-choice-group",
  "grid min-w-0 gap-2",
)

const iconChoiceLegendClassName = cn(
  "icon-choice-legend",
  "font-semibold text-ink",
)

/**
 * Up to `--icon-choice-columns` across. Each tile keeps a rem floor, so enlarged text drops a column
 * instead of squeezing the labels.
 */
const iconChoiceGridClassName = cn(
  "icon-choice-grid",
  "grid gap-2",
  "[grid-template-columns:repeat(auto-fill,minmax(max(4.5rem,calc((100%_-_(var(--icon-choice-columns)_-_1)_*_0.5rem)_/_var(--icon-choice-columns))),1fr))]",
)

const iconChoiceTileClassName = cn(
  "icon-choice-tile",
  "relative grid min-w-0 min-h-[76px] content-center justify-items-center gap-[2px] p-[var(--space-1)_2px_var(--space-2)] border-0 rounded-label bg-surface shadow-[inset_0_0_0_1px_var(--line)] text-ink font-semibold leading-[1.15] text-center cursor-[pointer]",
  "text-[length:max(13px,_var(--step--1))]",
  "[overflow-wrap:anywhere]",
  "[transition:transform_120ms_var(--effect)]",
  "[&[aria-pressed='true']]:[background:var(--accent-container)]",
  "[&[aria-pressed='true']]:[color:var(--on-accent-container)]",
  "[&[aria-pressed='true']]:shadow-[var(--selected-ring)]",
  "[&:active]:[transform:scale(0.97)]",
  "motion-reduce:transition-none",
  "motion-reduce:[&:active]:transform-none",
)

/**
 * A group of icon tiles. Name the group with a visible `label`, or point `labelledBy` at a heading the
 * step already shows (the intake's "What needs washing?").
 */
export function IconChoiceGrid<Value extends string>({ label, labelledBy, options, value, onPick, columns = 3, className }: {
  label?: string
  labelledBy?: string
  options: readonly IconChoice<Value>[]
  value: Value | null
  onPick: (value: Value) => void
  columns?: 2 | 3 | 4
  className?: string
}) {
  const legendId = useId()
  const named = label === undefined ? (labelledBy === undefined ? {} : { 'aria-labelledby': labelledBy }) : { 'aria-labelledby': legendId }
  const style = { '--icon-choice-columns': columns } as CSSProperties
  return (
    <div className={cn(iconChoiceGroupClassName, className)} role="group" {...named}>
      {label === undefined ? null : <p id={legendId} className={iconChoiceLegendClassName}>{label}</p>}
      <div className={iconChoiceGridClassName} style={style}>
        {options.map((option) => {
          const pressed = option.value === value
          return (
            <Toggle key={option.value} type="button" className={iconChoiceTileClassName} pressed={pressed} onClick={() => onPick(option.value)}>
              {option.art}
              <span>{option.label}</span>
            </Toggle>
          )
        })}
      </div>
    </div>
  )
}
