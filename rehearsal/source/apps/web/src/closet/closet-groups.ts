import { clothingTags, occasions, type GarmentKind, type Occasion } from '@washcloset/planner'

import { closetKindText } from '@/copy'
import { garmentKey, type GarmentStatus } from '@/closet/garment-groups'

const dayMs = 86_400_000

/** The Closet's kind headings, in the order they are shown, and the kinds each one holds. */
export const kindHeadings = [
  { heading: closetKindText.tops, kinds: ['t_shirt', 'shirt', 'sweater'] },
  { heading: closetKindText.bottoms, kinds: ['pants', 'shorts', 'skirt'] },
  { heading: closetKindText.dresses, kinds: ['dress'] },
  { heading: closetKindText.outerwear, kinds: ['outerwear', 'suit'] },
  { heading: closetKindText.sleepwear, kinds: ['pajamas'] },
  { heading: closetKindText.underwear, kinds: ['underwear', 'socks'] },
  { heading: closetKindText.sport, kinds: ['workout'] },
  { heading: closetKindText.baby, kinds: ['baby_bodysuit'] },
  { heading: closetKindText.linen, kinds: ['towel', 'sheets'] },
  { heading: closetKindText.other, kinds: ['other'] },
] as const satisfies ReadonlyArray<{ heading: string; kinds: readonly GarmentKind[] }>

export type KindHeading = (typeof kindHeadings)[number]['heading']

/** The heading a garment sits under; no kind, or one the app has no heading for, is Other. */
export function kindHeading(kind: string | null | undefined): KindHeading {
  return kindHeadings.find((entry) => (entry.kinds as readonly string[]).includes(kind ?? ''))?.heading ?? closetKindText.other
}

/** Legacy occasion queries use explicit tags only, never the clothing type. */
export function effectiveOccasions(garment: { readonly occasions: readonly Occasion[] | null; readonly kind: string | null; readonly tags?: readonly string[] }): readonly Occasion[] {
  const tags = clothingTags(garment).map((tag) => tag.toLowerCase())
  return occasions.filter((occasion) => tags.includes(occasion))
}

/**
 * Where a garment is, as the Closet shows it: ready, a stored state, or in the wash while a
 * running load holds it (never stored).
 */
export type ClosetState = 'ready' | Exclude<GarmentStatus, 'clean'> | 'in_wash'

export function closetState(garment: { readonly status: GarmentStatus; readonly inLoad: string | null }): ClosetState {
  if (garment.inLoad !== null) return 'in_wash'
  return garment.status === 'clean' ? 'ready' : garment.status
}

export type WearDates = { readonly lastWornAt: number | null; readonly lastCleanedAt: number | null; readonly createdAt: number }

/** When the garment was last worn, else last cleaned, else added. */
export function lastWornOrCleaned(garment: WearDates): number {
  return garment.lastWornAt ?? garment.lastCleanedAt ?? garment.createdAt
}

/**
 * The not-worn symbol: the date it counts from when the garment has not been worn for the
 * household's number of days, else null. A symbol only, never a card or a notification.
 */
export function notWornSince(garment: WearDates, now: number, notWornDays: number): number | null {
  const since = lastWornOrCleaned(garment)
  return now - since >= notWornDays * dayMs ? since : null
}

/** For a tile of identical garments: only when every member qualifies, from the latest date among them. */
export function groupNotWornSince(members: readonly WearDates[], now: number, notWornDays: number): number | null {
  if (members.length === 0) return null
  const dates = members.map((member) => notWornSince(member, now, notWornDays))
  return dates.every((date) => date !== null) ? Math.max(...(dates as number[])) : null
}

export type ClosetGarment = WearDates & {
  readonly textileId: string
  readonly name: string
  readonly color: string | null
  readonly colorGroup: string | null
  readonly kind: string | null
  readonly wearerId: string | null
  readonly occasions: readonly Occasion[] | null
  readonly tags?: readonly string[]
  readonly status: GarmentStatus
  readonly inLoad: string | null
  readonly wearsSinceClean: number
  readonly guest: boolean
}

/** Identical garments in the same state, hung as one hanger with a count. */
export type ClosetTile<Garment extends ClosetGarment> = {
  readonly key: string
  readonly state: ClosetState
  readonly name: string
  readonly kind: string | null
  readonly colorGroup: string | null
  readonly members: readonly Garment[]
  /** The most wears since washed among the members: the hanger's "Worn {n}×". */
  readonly wornMost: number
  /** Ready tiles only: the date for the not-worn symbol, or null. */
  readonly notWornSince: number | null
}

export type ClosetRail<Garment extends ClosetGarment> = {
  /** Null is the shared rail: towels, sheets and anything nobody wears. */
  readonly wearerId: string | null
  readonly sections: readonly { readonly heading: KindHeading; readonly tiles: readonly ClosetTile<Garment>[] }[]
  readonly ready: number
  readonly total: number
}

export type ClosetFilter = { readonly wearerId?: string | null; readonly occasion?: Occasion; readonly kind?: string; readonly tags?: readonly string[] }

/**
 * One rail per person, then the shared rail, each hanging its clothes under kind headings.
 * Guests' clothes never appear. A garment whose wearer is gone hangs on the shared rail.
 */
export function closetRails<Garment extends ClosetGarment>(
  garments: readonly Garment[],
  wearerIds: readonly string[],
  filter: ClosetFilter,
  now: number,
  notWornDays: number,
): ClosetRail<Garment>[] {
  const known = new Set(wearerIds)
  const owner = (garment: Garment) => (garment.wearerId !== null && known.has(garment.wearerId) ? garment.wearerId : null)
  const shown = garments.filter((garment) =>
    !garment.guest
    && (filter.wearerId === undefined || owner(garment) === filter.wearerId)
    && (filter.occasion === undefined || effectiveOccasions(garment).includes(filter.occasion))
    && (filter.kind === undefined || (garment.kind ?? 'untyped') === filter.kind)
    && (filter.tags === undefined || filter.tags.every((tag) => clothingTags(garment).some((value) => value.toLowerCase() === tag.toLowerCase()))))
  const rails: ClosetRail<Garment>[] = []
  for (const wearerId of [...wearerIds, null]) {
    const mine = shown.filter((garment) => owner(garment) === wearerId)
    if (mine.length === 0) continue
    const tiles = new Map<string, Garment[]>()
    for (const garment of mine) {
      const key = `${garmentKey(garment)}|${closetState(garment)}`
      const tile = tiles.get(key)
      if (tile === undefined) tiles.set(key, [garment])
      else tile.push(garment)
    }
    const all = [...tiles].map(([key, members]): ClosetTile<Garment> => {
      const first = members[0]!
      const state = closetState(first)
      return {
        key,
        state,
        name: first.name,
        kind: first.kind,
        colorGroup: first.colorGroup,
        members,
        wornMost: Math.max(...members.map((member) => member.wearsSinceClean)),
        notWornSince: state === 'ready' ? groupNotWornSince(members, now, notWornDays) : null,
      }
    })
    const sections = kindHeadings
      .map(({ heading }) => ({ heading, tiles: all.filter((tile) => kindHeading(tile.kind) === heading) }))
      .filter((section) => section.tiles.length > 0)
    rails.push({ wearerId, sections, ready: mine.filter((garment) => closetState(garment) === 'ready').length, total: mine.length })
  }
  return rails
}
