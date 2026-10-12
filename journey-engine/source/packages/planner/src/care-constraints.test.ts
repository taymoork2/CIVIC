import assert from 'node:assert/strict'
import { test } from 'node:test'
import { materialCareProblem, plan, type CareEvidence, type PlannerInput, type SupplyItem, type TextileEvidence } from './index.ts'
import { careProcessRequirements, careProductAllowed, dryingProcessUnmatched, type CareProcessRequirement, type AdditionalCareInstructions } from './index.ts'
import { tumbleCeiling } from './drying.ts'

const verified = { status: 'verified' as const }
const detergent: SupplyItem = { id: 'detergent', kind: 'detergent', labelEvidence: verified,
  formulation: { form: 'liquid' }, applicationRules: [{ id: 'wash', stage: 'wash', placement: 'detergent_compartment',
    dose: { amount: 10, unit: 'ml' }, evidence: verified }] }
const washer = { id: 'washer', highEfficiency: true, capacityUnits: 8, capacityConfidence: 'verified' as const,
  evidence: verified, supportedCycles: ['normal'], dispensing: { placements: ['detergent_compartment'] } }
function garment(id: string, color: TextileEvidence['colorGroup'], restrictions: CareEvidence['restrictions'] = []): TextileEvidence {
  return { id, colorGroup: color, firstWash: false, material: 'cotton', bulkUnits: 1,
    care: { washMethod: 'machine', cycle: 'normal', maxTemperatureC: 30, status: 'confirmed', restrictions } }
}
function input(textiles: readonly TextileEvidence[], extra: Partial<PlannerInput> = {}): PlannerInput {
  return { textiles, machines: [washer], supplies: [detergent], ...extra }
}
const modes: Partial<PlannerInput>[] = [{}, { mode: 'rush' },
  { preferences: { colorPolicy: 'allow' }, loadPins: [{ textileId: 'a', group: 1 }, { textileId: 'b', group: 1 }] }]

test('100, 500 and 1,000 mixed pieces keep their safety boundaries in every planning mode', () => {
  for (const size of [100, 500, 1_000]) for (const options of modes) {
    const textiles = Array.from({ length: size }, (_, i): TextileEvidence => {
      const base = garment(`piece-${i}`, i % 2 ? 'white' : 'black')
      switch (i % 8) {
        case 0: return { ...base, care: null }
        case 1: return { ...base, care: { ...base.care!, washMethod: 'dry_clean_only' } }
        case 2: return { ...base, material: 'wool', care: { ...base.care!, cycle: 'normal', maxTemperatureC: 60 } }
        case 3: return { ...base, care: { ...base.care!, maxTemperatureC: 20, bleach: 'none', dryMethod: 'line_dry' } }
        case 4: return { ...base, care: { ...base.care!, cycle: 'delicate', dryMethod: 'tumble_dry', dryHeat: 'low' } }
        default: return { ...base, care: { ...base.care!, bleach: 'none', dryMethod: 'dry_flat' } }
      }
    })
    const result = plan(input(textiles, { ...options, machines: [{ ...washer, supportedCycles: ['normal', 'delicate'] }] }))
    const byId = new Map(textiles.map(piece => [piece.id, piece]))
    const planned = result.loads.flatMap(load => load.textileIds)
    assert.equal(new Set(planned).size, planned.length, 'a piece is assigned only once')
    assert.deepEqual(new Set(planned), new Set(textiles.filter((_, i) => i % 8 >= 3).map(piece => piece.id)), 'unknown, dry-clean-only and conflicting wool care stay excluded')
    for (const load of result.loads) {
      assert.ok(load.bulkUnits <= load.capacityUnits)
      for (const id of load.textileIds) {
        const care = byId.get(id)!.care!
        assert.ok(load.temperatureC <= care.maxTemperatureC!)
        if (care.cycle === 'delicate') assert.equal(load.cycle, 'delicate')
        assert.ok(load.treatments.every(step => step.supplyId === detergent.id))
      }
    }
    const oxygenDetergent = plan(input(textiles, { ...options, supplies: [{ ...detergent, bleachKind: 'oxygen' }], machines: [{ ...washer, supportedCycles: ['normal', 'delicate'] }] }))
    for (const load of oxygenDetergent.loads) {
      if (load.textileIds.some(id => byId.get(id)!.care!.bleach === 'none')) assert.ok(load.treatments.every(step => step.supplyId !== detergent.id), 'bleach within detergent cannot bypass the item label')
    }
  }
})

const instructions = { source: 'Synthetic sewn label', preparation: [], washing: [], beforeDrying: [], drying: [], afterDrying: [], ironing: [] }

test('material conflicts block old confirmed labels in planning and drying, including small wool blends', () => {
  for (const material of ['wool', '95% cotton, 5% Cashmere', 'wool, custom fiber']) {
    const safe = { washMethod: 'machine', cycle: 'delicate', maxTemperatureC: 40, bleach: 'none', dryMethod: 'tumble_dry', dryHeat: 'low', ironHeat: 'medium', status: 'confirmed', restrictions: [] }
    assert.equal(materialCareProblem(material, safe), null)
    assert.deepEqual(tumbleCeiling({ id: 'wool', bulkUnits: 1, material, care: safe }), { maxHeat: 'low' })
    for (const conflict of [{ maxTemperatureC: 50 }, { cycle: 'normal' }, { bleach: 'non_chlorine' }, { dryHeat: 'medium' }, { dryHeat: undefined }, { ironHeat: 'high' }]) {
      const care = { ...safe, ...conflict }
      assert.ok(materialCareProblem(material, care))
      for (const options of modes) {
        const result = plan(input([{ ...garment('wool', 'white'), material, care }], options))
        assert.equal(result.loads.length, 0)
        assert.ok(result.reasons.some((reason) => reason.code === 'needs_confirmation'))
      }
      assert.deepEqual(tumbleCeiling({ id: 'wool', bulkUnits: 1, material, care }), { method: 'unknown', reason: 'drying_unknown' })
    }
  }
  assert.equal(materialCareProblem('cotton', { dryMethod: 'tumble_dry', dryHeat: 'high', maxTemperatureC: 60 }), null)
  assert.ok(materialCareProblem('silk', { bleach: 'any' }))
  assert.equal(materialCareProblem('wool', null), null)
  assert.deepEqual(tumbleCeiling({ id: 'unknown', bulkUnits: 1, material: 'wool', care: null }), { method: 'unknown', reason: 'drying_unknown' })
})

function matched(requirements: readonly CareProcessRequirement[], stage: 'washing' | 'drying' = 'washing'): AdditionalCareInstructions {
  return { ...instructions, [stage]: ['Synthetic exact process wording'], [stage === 'washing' ? 'washingRequirements' : 'dryingRequirements']: [{ wording: 'Synthetic exact process wording', checked: true, requirements }] }
}
const checkedProcess = { source: 'Synthetic manual and checked option combination', programLabel: 'Normal / Extra Rinse / No Spin', extraRinses: 2, rinseTemperatureC: 20, spinRpm: 0, spinMinutes: 0, maximumFillFraction: 0.75 }

test('checked whole-line grouping requirements protect each planning mode without expiring', () => {
  for (const options of modes) for (const kind of ['wash_alone', 'wash_with_like_colors'] as const) {
    const words = matched([{ kind }, { kind: 'no_spin' }])
    const a = { ...garment('a', 'saturated'), color: 'Red', care: { ...garment('a', 'saturated').care!, instructions: words } }
    const b = { ...garment('b', 'saturated'), color: 'Blue' }
    const machines = [{ ...washer, washProcesses: { normal: checkedProcess } }]
    for (const firstWash of [true, false]) {
      const result = plan(input([{ ...a, firstWash }, b], { ...options, machines }))
      assert.equal(result.status, 'ready')
      assert.equal(result.loads.length, 2)
      assert.ok(result.reasons.some((reason) => reason.details.instruction === (kind === 'wash_alone' ? kind : 'like_colors')))
    }
    assert.equal(plan(input([a, { ...b, color: ' red ' }], { ...options, machines })).loads.length, kind === 'wash_alone' ? 2 : 1)
    assert.equal(plan(input([a, { ...b, color: undefined }], { ...options, machines })).loads.length, 2)
    assert.equal(plan(input([a], { ...options, machines: [{ ...washer, washProcesses: { normal: { ...checkedProcess, spinRpm: 400 } } }] })).loads.length, 0, 'grouping cannot waive companion conditions')
    for (const unresolved of [
      { ...words, source: '' }, { ...words, washing: ['Changed source line'] },
      { ...words, washingRequirements: [{ ...words.washingRequirements![0]!, checked: false }] },
      { ...words, washingRequirements: [...words.washingRequirements!, ...words.washingRequirements!] },
    ]) assert.ok(plan(input([{ ...a, care: { ...a.care, instructions: unresolved } }, b], { ...options, machines })).loads.every((load) => !load.textileIds.includes('a')))
    const both = matched([{ kind: 'wash_alone' }, { kind: 'wash_with_like_colors' }])
    assert.equal(plan(input([{ ...a, care: { ...a.care, instructions: both } }, { ...b, color: 'Red' }], { ...options, machines })).loads.length, 2, 'unconditional wash alone takes priority')
  }
})

test('mechanical severity requires checked final-program evidence, independent of cycle names and numeric limits', () => {
  for (const options of modes) for (const maximum of ['normal', 'mild', 'very_mild'] as const) {
    const a = { ...garment('a', 'light'), care: { ...garment('a', 'light').care, instructions: matched([{ kind: 'maximum_mechanical_severity', value: maximum }, { kind: 'maximum_spin_rpm', value: 400 }]) } }
    for (const actual of [undefined, 'normal', 'mild', 'very_mild'] as const) {
      const result = plan(input([a], { ...options, machines: [{ ...washer, washProcesses: { normal: { ...checkedProcess, programLabel: 'Very gentle', mechanicalSeverity: actual } } }] }))
      assert.equal(result.status === 'ready', actual !== undefined && ['normal', 'mild', 'very_mild'].indexOf(actual) >= ['normal', 'mild', 'very_mild'].indexOf(maximum))
    }
    assert.notEqual(plan(input([a], { ...options, machines: [{ ...washer, washProcesses: { normal: { ...checkedProcess, mechanicalSeverity: 'very_mild', spinRpm: 401 } } }] })).status, 'ready', 'severity never relaxes exact spin limits')
  }
  const a = { ...garment('a', 'light'), care: { ...garment('a', 'light').care, instructions: matched([{ kind: 'maximum_mechanical_severity', value: 'very_mild' }]) } }
  const result = plan(input([a], { machines: [{ ...washer, washProcesses: { normal: { ...checkedProcess, mechanicalSeverity: 'very_mild' } } }] }))
  assert.ok(result.loads[0]!.labelPreparation!.some((entry) => entry.wording.includes('very mild mechanical process')))
  assert.equal(plan(input([{ ...a, care: { ...a.care, instructions: { ...a.care.instructions, washingRequirements: undefined } } }])).loads.length, 0)
})

test('positive detergent characteristics require recorded contents and cannot be relaxed by profiles or routines', () => {
  const required = matched([{ kind: 'detergent_fragrance_free' }, { kind: 'detergent_dye_free' }, { kind: 'detergent_bleach_free' }])
  const a = { ...garment('a', 'light'), care: { ...garment('a', 'light').care, instructions: required }, requirements: { acceptedSupplyIds: ['detergent'] },
    personalRoutine: { revision: 1, valid: true, missingLabelAccepted: false, wash: { method: 'machine' as const, cycle: 'normal', maximumTemperatureC: 30 } } }
  const compliant = { ...detergent, fragrance: 'free' as const, dye: 'free' as const, bleachKind: 'none' as const }
  for (const options of modes) {
    assert.equal(plan(input([a], { ...options, supplies: [compliant] })).status, 'ready')
    for (const product of [{ ...compliant, fragrance: undefined }, { ...compliant, fragrance: 'scented' as const }, { ...compliant, dye: undefined }, { ...compliant, dye: 'dyed' as const }, { ...compliant, bleachKind: undefined }, { ...compliant, bleachKind: 'oxygen' as const }, { ...compliant, chemistry: 'oxygen_bleach' as const }]) {
      const result = plan(input([a], { ...options, supplies: [product] }))
      assert.notEqual(result.status, 'ready')
    }
    assert.notEqual(plan(input([a, garment('b', 'light')], { ...options, supplies: [{ ...compliant, dye: 'dyed' }] })).status, 'ready')
    assert.equal(careProductAllowed(required, { ...detergent, id: 'rinse', kind: 'chemical_consumable', use: 'softener', bleachKind: 'none' }), true, 'a detergent-only requirement does not become a blanket additive prohibition')
  }
  const choice = plan(input([a], { supplies: [{ ...detergent, id: 'a-scented', fragrance: 'scented', dye: 'free', bleachKind: 'none' }, { ...compliant, id: 'b-checked' }] }))
  assert.equal(choice.status, 'ready')
  assert.ok(choice.loads[0]!.treatments.some((entry) => entry.supplyId === 'b-checked'))
})

test('reviewed numeric reduced fill packs every load to the intersection, including rush and pins', () => {
  for (const options of modes) {
    const a = { ...garment('a', 'light'), bulkUnits: 3, care: { ...garment('a', 'light').care, instructions: matched([{ kind: 'maximum_fill_fraction', value: 0.5 }]) } }
    const b = { ...garment('b', 'light'), bulkUnits: 2 }
    for (const textiles of [[a, b], [b, a]]) {
      const result = plan(input(textiles, { ...options, machines: [{ ...washer, washProcesses: { normal: checkedProcess } }] }))
      assert.equal(result.status, 'ready')
      assert.equal(result.loads.length, 2)
      assert.equal(result.loads.find((load) => load.textileIds.includes('a'))!.capacityUnits, 4)
      assert.ok(result.loads.every((load) => load.bulkUnits <= load.capacityUnits))
      assert.ok(result.loads[0]!.labelPreparation!.some((entry) => entry.wording.includes(checkedProcess.programLabel)))
    }
  }
})

test('vague, conditional, unchecked and stale fill wording never becomes supported from text', () => {
  const recorded = matched([{ kind: 'maximum_fill_fraction', value: 0.5 }])
  const variants: AdditionalCareInstructions[] = [
    { ...recorded, washingRequirements: undefined },
    { ...recorded, washing: ['Small load unless otherwise instructed'] },
    { ...recorded, washingRequirements: recorded.washingRequirements!.map((entry) => ({ ...entry, checked: false })) },
    matched([{ kind: 'maximum_fill_fraction', value: 0 }]),
  ]
  for (const words of variants) for (const options of modes) {
    const result = plan(input([{ ...garment('a', 'light'), care: { ...garment('a', 'light').care, instructions: words } }], { ...options, machines: [{ ...washer, washProcesses: { normal: checkedProcess } }] }))
    assert.equal(result.loads.length, 0)
    assert.ok(result.reasons.some((reason) => reason.details.cause === 'unmatched_label_requirement'))
  }
  for (const capacityConfidence of ['unknown', 'estimated'] as const) {
    assert.equal(plan(input([{ ...garment('a', 'light'), care: { ...garment('a', 'light').care, instructions: recorded } }], { machines: [{ ...washer, capacityConfidence, washProcesses: { normal: checkedProcess } }] })).loads.length, 0)
  }
})

test('rinse and every extraction limit require exact checked settings for the final cycle', () => {
  const requirements: CareProcessRequirement[] = [{ kind: 'extra_rinses', value: 2 }, { kind: 'maximum_rinse_temperature', value: 20 }, { kind: 'no_spin' }, { kind: 'maximum_spin_rpm', value: 0 }, { kind: 'maximum_spin_minutes', value: 0 }]
  const a = { ...garment('a', 'light'), care: { ...garment('a', 'light').care, instructions: matched(requirements) } }
  for (const options of modes) {
    assert.equal(plan(input([a], { ...options, machines: [{ ...washer, washProcesses: { normal: checkedProcess } }] })).status, 'ready')
    for (const process of [undefined, { ...checkedProcess, source: '' }, { ...checkedProcess, extraRinses: 1 }, { ...checkedProcess, rinseTemperatureC: 30 }, { ...checkedProcess, spinRpm: 100 }, { ...checkedProcess, spinMinutes: 1 }]) {
      const result = plan(input([a], { ...options, machines: [{ ...washer, ...(process === undefined ? {} : { washProcesses: { normal: process } }) }] }))
      assert.equal(result.loads.length, 0)
    }
  }
  const delicate = { ...garment('b', 'light'), care: { ...garment('b', 'light').care, cycle: 'delicate' } }
  const result = plan(input([a, delicate], { mode: 'rush', machines: [{ ...washer, supportedCycles: ['normal', 'delicate'], washProcesses: { normal: checkedProcess } }] }))
  assert.notEqual(result.status, 'ready', 'rush cannot apply normal-program facts to delicate')
})

test('remaining numeric extraction ceilings accept less extraction but never infer missing settings', () => {
  const a = { ...garment('a', 'light'), care: { ...garment('a', 'light').care, instructions: matched([{ kind: 'maximum_spin_rpm', value: 400 }, { kind: 'maximum_spin_minutes', value: 2 }]) } }
  for (const [rpm, minutes, expected] of [[0, 0, 'ready'], [400, 2, 'ready'], [401, 2, 'needs_confirmation'], [400, 3, 'needs_confirmation'], [undefined, 2, 'needs_confirmation']] as const) {
    const result = plan(input([a], { machines: [{ ...washer, washProcesses: { normal: { ...checkedProcess, spinRpm: rpm, spinMinutes: minutes } } }] }))
    assert.equal(result.status, expected)
  }
})

test('program limits are rechecked after product-driven machine substitution', () => {
  const later: SupplyItem = { ...detergent, id: 'later', kind: 'chemical_consumable', bleachKind: 'none', applicationRules: [{ ...detergent.applicationRules![0]!, placement: 'bleach_compartment' }] }
  const a = { ...garment('a', 'light'), care: { ...garment('a', 'light').care, instructions: matched([{ kind: 'no_spin' }]) } }
  const machines = [{ ...washer, id: 'a', washProcesses: { normal: checkedProcess } }, { ...washer, id: 'b', washProcesses: { normal: { ...checkedProcess, spinRpm: 800 } }, dispensing: { placements: ['detergent_compartment', 'bleach_compartment'] } }]
  const result = plan(input([a], { machines, supplies: [detergent, later], optionalSupplyIds: ['later'] }))
  assert.equal(result.loads[0]!.machineId, 'b')
  assert.equal(result.status, 'needs_confirmation')
  assert.ok(result.reasons.some((reason) => reason.details.cause === 'unmatched_label_requirement'))
})

test('checked machine configurations do not collapse into a same-kind sibling shortcut', () => {
  const machines = [{ ...washer, id: 'a', location: 'shared', washProcesses: { normal: checkedProcess } }, { ...washer, id: 'b', location: 'shared', washProcesses: { normal: { ...checkedProcess, spinRpm: 800 } } }]
  const result = plan(input([{ ...garment('a', 'light'), care: { ...garment('a', 'light').care, instructions: matched([{ kind: 'no_spin' }]) } }], { machines }))
  assert.deepEqual(result.loads[0]!.roomMachineIds, ['a'])
  assert.equal(result.loads[0]!.alternates![0]!.status, 'blocked')
})

test('garment product prohibitions leave optional products out and reject a prohibited detergent', () => {
  const softener: SupplyItem = { ...detergent, id: 'softener', use: 'softener', kind: 'chemical_consumable', bleachKind: 'none' }
  const bleach: SupplyItem = { ...detergent, id: 'bleach', kind: 'bleach', bleachKind: 'oxygen' }
  for (const options of modes) {
    const a = { ...garment('a', 'light'), care: { ...garment('a', 'light').care, bleach: 'any' as const, instructions: matched([{ kind: 'no_softener' }, { kind: 'no_bleach' }]) } }
    const result = plan(input([a], { ...options, supplies: [detergent, softener, bleach], optionalSupplyIds: ['softener', 'bleach'] }))
    assert.equal(result.status, 'ready')
    assert.deepEqual(result.loads[0]!.treatments.map((step) => step.supplyId), ['detergent'])
    const prohibited = plan(input([a], { ...options, supplies: [{ ...detergent, bleachKind: 'oxygen' }] }))
    assert.equal(prohibited.status, 'needs_confirmation')
  }
})

test('natural drying matches method and checked place/process separately; conflicts stay unresolved', () => {
  const words = matched([{ kind: 'dry_flat' }, { kind: 'drip_dry' }, { kind: 'shade' }, { kind: 'no_direct_heat' }], 'drying')
  assert.deepEqual(dryingProcessUnmatched(words, 'flat', { shade: true, noDirectHeat: true, drip: true }), [])
  for (const method of ['tumble', 'rack_line', 'heated_hanging']) assert.ok(dryingProcessUnmatched(words, method, { shade: true, noDirectHeat: true, drip: true }).length > 0)
  assert.equal(dryingProcessUnmatched(words, 'flat').length, 3)
  const conflict = matched([{ kind: 'dry_flat' }, { kind: 'line_dry' }], 'drying')
  assert.ok(dryingProcessUnmatched(conflict, 'flat').length > 0)
  assert.ok(dryingProcessUnmatched(conflict, 'rack_line').length > 0)
  assert.equal(careProcessRequirements({ ...words, dryingRequirements: undefined }, 'drying').unresolved.length, 1)
  const a = { ...garment('a', 'light'), care: { ...garment('a', 'light').care, instructions: words } }
  assert.equal(plan(input([a])).loads.length, 0, 'drip drying constrains extraction in the wash')
  assert.equal(plan(input([a], { machines: [{ ...washer, washProcesses: { normal: checkedProcess } }] })).status, 'ready')
  assert.deepEqual(tumbleCeiling({ id: 'flat-in-shade', bulkUnits: 1, material: 'cotton', care: { ...garment('a', 'light').care, dryMethod: 'dry_flat', instructions: matched([{ kind: 'shade' }], 'drying') } }), { method: 'dry_flat', reason: 'care_label' }, 'a place condition preserves the recorded flat method')
})

test('reviewed wash departures affect only selected clothing settings and preserve all other constraints', () => {
  const a = garment('a', 'light')
  const label = { ...a.care!, washMethod: 'hand_wash' as const, maxTemperatureC: 20, restrictions: ['Wash alone', 'Do not soak'] }
  const routine = { revision: 1, valid: true, missingLabelAccepted: false, wash: { method: 'machine' as const, cycle: 'normal', maximumTemperatureC: 60 } }
  for (const options of modes) {
    const result = plan(input([{ ...a, care: label, personalRoutine: routine }, garment('b', 'light')], options))
    assert.ok(result.loads.some((load) => load.textileIds.includes('a')))
    assert.ok(result.loads.every((load) => !load.textileIds.includes('a') || !load.textileIds.includes('b')), 'wash-alone care still protects other clothes')
    assert.equal(result.loads.find((load) => load.textileIds.includes('a'))!.temperatureC, options.mode === 'rush' ? 30 : 60)
    assert.equal(label.washMethod, 'hand_wash')
    const unsupported = plan(input([{ ...a, care: { ...label, instructions: { ...instructions, washing: ['No spin'] } }, personalRoutine: routine }], options))
    assert.ok(!unsupported.loads.some((load) => load.textileIds.includes('a')))
  }
  const lower = plan(input([{ ...a, personalRoutine: routine }, { ...garment('b', 'light'), care: { ...a.care!, maxTemperatureC: 20 } }]))
  assert.equal(lower.loads[0]!.temperatureC, 20, 'a routine never raises another piece’s water limit')
  const stale = plan(input([{ ...a, personalRoutine: { ...routine, valid: false } }]))
  assert.ok(stale.reasons.some((reason) => reason.details.cause === 'routine_review_required'))
  const unavailable = plan(input([{ ...a, personalRoutine: { ...routine, wash: { ...routine.wash, cycle: 'delicate' } } }]))
  assert.notEqual(unavailable.status, 'ready', 'unsupported machine cycles remain blocked')
  const productLimit = { ...detergent, applicationRules: [{ ...detergent.applicationRules![0]!, maximumTemperatureC: 40 }] }
  const blockedProduct = plan(input([{ ...a, personalRoutine: routine }], { supplies: [productLimit] }))
  assert.notEqual(blockedProduct.status, 'ready', 'routine acceptance never changes product temperature directions')
  const unknown = { ...a, care: { status: 'needs_confirmation' as const, washMethod: 'unknown' as const }, personalRoutine: routine }
  assert.ok(!plan(input([unknown])).loads.some((load) => load.textileIds.includes('a')))
  assert.ok(plan(input([{ ...unknown, personalRoutine: { ...routine, missingLabelAccepted: true } }])).loads.some((load) => load.textileIds.includes('a')))
  assert.equal(unknown.care.status, 'needs_confirmation', 'explicit unknown-care handling is never label verification')
})

test('unmatched required settings cannot be hidden by rush, pins or checked-unknown care', () => {
  for (const options of modes) {
    for (const requirement of ['Small load only', 'No spin; do not wring', 'Extra cool rinse']) {
      const a = garment('a', 'light')
      const care = { ...a.care!, instructions: { ...instructions, washing: [requirement] } }
      for (const washMethod of ['machine', 'unknown'] as const) {
        const result = plan(input([{ ...a, care: { ...care, washMethod, evidence: verified } }, garment('b', 'light')], options))
        assert.ok(!result.loads.some((load) => load.textileIds.includes('a')))
        assert.ok(result.reasons.some((reason) => reason.details.cause === 'unmatched_label_requirement'))
        assert.ok(result.warnings.some((wording) => wording.includes(requirement)))
      }
    }
  }
})

test('required preparation groups identical wording without applying it to other garments', () => {
  const a = garment('a', 'light')
  const b = garment('b', 'light')
  const care = { ...a.care!, instructions: { ...instructions, preparation: ['Turn inside out', 'Close the zip on the removable liner'] } }
  const result = plan(input([{ ...a, care }, { ...b, care }, garment('c', 'light')]))
  assert.equal(result.status, 'ready')
  assert.deepEqual(result.loads[0]!.labelPreparation, [
    { wording: 'Close the zip on the removable liner', textileIds: ['a', 'b'] },
    { wording: 'Turn inside out', textileIds: ['a', 'b'] },
  ])
})

test('sanitizing requires exact rinse directions and actual program contact time in both planning modes', () => {
  const sanitizing = { route: 'rinse' as const, minimumContactMinutes: 16, formulation: 'Synthetic exact pack', source: 'Synthetic pack label' }
  const sanitizer: SupplyItem = { ...detergent, id: 'sanitizer', kind: 'sanitizer', sanitizing,
    applicationRules: [{ ...detergent.applicationRules![0]!, id: 'rinse', stage: 'rinse', placement: 'softener_compartment', timing: 'before starting' }] }
  const machine = { ...washer, supportedCycles: ['normal', 'delicate'], dispensing: { placements: ['detergent_compartment', 'softener_compartment'] } }
  for (const mode of ['normal', 'rush'] as const) {
    for (const [minimum, contact, expected] of [[undefined, 16, 'needs_confirmation'], [sanitizing, undefined, 'needs_confirmation'], [sanitizing, 15, 'needs_confirmation'], [sanitizing, 16, 'ready'], [sanitizing, 20, 'ready']] as const) {
      const result = plan(input([garment('a', 'light')], { mode, optionalSupplyIds: [sanitizer.id], supplies: [detergent, { ...sanitizer, sanitizing: minimum }],
        machines: [{ ...machine, ...(contact === undefined ? {} : { rinseContact: { normal: { minutes: contact, placement: 'softener_compartment', source: 'Synthetic release-to-drain observation' } } }) }] }))
      assert.equal(result.status, expected)
      assert.equal(result.loads[0]!.treatments.find((step) => step.supplyId === sanitizer.id)?.confirmation, expected === 'ready' ? 'confirmed' : 'needs_confirmation')
    }
    const noExactPack = plan(input([garment('a', 'light')], { mode, optionalSupplyIds: [sanitizer.id], supplies: [detergent, { ...sanitizer, sanitizing: { ...sanitizing, formulation: '' } }], machines: [{ ...machine, rinseContact: { normal: { minutes: 16, placement: 'softener_compartment', source: 'Synthetic observation' } } }] }))
    assert.equal(noExactPack.status, 'needs_confirmation')
    const anotherCycle = plan(input([{ ...garment('a', 'light'), care: { ...garment('a', 'light').care!, cycle: 'delicate' } }], { mode, optionalSupplyIds: [sanitizer.id], supplies: [detergent, sanitizer], machines: [{ ...machine, rinseContact: { normal: { minutes: 16, placement: 'softener_compartment', source: 'Synthetic observation' } } }] }))
    assert.equal(anotherCycle.status, 'needs_confirmation')
    const leaveOut = plan(input([garment('a', 'light')], { mode, optionalSupplyIds: [sanitizer.id], supplies: [detergent, sanitizer], machines: [machine], excludedSupplyIds: ['sanitizer'] }))
    assert.equal(leaveOut.status, 'ready')
    assert.ok(!leaveOut.loads[0]!.treatments.some((step) => step.supplyId === sanitizer.id))
  }
})

test('recorded like-color care cannot be bypassed by previous washes, rush or load pins', () => {
  for (const options of modes) {
    for (const restrictions of [['Wash with like colors'], ['With like colors'], ['Machine wash cold with like colors'], [{ area: 'washing', instruction: 'Wash with similar colours' }]]) {
      const result = plan(input([garment('a', 'light', restrictions), garment('b', 'black')], options))
      assert.equal(result.status, 'ready')
      assert.equal(result.loads.length, 2)
      assert.ok(result.reasons.some((reason) => reason.details.instruction === 'like_colors'))
      assert.ok(result.warnings.some((text) => /care label.*like colors/.test(text)), 'separation explains the recorded instruction rather than an unrelated cycle conflict')
    }
  }
  assert.equal(plan(input([{ ...garment('a', 'black', ['Wash with like colors']), color: 'Black' }, { ...garment('b', 'black'), color: 'Black' }])).loads.length, 1)
  assert.equal(plan(input([garment('a', 'light'), garment('b', 'black')])).loads.length, 1, 'ordinary previously washed colors keep the existing soft policy')
})

test('a later product cannot substitute a washer with insufficient sanitizer contact', () => {
  const sanitizer: SupplyItem = { ...detergent, id: 'a-sanitizer', kind: 'sanitizer',
    sanitizing: { route: 'rinse', minimumContactMinutes: 16, formulation: 'Synthetic pack', source: 'Synthetic label' },
    applicationRules: [{ ...detergent.applicationRules![0]!, id: 'rinse', stage: 'rinse', placement: 'softener_compartment' }] }
  const later: SupplyItem = { ...detergent, id: 'z-later-product', kind: 'chemical_consumable', bleachKind: 'none',
    applicationRules: [{ ...detergent.applicationRules![0]!, placement: 'bleach_compartment' }] }
  const placements = ['detergent_compartment', 'softener_compartment']
  const machines = [
    { ...washer, id: 'a-initial', dispensing: { placements }, rinseContact: { normal: { minutes: 16, placement: 'softener_compartment', source: 'Synthetic observation' } } },
    { ...washer, id: 'b-substitute', dispensing: { placements: [...placements, 'bleach_compartment'] }, rinseContact: { normal: { minutes: 5, placement: 'softener_compartment', source: 'Synthetic observation' } } },
  ]
  for (const mode of ['normal', 'rush'] as const) {
    const result = plan(input([garment('a', 'light')], { mode, machines, optionalSupplyIds: [sanitizer.id, later.id], supplies: [detergent, sanitizer, later] }))
    assert.equal(result.loads[0]!.machineId, 'b-substitute')
    assert.equal(result.status, 'needs_confirmation')
    assert.equal(result.loads[0]!.treatments.find((step) => step.supplyId === sanitizer.id)?.confirmation, 'needs_confirmation')
    assert.ok(result.reasons.some((reason) => reason.details.cause === 'sanitizer_contact_time' && reason.machineId === 'b-substitute'))
  }
})

test('an unknown color cannot establish a match for recorded like-color care', () => {
  const result = plan(input([garment('a', 'unknown', ['Wash with like colors']), garment('b', 'unknown')]))
  assert.equal(result.loads.length, 2)
})

test('like-color care requires recorded matching color and intensity, not only a broad group', () => {
  const a = { ...garment('a', 'saturated', ['Wash with like colors']), color: 'Red' }
  for (const options of modes) {
    assert.equal(plan(input([a, { ...garment('b', 'saturated'), color: 'Blue' }], options)).loads.length, 2)
    assert.equal(plan(input([a, garment('b', 'saturated')], options)).loads.length, 2)
    assert.equal(plan(input([a, { ...garment('b', 'light'), color: 'Red' }], options)).loads.length, 2)
    assert.equal(plan(input([a, { ...garment('b', 'saturated'), color: ' red ' }], options)).loads.length, 1)
    assert.equal(plan(input([garment('a', 'saturated'), { ...garment('b', 'saturated'), color: 'Blue' }], options)).loads.length, 1, 'ordinary color preferences stay independent of the label constraint')
  }
})

test('wash-alone care keeps even matching pieces separate in every planning mode and order', () => {
  for (const options of modes) {
    for (const instruction of ['Wash alone', 'Wash separately']) {
      for (const textiles of [[garment('a', 'light', [instruction]), garment('b', 'light')],
        [garment('a', 'light'), garment('b', 'light', [instruction])]]) {
        const result = plan(input(textiles, options))
        assert.equal(result.loads.length, 2)
        assert.ok(result.reasons.some((reason) => reason.details.instruction === 'wash_alone'))
      }
    }
  }
})

const soak: SupplyItem = { id: 'soak', kind: 'chemical_consumable', bleachKind: 'none', labelEvidence: verified,
  formulation: { form: 'liquid' }, applicationRules: [{ id: 'soak-rule', stage: 'prewash', placement: 'manual',
    stainChemistry: 'surfactant', stainKinds: ['oil_grease'], safeMaterials: ['cotton'], evidence: verified,
    dose: { amount: 10, unit: 'ml' }, soak: { waterLitres: 2, minimumMinutes: 1, maximumMinutes: 3,
      maximumTemperatureC: 30, transfer: 'Synthetic rinse instructions' } }] }

test('garment soaking limits intersect the product range and never supply its minimum', () => {
  for (const maximum of [0, 0.5, 1, 2, 5]) {
    const a = garment('a', 'light')
    const result = plan(input([{ ...a, care: { ...a.care!, instructions: { ...instructions, maximumSoakMinutes: maximum } }, stainReport: { kind: 'oil_grease', priorTreatmentAttempts: [] } }],
      { supplies: [detergent, soak], pretreatmentChoices: [{ textileId: 'a', supplyId: soak.id }] }))
    const step = result.loads.flatMap((load) => load.treatments).find((entry) => entry.soak !== undefined)
    if (maximum < 1) {
      assert.equal(result.status, 'needs_confirmation')
      assert.equal(step, undefined)
    } else {
      assert.equal(result.status, 'ready')
      assert.equal(step?.soak?.minimumMinutes, 1)
      assert.equal(step?.soak?.maximumMinutes, Math.min(maximum, 3))
      assert.ok(step?.timing?.includes(`1–${Math.min(maximum, 3)} minutes`))
    }
  }
})

test('a saved product choice cannot authorize soaking against recorded garment care', () => {
  for (const restrictions of [['Do not soak'], ['No soaking'], [{ area: 'washing', instruction: 'Do not soak' }]]) {
    const result = plan(input([{ ...garment('a', 'light', restrictions), stainReport: { kind: 'oil_grease', priorTreatmentAttempts: [] } }],
      { supplies: [detergent, soak], pretreatmentChoices: [{ textileId: 'a', supplyId: soak.id }] }))
    assert.equal(result.status, 'needs_confirmation')
    assert.ok(!result.loads.some((load) => load.treatments.some((step) => step.soak && step.confirmation === 'confirmed')))
  }
  const permitted = plan(input([{ ...garment('a', 'light'), stainReport: { kind: 'oil_grease', priorTreatmentAttempts: [] } }],
    { supplies: [detergent, soak], pretreatmentChoices: [{ textileId: 'a', supplyId: soak.id }] }))
  assert.equal(permitted.status, 'ready')
  const spot: SupplyItem = { ...soak, applicationRules: [{ ...soak.applicationRules![0]!, soak: undefined }] }
  assert.equal(plan(input([{ ...garment('a', 'light', ['Do not soak']), stainReport: { kind: 'oil_grease', priorTreatmentAttempts: [] } }],
    { supplies: [detergent, spot], pretreatmentChoices: [{ textileId: 'a', supplyId: spot.id }] })).status, 'ready', 'no-soak does not prohibit a supported non-soak treatment')
})

test('a Downy Ball profile cannot authorize an HE or unknown washer, including aliases', () => {
  for (const highEfficiency of [true, undefined, false]) {
    for (const placement of ['downy_ball', 'downy-ball']) {
      const product: SupplyItem = { ...detergent, id: 'ball-product', kind: 'chemical_consumable', bleachKind: 'none',
        applicationRules: [{ ...detergent.applicationRules![0]!, stage: 'rinse', placement }] }
      const result = plan(input([garment('a', 'light')], { supplies: [detergent, product], optionalSupplyIds: [product.id], machines: [{ ...washer, highEfficiency,
        dispensing: { placements: ['detergent_compartment', placement], downyBall: true } }] }))
      assert.equal(result.status, highEfficiency === false ? 'ready' : 'needs_confirmation')
      assert.equal(result.loads[0]!.treatments.find((step) => step.supplyId === product.id)?.confirmation,
        highEfficiency === false ? 'confirmed' : 'needs_confirmation')
    }
  }
})
