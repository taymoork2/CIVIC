import assert from 'node:assert/strict'
import type { BenefitProduct, CapabilityEvidence, PlannerInput, SupplyItem } from './index'

const { plan, productBenefit } = await import(`./index${'.ts'}`) as typeof import('./index')
const fact = (overrides: Partial<CapabilityEvidence> = {}): CapabilityEvidence => ({
  kind: 'oxygen_bleaching', status: 'present', variant: 'Synthetic exact pack', market: 'US',
  formulationRevision: 'test-revision', source: 'synthetic disclosure', retrievedAt: 1,
  scope: 'ingredient_disclosure', ...overrides,
})
const booster: BenefitProduct = { id: 'booster', capabilities: [fact()] }
const benefit = (goals: Parameters<typeof productBenefit>[1]['goals'], compatibility: 'allowed' | 'unknown' | 'excluded' = 'allowed', product = booster, detergent?: BenefitProduct) => productBenefit(product, { goals, compatibility, detergent })

assert.equal(benefit(['ordinary']).status, 'unnecessary')
assert.equal(benefit(['faded_dye']).status, 'unnecessary', 'a capability is not dye restoration evidence')
assert.equal(benefit(['visible_stain']).status, 'suggested')
assert.match(benefit(['visible_stain']).reason, /unproven.*no addition/i)
assert.equal(benefit(['visible_stain'], 'unknown').status, 'unknown', 'benefit never supplies compatibility')
assert.equal(benefit(['ordinary'], 'excluded').status, 'excluded', 'constraints precede an ordinary-wash goal')
assert.equal(benefit(['fragrance'], 'allowed', { id: 'scent', capabilities: [fact({ kind: 'fragrance' })] }).status, 'preference_only')
assert.equal(benefit(['visible_stain'], 'allowed', booster, { id: 'detergent', capabilities: [fact()] }).status, 'unknown', 'overlap is not comparative efficacy evidence')
assert.equal(benefit(['feel'], 'allowed', { id: 'builder', capabilities: [fact({ kind: 'hardness_management' })] }).status, 'unknown', 'unknown water hardness does not justify a builder')
assert.equal(benefit(['odor']).status, 'unknown', 'oxygen bleaching does not establish an odor claim')
assert.equal(benefit(['visible_stain'], 'allowed', { id: 'unknown' }).status, 'unknown')
for (const invalid of [
  fact({ status: 'unknown' }), fact({ status: 'absent', scope: 'explicit_absence' }),
  fact({ variant: ' ' }), fact({ market: '' }), fact({ formulationRevision: '' }), fact({ source: '' }),
  fact({ retrievedAt: 0 }), fact({ retrievedAt: -1 }), fact({ retrievedAt: Number.NaN }), fact({ scope: 'explicit_absence' }),
]) assert.equal(benefit(['visible_stain'], 'allowed', { id: 'incomplete', capabilities: [invalid] }).status, 'unknown')

// Reference excerpts from the reviewed chemistry plan, not evidence for an owned pack.
// Ingredient presence supports only a capability; these cases contain no dose or use permission.
const references = [
  { id: 'oxiclean-color-boost-reference', variant: 'OxiClean Color Boost Perfume and Dye Free', revision: '40002369 / 42017381; 2024-03-28', source: 'https://churchdwight.com/ingredient-disclosure/laundry-fabric-care/40002369-oxiclean-color-boost-perfume-and-dye-free.aspx' },
  { id: 'clorox-2-powder-reference', variant: 'Clorox 2 powder 49.2 oz; UPC 044600030982', revision: 'SmartLabel 6096899; 2026-06-24', source: 'https://smartlabel.labelinsight.com/product/6096899/ingredients' },
]
for (const reference of references) {
  const product = { id: reference.id, capabilities: [fact({ variant: reference.variant, formulationRevision: reference.revision, source: reference.source, retrievedAt: Date.UTC(2026, 9, 3) })] }
  assert.equal(benefit(['dull_grey'], 'unknown', product).status, 'unknown')
  assert.deepEqual(benefit(['dull_grey'], 'unknown', product).evidence, [reference.source])
  assert.equal(benefit(['faded_dye'], 'allowed', product).status, 'unnecessary')
}

const verified = { status: 'verified' as const, source: 'synthetic label' }
const detergent: SupplyItem = { id: 'detergent', kind: 'detergent', formulation: { form: 'liquid' }, labelEvidence: verified,
  applicationRules: [{ id: 'dose', dose: { amount: 20, unit: 'ml' }, stage: 'wash', placement: 'detergent_compartment', evidence: verified }] }
const unread: SupplyItem = { id: 'unread', kind: 'chemical_consumable', formulation: { form: 'powder' }, labelEvidence: { status: 'unknown' }, capabilities: [fact()] }
const input: PlannerInput = { textiles: [{ id: 'tee', bulkUnits: 1, care: { washMethod: 'machine', cycle: 'normal', bleach: 'none' } }], supplies: [detergent, unread],
  machines: [{ id: 'washer', capacityUnits: 10, capacityConfidence: 'verified', evidence: verified, supportedCycles: ['normal'], dispensing: { placements: ['detergent_compartment'] } }] }
const ordinary = plan(input)
assert.equal(ordinary.status, 'ready', 'an unread optional product on the shelf does not block detergent-only washing')
assert.deepEqual(ordinary.loads[0]!.treatments.map((step) => step.supplyId), ['detergent'])
assert.ok(!ordinary.reasons.some((reason) => reason.supplyId === unread.id), 'unchosen optional products do not create blocking reasons')
const selected = plan({ ...input, optionalSupplyIds: [unread.id], washGoals: ['visible_stain'] })
assert.equal(selected.status, 'needs_confirmation', 'capability evidence cannot bypass a selected product label')
assert.ok(selected.reasons.some((reason) => reason.supplyId === unread.id))
const undosed = plan({ ...input, supplies: [detergent, { ...unread, labelEvidence: verified }], optionalSupplyIds: [unread.id], washGoals: ['visible_stain'] })
assert.equal(undosed.status, 'needs_confirmation', 'a verified capability and pack still do not supply a dose')
const bleach: SupplyItem = { ...unread, id: 'bleach', bleachKind: 'oxygen', labelEvidence: verified, applicationRules: [{ id: 'bleach-dose', dose: { amount: 10, unit: 'g' }, stage: 'wash', placement: 'detergent_compartment', evidence: verified }] }
const prohibited = plan({ ...input, supplies: [detergent, bleach], optionalSupplyIds: [bleach.id], washGoals: ['visible_stain'] })
assert.equal(prohibited.loads[0]!.productRecommendations?.find((entry) => entry.supplyId === bleach.id)?.status, 'excluded')
assert.ok(!prohibited.loads[0]!.treatments.some((step) => step.supplyId === bleach.id), 'a useful capability never overrides a no-bleach tag')
const mixingConflict = plan({ ...input, supplies: [detergent, { ...bleach, bleachKind: 'none', applicationRules: [{ ...bleach.applicationRules![0]!, incompatibleSupplyIds: [detergent.id] }] }], optionalSupplyIds: [bleach.id], washGoals: ['visible_stain'] })
assert.equal(mixingConflict.status, 'needs_confirmation', 'a capability never grants combination permission')
assert.ok(mixingConflict.reasons.some((reason) => reason.details.cause === 'chemical_combination_conflict'))
const leftOut = plan({ ...input, excludedSupplyIds: [unread.id] })
assert.notEqual(leftOut.loads[0]!.productRecommendations?.find((entry) => entry.supplyId === unread.id)?.status, 'excluded', 'a user choice to leave out is reversible, unlike a recorded prohibition')

console.log('product benefit and explicit selection checks passed')
