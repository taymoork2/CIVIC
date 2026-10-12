import assert from 'node:assert/strict'
import { test } from 'node:test'
import { careSeparation } from './care.ts'
import { firstWashSeparation, recordedFirstWash, type FirstWashCareEvidence } from './conditional-separation.ts'

const wording = 'Wash separately for the first wash only'
const binding = { wording, checked: true, requirements: [{ kind: 'wash_alone_first_wash' as const }] }
const care: FirstWashCareEvidence = { instructions: {
  source: 'Synthetic sewn label', symbolSystem: 'Exact synthetic edition', preparation: [], washing: [wording], beforeDrying: [], drying: [], afterDrying: [], ironing: [],
  washingRequirements: [binding],
} }

test('checked first-wash separation isolates new pieces and expires only for a known later wash', () => {
  for (const [facts, expected] of [[{ firstWash: true }, 'wash_alone'], [{ firstWash: false }, null], [{ firstWashState: 'unwashed' }, 'wash_alone'], [{ firstWashState: 'washed' }, null]] as const) {
    assert.equal(careSeparation(care, facts), expected)
    assert.deepEqual(firstWashSeparation(care, facts).unresolved, [])
    assert.equal(careSeparation({ ...care, restrictions: [wording] }, facts), expected, 'same exact qualified restriction must not permanently isolate')
    assert.equal(careSeparation({ ...care, restrictions: [{ area: 'washing', instruction: wording }] }, facts), expected)
  }
  assert.equal(care.instructions?.source, 'Synthetic sewn label')
  assert.equal(care.instructions?.washing[0], wording)
})

test('absent, explicitly unknown and conflicting history never supply permission', () => {
  for (const facts of [{}, { firstWashState: 'unknown' }, { firstWash: false, firstWashState: 'unknown' }, { firstWash: true, firstWashState: 'washed' }, { firstWash: false, firstWashState: 'unwashed' }] as const) {
    assert.equal(recordedFirstWash(facts), undefined)
    assert.deepEqual(firstWashSeparation(care, facts).unresolved, [wording])
  }
  assert.equal(recordedFirstWash({ firstWash: false, firstWashState: 'washed' }), false)
})

test('unconditional separation and like-colors constraints survive expiry', () => {
  for (const restrictions of [['Wash alone'], [wording, 'Wash separately'], ['Wash alone; reshape after washing'], [{ area: 'washing', instruction: 'Wash alone' }], [{ area: 'Wash alone', instruction: 'Keep shaded' }]]) {
    assert.equal(careSeparation({ ...care, restrictions }, { firstWash: false }), 'wash_alone')
  }
  assert.deepEqual(firstWashSeparation({ restrictions: ['Wash alone; reshape after washing'] }, { firstWash: false }).unresolved, [])
  assert.equal(careSeparation({ ...care, restrictions: ['Wash with like colors'] }, { firstWash: false }), 'like_colors')
})

test('unchecked, changed-source-line, missing-source and duplicate bindings remain unresolved', () => {
  for (const instructions of [
    { ...care.instructions!, source: ' ' },
    { ...care.instructions!, washing: ['Wash separately for the first two washes'] },
    { ...care.instructions!, washing: [wording, wording] },
    { ...care.instructions!, washingRequirements: [{ ...binding, checked: false }] },
    { ...care.instructions!, washingRequirements: [binding, binding] },
    { ...care.instructions!, washingRequirements: [{ ...binding, requirements: [...binding.requirements, { kind: 'maximum_fill_fraction' as const, value: 2 }] }] },
    { ...care.instructions!, washingRequirements: [{ ...binding, requirements: [...binding.requirements, { kind: 'dry_flat' as const }] }] },
  ]) for (const firstWash of [true, false]) {
    const result = firstWashSeparation({ ...care, instructions }, { firstWash })
    assert.deepEqual(result.unresolved, [wording])
    assert.equal(result.washAlone, false)
  }
})

test('uninterpreted qualified restrictions remain unresolved without guessing their condition', () => {
  for (const instruction of [wording, 'Wash separately if colors run', 'Wash alone until the third wash']) {
    assert.deepEqual(firstWashSeparation({ restrictions: [instruction] }, { firstWash: false }).unresolved, [instruction])
  }
  assert.deepEqual(firstWashSeparation({ ...care, restrictions: [`${wording}.`] }, { firstWash: false }).unresolved, [`${wording}.`], 'near wording is not an exact match')
})

test('expiration does not remove other requirements or mutate the source binding', () => {
  const combined = { ...care, instructions: { ...care.instructions!, washingRequirements: [{ ...binding, requirements: [...binding.requirements, { kind: 'no_bleach' as const }] }] } }
  const before = JSON.stringify(combined)
  assert.equal(firstWashSeparation(combined, { firstWash: false }).washAlone, false)
  assert.deepEqual(firstWashSeparation(combined, { firstWash: false }).unresolved, [])
  assert.equal(JSON.stringify(combined), before)
})
