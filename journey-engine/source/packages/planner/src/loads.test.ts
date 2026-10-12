import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import type { CareEvidence, DecisionReason, LoadPin, MachineEvidence, PlanResult, PlannerInput, SupplyItem, TextileEvidence } from './index'

const { plan } = (await import(`./index${'.ts'}`)) as typeof import('./index')

const verified = { status: 'verified' as const }
const observed = { status: 'observed' as const, source: 'tag_taps' }

function washer(extra: Partial<MachineEvidence> = {}): MachineEvidence {
  return {
    id: 'washer',
    applianceType: 'front_load_washer',
    highEfficiency: true,
    capacityUnits: 8,
    capacityConfidence: 'verified',
    evidence: verified,
    supportedCycles: ['delicate', 'permanent_press', 'normal', 'heavy_duty'],
    dispensing: { placements: ['detergent_compartment'] },
    ...extra,
  }
}

function dryer(heats: readonly string[]): MachineEvidence {
  return {
    id: 'dryer',
    applianceType: 'tumble_dryer',
    capacityUnits: 10,
    capacityConfidence: 'verified',
    evidence: verified,
    heatSettings: heats.map((heat) => ({ heat, label: `${heat} button` })),
  }
}

const detergent: SupplyItem = {
  id: 'detergent',
  kind: 'detergent',
  labelEvidence: observed,
  formulation: { form: 'liquid' },
  applicationRules: [{ id: 'detergent-any', dose: { amount: 30, unit: 'ml' }, stage: 'wash', placement: 'detergent_compartment', evidence: observed }],
}

function care(extra: Partial<CareEvidence> = {}): CareEvidence {
  return { washMethod: 'machine', cycle: 'normal', maxTemperatureC: 40, dryMethod: 'tumble_dry', status: 'confirmed', evidence: observed, ...extra }
}

function garment(id: string, extra: Partial<TextileEvidence> = {}, careExtra: Partial<CareEvidence> = {}): TextileEvidence {
  return { id, colorGroup: 'medium', bulkUnits: 1, soilLevel: 'normal', care: care(careExtra), ...extra }
}

function input(textiles: readonly TextileEvidence[], extra: Partial<PlannerInput> = {}): PlannerInput {
  return { textiles, supplies: [detergent], machines: [washer()], ...extra }
}

const loadsOf = (result: PlanResult): string[][] => result.loads.map((load) => [...load.textileIds])
const reasonsOf = (result: PlanResult, code: DecisionReason['code'], cause?: string): DecisionReason[] =>
  result.reasons.filter((reason) => reason.code === code && (cause === undefined || reason.details.cause === cause))
const excluded = (result: PlanResult): string[] => result.exclusions.map((exclusion) => exclusion.textileId)

// Baby separation: on by default, off by the household's switch, and never in Wash now.
const baby = (id: string) => garment(id, { wearerKind: 'baby' })
const adult = (id: string) => garment(id, { wearerKind: 'adult' })
const family = [baby('baby-1'), baby('baby-2'), adult('mum-1'), garment('dad-1')]

const separated = plan(input(family))
assert.deepEqual(loadsOf(separated), [['baby-1', 'baby-2'], ['dad-1', 'mum-1']], 'baby clothes wash on their own by default')
assert.equal(separated.status, 'ready')
assert.equal(reasonsOf(separated, 'preference_applied', 'baby_separation').length, 1, 'the extra load records why it was started')
assert.equal(reasonsOf(separated, 'preference_applied', 'baby_separation')[0]!.loadId, 'load-002')

const togetherOff = plan(input(family, { preferences: { babySeparate: false } }))
assert.deepEqual(loadsOf(togetherOff), [['baby-1', 'baby-2', 'dad-1', 'mum-1']], 'switched off, baby clothes share a load')
assert.equal(reasonsOf(togetherOff, 'preference_applied', 'baby_separation').length, 0)
assert.equal(plan(input(family, { preferences: { babySeparate: true } })).loads.length, 2, 'switched on explicitly, the same extra load')

const babiesOnly = plan(input([baby('baby-1'), baby('baby-2')]))
assert.equal(babiesOnly.loads.length, 1, 'baby clothes together are one load')
assert.equal(reasonsOf(babiesOnly, 'preference_applied', 'baby_separation').length, 0, 'no separation note without anything to separate from')

// A baby load that other rules split anyway records no baby separation.
const cycleSplit = plan(input([baby('baby-1'), adult('mum-delicate')].map((entry, index) => index === 1 ? { ...entry, care: care({ cycle: 'delicate' }) } : entry)))
assert.equal(cycleSplit.loads.length, 2)
assert.equal(reasonsOf(cycleSplit, 'preference_applied', 'baby_separation').length, 0, 'a load another rule started is not put down to baby separation')

// Pins: the same group shares a load; different groups separate even when compatible.
const trio = [garment('a'), garment('b'), garment('c')]
assert.deepEqual(loadsOf(plan(input(trio))), [['a', 'b', 'c']], 'unpinned, compatible garments share one load')
const splitPins: LoadPin[] = [{ textileId: 'a', group: 1 }, { textileId: 'b', group: 2 }, { textileId: 'c', group: 2 }]
const split = plan(input(trio, { loadPins: splitPins }))
assert.deepEqual(loadsOf(split), [['a'], ['b', 'c']], 'different groups separate even when compatible')
assert.equal(split.status, 'ready')
assert.deepEqual(loadsOf(plan(input(trio, { loadPins: [{ textileId: 'c', group: 7 }, { textileId: 'a', group: 3 }] }))), [['a', 'b'], ['c']], 'groups become loads in ascending group number, and unpinned garments join a pinned load that accepts them')
assert.deepEqual(loadsOf(plan(input(trio, { loadPins: [{ textileId: 'a', group: 1 }, { textileId: 'b', group: 1 }] }))), [['a', 'b', 'c']], 'an unpinned garment joins a pinned load when the rules allow')

// A cycle-incompatible move is refused, and the garment stays in its previous group.
const wool = garment('wool', {}, { cycle: 'delicate', maxTemperatureC: 30 })
const withWool = [garment('shirt-1'), garment('shirt-2'), wool]
const frozen: LoadPin[] = [{ textileId: 'shirt-1', group: 1 }, { textileId: 'shirt-2', group: 1 }, { textileId: 'wool', group: 2 }]
assert.deepEqual(loadsOf(plan(input(withWool, { loadPins: frozen }))), [['shirt-1', 'shirt-2'], ['wool']], 'the frozen arrangement is kept')
const refusedMove = plan(input(withWool, { loadPins: [...frozen, { textileId: 'wool', group: 1 }] }))
assert.deepEqual(loadsOf(refusedMove), [['shirt-1', 'shirt-2'], ['wool']], 'a refused move leaves the garment where it was')
assert.deepEqual(reasonsOf(refusedMove, 'pin_refused').map((reason) => [reason.textileIds, reason.details]), [
  [['wool'], { cause: 'care_cycle', group: 1, loadCycle: 'normal', loadTemperatureC: 40 }],
], 'the refusal names the load it could not join')
assert.equal(refusedMove.status, 'ready', 'a refused pin never blocks')
const shirtIntoWool = plan(input(withWool, { loadPins: [...frozen, { textileId: 'shirt-2', group: 2 }] }))
assert.deepEqual(loadsOf(shirtIntoWool), [['shirt-1', 'shirt-2'], ['wool']], 'a normal garment cannot join the delicate load either')
assert.deepEqual(reasonsOf(shirtIntoWool, 'pin_refused').map((reason) => reason.details), [{ cause: 'care_cycle', group: 2, loadCycle: 'delicate', loadTemperatureC: 30 }])
const toNew = plan(input([garment('shirt-1'), garment('shirt-2'), garment('shirt-3')], { loadPins: [{ textileId: 'shirt-1', group: 1 }, { textileId: 'shirt-2', group: 1 }, { textileId: 'shirt-3', group: 1 }, { textileId: 'shirt-3', group: 2 }] }))
assert.deepEqual(loadsOf(toNew), [['shirt-1', 'shirt-2'], ['shirt-3']], 'Move to a new load honours the last entry')
assert.equal(reasonsOf(toNew, 'pin_refused').length, 0)

// A capacity refusal.
const bulky = [garment('towel-1', { bulkUnits: 4 }), garment('towel-2', { bulkUnits: 3 }), garment('towel-3', { bulkUnits: 3 })]
const bulkyFrozen: LoadPin[] = [{ textileId: 'towel-1', group: 1 }, { textileId: 'towel-2', group: 1 }, { textileId: 'towel-3', group: 2 }]
const overfull = plan(input(bulky, { loadPins: [...bulkyFrozen, { textileId: 'towel-3', group: 1 }] }))
assert.deepEqual(loadsOf(overfull), [['towel-1', 'towel-2'], ['towel-3']], 'a move past the packing capacity is refused')
assert.deepEqual(reasonsOf(overfull, 'pin_refused').map((reason) => reason.details), [{ cause: 'capacity', group: 1 }])
assert.ok(overfull.loads.every((load) => load.bulkUnits <= load.capacityUnits))

// A hand-wash pin is refused; the garment stays out with its care reason.
const handWash = garment('silk', {}, { washMethod: 'hand_wash' })
const handPinned = plan(input([garment('a'), handWash], { loadPins: [{ textileId: 'a', group: 1 }, { textileId: 'silk', group: 1 }] }))
assert.deepEqual(loadsOf(handPinned), [['a']])
assert.deepEqual(excluded(handPinned), ['silk'])
assert.deepEqual(reasonsOf(handPinned, 'pin_refused').map((reason) => [reason.textileIds, reason.details]), [[['silk'], { cause: 'hand_wash', group: 1 }]])
assert.deepEqual(reasonsOf(handPinned, 'care_prohibition').map((reason) => reason.details), [{ cause: 'care_label_prohibition', method: 'hand_wash' }])
const unknownPinned = plan(input([garment('a'), { id: 'mystery', bulkUnits: 1 }], { loadPins: [{ textileId: 'mystery', group: 1 }] }))
assert.deepEqual(reasonsOf(unknownPinned, 'pin_refused').map((reason) => reason.details), [{ cause: 'care_unknown', group: 1 }], 'unknown care is refused too')
assert.deepEqual(excluded(unknownPinned), ['mystery'])

// Colour, soil and baby overrides are cautions; a colour mix washes cold.
const white = garment('white-shirt', { colorGroup: 'white' }, { maxTemperatureC: 60 })
const jeans = garment('dark-jeans', { colorGroup: 'dark', firstWash: true }, { maxTemperatureC: 40 })
assert.equal(plan(input([white, jeans])).loads.length, 2, 'colours separate by default')
assert.equal(plan(input([white, { ...jeans, firstWash: undefined, firstWashState: 'unknown' }])).loads.length, 2, 'unknown wash history keeps darker colors away from lights')
assert.equal(plan(input([white, { ...jeans, firstWash: false, firstWashState: 'washed' }])).loads.length, 1, 'known washed garments can share a compatible wash')
const colorPinned = plan(input([white, jeans], { loadPins: [{ textileId: 'white-shirt', group: 1 }, { textileId: 'dark-jeans', group: 1 }] }))
assert.deepEqual(loadsOf(colorPinned), [['dark-jeans', 'white-shirt']])
assert.equal(colorPinned.loads[0]!.temperatureC, 30, 'a colour mix washes cold')
assert.deepEqual(reasonsOf(colorPinned, 'preference_overridden').map((reason) => reason.details), [{ cause: 'color_mixed', textileIds: ['dark-jeans', 'white-shirt'] }])
assert.equal(colorPinned.status, 'ready', 'a caution never blocks')

const muddy = garment('muddy', { soilLevel: 'heavy' })
const light = garment('light', { soilLevel: 'light' }, { maxTemperatureC: 50 })
const soilPinned = plan(input([muddy, light], { loadPins: [{ textileId: 'muddy', group: 1 }, { textileId: 'light', group: 1 }] }))
assert.deepEqual(loadsOf(soilPinned), [['light', 'muddy']])
assert.deepEqual(reasonsOf(soilPinned, 'preference_overridden').map((reason) => reason.details), [{ cause: 'soil_mixed', textileIds: ['light', 'muddy'] }])
assert.equal(reasonsOf(soilPinned, 'preference_applied', 'soil_mixed').length, 0, 'the mix is the person\'s, not the planner\'s')
assert.equal(soilPinned.loads[0]!.temperatureC, 40, 'only a colour mix caps the temperature')
assert.equal(soilPinned.loads[0]!.soilLevel, 'heavy', 'the load is dosed for its dirtiest garment')

const babyPinned = plan(input(family, { loadPins: [{ textileId: 'baby-1', group: 1 }, { textileId: 'mum-1', group: 1 }] }))
assert.deepEqual(loadsOf(babyPinned), [['baby-1', 'mum-1'], ['baby-2'], ['dad-1']], 'the pinned mix is kept, and unpinned clothes still keep baby clothes apart')
assert.deepEqual(reasonsOf(babyPinned, 'preference_overridden').map((reason) => reason.details), [{ cause: 'baby_mixed', textileIds: ['baby-1', 'mum-1'] }])
const babyPinnedOff = plan(input(family, { preferences: { babySeparate: false }, loadPins: [{ textileId: 'baby-1', group: 1 }, { textileId: 'mum-1', group: 1 }] }))
assert.equal(reasonsOf(babyPinnedOff, 'preference_overridden').length, 0, 'no caution when the household mixes baby clothes anyway')

// Pins for unselected ids are ignored; pins are part of the plan identity.
const ghost = plan(input(trio, { loadPins: [{ textileId: 'not-selected', group: 1 }] }))
assert.deepEqual(loadsOf(ghost), [['a', 'b', 'c']])
assert.equal(reasonsOf(ghost, 'pin_refused').length, 0)
assert.notEqual(plan(input(trio, { loadPins: splitPins })).inputHash, plan(input(trio)).inputHash, 'pins change the input hash')
assert.notEqual(plan(input(trio, { loadPins: splitPins })).inputHash, plan(input(trio, { loadPins: [{ textileId: 'a', group: 1 }] })).inputHash, 'different pins, a different hash')
assert.equal(JSON.stringify(plan(input(trio, { loadPins: splitPins }))), JSON.stringify(split), 'the same pins give the same plan')

// Rush: one load of everything that may be machine washed, at the gentlest settings.
const pile = [
  garment('delicate-top', { colorGroup: 'white' }, { cycle: 'delicate', maxTemperatureC: 40, dryHeat: 'low' }),
  garment('jeans', { colorGroup: 'dark', firstWash: true, soilLevel: 'heavy' }, { cycle: 'normal', maxTemperatureC: 60 }),
  garment('guest-shirt', { guest: true, soilLevel: 'light' }, { cycle: 'permanent_press', maxTemperatureC: null }),
  baby('baby-1'),
]
const rushPile = plan(input(pile, { mode: 'rush', dryers: [dryer(['no_heat', 'low', 'medium', 'high'])] }))
assert.equal(rushPile.mode, 'rush')
assert.equal(rushPile.status, 'ready')
assert.deepEqual(loadsOf(rushPile), [['baby-1', 'delicate-top', 'guest-shirt', 'jeans']], 'one load')
assert.equal(rushPile.loads[0]!.cycle, 'delicate', 'the gentlest cycle')
assert.equal(rushPile.loads[0]!.temperatureC, 30, 'the lowest maximum, with an unknown maximum counted as cold')
assert.equal(rushPile.loads[0]!.drying?.heat, 'low', 'the lowest heated dryer setting')
assert.deepEqual(rushPile.loads[0]!.drying?.heldOut.map((entry) => entry.textileId), [], 'every garment here can take low heat')
assert.deepEqual(reasonsOf(rushPile, 'preference_overridden').map((reason) => reason.details.cause).sort(), ['baby_mixed', 'color_mixed', 'soil_mixed'], 'soft rules become cautions')
assert.equal(JSON.stringify(plan(input(pile, { mode: 'rush', dryers: [dryer(['no_heat', 'low', 'medium', 'high'])] }))), JSON.stringify(rushPile), 'rush is deterministic')

const warmPile = plan(input([garment('a', {}, { maxTemperatureC: 50 }), garment('b', {}, { maxTemperatureC: 40 })], { mode: 'rush' }))
assert.equal(warmPile.loads[0]!.temperatureC, 40, 'the lowest recorded maximum when none is unknown')
assert.equal(reasonsOf(warmPile, 'preference_overridden').length, 0, 'no caution without a mix')

const heatedOnly = plan(input([garment('a'), garment('b', {}, { dryHeat: 'no_heat' })], { mode: 'rush', dryers: [dryer(['medium', 'high'])] }))
assert.equal(heatedOnly.loads[0]!.drying?.heat, 'medium', 'medium when the dryer has no low')
assert.deepEqual(heatedOnly.loads[0]!.drying?.heldOut, [{ textileId: 'b', method: 'line_dry', reason: 'heat_unavailable' }], 'a garment that cannot take that heat hangs')
const normalHeat = plan(input([garment('a')], { dryers: [dryer(['low', 'medium', 'high'])] }))
assert.equal(normalHeat.loads[0]!.drying?.heat, 'high', 'normal planning still uses the hottest heat the label allows')

const airOnly = plan(input([garment('a'), garment('b')], { mode: 'rush', dryers: [dryer(['no_heat'])] }))
assert.equal(airOnly.loads[0]!.drying?.status, 'none', 'a no-heat-only dryer hangs everything')
assert.deepEqual(airOnly.loads[0]!.drying?.heldOut.map((entry) => entry.reason), ['heat_unavailable', 'heat_unavailable'])
assert.equal(plan(input([garment('a')], { dryers: [dryer(['no_heat'])] })).loads[0]!.drying?.heat, 'no_heat', 'normal planning may still air-dry')

// Rush hard vetoes, each with its method.
const vetoed = plan(input([
  garment('a'),
  garment('suit', {}, { washMethod: 'dry_clean_only' }),
  garment('silk', {}, { washMethod: 'hand_wash' }),
  garment('beaded', {}, { washMethod: 'do_not_wash' }),
  garment('legacy', {}, { restrictions: ['Dry clean only'] }),
  { id: 'unknown-care', bulkUnits: 1 },
], { mode: 'rush' }))
assert.deepEqual(loadsOf(vetoed), [['a']])
assert.deepEqual(Object.fromEntries(reasonsOf(vetoed, 'care_prohibition').map((reason) => [reason.textileIds[0]!, reason.details.method])), {
  beaded: 'do_not_wash',
  legacy: 'restriction',
  silk: 'hand_wash',
  suit: 'dry_clean_only',
}, 'every veto carries its method')
assert.deepEqual(reasonsOf(vetoed, 'needs_confirmation', 'unknown_care').map((reason) => reason.textileIds), [['unknown-care']], 'unknown care still asks')
assert.deepEqual(excluded(vetoed), ['beaded', 'legacy', 'silk', 'suit', 'unknown-care'])

const oddCycle = plan(input([garment('a'), garment('odd', {}, { cycle: 'bulky_steam' })], { mode: 'rush', machines: [washer({ supportedCycles: ['normal', 'bulky_steam'] })] }))
assert.deepEqual(loadsOf(oddCycle), [['a']], 'an unknown cycle is left out')
assert.deepEqual(reasonsOf(oddCycle, 'care_compatibility', 'unknown_cycle').map((reason) => reason.textileIds), [['odd']])
assert.deepEqual(excluded(oddCycle), ['odd'])

const noDelicate = plan(input([garment('a'), garment('lace', {}, { cycle: 'delicate' }), garment('knit', {}, { cycle: 'delicate' })], { mode: 'rush', machines: [washer({ supportedCycles: ['normal'] })] }))
assert.deepEqual(loadsOf(noDelicate), [['a']], 'a washer without delicate leaves the delicate garments out')
assert.equal(noDelicate.loads[0]!.cycle, 'normal', 'the cycle is recomputed from the rest')
assert.deepEqual(reasonsOf(noDelicate, 'care_compatibility', 'no_gentle_cycle').map((reason) => [reason.textileIds, reason.machineId]), [[['knit', 'lace'], 'washer']])

const oversized = plan(input(Array.from({ length: 10 }, (_, index) => garment(`item-${String(index + 1).padStart(2, '0')}`)), { mode: 'rush' }))
assert.deepEqual(oversized.loads.map((load) => load.textileIds.length), [8, 2], 'an oversized pile splits by capacity, in id order')
assert.ok(oversized.loads.every((load) => load.cycle === 'normal' && load.bulkUnits <= load.capacityUnits))
assert.deepEqual(oversized.loads[1]!.textileIds, ['item-09', 'item-10'])

const rushIgnoresPins = plan(input(trio, { mode: 'rush', loadPins: splitPins }))
assert.deepEqual(loadsOf(rushIgnoresPins), [['a', 'b', 'c']], 'rush ignores pins')
assert.equal(reasonsOf(rushIgnoresPins, 'pin_refused').length, 0)

// A mixed shared room packs every load to its smallest kind of washer, so a load fits whichever is free.
const { mixedRoom } = (await import(`./room.test${'.ts'}`)) as typeof import('./room.test')
const towels = Array.from({ length: 10 }, (_, index) => garment(`towel-${String(index + 1).padStart(2, '0')}`, { bulkUnits: 2 }))
const roomPlan = plan(input(towels, { machines: mixedRoom(), preferences: { preferredMachineId: 'front-loader-1' } }))
assert.deepEqual(roomPlan.loads.map((load) => load.bulkUnits), [10, 10], 'about 20 units pack to the top-loader size, not the front-loader size')
assert.ok(roomPlan.loads.every((load) => load.machineId === 'front-loader-1' && load.bulkUnits <= 11.5 && load.capacityUnits === 11.5), 'each load reports the size it was packed to')
const rushRoom = plan(input(towels, { mode: 'rush', machines: mixedRoom(), preferences: { preferredMachineId: 'front-loader-1' } }))
assert.ok(rushRoom.loads.every((load) => load.bulkUnits <= 11.5), 'Wash now packs to the same size')
const pinnedRoom = plan(input(towels.slice(0, 6), { machines: mixedRoom(), preferences: { preferredMachineId: 'front-loader-1' }, loadPins: towels.slice(0, 6).map((towel) => ({ textileId: towel.id, group: 1 })) }))
assert.deepEqual(reasonsOf(pinnedRoom, 'pin_refused').map((reason) => [reason.textileIds, reason.details.cause]), [[['towel-06'], 'capacity']], 'a pinned group is held to the same size')

const comforter = garment('comforter', { bulkUnits: 12 })
const bigOne = plan(input([comforter], { machines: mixedRoom(), preferences: { preferredMachineId: 'top-loader-1' } }))
assert.equal(bigOne.loads[0]!.machineId, 'front-loader-1', 'a garment too big for a top-loader still goes on a front-loader')
assert.equal(bigOne.loads[0]!.capacityUnits, 13.5, 'the front-loader it moved to keeps its own size')
assert.equal(reasonsOf(bigOne, 'machine_substitution', 'capacity_fit').length, 1)

const fromFrontRoom = plan(input([comforter], { machines: mixedRoom(), preferences: { preferredMachineId: 'front-loader-1' } }))
assert.equal(fromFrontRoom.loads[0]!.machineId, 'front-loader-1', 'a single big garment still washes on a front-loader')
assert.equal(reasonsOf(fromFrontRoom, 'capacity_limit').length, 0, 'and is not refused for the room limit')

// One kind of washer packs as before: twins in a shared room, and the same washers at home.
const twins = plan(input(towels, { machines: [1, 2].map((number) => washer({ id: `front-loader-${number}`, capacityUnits: 13.5, location: 'shared' })) }))
assert.deepEqual(twins.loads.map((load) => [load.bulkUnits, load.capacityUnits]), [[12, 13.5], [8, 13.5]], 'a room of one kind packs to its own size')
const mixedAtHome = plan(input(towels, { machines: mixedRoom().map(({ location: _location, ...machine }) => machine), preferences: { preferredMachineId: 'front-loader-1' } }))
assert.deepEqual(mixedAtHome.loads.map((load) => [load.bulkUnits, load.capacityUnits]), [[12, 13.5], [8, 13.5]], 'washers with no shared location keep their own size')

// The tag's bleach triangle: crossed out keeps chlorine and oxygen bleach out of the garment's load, two lines keep chlorine out.
const bleachWasher = washer({ dispensing: { placements: ['detergent_compartment', 'softener_compartment', 'direct_to_drum'] } })
const drumProduct = (id: string, extra: Partial<SupplyItem>): SupplyItem => ({
  id,
  kind: 'chemical_consumable',
  bleachKind: 'none',
  labelEvidence: observed,
  formulation: { form: 'powder' },
  applicationRules: [{ id: `${id}-any`, dose: { amount: 1, unit: 'scoop', mark: 'line 1' }, stage: 'wash', placement: 'direct_to_drum', evidence: observed }],
  measurement: { kind: 'scoop', unit: 'scoop', marks: ['line 1'] },
  ...extra,
})
const oxiclean = drumProduct('oxiclean', { name: 'OxiClean Versatile Stain Remover', bleachKind: 'oxygen' })
const cloroxBleach = drumProduct('clorox', { name: 'Clorox Regular', kind: 'bleach', bleachKind: 'chlorine' })
const lysol: SupplyItem = {
  id: 'lysol',
  name: 'Lysol Laundry Sanitizer',
  kind: 'chemical_consumable',
  bleachKind: 'none',
  labelEvidence: observed,
  formulation: { form: 'liquid' },
  applicationRules: [{ id: 'lysol-any', dose: { amount: 60, unit: 'ml' }, stage: 'rinse', placement: 'softener_compartment', evidence: observed }],
}
// These bleach-constraint cases deliberately request the named additions.
const bleachInput = (textiles: readonly TextileEvidence[], supplies: readonly SupplyItem[] = [detergent, oxiclean]) => input(textiles, { supplies, optionalSupplyIds: ['oxiclean', 'clorox', 'lysol'], machines: [bleachWasher] })
const productsIn = (result: PlanResult, loadIndex = 0): string[] => result.loads[loadIndex]!.treatments.map((step) => step.supplyId).sort()

const unsaid = plan(bleachInput([garment('black-tee'), garment('grey-shirt')]))
assert.deepEqual(productsIn(unsaid), ['detergent', 'oxiclean'], 'a tag that does not say leaves Oxi in, as before')
assert.equal(reasonsOf(unsaid, 'product_left_out', 'tag_forbids_bleach').length, 0)

const noBleach = plan(bleachInput([garment('black-tee', {}, { bleach: 'none' }), garment('grey-shirt')]))
assert.deepEqual(loadsOf(noBleach), [['black-tee', 'grey-shirt']], 'the garment still washes with the others')
assert.deepEqual(productsIn(noBleach), ['detergent'], 'do not bleach keeps OxiClean (an oxygen bleach) out of its load')
assert.equal(noBleach.status, 'ready', 'leaving Oxi out does not block the load')
const noOxi = reasonsOf(noBleach, 'product_left_out', 'tag_forbids_bleach')
assert.equal(noOxi.length, 1, 'and says why rather than dropping it silently')
assert.deepEqual([noOxi[0]!.supplyId, noOxi[0]!.loadId, noOxi[0]!.details.bleach, noOxi[0]!.details.noBleachIds, noOxi[0]!.details.nonChlorineIds], ['oxiclean', 'load-001', 'oxygen', ['black-tee'], []])
assert.equal(noBleach.explanations.find((entry) => entry.reasonId === noOxi[0]!.id)!.text, "No oxiclean: black-tee's tag says do not bleach.")

const chlorineAndOxi = [detergent, oxiclean, cloroxBleach, lysol]
const twoLines = plan(bleachInput([garment('white-tee', {}, { bleach: 'non_chlorine' })], chlorineAndOxi))
assert.deepEqual(productsIn(twoLines), ['detergent', 'lysol', 'oxiclean'], 'non-chlorine only keeps Oxi and leaves chlorine bleach out')
assert.deepEqual(reasonsOf(twoLines, 'product_left_out', 'tag_forbids_bleach').map((reason) => [reason.supplyId, reason.details.bleach, reason.details.nonChlorineIds]), [['clorox', 'chlorine', ['white-tee']]])

const crossedOut = plan(bleachInput([garment('black-tee', {}, { bleach: 'none' }), garment('white-tee', {}, { bleach: 'non_chlorine' })], chlorineAndOxi))
assert.deepEqual(productsIn(crossedOut), ['detergent', 'lysol'], 'do not bleach leaves both bleaches out; Lysol Laundry Sanitizer is not a bleach')
const noClorox = reasonsOf(crossedOut, 'product_left_out', 'tag_forbids_bleach').find((reason) => reason.supplyId === 'clorox')!
assert.equal(crossedOut.explanations.find((entry) => entry.reasonId === noClorox.id)!.text, "No clorox: black-tee's tag says do not bleach; white-tee's tag says non-chlorine bleach only.")

const anyBleach = plan(bleachInput([garment('white-tee', {}, { bleach: 'any' })], chlorineAndOxi))
assert.deepEqual(productsIn(anyBleach), ['clorox', 'detergent', 'lysol', 'oxiclean'], 'a plain triangle allows any bleach')

// Per garment: only the load holding the crossed-out tag loses Oxi.
const bleachSplit = plan(bleachInput([garment('black-tee', { colorGroup: 'black', firstWash: true }, { bleach: 'none' }), garment('white-tee', { colorGroup: 'white', firstWash: true })]))
assert.deepEqual(loadsOf(bleachSplit), [['black-tee'], ['white-tee']])
assert.deepEqual([productsIn(bleachSplit, 0), productsIn(bleachSplit, 1)], [['detergent'], ['detergent', 'oxiclean']], 'the other load keeps its Oxi')

// A detergent "with Oxi" is a detergent, not a bleach.
const tideOxi = plan(bleachInput([garment('black-tee', {}, { bleach: 'none' })], [{ ...detergent, name: 'Tide Plus Oxi Liquid Laundry Detergent' }]))
assert.deepEqual(productsIn(tideOxi), ['detergent'])

// A stain treatment with a bleach the tag forbids needs a closer look, as the care words already do.
const oxiStain: SupplyItem = {
  id: 'oxi-stain',
  stainChemistry: 'oxygen_bleach',
  labelEvidence: observed,
  formulation: { form: 'powder' },
  applicationRules: [{ id: 'oxi-tannin', stainKinds: ['tannin'], dose: { amount: 10, unit: 'ml' }, stage: 'prewash', placement: 'manual', evidence: observed }],
}
const coffee = (careExtra: Partial<CareEvidence>) => garment('shirt', { stainReport: { kind: 'tannin', priorTreatments: [] } }, careExtra)
const stainCause = (result: PlanResult) => result.reasons.find((reason) => reason.details.cause === 'stain_care_conflict')
assert.ok(stainCause(plan(bleachInput([coffee({ bleach: 'none' })], [detergent, oxiStain]))), 'do not bleach refuses an oxygen-bleach stain treatment')
assert.equal(stainCause(plan(bleachInput([coffee({ bleach: 'non_chlorine' })], [detergent, oxiStain]))), undefined, 'non-chlorine only allows it')
assert.equal(stainCause(plan(bleachInput([coffee({})], [detergent, oxiStain]))), undefined, 'and an unsaid tag allows it, as before')

// Care that fails closed: a tag was checked and came back with nothing usable (`answerTagQuestions`
// with washMethod 'unknown', tag-taps evidence) washes cold, on the gentlest cycle the washer offers,
// with no bleach, and hangs to dry, instead of asking the same question forever.
const tagUnknown: Partial<CareEvidence> = { washMethod: 'unknown', cycle: undefined, maxTemperatureC: undefined, dryMethod: undefined, status: 'needs_confirmation' }
const failSafe = (id: string, extra: Partial<TextileEvidence> = {}, careExtra: Partial<CareEvidence> = {}) => garment(id, extra, { ...tagUnknown, ...careExtra })

const failSafeAlone = plan(input([failSafe('mystery-shirt')], { dryers: [dryer(['high', 'medium', 'low'])] }))
assert.equal(failSafeAlone.status, 'ready', 'a checked-but-unknown tag washes instead of blocking the plan')
assert.deepEqual(excluded(failSafeAlone), [], 'and is never excluded')
assert.equal(reasonsOf(failSafeAlone, 'needs_confirmation', 'unknown_care').length, 0, 'so the care question is not asked again')
assert.equal(failSafeAlone.loads[0]!.temperatureC, 30, 'washes cold: the coolest the planner knows')
assert.equal(failSafeAlone.loads[0]!.cycle, 'delicate', 'the gentlest cycle this washer offers')
assert.deepEqual(failSafeAlone.loads[0]!.drying?.heldOut, [{ textileId: 'mystery-shirt', method: 'unknown', reason: 'drying_unknown' }], 'hangs: nothing about drying was ever confirmed')
const failSafeCaution = reasonsOf(failSafeAlone, 'preference_applied', 'care_fail_safe')
assert.deepEqual(failSafeCaution.map((reason) => reason.textileIds), [['mystery-shirt']], 'the load explains why, rather than staying silent')
assert.equal(failSafeAlone.explanations.find((entry) => entry.reasonId === failSafeCaution[0]!.id)!.text, "mystery-shirt wash cold on the gentlest cycle this washer offers, with no bleach and no dryer: the tag doesn't say.")

// Even a separately answered dryer square does not tumble when the wash method itself is unknown.
const stillHangs = plan(input([failSafe('mixed-answer', {}, { dryMethod: 'tumble_dry', dryHeat: 'low' })], { dryers: [dryer(['high', 'medium', 'low'])] }))
assert.deepEqual(stillHangs.loads[0]!.drying?.heldOut, [{ textileId: 'mixed-answer', method: 'unknown', reason: 'drying_unknown' }], 'the whole tag failed closed, so one answered row does not let it tumble')

// The gentlest cycle per washer kind in the owner's shared room: both offer delicate here.
const { topLoader, frontLoader } = (await import(`./room.test${'.ts'}`)) as typeof import('./room.test')
assert.equal(plan(input([failSafe('top-mystery')], { machines: [topLoader(1)] })).loads[0]!.cycle, 'delicate', 'the top-loader in the owner\'s room offers delicate too')
assert.equal(plan(input([failSafe('front-mystery')], { machines: [frontLoader(1)] })).loads[0]!.cycle, 'delicate', 'and so does the front-loader')

// A washer without delicate falls back to permanent press, then plain normal.
const permPressOnly = washer({ id: 'no-delicate', supportedCycles: ['normal', 'permanent_press', 'heavy_duty'] })
assert.equal(plan(input([failSafe('pp-mystery')], { machines: [permPressOnly] })).loads[0]!.cycle, 'permanent_press', 'permanent press when delicate is not offered')
const onlyNormal = washer({ id: 'normal-only', supportedCycles: ['normal'] })
assert.equal(plan(input([failSafe('normal-mystery')], { machines: [onlyNormal] })).loads[0]!.cycle, 'normal', 'plain normal when neither gentler cycle is offered')

// No bleach of any kind, chlorine or oxygen, even though nothing on the tag itself forbade it.
const failSafeNoBleach = plan(bleachInput([failSafe('unread-tee')]))
assert.deepEqual(productsIn(failSafeNoBleach), ['detergent'], 'a checked-but-unknown tag keeps every bleach out')
assert.deepEqual(reasonsOf(failSafeNoBleach, 'product_left_out', 'tag_forbids_bleach').map((reason) => reason.supplyId), ['oxiclean'])
assert.ok(stainCause(plan(bleachInput([coffee(tagUnknown)], [detergent, oxiStain]))), 'and a stain needing bleach is never silently treated on care that failed closed')

// A mix of known and checked-unknown care: one load, at whichever settings are stricter.
const mixedLoad = plan(input([garment('known-normal', {}, { maxTemperatureC: 60, cycle: 'normal' }), failSafe('unread-shirt')]))
assert.deepEqual(loadsOf(mixedLoad), [['known-normal', 'unread-shirt']], 'known and checked-unknown care share one load')
assert.equal(mixedLoad.status, 'ready')
assert.equal(mixedLoad.loads[0]!.cycle, 'delicate', 'the load takes the gentler cycle')
assert.equal(mixedLoad.loads[0]!.temperatureC, 30, 'and the colder temperature')
assert.equal(reasonsOf(mixedLoad, 'care_compatibility', 'cycle_separation').length, 0, 'the checked-unknown item never forces a split')

// Snapshot includes researched material candidates and the corrected rinse-dispenser
// conflict, missing sanitizer contact evidence and separate optional-benefit decisions;
// the named recipe explicitly chooses its additions. Synthetic test evidence does
// not certify the owner's packs, program timing or labels.
const { washerPlannerFixture } = await import(`./fixtures${'.ts'}`) as typeof import('./fixtures')
const digest = (result: PlanResult): string => {
  const { plannerVersion: _version, ...rest } = result
  return createHash('sha256').update(JSON.stringify(rest)).digest('hex')
}
assert.equal(digest(plan(washerPlannerFixture)), '2c7731e985a5b9fafd7a48e002d620a9654b4e931cb8a9df305691f355c8b792', 'invoice fixture with material candidates, shared rinse dispenser and unknown sanitizer contact')
assert.equal(digest(plan({ ...washerPlannerFixture, mode: 'rush' })), 'b123bb1284b3dd26bfc160d5b913f22e839034a4f40db4663dde557edbe65e95', 'Wash now preserves rinse dispenser and sanitizer contact constraints')

console.log('load checks passed')
