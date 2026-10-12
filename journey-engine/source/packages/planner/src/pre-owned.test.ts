import assert from 'node:assert/strict'
import { test } from 'node:test'
import { plan, preOwnedAdvice, tagAllowsHighHeat, mayOxygenSoak, type CareEvidence, type TextileEvidence } from './index.ts'

const care = (extra: Partial<CareEvidence> = {}): CareEvidence => ({ washMethod: 'machine', cycle: 'normal', maxTemperatureC: 30, status: 'confirmed', restrictions: [], dryMethod: 'tumble_dry', dryHeat: 'high', bleach: 'non_chlorine', ...extra })
const item = (id: string, preOwned: TextileEvidence['preOwned'], extra: { material?: string; care?: CareEvidence } = {}) => ({ id, material: 'cotton', care: care(), preOwned, ...extra })
const ids = (items: ReturnType<typeof item>[]) => preOwnedAdvice(items, '2').map((tip) => tip.tipId).sort()

test('a pre-owned first wash says to check the rinse water; a plain piece gets nothing', () => {
  assert.deepEqual(ids([item('a', {})]), ['pre_owned_rinse'])
  assert.deepEqual(ids([item('a', { washes: 1 })]), [])
  assert.deepEqual(ids([item('a', undefined)]), [])
})

test('heat treatment is only offered when chosen and the tag allows high heat', () => {
  assert.ok(ids([item('a', { heatTreat: true })]).includes('pre_owned_heat'))
  assert.ok(!ids([item('a', {})]).includes('pre_owned_heat'), 'never the default')
  for (const dryHeat of ['low', 'medium', 'no_heat', 'delicate']) assert.ok(!ids([item('a', { heatTreat: true }, { care: care({ dryHeat }) })]).includes('pre_owned_heat'), `${dryHeat} heat is never overridden`)
  assert.ok(!ids([item('a', { heatTreat: true }, { care: care({ dryMethod: 'do_not_tumble_dry' }) })]).includes('pre_owned_heat'))
  assert.ok(!ids([item('a', { heatTreat: true }, { care: care({ dryMethod: undefined }) })]).includes('pre_owned_heat'), 'an unknown dryer symbol is not high heat')
  assert.equal(tagAllowsHighHeat(care({ dryHeat: undefined })), true, 'a tumble-dry label with no heat limit allows high heat')
  assert.ok(!ids([item('a', { heatTreat: true, washes: 1 })]).includes('pre_owned_heat'), 'once, before the first wash')
})

test('a musty soak stays within label limits and is blocked for protein fibers, leather and dry clean only', () => {
  const soak = (extra: { material?: string; care?: CareEvidence }) => ids([item('a', { smell: 'musty' }, extra)]).filter((tip) => tip.startsWith('pre_owned_musty'))
  assert.deepEqual(soak({}), ['pre_owned_musty'])
  for (const material of ['wool', 'silk', 'leather', 'other', undefined]) assert.deepEqual(soak({ material: material as string }), ['pre_owned_musty_skip'], String(material))
  assert.deepEqual(soak({ care: care({ washMethod: 'dry_clean_only' }) }), ['pre_owned_musty_skip'])
  assert.deepEqual(soak({ care: care({ bleach: 'none' }) }), ['pre_owned_musty_skip'])
  assert.deepEqual(soak({ care: care({ bleach: undefined }) }), ['pre_owned_musty_skip'])
  assert.deepEqual(soak({ care: care({ restrictions: ['Do not soak'] }) }), ['pre_owned_musty_skip'])
  assert.equal(mayOxygenSoak('cotton', care({ bleach: 'any' })), true)
  const tip = preOwnedAdvice([item('a', { smell: 'musty' })], '2').find((entry) => entry.tipId === 'pre_owned_musty')
  assert.match(tip!.reason, /label/)
  assert.match(tip!.action, /3 to 6 hours/)
})

test('smoke repeats for a few washes; perfume adds nothing', () => {
  assert.ok(ids([item('a', { smell: 'smoke', washes: 2 })]).includes('pre_owned_smoke'))
  assert.ok(!ids([item('a', { smell: 'smoke', washes: 3 })]).includes('pre_owned_smoke'))
  assert.deepEqual(ids([item('a', { smell: 'perfume' })]), ['pre_owned_rinse'])
})

const machine = { id: 'washer', highEfficiency: true, capacityUnits: 8, capacityConfidence: 'verified' as const, evidence: { status: 'verified' as const }, supportedCycles: ['normal', 'delicate'], dispensing: { placements: ['detergent_compartment'] } }
const detergent = { id: 'detergent', kind: 'detergent', labelEvidence: { status: 'verified' as const }, formulation: { form: 'liquid' }, applicationRules: [{ id: 'wash', stage: 'wash', placement: 'detergent_compartment', dose: { amount: 10, unit: 'ml' }, evidence: { status: 'verified' as const } }] }
const textile = (id: string, extra: Partial<TextileEvidence> = {}): TextileEvidence & { id: string } => ({ id, kind: 't_shirt', material: 'cotton', colorGroup: 'light', dyeRun: 'unknown', care: care(), ...extra })

test('a fragile pre-owned piece is kept out of machine loads for hand washing; the rest still wash', () => {
  const result = plan({ textiles: [textile('plain'), textile('vintage', { preOwned: { fragile: true } })], machines: [machine], supplies: [detergent] } as never)
  assert.deepEqual(result.loads.flatMap((load) => load.textileIds), ['plain'])
  assert.deepEqual(result.reasons.find((reason) => reason.code === 'care_prohibition')?.details, { cause: 'pre_owned_fragile', method: 'hand_wash' })
  const whole = plan({ textiles: [textile('plain'), textile('thrift', { preOwned: {} })], machines: [machine], supplies: [detergent] } as never)
  assert.deepEqual(whole.loads.flatMap((load) => load.garmentAdvice ?? []).map((tip) => tip.tipId), ['pre_owned_rinse'])
})

test('Codex review: a stain holds the heat treatment, and the soak keeps to the label and the blend', () => {
  const actions = (entry: ReturnType<typeof item> & { stained?: boolean }) => preOwnedAdvice([entry], '2').map((tip) => tip.action)
  // Heat sets a stain: no dryer step while one is on the piece.
  const stained = actions({ ...item('a', { heatTreat: true }), stained: true })
  assert.ok(stained.includes('Heat treatment waits: there is a stain'))
  assert.ok(!stained.some((action) => action.startsWith('Heat-treat first')))
  // A wool blend never gets the oxygen soak.
  assert.ok(!mayOxygenSoak('50% cotton 50% wool', care()))
  assert.ok(actions(item('a', { smell: 'musty' }, { material: '50% cotton 50% wool' })).includes('Musty: skip the oxygen-bleach soak'))
  // The care record's soak limit wins over the product's 3 to 6 hours.
  const limited = care({ instructions: { maximumSoakMinutes: 15 } } as Partial<CareEvidence>)
  assert.ok(actions(item('a', { smell: 'musty' }, { care: limited })).includes('Soak in oxygen bleach up to 15 minutes (the label’s limit) first (optional)'))
})

test('a stained and a clean piece both chosen for heat treatment keep their own heat steps, in either order', () => {
  const stained = { ...item('stained', { heatTreat: true }), stained: true }
  const clean = item('clean', { heatTreat: true })
  for (const order of [[stained, clean], [clean, stained]]) {
    const heat = preOwnedAdvice(order, '2').filter((tip) => tip.tipId === 'pre_owned_heat')
    assert.equal(heat.length, 2)
    assert.deepEqual(heat.find((tip) => tip.textileIds.includes('stained'))!.textileIds, ['stained'])
    assert.match(heat.find((tip) => tip.textileIds.includes('stained'))!.action, /waits/)
    assert.match(heat.find((tip) => tip.textileIds.includes('clean'))!.action, /dryer on high/)
  }
})

test('a 15-minute label soak limit is kept when another musty piece has no limit, in either order', () => {
  const limited = item('limited', { smell: 'musty' }, { care: care({ instructions: { maximumSoakMinutes: 15 } } as Partial<CareEvidence>) })
  const open = item('open', { smell: 'musty' })
  for (const order of [[limited, open], [open, limited]]) {
    const soak = preOwnedAdvice(order, '2').filter((tip) => tip.tipId === 'pre_owned_musty')
    assert.equal(soak.length, 2)
    assert.match(soak.find((tip) => tip.textileIds.includes('limited'))!.action, /up to 15 minutes/)
    assert.match(soak.find((tip) => tip.textileIds.includes('open'))!.action, /3 to 6 hours/)
  }
})

test('pieces with the same wording still share one step', () => {
  const soak = preOwnedAdvice([item('a', { smell: 'musty' }), item('b', { smell: 'musty' })], '2').filter((tip) => tip.tipId === 'pre_owned_musty')
  assert.deepEqual(soak.map((tip) => tip.textileIds), [['a', 'b']])
})

test('any label soak limit under 360 minutes is used as the limit', () => {
  const action = (maximumSoakMinutes: number) => preOwnedAdvice([item('a', { smell: 'musty' }, { care: care({ instructions: { maximumSoakMinutes } } as Partial<CareEvidence>) })], '2').find((tip) => tip.tipId === 'pre_owned_musty')!.action
  assert.match(action(180), /up to 180 minutes/)
  assert.match(action(359), /up to 359 minutes/)
  assert.match(action(360), /3 to 6 hours/)
})
