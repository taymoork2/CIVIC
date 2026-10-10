import type { GarmentKind } from '@washcloset/planner'

/**
 * Specific clothing articles (en-US) and the care type each one sorts as. The type drives load
 * sorting and bulk, so only articles whose type is clearly right are listed; anything else is
 * added as Other with the typed words as its name.
 */
export type GarmentArticle = {
  readonly name: string
  readonly kind: GarmentKind
  readonly aliases?: readonly string[]
  /** The counted form when the rules in `articlePlural` would get it wrong: "Underwear" stays "Underwear". */
  readonly plural?: string
}

export const garmentArticles: readonly GarmentArticle[] = [
  { name: 'T-shirt', kind: 't_shirt', aliases: ['tee', 'tshirt'] },
  { name: 'Tank top', kind: 't_shirt', aliases: ['tank'] },
  { name: 'Long-sleeve tee', kind: 't_shirt' },
  { name: 'Undershirt', kind: 't_shirt' },
  { name: 'Sweater', kind: 'sweater', aliases: ['jumper', 'pullover', 'knit'] },
  { name: 'Cardigan', kind: 'sweater' },
  { name: 'Hoodie', kind: 'sweater', aliases: ['hoody', 'hooded sweatshirt'] },
  { name: 'Sweatshirt', kind: 'sweater', aliases: ['crewneck'] },
  { name: 'Fleece', kind: 'sweater' },
  { name: 'Turtleneck', kind: 'sweater', aliases: ['mock neck'] },
  { name: 'Shirt', kind: 'shirt', aliases: ['button-up', 'button-down'] },
  { name: 'Blouse', kind: 'shirt' },
  { name: 'Oxford shirt', kind: 'shirt', aliases: ['oxford'] },
  { name: 'Polo', kind: 'shirt', aliases: ['polo shirt'] },
  { name: 'Flannel shirt', kind: 'shirt', aliases: ['flannel'] },
  { name: 'Dress shirt', kind: 'shirt' },
  { name: 'Shorts', kind: 'shorts' },
  { name: 'Pants', kind: 'pants', aliases: ['trousers', 'slacks'] },
  { name: 'Jeans', kind: 'pants', aliases: ['denim'] },
  { name: 'Leggings', kind: 'pants' },
  { name: 'Chinos', kind: 'pants', aliases: ['khakis'] },
  { name: 'Joggers', kind: 'pants' },
  { name: 'Sweatpants', kind: 'pants', aliases: ['track pants'] },
  { name: 'Skirt', kind: 'skirt' },
  { name: 'Dress', kind: 'dress', aliases: ['sundress'] },
  { name: 'Gown', kind: 'dress', aliases: ['evening gown'] },
  { name: 'Jacket', kind: 'outerwear' },
  { name: 'Coat', kind: 'outerwear' },
  { name: 'Parka', kind: 'outerwear' },
  { name: 'Windbreaker', kind: 'outerwear' },
  { name: 'Puffer jacket', kind: 'outerwear', aliases: ['puffer', 'down jacket'] },
  { name: 'Vest', kind: 'outerwear', aliases: ['gilet'] },
  { name: 'Raincoat', kind: 'outerwear', aliases: ['rain jacket'] },
  { name: 'Denim jacket', kind: 'outerwear', aliases: ['jean jacket'] },
  { name: 'Suit', kind: 'suit' },
  { name: 'Blazer', kind: 'suit', aliases: ['sport coat'] },
  { name: 'Tuxedo', kind: 'suit', aliases: ['tux'] },
  { name: 'Pajamas', kind: 'pajamas', aliases: ['pyjamas', 'pjs', 'sleepwear'] },
  { name: 'Nightgown', kind: 'pajamas', aliases: ['nightie'] },
  { name: 'Robe', kind: 'pajamas', aliases: ['bathrobe'] },
  { name: 'Underwear', kind: 'underwear', plural: 'Underwear' },
  { name: 'Boxers', kind: 'underwear' },
  { name: 'Boxer briefs', kind: 'underwear' },
  { name: 'Briefs', kind: 'underwear' },
  { name: 'Panties', kind: 'underwear' },
  { name: 'Bra', kind: 'underwear' },
  { name: 'Socks', kind: 'socks' },
  { name: 'Workout clothes', kind: 'workout', aliases: ['gym clothes', 'athletic wear', 'activewear', 'sportswear'] },
  { name: 'Sports bra', kind: 'workout' },
  { name: 'Bodysuit', kind: 'baby_bodysuit', aliases: ['onesie', 'baby bodysuit'] },
  { name: 'Towel', kind: 'towel' },
  { name: 'Bath towel', kind: 'towel' },
  { name: 'Hand towel', kind: 'towel' },
  { name: 'Beach towel', kind: 'towel' },
  { name: 'Washcloth', kind: 'towel', aliases: ['face cloth'] },
  { name: 'Sheets', kind: 'sheets', aliases: ['bed sheets', 'fitted sheet', 'flat sheet'] },
  { name: 'Pillowcase', kind: 'sheets', aliases: ['pillow case'] },
  { name: 'Duvet cover', kind: 'sheets' },
]

/** Lower case, with hyphens and other punctuation read as spaces: "T-Shirt " matches "t shirt". */
const normal = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Articles matching what was typed, best first: an exact or starting match on the name, then a
 * starting match on another word for it, then the words anywhere. A bodysuit is offered only with a
 * baby wearer. At most eight; nothing typed is no matches.
 */
export function searchArticles(query: string, { baby }: { baby: boolean }): GarmentArticle[] {
  const typed = normal(query)
  if (typed === '') return []
  const ranked: { article: GarmentArticle; rank: number; order: number }[] = []
  garmentArticles.forEach((article, order) => {
    if (article.kind === 'baby_bodysuit' && !baby) return
    const name = normal(article.name)
    const aliases = (article.aliases ?? []).map(normal)
    const rank = name === typed ? 0
      : name.startsWith(typed) ? 1
      : aliases.some((alias) => alias.startsWith(typed)) ? 2
      : [name, ...aliases].some((word) => word.includes(typed)) ? 3
      : null
    if (rank !== null) ranked.push({ article, rank, order })
  })
  return ranked.sort((left, right) => left.rank - right.rank || left.order - right.order).slice(0, 8).map(({ article }) => article)
}

/** Words counted as they are: mass nouns and names already plural. */
const uncounted = new Set(['underwear', 'pajamas', 'jeans', 'pants', 'shorts', 'leggings', 'sweatpants', 'sleepwear', 'activewear', 'sportswear', 'denim'])

/**
 * An article counted: "2 hoodies", "2 dresses"; mass nouns and names already plural ("Underwear",
 * "Jeans", "Pajamas") stay as they are. An article's own `plural` wins over the rules.
 */
export function articlePlural(name: string): string {
  const listed = garmentArticles.find((article) => article.name.toLowerCase() === name.toLowerCase())?.plural
  if (listed !== undefined) return listed
  const last = name.split(' ').at(-1)!.toLowerCase()
  if (uncounted.has(last)) return name
  if (/(ss|ch|sh|x|z)$/i.test(name)) return `${name}es`
  if (/s$/i.test(name)) return name
  return `${name}s`
}
