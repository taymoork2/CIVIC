import { expect, test } from 'vitest'
import { CatalogIdentifierLookup, CatalogLookupResults, type IdentifierCandidate } from '@/products/catalog-identifier-lookup'
import { renderToStaticMarkup, renderWithConvex } from '@/test/markup'

const candidate = (key: string, market: string): IdentifierCandidate => ({
  product: { _id: 'product' as IdentifierCandidate['product']['_id'], _creationTime: 1, key: 'product', kind: 'product', brand: 'Synthetic', name: '<Long product name>', createdAt: 1 },
  variant: { _id: key as IdentifierCandidate['variant']['_id'], _creationTime: 1, key, productId: 'product' as IdentifierCandidate['product']['_id'], market, name: `Long variant ${key}`, packIdentifier: 'gtin14:00030772103111', createdAt: 1 },
  revisionId: 'revision' as IdentifierCandidate['revisionId'], reviewId: 'review' as IdentifierCandidate['reviewId'], labelRevision: 'saved-label', digest: 'digest',
})
const render = (candidates: IdentifierCandidate[], market = '') => renderToStaticMarkup(<CatalogLookupResults result={{ gtin14: '00030772103111', candidates }} market={market} onMarket={() => undefined} onChoose={() => undefined} />)

test('identifier entry has an accessible numeric field, bounded text, disabled empty search and saved-source boundary', () => {
  const markup = renderWithConvex(<CatalogIdentifierLookup onChoose={() => undefined} onDraftChange={() => undefined} />)
  expect(markup).toContain('UPC, EAN or GTIN printed on the pack')
  expect(markup).toContain('inputMode="numeric"')
  expect(markup).toContain('maxLength="64"')
  expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Find by identifier/)
  expect(markup).toContain('reviewed saved details only')
})

test('empty lookup keeps the manual brand and pack path explicit', () => {
  expect(render([])).toContain('No reviewed saved manufacturer details')
  expect(render([])).toContain('Try the brand lookup or keep entering the pack manually')
})

test('even one candidate needs an explicit market; multiple markets and variants are never auto-selected', () => {
  const single = render([candidate('one', 'US')])
  expect(single).toContain('Choose the exact market')
  expect(single).not.toContain('Review &lt;Long product name&gt;')
  const all = [candidate('one', 'US'), candidate('two', 'US'), candidate('three', 'CA')]
  expect(render(all)).toContain('multiple markets')
  const chosen = render(all, 'US')
  expect(chosen).toContain('More than one reviewed variant')
  expect(chosen).toContain('none is selected automatically')
  expect(chosen).toContain('Long variant one')
  expect(chosen).toContain('Long variant two')
  expect(chosen).not.toContain('Long variant three')
  expect(chosen).toContain('does not confirm your pack, formulation or label revision')
  expect(chosen).not.toContain('<Long product name>')
})
