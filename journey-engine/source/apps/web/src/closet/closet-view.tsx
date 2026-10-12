import { hangingSession } from '@/laundry/hanging-session'
export { hangingSession } from '@/laundry/hanging-session'
import { buttonVariants } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { BrowseSearch } from '@/kit/browse-search'
import { PageStatus } from '@/kit/page-status'
import { useDeviceState } from '@/kit/device-state'
import { BulkClosetSheet, PagedBulkClosetSheet, type BulkUpdate } from '@/closet/bulk-sheet'
import { matchesClothingSearch, usedClothingTags } from '@washcloset/planner'
import { usePagedInventory, type BrowseArgs } from '@/closet/paged-inventory'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionArgs, FunctionReturnType } from 'convex/server'
import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react'

import type { Id } from '@convex/_generated/dataModel'
import type { CurrentHousehold } from '@/account/account'
import type { AddMode } from '@/closet/add-clothes'
import { api } from '@/api'
import { closetRails, closetState, kindHeadings, type ClosetGarment, type ClosetRail, type ClosetState, type ClosetTile } from '@/closet/closet-groups'
import { closetText, colorDisplay, colorWord, countWord, dayWord, kindNameWords, monthWord, noWearerWords } from '@/copy'
import { closetListText } from '@/copy-closet'
import { useClientRender } from '@/kit/client-render'
import { ClosetGlance, glanceCounts } from '@/closet/closet-glance'
import { ChipScroller, SectionHead, chipClassName } from '@/closet/closet-parts'
import { RecordRow, type MarkTone } from '@/kit/record-row'
import { ItemGroup } from '@/components/ui/item'
import { FlagSheet, draftFromFlag, type FlagCall, type FlagGarment } from '@/closet/flag-sheet'
import { garmentKey } from '@/closet/garment-groups'
import { DroppedOffSheet, GarmentSheet, plainLink, type GarmentCalls, type GarmentSheetFacts, type GarmentSheetNext, type RenderLink } from '@/closet/garment-sheet'
import type { Inventory, Textile } from '@/household/inventory-types'
import { effectiveWashMethod } from '@/household/inventory-types'
import { InstallGuidance } from '@/pwa'
import { GarmentIcon } from '@/kit/garment-icon'
import { CareEmpty, CareHero, SectionNav } from '@/products/product-ui'
import { loadClosetChips, saveClosetChips, type ClosetWearerChip } from '@/private-state'
import { sessionStage, type StageFacts } from '@/laundry/session-stage'
import { useNow } from '@/kit/use-now'
import { Sheet } from '@/kit/sheet'
import { ErrorNotice, Field, Loading, clockTime, useConvexCall } from '@/kit/ui'
import { ActionError, useActionFeedback } from '@/kit/action-feedback'
import { WashedSheet, backInClosetToast, type WashedCall } from '@/closet/washed-sheet'
import { useHouseholdData } from '@/household/household-data'
import { useStartup } from '@/startup-context'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DesignIcon } from '@/kit/design-icons'

const AddClothesFlow = lazy(() => import('@/closet/add-clothes').then(module => ({ default: module.AddClothesFlow })))

const closetManagementClassName = cn(
  "closet-management",
  "[.closet_.care-hero-action_&]:ms-auto",
  "[&_summary::-webkit-details-marker]:hidden",
  "flex-none",
)

const closetManagementTriggerClassName = cn(
  "closet-management-trigger",
  "[&:focus-visible]:[outline:3px_solid_var(--focus)]",
  "[&:focus-visible]:[outline-offset:2px]",
  "grid place-items-center w-[2.75rem] h-[2.75rem] rounded-control",
  "[&_>_svg]:w-[1.5rem] [&_>_svg]:h-[1.5rem]",
)


const mutedClassName = cn(
  "muted",
  "text-ink-2",
)

const closetTrashListClassName = cn(
  "closet-trash-list",
  "grid gap-2 m-0 p-0",
  "[list-style:none]",
  "[&_li]:flex [&_li]:items-center [&_li]:justify-between [&_li]:gap-3 [&_li]:py-2",
  "[&_li]:[border-block-end:1px_solid_var(--line)]",
  "[&_li_span]:grid [&_li_span]:gap-1 [&_li_span]:min-w-0",
  "[&_li_small]:text-ink-2",
)

const pageClassName = cn(
  "page",
  "[.app-shell.is-focus_&]:max-w-[30rem]",
  "grid min-w-0 w-full grid-cols-[minmax(0,1fr)] gap-6 max-w-[36rem] mx-auto pt-2",
  "md:max-w-[45rem]",
  "[.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:w-full [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:max-w-[none] [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:mx-0 [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:pt-0 [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:content-start [.app-shell.has-navigation:not(.is-focus)_.app-main_>_&]:gap-4",
)

const closetClassName = cn(
  "closet",
  "lg:[.page&]:max-w-[60rem]",
)

const primaryDockClassName = cn(
  "primary-dock",
  "fixed grid gap-2",
  "[inset-inline:max(var(--gutter),_calc(50%_-_18rem))]",
  "[inset-block-end:calc(var(--bar-bottom)_+_var(--bar-h)_+_var(--space-3))]",
  "[z-index:25]",
  "[.app-shell.is-focus_&]:[inset-block-end:calc(env(safe-area-inset-bottom)_+_var(--space-4))]",
  "lg:[.page.closet_&]:[inset-inline-end:max(var(--gutter),_calc(50%_-_25.75rem))]",
)

const nowCardClassName = cn(
  "now-card",
  "grid gap-3 p-[var(--space-4)_var(--space-5)_var(--space-5)] rounded-card",
  "[background:var(--now-bg)]",
  "[color:var(--now-ink)]",
  "[&_.now-card-title]:font-figure [&_.now-card-title]:font-semibold [&_.now-card-title]:leading-[1.05]",
  "[&_.now-card-title]:text-[length:var(--figure-md)]",
)

const closetNowClassName = cn(
  "closet-now",
  "flex items-center gap-3 p-[var(--space-3)_var(--space-3)_var(--space-3)_var(--space-5)] rounded-[1.75rem] shadow-[0_12px_32px_rgba(0,_0,_0,_0.18),_0_1px_3px_rgba(0,_0,_0,_0.1)]",
  "[animation:dock-rise_220ms_var(--ease-out)_both]",
  "motion-reduce:animate-none motion-reduce:transition-none",
)

const closetNowTitleClassName = cn(
  "closet-now-title",
  "flex-1 min-w-0 font-semibold leading-[1.25]",
  "text-[length:var(--step-1)]",
)

const noticeClassName = cn(
  "notice",
  "[.sheet.has-compact-actions_.sheet-foot_>_&]:[flex:1_0_100%]",
  "grid gap-2 p-[var(--space-3)_var(--space-4)] rounded-label",
  "[border:var(--rule-width)_solid_var(--line)]",
  "[background:var(--label)]",
  "text-[length:var(--step-0)]",
)

const secondaryButtonClassName = cn(
  buttonVariants({ variant: 'outline', size: 'sm' }),
  "[&.danger]:text-destructive",
)

const formClassName = cn(
  "form",
  "grid gap-4",
  "[&.nested]:[background:var(--label-sunk)]",
  "[&.nested]:rounded-field [&.nested]:p-4",
)

export type Attention = FunctionReturnType<typeof api.closet.attention>
export type Today = FunctionReturnType<typeof api.closet.today>
export type Sessions = FunctionReturnType<typeof api.execution.householdSessions>
type TopSlot = NonNullable<Attention['top']>
type NeedsYouCard = Attention['cards'][number]

export type ClosetCalls = GarmentCalls & { readonly flagDirty: FlagCall; readonly washedElsewhere: WashedCall; readonly bulkUpdate?: BulkUpdate }

/** The "for what" chips: Everyday is every day, so it is not a chip. */
/** A wearer chip as a chip value: 'everyone', 'me' or `w:{wearerId}`. */
export function wearerChipValue(chip: ClosetWearerChip): string {
  return typeof chip === 'string' ? chip : `w:${chip.wearerId}`
}

export function wearerChipFrom(value: string): ClosetWearerChip {
  return value.startsWith('w:') ? { wearerId: value.slice(2) } : value === 'me' ? 'me' : value === 'shared' ? 'shared' : 'everyone'
}

/** The wearer the chip filters by; a remembered wearer who is gone, or "Me" when unlinked, shows everyone. */
export function chosenWearer(chip: ClosetWearerChip, meWearerId: string | null, wearerIds: readonly string[]): string | null | undefined {
  if (chip === 'everyone') return undefined
  if (chip === 'shared') return null
  if (chip === 'me') return meWearerId ?? undefined
  return wearerIds.includes(chip.wearerId) ? chip.wearerId : undefined
}

// ---- Words -----------------------------------------------------------------------

const stageFacts = (session: Sessions[number]): StageFacts => session

/** When a running load is done, when the machine's times say. */
export function sessionDoneAt(sessions: Sessions, sessionId: string | null, now: number): number | null {
  const session = sessionId === null ? undefined : sessions.find((entry) => entry.sessionId === sessionId)
  return session === undefined || session.status !== 'running' ? null : sessionStage(stageFacts(session), now).doneAt
}


/** A needed-by day in the top slot: overdue still reads "today". */
const neededDay = (neededBy: number, now: number) => (neededBy < now ? closetText.today : dayWord(neededBy, now))

export type TopSlotView = { readonly title: string; readonly link: { to: 'laundry' } | { to: 'session'; sessionId: string }; readonly button: string; readonly tone: 'washing' | 'hamper' }

/** The single top slot: the running load, else something needed soon, else wet things, else the hamper. */
export function topSlotView(top: TopSlot, now: number): TopSlotView {
  switch (top.kind) {
    case 'running': {
      const times = sessionStage(top.facts, now)
      const title = times.stage === 'preparing' ? closetText.running.preparing
        : times.stage === 'washing' ? (times.washReadyAt === null ? closetText.running.washing : closetText.running.washDone(clockTime(times.washReadyAt)))
        : times.stage === 'wash_done' ? closetText.running.wash_done
        : times.stage === 'drying' ? (times.dryReadyAt === null ? closetText.running.drying : closetText.running.dryDone(clockTime(times.dryReadyAt)))
        : closetText.running.dry
      return { title, link: { to: 'session', sessionId: top.sessionId }, button: closetText.open, tone: 'washing' }
    }
    case 'needed':
      return { title: closetText.needed(top.name, neededDay(top.neededBy, now)), link: { to: 'laundry' }, button: closetText.planLaundry, tone: 'hamper' }
    case 'wet':
      return { title: closetText.wetSince(top.name ?? countWord(top.count, 'laundry item'), dayWord(top.since, now)), link: { to: 'laundry' }, button: closetText.planLaundry, tone: 'hamper' }
    case 'hamper':
      return { title: closetText.hamperWithLoads(countWord(top.count, 'laundry item'), top.loads === null ? null : countWord(top.loads, 'wash', 'washes')), link: { to: 'laundry' }, button: closetText.planLaundry, tone: 'hamper' }
  }
}

/** "Today's", "Yesterday's", "Tue's", "Sep 12's". */
const dayPossessive = (timestamp: number, now: number) => {
  const word = dayWord(timestamp, now)
  return closetText.dayPossessive(word)
}

export type NeedsYouView = { readonly text: string; readonly action: 'all_dry' | 'make_loads' | 'picked_up' }

/** One Needs-you card: one line and the action it asks for, shown as a row you tap. */
export function needsYouView(card: NeedsYouCard, now: number, nameOf: (textileId: string) => string | null): NeedsYouView {
  const one = (ids: readonly string[]) => (ids.length === 1 ? nameOf(ids[0]!) : null)
  switch (card.kind) {
    case 'hanging':
      return { text: closetText.hangingLoad(dayPossessive(card.since, now)), action: 'all_dry' }
    case 'wet': {
      const name = one(card.textileIds)
      return { text: closetText.wetHamperSince(name ?? countWord(card.textileIds.length, 'laundry item'), name === null && card.textileIds.length !== 1, dayWord(card.since, now)), action: 'make_loads' }
    }
    case 'hamper':
      return { text: closetText.hamperSince(countWord(card.count, 'laundry item'), card.count !== 1, dayWord(card.since, now)), action: 'make_loads' }
    case 'cleaner': {
      const name = one(card.textileIds)
      return { text: closetText.cleanerSince(name ?? countWord(card.textileIds.length, 'laundry item'), dayWord(card.since, now)), action: 'picked_up' }
    }
  }
}

/** How each state reads, inside a sentence and on a hanger's mark. */
const stateWords: Readonly<Record<ClosetState, string>> = closetText.states

/** What a screen reader hears for a hanger: its name, how many, where it is, and its chips. */
export function hangerLabel(tile: ClosetTile<Textile>, now: number): string {
  const size = tile.members.length
  return [
    tile.name,
    size > 1 ? `${size}` : null,
    stateWords[tile.state],
    tile.wornMost > 0 ? closetText.hangerWorn(tile.wornMost) : null,
    tile.notWornSince === null ? null : closetText.hangerNotWorn(monthWord(tile.notWornSince, now)),
  ].filter((part) => part !== null).join(', ')
}

// ---- Rails -------------------------------------------------------------------------

/**
 * The rails as shown: folded and named the way `hamperGroups` (laundry-pass.ts) treats the
 * hamper list - a lone wearer has nobody to share with, so the shared rail joins theirs, and a
 * rail left alone after that gets no heading, since one rail tells nothing apart.
 */
function closetRailGroups<Garment extends ClosetGarment>(
  rails: readonly ClosetRail<Garment>[],
  soloWearerId: string | null,
  wearerName: (wearerId: string | null) => string | null,
): { readonly rail: ClosetRail<Garment>; readonly name: string }[] {
  const folded = soloWearerId === null ? rails : foldSharedRail(rails, soloWearerId)
  const named = folded.map((rail) => ({ rail, name: wearerName(rail.wearerId) ?? noWearerWords }))
  return named.length === 1 ? [{ rail: named[0]!.rail, name: '' }] : named
}

/** The shared rail (garments with no known wearer) merged into the one registered wearer's own. */
function foldSharedRail<Garment extends ClosetGarment>(rails: readonly ClosetRail<Garment>[], soloWearerId: string): ClosetRail<Garment>[] {
  const shared = rails.find((rail) => rail.wearerId === null)
  if (shared === undefined) return [...rails]
  const mine = rails.find((rail) => rail.wearerId === soloWearerId)
  if (mine === undefined) return [{ ...shared, wearerId: soloWearerId }]
  return [{
    wearerId: soloWearerId,
    sections: mergeRailSections(mine.sections, shared.sections),
    ready: mine.ready + shared.ready,
    total: mine.total + shared.total,
  }]
}

function mergeRailSections<Garment extends ClosetGarment>(left: ClosetRail<Garment>['sections'], right: ClosetRail<Garment>['sections']): ClosetRail<Garment>['sections'] {
  return kindHeadings
    .map(({ heading }) => ({
      heading,
      tiles: [...(left.find((section) => section.heading === heading)?.tiles ?? []), ...(right.find((section) => section.heading === heading)?.tiles ?? [])],
    }))
    .filter((section) => section.tiles.length > 0)
}

export function consolidatedClosetTiles(rows: readonly { tile: ClosetTile<Textile>; owner: string }[]) {
  const groups = new Map<string, {tile: ClosetTile<Textile>; owner: string; states: ClosetTile<Textile>[]}>()
  for (const row of rows) {
    const key = JSON.stringify([row.tile.members[0]!.wearerId, row.tile.kind, garmentKey(row.tile.members[0]!)])
    const group = groups.get(key)
    if (group === undefined) groups.set(key, {...row,states:[row.tile]})
    else {
      group.states.push(row.tile)
      group.tile = {...group.tile, members:[...group.tile.members,...row.tile.members],wornMost:Math.max(group.tile.wornMost,row.tile.wornMost),notWornSince:null}
    }
  }
  return [...groups.values()]
}

type BrowseFilters = { kinds: string[]; tags: string[] }

/** How the Closet groups its list: by what it is, whose it is, or where it stands. */
type ClosetGrouping = (typeof closetGroupings)[number]
const closetGroupings = ['type', 'owner', 'status'] as const

const unknownCare = (tile: ClosetTile<Textile>) => tile.members.some((member) => member.care === null || member.care.status !== 'confirmed')

/** The status group a garment sits under in the Status grouping, label before laundry before hamper before ready. */
function statusGroup(tile: ClosetTile<Textile>, states: readonly ClosetTile<Textile>[]): keyof typeof closetListText.status {
  if (unknownCare(tile)) return 'label'
  const kinds = states.map((state) => state.state)
  if (kinds.includes('in_wash') || kinds.includes('hanging')) return 'laundry'
  if (kinds.includes('ready')) return 'ready'
  if (kinds.includes('dirty')) return 'hamper'
  if (kinds.includes('needs_refresh')) return 'refresh'
  return 'cleaner'
}

const statusOrder = ['label', 'laundry', 'hamper', 'refresh', 'cleaner', 'ready'] as const satisfies readonly (keyof typeof closetListText.status)[]

type ClosetRow = { tile: ClosetTile<Textile>; owner: string; states: ClosetTile<Textile>[] }

/** The list's sections, in a stable order, each with how many pieces it holds. */
function closetGroups(rows: readonly ClosetRow[], by: ClosetGrouping): { key: string; heading: string; pieces: number; rows: ClosetRow[] }[] {
  const groups = new Map<string, { key: string; heading: string; order: number; rows: ClosetRow[] }>()
  for (const row of rows) {
    const kind = row.tile.kind
    const typeHeading = kind === 'pants' ? 'Pants' : kind === 'pajamas' ? 'Sleepwear' : kind === null ? 'Other' : kindNameWords[kind as keyof typeof kindNameWords] ?? 'Other'
    const heading = by === 'type' ? typeHeading : by === 'owner' ? (row.owner === '' ? closetListText.everyone : row.owner) : closetListText.status[statusGroup(row.tile, row.states)]
    const order = by === 'status' ? statusOrder.indexOf(statusGroup(row.tile, row.states)) : groups.size
    const group = groups.get(heading)
    if (group === undefined) groups.set(heading, { key: heading.replace(/[^a-z0-9]+/gi, '-').toLowerCase(), heading, order, rows: [row] })
    else group.rows.push(row)
  }
  return [...groups.values()].sort((left, right) => left.order - right.order).map((group) => ({ ...group, pieces: group.rows.reduce((sum, row) => sum + row.tile.members.length, 0) }))
}

/** One status mark per garment, by what matters most: label questions, then the laundry, then ready. */
function rowMark(tile: ClosetTile<Textile>, states: readonly ClosetTile<Textile>[]): { tone: MarkTone; text: string } {
  if (unknownCare(tile)) return { tone: 'waiting', text: closetListText.markNeedsLabel }
  const kinds = states.map((state) => state.state)
  if (kinds.includes('in_wash')) return { tone: 'washing', text: closetListText.marks.in_wash }
  if (kinds.includes('hanging')) return { tone: 'drying', text: closetListText.marks.hanging }
  if (kinds.includes('ready')) return { tone: 'ready', text: closetListText.marks.ready }
  const rest = kinds[0]!
  return { tone: 'waiting', text: closetListText.marks[rest] }
}

function GarmentRow({ tile, owner, now, onOpen, states }: { tile: ClosetTile<Textile>; owner: string; now: number; onOpen: () => void; states: readonly ClosetTile<Textile>[] }) {
  const mixed = states.length > 1
  const rowStateWord = (state: ClosetState) => state === 'dirty' ? 'in hamper' : stateWords[state]
  const summary = mixed ? states.map((state) => `${state.members.length} ${rowStateWord(state.state)}`).join(' · ') : `${tile.members.length} ${rowStateWord(tile.state)}`
  const first = tile.members[0]!
  const color = colorDisplay({ color: first.color, colorGroup: tile.colorGroup })
  const fact = [mixed ? null : color, owner === '' ? null : owner === noWearerWords ? 'Shared' : owner, mixed || unknownCare(tile) ? summary.replaceAll('in hamper', 'hamper') : null].filter(Boolean).join(' · ')
  return <RecordRow
    media={<GarmentIcon kind={tile.kind} colorGroup={tile.colorGroup} />}
    title={`${tile.name}${tile.members.length > 1 ? ` ×${tile.members.length}` : ''}`}
    fact={fact}
    mark={rowMark(tile, states)}
    label={`${owner === '' ? '' : `${owner}, `}${mixed ? `${tile.name}, ${tile.members.length}, ${summary}` : hangerLabel(tile, now)}${first.identity?.brand ? `, ${first.identity.brand}` : ''}${unknownCare(tile) ? `, ${closetListText.markNeedsLabel}` : ''}`}
    onOpen={onOpen} />
}

export function matchesClosetSearch(tile: ClosetTile<Textile>, owner: string, search: string): boolean {
  return tile.members.some(piece => matchesClothingSearch(piece, owner, search))
}

// ---- The view ----------------------------------------------------------------------

export type ClosetSheet =
  | { readonly kind: 'group'; readonly textileIds: readonly string[] }
  | { readonly kind: 'garment'; readonly textileIds: readonly string[] }
  | { readonly kind: 'flag'; readonly textileIds: readonly string[]; readonly mode: 'dirty' | 'change' | 'wash_instead' }
  | { readonly kind: 'washed'; readonly textileIds: readonly string[] }
  | { readonly kind: 'dropped'; readonly textileIds: readonly string[] }
  | { readonly kind: 'add' }
  | { readonly kind: 'edit'; readonly textileIds: readonly string[]; readonly careOnly?: 'all' | 'more' }
  | { readonly kind: 'trash' }

/** The Add clothes sheet with its data, for adding from the empty Closet and for Edit. */
export type AddClothesSlot = (mode: AddMode, onClose: () => void) => ReactNode

export type ClosetViewProps = {
  now: number
  attention: Attention
  today: Today
  inventory: Pick<Inventory, 'textiles' | 'wearers'>
  sessions: Sessions
  /** The wearer the signed-in person is linked to, if any: the "Me" chip. */
  meWearerId: string | null
  wearerChip: ClosetWearerChip
  onWearerChip: (chip: ClosetWearerChip) => void
  initialFilters?: BrowseFilters
  onFiltersChange?: (filters: BrowseFilters) => void
  calls: ClosetCalls
  renderLink?: RenderLink
  initialSheet?: ClosetSheet | null
  itemSheet?: Exclude<ClosetSheet, { kind: 'add' | 'edit' | 'trash' }> | null
  itemKey?: string
  onArrivalClose?: () => void
  onItemOpen?: (item: string, group: boolean) => void
  initialSection?: 'all' | 'ready' | 'care'
  /** Anything the live screen adds at the end, such as install help. */
  extra?: ReactNode
  addClothes?: AddClothesSlot
  trash?: FunctionReturnType<typeof api.inventory.listTrash>
  restoreTextiles?: (args: FunctionArgs<typeof api.inventory.restoreTextiles>) => Promise<FunctionReturnType<typeof api.inventory.restoreTextiles>>
  onSetupMyCloset?: () => void
  pagination?: ReturnType<typeof usePagedInventory> & { args: BrowseArgs; onBrowse: (search: string, section: 'all' | 'ready' | 'care', tags: string[]) => void }
}

/**
 * Keep everyday scope and grouping visible; management holds less frequent actions.
 */
export function ClosetView({ now, attention, today, inventory, sessions, meWearerId, wearerChip, onWearerChip, initialFilters, onFiltersChange, calls, renderLink = plainLink, initialSheet = null, itemSheet = null, itemKey, onArrivalClose, onItemOpen, initialSection, extra = null, addClothes, trash = [], restoreTextiles, onSetupMyCloset, pagination }: ClosetViewProps) {
  const [sheet, setSheet] = useState<ClosetSheet | null>(initialSheet)
  const [bulk, setBulk] = useState(false)
  const [managementOpen, setManagementOpen] = useState(false)
  const activeSheet = itemSheet ?? sheet
  const SheetFlow = itemSheet === null ? ClosetSheets : RoutedClosetSheets
  const [search, setSearch] = useDeviceState('closet-search', '', (value): value is string => typeof value === 'string' && value.length <= 500)
  const [groupBy, setGroupBy] = useDeviceState<ClosetGrouping>('closet-grouping', 'type', (value): value is ClosetGrouping => closetGroupings.includes(value as ClosetGrouping))
  const [browseFilters, setBrowseFilters] = useState<BrowseFilters>(initialFilters ?? { kinds: [], tags: [] })
  const chooseFilters = (next: typeof browseFilters) => { setBrowseFilters(next); onFiltersChange?.(next) }
  const filtered = browseFilters.tags.length > 0
  const [section, setSection] = useDeviceState<'all' | 'ready' | 'care'>('closet-section', initialSection ?? 'all', (value): value is 'all' | 'ready' | 'care' => value === 'all' || value === 'ready' || value === 'care', initialSection === undefined)
  const onBrowse = pagination?.onBrowse
  const awaitingBrowse = pagination !== undefined && (pagination.args.search !== search || pagination.args.section !== section || JSON.stringify(pagination.args.tags) !== JSON.stringify(browseFilters.tags))
  const loading = pagination?.loading || awaitingBrowse
  useEffect(() => { onBrowse?.(search, section, browseFilters.tags) }, [onBrowse, search, section, browseFilters.tags])
  useEffect(() => {
    if (initialSection !== undefined) { setSection(initialSection); setSearch('') }
  }, [initialSection, setSection, setSearch])
  // A confirmation goes to Sonner; an error stays here, inline, next to what failed, until the next try.
  const feedback = useActionFeedback()
  const { pending, say } = feedback
  const run = (call: () => Promise<unknown>, message: string | null = null) => feedback.run(async () => { await call(); return message })
  const failureNotice = <ActionError failure={feedback.failure} pending={pending} onRetry={(work) => void feedback.run(work)} />
  // Restore acts inside the Trash sheet, so its failure shows there rather than behind the sheet.
  const errorView = sheet?.kind === 'trash' ? null : failureNotice

  const garments = inventory.textiles.filter((textile) => !textile.guest)
  const byId = new Map(inventory.textiles.map((textile) => [textile.textileId as string, textile]))
  const nameOf = (textileId: string) => byId.get(textileId)?.name ?? null
  const wearerIds = inventory.wearers.map((wearer) => wearer.wearerId as string)
  const wearerId = chosenWearer(wearerChip, meWearerId, wearerIds)
  const filter = { ...(wearerId === undefined ? {} : { wearerId }), tags: browseFilters.tags }
  const wearerName = (id: string | null) => (id === null ? null : inventory.wearers.find((wearer) => wearer.wearerId === id)?.name ?? null)
  // Mirrors hamperGroups (laundry-pass.ts): with one wearer, unowned garments join their rail
  // instead of a "Shared" one; see closetRailGroups above.
  const soloWearerId = inventory.wearers.length === 1 ? wearerIds[0]! : null
  const unlinkedMe = wearerChip === 'me' && meWearerId === null
  const scopedGarments = unlinkedMe ? [] : garments.filter((garment) => wearerId === undefined || (garment.wearerId !== null && wearerIds.includes(garment.wearerId) ? garment.wearerId : null) === wearerId)
  const availableTags = pagination?.summary?.tags ?? usedClothingTags(scopedGarments)
  const matchingTypes = scopedGarments
  const railGroups = closetRailGroups(closetRails(matchingTypes, wearerIds, filter, now, today.notWornDays), wearerChip === 'everyone' ? soloWearerId : null, wearerName)
  const shown = railGroups.flatMap(({ rail, name }) => rail.sections.flatMap((section) => section.tiles.map((tile) => ({ tile, owner: name })))).filter(({ tile, owner }) => matchesClosetSearch(tile, owner, search))
  const ready = shown.filter(({ tile }) => tile.state === 'ready')
  const away = shown.filter(({ tile }) => tile.state !== 'ready')
  const visible = consolidatedClosetTiles(section === 'ready' ? ready : section === 'care' ? away : shown)
  const profiles = [
    { value: 'me' as ClosetWearerChip, label: 'Me', count: meWearerId === null ? 0 : garments.filter((garment) => garment.wearerId === meWearerId).length },
    ...inventory.wearers.filter((wearer) => wearer.wearerId !== meWearerId).map((wearer) => ({ value: { wearerId: wearer.wearerId } as ClosetWearerChip, label: wearer.name, count: garments.filter((garment) => garment.wearerId === wearer.wearerId).length })),
    { value: 'shared' as ClosetWearerChip, label: 'Shared', count: garments.filter((garment) => garment.wearerId === null || !wearerIds.includes(garment.wearerId)).length },
    { value: 'everyone' as ClosetWearerChip, label: 'Everyone', count: garments.length },
  ]
  const selectedProfile = profiles.find((profile) => wearerChipValue(profile.value) === wearerChipValue(wearerChip)) ?? profiles.at(-1)!
  const counts = pagination?.summary?.counts ?? glanceCounts(scopedGarments)
  const closetTitle = closetText.title
  const addAction = unlinkedMe ? <Button type="button" variant="outline" onClick={onSetupMyCloset} disabled={onSetupMyCloset === undefined}>Set up my closet</Button> : addClothes === undefined ? null : <Button type="button" variant="outline" className="[.care-feature_&]:min-h-11 [.care-feature_&]:px-3 [.care-feature_&]:py-2" aria-label={closetText.addClothes} onClick={(event) => { event.currentTarget.focus(); setSheet({ kind: 'add' }) }}><DesignIcon name="plus" size="1em" aria-hidden="true" /><span className="hidden [.care-feature_&]:inline">Add</span><span className="[.care-feature_&]:hidden">{closetText.addClothes}</span></Button>
  const management = <div className={closetManagementClassName}>
    <Popover open={managementOpen} onOpenChange={setManagementOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="icon" type="button" className={closetManagementTriggerClassName} aria-label={closetText.manage} />}><DesignIcon name="funnel" size="1em" aria-hidden="true"  /></PopoverTrigger>
      <PopoverContent className="grid w-[min(22rem,calc(100vw-2rem))] gap-4" aria-label="Closet filters and management">
        <SectionNav label="Clothing status" value={section} onChange={setSection} items={(['all', 'ready', 'care'] as const).map(value => ({ value, label: value === 'all' ? closetText.all : value === 'ready' ? closetText.ready : closetText.needsCare }))} />
        <SectionNav label={closetListText.groupLabel} value={groupBy} onChange={setGroupBy} items={closetGroupings.map(value => ({ value, label: closetListText.groups[value] }))} />
        <ChipScroller label={closetListText.filterLabel}>
          {availableTags.map((tag) => {
            const on = browseFilters.tags.some((chosen) => chosen.toLowerCase() === tag.toLowerCase())
            return <button key={tag} type="button" className={chipClassName} aria-pressed={on} onClick={() => chooseFilters({ ...browseFilters, tags: on ? browseFilters.tags.filter((chosen) => chosen.toLowerCase() !== tag.toLowerCase()) : [...browseFilters.tags, tag] })}>{tag}</button>
          })}
        </ChipScroller>
        <Button variant="ghost" onClick={() => setSheet({ kind: 'trash' })}><DesignIcon name="trash" size="1em" aria-hidden="true"  />{closetText.trashCount(trash.length)}</Button>
        {calls.bulkUpdate === undefined ? null : <Button type="button" variant="ghost" disabled={loading || visible.length === 0} onClick={() => { setManagementOpen(false); setBulk(true) }}>Select items</Button>}
      </PopoverContent>
    </Popover>
  </div>
  // A running load or the hamper is laundry day's next step, which the dock above the tabs shows on
  // every tab; the Closet docks only its own nudges: something needed soon, or wet things.
  const top = attention.top === null || attention.top.kind === 'running' || attention.top.kind === 'hamper' ? null : topSlotView(attention.top, now)
  const open = (ids: readonly string[], group = false) => onItemOpen === undefined ? setSheet({ kind: group ? 'group' : 'garment', textileIds: ids }) : onItemOpen(ids[0]!, group)
  const done = (message: string | null) => {
    setSheet(null)
    say(message)
    onArrivalClose?.()
  }
  const closeSheet = () => { setSheet(null); onArrivalClose?.() }

  const addSheet = sheet?.kind === 'add' ? addClothes?.({ kind: 'add', target: 'closet', ...(wearerId === undefined ? {} : { whose: wearerId === null ? 'shared' : { wearerId } }) }, closeSheet) ?? null
    : sheet?.kind === 'edit' ? addClothes?.(sheet, closeSheet) ?? null
    : sheet?.kind === 'trash' ? <Sheet title={closetText.trash} onClose={() => setSheet(null)} compactActions>
      <p className={mutedClassName}>{closetText.trashHint}</p>
      <ul className={closetTrashListClassName}>{trash.map((item) => <li key={item.textileId}>
        <span><strong>{item.name}</strong><small>{[item.color ? colorWord(item.color) : null, closetText.deleteOn(new Date(item.deleteAt).toLocaleDateString())].filter(Boolean).join(' · ')}</small></span>
        <Button type="button" variant="outline" disabled={pending || restoreTextiles === undefined} onClick={() => void run(() => restoreTextiles!({ textileIds: [item.textileId] }), closetText.restored)}>{closetText.restore}</Button>
      </li>)}</ul>
      {trash.length === 0 ? <p>{closetText.trashEmpty}</p> : null}
      {failureNotice}
    </Sheet>
    : null

  // Rails serve the other Closet views; Type follows the inventory's garment order.
  const garmentOrder = new Map(garments.map((garment, index) => [garment.textileId as string, index]))
  const groups = closetGroups(groupBy === 'type' ? [...visible].sort((left, right) =>
    Math.min(...left.tile.members.map((member) => garmentOrder.get(member.textileId) ?? Infinity)) -
    Math.min(...right.tile.members.map((member) => garmentOrder.get(member.textileId) ?? Infinity))) : visible, groupBy)

  // The add sheet sits beside the page in both branches, so saving the first garment keeps the same
  // intake mounted for Add another (Sheet portals, so this placement changes React identity only).
  if ((garments.length === 0 && pagination === undefined) || pagination?.summary?.total === 0) {
    return <>
      <div className={cn(pageClassName, closetClassName)}>
        <CareHero title={closetTitle} />
        <CareEmpty icon="people" art={<img src="/design/care-complete.webp" alt="" width={960} height={640} className="block h-auto w-full object-contain" />} title={unlinkedMe ? 'Make this closet yours' : 'Start your closet'} description={unlinkedMe ? 'Choose your clothing profile to see your clothes here.' : 'Add clothes individually or in matching groups, like a pack of tees.'}>{addAction}</CareEmpty>
        <div className="flex justify-end">{management}</div>
        {attention.hamper.count > 0 ? <p className={mutedClassName}>{closetText.onTheWay(attention.hamper.count)}</p> : null}
        {extra}
        {errorView}
      </div>
      {addSheet}
    </>
  }

  return <>
    <div className={cn(pageClassName, closetClassName)}>
      <CareHero variant="feature" photo title={closetTitle} art={<img src="/design/care-complete.webp" alt="" width={960} height={640} />}
        detail={<ClosetGlance counts={counts} people={[]} selected="" onPerson={() => undefined} />} action={addAction} />
      <BrowseSearch label={closetText.searchLabel} value={search} placeholder={closetListText.searchPlaceholder} onChange={setSearch}
        summary={<div className="flex min-w-[min(100%,10rem)] flex-1 flex-wrap items-center gap-2">
          <div className="min-w-28 max-w-[10rem] flex-1"><NativeSelect size="sm" aria-label="Whose clothes" value={wearerChipValue(selectedProfile.value)} onChange={(event) => { onWearerChip(wearerChipFrom(event.target.value)); setSearch(''); setSection('all') }}>{profiles.map((profile) => <option key={wearerChipValue(profile.value)} value={wearerChipValue(profile.value)}>{profile.label}</option>)}</NativeSelect></div>
          <p className="m-0 text-[length:var(--step--1)] text-ink-2" role="status">{loading ? 'Finding clothes…' : closetListText.pieces(unlinkedMe ? 0 : pagination?.summary?.matched ?? visible.reduce((total, { tile }) => total + tile.members.length, 0))}<span className="sr-only"> · by {closetListText.groups[groupBy].toLowerCase()}</span></p>
        </div>}
        actions={management} />
      {filtered || section !== 'all' ? <div className="flex flex-wrap items-center gap-2">
        <span className="text-[length:var(--step--1)] text-ink-2">{[...browseFilters.tags, ...(section === 'all' ? [] : [section === 'ready' ? closetText.ready : closetText.needsCare])].join(' · ')}</span>
        <Button type="button" variant="outline" onClick={() => { chooseFilters({ kinds: [], tags: [] }); setSection('all') }}>Reset filters</Button>
      </div> : null}

      {loading ? <Loading what="clothes" /> : visible.length === 0 ? <p className="m-0 text-[length:var(--step--1)] leading-[1.5] text-ink-2" role="status">{search.trim() !== '' ? closetListText.nothingMatches(search.trim()) : unlinkedMe ? 'Choose your clothing profile to see your clothes here.' : scopedGarments.length === 0 ? 'This closet is empty.' : filtered || section !== 'all' ? closetText.searchEmpty : closetListText.none}</p> : null}
      {/* The status asks an unlinked person to choose their profile, so the way to do it sits right under it. */}
      {unlinkedMe && search.trim() === '' ? <div>{addAction}</div> : null}

      {loading ? null : groups.map((group) => <section key={group.key} className="grid gap-3" aria-labelledby={`closet-group-${group.key}`}>
        <SectionHead id={`closet-group-${group.key}`} title={group.heading} caption={groups.length === 1 ? undefined : `${closetListText.pieces(group.pieces)}${pagination === undefined ? '' : ' shown'}`} />
        <ItemGroup>{group.rows.map(({ tile, owner, states }) => <GarmentRow key={`${owner}:${tile.key}`} tile={tile} owner={owner} now={now} states={states} onOpen={() => open(tile.members.map((member) => member.textileId), states.length > 1)} />)}</ItemGroup>
      </section>)}
      {!unlinkedMe && !loading && pagination !== undefined && visible.length > 0 ? <PageStatus shown={visible.reduce((sum, row) => sum + row.tile.members.length, 0)} total={pagination.summary?.matched} more={pagination.more} loading={pagination.loadingMore} onMore={pagination.loadMore} label="Show more clothes" /> : null}

      {attention.cards.length === 0 ? null : (
        <details className="grid gap-3">
          <summary className="min-h-11 cursor-pointer py-3 font-semibold">{closetText.needsYou}</summary>
          <ul className="m-0 grid list-none gap-0 overflow-hidden rounded-card bg-surface p-0 shadow-[var(--e1)]">
            {attention.cards.map((card, index) => {
              const view = needsYouView(card, now, nameOf)
              const rowClassName = 'flex min-h-16 w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-4 py-3 text-start text-ink no-underline disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-ring'
              const row = (label: string, rest: { onClick?: () => void; link?: boolean }) => {
                const children = <>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[length:var(--step-0)] leading-normal">{view.text}</span>
                    <span className="text-[length:var(--step--1)] font-semibold text-ink-2">{label}</span>
                  </span>
                  <DesignIcon name="chevronRight" size="1em" strokeWidth={2.2} className="size-4 flex-none text-muted-foreground" aria-hidden="true"  />
                </>
                return rest.link === true ? renderLink({ to: 'laundry' }, { className: rowClassName, children })
                  : <button type="button" className={rowClassName} disabled={pending} onClick={rest.onClick}>{children}</button>
              }
              const action = view.action === 'make_loads' ? row(closetText.planLaundry, { link: true })
                : view.action === 'all_dry' && card.kind === 'hanging' ? row(closetText.allDry, { onClick: () => void run(() => calls.allDry({ sessionId: card.sessionId })) })
                : card.kind === 'cleaner' ? row(closetText.pickedUp, { onClick: () => void run(() => calls.pickedUp({ textileIds: card.textileIds }), backInClosetToast(card.textileIds.map((id) => nameOf(id) ?? ''), card.textileIds.length)) })
                : null
              return (
                <li key={`${card.kind}-${index}`} className="[&+&]:[border-block-start:1px_solid_var(--line)]">
                  {action ?? <p className="m-0 p-4 text-[length:var(--step-0)] leading-normal">{view.text}</p>}
                </li>
              )
            })}
          </ul>
        </details>
      )}
      {errorView}

      {extra}

      {top === null ? null : (
        <div className={primaryDockClassName}>
          <section className={cn(nowCardClassName, closetNowClassName, `tone-${top.tone}`)} aria-label={closetText.needsYouNow}>
            <p className={closetNowTitleClassName}>{top.title}</p>
            {renderLink(top.link, { className: cn(buttonVariants(), ""), children: top.button })}
          </section>
        </div>
      )}

      {activeSheet === null || activeSheet.kind === 'add' || activeSheet.kind === 'edit' || activeSheet.kind === 'trash' ? null : <SheetFlow key={itemKey ?? 'local'} sheet={activeSheet} now={now} inventory={inventory} sessions={sessions} today={today} calls={calls} renderLink={renderLink} addClothes={addClothes}
        wearerName={wearerName} onSheet={(next) => { if (next === null && onArrivalClose !== undefined) onArrivalClose(); else setSheet(next) }} onDone={done} />}
    </div>
    {addSheet}
    {bulk && calls.bulkUpdate !== undefined ? pagination === undefined ? <BulkClosetSheet groups={visible.map(({ tile }) => ({ key: tile.members[0]!.textileId, members: tile.members }))} wearers={inventory.wearers} knownTags={availableTags} now={now} update={calls.bulkUpdate} flag={calls.flagDirty} onClose={() => setBulk(false)} onDone={(message) => { setBulk(false); say(message) }} /> : <PagedBulkClosetSheet args={pagination.args} wearers={inventory.wearers} now={now} update={calls.bulkUpdate} flag={calls.flagDirty} onClose={() => setBulk(false)} onDone={message => { setBulk(false); say(message) }} /> : null}
  </>
}

/** The sheet the Closet has open, drawn from the live garments so it never shows stale state. */
function ClosetSheets({ sheet, now, inventory, sessions, today, calls, renderLink, wearerName, onSheet, onDone, addClothes }: {
  sheet: Exclude<ClosetSheet, { readonly kind: 'add' | 'trash' }>
  now: number
  inventory: Pick<Inventory, 'textiles' | 'wearers'>
  sessions: Sessions
  today: Today
  calls: ClosetCalls
  renderLink: RenderLink
  wearerName: (wearerId: string | null) => string | null
  onSheet: (sheet: Exclude<ClosetSheet, { readonly kind: 'add' | 'trash' }> | null) => void
  onDone: (message: string | null) => void
  addClothes?: AddClothesSlot
}) {
  const members = sheet.textileIds.flatMap((id) => inventory.textiles.filter((textile) => textile.textileId === id))
  // Care actions must never combine ready pieces with hamper pieces or separate running loads.
  const groupKey = (member: Textile) => JSON.stringify([closetState(member), member.inLoad, member.status === 'hanging' ? hangingSession(sessions, member.textileId) : null])
  const groups = sheet.kind !== 'group' ? [] : [...new Set(members.map(groupKey))].map((key) => members.filter((member) => groupKey(member) === key))
  const close = () => onSheet(null)
  useEffect(() => {
    if (members.length === 0) onSheet(null)
  }, [members.length])
  if (members.length === 0) return null
  const factsFor = (pieces: readonly Textile[]): GarmentSheetFacts => ({
    members: pieces,
    wearerName: wearerName(pieces[0]!.wearerId),
    now,
    notWornDays: today.notWornDays,
    doneAt: sessionDoneAt(sessions, pieces[0]!.inLoad, now),
    hangingSessionId: pieces[0]!.status === 'hanging' ? hangingSession(sessions, pieces[0]!.textileId) : null,
  })
  switch (sheet.kind) {
    case 'edit':
      return <>{addClothes?.(sheet, close) ?? null}</>
    case 'group':
    case 'garment':
      return (
        <GarmentSheet
          facts={factsFor(members)}
          careGroups={groups.length < 2 ? undefined : groups.map(factsFor)}
          calls={calls}
          knownTags={usedClothingTags(inventory.textiles)}
          renderLink={renderLink}
          renderEdit={addClothes}
          onClose={close}
          onDone={onDone}
          onNext={(next: GarmentSheetNext) => onSheet(next)}
        />
      )
    case 'flag': {
      const garments: FlagGarment[] = members.map((member) => ({ textileId: member.textileId, name: member.name, dryCleanOnly: effectiveWashMethod(member) === 'dry_clean_only' }))
      return (
        <FlagSheet
          garments={garments}
          now={now}
          flag={calls.flagDirty}
          onClose={close}
          onDone={onDone}
          initials={sheet.mode === 'change' ? members.map((member) => draftFromFlag(member.flag, member.soilLevel, now)) : undefined}
          start="reasons"
        />
      )
    }
    case 'washed':
      return <WashedSheet garments={members} washed={calls.washedElsewhere} onClose={close} onDone={onDone} />
    case 'dropped':
      return <DroppedOffSheet garments={members} now={now} dropped={calls.droppedAtCleaner} onClose={close} onDone={onDone} />
  }
}

/** Only the drawer's editing steps reset when its URL selection changes; the list stays mounted. */
function RoutedClosetSheets(props: ComponentProps<typeof ClosetSheets>) {
  const [sheet, setSheet] = useState(props.sheet)
  return <ClosetSheets {...props} sheet={sheet} onSheet={(next) => next === null ? props.onSheet(null) : setSheet(next)} />
}

// ---- The screen with its data --------------------------------------------------------

/** The last defined value, so a query that is re-asking keeps the screen steady. */
function useSteady<Value>(value: Value | undefined): Value | undefined {
  const last = useRef(value)
  if (value !== undefined) last.current = value
  return value ?? last.current
}

/** The Closet starts with Me; clothing type and personal tag filters are remembered per household. */
export function Closet({ household, renderLink, initialAdd = false, initialSection, initialItem, initialGroup = false, onItemOpen, onItemClose }: { household: CurrentHousehold; renderLink: RenderLink; initialAdd?: boolean; initialSection?: 'all' | 'ready' | 'care'; initialItem?: string; initialGroup?: boolean; onItemOpen?: ClosetViewProps['onItemOpen']; onItemClose?: () => void }) {
  const householdId = household.householdId
  const shared = useHouseholdData(householdId)
  const now = useNow(30_000)
  const minute = Math.floor(now / 60_000) * 60_000
  const startup = useStartup()
  const status = useQuery(api.households.onboardingStatus, {}) ?? (startup?.seedActive ? startup.data.onboarding : undefined)
  const setupInventory = useQuery(api.inventory.list, { householdId, textileIds: [] }) ?? shared?.inventory
  const trash = useQuery(api.inventory.listTrash, { householdId })
  const restoreTextiles = useMutation(api.inventory.restoreTextiles)
  const updateTextile = useMutation(api.inventory.updateTextile)
  const answerTagQuestions = useMutation(api.inventory.answerTagQuestions)
  const sessions = useQuery(api.execution.householdSessions, { householdId }) ?? shared?.sessions
  const attention = useSteady(useQuery(api.closet.attention, { householdId, now: minute })) ?? shared?.attention
  // Device-only filters. While hydrating server HTML they are unknown (the server cannot read them); any later
  // client render, including a tab change into Closet, reads them at once, so the page never flashes loading.
  const client = useClientRender()
  const saved = useMemo(() => {
    if (!client) return undefined
    const stored = loadClosetChips(householdId)
    return { wearer: stored?.wearer ?? 'everyone', filters: { kinds: [], tags: stored?.tags ?? [] } } satisfies { wearer: ClosetWearerChip; filters: BrowseFilters }
  }, [client, householdId])
  const [chosen, setChosen] = useState<{ householdId: string; chips: { wearer: ClosetWearerChip; filters: BrowseFilters } }>()
  const chips = chosen?.householdId === householdId ? chosen.chips : saved
  const [setup, setSetup] = useState(false)
  const meWearerId = setupInventory?.wearers.find((wearer) => wearer.principalKey !== null && wearer.principalKey === status?.principalKey)?.wearerId ?? null
  const [browse, setBrowse] = useState({ search: '', section: initialSection ?? 'all', tags: [] as string[] })
  const onBrowse = useCallback((search: string, section: 'all' | 'ready' | 'care', tags: string[]) => setBrowse(current => current.search === search && current.section === section && JSON.stringify(current.tags) === JSON.stringify(tags) ? current : { search, section, tags }), [])
  const wearer = chips === undefined ? undefined : chosenWearer(chips.wearer, meWearerId, setupInventory?.wearers.map(person => person.wearerId) ?? [])
  const browseArgs: BrowseArgs = { householdId, ...browse, ...(wearer === undefined ? {} : { wearer: wearer as Id<'wearers'> | null }) }
  const paging = usePagedInventory(chips === undefined ? 'skip' : browseArgs)
  const arrival = useQuery(api.inventoryBrowse.group, initialItem === undefined ? 'skip' : { householdId, textileId: initialItem as Id<'textiles'> })
  const inventory = setupInventory === undefined ? undefined : { ...setupInventory, textiles: [...new Map([...paging.pieces, ...(arrival ?? [])].map(piece => [piece.textileId, piece])).values()] }
  // Filtering already happens in ClosetView; its only Today input is the household's not-worn threshold.
  const today = useQuery(api.closet.today, { householdId, summaryOnly: true }) ?? shared?.today
  const calls: ClosetCalls = {
    setRefresh: useMutation(api.closet.setRefresh),
    unflag: useMutation(api.closet.unflag),
    refreshed: useMutation(api.closet.refreshed),
    pickedUp: useMutation(api.closet.pickedUp),
    allDry: useMutation(api.closet.allDry),
    droppedAtCleaner: useMutation(api.closet.droppedAtCleaner),
    flagDirty: useMutation(api.closet.flagDirty),
    bulkUpdate: useMutation(api.inventory.bulkUpdateTextiles),
    washedElsewhere: useMutation(api.closet.washedElsewhere),
    answerCare: (args) => answerTagQuestions(args),
    treatKnownStain: useMutation(api.closet.treatKnownStain),
    removeKnownStain: useMutation(api.closet.removeKnownStain),
    answerStainCheck: useMutation(api.closet.answerStainCheck),
    resolveStain: useMutation(api.closet.resolveStain),
    retire: useMutation(api.inventory.trashTextiles),
    restoreTextiles,
    updateTags: async ({ textileIds, tags }) => { for (const textileId of textileIds) await updateTextile({ textileId: textileId as Id<'textiles'>, tags: [...tags] }) },
  }
  const choose = (next: NonNullable<typeof chips>) => {
    setChosen({ householdId, chips: next })
    saveClosetChips({ householdId, wearer: next.wearer, occasion: 'any', clothingTypes: next.filters.kinds, tags: next.filters.tags })
  }

  if (chips === undefined || status === undefined || inventory === undefined || sessions === undefined || attention === undefined || today === undefined) {
    return (
      <div className={cn(pageClassName, closetClassName)}>
        <CareHero title={closetText.loadingTitle} />
        <Loading what={closetText.loading} />
      </div>
    )
  }
  const selected = inventory.textiles.find((item) => item.textileId === initialItem)
  const selectedIds = selected === undefined ? [] : inventory.textiles.filter((item) => garmentKey(item) === garmentKey(selected) && item.kind === selected.kind && item.wearerId === selected.wearerId && (initialGroup || (item.status === selected.status && item.inLoad === selected.inLoad))).map((item) => item.textileId)
  return (<>
    <ClosetView
      now={now}
      attention={attention}
      today={today}
      inventory={inventory}
      pagination={{ ...paging, args: browseArgs, onBrowse }}
      trash={trash}
      restoreTextiles={restoreTextiles}
      sessions={sessions}
      meWearerId={meWearerId}
      wearerChip={chips.wearer}
      onWearerChip={(wearer) => choose({ ...chips, wearer })}
      initialFilters={chips.filters}
      onFiltersChange={(filters) => choose({ ...chips, filters })}
      onSetupMyCloset={() => setSetup(true)}
      calls={calls}
      renderLink={renderLink}
      initialSheet={initialAdd ? { kind: 'add' } : null}
      itemSheet={selectedIds.length > 0 ? { kind: initialGroup ? 'group' : 'garment', textileIds: selectedIds } : null}
      itemKey={`${initialItem ?? ''}:${initialGroup}`}
      onItemOpen={onItemOpen}
      onArrivalClose={initialItem === undefined ? undefined : onItemClose}
      initialSection={initialSection}
      extra={initialItem !== undefined && arrival !== undefined && selected === undefined ? <p className={noticeClassName} role="status">This item is no longer in this closet. <Button variant="unstyled" size="unstyled" type="button" className={secondaryButtonClassName} onClick={onItemClose}>Return to your clothes</Button></p> : sessions.some((session) => session.status === 'completed') ? <InstallGuidance /> : null}
      addClothes={(mode, onClose) => <Suspense fallback={<Loading what="item details" />}><AddClothesFlow householdId={householdId} mode={mode} onClose={onClose} /></Suspense>}
    />
    {setup && status !== null && status !== undefined ? <MyClosetSetup householdId={householdId} wearers={inventory.wearers} principalKey={status.principalKey} displayName={status.displayName ?? ''} onClose={() => setSetup(false)} /> : null}
  </>)
}

function MyClosetSetup({ householdId, wearers, principalKey, displayName, onClose }: { householdId: CurrentHousehold['householdId']; wearers: Inventory['wearers']; principalKey: string; displayName: string; onClose: () => void }) {
  const link = useConvexCall(api.inventory.updateWearer)
  const create = useConvexCall(api.inventory.createWearer)
  const [choice, setChoice] = useState('new')
  const [name, setName] = useState(displayName)
  const formId = useId()
  const call = choice === 'new' ? create : link
  const available = wearers.filter((wearer) => wearer.principalKey === null)
  // A changed choice or name is an unsaved draft; saving cannot be dismissed half way.
  const dirty = choice !== 'new' || name !== displayName
  return <Sheet title="Set up my closet" closeAtTop onClose={onClose} dirty={dirty} busy={call.pending} footer={<Button form={formId} type="submit" disabled={call.pending}>Use this closet</Button>}>
    <form id={formId} className={formClassName} onSubmit={async (event) => {
      event.preventDefault()
      const result = choice === 'new' ? await create.run({ householdId, name, kind: 'adult', self: true }) : await link.run({ wearerId: choice as Inventory['wearers'][number]['wearerId'], principalKey })
      if (result !== undefined) onClose()
    }}>
      <p className={mutedClassName}>Choose your existing clothing profile, or start a new one.</p>
      <Field label="Your clothing profile">{(id) => <NativeSelect id={id} value={choice} disabled={call.pending} onChange={(event) => setChoice(event.target.value)}><option value="new">New profile</option>{available.map((wearer) => <option value={wearer.wearerId} key={wearer.wearerId}>{wearer.name}</option>)}</NativeSelect>}</Field>
      {choice === 'new' ? <Field label="Your name">{(id) => <Input id={id} value={name} disabled={call.pending} required maxLength={60} onChange={(event) => setName(event.target.value)} />}</Field> : null}
      <ErrorNotice error={call.error} />
    </form>
  </Sheet>
}
