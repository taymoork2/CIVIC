import { expect, test } from 'vitest'

import { api } from './_generated/api'
import { capCells, capMeasure, finishSteps, intakeHousehold, label, newBackend, planFor, signedIn, startLoad, type Caller } from './harness.testing'

/** Tide's cap: Medium 1, Large 3, Extra large 5, and the or-row "Large / heavily soiled" 3, with HE and standard columns. */
const tideRows = [
  { loadSizes: ['medium' as const], cells: capCells('1', '3') },
  { loadSizes: ['large' as const], cells: capCells('3', '5') },
  { loadSizes: ['extra_large' as const], cells: capCells('5', '5') },
  { rowText: 'Large / heavily soiled', loadSizes: ['large' as const], soilLevels: ['heavy' as const], join: 'or' as const, cells: capCells('3', '5') },
]

test('partial-mark directions survive planning, step replay, actual usage and immutable finished history', async () => {
  const t = newBackend()
  const as = signedIn(t, 'partial-mark')
  const home = await intakeHousehold(as)
  await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, measure: capMeasure })
  const directions = { supplyId: home.detergent, measure: capMeasure, stage: 'wash' as const, placement: 'detergent_compartment' as const,
    timing: 'before cycle start', provenance: label('actual partial-mark directions'),
    rows: [{ cells: [{ amount: 1, unit: 'cap', mark: '3', fractionOfMark: 0.8 }] }] }
  await as.mutation(api.inventory.saveLabelDirections, directions)
  const planned = await planFor(as, home.householdId, [home.shirt])
  const treatment = planned.result.loads[0]!.treatments.find((step) => step.supplyId === home.detergent)!
  expect(treatment.dose.fractionOfMark).toBe(0.8)
  expect(treatment.equivalent).toBeNull()
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey: 'partial-mark' })
  for (;;) {
    const detail = await as.query(api.execution.sessionDetail, { sessionId })
    const next = detail.actions.find((step) => step.status === 'pending')!
    if (next.kind === 'treatment') break
    await as.mutation(api.actions.recordAction, { sessionId, actionId: next.id, status: 'confirmed' })
  }
  const detail = await as.query(api.execution.sessionDetail, { sessionId })
  const step = detail.actions.find((action) => action.status === 'pending')!
  expect(step.kind === 'treatment' && step.dose).toMatchObject({ mark: '3', fractionOfMark: 0.8 })
  const usage = { supplyId: home.detergent, amount: 1, unit: 'cap', mark: '3', placement: 'detergent_compartment' }
  const args = { sessionId, actionId: step.id, status: 'confirmed' as const, receiptId: 'partial-mark-receipt-0001', at: Date.now(), usage: { ...usage, fractionOfMark: 0.8 } }
  await expect(as.mutation(api.actions.recordAction, { ...args, usage })).rejects.toThrow('Record the fraction')
  await expect(as.mutation(api.actions.recordAction, { ...args, usage: { ...usage, fractionOfMark: 1.1 } })).rejects.toThrow('fraction of a mark')
  const recorded = await as.mutation(api.actions.recordAction, args)
  expect(await as.mutation(api.actions.recordAction, args)).toEqual(recorded)
  await expect(as.mutation(api.actions.recordAction, { ...args, usage: { ...usage, fractionOfMark: 1 } })).rejects.toThrow()
  expect((await as.query(api.execution.sessionDetail, { sessionId })).usage[0]).toMatchObject({ fractionOfMark: 0.8 })
  await finishSteps(as, sessionId)
  await as.mutation(api.sessions.complete, { sessionId, planInputHash: planned.inputHash, idempotencyKey: 'partial-mark' })
  await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, name: 'Later product name' })
  await as.mutation(api.inventory.saveLabelDirections, { ...directions, rows: [{ cells: [{ amount: 1, unit: 'cap', mark: '3' }] }] })
  const history = (await t.run((ctx) => ctx.db.query('washRecords').collect()))[0]!
  expect(history.products[0]).toMatchObject({ mark: '3', fractionOfMark: 0.8 })
  expect(history.activityContext?.products[0]).toMatchObject({ fractionOfMark: 0.8 })
  expect(history.activityContext?.treatments?.[0]?.dose).toMatchObject({ fractionOfMark: 0.8 })
})

async function tide(as: Caller) {
  const home = await intakeHousehold(as)
  const supplyId = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Tide cap', kind: 'chemical', formulation: { name: 'HE liquid', form: 'liquid' }, provenance: label('Tide cap label') })
  const save = (overrides: Record<string, unknown> = {}) => as.mutation(api.inventory.saveLabelDirections, {
    supplyId, measure: capMeasure, stage: 'wash', placement: 'detergent_compartment', timing: 'before cycle start', rows: tideRows, provenance: label('Tide cap label'), ...overrides,
  })
  const listed = async () => (await as.query(api.inventory.list, { householdId: home.householdId })).supplies.find((supply) => supply.supplyId === supplyId)!
  return { home, supplyId, save, listed }
}

test('label answers and saved directions retain below-line qualifiers without inventing a fraction', async () => {
  const as = signedIn(newBackend(), 'native-label')
  const { tide, lines } = await tapped(as)
  const dose = { amount: 1, unit: 'cap', mark: '3', target: 'just_below' as const }
  await as.mutation(api.inventory.answerLabelRow, { supplyId: tide, context: {}, sameForAll: true, dose })
  expect((await lines(tide))[0]?.dose).toEqual(dose)
  await as.mutation(api.inventory.saveLabelDirections, { supplyId: tide, measure: capMeasure, stage: 'wash', placement: 'detergent_compartment', timing: 'before starting', provenance: label('checked printed instruction'), rows: [{ cells: [{ ...dose, target: 'below' }] }] })
  expect((await lines(tide))[0]?.dose).toEqual({ ...dose, target: 'below' })
})

test('a cap label\'s directions save and list back as printed: marks, rows, and an or-row as two rules of one row', async () => {
  const t = newBackend()
  const as = signedIn(t, 'directions-user')
  const { save, listed } = await tide(as)
  const ids = await save({ measure: { kind: 'cap', marks: [{ label: ' 1 ' }, { label: '3', amount: 39, unit: 'ml' }, { label: '5' }] } })
  expect(ids).toHaveLength(10)

  const supply = await listed()
  expect(supply.measure).toEqual(capMeasure)
  expect(supply.rules.map((rule) => rule.row)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 4, 4])
  const orRow = supply.rules.filter((rule) => rule.row === 4)
  expect(orRow.map((rule) => rule.conditions)).toEqual([
    { loadSizes: ['large'], machineClasses: ['he'] },
    { soilLevels: ['heavy'], machineClasses: ['he'] },
    { loadSizes: ['large'], machineClasses: ['standard'] },
    { soilLevels: ['heavy'], machineClasses: ['standard'] },
  ])
  expect(orRow.every((rule) => rule.rowText === 'Large / heavily soiled')).toBe(true)
  // Other rows keep their own conditions: no soil level is read into them, so an extra-large
  // heavily soiled load fits two rows and the plan asks instead of dosing line 3.
  const medium = supply.rules.find((rule) => rule.row === 1 && rule.conditions.machineClasses?.[0] === 'he')!
  expect(medium).toMatchObject({ conditions: { loadSizes: ['medium'], machineClasses: ['he'] }, dose: { amount: 1, unit: 'cap', mark: '1' }, rowText: null, placement: 'detergent_compartment' })
})

test('saving directions again replaces the product\'s earlier rules, legacy rules included, and makes plans stale', async () => {
  const t = newBackend()
  const as = signedIn(t, 'directions-user')
  const { home, supplyId, save, listed } = await tide(as)
  await t.run(async (ctx) => {
    await ctx.db.insert('rules', { householdId: home.householdId, supplyId, conditions: { minBulkUnits: 1 }, dose: { amount: 30, unit: 'ml' }, stage: 'wash', placement: 'detergent_compartment', timing: 'before cycle start', provenance: label('old entry'), createdAt: 1 })
  })
  const legacy = (await listed()).rules
  expect(legacy).toEqual([expect.objectContaining({ row: null, rowText: null, conditions: { minBulkUnits: 1 }, dose: { amount: 30, unit: 'ml' } })])

  const planned = await planFor(as, home.householdId, [home.shirt])
  await save({ rows: [{ cells: [{ amount: 1, unit: 'cap', mark: '3' }] }] })
  expect((await listed()).rules).toEqual([expect.objectContaining({ row: 1, conditions: {}, dose: { amount: 1, unit: 'cap', mark: '3' } })])
  expect((await as.query(api.plans.get, { planId: planned.planId }))?.status).toBe('stale')
})

test('directions that cannot be followed are refused in plain words and nothing is stored', async () => {
  const t = newBackend()
  const as = signedIn(t, 'directions-user')
  const { home, save, listed } = await tide(as)
  await save()
  const sheets = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Bounce', kind: 'dryer_sheet', provenance: label('Bounce box') })
  const sheetTable = { supplyId: sheets, measure: { kind: 'count' as const, countUnit: 'sheet' as const }, stage: 'dry' as const, placement: 'dryer_drum' as const, timing: 'before starting the dryer', provenance: label('Bounce box') }

  await expect(save({ rows: [{ loadSizes: ['medium'], cells: capCells('2', '3') }] })).rejects.toThrow('is not a mark on the cap')
  await expect(save({ rows: [{ loadSizes: ['medium'], cells: capCells('1', '3') }, { loadSizes: ['large'], cells: [{ amount: 1, unit: 'cap', mark: '3' }] }] })).rejects.toThrow('same columns')
  await expect(save({ stage: 'dry' })).rejects.toThrow('in the washer')
  await expect(save({ provenance: { source: 'sanitized-fixture:owned-tide-label', confidence: 'verified' } })).rejects.toThrow('Fixture evidence')
  await expect(as.mutation(api.inventory.saveLabelDirections, { ...sheetTable, rows: [{ cells: [{ amount: 1.5, unit: 'sheet' }] }] })).rejects.toThrow('whole number')
  await expect(as.mutation(api.inventory.saveLabelDirections, { ...sheetTable, rows: [{ soilLevels: ['heavy'], cells: [{ amount: 2, unit: 'sheet' }] }] })).rejects.toThrow('do not dose by soil')
  await expect(signedIn(t, 'outsider').mutation(api.inventory.saveLabelDirections, { ...sheetTable, rows: [{ cells: [{ amount: 1, unit: 'sheet' }] }] })).rejects.toThrow('Forbidden')

  expect((await listed()).rules).toHaveLength(10)
  await expect(as.mutation(api.inventory.saveLabelDirections, { ...sheetTable, rows: [{ cells: [{ amount: 1, unit: 'sheet' }] }] })).resolves.toHaveLength(1)
})

test('an HE-only label is stored as HE-only', async () => {
  const t = newBackend()
  const as = signedIn(t, 'directions-user')
  const { save, listed } = await tide(as)
  await save({ rows: [{ loadSizes: ['medium'], cells: [{ machineClass: 'he', amount: 1, unit: 'cap', mark: '1' }] }] })
  expect((await listed()).rules.map((rule) => rule.conditions)).toEqual([{ loadSizes: ['medium'], machineClasses: ['he'] }])
})

test('a mark the directions use cannot be removed from the cap, and a product with directions keeps to its machine', async () => {
  const t = newBackend()
  const as = signedIn(t, 'directions-user')
  const { supplyId, save, listed } = await tide(as)
  await save()
  await expect(as.mutation(api.inventory.updateSupply, { supplyId, measure: { kind: 'cap', marks: [{ label: '1' }, { label: '3' }] } })).rejects.toThrow('directions still use')
  await expect(as.mutation(api.inventory.updateSupply, { supplyId, kind: 'dryer_sheet' })).rejects.toThrow('remove them before changing')
  // Adding a printed volume to a mark keeps every rule followable.
  await as.mutation(api.inventory.updateSupply, { supplyId, measure: { kind: 'cap', marks: [{ label: '1', amount: 13, unit: 'ml' }, { label: '3', amount: 39, unit: 'ml' }, { label: '5' }] } })
  expect((await listed()).measure?.marks?.[0]).toEqual({ label: '1', amount: 13, unit: 'ml' })
  await expect(as.mutation(api.inventory.updateSupply, { supplyId, measure: { kind: 'cap', marks: [{ label: '1', amount: 13 }] } })).rejects.toThrow('needs an amount and a unit')
})

test('saveRule keeps a rule\'s conditions when an edit leaves them out, and keeps washer and dryer products apart', async () => {
  const t = newBackend()
  const as = signedIn(t, 'directions-user')
  const home = await intakeHousehold(as)
  const conditioned = await as.mutation(api.inventory.saveRule, {
    supplyId: home.detergent, dose: { amount: 45, unit: 'ml' }, stage: 'wash', placement: 'detergent_compartment', timing: 'before cycle start',
    conditions: { loadSizes: ['large', 'medium', 'large'], machineClasses: ['standard', 'he'], cycles: ['Normal'] }, provenance: label('Tide bottle label'),
  })
  const stored = async () => (await t.run((ctx) => ctx.db.get(conditioned)))!
  expect((await stored()).conditions).toEqual({ loadSizes: ['medium', 'large'], machineClasses: ['he', 'standard'], cycles: ['normal'] })

  await as.mutation(api.inventory.saveRule, { supplyId: home.detergent, ruleId: conditioned, dose: { amount: 50, unit: 'ml' }, stage: 'wash', placement: 'detergent_compartment', timing: 'before cycle start', provenance: label('Tide bottle label') })
  expect(await stored()).toMatchObject({ dose: { amount: 50, unit: 'ml' }, conditions: { loadSizes: ['medium', 'large'], machineClasses: ['he', 'standard'], cycles: ['normal'] } })

  const rule = { dose: { amount: 1, unit: 'sheet' }, stage: 'wash' as const, placement: 'detergent_compartment' as const, timing: 'before starting the dryer', provenance: label('Bounce box') }
  await expect(as.mutation(api.inventory.saveRule, { supplyId: home.detergent, ...rule, dose: { amount: 30, unit: 'ml' }, placement: 'dryer_drum' })).rejects.toThrow('Only a dryer product')
  await expect(as.mutation(api.inventory.saveRule, { supplyId: home.detergent, ...rule, dose: { amount: 30, unit: 'ml' }, conditions: { machineClasses: ['HE'] } })).rejects.toThrow('not a washer class')
  await expect(as.mutation(api.inventory.saveRule, { supplyId: home.detergent, ...rule, dose: { amount: 1, unit: 'cap' } })).rejects.toThrow('Record the marks on the cap')
  const sheets = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Bounce', kind: 'dryer_sheet', provenance: label('Bounce box') })
  const sheetRule = await as.mutation(api.inventory.saveRule, { supplyId: sheets, ...rule })
  expect(await t.run((ctx) => ctx.db.get(sheetRule))).toMatchObject({ stage: 'dry', placement: 'dryer_drum', dose: { amount: 1, unit: 'sheet' } })
  await expect(as.mutation(api.inventory.saveRule, { supplyId: sheets, ...rule, conditions: { soilLevels: ['heavy'] } })).rejects.toThrow('do not dose by soil')
  await expect(as.mutation(api.inventory.saveRule, { supplyId: sheets, ...rule, dose: { amount: 1.5, unit: 'sheet' } })).rejects.toThrow('whole number')
})

/** The intake household with a product of each kind, saved from Add a bottle or box: what it is for, and no label lines yet. */
async function tapped(as: Caller) {
  const home = await intakeHousehold(as)
  const product = (name: string, use: 'detergent' | 'booster' | 'dryer_sheets', measure: typeof capMeasure | { kind: 'count'; countUnit: 'sheet' }) => as.mutation(api.inventory.createSupply, {
    householdId: home.householdId, name, use, kind: use === 'dryer_sheets' ? 'dryer_sheet' : 'chemical', measure,
    ...(use === 'dryer_sheets' ? {} : { formulation: { name, form: 'liquid' } }), provenance: { source: 'label_taps', confidence: 'observed' },
  })
  const tide = await product('Tide', 'detergent', capMeasure)
  const oxi = await product('Oxi', 'booster', capMeasure)
  const bounce = await product('Bounce', 'dryer_sheets', { kind: 'count', countUnit: 'sheet' })
  const lines = async (supplyId: string) => (await as.query(api.inventory.list, { householdId: home.householdId })).supplies.find((supply) => supply.supplyId === supplyId)!.rules
  return { home, tide, oxi, bounce, lines }
}

test('a label line is saved for exactly the load it was asked about, added after the others, and changed in place', async () => {
  const t = newBackend()
  const as = signedIn(t, 'directions-user')
  const { home, tide, lines } = await tapped(as)
  const cap = (mark: string) => ({ amount: 1, unit: 'cap', mark })
  const planned = await planFor(as, home.householdId, [home.shirt])

  await expect(as.mutation(api.inventory.answerLabelRow, { supplyId: tide, context: { loadSize: 'medium', soilLevel: 'normal' }, dose: cap('1'), rowText: '  Normal load ' })).resolves.toMatchObject({ row: 1 })
  expect(await lines(tide)).toEqual([expect.objectContaining({
    row: 1, rowText: 'Normal load', conditions: { loadSizes: ['medium'], soilLevels: ['normal'] }, dose: cap('1'),
    stage: 'wash', placement: 'detergent_compartment', timing: 'before starting', provenance: { source: 'label_taps', confidence: 'observed' },
  })])
  expect((await as.query(api.plans.get, { planId: planned.planId }))?.status).toBe('stale')

  // At the machine: a large load of normal soil in an HE washer, and the same line covers very dirty loads.
  await expect(as.mutation(api.inventory.answerLabelRow, { supplyId: tide, context: { loadSize: 'large', soilLevel: 'normal', washerClass: 'he' }, alsoVeryDirty: true, dose: cap('3'), rowText: '' })).resolves.toMatchObject({ row: 2 })
  // The same load in a standard washer: another column of the label, kept beside the HE one.
  await as.mutation(api.inventory.answerLabelRow, { supplyId: tide, context: { loadSize: 'large', soilLevel: 'normal', washerClass: 'standard' }, dose: cap('5') })
  await expect(as.mutation(api.inventory.answerLabelRow, { supplyId: tide, context: { loadSize: 'small', soilLevel: 'light' }, sameForAll: true, dose: cap('1') })).resolves.toMatchObject({ row: 4 })
  expect((await lines(tide)).map((rule) => [rule.row, rule.rowText, rule.conditions])).toEqual([
    [1, 'Normal load', { loadSizes: ['medium'], soilLevels: ['normal'] }],
    [2, null, { loadSizes: ['large'], machineClasses: ['he'] }],
    [2, null, { soilLevels: ['heavy'], machineClasses: ['he'] }],
    [3, null, { loadSizes: ['large'], soilLevels: ['normal'], machineClasses: ['standard'] }],
    [4, null, {}],
  ])

  // "Change": the same conditions replace their line, which keeps its number; the others are untouched.
  const others = (await lines(tide)).filter((rule) => rule.row !== 1 && rule.row !== 2).map((rule) => rule.ruleId)
  await expect(as.mutation(api.inventory.answerLabelRow, { supplyId: tide, context: { loadSize: 'medium', soilLevel: 'normal' }, dose: cap('3') })).resolves.toMatchObject({ row: 1 })
  await expect(as.mutation(api.inventory.answerLabelRow, { supplyId: tide, context: { loadSize: 'large', soilLevel: 'light', washerClass: 'he' }, alsoVeryDirty: true, dose: cap('5'), rowText: 'Large / heavily soiled' })).resolves.toMatchObject({ row: 2 })
  const changed = await lines(tide)
  expect(changed.filter((rule) => rule.row === 1)).toEqual([expect.objectContaining({ rowText: null, dose: cap('3'), conditions: { loadSizes: ['medium'], soilLevels: ['normal'] } })])
  expect(changed.filter((rule) => rule.row === 2).map((rule) => [rule.rowText, rule.dose.mark])).toEqual([['Large / heavily soiled', '5'], ['Large / heavily soiled', '5']])
  expect(changed.filter((rule) => rule.row !== 1 && rule.row !== 2).map((rule) => rule.ruleId)).toEqual(others)

  // Remove takes the whole line, or-row branches included.
  await as.mutation(api.inventory.removeLabelRow, { supplyId: tide, row: 2 })
  expect((await lines(tide)).map((rule) => rule.row)).toEqual([3, 4, 1])
  await expect(signedIn(t, 'outsider').mutation(api.inventory.removeLabelRow, { supplyId: tide, row: 1 })).rejects.toThrow('Forbidden')
})

test('a product\'s first line says where it goes from what it is for; later lines go the same way', async () => {
  const t = newBackend()
  const as = signedIn(t, 'directions-user')
  const { home, oxi, bounce, lines } = await tapped(as)
  const capful = { amount: 1, unit: 'cap', mark: '1' }

  await as.mutation(api.inventory.answerLabelRow, { supplyId: oxi, context: { loadSize: 'large', soilLevel: 'heavy' }, inDrawer: true, dose: capful })
  await as.mutation(api.inventory.answerLabelRow, { supplyId: oxi, context: { loadSize: 'large', soilLevel: 'normal' }, inDrawer: false, dose: capful })
  expect((await lines(oxi)).map((rule) => [rule.placement, rule.timing])).toEqual([
    ['detergent_compartment', 'with the clothes, before starting'],
    ['detergent_compartment', 'with the clothes, before starting'],
  ])
  const loose = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Loose Oxi', use: 'booster', kind: 'chemical', measure: capMeasure, formulation: { name: 'oxi', form: 'liquid' }, provenance: { source: 'label_taps', confidence: 'observed' } })
  await as.mutation(api.inventory.answerLabelRow, { supplyId: loose, context: {}, sameForAll: true, dose: capful })
  expect(await lines(loose)).toEqual([expect.objectContaining({ placement: 'direct_to_drum', stage: 'wash', conditions: {} })])

  await as.mutation(api.inventory.answerLabelRow, { supplyId: bounce, context: { loadSize: 'large' }, dose: { amount: 2, unit: 'sheet' } })
  expect(await lines(bounce)).toEqual([expect.objectContaining({ stage: 'dry', placement: 'dryer_drum', timing: 'with the clothes, before starting the dryer', conditions: { loadSizes: ['large'] }, dose: { amount: 2, unit: 'sheet' } })])
})

test('a label line that cannot be saved as asked is refused and nothing is stored', async () => {
  const t = newBackend()
  const as = signedIn(t, 'directions-user')
  const { home, tide, bounce, lines } = await tapped(as)
  const answer = (args: Record<string, unknown>) => as.mutation(api.inventory.answerLabelRow, { supplyId: tide, context: { loadSize: 'large', soilLevel: 'normal' }, dose: { amount: 1, unit: 'cap', mark: '3' }, ...args })

  await expect(answer({ dose: { amount: 1, unit: 'cap', mark: '2' } })).rejects.toThrow('is not a mark on the cap')
  await expect(answer({ context: { soilLevel: 'normal' }, alsoVeryDirty: true })).rejects.toThrow('not very dirty')
  await expect(answer({ context: { loadSize: 'large', soilLevel: 'heavy' }, alsoVeryDirty: true })).rejects.toThrow('not very dirty')
  await expect(answer({ alsoVeryDirty: true, sameForAll: true })).rejects.toThrow('every load')
  await expect(answer({ rowText: 'x'.repeat(81) })).rejects.toThrow('too long')
  await expect(as.mutation(api.inventory.answerLabelRow, { supplyId: bounce, context: { loadSize: 'large', soilLevel: 'heavy' }, dose: { amount: 2, unit: 'sheet' } })).rejects.toThrow('do not dose by soil')
  await expect(as.mutation(api.inventory.answerLabelRow, { supplyId: bounce, context: { washerClass: 'he' }, dose: { amount: 2, unit: 'sheet' } })).rejects.toThrow('washer class')
  // A product saved before "what is it for" has nowhere to go until it is said; and a line needs the cap's marks.
  const unnamed = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Old bottle', kind: 'chemical', measure: capMeasure, formulation: { name: 'liquid' }, provenance: label('bottle') })
  await expect(as.mutation(api.inventory.answerLabelRow, { supplyId: unnamed, context: {}, sameForAll: true, dose: { amount: 1, unit: 'cap', mark: '1' } })).rejects.toThrow('Say what kind of product this is first')
  const unmeasured = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Jug', kind: 'chemical', use: 'detergent', formulation: { name: 'liquid' }, provenance: label('jug') })
  await expect(as.mutation(api.inventory.answerLabelRow, { supplyId: unmeasured, context: {}, dose: { amount: 30, unit: 'ml' } })).rejects.toThrow('measured')
  await expect(signedIn(t, 'outsider').mutation(api.inventory.answerLabelRow, { supplyId: tide, context: {}, dose: { amount: 1, unit: 'cap', mark: '1' } })).rejects.toThrow('Forbidden')
  expect(await lines(tide)).toEqual([])
  expect(await lines(unnamed)).toEqual([])
})

test('a washer line answered before the load size is known covers every load only when the person says so', async () => {
  const as = signedIn(newBackend(), 'directions-user')
  const { tide, lines } = await tapped(as)
  const bar3 = { amount: 1, unit: 'cap', mark: '3' }
  // At plan time no size is known: a line picked with the toggle off would read the same for a half-full drum.
  await expect(as.mutation(api.inventory.answerLabelRow, { supplyId: tide, context: { soilLevel: 'normal', washerClass: 'he' }, dose: bar3 })).rejects.toThrow('every load or depends on how full')
  expect(await lines(tide)).toEqual([])
  await as.mutation(api.inventory.answerLabelRow, { supplyId: tide, context: { soilLevel: 'normal', washerClass: 'he' }, sameForAll: true, dose: bar3 })
  expect((await lines(tide)).map((rule) => rule.conditions)).toEqual([{ machineClasses: ['he'] }])
  // Choosing between two printed lines that already fit every size keeps that choice size-free.
  await as.mutation(api.inventory.answerLabelRow, { supplyId: tide, context: { soilLevel: 'heavy', washerClass: 'he' }, dose: bar3 })
  expect((await lines(tide)).map((rule) => rule.conditions)).toEqual([{ machineClasses: ['he'] }, { soilLevels: ['heavy'], machineClasses: ['he'] }])
  // A printed line for very dirty loads only does not cover a normal load, even at the same dose.
  await as.mutation(api.inventory.saveLabelDirections, { supplyId: tide, measure: capMeasure, stage: 'wash', placement: 'detergent_compartment', timing: 'before starting', provenance: label('checked printed instruction'), rows: [{ soilLevels: ['heavy'], cells: [bar3] }] })
  await expect(as.mutation(api.inventory.answerLabelRow, { supplyId: tide, context: { soilLevel: 'normal' }, dose: bar3 })).rejects.toThrow('every load or depends on how full')
  expect((await lines(tide)).map((rule) => rule.conditions)).toEqual([{ soilLevels: ['heavy'] }])
})
