import assert from 'node:assert/strict'

import type { CareEvidence, LoadPlan, MachineEvidence, PlanResult, PlannerInput, SupplyItem, TextileEvidence } from './index'

const { plan, chooseDryerSetting, documentedHeatSettings } = (await import(`./index${'.ts'}`)) as typeof import('./index')

const verified = { status: 'verified' as const }

const washer: MachineEvidence = {
  id: 'washer',
  modelId: 'synthetic-washer',
  applianceType: 'front_load_washer',
  highEfficiency: true,
  capacityUnits: 12,
  capacityConfidence: 'verified',
  evidence: verified,
  supportedCycles: ['normal'],
  dispensing: { placements: ['detergent_compartment'] },
}

function dryer(id: string, extra: Partial<MachineEvidence> = {}): MachineEvidence {
  return {
    id,
    name: `Dryer ${id}`,
    applianceType: 'tumble_dryer',
    capacityUnits: 10,
    capacityConfidence: 'verified',
    evidence: verified,
    heatSettings: [{ heat: 'high', label: 'High temp' }, { heat: 'medium', label: 'Medium temp' }, { heat: 'low', label: 'Low temp' }],
    ...extra,
  }
}

const detergent: SupplyItem = { id: 'detergent', kind: 'detergent', labelEvidence: verified, formulation: { form: 'liquid' }, applicationRules: [{ id: 'detergent-rule', dose: { amount: 30, unit: 'ml' }, placement: 'detergent_compartment', evidence: verified }] }

const sheets: SupplyItem = {
  id: 'sheets',
  kind: 'dryer_sheet',
  labelEvidence: { status: 'verified', source: 'bounce-box' },
  measurement: { kind: 'count', countUnit: 'sheet' },
  applicationRules: [
    { id: 'sheets-small-medium', conditions: { loadSizes: ['small', 'medium'] }, dose: { amount: 1, unit: 'sheet' }, stage: 'dry', placement: 'dryer_drum', evidence: verified },
    { id: 'sheets-large', conditions: { loadSizes: ['large', 'extra_large'] }, dose: { amount: 2, unit: 'sheet' }, stage: 'dry', placement: 'dryer_drum', evidence: verified },
  ],
}

/** A box that prints one line for every load. */
const oneSheet: SupplyItem = { ...sheets, applicationRules: [{ id: 'sheets-any', dose: { amount: 1, unit: 'sheet' }, stage: 'dry', placement: 'dryer_drum', evidence: verified }] }

const balls: SupplyItem = {
  id: 'wool-balls',
  kind: 'wool_dryer_ball',
  labelEvidence: verified,
  measurement: { kind: 'count', countUnit: 'ball' },
  applicationRules: [{ id: 'balls-rule', dose: { amount: 3, unit: 'ball' }, stage: 'dry', placement: 'dryer_drum', evidence: verified }],
}

function garment(id: string, drying: Partial<CareEvidence>, extra: Partial<TextileEvidence> = {}): TextileEvidence {
  return {
    id,
    colorGroup: 'white',
    bulkUnits: 1,
    material: 'cotton',
    care: { washMethod: 'machine', cycle: 'normal', status: 'confirmed', ...drying },
    ...extra,
  }
}

const anyHeat = (id: string) => garment(id, { dryMethod: 'tumble_dry' })
const lowHeat = (id: string) => garment(id, { dryMethod: 'tumble_dry', dryHeat: 'low' })

function input(textiles: TextileEvidence[], extra: Partial<PlannerInput> = {}): PlannerInput {
  return { textiles, supplies: [detergent], machines: [washer], dryers: [dryer('dryer')], ...extra }
}

const onlyLoad = (result: PlanResult): LoadPlan => {
  assert.equal(result.loads.length, 1, 'one load')
  return result.loads[0]!
}
const drying = (result: PlanResult) => onlyLoad(result).drying!
const dryingReasons = (result: PlanResult) => result.reasons.filter((reason) => reason.code === 'drying_decision')
const dryingText = (result: PlanResult) => result.explanations.filter((entry) => entry.code === 'drying_decision').map((entry) => entry.text)

// Heat: one setting for the load, the hottest the dryer offers at or below every garment's maximum, in the dryer's own words.
const lowAndAny = plan(input([anyHeat('a-any'), lowHeat('b-low')]))
assert.equal(drying(lowAndAny).status, 'ready')
assert.deepEqual([drying(lowAndAny).heat, drying(lowAndAny).heatLabel], ['low', 'Low temp'], 'a low-heat garment keeps the whole load on low')
assert.deepEqual(drying(lowAndAny).tumbleTextileIds, ['a-any', 'b-low'])
assert.equal(drying(lowAndAny).dryerId, 'dryer')
const mediumMax = plan(input([garment('medium', { dryMethod: 'tumble_dry', dryHeat: 'medium' })], { dryers: [dryer('dryer', { heatSettings: [{ heat: 'high', label: 'Cottons' }, { heat: 'low', label: 'Delicates' }] })] }))
assert.deepEqual([drying(mediumMax).heat, drying(mediumMax).heatLabel], ['low', 'Delicates'], 'heat never goes above the care maximum when the dryer has no exact match')
assert.deepEqual([drying(plan(input([anyHeat('any')]))).heat, drying(plan(input([anyHeat('any')]))).heatLabel], ['high', 'High temp'], 'a tumble-dry label without dots allows any heat')

// A low tag is a temperature (<= 140 F), not a button name. A button's temperature comes only from the exact
// model's spec sheet (Speed Queen SSGNCFGW113TW01: Delicates 115, Low 145, Medium 155, High 160); a typed or stored tempF is ignored.
const lowOnly = (heatSettings: NonNullable<MachineEvidence['heatSettings']>, extra: Partial<MachineEvidence> = {}) => drying(plan(input([lowHeat('low')], { dryers: [dryer('dryer', { heatSettings, ...extra })] })))
const ownerModel = { modelId: 'SSGNCFGW113TW01' }
const ownerButtons = [{ heat: 'no_heat', label: 'No Heat' }, { heat: 'delicate', label: 'Delicates' }, { heat: 'low', label: 'Low' }, { heat: 'medium', label: 'Medium' }, { heat: 'high', label: 'High' }]
const owner = lowOnly(ownerButtons, ownerModel)
assert.deepEqual([owner.heat, owner.heatLabel, owner.heatNote], ['delicate', 'Delicates', 'cooler'], 'the owner\'s dryer: Low is 145 F, over a low tag\'s 140 F, so a low tag picks Delicates')
const typedCool = lowOnly([{ heat: 'low', label: 'Low', tempF: 100 }, { heat: 'delicate', label: 'Delicates', tempF: 90 }], ownerModel)
assert.deepEqual([typedCool.heat, typedCool.heatNote], ['delicate', 'cooler'], 'a typed cool Low never overrides the documented 145 F')
const typedOnUnknown = lowOnly([{ heat: 'low', label: 'Low', tempF: 100 }, { heat: 'delicate', label: 'Delicates' }])
assert.deepEqual([typedOnUnknown.heat, typedOnUnknown.heatNote], ['delicate', 'cooler'], 'an unknown model has no temperature, even a typed one: Low is unverified, so the coolest heated button is used')
const unknownTemp = lowOnly([{ heat: 'high', label: 'High' }, { heat: 'low', label: 'Low' }, { heat: 'delicate', label: 'Delicates' }])
assert.deepEqual([unknownTemp.heat, unknownTemp.heatNote], ['delicate', 'cooler'], 'an unknown Low temperature uses the coolest heated button')
const noCooler = lowOnly([{ heat: 'high', label: 'High' }, { heat: 'low', label: 'Low' }])
assert.deepEqual([noCooler.heat, noCooler.heatNote], ['low', 'unverified'], 'without a cooler button, low is kept with a note')
const noCoolerHot = lowOnly([{ heat: 'low', label: 'Low' }], ownerModel)
assert.deepEqual([noCoolerHot.status, noCoolerHot.heldOut.map((hold) => hold.reason)], ['none', ['heat_unavailable']], 'with no Delicates button, a documented Low over the tag\'s limit is never used: the piece air dries')
assert.equal(lowOnly([{ heat: 'delicate', label: 'Delicates' }, { heat: 'low', label: 'Low' }], { modelNumber: 'SSGNCFGW113TW01' }).heat, 'delicate', 'the model number identifies the model too')
assert.equal(lowOnly([{ heat: 'delicate', label: 'Delicates' }, { heat: 'low', label: 'Low' }], { modelId: 'toString' }).heatNote, 'cooler', 'a name from Object.prototype is not a model')
assert.deepEqual(documentedHeatSettings('SSGNCFGW113TW01', [{ heat: 'low', label: 'Low', tempF: 10 }, { heat: 'no_heat', label: 'Air' }]), [{ heat: 'low', label: 'Low', tempF: 145 }, { heat: 'no_heat', label: 'Air' }])
assert.deepEqual(documentedHeatSettings(undefined, [{ heat: 'low', label: 'Low', tempF: 10 }]), [{ heat: 'low', label: 'Low' }], 'a stored temperature is dropped for an unknown model')
const labelledDelicate = lowOnly([{ heat: 'low', label: 'Delicate' }, { heat: 'high', label: 'Hot' }])
assert.deepEqual([labelledDelicate.heat, labelledDelicate.heatLabel], ['low', 'Delicate'], 'a label is never remapped to the delicate heat')
const medium = drying(plan(input([garment('m', { dryMethod: 'tumble_dry', dryHeat: 'medium' })], { dryers: [dryer('dryer', { heatSettings: [{ heat: 'delicate', label: 'Delicates' }, { heat: 'medium', label: 'Med' }, { heat: 'high', label: 'High' }] })] })))
assert.deepEqual([medium.heat, medium.heatNote], ['medium', undefined], 'a medium ceiling is unchanged')
assert.equal(drying(plan(input([anyHeat('h')]))).heatNote, undefined, 'a high ceiling is unchanged')
const direct = (maxHeat: string, tempF?: number) => chooseDryerSetting([{ heat: 'delicate', label: 'D' }, { heat: 'low', label: 'L', ...(tempF === undefined ? {} : { tempF }) }, { heat: 'medium', label: 'M' }], maxHeat)
assert.deepEqual([direct('low', 130)?.setting.heat, direct('low', 130)?.note], ['low', null])
assert.deepEqual([direct('low')?.setting.heat, direct('low')?.note], ['delicate', 'cooler'])
assert.equal(direct('delicate')?.setting.heat, 'delicate')
assert.equal(chooseDryerSetting([{ heat: 'high', label: 'H' }], 'low'), undefined, 'no button low enough')
// A button printed hotter than the tag allows is never used, whatever its name (Codex review, October 7).
assert.equal(chooseDryerSetting([{ heat: 'delicate', label: 'D', tempF: 160 }], 'low'), undefined, 'a hot Delicates is not a low setting')
assert.deepEqual(chooseDryerSetting([{ heat: 'no_heat', label: 'Air' }, { heat: 'delicate', label: 'D', tempF: 160 }], 'low')?.setting.heat, 'no_heat', 'falls back to no heat when every heated button is too hot')
assert.deepEqual(chooseDryerSetting([{ heat: 'delicate', label: 'D', tempF: 115 }, { heat: 'low', label: 'L', tempF: 145 }], 'low'), { setting: { heat: 'delicate', label: 'D', tempF: 115 }, note: 'cooler' }, 'a hot Low gives way to Delicates and says so')
assert.equal(chooseDryerSetting([{ heat: 'medium', label: 'M', tempF: 190 }, { heat: 'low', label: 'L', tempF: 130 }], 'medium')?.setting.heat, 'low', 'a medium tag skips a button over 176 F')

// Garments hang whenever the label does not clearly allow the dryer.
const restricted = plan(input([garment('sweater', { dryMethod: 'tumble_dry', restrictions: ['Do not tumble dry'] }), anyHeat('tee')]))
assert.deepEqual(drying(restricted).heldOut, [{ textileId: 'sweater', method: 'do_not_tumble_dry', reason: 'care_label' }], 'a do-not-tumble restriction overrides tumble_dry')
assert.deepEqual(drying(restricted).tumbleTextileIds, ['tee'])
assert.deepEqual(drying(plan(input([garment('knit', { restrictions: ['Lay flat to dry'] }), anyHeat('tee')]))).heldOut, [{ textileId: 'knit', method: 'dry_flat', reason: 'care_label' }], 'lay flat to dry reads as dry flat')
assert.deepEqual(drying(plan(input([garment('shirt', { dryMethod: 'line_dry' }), anyHeat('tee')]))).heldOut, [{ textileId: 'shirt', method: 'line_dry', reason: 'care_label' }], 'a line-dry symbol hangs')
const unknownMethod = plan(input([garment('mystery', {}), anyHeat('tee')]))
assert.deepEqual(drying(unknownMethod).heldOut, [{ textileId: 'mystery', method: 'unknown', reason: 'drying_unknown' }], 'no drying symbol on record stays out')
assert.ok(dryingText(unknownMethod).includes('mystery have no drying instructions on record; they stay out of the dryer.'))
const unconfirmed = plan(input([garment('guess', { dryMethod: 'tumble_dry', status: undefined, evidence: { status: 'user-supplied' } }), anyHeat('tee')]))
assert.deepEqual(drying(unconfirmed).heldOut, [{ textileId: 'guess', method: 'unknown', reason: 'drying_unknown' }], 'drying care from memory is not confirmed, so it hangs')
const stained = plan({ ...input([{ ...anyHeat('grease'), stainReport: { kind: 'oil_grease', priorTreatmentAttempts: [] } }, anyHeat('tee')]) })
assert.deepEqual(drying(stained).heldOut, [{ textileId: 'grease', method: 'line_dry', reason: 'stain' }], 'a treated stain stays out of the heat')

// A garment whose maximum is below every heat the dryer offers hangs.
const noHeat = plan(input([garment('delicate', { dryMethod: 'tumble_dry', dryHeat: 'no_heat' }), lowHeat('tee')]))
assert.deepEqual(drying(noHeat).heldOut, [{ textileId: 'delicate', method: 'line_dry', reason: 'heat_unavailable' }])
assert.ok(dryingReasons(noHeat).some((reason) => reason.details.cause === 'heat_unavailable' && reason.machineId === 'dryer'))
assert.equal(drying(noHeat).heat, 'low', 'the others still tumble on low')

// Nothing tumbles: status none, and the wash is unaffected.
const allHeld = plan(input([garment('a', { dryMethod: 'line_dry' }), garment('b', {})]))
assert.equal(drying(allHeld).status, 'none')
assert.equal(drying(allHeld).heat, null)
assert.equal(allHeld.status, 'ready', 'drying decisions never block the wash')
assert.equal(onlyLoad(allHeld).status, 'ready')

// No dryer recorded: no drying plan at all, and the rest of the plan is exactly what it was.
const noDryerInput: PlannerInput = { textiles: [anyHeat('tee')], supplies: [detergent, sheets], machines: [washer] }
const noDryer = plan(noDryerInput)
assert.equal(onlyLoad(noDryer).drying, null)
assert.equal(dryingReasons(noDryer).length, 0)
assert.equal(noDryer.cost.dryer, 0)
const washOnly = plan({ ...noDryerInput, supplies: [detergent] })
assert.deepEqual({ ...noDryer, inputSnapshot: null, inputHash: null }, { ...washOnly, inputSnapshot: null, inputHash: null }, 'dryer products change nothing without a dryer')

// Dryer choice: evidence and heat settings are required; the preferred usable dryer wins over a lower id.
const unknownDryer = plan(input([anyHeat('tee')], { dryers: [dryer('dryer', { evidence: { status: 'unknown' } })] }))
assert.deepEqual([drying(unknownDryer).status, drying(unknownDryer).dryerId], ['needs_confirmation', null], 'an unconfirmed dryer hangs everything')
assert.ok(dryingText(unknownDryer).includes('No dryer has confirmed evidence and heat settings; this load will be hung to dry.'))
assert.equal(unknownDryer.status, 'ready', 'and still does not block the wash')
assert.equal(drying(plan(input([anyHeat('tee')], { dryers: [dryer('dryer', { heatSettings: [] })] }))).dryerId, null, 'a dryer without heat settings cannot be used')
const preferred = plan(input([anyHeat('tee')], { dryers: [dryer('a-dryer'), dryer('b-dryer')], preferences: { preferredDryerId: 'b-dryer' } }))
assert.equal(drying(preferred).dryerId, 'b-dryer', 'the preferred dryer wins')
assert.equal(drying(plan(input([anyHeat('tee')], { dryers: [dryer('b-dryer'), dryer('a-dryer')] }))).dryerId, 'a-dryer', 'otherwise the lowest id')
assert.equal(drying(plan(input([anyHeat('tee')], { dryers: [], machines: [washer, dryer('in-machines')] }))).dryerId, 'in-machines', 'a dryer recorded among the machines is planned as a dryer')

// Capacity and size by the dryer's own drum.
const tees = Array.from({ length: 11 }, (_, index) => anyHeat(`tee-${String(index + 1).padStart(2, '0')}`))
const overCapacity = plan(input(tees))
assert.equal(drying(overCapacity).status, 'needs_confirmation', 'more than the dryer holds needs confirmation')
assert.ok(dryingReasons(overCapacity).some((reason) => reason.details.cause === 'dryer_capacity'))
assert.equal(drying(plan(input(tees.slice(0, 4), { dryers: [dryer('dryer', { capacityConfidence: 'unknown' })] }))).loadSize, null, 'a capacity of unknown confidence gives no size')
assert.equal(drying(overCapacity).fit, 'over')
assert.equal(drying(plan(input(tees.slice(0, 4)))).fit, 'fits', 'a known capacity is checked')
// An unknown capacity is never unlimited: the fit is reported as not checked, even for a big pile.
const unknownCapacity = drying(plan(input(tees, { dryers: [dryer('dryer', { capacityConfidence: 'unknown' })] })))
assert.deepEqual([unknownCapacity.fit, unknownCapacity.capacityUnits], ['not_checked', null], 'an unknown capacity says fit not checked')
const noCapacity = drying(plan(input(tees, { dryers: [dryer('dryer', { capacityUnits: undefined })] })))
assert.equal(noCapacity.fit, 'not_checked', 'a dryer with no capacity recorded is not treated as unlimited')

// Dryer products: the label's one line when it is the same for every load; a line by size is chosen at the machine
// from how full the dryer is. Left out (never blocking) when it cannot be vouched for.
const withSheets = (textiles: TextileEvidence[], supplies: SupplyItem[] = [detergent, sheets, balls]) => plan(input(textiles, { supplies }))
const small = withSheets(tees.slice(0, 2))
assert.equal(drying(small).loadSize, null, 'a dryer load has no estimated size')
const sizedSheets = drying(small).treatments.find((step) => step.supplyId === 'sheets')!
assert.deepEqual(sizedSheets.dose, { amount: 0, unit: 'at_machine' }, 'a dose by size waits for the dryer fullness answer')
assert.equal(sizedSheets.atMachine?.machine, 'dryer')
assert.deepEqual(sizedSheets.atMachine?.candidates.map((candidate) => [candidate.size, candidate.dose.amount]), [['small', 1], ['medium', 1], ['large', 2], ['extra_large', 2]], 'every size the box doses is a candidate')
assert.deepEqual([sizedSheets.stage, sizedSheets.placement, sizedSheets.timing, sizedSheets.confirmation], ['dry', 'dryer_drum', 'before starting the dryer', 'confirmed'])
assert.equal(drying(small).status, 'ready', 'and the load still dries')
const sheetStep = drying(withSheets(tees.slice(0, 2), [detergent, oneSheet, balls])).treatments.find((step) => step.supplyId === 'sheets')!
assert.deepEqual(sheetStep.dose, { amount: 1, unit: 'sheet' }, 'one line for every load is dosed now')
assert.deepEqual([sheetStep.stage, sheetStep.placement, sheetStep.timing, sheetStep.basis, sheetStep.atMachine], ['dry', 'dryer_drum', 'before starting the dryer', null, undefined])
const ballStep = drying(small).treatments.find((step) => step.supplyId === 'wool-balls')!
assert.equal(ballStep.reusable, true, 'wool balls are reusable')
assert.equal(sheetStep.reusable, undefined)
const noSoftener = withSheets([garment('gym', { dryMethod: 'tumble_dry', restrictions: ['Do not use fabric softener'] }), anyHeat('tee')])
assert.deepEqual(drying(noSoftener).omitted, [{ supplyId: 'sheets', cause: 'garment_restriction' }], 'no fabric softener leaves the sheet out')
assert.deepEqual(drying(noSoftener).treatments.map((step) => step.supplyId), ['wool-balls'], 'and keeps the balls')
const unverified = withSheets(tees.slice(0, 2), [detergent, { ...sheets, labelEvidence: { status: 'estimated' } }])
assert.deepEqual(drying(unverified).omitted, [{ supplyId: 'sheets', cause: 'insufficient_product_evidence' }], 'an unread sheet box is left out')
assert.deepEqual([drying(unverified).status, unverified.status], ['ready', 'ready'], 'and the load still dries and washes')
assert.ok(dryingText(unverified).includes('sheets is left out of the dryer (its label is not confirmed).'))
const soilSheet = withSheets(tees.slice(0, 2), [detergent, { ...sheets, applicationRules: [{ ...sheets.applicationRules![0]!, conditions: { soilLevels: ['heavy'] } }] }])
assert.deepEqual(drying(soilSheet).omitted, [{ supplyId: 'sheets', cause: 'needs_input' }], 'a dryer row that needs an answer is left out, not asked')

// Cost: one dryer start per load that is ready to tumble; balls cost nothing.
const priced = plan(input(tees.slice(0, 4), { supplies: [detergent, oneSheet, balls], pricing: { currency: 'USD', washer: { type: 'flat_per_start', price: 2 }, dryer: { type: 'flat_per_start', price: 1.5 }, supplyUnitPrices: { sheets: 0.1, 'wool-balls': 5 } } }))
assert.equal(priced.cost.dryer, 1.5)
assert.equal(priced.cost.supplies, 0.1, 'one sheet; the balls come back out')
assert.equal(priced.cost.total, 2 + 1.5 + 0.1)
assert.equal(plan(input(tees, { pricing: { dryer: { type: 'flat_per_start', price: 1.5 } } })).cost.dryer, 0, 'a load that must be confirmed before drying is not priced')

// Stable output.
assert.equal(JSON.stringify(plan(input([anyHeat('a'), lowHeat('b'), garment('c', {})], { supplies: [detergent, sheets, balls] }))), JSON.stringify(plan(input([anyHeat('a'), lowHeat('b'), garment('c', {})], { supplies: [detergent, sheets, balls] }))), 'drying plans are byte-stable')

console.log('drying checks passed')
