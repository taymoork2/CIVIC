import { Button } from '@/components/ui/button'
import { DesignIcon } from '@/kit/design-icons'
import { useState, type ReactNode, type Ref } from 'react'

import { countWord, loadText, sourceIssueText } from '@/copy'
import { loadScreenText } from '@/copy-laundry'
import { loadReviewText } from '@/copy-load'
import { ActionList, BackButton, Callout, FooterLink, HeldNote, Note, QuantityStepper, Section, SwitchRow, TaskHeading } from '@/laundry/laundry-ui'
import { colourWords, type LoadCardView, type LoadStart } from '@/laundry/load-card'
import type { LeftOutGarment, LoadReviewModel, ReviewGarment } from '@/laundry/load-review'
import { GarmentIcon } from '@/kit/garment-icon'
import { IssueNote, RecordRow } from '@/kit/record-row'
import { Sheet } from '@/kit/sheet'
import type { IssueAction, SourceGroup } from '@/products/source-issues'
import { TaskFooter } from '@/kit/task-footer'

/**
 * One planned load as its own screen (design `loadScreen`): the clothes with a quantity each and
 * what was left out, the products from the saved records, the washer. Each problem sits directly
 * under the garment, product or washer that caused it. A load with problems docks the first
 * problem's action; a load with nothing left goes on to the machines, where the washer is entered
 * and the recipe confirmed.
 */

export function LoadScreen({
  view, review, start, pending, loadCount, allowMove, problems, washer, classToggle, otherClassNote, next, onResolve,
  onAtRoom, openLink, onRunAction, onMove, onNotThisTime, onQuantity, onPutBack, onPickDetergent, onToggleSoftener,
  leftIssues = [], leftNotes = [], extra, onBack, titleRef, startedNote, docked = true,
}: {
  view: LoadCardView
  /** The garments, products and requirements this load lists, from the real plan and records. */
  review: LoadReviewModel
  start: LoadStart
  pending: boolean
  /** How many loads are shown, for "Move to load k"; 0 hides the Move entries. */
  loadCount: number
  allowMove: boolean
  problems: readonly SourceGroup[]
  /** The washer row: the planned washer, or "Chosen when you arrive" in a shared room. */
  washer: { readonly title: string; readonly fact: string }
  classToggle?: ReactNode
  otherClassNote: string | null
  /** The first problem's action, with how many remain and its title for the footer note. */
  next: { readonly label: string; readonly compactLabel?: string; readonly remaining: number; readonly issue?: string | null; readonly onClick: () => void } | null
  onResolve?: () => void
  onAtRoom: () => void
  openLink: ReactNode
  onRunAction: (action: IssueAction) => void
  onMove: (textileId: string, group: number) => void
  onNotThisTime: (textileId: string) => void
  /** The stepper: the piece count of one garment row in this load, from one up to what is in the hamper. */
  onQuantity: (row: ReviewGarment, next: number) => void
  /** "Put back" on a left-out row: every piece of it returns to this load. */
  onPutBack: (row: LeftOutGarment) => void
  /** Opens the detergent choice; without it the detergent row is not tappable. */
  onPickDetergent?: () => void
  /** The softener switch: this wash only. Without it the switch is shown but cannot be changed. */
  onToggleSoftener?: (supplyId: string, on: boolean) => void
  /** Garments the plan could not place at all, with what to do about each; shown with the left-out rows. */
  leftIssues?: readonly SourceGroup[]
  leftNotes?: readonly string[]
  /** Rows the plan asks the household for (add a washer or a detergent), under the washer. */
  extra?: ReactNode
  onBack: () => void
  titleRef?: Ref<HTMLHeadingElement>
  /** A start the server has not answered yet. */
  startedNote?: ReactNode
  /** False while the plan is stale: the screen's one footer belongs to the update button. */
  docked?: boolean
}) {
  const [menu, setMenu] = useState<{ textileId: string; name: string } | null>(null)
  const blocked = start === 'blocked' || start === 'question'
  const started = start === 'open'
  // A piece held for a different product is listed with its own options; it is not a "to resolve" count and the room cannot help it.
  const issues = problems.flatMap((group) => group.issues)
  const openCount = issues.filter((issue) => issue.blocking && issue.held !== true).length
  const heldOnly = blocked && openCount === 0 && issues.some((issue) => issue.held === true)
  const heldPieces = new Set(problems.filter((group) => group.source.kind === 'garment' && group.issues.some((issue) => issue.held === true)).map((group) => group.source.id)).size
  const left = blocked ? Math.max(1, heldOnly ? 0 : openCount || (next?.remaining ?? 1)) : 0
  const used = new Set<SourceGroup>()
  const noteFor = (group: SourceGroup) => group.issues.map((issue) => issue.held ? (
    <HeldNote key={`${group.source.id}:${issue.reasonId}`} title={issue.title} label={sourceIssueText.held.options(group.name)}
      actions={issue.actions.map((entry) => ({ label: entry.label, disabled: pending, onClick: () => onRunAction(entry.action) }))} />
  ) : (
    <IssueNote key={`${group.source.id}:${issue.reasonId}`} kind={issue.kind} title={issue.title} detail={issue.detail} disabled={pending}
      actions={issue.actions.map((entry) => ({ label: entry.label, onClick: () => { if (!pending) onRunAction(entry.action) } }))} />
  ))
  const issuesFor = (kind: SourceGroup['source']['kind'], match: (group: SourceGroup) => boolean): ReactNode => {
    const groups = problems.filter((entry) => entry.source.kind === kind && match(entry) && !used.has(entry))
    if (groups.length === 0) return undefined
    return groups.flatMap((group) => { used.add(group); return noteFor(group) })
  }
  const { products } = review
  const pieces = view.items.length
  const mark = started
    ? { tone: 'washing' as const }
    : pieces === 0 ? { tone: 'waiting' as const, text: loadScreenText.empty }
      : blocked ? { tone: 'waiting' as const } : { tone: 'ready' as const, text: loadScreenText.ready }
  const caption = started ? loadScreenText.startedCaption : heldOnly ? undefined : blocked ? loadScreenText.toResolve(left) : loadScreenText.nothingLeft
  const art = (row: { kind: string | null; colorGroup: string | null; color: string | null; name: string }) => <GarmentIcon kind={row.kind} colorGroup={row.colorGroup} />

  // Garments are listed first so each one's own problems are claimed before any product group could take them.
  const garmentRows = review.garments.map((row) => (
    <RecordRow
      key={row.key}
      media={art(row)}
      title={row.name}
      fact={[row.owner, row.wash].filter((part) => part !== '').join(' · ')}
      onOpen={started || row.private ? undefined : () => setMenu({ textileId: row.textileIds[row.textileIds.length - 1]!, name: row.name })}
      label={`${row.name}. ${loadText.moreFor(row.name)}`}
      trailing={started || row.private ? undefined : (
        <QuantityStepper value={row.textileIds.length} min={1} max={row.textileIds.length + row.candidates.length} label={row.name} disabled={pending}
          onChange={(count) => onQuantity(row, count)} />
      )}
      issues={issuesFor('garment', (group) => row.textileIds.includes(group.source.id))}
    />
  ))
  const leftOutRows = review.leftOut.map((row) => (
    <RecordRow
      key={`out:${row.key}`}
      media={art(row)}
      title={row.textileIds.length > 1 ? `${row.name} ×${row.textileIds.length}` : row.name}
      fact={loadReviewText.leftOut}
      trailing={started ? undefined : <Button type="button" variant="tonal" size="sm" aria-label={loadReviewText.putBackAria(row.name)} disabled={pending} onClick={() => onPutBack(row)}>{loadReviewText.putBack}</Button>}
    />
  ))
  const unplaced = leftIssues.map((group) => (
    <RecordRow
      key={`left:${group.source.kind}:${group.source.id}`}
      media={group.icon === undefined ? <DesignIcon name="tag" size="1em" strokeWidth={2.2}  /> : <GarmentIcon kind={group.icon.kind} colorGroup={group.icon.colorGroup} />}
      title={group.name}
      fact={group.issues.some((issue) => issue.held) ? undefined : sourceIssueText.sourceKind[group.source.kind]}
      mark={group.issues.some((issue) => issue.held) ? undefined : { tone: group.issues.some((issue) => issue.kind === 'conflict') ? 'conflict' : 'confirm' }}
      issues={noteFor(group)}
    />
  ))
  const unplacedNotes = leftNotes.map((text) => <RecordRow key={`note:${text}`} media={<DesignIcon name="tag" size="1em" strokeWidth={2.2}  />} title={text} />)

  const openDetergent = started || onPickDetergent === undefined ? undefined : onPickDetergent
  const detergentRow = products.detergent === null
    ? <RecordRow key="detergent" media={<DesignIcon name="bottle" strokeWidth={1.6} />} title={loadReviewText.chooseDetergent} onOpen={openDetergent} />
    : <RecordRow key={products.detergent.key} media={<DesignIcon name="bottle" strokeWidth={1.6} />} title={products.detergent.name} fact={products.detergent.fact} onOpen={openDetergent}
      issues={issuesFor('product', (group) => group.source.id === products.detergent!.supplyId)} />
  const pretreatRows = products.pretreat.map((row) => (
    <RecordRow key={row.key} media={<DesignIcon name="spray" strokeWidth={1.6} />} title={row.name} fact={row.fact} issues={issuesFor('product', (group) => group.source.id === row.supplyId)} />
  ))
  const softener = products.softener === null ? null : (
    <SwitchRow key="softener" media={<DesignIcon name="softener" strokeWidth={1.6} />} title={products.softener.name}
      fact={products.softener.on ? loadReviewText.softenerIn : loadReviewText.softenerOut}
      on={products.softener.on}
      disabled={started || pending || !products.softener.canToggle || onToggleSoftener === undefined}
      onToggle={() => onToggleSoftener?.(products.softener!.supplyId, !products.softener!.on)}
      issues={products.softener.on ? issuesFor('product', (group) => group.source.id === products.softener!.supplyId) : undefined} />
  )
  const otherRows = products.other.map((row) => (
    <RecordRow key={row.key} media={<DesignIcon name="bottle" strokeWidth={1.6} />} title={row.name} fact={row.fact} issues={issuesFor('product', (group) => group.source.id === row.supplyId)} />
  ))
  const unmatchedProducts = problems.filter((group) => group.source.kind === 'product' && !used.has(group)).map((group) => {
    used.add(group)
    return <RecordRow key={`${group.source.kind}:${group.source.id}`} media={<DesignIcon name="bottle" strokeWidth={1.6} />} title={group.name} fact={loadScreenText.product} issues={noteFor(group)} />
  })
  const washerIssues = problems.filter((group) => group.source.kind === 'washer' && !used.has(group)).flatMap((group) => { used.add(group); return noteFor(group) })
  const settingsNotes = [view.dry?.fit ?? null, view.dry === null || view.dry.hang.length === 0 ? null : `${loadText.hang} ${view.dry.hang.join(', ')}`].filter((text): text is string => text !== null)

  return (
    <>
      <TaskHeading title={loadReviewText.title(colourWords(view.items.map((item) => item.colorGroup)))} back={<BackButton label={loadReviewText.back} onClick={onBack} />} titleRef={titleRef} mark={mark} caption={caption} />
      {started ? <Callout tone="washing">{loadScreenText.startedBanner}</Callout> : null}
      {startedNote === undefined ? null : <Callout tone="washing">{startedNote}</Callout>}
      {review.requirements === null ? null : <Callout>{loadReviewText.requirements(review.requirements)}</Callout>}
      {classToggle}
      <Section heading={loadScreenText.clothes} caption={countWord(pieces, 'piece')}>
        {garmentRows}
        {leftOutRows}
        {unplaced}
        {unplacedNotes}
      </Section>
      <Section heading={loadScreenText.products} caption={loadScreenText.fromRecords}>
        {detergentRow}
        {pretreatRows}
        {softener}
        {otherRows}
        {unmatchedProducts}
      </Section>
      <Section heading={loadScreenText.washer}>
        <RecordRow media={<DesignIcon name="washer" strokeWidth={1.6} />} title={washer.title} fact={washer.fact} issues={washerIssues.length === 0 ? undefined : washerIssues} />
      </Section>
      {extra}
      {view.stains.map((line) => <Callout key={line}>{line}</Callout>)}
      {settingsNotes.map((text) => <Note key={text}>{text}</Note>)}
      {view.why === null ? null : <Note>{loadText.whyTogether(view.why)}</Note>}
      {view.cautions.map((caution) => <Callout key={caution.text}>{caution.text}</Callout>)}
      {problems.length === 0 ? view.blockers.map((text) => <Callout key={text} tone="conflict">{text}</Callout>) : null}
      {otherClassNote === null ? null : <Note>{otherClassNote}</Note>}
      {!docked ? null : started ? <TaskFooter>{openLink}</TaskFooter> : pieces === 0 ? (
        <TaskFooter>
          <Button type="button" size="lg" className="w-full" disabled={pending || review.leftOut.length === 0} onClick={() => { const first = review.leftOut[0]; if (first !== undefined) onPutBack(first) }}>{loadReviewText.putClothesBack}</Button>
        </TaskFooter>
      ) : heldOnly ? null : blocked ? (
        <TaskFooter
          note={loadReviewText.oneOf(left, next?.compactLabel === undefined ? next?.issue ?? null : null)}
          secondary={pieces - heldPieces > 0 ? <FooterLink disabled={pending} onClick={onAtRoom}>{loadReviewText.pickWasher}</FooterLink> : undefined}
        >
          <Button type="button" size="lg" className="w-full px-[12px]" aria-label={next?.compactLabel === undefined ? undefined : next.label} disabled={pending || (next === null && onResolve === undefined)} onClick={next !== null ? next.onClick : onResolve}>
            {next !== null ? next.compactLabel ?? next.label : onResolve !== undefined ? loadText.answerFirst : loadScreenText.resolveOpen}
          </Button>
        </TaskFooter>
      ) : (
        <TaskFooter>
          <Button type="button" size="lg" className="w-full" disabled={pending} onClick={onAtRoom}>{loadScreenText.atRoom}</Button>
        </TaskFooter>
      )}
      {menu === null ? null : (
        <Sheet title={menu.name} onClose={() => setMenu(null)} closeLabel={loadText.cancel} compactActions>
          <ActionList label={menu.name} actions={[
            ...(allowMove ? Array.from({ length: loadCount }, (_, index) => index + 1).filter((group) => group !== view.number).map((group) => ({ key: `load-${group}`, label: loadText.moveTo(group), disabled: pending, onClick: () => { setMenu(null); onMove(menu.textileId, group) } })) : []),
            ...(allowMove ? [{ key: 'new', label: loadText.newLoad, disabled: pending, onClick: () => { setMenu(null); onMove(menu.textileId, loadCount + 1) } }] : []),
            { key: 'not', label: loadText.notThisTime, quiet: true, disabled: pending, onClick: () => { setMenu(null); onNotThisTime(menu.textileId) } },
          ]} />
        </Sheet>
      )}
    </>
  )
}
