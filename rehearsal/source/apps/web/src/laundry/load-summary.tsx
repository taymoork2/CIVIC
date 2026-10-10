import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

import { colorWord, countWord, homeText, loadText, sessionText } from '@/copy'
import { matchingGroups } from '@/closet/garment-groups'
import { StatusMark, type MarkTone } from '@/kit/record-row'
import type { LoadStage } from '@/laundry/session-stage'
import type { PrivatePiece } from '@/laundry/private-piece'
import { privateCareWords } from '@/laundry/private-piece'
import { privatePieceText } from '@/copy-load'

/**
 * A garment as the owner tells it apart: its name and color (a stored "Grey" reads "Gray"). A name that
 * already says its color stands alone ("White tee", never "White tee, White").
 */
export function garmentLabel(garment: { name: string | null; color?: string | null; private?: boolean } | undefined): string {
  if (garment === undefined) return sessionText.garment
  if (garment.private) return privatePieceText.pieces(1)
  const name = garment.name ?? sessionText.garment
  const color = garment.color ? colorWord(garment.color) : null
  if (color === null || new RegExp(`(^|[^a-z])${color.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i').test(name)) return name
  return `${name}, ${color}`
}

type LoadTextile = { readonly name: string | null; readonly color?: string | null; readonly colorGroup?: string | null; readonly guest?: boolean } & Pick<PrivatePiece, 'private' | 'privateCare'>

/**
 * A load's pieces as rows: matching pieces (same name and color, both the household's or both a
 * guest's) count together under the "Name, Color" label; `differs` keeps apart pieces whose shown
 * facts differ. The same matching key as drying and put-away.
 */
export function loadPieces<Textile extends LoadTextile>(textiles: readonly Textile[], differs?: (textile: Textile) => unknown) {
  return matchingGroups(textiles, (textile) => textile.private ? { name: privatePieceText.pieces(1) } : ({ name: textile.name ?? sessionText.garment, color: textile.color, colorGroup: textile.colorGroup, guest: textile.guest === true }), (textile) => [textile.private ? privateCareWords(textile.privateCare) : null, differs?.(textile)])
    .map((group) => ({ key: group.key, label: group.first.private ? privatePieceText.pieces(group.members.length) : garmentLabel(group.first), count: group.members.length, private: group.first.private === true, guest: group.first.guest === true, first: group.first }))
}

const stageLabels: Readonly<Record<LoadStage, string>> = {
  ...homeText.band.stages,
  queued_to_dry: sessionText.loadWaitingToDry,
  pieces_drying: sessionText.loadDrying,
  check_due: sessionText.loadCheckDue,
  to_put_away: sessionText.loadToPutAway,
  put_away: sessionText.loadPutAway,
}

// A due check or a waiting step is "waiting", never "ready": only a recorded event reads as done.
const stageTones: Readonly<Record<LoadStage, MarkTone>> = {
  preparing: 'waiting', washing: 'washing', wash_done: 'ready', drying: 'drying', dry: 'waiting', finished: 'done',
  queued_to_dry: 'waiting', pieces_drying: 'drying', check_due: 'waiting', to_put_away: 'waiting', put_away: 'done',
}

/** Where a stage sits on the load card's four steps (Get ready, Wash, Dry, Put away). */
export function loadStageAt(stage: LoadStage): number {
  switch (stage) {
    case 'preparing': return 0
    case 'washing': return 1
    case 'wash_done': case 'queued_to_dry': case 'drying': case 'dry': case 'pieces_drying': case 'check_due': return 2
    case 'to_put_away': return 3
    case 'finished': case 'put_away': return 4
  }
}

/** Distinct washer names in first-seen order: a dryer run can combine pieces from several washes. */
export function washOrigins(washers: readonly (string | null | undefined)[]): string[] {
  return [...new Set(washers.filter((washer): washer is string => typeof washer === 'string' && washer.length > 0))]
}

const loadSummaryClassName = cn(
  "load-summary",
  "grid min-w-0 gap-1.5 rounded-card bg-card px-4 py-3 shadow-[var(--shadow-sm)]",
)

const loadSummaryLineClassName = cn(
  "load-summary-line",
  "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1",
)

const loadSummaryCaptionClassName = cn(
  "load-summary-caption",
  "min-w-0 text-[length:var(--step--1)] leading-[1.45] text-muted-foreground [overflow-wrap:anywhere]",
)

const loadSummaryContentsClassName = cn(
  "load-summary-contents",
  "m-0 flex min-w-0 flex-1 flex-wrap gap-x-1 p-0 list-none text-[length:var(--step-0)] leading-[1.45] [overflow-wrap:anywhere]",
  "[&>li:not(:last-child)]:after:content-['·'] [&>li:not(:last-child)]:after:ms-1 [&>li:not(:last-child)]:after:text-muted-foreground",
)

/** For a caller's next-action link or button: a 44px target that sits at the end of the contents line. */
export const loadSummaryActionClassName = cn(
  "load-summary-action",
  "inline-flex min-h-11 items-center self-center text-[length:var(--step-0)] font-semibold text-primary",
  "focus-visible:outline-3 focus-visible:outline-ring rounded-control",
)

/**
 * One compact summary of a load, the same at every stage: where it is (session-stage.ts), the
 * washer or washers its pieces came from, its contents with matching pieces counted together, and at
 * most one next action. Presentation only: it records nothing, and a stage label never says a piece
 * is dry or put away unless someone recorded it. Recorded treatments stay in "Recipe used".
 */
export function LoadSummary({ stage, origins, pieces, action }: {
  stage: LoadStage
  /** Every washer the pieces came from; one dryer run can hold several washes. */
  origins: readonly string[]
  pieces: readonly LoadTextile[]
  /** At most one next action, a link or button, when the screen has no other primary action for it. */
  action?: ReactNode
}) {
  const rows = loadPieces(pieces)
  return (
    <section aria-label={sessionText.loadSummary} className={loadSummaryClassName}>
      <div className={loadSummaryLineClassName}>
        <StatusMark tone={stageTones[stage]}>{stageLabels[stage]}</StatusMark>
        {origins.length === 0 ? null : <span className={loadSummaryCaptionClassName}>{sessionText.fromWashers(origins)}</span>}
        <span className={cn(loadSummaryCaptionClassName, 'ms-auto tabular-nums')}>{countWord(pieces.length, 'piece')}</span>
      </div>
      {rows.length === 0 && action === undefined ? null : (
        <div className={loadSummaryLineClassName}>
          <ul className={loadSummaryContentsClassName}>
            {rows.map((row) => (
              <li key={row.key}>
                <span>{row.label}</span>
                {row.count > 1 && !row.private ? <span className="ms-1 font-semibold tabular-nums">×{row.count}</span> : null}
                {row.private ? <span className="text-muted-foreground"> · {privateCareWords(row.first.privateCare)}</span> : null}
                {row.guest ? <span className="text-muted-foreground"> ({loadText.guestItem})</span> : null}
              </li>
            ))}
          </ul>
          {action}
        </div>
      )}
    </section>
  )
}
