import { Button } from '@/components/ui/button'
import { DesignIcon } from '@/kit/design-icons'
import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react'

import { loadText } from '@/copy'
import { loadReviewText } from '@/copy-load'
import { detergentText } from '@/copy-detergent'
import { washerPathText } from '@/copy-laundry'
import { isDetergentSupply, supplyForm, supplyRole } from '@/products/detergent-sheet'
import type { Supply } from '@/household/inventory-types'
import type { PlanLoad } from '@/laundry/laundry-pass'
import type { DoseLineView } from '@/laundry/load-card'
import { BackButton, Callout, ChangeCard, FooterLink, MachineEntry, Note, Section, StepsCard, TaskHeading, type MachineOption, washerEntryWords } from '@/laundry/laundry-ui'
import { IssueNote, RecordRow } from '@/kit/record-row'
import { TaskFooter } from '@/kit/task-footer'
import { DoseFigure } from '@/kit/ui'
import { blockingCount, type IssueAction, type SourceGroup } from '@/products/source-issues'

/**
 * At the machines: one load, the washer the person is at, its recipe, and the steps that lead to
 * Chemistry. Machines are chosen at the machine and nothing is reserved; in a shared room or a
 * laundromat the person types the number printed on it, with earlier washers as shortcuts only.
 * Confirming the recipe starts nothing, and See what goes in only opens the load's steps; the
 * wash is timed once "I've started" is tapped.
 */

export type WasherPathView = {
  readonly number: number
  readonly loadTitle: string
  readonly itemsLine: string
  /** A shared room or laundromat: the number is typed, and no washer is assumed. */
  readonly shared: boolean
  readonly place?: 'home' | 'shared' | 'laundromat' | 'both' | null
  /** The washer entered, or the home default, with the line that describes it. */
  readonly washer: { readonly label: string; readonly fact: string } | null
  /** Why the washer entered can't take this load, in words; null when it can. */
  readonly refusal: string | null
  /** The recipe on this washer, from the plan's recorded doses. */
  readonly recipe: readonly DoseLineView[]
  /** What changes against the planned washer's recipe, when this one is another kind. */
  readonly changes: readonly string[]
  readonly confirmed: boolean
  /** Arrival/confirmation is separate from permission to open this load's execution steps. */
  readonly ready?: boolean
  readonly requirements?: string | null
  readonly problems?: readonly SourceGroup[]
  /** "Products with you": what this load uses, then the other detergents, each can be marked "Ran out" here. */
  readonly products: readonly RoomProduct[]
  /** The load's one detergent and every other detergent that could be switched to; null when it has none. */
  readonly detergent: RoomDetergents | null
}

export type RoomProduct = {
  readonly supplyId: string
  readonly name: string
  /** The row's line: what it is for, "planned" for the load's detergent, its form. */
  readonly fact: string
  readonly detergent: boolean
  /** Marked "Ran out" in Household, so left out of plans until restocked. */
  readonly ranOut: boolean
  /** Recorded form controls the media; names never establish product facts. */
  readonly form?: string | null
}

export type RoomDetergents = {
  readonly chosenId: string | null
  readonly options: readonly { readonly supplyId: string; readonly name: string; readonly fits: boolean }[]
}

/**
 * The design's "Products with you": the products in this load's recipe, then the household's other
 * detergents; and, from the plan, the detergents the load could switch to and whether each fits.
 */
export function roomProducts(load: Pick<PlanLoad, 'treatments' | 'detergent'>, supplies: readonly Supply[]): Pick<WasherPathView, 'products' | 'detergent'> {
  const byId = new Map(supplies.map((supply) => [supply.supplyId as string, supply]))
  const chosenId = load.detergent?.chosenId ?? null
  const used = [...new Set(load.treatments.map((step) => step.supplyId as string))]
  const others = supplies.filter((supply) => supply.archived !== true && isDetergentSupply(supply) && !used.includes(supply.supplyId)).map((supply) => supply.supplyId as string)
  const products = [...used, ...others].flatMap((supplyId): RoomProduct[] => {
    const supply = byId.get(supplyId)
    if (supply === undefined) return []
    const fact = [supplyRole(supply), supplyId === chosenId ? detergentText.room.planned : null, supplyForm(supply)].filter((part) => part !== null).join(' · ')
    return [{ supplyId, name: supply.name, fact, form: supply.formulation?.form, detergent: isDetergentSupply(supply), ranOut: supply.ranOutAt !== null && supply.ranOutAt !== undefined }]
  })
  return {
    products,
    detergent: load.detergent === undefined ? null : {
      chosenId,
      options: load.detergent.options.flatMap((option) => {
        const supply = byId.get(option.supplyId)
        return supply === undefined ? [] : [{ supplyId: option.supplyId, name: supply.name, fits: option.fits }]
      }),
    },
  }
}

/** A washer the person may be at: its recorded name, the number printed on it. */
export type WasherOption = MachineOption

/** How much goes in, only when a record gives it; otherwise what is decided at the machine. */
export function doseTail(line: DoseLineView): ReactNode {
  if (line.kind === 'resolved') {
    return <><DoseFigure dose={line.dose} size="inline" />{line.line === null ? null : <span className="text-muted-foreground"> “{line.line}”</span>}</>
  }
  return line.kind === 'candidates' ? loadText.candidates : loadText.askAtMachine
}

/** One bottle of the recipe as a step line: where it goes, what it is, how much. */
export function recipeStepText(line: DoseLineView): ReactNode {
  return <>{line.slot}: {line.product} · {doseTail(line)}</>
}

export function WasherPathScreen({ view, pending, options, recent, onPick, onAddLabel, onNoNumber, onConfirm, onContinue, onBack, onRunAction, onRanOut, onSwitchDetergent, onUseAnother, onRestock, titleRef }: {
  view: WasherPathView
  pending: boolean
  /** Every washer the person may be at, the load's own kind first. Earlier washers are shortcuts only. */
  options: readonly WasherOption[]
  /** The washers this household used most recently, newest first: the only ones listed as "Used before". */
  recent?: readonly string[]
  /** The washer the person says they are at: the plan decides whether another kind needs a look first. */
  onPick: (machineId: string) => void
  /** A label typed at arrival becomes a new washer like the others in the room. */
  onAddLabel?: (name: string) => void
  /** "No number on it?": ask the kind instead. */
  onNoNumber?: () => void
  onConfirm: () => void
  onContinue: () => void
  onBack: () => void
  onRunAction?: (action: IssueAction) => void
  /** "Ran out" on an add-in (softener, booster...): left out of this load and later plans until restocked. */
  onRanOut?: (supplyId: string) => void
  /** "Switch to X" under a detergent that ran out; `ranOutId` is marked ran out as it switches. Nothing switches until chosen. */
  onSwitchDetergent?: (supplyId: string, ranOutId: string | null) => void
  /** "Use another detergent": opens the detergent sheet. */
  onUseAnother?: () => void
  /** "Have it" on a detergent marked ran out in Household. */
  onRestock?: (supplyId: string) => void
  titleRef?: Ref<HTMLHeadingElement>
}) {
  const { washer } = view
  const problems = view.problems ?? []
  const remaining = blockingCount(problems)
  const ready = (view.ready ?? true) && remaining === 0
  const notesFor = (groups: readonly SourceGroup[]) => groups.flatMap((group) => group.issues.map((issue) => (
    <IssueNote key={`${group.source.kind}:${group.source.id}:${issue.reasonId}`} kind={issue.kind} title={issue.title} detail={issue.detail} disabled={pending}
      actions={onRunAction === undefined ? [] : issue.actions.map((entry) => ({ label: entry.label, onClick: () => onRunAction(entry.action) }))} />
  )))
  const [changing, setChanging] = useState(false)
  // Detergents the person says she has none of here; the load's own stays planned until she chooses another.
  const [outHere, setOutHere] = useState<ReadonlySet<string>>(new Set())
  const toggleOut = (supplyId: string) => setOutHere((current) => {
    const next = new Set(current)
    if (!next.delete(supplyId)) next.add(supplyId)
    return next
  })
  const chosenId = view.detergent?.chosenId ?? null
  const chosenOut = chosenId !== null && (outHere.has(chosenId) || view.products.some((product) => product.supplyId === chosenId && product.ranOut))
  const switchable = (view.detergent?.options ?? []).filter((option) => option.supplyId !== chosenId && !outHere.has(option.supplyId))
  const conflict = (product: RoomProduct) => product.supplyId !== chosenId || !chosenOut ? undefined : (
    <IssueNote
      kind="conflict"
      disabled={pending}
      title={detergentText.room.ranOutTitle(product.name)}
      detail={switchable.some((option) => option.fits) ? detergentText.room.switchHint : switchable.length > 0 ? detergentText.room.noneFit : detergentText.room.noneInStock}
      actions={[
        ...(onSwitchDetergent === undefined ? [] : switchable.filter((option) => option.fits).map((option) => ({ label: detergentText.room.switchTo(option.name), onClick: () => { if (!pending) onSwitchDetergent(option.supplyId, product.supplyId) } }))),
        ...(onUseAnother === undefined ? [] : [{ label: detergentText.room.reviewOptions, onClick: () => { if (!pending) onUseAnother() } }]),
      ]}
    />
  )
  // One washer in a shared room: nothing to ask, it is the one in use.
  const onlyWasher = view.shared && options.length === 1 && washer === null && !changing && !pending ? options[0]!.machineId : null
  // Once per washer: a failed save leaves its one chip to tap instead of retrying.
  const autoPicked = useRef<string | null>(null)
  useEffect(() => {
    if (onlyWasher === null || autoPicked.current === onlyWasher) return
    autoPicked.current = onlyWasher
    onPick(onlyWasher)
  }, [onlyWasher]) // eslint-disable-line react-hooks/exhaustive-deps
  const entering = washer === null || changing
  const refused = !entering && view.refusal !== null
  const confirmed = !entering && !refused && view.confirmed
  const primary = washer === null || entering
    ? { label: washerPathText.enterWasher, onClick: () => undefined, disabled: true }
    : chosenOut
      ? { label: detergentText.room.chooseAbove, onClick: () => undefined, disabled: true }
    : refused
      ? { label: washerPathText.pickAnother, onClick: () => setChanging(true), disabled: false }
      : confirmed
        ? ready
          ? { label: washerPathText.continueToChemistry, onClick: onContinue, disabled: false }
          : { label: washerPathText.reviewRemaining, onClick: onBack, disabled: false }
        : { label: washerPathText.confirmShort, onClick: onConfirm, disabled: false }
  const pick = (machineId: string) => { setChanging(false); onPick(machineId) }
  const noNumber = entering && view.shared && onNoNumber !== undefined ? <FooterLink disabled={pending} onClick={onNoNumber}>{washerPathText.noNumber}</FooterLink> : null
  const another = problems.some((group) => group.issues.some((issue) => issue.held === true)) || entering || chosenOut || onUseAnother === undefined || view.detergent === null || view.detergent.options.length < 2 ? null : <FooterLink disabled={pending} onClick={onUseAnother}>{detergentText.useAnother}</FooterLink>
  return (
    <>
      <TaskHeading
        title={view.shared ? view.place === 'laundromat' ? washerPathText.titleLaundromat : washerPathText.titleShared : washerPathText.titleHome}
        back={<BackButton label={washerPathText.backToLoad} onClick={onBack} />}
        titleRef={titleRef}
        mark={washer !== null && confirmed ? { tone: ready ? 'ready' : 'waiting', text: washerPathText.confirmedFor(washer.label) } : washer !== null && refused ? { tone: 'conflict', text: washerPathText.cantTake(washer.label) } : { tone: 'waiting', text: entering ? washerPathText.whichWasher : washerPathText.recipeNotConfirmed }}
        caption={entering ? washerPathText.enterOnce : washerPathText.confirmingIsNotStartingShort}
      />
      <Note>{view.loadTitle} · {view.itemsLine}</Note>
      {view.requirements == null ? null : <Callout>{loadReviewText.requirements(view.requirements)}</Callout>}
      {washer === null || entering ? (
        <MachineEntry id="washer-label" words={view.place === 'laundromat' ? { ...washerEntryWords, shortcuts: washerPathText.laundromatShortcuts } : washerEntryWords} shared={view.shared} options={options} recent={recent} pending={pending} onPick={pick} onAddLabel={onAddLabel} />
      ) : (
        <Section heading={view.shared ? washerPathText.youAreUsing : washerPathText.homeHeading}>
          <RecordRow
            media={<DesignIcon name="washer" strokeWidth={1.6} />}
            title={washer.label}
            fact={washer.fact === '' ? undefined : washer.fact}
            trailing={view.shared && options.length === 1 ? undefined : <Button type="button" variant="tonal" size="sm" disabled={pending} onClick={() => setChanging(true)}>{washerPathText.changeWasher}</Button>}
            issues={view.refusal === null ? undefined : <IssueNote kind="conflict" title={washerPathText.cantTake(washer.label)} detail={view.refusal} disabled={pending} actions={[{ label: washerPathText.pickAnother, onClick: () => setChanging(true) }]} />}
          />
        </Section>
      )}
      {entering || refused ? (
        <Note>{washerPathText.steps}</Note>
      ) : null}
      {notesFor(problems.filter((group) => group.source.kind !== 'product' || !view.products.some((product) => product.supplyId === group.source.id)))}
      {view.products.length === 0 ? null : (
        <Section heading={detergentText.room.heading} caption={detergentText.room.caption}>
          {view.products.map((product) => {
            const out = product.ranOut || (product.detergent && outHere.has(product.supplyId))
            const action = product.detergent
              ? { label: out ? detergentText.room.haveIt : detergentText.room.ranOut, onClick: () => (product.ranOut ? onRestock?.(product.supplyId) : toggleOut(product.supplyId)), disabled: product.ranOut && onRestock === undefined }
              : onRanOut === undefined ? null : { label: detergentText.room.ranOut, onClick: () => onRanOut(product.supplyId), disabled: false }
            return (
              <RecordRow key={product.supplyId} media={<DesignIcon name={product.form === 'spray' ? 'spray' : 'bottle'} strokeWidth={1.6} />} title={product.name} fact={product.fact}
                mark={out ? { tone: 'waiting', text: detergentText.room.ranOut } : undefined}
                trailing={action === null ? undefined : <Button type="button" variant="tonal" size="sm" disabled={pending || action.disabled} onClick={action.onClick}>{action.label}</Button>}
                issues={<>{notesFor(problems.filter((group) => group.source.kind === 'product' && group.source.id === product.supplyId))}{conflict(product)}</>} />
            )
          })}
        </Section>
      )}
      {entering || refused ? null : (
        <>
          {view.changes.length === 0 ? null : <ChangeCard heading={washerPathText.changesFrom(washerPathText.plannedWasher)} changes={view.changes.map((line) => ({ to: line }))} />}
          {view.recipe.length === 0 ? null : <StepsCard heading={washerPathText.recipePreview} note={view.confirmed ? washerPathText.confirmedNote : ''} steps={view.recipe.map((line) => ({ text: recipeStepText(line) }))} />}
        </>
      )}
      <TaskFooter
        note={pending ? <span role="status">{washerPathText.updating}</span> : entering ? undefined : confirmed && !ready ? remaining > 0 ? washerPathText.issuesLeft(remaining) : washerPathText.reviewBeforeWashing : washerPathText.nothingStarted}
        secondary={noNumber === null && another === null ? undefined : <>{noNumber}{another}</>}
      >
        <Button type="button" size="lg" className="w-full min-h-[48px] px-[12px] py-[12px]" aria-label={primary.label === washerPathText.confirmShort && washer !== null ? washerPathText.confirmRecipe(washer.label) : undefined} disabled={pending || primary.disabled} onClick={primary.onClick}>{primary.label}</Button>
      </TaskFooter>
    </>
  )
}
