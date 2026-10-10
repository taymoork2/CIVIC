import { RadioGroupItem } from '@/components/ui/radio-group'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CheckMark } from '@/laundry/laundry-ui'
import { CareSymbol, type CareSymbolKind } from '@/closet/care-symbols'
import { useId, type ReactNode } from 'react'
import { DesignIcon } from '@/kit/design-icons'

/**
 * The shapes a question screen is made of, in the task-screen grammar: a product tile, choice
 * cards (a radio each, accent ring and tint when picked), a cap drawn as stacked marks, a count
 * as big numerals, and quieter rows for the answers that are not a mark. Presentation only: the
 * card in question-card.tsx owns every answer and its value.
 */

const captionClassName = 'text-[length:var(--step--1)] leading-[1.45] text-muted-foreground'

const pickedClassName = 'data-checked:bg-accent data-checked:[box-shadow:inset_0_0_0_1px_var(--accent)]'

/** The product the question is about: a 44px tile, its name at 16 and what it is used for. */
export function ProductHead({ name, caption }: { name: string; caption?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-card bg-card px-4 py-3 shadow-[var(--shadow-sm)]">
      <span className="flex size-11 flex-none items-center justify-center rounded-field bg-surface-2 text-ink [&_svg]:size-6" aria-hidden="true"><DesignIcon name="drop" size="1em" strokeWidth={2.2}  /></span>
      <span className="grid min-w-0 gap-0.5">
        <span className="text-[length:var(--step-1)] font-semibold leading-[1.25]">{name}</span>
        {caption === undefined ? null : <span className={captionClassName}>{caption}</span>}
      </span>
    </div>
  )
}

/** A caption over a group of answers, at 13 and muted. */
export function GroupCaption({ id, children }: { id?: string; children: ReactNode }) {
  return <span id={id} className="text-[length:var(--step--1)] font-semibold text-muted-foreground">{children}</span>
}

/** One answer in a radio group: a card with a title, an optional line under it and the ring at the end. `quiet` is the smaller, outlined row for the other ways to answer. */
export function PickCard({ value, title, fact, lead, disabled, quiet = false }: {
  value: string
  title: ReactNode
  fact?: ReactNode
  /** A picture at the start of the card, such as the cap with its fill. */
  lead?: ReactNode
  disabled?: boolean
  quiet?: boolean
}) {
  return (
    <RadioGroupItem
      variant="card"
      value={value}
      disabled={disabled}
      className={cn(
        'group/choice rounded-control',
        quiet ? 'min-h-12 border-line bg-transparent px-4 py-2' : 'min-h-[3.75rem] px-4 py-2.5',
        pickedClassName,
      )}
    >
      <span className="flex items-center gap-3">
        {lead === undefined ? null : <span className="flex flex-none items-center justify-center" aria-hidden="true">{lead}</span>}
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className={cn('flex flex-wrap items-center gap-2', quiet ? 'text-[length:var(--step-0)] font-semibold' : 'text-[length:var(--step-1)] font-semibold')}>{title}</span>
          {fact === undefined ? null : <span className={captionClassName}>{fact}</span>}
        </span>
        <span className="flex size-[22px] flex-none items-center justify-center rounded-full border-2 border-line group-data-[checked]/choice:border-link" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-link opacity-0 group-data-[checked]/choice:opacity-100" />
        </span>
      </span>
    </RadioGroupItem>
  )
}

/**
 * One answer among a few, as a tile in a row (wrapping, never a stack): the picture on top, the words
 * under it, the ring-tint when picked. Place the tiles in a `SymbolTiles` grid inside the radio group.
 */
export function SymbolTile({ value, title, fact, picture, symbol, disabled }: { value: string; title: ReactNode; fact?: ReactNode; picture?: ReactNode; symbol?: CareSymbolKind; disabled?: boolean }) {
  return (
    <RadioGroupItem variant="card" value={value} disabled={disabled} className={cn('rounded-control min-h-[5.5rem] min-w-0 content-start justify-items-center px-2 py-2.5 text-center', pickedClassName)}>
      <span className="grid min-w-0 justify-items-center gap-1.5">
        {picture === undefined && symbol === undefined ? null : <span className="flex h-9 items-center justify-center" aria-hidden="true">{picture ?? <CareSymbol kind={symbol!} size={32} decorative />}</span>}
        <span className="text-[length:var(--step-0)] font-semibold leading-snug [overflow-wrap:anywhere]">{title}</span>
        {fact === undefined || fact === '' ? null : <span className={cn(captionClassName, '[overflow-wrap:anywhere]')}>{fact}</span>}
      </span>
    </RadioGroupItem>
  )
}

/** The grid the tiles sit in: as many as fit a row at 5.5rem each, then the next row. */
export function SymbolTiles({ label, children }: { label: string; children: ReactNode }) {
  return <div role="group" aria-label={label} className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,5.5rem),1fr))] gap-2">{children}</div>
}

/** The app's one radio card, under the name the laundry and drying sheets use. */
export { PickCard as ChoiceCard }

/**
 * A two-state answer: a card (or a row inside a grouped card) with a tick box at the end. It
 * announces checked, so it can be turned off again.
 */
export function ToggleRow({ pressed, title, fact, disabled, variant = 'row', onClick }: {
  pressed: boolean
  title: ReactNode
  fact?: ReactNode
  disabled?: boolean
  variant?: 'card' | 'row'
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="unstyled"
      size="unstyled"
      role="checkbox"
      aria-checked={pressed}
      data-pressed={pressed ? '' : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 text-start text-foreground [transition:background-color_var(--dur-step)_var(--ease-out),transform_var(--dur-press)_var(--ease-out)] active:scale-[.98] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-60',
        variant === 'card'
          ? 'min-h-[3.75rem] rounded-control border border-border bg-surface px-4 py-2.5 data-[pressed]:border-[var(--accent)] data-[pressed]:bg-accent'
          : 'min-h-12 px-0 py-2',
      )}
    >
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className={cn('font-semibold', variant === 'card' ? 'text-[length:var(--step-1)]' : 'text-[length:var(--step-0)]')}>{title}</span>
        {fact === undefined ? null : <span className={captionClassName}>{fact}</span>}
      </span>
      <CheckMark on={pressed} />
    </Button>
  )
}

const capShape = 'M5 4h30l-4 38H9z'
const scoopShape = 'M4 10H30V34a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6Z'

/**
 * A cap or scoop filled to one printed mark. A picture only: the level is the mark's place among
 * the marks, not the cap's real volume; the printed mark beside it carries the instruction.
 */
export function CapLevel({ level, vessel }: { level: number; vessel: 'cap' | 'scoop' }) {
  const clipId = useId()
  const scoop = vessel === 'scoop'
  const top = scoop ? 40 - level * 28 : 42 - level * 34
  return (
    <svg className="h-9 w-8 flex-none text-muted-foreground" viewBox="0 0 40 46" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <defs><clipPath id={clipId}><path d={scoop ? scoopShape : capShape} /></clipPath></defs>
      <rect fill="var(--accent-container)" opacity="0.75" stroke="none" x="0" y={top} width="40" height={46 - top} clipPath={`url(#${clipId})`} />
      <path d={scoop ? scoopShape : 'M5 4l4 38h22l4-38M5 4a15 2 0 1130 0 15 2 0 01-30 0z'} vectorEffect="non-scaling-stroke" />
      {scoop ? <path d="M4 10q13 3 26 0" vectorEffect="non-scaling-stroke" /> : null}
      <path d={`M${scoop ? 4 : 5 + (top - 4) * 0.105} ${top}H${scoop ? 30 : 35 - (top - 4) * 0.105}`} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/**
 * The cap's printed marks as a row of tiles, the highest first as the cap is read, each with its
 * mark exactly as printed. Place it inside the question's radio group; `valueOf` makes each value.
 */
export function CapMarks({ vessel, marks, label, valueOf }: { vessel: 'cap' | 'scoop'; marks: readonly string[]; label: string; valueOf: (mark: string) => string }) {
  return (
    <SymbolTiles label={label}>
      {marks.map((mark, index) => ({ mark, index })).reverse().map(({ mark, index }) => (
        <SymbolTile key={mark} value={valueOf(mark)} picture={<CapLevel level={(0.9 * (index + 1)) / marks.length} vessel={vessel} />} title={mark} />
      ))}
    </SymbolTiles>
  )
}

/** A count as one tap: big numerals side by side, the unit spoken with each. Place it inside a radio group. */
export function CountMarks({ unit, max = 4, label, valueOf }: { unit: string; max?: number; label: string; valueOf: (count: number) => string }) {
  return (
    <div className="grid grid-cols-4 gap-2" role="group" aria-label={label}>
      {Array.from({ length: max }, (_, index) => index + 1).map((count) => (
        <RadioGroupItem key={count} variant="card" value={valueOf(count)} className={cn('min-h-14 place-items-center rounded-control px-0 py-2 text-center text-[length:var(--step-2)] font-semibold tabular-nums', pickedClassName)}>
          <span aria-hidden="true">{count}</span>
          <span className="sr-only">{count} {count === 1 ? unit : `${unit}s`}</span>
        </RadioGroupItem>
      ))}
    </div>
  )
}

/** A grouped card of quiet rows (toggles, a typed line), divided by hairlines. */
export function RowsCard({ caption, children }: { caption?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      {caption === undefined ? null : <GroupCaption>{caption}</GroupCaption>}
      <div className="grid rounded-card bg-card px-4 shadow-[var(--shadow-sm)] [&>*+*]:[border-block-start:1px_solid_var(--line)]">{children}</div>
    </div>
  )
}
