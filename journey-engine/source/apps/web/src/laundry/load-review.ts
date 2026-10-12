import { draftFromSupply } from '@/products/bottle-sheet'
import { bottleUseWords, noWearerWords, productText, temperatureWord, cycleWord } from '@/copy'
import { productContentsCopy } from '@/copy-household'
import { loadReviewText } from '@/copy-load'
import { garmentKey } from '@/closet/garment-groups'
import type { Inventory, Supply, Textile } from '@/household/inventory-types'
import type { PlanLoad } from '@/laundry/laundry-pass'
import { privatePieceGroups, type PrivatePiece } from '@/laundry/private-piece'
import { privatePieceText } from '@/copy-load'

/**
 * What the load review lists, read from the real plan and the household's records: each garment
 * (identical pieces of one person are one row with a quantity), the pieces left out of this wash,
 * the products the plan uses and the product requirements of the people whose clothes are in it.
 * Nothing here is invented: a fact that is not recorded is simply not shown.
 */

export type ReviewGarment = {
  readonly private?: boolean
  readonly key: string
  /** The pieces in this load, in plan order. */
  readonly textileIds: readonly string[]
  /** Identical pieces left out of this wash that the stepper can bring back. */
  readonly candidates: readonly string[]
  readonly name: string
  readonly kind: string | null
  readonly colorGroup: string | null
  readonly color: string | null
  readonly owner: string
  readonly wash: string
}

export type LeftOutGarment = {
  readonly key: string
  readonly textileIds: readonly string[]
  readonly name: string
  readonly kind: string | null
  readonly colorGroup: string | null
  readonly color: string | null
}

export type ReviewProductRow = { readonly key: string; readonly supplyId: string; readonly name: string; readonly fact: string }

export type ReviewProducts = {
  readonly detergent: ReviewProductRow | null
  readonly pretreat: readonly ReviewProductRow[]
  /** The household's softener: in this load when the plan uses it; `canToggle` when this wash can add or leave it out. */
  readonly softener: { readonly supplyId: string; readonly name: string; readonly on: boolean; readonly canToggle: boolean } | null
  readonly other: readonly ReviewProductRow[]
}

export type LoadReviewModel = {
  readonly garments: readonly ReviewGarment[]
  readonly leftOut: readonly LeftOutGarment[]
  /** "Name (fragrance-free, no lanolin); Name (dye-free)", or null when nobody in the load has requirements. */
  readonly requirements: string | null
  readonly products: ReviewProducts
}

/** How a garment's tag says it is washed, in the words the care symbols use. */
export function washLabel(care: Textile['care']): string {
  if (care === null) return loadReviewText.careNotRecorded
  switch (care.washMethod) {
    case 'machine': return [loadReviewText.washMachine, temperatureWord(care.maxTemperatureC)?.toLowerCase(), cycleWord(care.cycle)?.toLowerCase()].filter((part) => part !== undefined && part !== null).join(', ')
    case 'hand_wash': return loadReviewText.washHand
    case 'dry_clean_only': return loadReviewText.washDryClean
    case 'do_not_wash': return loadReviewText.washNot
    default: return loadReviewText.careNotRecorded
  }
}

/** Whose a garment is: the person's name, "Shared" for the household's, "Guests" is never shown as a name. */
export function ownerName(textile: Textile, wearers: Inventory['wearers']): string {
  if (textile.guest) return ''
  const wearer = wearers.find((entry) => entry.wearerId === textile.wearerId) ?? (wearers.length === 1 && textile.wearerId === null ? wearers[0] : undefined)
  return wearer === undefined ? noWearerWords : wearer.name
}

export const groupKey = (textile: Textile) => `${garmentKey(textile)}|${textile.wearerId ?? 'none'}`

function requirementWords(requirements: NonNullable<Inventory['wearers'][number]['requirements']>): string {
  return [
    requirements.fragranceFree === true ? loadReviewText.fragranceFree : null,
    requirements.dyeFree === true ? loadReviewText.dyeFree : null,
    ...(requirements.avoidIngredients ?? []).map((ingredient) => loadReviewText.avoid(ingredient)),
  ].filter((part): part is string => part !== null).join(', ')
}

function requirementsLine(textiles: readonly Textile[], wearers: Inventory['wearers']): string | null {
  const seen = new Set<string>()
  const people: string[] = []
  for (const textile of textiles) {
    const wearer = textile.guest || textile.wearerId === null ? undefined : wearers.find((entry) => entry.wearerId === textile.wearerId)
    if (wearer === undefined || wearer.requirements === undefined || wearer.requirements === null || seen.has(wearer.wearerId)) continue
    seen.add(wearer.wearerId)
    const words = requirementWords(wearer.requirements)
    if (words !== '') people.push(loadReviewText.requirementsOf(wearer.name, words))
  }
  return people.length === 0 ? null : people.join('; ')
}

function productFact(supply: Supply, lead: string): string {
  const draft = draftFromSupply(supply)
  const form = draft.form === null ? null : productText.forms[draft.form]
  const bleach = draft.form === 'sheets' || draft.form === 'dispenser' || draft.form === 'balls' ? null : productContentsCopy.rowBleach[supply.safety?.bleachKind ?? 'unknown'].toLowerCase()
  return [lead, form, bleach].filter((part): part is string => part !== null).join(' · ')
}

/** The plan's products: its detergent, a pretreatment per garment, the softener, anything else it uses. */
export function reviewProducts(load: Pick<PlanLoad, 'treatments'>, supplies: Inventory['supplies'], excludedSupplyIds: readonly string[], garmentName: (textileId: string) => string): ReviewProducts {
  const byId = new Map(supplies.map((supply) => [supply.supplyId as string, supply]))
  const useOf = (supply: Supply) => draftFromSupply(supply).use
  const washSteps = load.treatments.filter((step) => step.textileId === undefined && byId.has(step.supplyId))
  const detergentSupply = washSteps.map((step) => byId.get(step.supplyId)!).find((supply) => useOf(supply) === 'detergent')
  const detergent: ReviewProductRow | null = detergentSupply === undefined ? null : { key: `d:${detergentSupply.supplyId}`, supplyId: detergentSupply.supplyId, name: detergentSupply.name.trim(), fact: productFact(detergentSupply, loadReviewText.detergent) }
  const pretreat = load.treatments.flatMap((step): ReviewProductRow[] => {
    const supply = step.textileId === undefined || step.confirmation !== 'confirmed' ? undefined : byId.get(step.supplyId)
    return supply === undefined || step.textileId === undefined ? [] : [{ key: `t:${step.textileId}:${supply.supplyId}`, supplyId: supply.supplyId, name: supply.name.trim(), fact: `${loadReviewText.pretreatment} · ${garmentName(step.textileId)}` }]
  })
  const inPlan = washSteps.map((step) => byId.get(step.supplyId)!).find((supply) => useOf(supply) === 'softener')
  const left = supplies.find((supply) => !supply.archived && useOf(supply) === 'softener' && excludedSupplyIds.includes(supply.supplyId))
  const household = supplies.find((supply) => !supply.archived && useOf(supply) === 'softener')
  const chosen = inPlan ?? left ?? household
  const softener = chosen === undefined ? null : { supplyId: chosen.supplyId as string, name: chosen.name.trim(), on: inPlan !== undefined, canToggle: true }
  const shown = new Set([detergentSupply?.supplyId, inPlan?.supplyId].filter((id): id is Supply['supplyId'] => id !== undefined))
  const other: ReviewProductRow[] = []
  for (const step of washSteps) {
    const supply = byId.get(step.supplyId)!
    if (shown.has(supply.supplyId)) continue
    shown.add(supply.supplyId)
    const use = useOf(supply)
    other.push({ key: `o:${supply.supplyId}`, supplyId: supply.supplyId, name: supply.name.trim(), fact: productFact(supply, use === null ? loadReviewText.detergent : bottleUseWords[use]) })
  }
  return { detergent, pretreat, softener, other }
}

/** The garment groups a load holds, to tell which load a left-out group belongs to. */
export function loadGroupKeys(load: Pick<PlanLoad, 'textileIds'>, textiles: ReadonlyMap<string, Textile>): Set<string> {
  return new Set(load.textileIds.flatMap((id) => textiles.get(id) ?? []).map(groupKey))
}

/**
 * The review of one load. `outIds` are the hamper pieces set aside ("Not this time"). A left-out
 * group shows in the load that holds identical pieces; one no load holds (`otherKeys` lists what
 * the other loads hold) shows in the first load, `first`.
 */
export function loadReviewModel({ load, textiles, wearers, supplies, outIds, excludedSupplyIds, first, otherKeys, privatePieces = [] }: {
  load: Pick<PlanLoad, 'textileIds' | 'treatments'>
  textiles: ReadonlyMap<string, Textile>
  wearers: Inventory['wearers']
  supplies: Inventory['supplies']
  outIds: readonly string[]
  excludedSupplyIds: readonly string[]
  first: boolean
  otherKeys: ReadonlySet<string>
  privatePieces?: readonly PrivatePiece[]
}): LoadReviewModel {
  const members = load.textileIds.flatMap((id) => textiles.get(id) ?? [])
  const out = outIds.flatMap((id) => textiles.get(id) ?? [])
  const groups = new Map<string, Textile[]>()
  for (const textile of members) groups.set(groupKey(textile), [...(groups.get(groupKey(textile)) ?? []), textile])
  const garments = [...groups.entries()].map(([key, pieces]): ReviewGarment => {
    const head = pieces[0]!
    return {
      key, textileIds: pieces.map((piece) => piece.textileId as string),
      candidates: out.filter((piece) => groupKey(piece) === key).map((piece) => piece.textileId as string),
      name: head.name, kind: head.kind, colorGroup: head.colorGroup, color: head.color,
      owner: ownerName(head, wearers), wash: washLabel(head.care),
    }
  })
  for (const group of privatePieceGroups(privatePieces.filter((piece) => load.textileIds.includes(piece.textileId)))) {
    garments.push({ key: `private:${group.ids[0]}`, textileIds: group.ids, candidates: [], name: privatePieceText.pieces(group.ids.length), kind: null, colorGroup: null, color: null, owner: '', wash: group.care, private: true })
  }
  const leftGroups = new Map<string, Textile[]>()
  for (const textile of out) if (groups.has(groupKey(textile)) || (first && !otherKeys.has(groupKey(textile)))) leftGroups.set(groupKey(textile), [...(leftGroups.get(groupKey(textile)) ?? []), textile])
  const leftOut = [...leftGroups.entries()].map(([key, pieces]): LeftOutGarment => {
    const head = pieces[0]!
    return { key, textileIds: pieces.map((piece) => piece.textileId as string), name: head.name, kind: head.kind, colorGroup: head.colorGroup, color: head.color }
  })
  return {
    garments, leftOut,
    requirements: requirementsLine(members, wearers),
    products: reviewProducts(load, supplies, excludedSupplyIds, (textileId) => textiles.get(textileId)?.name ?? ''),
  }
}
