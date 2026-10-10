import { Checkbox } from '@/components/ui/checkbox'
import { ItemGroup } from '@/components/ui/item'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import { DesignIcon } from '@/kit/design-icons'

/**
 * The prototype's block grammar for the Household screens and their sheets, in one place: a section
 * (section heading, optional facts caption, one rounded card of rows), a facts card (label left,
 * value right, chevron when a tap edits it), a muted line of text, a row of full-width actions, a
 * confirm row and chips. Presentation only: nothing here reads or writes a record.
 */

/** A titled card of rows. A section without a heading is the lone "Add ..." row. */
export function RowSection({ heading, caption, children }: { heading?: ReactNode; caption?: ReactNode; children: ReactNode }) {
  return <section className="grid gap-3">
    {heading === undefined ? null : <div className="flex items-baseline justify-between gap-2 px-1">
      <h2 className="text-[length:var(--step-2)] font-semibold">{heading}</h2>
      {caption === undefined ? null : <span className="text-[length:var(--step--1)] text-muted-foreground">{caption}</span>}
    </div>}
    <ItemGroup>{children}</ItemGroup>
  </section>
}

/** [label, value, optional edit]: a row with an edit tap shows a chevron and opens that edit. */
export type FactRow = readonly [label: string, value: ReactNode, onEdit?: () => void]

const factRowClassName = cn(
  "flex min-h-11 w-full items-center justify-between gap-3 border-0 bg-transparent py-2.5 text-start text-[length:var(--step-0)] leading-normal text-foreground",
  "[&+&]:[border-block-start:1px_solid_var(--line)]",
)

/** Facts as the prototype draws them: a quiet card, the label muted, the value bold and right-aligned. */
export function FactsCard({ rows, label }: { rows: readonly FactRow[]; label?: string }) {
  return <dl aria-label={label} className="m-0 rounded-control bg-background px-3.5">
    {rows.map(([name, value, onEdit]) => onEdit === undefined
      ? <div key={name} className={factRowClassName}>
        <dt className="text-muted-foreground">{name}</dt>
        <dd className="m-0 text-end font-semibold [overflow-wrap:anywhere]">{value}</dd>
      </div>
      : <div key={name} className="contents">
        <button type="button" className={cn(factRowClassName, "cursor-pointer touch-manipulation focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-ring")} onClick={onEdit}>
          <span className="text-muted-foreground">{name}</span>
          <span className="flex items-center gap-2 text-end font-semibold [overflow-wrap:anywhere]">{value}<DesignIcon name="chevronRight" size="1em" strokeWidth={2.2} className="size-4 flex-none text-muted-foreground" aria-hidden="true"  /></span>
        </button>
      </div>)}
  </dl>
}

/** A short paragraph in the sheet: muted caption size, or body size. */
export function SheetText({ children, muted = true, id, role }: { children: ReactNode; muted?: boolean; id?: string; role?: 'alert' }) {
  return <p id={id} role={role} className={cn("m-0 leading-normal", muted ? "text-[length:var(--step--1)] text-muted-foreground" : "text-[length:var(--step-0)]")}>{children}</p>
}

/** The prototype's `acts` block: full-width 44px buttons, 16 radius, a hairline border. */
export const actionClassName = cn(
  "flex min-h-11 flex-[1_1_auto] items-center justify-center rounded-control border border-line bg-card px-3.5",
  "text-[length:var(--step-1)] font-semibold text-foreground cursor-pointer touch-manipulation",
  "[transition:transform_var(--dur-press)_var(--ease-out)] active:scale-[.98] motion-reduce:transition-none motion-reduce:active:transform-none",
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50",
)

export function ActionRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>
}

/**
 * The prototype's `confirm` block: one checkbox in a 56px quiet card with its words beside it. The
 * words are the label, so the whole card is the target.
 */
export function ConfirmRow({ checked, onCheckedChange, children }: { checked: boolean; onCheckedChange: (checked: boolean) => void; children: ReactNode }) {
  return <label className="flex min-h-14 min-w-0 w-full cursor-pointer items-center gap-3 rounded-control border border-line bg-background px-3.5 py-2.5 text-[length:var(--step-0)] leading-normal touch-manipulation">
    <Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
    <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{children}</span>
  </label>
}

/** A fact tab strip, drawn as the prototype's segmented control. */
export const segListClassName = "flex gap-0 rounded-control bg-muted p-[3px]"
export const segTabClassName = cn(
  "rounded-[13px] px-2 text-[length:var(--step--1)] font-semibold text-foreground",
  "[transition:background-color_var(--dur-step)_var(--ease-out)] motion-reduce:transition-none",
  "data-active:bg-card data-active:[box-shadow:var(--e1)]",
)
