import assert from 'node:assert/strict'
import { test } from 'node:test'
import { plan, type AdditionalCareInstructions, type MachineEvidence, type PlannerInput, type TextileEvidence } from './index.ts'
import { careProcessRequirements, careRequirementProblem, washProcessProblem, washProcessUnmatched, washProcessWording, type WashProcess } from './care-process.ts'

const wording = 'Wash phase at most 10 minutes; no spin'
const instructions: AdditionalCareInstructions = { source: 'Synthetic sewn label, both sides', preparation: [], washing: [wording], beforeDrying: [], drying: [], afterDrying: [], ironing: [], maximumSoakMinutes: 2,
  washingRequirements: [{ wording, checked: true, requirements: [{ kind: 'maximum_wash_minutes', value: 10 }, { kind: 'no_spin' }] }],
}
const process: WashProcess = { source: 'Synthetic exact model guide, phase table for selected options', programLabel: 'Normal / Short Wash / No Spin', washMinutes: 10, spinRpm: 0 }
const washer: MachineEvidence = { id: 'washer', supportedCycles: ['normal'], capacityUnits: 8, capacityConfidence: 'verified', evidence: { status: 'verified' }, cycleMinutes: { normal: 40 }, dispensing: { placements: ['detergent_compartment'] }, washProcesses: { normal: process } }
const garment: TextileEvidence = { id: 'a', colorGroup: 'light', material: 'cotton', firstWash: false, care: { washMethod: 'machine', cycle: 'normal', maxTemperatureC: 30, status: 'confirmed', instructions } }
const input: PlannerInput = { textiles: [garment], machines: [washer], supplies: [{ id: 'detergent', kind: 'detergent', labelEvidence: { status: 'verified' }, formulation: { form: 'liquid' }, applicationRules: [{ id: 'wash', stage: 'wash', placement: 'detergent_compartment', dose: { amount: 10, unit: 'ml' }, evidence: { status: 'verified' } }] }] }

test('only documented washing-phase minutes match the exact maximum in every planning mode', () => {
  for (const pass of [{}, { mode: 'rush' as const }, { loadPins: [{ textileId: 'a', group: 1 }], preferences: { colorPolicy: 'allow' as const } }]) {
    for (const washMinutes of [undefined, 0, -1, 301, 10.01, 10, 9.5]) {
      const machine = { ...washer, cycleMinutes: { normal: 1 }, washProcesses: { normal: { ...process, washMinutes, spinMinutes: 1, rinseTemperatureC: 10 } } }
      const result = plan({ ...input, ...pass, machines: [machine] })
      assert.equal(result.status === 'ready', washMinutes === 10 || washMinutes === 9.5)
    }
    for (const washMinutes of [Number.NaN, Infinity]) assert.throws(() => plan({ ...input, ...pass, machines: [{ ...washer, washProcesses: { normal: { ...process, washMinutes } } }] }), /non-finite/)
    const result = plan({ ...input, ...pass })
    assert.equal(result.status, 'ready', 'a 40-minute cycle may have a documented 10-minute washing phase')
    assert.ok(result.loads[0]!.labelPreparation!.some((entry) => entry.wording.includes('documented washing phase 10 min') && entry.wording.includes(process.source) && entry.wording.includes('physical washing-phase time is not measured')))
    assert.equal(plan({ ...input, ...pass, machines: [{ ...washer, washProcesses: { normal: { ...process, spinRpm: 400 } } }] }).loads.length, 0, 'duration never relaxes another condition')
  }
  assert.equal(washProcessUnmatched(instructions, { ...washer, washProcesses: undefined }, 'normal').includes('maximum_wash_minutes'), true)
})

test('missing, unchecked, stale and conflicting interpretations stay unresolved with whole lines intact', () => {
  for (const words of [
    { ...instructions, source: '' }, { ...instructions, washingRequirements: undefined },
    { ...instructions, washing: ['Changed source line'] },
    { ...instructions, washingRequirements: [{ ...instructions.washingRequirements![0]!, checked: false }] },
    { ...instructions, washingRequirements: [...instructions.washingRequirements!, ...instructions.washingRequirements!] },
    { ...instructions, washingRequirements: [{ ...instructions.washingRequirements![0]!, requirements: [{ kind: 'maximum_wash_minutes' as const, value: 10 }, { kind: 'maximum_wash_minutes' as const, value: 30 }] }] },
  ]) {
    assert.ok(careProcessRequirements(words, 'washing').unresolved.length > 0)
    assert.equal(plan({ ...input, textiles: [{ ...garment, care: { ...garment.care, instructions: words } }] }).loads.length, 0)
  }
  for (const value of [0, -1, 300.01, Number.NaN, Infinity]) assert.ok(careRequirementProblem({ kind: 'maximum_wash_minutes', value }))
  for (const value of [0.5, 10, 300]) assert.equal(careRequirementProblem({ kind: 'maximum_wash_minutes', value }), null)
  assert.equal(careProcessRequirements({ ...instructions, drying: [wording], dryingRequirements: instructions.washingRequirements }, 'drying').unresolved[0], wording)
})

test('phase evidence stays with its final machine/program and stale sources cannot qualify', () => {
  for (const bad of [{ ...process, source: '' }, { ...process, programLabel: '' }, { ...process, washMinutes: 0 }, { ...process, washMinutes: 301 }]) assert.ok(washProcessProblem(bad))
  assert.equal(washProcessProblem({ ...process, washMinutes: undefined }), null, 'unknown is a valid record, never a satisfied limit')
  assert.equal(washProcessUnmatched(instructions, washer, 'delicate').includes('maximum_wash_minutes'), true)
  const wrong = { ...washer, id: 'a-wrong', washProcesses: { normal: { ...process, washMinutes: 20 } } }
  const right = { ...washer, id: 'b-right' }
  for (const machines of [[wrong, right], [right, wrong]]) {
    const result = plan({ ...input, machines })
    assert.equal(result.status, 'ready')
    assert.equal(result.loads[0]!.machineId, 'b-right')
  }
  assert.notEqual(washProcessWording(process), washProcessWording({ ...process, washMinutes: 9 }))
})

test('first-wash separation expires independently and keeps the phase limit and soak ceiling', () => {
  const line = 'Wash alone for the first wash; wash phase at most 10 minutes; no spin'
  const combined = { ...instructions, washing: [line], washingRequirements: [{ wording: line, checked: true, requirements: [{ kind: 'wash_alone_first_wash' as const }, ...instructions.washingRequirements![0]!.requirements] }] }
  const sibling = { ...garment, id: 'b', care: { ...garment.care, instructions: undefined } }
  for (const firstWash of [true, false]) {
    const result = plan({ ...input, textiles: [{ ...garment, firstWash, care: { ...garment.care, instructions: combined } }, sibling] })
    assert.equal(result.status, 'ready')
    assert.equal(result.loads.length, firstWash ? 2 : 1)
    assert.equal(plan({ ...input, textiles: [{ ...garment, firstWash, care: { ...garment.care, instructions: combined } }], machines: [{ ...washer, washProcesses: { normal: { ...process, washMinutes: undefined } } }] }).loads.length, 0)
    assert.equal(combined.maximumSoakMinutes, 2)
  }
})

test('unconditional grouping instructions use separate checked washing-only kinds', () => {
  for (const kind of ['wash_alone', 'wash_with_like_colors'] as const) {
    const words = { ...instructions, washingRequirements: [{ wording, checked: true, requirements: [{ kind }, { kind: 'maximum_wash_minutes' as const, value: 10 }] }] }
    assert.deepEqual(careProcessRequirements(words, 'washing').requirements, words.washingRequirements[0]!.requirements)
    assert.deepEqual(careProcessRequirements({ ...words, washingRequirements: [{ ...words.washingRequirements[0]!, checked: false }] }, 'washing').unresolved, [wording])
    assert.deepEqual(careProcessRequirements({ ...words, drying: [wording], dryingRequirements: words.washingRequirements }, 'drying').unresolved, [wording])
  }
})
