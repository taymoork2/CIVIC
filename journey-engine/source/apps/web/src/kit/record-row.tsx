import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

import { recordText } from '@/copy'
import { DesignIcon } from '@/kit/design-icons'

/**
 * One status vocabulary for garments, products, machines and people. Color is never the only
 * signal: every mark is a dot plus words. Amber means waiting or needs confirmation; rust means
 * two recorded facts can't be used together, so an incompatibility never reads like a to-do.
 */
export type MarkTone = 'ready' | 'waiting' | 'washing' | 'drying' | 'confirm' | 'conflict' | 'done'

const dotClassName = 'size-1.5 flex-none rounded-full'

/** Dots and bars use their own tones, apart from the pale fill and tinted text of the box they sit in. */
const dotTone: Record<MarkTone, string> = {
  ready: '[background:var(--ready)]',
  done: '[background:var(--ready)]',
  waiting: '[background:var(--hamper)]',
  confirm: '[background:var(--hamper)]',
  washing: '[background:var(--washing)]',
  drying: '[background:var(--hanging)]',
  conflict: '[background:var(--dot-red)]',
}

/** A small tonal mark: a dot and its words, e.g. "Needs confirmation". */
export function StatusMark({ tone, children }: { tone: MarkTone; children?: ReactNode }) {
  return <Badge variant={tone === 'done' ? 'ready' : tone}><span className={cn(dotClassName, 'bg-current')} aria-hidden="true" />{children ?? recordText.marks[tone]}</Badge>
}

/**
 * The object's media slot at row size: an actual or catalog photo when one exists, otherwise its
 * icon. A photo identifies the object only; it never establishes a care or product fact.
 */
export function MediaTile({ media, dot }: { media: ReactNode; dot?: string }) {
  return <ItemMedia variant="icon" className="[&_>_img]:absolute [&_>_img]:inset-0 [&_>_img]:size-full [&_>_img]:object-cover [&_>_img]:rounded-field" aria-hidden="true">
    {media}
    {dot === undefined ? null : <span className="absolute end-[-3px] bottom-[-3px] size-3.5 rounded-full border-2 border-surface" style={{ background: dot }} />}
  </ItemMedia>
}

/** Keep status beside the two text lines, with the disclosure at the lower right. */
export function RecordRowEnd({ mark, opens = false }: { mark?: { tone: MarkTone; text?: string }; opens?: boolean }) {
  if (mark === undefined && !opens) return null
  return <ItemActions className={cn('min-w-0 max-w-[45%] justify-end', mark === undefined ? undefined : 'grid self-stretch content-between justify-items-end gap-1')}>
    {mark === undefined ? null : <StatusMark tone={mark.tone}>{mark.text}</StatusMark>}
    {opens ? <DesignIcon name="chevronRight" size="1em" strokeWidth={2.2} className="size-4 flex-none text-muted-foreground" aria-hidden="true" /> : null}
  </ItemActions>
}

/**
 * The one row for every recorded object: media tile, name, one fact line, a status mark and a
 * chevron. The whole row opens the object's record. Problems with this object sit inside the row,
 * under it, with actions for this source only.
 */
export function RecordRow({ media, photo, dot, title, fact, mark, onOpen, disabled, label, expanded, issues, trailing }: {
  /** The tile's icon (or any element). Ignored when `photo` is set. */
  media?: ReactNode
  /** An actual or catalog photo for the tile; it covers the tile and never sets a care or product fact. */
  photo?: string
  dot?: string
  title: ReactNode
  fact?: ReactNode
  mark?: { tone: MarkTone; text?: string }
  onOpen?: () => void
  disabled?: boolean
  /** The row's accessible name, read as one element: name, fact, status, then what it opens. */
  label?: string
  /** Set only for rows that disclose additional content, rather than opening a record. */
  expanded?: boolean
  issues?: ReactNode
  /** A control at the end of the row instead of the chevron, such as a quantity stepper. */
  trailing?: ReactNode
}) {
  const body = <>
    {media == null && photo === undefined && dot === undefined ? null : <MediaTile media={photo === undefined ? media : <img src={photo} alt="" />} dot={dot} />}
    <ItemContent>
      <ItemTitle>{title}</ItemTitle>
      {fact === undefined ? null : <ItemDescription>{fact}</ItemDescription>}
    </ItemContent>
    <RecordRowEnd mark={mark} opens={onOpen !== undefined && trailing === undefined} />
  </>
  return <li className="record-row [&+&]:[border-block-start:1px_solid_var(--line)]">
    {onOpen === undefined
      ? <Item className={trailing === undefined ? undefined : 'max-[360px]:flex-wrap'}>{body}{trailing === undefined ? null : <ItemActions className="max-[360px]:basis-full max-[360px]:justify-end">{trailing}</ItemActions>}</Item>
      : <div className={cn('flex', trailing === undefined ? 'items-center' : 'relative isolate items-stretch gap-1 p-1 max-[360px]:flex-wrap')}>
        {/* Stretch the native record button across the row; sibling controls sit above its hit area. */}
        <Item variant={trailing === undefined ? 'interactive' : 'default'} className={cn('min-w-0 flex-1', trailing === undefined ? undefined : "py-2 ps-3 pe-2 max-[360px]:basis-full after:absolute after:inset-0 after:z-0 after:content-[''] [&>span]:relative [&>span]:z-10 [@media_(hover:_hover)_and_(pointer:_fine)]:[&:hover:not(:disabled)]:after:bg-muted [&:active:not(:disabled)]:after:bg-muted focus-visible:outline-none focus-visible:after:outline-3 focus-visible:after:outline-offset-[-3px] focus-visible:after:outline-ring")} render={<Button variant="unstyled" size="unstyled" type="button" aria-label={label} aria-expanded={expanded} disabled={disabled} onClick={onOpen} />}>
          {body}
        </Item>
        {trailing === undefined ? null : <ItemActions className="relative z-10 pointer-events-none pe-3 max-[360px]:ms-auto max-[360px]:pb-1 [&_button]:pointer-events-auto [&_a]:pointer-events-auto [&_input]:pointer-events-auto">{trailing}</ItemActions>}
      </div>}
    {issues}
  </li>
}

/** A grouped card of record rows, optionally under a section heading (20/650) with a right-hand caption (13, muted). */
export function RecordList({ heading, caption, children }: { heading?: ReactNode; caption?: ReactNode; children: ReactNode }) {
  return <section className="grid gap-3">
    {heading === undefined ? null : <div className="flex items-baseline justify-between gap-2">
      <h2 className="text-[length:var(--step-2)] font-semibold leading-[1.3]">{heading}</h2>
      {caption === undefined ? null : <span className="text-[length:var(--step--1)] text-muted-foreground">{caption}</span>}
    </div>}
    <ItemGroup>{children}</ItemGroup>
  </section>
}

/**
 * A problem shown under the source that caused it. `confirm` (amber) needs a person to check a
 * fact; `conflict` (rust) means the recorded facts can't be used together. Actions change only
 * this source or this load; none of them overrides a care or product restriction.
 */
export function IssueNote({ kind, title, detail, actions, disabled = false }: {
  kind: 'confirm' | 'conflict'
  title: string
  detail?: string
  actions: readonly { readonly label: string; readonly onClick: () => void }[]
  disabled?: boolean
}) {
  // A group, not a live alert: these render with the screen and must not interrupt a screen reader.
  return <Alert variant={kind} role="group" aria-label={`${recordText.marks[kind]}: ${title}`} className="issue-note min-w-0 grid-cols-[minmax(0,1fr)] w-auto m-[0_var(--space-3)_var(--space-3)]">
    <AlertTitle className="min-w-0 [overflow-wrap:anywhere]"><span className={cn(dotClassName, dotTone[kind])} aria-hidden="true" />{title}</AlertTitle>
    {detail === undefined || detail === '' ? null : <AlertDescription>{detail}</AlertDescription>}
    {actions.length === 0 ? null : <AlertActions className="min-w-0 ps-[12px]">
      {actions.map((action) => <Button variant="alert" size="unstyled" className="min-w-0 max-w-full whitespace-normal px-[12px] py-2 [overflow-wrap:anywhere]" key={action.label} type="button" disabled={disabled} onClick={action.onClick}>{action.label}</Button>)}
    </AlertActions>}
  </Alert>
}

/**
 * A page or sheet level note in a yellow (`confirm`, waiting) or red (`conflict`) box, with
 * translucent white pill actions. Not an interruption: it is a status, read in place.
 */
export function Banner({ tone, role = 'status', children, actions }: {
  tone: 'confirm' | 'conflict'
  /** `alert` for a failure the person just caused, so it is announced once as it appears. */
  role?: 'status' | 'alert'
  children: ReactNode
  actions?: readonly { readonly label: string; readonly onClick: () => void; readonly disabled?: boolean }[]
}) {
  const hasActions = actions !== undefined && actions.length > 0
  return <Alert variant={tone} role={role} className="gap-0.5 p-[12px_14px_4px]">
    <p className={cn('max-w-none text-[length:var(--step-0)] leading-normal', hasActions ? 'pb-2' : 'pb-2.5')}>{children}</p>
    {hasActions ? <AlertActions className="ps-0">
      {actions.map((action) => <Button variant="alert" size="unstyled" key={action.label} type="button" disabled={action.disabled} onClick={action.onClick}>{action.label}</Button>)}
    </AlertActions> : null}
  </Alert>
}
