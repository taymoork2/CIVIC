import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compileDirections, doseEquivalent, plan, productLoadFingerprint, productWashContextFingerprint, sourceMaterialAllowed, sourceMixingConflict, type PlannerInput, type SupplyItem, type TextileEvidence } from './index.ts'
import { nativeDoseProblem, materialFibers } from './product-contract.ts'
import { normalizeFabricDetails } from './fabric-details.ts'

const textiles: TextileEvidence[] = [{ id: 'shirt', material: 'cotton', colorGroup: 'white', bulkUnits: 1, soilLevel: 'normal', care: { washMethod: 'machine', cycle: 'normal', status: 'confirmed', bleach: 'any' } }]
const detergent: SupplyItem = { id: 'detergent', kind: 'detergent', use: 'detergent', bleachKind: 'none', labelEvidence: { status: 'verified' }, applicationRules: [{ id: 'detergent-dose', dose: { amount: 20, unit: 'ml' }, stage: 'wash', placement: 'direct_to_drum', timing: 'before clothes', evidence: { status: 'verified' } }] }
const booster: SupplyItem = { id: 'oxi', kind: 'chemical_consumable', use: 'booster', bleachKind: 'oxygen', labelEvidence: { status: 'verified' }, sourceContract: { digest: 'source-v1', mixing: 'regular_detergent_only', excludedFibers: ['wool', 'silk', 'leather'], requireKnownMaterial: true, requireColorfastness: true }, measurement: { kind: 'count', countUnit: 'pod' }, applicationRules: [{ id: 'oxi-dose', dose: { amount: 1, unit: 'pod' }, stage: 'wash', placement: 'direct_to_drum', timing: 'intact Pak before clothes', evidence: { status: 'verified' } }] }
const machine: NonNullable<PlannerInput['machines']>[number] = { id: 'washer', modelId: 'synthetic', highEfficiency: true, applianceType: 'front_load_washer', capacityUnits: 8, capacityConfidence: 'verified', evidence: { status: 'verified' }, supportedCycles: ['normal'], dispensing: { placements: ['direct_to_drum', 'softener_compartment'] } }
const check = (supply = booster, garments = textiles) => ({ supplyId: supply.id, sourceDigest: supply.sourceContract!.digest, loadFingerprint: productLoadFingerprint(garments), colorfastnessChecked: true })
const compute = (extra: Partial<PlannerInput> = {}) => plan({ textiles, optionalSupplyIds: ['oxi'], machines: [machine], ...extra, supplies: (extra.supplies ?? [detergent, booster]).map((supply) => ({ formulation: { form: 'liquid' }, ...supply })) })

test('recognized label qualifiers preserve constituent checks without accepting ambiguous brands', () => {
  assert.deepEqual(materialFibers('95% Supima cotton, 5% spandex'), ['cotton', 'elastane'])
  assert.deepEqual(materialFibers('TENCEL Modal / nylon'), ['modal', 'nylon'])
  assert.equal(sourceMaterialAllowed(booster.sourceContract!, 'Pima cotton / merino wool'), false)
  for (const material of ['Mystery cotton', 'cotton / TENCEL', 'cotton / microfiber', 'cotton / GORE-TEX', 'bamboo', 'olefin', 'constructor', '__proto__']) assert.equal(materialFibers(material), null)
  assert.deepEqual(materialFibers('viscose made from bamboo'), ['rayon'])
  assert.deepEqual(normalizeFabricDetails({ fibers: [{ fiber: ' Cotton ', details: [' Supima ', 'supima'] }], construction: ['Jersey'], finishes: [] }), { fibers: [{ fiber: 'cotton', details: ['Supima'] }], construction: ['Jersey'] })
  assert.throws(() => normalizeFabricDetails({ fibers: [{ fiber: 'cotton', details: ['x'.repeat(61)] }] }))
  assert.throws(() => normalizeFabricDetails({ finishes: Array.from({ length: 11 }, () => 'Unknown') }))
})

test('native qualifiers compile, reject invented fractions and never return calibrated equivalents', () => {
  const table = { measure: { kind: 'cap' as const, marks: [{ label: 'Bar 2', amount: 50, unit: 'ml' }] }, stage: 'wash', placement: 'direct_to_drum', timing: 'before clothes', rows: [{ cells: [{ amount: 1, unit: 'cap', mark: 'Bar 2', target: 'below' as const }] }] }
  const compiled = compileDirections(table, 'chemical')
  assert.ok(compiled.ok)
  assert.deepEqual(compiled.rules[0]!.dose, { amount: 1, unit: 'cap', mark: 'Bar 2', target: 'below' })
  assert.equal(doseEquivalent(compiled.rules[0]!.dose, table.measure), null)
  assert.match(nativeDoseProblem({ ...compiled.rules[0]!.dose, fractionOfMark: 0.8 })!, /qualitative/)
  assert.equal(nativeDoseProblem({ amount: 0.25, unit: 'US_cup', approximate: true }), null)
  assert.equal(nativeDoseProblem({ amount: 0.5, unit: 'dispenser' }), null)
  assert.notEqual(nativeDoseProblem({ amount: 0.25, unit: 'US_cup' }), null)
  assert.notEqual(nativeDoseProblem({ amount: 0.5, unit: 'dispenser', mark: 'half' }), null)
})

test('exclusions include blends and missing material; regular detergent exception excludes future chemicals', () => {
  for (const material of [undefined, '', 'unknown', 'unrecorded', 'mystery fabric', 'cotton/mystery blend', 'cotton/wool blend', 'cashmere', '95% cotton, 5% silk', 'leather']) assert.equal(sourceMaterialAllowed(booster.sourceContract!, material), false)
  assert.equal(sourceMaterialAllowed(booster.sourceContract!, 'cotton/polyester blend'), true)
  assert.equal(sourceMixingConflict(booster, detergent), false)
  assert.equal(sourceMixingConflict(booster, { ...detergent, capabilities: [{ kind: 'oxygen_bleaching', status: 'present', variant: 'exact', market: 'US', formulationRevision: 'v1', source: 'recorded', retrievedAt: 1, scope: 'ingredient_disclosure' }] }), true)
  assert.equal(sourceMixingConflict(booster, { ...detergent, chemistry: 'chlorine_bleach' }), true)
  for (const other of [booster, { ...detergent, id: 'future-booster', use: 'booster' }, { ...detergent, id: 'future-sanitizer', use: 'sanitizer' }, { ...detergent, id: 'uncertain', bleachKind: 'unknown' as const }]) assert.equal(sourceMixingConflict(booster, other), true)
  const downy = { ...booster, sourceContract: { digest: 'downy', mixing: 'no_bleach_or_liquid_softener' as const } }
  assert.equal(sourceMixingConflict(downy, detergent), false)
  assert.equal(sourceMixingConflict(downy, booster), true)
  assert.equal(sourceMixingConflict(downy, { ...detergent, id: 'new-softener', use: 'softener', form: 'liquid' }), true)
})

test('planning refuses absent/stale colorfastness checks and later additional supplies', () => {
  assert.equal(compute().status, 'needs_confirmation')
  const result = compute({ productLoadConfirmations: [check()] })
  assert.equal(result.status, 'ready', JSON.stringify(result.reasons))
  assert.equal(result.loads[0]!.treatments.find((step) => step.supplyId === 'oxi')?.confirmation, 'confirmed')
  for (const confirmation of [{ ...check(), colorfastnessChecked: false }, { ...check(), sourceDigest: 'old' }, { ...check(), loadFingerprint: 'old' }]) assert.equal(compute({ productLoadConfirmations: [confirmation] }).status, 'needs_confirmation')
  const changed = [{ ...textiles[0]!, material: 'cotton/wool blend' }]
  assert.equal(compute({ textiles: changed, productLoadConfirmations: [check(booster, changed)] }).status, 'needs_confirmation')
  const future = { ...booster, id: 'new-booster', sourceContract: undefined }
  const added = compute({ supplies: [detergent, booster, future], optionalSupplyIds: ['oxi', 'new-booster'], productLoadConfirmations: [check()] })
  assert.equal(added.status, 'needs_confirmation')
  assert.ok(added.reasons.some((reason) => reason.details.cause === 'chemical_combination_conflict'))
  assert.notEqual(productLoadFingerprint([{ ...textiles[0]!, colorGroup: 'dark' }]), check().loadFingerprint)
})

test('product and rule restrictions check every blend constituent and keep unknown fibers unconfirmed', () => {
  const blend = '80% cotton, 20% polyester'
  const restricted = { ...detergent, compatibleMaterials: ['cotton', 'polyester'] }
  const result = (material: string, supply: SupplyItem = restricted) => compute({ textiles: [{ ...textiles[0]!, material }], supplies: [supply], optionalSupplyIds: [] })
  assert.equal(result(blend).status, 'ready')
  for (const material of ['80% cotton, 20% wool', '95% cotton, 5% Cashmere', '80% cotton, 20% Mystery']) assert.notEqual(result(material).status, 'ready', material)
  assert.notEqual(result(blend, { ...detergent, incompatibleMaterials: ['polyester'] }).status, 'ready')
  assert.notEqual(result(blend, { ...detergent, applicationRules: [{ ...detergent.applicationRules![0]!, safeMaterials: ['cotton'] }] }).status, 'ready')
  assert.equal(result(blend, { ...detergent, applicationRules: [{ ...detergent.applicationRules![0]!, safeMaterials: ['cotton', 'polyester'] }] }).status, 'ready')
  assert.notEqual(result('cotton', { ...detergent, compatibleMaterials: ['cotton/wool blend'] }).status, 'ready', 'a specific blend permission cannot authorize a pure constituent')
  assert.equal(sourceMaterialAllowed(booster.sourceContract!, blend), true)
  assert.equal(sourceMaterialAllowed(booster.sourceContract!, '95% cotton, 5% Cashmere'), false)
  assert.doesNotThrow(() => compute({
    textiles: [{ ...textiles[0]!, material: 'wool [', stainReport: { kind: 'protein', priorTreatmentAttempts: [] } }],
    supplies: [{ ...detergent, chemistry: 'protease', applicationRules: [{ ...detergent.applicationRules![0]!, stage: 'pretreat', safeMaterials: ['wool'], stainKinds: ['protein'] }] }],
    optionalSupplyIds: [],
  }), 'a typed material is literal text, never a regular expression')
})

test('PODS source categories require explicit selection and never inherit app fullness bins', () => {
  const pods: SupplyItem = { ...detergent, id: 'pods', use: 'pods', measurement: { kind: 'count', countUnit: 'pod' }, sourceContract: { digest: 'pods-source', sourceLoadCategories: ['smaller', 'standard', 'larger'] }, applicationRules: ['smaller', 'standard', 'larger'].map((category, index) => ({ id: category, conditions: { sourceLoadCategories: [category as 'smaller' | 'standard' | 'larger'] }, dose: { amount: index + 1, unit: 'pod' }, stage: 'wash', placement: 'direct_to_drum', timing: 'dry hands; intact pac before clothes', evidence: { status: 'verified' } })) }
  assert.equal(compute({ supplies: [pods], optionalSupplyIds: [] }).status, 'needs_confirmation')
  assert.equal(compute({ supplies: [pods], optionalSupplyIds: [], productLoadConfirmations: [{ ...check(pods), sourceLoadCategory: 'normal' }] }).status, 'needs_confirmation')
  for (const [index, sourceLoadCategory] of ['smaller', 'standard', 'larger'].entries()) {
    const result = compute({ supplies: [pods], optionalSupplyIds: [], productLoadConfirmations: [{ ...check(pods), sourceLoadCategory: sourceLoadCategory as 'smaller' | 'standard' | 'larger' }] })
    assert.equal(result.status, 'ready', JSON.stringify(result.reasons))
    assert.equal(result.loads[0]?.treatments[0]?.dose.amount, index + 1)
    assert.equal(result.loads[0]?.treatments[0]?.atMachine, undefined)
  }
})

test('White Revive ordinary-route inspection binds the exact washer, program/options and temperature', () => {
  const paks = { ...booster, sourceContract: { ...booster.sourceContract!, requireOrdinaryWashRoute: true } }
  const computePaks = (extra: Partial<PlannerInput> = {}) => compute({ supplies: [detergent, paks], ...extra })
  const colorCheck = check(paks)
  assert.equal(computePaks({ productLoadConfirmations: [colorCheck] }).status, 'needs_confirmation')
  const requirement = computePaks({ productLoadConfirmations: [colorCheck] }).loads[0]!.treatments.find((step) => step.supplyId === 'oxi')!.productRequirement!
  assert.equal(requirement.ordinaryWashRouteRequired, true)
  const accepted = { ...colorCheck, ordinaryWashRouteChecked: true, washContextFingerprint: requirement.washContextFingerprint! }
  assert.equal(computePaks({ productLoadConfirmations: [accepted] }).status, 'ready')
  assert.equal(computePaks({ productLoadConfirmations: [{ ...accepted, ordinaryWashRouteChecked: false }] }).status, 'needs_confirmation')
  for (const changedMachine of [{ ...machine, id: 'other' }, { ...machine, cycleProfile: { normal: { maximumTemperatureC: 30 } } }, { ...machine, washOptions: ['extra_water'] }]) assert.equal(computePaks({ machines: [changedMachine], productLoadConfirmations: [accepted] }).status, 'needs_confirmation')
  assert.notEqual(productWashContextFingerprint(machine, 'normal', 30), productWashContextFingerprint(machine, 'normal', 40))
  assert.notEqual(productWashContextFingerprint(machine, 'normal', 30), productWashContextFingerprint(machine, 'delicate', 30))
})
