import assert from 'node:assert/strict'

import type { ApplicationConditions, ApplicationRule, DismissedQuestion, MachineEvidence, PlanResult, PlannerInput, SupplyItem, TextileEvidence } from './index'

const { plan, plannerVersion, packingCapacity, resolveAtMachine, defaultPackingUnits } = (await import(`./index${'.ts'}`)) as typeof import('./index')

const verified = { status: 'verified' as const }
const observed = { status: 'observed' as const, source: 'label_taps' }

function washer(extra: Partial<MachineEvidence> = {}): MachineEvidence {
  return {
    id: 'washer',
    applianceType: 'front_load_washer',
    highEfficiency: true,
    capacityUnits: 8,
    capacityConfidence: 'verified',
    evidence: verified,
    supportedCycles: ['normal'],
    dispensing: { placements: ['detergent_compartment', 'direct_to_drum'] },
    ...extra,
  }
}

function capRule(id: string, conditions: ApplicationConditions | undefined, mark: string, extra: Partial<ApplicationRule> = {}): ApplicationRule {
  return {
    id,
    ...(conditions === undefined ? {} : { conditions }),
    dose: { amount: 1, unit: 'cap', mark },
    stage: 'wash',
    placement: 'detergent_compartment',
    timing: 'before starting',
    evidence: observed,
    ...extra,
  }
}

const defaults = { stage: 'wash', placement: 'detergent_compartment', timing: 'before starting' }

function tide(rules: ApplicationRule[], extra: Partial<SupplyItem> = {}): SupplyItem {
  return {
    id: 'tide',
    kind: 'detergent',
    labelEvidence: observed,
    formulation: { form: 'liquid' },
    measurement: { kind: 'cap', marks: [{ label: '1' }, { label: '3', amount: 39, unit: 'ml' }, { label: '5' }] },
    defaults,
    applicationRules: rules,
    ...extra,
  }
}

function tees(count: number, soilLevel?: 'light' | 'normal' | 'heavy', extra: Partial<TextileEvidence> = {}): TextileEvidence[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${soilLevel ?? 'unrecorded'}-${String(index + 1).padStart(2, '0')}`,
    colorGroup: 'white' as const,
    bulkUnits: 1,
    care: { washMethod: 'machine' as const, cycle: 'normal', maxTemperatureC: 40, status: 'confirmed' as const, dryMethod: 'tumble_dry' },
    ...(soilLevel === undefined ? {} : { soilLevel }),
    ...extra,
  }))
}

function input(rules: ApplicationRule[], textiles: TextileEvidence[], extra: Partial<PlannerInput> = {}): PlannerInput {
  return { textiles, supplies: [tide(rules)], machines: [washer()], ...extra }
}

const step = (result: PlanResult, supplyId = 'tide') => result.loads[0]?.treatments.find((entry) => entry.supplyId === supplyId)
const reasonsFor = (result: PlanResult, supplyId = 'tide') => result.reasons.filter((reason) => reason.supplyId === supplyId)
const blocking = (result: PlanResult) => result.reasons.filter((reason) => reason.code === 'needs_confirmation')
const leftOut = (result: PlanResult) => result.reasons.filter((reason) => reason.code === 'product_left_out')
const candidates = (result: PlanResult) => step(result)?.atMachine?.candidates.map((candidate) => [candidate.size, candidate.dose.mark ?? candidate.dose.amount])

assert.equal(plannerVersion, 'planner-v2.23', 'the planner version changed, so older plans are replaced')

// Evidence: a person's taps on the label count as read; memory, estimates and sample data do not.
const observedPlan = plan(input([capRule('any', undefined, '3')], tees(4, 'normal')))
assert.equal(observedPlan.status, 'ready', 'an observed label with an observed row doses')
assert.deepEqual(step(observedPlan)?.dose, { amount: 1, unit: 'cap', mark: '3' })
const fromMemory = plan({ ...input([capRule('any', undefined, '3')], tees(4)), supplies: [tide([capRule('any', undefined, '3')], { labelEvidence: { status: 'user-supplied' } })] })
assert.ok(blocking(fromMemory).some((reason) => reason.details.cause === 'insufficient_product_evidence' && reason.supplyId === 'tide'), 'a label from memory is not usable')
const sample = plan({ ...input([capRule('any', undefined, '3')], tees(4)), supplies: [tide([capRule('any', undefined, '3')], { labelEvidence: { status: 'unknown', source: 'sample' } })] })
assert.ok(blocking(sample).some((reason) => reason.details.cause === 'insufficient_product_evidence'), 'sample data never drives a plan')
const rememberedRow = plan(input([capRule('any', undefined, '3', { evidence: { status: 'user-supplied' } })], tees(4)))
assert.equal(blocking(rememberedRow)[0]?.details.cause, 'label_row_needed', 'a row from memory is not a row: it is asked for')
const sheetTaps: SupplyItem = { id: 'sheets', kind: 'dryer_sheet', labelEvidence: observed, measurement: { kind: 'count', countUnit: 'sheet' }, applicationRules: [{ id: 'sheets-any', dose: { amount: 1, unit: 'sheet' }, stage: 'dry', placement: 'dryer_drum', evidence: observed }] }
const tumbleDryer: MachineEvidence = { id: 'dryer', applianceType: 'tumble_dryer', evidence: verified, heatSettings: [{ heat: 'low', label: 'Low' }, { heat: 'high', label: 'High' }] }
const observedSheet = plan({ ...input([capRule('any', undefined, '3')], tees(2, 'normal')), supplies: [tide([capRule('any', undefined, '3')]), sheetTaps], dryers: [tumbleDryer] })
assert.deepEqual(observedSheet.loads[0]?.drying?.treatments.map((entry) => [entry.supplyId, entry.dose.amount]), [['sheets', 1]], 'an observed dryer sheet is usable')

// Machines without a size: usable, packed by about a default size, and no load ever carries a size.
const unsized = washer({ capacityUnits: undefined, capacityConfidence: undefined })
assert.equal(packingCapacity(unsized), defaultPackingUnits)
assert.equal(packingCapacity(washer()), 8, 'a recorded size packs as recorded')
const fourteen = plan(input([capRule('any', undefined, '3')], tees(14, 'normal'), { machines: [unsized] }))
assert.equal(fourteen.status, 'ready', 'a washer whose size was skipped plans')
assert.deepEqual(fourteen.loads.map((load) => [load.textileIds.length, load.capacityUnits, load.loadSize]), [[14, 14, null]], 'fourteen about-units fit one load')
assert.equal(plan(input([capRule('any', undefined, '3')], tees(15, 'normal'), { machines: [unsized] })).loads.length, 2, 'fifteen take two')
assert.ok(blocking(plan(input([capRule('any', undefined, '3')], tees(2), { machines: [washer({ capacityConfidence: 'unknown' })] }))).some((reason) => reason.details.cause === 'insufficient_machine_evidence'), 'a recorded size must say how it is known')
assert.ok(blocking(plan(input([capRule('any', undefined, '3')], tees(2), { machines: [washer({ capacityUnits: undefined, evidence: undefined })] }))).some((reason) => reason.details.cause === 'insufficient_machine_evidence'), 'a washer still needs its own evidence')

// Size tables: rows that differ by size are chosen at the machine; identical rows resolve now; no rows ask.
const byLine = [capRule('medium', { loadSizes: ['medium'] }, '1', { row: 1 }), capRule('large', { loadSizes: ['large'] }, '3', { row: 2, rowText: 'Large load' })]
const atMachine = plan(input(byLine, tees(4, 'normal')))
assert.equal(atMachine.status, 'ready', 'a dose that waits for the drum leaves the load ready')
assert.equal(atMachine.loads[0]?.status, 'ready')
assert.deepEqual(step(atMachine)?.dose, { amount: 0, unit: 'at_machine' }, 'the dose is a placeholder until the drum is read')
assert.deepEqual([step(atMachine)?.stage, step(atMachine)?.placement, step(atMachine)?.timing, step(atMachine)?.confirmation], ['wash', 'detergent_compartment', 'before starting', 'confirmed'], 'where and when come from the rows')
assert.equal(step(atMachine)?.atMachine?.machine, 'washer')
assert.deepEqual(step(atMachine)?.atMachine?.candidates, [
  { size: 'medium', ruleId: 'medium', row: 1, rowText: null, dose: { amount: 1, unit: 'cap', mark: '1', marks: ['1', '3', '5'] } },
  { size: 'large', ruleId: 'large', row: 2, rowText: 'Large load', dose: { amount: 1, unit: 'cap', mark: '3', marks: ['1', '3', '5'], equivalent: { amount: 39, unit: 'ml' } } },
], 'a medium and a large row give two candidates, each with its row, typed line and marks')
assert.deepEqual(step(atMachine)?.atMachine?.context, { soilLevel: 'normal', unrecordedSoil: false, applianceType: 'front_load_washer', machineClasses: ['front_load_washer', 'he'], washerClassKnown: true, cycles: ['normal'], materials: [] }, 'the load facts are kept for the machine')
assert.equal(step(atMachine)?.ruleId, undefined, 'no row is chosen yet')
assert.equal(atMachine.cost.supplies, 0, 'nothing is priced before the dose is known')
const sameForAll = plan(input([capRule('small-medium', { loadSizes: ['small', 'medium'] }, '1'), capRule('large-up', { loadSizes: ['large', 'extra_large'] }, '1')], tees(4, 'normal')))
assert.deepEqual([step(sameForAll)?.dose.mark, step(sameForAll)?.atMachine, step(sameForAll)?.basis], ['1', undefined, null], 'rows that agree for every size resolve now, and name no size')
const noRows = plan(input([], tees(4, 'heavy')))
assert.equal(noRows.status, 'needs_confirmation')
assert.equal(blocking(noRows).length, 1, 'a detergent with no rows asks exactly once')
assert.deepEqual(blocking(noRows)[0]?.details, { cause: 'label_row_needed', soilLevel: 'heavy', stage: 'washer', washerClass: 'he' }, 'for the load\'s soil and HE context')
assert.deepEqual([blocking(noRows)[0]?.supplyId, blocking(noRows)[0]?.loadId, blocking(noRows)[0]?.machineId], ['tide', 'load-001', 'washer'])
assert.deepEqual(noRows.exclusions.map((exclusion) => exclusion.textileId), tees(4, 'heavy').map((garment) => garment.id), 'a blocking question keeps the load out until it is answered')
assert.deepEqual(blocking(plan(input([], tees(4), { machines: [washer({ highEfficiency: undefined })] })))[0]?.details, { cause: 'label_row_needed', soilLevel: null, stage: 'washer', washerClass: null }, 'unknown soil and HE are absent from the context')

// Answered and dismissed questions, for this pass only.
const doesntSay = (context: DismissedQuestion['context']): DismissedQuestion => ({ kind: 'label_row', subjectId: 'tide', context, answer: 'label_doesnt_say' })
const dismissedInput = input([], tees(4, 'heavy'), { dismissedQuestions: [doesntSay({ soilLevel: 'heavy', washerClass: 'he' })] })
const dismissed = plan(dismissedInput)
assert.equal(dismissed.status, 'ready', 'the label doesn\'t say: the load washes without the product')
assert.equal(step(dismissed), undefined, 'and has no step for it')
assert.deepEqual(leftOut(dismissed).map((reason) => reason.details), [{ cause: 'label_doesnt_say', soilLevel: 'heavy', washerClass: 'he' }], 'the product is left out for that context')
assert.deepEqual(dismissed.exclusions, [], 'a left-out product never keeps the garments out')
assert.ok(!plan(dismissedInput).reasons.some((reason) => reason.details.cause === 'label_row_needed'), 're-planning the same pass does not ask again')
assert.equal(plan(dismissedInput).inputHash, dismissed.inputHash)
assert.notEqual(dismissed.inputHash, noRows.inputHash, 'dismissals are part of the plan identity')
assert.equal(blocking(plan(input([], tees(4, 'normal'), { dismissedQuestions: [doesntSay({ soilLevel: 'heavy', washerClass: 'he' })] })))[0]?.details.cause, 'label_row_needed', 'a dismissal for another soil still asks')
assert.equal(blocking(plan(input([], tees(4, 'heavy'), { dismissedQuestions: [doesntSay({ soilLevel: 'heavy' })] })))[0]?.details.cause, 'label_row_needed', 'an absent HE matches only an absent HE')
const dependsInput = input([], tees(4, 'heavy'), { dismissedQuestions: [{ kind: 'label_row', subjectId: 'tide', context: { soilLevel: 'heavy', washerClass: 'he' }, answer: 'depends_on_size' }] })
const depends = plan(dependsInput)
assert.equal(depends.status, 'ready', 'it depends on how full the washer is: the row is asked at the machine')
assert.deepEqual(step(depends)?.atMachine?.candidates, [], 'with no candidates yet')
assert.deepEqual([step(depends)?.dose.unit, step(depends)?.stage, step(depends)?.placement, step(depends)?.timing], ['at_machine', 'wash', 'detergent_compartment', 'before starting'], 'placed by the product\'s defaults')
const noDefaults = plan({ ...dependsInput, supplies: [tide([], { defaults: undefined })] })
assert.equal(blocking(noDefaults)[0]?.details.cause, 'unsupported_treatment', 'without anywhere to put it, the step fails closed')
const excluded = plan(input(byLine, tees(4, 'normal'), { excludedSupplyIds: ['tide'] }))
assert.deepEqual([excluded.status, step(excluded), leftOut(excluded)[0]?.details.cause], ['ready', undefined, 'left_out'], 'a product left out of the pass has no step')

// "Can't tell" the HE logo leaves HE-split products out of loads on that washer only.
const heSplit = [capRule('he', { machineClasses: ['he'] }, '1'), capRule('standard', { machineClasses: ['standard'] }, '3')]
const delicateTee = tees(1, 'normal')[0]!
const twoWashers = input(heSplit, [...tees(2, 'normal'), { ...delicateTee, id: 'z-delicate', care: { ...delicateTee.care, cycle: 'delicate' } }], {
  machines: [washer({ id: 'washer-a', highEfficiency: undefined }), washer({ id: 'washer-b', highEfficiency: undefined, supportedCycles: ['delicate'] })],
  dismissedQuestions: [{ kind: 'washer_he', subjectId: 'washer-a', context: {}, answer: 'cant_tell' }],
})
const heDismissed = plan(twoWashers)
assert.deepEqual(heDismissed.loads.map((load) => load.machineId), ['washer-a', 'washer-b'])
assert.deepEqual(leftOut(heDismissed).map((reason) => [reason.machineId, reason.details.cause]), [['washer-a', 'cant_tell_he']], 'left out on the washer whose logo could not be found')
assert.deepEqual(blocking(heDismissed).map((reason) => [reason.machineId, reason.details.cause, reason.details.missing]), [['washer-b', 'dose_input_needed', 'washer_class']], 'the other washer still asks')

// Resolving at the machine: the stored facts and the current rows, with the size the person picked.
const orRow = [
  capRule('r1-medium', { loadSizes: ['medium'] }, '1', { row: 1 }),
  capRule('r2-large', { loadSizes: ['large'] }, '3', { row: 2 }),
  capRule('r2-heavy', { soilLevels: ['heavy'] }, '3', { row: 2 }),
  capRule('r3-extra-large', { loadSizes: ['extra_large'] }, '5', { row: 3 }),
]
const heavyStep = step(plan(input(orRow, tees(4, 'heavy'))))!
const measure = tide(orRow).measurement
const resolved = resolveAtMachine(heavyStep.atMachine!, orRow, measure, 'small')
assert.deepEqual([resolved.kind, resolved.kind === 'selected' ? resolved.rule.id : null, resolved.kind === 'selected' ? resolved.dose.mark : null], ['selected', 'r2-heavy', '3'], 'a small heavily soiled load takes the or-row')
assert.deepEqual(resolveAtMachine(heavyStep.atMachine!, orRow, measure, 'medium'), { kind: 'conflict', ruleIds: ['r1-medium', 'r2-heavy'], soilLevel: 'heavy', soilAssumed: false }, 'two rows that fit ask which one')
const normalStep = step(plan(input(orRow, tees(4, 'normal'))))!
assert.equal(resolveAtMachine(normalStep.atMachine!, orRow, measure, 'small').kind, 'none', 'a size the label does not dose asks for its line')
const legacy = capRule('legacy', { minBulkUnits: 0, maxBulkUnits: 100 }, '5')
assert.equal(resolveAtMachine(normalStep.atMachine!, [...orRow, legacy], measure, 'small').kind, 'none', 'legacy bulk rows are ignored')
const answered = resolveAtMachine(normalStep.atMachine!, [...orRow, capRule('r0-small', { loadSizes: ['small'] }, '1')], measure, 'small')
assert.equal(answered.kind === 'selected' ? answered.rule.id : null, 'r0-small', 'a row saved at the machine is read at once')

// The dryer: a box that doses by size is chosen from how full the dryer is; questions never block the wash.
const sizedSheets: SupplyItem = {
  ...sheetTaps,
  applicationRules: [
    { id: 'sheets-small-medium', conditions: { loadSizes: ['small', 'medium'] }, dose: { amount: 1, unit: 'sheet' }, stage: 'dry', placement: 'dryer_drum', evidence: observed },
    { id: 'sheets-large', conditions: { loadSizes: ['large', 'extra_large'] }, dose: { amount: 2, unit: 'sheet' }, stage: 'dry', placement: 'dryer_drum', evidence: observed },
  ],
}
const dryerInput = (supply: SupplyItem, extra: Partial<PlannerInput> = {}): PlannerInput => ({ ...input([capRule('any', undefined, '3')], tees(2, 'normal')), supplies: [tide([capRule('any', undefined, '3')]), supply], dryers: [tumbleDryer], ...extra })
const dryerStep = plan(dryerInput(sizedSheets)).loads[0]?.drying?.treatments.find((entry) => entry.supplyId === 'sheets')
assert.equal(dryerStep?.atMachine?.machine, 'dryer', 'the dryer size table gives a dryer step at the machine')
assert.deepEqual(dryerStep?.atMachine?.candidates.map((candidate) => [candidate.size, candidate.dose.amount]), [['small', 1], ['medium', 1], ['large', 2], ['extra_large', 2]])
assert.deepEqual(dryerStep?.atMachine?.context, { soilLevel: null, unrecordedSoil: false, applianceType: 'tumble_dryer', machineClasses: ['tumble_dryer'], washerClassKnown: true, cycles: [], materials: [] }, 'with no soil or HE')
const largeSheets = resolveAtMachine(dryerStep!.atMachine!, sizedSheets.applicationRules!, sizedSheets.measurement, 'large')
assert.deepEqual(largeSheets.kind === 'selected' ? largeSheets.dose : null, { amount: 2, unit: 'sheet' })
const unreadBox = plan(dryerInput({ ...sheetTaps, applicationRules: [] }))
assert.equal(unreadBox.status, 'ready', 'a dryer box with no line never blocks the wash')
assert.deepEqual(unreadBox.reasons.filter((reason) => reason.details.cause === 'label_row_needed').map((reason) => [reason.code, reason.supplyId, reason.machineId, reason.details.stage]), [['drying_decision', 'sheets', 'dryer', 'dryer']], 'but asks for the line on the box')
assert.deepEqual(unreadBox.loads[0]?.drying?.omitted, [{ supplyId: 'sheets', cause: 'no_rule' }], 'and leaves it out until then')
const boxDoesntSay = plan(dryerInput({ ...sheetTaps, applicationRules: [] }, { dismissedQuestions: [{ kind: 'label_row', subjectId: 'sheets', context: {}, answer: 'label_doesnt_say' }] }))
assert.ok(!boxDoesntSay.reasons.some((reason) => reason.details.cause === 'label_row_needed'), 'the box doesn\'t say: not asked again')
const boxDepends = plan(dryerInput({ ...sheetTaps, applicationRules: [] }, { dismissedQuestions: [{ kind: 'label_row', subjectId: 'sheets', context: {}, answer: 'depends_on_size' }] }))
assert.deepEqual(boxDepends.loads[0]?.drying?.treatments.map((entry) => [entry.supplyId, entry.dose.unit, entry.atMachine?.candidates.length]), [['sheets', 'at_machine', 0]], 'it depends on how full the dryer is: asked at the machine')
const boxLeftOut = plan(dryerInput(sizedSheets, { excludedSupplyIds: ['sheets'] }))
assert.deepEqual([boxLeftOut.loads[0]?.drying?.treatments, boxLeftOut.loads[0]?.drying?.omitted], [[], [{ supplyId: 'sheets', cause: 'left_out' }]], 'a dryer product left out of the pass')

// Temperature: the coolest maximum, and an unknown maximum washes cold.
const warm = plan(input([capRule('any', undefined, '3')], tees(2, 'normal')))
assert.equal(warm.loads[0]?.temperatureC, 40)
const unknownTemperature = plan(input([capRule('any', undefined, '3')], [...tees(1, 'normal'), ...tees(1, 'light', { care: { washMethod: 'machine', cycle: 'normal', status: 'confirmed' } })]))
assert.deepEqual(unknownTemperature.loads.map((load) => load.temperatureC), [30], 'a garment with no maximum counts as cold')

// A stain note keeps the garment out of the dryer and never becomes a stain kind or a question.
const noted = plan({ ...input([capRule('any', undefined, '3')], [...tees(1, 'heavy', { stainNote: 'Food, on the collar' }), ...tees(1, 'normal')]), dryers: [tumbleDryer] })
assert.equal(noted.status, 'ready', 'a stain note asks nothing')
assert.deepEqual(noted.loads.flatMap((load) => load.drying?.heldOut ?? []), [{ textileId: 'heavy-01', method: 'line_dry', reason: 'stain' }], 'a noted stain hangs to dry')
assert.ok(noted.loads.every((load) => load.treatments.every((entry) => entry.stage !== 'prewash')), 'and is never pre-treated from the note')

assert.equal(JSON.stringify(plan(twoWashers)), JSON.stringify(heDismissed), 'plans are byte-stable')

console.log('size checks passed')
