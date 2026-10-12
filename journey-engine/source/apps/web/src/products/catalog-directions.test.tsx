import { expect, test } from 'vitest'
import manifest from '../../../../docs/research/owner-product-integration/output/manifest.json'
import tideAdditions from '../../../../docs/research/owner-product-integration/tide-additions/output/manifest.json'
import { catalogDirectionDraft } from '@convex/catalogDirectionAdapter'
import { CatalogDirectionContent, canApplySourceDirections, type DirectionConfirmation, type SourceDirectionsDraft } from '@/products/catalog-directions'
import { renderToStaticMarkup } from '@/test/markup'

function draft(key = 'tide-original-liquid-121108'): SourceDirectionsDraft {
  const entry = [...manifest.entries, ...tideAdditions.entries].find((entry) => entry.variant.key === `owner-reference:${key}:us`)!
  return { ...catalogDirectionDraft({ variantKey: entry.variant.key, digest: [...manifest.entryBindings, ...tideAdditions.entryBindings].find((binding) => binding.variantKey === entry.variant.key)!.digest, claims: entry.claims, selectedClaimIds: entry.claims.map((claim) => claim.id) }),
    name: entry.product.name, market: entry.variant.market, packIdentifier: entry.variant.packIdentifier, labelRevision: entry.labelRevision,
    stateToken: 'synthetic-state', revisionId: 'synthetic-revision' as SourceDirectionsDraft['revisionId'], reviewId: 'synthetic-review' as SourceDirectionsDraft['reviewId'], digest: 'synthetic-digest',
    selectedClaimIds: entry.claims.map((claim) => claim.id), sources: entry.sources.map(({ id, provider, url, retrievedAt }) => ({ id, provider, url, retrievedAt })) }
}
const empty = (): DirectionConfirmation => ({ optionId: '', confirmedClaimIds: [], confirmation: { market: '', packIdentifier: '', labelRevision: '', physicalPackChecked: false, factsChecked: false, replaceDirections: false, ordinaryFillOnly: false } })
function confirmed(draft: SourceDirectionsDraft): DirectionConfirmation {
  return { optionId: 'tide-he', confirmedClaimIds: draft.requiredClaimIds, confirmation: { market: draft.market, packIdentifier: draft.packIdentifier, labelRevision: draft.labelRevision, physicalPackChecked: true, factsChecked: true, replaceDirections: true, ordinaryFillOnly: true } }
}
const render = (value: DirectionConfirmation, source = draft(), disabled = false) => renderToStaticMarkup(<CatalogDirectionContent draft={source} value={value} onChange={() => undefined} disabled={disabled} />)

test('source directions start without a route or permission and keep physical formulation identity explicit', () => {
  const source = draft()
  expect(canApplySourceDirections(source, empty())).toBe(false)
  const markup = render(empty(), source)
  expect(markup).toContain('Tide Original')
  expect(markup).toContain('similar name doesn’t confirm your pack')
  expect(markup).toContain('deep-fill')
  expect(markup).not.toContain('aria-checked="true"')
  expect(markup).toContain('Pinned sources')
})

test('native partial marks and explicit replacement are visible; every physical/fact check gates save', () => {
  const source = draft()
  const checked = confirmed(source)
  expect(canApplySourceDirections(source, checked)).toBe(true)
  expect(render(checked, source)).toContain('4/5 of bar 1')
  expect(render(checked, source)).toContain('4/5 of bar 3')
  expect(render(checked, source)).toContain('Replace this product’s saved dose rows with only this route')
  for (const change of [{ physicalPackChecked: false }, { factsChecked: false }, { replaceDirections: false }, { ordinaryFillOnly: false }, { market: 'CA' }, { packIdentifier: 'other' }, { labelRevision: 'other' }]) {
    expect(canApplySourceDirections(source, { ...checked, confirmation: { ...checked.confirmation, ...change } })).toBe(false)
  }
  expect(canApplySourceDirections(source, { ...checked, confirmedClaimIds: checked.confirmedClaimIds.slice(1) })).toBe(false)
  expect(canApplySourceDirections(source, { ...checked, confirmedClaimIds: [...checked.confirmedClaimIds, 'other'] })).toBe(false)
  expect(canApplySourceDirections({ ...source, missingClaimIds: ['handling'] }, checked)).toBe(false)
  expect(render(checked, source, true)).toMatch(/<fieldset[^>]*disabled=""/)
  expect(render(checked, source, true)).toContain('aria-disabled="true"')
})

test('unresolved routes retain their restrictions and cannot be turned into pack approval', () => {
  for (const [key, optionId] of [['downy-rinse-refresh-free-gentle-103111', 'downy-direct-rinse'], ['oxiclean-versatile-free', 'oxi-soak'], ['oxiclean-white-revive-paks', 'paks-soak']]) {
    const source = draft(key)
    const value = { ...confirmed(source), optionId }
    expect(canApplySourceDirections(source, value)).toBe(false)
    const markup = render(value, source)
    expect(markup).toContain('This route cannot be saved yet')
    expect(markup).toContain('Your prior directions stay saved')
    expect(markup).toContain('Source restrictions and handling')
    expect(markup).not.toContain('Check the exact physical pack')
  }
})

test('native source doses and categories stay visible without fabricating numerical fills', () => {
  for (const [key, optionId, words] of [
    ['tide-free-gentle-235843', 'tide-free-gentle-he', ['Fill cap below Bar 2', 'Fill cap just below Bar 3']],
    ['tide-pods-spring-meadow-032503', 'tide-pods', ['Manufacturer smaller load', 'Manufacturer standard load', 'Manufacturer larger load', 'Dry hands']],
    ['downy-rinse-refresh-free-gentle-103111', 'downy-rinse', ['Approximately ¼ US cup']],
    ['downy-rinse-refresh-free-gentle-103111', 'downy-half-dispenser', ['Half the dispenser (capacity not calibrated)']],
  ] as const) {
    const source = draft(key)
    const value = { ...confirmed(source), optionId }
    expect(canApplySourceDirections(source, value)).toBe(true)
    const markup = render(value, source)
    for (const word of words) expect(markup).toContain(word)
    expect(markup).not.toContain('0.3 US_cup')
    expect(markup).not.toContain('4/5 of bar 2')
  }
})

test('sanitizer separates release-to-drain contact from presoak and exposes the narrow supported material slice', () => {
  const source = draft('lysol-crisp-linen-line-1833')
  const value = { ...confirmed(source), optionId: 'lysol-rinse' }
  expect(canApplySourceDirections(source, value)).toBe(true)
  const markup = render(value, source)
  expect(markup).toContain('16 minutes before draining')
  expect(markup).toContain('cotton only')
  expect(markup).toContain('Presoak or total-cycle time is insufficient')
  expect(markup).toContain('Not for silk or wool')
  expect(markup).not.toContain('ordinary fill only. Deep-fill dosing')
  expect(canApplySourceDirections(source, { ...value, optionId: 'lysol-presoak' })).toBe(false)
})

test('source strings are escaped and missing selected facts stay actionable', () => {
  const source = { ...draft(), missingClaimIds: ['handling'], restrictions: [{ claimId: 'handling', text: '<script>alert(1)</script>' }] }
  const markup = render({ ...empty(), optionId: 'tide-he' }, source)
  expect(markup).toContain('Return to Source details')
  expect(markup).toContain('Handling precautions')
  expect(markup).toContain('&lt;script&gt;')
  expect(markup).not.toContain('<script>')
})
