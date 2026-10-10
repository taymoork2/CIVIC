import { expect, test } from 'vitest'
import { renderToStaticMarkup } from '@/test/markup'
import { IngredientTagsEditor, normalizeIngredientNames } from '@/household/ingredient-tags'

test('ingredient chips retain chemical punctuation and names beyond clothing-tag limits', () => {
  const long = 'Sodium lauryl ether sulfate (ethoxylated)'
  expect(normalizeIngredientNames([' Lanolin ', 'LANOLIN', '1,2-benzisothiazolin-3-one', long])).toEqual(['Lanolin', '1,2-benzisothiazolin-3-one', long])
  expect(normalizeIngredientNames(['成分', '成分'])).toEqual(['成分'])
  expect(normalizeIngredientNames(Array.from({ length: 60 }, (_, index) => `Ingredient ${index}`))).toHaveLength(60)
  for (const values of [[''], [' '.repeat(10)], ['x'.repeat(81)], Array(61).fill('Lanolin')]) expect(() => normalizeIngredientNames(values)).toThrow()
  const html = renderToStaticMarkup(<IngredientTagsEditor values={['1,2-benzisothiazolin-3-one']} onChange={() => {}} inputValue="" onInputChange={() => {}} />)
  expect(html).toContain('aria-pressed="true"')
  expect(html).toContain('>1,2-benzisothiazolin-3-one</button>')
  expect(html).toContain('maxLength="80"')
  expect(html).not.toMatch(/Separate with commas|Everyday|Work|Dressy/)
})
