import { expect, test } from 'vitest'
import type { BenefitDecision } from '@washcloset/planner'
import type { Supply } from '@/household/inventory-types'
import { ProductBenefits, type ProductBenefitsProps } from '@/products/product-benefits'
import { ProductCapabilities } from '@/products/product-capabilities'
import { renderToStaticMarkup } from '@/test/markup'

const decision = (overrides: Partial<BenefitDecision> = {}): BenefitDecision => ({ supplyId: 'oxi', status: 'unknown', compatibility: 'unknown', reason: 'Compatibility still needs review.', evidence: [], policyVersion: '1', ...overrides })
const supplies = [{ supplyId: 'oxi', name: 'Oxi' }] as unknown as Supply[]
const render = (decisions = [decision()], selected: string[] = [], disabled = false) => renderToStaticMarkup(<ProductBenefits decisions={decisions} supplies={supplies} selected={selected} goal="ordinary" disabled={disabled} onGoal={() => undefined} onChoose={() => undefined} />)

test('optional-product review starts with no addition and keeps uncertainty visible', () => {
  const markup = render()
  expect(markup).toContain('Added only when selected, after checking the label, dose and compatibility.')
  expect(markup).toContain('Benefit not established')
  expect(markup).toContain('Compatibility still needs review.')
  expect(markup).toContain('aria-checked="false"')
  expect(markup).not.toContain(' disabled=""')
})

test('a prohibited unselected addition is disabled, while a selected one can still be removed', () => {
  const excluded = [decision({ status: 'excluded', compatibility: 'excluded' })]
  expect(render(excluded)).toContain(' disabled=""')
  expect(render(excluded, ['oxi'])).not.toContain(' disabled=""')
  expect(render([decision()], ['oxi'], true)).toContain(' disabled=""')
})

test('an explicitly selected product stays removable when it leaves the benefit list', () => {
  const markup = render([], ['oxi'])
  expect(markup).toContain('Use Oxi')
  expect(markup).toContain('remove to review without it')
  expect(markup).toContain('aria-checked="true"')
  expect(markup).not.toContain(' disabled=""')
})

test('capability sources are rendered as text and benefit is distinguished from preference', () => {
  const markup = render([decision({ status: 'preference_only', compatibility: 'allowed', evidence: ['<script>bad()</script>'] })])
  expect(markup).toContain('Preference only')
  expect(markup).toContain('&lt;script&gt;bad()&lt;/script&gt;')
  expect(markup).not.toContain('<script>bad()')
})

test('exact-capability intake defaults to unknown and discloses identity/source only for a recorded fact', () => {
  const empty = renderToStaticMarkup(<ProductCapabilities onChange={() => undefined} />)
  expect(empty).toContain('Not established')
  expect(empty).not.toContain('Exact variant and pack code')
  const recorded = renderToStaticMarkup(<ProductCapabilities facts={[{ kind: 'oxygen_bleaching', status: 'present', variant: 'Pack 123', market: 'US', formulationRevision: 'rev 1', source: 'Manufacturer disclosure', retrievedAt: Date.UTC(2026, 9, 3), scope: 'ingredient_disclosure' }]} onChange={() => undefined} />)
  for (const label of ['Exact variant and pack code', 'Market', 'Pack revision or ingredient-list version', 'Pack or manufacturer source', 'Date checked', 'What the source establishes']) expect(recorded).toContain(label)
  expect(recorded).toContain('value="2026-10-03"')
  expect(recorded).toContain('Missing ingredients don’t prove absence.')
})

test('main optional suggestions use private ordering without selecting products or changing evidence', () => {
  const first = decision({ supplyId: 'plain', status: 'unknown', reason: 'No comparable benefit.' })
  const improved = decision({ status: 'suggested', compatibility: 'allowed', reason: 'Recorded capability only.' })
  const privateGuidance: ProductBenefitsProps['privateGuidance'] = { load: { productRecommendations: [improved, first], personalSuggestions: {
    policyVersion: 'personal-planner-1', noAdditionAvailable: true, choices: [{ supplyId: 'oxi', selected: false, suppressed: false,
      guidance: { direction: 'reported_improvement', explanation: 'Comparable reported improvement; no extra benefit over detergent alone established.' } },
    { supplyId: 'plain', selected: false, suppressed: false, guidance: { direction: 'evidence_only', explanation: 'Unknown results do not establish benefit.' } }] } }, observations: 'Three independent reported washes.' }
  const output = renderToStaticMarkup(<ProductBenefits decisions={[first, improved]} supplies={[...supplies, { supplyId: 'plain', name: 'Plain' } as Supply]} selected={[]} goal="odor" disabled={false} onGoal={() => undefined} onChoose={() => undefined} privateGuidance={privateGuidance} />)
  expect(output.indexOf('Use Oxi')).toBeLessThan(output.indexOf('Use Plain'))
  for (const text of ['Added only when selected', 'Recorded capability only.', 'Benefit not established', 'Unknown results do not establish benefit.', 'Why these private suggestions?', 'Three independent reported washes.']) expect(output).toContain(text)
  expect(output).not.toContain('aria-checked="true"')
  expect([first, improved].map((entry) => entry.supplyId)).toEqual(['plain', 'oxi'])
})

test('withheld choices are inspectable while explicit selections stay visible and removable once', () => {
  const addition = decision({ compatibility: 'allowed' })
  const privateGuidance: ProductBenefitsProps['privateGuidance'] = { load: { productRecommendations: [], withheldProductRecommendations: [addition], personalSuggestions: {
    policyVersion: 'personal-planner-1', noAdditionAvailable: true, choices: [{ supplyId: 'oxi', selected: false, suppressed: true,
      guidance: { direction: 'withhold', explanation: 'Negative report needs review; no cause diagnosed.' } }] } }, observations: 'Report revision 2.' }
  const review = (selected: string[]) => renderToStaticMarkup(<ProductBenefits decisions={[addition]} supplies={supplies} selected={selected} goal="odor" disabled={false} onGoal={() => undefined} onChoose={() => undefined} privateGuidance={privateGuidance} />)
  const unselected = review([])
  expect(unselected).toContain('Withheld optional suggestions (1)')
  expect(unselected.indexOf('Withheld optional suggestions')).toBeLessThan(unselected.indexOf('Use Oxi'))
  expect(unselected).toContain('Added only when selected')
  const selected = review(['oxi'])
  expect(selected).not.toContain('Withheld optional suggestions')
  expect(selected.match(/Use Oxi/g)).toHaveLength(1)
  expect(selected).toContain('aria-checked="true"')
  expect(selected).toContain('Explicitly selected for this wash; you can remove it.')
  expect(selected).not.toContain(' disabled=""')
})
