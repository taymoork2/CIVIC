import assert from 'node:assert/strict'

const {
  bleachAnswers,
  cycleGentleness,
  defaultPackingUnits,
  flagReasons,
  garmentKinds,
  kindBulkUnits,
  labelTreatmentPhase,
  phaseOrder,
  soilForFlag,
  stainReasons,
  tagTemperatures,
  unitsPerCuFt,
  unitsPerLitre,
  useDirections,
  washerPrepPhases,
  dryerPhases,
} = (await import(`./index${'.ts'}`)) as typeof import('./index')

// Every type has about-bulk; personal tags never supply laundry evidence.
assert.deepEqual(Object.keys(kindBulkUnits).sort(), [...garmentKinds].sort(), 'every kind has an about-bulk')
for (const kind of garmentKinds) assert.ok(kindBulkUnits[kind] > 0, `${kind} has a positive about-bulk`)
assert.equal(kindBulkUnits.sheets, 3, 'sheets are about three pounds')
assert.equal(kindBulkUnits.socks, 0.25, 'socks are about a quarter pound')

// "How dirty?" preselect: the heaviest reason wins, and no reason is normal.
assert.equal(soilForFlag([]), 'normal', 'no reason preselects normal')
assert.equal(soilForFlag(['worn']), 'light', 'just worn is a little dirty')
for (const reason of ['sweat', 'smell', 'wet'] as const) assert.equal(soilForFlag([reason]), 'normal', `${reason} is normal`)
for (const reason of stainReasons) assert.equal(soilForFlag([reason]), 'heavy', `${reason} is very dirty`)
assert.equal(soilForFlag(['worn', 'sweat']), 'normal', 'sweat outranks just worn')
assert.equal(soilForFlag(['worn', 'sweat', 'food']), 'heavy', 'a stain outranks the rest')
for (const reason of flagReasons) assert.ok(['light', 'normal', 'heavy'].includes(soilForFlag([reason])), `${reason} maps to a soil level`)
assert.ok(stainReasons.every((reason) => (flagReasons as readonly string[]).includes(reason)), 'stain reasons are flag reasons')

// The care symbol's dots, and the about-size constants.
assert.deepEqual(tagTemperatures, { cold: 30, warm: 40, hot: 50, very_hot: 60 }, 'water dots map to 30/40/50/60 °C')
assert.equal(unitsPerCuFt, 4)
assert.equal(unitsPerLitre, 0.14)
assert.equal(defaultPackingUnits, 14)
assert.deepEqual(cycleGentleness, ['delicate', 'permanent_press', 'normal', 'quick', 'heavy_duty'], 'gentlest cycle first')

// useDirections: the one mapping from product type to where it goes.
const drawer = ['detergent_compartment', 'softener_compartment', 'direct_to_drum']
const drumOnly = ['direct_to_drum']
assert.deepEqual(useDirections('detergent', drawer), { kind: 'chemical', stage: 'wash', placement: 'detergent_compartment', timing: 'before starting' })
assert.deepEqual(useDirections('detergent', drumOnly), { kind: 'chemical', stage: 'wash', placement: 'direct_to_drum', timing: 'before loading the clothes' })
assert.deepEqual(useDirections('pods', drawer), { kind: 'single_use', countUnit: 'pod', stage: 'wash', placement: 'direct_to_drum', timing: 'before loading the clothes' })
assert.deepEqual(useDirections('softener', drawer), { kind: 'chemical', stage: 'rinse', placement: 'softener_compartment', timing: 'at the start of the rinse' })
assert.deepEqual(useDirections('softener', drumOnly), { kind: 'chemical', stage: 'rinse', placement: 'direct_to_drum', timing: 'at the start of the rinse' })
for (const use of ['stain_remover', 'booster', 'sanitizer'] as const) {
  if (use !== 'booster') assert.deepEqual(useDirections(use, drawer), { kind: 'chemical', stage: 'wash', placement: 'direct_to_drum', timing: 'with the clothes, before starting' }, `${use} goes in the drum by default`)
  assert.equal(useDirections(use, drawer, true).placement, 'detergent_compartment', `${use} goes in the drawer when the person says so`)
  assert.equal(useDirections(use, drumOnly, true).placement, 'direct_to_drum', `${use} stays in the drum when the washer has no drawer slot`)
}
// A booster (OxiClean) goes in the empty drum before the clothes, or in the drawer when the person says so.
assert.deepEqual(useDirections('booster', drawer), { kind: 'chemical', stage: 'wash', placement: 'direct_to_drum', timing: 'before loading the clothes' })
assert.equal(labelTreatmentPhase(useDirections('booster', drawer)), 'drum', 'a booster goes in the empty drum')
assert.deepEqual(useDirections('booster', drawer, true), { kind: 'chemical', stage: 'wash', placement: 'detergent_compartment', timing: 'with the clothes, before starting' })
// Scent beads (Downy Unstopables): the empty drum before the clothes, never a drawer, whatever the drawer answer.
for (const inDrawer of [undefined, false, true]) {
  assert.deepEqual(useDirections('scent_booster', drawer, inDrawer), { kind: 'chemical', stage: 'wash', placement: 'direct_to_drum', timing: 'before loading the clothes' })
}
assert.equal(labelTreatmentPhase(useDirections('scent_booster', drawer)), 'drum', 'scent beads go in the empty drum')
// A rinse sanitizer (Lysol Laundry Sanitizer) goes in the rinse: the softener slot when listed, else the drum at the start of the rinse.
assert.deepEqual(useDirections('rinse_sanitizer', ['softener_compartment']), { kind: 'chemical', stage: 'rinse', placement: 'softener_compartment', timing: 'at the start of the rinse' })
assert.deepEqual(useDirections('rinse_sanitizer', []), { kind: 'chemical', stage: 'rinse', placement: 'direct_to_drum', timing: 'at the start of the rinse' })
assert.equal(labelTreatmentPhase(useDirections('rinse_sanitizer', [])), 'cycle', 'a rinse sanitizer is added mid-cycle without a softener slot')
assert.equal(useDirections('rinse_sanitizer', drawer, true).placement, 'softener_compartment', 'the drawer answer never moves a rinse product to the wash slot')
assert.deepEqual(useDirections('dryer_sheets', drawer), { kind: 'dryer_sheet', countUnit: 'sheet', stage: 'dry', placement: 'dryer_drum', timing: 'with the clothes, before starting the dryer' })
assert.deepEqual(useDirections('dryer_balls', drawer), { kind: 'wool_dryer_ball', countUnit: 'ball', stage: 'dry', placement: 'dryer_drum', timing: 'with the clothes, before starting the dryer' })

// Fullness comes right after loading, on the washer and on the dryer.
assert.equal(phaseOrder.indexOf('drum_fullness'), phaseOrder.indexOf('load') + 1, 'drum fullness right after loading the washer')
assert.equal(phaseOrder.indexOf('dryer_fullness'), phaseOrder.indexOf('dryer_load') + 1, 'dryer fullness right after loading the dryer')
assert.ok(phaseOrder.indexOf('drum_fullness') < phaseOrder.indexOf('dispenser'), 'drum fullness comes before the drawer')
assert.ok(washerPrepPhases.has('drum_fullness'), 'drum fullness is washer prep')
assert.ok(dryerPhases.has('dryer_fullness'), 'dryer fullness is a dryer phase')

assert.deepEqual([...bleachAnswers], ['any', 'non_chlorine', 'none'], 'the bleach triangle: plain, two lines, crossed out; a tag that does not say is left unset')

console.log('vocabulary checks passed')
