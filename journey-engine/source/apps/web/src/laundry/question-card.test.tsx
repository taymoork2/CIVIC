import { renderToStaticMarkup } from '@/test/markup'
import { expect, test } from 'vitest'

import { emptyPass, type Pass, type PlanQuestion } from '@/laundry/laundry-pass'
import {
  Commit, QuestionCard, conflictChoiceArgs, washerGroupIds, doseEcho, labelOptions, labelQuestionParts, labelRowArgs, measurePick, questionEffect, tagAnswerAction, emptyLabelDraft,
  type QuestionAction, type QuestionCalls,
} from '@/laundry/question-card'
import { assertPlainCopy } from '@/kit/test-copy'
import { emptyTag, type TagDraft } from '@/laundry/tag-step'

const cap = { kind: 'cap' as const, marks: [{ label: '1' }, { label: '3' }, { label: 'Max' }] }
const pods = { kind: 'count' as const, countUnit: 'pod' as const }

const question = (overrides: Partial<PlanQuestion> = {}): PlanQuestion => ({
  kind: 'label_row',
  key: { kind: 'label_row', subjectId: 'tide', context: { soilLevel: 'heavy' } },
  subjectIds: [],
  context: { loadId: 'load-001', soilLevel: 'heavy', stage: 'washer' },
  product: { supplyId: 'tide', name: 'Tide', use: 'detergent', measure: cap },
  ...overrides,
}) as PlanQuestion

const names: Record<string, string> = { jersey: 'Soccer jersey', blazer: 'Navy blazer', silk: 'Silk blouse', socks: 'Socks' }
const nameOf = (id: string) => names[id] ?? 'Guest item'

/** Calls that record what they were sent. */
function recording() {
  const sent: [string, unknown][] = []
  const call = (name: string) => async (args: unknown) => {
    sent.push([name, args])
    return name === 'answerLabelRow' ? { ruleIds: [], row: 1 } : name === 'moveToDryCleaning' ? { changed: 1, skipped: 0 } : null
  }
  const calls = {
    answerTagQuestions: call('answerTagQuestions'),
    moveToDryCleaning: call('moveToDryCleaning'),
    setTextileStatus: call('setTextileStatus'),
    updateMachine: call('updateMachine'),
    answerLabelRow: call('answerLabelRow'),
    updateSupply: call('updateSupply'),
    washerGroup: (machineId: string) => (machineId === 'washer' ? ['washer', 'washer-3'] : [machineId]),
  } as unknown as QuestionCalls
  return { sent, calls }
}

const state = (pass: Pass = emptyPass) => ({ selection: ['jersey', 'blazer', 'silk', 'socks'], pass })
const effect = async (action: QuestionAction, card: PlanQuestion = question()) => {
  const { sent, calls } = recording()
  const outcome = await questionEffect(action, card, state(), calls)
  return { sent, outcome }
}

test('the tag card saves the tag for its garments and plans again', async () => {
  const { sent, outcome } = await effect({ kind: 'tag', textileIds: ['silk'], answers: { washMethod: 'machine', cycle: 'delicate', maxTemperatureC: 30 } }, question({ kind: 'care_unknown', subjectIds: ['silk'] }))
  expect(sent).toEqual([['answerTagQuestions', { textileIds: ['silk'], washMethod: 'machine', cycle: 'delicate', maxTemperatureC: 30 }]])
  expect(outcome).toEqual({ ...state(), toast: null, recompute: true })
})

test('a product safety answer saves the recorded label classification and recomputes', async () => {
  const args = { supplyId: 's1' as NonNullable<PlanQuestion['product']>['supplyId'], safety: { bleachKind: 'oxygen' as const, incompatibleSupplyIds: [], incompatibleMaterials: [] } }
  const { sent, outcome } = await effect({ kind: 'product_safety', args }, question({ kind: 'product_safety' }))
  expect(sent).toEqual([['updateSupply', args]])
  expect(outcome.recompute).toBe(true)
})

test('product checks are explicit per-load pass changes, preserving other loads without inventory writes', async () => {
  const { calls, sent } = recording()
  const check = { supplyId: 'tide', sourceDigest: 'a'.repeat(64), loadFingerprint: 'b'.repeat(64), colorfastnessChecked: true, sourceLoadCategory: 'standard' as const }
  const other = { ...check, loadFingerprint: 'c'.repeat(64) }
  const outcome = await questionEffect({ kind: 'product_load_confirmation', check }, question({ kind: 'product_load_confirmation' }), state({ ...emptyPass, productLoadConfirmations: [other, { ...check, colorfastnessChecked: false }] }), calls)
  expect(sent).toEqual([])
  expect(outcome.pass.productLoadConfirmations).toEqual([other, check])
  expect(outcome.recompute).toBe(true)
  const markup = renderToStaticMarkup(<QuestionCard question={question({ kind: 'product_load_confirmation', subjectIds: ['jersey'], productCheck: { sourceDigest: check.sourceDigest, loadFingerprint: check.loadFingerprint, colorfastnessRequired: true, sourceLoadCategories: ['smaller', 'standard', 'larger'], ordinaryWashRouteRequired: true, washContextFingerprint: 'd'.repeat(64), cycle: 'normal', temperatureC: 40 } })} nameOf={nameOf} pending={false} onAction={() => undefined} />)
  expect(markup).toContain('colorfastness')
  expect(markup).toContain('intact-Pak warm/hot')
  expect(markup).toContain('Standard load')
  expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Pick an answer<\/button>/)
})

test('"Tag doesn\'t say" on the washtub saves fail-closed care instead of dropping the garments', () => {
  // The washtub says nothing, but the bleach triangle and dryer square were read: all three are saved.
  const noTag: TagDraft = { ...emptyTag, method: 'no_tag', bleach: 'none', dryer: 'no_tumble' }
  expect(tagAnswerAction(noTag, ['silk'])).toEqual({ kind: 'tag', textileIds: ['silk'], answers: { washMethod: 'unknown', bleach: 'none', dryMethod: 'do_not_tumble_dry' } })
  // Nothing on the tag at all is still "Tag doesn't say" everywhere: unknown wash, no bleach kept, hang.
  const nothingOnTag: TagDraft = { ...emptyTag, method: 'no_tag', bleach: 'unknown', dryer: 'unknown' }
  expect(tagAnswerAction(nothingOnTag, ['silk'])).toEqual({ kind: 'tag', textileIds: ['silk'], answers: { washMethod: 'unknown' } })
  // Still waiting on the bleach or dryer row: no action yet, and it never falls back to leaving them out.
  expect(tagAnswerAction({ ...emptyTag, method: 'no_tag' }, ['silk'])).toBeNull()
  expect(tagAnswerAction(emptyTag, ['silk'])).toBeNull()
})

test('leaving garments out, or sending them to dry cleaning, takes them out of the selection', async () => {
  const left = await effect({ kind: 'leave_garments', textileIds: ['silk'] })
  expect(left.sent).toEqual([])
  expect(left.outcome.selection).toEqual(['jersey', 'blazer', 'socks'])
  expect(left.outcome.recompute).toBe(true)
  const cleaned = await effect({ kind: 'dry_clean', textileIds: ['blazer'] }, question({ kind: 'dry_clean_only', subjectIds: ['blazer'] }))
  expect(cleaned.sent).toEqual([['moveToDryCleaning', { textileIds: ['blazer'] }]])
  expect(cleaned.outcome.selection).toEqual(['jersey', 'silk', 'socks'])
})

test('the soil card writes every garment its own soil, one write per level, then plans again', async () => {
  const soiled = await effect({ kind: 'soil', soils: [{ textileId: 'jersey', soilLevel: 'heavy' }, { textileId: 'socks', soilLevel: 'light' }, { textileId: 'silk', soilLevel: 'heavy' }] })
  expect(soiled.sent).toEqual([
    ['setTextileStatus', { textileIds: ['socks'], status: 'dirty', soilLevel: 'light' }],
    ['setTextileStatus', { textileIds: ['jersey', 'silk'], status: 'dirty', soilLevel: 'heavy' }],
  ])
  expect(soiled.outcome.recompute).toBe(true)
})

test('the logo card saves every identical washer, and "Can’t tell" sets the question aside for the pass', async () => {
  const card = question({ kind: 'washer_he', key: { kind: 'washer_he', subjectId: 'washer', context: {} }, machine: { machineId: 'washer' as never, name: 'Washer 2' } })
  const yes = await effect({ kind: 'he', machineId: 'washer', highEfficiency: true }, card)
  expect(yes.sent).toEqual([['updateMachine', { machineId: 'washer', highEfficiency: true }], ['updateMachine', { machineId: 'washer-3', highEfficiency: true }]])
  const alone = await effect({ kind: 'he', machineId: 'home', highEfficiency: false }, card)
  expect(alone.sent).toEqual([['updateMachine', { machineId: 'home', highEfficiency: false }]])
  expect(yes.outcome.pass).toBe(emptyPass)
  const cantTell = await effect({ kind: 'dismiss', answer: 'cant_tell' }, card)
  expect(cantTell.sent).toEqual([])
  expect(cantTell.outcome.pass.dismissedQuestions).toEqual([{ kind: 'washer_he', subjectId: 'washer', context: {}, answer: 'cant_tell' }])
  expect(cantTell.outcome.toast).toBeNull()
})

test('an HE answer covers the washer and its identical siblings, that one first; a washer alone is just itself', () => {
  const washer = (machineId: string, name: string, extra: Record<string, unknown> = {}) => ({ machineId, name, applianceType: 'front_load_washer', location: 'shared', archived: false, heatSettings: [], supportedCycles: [], placements: [], cycleMinutes: {}, ...extra }) as never
  const machines = [washer('w1', 'Speed Queen washer 1'), washer('w2', 'Speed Queen washer 2'), washer('w3', 'Speed Queen washer 3', { archived: true }), washer('w4', 'Speed Queen washer 4'), washer('d1', 'Speed Queen washer 5', { applianceType: 'tumble_dryer' }), washer('home', 'Washer', { location: 'home' })]
  expect(washerGroupIds('w2', machines)).toEqual(['w2', 'w1', 'w4'])
  expect(washerGroupIds('home', machines)).toEqual(['home'])
  expect(washerGroupIds('gone', machines)).toEqual(['gone'])
})

test('the label card saves one row, sets a question aside, or leaves the product out', async () => {
  const args = { supplyId: 'tide', context: { soilLevel: 'heavy' }, dose: { amount: 1, unit: 'cap', mark: '3' } }
  const saved = await effect({ kind: 'label_row', args: args as never })
  expect(saved.sent).toEqual([['answerLabelRow', args]])
  expect(saved.outcome.recompute).toBe(true)

  const depends = await effect({ kind: 'dismiss', answer: 'depends_on_size' })
  expect(depends.outcome.pass.dismissedQuestions).toEqual([{ kind: 'label_row', subjectId: 'tide', context: { soilLevel: 'heavy' }, answer: 'depends_on_size' }])
  expect(depends.outcome.toast).toBeNull()

  const doesntSay = await effect({ kind: 'dismiss', answer: 'label_doesnt_say' })
  expect(doesntSay.outcome.pass.dismissedQuestions[0]?.answer).toBe('label_doesnt_say')
  expect(doesntSay.outcome.toast).toBe('Tide isn’t dosed for very dirty loads. Check the label.')

  const out = await effect({ kind: 'leave_product', supplyId: 'tide' })
  expect(out.sent).toEqual([])
  expect(out.outcome.pass.excludedSupplyIds).toEqual(['tide'])
})

test('a label row is saved for exactly the context asked, and the typed line only when typed', () => {
  const plan = { ...question().context }
  const options = labelOptions(question(), plan, false)
  expect(options).toEqual({ dryer: false, sameForAll: true, alsoVeryDirty: false, inDrawer: false, dependsOnSize: true })
  const dose = { amount: 1, unit: 'cap', mark: '3' }
  expect(labelRowArgs('tide', plan, options, { ...emptyLabelDraft, dose })).toEqual({ supplyId: 'tide', context: { soilLevel: 'heavy' }, dose })
  expect(labelRowArgs('tide', { ...plan, washerClass: 'he' }, options, { ...emptyLabelDraft, dose, sameForAll: true, rowText: '  Large load  ' }))
    .toEqual({ supplyId: 'tide', context: { soilLevel: 'heavy', washerClass: 'he' }, sameForAll: true, dose, rowText: 'Large load' })

  // At the machine the size is known: no "It depends", and a lighter load may say the line also covers very dirty ones.
  const atMachine = { ...plan, soilLevel: 'normal' as const, loadSize: 'large' as const }
  const machineOptions = labelOptions(question(), atMachine, true)
  expect(machineOptions.dependsOnSize).toBe(false)
  expect(machineOptions.alsoVeryDirty).toBe(true)
  expect(labelRowArgs('tide', atMachine, machineOptions, { ...emptyLabelDraft, dose, alsoVeryDirty: true }))
    .toEqual({ supplyId: 'tide', context: { loadSize: 'large', soilLevel: 'normal' }, alsoVeryDirty: true, dose })

  // A booster's first row asks where it goes; a dryer product has no soil, logo or toggles.
  const booster = question({ product: { supplyId: 'oxi' as never, name: 'Oxi', use: 'booster', measure: cap } })
  expect(labelOptions(booster, plan, false).inDrawer).toBe(true)
  expect(labelOptions(booster, plan, true).inDrawer).toBe(false)
  const sheets = question({ context: { stage: 'dryer', soilLevel: 'heavy' }, product: { supplyId: 'bounce' as never, name: 'Bounce', use: 'dryer_sheets', measure: { kind: 'count', countUnit: 'sheet' } } })
  const dryer = labelOptions(sheets, sheets.context, false)
  expect(dryer).toMatchObject({ dryer: true, sameForAll: false, alsoVeryDirty: false, inDrawer: false })
  expect(labelRowArgs('bounce', sheets.context, dryer, { ...emptyLabelDraft, dose: { amount: 2, unit: 'sheet' }, sameForAll: true })).toEqual({ supplyId: 'bounce', context: {}, dose: { amount: 2, unit: 'sheet' } })
})

test('choosing between two fitting lines saves the full context with the chosen dose and its typed line', () => {
  const card = question({ kind: 'conflicting_rows', context: { soilLevel: 'heavy', washerClass: 'he', stage: 'washer' } })
  const row = { ruleId: 'r2' as never, row: 2, rowText: 'Heavily soiled', dose: { amount: 1, unit: 'cap', mark: '3' } }
  expect(conflictChoiceArgs(card, 'tide', row)).toEqual({ supplyId: 'tide', context: { soilLevel: 'heavy', washerClass: 'he' }, dose: { amount: 1, unit: 'cap', mark: '3' }, rowText: 'Heavily soiled' })
  expect(conflictChoiceArgs(card, 'tide', { ...row, rowText: null }, 'large')).toEqual({ supplyId: 'tide', context: { loadSize: 'large', soilLevel: 'heavy', washerClass: 'he' }, dose: { amount: 1, unit: 'cap', mark: '3' } })
})

test('the dose is picked from the printed marks, or counted', () => {
  expect(measurePick(cap)).toEqual({ kind: 'marks', vessel: 'cap', marks: ['1', '3', 'Max'] })
  expect(measurePick({ kind: 'scoop', marks: [{ label: 'A' }] })).toEqual({ kind: 'marks', vessel: 'scoop', marks: ['A'] })
  expect(measurePick(pods)).toEqual({ kind: 'count', unit: 'pod' })
  expect(measurePick({ kind: 'cap', marks: [] })).toBeNull()
  expect(measurePick(null)).toBeNull()
})

test('the label question in words: the load in bold, pods counted, the logo only when it matters', () => {
  expect(labelQuestionParts(question(), question().context)).toEqual({ lead: 'Grab the Tide bottle.', before: 'What does the back say for a ', bold: 'very dirty', after: ' load', he: null })
  expect(labelQuestionParts(question(), { stage: 'washer' })).toMatchObject({ before: 'What does the back say about how much to use', bold: null })
  const podCard = question({ product: { supplyId: 'pods' as never, name: 'Tide pods', use: 'pods', measure: pods } })
  expect(labelQuestionParts(podCard, { soilLevel: 'heavy', washerClass: 'he', stage: 'washer' })).toEqual({ lead: 'Grab the Tide pods bag.', before: 'How many pods for a ', bold: 'very dirty', after: ' load', he: 'with' })
  expect(labelQuestionParts(question(), { soilLevel: 'heavy', washerClass: 'standard', stage: 'washer', loadSize: 'large' })).toMatchObject({ bold: 'large, very dirty', he: 'without' })
  const sheets = question({ product: { supplyId: 'bounce' as never, name: 'Bounce', use: 'dryer_sheets', measure: { kind: 'count', countUnit: 'sheet' } } })
  expect(labelQuestionParts(sheets, { stage: 'dryer' })).toMatchObject({ lead: 'Grab the Bounce box.', before: 'How many sheets does it say to use', bold: null })
})

const render = (card: PlanQuestion, extra: { loadSize?: 'large'; eyebrow?: string; next?: string; docked?: boolean } = {}) =>
  renderToStaticMarkup(<QuestionCard question={card} nameOf={nameOf} pending={false} onAction={() => undefined} {...extra} />)

test('every card asks one plain question with big answers and a way to leave it out', () => {
  const tag = render(question({ kind: 'care_unknown', key: { kind: 'care_unknown', subjectId: 'silk', context: {} }, subjectIds: ['silk'], context: {} }))
  expect(tag).toContain('Check the tag inside Silk blouse.')
  expect(tag).toContain('Leave it out this time')

  const dry = render(question({ kind: 'dry_clean_only', key: { kind: 'dry_clean_only', subjectId: 'blazer', context: {} }, subjectIds: ['blazer'], context: {} }))
  expect(dry).toContain('Navy blazer is dry clean only.')
  expect(dry).toContain('Move to dry cleaning')

  const soil = render(question({ kind: 'soil_level', key: { kind: 'soil_level', subjectId: 'load-001', context: {} }, subjectIds: ['jersey', 'socks'] }))
  expect(soil).toContain('How dirty is each of these? Tide’s label changes with it.')
  expect(soil).toContain('aria-label="Soccer jersey"')
  expect(soil).toContain('aria-label="Socks"')
  expect(soil.match(/>Very dirty</g)).toHaveLength(2)

  const logo = render(question({ kind: 'washer_he', key: { kind: 'washer_he', subjectId: 'washer', context: {} }, machine: { machineId: 'washer' as never, name: 'Washer 2' } }))
  expect(logo).toContain('Does Washer 2 have this logo? Check the lid, door rim or panel.')
  expect(logo).toMatch(/>Yes<.*>No<.*>Can’t tell</)
  // "Can't tell" is this card's way out.
  expect(logo).not.toContain('Leave it out this time')

  const label = render(question(), { eyebrow: 'One question first' })
  expect(label).toContain('One question first')
  expect(label).toContain('Grab the Tide bottle. What does the back say for a <strong>very dirty</strong> load')
  // Step one: the lines and a quiet way out. Same-for-every-load is asked once a line is picked.
  expect(label).toContain('The label doesn’t say')
  expect(label).toContain('Type what’s printed')
  expect(label).not.toContain('Same amount for every load?')
  expect(label).toMatch(/aria-label="Which line does the bottle say\?"/)

  // No saved marks: step two is unreachable, so the depends answer stays in the quiet rows.
  const noMarks = render(question({ product: { supplyId: 'tide' as never, name: 'Tide', use: 'detergent', measure: null } }))
  expect(noMarks).toContain('Depends on load size')
  expect(noMarks).toContain('The label doesn’t say')

  const podCard = render(question({ product: { supplyId: 'pods' as never, name: 'Tide pods', use: 'pods', measure: pods }, context: { soilLevel: 'heavy', washerClass: 'he', stage: 'washer' } }))
  expect(podCard).toContain('How many pods for a <strong>very dirty</strong> load in a washer with')
  expect(podCard).toContain('aria-label="How many?"')

  const atMachine = render(question(), { loadSize: 'large' })
  expect(atMachine).toContain('<strong>large, very dirty</strong>')
  expect(atMachine).not.toContain('Depends on load size')
  expect(atMachine).toContain('It’s the same for every load')

  const conflict = render(question({ kind: 'conflicting_rows', rows: [
    { ruleId: 'r1' as never, row: 1, rowText: null, dose: { amount: 1, unit: 'cap', mark: '1' } },
    { ruleId: 'r3' as never, row: 3, rowText: 'Heavily soiled', dose: { amount: 1, unit: 'cap', mark: '3' } },
  ] }))
  expect(conflict).toContain('Two lines on the Tide label fit this load. Which one do you use?')
  expect(conflict).toContain('Line 1')
  expect(conflict).toContain('“Heavily soiled”')
  expect(conflict.match(/role="radio"/g)).toHaveLength(2)

  for (const markup of [tag, dry, soil, logo, label, podCard, atMachine, conflict]) assertPlainCopy(markup)
})

test('identical garments share one tag card and wait for an answer', () => {
  const tags = render(question({ kind: 'care_unknown', key: { kind: 'care_unknown', subjectId: 'socks', context: {} }, subjectIds: ['socks', 'socks-2', 'socks-3'], context: {} }), { next: 'next question', docked: true })
  expect(tags).toContain('Check the tag inside one Socks (×3).')
  expect(tags).toContain('One answer covers all 3.')
  // Docked at the bottom in the pass; nothing is picked, so it says so and cannot be tapped.
  expect(tags).toContain('class="task-footer"')
  expect(tags).toMatch(/<button[^>]*disabled=""[^>]*>Pick an answer<\/button>/)
  // At the machine it sits in the card.
  const inline = render(question())
  expect(inline).not.toContain('primary-dock')
  expect(inline).toMatch(/<button[^>]*aria-expanded="false"[^>]*>Type what’s printed/)
  for (const markup of [tags, inline]) assertPlainCopy(markup)
})

test('a chosen answer leaves the next action readable on the dock', () => {
  const markup = renderToStaticMarkup(<Commit echo="Cold · Do not tumble dry" next="Continue" docked pending={false} onCommit={() => undefined} />)
  expect(markup).toContain('>Continue</button>')
  expect(markup).not.toContain('Cold · Do not tumble dry')
})

test('the cap line is picked from the bottle’s own marks; a bottle with none offers no lines at all', () => {
  const marked = render(question({ product: { supplyId: 'tide' as never, name: 'Tide', use: 'detergent', measure: { kind: 'cap', marks: [{ label: 'A' }, { label: 'B' }] } } }))
  // Drawn top to bottom, exactly as printed.
  expect(marked).toMatch(/role="radio"[^>]*aria-checked="false"/)
  expect(marked.indexOf('>B</span>')).toBeGreaterThan(0)
  expect(marked.indexOf('>B</span>')).toBeLessThan(marked.indexOf('>A</span>'))
  expect(marked).not.toMatch(/>5</)
  const bare = render(question({ product: { supplyId: 'tide' as never, name: 'Tide', use: 'detergent', measure: { kind: 'cap', marks: [] } } }))
  expect(bare).toContain('No marks are saved for this bottle yet, so there are no lines to pick.')
  expect(bare).not.toContain('Which line does the')
  expect(bare).toContain('The label doesn’t say')
  expect(doseEcho({ amount: 1, unit: 'cap', mark: '3' })).toBe('Use line 3')
  expect(doseEcho({ amount: 1, unit: 'scoop', mark: 'Max' })).toBe('Use the Max mark')
  expect(doseEcho({ amount: 2, unit: 'pod' })).toBe('Use 2 pods')
  expect(doseEcho({ amount: 1, unit: 'pod' })).toBe('Use 1 pod')
})
