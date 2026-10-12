import type { MachineDispensingProfile, PlanResult, PlannerInput, SupplyItem } from './index'

export {}

const {
  plan,
  stainWashLimit,
  treatmentChemistry,
  doorLocksDuringCycle,
  dryerPhases,
  evidenceLevel,
  evidencePolicy,
  isDryerPhase,
  labelTreatmentPhase,
  loadSizeFor,
  machineClasses,
  phaseOrder,
  treatmentPhase,
  washerClass,
  washerPrepPhases,
} = (await import(`./index${'.ts'}`)) as typeof import('./index')
const { ownedDispensingDevices, ownedWasherMachines, ownedWasherSupplies, sanitizedInvoiceGarments, washerPlannerFixture } = await import(`./fixtures${'.ts'}`)

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message}: ${String(actual)} !== ${String(expected)}`)
}

function deepEqual(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}: values differ`)
}

function ok(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}

const detergent = {
  id: 'detergent',
  kind: 'detergent' as const,
  labelEvidence: { status: 'verified' as const, source: 'synthetic-label' },
  formulation: { form: 'liquid', concentration: 1 },
  applicationRules: [{
    id: 'detergent-medium',
    dose: { amount: 30, unit: 'ml', measurementCue: 'fill to line 2' },
    stage: 'wash' as const,
    placement: 'detergent_compartment',
    evidence: { status: 'verified' as const },
  }],
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

const fixture: PlannerInput = {
  textiles: [
    { id: 'white-new', ownerId: 'alice', colorGroup: 'white', firstWash: true, bulkUnits: 1, care: { washMethod: 'machine', cycle: 'normal' } },
    { id: 'black-new', ownerId: 'bob', colorGroup: 'black', firstWash: true, bulkUnits: 1, care: { washMethod: 'machine', cycle: 'normal' } },
    { id: 'heavy', ownerId: 'alice', colorGroup: 'dark', bulkUnits: 3, care: { washMethod: 'machine', cycle: 'normal' } },
    { id: 'dry-clean-only', ownerId: 'bob', care: { washMethod: 'dry_clean_only' } },
  ],
  supplies: [detergent],
  machines: [machine],
  pricing: { currency: 'USD', washer: { type: 'flat_per_start', price: 2 }, supplyUnitPrices: { detergent: 0.1 } },
  preferences: { preferredMachineId: 'machine' },
}

const exactSupplyShape: SupplyItem = {
  id: 'owned-tide',
  brand: 'Tide',
  product: 'liquid detergent',
  formulation: { name: 'HE liquid', form: 'liquid', concentration: 1, concentrationUnit: 'x', highEfficiencyCompatible: true },
  package: { revision: '2026-01', amount: 1.36, unit: 'l' },
  measurement: { unit: 'ml', marks: ['line 1', 'line 2'] },
  ownerId: 'alice',
  instructionProvenance: { status: 'verified', source: 'label' },
}
const exactMachineProfile: MachineDispensingProfile = {
  compartments: [{ id: 'detergent_compartment', capacity: 100, capacityUnit: 'ml', release: 'manual' }],
  directToDrum: true,
  centerAgitator: true,
  downyBall: true,
  automatic: true,
  manual: true,
  release: 'manual',
  requiredCycles: ['normal'],
  evidenceConfidence: 'verified',
}
ok(exactSupplyShape.package?.revision === '2026-01', 'supply package provenance is representable')
ok(exactMachineProfile.compartments?.[0] !== undefined, 'machine compartment capacity is representable')

const result: PlanResult = plan(fixture)
const repeated: PlanResult = plan(fixture)

equal(JSON.stringify(result), JSON.stringify(repeated), 'identical input is byte-stable')
equal(result.plannerVersion, 'planner-v2.22', 'version is recorded')
equal(result.mode, 'normal', 'an unset mode plans normally')
ok(/^[0-9a-f]{64}$/.test(result.inputHash), 'input hash is SHA-256-shaped')
equal(plan({}).inputHash, '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a', 'input hash is SHA-256')
ok(Object.isFrozen(result.inputSnapshot), 'canonical snapshot is immutable')
equal(plan({ textiles: [fixture.textiles![1]!, fixture.textiles![0]!] }).inputHash === plan({ textiles: [fixture.textiles![0]!, fixture.textiles![1]!] }).inputHash, false, 'the hash covers the input as given; callers sort the selection before planning')
ok(Object.isFrozen(result.loads), 'loads are immutable')
deepEqual(result.loads.map((load) => load.textileIds), [['black-new'], ['heavy'], ['white-new']], 'loads are ordered')
deepEqual(result.exclusions.map((exclusion) => exclusion.textileId), ['dry-clean-only'], 'exclusions are ordered')
deepEqual(result.reasons.find((reason) => reason.code === 'care_prohibition')?.details, { cause: 'care_label_prohibition', method: 'dry_clean_only' }, 'a care veto names its method')
ok(result.reasons.every((reason, index, all) => index === 0 || reason.priority >= all[index - 1]!.priority), 'reasons are priority ordered')
ok(result.loads.every((load) => load.bulkUnits <= load.capacityUnits), 'loads fit capacity')
equal(result.cost.washer, 6, 'washer cost is calculated')
ok(result.reasons.some((reason) => reason.code === 'dye_first_wash_risk'), 'dye risk is explained')
ok(result.reasons.some((reason) => reason.code === 'dose_rule_selected'), 'dose rule is selected')
ok(result.reasons.some((reason) => reason.code === 'machine_placement'), 'machine placement is recorded')
ok(result.reasons.some((reason) => reason.code === 'capacity_limit' && reason.details.cause === 'load_capacity'), 'capacity split is explicit')
deepEqual(result.loads[0]?.owners, [{ textileId: 'black-new', ownerId: 'bob' }], 'ownership is stable')
deepEqual(result.explanations.map((explanation) => explanation.reasonId), result.reasons.map((reason) => reason.id), 'explanations reference reasons')
deepEqual(result.explanations.map((explanation) => explanation.code), result.reasons.map((reason) => reason.code), 'explanations preserve reason codes')

const prohibitedFirst = plan({
  textiles: [
    { id: 'prohibited', ownerId: 'owner', care: { washMethod: 'do_not_wash' } },
    { id: 'unknown', ownerId: 'owner', care: { washMethod: 'unknown' } },
  ],
})
equal(prohibitedFirst.reasons[0]?.code, 'care_prohibition', 'care prohibition precedes confirmation')
equal(prohibitedFirst.status, 'needs_confirmation', 'unknown care requires confirmation')
ok(prohibitedFirst.exclusions.some((exclusion) => exclusion.textileId === 'prohibited'), 'prohibition is excluded')
ok(prohibitedFirst.reasons.some((reason) => reason.code === 'needs_confirmation' && reason.details.cause === 'unknown_care'), 'unknown care is explicit')

const unsupported = plan({
  ...fixture,
  supplies: [{ ...detergent, applicationRules: [{ ...detergent.applicationRules[0]!, id: 'unsupported', supported: false }] }],
})
equal(unsupported.status, 'needs_confirmation', 'unsupported treatment requires confirmation')
ok(unsupported.reasons.some((reason) => reason.code === 'needs_confirmation' && reason.details.cause === 'label_row_needed'), 'a label with no usable row asks for one')

const insufficientMachine = plan({ ...fixture, machines: [{ id: 'unknown-machine', capacityConfidence: 'unknown' }] })
equal(insufficientMachine.status, 'needs_confirmation', 'insufficient machine evidence requires confirmation')
ok(insufficientMachine.reasons.some((reason) => reason.details.cause === 'insufficient_machine_evidence'), 'machine evidence gap is explicit')

const insufficientProduct = plan({ ...fixture, supplies: [{ id: 'unknown-product', kind: 'detergent' }] })
equal(insufficientProduct.status, 'needs_confirmation', 'insufficient product evidence requires confirmation')
ok(insufficientProduct.reasons.some((reason) => reason.details.cause === 'insufficient_product_evidence'), 'product evidence gap is explicit')

const rinseByHand = {
  ...detergent,
  id: 'rinse-by-hand',
  kind: 'softener' as const,
  applicationRules: [{ id: 'rinse-by-hand-rule', dose: { amount: 60, unit: 'ml' }, stage: 'rinse' as const, placement: 'direct_to_drum', timing: 'at the start of the rinse', evidence: { status: 'verified' as const } }],
}
const frontLoader = { ...machine, id: 'front', applianceType: 'front_load_washer', dispensing: { placements: ['detergent_compartment', 'direct_to_drum'] } }
const lockedRinse = plan({ ...fixture, supplies: [detergent, rinseByHand], optionalSupplyIds: ['rinse-by-hand'], machines: [frontLoader] })
equal(lockedRinse.status, 'needs_confirmation', 'a front-loader cannot take a product by hand mid-rinse')
ok(lockedRinse.reasons.some((reason) => reason.details.cause === 'locked_door_mid_cycle' && reason.supplyId === 'rinse-by-hand'), 'the locked-door reason names the product')
const topLoaderRinse = plan({ ...fixture, supplies: [detergent, rinseByHand], optionalSupplyIds: ['rinse-by-hand'], machines: [{ ...frontLoader, applianceType: 'top_load_washer' }] })
ok(!topLoaderRinse.reasons.some((reason) => reason.details.cause === 'locked_door_mid_cycle'), 'a top-loader that can be opened mid-cycle is not blocked')

const oneUnverifiedProduct = plan({ ...washerPlannerFixture, supplies: washerPlannerFixture.supplies!.map((supply: SupplyItem) => supply.id === 'tide-ultra-concentrate' ? { ...supply, labelEvidence: { status: 'unknown' as const, source: 'unread-label' } } : supply) })
equal(oneUnverifiedProduct.status, 'needs_confirmation', 'one unverified owned product blocks a ready plan instead of silently dropping out')
ok(oneUnverifiedProduct.reasons.some((reason) => reason.details.cause === 'insufficient_product_evidence' && reason.supplyId === 'tide-ultra-concentrate'), 'the unverified product is named')

const productConflict = plan({
  ...fixture,
  textiles: [{ ...fixture.textiles![0]!, id: 'incompatible', incompatibleSupplyIds: ['detergent'] }],
})
equal(productConflict.exclusions[0]?.reasonCodes[0], 'product_restriction', 'product compatibility is enforced')
deepEqual(productConflict.reasons.find((reason) => reason.code === 'product_restriction')?.details, { cause: 'garment_product_conflict', supplyIds: ['detergent'] }, 'a garment-product conflict names the product it is about')
const restrictedByProduct = plan({ ...fixture, supplies: [{ ...detergent, incompatibleTextileIds: ['white-new'] }] })
deepEqual(restrictedByProduct.reasons.find((reason) => reason.code === 'product_restriction')?.details, { cause: 'no_compatible_supply', supplyIds: ['detergent'] }, 'a product restriction names the incompatible products')

const sharedCompartment = plan({
  ...fixture,
  optionalSupplyIds: ['sanitizer'],
  supplies: [
    detergent,
    {
      id: 'sanitizer',
      kind: 'sanitizer',
      labelEvidence: { status: 'verified' },
      formulation: { form: 'liquid' },
      applicationRules: [{ id: 'sanitizer-rule', dose: { amount: 10, unit: 'ml' }, placement: 'detergent_compartment', evidence: { status: 'verified' } }],
    },
  ],
})
equal(sharedCompartment.status, 'needs_confirmation', 'shared compartment conflict requires confirmation')
ok(sharedCompartment.reasons.some((reason) => reason.code === 'shared_compartment_conflict'), 'shared compartment conflict is explicit')

const chemicalConflict = plan({
  ...fixture,
  optionalSupplyIds: ['bleach'],
  supplies: [
    detergent,
    {
      id: 'bleach',
      kind: 'bleach',
      bleachKind: 'chlorine',
      labelEvidence: { status: 'verified' },
      formulation: { form: 'liquid' },
      applicationRules: [{ id: 'bleach-rule', dose: { amount: 10, unit: 'ml' }, placement: 'bleach_compartment', incompatibleSupplyIds: ['detergent'], evidence: { status: 'verified' } }],
    },
  ],
  machines: [{ ...machine, dispensing: { placements: ['detergent_compartment', 'bleach_compartment'] } }],
})
equal(chemicalConflict.status, 'needs_confirmation', 'chemical conflicts require confirmation across placements')
ok(chemicalConflict.reasons.some((reason) => reason.details.cause === 'chemical_combination_conflict'), 'chemical conflict is explicit')
const chemicalPair = chemicalConflict.reasons.find((reason) => reason.details.cause === 'chemical_combination_conflict')!
deepEqual(chemicalPair.details.supplyIds, ['bleach', 'detergent'], 'a chemical conflict names both products')
equal(chemicalPair.supplyId, undefined, 'two products share the blame, so neither is the single source')

const accessory = plan({
  ...fixture,
  optionalSupplyIds: ['downy-ball'],
  supplies: [{
    id: 'downy-ball',
    kind: 'accessory',
    labelEvidence: { status: 'verified', source: 'accessory-label' },
    applicationRules: [{ id: 'accessory-rule', dose: { amount: 1, unit: 'count' }, placement: 'downy_ball', stage: 'rinse', timing: 'at rinse start', evidence: { status: 'verified' } }],
  }],
  machines: [{ ...machine, highEfficiency: false, dispensing: { placements: ['downy_ball'] } }],
})
equal(accessory.status, 'ready', 'verified reusable accessories can be treatment steps')
equal(accessory.loads[0]?.treatments[0]?.source, 'accessory-label', 'treatment source is preserved')

const nestedCompartment = plan({
  ...fixture,
  machines: [{ ...machine, dispensing: { compartments: [{ id: 'detergent_compartment', release: 'manual' }], evidenceConfidence: 'verified' } }],
})
equal(nestedCompartment.loads[0]?.treatments[0]?.confirmation, 'confirmed', 'profile evidence covers documented compartments')

const invalidDose = plan({
  ...fixture,
  supplies: [{ ...detergent, applicationRules: [{ ...detergent.applicationRules[0]!, dose: { amount: 0, unit: 'ml' } }] }],
})
equal(invalidDose.status, 'needs_confirmation', 'non-positive doses require confirmation')
ok(invalidDose.reasons.some((reason) => reason.details.cause === 'unsupported_treatment'), 'invalid dose is explicit')

const substituted = plan({
  ...fixture,
  selectedMachineId: 'small',
  machines: [
    { ...machine, id: 'small', capacityUnits: 1 },
    { ...machine, id: 'large', capacityUnits: 5, modelId: 'large-model' },
  ],
  textiles: [{ ...fixture.textiles![2]!, id: 'too-large-for-small', bulkUnits: 2 }],
})
equal(substituted.loads[0]?.machineId, 'large', 'machine substitution preserves capacity')
ok(substituted.reasons.some((reason) => reason.code === 'machine_substitution'), 'machine substitution is explicit')

const missingMachineEvidence = plan({
  textiles: [{ id: 'delicate', care: { washMethod: 'machine', cycle: 'delicate' } }],
  supplies: [{ id: 'd', kind: 'detergent', labelEvidence: { status: 'verified' }, formulation: { form: 'liquid' }, applicationRules: [{ id: 'r', dose: { amount: 1, unit: 'ml' }, placement: 'detergent_compartment', evidence: { status: 'verified' } }] }],
  machines: [{ id: 'm', capacityUnits: 2, dispensing: { placements: ['detergent_compartment'] } }],
})
equal(missingMachineEvidence.status, 'needs_confirmation', 'machine without provenance and cycle evidence requires confirmation')
ok(missingMachineEvidence.reasons.some((reason) => reason.details.cause === 'insufficient_machine_evidence'), 'missing machine evidence is explicit')

const missingCareCycle = plan({ ...fixture, textiles: [{ id: 'missing-cycle', care: { washMethod: 'machine' } }] })
equal(missingCareCycle.status, 'needs_confirmation', 'machine wash without a care cycle requires confirmation')
ok(missingCareCycle.reasons.some((reason) => reason.details.cause === 'unknown_care'), 'missing care cycle is explicit')

const placementSubstitution = plan({
  optionalSupplyIds: ['b'],
  textiles: [{ id: 'placement-substitution', care: { washMethod: 'machine', cycle: 'normal' } }],
  supplies: [
    { ...detergent, id: 'a', applicationRules: [{ ...detergent.applicationRules[0]!, id: 'a-rule', placement: 'a' }] },
    { ...detergent, id: 'b', kind: 'softener' as const, applicationRules: [{ ...detergent.applicationRules[0]!, id: 'b-rule', placement: 'b' }] },
  ],
  machines: [
    { ...machine, id: 'm1', dispensing: { placements: ['a'] } },
    { ...machine, id: 'm2', dispensing: { placements: ['b'] } },
  ],
  selectedMachineId: 'm1',
})
equal(placementSubstitution.status, 'needs_confirmation', 'machine substitution revalidates earlier treatment placements')
ok(placementSubstitution.loads[0]?.treatments.some((treatment) => treatment.placement === 'a' && treatment.confirmation === 'needs_confirmation'), 'unsupported treatment is no longer confirmed after substitution')

const unknownMechanism = plan({
  ...fixture,
  machines: [{ ...machine, dispensing: { placements: ['detergent_compartment'], evidenceConfidence: 'unknown' } }],
})
equal(unknownMechanism.status, 'needs_confirmation', 'unknown dispensing evidence requires confirmation')
ok(unknownMechanism.reasons.some((reason) => reason.details.cause === 'unsupported_machine_placement'), 'unknown dispensing mechanism is explicit')

const missingRuleCondition = plan({
  ...fixture,
  supplies: [{ ...detergent, applicationRules: [{ ...detergent.applicationRules[0]!, conditions: { waterConditions: ['soft'] } }] }],
})
equal(missingRuleCondition.status, 'needs_confirmation', 'missing label condition requires confirmation')
ok(missingRuleCondition.reasons.some((reason) => reason.details.cause === 'label_row_needed'), 'a row for a condition the load does not state is fail-closed: the label row is asked')

const stainSupply = (id: string, chemistry: 'protease' | 'oxygen_bleach' | 'surfactant') => ({
  id,
  kind: 'chemical_consumable' as const,
  bleachKind: chemistry === 'oxygen_bleach' ? 'oxygen' as const : 'none' as const,
  stainChemistry: chemistry,
  labelEvidence: { status: 'verified' as const, source: `${id}-label` },
  formulation: { form: 'liquid' },
  applicationRules: [{
    id: `${id}-rule`,
    stainChemistry: chemistry,
    dose: { amount: 10, unit: 'ml' },
    placement: 'manual',
    evidence: { status: 'verified' as const, source: `${id}-rule` },
  }],
})

const protein = plan({
  pretreatmentChoices: [{ textileId: 'protein-shirt', supplyId: 'protease' }],
  textiles: [{ id: 'protein-shirt', ownerId: 'alice', material: 'cotton', care: { washMethod: 'machine', cycle: 'normal', maxTemperatureC: 60 }, stainReport: { kind: 'protein', priorTreatmentAttempts: [], location: 'collar' } }],
  supplies: [stainSupply('protease', 'protease')],
  machines: [{ ...machine, dispensing: { placements: ['manual'] } }],
})
equal(protein.status, 'ready', 'verified protein pretreatment is ready')
equal(protein.loads[0]?.treatments[0]?.stage, 'prewash', 'protein pretreatment precedes washing')
equal(protein.loads[0]?.treatments[0]?.temperatureC, 20, 'protein pretreatment uses a cold rinse')
equal(protein.loads[0]?.treatments[0]?.textileId, 'protein-shirt', 'stain treatment is garment-bound')
ok(!protein.reasons.some((reason) => reason.details.cause === 'unknown_stain_report'), 'known stain report does not need confirmation')

// A second try after a washed-out treatment: a different product, a different chemistry first, no confirmation of what was mixed.
const washedOut = [{ name: 'Enzyme spray', supplyId: 'protease', chemistry: 'protease' as const, washedOut: true as const }]
type RetryCare = { bleach?: 'any' | 'non_chlorine' | 'none'; restrictions?: string[] }
const retryShirt = (material: string, attempts: readonly unknown[] = washedOut, care: RetryCare = {}, kind = 'protein') => ({ id: 'retry-shirt', ownerId: 'alice', material, care: { washMethod: 'machine', cycle: 'normal', maxTemperatureC: 60, bleach: 'any' as const, ...care }, stainReport: { kind: kind as 'protein', priorTreatmentAttempts: attempts } })
// A retry chemistry other than the stain kind's own is offered only when its label names the kind.
const labelled = (supply: ReturnType<typeof stainSupply>, stainKinds: string[], extra: object = {}) => ({ ...supply, applicationRules: supply.applicationRules.map((rule) => ({ ...rule, stainKinds, ...extra })) })
const retryInput = (material: string, attempts?: readonly unknown[], care?: RetryCare) => ({ textiles: [retryShirt(material, attempts, care)], supplies: [stainSupply('protease', 'protease'), stainSupply('protease-2', 'protease'), labelled(stainSupply('oxy', 'oxygen_bleach'), ['protein'])], machines: [{ ...machine, dispensing: { placements: ['manual'] } }] })
const offered = (result: ReturnType<typeof plan>) => result.reasons.find((reason) => reason.details.cause === 'pretreatment_choice_needed')?.supplyId
const retryCause = (result: ReturnType<typeof plan>) => result.reasons.find((reason) => typeof reason.details.cause === 'string' && /^(stain_|pretreatment_|unknown_stain|unsupported_stain)/.test(reason.details.cause))?.details.cause
const retry = plan(retryInput('cotton'))
ok(!retry.reasons.some((reason) => reason.details.cause === 'unknown_stain_report'), 'a washed-out treatment the app recorded needs no prior-treatment review')
ok(retry.reasons.some((reason) => reason.details.cause === 'pretreatment_choice_needed' && reason.supplyId === 'oxy'), 'the second try offers a different chemistry first')
ok(retry.loads[0]?.treatments[0]?.timing?.startsWith('Rinse out the earlier product'), 'the second try starts by rinsing out the first')
const retryChosen = plan({ ...retryInput('cotton'), pretreatmentChoices: [{ textileId: 'retry-shirt', supplyId: 'oxy' }] })
equal(retryChosen.status, 'ready', 'the person’s choice authorizes the second try')
const sameChemistry = plan({ ...retryInput('cotton'), supplies: [stainSupply('protease', 'protease'), stainSupply('protease-2', 'protease')] })
ok(sameChemistry.reasons.some((reason) => reason.supplyId === 'protease-2' && reason.details.cause === 'pretreatment_choice_needed'), 'another product of the same chemistry is next, never the same product')
const nothingLeft = plan({ ...retryInput('cotton'), supplies: [stainSupply('protease', 'protease')] })
equal(retryCause(nothingLeft), 'stain_retry_unavailable', 'cotton may try again, but nothing on the shelf is a different safe try')
ok(nothingLeft.explanations.some((line) => line.text.includes('add a product whose label covers it')), 'an empty shelf is said as such')
const silkRetry = plan(retryInput('silk', undefined, { bleach: 'none' }))
equal(retryCause(silkRetry), 'stain_needs_cleaner', 'silk gets no second home try')
ok(silkRetry.explanations.some((line) => line.text.includes('a cleaner is the safest next step')), 'the cleaner reason is in plain words')
const unlabelled = plan({ ...retryInput('cotton'), supplies: [stainSupply('protease', 'protease'), stainSupply('oxy', 'oxygen_bleach')] })
equal(retryCause(unlabelled), 'stain_retry_unavailable', 'an oxygen bleach whose label never names protein stains is not a protein retry')
const tanninTried = [{ name: 'Oxygen soak', supplyId: 'oxy', chemistry: 'oxygen_bleach' as const, washedOut: true as const }]
const tanninInput = (protease: ReturnType<typeof stainSupply>) => ({ ...retryInput('cotton'), textiles: [retryShirt('cotton', tanninTried, {}, 'tannin')], supplies: [stainSupply('oxy', 'oxygen_bleach'), protease] })
equal(retryCause(plan(tanninInput(stainSupply('protease', 'protease')))), 'stain_retry_unavailable', 'a protease without tannin on its label is not offered for a tannin retry')
equal(offered(plan(tanninInput(labelled(stainSupply('protease', 'protease'), ['tannin'])))), 'protease', 'a protease labelled for tannin is')
// (a) A no-bleach tag or label rules out the oxygen retry; another protease product, or the shelf runs out.
equal(offered(plan(retryInput('cotton', washedOut, { bleach: 'none' }))), 'protease-2', 'a no-bleach tag skips the oxygen retry for another enzyme product')
equal(offered(plan(retryInput('cotton', washedOut, { restrictions: ['Do not bleach'] }))), 'protease-2', 'a do-not-bleach label skips the oxygen retry')
equal(offered(plan(retryInput('cotton', washedOut, { bleach: 'non_chlorine' }))), 'oxy', 'the non-chlorine triangle still allows an oxygen bleach')
equal(retryCause(plan({ ...retryInput('cotton', washedOut, { bleach: 'none' }), supplies: [stainSupply('protease', 'protease'), labelled(stainSupply('oxy', 'oxygen_bleach'), ['protein'])] })), 'stain_retry_unavailable', 'with only the bleach left the retry is unavailable')
// (b) A stale choice naming the product already tried never confirms it.
const staleRetry = plan({ ...retryInput('cotton'), pretreatmentChoices: [{ textileId: 'retry-shirt', supplyId: 'protease' }] })
ok(staleRetry.status !== 'ready' && offered(staleRetry) === 'oxy', 'a stale choice of the product already tried does not confirm it')
// (c) Dye or ink goes to the cleaner after a washed-out try.
equal(retryCause(plan({ ...retryInput('cotton'), textiles: [retryShirt('cotton', washedOut, {}, 'dye_ink_transfer')] })), 'stain_needs_cleaner', 'dye or ink gets no second home try')
// (d) Rust never repeats the same remover.
const rustSupply = (id: string) => { const base = stainSupply(id, 'surfactant'); return { ...base, stainChemistry: 'rust_remover', applicationRules: base.applicationRules.map((rule) => ({ ...rule, stainChemistry: 'rust_remover' })) } }
const rustTried = [{ name: 'Rust remover', supplyId: 'rust', chemistry: 'rust_remover' as const, washedOut: true as const }]
const rustInput = (supplies: readonly object[]) => ({ ...retryInput('cotton'), textiles: [retryShirt('cotton', rustTried, {}, 'rust_mineral')], supplies })
equal(retryCause(plan(rustInput([rustSupply('rust')]))), 'stain_retry_unavailable', 'rust never repeats the same remover')
equal(offered(plan(rustInput([rustSupply('rust'), rustSupply('rust-2')]))), 'rust-2', 'a different rust remover is the retry')
// (e) A soak retry is left out when the label forbids soaking.
const soakOxy = labelled(stainSupply('oxy-soak', 'oxygen_bleach'), ['protein'], { soak: { waterLitres: 4, minimumMinutes: 60, maximumMinutes: 360, maximumTemperatureC: 40, transfer: 'Wash as usual.' } })
const soakInput = (care?: RetryCare) => ({ ...retryInput('cotton', washedOut, care), supplies: [stainSupply('protease', 'protease'), stainSupply('protease-2', 'protease'), soakOxy] })
equal(offered(plan(soakInput())), 'oxy-soak', 'an oxygen soak labelled for protein is the retry')
equal(offered(plan(soakInput({ restrictions: ['Do not soak'] }))), 'protease-2', 'a do-not-soak label skips the soak retry')
const freeText = plan(retryInput('cotton', ['Enzyme spray']))
ok(freeText.reasons.some((reason) => reason.details.cause === 'unknown_stain_report'), 'free-text earlier treatments still need review')
const mixed = plan(retryInput('cotton', [...washedOut, 'something else']))
ok(mixed.reasons.some((reason) => reason.details.cause === 'unknown_stain_report'), 'one free-text entry still needs review')
equal([stainWashLimit('cotton', 'machine'), stainWashLimit('wool', 'machine'), stainWashLimit('rayon', 'machine'), stainWashLimit('cotton', 'dry_clean_only'), stainWashLimit(null, 'machine')].join(), '2,1,1,1,1', 'fabric sets the home stain tries')
equal(treatmentChemistry({ supplies: [stainSupply('oxy', 'oxygen_bleach')] }, { supplyId: 'oxy', ruleId: 'oxy-rule' }), 'oxygen_bleach', 'a planned step’s chemistry comes from its rule')

equal(sanitizedInvoiceGarments.length, 23, 'sanitized invoice contains physical garments')
equal(new Set(sanitizedInvoiceGarments.map((garment) => garment.id)).size, 23, 'invoice garment ids are unique')
equal(ownedWasherSupplies.length, 4, 'synthetic washer supply test cases are retained')
ok(ownedWasherSupplies.every((supply) => supply.labelEvidence?.status === 'verified'), 'pure planner fixture assumes evidence; household seeding downgrades it')
equal(ownedDispensingDevices.length, 2, 'dispensing devices are modeled separately from chemicals')
equal(ownedWasherMachines.map((machine) => machine.modelNumber).join(','), 'SWNNX2HP115TW01,SFNNXRSP115TW07', 'owned washer models are exact')
const allFixtureProducts = plan(washerPlannerFixture)
equal(allFixtureProducts.status, 'needs_confirmation', 'two rinse products sharing a dispenser cannot both be ready')
ok(allFixtureProducts.reasons.some((reason) => reason.code === 'shared_compartment_conflict'), 'correct sanitizer placement exposes the real dispenser conflict')
const washerFixtureResult = plan({ ...washerPlannerFixture, supplies: ownedWasherSupplies.filter((supply) => supply.kind === 'detergent') })
ok(washerFixtureResult.loads.length > 0, 'invoice fixture selects washer loads')
ok(washerFixtureResult.loads.every((load) => load.status === 'ready'), 'invoice fixture loads are ready')
ok(washerFixtureResult.loads.every((load) => load.treatments.every((step) => step.confirmation === 'confirmed')), 'invoice fixture treatments are confirmed')
ok(washerFixtureResult.loads.flatMap((load) => load.treatments).some((step) => step.dose.amount === 30 && step.placement === 'detergent_compartment' && step.timing === 'before cycle start'), 'detergent action is precise')

const unknownStain = plan({
  textiles: [{ id: 'unknown-stain', ownerId: 'alice', care: { washMethod: 'machine', cycle: 'normal' }, stainReport: { kind: 'unknown', priorTreatmentAttempts: [] } }],
  supplies: [detergent],
  machines: [machine],
})
equal(unknownStain.status, 'needs_confirmation', 'unknown stain kind needs confirmation')
ok(unknownStain.reasons.some((reason) => reason.details.cause === 'unknown_stain_report'), 'unknown stain reason is recorded')

const unknownPrior = plan({
  textiles: [{ id: 'unknown-prior', ownerId: 'alice', care: { washMethod: 'machine', cycle: 'normal' }, stainReport: { kind: 'protein' } }],
  supplies: [stainSupply('protease', 'protease')],
  machines: [{ ...machine, dispensing: { placements: ['manual'] } }],
})
equal(unknownPrior.status, 'needs_confirmation', 'unknown prior treatment needs confirmation')

const woolConflict = plan({
  textiles: [{ id: 'wool-protein', ownerId: 'alice', material: 'wool', care: { washMethod: 'machine', cycle: 'delicate', maxTemperatureC: 30 }, stainReport: { kind: 'protein', priorTreatmentAttempts: [] } }],
  supplies: [stainSupply('protease', 'protease')],
  machines: [{ ...machine, supportedCycles: ['delicate'], dispensing: { placements: ['manual'] } }],
})
equal(woolConflict.status, 'needs_confirmation', 'wool protease without explicit label safety needs confirmation')
ok(woolConflict.reasons.some((reason) => reason.details.cause === 'stain_care_conflict'), 'stain-care conflict is recorded')

const isolatedDye = plan({
  textiles: [
    { id: 'plain', ownerId: 'alice', care: { washMethod: 'machine', cycle: 'normal' } },
    { id: 'transfer', ownerId: 'alice', care: { washMethod: 'machine', cycle: 'normal' }, stainReport: { kind: 'dye_ink_transfer', priorTreatmentAttempts: [] } },
  ],
  supplies: [stainSupply('oxygen', 'oxygen_bleach')],
  machines: [{ ...machine, dispensing: { placements: ['manual'] } }],
})
equal(isolatedDye.loads.length, 2, 'dye transfer is isolated from the load')
ok(isolatedDye.loads.some((load) => load.treatments.some((treatment) => treatment.isolated === true)), 'dye treatment records isolation')

const oil = plan({
  pretreatmentChoices: [{ textileId: 'grease-shirt', supplyId: 'surfactant' }],
  textiles: [{ id: 'grease-shirt', ownerId: 'alice', care: { washMethod: 'machine', cycle: 'normal', maxTemperatureC: 40 }, stainReport: { kind: 'oil_grease', priorTreatmentAttempts: [] } }],
  supplies: [stainSupply('surfactant', 'surfactant')],
  machines: [{ ...machine, dispensing: { placements: ['manual'] } }],
})
equal(oil.status, 'ready', 'verified oil pretreatment is ready')
equal(oil.loads[0]?.treatments[0]?.temperatureC, 40, 'oil pretreatment uses the warmest care temperature')
equal(oil.loads[0]?.treatments[0]?.preventDrying, true, 'oil stain blocks drying until release')

const rustChlorine = plan({
  textiles: [{ id: 'rust-shirt', ownerId: 'alice', care: { washMethod: 'machine', cycle: 'normal' }, stainReport: { kind: 'rust_mineral', priorTreatmentAttempts: [] } }],
  supplies: [{
    id: 'chlorine',
    kind: 'bleach' as const,
    name: 'chlorine bleach',
    stainChemistry: 'chlorine_bleach',
    labelEvidence: { status: 'verified' as const },
    formulation: { form: 'liquid' },
    applicationRules: [{ id: 'chlorine-rule', dose: { amount: 10, unit: 'ml' }, placement: 'manual', evidence: { status: 'verified' as const } }],
  }],
  machines: [{ ...machine, dispensing: { placements: ['manual'] } }],
})
equal(rustChlorine.status, 'needs_confirmation', 'rust never defaults to chlorine bleach')
ok(rustChlorine.loads[0]?.treatments.every((treatment) => treatment.supplyId !== 'chlorine'), 'chlorine is not selected for rust')

// The shared physical sequence: the label decides the phase, and a locked door pulls mid-cycle steps forward.
const frontDoor = { applianceType: 'front_load_washer' }
const topLid = { applianceType: 'top_load_washer' }
equal(doorLocksDuringCycle(frontDoor), true, 'a front-loader locks its door')
equal(doorLocksDuringCycle(topLid), false, 'a top-loader can be opened mid-cycle')
equal(doorLocksDuringCycle({ applianceType: 'top_load_washer', doorLocksDuringCycle: true }), true, 'an explicit door lock wins over the appliance type')
equal(doorLocksDuringCycle(null), false, 'an unknown machine is assumed to open')
equal(labelTreatmentPhase({ placement: 'detergent_compartment', timing: 'at the start of the rinse' }), 'dispenser', 'compartments are dispenser steps whatever the timing')
equal(labelTreatmentPhase({ placement: 'downy_ball', timing: null }), 'with_load', 'a dispensing ball goes in with the load')
equal(labelTreatmentPhase({ placement: 'direct_to_drum', timing: 'before loading garments' }), 'drum', 'a product added before loading goes in the empty drum')
equal(labelTreatmentPhase({ placement: 'direct_to_drum', timing: 'before cycle start' }), 'with_load', 'a product added before the cycle goes in with the load')
equal(labelTreatmentPhase({ placement: 'direct_to_drum', timing: 'at the start of the rinse' }), 'cycle', 'a rinse addition by hand is a mid-cycle step')
equal(treatmentPhase({ placement: 'direct_to_drum', timing: 'at the start of the rinse' }, topLid), 'cycle', 'a top-loader takes the rinse step mid-cycle')
equal(treatmentPhase({ placement: 'direct_to_drum', timing: 'at the start of the rinse' }, frontDoor), 'with_load', 'a front-loader takes everything before Start')

// Drying is appended after the wash and never reorders it; only washer prep is refused behind a locked door.
deepEqual(phaseOrder, ['drum', 'load', 'drum_fullness', 'with_load', 'close', 'dispenser', 'start', 'cycle', 'hold_out', 'dryer_load', 'dryer_fullness', 'dryer_with_load', 'dryer_start', 'dryer_unload'], 'dryer phases follow the wash in physical order')
deepEqual([...washerPrepPhases], ['drum', 'load', 'drum_fullness', 'with_load', 'close', 'dispenser'], 'washer prep is everything before Start')
ok([...dryerPhases].every((phase) => isDryerPhase(phase) && phaseOrder.indexOf(phase) > phaseOrder.indexOf('cycle')), 'every dryer phase comes after the cycle')
ok(!isDryerPhase('cycle') && !isDryerPhase('start'), 'washer phases are not dryer phases')
equal(doorLocksDuringCycle({ applianceType: 'tumble_dryer', doorLocksDuringCycle: true }), false, 'a dryer door never locks the person out')
equal(labelTreatmentPhase({ placement: 'dryer_drum', timing: 'at the start of the rinse' }), 'dryer_with_load', 'a dryer product goes in with the garments in the dryer')
equal(treatmentPhase({ placement: 'dryer_drum', timing: null }, frontDoor), 'dryer_with_load', 'a locked washer door does not move dryer products')
equal(washerClass({ applianceType: 'front_load_washer' }), null, 'HE is never assumed, even for a front-loader')
equal(washerClass({ applianceType: 'top_load_washer' }), null, 'an unset top-loader is unknown')
equal(washerClass({ applianceType: 'top_load_washer', highEfficiency: true }), 'he', 'a recorded HE washer is HE')
equal(washerClass({ applianceType: 'front_load_washer', highEfficiency: false }), 'standard', 'a recorded standard washer is standard')
deepEqual(machineClasses({ applianceType: 'front_load_washer', highEfficiency: true }), ['front_load_washer', 'he'], 'machine classes are the type plus the recorded class')
deepEqual(machineClasses({ applianceType: 'front_load_washer' }), ['front_load_washer'], 'an unknown class is left out')

// The shared evidence policy.
equal(evidenceLevel('pretty sure'), 'unknown', 'unrecognized evidence levels fail closed')
equal(evidenceLevel(undefined), 'unknown', 'missing evidence is unknown')
ok(evidencePolicy.careConfirmed('verified') && evidencePolicy.careConfirmed('observed') && !evidencePolicy.careConfirmed('user-supplied'), 'care is confirmed only from the label or a direct check')
ok(evidencePolicy.supplyUsable('verified') && evidencePolicy.supplyUsable('observed') && !evidencePolicy.supplyUsable('user-supplied') && !evidencePolicy.supplyUsable('unknown'), 'product labels must have been read, by the person tapping it counts')
ok(evidencePolicy.ruleUsable('verified') && evidencePolicy.ruleUsable('observed') && !evidencePolicy.ruleUsable('user-supplied') && !evidencePolicy.ruleUsable('estimated'), 'dose rules must have been read')
ok(evidencePolicy.machineUsable('estimated') && !evidencePolicy.machineUsable('unknown'), 'machines plan with any recorded evidence except unknown')

const drumWasher = { ...machine, id: 'drum-washer', applianceType: 'top_load_washer', highEfficiency: false, dispensing: { placements: ['direct_to_drum'] } }
const drumDetergent = { ...detergent, applicationRules: [{ ...detergent.applicationRules[0]!, placement: 'direct_to_drum', timing: 'before loading the clothes' }] }
const oxiClean = {
  id: 'oxiclean',
  kind: 'booster',
  labelEvidence: { status: 'verified' as const },
  formulation: { form: 'powder' },
  applicationRules: [{ id: 'oxiclean-rule', dose: { amount: 30, unit: 'g' }, stage: 'wash' as const, placement: 'direct_to_drum', timing: 'before loading the clothes', evidence: { status: 'verified' as const } }],
}
const drumPair = plan({ ...fixture, textiles: [fixture.textiles![2]!], supplies: [drumDetergent, oxiClean], optionalSupplyIds: [oxiClean.id], machines: [drumWasher], preferences: { preferredMachineId: 'drum-washer' } })
equal(drumPair.status, 'ready', 'detergent and OxiClean in the empty drum for the wash do not share a slot')
ok(!drumPair.reasons.some((reason) => reason.code === 'shared_compartment_conflict'), 'no shared compartment conflict for drum wash products')
const drumPairIncompatible = plan({ ...fixture, textiles: [fixture.textiles![2]!], optionalSupplyIds: [oxiClean.id], supplies: [drumDetergent, { ...oxiClean, applicationRules: [{ ...oxiClean.applicationRules[0]!, incompatibleSupplyIds: ['detergent'] }] }], machines: [drumWasher], preferences: { preferredMachineId: 'drum-washer' } })
equal(drumPairIncompatible.status, 'needs_confirmation', 'an incompatible drum pair still asks')
ok(drumPairIncompatible.reasons.some((reason) => reason.details.cause === 'chemical_combination_conflict'), 'the chemical check runs for drum pairs')
const rinseSanitizer = { ...rinseByHand, id: 'lysol', applicationRules: [{ ...rinseByHand.applicationRules[0]!, id: 'lysol-rule' }] }
const drumRinsePair = plan({ ...fixture, textiles: [fixture.textiles![2]!], supplies: [drumDetergent, rinseByHand, rinseSanitizer], optionalSupplyIds: [rinseByHand.id, rinseSanitizer.id], machines: [drumWasher], preferences: { preferredMachineId: 'drum-washer' } })
ok(drumRinsePair.reasons.some((reason) => reason.code === 'shared_compartment_conflict'), 'two products in the rinse water still ask')

await import(`./physical.test${'.ts'}`)
// Chemical decisions use recorded facts, including treatments applied before the wash.
const stainedShirt = { ...fixture.textiles![0]!, material: 'cotton', stainReport: { kind: 'protein' as const, priorTreatmentAttempts: [] } }
const pretreat = stainSupply('pretreat', 'protease')
const pretreatConflict = plan({ ...fixture, pretreatmentChoices: [{ textileId: stainedShirt.id, supplyId: pretreat.id }], textiles: [stainedShirt], supplies: [detergent, { ...pretreat, applicationRules: pretreat.applicationRules.map((rule) => ({ ...rule, incompatibleSupplyIds: [detergent.id] })) }] })
equal(pretreatConflict.status, 'needs_confirmation', 'pretreatment and wash product cannot bypass combination checks')
ok(pretreatConflict.reasons.some((reason) => reason.details.cause === 'chemical_combination_conflict'), 'pretreatment conflict is explained')
const ordinaryAndPretreat = plan({ ...fixture, pretreatmentChoices: [{ textileId: stainedShirt.id, supplyId: detergent.id }], textiles: [stainedShirt], supplies: [{ ...detergent, applicationRules: [...detergent.applicationRules!, { ...pretreat.applicationRules[0]!, supplyId: detergent.id }] }] })
equal(ordinaryAndPretreat.status, 'ready', 'a product can have separate wash and pretreatment label rules')
const selfConflict = plan({ ...fixture, pretreatmentChoices: [{ textileId: stainedShirt.id, supplyId: detergent.id }], textiles: [stainedShirt], supplies: [{ ...detergent, incompatibleSupplyIds: [detergent.id], applicationRules: [...detergent.applicationRules!, { ...pretreat.applicationRules[0]!, supplyId: detergent.id }] }] })
const selfPair = selfConflict.reasons.find((reason) => reason.details.cause === 'chemical_combination_conflict')
equal(selfPair?.supplyId, detergent.id, 'a conflict between one product\'s own pretreatment and wash steps names that product as its source')
equal(ordinaryAndPretreat.loads[0]?.treatments.length, 2, 'both label uses survive')
const noNameGuess = plan({ ...fixture, optionalSupplyIds: [detergent.id], supplies: [{ ...detergent, name: 'Oxygen chlorine Oxi bleach', kind: 'chemical_consumable', bleachKind: 'unknown' }] })
ok(noNameGuess.reasons.some((reason) => reason.details.cause === 'product_safety_needed'), 'a suggestive name cannot establish bleach chemistry')
const earlierTreatment = plan({ ...fixture, textiles: [{ ...stainedShirt, stainReport: { kind: 'protein', priorTreatmentAttempts: ['unknown household cleaner'] } }], supplies: [pretreat] })
equal(earlierTreatment.status, 'needs_confirmation', 'recording an earlier treatment does not prove compatibility')
const nextSafeCandidate = plan({ ...fixture, textiles: [stainedShirt], supplies: [{ ...pretreat, id: 'a-incompatible', incompatibleMaterials: ['cotton'] }, { ...pretreat, id: 'b-supported' }] })
equal(nextSafeCandidate.loads[0]?.treatments[0]?.supplyId, 'b-supported', 'select a supported compatible candidate, not the first product id')

const missingMaterial = plan({ ...fixture, textiles: [{ ...stainedShirt, material: null }], supplies: [{ ...pretreat, incompatibleMaterials: ['wool'] }] })
equal(missingMaterial.status, 'needs_confirmation', 'unknown material cannot bypass a label restriction')
const capitalizedMaterial = plan({ ...fixture, pretreatmentChoices: [{ textileId: stainedShirt.id, supplyId: pretreat.id }], textiles: [{ ...stainedShirt, material: 'Cotton' }], supplies: [{ ...pretreat, applicationRules: [{ ...pretreat.applicationRules[0]!, safeMaterials: ['cotton'] }] }] })
equal(capitalizedMaterial.status, 'ready', 'material case does not change label compatibility')
const restrictedWash = plan({ ...fixture, textiles: [{ ...stainedShirt, stainReport: undefined }], supplies: [{ ...detergent, applicationRules: [{ ...detergent.applicationRules[0]!, incompatibleMaterials: ['Cotton'] }] }] })
ok(restrictedWash.reasons.some((reason) => reason.details.cause === 'product_material_conflict'), 'wash rule material restrictions are enforced too')
const leftOutRestriction = plan({ ...fixture, textiles: [{ ...stainedShirt, stainReport: undefined }], supplies: [detergent, { ...detergent, id: 'restricted', incompatibleMaterials: ['cotton'] }], excludedSupplyIds: ['restricted'] })
equal(leftOutRestriction.status, 'ready', 'leaving a restricted product out does not exclude the garment')
const sizeWarning = plan({ ...fixture, pretreatmentChoices: [{ textileId: stainedShirt.id, supplyId: pretreat.id }], textiles: [stainedShirt], supplies: [pretreat, { ...detergent, applicationRules: [
  { ...detergent.applicationRules[0]!, id: 'small', conditions: { loadSizes: ['small', 'medium'] } },
  { ...detergent.applicationRules[0]!, id: 'large', conditions: { loadSizes: ['large', 'extra_large'] }, incompatibleSupplyIds: [pretreat.id] },
] }] })
ok(sizeWarning.reasons.some((reason) => reason.details.cause === 'chemical_combination_conflict'), 'equal dose rows must not erase a different safety warning')

const stainInput = { ...fixture, textiles: [stainedShirt], supplies: [pretreat] }
const suggested = plan(stainInput)
equal(suggested.status, 'needs_confirmation', 'a compatible suggestion is not a person’s pretreatment choice')
ok(suggested.reasons.some((reason) => reason.details.cause === 'pretreatment_choice_needed' && reason.supplyId === pretreat.id && reason.textileIds.includes(stainedShirt.id)), 'choice issue names the piece and recorded product')
equal(suggested.loads[0]?.treatments[0]?.confirmation, 'needs_confirmation', 'unselected pretreatment is not authorized')
const chosen = plan({ ...stainInput, pretreatmentChoices: [{ textileId: stainedShirt.id, supplyId: pretreat.id }] })
equal(chosen.status, 'ready', 'explicit compatible choice authorizes the recipe step')
equal(chosen.loads[0]?.treatments[0]?.confirmation, 'confirmed', 'chosen recipe step retains evidence confirmation')
ok(chosen.inputHash !== suggested.inputHash, 'the choice changes the plan identity')
const staleChoice = plan({ ...stainInput, pretreatmentChoices: [{ textileId: stainedShirt.id, supplyId: 'gone-product' }] })
equal(staleChoice.status, 'needs_confirmation', 'a missing choice cannot silently authorize the suggested replacement')
const excludedChoice = plan({ ...stainInput, pretreatmentChoices: [{ textileId: stainedShirt.id, supplyId: pretreat.id }], excludedSupplyIds: [pretreat.id] })
equal(excludedChoice.status, 'needs_confirmation', 'an excluded product is not revived by a saved choice')
const priorChoice = plan({ ...stainInput, textiles: [{ ...stainedShirt, stainReport: { kind: 'protein', priorTreatmentAttempts: ['unknown cleaner'] } }], pretreatmentChoices: [{ textileId: stainedShirt.id, supplyId: pretreat.id }] })
ok(priorChoice.reasons.some((reason) => reason.details.cause === 'unknown_stain_report'), 'choosing a product cannot bypass prior-treatment review')
const secondChoice = plan({ ...stainInput, supplies: [{ ...pretreat, id: 'a-supported' }, { ...pretreat, id: 'b-supported' }], pretreatmentChoices: [{ textileId: stainedShirt.id, supplyId: 'b-supported' }] })
equal(secondChoice.loads[0]?.treatments[0]?.supplyId, 'b-supported', 'an eligible explicit choice takes precedence over suggestion order')

console.log('planner checks passed')

// Wool and silk are protein; protease breaks protein down. A detergent with protease present, or not
// recorded, never washes them; an explicit "absent" record does. Other fibers are unaffected.
{
  const protease = (status: 'present' | 'absent') => ({ kind: 'protease' as const, status, variant: 'synthetic', market: 'US', formulationRevision: '1', source: 'synthetic-label', retrievedAt: 0, scope: status === 'absent' ? 'explicit_absence' as const : 'ingredient_disclosure' as const })
  const gentleFixture = { ...fixture, machines: [{ ...machine, supportedCycles: ['normal', 'delicate'] }] }
  const wool = { ...fixture.textiles![0]!, id: 'wool-sweater', firstWash: false, material: 'wool', care: { washMethod: 'machine' as const, cycle: 'delicate', maxTemperatureC: 30 } }
  const causes = (result: PlanResult) => result.reasons.map((reason) => reason.details.cause)
  const withEnzymes = plan({ ...gentleFixture, textiles: [wool], supplies: [{ ...detergent, capabilities: [protease('present')] }] })
  ok(causes(withEnzymes).includes('protein_fiber_enzyme'), 'protease present blocks a wool load')
  ok(withEnzymes.status !== 'ready', 'a wool load with a protease detergent is not ready')
  equal(withEnzymes.loads.length, 0, 'the only piece is wool and the product has protease: there is no load')
  equal(withEnzymes.exclusions[0]?.textileId, 'wool-sweater', 'the wool piece is held out with a reason')
  // A mixed hamper: the wool waits, the cotton washes. A known product says so; an unrecorded one says it could not be confirmed.
  const tee = { ...fixture.textiles![0]!, id: 'cotton-tee', firstWash: false, material: 'cotton' }
  for (const [recorded, cause] of [[[protease('present')], 'protein_fiber_enzyme'], [undefined, 'protein_fiber_enzyme_unknown']] as const) {
    const mixed = plan({ ...gentleFixture, textiles: [wool, tee], supplies: [{ ...detergent, ...(recorded === undefined ? {} : { capabilities: recorded }) }] })
    deepEqual(mixed.loads.flatMap((load) => load.textileIds), ['cotton-tee'], 'only the cotton goes ahead')
    const held = mixed.exclusions.find((entry) => entry.textileId === 'wool-sweater')
    ok(held !== undefined && mixed.reasons.some((reason) => held.reasonIds.includes(reason.id) && reason.code === 'product_restriction' && reason.details.cause === cause), `wool is held with ${cause}`)
    ok(!mixed.reasons.some((reason) => reason.code === 'needs_confirmation' && reason.details.cause === cause), 'the cotton load is not blocked by the wool')
  }
  const unrecorded = plan({ ...gentleFixture, textiles: [wool], supplies: [detergent] })
  ok(causes(unrecorded).includes('protein_fiber_enzyme_unknown'), 'unrecorded protease is never guessed safe for wool')
  const enzymeFree = plan({ ...gentleFixture, textiles: [wool], supplies: [{ ...detergent, capabilities: [protease('absent')] }] })
  ok(!causes(enzymeFree).some((cause) => String(cause).startsWith('protein_fiber')), 'an explicitly enzyme-free detergent washes wool')
  const silkBlend = plan({ ...gentleFixture, textiles: [{ ...wool, id: 'silk-blouse', material: 'Silk blend' }], supplies: [{ ...detergent, capabilities: [protease('present')] }] })
  ok(causes(silkBlend).includes('protein_fiber_enzyme'), 'a silk blend counts as silk')
  const cotton = plan({ ...gentleFixture, textiles: [{ ...wool, id: 'cotton-tee', material: 'cotton' }], supplies: [{ ...detergent, capabilities: [protease('present')] }] })
  ok(!causes(cotton).some((cause) => String(cause).startsWith('protein_fiber')), 'cotton is unaffected by protease')
}
