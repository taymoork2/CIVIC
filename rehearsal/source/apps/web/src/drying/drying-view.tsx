import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ItemGroup } from '@/components/ui/item'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { DesignIcon } from '@/kit/design-icons'
import { chooseDryerSetting, isKnit, careProcessRequirements, dryingProcessUnmatched, dryerContextSuggestion, dryerHeats, dryerTimeSuggestion, fitInDryer, midRunCheck, sha256, type MidRunPiece, type DryerStartingSuggestion, type DryingProcessContext, type DryerFit, type DryerHeat, type DryingMethod, type NaturalMethod } from '@washcloset/planner'
import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'

import type { Id } from '@convex/_generated/dataModel'
import { api } from '@/api'
import { keepPageFocusVisible } from '@/kit/app-shell'
import { colorWord, dryMethodText, dryingText, sessionText, sheetText } from '@/copy'
import { LoadCard, RunningRing } from '@/laundry/laundry-kit'
import { dryLabelWords, dryerBlocksText, dryerShareText, dryerWaitText, dryingDesignText, dryingRunText, listWords, midCheckText, noDryerText } from '@/copy-drying'
import { aboutTime, dryingFacts, homeDryer, rackFull, runEnd, satWetLong, type DryerNow } from '@/home/hub-state'
import { DryingMethodSheet, methodTag, type MethodChoice, type StainAnswer } from '@/drying/drying-method'
import { AnswerRow, BackButton, Callout, FooterLink, MachineEntry, Note, Section, SegmentChoice, StepsCard, QuantityStepper, SwitchRow, TaskHeading, TextField, TrialNote, matchMachine, useRecentMachines, dryerEntryWords } from '@/laundry/laundry-ui'
import { dryerWaitTrialText, trialText } from '@/copy-trial'
import { SymbolTile, SymbolTiles } from '@/laundry/question-parts'
import type { CareSymbolKind } from '@/closet/care-symbols'
import { RecordRow } from '@/kit/record-row'
import { TaskFooter } from '@/kit/task-footer'
import { TaskLayout } from '@/kit/task-layout'
import { useSteady } from '@/kit/use-steady'
import { ErrorNotice, Loading, clockTime, dryerHeatLabels, useConvexCall } from '@/kit/ui'
import { GarmentIcon } from '@/kit/garment-icon'
import { privateCareWords } from '@/laundry/private-piece'
import { privatePieceText } from '@/copy-load'
import { warnBeforeUnload } from '@/kit/sheet'
import { matchingGroups, type MatchingIdentity } from '@/closet/garment-groups'
import { LoadSummary, loadStageAt, washOrigins } from '@/laundry/load-summary'
import { useUnits, doseParts, dryerBlocks, money } from '@/kit/units'

export type DryingQueue = FunctionReturnType<typeof api.dryingQueue.queue>
type Piece = DryingQueue['pieces'][number]
type Dryer = DryingQueue['dryers'][number]

/** Injectable operations let visual fixtures use the shipped controls without saving records. */
export type DryingCalls = {
  setPiece: ReturnType<typeof useConvexCall<typeof api.dryingQueue.setPiece>>
  setPreference: ReturnType<typeof useConvexCall<typeof api.dryingQueue.setDryingPreference>>
  startAir: ReturnType<typeof useConvexCall<typeof api.dryingQueue.startAirDry>>
  start: ReturnType<typeof useConvexCall<typeof api.dryingQueue.startDryer>>
  addLabel: ReturnType<typeof useConvexCall<typeof api.inventory.addMachineLikeIt>>
  check: ReturnType<typeof useConvexCall<typeof api.dryingQueue.checkDry>>
  putAway: ReturnType<typeof useConvexCall<typeof api.dryingQueue.putAway>>
  answerStain?: ReturnType<typeof useConvexCall<typeof api.closet.answerStainCheck>>
  hang?: ReturnType<typeof useConvexCall<typeof api.dryingQueue.hangWhileDryerBusy>>
  remind?: ReturnType<typeof useConvexCall<typeof api.dryingQueue.remindWhenDone>>
}

/** "Dryer busy until about 4:10", or "Take out Dryer 1 first" once its time is up. */
export const dryerHeldWords = (dryer: Extract<DryerNow, { kind: 'busy' | 'done' }>) => dryer.kind === 'done' ? dryerWaitText.unloadFirst(dryer.name)
  : dryer.until === null ? dryerWaitText.isItFree : dryerWaitText.busyUntil(clockTime(aboutTime(dryer.until)))

/**
 * A washed load waiting while the home dryer still holds another of the household's loads. Busy:
 * "Hang them" while the rack has room (only pieces that may hang go; the rest keep waiting) and "Wait
 * for the dryer", a reminder at its end. Done: take that load out first. Never says a wait is safe.
 */
export function DryerWaitCallout({ dryer, rackIsFull, onHang, onWait, onUnload }: {
  dryer: Extract<DryerNow, { kind: 'busy' | 'done' }>
  rackIsFull: boolean
  /** Absent when nothing waiting may hang. */
  onHang?: () => void
  /** Absent when there is no timed run to remind at. */
  onWait?: () => void
  onUnload?: () => void
}) {
  if (dryer.kind === 'done') return <Callout actions={onUnload === undefined ? undefined : [{ label: dryerWaitText.checkDryness, onClick: onUnload }]}>{dryerHeldWords(dryer)}. {dryerWaitText.thenMoveIn}</Callout>
  const hang = !rackIsFull && onHang !== undefined
  const reminder = dryer.reminded && dryer.until !== null ? ` ${dryerWaitText.remindAt(clockTime(aboutTime(dryer.until)))}` : ''
  return <>
    <Callout actions={[...(hang ? [{ label: dryerWaitText.hang, onClick: onHang }] : []), ...(!dryer.reminded && onWait !== undefined ? [{ label: dryerWaitText.wait, onClick: onWait }] : [])]}>
      {dryerHeldWords(dryer)}. {rackIsFull ? dryerWaitText.rackFull : hang ? dryerWaitText.hangOrWait : ''}{reminder}
    </Callout>
    {dryer.until === null ? null : <TrialNote>{dryerWaitTrialText.busyUntil(dryer.source)}</TrialNote>}
    {hang || rackIsFull ? <TrialNote>{dryerWaitTrialText.rack}</TrialNote> : null}
  </>
}

/** "It sat wet a long time": after about six hours wet, or overnight. */
export function SmellCheck() {
  return <>
    <Callout>{dryerWaitText.smell}</Callout>
    <TrialNote>{dryerWaitTrialText.smell}</TrialNote>
  </>
}

/** What the drying page says after "Stain gone?": the dryer is offered only when a hold was actually released. */
export function stainAnswerNote(answer: StainAnswer, changed: number): string | null {
  if (answer !== 'gone') return dryMethodText.stain.stayedNote
  return changed > 0 ? dryMethodText.stain.goneNote : null
}

/** Which drying screen is open: the plan, one planned load at the dryer, a dryness check, or put-away. */
export type DryingScreen =
  | { readonly kind: 'plan' }
  | { readonly kind: 'dryer'; readonly number: number; readonly heat: DryerHeat | null; readonly pieceIds: readonly string[]; readonly dryerId?: string }
  | { readonly kind: 'check'; readonly runId: string }
  | { readonly kind: 'putaway' }

const pageClassName = 'page grid gap-5 max-w-[36rem] mx-auto pt-2'

/** Use the app's full-row disclosure target for optional settings and reminders. */
function DryingGuidance({ title, children }: { title: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  return <ItemGroup>
    <RecordRow media={<DesignIcon name="gear" strokeWidth={1.6} />} title={title} label={title} expanded={expanded} onOpen={() => setExpanded((value) => !value)} />
    {expanded ? <li className="grid gap-3 px-4 pb-4 text-[length:var(--step--1)] text-muted-foreground">{children}</li> : null}
  </ItemGroup>
}

/** Every queued method has the same anatomy: settings, quantity, next action, then clothes. */
function DryingLoadCard({ id, title, caption, action, children }: { id: string; title: string; caption: string; action: ReactNode; children: ReactNode }) {
  return <section aria-labelledby={id} className="min-w-0 [container-type:inline-size] rounded-card bg-card shadow-[var(--shadow-sm)]">
    <header className="flex min-w-0 flex-wrap items-center gap-3 p-4">
      <div className="grid min-w-0 flex-[1_1_10rem] gap-1">
        <h2 id={id} className="m-0 text-[length:var(--step-2)] font-semibold leading-[1.3] [overflow-wrap:anywhere]">{title}</h2>
        <p className="m-0 text-[length:var(--step--1)] leading-[1.45] text-muted-foreground">{caption}</p>
      </div>
      {action}
    </header>
    <ItemGroup className="rounded-t-none shadow-none [border-block-start:1px_solid_var(--line)]">{children}</ItemGroup>
  </section>
}

const loadActionClassName = 'min-h-12 max-w-full flex-none py-2 text-[length:var(--step-0)] [@container_(width_<_20rem)]:w-full'

/** Name the contents, rather than promoting an arbitrary planner index to a title. */
function loadContents(pieces: readonly Piece[]): string {
  if (pieces.length > 0 && pieces.every((piece) => piece.kind === 'towel')) return dryingDesignText.towels
  if (pieces.length > 0 && pieces.every((piece) => piece.kind === 'sheets')) return dryingDesignText.bedLinen
  return dryingDesignText.clothes
}

/** The dryer-dot care symbol for each heat setting. */
const heatSymbol: Record<DryerHeat, CareSymbolKind> = { no_heat: 'tumble_dry_no_heat', delicate: 'tumble_dry_low', low: 'tumble_dry_low', medium: 'tumble_dry_medium', high: 'tumble_dry_high' }

const heatRank = (heat: string): number => dryerHeats.indexOf(heat as DryerHeat)
const heatWords = (heat: string | null): string => (heat === null ? dryingText.heatNotSet : dryerHeatLabels[heat as DryerHeat] ?? heat)

/** "3 pieces", with the fit when it was not checked or is over: never "fits" by assumption. */
export function fitCaption(count: number, fit: DryerFit): string {
  return [dryingText.pieces(count), fit === 'not_checked' ? dryingText.fitNotChecked : fit === 'over' ? dryingText.overCapacity : null].filter((part) => part !== null).join(' · ')
}

const shareClassName = cn(
  'dryer-share',
  'grid min-w-0 gap-2 rounded-card bg-surface p-4 shadow-[var(--shadow-sm)]',
)

const shareTitleClassName = cn(
  'dryer-share-title',
  'm-0 text-[length:var(--step-1)] font-semibold leading-[1.3] [overflow-wrap:anywhere]',
)

const shareDetailClassName = cn(
  'dryer-share-detail',
  'm-0 max-w-none text-[length:var(--step-0)] leading-normal text-ink-2 [overflow-wrap:anywhere]',
)

// Both choices wrap onto two rows when the text is large, rather than pushing the page sideways.
const shareChoicesClassName = cn(
  'dryer-share-choices',
  'flex-wrap',
)

const shareChoiceClassName = cn(
  'dryer-share-choice',
  'min-w-0 flex-[1_1_8rem] whitespace-normal py-2 text-center',
)

const shareHangClassName = cn(
  'dryer-share-hang',
  'min-h-12 justify-self-start whitespace-normal py-2 text-start text-[length:var(--step-0)]',
)

/**
 * What the sharing line may say about the dryers it is planned for (design 8.2): "sure" fit only for an
 * observed or verified size; money only in a shared room priced per start on a fixed program, never
 * for time-block pricing, where one more block may be needed; "damp" on a sensor program.
 */
export function shareFacts(queue: DryingQueue): { readonly fit: 'sure' | 'should' | 'unchecked'; readonly price: string | null; readonly sensor: boolean } {
  const home = queue.dryers.find((dryer) => dryer.machineId === queue.homeDryerId) ?? null
  const planned = home !== null ? [home] : queue.dryers.filter((dryer) => dryer.capacityUnits === queue.capacityUnits)
  const fit = queue.capacityUnits === null ? 'unchecked' : planned.length > 0 && planned.every((dryer) => dryer.capacityConfidence === 'observed' || dryer.capacityConfidence === 'verified') ? 'sure' : 'should'
  const shared = queue.dryers.filter((dryer) => dryer.location === 'shared')
  const price = shared[0]?.pricePerStart ?? null
  const perStart = home === null && price !== null && shared.every((dryer) => dryer.pricePerStart === price && dryer.blockMinutes === undefined && dryer.programTime?.mode === 'fixed')
  return { fit, price: perStart ? money(price, 'USD') : null, sensor: (home === null ? shared : planned).some((dryer) => dryer.programTime?.mode === 'sensor') }
}

/**
 * "1 dryer run instead of 2" (design 8.2, 8.3, 9.3): an equal option beside "Separate by heat", which
 * stays the default. Likely-knit pieces that would tumble the whole shared run get "Hang the tees".
 */
export function DryerShareLine({ queue, share, combine, onCombine, onHang, hanging = false }: {
  queue: DryingQueue
  share: NonNullable<DryingQueue['share']>
  combine: boolean
  onCombine: (combine: boolean) => void
  onHang: (pieceIds: readonly string[], words: string) => void
  hanging?: boolean
}) {
  const titleId = useId()
  const facts = shareFacts(queue)
  const words = dryerShareText.knitWords(share.knitIds.map((id) => queue.pieces.find((piece) => piece.pieceId === id)?.kind ?? ''))
  return <section className={shareClassName} aria-labelledby={titleId}>
    <h2 id={titleId} className={shareTitleClassName}>{dryerShareText.runs(share.together, share.separate, facts.fit)}</h2>
    <p className={shareDetailClassName}>{dryerShareText.detail(share.heat)}{facts.sensor ? ` ${dryerShareText.damp}` : ''}</p>
    {facts.price === null ? null : <p className={shareDetailClassName}>{dryerShareText.lessToStart(facts.price)}</p>}
    <RadioGroup variant="segment" aria-label={dryerShareText.label} className={shareChoicesClassName} value={combine ? 'low' : 'split'} onValueChange={(value) => onCombine(value === 'low')}>
      <RadioGroupItem variant="segment" value="split" className={shareChoiceClassName}>{dryingText.separateByHeat}</RadioGroupItem>
      <RadioGroupItem variant="segment" value="low" className={shareChoiceClassName}>{dryerShareText.allOn(share.heat)}</RadioGroupItem>
    </RadioGroup>
    {share.knitIds.length === 0 ? null : <>
      <p className={shareDetailClassName}>{dryerShareText.knit(words)}</p>
      <Button variant="outline" size="sm" type="button" className={shareHangClassName} disabled={hanging} onClick={() => onHang(share.knitIds, words)}>{dryerShareText.hang(words)}</Button>
    </>}
    <TrialNote>{dryerWaitTrialText.share}</TrialNote>
  </section>
}

/** The dryer a label typed at the machine names: the same words, or the same number ("14" finds "Dryer 14"). */
export function matchDryer(dryers: readonly Pick<Dryer, 'machineId' | 'name'>[], typed: string): string | null {
  return matchMachine(dryers, typed)?.machineId ?? null
}

/** A queued piece as `midRunCheck` reads it: the tag's heat, not My routine's (design 8.4). */
export function midRunPiece(piece: Pick<Piece, 'pieceId' | 'bulkUnits' | 'kind' | 'maxHeat' | 'labelMaxHeat' | 'routine'>): MidRunPiece {
  return { id: piece.pieceId, bulkUnits: piece.bulkUnits, kind: piece.kind, labelHeat: piece.labelMaxHeat === undefined ? piece.maxHeat : piece.labelMaxHeat,
    routine: piece.routine?.method === 'tumble' && piece.routine.heat !== undefined }
}

/** "Blue tee, Gray polo": the pieces a check names, each garment once. */
export const pieceNames = (pieces: readonly Pick<Piece, 'name'>[]) => [...new Set(pieces.map((piece) => piece.name ?? dryingText.pieces(1)))].join(', ')

/** A running row's mark: the mid-run check first ("Check in 12 min", "Check now: Blue tee"), then the end. */
export function runMark(run: Pick<DryingQueue['runs'][number], 'startedAt' | 'minutes' | 'check'>, names: string, now: number): string {
  const left = run.minutes === null ? null : Math.min(run.minutes, Math.max(0, Math.ceil((run.startedAt + run.minutes * 60_000 - now) / 60_000)))
  if (left === null) return dryingText.checkWhenDry
  if (left === 0) return dryingText.timeUp
  if (run.check === undefined || run.check.missed) return dryingText.minutesLeft(left)
  const toCheck = Math.ceil((run.check.at - now) / 60_000)
  return toCheck > 0 ? midCheckText.checkIn(toCheck) : midCheckText.checkNow(names)
}

/**
 * What goes into the dryer entered at the machine: this planned load's pieces in order while they
 * fit its recorded capacity, and only this load's overflow stays queued. Other loads are not shown.
 */
export function dryerLoadView(pieces: readonly Pick<Piece, 'pieceId' | 'bulkUnits'>[], dryer: Pick<Dryer, 'capacityUnits'> | null) {
  const fit = fitInDryer(pieces.map((piece) => ({ id: piece.pieceId, bulkUnits: piece.bulkUnits })), dryer?.capacityUnits ?? null)
  return dryer === null ? { going: pieces.map((piece) => piece.pieceId), staying: [] as string[], fit: 'not_checked' as DryerFit } : { going: [...fit.going], staying: [...fit.staying], fit: fit.fit }
}

/** The dryer's own button words for the hottest setting every piece allows; null when it has none low enough. */
export function dryerSetting(dryer: Pick<Dryer, 'heatSettings'>, heat: DryerHeat): string | null {
  return chooseDryerSetting(dryer.heatSettings, heat)?.setting.label ?? null
}

function PieceMedia({ piece }: { piece: Piece }) {
  return <GarmentIcon kind={piece.kind} colorGroup={piece.colorGroup} />
}

/** One garment row: its name and the washer it came out of, kept through drying and put-away. */
function PieceRow({ piece, count, fact, onOpen, trailing, mark, issues }: { piece: Piece; count?: number; fact?: string; onOpen?: () => void; trailing?: ReactNode; mark?: Parameters<typeof RecordRow>[0]['mark']; issues?: ReactNode }) {
  const title = piece.private ? privatePieceText.pieces(count ?? 1) : piece.name ?? dryingText.pieces(count ?? 1)
  const detail = [piece.private ? privateCareWords(piece.privateCare) : piece.name !== null && count !== undefined ? dryingText.pieces(count) : null, fact ?? dryingText.fromWasher(piece.washerName)].filter((part) => part !== null).join(' · ')
  return <RecordRow media={<PieceMedia piece={piece} />} title={title} fact={detail} onOpen={onOpen} trailing={trailing} mark={mark}
    label={onOpen === undefined ? undefined : `${title}, ${detail}`} issues={issues} />
}

/** What a piece looks like: unnamed pieces keep their own id, so they never merge. */
const pieceIdentity = (piece: Piece): MatchingIdentity => piece.private ? { name: `private:${privateCareWords(piece.privateCare)}` } : ({ name: piece.name ?? piece.pieceId, color: piece.color, colorGroup: piece.colorGroup, guest: piece.guest === true })

/**
 * Matching pieces as one row: separate garments that look the same (`garmentKey`) and would dry the
 * same way. Anything that genuinely differs here keeps them apart: washer, status, method and where
 * it came from, the label and its instructions, a routine and whose routine it is (only the owner can
 * clear it, so a group never spans two owners' routines), a priority, the run and the dryer, or an
 * own load. The server refuses a group choice across different labels, so these facts must split first.
 */
export function pieceGroups(pieces: readonly Piece[]): Piece[][] {
  return matchingGroups(pieces,
    pieceIdentity,
    (piece) => [piece.washerName, piece.status, piece.method, piece.source, piece.preference, piece.evidence, piece.label, piece.maxHeat,
      piece.instructionRevision ?? null, piece.noSpinRecorded === true, piece.routineRevision ?? null, piece.routineLabelHash ?? null, piece.routineOwner ?? null, piece.routineNeedsReview === true,
      piece.need, piece.dryingRunId, piece.driedIn, piece.own],
  ).map((group) => [...group.members])
}

function instructionKey(pieces: readonly Piece[], stage: 'beforeDrying' | 'afterDrying'): string {
  return `${stage}:${labelInstructionsToken(pieces)}:${JSON.stringify(pieces.map((piece) => [piece.pieceId, piece.method, piece.noSpinRecorded ?? false]).sort())}`
}

function labelInstructionsToken(pieces: readonly Piece[]): string {
  return sha256(JSON.stringify(pieces.map((piece) => [piece.pieceId, piece.instructionRevision ?? null]).sort(([a], [b]) => String(a).localeCompare(String(b)))))
}

export function requiresDryingAcknowledgment(pieces: readonly Piece[]): boolean {
  return pieces.some((piece) => (piece.instructions?.beforeDrying.length ?? 0) + (piece.instructions?.drying.length ?? 0) > 0)
}

export function dryingRequirementsReady(pieces: readonly Piece[], method?: DryingMethod, process: DryingProcessContext = {}): boolean {
  return pieces.every((piece) => piece.routineNeedsReview !== true
    && dryingProcessUnmatched(piece.instructions, method ?? piece.method ?? '', process).length === 0
    && (!careProcessRequirements(piece.instructions, 'drying').requirements.some((entry) => entry.kind === 'drip_dry') || piece.noSpinRecorded === true))
}

function LabelDryingInstructions({ pieces, stage, acknowledged, onAcknowledge, method, process = {}, onProcess }: { pieces: readonly Piece[]; stage: 'beforeDrying' | 'afterDrying'; acknowledged: boolean; onAcknowledge: (value: boolean) => void; method?: DryingMethod; process?: DryingProcessContext; onProcess?: (value: DryingProcessContext) => void }) {
  const required = pieces.filter((piece) => (piece.instructions?.[stage].length ?? 0) + (stage === 'beforeDrying' ? piece.instructions?.drying.length ?? 0 : 0) > 0)
  const unmatched = stage === 'beforeDrying' ? pieces.filter((piece) => !dryingRequirementsReady([piece], method, process)) : []
  const conditions = stage === 'beforeDrying' ? pieces.flatMap((piece) => careProcessRequirements(piece.instructions, 'drying').requirements) : []
  const changedRoutines = stage === 'beforeDrying' ? pieces.filter((piece) => piece.routineNeedsReview === true) : []
  if (required.length === 0 && unmatched.length === 0 && changedRoutines.length === 0) return null
  return <div className="grid min-w-0 gap-3 rounded-control bg-surface-2 p-3">
    <p className="m-0 font-semibold">{stage === 'beforeDrying' ? 'Label instructions before drying' : 'Label instructions when removing it'}</p>
    {pieceGroups(required).map((group) => <div key={group[0]!.pieceId} className="grid gap-1 break-words"><p className="m-0">{group[0]!.name ?? 'This garment'}{group.length > 1 ? ` ×${group.length}` : ''}</p><ul className="m-0 ps-5">{[...new Set([...group[0]!.instructions![stage], ...(stage === 'beforeDrying' ? group[0]!.instructions!.drying : [])])].map((wording) => <li key={wording}>{wording}</li>)}</ul></div>)}
    {onProcess === undefined ? null : ([['shade', 'shade', 'This drying place is in shade'], ['no_direct_heat', 'noDirectHeat', 'This drying place is away from direct heat'], ['drip_dry', 'drip', 'These pieces are drying without extraction or wringing']] as const).filter(([kind]) => conditions.some((entry) => entry.kind === kind)).map(([kind, key, wording]) => <label key={kind} className="flex min-h-11 items-center gap-3"><Checkbox checked={process[key] === true} onCheckedChange={(value) => onProcess({ ...process, [key]: value === true })} /><span>{wording}</span></label>)}
    {unmatched.filter((piece) => (piece.instructions?.drying.length ?? 0) > 0).map((piece) => {
      const incompatible = careProcessRequirements(piece.instructions, 'drying').unresolved.length === 0 && dryingProcessUnmatched(piece.instructions, method ?? piece.method ?? '', { shade: true, drip: true, noDirectHeat: true }).length > 0
      return <p key={piece.pieceId} role="status" className={`m-0 rounded-control p-3 break-words ${incompatible ? 'bg-conflict-bg text-conflict-ink' : 'bg-hamper-bg text-hamper-ink'}`}>{piece.name ?? 'This garment'} needs its recorded drying process: {piece.instructions!.drying.join('; ')}. Match the method and required conditions before starting.{careProcessRequirements(piece.instructions, 'drying').requirements.some((entry) => entry.kind === 'drip_dry') && piece.noSpinRecorded !== true ? ' This wash has no recorded no-spin process.' : ''}</p>
    })}
    {changedRoutines.map((piece) => <p key={piece.pieceId} role="status" className="m-0 text-conflict-ink break-words">{piece.name ?? 'This garment'}: Wash & dry preferences need review after a label change. Choose a drying method for this event using the current label limits.</p>)}
    {required.length === 0 ? null : <label className="flex min-h-11 items-center gap-3"><Checkbox checked={acknowledged} onCheckedChange={(value) => onAcknowledge(value === true)} /><span>I’ve followed these label instructions</span></label>}
  </div>
}

/** The drying queue, read live for one household. */
export function Drying({ householdId, onBack, now, openRun }: { householdId: string; onBack: () => void; now: number; openRun?: string }) {
  const [combine, setCombine] = useState(false)
  // The size planned for in a shared room: undefined is the largest recorded, null is "Capacity unknown".
  const [capacity, setCapacity] = useState<number | null | undefined>(undefined)
  // Changing combine or size re-asks the query: keep the last queue meanwhile, so DryingView stays mounted with its unsaved checks.
  const live = useQuery(api.dryingQueue.queue, { householdId: householdId as Id<'households'>, combine, ...(capacity === undefined ? {} : { capacityUnits: capacity }) })
  const steady = useSteady(live === undefined ? undefined : { householdId, live })
  const queue = steady?.householdId === householdId ? steady.live : undefined
  if (queue === undefined) return <Loading what="the drying queue" />
  return <DryingView queue={queue} householdId={householdId} now={now} onBack={onBack} combine={combine} onCombine={setCombine} onCapacity={setCapacity} reloading={live === undefined} {...(openRun === undefined ? {} : { initialScreen: { kind: 'check', runId: openRun } as const })} />
}

export function DryingView({ queue, householdId, now, onBack, combine, onCombine, onCapacity, reloading = false, initialScreen = { kind: 'plan' }, initialDrafts = {}, calls, dryerProducts, durationSuggestion, recentDryers }: {
  queue: DryingQueue
  householdId: string
  now: number
  onBack: () => void
  combine: boolean
  onCombine: (combine: boolean) => void
  onCapacity: (capacity: number | null) => void
  /** A changed heat-combining or dryer-size choice is reloading: the queue shown is stale, so nothing starts from it. */
  reloading?: boolean
  initialScreen?: DryingScreen
  /** Unsaved dryness checks to start with, for visual fixtures and tests. */
  initialDrafts?: CheckDrafts
  calls?: DryingCalls
  dryerProducts?: FunctionReturnType<typeof api.dryingQueue.dryerProducts>
  durationSuggestion?: DryerStartingSuggestion
  /** The dryers this household used most recently, newest first, for visual fixtures; live, they are read. */
  recentDryers?: readonly string[]
}) {
  const [screen, setScreen] = useState<DryingScreen>(initialScreen)
  // Unsaved dryness checks by run: Back keeps them, so reopening a run restores its answers. Memory only.
  const [drafts, setDrafts] = useState<CheckDrafts>(initialDrafts)
  // A reload or closing the tab would drop these memory-only answers: the browser asks first.
  const unsavedChecks = hasUnsavedChecks(drafts)
  useEffect(() => warnBeforeUnload(window, unsavedChecks), [unsavedChecks])
  const plan = () => setScreen({ kind: 'plan' })
  const done = (message: string) => { toast(message); plan() }
  const byId = new Map(queue.pieces.map((piece) => [piece.pieceId as string, piece]))
  const props = { queue, householdId, byId, onPlan: plan, onDone: done, calls, dryerProducts, durationSuggestion, recentDryers, reloading }
  if (screen.kind === 'dryer') return <DryerScreen {...props} now={now} screen={screen} />
  if (screen.kind === 'check') {
    const runId = screen.runId
    const run = queue.runs.find((entry) => entry.runId === runId)
    const end = run === undefined ? null : runEnd(run)
    // Before a dryer's planned end it is the mid-run check: no extra minutes, the run keeps its time.
    const early = run !== undefined && run.kind === 'dryer' && end !== null && now < end
    if (early && run.check !== undefined && !run.check.missed) return <MidCheckScreen {...props} now={now} run={run} />
    return <CheckScreen {...props} now={now} early={early} runId={runId} draft={drafts[runId]} onDraft={(draft) => setDrafts((current) => withCheckDraft(current, runId, draft))} onPutAway={() => setScreen({ kind: 'putaway' })} />
  }
  if (screen.kind === 'putaway') return <PutAwayScreen {...props} />
  return <PlanScreen {...props} now={now} onNote={toast} onBack={onBack} combine={combine} onCombine={onCombine} onCapacity={onCapacity} onScreen={setScreen} unsaved={drafts} />
}

/** Unsaved dryness checks exist: leaving the drying page asks before dropping them. */
export const hasUnsavedChecks = (drafts: CheckDrafts) => Object.keys(drafts).length > 0

/** The plan screen's Back: straight out with nothing unsaved, otherwise ask first. Nothing is saved. */
export function planBack(unsaved: CheckDrafts, leave: () => void, confirm: () => void): void {
  if (hasUnsavedChecks(unsaved)) confirm()
  else leave()
}

/** The same "Discard your changes?" question as a sheet's Back, for leaving with unsaved checks. */
export function DiscardChecksCallout({ onKeep, onDiscard }: { onKeep: () => void; onDiscard: () => void }) {
  return <Callout tone="conflict" role="alert" actions={[
    { label: sheetText.keepEditing, onClick: onKeep },
    { label: sheetText.discard, onClick: onDiscard },
  ]}>{sheetText.discardTitle}</Callout>
}

type ScreenProps = { queue: DryingQueue; householdId: string; byId: Map<string, Piece>; onPlan: () => void; onDone: (message: string) => void; calls?: DryingCalls; dryerProducts?: FunctionReturnType<typeof api.dryingQueue.dryerProducts>; durationSuggestion?: DryerStartingSuggestion; recentDryers?: readonly string[]; reloading?: boolean }

function PlanScreen({ queue, householdId, byId, now, onNote, onBack, combine, onCombine, onCapacity, onScreen, unsaved, calls, reloading = false }: ScreenProps & {
  now: number
  onNote: (note: string) => void
  onBack: () => void
  combine: boolean
  onCombine: (combine: boolean) => void
  onCapacity: (capacity: number | null) => void
  onScreen: (screen: DryingScreen) => void
  unsaved: CheckDrafts
}) {
  const connectedSetPiece = useConvexCall(api.dryingQueue.setPiece)
  const connectedSetPreference = useConvexCall(api.dryingQueue.setDryingPreference)
  const connectedStartAir = useConvexCall(api.dryingQueue.startAirDry)
  const connectedAnswerStain = useConvexCall(api.closet.answerStainCheck)
  const setPiece = calls?.setPiece ?? connectedSetPiece
  const answerStain = calls?.answerStain ?? connectedAnswerStain
  const setPreference = calls?.setPreference ?? connectedSetPreference
  const startAir = calls?.startAir ?? connectedStartAir
  const connectedHang = useConvexCall(api.dryingQueue.hangWhileDryerBusy)
  const connectedRemind = useConvexCall(api.dryingQueue.remindWhenDone)
  const hang = calls?.hang ?? connectedHang
  const remind = calls?.remind ?? connectedRemind
  const loadHeadingId = useId()
  const [sheet, setSheet] = useState<readonly string[] | null>(null)
  const [confirmingLeave, setConfirmingLeave] = useState(false)
  const [labelAcknowledgments, setLabelAcknowledgments] = useState<ReadonlySet<string>>(new Set())
  const [naturalProcesses, setNaturalProcesses] = useState<Readonly<Record<string, DryingProcessContext>>>({})
  const queued = queue.pieces.filter((piece) => piece.status === 'queued')
  const home = queue.dryers.find((dryer) => dryer.machineId === queue.homeDryerId) ?? null
  // The home dryer as the app tracked it; a shared room's dryers are never called free or busy.
  const facts = dryingFacts(queue)
  const homeNow = homeDryer([], facts, now)
  const held = homeNow === null || homeNow.kind === 'free' ? null : homeNow
  const tumbling = queued.filter((piece) => piece.method === 'tumble')
  const dry = queue.pieces.filter((piece) => piece.status === 'dry')
  const pieceOf = (id: string) => byId.get(id)!
  const openPieces = (sheet ?? []).map((id) => byId.get(id)).filter((piece): piece is Piece => piece?.status === 'queued')
  const open = openPieces[0] ?? null
  const save = (pieces: readonly Piece[], change: { own?: boolean; method?: DryingMethod | null; remember?: boolean; need?: MethodChoice['need'] }) => setPiece.run({ pieceId: pieces[0]!.pieceId, pieceIds: pieces.map((piece) => piece.pieceId), ...change })
  /** "Hang the tees": a one-time hang for each washer's pieces (`setPiece` takes one washer at a time). */
  const hangKnit = async (ids: readonly string[]) => {
    const pieces = ids.map((id) => byId.get(id)).filter((piece): piece is Piece => piece?.status === 'queued')
    for (const washer of new Set(pieces.map((piece) => piece.washerName))) {
      if (await save(pieces.filter((piece) => piece.washerName === washer), { method: 'rack_line' }) === undefined) return false
    }
    return pieces.length > 0
  }
  /** "Follow label again": drop the remembered method and any this-time-only one, then replan. */
  const followLabel = async (piece: Piece) => {
    if (piece.routine !== undefined || piece.routineNeedsReview === true) {
      const done = await setPiece.run({ pieceId: piece.pieceId, pieceIds: openPieces.map((entry) => entry.pieceId), followLabel: true,
        expectedRoutineRevision: piece.routineRevision, expectedLabelHash: piece.routineLabelHash })
      if (done === undefined) return
      setSheet(null)
      onNote(dryingDesignText.method.notes.followsLabel)
      return
    }
    const done = await setPreference.run({ textileId: piece.textileId, textileIds: [...new Set(openPieces.map((entry) => entry.textileId))], method: null })
    if (done === undefined) return
    if (piece.source === 'once' && await save(openPieces, { method: null }) === undefined) return
    setSheet(null)
    onNote(dryingDesignText.method.notes.followsLabel)
  }
  const fact = (piece: Piece) => [dryingText.fromWasher(piece.washerName),
    piece.method !== null && piece.source !== 'label' ? `${dryMethodText.methods[piece.method]} · Label: ${dryLabelWords(piece.label, piece.maxHeat)}` : dryLabelWords(piece.label, piece.maxHeat),
    methodTag(piece.source, piece.evidence)].filter((part) => part.length > 0).join(' · ')
  const needMark = (piece: Piece) => (piece.need === null ? undefined : { tone: 'waiting' as const, text: dryMethodText.needs[piece.need] })
  const row = (pieces: Piece[]) => <PieceRow key={pieces[0]!.pieceId} piece={pieces[0]!} count={pieces.length} fact={fact(pieces[0]!)} mark={needMark(pieces[0]!)} onOpen={() => setSheet(pieces.map((piece) => piece.pieceId))} />
  const needs = queued.filter((piece) => piece.need !== null)
  const natural = (method: NaturalMethod) => queue.plan.natural.filter((entry) => entry.method === method).map((entry) => pieceOf(entry.pieceId))
  const hanging = natural('heated_hanging')
  const line = natural('rack_line')
  const flat = natural('flat')
  const unset = queue.plan.unset.map(pieceOf)
  const hanger = queue.hangingDryers[0] ?? null
  const startNatural = (pieces: readonly Piece[], method: NaturalMethod) => void startAir.run({
    householdId: householdId as Id<'households'>, pieceIds: pieces.map((piece) => piece.pieceId), method,
    ...(method === 'heated_hanging' && hanger !== null ? { machineId: hanger.machineId as Id<'machines'> } : {}),
    ...(naturalProcesses[instructionKey(pieces, 'beforeDrying')] === undefined ? {} : { process: naturalProcesses[instructionKey(pieces, 'beforeDrying')] }),
    ...(requiresDryingAcknowledgment(pieces) ? { labelInstructionsAcknowledged: labelAcknowledgments.has(instructionKey(pieces, 'beforeDrying')), labelInstructionsToken: labelInstructionsToken(pieces) } : {}),
  }).then((result) => { if (result !== undefined) onNote(dryingDesignText.airStarted(pieces.length)) })
  const labelReady = (pieces: readonly Piece[]) => dryingRequirementsReady(pieces, undefined, naturalProcesses[instructionKey(pieces, 'beforeDrying')]) && (!requiresDryingAcknowledgment(pieces) || labelAcknowledgments.has(instructionKey(pieces, 'beforeDrying')))
  const labelInstructions = (pieces: readonly Piece[]) => <LabelDryingInstructions pieces={pieces} stage="beforeDrying" process={naturalProcesses[instructionKey(pieces, 'beforeDrying')]} onProcess={(process) => {
    const key = instructionKey(pieces, 'beforeDrying')
    setNaturalProcesses((current) => ({ ...current, [key]: process }))
    setLabelAcknowledgments((current) => { const next = new Set(current); next.delete(key); return next })
  }} acknowledged={labelAcknowledgments.has(instructionKey(pieces, 'beforeDrying'))} onAcknowledge={(value) => setLabelAcknowledgments((current) => { const next = new Set(current); if (value) next.add(instructionKey(pieces, 'beforeDrying')); else next.delete(instructionKey(pieces, 'beforeDrying')); return next })} />

  return <div className={pageClassName}>
    <TaskHeading
      title={dryingText.title}
      back={<BackButton label={dryingText.back} onClick={() => planBack(unsaved, onBack, () => setConfirmingLeave(true))} />}
      caption={queued.length > 0 ? dryingDesignText.waitingCount(queued.length) : queue.runs.length > 0 ? dryingDesignText.dryingCount(queue.pieces.filter((piece) => piece.status === 'drying').length) : dry.length > 0 ? dryingText.dryToPutAway(dry.length) : dryingText.empty}
    />
    {confirmingLeave && hasUnsavedChecks(unsaved) ? <DiscardChecksCallout onKeep={() => setConfirmingLeave(false)} onDiscard={() => { setConfirmingLeave(false); onBack() }} /> : null}
    {queued.length > 0 && satWetLong(facts.wet.since, now) ? <SmellCheck /> : null}
    {held === null || tumbling.length === 0 ? null : <DryerWaitCallout dryer={held} rackIsFull={rackFull(facts)}
      onUnload={held.kind === 'done' ? () => { const run = queue.runs.find((entry) => entry.kind === 'dryer' && entry.dryerId === queue.homeDryerId); if (run !== undefined) onScreen({ kind: 'check', runId: run.runId }) } : undefined}
      onHang={() => { if (!hang.pending) void hang.run({ householdId: householdId as Id<'households'>, pieceIds: tumbling.map((piece) => piece.pieceId) }).then((result) => { if (result !== undefined) onNote(dryerWaitText.hungNote(result.hung.length, result.waiting.length)) }) }}
      onWait={held.kind === 'busy' && held.runId !== null && held.until !== null ? () => { if (!remind.pending) void remind.run({ runId: held.runId as Id<'dryingRuns'> }) } : undefined} />}
    {held === null ? null : <ErrorNotice error={hang.error ?? remind.error} />}
    {needs.length === 0 ? null : (
      <Callout>{dryingText.neededSoon(pieceGroups(needs).map((group) => `${group[0]!.name ?? dryingText.pieces(group.length)}${group[0]!.name === null ? '' : ` ×${group.length}`} (${dryMethodText.needShort[group[0]!.need!]})`).join(', '))}</Callout>
    )}
    {queue.share === undefined || queued.length === 0 ? null : <DryerShareLine queue={queue} share={queue.share} combine={combine} onCombine={onCombine} hanging={setPiece.pending || reloading}
      onHang={(ids, words) => void hangKnit(ids).then((done) => { if (done) onNote(dryerShareText.hung(words)) })} />}
    {queued.length === 0 ? null : <DryingGuidance title={dryingDesignText.loadOptions}>
    {queue.plan.mixedHeats && queue.share === undefined ? (
      <div className="grid gap-2">
        <span className="text-[length:var(--step-1)] font-semibold" id="dry-heat-label">{dryingText.heat}</span>
        <RadioGroup variant="segment" aria-labelledby="dry-heat-label" value={combine ? 'low' : 'split'} onValueChange={(value) => onCombine(value === 'low')}>
          <RadioGroupItem variant="segment" value="split" className="flex-1">{dryingText.separateByHeat}</RadioGroupItem>
          <RadioGroupItem variant="segment" value="low" className="flex-1">{dryingText.allOnLow}</RadioGroupItem>
        </RadioGroup>
      </div>
    ) : null}
    {home === null && queue.capacities.length > 0 && queue.plan.loads.length > 0 ? (
      <div className="grid gap-2">
        <span className="text-[length:var(--step-1)] font-semibold" id="dryer-size-label">{dryingText.planFor}</span>
        <RadioGroup variant="segment" aria-labelledby="dryer-size-label" value={queue.capacityUnits === null ? 'none' : String(queue.capacityUnits)} onValueChange={(value) => onCapacity(value === 'none' ? null : Number(value))}>
          {queue.capacities.map((size, index) => <RadioGroupItem variant="segment" key={size} value={String(size)} className="flex-1">{queue.dryers.filter((dryer) => dryer.capacityUnits === size).map((dryer) => dryer.name).join(', ') || dryingText.capacitySize(index)}</RadioGroupItem>)}
          <RadioGroupItem variant="segment" value="none" className="flex-1">{dryingText.capacityUnknown}</RadioGroupItem>
        </RadioGroup>
      </div>
    ) : null}
      <Note>{home === null ? dryingDesignText.introShared : dryingDesignText.introHome(queue.capacityUnits !== null)}</Note>
      <Note>{dryingDesignText.fitEstimate}</Note>
    </DryingGuidance>}
    {home === null && queue.capacities.length === 0 && queue.plan.loads.length > 0 ? <Callout>{dryingText.unknownTitle}. {dryingText.unknownDetail}</Callout> : null}

    {queue.plan.loads.map((load, index) => (
      <DryingLoadCard key={load.pieceIds.join(',')} id={`${loadHeadingId}-${index}`} title={loadContents(load.pieceIds.map(pieceOf))} caption={`${fitCaption(load.pieceIds.length, load.fit)} · ${heatWords(load.heat)}`}
        action={<Button variant="outline" size="sm" className={loadActionClassName} type="button" disabled={held !== null || reloading}
          onClick={() => onScreen({ kind: 'dryer', number: index + 1, heat: load.heat, pieceIds: load.pieceIds })}>{held !== null ? dryerHeldWords(held) : home === null ? dryingText.loadIntoADryer : dryingText.loadInto(home.name)}</Button>}>
        {pieceGroups(load.pieceIds.map(pieceOf)).map(row)}
      </DryingLoadCard>
    ))}

    {hanging.length === 0 ? null : (
      <DryingLoadCard id={`${loadHeadingId}-hanging`} title={dryingText.hangingTitle} caption={hanger === null ? dryingDesignText.hangingNone : dryingText.pieces(hanging.length)}
        action={<Button variant="outline" size="sm" className={loadActionClassName} aria-label={hanger === null ? dryingDesignText.hangingNone : dryingText.startHanging(hanger.name)} disabled={hanger === null || reloading || startAir.pending || !labelReady(hanging)} onClick={() => startNatural(hanging, 'heated_hanging')}>{dryingDesignText.beginDrying}</Button>}>
        {pieceGroups(hanging).map((group) => row(group))}
        {labelInstructions(hanging)}
      </DryingLoadCard>
    )}
    {line.length === 0 ? null : (
      <DryingLoadCard id={`${loadHeadingId}-line`} title={dryingText.lineTitle} caption={dryingText.pieces(line.length)}
        action={<Button variant="outline" size="sm" className={loadActionClassName} aria-label={dryingText.startLine(line.length)} disabled={startAir.pending || reloading || !labelReady(line)} onClick={() => startNatural(line, 'rack_line')}>{dryingDesignText.beginDrying}</Button>}>
        {pieceGroups(line).map((group) => row(group))}
        {labelInstructions(line)}
      </DryingLoadCard>
    )}
    {flat.length === 0 ? null : (
      <DryingLoadCard id={`${loadHeadingId}-flat`} title={dryingText.flatTitle} caption={dryingText.pieces(flat.length)}
        action={<Button variant="outline" size="sm" className={loadActionClassName} aria-label={dryingText.startFlat(flat.length)} disabled={startAir.pending || reloading || !labelReady(flat)} onClick={() => startNatural(flat, 'flat')}>{dryingDesignText.beginDrying}</Button>}>
        {pieceGroups(flat).map((group) => row(group))}
        {labelInstructions(flat)}
      </DryingLoadCard>
    )}
    {unset.length === 0 ? null : (
      <Section heading={dryingText.unsetTitle} caption={dryingText.unsetCaption}>{pieceGroups(unset).map((group) => row(group))}</Section>
    )}
    <ErrorNotice error={setPiece.error ?? startAir.error ?? setPreference.error ?? answerStain.error} />

    {queue.runs.length === 0 ? null : (
      <Section heading={dryingText.dryingNow}>
        {queue.runs.map((run) => {
          const flagged = pieceNames((run.check?.pieceIds ?? []).map((id) => byId.get(id)).filter((piece): piece is Piece => piece !== undefined))
          const names = [...new Set(run.pieceIds.map((id) => byId.get(id)?.name).filter((name) => name !== null && name !== undefined))].join(', ')
          return <RecordRow key={run.runId} media={<DesignIcon name={run.kind === 'air' ? 'hang' : 'dryer'} strokeWidth={1.6} />} title={runTitle(run)} fact={[unsaved[run.runId] === undefined ? null : dryingDesignText.unsavedCheck, dryingText.pieces(run.pieceIds.length), names].filter(Boolean).join(' · ')}
            mark={{ tone: 'drying', text: runMark(run, flagged, now) }} onOpen={() => onScreen({ kind: 'check', runId: run.runId })} />
        })}
      </Section>
    )}
    {dry.length === 0 ? null : (
      <Section label={dryingText.dryToPutAway(dry.length)}>
        <RecordRow media={<DesignIcon name="fold" strokeWidth={1.6} />} title={dryingText.dryToPutAway(dry.length)} mark={{ tone: 'ready', text: dryingText.dryMark }} onOpen={() => onScreen({ kind: 'putaway' })} />
      </Section>
    )}

    {open === null ? null : (
      <DryingMethodSheet key={open.pieceId} name={open.name ?? dryingText.pieces(1)} count={openPieces.length} kicker={dryingDesignText.method.fromWasher(open.washerName)}
        label={open.label} maxHeat={open.labelMaxHeat === undefined ? open.maxHeat : open.labelMaxHeat} current={open.method} preference={open.preference} routine={open.routine?.method ?? (open.routineNeedsReview ? open.method : null)} need={open.need} equipment={queue.equipment} own={open.own} pending={setPiece.pending || setPreference.pending}
        onOwn={() => { const split = !open.own; void save(openPieces, { own: split }).then((result) => { if (result !== undefined) { setSheet(null); onNote(split ? dryingDesignText.method.notes.split : dryingDesignText.method.notes.merged) } }) }}
        onFollowLabel={() => void followLabel(open)}
        {...(open.stained === true ? { onStainAnswer: (answer: StainAnswer) => void answerStain.run({ textileIds: openPieces.map((piece) => piece.textileId as Id<'textiles'>), answer })
          .then((result) => { if (result !== undefined) { setSheet(null); const note = stainAnswerNote(answer, result.changed); if (note !== null) onNote(note) } }) } : {})}
        onClose={() => setSheet(null)}
        onSave={(choice) => {
          const notes = dryingDesignText.method.notes
          void save(openPieces, { ...(choice.methodChanged ? { method: choice.method, remember: choice.remember } : {}), ...(choice.need !== open.need ? { need: choice.need } : {}) })
            .then((result) => { if (result !== undefined) { setSheet(null); onNote(choice.remember ? notes.remembered(open.name ?? dryingText.pieces(1)) : choice.methodChanged || choice.need !== open.need ? notes.replanned : notes.kept) } })
        }} />
    )}
  </div>
}

/** A running drying run's name: the dryer, the heated hanging dryer, or how it air dries. */
function runTitle(run: DryingQueue['runs'][number]): string {
  if (run.dryerName !== null) return run.dryerName
  if (run.kind === 'dryer') return dryingText.dryerTitle
  return run.method === 'flat' ? dryingText.flatTitle : run.method === 'rack_line' ? dryingText.lineTitle : dryingText.airDrying
}

/**
 * At the dryer: "Which dryer are you using?" right under the title, earlier labels as shortcuts, then
 * the garments going in, and only this load's pieces that won't fit stay queued.
 */
function DryerScreen({ queue, householdId, byId, now, onPlan, onDone, screen, calls, dryerProducts, durationSuggestion, recentDryers, reloading = false }: ScreenProps & { now: number; screen: Extract<DryingScreen, { kind: 'dryer' }> }) {
  const connectedStart = useConvexCall(api.dryingQueue.startDryer)
  const connectedAddLabel = useConvexCall(api.inventory.addMachineLikeIt)
  const connectedHang = useConvexCall(api.dryingQueue.hangWhileDryerBusy)
  const start = calls?.start ?? connectedStart
  const addLabel = calls?.addLabel ?? connectedAddLabel
  const hang = calls?.hang ?? connectedHang
  const [picked, setPicked] = useState<string | null>(screen.dryerId ?? queue.homeDryerId ?? (queue.dryers.length === 1 ? queue.dryers[0]!.machineId as string : null))
  // "None free" in a shared room: hang what may hang, or wait (design 11). The app never calls a dryer free.
  const [noneFree, setNoneFree] = useState(false)
  const [minutes, setMinutes] = useState('')
  // The dryers this household used most recently: the only ones offered as "Used before".
  const connectedRecent = useRecentMachines(householdId, calls !== undefined || recentDryers !== undefined)
  const recent = { dryers: recentDryers ?? connectedRecent.dryers }
  const pieces = screen.pieceIds.map((id) => byId.get(id)).filter((piece): piece is Piece => piece !== undefined && piece.status === 'queued')
  const dryer = queue.dryers.find((entry) => entry.machineId === picked) ?? null
  const baselineSuggestion = dryerTimeSuggestion(dryer?.programTime)
  const view = dryerLoadView(pieces, dryer)
  const going = view.going.map((id) => byId.get(id)!)
  const staying = view.staying.map((id) => byId.get(id)!)
  const [chosenHeat, setChosenHeat] = useState<DryerHeat | null>(null)
  const [products, setProducts] = useState<ReadonlySet<string>>(new Set())
  const [labelAcknowledgment, setLabelAcknowledgment] = useState<string | null>(null)
  const labelKey = instructionKey(going, 'beforeDrying')
  const hasLabelPreparation = requiresDryingAcknowledgment(going)
  const labelReady = dryingRequirementsReady(going, 'tumble') && (!hasLabelPreparation || labelAcknowledgment === labelKey)
  const connectedProducts = useQuery(api.dryingQueue.dryerProducts, calls !== undefined || view.going.length === 0 ? 'skip' : { householdId: householdId as Id<'households'>, pieceIds: view.going as Id<'dryingPieces'>[] })
  const productUses = dryerProducts ?? connectedProducts
  const { system } = useUnits()
  // A label that sets no heat for these pieces: no heat is assumed, the person picks one of this dryer's settings.
  const heatCeiling = screen.heat === null ? null : heatRank(screen.heat)
  const chosenSetting = dryer === null || dryer === undefined ? undefined
    : heatCeiling === null ? { setting: dryer.heatSettings.find((entry) => entry.heat === chosenHeat), note: null }
    : chooseDryerSetting(dryer.heatSettings, screen.heat!)
  const selectedSetting = chosenSetting?.setting
  const settingNote = chosenSetting?.note ?? null
  const setting = selectedSetting?.label ?? null
  const actualHeat = selectedSetting?.heat
  const connectedSuggestion = useQuery(api.dryingQueue.durationContext, calls !== undefined || durationSuggestion !== undefined || dryer === null || going.length === 0 || going.length > 96 ? 'skip' : {
    householdId: householdId as Id<'households'>, dryerId: dryer.machineId, pieceIds: going.map((piece) => piece.pieceId),
    ...(actualHeat === undefined ? {} : { heat: actualHeat }), productIds: [...products] as Id<'supplies'>[],
  })
  const refined = durationSuggestion ?? connectedSuggestion
  const waitingForContext = calls === undefined && durationSuggestion === undefined && dryer !== null && going.length > 0 && going.length <= 96 && connectedSuggestion === undefined
  const timeSuggestion = refined !== null && refined !== undefined && 'version' in refined ? refined : null
  const programFallback = dryerContextSuggestion(dryer?.programTime, { key: null, pieceCount: going.length, bulkUnits: going.reduce((sum, piece) => sum + piece.bulkUnits, 0),
    capacityUnits: dryer?.capacityUnits ?? null, capacityConfidence: 'unknown', extraction: [] }, [],
    { enabled: false, resetAt: 0, historyTruncated: false, negativeHistoryTruncated: false, now: 0 })
  const suggestedMinutes = waitingForContext ? null : timeSuggestion?.minutes ?? (timeSuggestion === null ? programFallback.minutes : null)
  const shared = queue.homeDryerId === null
  const rackIsFull = rackFull(dryingFacts(queue))
  // One of the household's own loads still in this dryer: at home it can't start again until that load is out.
  const ownRun = dryer === null ? undefined : queue.runs.find((run) => run.kind === 'dryer' && run.dryerId === dryer.machineId)
  const ownEnd = ownRun === undefined ? null : runEnd(ownRun)
  // Past its time the run is likely done and waiting to be checked: never a past time stated as current.
  const yours = ownEnd !== null && ownEnd <= now ? dryerWaitText.timeUp : dryerWaitText.yours(ownEnd === null ? null : clockTime(aboutTime(ownEnd)))
  // A wash's own dryer step in the home dryer holds it too (the server refuses a second start either way).
  const homeBusy = dryer !== null && dryer.location !== 'shared' && (ownRun !== undefined || (dryer.machineId === queue.homeDryerId && queue.homeDryerSessionId !== null))
  const count = Number.parseInt(minutes, 10)
  // Pieces that shouldn't tumble the whole run, at about half the minutes set (design 8.4, 8.5).
  const check = midRunCheck(going.map(midRunPiece), count > 0 ? count : null)
  // The pieces the early check names, in a sentence: told plainly when the dryer starts, and a reminder is set for it.
  const checkNames = check === null ? '' : listWords([...new Set(check.pieceIds.map((id) => byId.get(id)?.name ?? dryingText.pieces(1)))])
  const added = (productUses ?? []).filter((use) => use.usable && products.has(use.supplyId))
  // A dryer that sells time: blocks and price from the minutes typed, else the recorded program time. Nothing is invented.
  const blocks = dryer === null ? null : dryerBlocks(count > 0 ? count : suggestedMinutes, dryer)
  const blocksText = blocks === null ? null : dryerBlocksText.about(blocks.blocks, money(blocks.price, 'USD'))
  const ready = dryer !== null && setting !== null && count > 0 && count <= 300 && labelReady && !homeBusy
  const steps = dryer === null ? [] : [
    { text: dryingDesignText.stepLoad(going.length, dryer.name) },
    ...added.map((use) => ({ text: use.dose === null ? dryingText.stepProductAtMachine(use.name) : dryingText.stepProduct(doseParts(use.dose, system).spoken, use.name) })),
    { text: screen.heat === null ? (setting === null ? dryingText.stepChooseHeat : dryingDesignText.stepHeat(setting)) : setting === null ? dryingText.noSetting : dryingDesignText.stepHeat(setting), unresolved: setting === null },
    ...(dryer.pricePerStart === null ? [] : [{ text: blocksText !== null ? dryerBlocksText.pay(blocksText)
      : dryer.blockMinutes != null ? dryerBlocksText.perBlock(money(dryer.pricePerStart, 'USD'), dryer.blockMinutes) : dryingText.stepPay(money(dryer.pricePerStart, 'USD')) }]),
    { text: dryingText.stepStart(dryer.name) },
  ]

  return <div className="page @container grid w-full min-w-0 max-w-[72rem] mx-auto gap-5 pt-2">
    <TaskHeading
      title={shared ? dryingText.dryerTitleShared : dryingText.dryerTitle}
      back={<BackButton label={dryingText.title} onClick={onPlan} />}
      mark={dryer === null ? { tone: 'waiting' } : { tone: 'ready', text: dryer.name }}
      caption={dryingText.dryerSubtitle(screen.number, heatWords(screen.heat), pieces.length)}
    />
    <TaskLayout>
    <div className="grid min-w-0 content-start gap-5">
    {dryer !== null ? (
      <Section heading={shared ? dryingText.usingDryer : dryingText.dryerTitle}>
        <RecordRow media={<DesignIcon name="dryer" strokeWidth={1.6} />} title={dryer.name} fact={ownRun !== undefined && shared ? yours : dryer.capacityUnits === null ? dryingText.fitUnknownNote(dryer.name) : shared ? undefined : dryingText.yourDryer}
          trailing={shared && queue.dryers.length > 1 ? <Button variant="tonal" size="sm" type="button" onClick={() => setPicked(null)}>{dryingText.change}</Button> : undefined} />
        {ownRun !== undefined && shared && ownEnd !== null && ownEnd > now ? <TrialNote>{dryerWaitTrialText.busyUntil('entered')}</TrialNote> : null}
      </Section>
    ) : (
      noneFree ? <>
        <Callout>{noDryerText.title}. {rackIsFull ? noDryerText.rackFull : noDryerText.detail}</Callout>
        <TrialNote>{dryerWaitTrialText.rack}</TrialNote>
        <ErrorNotice error={hang.error} />
      </> : <>
        <MachineEntry id="dryer-label" words={dryerEntryWords} shared options={queue.dryers.map((entry) => ({ machineId: entry.machineId as string, name: entry.name }))} recent={recent.dryers} pending={addLabel.pending}
          onPick={(machineId) => setPicked(machineId)}
          onAddLabel={queue.dryers.length === 0 ? undefined : (label) => void addLabel.run({ machineId: queue.dryers[0]!.machineId, name: label }).then((machineId) => { if (machineId !== undefined) setPicked(machineId) })} />
        <ErrorNotice error={addLabel.error} />
      </>
    )}

    {dryer !== null && staying.length > 0 ? <Callout>{dryingText.wontFitNote(dryer.name, staying.length)}</Callout> : null}
    <Section heading={dryingText.goingIn} caption={fitCaption(going.length, view.fit)}>
      {pieceGroups(going).map((group) => <PieceRow key={group[0]!.pieceId} piece={group[0]!} count={group.length} fact={[group[0]!.color === null ? null : colorWord(group[0]!.color), dryingText.fromWasher(group[0]!.washerName)].filter((part): part is string => part !== null && part.length > 0).join(' · ')} />)}
    </Section>
    <DryingGuidance title={dryingDesignText.fitGuidance}>
      <Note>{dryingDesignText.fitEstimate}</Note>
      <Note>{dryingDesignText.heatGuidance}</Note>
    </DryingGuidance>
    <LabelDryingInstructions pieces={going} stage="beforeDrying" method="tumble" acknowledged={labelAcknowledgment === labelKey} onAcknowledge={(value) => setLabelAcknowledgment(value ? labelKey : null)} />
    {staying.length === 0 ? null : (
      <Section heading={dryingText.wontFit} caption={dryingText.pieces(staying.length)}>
        {pieceGroups(staying).map((group) => <PieceRow key={group[0]!.pieceId} piece={group[0]!} count={group.length} />)}
      </Section>
    )}

    </div>
    <aside aria-label="Dryer settings and start" className="task-summary grid min-w-0 content-start gap-5">
    {productUses === undefined || productUses.length === 0 ? null : (
      <Section heading={dryingText.dryerProducts}>
        {productUses.map((use) => {
          const on = use.usable && products.has(use.supplyId)
          return <SwitchRow role="checkbox" key={use.supplyId} media={<DesignIcon name="fold" strokeWidth={1.6} />} title={use.name} disabled={!use.usable}
            fact={!use.usable ? dryingText.productOut : on ? dryingText.productIn(use.kind === 'wool_dryer_ball' ? 'Dryer ball' : 'Dryer sheet') : dryingText.productOptional}
            on={on} onToggle={() => setProducts((current) => { const next = new Set(current); if (on) next.delete(use.supplyId); else next.add(use.supplyId); return next })} />
        })}
      </Section>
    )}
    {dryer !== null && screen.heat === null ? (
      <div className="grid gap-2">
        <span className="text-[length:var(--step-1)] font-semibold" id="dryer-heat">{dryingText.chooseHeat}</span>
        <RadioGroup aria-labelledby="dryer-heat" value={chosenHeat ?? ''} onValueChange={(value) => setChosenHeat(value as DryerHeat)}>
          <SymbolTiles label={dryingText.chooseHeat}>
            {[...dryer.heatSettings].sort((left, right) => heatRank(left.heat) - heatRank(right.heat)).map((entry) => <SymbolTile key={entry.heat} value={entry.heat} title={entry.label} fact={heatWords(entry.heat)} symbol={heatSymbol[entry.heat as DryerHeat] ?? 'tumble_dry'} />)}
          </SymbolTiles>
        </RadioGroup>
        <Note>{dryingText.chooseHeatNote}</Note>
      </div>
    ) : null}
    {dryer === null ? null : (
      <>
        <StepsCard heading={dryingText.steps} steps={steps} />
        {settingNote === null ? null : <>
          <Note>{settingNote === 'cooler' ? dryingText.coolerSetting(setting ?? '') : dryingText.lowUnverified(setting ?? '')}</Note>
          <TrialNote>{trialText.dryerLow}</TrialNote>
        </>}
        {setting === null && screen.heat !== null ? <Callout tone="conflict">{dryingText.noSetting}</Callout> : null}
        <TextField id="dryer-minutes" label={dryingText.minutesOn(dryer.name)} type="text" inputMode="numeric" autoComplete="off" value={minutes} onChange={(event) => setMinutes(event.target.value.replace(/\D/g, '').slice(0, 3))} />
        {/* Right under the minutes it is worked out from (design 9.3). */}
        {blocksText === null ? null : <>
          <Note role="status">{blocksText}</Note>
          <TrialNote>{dryerWaitTrialText.blocks}</TrialNote>
        </>}
        {check === null ? null : <>
          <Callout>{midCheckText.callout(checkNames, check.atMinute)}</Callout>
          <TrialNote>{dryerWaitTrialText.midCheck}</TrialNote>
        </>}
        <Note>{waitingForContext ? 'Checking recorded load context and your private outcomes. Enter the minutes the machine shows.' : timeSuggestion?.explanation ?? (programFallback.mode === 'sensor' ? programFallback.explanation : baselineSuggestion.uncertainty)}</Note>
        <TrialNote>{trialText.dryerTime}</TrialNote>
        {timeSuggestion === null ? null : <DryingGuidance title="About this starting suggestion">
          <p className="m-0">{timeSuggestion.baselineMinutes === null ? 'No fixed program baseline is available.' : `Checked program baseline: ${timeSuggestion.baselineMinutes} min.`}</p>
          <p className="m-0">{timeSuggestion.context.pieceCount} pieces. {timeSuggestion.context.capacityUnits === null ? 'Capacity is unknown.' : `Estimated load: about ${Math.round(timeSuggestion.context.bulkUnits / timeSuggestion.context.capacityUnits * 10) * 10}% of recorded capacity. ${['observed', 'verified'].includes(timeSuggestion.context.capacityConfidence) ? 'Capacity was checked.' : 'Capacity needs checking.'}`}</p>
          {timeSuggestion.context.extraction.map((entry) => <p className="m-0" key={`${entry.washerId}-${entry.cycle}`}>{entry.cycle}: {entry.spinRpm === null ? 'Spin speed not recorded' : `recorded ${entry.spinRpm} rpm`}, {entry.spinMinutes === null ? 'extraction duration not recorded' : `${entry.spinMinutes} min extraction`}. {entry.source || 'No checked extraction source recorded.'}</p>)}
          <p className="m-0">Recorded care and product restrictions still apply. Timer expiry asks for a dryness check.</p>
        </DryingGuidance>}
        {suggestedMinutes === null ? null : <Button type="button" variant="outline" onClick={() => setMinutes(String(suggestedMinutes))}>Use suggested {suggestedMinutes} min</Button>}
      </>
    )}
    <ErrorNotice error={start.error} />
    {shared && dryer === null && noneFree ? (
      <TaskFooter placement="summary" secondary={<FooterLink onClick={() => setNoneFree(false)}>{noDryerText.pickOne}</FooterLink>}>
        {rackIsFull ? <Button type="button" size="lg" className="w-full" onClick={() => onDone(noDryerText.waiting)}>{noDryerText.wait}</Button> : (
          <AnswerRow large label={noDryerText.title} disabled={hang.pending} answers={[
            { key: 'hang', label: dryerWaitText.hang, primary: true, disabled: pieces.length === 0, onClick: () => void hang.run({ householdId: householdId as Id<'households'>, pieceIds: pieces.map((piece) => piece.pieceId) })
              .then((result) => { if (result !== undefined) onDone(dryerWaitText.hungNote(result.hung.length, result.waiting.length)) }) },
            { key: 'wait', label: noDryerText.wait, onClick: () => onDone(noDryerText.waiting) },
          ]} />
        )}
      </TaskFooter>
    ) : <TaskFooter placement="summary" secondary={shared ? <FooterLink onClick={() => { setPicked(null); setNoneFree(true) }}>{noDryerText.noneFree}</FooterLink> : undefined} note={homeBusy ? dryerWaitText.busyReason(dryer.name) : dryer !== null && screen.heat === null && setting === null ? dryingText.pickHeat : dryer !== null && !(count > 0) ? dryingText.enterMinutes : null}>
      <Button type="button" size="lg" className="w-full" disabled={!ready || start.pending || reloading} onClick={() => {
        if (dryer === null) return
        void start.run({ householdId: householdId as Id<'households'>, pieceIds: pieces.map((piece) => piece.pieceId), dryerId: dryer.machineId, minutes: count,
          ...(hasLabelPreparation ? { labelInstructionsAcknowledged: labelAcknowledgment === labelKey, labelInstructionsToken: labelInstructionsToken(going) } : {}),
          ...(screen.heat === null && chosenHeat !== null ? { heat: chosenHeat } : {}), ...(added.length === 0 ? {} : { productIds: added.map((use) => use.supplyId) }) }).then((result) => {
          if (result === undefined) return
          const left = queue.pieces.filter((piece) => piece.status === 'queued').length - result.going.length
          onDone([dryingText.startedNote(dryer.name, left), check === null ? null : midCheckText.remindIn(check.atMinute, checkNames)].filter(Boolean).join(' '))
        })
      }}>{dryer === null ? dryingText.enterDryer : dryingText.started(dryer.name)}</Button>
    </TaskFooter>}
    </aside>
    </TaskLayout>
  </div>
}

/**
 * The dry subset of a check: each matching group counts its dry pieces, and the first n pieceIds of
 * the group are the dry ones (the rest stay damp). A group without a count is all dry.
 */
export function dryByCount(groups: readonly (readonly Piece[])[], counts: Readonly<Record<string, number>>): Piece[] {
  return groups.flatMap((group) => group.slice(0, Math.min(group.length, Math.max(0, counts[group[0]!.pieceId] ?? group.length))))
}

/**
 * An unsaved dryness check for one run: per matching group (keyed by its first piece) how many are dry
 * of the group size it was answered against, and the extra dryer minutes. A group without an entry is
 * all dry. Drafts live in DryingView's memory only: Back keeps them, a reload or leaving Drying does not.
 */
export type CheckDraft = { readonly counts: Readonly<Record<string, { readonly dry: number; readonly of: number }>>; readonly minutes: string }
export type CheckDrafts = Readonly<Record<string, CheckDraft>>

/** Records or clears one run's draft; a draft with every group dry and no minutes is no draft. */
export function withCheckDraft(drafts: CheckDrafts, runId: string, draft: CheckDraft | null): CheckDrafts {
  const { [runId]: _replaced, ...rest } = drafts
  return draft === null || (Object.keys(draft.counts).length === 0 && draft.minutes === '') ? rest : { ...rest, [runId]: draft }
}

/**
 * The draft against the run's live groups: answers for groups that left the run are dropped and the
 * rest are clamped to the live size. `changed` says a group the draft answered is gone or resized.
 */
export function liveCheckDraft(draft: CheckDraft, groups: readonly (readonly Piece[])[]): { draft: CheckDraft; changed: boolean } {
  const sizes = new Map(groups.map((group) => [group[0]!.pieceId as string, group.length]))
  const counts: Record<string, { dry: number; of: number }> = {}
  let changed = false
  for (const [key, count] of Object.entries(draft.counts)) {
    const size = sizes.get(key)
    if (size === undefined || size !== count.of) changed = true
    if (size === undefined) continue
    const dry = Math.min(size, Math.max(0, count.dry))
    if (dry < size) counts[key] = { dry, of: size }
  }
  return { draft: { counts, minutes: draft.minutes }, changed }
}

/** Matching pieces share a dry check: a "Dry n of m" count keeps partial dryness; a single piece is a switch. */

/**
 * A dryer that is still running: the minutes left in a ring, small chips (dryer, heat), the early-check
 * reminder as one tinted row with the piece's icon. The pieces themselves stay in the load card.
 */
function DryerRunningCard({ run, pieces, now, price, reminder = false }: { run: DryingQueue['runs'][number]; pieces: readonly Piece[]; now: number; price: number | null; /** The take-out reminder row; off where the screen already states the instruction. */ reminder?: boolean }) {
  const end = runEnd(run)
  if (run.kind !== 'dryer' || run.minutes === null || end === null || now >= end) return null
  const minutes = Math.ceil((end - now) / 60_000)
  const remaining = Math.min(1, Math.max(0, (end - now) / (run.minutes * 60_000)))
  const dryer = runTitle(run)
  const flagged = !reminder || run.check === undefined || run.check.missed ? [] : pieces.filter((piece) => run.check!.pieceIds.includes(piece.pieceId))
  return <RunningRing label={dryer} minutes={minutes} remaining={remaining} chips={[dryer, run.heatLabel, price === null ? null : money(price, 'USD')]}>
    {flagged.length === 0 || run.check === undefined ? null : <div className="flex min-h-11 items-center gap-3 rounded-field bg-hamper-bg p-3 text-hamper-ink">
      <GarmentIcon kind={flagged[0]!.kind} colorGroup={flagged[0]!.colorGroup} className="size-6 flex-none" />
      <span className="grid min-w-0 gap-0.5">
        <span className="font-semibold">{dryingRunText.takeOutAt(pieceNames(flagged), clockTime(run.check.at))}</span>
        <span className="text-[length:var(--step--1)]">{midCheckText.cardKeepsGoing(dryer)}</span>
      </span>
    </div>}
  </RunningRing>
}

function CheckScreen({ queue, byId, onPlan, onDone, runId, draft, onDraft, onPutAway, calls, now, early = false }: ScreenProps & {
  runId: string
  /** The time this screen was worked out for: sent as the check time, so the server judges early the same way. */
  now: number
  /** Before the dryer's planned end: damp pieces keep its time, so no extra minutes are asked. */
  early?: boolean
  /** This run's unsaved answers, held by DryingView so Back keeps them. */
  draft: CheckDraft | undefined
  onDraft: (draft: CheckDraft | null) => void
  onPutAway: () => void
}) {
  const connectedCheck = useConvexCall(api.dryingQueue.checkDry)
  const check = calls?.check ?? connectedCheck
  const run = queue.runs.find((entry) => entry.runId === runId) ?? null
  const [labelAcknowledgment, setLabelAcknowledgment] = useState<string | null>(null)
  // Set when a save found the run changed under the draft: the answers were refreshed and need a look.
  const [reviewChanged, setReviewChanged] = useState(false)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const page = useRef<HTMLDivElement>(null)
  useEffect(() => { keepPageFocusVisible(page.current) }, [draft])
  const back = <BackButton label={dryingText.title} onClick={onPlan} />
  if (run === null) return <div className={pageClassName}>
    <TaskHeading title={dryingText.isItDry} back={back} />
    <Note>This drying check is no longer available. Return to the plan to see your current loads.</Note>
    <Button type="button" variant="outline" className="w-full" onClick={onPlan}>Back to drying plan</Button>
  </div>
  const where = runTitle(run)
  const flagged = new Set<string>(run.check?.pieceIds ?? [])
  const pieces = run.pieceIds.map((id) => byId.get(id)).filter((piece): piece is Piece => piece !== undefined)
  // Pieces the mid-run check named come first (design 8.6).
  const groups = pieceGroups(pieces).sort((left, right) => Number(flagged.has(right[0]!.pieceId)) - Number(flagged.has(left[0]!.pieceId)))
  const knitMissed = pieces.filter((piece) => flagged.has(piece.pieceId) && isKnit(piece.kind))
  const live = draft === undefined ? null : liveCheckDraft(draft, groups)
  const current: CheckDraft = live?.draft ?? { counts: {}, minutes: '' }
  const counts = Object.fromEntries(Object.entries(current.counts).map(([key, count]) => [key, count.dry]))
  const minutes = current.minutes
  const edit = (next: CheckDraft) => { setReviewChanged(false); setConfirmingDiscard(false); onDraft(next) }
  const dry = dryByCount(groups, counts)
  const labelKey = instructionKey(dry, 'afterDrying')
  const hasLabelHandling = dry.some((piece) => (piece.instructions?.afterDrying.length ?? 0) > 0)
  const labelReady = !hasLabelHandling || labelAcknowledgment === labelKey
  const wet = pieces.length - dry.length
  const dampWhere = dryingText.damp(run.kind === 'air' ? dryingText.airDrying.toLowerCase() : `in ${where}`)
  const extra = Number.parseInt(minutes, 10)
  const askMinutes = run.kind === 'dryer' && wet > 0 && !early
  const needsMinutes = askMinutes && !(extra >= 1 && extra <= 300)
  return <div ref={page} className={pageClassName}>
    <TaskHeading title={dryingText.isItDry} back={back} caption={dryingText.checkEach(where)} />
    {early ? <DryerRunningCard run={run} pieces={pieces} now={now} reminder price={queue.dryers.find((dryer) => dryer.machineId === run.dryerId)?.pricePerStart ?? null} /> : null}
    <LoadCard label={sessionText.loadSummary} at={loadStageAt('check_due')} pieces={groups.map((group) => ({ key: group[0]!.pieceId, kind: group[0]!.kind, colorGroup: group[0]!.colorGroup, label: group[0]!.name ?? dryingText.pieces(group.length), count: group.length }))} />
    {knitMissed.length === 0 ? null : <Callout>{midCheckText.missed(dryerShareText.knitWords(knitMissed.map((piece) => piece.kind ?? '')))}</Callout>}
    <Section heading={run.kind === 'air' ? dryingText.airDrying : `In ${where}`} caption={groups.some((group) => group.length > 1) ? dryingText.countDry : dryingText.switchOffDamp}>
      {groups.map((group) => {
        const piece = group[0]!
        const name = piece.name ?? dryingText.pieces(group.length)
        const dryCount = Math.min(group.length, counts[piece.pieceId] ?? group.length)
        const setCount = (next: number) => {
          const { [piece.pieceId]: _replaced, ...rest } = current.counts
          edit({ ...current, counts: next >= group.length ? rest : { ...rest, [piece.pieceId]: { dry: next, of: group.length } } })
        }
        if (group.length === 1) {
          const isDry = dryCount === 1
          return <SwitchRow role="checkbox" key={piece.pieceId} media={<PieceMedia piece={piece} />} title={name} disabled={check.pending} highlightSelected
            fact={isDry ? dryingText.dry(piece.washerName) : dampWhere} on={isDry} onToggle={() => setCount(isDry ? 0 : 1)} />
        }
        return <RecordRow key={piece.pieceId} media={<PieceMedia piece={piece} />} title={`${name} ×${group.length}`}
          fact={dryingText.dryOf(dryCount, group.length, piece.washerName)}
          trailing={<QuantityStepper label={dryingText.dryStepper(name)} value={dryCount} max={group.length} disabled={check.pending} onChange={setCount} />} />
      })}
    </Section>
    <LabelDryingInstructions pieces={dry} stage="afterDrying" acknowledged={labelAcknowledgment === labelKey} onAcknowledge={(value) => setLabelAcknowledgment(value ? labelKey : null)} />
    {askMinutes ? (
      <TextField id="extra-minutes" label={dryingText.extraMinutes(where)} error={minutes !== '' && needsMinutes ? 'Enter between 1 and 300 minutes.' : undefined} type="text" inputMode="numeric" autoComplete="off" disabled={check.pending} value={minutes} onChange={(event) => edit({ ...current, minutes: event.target.value.replace(/\D/g, '').slice(0, 3) })} />
    ) : null}
    {live?.changed === true || reviewChanged ? <Note role="status">{dryingDesignText.checkChanged}</Note> : null}
    {confirmingDiscard ? <DiscardChecksCallout onKeep={() => setConfirmingDiscard(false)} onDiscard={() => { setConfirmingDiscard(false); setReviewChanged(false); onDraft(null) }} /> : null}
    <ErrorNotice error={check.error} />
    <TaskFooter note={needsMinutes ? dryingDesignText.enterDampMinutes : null}
      secondary={draft === undefined || confirmingDiscard ? null : <Button type="button" variant="ghost" disabled={check.pending} onClick={() => setConfirmingDiscard(true)}>{dryingDesignText.discardCheck}</Button>}>
      <Button type="button" size="lg" className="w-full" disabled={needsMinutes || check.pending || !labelReady} onClick={() => {
        // Revalidate against the live run first: a changed load refreshes the answers for a second look.
        if (live?.changed === true) { setReviewChanged(true); onDraft(live.draft); return }
        void check.run({ runId: run.runId as Id<'dryingRuns'>, dryPieceIds: dry.map((piece) => piece.pieceId), at: now, ...(hasLabelHandling ? { labelInstructionsAcknowledged: labelAcknowledgment === labelKey } : {}), ...(askMinutes ? { extraMinutes: extra } : {}) }).then((result) => {
        if (result === undefined) return
        onDraft(null)
        if (result.dry > 0) onPutAway()
        else onDone(run.kind === 'dryer' && !early ? dryingText.restarted(where) : dryingDesignText.keepDrying)
      })
      }}>{dry.length > 0 ? dryingText.putAwayDry(dry.length, wet) : run.kind === 'dryer' && !early ? dryingText.restarted(where) : dryingDesignText.keepDrying}</Button>
    </TaskFooter>
  </div>
}

const midAnswersClassName = cn(
  'mid-check-answers',
  'px-4 pb-3',
)

type MidAnswer = 'dry' | 'hang' | 'wait'

/**
 * "Take out early" (design 8.4, 9.3): before the dryer's planned end, one plain instruction first
 * ("Take out the Blue tee and hang it. Leave the bath towel in, the dryer keeps going."), the pieces to
 * take out with what happens to each already chosen and a small Change for an exception, the rest in
 * one line, and one primary that says what happens. No extra minutes; the rest keep tumbling on the
 * run's own time. Never says the heat was unsafe.
 */
function MidCheckScreen({ queue, byId, onPlan, onDone, run, calls, now }: ScreenProps & { run: DryingQueue['runs'][number]; now: number }) {
  const connectedCheck = useConvexCall(api.dryingQueue.checkDry)
  const check = calls?.check ?? connectedCheck
  const flagged = new Set<string>(run.check?.pieceIds ?? [])
  const pieces = run.pieceIds.map((id) => byId.get(id)).filter((piece): piece is Piece => piece !== undefined)
  const groups = pieceGroups(pieces)
  const [answers, setAnswers] = useState<Readonly<Record<string, MidAnswer>>>({})
  // Exceptions only: the rows whose choice is open to change, and whether the pieces staying in are listed.
  const [changing, setChanging] = useState<ReadonlySet<string>>(new Set())
  const [listRest, setListRest] = useState(false)
  const [labelAcknowledgment, setLabelAcknowledgment] = useState<string | null>(null)
  const answerOf = (group: readonly Piece[]): MidAnswer => answers[group[0]!.pieceId] ?? (flagged.has(group[0]!.pieceId) ? 'hang' : 'wait')
  const by = (answer: MidAnswer) => groups.filter((group) => answerOf(group) === answer)
  const dryGroups = by('dry')
  const hangGroups = by('hang')
  const leaving = by('wait')
  // A row stays where it is while its choice is open, so changing it never moves it away under the finger.
  const taking = groups.filter((group) => answerOf(group) !== 'wait' || changing.has(group[0]!.pieceId))
  const staying = leaving.filter((group) => !taking.includes(group))
  const dry = dryGroups.flat()
  const hang = hangGroups.flat()
  const out = [...dry, ...hang]
  const labelKey = instructionKey(out, 'afterDrying')
  const hasLabelHandling = out.some((piece) => (piece.instructions?.afterDrying.length ?? 0) > 0)
  const labelReady = !hasLabelHandling || labelAcknowledgment === labelKey
  const where = runTitle(run)
  const price = queue.dryers.find((dryer) => dryer.machineId === run.dryerId)?.pricePerStart ?? null
  const label = (group: readonly Piece[]) => group[0]!.private ? privatePieceText.pieces(group.length) : `${group[0]!.name ?? dryingText.pieces(group.length)}${group.length > 1 ? ` ×${group.length}` : ''}`
  const names = (list: readonly (readonly Piece[])[]) => listWords(list.map(label))
  const plural = (list: readonly (readonly Piece[])[]) => list.length > 1 || list.some((group) => group.length > 1)
  const instruction = [
    hangGroups.length === 0 ? null : midCheckText.hangPart(names(hangGroups), plural(hangGroups)),
    dryGroups.length === 0 ? null : midCheckText.dryPart(names(dryGroups), plural(dryGroups), hangGroups.length > 0),
    leaving.length === 0 ? null : out.length === 0 ? midCheckText.allIn(where) : midCheckText.leavePart(names(leaving), where),
  ].filter((part): part is string => part !== null).join(' ')
  const toggle = (id: string) => setChanging((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const segment = (group: Piece[]) => {
    const piece = group[0]!
    // The answers sit inside the row's own <li>: a list item never wraps another.
    return <div className={midAnswersClassName}>
      <SegmentChoice label={midCheckText.answerLabel(label(group))} value={answerOf(group)} disabled={check.pending}
        options={(['dry', 'hang', 'wait'] as const).map((answer) => ({ value: answer, label: midCheckText.answers[answer] }))}
        onChange={(value) => setAnswers((current) => ({ ...current, [piece.pieceId]: value as MidAnswer }))} />
    </div>
  }
  const row = (group: Piece[]) => {
    const piece = group[0]!
    const open = changing.has(piece.pieceId)
    return <PieceRow key={piece.pieceId} piece={piece} count={group.length > 1 ? group.length : undefined} fact={`${answerOf(group) === 'dry' ? midCheckText.dryOut : answerOf(group) === 'hang' ? midCheckText.hangIt : midCheckText.answers.wait} · ${dryingText.fromWasher(piece.washerName)}`}
      trailing={<Button type="button" variant="tonal" size="sm" aria-expanded={open} disabled={check.pending} onClick={() => toggle(piece.pieceId)}>{midCheckText.change}</Button>}
      issues={open ? segment(group) : undefined} />
  }
  const restRow = (group: Piece[]) => <PieceRow key={group[0]!.pieceId} piece={group[0]!} count={group.length > 1 ? group.length : undefined} fact={`${midCheckText.answers.wait} · ${dryingText.fromWasher(group[0]!.washerName)}`} issues={segment(group)} />
  const summary = staying.length === 0 ? null : staying.length <= 2 ? midCheckText.stayIn(names(staying), plural(staying)) : midCheckText.stayInOthers(label(staying[0]!), staying.length - 1)
  return <div className={pageClassName}>
    <TaskHeading title={midCheckText.title} back={<BackButton label={dryingText.title} onClick={onPlan} />} />
    <DryerRunningCard run={run} pieces={pieces} now={now} price={price} />
    <p className="m-0 text-[length:var(--step-1)] font-semibold leading-snug [overflow-wrap:anywhere]" role="status">{instruction}</p>
    {taking.length === 0 ? null : <Section heading={midCheckText.takeOutHeading}>{taking.map(row)}</Section>}
    {summary === null ? null : (
      <Section label={summary}>
        <RecordRow media={<DesignIcon name="dryer" strokeWidth={1.6} />} title={summary} trailing={<Button type="button" variant="tonal" size="sm" aria-expanded={listRest} disabled={check.pending} onClick={() => setListRest(!listRest)}>{midCheckText.change}</Button>} />
        {listRest ? staying.map(restRow) : null}
      </Section>
    )}
    <LabelDryingInstructions pieces={out} stage="afterDrying" acknowledged={labelAcknowledgment === labelKey} onAcknowledge={(value) => setLabelAcknowledgment(value ? labelKey : null)} />
    {leaving.length === 0 ? null : <Note>{[midCheckText.restart(where), price === null ? null : dryingText.stepPay(money(price, 'USD'))].filter(Boolean).join(' ')}</Note>}
    <TrialNote>{dryerWaitTrialText.midCheck}</TrialNote>
    <ErrorNotice error={check.error} />
    <TaskFooter>
      <Button type="button" size="lg" className="w-full" disabled={check.pending || !labelReady} onClick={() => {
        void check.run({ runId: run.runId as Id<'dryingRuns'>, dryPieceIds: dry.map((piece) => piece.pieceId), hangPieceIds: hang.map((piece) => piece.pieceId), at: now,
          ...(hasLabelHandling ? { labelInstructionsAcknowledged: labelAcknowledgment === labelKey } : {}) })
          .then((result) => { if (result !== undefined) onDone(midCheckText.saved(result.hung, result.dry, result.damp)) })
      }}>{out.length === 0 ? midCheckText.done.none : leaving.length > 0 ? midCheckText.done.keepGoing : midCheckText.done.empty}</Button>
    </TaskFooter>
  </div>
}

/**
 * Put-away rows: matching pieces (`garmentKey`, as in `pieceGroups`) from one washer and one dryer (or
 * the line) are one row, counted the first pieces first. Pieces not dry yet also split by status and
 * run, since their row says where they are.
 */
type PutAwayGroup = { readonly key: string; readonly name: string; readonly pieces: readonly Piece[] }

export function putAwayGroups(pieces: readonly Piece[]): PutAwayGroup[] {
  return matchingGroups(pieces,
    pieceIdentity,
    (piece) => [piece.washerName, piece.driedIn, piece.status, piece.status === 'dry' ? null : piece.dryingRunId],
  ).map((group) => ({ key: group.key, name: group.first.name ?? dryingText.pieces(1), pieces: group.members }))
}

/**
 * Put away, partial is fine: one row per garment with a "q of n · washer → dryer" count. Counts map
 * onto the per-piece put-away: the first q pieces of each garment group go back.
 */
function PutAwayScreen({ queue, householdId, onPlan, onDone, calls }: ScreenProps) {
  const connectedPutAway = useConvexCall(api.dryingQueue.putAway)
  const putAway = calls?.putAway ?? connectedPutAway
  const dry = queue.pieces.filter((piece) => piece.status === 'dry')
  const groups = putAwayGroups(dry)
  const [counts, setCounts] = useState<Readonly<Record<string, number>>>({})
  const countOf = (group: PutAwayGroup) => Math.min(group.pieces.length, counts[group.key] ?? group.pieces.length)
  const count = groups.reduce((total, group) => total + countOf(group), 0)
  const still = queue.pieces.filter((piece) => piece.status !== 'dry')
  const runName = (piece: Piece) => queue.runs.find((run) => run.runId === piece.dryingRunId)
  return <div className={pageClassName}>
    <TaskHeading
      title={dryingText.putAway}
      back={<BackButton label={dryingText.title} onClick={onPlan} />}
      // The load summary carries the stage while pieces are dry; only an empty put-away needs its own mark.
      {...(dry.length === 0 ? { mark: { tone: 'ready' as const, text: dryingText.allPutAway } } : {})}
      caption={dryingText.partialFine}
    />
    {dry.length === 0 ? null : <LoadSummary stage="to_put_away" origins={washOrigins(dry.map((piece) => piece.washerName))} pieces={dry} />}
    {dry.length === 0 ? <Note>{dryingText.nothingDry}</Note> : (
      <Section heading={dryingText.dryList} caption={dryingText.acrossDryers}>
        {groups.map((group) => {
          const first = group.pieces[0]!
          const value = countOf(group)
          return <RecordRow key={group.key} media={<PieceMedia piece={first} />} title={group.name}
            fact={dryingDesignText.putAwayFact(value, group.pieces.length, first.washerName, first.driedIn)}
            trailing={<QuantityStepper label={group.name} value={value} max={group.pieces.length} disabled={putAway.pending} onChange={(next) => setCounts({ ...counts, [group.key]: next })} />} />
        })}
      </Section>
    )}
    {still.length === 0 ? null : (
      <Section heading={dryingText.notDryYet}>
        {putAwayGroups(still).map(({ pieces: group }) => {
          const piece = group[0]!
          const run = runName(piece)
          const where = piece.status === 'queued' ? dryingText.inQueue : run?.kind === 'air' ? dryingText.airDrying.toLowerCase() : dryingText.inDryer(run?.dryerName ?? dryingText.dryerTitle)
          return <PieceRow key={piece.pieceId} piece={piece} count={group.length} fact={`${dryingText.fromWasher(piece.washerName)} · ${where}`} mark={{ tone: piece.status === 'queued' ? 'waiting' : 'drying', text: piece.status === 'queued' ? dryingText.queued : dryingText.drying }} />
        })}
      </Section>
    )}
    {dry.length === 0 ? null : (
      <>
        <ErrorNotice error={putAway.error} />
        <TaskFooter note={count < dry.length ? dryingDesignText.staysToPutAway(dry.length - count) : null}>
          <Button type="button" size="lg" className="w-full" disabled={count === 0 || putAway.pending} onClick={() => void putAway.run({ householdId: householdId as Id<'households'>, pieceIds: groups.flatMap((group) => group.pieces.slice(0, countOf(group)).map((piece) => piece.pieceId)) }).then((result) => {
            if (result !== undefined) onDone(dryingDesignText.putAwayDone(result.putAway, dry.length - result.putAway))
          })}>{count > 0 ? dryingText.putAwayCount(count) : dryingText.chooseWhat}</Button>
        </TaskFooter>
      </>
    )}
  </div>
}
