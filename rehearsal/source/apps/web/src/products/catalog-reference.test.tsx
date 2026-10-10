import { expect, test } from 'vitest'
import { CatalogReference } from '@/products/catalog-reference'
import type { Supply } from '@/household/inventory-types'
import { renderWithConvex } from '@/test/markup'

test('manual source reference remains available without granting direction replacement', () => {
  const markup = renderWithConvex(<CatalogReference holding={{ kind: 'product', id: 'synthetic-supply' as Supply['supplyId'] }} name="Synthetic pack" />)
  expect(markup).toContain('Find manufacturer details')
  expect(markup).toMatch(/<legend[^>]*>Manufacturer details<\/legend>/)
  expect(markup).not.toContain('aria-expanded')
  expect(markup).not.toContain('Review source directions')
})
