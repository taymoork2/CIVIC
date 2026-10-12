import { expect, test } from 'vitest'

import type { PlanLoad, PlanQuestion, StoredPlan } from '@/laundry/laundry-pass'
import { colourWords, doseLine, loadNames, flagWords, itemsLine, loadCardView, loadHasQuestion, type CardGarment, type LoadFacts } from '@/laundry/load-card'

type Reason = StoredPlan['result']['reasons'][number]
type Step = PlanLoad['treatments'][number]

const day = 86_400_000
// A Sunday afternoon.
const now = new Date(2026, 8, 27, 15).getTime()

const garments: Record<string, CardGarment> = {
  jeans: { name: 'Leo’s jeans', kind: 'pants', colorGroup: 'dark', flag: null },
  jersey: { name: 'Soccer jersey', kind: 't_shirt', colorGroup: 'dark', flag: { reasons: ['mud_grass'], stainNote: 'left knee', neededBy: now + day } },
  shorts: { name: 'Gym shorts', kind: 'shorts', colorGroup: 'black', flag: { reasons: ['sweat'] } },
  shirt: { name: 'White shirt', kind: 'shirt', colorGroup: 'white', flag: null },
}

const step = (overrides: Partial<Step> = {}): Step => ({
  supplyId: 'tide',
  dose: { amount: 1, unit: 'cap', mark: '3' },
  measurementCue: null,
  stage: 'main_wash',
  placement: 'detergent_compartment',
  timing: null,
  rationale: 'SENTINEL rationale',
  source: 'label',
  confirmation: 'confirmed',
  marks: ['1', '3', 'Max'],
  ruleId: 'r3',
  ...overrides,
}) as Step

const load = (overrides: Partial<PlanLoad> = {}): PlanLoad => ({
  id: 'load-001',
  textileIds: ['jeans', 'jersey', 'shorts'],
  owners: [],
  bulkUnits: 3,
  capacityUnits: 14,
  machineId: 'washer',
  machineModelId: null,
  cycle: 'normal',
  temperatureC: 30,
  treatments: [step()],
  status: 'ready',
  loadSize: null,
  soilLevel: 'heavy',
  washerClass: null,
  drying: null,
  ...overrides,
}) as PlanLoad

const reason = (code: string, details: Record<string, unknown>, extra: Partial<Reason> = {}): Reason => ({ id: `${code}-${String(details.cause)}`, code, priority: 1, textileIds: [], loadId: 'load-001', details, ...extra }) as Reason

const facts = (overrides: Partial<LoadFacts> = {}): LoadFacts => ({
  now,
  garment: (id) => garments[id] ?? null,
  product: (id) => ({ tide: 'Tide', oxi: 'Oxi', bounce: 'Bounce' })[id] ?? null,
  rowText: (id) => (id === 'r3' ? 'Heavily soiled' : null),
  reasons: [],
  pinned: false,
  rush: false,
  ...overrides,
})

test('colour words for a load, and its items in short', () => {
  expect(colourWords(['white', 'white'])).toBe('Whites')
  expect(colourWords(['white', 'light', 'very_light'])).toBe('Lights')
  expect(colourWords(['dark', 'black'])).toBe('Darks')
  expect(colourWords(['saturated'])).toBe('Brights')
  expect(colourWords(['dark', 'white'])).toBe('Mixed colors')
  expect(colourWords(['dark', null])).toBe('Mixed colors')
  expect(itemsLine(['Leo’s jeans'])).toBe('Leo’s jeans')
  expect(itemsLine(['Leo’s jeans', 'Soccer jersey', 'Gym shorts', 'Socks'])).toBe('Leo’s jeans, Soccer jersey +2')
  expect(flagWords(garments.jersey!.flag)).toBe('grass or mud, left knee')
  expect(flagWords(null)).toBeNull()
})

test('the title, the settings and the stain lines come from the plan, in plain words', () => {
  const view = loadCardView(load(), 1, facts())
  expect(view.title).toBe('Load 1 · Darks, very dirty · needed tomorrow')
  expect(view.itemsLine).toBe('Leo’s jeans, Soccer jersey +1')
  expect(view.settings).toBe('Normal · Cold')
  expect(view.stains).toEqual(['Soccer jersey: grass or mud, left knee. Treat the stain before washing.'])
  expect(loadCardView(load({ soilLevel: null, temperatureC: null, textileIds: ['shirt'] }), 2, facts()).title).toBe('Load 2 · Whites')
  expect(loadCardView(load({ temperatureC: null }), 1, facts()).settings).toBe('Normal')
})

test('load instructions retain native doses and keep full and below-line candidates separate', () => {
  const dose = { amount: 1, unit: 'cap', mark: 'Bar 2', target: 'below' as const }
  const resolved = doseLine(step({ dose }), facts())
  expect(resolved?.kind === 'resolved' && resolved.dose).toEqual({ ...dose, equivalent: null })
  const candidate = (size: string, target?: 'below') => ({ size, ruleId: size, row: 1, rowText: null, dose: { amount: 1, unit: 'cap', mark: 'Bar 2', ...(target === undefined ? {} : { target }) } })
  const atMachine = doseLine(step({ dose: { amount: 0, unit: 'at_machine' }, atMachine: { machine: 'washer', context: {} as never, candidates: [candidate('small'), candidate('medium', 'below')] } as never }), facts())
  expect(atMachine?.kind === 'candidates' && atMachine.candidates).toHaveLength(2)
})

test('dose lines: resolved now, decided when you load, asked when you load, and left out', () => {
  const resolved = loadCardView(load(), 1, facts()).doses
  expect(resolved).toEqual([{ kind: 'resolved', product: 'Tide', slot: 'Detergent slot', dose: { amount: 1, unit: 'cap', mark: '3', equivalent: null }, marks: ['1', '3', 'Max'], line: 'Heavily soiled' }])

  const candidate = (size: string, mark: string, rowText: string | null) => ({ size, ruleId: `r${mark}`, row: Number(mark), rowText, dose: { amount: 1, unit: 'cap', mark } })
  const atMachine = step({
    dose: { amount: 0, unit: 'at_machine' },
    atMachine: { machine: 'washer', context: {} as never, candidates: [candidate('medium', '1', null), candidate('large', '3', 'Large load'), candidate('extra_large', '3', 'Large load')] } as never,
  })
  expect(loadCardView(load({ treatments: [atMachine] }), 1, facts()).doses).toEqual([{
    kind: 'candidates',
    product: 'Tide',
    slot: 'Detergent slot',
    candidates: [{ dose: { amount: 1, unit: 'cap', mark: '1' }, line: null }, { dose: { amount: 1, unit: 'cap', mark: '3' }, line: 'Large load' }],
  }])
  const asked = step({ dose: { amount: 0, unit: 'at_machine' }, atMachine: { machine: 'washer', context: {} as never, candidates: [] } as never })
  expect(loadCardView(load({ treatments: [asked] }), 1, facts()).doses).toEqual([{ kind: 'ask', product: 'Tide', slot: 'Detergent slot' }])

  // A product left out has no dose line; the load says so as a caution.
  const unconfirmed = step({ confirmation: 'needs_confirmation' })
  const leftOut = loadCardView(load({ treatments: [unconfirmed] }), 1, facts({ reasons: [
    reason('product_left_out', { cause: 'label_doesnt_say', soilLevel: 'heavy' }, { supplyId: 'tide' }),
    reason('product_left_out', { cause: 'left_out' }, { supplyId: 'oxi' }),
    reason('product_left_out', { cause: 'cant_tell_he' }, { supplyId: 'tide', id: 'he' }),
  ] }))
  expect(leftOut.doses).toEqual([])
  expect(leftOut.cautions).toEqual([
    { text: 'Tide isn’t dosed for very dirty loads. Check the label.' },
    { text: 'Oxi is left out this time.' },
    { text: 'Tide is left out: its label depends on the', heLogo: true },
  ])
})

test('the dry line: the dryer’s own button words, what hangs, and why a stained garment hangs', () => {
  const drying = {
    status: 'ready', dryerId: 'dryer', heat: 'medium', heatLabel: 'Low Temp', tumbleTextileIds: ['jeans'], bulkUnits: 1, capacityUnits: null, loadSize: null,
    heldOut: [{ textileId: 'shorts', method: 'line_dry', reason: 'care' }, { textileId: 'jersey', method: 'line_dry', reason: 'stain' }],
    treatments: [step({ supplyId: 'bounce', dose: { amount: 1, unit: 'sheet' }, placement: 'dryer_drum', marks: undefined, ruleId: undefined })],
    omitted: [],
  }
  const view = loadCardView(load({ drying: drying as never }), 1, facts())
  expect(view.dry?.text).toBe('Dryer: Low Temp')
  expect(view.dry?.hang).toEqual(['Gym shorts', 'Soccer jersey (check the stain is gone before using the dryer)'])
  expect(view.dry?.doses).toEqual([{ kind: 'resolved', product: 'Bounce', slot: 'In the dryer', dose: { amount: 1, unit: 'sheet', mark: null, equivalent: null }, marks: null, line: null }])
  expect(loadCardView(load({ drying: { ...drying, status: 'none' } as never }), 1, facts()).dry?.text).toEqual('Hang everything')
  expect(loadCardView(load({ drying: { ...drying, heatLabel: null } as never }), 1, facts()).dry?.text).toBe('Dryer: Medium heat')
})

test('a dryer with unknown capacity says the fit was not checked, never that everything fits', () => {
  const drying = { status: 'ready', dryerId: 'dryer', heat: 'medium', heatLabel: 'Low Temp', tumbleTextileIds: ['jeans'], bulkUnits: 40, capacityUnits: null, loadSize: null, heldOut: [], treatments: [], omitted: [] }
  expect(loadCardView(load({ drying: { ...drying, fit: 'not_checked' } as never }), 1, facts()).dry?.fit).toBe('Dryer capacity unknown · fit not checked')
  expect(loadCardView(load({ drying: drying as never }), 1, facts()).dry?.fit, 'a plan saved before the fit was recorded').toBe('Dryer capacity unknown · fit not checked')
  expect(loadCardView(load({ drying: { ...drying, capacityUnits: 50, fit: 'fits' } as never }), 1, facts()).dry?.fit).toBeNull()
})

test('why together, and the cautions a move or a mixed load brings', () => {
  const sorted = [reason('dye_first_wash_risk', { cause: 'color_separation' }), reason('preference_applied', { cause: 'soil_separation' })]
  expect(loadCardView(load(), 1, facts({ reasons: sorted })).why).toBe('same colors, all very dirty')
  expect(loadCardView(load(), 1, facts({ reasons: sorted, pinned: true })).why).toBe('you put these together, same colors')
  expect(loadCardView(load(), 1, facts({ reasons: [reason('preference_applied', { cause: 'baby_separation' })] })).why).toBe('baby clothes on their own')
  expect(loadCardView(load(), 1, facts()).why).toBeNull()

  const mixed = loadCardView(load({ textileIds: ['jeans', 'shirt'] }), 1, facts({ reasons: [
    reason('preference_overridden', { cause: 'color_mixed', textileIds: ['jeans', 'shirt'] }),
    reason('preference_overridden', { cause: 'soil_mixed' }),
    reason('preference_overridden', { cause: 'baby_mixed' }),
    reason('preference_overridden', { cause: 'color_mixed' }, { loadId: 'load-002' }),
  ] }))
  expect(mixed.cautions.map((caution) => caution.text)).toEqual([
    'Leo’s jeans may bleed onto White shirt; use cold',
    'Very dirty and lightly worn clothes are together; it’s dosed for the dirtiest.',
    'Baby clothes are in with other clothes this time.',
  ])
})

test('a load blocked by something no card asks says why; a question is asked by its card instead', () => {
  const reasons = [
    reason('needs_confirmation', { cause: 'label_row_needed' }, { id: 'ask' }),
    reason('needs_confirmation', { cause: 'insufficient_product_evidence' }, { id: 'gap', loadId: undefined }),
  ]
  expect(loadCardView(load(), 1, facts({ reasons }), ['ask', 'gap']).blockers).toEqual(['Add a detergent first'])
  const questions = [{ kind: 'label_row', context: { loadId: 'load-002' }, key: { kind: 'label_row', subjectId: 'tide', context: {} } }, { kind: 'soil_level', context: {}, key: { kind: 'soil_level', subjectId: 'load-003', context: {} } }] as unknown as PlanQuestion[]
  expect(loadHasQuestion(questions, 'load-002')).toBe(true)
  expect(loadHasQuestion(questions, 'load-003')).toBe(true)
  expect(loadHasQuestion(questions, 'load-001')).toBe(false)
})

test('doseLine, exported so the pass can show another washer’s steps while a load starts, reads any given treatments', () => {
  const drumStep = step({ supplyId: 'oxi', placement: 'direct_to_drum', timing: 'before loading the clothes', dose: { amount: 1, unit: 'cap', mark: '1' } })
  expect(doseLine(drumStep, facts())).toMatchObject({ kind: 'resolved', slot: 'Into the drum' })
})

test('every load gets one name, and loads that would share a name say which load they are', () => {
  const pieces = new Map([
    ['tee', { name: 'White tee', colorGroup: 'white' }],
    ['blouse', { name: 'White blouse', colorGroup: 'white' }],
    ['jeans', { name: 'Black jeans', colorGroup: 'black', firstWash: true }],
  ])
  const names = loadNames([
    { loadId: 'a', number: 1, textileIds: ['tee'] },
    { loadId: 'b', number: 2, textileIds: ['blouse'] },
    { loadId: 'c', number: 3, textileIds: ['jeans'] },
  ], (id) => pieces.get(id))
  expect([...names.values()]).toEqual(['Whites · White tee', 'Whites · White blouse', 'Black jeans alone'])
})
