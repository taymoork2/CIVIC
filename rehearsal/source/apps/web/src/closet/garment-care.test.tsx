import { expect, test } from 'vitest'
import { renderToStaticMarkup } from '@/test/markup'
import { CareChoices } from '@/closet/garment-care'
import { emptyTag } from '@/laundry/tag-step'

test('unknown drying still exposes all natural drying answers as one choice group', () => {
  const markup = renderToStaticMarkup(<CareChoices question="dry" draft={{ ...emptyTag, dryer: 'unknown' }} onChange={() => undefined} />)
  expect(markup.match(/role="radiogroup"/g)).toHaveLength(1)
  for (const answer of ['Line dry', 'Dry flat', 'Drip dry', 'Tag doesn’t say']) expect(markup).toContain(answer)
  expect(markup.match(/aria-checked="true"/g)).toHaveLength(1)
  expect(markup.indexOf('Dry flat')).toBeLessThan(markup.indexOf('Tag doesn’t say'))
})

test('fabric constraints hide incompatible choices while retaining a selected conflict for correction', () => {
  const silk = renderToStaticMarkup(<CareChoices question="bleach" material="silk" draft={{ ...emptyTag, bleach: 'unknown' }} onChange={() => undefined} />)
  expect(silk).not.toContain('Any bleach')
  expect(silk).not.toContain('Non-chlorine bleach only')
  expect(silk).toContain('Do not bleach')
  const conflict = renderToStaticMarkup(<CareChoices question="dry" material="wool" draft={{ ...emptyTag, dryer: 'high' }} onChange={() => undefined} />)
  expect(conflict).toMatch(/aria-checked="true" disabled=""[^>]*>(?:(?!<\/button>).)*High heat/)
  expect(conflict).not.toContain('Medium heat')
  expect(conflict).toContain('Low heat')
})
