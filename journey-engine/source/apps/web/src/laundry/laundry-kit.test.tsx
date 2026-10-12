import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'

import { GarmentTiles, LoadCard, ReceiptRows } from '@/laundry/laundry-kit'

const piece = (key: string, count = 1) => ({ key, kind: 't_shirt', colorGroup: 'white', label: `Tee ${key}`, count })

test('a load card shows its pieces as tiles and names its current step', () => {
  const markup = renderToStaticMarkup(<LoadCard label="Whites" pieces={[piece('a', 2), piece('b')]} at={1} />)
  expect(markup).toContain('aria-label="Whites"')
  expect(markup).toContain('Tee a')
  expect(markup).toContain('×2')
  expect(markup).toContain('aria-label="Step 2 of 4: Wash"')
})

test('past six kinds of piece, the last tile counts the rest', () => {
  const markup = renderToStaticMarkup(<GarmentTiles pieces={['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((key) => piece(key, 2))} />)
  expect(markup.match(/<li/g)).toHaveLength(6)
  expect(markup).toContain('+4')
})

test('a receipt is a definition list: the step, then its value', () => {
  const markup = renderToStaticMarkup(<ReceiptRows label="How it was cared for" facts={[{ key: 'w', tone: 'wash', icon: null, label: 'Washed', value: 'Normal, warm' }]} />)
  expect(markup).toMatch(/<dt[^>]*>Washed<\/dt><dd[^>]*>Normal, warm<\/dd>/)
})
