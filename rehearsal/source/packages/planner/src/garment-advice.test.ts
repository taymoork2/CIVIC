import assert from 'node:assert/strict'
import { test } from 'node:test'
import { garmentAdvice, plan, printfulCareSource, constructionCareSource, constructionFeatures, type GarmentDecoration, type TextileEvidence } from './index.ts'

const decoration: GarmentDecoration = { kind: 'printed', method: 'dtg', manufacturer: 'Printful', source: 'Synthetic exact garment listing', confidence: 'observed' }
const piece = (id: string): TextileEvidence & { id: string } => ({ id, kind: 't_shirt', decoration, material: 'cotton', colorGroup: 'light', firstWash: false,
  care: { washMethod: 'machine', cycle: 'normal', maxTemperatureC: 30, status: 'confirmed', restrictions: [] } })
const instructions = { source: 'Synthetic sewn label', preparation: [], washing: [], beforeDrying: [], drying: [], afterDrying: [], ironing: [] }

test('print advice requires recorded apparel, graphic evidence and machine-wash care', () => {
  for (const kind of [undefined, 'other', 'towel', 'sheets', 'bag']) assert.deepEqual(garmentAdvice([{ ...piece('a'), kind }]), [])
  for (const kind of ['unknown', 'none'] as const) assert.deepEqual(garmentAdvice([{ ...piece('a'), decoration: { ...decoration, kind } }]), [])
  for (const missing of [undefined, { ...decoration, confidence: 'unknown' as const }, { ...decoration, source: ' ' }]) assert.deepEqual(garmentAdvice([{ ...piece('a'), decoration: missing }]), [])
  for (const washMethod of ['unknown', 'hand_wash', 'do_not_wash']) assert.deepEqual(garmentAdvice([{ ...piece('a'), care: { washMethod } }]), [])
})

const observed = { presence: 'present' as const, confidence: 'observed' as const, source: 'Synthetic checked physical feature' }
const constructed = (id: string): TextileEvidence & { id: string } => ({ ...piece(id), decoration: { ...decoration, kind: 'unknown', method: 'unknown', confidence: 'unknown', source: '', construction: Object.fromEntries(constructionFeatures.map((feature) => [feature, observed])) } })

test('unknown, absent, unconfirmed and sourceless construction never emits specific advice', () => {
  for (const fact of [{ ...observed, presence: 'unknown' as const }, { ...observed, presence: 'absent' as const }, { ...observed, confidence: 'unknown' as const }, { ...observed, source: ' ' }]) {
    assert.deepEqual(garmentAdvice([{ ...constructed('a'), decoration: { ...constructed('a').decoration!, construction: Object.fromEntries(constructionFeatures.map((feature) => [feature, fact])) } }]), [])
  }
  assert.deepEqual(garmentAdvice([{ ...piece('a'), kind: 'dress', decoration: undefined }]), [])
  for (const washMethod of ['unknown', 'hand_wash', 'do_not_wash']) assert.deepEqual(garmentAdvice([{ ...constructed('a'), care: { washMethod } }]), [])
})

test('recorded fastening and delicate trim yield individually scoped general actions', () => {
  const tips = garmentAdvice([constructed('b'), constructed('a'), constructed('b')])
  assert.deepEqual(tips.map((tip) => tip.tipId).sort(), ['close_zipper', 'fasten_buttons', 'fasten_hooks', 'protect_delicate_trim'])
  assert.equal(new Set(tips.map((tip) => tip.scope)).size, 4)
  for (const tip of tips) {
    assert.equal(tip.source, constructionCareSource)
    assert.deepEqual(tip.textileIds, ['a', 'b'])
    assert.match(tip.action, /optional/)
    assert.match(tip.reason, /general/)
  }
  assert.match(tips.find((tip) => tip.tipId === 'protect_delicate_trim')!.reason, /does not establish that the trim is washable/)
})

test('embroidery uses a separate clothing scope and only verified maker and checked source match manufacturer guidance', () => {
  const embroidery: GarmentDecoration = { ...decoration, kind: 'embroidered', method: 'unknown', confidence: 'verified', guidanceSource: printfulCareSource }
  assert.equal(garmentAdvice([{ ...piece('a'), decoration: embroidery }])[0]!.scope, 'manufacturer_embroidery')
  for (const fact of [{ ...embroidery, confidence: 'observed' as const }, { ...embroidery, manufacturer: 'Other maker' }, { ...embroidery, guidanceSource: 'Different care source' }, { ...embroidery, guidanceSource: undefined }, { ...embroidery, method: 'dtg' as const }]) {
    assert.equal(garmentAdvice([{ ...piece('a'), decoration: fact }])[0]!.scope, 'general_embroidery')
  }
  for (const kind of ['hat', 'bag', 'shoes', 'towel']) assert.deepEqual(garmentAdvice([{ ...piece('a'), kind, decoration: embroidery }]), [])
})

test('preparation and washing label wording suppress conflicting or duplicate actions only', () => {
  const item = constructed('a')
  for (const [wording, excluded] of [
    ['Leave pocket zippers open', ['close_zipper', 'fasten_hooks', 'fasten_buttons']],
    ['Do not fasten buttons', ['close_zipper', 'fasten_hooks', 'fasten_buttons']],
    ['Wash without a mesh bag', ['protect_delicate_trim']],
    ['Remove trim before washing', ['protect_delicate_trim']],
    ['Keep hooks unfastened', ['close_zipper', 'fasten_hooks', 'fasten_buttons']],
  ] as const) {
    for (const stage of ['preparation', 'washing'] as const) {
      const tips = garmentAdvice([{ ...item, care: { ...item.care, instructions: { ...instructions, [stage]: [wording] } } }])
      assert.ok(tips.every((tip) => !excluded.includes(tip.tipId as never)), wording)
    }
  }
  for (const wording of ['Wash right side out', 'Do not turn inside-out', 'Wash insideout', 'Wash face out', 'Do not invert this garment']) assert.deepEqual(garmentAdvice([{ ...piece('a'), care: { washMethod: 'machine', instructions: { ...instructions, washing: [wording] } } }]), [])
})

test('matching pieces keep different construction and reminders without inferring facts from names or kinds', () => {
  const first = { ...constructed('a'), decoration: { ...constructed('a').decoration!, construction: { zipper: observed } } }
  const second = { ...constructed('b'), decoration: { ...constructed('b').decoration!, construction: { delicateTrim: observed } } }
  const tips = garmentAdvice([first, second, { ...constructed('hidden'), adviceReminder: false }, piece('print')])
  assert.deepEqual(tips.find((tip) => tip.tipId === 'close_zipper')!.textileIds, ['a'])
  assert.deepEqual(tips.find((tip) => tip.tipId === 'protect_delicate_trim')!.textileIds, ['b'])
  assert.deepEqual(tips.find((tip) => tip.tipId === 'inside_out')!.textileIds, ['print'])
})

test('exact manufacturer/method scope stays distinct from optional general graphic advice', () => {
  for (const method of ['dtg', 'dtflex'] as const) {
    const tip = garmentAdvice([{ ...piece('a'), decoration: { ...decoration, method } }])[0]!
    assert.equal(tip.scope, 'manufacturer_print_method')
    assert.equal(tip.source, printfulCareSource)
  }
  for (const fact of [{ ...decoration, manufacturer: 'Other maker' }, { ...decoration, method: 'unknown' as const }, { ...decoration, method: 'screen_print' as const }]) {
    const tip = garmentAdvice([{ ...piece('a'), decoration: fact }])[0]!
    assert.equal(tip.scope, 'general_graphic')
    assert.match(tip.reason, /does not establish instructions for this garment/)
  }
})

test('label handling takes precedence, preferences suppress only advice, and identical tips deduplicate', () => {
  for (const wording of ['Turn inside out', 'Do not wash inside-out', 'Turn the liner inside out only']) {
    const a = piece('a')
    assert.deepEqual(garmentAdvice([{ ...a, care: { ...a.care, instructions: { ...instructions, preparation: [wording] } } }]), [])
  }
  assert.deepEqual(garmentAdvice([{ ...piece('a'), adviceReminder: false }]), [])
  const one = garmentAdvice([piece('b'), piece('a'), piece('b')])
  assert.equal(one.length, 1)
  assert.deepEqual(one[0]!.textileIds, ['a', 'b'])
  assert.deepEqual(garmentAdvice([piece('a'), piece('b')]), one)
})

test('planner advice never supplies wash settings, product use or a label override', () => {
  const input = { textiles: [piece('a'), piece('b')], machines: [{ id: 'washer', highEfficiency: true, capacityUnits: 8, capacityConfidence: 'verified' as const, evidence: { status: 'verified' as const }, supportedCycles: ['normal'], dispensing: { placements: ['detergent_compartment'] } }], supplies: [{ id: 'detergent', kind: 'detergent', labelEvidence: { status: 'verified' as const }, formulation: { form: 'liquid' }, applicationRules: [{ id: 'wash', stage: 'wash', placement: 'detergent_compartment', dose: { amount: 10, unit: 'ml' }, evidence: { status: 'verified' as const } }] }] }
  const advised = plan(input)
  const ordinary = plan({ ...input, textiles: input.textiles.map(({ decoration: _fact, ...rest }) => rest) })
  const { garmentAdvice: tips, ...load } = advised.loads[0]!
  assert.equal(tips?.length, 1)
  assert.deepEqual(load, ordinary.loads[0])
  assert.deepEqual(input.textiles[0]!.care?.restrictions, [])
})
