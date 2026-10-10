import assert from 'node:assert/strict'

import type { ApplicationConditions, ApplicationRule, MachineEvidence, PlanResult, PlannerInput, SupplyItem, TextileEvidence } from './index'

const { plan, loadSizeFor, ruleDose } = (await import(`./index${'.ts'}`)) as typeof import('./index')

const verified = { status: 'verified' as const }

function washer(extra: Partial<MachineEvidence> = {}): MachineEvidence {
  return {
    id: 'washer',
    modelId: 'synthetic-washer',
    applianceType: 'front_load_washer',
    highEfficiency: true,
    capacityUnits: 8,
    capacityConfidence: 'verified',
    evidence: verified,
    supportedCycles: ['normal'],
    dispensing: { placements: ['detergent_compartment'] },
    ...extra,
  }
}

function capRule(id: string, conditions: ApplicationConditions | undefined, mark: string | undefined, extra: Partial<ApplicationRule> = {}): ApplicationRule {
  return {
    id,
    ...(conditions === undefined ? {} : { conditions }),
    dose: { amount: 1, unit: 'cap', ...(mark === undefined ? {} : { mark }) },
    stage: 'wash',
    placement: 'detergent_compartment',
    timing: 'before cycle start',
    evidence: verified,
    ...extra,
  }
}

function capDetergent(rules: ApplicationRule[]): SupplyItem {
  return {
    id: 'tide',
    kind: 'detergent',
    labelEvidence: { status: 'verified', source: 'tide-label' },
    formulation: { form: 'liquid' },
    measurement: { kind: 'cap', marks: [{ label: '1' }, { label: '3', amount: 39, unit: 'ml' }, { label: '5' }] },
    applicationRules: rules,
  }
}

function tees(count: number, soilLevel?: 'light' | 'normal' | 'heavy', prefix = soilLevel ?? 'unrecorded'): TextileEvidence[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${String(index + 1).padStart(2, '0')}`,
    colorGroup: 'white' as const,
    bulkUnits: 1,
    care: { washMethod: 'machine' as const, cycle: 'normal', status: 'confirmed' as const },
    ...(soilLevel === undefined ? {} : { soilLevel }),
  }))
}

function dosePlan(rules: ApplicationRule[], textiles: TextileEvidence[], machine: MachineEvidence = washer()): PlanResult {
  return plan({ textiles, supplies: [capDetergent(rules)], machines: [machine] })
}

const doseStep = (result: PlanResult) => result.loads[0]?.treatments.find((step) => step.supplyId === 'tide')
const markOf = (result: PlanResult) => doseStep(result)?.confirmation === 'confirmed' ? doseStep(result)?.dose.mark : undefined
const blocker = (result: PlanResult) => result.reasons.find((reason) => reason.code === 'needs_confirmation' && reason.supplyId === 'tide')
const explanation = (result: PlanResult) => result.explanations.find((entry) => entry.reasonId === blocker(result)?.id)?.text ?? ''

// Sizes by quarters of a capacity; the planner never doses by them.
assert.equal(loadSizeFor(2, 8), 'small', 'a quarter drum is small')
assert.equal(loadSizeFor(4, 8), 'medium', 'half a drum is medium')
assert.equal(loadSizeFor(6, 8), 'large', 'three quarters is large')
assert.equal(loadSizeFor(7, 8), 'extra_large', 'beyond three quarters is extra large')
assert.equal(loadSizeFor(4, null), null, 'no capacity, no size')
assert.equal(dosePlan([capRule('any', undefined, '1')], tees(6)).loads[0]?.loadSize, null, 'a load never carries an estimated size')

// Cap marks: the printed mark, every mark on the cap, and the printed volume only when the label prints one.
const normal3 = dosePlan([capRule('normal', { soilLevels: ['normal'] }, '3')], tees(4, 'normal'))
assert.equal(normal3.status, 'ready')
assert.deepEqual(doseStep(normal3)?.dose, { amount: 1, unit: 'cap', mark: '3' }, 'the dose names its mark')
assert.deepEqual(doseStep(normal3)?.marks, ['1', '3', '5'], 'the step carries every mark on the cap')
assert.deepEqual(doseStep(normal3)?.equivalent, { amount: 39, unit: 'ml' }, 'the printed volume of the mark is the equivalent')
assert.equal(doseStep(normal3)?.basis, 'normal soil', 'the basis names what chose the row')
assert.equal(doseStep(normal3)?.ruleId, 'normal')
assert.equal(doseStep(dosePlan([capRule('any', undefined, '1')], tees(4)))?.basis, null, 'an unconditioned row has no basis')
assert.equal(doseStep(dosePlan([capRule('any', undefined, '1')], tees(4)))?.equivalent, null, 'no printed volume, no equivalent')
assert.deepEqual(doseStep(dosePlan([capRule('twice', undefined, '3', { dose: { amount: 2, unit: 'cap', mark: '3' } })], tees(4)))?.equivalent, { amount: 78, unit: 'ml' }, 'two fills double the printed volume')
const offCap = dosePlan([capRule('line-4', undefined, '4')], tees(4))
assert.equal(offCap.status, 'needs_confirmation', 'a mark that is not on the cap is refused')
assert.deepEqual([blocker(offCap)?.details.cause, blocker(offCap)?.details.problem], ['invalid_dose', 'mark_unknown'])
assert.match(explanation(offCap), /not on its cap/)
const noMark = dosePlan([capRule('no-mark', undefined, undefined)], tees(4))
assert.deepEqual([blocker(noMark)?.details.cause, blocker(noMark)?.details.problem], ['invalid_dose', 'mark_missing'], 'a cap dose must name its mark')
const halfPod = plan({ textiles: tees(4), supplies: [{ ...capDetergent([{ ...capRule('pods', undefined, undefined), dose: { amount: 1.5, unit: 'pod' } }]), measurement: { kind: 'count', countUnit: 'pod' } }], machines: [washer()] })
assert.deepEqual([blocker(halfPod)?.details.cause, blocker(halfPod)?.details.problem], ['invalid_dose', 'count_fraction'], 'counts are whole')
const legacyMl = plan({ textiles: tees(4), supplies: [capDetergent([{ ...capRule('ml', undefined, undefined), dose: { amount: 30, unit: 'ml', measurementCue: 'fill to line 2' } }])], machines: [washer()] })
assert.equal(legacyMl.status, 'ready', 'a measured dose on a product with marks still selects')
assert.equal(doseStep(legacyMl)?.marks, undefined, 'a measured dose carries no marks')

const partialRule = capRule('partial', undefined, '3', { dose: { amount: 1, unit: 'cap', mark: '3', fractionOfMark: 0.8 } })
const partial = dosePlan([partialRule], tees(4))
assert.equal(partial.status, 'ready')
assert.deepEqual(doseStep(partial)?.dose, { amount: 1, unit: 'cap', mark: '3', fractionOfMark: 0.8 }, 'partial fill stays separate from fills and the printed mark')
assert.equal(doseStep(partial)?.equivalent, null, 'fraction of a fill level never implies fraction of calibrated volume')
const fullAndPartial = dosePlan([partialRule, capRule('full', undefined, '3')], tees(4))
assert.equal(fullAndPartial.status, 'needs_confirmation', 'full and partial fills are conflicting instructions')
for (const fractionOfMark of [0, -0.1, 1.1]) {
  const invalid = dosePlan([{ ...partialRule, dose: { amount: 1, unit: 'cap', mark: '3', fractionOfMark } }], tees(4))
  assert.notEqual(invalid.status, 'ready', 'invalid fill-level fractions cannot start an automatic recipe')
  assert.equal(ruleDose({ ...partialRule, dose: { amount: 1, unit: 'cap', mark: '3', fractionOfMark } }), null, 'invalid fractions have no usable dose')
}
for (const fractionOfMark of [NaN, Infinity]) {
  assert.throws(() => dosePlan([{ ...partialRule, dose: { amount: 1, unit: 'cap', mark: '3', fractionOfMark } }], tees(4)), /non-finite/)
  assert.equal(ruleDose({ ...partialRule, dose: { amount: 1, unit: 'cap', mark: '3', fractionOfMark } }), null)
}
const fractionalPodMark = plan({ textiles: tees(4), supplies: [{ ...capDetergent([{ ...partialRule, dose: { amount: 1, unit: 'pod', fractionOfMark: 0.8 } }]), measurement: { kind: 'count', countUnit: 'pod' } }], machines: [washer()] })
assert.notEqual(fractionalPodMark.status, 'ready', 'counted items cannot have mark fractions')

// Soil is per garment; a load takes the heaviest. Unrecorded garments read as normal only when the label has a normal row.
const soilRows = [capRule('a-light-normal', { soilLevels: ['light', 'normal'] }, '1'), capRule('b-heavy', { soilLevels: ['heavy'] }, '3')]
assert.equal(markOf(dosePlan(soilRows, tees(4, 'normal'))), '1', 'normal soil gives line 1')
assert.equal(markOf(dosePlan(soilRows, tees(4, 'heavy'))), '3', 'heavy soil gives line 3')
const oneHeavy = dosePlan(soilRows, [...tees(3, 'light'), ...tees(1, 'heavy')])
assert.equal(oneHeavy.loads[0]?.soilLevel, 'heavy', 'one heavily soiled garment makes the load heavy')
assert.equal(markOf(oneHeavy), '3')
const assumedNormal = dosePlan(soilRows, tees(4))
assert.equal(markOf(assumedNormal), '1', 'unrecorded soil reads as normal when the label has a normal row')
assert.equal(doseStep(assumedNormal)?.basis, 'normal soil (assumed)', 'an assumed soil level says so')
assert.equal(assumedNormal.loads[0]?.soilLevel, null, 'the load reports only recorded soil')
const noNormalRow = [capRule('c-any', undefined, '1'), capRule('d-heavy', { soilLevels: ['heavy'] }, '3')]
const asksSoil = dosePlan(noNormalRow, [...tees(2, 'light'), ...tees(2)])
assert.equal(asksSoil.status, 'needs_confirmation', 'without a normal row, unrecorded soil asks')
assert.deepEqual([blocker(asksSoil)?.details.cause, blocker(asksSoil)?.details.missing], ['dose_input_needed', 'soil_level'])
assert.deepEqual(blocker(asksSoil)?.details.unrecordedTextileIds, ['unrecorded-01', 'unrecorded-02'], 'the question names the garments without a soil level')
assert.match(explanation(asksSoil), /^Say how dirty unrecorded-01, unrecorded-02 are: tide's label doses by soil level\.$/)
assert.equal(markOf(dosePlan(noNormalRow, tees(4, 'light'))), '1', 'recorded light soil needs no question')
assert.equal(markOf(dosePlan([capRule('c-any', undefined, '1')], tees(4))), '1', 'a label without soil rows never asks')

// Soil sorting: heavy and light go apart when that costs no extra washer start, and share a load otherwise.
const plainDetergent: SupplyItem = { id: 'plain', kind: 'detergent', labelEvidence: verified, formulation: { form: 'liquid' }, applicationRules: [{ id: 'plain-rule', dose: { amount: 30, unit: 'ml' }, placement: 'detergent_compartment', evidence: verified }] }
const sorted = plan({ textiles: [...tees(6, 'light'), ...tees(6, 'heavy')], supplies: [plainDetergent], machines: [washer()] })
assert.equal(sorted.loads.length, 2, 'twelve garments need two starts either way')
assert.deepEqual(sorted.loads.map((load) => load.soilLevel).sort(), ['heavy', 'light'], 'the two loads are sorted by soil')
assert.ok(sorted.loads.every((load) => load.textileIds.every((id) => id.startsWith(load.soilLevel!))), 'no heavy garment shares a load with a light one')
assert.ok(sorted.reasons.some((reason) => reason.code === 'preference_applied' && reason.details.cause === 'soil_separation'), 'the separation is explained')
const shared = plan({ textiles: [...tees(2, 'light'), ...tees(2, 'heavy')], supplies: [plainDetergent], machines: [washer()] })
assert.equal(shared.loads.length, 1, 'four garments are not split into two starts for soil')
assert.equal(shared.loads[0]?.soilLevel, 'heavy', 'the shared load is dosed for its heaviest soil')
assert.ok(shared.reasons.some((reason) => reason.code === 'preference_applied' && reason.details.cause === 'soil_mixed'), 'sharing across soil levels is explained')
assert.equal(shared.status, 'ready', 'soil sorting never blocks a load')
const unsorted = plan({ textiles: tees(12), supplies: [plainDetergent], machines: [washer()] })
assert.ok(!unsorted.reasons.some((reason) => reason.code === 'preference_applied'), 'without soil there is nothing to sort')

// HE is recorded, never assumed; a label that doses HE and standard differently asks when it is unknown.
const heRows = [capRule('he', { machineClasses: ['he'] }, '1'), capRule('standard', { machineClasses: ['standard'] }, '3')]
assert.equal(markOf(dosePlan(heRows, tees(4), washer())), '1', 'a recorded HE washer takes the HE column')
assert.equal(doseStep(dosePlan(heRows, tees(4), washer()))?.basis, 'HE washer')
assert.equal(markOf(dosePlan(heRows, tees(4), washer({ applianceType: 'top_load_washer', highEfficiency: false }))), '3', 'a recorded standard washer takes the standard column')
const unsetFront = dosePlan(heRows, tees(4), washer({ highEfficiency: undefined }))
assert.deepEqual([blocker(unsetFront)?.details.cause, blocker(unsetFront)?.details.missing], ['dose_input_needed', 'washer_class'], 'a front-loader with HE unset asks')
assert.match(explanation(unsetFront), /record whether washer is HE/)
const unsetTop = dosePlan(heRows, tees(4), washer({ applianceType: 'top_load_washer', highEfficiency: undefined }))
assert.equal(blocker(unsetTop)?.details.missing, 'washer_class', 'a top-loader with HE unset asks')
assert.equal(unsetTop.loads[0]?.washerClass, null)
const heOnly = dosePlan([capRule('he', { machineClasses: ['he'] }, '1')], tees(4), washer({ highEfficiency: false }))
assert.deepEqual([blocker(heOnly)?.details.cause, blocker(heOnly)?.details.washerClass], ['label_row_needed', 'standard'], 'an HE-only label does not dose a standard washer: the row for it is asked')
assert.equal(markOf(dosePlan([capRule('cycle-normal', { cycles: ['normal'], soilLevels: ['normal'] }, '1'), capRule('he', { machineClasses: ['he'] }, '3')], tees(4, 'normal'), washer({ highEfficiency: undefined }))), '1', 'a less specific rule on an unknown fact does not ask')

// Specificity counts facts: two one-fact rows with different doses conflict for every size.
const soilVsCycle = dosePlan([capRule('soil', { soilLevels: ['normal'] }, '1'), capRule('cycle', { cycles: ['normal'] }, '3')], tees(4, 'normal'))
assert.deepEqual([blocker(soilVsCycle)?.details.cause, blocker(soilVsCycle)?.details.ruleIds], ['conflicting_dose_rules', ['cycle', 'soil']], 'two one-fact rows with different doses conflict')
assert.equal(doseStep(dosePlan([capRule('b-same', { cycles: ['normal'] }, '3'), capRule('a-same', { soilLevels: ['normal'] }, '3')], tees(4, 'normal')))?.ruleId, 'a-same', 'identical doses take the lowest id')
// Rows keyed on load units are legacy: never chosen, whatever else they name.
const legacyBulk = dosePlan([capRule('bulk', { minBulkUnits: 1, maxBulkUnits: 8, loadSizes: ['medium'] }, '1'), capRule('cycle', { cycles: ['normal'] }, '3')], tees(4))
assert.deepEqual([markOf(legacyBulk), doseStep(legacyBulk)?.ruleId], ['3', 'cycle'], 'a legacy bulk row is ignored')
assert.equal(markOf(dosePlan([capRule('general', undefined, '1'), capRule('heavy', { soilLevels: ['heavy'] }, '3')], tees(4, 'heavy'))), '3', 'a row that names the load beats one that fits every load')

// Or-rows: "Large / heavily soiled" is two rules on one row; either condition fits. The size is read off the drum,
// so a label with size rows is settled at the machine: each size the label doses is a candidate, and a size where
// two rows fit is left for the machine to ask.
const tide = [
  capRule('r1-medium', { loadSizes: ['medium'] }, '1', { row: 1 }),
  capRule('r2-large', { loadSizes: ['large'] }, '3', { row: 2, rowText: 'Large / heavily soiled' }),
  capRule('r2-heavy', { soilLevels: ['heavy'] }, '3', { row: 2, rowText: 'Large / heavily soiled' }),
  capRule('r3-extra-large', { loadSizes: ['extra_large'] }, '5', { row: 3 }),
]
const candidates = (result: PlanResult) => doseStep(result)?.atMachine?.candidates.map((candidate) => [candidate.size, candidate.dose.mark])
const normalTide = dosePlan(tide, tees(6, 'normal'))
assert.equal(normalTide.status, 'ready', 'a dose that waits for the drum does not block the load')
assert.deepEqual(candidates(normalTide), [['medium', '1'], ['large', '3'], ['extra_large', '5']], 'the or-row fits a large load by size')
const heavyTide = dosePlan(tide, tees(2, 'heavy'))
assert.deepEqual(candidates(heavyTide), [['small', '3'], ['large', '3']], 'a heavily soiled load fits the or-row by soil, and both halves agree at large')
assert.deepEqual(doseStep(heavyTide)?.atMachine?.candidates.map((candidate) => [candidate.row, candidate.rowText]), [[2, 'Large / heavily soiled'], [2, 'Large / heavily soiled']], 'candidates carry the row and its typed line')
assert.equal(heavyTide.status, 'ready', 'a medium or extra-large heavily soiled load is asked at the machine, never silently dosed at line 3')
assert.equal(blocker(dosePlan(tide, tees(6)))?.details.missing, 'soil_level', 'an unknown soil that could change the dose at some size is asked')
assert.equal(markOf(dosePlan([capRule('any', undefined, '3'), capRule('heavy', { soilLevels: ['heavy'] }, '3')], tees(6))), '3', 'an unknown soil that cannot change the dose is not asked')
const heavyTwoRows = dosePlan([capRule('a-general', { cycles: ['normal'] }, '1'), capRule('b-heavy', { soilLevels: ['heavy'] }, '3')], tees(4, 'heavy'))
assert.deepEqual([blocker(heavyTwoRows)?.details.cause, blocker(heavyTwoRows)?.details.ruleIds], ['conflicting_dose_rules', ['a-general', 'b-heavy']], 'two rows that fit every size ask now')
assert.match(explanation(heavyTwoRows), /More than one row of tide's label directions fits this load/)
assert.deepEqual([blocker(heavyTwoRows)?.details.soilLevel, blocker(heavyTwoRows)?.details.washerClass], ['heavy', 'he'], 'dose reasons carry the soil level and washer class')
assert.equal(blocker(heavyTwoRows)?.details.loadSize, undefined, 'and no load size: none is known at plan time')

// Odor and water have no question, so an unstated condition never matches, and the label row is asked instead.
const water = dosePlan([capRule('soft', { waterConditions: ['soft'] }, '1')], tees(4))
assert.equal(blocker(water)?.details.cause, 'label_row_needed')

// A placeholder for a missing dose is not also reported as an unsupported machine placement.
assert.ok(!asksSoil.reasons.some((reason) => reason.details.cause === 'unsupported_machine_placement'), 'a soil question is the only blocker')

// Dryers are never washers, and dryer products never dose or block a wash.
const tumbleDryer: MachineEvidence = { id: 'a-dryer', applianceType: 'tumble_dryer', capacityUnits: 20, capacityConfidence: 'verified', evidence: verified, supportedCycles: ['normal'], dispensing: { placements: ['detergent_compartment'] }, heatSettings: [{ heat: 'low', label: 'Low' }] }
const withDryer = plan({ textiles: tees(4), supplies: [plainDetergent], machines: [tumbleDryer, washer()] })
assert.ok(withDryer.loads.every((load) => load.machineId === 'washer'), 'a tumble dryer in machines is never a washer')
assert.equal(plan({ textiles: tees(4), supplies: [plainDetergent], machines: [tumbleDryer] }).reasons.some((reason) => reason.details.cause === 'insufficient_machine_evidence'), true, 'a dryer alone cannot wash')
const unverifiedSheet: SupplyItem = { id: 'sheet', kind: 'dryer_sheet', labelEvidence: { status: 'unknown' } }
const sheetInput: PlannerInput = { textiles: tees(4), supplies: [plainDetergent, unverifiedSheet], machines: [washer()] }
assert.equal(plan(sheetInput).status, 'ready', 'an unverified dryer sheet does not change the wash')
assert.equal(JSON.stringify(plan(sheetInput)), JSON.stringify(plan(sheetInput)), 'plans are byte-stable')

// Calculated dose (dose plan P2, inert): soft water halves the label row to a whole printed mark, and nothing shown changes.
{
  const { resolveAtMachine } = (await import(`./index${'.ts'}`)) as typeof import('./index')
  const measured = { kind: 'cap', marks: [{ label: '1', amount: 20, unit: 'ml' }, { label: '2', amount: 30, unit: 'ml' }, { label: '3', amount: 39, unit: 'ml' }, { label: '5', amount: 60, unit: 'ml' }] }
  const softPlan = (rules: ApplicationRule[], textiles: TextileEvidence[], supply: Partial<SupplyItem> = {}, waterCondition: string | null = 'soft') =>
    plan({ textiles, supplies: [{ ...capDetergent(rules), measurement: measured, ...supply }], machines: [washer()], ...(waterCondition === null ? {} : { waterCondition }) })
  const calc = (result: PlanResult) => doseStep(result)?.calculatedDose?.dose.mark
  const line3 = [capRule('any', undefined, '3')]

  const soft = softPlan(line3, tees(4, 'normal'))
  assert.deepEqual(doseStep(soft)?.calculatedDose, { dose: { amount: 1, unit: 'cap', mark: '1', marks: ['1', '2', '3', '5'], equivalent: { amount: 20, unit: 'ml' } }, adjustment: { kind: 'soft_water_half', sourceIds: ['S24'] } }, 'soft water: the lowest whole mark at or above half of line 3')
  const notSoft = softPlan(line3, tees(4, 'normal'), {}, null)
  assert.equal(doseStep(notSoft)?.calculatedDose, undefined, 'no water condition: the label amount')
  assert.equal(calc(softPlan(line3, tees(4, 'normal'), {}, 'hard')), undefined, 'hard water: the label amount')
  // Nothing shown changes: the step's own dose, marks and printed volume are the label's either way.
  const shown = (result: PlanResult) => { const { calculatedDose: _hidden, ...rest } = doseStep(result)!; return rest }
  assert.deepEqual(shown(soft), shown(notSoft), 'the displayed step is the label dose')
  assert.deepEqual(doseStep(soft)?.dose, { amount: 1, unit: 'cap', mark: '3' })

  assert.equal(calc(softPlan(line3, tees(4, 'heavy'))), undefined, 'recorded heavy soil: the label amount')
  assert.equal(calc(softPlan(line3, tees(4, 'light'))), '1', 'recorded light soil qualifies')
  assert.equal(calc(softPlan(line3, [...tees(3, 'normal'), ...tees(1, undefined)])), undefined, 'unrecorded soil never qualifies')
  const noted = tees(4, 'normal').map((tee, index) => index === 0 ? { ...tee, stainNote: 'Food or drink on the front' } : tee)
  assert.equal(calc(softPlan(line3, noted)), undefined, 'a fresh stain note (also an open stain check) blocks it')
  const reported = tees(4, 'normal').map((tee, index) => index === 0 ? { ...tee, stainReport: { kind: 'tannin' as const } } : tee)
  assert.equal(doseStep(softPlan(line3, reported))?.calculatedDose, undefined, 'a fresh stain report blocks it')

  const podPlan = softPlan([{ ...capRule('pod', undefined, undefined), dose: { amount: 1, unit: 'pod' } }], tees(4, 'normal'), { use: 'pods', measurement: { kind: 'count', countUnit: 'pod' } })
  assert.deepEqual([doseStep(podPlan)?.dose.unit, doseStep(podPlan)?.calculatedDose], ['pod', undefined], 'pods keep the label count')
  assert.equal(calc(softPlan([{ ...capRule('g', undefined, undefined), dose: { amount: 60, unit: 'g' } }], tees(4, 'normal'), { measurement: { ...measured, kind: 'scoop' } })), undefined, 'a weight is never halved')

  const below2 = [capRule('below', undefined, '2', { dose: { amount: 1, unit: 'cap', mark: '2', target: 'below' } })]
  assert.equal(calc(softPlan(below2, tees(4, 'normal'), { measurement: { kind: 'cap', marks: [{ label: '1', amount: 20, unit: 'ml' }, '2', { label: '3', amount: 39, unit: 'ml' }] } })), undefined, 'a partial line with no volume for its mark keeps the label amount')
  assert.equal(calc(softPlan(below2, tees(4, 'normal'))), '1', "a partial line is bounded by its named mark's volume: half of 30 mL rounds to line 1")
  assert.equal(calc(softPlan([capRule('half5', undefined, '5', { dose: { amount: 1, unit: 'cap', mark: '5', fractionOfMark: 0.5 } })], tees(4, 'normal'))), undefined, 'half of line 5 has no known volume: the label amount')
  assert.equal(calc(softPlan([capRule('one', undefined, '1')], tees(4, 'normal'))), undefined, 'no whole mark between half and the label line: the label amount')
  assert.equal(calc(softPlan([capRule('five', undefined, '5')], tees(4, 'normal'))), '2', 'never below half: line 1 (20 mL) is under half of 60 mL, so line 2')
  assert.equal(calc(softPlan([capRule('ml', undefined, undefined, { dose: { amount: 39, unit: 'ml' } })], tees(4, 'normal'))), '1', 'a stated mL row rounds to a cap mark')
  assert.equal(calc(softPlan([capRule('two-caps', undefined, '3', { dose: { amount: 2, unit: 'cap', mark: '3' } })], tees(4, 'normal'))), undefined, 'more than one fill keeps the label amount')
  assert.equal(calc(softPlan(line3, tees(4, 'normal'), { measurement: { kind: 'cap', marks: ['1', '2', { label: '3', amount: 39, unit: 'ml' }] } })), undefined, 'marks with no known volume are never rounded to')
  const softRows = [capRule('soft-row', { waterConditions: ['soft'] }, '2'), capRule('hard-row', { waterConditions: ['hard'] }, '3')]
  const ownRows = softPlan(softRows, tees(4, 'normal'))
  assert.deepEqual([doseStep(ownRows)?.dose.mark, calc(ownRows)], ['2', undefined], "single adjustment: a label with its own water rows gets its soft row, never halved again")

  // At the machine: candidates carry the calculated dose, and a drum-fullness pick keeps the water condition.
  const sized = [capRule('s-medium', { loadSizes: ['small', 'medium'] }, '3'), capRule('s-large', { loadSizes: ['large', 'extra_large'] }, '5')]
  const atMachine = doseStep(softPlan(sized, tees(4, 'normal')))?.atMachine
  assert.deepEqual(atMachine?.candidates.map((candidate) => [candidate.size, candidate.dose.mark, candidate.calculatedDose?.dose.mark]), [['small', '3', '1'], ['medium', '3', '1'], ['large', '5', '2'], ['extra_large', '5', '2']], 'each size carries its label row and its soft-water mark')
  assert.equal(atMachine?.context.waterCondition, 'soft', 'the snapshot keeps the water condition')
  const bySoftSize = [capRule('soft-small', { loadSizes: ['small'], waterConditions: ['soft'] }, '1'), capRule('soft-large', { loadSizes: ['large'], waterConditions: ['soft'] }, '3')]
  const softAtMachine = doseStep(softPlan(bySoftSize, tees(4, 'normal')))?.atMachine
  const picked = resolveAtMachine(softAtMachine!, bySoftSize, measured, 'large')
  assert.deepEqual([picked.kind, picked.kind === 'selected' ? picked.rule.id : null], ['selected', 'soft-large'], 'a drum-fullness pick reads the soft-water row')
  assert.equal(doseStep(softPlan(sized, tees(4, 'normal'), {}, null))?.atMachine?.context.waterCondition, undefined, 'no water: the snapshot keeps its old shape')
}

console.log('dose checks passed')
