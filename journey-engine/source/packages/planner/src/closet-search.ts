import { clothingTags } from './clothing-tags.ts'
import { fabricLabel, parseFabric, type FabricDetails } from './fabric-details.ts'

export const clothingKindWords = {
  t_shirt: 'T-shirt', shirt: 'Shirt or blouse', sweater: 'Sweater', pants: 'Jeans or pants',
  shorts: 'Shorts', skirt: 'Skirt', dress: 'Dress', outerwear: 'Jacket or coat', suit: 'Suit or blazer',
  pajamas: 'Pajamas', underwear: 'Underwear', socks: 'Socks', workout: 'Workout clothes',
  baby_bodysuit: 'Baby bodysuit', towel: 'Towel', sheets: 'Sheets', other: 'Other',
} as const

/** Shared by whole-closet search and its client-side previews. */
export function matchesClothingSearch(piece: {
  name: string; color?: string | null; colorGroup?: string | null; kind?: string | null;
  occasions?: readonly string[] | null; tags?: readonly string[];
  identity?: { brand?: string; styleNumber?: string; size?: string; rnNumber?: string; barcode?: string } | null;
  care?: { material?: string | null; fabricDetails?: FabricDetails } | null;
}, owner: string, search: string): boolean {
  const query = search.trim().toLocaleLowerCase()
  if (query === '') return true
  const care = piece.care
  const identity = piece.identity
  return [piece.name, owner, piece.color, piece.colorGroup, ...clothingTags(piece),
    clothingKindWords[piece.kind as keyof typeof clothingKindWords], identity?.brand,
    identity?.styleNumber, identity?.size, identity?.rnNumber, identity?.barcode, care?.material,
    ...parseFabric(care?.material ?? null).flatMap(part => [fabricLabel(part.fiber), part.name, ...(part.details ?? [])]),
    ...(care?.fabricDetails?.fibers ?? []).flatMap(part => [fabricLabel(part.fiber), ...part.details]),
    ...(care?.fabricDetails?.construction ?? []), ...(care?.fabricDetails?.finishes ?? [])]
    .some(value => value?.toLocaleLowerCase().includes(query))
}
