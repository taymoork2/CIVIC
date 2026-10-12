import { expect, test } from 'vitest'
import { HomeReadyTiles, type ReadyTile } from '@/home/home-sections'
import { renderToStaticMarkup } from '@/test/markup'

test('ready clothing pages keep every garment once, in order, including a partial final page', () => {
  const tiles: ReadyTile[] = Array.from({ length: 13 }, (_, index) => ({
    key: String(index), name: `Garment ${index}`, count: index === 0 ? 2 : 1, tags: [], art: null,
    label: `Garment ${index}, ${index === 0 ? '2 pieces' : '1 piece'}, ready`,
    link: ({ className, children, ariaLabel }) => <a className={className} href={`/closet?item=${index}`} aria-label={ariaLabel}>{children}</a>,
  }))
  const markup = renderToStaticMarkup(<HomeReadyTiles title="Ready to wear" closetLabel="Closet" tiles={tiles}
    closetLink={({ className, children }) => <a className={className} href="/closet">{children}</a>} />)
  const pages = [...markup.matchAll(/<ul aria-label="Ready to wear, page \d of 3"[^>]*>(.*?)<\/ul>/g)]
  expect(pages.map((page) => [...page[1]!.matchAll(/<li\b/g)].length)).toEqual([6, 6, 1])
  expect([...markup.matchAll(/href="\/closet\?item=(\d+)"/g)].map((match) => Number(match[1]))).toEqual(tiles.map((_, index) => index))
  expect([...markup.matchAll(/>×(\d+)<\/span>/g)].map((match) => Number(match[1]))).toEqual([2])
  expect(markup).toContain('aria-label="Garment 0, 2 pieces, ready"')
})
