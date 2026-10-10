import assert from 'node:assert/strict'
import { test } from 'node:test'
import { plan, type AdditionalCareInstructions, type PlannerInput, type SupplyItem } from './index.ts'

// Root integrates the index.ts caller after A1's lease closes. Until then these regressions
// intentionally expose the missing final-load check; they are not part of the focused green suite.
const instructions: AdditionalCareInstructions = { source: 'Synthetic sewn label', preparation: [], washing: ['Use fragrance-free detergent'], beforeDrying: [], drying: [], afterDrying: [], ironing: [],
  washingRequirements: [{ wording: 'Use fragrance-free detergent', checked: true, requirements: [{ kind: 'detergent_fragrance_free' }] }],
}
const detergent: SupplyItem = { id: 'checked-detergent', kind: 'detergent', fragrance: 'free', bleachKind: 'none', formulation: { form: 'liquid' }, labelEvidence: { status: 'verified' },
  applicationRules: [{ id: 'wash', stage: 'wash', placement: 'detergent_compartment', dose: { amount: 10, unit: 'ml' }, evidence: { status: 'verified' } }],
}
const input: PlannerInput = { textiles: [{ id: 'a', bulkUnits: 1, colorGroup: 'light', material: 'cotton', care: { washMethod: 'machine', cycle: 'normal', status: 'confirmed', instructions } }],
  machines: [{ id: 'm', evidence: { status: 'verified' }, capacityUnits: 8, capacityConfidence: 'verified', supportedCycles: ['normal'], dispensing: { placements: ['detergent_compartment'] } }], supplies: [detergent],
}

test('a positive detergent instruction blocks each load if that detergent is absent or left out', () => {
  for (const mode of ['normal', 'rush'] as const) for (const supplies of [[], [detergent]]) {
    const result = plan({ ...input, mode, supplies, excludedSupplyIds: ['checked-detergent'] })
    assert.equal(result.loads[0]!.status, 'needs_confirmation')
    assert.ok(result.reasons.some((reason) => reason.details.cause === 'unmatched_label_requirement'))
  }
})

test('an unused compatible bottle or pretreatment does not satisfy a required wash detergent', () => {
  const pretreatment: SupplyItem = { ...detergent, applicationRules: [{ ...detergent.applicationRules![0]!, stage: 'pre_wash' }] }
  const missing = plan({ ...input, supplies: [pretreatment] })
  assert.equal(missing.loads[0]!.status, 'needs_confirmation')
  assert.ok(missing.reasons.some((reason) => reason.details.cause === 'unmatched_label_requirement'))
  assert.equal(plan(input).loads[0]!.status, 'ready')
})
