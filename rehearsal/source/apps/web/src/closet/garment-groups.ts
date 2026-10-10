import { garmentKey, inferredDryMethod } from '@washcloset/planner'
export { garmentKey } from '@washcloset/planner'

import type { GarmentStatus } from '@/copy'

export type { GarmentStatus }

/** Every stored garment status, in the order a garment usually moves through them. */
export const garmentStatuses = ['clean', 'dirty', 'hanging', 'needs_dry_clean', 'at_cleaner', 'needs_refresh'] as const satisfies readonly GarmentStatus[]

/** The care fields that decide how a garment is washed and dried; evidence and status are separate. */
export type GroupableCare = {
  readonly material: string | null
  readonly washMethod: string
  readonly cycle: string | null
  readonly maxTemperatureC: number | null
  readonly restrictions: readonly string[]
  readonly dryMethod?: string | null
  readonly dryHeat?: string | null
  readonly status: string
}

export type GroupableGarment = {
  readonly textileId: string
  readonly name: string
  readonly color: string | null
  readonly colorGroup: string | null
  readonly guest?: boolean
  readonly status: GarmentStatus
  readonly inLoad: string | null
  readonly washCount: number
  /** Wears since the last wash; older rows without it count none. */
  readonly wearsSinceClean?: number
  readonly care: GroupableCare | null
}

export type GarmentGroup<Garment extends GroupableGarment> = {
  readonly key: string
  /** The first member's own spelling. */
  readonly name: string
  readonly color: string | null
  readonly colorGroup: string | null
  /** In the order they were listed, which is creation order from `inventory.list`. */
  readonly members: readonly Garment[]
  /** How many members are in each stored status. */
  readonly statuses: Readonly<Record<GarmentStatus, number>>
  readonly dirty: number
  readonly inLoad: number
  /** Dirty and not in a running load: what is actually waiting for a wash. */
  readonly waiting: number
  /** Every member's care would wash and dry it the same way. */
  readonly careSame: boolean
  readonly careConfirmed: boolean
  /** Members whose care label is not yet confirmed. */
  readonly needLabel: number
  readonly washCounts: { readonly min: number; readonly max: number }
  /** The most wears since washed among the members: the tile's "Worn {n}×". */
  readonly wornMost: number
}

const words = (value: string | null | undefined) => (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * How a garment's care would wash and dry it, as one comparable string. An older "Do not tumble
 * dry" restriction reads the same as the drying method it implies, so it does not split a group.
 * Internal to grouping: no screen shows it.
 */
function careSignature(care: GroupableCare | null): string {
  if (care === null) return 'none'
  const restated = care.dryMethod === 'do_not_tumble_dry'
  const restrictions = [...new Set(care.restrictions.filter((entry) => !(restated && inferredDryMethod([entry]) !== null)).map(words))].sort()
  return JSON.stringify([
    words(care.material),
    care.washMethod,
    care.cycle ?? null,
    care.maxTemperatureC ?? null,
    restrictions,
    care.dryMethod ?? 'unknown',
    care.dryMethod === 'tumble_dry' ? care.dryHeat ?? null : null,
  ])
}

/** Identical garments grouped in the order first seen, with what the group row needs to say about them. */
export function groupGarments<Garment extends GroupableGarment>(garments: readonly Garment[]): GarmentGroup<Garment>[] {
  const members = new Map<string, Garment[]>()
  for (const garment of garments) {
    const key = garmentKey(garment)
    const group = members.get(key)
    if (group === undefined) members.set(key, [garment])
    else group.push(garment)
  }
  return [...members].map(([key, group]) => {
    const first = group[0]!
    const counts = group.map((garment) => garment.washCount)
    const signatures = new Set(group.map((garment) => careSignature(garment.care)))
    const needLabel = group.filter((garment) => garment.care?.status !== 'confirmed').length
    return {
      key,
      name: first.name,
      color: first.color,
      colorGroup: first.colorGroup,
      members: group,
      statuses: Object.fromEntries(garmentStatuses.map((status) => [status, group.filter((garment) => garment.status === status).length])) as Record<GarmentStatus, number>,
      dirty: group.filter((garment) => garment.status === 'dirty').length,
      inLoad: group.filter((garment) => garment.inLoad !== null).length,
      waiting: group.filter((garment) => garment.status === 'dirty' && garment.inLoad === null).length,
      careSame: signatures.size === 1,
      careConfirmed: needLabel === 0,
      needLabel,
      washCounts: { min: Math.min(...counts), max: Math.max(...counts) },
      wornMost: Math.max(...group.map((garment) => garment.wearsSinceClean ?? 0)),
    }
  })
}

/** The identity a piece shares with its indistinguishable twins: the fields `garmentKey` reads. */
export type MatchingIdentity = Parameters<typeof garmentKey>[0]

export type MatchingGroup<Piece> = {
  readonly key: string
  /** The first piece seen: the group's name, color and shared facts. */
  readonly first: Piece
  /** Every piece, in the order given, each keeping its own id for writes. */
  readonly members: readonly Piece[]
}

/**
 * Indistinguishable pieces as one row with a count, for any screen that lists pieces after intake
 * (drying, dryness check, put-away, a load's contents, influence). Pieces match on `garmentKey`; a
 * screen splits them further only by facts that genuinely differ there (washer, drying method, label
 * instructions, private settings), passed as `differs`. Keeps first-seen order.
 */
export function matchingGroups<Piece>(pieces: readonly Piece[], identity: (piece: Piece) => MatchingIdentity, differs: (piece: Piece) => unknown = () => null): MatchingGroup<Piece>[] {
  const groups = new Map<string, Piece[]>()
  for (const piece of pieces) {
    const key = JSON.stringify([garmentKey(identity(piece)), differs(piece) ?? null])
    const members = groups.get(key)
    if (members === undefined) groups.set(key, [piece])
    else members.push(piece)
  }
  return [...groups].map(([key, members]) => ({ key, first: members[0]!, members }))
}
