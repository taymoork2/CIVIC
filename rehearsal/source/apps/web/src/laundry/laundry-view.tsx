import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { doorLocksDuringCycle, matchesClothingSearch, type SoilLevel } from '@washcloset/planner'
import { useMutation, useQuery } from 'convex/react'
import { useHouseholdData } from '@/household/household-data'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { useEffect, useMemo, useRef, useState, type ComponentProps, type Dispatch, type ReactNode, type Ref, type SetStateAction } from 'react'
import { useSteady } from '@/kit/use-steady'
import { machineTileClassName, machineTilesClassName } from '@/laundry/machine-step'
import { useClientRender } from '@/kit/client-render'

import type { Id } from '@convex/_generated/dataModel'
import type { CurrentHousehold } from '@/account/account'
import { AddClothesFlow, type EditField } from '@/closet/add-clothes'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { MachineSheet, machineGroups, machineNumber, washPlace } from '@/household/machine-sheet'
import { blockReason, classChanges, classWord, loadFor, roomArrivalMachines, roomGroups, type RoomGroup } from '@/household/room-choices'
import { BottleSheet } from '@/products/bottle-sheet'
import { CatalogSheet } from '@/products/catalog-reference'
import { api } from '@/api'
import { colorWord, countWord, dayWord, laundryText, planningText, soilButtonWords, sourceIssueText } from '@/copy'
import { FlagSheet, draftFromFlag, type FlagCall } from '@/closet/flag-sheet'
import { StainInspectionSheet } from '@/closet/stain-inspection'
import { groupGarments } from '@/closet/garment-groups'
import { SearchField } from '@/closet/closet-parts'
import { DroppedOffSheet, GarmentSheet, type GarmentCalls, type GarmentSheetNext } from '@/closet/garment-sheet'
import type { HubState } from '@/home/hub-state'
import { homeClock } from '@/home/home-clock'
import { homeHeroText } from '@/copy-closet'
import type { Inventory, Machine, Textile } from '@/household/inventory-types'
import { effectiveWashMethod } from '@/household/inventory-types'
import { saveSharedStart, useLaundryDay, useSharedStart } from '@/laundry/laundry-day'
import {
  chooseDetergent, chooseOptionalProduct, choosePretreatment, currentPass, emptyPass, frozenPins, groupCareQuestions, handWashList, hamperGroups, hamperSelection, machineHamper, leaveOutProduct, passArgs, pinRefusal, withoutGarments, washOrder, dryerRuns,
  type Pass, type Pin, type PlanLoad, type PlanQuestion, type StoredPlan,
} from '@/laundry/laundry-pass'
import { doseLine, loadNames, flagWords, loadCardView, loadHasQuestion, type CardGarment, type DoseLineView, type LoadFacts, type LoadStart, type LoadCardView } from '@/laundry/load-card'
import { hubScreenText, loadScreenText, planReviewText, washerPathText } from '@/copy-laundry'
import { DayPlan, type UpNext } from '@/laundry/plan-pick'
import { LaundryWorkspace } from '@/laundry/laundry-workspace'
import { BackButton, Callout, HeldNote, Note, QuantityStepper, Section, SwitchRow, TaskHeading, TrialNote, MachineEntry, useRecentMachines, washerEntryWords, largeClassName } from '@/laundry/laundry-ui'
import { NextStepCard, SharedCounts } from '@/laundry/next-step'
import { ItemContent, ItemDescription, ItemTitle, itemVariants } from '@/components/ui/item'
import { hamperLoadsText, loadReviewText } from '@/copy-load'
import { loadGroupKeys, loadReviewModel } from '@/laundry/load-review'
import { LoadScreen } from '@/laundry/load-screen'
import { PersonalProductGuidance } from '@/closet/personal-product-guidance'
import { DetergentSheet, detergentChoices } from '@/products/detergent-sheet'
import { WasherPathScreen, roomProducts, type WasherPathView } from '@/laundry/washer-path'
import { RunningLoadSheet } from '@/laundry/running-load-sheet'
import { dryingFacts, earlyChecks, hubRows, runningRowLine, sharedPicks, sharedStartView, sharedWasherCount, urgentFlag, type EarlyCheck, type PlannedLoad, type RunningRow } from '@/home/hub-state'
import { EarlyChecks } from '@/drying/early-check-card'
import { sharedStartText } from '@/copy-drying'
import { dryerWaitTrialText } from '@/copy-trial'
import { runningText } from '@/copy-laundry'
import { exclusionWords, fallbackWords, pinRefusalWords, type PlainAction } from '@/laundry/plain-reasons'
import { loadDraft, saveDraft, type PlanningDraft } from '@/private-state'
import { IssueNote, MediaTile, RecordList, RecordRow, RecordRowEnd, StatusMark, type MarkTone } from '@/kit/record-row'
import { DesignIcon } from '@/kit/design-icons'
import { blockingCount, nextCheck, sourceGroups, type IssueAction, type SourceGroup } from '@/products/source-issues'
import { QuestionCard, questionEffect, washerGroupIds, type QuestionAction, type QuestionCalls } from '@/laundry/question-card'
import type { SessionStage } from '@/laundry/session-stage'
import { useNow } from '@/kit/use-now'
import { Sheet } from '@/kit/sheet'
import { TaskFooter } from '@/kit/task-footer'
import { GarmentIcon } from '@/kit/garment-icon'
import { CareEmpty, CareHero } from '@/products/product-ui'
import { Loading, clockTime, errorMessage } from '@/kit/ui'
import { ActionError, useActionFeedback } from '@/kit/action-feedback'
import { WashedSheet, backInClosetToast, type WashedCall } from '@/closet/washed-sheet'

/**
 * The Laundry tab: "What's in the hamper and how do I wash it?" The hamper keeps everything in view;
 * Planning opens a review of selected clothes, missing details and proposed washes. A question
 * opens only when chosen from the review. The open plan lives in the address (`?plan=`), so each
 * saved answer recomputes it and returns to the updated review.
 */

export const laundryPageClassName = cn(
  "page",
  "[.app-shell.is-focus_&]:max-w-[30rem]",
  "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 max-w-[36rem] mx-auto pt-2",
  "md:max-w-[45rem]",
  "[.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:w-full [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:max-w-[none] [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:mx-0 [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:pt-0 [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:content-start [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:gap-4",
)

const washClassName = cn(
  "wash",
  "lg:[.page&:not(.wash-pass)]:max-w-[60rem] lg:[.page&:not(.wash-pass)]:gap-x-8",
  "lg:[.page&:not(.wash-pass)_>_.wash-glance]:col-[1_/_-1]",
  "lg:[.page&.is-selecting]:grid-cols-[minmax(0,_1fr)]",
  "lg:[.page&:not(.wash-pass):not(.is-selecting)]:grid-cols-[minmax(0,_1fr)_18rem]",
)

const machineSwitchReasonClassName = cn(
  "machine-switch-reason",
  "text-[length:var(--step-0)]",
  "text-ink-2",
)

const machineSwitchLinesClassName = cn(
  "machine-switch-lines",
  "grid gap-2 text-ink",
  "text-[length:var(--step-0)]",
)

const kindTilesClassName = cn(
  "kind-tiles",
  "grid-cols-[repeat(2,_1fr)]",
)

const kindTileClassName = cn(
  "kind-tile",
  "min-h-[5.5rem] p-3 font-semibold text-center text-balance",
  "text-[length:var(--step-0)]",
)

const machineTileGroupHeadClassName = cn(
  "machine-tile-group-head",
  "flex items-baseline justify-between gap-2 px-1",
)

const machineTileGroupTitleClassName = cn(
  "machine-tile-group-title",
  "text-[length:var(--step-0)]",
  "font-semibold text-ink",
)

const machineTileGroupMetaClassName = cn(
  "machine-tile-group-meta",
  "text-[length:var(--step-0)]",
  "text-ink-2",
)

const secondaryButtonClassName = cn(
  buttonVariants({ variant: 'outline', size: 'sm' }),
  "[&.danger]:text-destructive",
)

const homeClassToggleClassName = cn(
  "home-class-toggle",
  "grid gap-2",
)

const segmentsLabelClassName = cn(
  "segments-label",
  "text-[length:var(--step-0)]",
  "font-semibold text-ink px-1",
)

const washMainClassName = cn(
  "wash-main",
  "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6",
  "lg:[.page.wash:not(.wash-pass)_>_&]:col-[1]",
)

type Attention = FunctionReturnType<typeof api.closet.attention>
export type HamperSummary = Attention['hamper']
type Reason = StoredPlan['result']['reasons'][number]

type Call<Reference extends FunctionReference<'mutation'>> = (args: FunctionArgs<Reference>) => Promise<FunctionReturnType<Reference>>

export type LaundryCalls = QuestionCalls & GarmentCalls & {
  readonly recompute: Call<typeof api.plans.recompute>
  readonly start: Call<typeof api.execution.start>
  readonly confirmRecipe: Call<typeof api.plans.confirmRecipe>
  readonly setRanOut: Call<typeof api.inventory.setRanOut>
  readonly addMachineLikeIt: Call<typeof api.inventory.addMachineLikeIt>
  readonly washedElsewhere: WashedCall
  readonly deleteTextile: Call<typeof api.inventory.deleteTextile>
  readonly flagDirty: FlagCall
}

/** Where a Wash button goes outside the tab: Household (to add a washer or a bottle), the Closet, or a started load. */
export type LaundryTarget = { readonly to: 'household'; readonly section?: 'machines' | 'bottles' } | { readonly to: 'closet' } | { readonly to: 'drying'; readonly run?: string } | { readonly to: 'session'; readonly sessionId: string }
export type LaundryLink = (target: LaundryTarget, props: { className: string; children: ReactNode }) => ReactNode

/** Plain links, for tests and anywhere without the router. */
export const plainLaundryLink: LaundryLink = (target, { className, children }) => (
  <a className={className} href={target.to === 'session' ? `/session/${target.sessionId}` : target.to === 'drying' && target.run !== undefined ? `/drying?run=${target.run}` : target.to === 'household' && target.section !== undefined ? `/household?section=${target.section}` : `/${target.to}`}>{children}</a>
)

export type WashSegment = 'hamper' | 'dry_cleaning'

const ids = <Value,>(values: readonly string[]) => values as unknown as Value

// ---- Words -----------------------------------------------------------------------------

/** "14 things · about 2 loads"; the estimate is left out when there is no current plan to count from. */
export function hamperHeading(hamper: Pick<HamperSummary, 'count' | 'loads'>): string {
  if (hamper.count === 0) return laundryText.emptyHamper
  return laundryText.hamperHeading(hamper.count, hamper.loads)
}

/**
 * The hub header's one-line summary, right of "Laundry": "10 in the hamper" while nothing is
 * running, else "N running · all dry ~4:12" (the estimate folds in drying time for a load still
 * washing). Null when there is nothing worth a line (an open plan, or nothing anywhere).
 */
export function hubSummaryLine(state: HubState): string | null {
  if (state.kind === 'hamper') return laundryText.inHamper(state.count)
  if (state.kind === 'drying') return laundryText.drying(state.count)
  const rows = hubRows(state)
  if (rows.length === 0) return null
  const finishes = rows.flatMap((row) => {
    if (row.doneAt === null) return []
    if (row.stage === 'drying' || row.stage === 'dry') return [row.doneAt]
    return [row.hasDrying === true && row.dryMinutes != null ? row.doneAt + row.dryMinutes * 60_000 : row.doneAt]
  })
  const allDry = finishes.length === 0 ? null : Math.max(...finishes)
  return laundryText.running(rows.length, allDry === null ? null : homeClock(allDry))
}

// ---- "Your laundry": today's pipeline, as a card on the hub -----------------------------------

export type PipelineState = 'hamper' | 'washing' | 'drying'
export type PipelineTile = PileView & { readonly state: PipelineState }

const pipelineWord: Readonly<Record<PipelineState, string>> = laundryText.pipeline

/** Where a garment sits in today's laundry: in a running load's washer or dryer stage, hanging to dry, or waiting in the hamper. Null once it is back in the closet (not this card's business). */
function pipelineBucket(textile: Pick<Textile, 'inLoad' | 'status'>, hamperIds: ReadonlySet<string>, textileId: string, hub: HubState | undefined): PipelineState | null {
  if (textile.inLoad !== null) {
    const stage = hubRows(hub).find((row) => row.sessionId === textile.inLoad)?.stage
    return stage === 'drying' || stage === 'dry' ? 'drying' : 'washing'
  }
  if (textile.status === 'hanging') return 'drying'
  return hamperIds.has(textileId) ? 'hamper' : null
}

/**
 * What is moving through today's laundry, for the hub's "Your laundry" card: piles grouped the same
 * way the hamper groups them, each tagged with where it is right now. This is not the Closet's full
 * inventory — a garment already folded away shows nothing here.
 */
export function laundryPipeline(textiles: readonly Textile[], hub: HubState | undefined, now: number, wearers: Inventory['wearers'], viewerKey: string | null): { readonly counts: Readonly<Record<PipelineState, number>>; readonly tiles: readonly PipelineTile[] } {
  const hamperIds = new Set(machineHamper(textiles).map((textile) => textile.textileId as string))
  const buckets: Record<PipelineState, Textile[]> = { hamper: [], washing: [], drying: [] }
  for (const textile of textiles) {
    const bucket = pipelineBucket(textile, hamperIds, textile.textileId as string, hub)
    if (bucket !== null) buckets[bucket].push(textile)
  }
  const tiles = (['hamper', 'washing', 'drying'] as const).flatMap((state) =>
    hamperPiles(buckets[state], now, wearers, viewerKey).map((pile): PipelineTile => ({ ...pile, state })))
  return { counts: { hamper: buckets.hamper.length, washing: buckets.washing.length, drying: buckets.drying.length }, tiles }
}

/** "10 to wash · 3 in the wash · 4 drying", each part only when it has something. */
export function pipelineStatusLine(counts: Readonly<Record<PipelineState, number>>): string {
  const parts = (['hamper', 'washing', 'drying'] as const)
    .filter((state) => counts[state] > 0)
    .map((state) => `${counts[state]} ${pipelineWord[state].toLowerCase()}`)
  return parts.length === 0 ? laundryText.everythingClean : parts.join(' · ')
}

/** A needed-by day: overdue still reads "today". */
const neededDay = (neededBy: number, now: number) => (neededBy < now ? laundryText.today : dayWord(neededBy, now))

export type HamperRowView = {
  readonly name: string
  readonly soil: SoilLevel | null
  /** What happened: "grass or mud, left knee". */
  readonly what: string | null
  /** Who flagged it: "from Sam". */
  readonly from: string | null
  /** "Tue", for the "by Tue" tag. */
  readonly neededBy: string | null
}

/**
 * One hamper row's words. "from {Sam}" names the person who flagged it when they are linked to a
 * wearer, and never the person looking.
 */
export function hamperRowView(textile: Pick<Textile, 'name' | 'soilLevel' | 'flag'>, now: number, wearers: Inventory['wearers'], viewerKey: string | null): HamperRowView {
  const flag = textile.flag
  const flagger = flag === null || flag.flaggedBy === viewerKey ? undefined : wearers.find((wearer) => wearer.principalKey !== null && wearer.principalKey === flag.flaggedBy)
  return {
    name: textile.name,
    soil: textile.soilLevel,
    what: flag === null ? null : flagWords(flag),
    from: flagger === undefined ? null : laundryText.from(flagger.name),
    neededBy: flag?.neededBy === undefined ? null : neededDay(flag.neededBy, now),
  }
}

/** The row as one line: "Soccer jersey · Very dirty · grass or mud, left knee · needed Tue · from Sam". */
export function hamperRowLine(row: HamperRowView): string {
  return [row.name, row.soil === null ? null : soilButtonWords[row.soil], row.what, row.neededBy === null ? null : laundryText.needed(row.neededBy), row.from]
    .filter((part): part is string => part !== null).join(' · ')
}

const soilOrder = ['light', 'normal', 'heavy'] as const satisfies readonly SoilLevel[]

/**
 * Whether a garment's tag has been read enough to wash it: a way to wash, and for the machine a
 * dryer answer too. "Tag doesn't say" stays unchecked, so the row keeps asking.
 */
export function tagChecked(care: Textile['care']): boolean {
  if (care === null || care.status !== 'confirmed' || care.washMethod === 'unknown') return false
  if (care.washMethod !== 'machine') return true
  return care.dryMethod !== undefined && care.dryMethod !== null && care.dryMethod !== 'unknown'
}

export type PileView = {
  readonly key: string
  readonly name: string
  readonly kind: string | null
  readonly colorGroup: string | null
  readonly color: string | null
  readonly textileIds: readonly string[]
  readonly count: number
  /** The dirtiest member, so a pile never reads cleaner than its worst piece. */
  readonly soil: SoilLevel | null
  /** Every member has the same dirtiness (or none). */
  readonly soilSame: boolean
  /** How many members still need their tag read. */
  readonly tagUnchecked: number
  /** Every distinct "what happened" and "from Sam" among the members, so grouping hides none. */
  readonly what: readonly string[]
  readonly from: readonly string[]
  /** The soonest "needed by" day. */
  readonly neededBy: string | null
}

/**
 * One whose-group's hamper rows as piles: identical garments (same name and colour) become one row,
 * in the order first seen, with a count, the dirtiest soil and how many tags are unread.
 */
export function hamperPiles(rows: readonly Textile[], now: number, wearers: Inventory['wearers'], viewerKey: string | null): PileView[] {
  return groupGarments(rows).map((group) => {
    const members = group.members
    const views = members.map((textile) => hamperRowView(textile, now, wearers, viewerKey))
    const soils = members.map((textile) => textile.soilLevel)
    const dirtiest = soilOrder.filter((level) => soils.includes(level)).at(-1) ?? null
    const needed = members.flatMap((textile) => (textile.flag?.neededBy === undefined ? [] : [textile.flag.neededBy]))
    const distinct = (values: readonly (string | null)[]) => [...new Set(values.filter((value): value is string => value !== null))]
    const first = members[0]!
    return {
      key: group.key,
      name: group.name,
      kind: first.kind,
      colorGroup: first.colorGroup,
      color: first.color !== null && !colorWord(group.name).toLowerCase().includes(colorWord(first.color).toLowerCase()) ? colorWord(first.color) : null,
      textileIds: members.map((textile) => textile.textileId as string),
      count: members.length,
      soil: dirtiest,
      soilSame: new Set(soils).size === 1,
      tagUnchecked: members.filter((textile) => !tagChecked(textile.care)).length,
      what: distinct(views.map((view) => view.what)),
      from: distinct(views.map((view) => view.from)),
      neededBy: needed.length === 0 ? null : neededDay(Math.min(...needed), now),
    }
  })
}

/** A pile row's accessible name: "Black tee, 6, Very dirty, tag not checked". */
export function pileLabel(pile: PileView): string {
  return [
    pile.name,
    pile.color,
    pile.count > 1 ? String(pile.count) : null,
    pile.soil === null ? null : soilButtonWords[pile.soil],
    pile.tagUnchecked === 0 ? laundryText.tagChecked : pile.tagUnchecked === pile.count ? laundryText.tagNotChecked : laundryText.tagsNotChecked(pile.tagUnchecked),
    ...pile.what,
    pile.neededBy === null ? null : laundryText.needed(pile.neededBy),
    ...pile.from,
  ].filter((part): part is string => part !== null).join(', ')
}

/** "Navy blazer · since Sep 12 · pick up Sep 19". */
export function cleanerRowLine(textile: Pick<Textile, 'name' | 'statusSince' | 'cleanerPickupBy'>, now: number): string {
  return [textile.name, laundryText.since(dayWord(textile.statusSince, now)), textile.cleanerPickupBy === null ? null : laundryText.pickup(dayWord(textile.cleanerPickupBy, now))]
    .filter((part): part is string => part !== null).join(' · ')
}

/**
 * The washers a load can start on: its planned washer and its identical siblings ("Speed Queen
 * washer 1…4", one type, one place). Empty when there is only one, so no question is asked.
 */
export function washerChoices(plannedId: string | null, machines: readonly Machine[]): Machine[] {
  if (plannedId === null) return []
  const washers = machines.filter((machine) => !machine.archived && machine.applianceType !== 'tumble_dryer')
  const group = machineGroups(washers).find((entry) => entry.machines.some((machine) => machine.machineId === plannedId))
  return group === undefined || group.machines.length < 2 ? [] : [...group.machines]
}

export { machineNumber } from '@/household/machine-sheet'

/** A tile in "Which washer?": its painted number, and when one of your own loads is tracked in it, how long is left. */
export type WasherTile = {
  readonly washer: Machine
  readonly number: string
  /**
   * Set when one of your loads is tracked in this washer, as far as the app knows; `left` is "34 min
   * left" when its recorded times say, else null. Never blocks the tile: the app never calls a
   * machine free or in use, and a stale timer should not lock someone out of their own washer.
   */
  readonly yours: { readonly left: string | null } | null
}

/** Stages where a running load is still in its washer. */
const inWasher = new Set<SessionStage>(['preparing', 'washing', 'wash_done'])

/**
 * "Which washer?" tiles, in physical order (never resorted by availability): each keeps the number
 * it had in the list, with "Yours" marked (not blocked) when one of your loads is tracked in it.
 * Running loads are matched by washer name.
 */
export function washerTiles(washers: readonly Machine[], hub: HubState | undefined, now: number): WasherTile[] {
  const rows = hubRows(hub)
  const busy = new Map<string, number | null>()
  for (const row of rows) if (inWasher.has(row.stage)) busy.set(row.machine, row.doneAt)
  return washers.map((washer, index): WasherTile => {
    if (!busy.has(washer.name)) return { washer, number: machineNumber(washer.name, index), yours: null }
    const doneAt = busy.get(washer.name) ?? null
    const minutes = doneAt === null ? 0 : Math.ceil((doneAt - now) / 60_000)
    return { washer, number: machineNumber(washer.name, index), yours: { left: minutes > 0 ? laundryText.minutesLeft(minutes) : null } }
  })
}

/** A load started at the tap, before the server answers: the tap's time, and which washer it used. */
export type StartingEntry = {
  readonly at: number
  /** Set when the sheet or "No number on it?" picked a specific machine. */
  readonly machineId?: string
  /** The person tapped a kind ("Door in front") rather than a number: the label names the kind, not a number. */
  readonly numberSkipped?: boolean
}

/** "Top-loader 3", or "a top-loader" when the number was skipped; "the washer" with nothing recorded yet. */
export function startedWasherLabel(entry: StartingEntry, machines: readonly Machine[]): string {
  const machine = entry.machineId === undefined ? undefined : machines.find((candidate) => candidate.machineId === entry.machineId)
  if (entry.numberSkipped !== true) return machine?.name ?? laundryText.theWasher
  const word = classWord(machine?.applianceType ?? null).singular
  return laundryText.indefiniteWasher(word)
}

/** Whether "Which washer?" is for a shared room, where the person types the label they are at. */
function sharedRoom(groups: readonly RoomGroup[]): boolean {
  return groups.some((group) => group.machines.some((machine) => machine.location === 'shared'))
}

/** The washer a person said they are at for a load; `numberSkipped` when they picked a kind, not a number. */
export type PickedWasher = { readonly machineId: string; readonly numberSkipped: boolean }

/**
 * The key a washer pick is kept under: the load's clothes, not its id. An update can regroup loads
 * under the same positional ids, and a pick made for other clothes must not carry over.
 */
export function washerPickKey(load: Pick<PlanLoad, 'textileIds'>): string {
  return [...load.textileIds].sort().join(' ')
}

/**
 * Which washer a load's recipe is for. What the person picked wins, then the washer already confirmed.
 * At home one washer is the default. In a shared room nothing is assumed: the person enters the
 * washer they are at, so no washer is ever shown as reserved or free.
 */
export function pickedWasher(load: PlanLoad, machines: readonly Machine[], groups: readonly RoomGroup[], picked: PickedWasher | undefined, confirmedMachineId: string | null): PickedWasher | null {
  if (picked !== undefined) return picked
  if (confirmedMachineId !== null) return { machineId: confirmedMachineId, numberSkipped: false }
  const planned = machines.find((machine) => machine.machineId === load.machineId)
  if (load.machineId === null || planned === undefined || planned.location === 'shared') return null
  const onlyOne = groups.length === 0 || (groups.length === 1 && groups[0]!.machines.length < 2)
  return onlyOne ? { machineId: load.machineId, numberSkipped: false } : null
}

/**
 * Whether the washer entered can start this load: its planned washer, a washer beside it, or another
 * kind the plan says can take it. Nothing is offered to start on a washer the server would refuse.
 */
export function washerStartable(load: Pick<PlanLoad, 'machineId'>, state: { readonly startable: boolean; readonly startableMachineIds: readonly string[] } | undefined, machineId: string): boolean {
  if (state === undefined) return false
  return state.startableMachineIds.includes(machineId) || (machineId === load.machineId && state.startable)
}

/** "Steps for: Front-loaders | Top-loaders" at home: one option per class in a mixed room, the planned one first; [] with no mixed-room load. */
export function homeClassOptions(loads: readonly PlanLoad[], machines: readonly Machine[]): readonly { readonly applianceType: string | null; readonly title: string }[] {
  const mixed = loads.find((load) => (load.alternates ?? []).length > 0)
  if (mixed === undefined) return []
  const own = machines.find((machine) => machine.machineId === mixed.machineId)?.applianceType ?? null
  const seen = new Set<string | null>([own])
  const options: { applianceType: string | null; title: string }[] = [{ applianceType: own, title: classWord(own).plural }]
  for (const alternate of mixed.alternates ?? []) {
    if (seen.has(alternate.applianceType)) continue
    seen.add(alternate.applianceType)
    options.push({ applianceType: alternate.applianceType, title: classWord(alternate.applianceType).plural })
  }
  return options
}

/** The machine id whose steps the home toggle shows for this load: its own, or the selected class's alternate. */
export function homeRepresentative(load: PlanLoad, selectedClass: string | null, ownApplianceType: string | null): string | null {
  if (selectedClass === null || selectedClass === ownApplianceType) return load.machineId
  return (load.alternates ?? []).find((entry) => entry.applianceType === selectedClass)?.machineId ?? load.machineId
}

/** "Top-loaders: Too full for a top-loader…" under a load whose other class can't take it; null while showing that class, or when it can. */
export function homeOtherClassNote(load: PlanLoad, selectedClass: string | null, ownApplianceType: string | null, product: (supplyId: string) => string | null): string | null {
  if (selectedClass !== null && selectedClass !== ownApplianceType) return null
  const other = (load.alternates ?? [])[0]
  if (other === undefined || other.status === 'ready') return null
  return `${classWord(other.applianceType).plural}: ${blockReason(other, product, classWord(ownApplianceType))}`
}

/** The garment a reason about it names, or a product it names, for the plain words. */
type Names = { readonly garment: (textileId: string) => string; readonly product: (supplyId: string) => string | null }

/** "Not in these loads": each garment left out, with the first reason that has plain words. */
export function notInLoads(result: Pick<StoredPlan['result'], 'exclusions' | 'reasons'>, names: Names): { readonly textileId: string; readonly text: string }[] {
  return result.exclusions.map((exclusion) => {
    const words = exclusion.reasonIds
      .map((id) => result.reasons.find((reason) => reason.id === id))
      .filter((reason): reason is Reason => reason !== undefined)
      .map((reason) => exclusionWords(reason, { product: reason.supplyId === undefined ? null : names.product(reason.supplyId) }).text)
    return { textileId: exclusion.textileId, text: `${names.garment(exclusion.textileId)}: ${words.find((text) => text !== fallbackWords) ?? fallbackWords}` }
  })
}

/** What the household must add before any load can start ("Add a washer"), once each. */
export function householdActions(reasons: readonly Reason[]): PlainAction[] {
  const actions: PlainAction[] = []
  for (const reason of reasons) {
    if (reason.textileIds.length > 0) continue
    const action = exclusionWords(reason).action
    if (action !== undefined && !actions.some((entry) => entry.kind === action.kind)) actions.push(action)
  }
  return actions
}

/** The toast after a move, when the planner kept the garment where it was. */
export function moveRefusalToast(reasons: readonly Reason[], textileId: string, group: number, name: string): string | null {
  const refusal = pinRefusal(reasons, textileId, group)
  return refusal === null ? null : pinRefusalWords(refusal, name)
}

/** The pass the open plan was made with: its garments, and the answers and moves that go with them. */
export function planPass(plan: Pick<StoredPlan, 'textileIds' | 'pass' | 'result'>): { readonly selection: readonly string[]; readonly pass: Pass } {
  const selection = plan.textileIds ?? [...plan.result.loads.flatMap((load) => load.textileIds), ...plan.result.exclusions.map((exclusion) => exclusion.textileId)]
  return { selection, pass: plan.pass }
}

type RecomputeArgs = FunctionArgs<typeof api.plans.recompute>

/**
 * What `plans.recompute` is sent: the garments still waiting in the hamper (one that went into a
 * load, or out of the hamper, since is dropped), and the pass without answers about products or
 * washers that are gone. Null when nothing is left to wash.
 */
export function recomputeArgs(householdId: string, selection: readonly string[], pass: Pass, inventory: Pick<Inventory, 'textiles' | 'supplies' | 'machines'>, clientInputHash: string): RecomputeArgs | null {
  const waiting = new Set<string>(machineHamper(inventory.textiles).map((textile) => textile.textileId))
  const chosen = selection.filter((id) => waiting.has(id))
  if (chosen.length === 0) return null
  return {
    householdId: householdId as RecomputeArgs['householdId'],
    selectedTextileIds: ids(chosen),
    clientInputHash,
    ...passArgs(currentPass(pass, inventory)),
  }
}

/**
 * Starts a load at the tap without waiting on the server, which may be out of reach in the laundry
 * room: the load shows as started at once (Convex sends the start when there is signal again, with
 * the tap's time), then opens once the server answers. A start it refuses puts the load back and
 * says why.
 */
export async function startAtTap(call: () => Promise<{ readonly sessionId: string }>, on: {
  /** The load shows as started, before the server answers. */
  readonly started: () => void
  /** The server answered either way: the load is no longer waiting. */
  readonly settled: () => void
  readonly opened: (sessionId: string) => void
  readonly failed: (message: string) => void
}): Promise<void> {
  on.started()
  let sessionId: string
  try {
    sessionId = (await call()).sessionId
  } catch (caught) {
    on.settled()
    on.failed(errorMessage(caught))
    return
  }
  on.settled()
  on.opened(sessionId)
}

/**
 * Whether a start the server just answered opens its load: only while this pass is still on screen
 * (never pulling the person off another tab or plan), and only when no other start is waiting.
 */
export function opensStartedLoad(shownPlanId: string | null, planId: string, waiting: number): boolean {
  return shownPlanId === planId && waiting === 0
}

/** What a load started at the tap says until the server answers. */
export function startedLine(at: number): string {
  return laundryText.started(clockTime(at))
}

// ---- The view ------------------------------------------------------------------------------

export type LaundrySheet =
  | { readonly kind: 'garment'; readonly textileIds: readonly string[] }
  | { readonly kind: 'flag'; readonly textileIds: readonly string[]; readonly mode: 'dirty' | 'change' | 'wash_instead' }
  | { readonly kind: 'edit'; readonly textileIds: readonly string[]; readonly careOnly?: 'all' | 'more'; readonly focusField?: EditField }
  | { readonly kind: 'washed'; readonly textileIds: readonly string[] }
  /** `firstRun` is captured when the intake opens, so saving into an empty hamper keeps its first-run title. */
  | { readonly kind: 'add_hamper'; readonly firstRun?: boolean }
  | { readonly kind: 'dropped'; readonly textileIds: readonly string[] }
  /** "Your laundry" card, opened: the full Hamper / Dry cleaning list, rendered by the hub itself. */
  | { readonly kind: 'browse' }
  | { readonly kind: 'stage'; readonly stage: 'washing' | 'drying' }
  /** One running load: where it is, what is in it, its recipe and by-hand additions. */
  | { readonly kind: 'running'; readonly sessionId: string }

export type LaundryViewProps = {
  now: number
  householdId: string
  /** The washers this household used most recently, newest first: the only ones "Which washer?" lists as used before. */
  recentWashers?: readonly string[]
  /** The person looking, so the hamper never says a flag came from them. */
  viewerKey: string | null
  inventory: Inventory
  inventoryCounts?: { ready: number; total: number }
  hamper: Pick<HamperSummary, 'count' | 'loads'>
  place?: WasherPathView['place']
  /** The hamper as this device left it: rows marked "Not this time" stay out of Make loads. */
  draft: Pick<PlanningDraft, 'selectedTextileIds' | 'seenTextileIds'> | null
  onDraft: (selection: readonly string[], seen: readonly string[]) => void
  planId: string | null
  loadId?: string | null
  onOpenLoad?: (planId: string, loadId: string | null) => void
  /** The open plan: undefined while it loads, null when it was replaced. */
  plan: StoredPlan | null | undefined
  questions: readonly PlanQuestion[] | undefined
  calls: LaundryCalls
  /** Opens a plan (or the hamper, for null); `replace` while inside a pass. */
  onPlan: (planId: string | null, replace: boolean) => void
  onSession: (sessionId: string) => void
  renderLink?: LaundryLink
  /** Add to hamper, from the picker's "Not in the closet?" link; `firstRun` as captured when it opened. */
  addToHamper?: (onClose: () => void, firstRun: boolean) => ReactNode
  /**
   * The shared appliance editor (MachineSheet at its required questions), opened inline from the
   * pass's "Add your washer"; `onSaved` plans again. Closing it postpones, and the row stays.
   */
  addWasher?: (props: { onClose: () => void; onSaved: (message: string) => void }) => ReactNode
  /** The bottle sheet, opened inline from the pass's "Add your detergent"; `onSaved` plans again. */
  addBottle?: (props: { onClose: () => void; onSaved: (message: string) => void }) => ReactNode
  initialSegment?: WashSegment
  initialSheet?: LaundrySheet | null
  itemSheet?: LaundrySheet | null
  itemKey?: string
  onItemOpen?: (item: string) => void
  onItemClose?: () => void
  itemMissing?: boolean
  openMakeLoads?: boolean
  /** Laundry day from the server (running loads, the open plan, drying); without it, the hamper alone. */
  hub?: HubState
  /** Pieces in the drying queue: waiting to be planned into dryer loads, and dry and waiting to be put away. */
  drying?: { readonly queued: number; readonly dry: number }
  /** Running dryers with an early check ahead or due: each a countdown card, then one action. */
  checks?: readonly EarlyCheck[]
}

type MoveCheck = { readonly planId: string; readonly textileId: string; readonly group: number; readonly name: string }

export function LaundryView(props: LaundryViewProps) {
  const { now, householdId, inventory, draft, onDraft, plan, questions, calls, onPlan, onSession } = props
  // A confirmation goes to Sonner; an error stays here, inline, next to what failed, until the next try.
  const { pending, failure, say, run, clear: clearFailure } = useActionFeedback()
  const [moveCheck, setMoveCheck] = useState<MoveCheck | null>(null)
  const [adding, setAdding] = useState<'washer' | 'bottle' | null>(null)
  const [inspectingStain, setInspectingStain] = useState<string | null>(null)
  // The product whose pack lookup is open, from a held wool or silk piece.
  const [findingPack, setFindingPack] = useState<string | null>(null)
  // A reload opens the review; a question is always an explicit choice from it.
  const [activeTask, setActiveTask] = useState<string | null>(null)
  // The load whose washer path ("At the machines") is open, in place of the review.
  const [atMachine, setAtMachine] = useState<string | null>(null)
  // The washer each load's person said they are at, before its recipe is confirmed. Never reserved. Kept
  // here with `atMachine`, so a plan updated while she stands at the washer (its review remounts while the
  // new plan loads) keeps the washer she picked; keyed by the load's clothes, so a regrouped load drops it.
  const [chosen, setChosen] = useState<ReadonlyMap<string, PickedWasher>>(() => new Map())
  // The load opened from the hamper's list; without one, show the plan overview.
  const [wantLoad, setWantLoad] = useState<string | null>(null)
  const selectedLoad = props.loadId === undefined ? wantLoad : props.loadId
  const openLoad = (planId: string, loadId: string | null) => {
    setWantLoad(loadId)
    if (props.onOpenLoad !== undefined) props.onOpenLoad(planId, loadId)
    else if (props.planId !== planId) onPlan(planId, false)
  }
  const passTitle = useRef<HTMLHeadingElement>(null)
  useEffect(() => { passTitle.current?.focus() }, [activeTask, atMachine, plan?.planId, selectedLoad])
  // Leaving the pass closes its washer path, so a new plan never opens on a stale load.
  useEffect(() => { if (props.planId === null) { setAtMachine(null); setChosen(new Map()); setWantLoad(null); setInspectingStain(null) } }, [props.planId])
  // Loads started at the tap that the server has not answered yet, with the tap's time.
  const [starting, setStarting] = useState<ReadonlyMap<string, StartingEntry>>(() => new Map())
  const waitingStarts = useRef(0)
  // The plan on screen, cleared when Laundry is left, so a start answered later doesn't navigate.
  const shownPlan = useRef<string | null>(null)
  shownPlan.current = plan?.planId ?? null
  useEffect(() => () => { shownPlan.current = null }, [])

  // The hamper as Make loads sees it; "Not this time" is remembered on this device.
  const hamperIds = machineHamper(inventory.textiles).map((textile) => textile.textileId as string)
  const [out, setOut] = useState<readonly string[]>(() => {
    const chosen = new Set(hamperSelection(hamperIds, draft))
    return hamperIds.filter((id) => !chosen.has(id))
  })
  const selection = hamperIds.filter((id) => !out.includes(id))
  const makeOpened = useRef(false)
  useEffect(() => {
    if (!props.openMakeLoads || makeOpened.current || props.planId !== null) return
    makeOpened.current = true
    if (selection.length === 0) return
    void run(async () => {
      setActiveTask(null)
      await replan(selection, emptyPass, false)
    })
  }, [props.openMakeLoads, props.planId])
  const markOut = (textileIds: readonly string[], left: boolean) => {
    // Changing the selection is an edit: the last failure no longer describes it.
    clearFailure()
    const next = left ? [...new Set([...out, ...textileIds])] : out.filter((id) => !textileIds.includes(id))
    setOut(next)
    onDraft(hamperIds.filter((id) => !next.includes(id)), hamperIds)
  }

  /** Plans again with this selection and pass, and opens the new plan; with nothing left, the hamper. */
  const replan = async (nextSelection: readonly string[], pass: Pass, replace: boolean): Promise<string | null> => {
    const args = recomputeArgs(householdId, nextSelection, pass, inventory, plan?.inputHash ?? 'make-loads')
    if (args === null) {
      onPlan(null, replace)
      return null
    }
    const result = await calls.recompute(args)
    onPlan(result.planId, replace)
    return result.planId
  }

  // A move the planner refused says so once the new plan arrives; the garment stayed where it was.
  useEffect(() => {
    if (moveCheck === null || plan === undefined) return
    if (plan !== null && plan.planId === moveCheck.planId) say(moveRefusalToast(plan.result.reasons, moveCheck.textileId, moveCheck.group, moveCheck.name), 'bad')
    if (plan === null || plan.planId === moveCheck.planId) setMoveCheck(null)
  }, [plan, moveCheck])

  const byId = new Map(inventory.textiles.map((textile) => [textile.textileId as string, textile]))
  const nameOf = (textileId: string) => byId.get(textileId)?.name ?? laundryText.guestItem
  // "Check the tag" for identical garments is one card: one answer covers them all.
  const cards = questions === undefined ? undefined : groupCareQuestions(questions, (textileId) => byId.get(textileId))
  const activeQuestion = cards?.find((card) => JSON.stringify(card.key) === activeTask)
  const errorView = <ActionError failure={failure} pending={pending} onRetry={(work) => void run(work)} />

  if (props.planId !== null) {
    const stale = plan === null || (plan !== undefined && (plan.status === 'stale' || plan.status === 'retired'))
    const goBack = () => { if (atMachine !== null) setAtMachine(null); else if (activeTask !== null) setActiveTask(null); else if (plan?.result.loads.some(load => load.id === selectedLoad)) openLoad(props.planId!, null); else onPlan(null, false) }
    const body = plan === undefined || questions === undefined || cards === undefined ? <Loading what={laundryText.loadingLoads} /> : plan === null ? null : (
      <PassScreen
        recentWashers={props.recentWashers}
        plan={plan}
        questions={questions}
        cards={cards}
        activeQuestion={activeQuestion}
        onQuestion={(question) => setActiveTask(JSON.stringify(question.key))}
        onChangeClothes={() => onPlan(null, false)}
        docked={!stale}
        onBack={goBack}
        titleRef={passTitle}
        atMachine={atMachine}
        onAtMachine={setAtMachine}
        chosen={chosen}
        onChosen={setChosen}
        inventory={inventory}
        place={props.place}
        now={now}
        pending={pending}
        renderLink={props.renderLink ?? plainLaundryLink}
        onAnswer={(question, action) => void run(async () => {
          const outcome = await questionEffect(action, question, planPass(plan), calls)
          if (outcome.recompute) await replan(outcome.selection, outcome.pass, true)
          setActiveTask(null)
          return outcome.toast
        })}
        onMove={(textileId, group, loads) => void run(async () => {
          const { selection: current, pass } = planPass(plan)
          const planId = await replan(current, { ...pass, loadPins: frozenPins(loads, textileId, group) }, true)
          if (planId !== null) setMoveCheck({ planId, textileId, group, name: nameOf(textileId) })
        })}
        onNotThisTime={(textileId) => void run(async () => {
          const current = planPass(plan)
          markOut([textileId], true)
          const next = withoutGarments(current.selection, current.pass, [textileId])
          await replan(next.selection, next.pass, true)
        })}
        loadId={selectedLoad}
        onOpenLoad={(loadId) => openLoad(plan.planId, loadId)}
        outIds={out.filter((id) => hamperIds.includes(id))}
        // The stepper going down, or "Not this time" for a whole row: these pieces stay in the hamper for the next pass.
        onLeaveOut={(textileIds) => void run(async () => {
          const current = planPass(plan)
          markOut(textileIds, true)
          const next = withoutGarments(current.selection, current.pass, textileIds)
          await replan(next.selection, next.pass, true)
        })}
        // The stepper going up, or "Put back": the pieces are selected again and pinned to this load.
        onAddToLoad={(textileIds, group, loads) => void run(async () => {
          if (textileIds.length === 0) return
          const current = planPass(plan)
          markOut(textileIds, false)
          const pins: Pin[] = [...frozenPins(loads, textileIds[0]!, group), ...textileIds.slice(1).map((textileId) => ({ textileId: textileId as Pin['textileId'], group }))]
          await replan([...current.selection, ...textileIds], { ...current.pass, loadPins: pins }, true)
        })}
        onLeaveOutProduct={(supplyId) => void run(async () => {
          const current = planPass(plan)
          await replan(current.selection, leaveOutProduct(current.pass, supplyId), true)
        })}
        onChoosePretreatment={(textileId, supplyId) => void run(async () => {
          const current = planPass(plan)
          await replan(current.selection, choosePretreatment(current.pass, textileId, supplyId), true)
        })}
        onInspectStain={setInspectingStain}
        // The softener switch: off leaves it out of this wash, on takes it back out of the pass's exclusions.
        onToggleSoftener={(supplyId, on) => void run(async () => {
          const current = planPass(plan)
          await replan(current.selection, chooseOptionalProduct(current.pass, supplyId, on), true)
        })}
        onWashGoal={(goal) => void run(async () => {
          const current = planPass(plan)
          await replan(current.selection, { ...current.pass, washGoals: [goal] }, true)
        })}
        onRanOut={(supplyId) => void run(async () => {
          await calls.setRanOut({ supplyId: supplyId as FunctionArgs<typeof api.inventory.setRanOut>['supplyId'], ranOut: true })
          const current = planPass(plan)
          await replan(current.selection, leaveOutProduct(current.pass, supplyId), true)
        })}
        onSwitchDetergent={(supplyId, ranOutId) => void run(async () => {
          // The one that ran out is marked so; nothing else is swapped in until the person chooses it.
          if (ranOutId !== null) await calls.setRanOut({ supplyId: ranOutId as FunctionArgs<typeof api.inventory.setRanOut>['supplyId'], ranOut: true })
          const current = planPass(plan)
          await replan(current.selection, chooseDetergent(current.pass, supplyId), true)
        })}
        onRestock={(supplyId) => void run(async () => {
          await calls.setRanOut({ supplyId: supplyId as FunctionArgs<typeof api.inventory.setRanOut>['supplyId'], ranOut: false })
          const current = planPass(plan)
          await replan(current.selection, current.pass, true)
        })}
        onAddWasher={props.addWasher === undefined ? undefined : () => setAdding('washer')}
        onAddBottle={props.addBottle === undefined ? undefined : () => setAdding('bottle')}
        onFindPack={setFindingPack}
        starting={starting}
        onConfirm={(loadId, machineId) => void run(async () => {
          await calls.confirmRecipe({ planId: plan.planId, loadId, machineId: machineId as Id<'machines'> })
          const machine = inventory.machines.find((entry) => entry.machineId === machineId)
          return washerPathText.recipeConfirmedToast(machine?.name ?? laundryText.theWasher)
        })}
        onAddLabel={async (likeMachineId, name) => {
          let added: string | null = null
          await run(async () => {
            added = await calls.addMachineLikeIt({ machineId: likeMachineId as Id<'machines'>, name })
            // The new washer changes what can be planned: plan again with the same pass.
            const current = planPass(plan)
            await replan(current.selection, current.pass, true)
            return null
          }, { retry: false })
          return added
        }}
        onStart={(loadId, options = {}) => {
          const { machineId, numberSkipped, label } = options
          const at = Date.now()
          waitingStarts.current += 1
          void startAtTap(() => calls.start({
            planId: plan.planId,
            loadId,
            // One key per plan and load: a retried tap returns the same load instead of a second one.
            idempotencyKey: `${plan.planId}:${loadId}`,
            at,
            ...(machineId === undefined ? {} : { machineId: machineId as Id<'machines'> }),
            ...(numberSkipped === true ? { numberSkipped: true } : {}),
            ...(label === undefined ? {} : { loadName: label.name, loadNumber: label.number, loadCount: label.count }),
          }), {
            started: () => setStarting((current) => new Map(current).set(loadId, { at, machineId, numberSkipped })),
            settled: () => {
              waitingStarts.current -= 1
              setStarting((current) => {
                const next = new Map(current)
                next.delete(loadId)
                return next
              })
            },
            // With another start still waiting, this one stays on the pass with its Open button.
            opened: (sessionId) => {
              if (opensStartedLoad(shownPlan.current, plan.planId, waitingStarts.current)) onSession(sessionId)
            },
            failed: (message) => say(message, 'bad'),
          })
        }}
      />
    )
    return (
      <div className={cn(laundryPageClassName, washClassName, "wash-pass")}>
        {/* Focus mode: no tabs; the way back is top left, the answer is docked at the bottom. */}
        {plan === undefined || questions === undefined || cards === undefined || plan === null
          ? <TaskHeading title={planningText.review} titleRef={passTitle} back={<BackButton label={laundryText.backToHamper} disabled={pending} onClick={goBack} />} />
          : null}
        {body}
        {errorView}
        {stale ? (
          <TaskFooter>
            <Button type="button" size="lg" className="w-full" disabled={pending} onClick={() => void run(async () => {
              // A replaced plan has no pass to keep: plan again from the hamper as this device has it.
              const { selection: current, pass } = plan === null ? { selection, pass: emptyPass } : planPass(plan)
              // The updated loads open on their review, whenever the new plan arrives; the washer picked at the room stays picked.
              setAtMachine(null)
              await replan(current, pass, true)
            })}>{laundryText.stale}</Button>
          </TaskFooter>
        ) : null}
        {adding === null ? null : (adding === 'washer' ? props.addWasher : props.addBottle)?.({
          onClose: () => setAdding(null),
          // A new washer or bottle changes what can be planned: plan again with the same pass, straight away.
          onSaved: (message) => void run(async () => {
            const { selection: current, pass } = plan === null || plan === undefined ? { selection, pass: emptyPass } : planPass(plan)
            await replan(current, pass, true)
            return message
          }),
        }) ?? null}
        {(() => {
          const pack = findingPack === null ? undefined : inventory.supplies.find((supply) => supply.supplyId === findingPack)
          return pack === undefined ? null : <CatalogSheet holding={{ kind: 'product', id: pack.supplyId }} binding={pack.catalogBinding} name={pack.name} onClose={() => setFindingPack(null)}
            onSaved={() => void run(async () => {
              const { selection: current, pass } = plan === null || plan === undefined ? { selection, pass: emptyPass } : planPass(plan)
              await replan(current, pass, true)
            })} />
        })()}
        {(() => {
          const textile = inspectingStain === null ? undefined : byId.get(inspectingStain)
          if (textile === undefined || plan === undefined || plan === null) return null
          return <StainInspectionSheet
            key={textile.textileId}
            textile={textile}
            now={now}
            flag={calls.flagDirty}
            onClose={() => setInspectingStain(null)}
            onSaved={() => {
              setInspectingStain(null)
              void run(async () => {
                const current = planPass(plan)
                await replan(current.selection, current.pass, true)
                passTitle.current?.focus()
                return sourceIssueText.stainSaved
              })
            }}
          />
        })()}
      </div>
    )
  }

  return (
    <HamperScreens
      {...props}
      selection={selection}
      out={out}
      pending={pending}
      nameOf={nameOf}
      onOut={markOut}
      onOpenLoad={openLoad}
      onMakeLoads={() => void run(async () => {
        setActiveTask(null)
        // A new Make loads is a new pass: questions set aside last time are asked again.
        await replan(selection, emptyPass, false)
      })}
      onReplanHere={async (nextSelection, pass) => {
        const args = recomputeArgs(householdId, nextSelection, pass, inventory, 'day-plan')
        return args === null ? null : (await calls.recompute(args)).planId
      }}
      run={run}
      say={say}
      error={errorView}
    />
  )
}

// ---- Review the plan, then open a chosen care or setup task ------------------------------------

export type ChoosingStep =
  | { readonly kind: 'pick' }
  | { readonly kind: 'skip' }
  | { readonly kind: 'confirm'; readonly group: RoomGroup; readonly machineId: string; readonly numberSkipped: boolean }

/** "Which washer?" in progress for one load: its groups (own class first), and which step it is on. */
export type Choosing = { readonly loadId: string; readonly number: number; readonly groups: readonly RoomGroup[]; readonly step: ChoosingStep }

/** "Door in front" for a front-loader group, else "Lid on top": the skip flow's two big tiles. */
export function kindTileLabel(group: RoomGroup): string {
  return group.machines[0]?.applianceType === 'front_load_washer' ? laundryText.frontDoor : laundryText.topLid
}

/**
 * "Which washer?": the printed number first, the few washers used last as shortcuts and every washer
 * behind "Show all" in number order (the dryer picker's treatment; no washer is ever called free).
 * Picking one of another class opens a card showing what changes before it starts; a blocked one shows why, with
 * no way to start it there. "No number on it?" asks the kind instead ("Door in front" / "Lid on top"),
 * then routes exactly the same way as a numbered tap on that kind's first washer.
 */
export function WhichWasherSheet({ choosing, load, pending, product, recentWashers, onClose, onStep, onPick, onAddLabel }: {
  /** The washers this household used most recently, newest first. */
  recentWashers?: readonly string[]
  choosing: Choosing
  /** Null only if the load left the pass (a replan) while the sheet was open. */
  load: PlanLoad | null
  pending: boolean
  product: (supplyId: string) => string | null
  onClose: () => void
  onStep: (step: ChoosingStep) => void
  onPick: (options: { machineId: string; numberSkipped?: boolean }) => void
  /** A shared room's label typed at arrival, for a washer like `likeMachineId`; absent where labels cannot be added. */
  onAddLabel?: (likeMachineId: string, name: string) => void
}) {
  const { step } = choosing
  if (load === null) return null

  if (step.kind === 'confirm') {
    const machine = step.group.machines.find((entry) => entry.machineId === step.machineId) ?? step.group.machines[0] ?? null
    if (machine === null) return null
    const blocked = !step.group.startable || step.group.alternate === undefined
    return (
      <Sheet
        title={blocked ? laundryText.cannotTake(machine.name) : laundryText.differentSteps(machine.name)}
        onClose={onClose}
        closeLabel={laundryText.cancel}
        footer={blocked ? undefined : (
          <Button type="button" className={largeClassName} disabled={pending} onClick={() => onPick({ machineId: step.machineId, numberSkipped: step.numberSkipped })}>
            {laundryText.useMachine(machineNumber(machine.name, 0))}
          </Button>
        )}
      >
        {blocked ? (
          <p className={machineSwitchReasonClassName}>{step.group.reason ?? laundryText.machineBlocked}</p>
        ) : (
          <ul className={machineSwitchLinesClassName}>
            {classChanges(load.treatments, step.group.alternate!.treatments, product, {
              doorLocks: doorLocksDuringCycle({ applianceType: machine.applianceType ?? undefined }),
              minutes: machine.cycleMinutes[step.group.alternate!.cycle]?.durationMinutes ?? null,
            }).map((line) => <li key={line}>{line}</li>)}
          </ul>
        )}
        <Button type="button" className={cn("secondary", largeClassName)} onClick={() => onStep({ kind: 'pick' })}>{laundryText.pickAnother}</Button>
      </Sheet>
    )
  }

  if (step.kind === 'skip') {
    return (
      <Sheet title={laundryText.whichKind} onClose={onClose} onBack={() => onStep({ kind: 'pick' })} closeLabel={laundryText.cancel} compactActions>
        <div className={cn(machineTilesClassName, kindTilesClassName)}>
          {choosing.groups.map((group) => {
            const machine = group.machines[0]
            if (machine === undefined) return null
            return (
              <Button variant="unstyled" size="unstyled" key={group.key} type="button" className={cn(machineTileClassName, kindTileClassName)} disabled={pending} onClick={() => {
                if (group.own || group.alternate === undefined) onPick({ machineId: machine.machineId, numberSkipped: true })
                else onStep({ kind: 'confirm', group, machineId: machine.machineId, numberSkipped: true })
              }}>
                {kindTileLabel(group)}
              </Button>
            )
          })}
        </div>
      </Sheet>
    )
  }

  const shared = sharedRoom(choosing.groups)
  // The dryer picker's treatment: the printed number first, the few washers used last as shortcuts,
  // every washer behind "Show all" in number order. Never a tile per washer, never "free".
  const options = choosing.groups.flatMap((group) => group.machines.map((machine) => ({ machineId: machine.machineId, name: machine.name })))
  const like = choosing.groups.find((group) => group.own)?.machines[0] ?? choosing.groups[0]?.machines[0]
  const pick = (machineId: string) => {
    const group = choosing.groups.find((entry) => entry.machines.some((machine) => machine.machineId === machineId))
    if (group === undefined || group.own) onPick({ machineId })
    else onStep({ kind: 'confirm', group, machineId, numberSkipped: false })
  }
  return (
    <Sheet title={laundryText.whichWasher} subtitle={shared ? washerPathText.notReserved : laundryText.washerPrompt(choosing.number)} onClose={onClose} closeLabel={laundryText.cancel} compactActions>
      <MachineEntry id="washer-label" words={washerEntryWords} shared options={options} recent={recentWashers} pending={pending} onPick={pick} autoFocus
        onAddLabel={onAddLabel === undefined || !shared || like === undefined ? undefined : (name) => onAddLabel(like.machineId, name)} />
      {choosing.groups.map((group) => <p key={group.key} className={machineTileGroupHeadClassName}><span className={machineTileGroupTitleClassName}>{group.title}</span><span className={machineTileGroupMetaClassName}>{group.meta}</span></p>)}
      <Button variant="unstyled" size="unstyled" type="button" className={secondaryButtonClassName} onClick={() => {
        if (choosing.groups.length === 1) {
          const machine = choosing.groups[0]!.machines[0]
          if (machine !== undefined) onPick({ machineId: machine.machineId, numberSkipped: true })
        } else onStep({ kind: 'skip' })
      }}>{washerPathText.noNumber}</Button>
    </Sheet>
  )
}

function PassScreen({ plan, questions, cards, activeQuestion, onQuestion, onChangeClothes, docked, onBack, titleRef, atMachine, onAtMachine, chosen, onChosen: setChosen, loadId, onOpenLoad, outIds, inventory, place, now, pending, starting, renderLink, onAnswer, onMove, onNotThisTime, onLeaveOut, onAddToLoad, onToggleSoftener, onWashGoal, onLeaveOutProduct, onChoosePretreatment, onInspectStain, onRanOut, onSwitchDetergent, onRestock, onStart, onConfirm, onAddLabel, onAddWasher, onAddBottle, onFindPack, recentWashers }: {
  /** The washers this household used most recently, newest first. */
  recentWashers?: readonly string[]
  plan: StoredPlan
  /** The server's questions, for which loads still wait on one. */
  questions: readonly PlanQuestion[]
  /** Identical garments' care questions merged into one task. */
  cards: readonly PlanQuestion[]
  activeQuestion?: PlanQuestion
  onQuestion: (question: PlanQuestion) => void
  onChangeClothes: () => void
  /** The card's answer button docks at the bottom; not while "Something changed" holds the dock. */
  docked: boolean
  /** One step back: from a question, from the machines, or out of the plan. */
  onBack: () => void
  titleRef: Ref<HTMLHeadingElement>
  /** The load whose washer path (At the machines) is open, or null for the review. */
  atMachine: string | null
  /** The washer picked for each load at the machines, kept by the Laundry view across plan updates. */
  chosen: ReadonlyMap<string, PickedWasher>
  onChosen: Dispatch<SetStateAction<ReadonlyMap<string, PickedWasher>>>
  onAtMachine: (loadId: string | null) => void
  /** Null shows the plan overview, including after an outdated load disappears. */
  loadId: string | null
  onOpenLoad: (loadId: string) => void
  /** Hamper pieces set aside ("Not this time"): what a stepper can bring back, and the left-out rows. */
  outIds: readonly string[]
  inventory: Inventory
  now: number
  place?: WasherPathView['place']
  pending: boolean
  /** Loads started at the tap that the server has not answered yet, with the tap's time. */
  starting: ReadonlyMap<string, StartingEntry>
  renderLink: LaundryLink
  onAnswer: (question: PlanQuestion, action: QuestionAction) => void
  onMove: (textileId: string, group: number, loads: readonly StoredPlan['result']['loads'][number][]) => void
  onNotThisTime: (textileId: string) => void
  /** Sets these pieces aside for this pass (the quantity stepper going down). */
  onLeaveOut: (textileIds: readonly string[]) => void
  /** Selects these pieces again and pins them to load `group` (the stepper going up, "Put back"). */
  onAddToLoad: (textileIds: readonly string[], group: number, loads: readonly StoredPlan['result']['loads'][number][]) => void
  /** The softener switch for this wash. */
  onToggleSoftener: (supplyId: string, on: boolean) => void
  onWashGoal: (goal: import('@washcloset/planner').WashGoal) => void
  /** Leaves one product out of this wash only; its record stays as it is. */
  onLeaveOutProduct: (supplyId: string) => void
  onChoosePretreatment: (textileId: string, supplyId: string) => void
  onInspectStain: (textileId: string) => void
  onRanOut?: (supplyId: string) => void
  /** One detergent per load: use this one for the pass (`ranOutId`, when given, is marked ran out first). */
  onSwitchDetergent?: (supplyId: string, ranOutId: string | null) => void
  /** A detergent marked ran out is back in stock. */
  onRestock?: (supplyId: string) => void
  /** `machineId`: the washer she picked; `numberSkipped` when she tapped a kind rather than a number. */
  onStart: (loadId: string, options?: { machineId?: string; numberSkipped?: boolean; label?: { name: string; number: number; count: number } }) => void
  /** "Confirm recipe for Washer 3": records the washer for the load. Nothing starts. */
  onConfirm: (loadId: string, machineId: string) => void
  /** A shared-room label typed at arrival: a new machine like `likeMachineId`. Resolves to its id, or null if it failed. */
  onAddLabel: (likeMachineId: string, name: string) => Promise<string | null>
  /** Opens the machine sheet right here; without it, "Add a washer" links to Household. */
  onAddWasher?: () => void
  /** Opens the bottle sheet right here; without it, "Add a bottle or box" links to Household. */
  onAddBottle?: () => void
  /** Opens a product's sheet at the pack lookup. */
  onFindPack?: (supplyId: string) => void
}) {
  const byId = new Map(inventory.textiles.map((textile) => [textile.textileId as string, textile]))
  const supplies = new Map(inventory.supplies.map((supply) => [supply.supplyId as string, supply]))
  const garment = (textileId: string): CardGarment | null => {
    const textile = byId.get(textileId)
    return textile === undefined ? null : { name: textile.name, kind: textile.kind, colorGroup: textile.colorGroup, flag: textile.flag }
  }
  const product = (supplyId: string) => supplies.get(supplyId)?.name ?? null
  const rowText = (ruleId: string) => inventory.supplies.flatMap((supply) => supply.rules).find((rule) => rule.ruleId === ruleId)?.rowText ?? null
  const pinned = plan.pass.loadPins.length > 0
  const facts: LoadFacts = { now, garment, product, rowText, reasons: plan.result.reasons, pinned, rush: plan.pass.mode === 'rush' }
  // The hub's wash order and numbers (`washOrder`), so "Load 2" here is load 2 on Home and the dock.
  const loads = washOrder(plan.result.loads, (load) => ({ started: Boolean(plan.loadStates.find((entry) => entry.loadId === load.id)?.sessionId),
    urgent: load.textileIds.some((id) => urgentFlag(byId.get(id)?.flag, now)), dryerRuns: dryerRuns(load.drying == null ? null : { tumble: load.drying.tumbleTextileIds.length, fit: load.drying.fit }) }))
  const question = activeQuestion
  // "Which washer?" for the load being started: only its two follow-up steps (a different kind, or no number) open a sheet.
  const [choosing, setChoosing] = useState<Choosing | null>(null)
  // Home "Steps for": a local preview only, defaulting to each load's own planned class; never mutates.
  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  // The load whose "Detergent" sheet is open.
  const [pickingDetergent, setPickingDetergent] = useState<string | null>(null)

  // The name, number and count the start keeps on the session, so its summary screens say "Load 2 of 3 · Whites".
  const startLabel = (loadId: string) => {
    const named = loadNames(loads.map((load, at) => ({ loadId: load.id, number: at + 1, textileIds: load.textileIds })), (id) => byId.get(id))
    const at = loads.findIndex((load) => load.id === loadId)
    const name = named.get(loadId)
    return name === undefined || at < 0 ? undefined : { name, number: at + 1, count: loads.length }
  }
  const names = { garment: (textileId: string) => byId.get(textileId)?.name ?? null, product, washer: (machineId: string) => inventory.machines.find((machine) => machine.machineId === machineId)?.name ?? null,
    icon: (textileId: string) => { const textile = byId.get(textileId); return textile === undefined ? null : { kind: textile.kind, colorGroup: textile.colorGroup } },
    handWashOk: (textileId: string) => { const textile = byId.get(textileId); return textile !== undefined && !['dry_clean_only', 'do_not_wash'].includes(String(effectiveWashMethod(textile))) } }
  const runAction = (action: IssueAction) => {
    if (action.kind === 'question') onQuestion(cards.find((card) => card.subjectIds.some((id) => action.question.subjectIds.includes(id)) && card.kind === action.question.kind) ?? action.question)
    else if (action.kind === 'leave-out-garment') onNotThisTime(action.textileId)
    else if (action.kind === 'leave-out-garments') onLeaveOut(action.textileIds)
    else if (action.kind === 'choose-pretreatment') onChoosePretreatment(action.textileId, action.supplyId)
    else if (action.kind === 'inspect-stain') onInspectStain(action.textileId)
    else if (action.kind === 'add-product') onAddBottle?.()
    else if (action.kind === 'find-pack') onFindPack?.(action.supplyId)
    else onLeaveOutProduct(action.supplyId)
  }

  if (question !== undefined) {
    const supplyId = question.product?.supplyId
    return (
      <>
        <TaskHeading title={planningText.task[question.kind]} titleRef={titleRef} back={<BackButton label={planningText.back} disabled={pending} onClick={onBack} />} />
        <QuestionCard
          next={planningText.saveAndReview}
          docked={docked}
          key={JSON.stringify([question.key, question.productCheck?.loadFingerprint, question.productCheck?.washContextFingerprint])}
          question={question}
          nameOf={(textileId) => byId.get(textileId)?.name ?? laundryText.guestItem}
          hasRows={supplyId === undefined ? false : (supplies.get(supplyId)?.rules.length ?? 0) > 0}
          pending={pending}
          onAction={(action) => onAnswer(question, action)}
        />
      </>
    )
  }

  /** Everything the washer path needs about one load: its state, the room's groups, and the washer entered. */
  const washerContext = (load: PlanLoad, index: number) => {
    const state = plan.loadStates.find((entry) => entry.loadId === load.id)
    const groups = roomGroups(load, inventory.machines, state?.startableMachineIds ?? [], product)
    const picked = pickedWasher(load, inventory.machines, groups, chosen.get(washerPickKey(load)), state?.confirmedMachineId ?? null)
    return { state, groups, picked, index }
  }
  /** The washer a person says they are at: a different kind than planned shows what changes first. */
  const pickMachine = (load: PlanLoad, index: number, groups: readonly RoomGroup[], machineId: string) => {
    const group = groups.find((entry) => entry.machines.some((candidate) => candidate.machineId === machineId))
    if (group === undefined || group.own || group.alternate === undefined) setChosen((current) => new Map(current).set(washerPickKey(load), { machineId, numberSkipped: false }))
    else setChoosing({ loadId: load.id, number: index + 1, groups, step: { kind: 'confirm', group, machineId, numberSkipped: false } })
  }
  const washerSheet = choosing === null ? null : (
    <WhichWasherSheet
      choosing={choosing}
      load={loads.find((entry) => entry.id === choosing.loadId) ?? null}
      pending={pending}
      product={product}
      recentWashers={recentWashers}
      onClose={() => setChoosing(null)}
      // Picking another washer goes back to the entry on the screen itself.
      onStep={(step) => (step.kind === 'pick' ? setChoosing(null) : setChoosing({ ...choosing, step }))}
      onPick={(options) => {
        setChoosing(null)
        const forLoad = loads.find((entry) => entry.id === choosing.loadId)
        if (forLoad !== undefined) setChosen((current) => new Map(current).set(washerPickKey(forLoad), { machineId: options.machineId, numberSkipped: options.numberSkipped === true }))
      }}
    />
  )

  // The washer path: enter the washer, confirm its recipe (nothing starts), then Chemistry.
  const pathLoad = atMachine === null || !docked ? undefined : loads.find((entry) => entry.id === atMachine)
  if (pathLoad !== undefined) {
    const index = loads.indexOf(pathLoad)
    const { state, groups, picked } = washerContext(pathLoad, index)
    if (state !== undefined && state.sessionId === null && !starting.has(pathLoad.id)) {
      const cardView = loadCardView(pathLoad, index + 1, facts, state.blockingReasonIds)
      const machine = picked === null ? undefined : inventory.machines.find((entry) => entry.machineId === picked.machineId)
      const group = picked === null ? undefined : groups.find((entry) => entry.machines.some((candidate) => candidate.machineId === picked.machineId))
      const treatments = picked === null ? null : group?.own ? pathLoad.treatments : loadFor(pathLoad, picked.machineId)
      const startable = picked !== null && washerStartable(pathLoad, state, picked.machineId)
      const alternate = picked === null ? undefined : (pathLoad.alternates ?? []).find((entry) => entry.machineIds.includes(picked.machineId))
      const shared = sharedRoom(groups) || inventory.machines.find((entry) => entry.machineId === pathLoad.machineId)?.location === 'shared' || place === 'shared' || place === 'laundromat'
      const pathProblems = sourceGroups(state.blockedItems, plan.result.reasons, questions, pathLoad.id, names)
      const pathReview = loadReviewModel({ load: pathLoad, textiles: byId, wearers: inventory.wearers, supplies: inventory.supplies, outIds: [], excludedSupplyIds: plan.pass.excludedSupplyIds, first: false, otherKeys: new Set(), privatePieces: plan.privatePieces })
      const view: WasherPathView = {
        number: index + 1,
        loadTitle: cardView.title,
        itemsLine: cardView.itemsLine,
        shared,
        place,
        washer: picked === null ? null : { label: startedWasherLabel({ at: 0, machineId: picked.machineId, numberSkipped: picked.numberSkipped }, inventory.machines), fact: group?.meta ?? '' },
        refusal: picked === null ? null : treatments === null || (alternate !== undefined && alternate.status !== 'ready') ? group?.reason ?? washerPathText.cantTakeHint : null,
        recipe: treatments === null ? [] : treatments.map((step) => doseLine(step, facts)).filter((line): line is DoseLineView => line !== null),
        changes: alternate === undefined || machine === undefined ? [] : classChanges(pathLoad.treatments, alternate.treatments, product, {
          doorLocks: doorLocksDuringCycle({ applianceType: machine.applianceType ?? undefined }),
          minutes: machine.cycleMinutes[alternate.cycle]?.durationMinutes ?? null,
        }),
        confirmed: picked !== null && state.confirmedMachineId === picked.machineId,
        ready: startable && treatments !== null,
        requirements: pathReview.requirements,
        problems: pathProblems,
        ...roomProducts(pathLoad, inventory.supplies),
      }
      const arrivalMachines = roomArrivalMachines(pathLoad, inventory.machines, groups)
      const options = arrivalMachines.map((entry) => ({ machineId: entry.machineId as string, name: entry.name }))
      const like = groups.find((entry) => entry.own)?.machines[0] ?? arrivalMachines[0]
      return (
        <>
          <WasherPathScreen
            view={view}
            pending={pending}
            options={options}
            recent={recentWashers}
            onPick={(machineId) => pickMachine(pathLoad, index, groups, machineId)}
            onAddLabel={like === undefined ? undefined : (name) => void onAddLabel(like.machineId, name).then((machineId) => {
              if (machineId !== null) setChosen((current) => new Map(current).set(washerPickKey(pathLoad), { machineId, numberSkipped: false }))
            })}
            onNoNumber={arrivalMachines.length === 0 ? undefined : () => {
              if (groups.length <= 1) {
                const first = arrivalMachines[0]
                if (first !== undefined) setChosen((current) => new Map(current).set(washerPickKey(pathLoad), { machineId: first.machineId, numberSkipped: true }))
              } else setChoosing({ loadId: pathLoad.id, number: index + 1, groups, step: { kind: 'skip' } })
            }}
            titleRef={titleRef}
            onBack={onBack}
            onRunAction={runAction}
            onConfirm={() => { if (picked !== null) onConfirm(pathLoad.id, picked.machineId) }}
            onRanOut={onRanOut === undefined ? undefined : (supplyId) => onRanOut(supplyId)}
            onSwitchDetergent={onSwitchDetergent}
            onRestock={onRestock}
            onUseAnother={onSwitchDetergent === undefined ? undefined : () => setPickingDetergent(pathLoad.id)}
            // The start carries the washer that was confirmed: a recipe confirmed for one washer never starts on another.
            onContinue={() => { if (picked !== null && startable && treatments !== null) onStart(pathLoad.id, { ...(picked.machineId === pathLoad.machineId && !picked.numberSkipped ? {} : { machineId: picked.machineId, numberSkipped: picked.numberSkipped }), label: startLabel(pathLoad.id) }) }}
          />
          {washerSheet}
          {pickingDetergent !== pathLoad.id || onSwitchDetergent === undefined ? null : (
            <DetergentSheet
              mode="pick"
              loadTitle={cardView.title}
              current={view.detergent?.chosenId == null ? null : { supplyId: view.detergent.chosenId, name: product(view.detergent.chosenId) ?? '' }}
              choices={detergentChoices(pathLoad, inventory.supplies)}
              onClose={() => setPickingDetergent(null)}
              onConfirm={(supplyId) => { setPickingDetergent(null); onSwitchDetergent(supplyId, null) }}
            />
          )}
        </>
      )
    }
  }

  const actions = householdActions(plan.result.reasons)
  const left = notInLoads(plan.result, { garment: (textileId) => byId.get(textileId)?.name ?? laundryText.guestItem, product })
  // Left-out garments that came back with a source show as rows; the plain fold keeps only the rest.
  const setupReasonIds = new Set(plan.result.reasons.filter((reason) => reason.textileIds.length === 0 && exclusionWords(reason).action !== undefined).map((reason) => reason.id))
  // Missing equipment already has an Add row; keep problems with recorded equipment and garments.
  const leftItems = (plan.excludedItems ?? []).filter((item) => !setupReasonIds.has(item.reasonId)
    || item.source.kind === 'garment'
    || (item.source.kind === 'washer' ? inventory.machines.some((machine) => machine.machineId === item.source.id) : inventory.supplies.some((supply) => supply.supplyId === item.source.id)))
  const leftGroups = sourceGroups(leftItems, plan.result.reasons, questions, null, names)
  const leftShown = new Set(leftGroups.flatMap((group) => group.source.kind === 'garment' ? [group.source.id] : []))
  const leftRest = left.filter((row) => !leftShown.has(row.textileId))
  const selected = planPass(plan).selection.flatMap((id) => byId.get(id) ?? [])
  const groups = groupGarments(selected)
  const pendingCare = new Set(cards.filter((card) => card.kind === 'care_unknown' || card.kind === 'dry_clean_only').flatMap((card) => card.subjectIds))
  const taskSubject = (card: PlanQuestion) => {
    if (card.machine) return card.machine.name
    if (card.product) return [card.product.name, card.context.soilLevel === undefined ? null : soilButtonWords[card.context.soilLevel], card.context.washerClass === undefined ? null : planningText.washerClasses[card.context.washerClass]].filter(Boolean).join(' · ')
    const names = [...new Set(card.subjectIds.map((id) => byId.get(id)?.name ?? laundryText.guestItem))]
    return `${names.join(', ')}${card.subjectIds.length > 1 ? ` ×${card.subjectIds.length}` : ''}`
  }
  // Home "Steps for": shown only when a mixed room gave some load alternates; a local preview, never a mutation.
  const classOptions = homeClassOptions(loads, inventory.machines)

  /** One load as the review and its own screen both read it: its card, whether it can start, and its problems. */
  const detailOf = (load: PlanLoad, index: number) => {
    const state = plan.loadStates.find((entry) => entry.loadId === load.id)
    const startingEntry = state?.sessionId ? undefined : starting.get(load.id)
    const ownApplianceType = inventory.machines.find((machine) => machine.machineId === load.machineId)?.applianceType ?? null
    // A tap waiting on the server wins over the home toggle: once starting, the card shows the real washer.
    const previewMachineId = startingEntry !== undefined ? (startingEntry.machineId ?? load.machineId) : homeRepresentative(load, selectedClass, ownApplianceType)
    const previewTreatments = previewMachineId === null ? null : loadFor(load, previewMachineId)
    const view = previewTreatments === null
      ? loadCardView(load, index + 1, facts, state?.blockingReasonIds ?? [])
      : { ...loadCardView(load, index + 1, facts, state?.blockingReasonIds ?? []), doses: previewTreatments.map((step) => doseLine(step, facts)).filter((line): line is DoseLineView => line !== null) }
    const start: LoadStart = state?.sessionId || startingEntry !== undefined ? 'open' : state?.startable ? 'start' : loadHasQuestion(questions, load.id) ? 'question' : 'blocked'
    const loadQuestion = cards.find((card) => loadHasQuestion([card], load.id))
    const otherClassNote = startingEntry !== undefined ? null : homeOtherClassNote(load, selectedClass, ownApplianceType, product)
    const problems = sourceGroups(state?.blockedItems ?? [], plan.result.reasons, questions, load.id, names)
    const check = start === 'blocked' || start === 'question' ? nextCheck(problems) : null
    return { state, startingEntry, view, start, loadQuestion, otherClassNote, problems, check, treatments: previewTreatments ?? load.treatments }
  }

  // The Add washer / Add detergent actions the plan asks for, as the same rows wherever they appear.
  const householdSection = actions.length === 0 ? null : (
    <Section>
      {actions.map((action) => (action.kind === 'add_washer' && onAddWasher !== undefined ? (
        <RecordRow key={action.kind} media={<DesignIcon name="washer" size="1em" strokeWidth={2.2}  />} title={laundryText.addWasher} fact={laundryText.addWasherHint} onOpen={pending ? undefined : onAddWasher} />
      ) : action.kind === 'add_product' && onAddBottle !== undefined ? (
        <RecordRow key={action.kind} media={<DesignIcon name="drop" size="1em" strokeWidth={2.2}  />} title={laundryText.addDetergent} fact={laundryText.addDetergentHint} onOpen={pending ? undefined : onAddBottle} />
      ) : <li key={action.kind} className="p-3">{renderLink({ to: 'household' }, { className: cn(buttonVariants(), "secondary"), children: action.label })}</li>))}
    </Section>
  )

  const shown = loads.find((entry) => entry.id === loadId)
  if (shown !== undefined) {
    const index = loads.indexOf(shown)
    const { state, startingEntry, view, start, loadQuestion, otherClassNote, problems, check, treatments } = detailOf(shown, index)
    const planned = inventory.machines.find((machine) => machine.machineId === shown.machineId)
    const washerRow = planned === undefined || planned.location === 'shared'
      ? { title: loadScreenText.washerChosenLater, fact: loadScreenText.washerEnterLater }
      : { title: planned.name, fact: loadScreenText.householdWasher }
    const otherKeys = new Set(loads.filter((entry) => entry !== shown).flatMap((entry) => [...loadGroupKeys(entry, byId)]))
    const review = loadReviewModel({ load: { textileIds: shown.textileIds, treatments }, textiles: byId, wearers: inventory.wearers, supplies: inventory.supplies, outIds, excludedSupplyIds: plan.pass.excludedSupplyIds, first: index === 0, otherKeys, privatePieces: plan.privatePieces })
    const issue = problems.flatMap((group) => group.issues).find((entry) => entry.blocking && entry.actions.length > 0)
    return (
      <>
        <LoadScreen
          key={shown.id}
          view={view}
          review={review}
          start={start}
          pending={pending}
          loadCount={loads.length}
          allowMove={plan.pass.mode !== 'rush'}
          problems={problems}
          washer={washerRow}
          classToggle={classOptions.length < 2 ? undefined : (
            <div className={homeClassToggleClassName}>
              <span className={segmentsLabelClassName} id="home-class-toggle-label">{laundryText.stepsFor}</span>
              <RadioGroup variant="segment" className="w-full" aria-labelledby="home-class-toggle-label"
                value={(selectedClass ?? classOptions[0]!.applianceType) ?? 'own'}
                onValueChange={(value) => setSelectedClass(value === 'own' ? null : value as string)}>
                {classOptions.map((option) => <RadioGroupItem variant="segment" key={option.applianceType ?? 'own'} value={option.applianceType ?? 'own'} className="flex-1">{option.title}</RadioGroupItem>)}
              </RadioGroup>
            </div>
          )}
          otherClassNote={otherClassNote}
          next={check === null ? null : { label: check.label, compactLabel: check.action.kind === 'choose-pretreatment' ? sourceIssueText.choosePretreatment : undefined, remaining: Math.max(1, blockingCount(problems)), issue: issue?.title ?? null, onClick: () => runAction(check.action) }}
          onResolve={loadQuestion === undefined ? undefined : () => onQuestion(loadQuestion)}
          // Arrival and washer confirmation can precede resolving the load; execution still requires a startable plan.
          onAtRoom={() => onAtMachine(shown.id)}
          openLink={state?.sessionId
            ? renderLink({ to: 'session', sessionId: state.sessionId }, { className: cn(buttonVariants({ size: 'lg' }), 'w-full'), children: loadReviewText.openSession })
            : startingEntry === undefined ? null : <span role="status">{laundryText.startedWasher(startedWasherLabel(startingEntry, inventory.machines))}</span>}
          onRunAction={runAction}
          onMove={(textileId, group) => onMove(textileId, group, loads)}
          onNotThisTime={onNotThisTime}
          onQuantity={(row, count) => {
            if (count < row.textileIds.length) onLeaveOut(row.textileIds.slice(count))
            else onAddToLoad(row.candidates.slice(0, count - row.textileIds.length), index + 1, loads)
          }}
          onPutBack={(row) => onAddToLoad(row.textileIds, index + 1, loads)}
          onToggleSoftener={onToggleSoftener}
          onPickDetergent={onSwitchDetergent === undefined || state?.sessionId ? undefined : () => setPickingDetergent(shown.id)}
          leftIssues={index === 0 ? leftGroups : undefined}
          leftNotes={index === 0 ? leftRest : undefined}
          extra={householdSection}
          optionsExtra={state?.sessionId || shown.productRecommendations === undefined ? null : <>
            <PersonalProductGuidance householdId={plan.householdId} planId={plan.planId} loadId={shown.id} inputHash={plan.inputHash} textileIds={shown.textileIds} textiles={inventory.textiles} supplyIds={shown.productRecommendations.map((decision) => decision.supplyId)} supplies={inventory.supplies} selected={(plan.pass.optionalSupplyIds ?? []).filter((id) => !plan.pass.excludedSupplyIds.includes(id))} disabled={pending || startingEntry !== undefined} benefits={{ decisions: shown.productRecommendations, goal: plan.pass.washGoals?.[0] ?? 'ordinary', onGoal: onWashGoal, onChoose: onToggleSoftener }} />
          </>}
          onBack={onBack}
          titleRef={titleRef}
          docked={docked}
        />
        {washerSheet}
        {pickingDetergent !== shown.id || onSwitchDetergent === undefined ? null : (
          <DetergentSheet
            mode="pick"
            loadTitle={view.title}
            current={shown.detergent?.chosenId == null ? null : { supplyId: shown.detergent.chosenId, name: product(shown.detergent.chosenId) ?? '' }}
            choices={detergentChoices(shown, inventory.supplies)}
            onClose={() => setPickingDetergent(null)}
            onConfirm={(supplyId) => { setPickingDetergent(null); onSwitchDetergent(supplyId, null) }}
          />
        )}
      </>
    )
  }

  const nextLoad = loads.find((load, index) => detailOf(load, index).start !== 'open') ?? loads[0]
  return (
    <>
      <TaskHeading
        title={planningText.review}
        titleRef={titleRef}
        back={<BackButton label={laundryText.backToHamper} disabled={pending} onClick={onBack} />}
        mark={cards.length > 0 ? { tone: 'waiting', text: planReviewText.toResolve(cards.length) } : undefined}
        caption={`${planningText.selected(selected.length)} · ${countWord(loads.length, 'load')}`}
      />
      {cards.length > 0 ? <Note>{planReviewText.waitingTasks}</Note> : null}
      {loads.length === 0 ? null : <PlanLoadRows loads={loads} detailOf={detailOf} pending={pending} onOpenLoad={onOpenLoad} />}
      <Section heading={planReviewText.clothes}>
        <RecordRow
          media={<DesignIcon name="laundry" size="1em" strokeWidth={2.2}  />}
          title={planReviewText.include(selected.length)}
          fact={`${groups.slice(0, 2).map((group) => `${group.name}${group.members.length > 1 ? ` ×${group.members.length}` : ''}`).join(', ')}${groups.length > 2 ? ` +${groups.length - 2}` : ''}`}
          trailing={<Button type="button" variant="tonal" size="sm" disabled={pending} onClick={onChangeClothes}>{planningText.editSelection}</Button>}
        />
        {cards.map((card) => (
          <RecordRow
            key={JSON.stringify(card.key)}
            media={card.kind === 'care_unknown' || card.kind === 'dry_clean_only' ? <DesignIcon name="tag" size="1em" strokeWidth={2.2}  /> : card.kind === 'washer_he' ? <DesignIcon name="washer" size="1em" strokeWidth={2.2}  /> : <DesignIcon name="drop" size="1em" strokeWidth={2.2}  />}
            title={taskSubject(card)}
            fact={planningText.task[card.kind]}
            mark={{ tone: 'confirm' }}
            onOpen={pending ? undefined : () => onQuestion(card)}
            label={`${taskSubject(card)}. ${planningText.task[card.kind]}`}
          />
        ))}
      </Section>
      {loads.length > 0 ? null : <Note>{pendingCare.size > 0 ? planningText.waitingForCare : planningText.noWashes}</Note>}
      {washerSheet}
      {householdSection}
      {leftGroups.length === 0 ? null : <SourceRows groups={leftGroups} heading={sourceIssueText.leftOutHeading(leftGroups.length)} pending={pending} onAction={runAction} />}
      {leftRest.length === 0 ? null : (
        <Section heading={laundryText.notInLoads(leftRest.length)}>
          {leftRest.map((row) => <RecordRow key={row.textileId} media={<DesignIcon name="tag" size="1em" strokeWidth={2.2}  />} title={row.text} />)}
        </Section>
      )}
      {!docked || nextLoad === undefined ? null : <TaskFooter><Button type="button" size="lg" className="w-full" disabled={pending} onClick={() => onOpenLoad(nextLoad.id)}>Review next load</Button></TaskFooter>}
    </>
  )
}

function PlanLoadRows({ loads, detailOf, pending, onOpenLoad }: {
  loads: readonly PlanLoad[]
  detailOf: (load: PlanLoad, index: number) => { view: LoadCardView; start: LoadStart }
  pending: boolean
  onOpenLoad: (loadId: string) => void
}) {
  const [limit, setLimit] = useState(5)
  return <>
    <Section heading="Your loads" caption={countWord(loads.length, 'load')}>
      {loads.slice(0, limit).map((load, index) => {
        const { view, start } = detailOf(load, index)
        return <RecordRow key={load.id} media={<DesignIcon name="washer" size="1em" />} title={view.title}
          fact={`${countWord(load.textileIds.length, 'piece')} · ${view.settings}`}
          mark={{ tone: start === 'open' ? 'washing' : start === 'start' ? 'ready' : 'confirm', text: start === 'open' ? 'In progress' : start === 'start' ? 'Ready to review' : 'Needs attention' }}
          onOpen={pending ? undefined : () => onOpenLoad(load.id)} />
      })}
    </Section>
    {loads.length <= limit ? null : <Button type="button" variant="outline" onClick={() => setLimit(current => current + 5)}>Show next {Math.min(5, loads.length - limit)} loads</Button>}
  </>
}

const sourceIcon = { garment: <DesignIcon name="tag" size="1em" strokeWidth={2.2}  />, product: <DesignIcon name="drop" size="1em" strokeWidth={2.2}  />, washer: <DesignIcon name="washer" size="1em" strokeWidth={2.2}  /> } as const

/** Each garment, product or washer with its problems directly under it, and the actions for that source only. */
function SourceRows({ groups, heading, pending, onAction }: { groups: readonly SourceGroup[]; heading: string; pending: boolean; onAction: (action: IssueAction) => void }) {
  return <RecordList heading={heading}>
    {groups.map((group) => {
      const conflict = group.issues.some((issue) => issue.kind === 'conflict')
      return <RecordRow
        key={`${group.source.kind}:${group.source.id}`}
        media={group.icon === undefined ? sourceIcon[group.source.kind] : <GarmentIcon kind={group.icon.kind} colorGroup={group.icon.colorGroup} />}
        title={group.name}
        fact={group.issues.some((issue) => issue.held) ? undefined : sourceIssueText.sourceKind[group.source.kind]}
        mark={group.issues.some((issue) => issue.held) ? undefined : { tone: conflict ? 'conflict' : 'confirm' }}
        issues={group.issues.map((issue) => issue.held ? <HeldNote
          key={issue.reasonId}
          title={issue.title}
          label={sourceIssueText.held.options(group.name)}
          actions={issue.actions.map((entry) => ({ label: entry.label, disabled: pending, onClick: () => onAction(entry.action) }))}
        /> : <IssueNote
          key={issue.reasonId}
          kind={issue.kind}
          title={issue.title}
          detail={issue.detail}
          actions={issue.actions.map((entry) => ({ label: entry.label, onClick: () => { if (!pending) onAction(entry.action) } }))}
        />)}
      />
    })}
  </RecordList>
}

// ---- The hamper and dry cleaning ----------------------------------------------------------------

type HamperScreensProps = LaundryViewProps & {
  selection: readonly string[]
  out: readonly string[]
  pending: boolean
  nameOf: (textileId: string) => string
  onOut: (textileIds: readonly string[], left: boolean) => void
  onMakeLoads: () => void
  /** Plans again with this selection and pass and stays here (a day plan); the new plan's id. */
  onReplanHere: (selection: readonly string[], pass: Pass) => Promise<string | null>
  /** Opens one planned load's review directly: the plan, on that load. */
  onOpenLoad: (planId: string, loadId: string) => void
  run: (work: () => Promise<string | null | void>) => Promise<void>
  say: (message: string | null, tone?: 'good' | 'bad') => void
  /** A confirmation goes to Sonner; only an error stays here, inline. */
  error: ReactNode
}

/** Nothing to wash anywhere: no hamper, no hand wash and no dry cleaning. First run lands here. */
export function laundryIsEmpty(textiles: readonly Textile[]): boolean {
  return machineHamper(textiles).length === 0 && handWashList(textiles).length === 0
    && !textiles.some((textile) => !textile.guest && (textile.status === 'needs_dry_clean' || textile.status === 'at_cleaner'))
}

/** A row that is a link to another page, drawn exactly like a record row. */
function LinkRow({ renderLink, to, media, title, fact, mark }: {
  renderLink: LaundryLink
  to: LaundryTarget
  media: ReactNode
  title: ReactNode
  fact?: ReactNode
  mark?: { tone: MarkTone; text?: string }
}) {
  return <li className="record-row [&+&]:[border-block-start:1px_solid_var(--line)]">
    {renderLink(to, {
      className: cn(itemVariants({ variant: 'interactive' }), 'no-underline'),
      children: <>
        <MediaTile media={media} />
        <ItemContent>
          <ItemTitle>{title}</ItemTitle>
          {fact === undefined ? null : <ItemDescription>{fact}</ItemDescription>}
        </ItemContent>
        <RecordRowEnd mark={mark} opens />
      </>,
    })}
  </li>
}

/** A running load's mark: the minutes left from the machine's recorded time, else the stage in words. */

function HamperScreens(props: HamperScreensProps) {
  const { now, inventory, hamper, calls, selection, pending, nameOf, run, say } = props
  const segment: WashSegment = props.initialSegment ?? 'hamper'
  const [sheet, setSheet] = useState<LaundrySheet | null>(props.initialSheet ?? null)
  // Dry cleaning rows picked for Dropped off or Picked up; a finished sheet clears them.
  const [picked, setPicked] = useState<readonly string[]>([])
  const sharedEntry = useSharedStart()
  const close = () => setSheet(null)
  const done = (message: string | null) => {
    setSheet(null)
    setPicked([])
    say(message)
    props.onItemClose?.()
  }

  const openSheet = (next: LaundrySheet) => next.kind === 'garment' && props.onItemOpen !== undefined ? props.onItemOpen(next.textileIds[0]!) : setSheet(next)
  const closeItem = () => { close(); props.onItemClose?.() }
  const itemNotice = props.itemMissing ? <Callout>This item is no longer waiting in this hamper. <Button variant="link" size="sm" onClick={props.onItemClose}>Return to laundry</Button></Callout> : null

  const sheets = (
    props.itemSheet ? <RoutedLaundrySheets key={props.itemKey} sheet={props.itemSheet} now={now} householdId={props.householdId} inventory={inventory} calls={calls} nameOf={nameOf}
      onSheet={setSheet} onClose={closeItem} onDone={done} addToHamper={props.addToHamper} out={props.out} onOut={props.onOut} /> : <LaundrySheets sheet={sheet} now={now} householdId={props.householdId} inventory={inventory} calls={calls} nameOf={nameOf}
      onSheet={setSheet} onClose={closeItem} onDone={done} addToHamper={props.addToHamper} out={props.out} onOut={props.onOut} />
  )
  const renderLink = props.renderLink ?? plainLaundryLink
  // Without laundry day from the server, the hamper alone; its Make loads uses this device's selection.
  const base: HubState = props.hub ?? (hamper.count > 0 ? { kind: 'hamper', count: hamper.count, loads: hamper.loads } : { kind: 'empty' })
  const state = base
  const pipeline = laundryPipeline(inventory.textiles, props.hub, now, inventory.wearers, props.viewerKey)
  // Every load still in a machine, each opening its own session; several can run at once.
  const runningRows = hubRows(state)
  const washingRows: readonly RunningRow[] = runningRows.filter((row) => row.stage === 'preparing' || row.stage === 'washing' || row.stage === 'wash_done')
  // A wet load waiting for the home dryer holds the next wash back; a shared room may start one on another washer.
  // Pieces that only hang never hold a wash back either.
  const nextLoad = state.kind === 'pass' ? state : state.kind === 'running' ? state.next : state.kind === 'wet' && (state.wait.dryer === null || state.tumble === 0) ? state.next : null
  // Every load still to start, each opening its own review; the plan's first one leads the footer.
  const plannedLoads = nextLoad?.loads ?? []
  // A shared room with several washers: what is free at the start of a pass sizes the first washes (design 11).
  const sharedWashers = sharedWasherCount(inventory.machines)
  const sharedStart = sharedStartView(state, sharedEntry, sharedWashers)
  const pickIds = sharedStart?.kind === 'picks' ? new Set(sharedStart.now.map((load) => load.loadId)) : null
  // The footer opens the first load to start now, else the first in wash order.
  const footerLoad = sharedStart?.kind === 'picks' && sharedStart.now.length > 0 ? sharedStart.now[0]! : plannedLoads[0]
  const byTextile = new Map(inventory.textiles.map((textile) => [textile.textileId as string, textile]))
  // One name per load on every screen: the list, the strip and this footer agree.
  const plannedNames = loadNames(plannedLoads, (id) => byTextile.get(id))
  const firstLoadName = footerLoad === undefined ? null : plannedNames.get(footerLoad.loadId) ?? null
  const openNext = () => { if (nextLoad !== null) (footerLoad === undefined ? props.onPlan(nextLoad.planId, false) : props.onOpenLoad(nextLoad.planId, footerLoad.loadId)) }
  const openNextLabel = nextLoad === null ? '' : firstLoadName === null ? hubScreenText.openNextLoad(nextLoad.name ?? hubScreenText.loadNumber(nextLoad.number)) : hamperLoadsText.openLoad(firstLoadName)
  // Every "Start now" pick is running: the main action follows those loads; opening a later one stays his choice, not the main button.
  const restHeld = sharedStart?.kind === 'picks' && sharedStart.now.length === 0 && runningRows.length > 0
  const textilesOf = (load: PlannedLoad) => load.textileIds.flatMap((id) => byTextile.get(id) ?? [])
  const hamperIds = machineHamper(inventory.textiles).map((textile) => textile.textileId as string)
  // The one next task, as the row on the Today card: a held-back start opens the load that is running.
  const upNext: UpNext | null = nextLoad === null ? null : restHeld
    ? { title: homeHeroText.running.open(runningRows[0]!.machine), onOpen: () => props.onSession(runningRows[0]!.sessionId), disabled: pending }
    : { title: openNextLabel, onOpen: openNext, disabled: pending }
  // Starting everything now and sorting again are departures: they sit behind the Loads heading's menu.
  const loadOptions = [
    ...(sharedStart?.kind === 'picks' && sharedStart.all !== null && sharedEntry !== null && !('done' in sharedEntry) && !restHeld
      ? [{ key: 'start-all', label: sharedStartText.startAll(sharedStart.all), onClick: () => saveSharedStart({ ...sharedEntry, now: sharedEntry.all, choseAll: true }) }] : []),
    ...(hamperIds.length === 0 ? [] : [{ key: 'sort-again', label: hubScreenText.sortAgain, disabled: pending || selection.length === 0, onClick: props.onMakeLoads }]),
  ]
  const dryCleaningCount = inventory.textiles.filter((textile) => !textile.guest && ((textile.status === 'needs_dry_clean' && textile.inLoad === null) || textile.status === 'at_cleaner')).length
  const queued = props.drying?.queued ?? 0
  const dryPieces = props.drying?.dry ?? 0
  const hanging = props.drying === undefined ? pipeline.counts.drying : 0

  // The sheets sit beside the page in both branches, so the first save into an empty hamper keeps the
  // same intake mounted (Sheet portals, so this placement changes React identity only, not the DOM).
  if (laundryIsEmpty(inventory.textiles) && pipeline.tiles.length === 0) {
    return <>
      <div className={cn(laundryPageClassName, washClassName, 'is-selecting')}>
        <CareHero title="Laundry" />
        <div className={washMainClassName}>
          <LaundryWorkspace householdId={props.householdId} inventory={inventory} counts={props.inventoryCounts} now={now} waiting={0} empty active={false} pending={pending} renderLink={renderLink} onAdd={() => setSheet({ kind: 'add_hamper' })} flag={calls.flagDirty} onDone={done} />
          {itemNotice}
          {props.error}
        </div>
      </div>
      {sheets}
    </>
  }

  const dryClean = <DryCleaningSegment now={now} inventory={inventory} pending={pending} calls={calls} run={run} picked={picked} onPicked={setPicked} onSheet={setSheet} />
  const browseSegments = segment === 'hamper' ? <HamperSegment {...props} onSheet={openSheet} /> : dryClean
  const toGo = inventory.textiles.filter((textile) => !textile.guest && textile.status === 'needs_dry_clean' && textile.inLoad === null)
  const atCleaner = inventory.textiles.filter((textile) => !textile.guest && textile.status === 'at_cleaner')
  const pickedToGo = toGo.filter((textile) => picked.includes(textile.textileId)).map((textile) => textile.textileId as string)
  const pickedBack = atCleaner.filter((textile) => picked.includes(textile.textileId))

  // The one footer: dry cleaning picks first, else open the plan that exists, else sort the hamper into loads.
  const footer = pickedToGo.length + pickedBack.length > 0 ? (
    <TaskFooter>
      {pickedToGo.length === 0 ? null : <Button type="button" size="lg" className="w-full" disabled={pending} onClick={() => setSheet({ kind: 'dropped', textileIds: pickedToGo })}>{laundryText.droppedOff}</Button>}
      {pickedBack.length === 0 ? null : (
        <Button type="button" size="lg" className="w-full" disabled={pending} onClick={() => void run(async () => {
          const result = await calls.pickedUp({ textileIds: ids(pickedBack.map((textile) => textile.textileId)) })
          setPicked(picked.filter((id) => !pickedBack.some((textile) => textile.textileId === id)))
          return backInClosetToast(pickedBack.map((textile) => textile.name), result.changed)
        })}>{laundryText.pickedUp}</Button>
      )}
    </TaskFooter>
  ) : sharedStart?.kind === 'ask' ? (
    <TaskFooter>
      <SharedCounts onSkip={() => saveSharedStart({ planId: sharedStart.planId, done: true })} onAnswer={(washers, dryers) => {
        saveSharedStart({ planId: sharedStart.planId, ...sharedPicks(plannedLoads, washers, dryers) })
      }} />
    </TaskFooter>
  ) : nextLoad !== null ? null : hamperIds.length > 0 ? (
    <TaskFooter>
      <Button type="button" size="lg" className="w-full" disabled={pending || selection.length === 0} onClick={props.onMakeLoads}>{selection.length === 0 ? hubScreenText.selectToSort : hubScreenText.sortIntoLoads(selection.length)}</Button>
    </TaskFooter>
  ) : null

  const workspace = <LaundryWorkspace householdId={props.householdId} inventory={inventory} counts={props.inventoryCounts} now={now} waiting={hamper.count} empty={false} active={nextLoad !== null || runningRows.length > 0} pending={pending} renderLink={renderLink} onAdd={() => setSheet({ kind: 'add_hamper' })} flag={calls.flagDirty} onDone={done} />
  return <>
    <div className={cn(laundryPageClassName, washClassName, 'is-selecting')}>
      <CareHero title="Laundry" />
      <div className={washMainClassName}>
        {nextLoad === null && runningRows.length === 0 ? workspace : null}
        {/* At home with one dryer: the next wash, timed against the dryer, and the minutes it needs. */}
        {(state.kind === 'running' || state.kind === 'finished' || state.kind === 'pass') && state.step !== undefined ? <NextStepCard step={state.step} moving={state.kind === 'finished'} now={now} /> : null}
        <EarlyChecks checks={props.checks ?? []} now={now} renderOpen={(run, linkProps) => renderLink({ to: 'drying', run }, linkProps)} />
        {sharedStart === null ? null : <TrialNote>{dryerWaitTrialText.sharedStart}</TrialNote>}
        {sharedStart?.kind !== 'picks' ? null : <Note role="status">{sharedStart.now.length === 0 ? sharedStartText.rest
          : `${sharedStartText.startNow(sharedStart.now.length)}. ${sharedStart.choseAll ? sharedStartText.allWhy : sharedStartText.why}`}</Note>}
        {nextLoad === null && runningRows.length === 0 ? null : (
          <DayPlan householdId={props.householdId} state={state} inventory={inventory} now={now} pending={pending} run={run} onReplan={props.onReplanHere} onSession={props.onSession}
            onOpenLoad={props.onOpenLoad} onOpenPlan={(planId) => props.onPlan(planId, false)} upNext={upNext} options={loadOptions}
            loadMark={(load) => textilesOf(load).length === 0 ? null : !load.startable ? hamperLoadsText.toResolve : pickIds === null ? null : pickIds.has(load.loadId) ? sharedStartText.mark : sharedStartText.later}
            fallback={nextLoad === null ? null : { title: nextLoad.name ?? hubScreenText.loadNumber(nextLoad.number), status: nextLoad.ready ? planReviewText.ready : hamperLoadsText.toResolve,
              fact: nextLoad.things === undefined ? hubScreenText.loadOf(nextLoad.number, nextLoad.count) : `${hubScreenText.loadOf(nextLoad.number, nextLoad.count)} · ${countWord(nextLoad.things, 'piece')}` }} />
        )}
        {queued + dryPieces + hanging === 0 ? null : (
          <Section heading={hubScreenText.afterWashing}>
            {queued === 0 ? null : <LinkRow renderLink={renderLink} to={{ to: 'drying' }} media={<DesignIcon name="dryer" size={24} strokeWidth={1.6} />} title={hubScreenText.waitingToDry(queued)} fact={hubScreenText.plannedByTag} mark={{ tone: 'waiting', text: hubScreenText.dryingQueue }} />}
            {dryPieces === 0 ? null : <LinkRow renderLink={renderLink} to={{ to: 'drying' }} media={<DesignIcon name="fold" size={24} strokeWidth={1.6} />} title={hubScreenText.dryToPutAway(dryPieces)} fact={hubScreenText.partialFine} mark={{ tone: 'ready', text: hubScreenText.dry }} />}
            {hanging === 0 ? null : <LinkRow renderLink={renderLink} to={{ to: 'drying' }} media={<DesignIcon name="hang" size={24} strokeWidth={1.6} />} title={hubScreenText.hangingCount(hanging)} fact={hubScreenText.plannedByTag} mark={{ tone: 'drying' }} />}
          </Section>
        )}
        {pipeline.counts.hamper > 0 || handWashList(inventory.textiles).length > 0 ? <HamperSegment {...props} onSheet={openSheet} /> : runningRows.length + queued + dryPieces + hanging + dryCleaningCount === 0 && nextLoad === null ? <Note>{hubScreenText.hamperEmptyNote}</Note> : null}
        {dryCleaningCount === 0 ? null : dryClean}
        {nextLoad === null && runningRows.length === 0 ? null : workspace}

        {/* No "Ready for today": nothing in the real data says what is ready for a given occasion today. */}

        {sheet?.kind !== 'browse' ? null : <Sheet title={laundryText.dryCleaning} onClose={close} compactActions>{browseSegments}</Sheet>}
        {sheet?.kind !== 'stage' || sheet.stage !== 'washing' || washingRows.length === 0 ? null : <Sheet title={laundryText.pipeline.washing} subtitle={runningText.loadsRunning(washingRows.length)} onClose={close} compactActions>
          <RecordList>
            {washingRows.map((row) => {
              const line = runningRowLine(row, now)
              return <RecordRow key={row.sessionId} media={<DesignIcon name="washer" size="1em" strokeWidth={2.2}  />} title={line.what} fact={[line.when, line.timer].filter((part) => part !== null).join(' · ')} onOpen={() => setSheet({ kind: 'running', sessionId: row.sessionId })} label={`${line.what}. ${runningText.sheetKicker}`} />
            })}
          </RecordList>
        </Sheet>}
        {sheet?.kind !== 'running' ? null : <RunningLoadSheet key={sheet.sessionId} sessionId={sheet.sessionId} now={now} onClose={close} openLink={(linkProps) => renderLink({ to: 'session', sessionId: sheet.sessionId }, linkProps)} />}
        {sheet?.kind !== 'stage' || (sheet.stage === 'washing' && washingRows.length > 0) ? null : <Sheet title={laundryText.pipeline[sheet.stage]} onClose={close} compactActions>
          <RecordList>{pipeline.tiles.filter((tile) => tile.state === sheet.stage).map((tile) => {
            const textile = inventory.textiles.find((row) => row.textileId === tile.textileIds[0])
            return <RecordRow key={tile.key} media={<GarmentIcon kind={tile.kind} colorGroup={tile.colorGroup} />} title={`${tile.name}${tile.count > 1 ? ` ×${tile.count}` : ''}`}
              {...(textile?.inLoad ? { onOpen: () => props.onSession(textile.inLoad!), label: laundryText.openLoad } : {})} />
          })}</RecordList>
        </Sheet>}
        {itemNotice}
        {props.error}
      </div>
      {footer}
    </div>
    {sheets}
  </>
}

/** The URL owns the selected item; editing steps live only while that drawer is mounted. */
function RoutedLaundrySheets(props: ComponentProps<typeof LaundrySheets>) {
  const [sheet, setSheet] = useState(props.sheet)
  return <LaundrySheets {...props} sheet={sheet} onSheet={(next) => next === null ? props.onClose() : setSheet(next)} />
}

function HamperSegment({ now, inventory, viewerKey, out, pending, calls, run, onOut, onSheet }: HamperScreensProps & { onSheet: (sheet: LaundrySheet) => void }) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const status = useRef<HTMLParagraphElement>(null)
  const changingPage = useRef(false)
  const entries = useMemo(() => {
    const machine = hamperGroups(inventory.textiles, inventory.wearers).flatMap(group => {
      const pieces = new Map(group.rows.map(piece => [piece.textileId as string, piece]))
      const owner = group.name || inventory.wearers.find(person => person.wearerId === group.key)?.name || (group.guests ? 'Guest' : 'Shared')
      return hamperPiles(group.rows, now, inventory.wearers, viewerKey).map(pile => ({ key: `${group.key}:${pile.key}`, pile, owner, pieces: pile.textileIds.map(id => pieces.get(id)!), hand: false as const }))
    })
    const hand = handWashList(inventory.textiles).map(piece => ({ key: piece.textileId as string, owner: inventory.wearers.find(person => person.wearerId === piece.wearerId)?.name ?? 'Shared', pieces: [piece], hand: true as const }))
    return [...machine, ...hand]
  }, [inventory.textiles, inventory.wearers, now, viewerKey])
  const words = search.trim().split(/\s+/).filter(Boolean)
  const matches = entries.filter(entry => entry.pieces.some(piece => words.every(word => matchesClothingSearch(piece, entry.owner, word))))
  const at = Math.max(0, Math.min(page, Math.ceil(matches.length / 40) - 1))
  const shown = matches.slice(at * 40, (at + 1) * 40)
  const machine = shown.filter(entry => !entry.hand)
  const handWash = shown.filter(entry => entry.hand)
  const machineIds = entries.filter(entry => !entry.hand).flatMap(entry => entry.pile.textileIds)
  const selected = machineIds.filter(id => !out.includes(id)).length
  useEffect(() => {
    if (changingPage.current) { changingPage.current = false; status.current?.focus(); status.current?.scrollIntoView({ block: 'nearest' }) }
  }, [page])
  const go = (next: number) => { changingPage.current = true; setPage(next) }

  return (
    <>
      {entries.length > 40 || search !== '' ? <div className="grid min-w-0 gap-3">
        <SearchField label="Search hamper" placeholder="Name, color, fabric or person" value={search} onChange={value => { setSearch(value); setPage(0) }} />
        <p ref={status} tabIndex={-1} role="status" className="m-0 text-ink-2 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring">
          {matches.length === 0 ? 'No matching clothes.' : `Groups ${at * 40 + 1}–${at * 40 + shown.length} of ${matches.length} · ${countWord(matches.reduce((sum, entry) => sum + entry.pieces.length, 0), 'piece')}`}
        </p>
        {machineIds.length === 0 ? null : <>
          <p className="m-0 text-ink-2">{selected} of {machineIds.length} machine-wash pieces selected across every page.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={pending || selected === machineIds.length} onClick={() => onOut(machineIds, false)}>Select all machine-wash pieces</Button>
            <Button type="button" variant="outline" disabled={pending || selected === 0} onClick={() => onOut(machineIds, true)}>Clear wash selection</Button>
          </div>
        </>}
      </div> : null}
      {machine.length === 0 ? null : (
        <Section heading={hubScreenText.inHamper2}>
          {machine.map(({ key, pile, owner }) => {
            const ownerLabel = entries.length > 40 ? owner : ''
            const selectedIds = pile.textileIds.filter((textileId) => !out.includes(textileId))
            const count = selectedIds.length
            const fact = [hubScreenText.selectedOf(count, pile.count), pile.color, ownerLabel || null, pile.neededBy === null ? null : laundryText.needed(pile.neededBy)].filter((part): part is string => part !== null).join(' · ')
            return (
              <RecordRow
                key={key}
                media={<GarmentIcon kind={pile.kind} colorGroup={pile.colorGroup} />}
                title={pile.name}
                fact={fact}
                onOpen={() => onSheet({ kind: 'garment', textileIds: pile.textileIds })}
                label={[ownerLabel, pileLabel(pile)].filter(Boolean).join(', ')}
                trailing={<QuantityStepper value={count} max={pile.count} disabled={pending} label={[ownerLabel, pile.name, pile.color].filter(Boolean).join(', ')} onChange={(next) => { const delta = washCountDelta(pile.textileIds, selectedIds, next); if (delta.ids.length > 0) onOut(delta.ids, delta.setAside) }} />}
              />
            )
          })}
        </Section>
      )}

      {handWash.length === 0 ? null : (
        <Section heading={laundryText.handWashCount(entries.filter(entry => entry.hand).length)}>
          {handWash.map(entry => { const textile = entry.pieces[0]!; return (
            <RecordRow
              key={textile.textileId}
              media={<GarmentIcon kind={textile.kind} colorGroup={textile.colorGroup} />}
              title={textile.name}
              fact={laundryText.since(dayWord(textile.statusSince, now))}
              trailing={<Button type="button" variant="tonal" size="sm" disabled={pending} onClick={() => void run(async () => {
                const result = await calls.washedElsewhere({ textileIds: ids([textile.textileId]), method: 'hand' })
                return backInClosetToast([textile.name], result.changed)
              })}>{laundryText.washedByHand}</Button>}
            />
          ) })}
        </Section>
      )}
      {matches.length > 40 ? <nav aria-label="Hamper pages" className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={at === 0} onClick={() => go(at - 1)}>Previous 40</Button>
        <Button type="button" variant="outline" disabled={(at + 1) * 40 >= matches.length} onClick={() => go(at + 1)}>Next 40</Button>
      </nav> : null}
    </>
  )
}

function DryCleaningSegment({ now, inventory, picked, onPicked: setPicked }: {
  now: number
  inventory: Inventory
  pending: boolean
  calls: LaundryCalls
  run: HamperScreensProps['run']
  picked: readonly string[]
  onPicked: (picked: readonly string[]) => void
  onSheet: (sheet: LaundrySheet) => void
}) {
  const toGo = inventory.textiles.filter((textile) => !textile.guest && textile.status === 'needs_dry_clean' && textile.inLoad === null)
  const atCleaner = inventory.textiles.filter((textile) => !textile.guest && textile.status === 'at_cleaner')
  if (toGo.length + atCleaner.length === 0) return <CareEmpty icon="storefront" title="Nothing at the cleaner" />
  const toggle = (textileId: string) => setPicked(picked.includes(textileId) ? picked.filter((id) => id !== textileId) : [...picked, textileId])
  const rows = (textiles: readonly Textile[], line: (textile: Textile) => string) => textiles.map((textile) => (
    <SwitchRow role="checkbox" key={textile.textileId} media={<GarmentIcon kind={textile.kind} colorGroup={textile.colorGroup} />} title={textile.name} fact={line(textile)}
      on={picked.includes(textile.textileId)} onToggle={() => toggle(textile.textileId)} />
  ))
  return (
    <>
      {toGo.length === 0 ? null : <Section heading={laundryText.needsToGo(toGo.length)}>{rows(toGo, (textile) => [laundryText.since(dayWord(textile.statusSince, now)), textile.cleanerNote].filter((part): part is string => part !== null).join(' · '))}</Section>}
      {atCleaner.length === 0 ? null : <Section heading={laundryText.atCleaner(atCleaner.length)}>{rows(atCleaner, (textile) => [laundryText.since(dayWord(textile.statusSince, now)), textile.cleanerPickupBy === null ? null : laundryText.pickup(dayWord(textile.cleanerPickupBy, now)), textile.cleanerNote].filter((part): part is string => part !== null).join(' · '))}</Section>}
    </>
  )
}

/** The sheet the Laundry tab has open, drawn from the live garments. */
export function washCountDelta(ids: readonly string[], selectedIds: readonly string[], count: number): { ids: string[]; setAside: boolean } {
  const selected = ids.filter((id) => selectedIds.includes(id))
  return count < selected.length
    ? { ids: selected.slice(count), setAside: true }
    : { ids: ids.filter((id) => !selectedIds.includes(id)).slice(0, count - selected.length), setAside: false }
}

function LaundrySheets({ sheet, now, householdId, inventory, calls, nameOf, onSheet, onClose, onDone, addToHamper, out = [], onOut }: {
  sheet: LaundrySheet | null
  out?: readonly string[]
  onOut?: HamperScreensProps['onOut']
  now: number
  householdId: string
  inventory: Inventory
  calls: LaundryCalls
  nameOf: (textileId: string) => string
  onSheet: (sheet: LaundrySheet | null) => void
  onClose: () => void
  onDone: (message: string | null) => void
  addToHamper?: LaundryViewProps['addToHamper']
}) {
  if (sheet === null) return null
  const members = (textileIds: readonly string[]) => inventory.textiles.filter((textile) => textileIds.includes(textile.textileId))
  switch (sheet.kind) {
    case 'garment': {
      // Only what is still waiting in the hamper: a garment washed or put away since drops out.
      const waiting = new Set(machineHamper(inventory.textiles).map((textile) => textile.textileId as string))
      const pile = members(sheet.textileIds).filter((textile) => waiting.has(textile.textileId))
      if (pile.length === 0 || onOut === undefined) return null
      const ids = pile.map((textile) => textile.textileId)
      const selectedIds = ids.filter((id) => !out.includes(id))
      return <GarmentSheet facts={{ members: pile, wearerName: pile[0]!.wearerId === null ? null : inventory.wearers.find((wearer) => wearer.wearerId === pile[0]!.wearerId)?.name ?? null, now, notWornDays: 0, doneAt: null, hangingSessionId: null }}
        calls={calls} planning={{ selectedIds, onGroupCountChange: (groupIds, count) => { const delta = washCountDelta(groupIds, selectedIds, count); if (delta.ids.length > 0) onOut(delta.ids, delta.setAside) } }}
        onRemoveGuest={async (textileId) => { await calls.deleteTextile({ textileId: textileId as FunctionArgs<typeof api.inventory.deleteTextile>['textileId'] }) }}
        // Edit opens over the still-mounted record (as in Closet): Cancel and Save return to it.
        renderEdit={(edit, close) => <AddClothesFlow householdId={householdId} mode={edit} onClose={close} />}
        onClose={onClose} onDone={onDone} onNext={(next: GarmentSheetNext) => onSheet(next)} />
    }
    case 'flag': {
      const pile = members(sheet.textileIds)
      if (pile.length === 0) return null
      return <FlagSheet garments={pile.map((textile) => ({ textileId: textile.textileId, name: textile.name, dryCleanOnly: effectiveWashMethod(textile) === 'dry_clean_only' }))}
        now={now} flag={calls.flagDirty} onClose={onClose} onDone={onDone}
        initials={sheet.mode === 'change' ? pile.map((textile) => draftFromFlag(textile.flag, textile.soilLevel, now)) : undefined}
        start="reasons" />
    }
    case 'edit':
      return <AddClothesFlow householdId={householdId} mode={sheet} onClose={onClose} />
    case 'washed':
      return <WashedSheet garments={members(sheet.textileIds)} washed={calls.washedElsewhere} onClose={onClose} onDone={onDone} />
    case 'add_hamper':
      return <>{addToHamper?.(onClose, sheet.firstRun === true) ?? null}</>
    case 'dropped':
      return <DroppedOffSheet garments={members(sheet.textileIds).map((member) => ({ textileId: member.textileId, name: nameOf(member.textileId), cleanerNote: member.cleanerNote }))} now={now} dropped={calls.droppedAtCleaner} onClose={onClose} onDone={onDone} />
    // Rendered by the hub itself, which has the segment state and the rest of HamperScreensProps.
    case 'browse':
    case 'stage':
    case 'running':
      return null
  }
}

/** Laundry's add slot: the staged intake, landing in the hamper. */
export function hamperIntake(householdId: string, firstRun: boolean, onClose: () => void): ReactNode {
  return <AddClothesFlow householdId={householdId} mode={{ kind: 'add', target: 'hamper' }} firstRun={firstRun} onClose={onClose} />
}

// ---- The screen with its data --------------------------------------------------------------

/**
 * The plan's "Add your washer": the same appliance editor as Household, opened at where it is and
 * its door, with the place from first run. The washer it saves is the record Household edits later.
 */
export function PlanWasherSheet({ householdId, savedPlace, onClose, onSaved }: {
  householdId: string
  savedPlace?: CurrentHousehold['washPlace']
  onClose: () => void
  onSaved: (message: string) => void
}) {
  return <MachineSheet householdId={householdId} kind="washer" ask="required" place={washPlace(householdId, savedPlace)} onClose={onClose} onSaved={onSaved} />
}

/** The Laundry tab with its live data. */
export function Laundry({ household, planId, loadId, onOpenLoad, onPlan, onSession, renderLink, openAddHamper = false, openMakeLoads = false, initialItem, onItemOpen, onItemClose }: {
  household: CurrentHousehold
  initialItem?: string
  onItemOpen?: LaundryViewProps['onItemOpen']
  onItemClose?: () => void
  /** Opens Add dirty clothes on arrival (first run's "start with the hamper"). */
  openAddHamper?: boolean
  openMakeLoads?: boolean
  planId: string | null
  loadId?: LaundryViewProps['loadId']
  onOpenLoad?: LaundryViewProps['onOpenLoad']
  onPlan: LaundryViewProps['onPlan']
  onSession: LaundryViewProps['onSession']
  renderLink: LaundryLink
}) {
  const householdId = household.householdId
  const shared = useHouseholdData(householdId)
  const now = useNow(30_000)
  const minute = Math.floor(now / 60_000) * 60_000
  const status = useQuery(api.households.onboardingStatus, {})
  const inventory = useQuery(api.inventory.list, { householdId, activeOnly: true })
  const inventorySummary = useQuery(api.inventoryBrowse.summary, { householdId, search: '', section: 'all', tags: [] })
  const attention = useSteady(useQuery(api.closet.attention, { householdId, now: minute })) ?? shared?.attention
  const planArgs = planId === null ? 'skip' as const : { planId: planId as FunctionArgs<typeof api.plans.get>['planId'] }
  const plan = useQuery(api.plans.get, planArgs)
  const dryingQueue = useQuery(api.dryingQueue.queue, { householdId })
  const checks = dryingQueue === undefined ? undefined : earlyChecks(dryingFacts(dryingQueue))
  const drying = dryingQueue === undefined ? undefined : { queued: dryingQueue.pieces.filter((piece) => piece.status === 'queued').length, dry: dryingQueue.pieces.filter((piece) => piece.status === 'dry').length }
  const questions = useQuery(api.plans.questions, planArgs)
  // Device-only choices must not differ from the server's first render; after hydration they are read at once.
  const client = useClientRender()
  const draft = useMemo<PlanningDraft | null | undefined>(() => client ? loadDraft(householdId) : undefined, [client, householdId])
  const calls: LaundryCalls = {
    recompute: useMutation(api.plans.recompute),
    start: useMutation(api.execution.start),
    confirmRecipe: useMutation(api.plans.confirmRecipe),
    setRanOut: useMutation(api.inventory.setRanOut),
    addMachineLikeIt: useMutation(api.inventory.addMachineLikeIt),
    setRefresh: useMutation(api.closet.setRefresh),
    unflag: useMutation(api.closet.unflag),
    refreshed: useMutation(api.closet.refreshed),
    washedElsewhere: useMutation(api.closet.washedElsewhere),
    deleteTextile: useMutation(api.inventory.deleteTextile),
    droppedAtCleaner: useMutation(api.closet.droppedAtCleaner),
    pickedUp: useMutation(api.closet.pickedUp),
    flagDirty: useMutation(api.closet.flagDirty),
    answerTagQuestions: useMutation(api.inventory.answerTagQuestions),
    moveToDryCleaning: useMutation(api.closet.moveToDryCleaning),
    setTextileStatus: useMutation(api.inventory.setTextileStatus),
    updateMachine: useMutation(api.inventory.updateMachine),
    answerLabelRow: useMutation(api.inventory.answerLabelRow),
    updateSupply: useMutation(api.inventory.updateSupply),
    washerGroup: (machineId) => washerGroupIds(machineId, inventory?.machines ?? []),
    allDry: useMutation(api.closet.allDry),
  }
  // Laundry day from the server: a relaunch lands on the running loads or the open plan.
  const hub = useLaundryDay(householdId, now)
  const recent = useRecentMachines(householdId)
  const saved = (selection: readonly string[], seen: readonly string[], opened: { planId: string | null; inputHash: string | null } | null = null) => {
    const previous = loadDraft(householdId)
    saveDraft({ householdId, selectedTextileIds: selection, seenTextileIds: seen, planId: opened?.planId ?? previous?.planId ?? null, inputHash: opened?.inputHash ?? previous?.inputHash ?? null })
  }

  if (draft === undefined || inventory === undefined || inventorySummary === undefined || attention === undefined || hub === undefined) {
    return (
      <div className={cn(laundryPageClassName, washClassName)}>
        <CareHero title="Laundry" detail={laundryText.loadingHamper} />
        <Loading what={laundryText.loadingHamper} />
      </div>
    )
  }
  const arrival = inventory.textiles.find((textile) => textile.textileId === initialItem)
  const arrivalIds = arrival === undefined ? [] : groupGarments(machineHamper(inventory.textiles).filter((textile) => textile.wearerId === arrival.wearerId))
    .find((group) => group.members.some((textile) => textile.textileId === initialItem))?.members.map((textile) => textile.textileId) ?? []
  return (
    <LaundryView
      now={now}
      householdId={householdId}
      viewerKey={status?.principalKey ?? null}
      place={household.washPlace}
      inventory={inventory}
      inventoryCounts={{ ready: inventorySummary.counts.ready, total: inventorySummary.total }}
      recentWashers={recent.washers}
      checks={checks}
      hamper={attention.hamper}
      draft={draft}
      onDraft={(selection, seen) => saved(selection, seen)}
      planId={planId}
      loadId={loadId}
      onOpenLoad={onOpenLoad}
      plan={plan}
      questions={questions}
      calls={calls}
      onPlan={onPlan}
      onSession={onSession}
      renderLink={renderLink}
      hub={hub}
      drying={drying}
      addToHamper={(onClose, firstRun) => hamperIntake(householdId, firstRun, onClose)}
      // Read once: the screen keeps this sheet in state, so a save that fills the hamper keeps the first-run title.
      initialSheet={openAddHamper ? { kind: 'add_hamper', firstRun: household.firstHamperNotePending && inventorySummary.total === 0 } : null}
      itemSheet={arrivalIds.length === 0 ? null : { kind: 'garment', textileIds: arrivalIds }}
      itemKey={initialItem}
      onItemOpen={onItemOpen}
      onItemClose={initialItem === undefined ? undefined : onItemClose}
      itemMissing={initialItem !== undefined && arrivalIds.length === 0}
      openMakeLoads={openMakeLoads}
      addWasher={({ onClose, onSaved }) => <PlanWasherSheet householdId={householdId} savedPlace={household.washPlace} onClose={onClose} onSaved={onSaved} />}
      addBottle={({ onClose, onSaved }) => <BottleSheet householdId={householdId} supplies={inventory.supplies} title={laundryText.addDetergent} onClose={onClose} onSaved={onSaved} />}
    />
  )
}
