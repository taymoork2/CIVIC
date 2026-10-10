import { expect, test } from 'vitest'
import { clothingTags, normalizeClothingTags, usedClothingTags } from '@washcloset/planner'
import { ClothingTagsEditor } from '@/closet/clothing-tags'
import { renderToStaticMarkup } from '@/test/markup'

test('personal tags normalize, deduplicate, retain international text and reject unsafe or oversized input', () => {
  expect(normalizeClothingTags([' Work ', 'work', 'Trip   to Kyoto', '夏服', 'Ｗｏｒｋ'])).toEqual(['Trip to Kyoto', 'Work', '夏服'])
  expect(normalizeClothingTags(['Classic', 'Cocktail', 'Scunthorpe trip', 'Silk blouse'])).toHaveLength(4)
  for (const tags of [[''], ['a'.repeat(33)], ['Trip\u200b'], ['fuck'], Array(13).fill('Work')]) expect(() => normalizeClothingTags(tags)).toThrow()
  expect(clothingTags({ occasions: ['work', 'lounge'] })).toEqual(['Work', 'Lounge'])
  expect(clothingTags({ occasions: ['work'], tags: [] })).toEqual([])
  expect(usedClothingTags([{ tags: ['Work', 'Travel'] }, { tags: ['work'] }])).toEqual(['Travel', 'Work'])
  const html = renderToStaticMarkup(<ClothingTagsEditor values={['Trip to Kyoto']} knownTags={['Rainy day']} onChange={() => {}} />)
  expect(html).toMatch(/aria-pressed="true"[^>]*>Trip to Kyoto<\/button>/)
  expect(html).toContain('Rainy day')
  expect(html).toContain('Filter or add a tag')
  expect(html.indexOf('Filter or add a tag')).toBeLessThan(html.indexOf('aria-pressed="true"'))
  const standalone = renderToStaticMarkup(<ClothingTagsEditor values={[]} onChange={() => {}} standalone />)
  const fieldId = standalone.match(/<input[^>]* id="([^"]+)"/)![1]
  expect(standalone).toContain(`for="${fieldId}">Tags</label>`)
})
