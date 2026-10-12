import assert from 'node:assert/strict'
import { test } from 'node:test'
import { plan, type PlannerInput, type TextileEvidence } from './index.ts'

// Root-owned type, supported-kind and caller seams must land before these full-plan assertions pass.
const verified = { status: 'verified' as const }
const wording = 'Wash separately for the first wash only'
const instructions = { source: 'Synthetic sewn label', symbolSystem: 'Synthetic edition', preparation: [], washing: [wording], beforeDrying: [], drying: [], afterDrying: [], ironing: [],
  washingRequirements: [{ wording, checked: true, requirements: [{ kind: 'wash_alone_first_wash' as const }] }],
}
const garment = (id: string): TextileEvidence => ({ id, firstWash: false, colorGroup: 'light', material: 'cotton', bulkUnits: 1,
  care: { washMethod: 'machine', cycle: 'normal', maxTemperatureC: 30, status: 'confirmed' } })
const a = { ...garment('a'), care: { ...garment('a').care, instructions } }
const b = garment('b')
function input(textiles: PlannerInput['textiles'], extra: Partial<PlannerInput> = {}): PlannerInput {
  return { textiles, machines: [{ id: 'washer', capacityUnits: 8, capacityConfidence: 'verified', evidence: verified, supportedCycles: ['normal'], dispensing: { placements: ['detergent_compartment'] } }],
    supplies: [{ id: 'detergent', kind: 'detergent', labelEvidence: verified, formulation: { form: 'liquid' }, applicationRules: [{ id: 'wash', stage: 'wash', placement: 'detergent_compartment', dose: { amount: 10, unit: 'ml' }, evidence: verified }] }], ...extra }
}
const modes: Partial<PlannerInput>[] = [{}, { mode: 'rush' }, { preferences: { colorPolicy: 'allow' }, loadPins: [{ textileId: 'a', group: 1 }, { textileId: 'b', group: 1 }] }]

test('full planner isolates the checked first wash in every mode and releases later washed pieces', () => {
  for (const mode of modes) for (const reverse of [false, true]) for (const firstWash of [true, false]) {
    const pieces = [{ ...a, firstWash }, b]
    const result = plan(input(reverse ? pieces.reverse() : pieces, mode))
    assert.equal(result.status, 'ready')
    assert.equal(result.loads.length, firstWash ? 2 : 1)
    assert.equal(result.loads.reduce((sum, load) => sum + load.textileIds.length, 0), 2)
    const preparation = result.loads.find((load) => load.textileIds.includes('a'))!.labelPreparation ?? []
    assert.equal(preparation.some((entry) => entry.wording === wording), firstWash, 'expired separation must not instruct a later combined load to wash alone')
  }
})

test('full planner excludes unknown history, unchecked/stale interpretations and unsupported conditional restrictions', () => {
  for (const mode of modes) for (const piece of [
    { ...a, firstWash: undefined },
    { ...a, firstWash: undefined, firstWashState: 'unknown' as const },
    { ...a, firstWash: false, firstWashState: 'unwashed' as const },
    { ...a, care: { ...a.care, instructions: { ...instructions, washingRequirements: [{ ...instructions.washingRequirements[0]!, checked: false }] } } },
    { ...a, care: { ...a.care, instructions: { ...instructions, washing: ['A different exact source line'] } } },
    { ...garment('a'), care: { ...garment('a').care, restrictions: ['Wash separately if colors run'] } },
  ]) {
    const result = plan(input([piece, b], mode))
    assert.ok(result.exclusions.some((entry) => entry.textileId === 'a'))
    assert.ok(result.loads.every((load) => !load.textileIds.includes('a')))
    assert.ok(result.reasons.some((entry) => entry.details.cause === 'unmatched_label_requirement'))
  }
})

test('full planner keeps independent unconditional isolation and companion requirements after expiry', () => {
  const alone = plan(input([{ ...a, care: { ...a.care, restrictions: ['Wash alone'] } }, b]))
  assert.equal(alone.status, 'ready')
  assert.equal(alone.loads.length, 2)
  const combinedWording = `${wording}; no spin`
  const constrained = { ...a, care: { ...a.care, instructions: { ...instructions, washing: [combinedWording], washingRequirements: [{ wording: combinedWording, checked: true, requirements: [{ kind: 'wash_alone_first_wash' as const }, { kind: 'no_spin' as const }] }] } } }
  assert.notEqual(plan(input([constrained, b])).status, 'ready', 'other constraints do not expire')
})
