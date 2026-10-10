import assert from 'node:assert/strict'

import { plan } from './index.ts'
import type { PlannerInput, SupplyItem } from './index.ts'

const label = { status: 'verified' as const, source: 'synthetic-label' }
const detergent = (id: string, extra: Partial<SupplyItem> = {}): SupplyItem => ({
  id,
  kind: 'detergent',
  use: 'detergent',
  bleachKind: 'none',
  labelEvidence: label,
  formulation: { form: 'liquid', concentration: 1 },
  applicationRules: [{ id: `${id}-rule`, dose: { amount: 30, unit: 'ml', measurementCue: 'fill to line 2' }, stage: 'wash', placement: 'detergent_compartment', evidence: { status: 'verified' } }],
  ...extra,
})
const softener: SupplyItem = {
  id: 'softener',
  kind: 'softener',
  use: 'softener',
  bleachKind: 'none',
  labelEvidence: label,
  formulation: { form: 'liquid', concentration: 1 },
  applicationRules: [{ id: 'softener-rule', dose: { amount: 20, unit: 'ml', measurementCue: 'to the line' }, stage: 'rinse', placement: 'detergent_compartment', evidence: { status: 'verified' } }],
}
const machine = {
  id: 'machine',
  modelId: 'synthetic-model',
  capacityUnits: 3,
  capacityConfidence: 'verified' as const,
  evidence: { status: 'verified' as const },
  supportedCycles: ['normal'],
  dispensing: { placements: ['detergent_compartment'] },
}
const shirt = (care: Record<string, unknown> = {}) => ({ id: 'shirt', ownerId: 'alice', colorGroup: 'white', bulkUnits: 1, care: { washMethod: 'machine', cycle: 'normal', ...care } })
const input = (supplies: SupplyItem[], extra: Partial<PlannerInput> = {}, care: Record<string, unknown> = {}): PlannerInput => ({
  textiles: [shirt(care)],
  supplies,
  machines: [machine],
  preferences: { preferredMachineId: 'machine' },
  ...extra,
})
const detergentSteps = (result: ReturnType<typeof plan>): string[] => result.loads.flatMap((load) => load.treatments.filter((step) => step.supplyId.startsWith('det-')).map((step) => step.supplyId))

// Two detergents: one load gets exactly one detergent step, and add-ins still go in.
const two = plan(input([detergent('det-b'), detergent('det-a'), softener], { optionalSupplyIds: [softener.id] }))
assert.equal(two.loads.length, 1)
assert.deepEqual(detergentSteps(two), ['det-a'], 'the first detergent by id when none was chosen')
assert.ok(two.loads[0]!.treatments.some((step) => step.supplyId === 'softener'), 'add-ins are unchanged')
assert.equal(two.loads[0]!.detergent?.chosenId, 'det-a')
assert.deepEqual(two.loads[0]!.detergent?.options.map((option) => option.supplyId), ['det-a', 'det-b'])
assert.ok(!JSON.stringify(two.reasons).includes('"det-b"'), 'the other detergent is skipped silently')

// The chosen detergent wins.
const chosen = plan(input([detergent('det-b'), detergent('det-a')], { detergentId: 'det-b' }))
assert.deepEqual(detergentSteps(chosen), ['det-b'])
assert.equal(chosen.loads[0]!.detergent?.chosenId, 'det-b')

// A detergent a tag forbids is skipped for one that fits, and the options say why.
const oxy = detergent('det-a', { bleachKind: 'oxygen' })
const forbidden = plan(input([oxy, detergent('det-b')], { detergentId: 'det-a' }, { bleach: 'none' }))
assert.deepEqual(detergentSteps(forbidden), ['det-b'])
assert.deepEqual(forbidden.loads[0]!.detergent, {
  chosenId: 'det-b',
  options: [{ supplyId: 'det-a', fits: false, cause: 'tag_forbids_bleach' }, { supplyId: 'det-b', fits: true }],
})

// A detergent left out is not an option; a lone detergent is untouched.
const left = plan(input([detergent('det-a'), detergent('det-b')], { excludedSupplyIds: ['det-a'] }))
assert.deepEqual(detergentSteps(left), ['det-b'])
assert.deepEqual(left.loads[0]!.detergent?.options.map((option) => option.supplyId), ['det-b'])
assert.deepEqual(detergentSteps(plan(input([detergent('det-a')]))), ['det-a'])

console.log('detergent choice tests passed')

// Scent beads (Downy Unstopables): with detergent, into the empty drum before the clothes; the label says to use them with detergent.
{
  const { useDirections } = await import('./vocabulary.ts')
  const drum = useDirections('scent_booster', ['detergent_compartment', 'direct_to_drum'], true)
  const beads = (extra: Partial<SupplyItem> = {}): SupplyItem => ({
    id: 'beads', kind: 'chemical_consumable', use: 'scent_booster', bleachKind: 'none', labelEvidence: label,
    formulation: { form: 'beads' },
    applicationRules: [{ id: 'beads-rule', dose: { amount: 30, unit: 'ml', measurementCue: 'Full cap' }, stage: drum.stage, placement: drum.placement, timing: drum.timing, evidence: { status: 'verified' } }],
    ...extra,
  })
  const drumWasher = { ...machine, dispensing: { placements: ['detergent_compartment', 'direct_to_drum'] } }
  const withDetergent = plan(input([detergent('det-a'), beads()], { optionalSupplyIds: ['beads'], machines: [drumWasher] }))
  const step = withDetergent.loads[0]!.treatments.find((entry) => entry.supplyId === 'beads')
  assert.ok(step, 'scent beads go in with a detergent')
  assert.deepEqual([step.stage, step.placement, step.timing], ['wash', 'direct_to_drum', 'before loading the clothes'])

  const alone = plan(input([beads()], { optionalSupplyIds: ['beads'], machines: [drumWasher] }))
  assert.ok(!alone.loads.some((load) => load.treatments.some((entry) => entry.supplyId === 'beads')), 'no detergent, no scent beads')
  assert.ok(alone.reasons.some((reason) => reason.code === 'product_left_out' && reason.supplyId === 'beads' && reason.details.cause === 'needs_detergent'))
  assert.ok(alone.explanations.some((text) => typeof text === 'object' ? JSON.stringify(text).includes('with detergent') : String(text).includes('with detergent')))

  // Nothing recorded about bleach: held, never guessed from the name.
  const unknown = plan(input([detergent('det-a'), beads({ bleachKind: undefined })], { optionalSupplyIds: ['beads'], machines: [drumWasher] }))
  assert.ok(unknown.reasons.some((reason) => reason.supplyId === 'beads' && reason.details.cause === 'product_safety_needed'))
}
console.log('scent bead tests passed')
