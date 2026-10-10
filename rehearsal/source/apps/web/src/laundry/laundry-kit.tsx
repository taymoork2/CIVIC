import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

import { laundryKitText } from '@/copy'
import { GarmentIcon } from '@/kit/garment-icon'
import { DesignIcon } from '@/kit/design-icons'

/**
 * The laundry-day kit (OpenDesign IDENTITY.md, 2026-10-07): one load card on every laundry screen, pictures
 * before words, a row you tap rather than a filled button on a tab, a receipt of how a wash went, and a
 * short, quiet moment when a load is done. Each screen adds only what is new on it.
 */

export type KitPiece = { readonly key: string; readonly kind: string | null; readonly colorGroup?: string | null; readonly label: string; readonly count: number }

/** A load's pieces as picture tiles, three across; past `max` the last tile counts the rest. */
export function GarmentTiles({ pieces, max = 6 }: { pieces: readonly KitPiece[]; max?: number }) {
  const shown = pieces.length > max ? pieces.slice(0, max - 1) : pieces
  const rest = pieces.slice(shown.length).reduce((sum, piece) => sum + piece.count, 0)
  return (
    <ul role="list" className="m-0 grid list-none grid-cols-3 gap-2 p-0">
      {shown.map((piece) => (
        <li key={piece.key} className="flex min-w-0 flex-col items-center gap-1.5 rounded-field bg-[var(--bg)] px-1 pt-3 pb-2.5 text-center">
          <GarmentIcon kind={piece.kind} colorGroup={piece.colorGroup} className="size-8" />
          <span className="min-w-0 text-[length:var(--step--1)] font-semibold leading-tight [overflow-wrap:anywhere]">{piece.label}</span>
          {piece.count > 1 ? <span className="text-[length:var(--step--1)] text-ink-2">×{piece.count}</span> : null}
        </li>
      ))}
      {rest > 0 ? (
        <li className="flex flex-col items-center justify-center gap-0.5 rounded-field border-[1.5px] border-dashed border-line px-1 py-3 text-ink-2">
          <span className="text-[length:var(--step-2)] font-bold text-ink">+{rest}</span>
          <span className="text-[length:var(--step--1)]">{laundryKitText.more}</span>
        </li>
      ) : null}
    </ul>
  )
}

/** Where a load is: Get ready, Wash, Dry, Put away. `at` is the current step (0-3), 4 when all are done. */
export function StageBar({ at }: { at: number }) {
  return (
    <div className="grid gap-2" role="img" aria-label={laundryKitText.stageLabel(at)}>
      <div className="grid grid-cols-4 gap-1" aria-hidden="true">
        {laundryKitText.stages.map((stage, index) => <span key={stage} className={cn('h-1.5 rounded-full', index <= at ? 'bg-[var(--sig)]' : 'bg-surface-3')} />)}
      </div>
      <div className="grid grid-cols-4 gap-1 text-[length:0.75rem] text-ink-2" aria-hidden="true">
        {laundryKitText.stages.map((stage, index) => <span key={stage} className={cn(index === at && 'font-bold text-[var(--sig-ink)]')}>{stage}</span>)}
      </div>
    </div>
  )
}

/** The one load card: its pieces as tiles and, when given, where the load is. Facts the screen adds go in `children`. */
export function LoadCard({ label, pieces, at, children }: { label: string; pieces: readonly KitPiece[]; at?: number; children?: ReactNode }) {
  return (
    <section aria-label={label} className="grid gap-3.5 rounded-card bg-surface p-4 shadow-[var(--e1)]">
      <GarmentTiles pieces={pieces} />
      {at === undefined ? null : <StageBar at={at} />}
      {children}
    </section>
  )
}

const ringRadius = 86
const ringLength = 2 * Math.PI * ringRadius

/**
 * A machine that is running, once, for the washer and the dryer: the minutes left in a ring, short chips
 * (machine, setting or heat, price when the app has it), the source of the time as one quiet line, and
 * whatever the screen adds (the dryer's take-out reminder) in `children`. `remaining` is 0-1.
 */
export function RunningRing({ label, minutes, remaining, chips, note, children }: {
  label: string
  minutes: number
  remaining: number
  chips: readonly (string | null)[]
  note?: string
  children?: ReactNode
}) {
  return (
    <section aria-label={label} className="grid gap-4 rounded-card bg-surface p-4 shadow-[var(--e1)]">
      <div className="grid justify-items-center gap-3.5">
        <div className="relative size-48" role="timer" aria-live="off" aria-label={laundryKitText.ringLabel(minutes, label)}>
          <svg viewBox="0 0 196 196" className="size-full -rotate-90" aria-hidden="true">
            <circle cx="98" cy="98" r={ringRadius} fill="none" strokeWidth="12" className="stroke-surface-3" />
            <circle cx="98" cy="98" r={ringRadius} fill="none" strokeWidth="12" strokeLinecap="round" strokeDasharray={ringLength} strokeDashoffset={ringLength * (1 - Math.min(1, Math.max(0, remaining)))} className="stroke-[color:var(--sig)] motion-safe:[transition:stroke-dashoffset_600ms_linear]" />
          </svg>
          <div className="absolute inset-0 grid content-center justify-items-center" aria-hidden="true">
            <span className="text-5xl font-bold leading-none tabular-nums">{minutes}</span>
            <span className="text-[length:var(--step--1)] text-ink-2">{laundryKitText.minLeft}</span>
          </div>
        </div>
        <ul role="list" className="m-0 flex list-none flex-wrap justify-center gap-2 p-0 text-[length:var(--step--1)] font-semibold">
          {chips.filter((chip): chip is string => chip !== null).map((chip) => <li key={chip} className="rounded-full bg-surface-2 px-3 py-1.5">{chip}</li>)}
        </ul>
        {note === undefined ? null : <p className="m-0 text-center text-[length:var(--step--1)] text-ink-2 text-pretty">{note}</p>}
      </div>
      {children}
    </section>
  )
}

const toneTile = {
  wash: 'bg-washing-bg text-washing-ink',
  dry: 'bg-hamper-bg text-hamper-ink',
  used: 'bg-ready-bg text-ready-ink',
  neutral: 'bg-surface-2 text-ink',
} as const

export type KitFact = { readonly key: string; readonly tone: keyof typeof toneTile; readonly icon: ReactNode; readonly label: string; readonly value: ReactNode }

/** How a wash went, as rows: a tinted symbol, the step's word, its value (Washed · Normal, warm). Load complete and each wash in a garment's history. */
export function ReceiptRows({ label, facts, flat = false }: { label: string; facts: readonly KitFact[]; /** Inside a card already: no raised surface of its own. */ flat?: boolean }) {
  return (
    <dl aria-label={label} className={cn('m-0 grid', flat ? '-mx-4' : 'rounded-card bg-surface py-1.5 shadow-[var(--e1)]')}>
      {facts.map((fact) => (
        <div key={fact.key} className="flex flex-wrap items-center gap-3.5 px-4 py-2.5">
          <span className={cn('grid size-10 flex-none place-items-center rounded-[12px] [&_svg]:size-[22px]', toneTile[fact.tone])} aria-hidden="true">{fact.icon}</span>
          <dt className="min-w-0 flex-1 text-[length:var(--step--1)] text-ink-2">{fact.label}</dt>
          <dd className="m-0 min-w-0 flex-[1_1_10rem] text-end font-semibold [overflow-wrap:anywhere]">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}
/** The way into a task from a tab screen: a row you tap (symbol, a small eyebrow, the task, where), never a filled button. */
export function TapRow({ media, eyebrow, title, fact, onClick, disabled, highlight = false }: {
  media: ReactNode
  eyebrow?: ReactNode
  title: ReactNode
  fact?: ReactNode
  onClick: () => void
  disabled?: boolean
  /** The tinted "Up next" row at the foot of a card. */
  highlight?: boolean
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={cn('flex w-full min-h-16 cursor-pointer items-center gap-3.5 border-0 px-4 py-3.5 text-start text-ink disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-ring', highlight ? 'bg-accent' : 'bg-transparent')}>
      <span className="grid size-11 flex-none place-items-center rounded-field bg-surface text-[var(--sig-ink)] [&_svg]:size-6" aria-hidden="true">{media}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        {eyebrow === undefined ? null : <span className="text-[length:var(--step--1)] font-semibold text-[var(--sig-ink)]">{eyebrow}</span>}
        <span className="text-[length:1.0625rem] font-semibold">{title}</span>
        {fact === undefined ? null : <span className="text-[length:var(--step--1)] text-ink-2">{fact}</span>}
      </span>
      <DesignIcon name="chevronRight" size="1em" strokeWidth={2.2} className="size-[18px] flex-none text-ink-2" aria-hidden="true"  />
    </button>
  )
}
