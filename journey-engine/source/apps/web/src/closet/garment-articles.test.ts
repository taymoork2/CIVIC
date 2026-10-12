import { garmentKinds } from '@washcloset/planner'
import { expect, test } from 'vitest'

import { articlePlural, garmentArticles, garmentArticleGroups, searchArticles } from '@/closet/garment-articles'

const names = (query: string, baby = false) => searchArticles(query, { baby }).map((article) => article.name)

test('search ranks a name match before another word for it, and that before a match inside', () => {
  expect(names('hood')[0]).toBe('Hoodie')
  expect(names('tee')[0]).toBe('T-shirt')
  expect(names('tee')).toContain('Long-sleeve tee')
  expect(names('trousers')[0]).toBe('Pants')
  expect(names('pj')[0]).toBe('Pajamas')
  expect(names('  HOODIE ')).toEqual(['Hoodie'])
  expect(names('t-sh')[0]).toBe('T-shirt')
})

test('search maps articles to the care type that sorts them', () => {
  const kindOf = (query: string) => searchArticles(query, { baby: true })[0]?.kind
  expect(kindOf('hoodie')).toBe('sweater')
  expect(kindOf('jeans')).toBe('pants')
  expect(kindOf('raincoat')).toBe('outerwear')
  expect(kindOf('sports bra')).toBe('workout')
  expect(kindOf('robe')).toBe('pajamas')
  expect(kindOf('onesie')).toBe('baby_bodysuit')
  expect(kindOf('duvet')).toBe('sheets')
  // A comforter is not sheets: it is left to Other.
  expect(names('comforter')).toEqual([])
})

test('a bodysuit is offered only with a baby wearer', () => {
  expect(names('bodysuit')).toEqual([])
  expect(names('onesie')).toEqual([])
  expect(names('bodysuit', true)).toEqual(['Bodysuit'])
})

test('nothing typed is no matches, and at most eight are offered', () => {
  expect(names('')).toEqual([])
  expect(names('   ')).toEqual([])
  expect(names('s').length).toBe(8)
})

test('every article sorts as a known type and is named once', () => {
  for (const article of garmentArticles) {
    expect(garmentKinds).toContain(article.kind)
    expect(garmentArticleGroups.filter((group) => group.kinds.includes(article.kind))).toHaveLength(1)
  }
  expect(new Set(garmentArticles.map((article) => article.name.toLowerCase())).size).toBe(garmentArticles.length)
})

test('shirt and sleeve names stay separate from care permissions', () => {
  expect(names('shirt')[0]).toBe('Button-up shirt')
  expect(searchArticles('dress shirt', { baby: false })[0]?.kind).toBe('shirt')
  expect(searchArticles('long-sleeve tee', { baby: false })[0]?.kind).toBe('t_shirt')
  for (const query of ['henley', 'Henley shirt', 'short-sleeve henley', 'long-sleeve henley']) expect(searchArticles(query, { baby: false })[0]).toMatchObject({ name: 'Henley', kind: 't_shirt' })
})

test('articles count as plurals, and names already plural stay', () => {
  expect(articlePlural('Hoodie')).toBe('Hoodies')
  expect(articlePlural('Jeans')).toBe('Jeans')
  expect(articlePlural('Dress shirt')).toBe('Dress shirts')
  expect(articlePlural('Sports bra')).toBe('Sports bras')
  expect(articlePlural('Dress')).toBe('Dresses')
  expect(articlePlural('Underwear')).toBe('Underwear')
  expect(articlePlural('Pajamas')).toBe('Pajamas')
  expect(articlePlural('Sweatpants')).toBe('Sweatpants')
  expect(articlePlural('Leggings')).toBe('Leggings')
  expect(articlePlural('Washcloth')).toBe('Washcloths')
  expect(articlePlural('Tank top')).toBe('Tank tops')
  // Every listed article counts to a different word or is a mass noun / already plural.
  for (const article of garmentArticles) expect(articlePlural(article.name).toLowerCase().startsWith(article.name.toLowerCase())).toBe(true)
})
