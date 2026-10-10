import { expect, test } from 'vitest'

import type { Textile } from '@/household/inventory-types'
import {
  chooseOptionalProduct, choosePretreatment, currentPass, dismissQuestion, emptyPass, frozenPins, groupCareQuestions, handWashList, hamperGroups, hamperSelection, leaveOutProduct, machineHamper, passArgs, pinRefusal, withoutGarments, washOrder, dryerRuns,
  type Pass, type PlanQuestion,
} from '@/laundry/laundry-pass'

const pass = (overrides: Partial<Pass> = {}): Pass => ({ ...emptyPass, ...overrides })
const key = (overrides: Partial<PlanQuestion['key']> = {}): PlanQuestion['key'] => ({ kind: 'label_row', subjectId: 'tide', context: { soilLevel: 'heavy' }, ...overrides })

test('pretreatment choices replace only that piece and leave the pass when the piece or product goes', () => {
  const first = choosePretreatment(emptyPass, 't1', 'spray')
  const second = choosePretreatment(first, 't2', 'spray')
  const switched = choosePretreatment(second, 't1', 'liquid')
  expect(switched.pretreatmentChoices).toEqual([{ textileId: 't2', supplyId: 'spray' }, { textileId: 't1', supplyId: 'liquid' }])
  expect(passArgs(switched).pretreatmentChoices).toEqual(switched.pretreatmentChoices)
  expect(withoutGarments(['t1', 't2'], switched, ['t1']).pass.pretreatmentChoices).toEqual([{ textileId: 't2', supplyId: 'spray' }])
  expect(currentPass(switched, { supplies: [{ supplyId: 'liquid' as never } as never], machines: [] }).pretreatmentChoices).toEqual([{ textileId: 't1', supplyId: 'liquid' }])
})

test('a pass sends only what it has, and Wash now only when on', () => {
  expect(passArgs(emptyPass)).toEqual({})
  const full = pass({
    mode: 'rush',
    loadPins: [{ textileId: 't1' as never, group: 2 }],
    dismissedQuestions: [{ kind: 'label_row', subjectId: 'tide', context: {}, answer: 'label_doesnt_say' }],
    excludedSupplyIds: ['oxi' as never],
  })
  expect(passArgs(full)).toEqual({ mode: 'rush', loadPins: full.loadPins, dismissedQuestions: full.dismissedQuestions, excludedSupplyIds: ['oxi'] })
  expect(passArgs(pass({ mode: 'normal' }))).not.toHaveProperty('mode')
})

test('a dismissed question stays dismissed for the pass, once per key, and only label and logo questions dismiss', () => {
  const once = dismissQuestion(emptyPass, key(), 'depends_on_size')
  expect(once.dismissedQuestions).toEqual([{ kind: 'label_row', subjectId: 'tide', context: { soilLevel: 'heavy' }, answer: 'depends_on_size' }])
  // Answering the same card again replaces its answer; another soil is another card.
  const again = dismissQuestion(once, key(), 'label_doesnt_say')
  expect(again.dismissedQuestions).toEqual([{ kind: 'label_row', subjectId: 'tide', context: { soilLevel: 'heavy' }, answer: 'label_doesnt_say' }])
  const other = dismissQuestion(again, key({ context: { soilLevel: 'light' } }), 'label_doesnt_say')
  expect(other.dismissedQuestions).toHaveLength(2)
  expect(dismissQuestion(other, key({ kind: 'washer_he', subjectId: 'washer', context: {} }), 'cant_tell').dismissedQuestions.at(-1)).toEqual({ kind: 'washer_he', subjectId: 'washer', context: {}, answer: 'cant_tell' })
  expect(dismissQuestion(emptyPass, key({ kind: 'soil_level' }), 'cant_tell')).toBe(emptyPass)
  // Later changes to the pass carry the dismissals along; a new Make loads starts from the empty pass.
  expect(leaveOutProduct(other, 'oxi').dismissedQuestions).toEqual(other.dismissedQuestions)
  expect(emptyPass.dismissedQuestions).toEqual([])
})

test('leaving a product out is idempotent', () => {
  const once = leaveOutProduct(emptyPass, 'oxi')
  expect(once.excludedSupplyIds).toEqual(['oxi'])
  expect(leaveOutProduct(once, 'oxi')).toBe(once)
})

test('optional products are chosen explicitly, can be left out and reselected, and drop when removed', () => {
  expect(passArgs(pass({ optionalSupplyIds: [], washGoals: ['ordinary'] }))).toEqual({})
  const chosen = chooseOptionalProduct(emptyPass, 'oxi', true)
  expect(chooseOptionalProduct(chosen, 'oxi', true).optionalSupplyIds).toEqual(['oxi'])
  expect(passArgs({ ...chosen, washGoals: ['visible_stain'] })).toMatchObject({ optionalSupplyIds: ['oxi'], washGoals: ['visible_stain'] })
  const leftOut = leaveOutProduct(chosen, 'oxi')
  expect(leftOut.optionalSupplyIds).toEqual([])
  const again = chooseOptionalProduct(leftOut, 'oxi', true)
  expect(again.excludedSupplyIds).toEqual([])
  expect(again.optionalSupplyIds).toEqual(['oxi'])
  expect(chooseOptionalProduct(again, 'oxi', false).optionalSupplyIds).toEqual([])
  expect(currentPass(again, { supplies: [], machines: [] } as never).optionalSupplyIds).toEqual([])
})

test('"Not this time" takes garments out of the selection and out of the moves', () => {
  const moved = pass({ loadPins: [{ textileId: 't1' as never, group: 1 }, { textileId: 't2' as never, group: 1 }, { textileId: 't2' as never, group: 2 }] })
  const next = withoutGarments(['t1', 't2', 't3'], moved, ['t2'])
  expect(next.selection).toEqual(['t1', 't3'])
  expect(next.pass.loadPins).toEqual([{ textileId: 't1', group: 1 }])
})

test('a move freezes the loads as shown, each garment once, then the moved garment once more', () => {
  const loads = [{ textileIds: ['jeans', 'jersey'] }, { textileIds: ['shorts'] }]
  expect(frozenPins(loads, 'shorts', 1)).toEqual([
    { textileId: 'jeans', group: 1 },
    { textileId: 'jersey', group: 1 },
    { textileId: 'shorts', group: 2 },
    { textileId: 'shorts', group: 1 },
  ])
  // "Move to a new load" is one past the last load shown.
  expect(frozenPins(loads, 'jersey', 3).at(-1)).toEqual({ textileId: 'jersey', group: 3 })
  expect(frozenPins(loads, 'jersey', 3).filter((pin) => pin.textileId === 'jersey')).toHaveLength(2)
})

test('a refused move is found by garment and target load', () => {
  const reasons = [
    { code: 'pin_refused', textileIds: ['sweater'], details: { cause: 'care_cycle', group: 2 } },
    { code: 'preference_overridden', textileIds: ['sweater'], details: { cause: 'color_mixed' } },
  ] as const
  expect(pinRefusal(reasons as never, 'sweater', 2)).toBe(reasons[0])
  expect(pinRefusal(reasons as never, 'sweater', 1)).toBeNull()
  expect(pinRefusal(reasons as never, 'jeans', 2)).toBeNull()
})

test('load cards follow the wash order the hub uses: under way first, then urgent, two-run tumble, tumble, air-dry', () => {
  const loads = [{ id: 'hang' }, { id: 'jeans' }, { id: 'kit' }, { id: 'quilt' }, { id: 'done' }]
  const facts: Record<string, { started: boolean; urgent: boolean; dryerRuns: number }> = {
    hang: { started: false, urgent: false, dryerRuns: 0 }, jeans: { started: false, urgent: false, dryerRuns: 1 },
    kit: { started: false, urgent: true, dryerRuns: 1 }, quilt: { started: false, urgent: false, dryerRuns: 2 }, done: { started: true, urgent: false, dryerRuns: 0 },
  }
  expect(washOrder(loads, (load) => facts[load.id]!).map((load) => load.id)).toEqual(['done', 'kit', 'quilt', 'jeans', 'hang'])
  expect(dryerRuns(null)).toBe(0)
  expect(dryerRuns({ tumble: 0, fit: 'over' })).toBe(0)
  expect(dryerRuns({ tumble: 3, fit: 'over' })).toBe(2)
  expect(dryerRuns({ tumble: 3, fit: 'fits' })).toBe(1)
})

test('answers about products or washers that are gone are dropped before planning again', () => {
  const stale = pass({
    dismissedQuestions: [
      { kind: 'label_row', subjectId: 'tide', context: {}, answer: 'depends_on_size' },
      { kind: 'label_row', subjectId: 'gone', context: {}, answer: 'label_doesnt_say' },
      { kind: 'washer_he', subjectId: 'washer', context: {}, answer: 'cant_tell' },
      { kind: 'washer_he', subjectId: 'sold', context: {}, answer: 'cant_tell' },
    ],
    excludedSupplyIds: ['tide' as never, 'gone' as never],
  })
  const next = currentPass(stale, { supplies: [{ supplyId: 'tide' }], machines: [{ machineId: 'washer' }] } as never)
  expect(next.dismissedQuestions.map((entry) => entry.subjectId)).toEqual(['tide', 'washer'])
  expect(next.excludedSupplyIds).toEqual(['tide'])
})

let next = 0
const textile = (overrides: Partial<Textile> = {}): Textile => ({
  textileId: `t${(next += 1)}`,
  name: 'Tee',
  status: 'dirty',
  inLoad: null,
  guest: false,
  wearerId: null,
  care: null,
  ...overrides,
}) as Textile

test('the hamper: what Make loads washes, hand wash apart, and rows by whose they are', () => {
  const sam = textile({ name: 'Jersey', wearerId: 'sam' as never })
  const towel = textile({ name: 'Towel' })
  const guest = textile({ name: 'Alex’s shirt', guest: true })
  const silk = textile({ name: 'Silk blouse', wearerId: 'sam' as never, care: { washMethod: 'hand_wash' } as never })
  const washing = textile({ name: 'Jeans', inLoad: 's1' as never })
  const ready = textile({ name: 'Shirt', status: 'clean' })
  const all = [sam, towel, guest, silk, washing, ready]
  expect(machineHamper(all).map((entry) => entry.name)).toEqual(['Jersey', 'Towel', 'Alex’s shirt'])
  expect(handWashList(all).map((entry) => entry.name)).toEqual(['Silk blouse'])
  // One wearer in the household: the towel with no wearer set is Sam's, not "Shared" — nobody else to share it with.
  const groups = hamperGroups(all, [{ wearerId: 'sam', name: 'Sam', kind: 'child', principalKey: null }] as never)
  expect(groups.map((group) => [group.name, group.rows.map((row) => row.name)])).toEqual([
    ['Sam', ['Jersey', 'Towel']],
    ['Guests', ['Alex’s shirt']],
  ])
})

test('a one-person household with no guests gets no group heading at all', () => {
  const mine = textile({ name: 'Tee' })
  const alsoMine = textile({ name: 'Towel' })
  const groups = hamperGroups([mine, alsoMine], [{ wearerId: 'me', name: 'Me', kind: 'adult', principalKey: 'p1' }] as never)
  expect(groups).toEqual([{ key: 'me', name: '', guests: false, rows: [mine, alsoMine] }])
})

test('with no wearers registered yet, everything is the one group and needs no heading', () => {
  const mine = textile({ name: 'Tee' })
  const groups = hamperGroups([mine], [])
  expect(groups).toEqual([{ key: 'shared', name: '', guests: false, rows: [mine] }])
})

test('the device remembers "Not this time", and something newly in the hamper starts selected', () => {
  expect(hamperSelection(['t1', 't2'], null)).toEqual(['t1', 't2'])
  expect(hamperSelection(['t1', 't2', 't3'], { selectedTextileIds: ['t1'], seenTextileIds: ['t1', 't2'] })).toEqual(['t1', 't3'])
})

test('"Check the tag" for identical garments is one card that answers every one of them', () => {
  const care = (id: string) => ({ kind: 'care_unknown', key: { kind: 'care_unknown', subjectId: id, context: {} }, subjectIds: [id], context: {} }) as unknown as PlanQuestion
  const logo = { kind: 'washer_he', key: { kind: 'washer_he', subjectId: 'w', context: {} }, subjectIds: [], context: {} } as unknown as PlanQuestion
  const garments: Record<string, Pick<Textile, 'name' | 'color' | 'wearerId' | 'guest'>> = {
    s1: { name: 'Gray sweats', color: 'Gray', wearerId: 'me' as never, guest: false },
    s2: { name: 'gray sweats ', color: 'gray', wearerId: 'me' as never, guest: false },
    s3: { name: 'Gray sweats', color: 'Gray', wearerId: 'me' as never, guest: false },
    // The same name for someone else, or in another colour, is another card.
    other: { name: 'Gray sweats', color: 'Gray', wearerId: 'sam' as never, guest: false },
    navy: { name: 'Gray sweats', color: 'Navy', wearerId: 'me' as never, guest: false },
  }
  const cards = groupCareQuestions([care('s1'), logo, care('s2'), care('other'), care('navy'), care('s3'), care('unknown')], (id) => garments[id])
  expect(cards.map((card) => [card.kind, card.subjectIds])).toEqual([
    ['care_unknown', ['s1', 's2', 's3']],
    ['washer_he', []],
    ['care_unknown', ['other']],
    ['care_unknown', ['navy']],
    // A garment this device doesn't know is never merged.
    ['care_unknown', ['unknown']],
  ])
  expect(cards[0]!.key).toEqual({ kind: 'care_unknown', subjectId: 's1', context: {} })
})
