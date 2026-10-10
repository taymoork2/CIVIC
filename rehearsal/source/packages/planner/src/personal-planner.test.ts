import assert from 'node:assert/strict'
import type { PlannerInput, PersonalPlannerInput, PersonalPlannerSummary } from './index.ts'

const { plan, planLoadOn, personalPlannerPolicyVersion } = await import(`./index${'.ts'}`) as typeof import('./index.ts')
const verified = { status: 'verified' as const, source: 'synthetic directions' }
const input: PlannerInput = { textiles: ['tee-a', 'tee-b'].map((id) => ({ id, bulkUnits: 1, care: { washMethod: 'machine', cycle: 'normal', bleach: 'none' } })),
  supplies: [
    { id: 'detergent', kind: 'detergent', formulation: { form: 'liquid' }, labelEvidence: verified,
      applicationRules: [{ id: 'dose', dose: { amount: 20, unit: 'ml' }, stage: 'wash', placement: 'detergent_compartment', evidence: verified }] },
    ...['addition-a', 'addition-b'].map((id) => ({ id, kind: 'chemical_consumable' as const, formulation: { form: 'liquid' as const }, labelEvidence: verified,
      applicationRules: [{ id: `${id}-dose`, dose: { amount: 10, unit: 'ml' }, stage: 'wash' as const, placement: 'direct_to_drum', evidence: verified }] })),
  ], machines: [{ id: 'washer', capacityUnits: 10, capacityConfidence: 'verified', evidence: verified, supportedCycles: ['normal'], dispensing: { placements: ['detergent_compartment', 'direct_to_drum'] } }], washGoals: ['odor'] }
const evidence = plan(input), load = evidence.loads[0]!
const withAbsentFields = plan({ ...input, selectedMachineId: undefined, supplies: input.supplies!.map((supply) => ({ ...supply,
  capabilities: undefined, applicationRules: supply.applicationRules?.map((rule) => ({ ...rule, incompatibleMaterials: undefined })) })) })
assert.equal(withAbsentFields.inputHash, evidence.inputHash, 'absent optional fields have the same snapshot as omitted fields')
assert.deepEqual(plan(JSON.parse(JSON.stringify(withAbsentFields.inputSnapshot))), withAbsentFields, 'a JSON-round-tripped snapshot is executable')
const recordedUnknown = plan({ ...input, textiles: input.textiles!.map((textile) => ({ ...textile, material: null })) })
assert.notEqual(recordedUnknown.inputHash, evidence.inputHash, 'explicit unknown values remain recorded')
assert.equal(recordedUnknown.inputSnapshot.textiles![0]!.material, null)
const summary = (textileId: string): PersonalPlannerSummary => ({ textileId, inputHash: `summary-${textileId}`, contextKey: 'specified-context', policyVersion: 'personal-outcomes-2',
  status: 'repeated_pattern', counts: { independentWashes: 3, improved: 3, unchanged: 0, worse: 0, mixed: 0, unknown: 0 }, suppressOptionalSuggestion: false,
  historyTruncated: false, negativeHistoryTruncated: false, explanation: 'Three comparable reports', influencingObservationCount: 3, influencingObservationsTruncated: false,
  observations: [2, 0, 1].map((index) => ({ assessmentId: `a-${textileId}-${index}`, recordId: `r-${textileId}-${index}`, independentWashId: `wash-${index}`, revision: 1, result: 'improved' })) })
const personal: PersonalPlannerInput = { policyVersion: personalPlannerPolicyVersion, evidenceInputHash: evidence.inputHash, comparisonInputHash: 'private-comparison',
  loadId: load.id, textileIds: load.textileIds, machineId: load.machineId, cycle: load.cycle, temperatureC: load.temperatureC,
  choices: ['addition-b', 'addition-a'].map((supplyId) => ({ supplyId, eligible: true, proposalHash: `proposal-${supplyId}`,
    benefit: { ...load.productRecommendations!.find((decision) => decision.supplyId === supplyId)!, compatibility: 'allowed' },
    summaries: [...load.textileIds].reverse().map(summary) })) }
const adapted = plan({ ...input, personalSuggestions: personal })
assert.notEqual(adapted.inputHash, evidence.inputHash)
assert.deepEqual(plan(adapted.inputSnapshot), adapted, 'the derived input snapshot reproduces the complete private result')
const reordered = { ...personal, textileIds: [...personal.textileIds].reverse(), choices: [...personal.choices].reverse().map((choice) => ({ ...choice,
  summaries: [...choice.summaries].reverse().map((row) => ({ ...row, observations: [...row.observations].reverse() })) })) }
assert.deepEqual(plan({ ...input, personalSuggestions: reordered }), adapted, 'derived-input order cannot change the hash or decision')
assert.deepEqual(adapted.loads[0]!.treatments, load.treatments)
assert.deepEqual(adapted.loads[0]!.productRecommendations?.map((decision) => decision.compatibility), ['unknown', 'unknown'], 'personal results do not grant compatibility')
assert.ok(adapted.loads[0]!.personalSuggestions!.choices.every((choice) => choice.guidance.direction === 'reported_improvement' && !choice.selected))
assert.equal(adapted.loads[0]!.personalSuggestions!.noAdditionAvailable, true)
assert.deepEqual(adapted.cost, evidence.cost)
assert.deepEqual(adapted.reasons, evidence.reasons)
const roomInput = { ...input, machines: [
  { ...input.machines![0]!, location: 'shared' as const, applianceType: 'top_load_washer' as const, highEfficiency: false },
  { ...input.machines![0]!, id: 'other-washer', location: 'shared' as const, applianceType: 'front_load_washer' as const, highEfficiency: true },
] }
const room = plan(roomInput), roomLoad = room.loads[0]!
assert.ok(roomLoad.alternates!.length > 0)
const roomAdapted = plan({ ...roomInput, personalSuggestions: { ...personal, evidenceInputHash: room.inputHash,
  loadId: roomLoad.id, machineId: roomLoad.machineId, cycle: roomLoad.cycle, temperatureC: roomLoad.temperatureC } })
assert.deepEqual(roomAdapted.loads[0]!.alternates, roomLoad.alternates, 'machine alternatives retain evidence-only planning')
assert.deepEqual(planLoadOn(roomAdapted.inputSnapshot, roomAdapted.loads[0]!, 'other-washer'), planLoadOn(room.inputSnapshot, roomLoad, 'other-washer'),
  'changing the washer does not carry forward the old personal comparison')
const splitInput = { ...input, machines: input.machines!.map((machine) => ({ ...machine, capacityUnits: 1 })) }
const split = plan(splitInput), splitLoad = split.loads[0]!
assert.equal(split.loads.length, 2)
const splitAdapted = plan({ ...splitInput, personalSuggestions: { ...personal, evidenceInputHash: split.inputHash,
  loadId: splitLoad.id, textileIds: splitLoad.textileIds, machineId: splitLoad.machineId, cycle: splitLoad.cycle, temperatureC: splitLoad.temperatureC,
  choices: personal.choices.map((choice) => ({ ...choice, summaries: splitLoad.textileIds.map(summary) })) } })
assert.deepEqual(splitAdapted.loads[1], split.loads[1], 'personal guidance applies only to the selected load')

const negative = { ...personal, choices: personal.choices.map((choice) => choice.supplyId !== 'addition-a' ? choice : { ...choice,
  summaries: choice.summaries.map((row) => ({ ...row, status: 'reassess' as const, suppressOptionalSuggestion: true })) }) }
const held = plan({ ...input, personalSuggestions: negative })
assert.deepEqual(held.loads[0]!.productRecommendations!.map((decision) => decision.supplyId), ['addition-b'])
assert.deepEqual(held.loads[0]!.withheldProductRecommendations, [load.productRecommendations!.find((decision) => decision.supplyId === 'addition-a')])
assert.deepEqual(held.loads[0]!.treatments, load.treatments)
assert.notEqual(held.inputHash, adapted.inputHash)

const chosenInput = { ...input, optionalSupplyIds: ['addition-a'] }, chosen = plan(chosenInput)
const explicitlyChosen = plan({ ...chosenInput, personalSuggestions: { ...negative, evidenceInputHash: chosen.inputHash } })
assert.deepEqual(explicitlyChosen.loads[0]!.treatments, chosen.loads[0]!.treatments, 'withholding a suggestion does not silently undo an explicit selection')
assert.ok(explicitlyChosen.loads[0]!.personalSuggestions!.choices.find((choice) => choice.supplyId === 'addition-a')!.selected)
assert.ok(explicitlyChosen.loads[0]!.personalSuggestions!.choices.find((choice) => choice.supplyId === 'addition-a')!.suppressed)
const ineligible = plan({ ...chosenInput, personalSuggestions: { ...personal, evidenceInputHash: chosen.inputHash,
  choices: personal.choices.map((choice) => ({ ...choice, eligible: false })) } })
assert.ok(ineligible.loads[0]!.personalSuggestions!.choices.every((choice) => choice.guidance.direction === 'evidence_only'))

const prohibitedInput = { ...input, supplies: input.supplies!.map((supply) => supply.id === 'addition-a' ? { ...supply, bleachKind: 'oxygen' as const } : supply) }
const prohibited = plan(prohibitedInput)
const restrained = plan({ ...prohibitedInput, personalSuggestions: { ...personal, evidenceInputHash: prohibited.inputHash } })
assert.equal(restrained.loads[0]!.productRecommendations!.find((decision) => decision.supplyId === 'addition-a')!.compatibility, 'excluded')
assert.equal(restrained.loads[0]!.personalSuggestions!.choices.find((choice) => choice.supplyId === 'addition-a')!.guidance.direction, 'evidence_only')
assert.deepEqual(restrained.loads[0]!.treatments, prohibited.loads[0]!.treatments)
for (const invalid of [
  { ...personal, evidenceInputHash: 'stale' }, { ...personal, machineId: 'different' }, { ...personal, textileIds: ['other'] },
  { ...personal, choices: [personal.choices[0]!, personal.choices[0]!] },
  { ...personal, choices: personal.choices.map((choice) => ({ ...choice, summaries: choice.summaries.slice(0, 1) })) },
]) assert.throws(() => plan({ ...input, personalSuggestions: invalid }))
console.log('private planner snapshots, ranking, negative withholding and evidence/selection invariants passed')
