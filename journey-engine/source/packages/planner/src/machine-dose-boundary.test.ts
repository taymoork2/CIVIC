import assert from 'node:assert/strict'
import { plan, planLoadOn, type MachineEvidence, type SupplyItem } from './index.ts'
import { tumbleCeiling } from './drying.ts'
import { careProductAllowed } from './care-process.ts'

const verified = { status: 'verified' as const }
const machines: MachineEvidence[] = [
  { id: 'a-standard', location: 'shared', highEfficiency: false, evidence: verified, capacityUnits: 8, capacityConfidence: 'verified', supportedCycles: ['normal'], dispensing: { evidence: verified, placements: ['detergent_compartment'] } },
  { id: 'b-he', location: 'shared', highEfficiency: true, evidence: verified, capacityUnits: 8, capacityConfidence: 'verified', supportedCycles: ['normal'], dispensing: { evidence: verified, placements: ['detergent_compartment', 'softener_compartment'] } },
]
const supplies: SupplyItem[] = [
  { id: 'a-detergent', kind: 'detergent', labelEvidence: verified, formulation: { form: 'liquid' }, formulationEvidence: verified, bleachKind: 'none', applicationRules: [
    { id: 'he', conditions: { machineClasses: ['he'] }, dose: { amount: 10, unit: 'ml' }, stage: 'wash', placement: 'detergent_compartment', evidence: verified },
    { id: 'standard', conditions: { machineClasses: ['standard'] }, dose: { amount: 20, unit: 'ml' }, stage: 'wash', placement: 'detergent_compartment', evidence: verified },
  ] },
  { id: 'z-softener', kind: 'softener', labelEvidence: verified, formulation: { form: 'liquid' }, formulationEvidence: verified, bleachKind: 'none', applicationRules: [{ id: 'extra', dose: { amount: 5, unit: 'ml' }, stage: 'rinse', placement: 'softener_compartment', evidence: verified }] },
]
const input = { textiles: [{ id: 'shirt', care: { washMethod: 'machine' as const, cycle: 'normal', status: 'confirmed' as const, bleach: 'none' as const }, soilLevel: 'normal' }], machines, supplies, optionalSupplyIds: ['z-softener'] }
const result = plan(input)
const load = result.loads[0]!
assert.equal(load.machineId, 'a-standard', 'a later product cannot move an earlier standard dose onto HE')
assert.equal(load.status, 'needs_confirmation')
const alternate = planLoadOn(input, load, 'b-he')
assert.equal(alternate.status, 'ready', 'choosing the other class replans the complete recipe')
if (alternate.status === 'ready') assert.equal(alternate.load.treatments[0]!.dose.amount, 10)
const sameClass = plan({ ...input, machines: machines.map(machine => ({ ...machine, highEfficiency: false })) })
assert.equal(sameClass.loads[0]!.machineId, 'b-he', 'a compatible sibling can still supply the missing compartment')
assert.equal(sameClass.loads[0]!.status, 'ready')
assert.equal(sameClass.loads[0]!.treatments[0]!.dose.amount, 20)

const instructions = { source: 'Synthetic checked label', preparation: [], washing: [], beforeDrying: [], drying: ['Extra drying restriction'], afterDrying: [], ironing: [] }
const garment = { id: 'restricted', bulkUnits: 1, material: 'cotton', care: { washMethod: 'machine' as const, cycle: 'normal', status: 'confirmed' as const, dryMethod: 'tumble_dry', dryHeat: 'low', instructions } }
assert.deepEqual(tumbleCeiling(garment), { method: 'unknown', reason: 'drying_unknown' }, 'an unresolved source line cannot be dropped from the tumble decision')
assert.deepEqual(tumbleCeiling({ ...garment, care: { ...garment.care, instructions: { ...instructions, drying: [] } } }), { maxHeat: 'low' })
const noSoftener = { ...instructions, drying: [], washing: ['No fabric softener'], washingRequirements: [{ wording: 'No fabric softener', checked: true, requirements: [{ kind: 'no_softener' as const }] }] }
assert.equal(careProductAllowed(noSoftener, { id: 'legacy', kind: 'softener' }), false, 'a legacy kind is still fabric softener without a use alias')
