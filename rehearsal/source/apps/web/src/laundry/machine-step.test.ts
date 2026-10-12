import { ConvexError } from 'convex/values'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'

import { machineStepText } from '@/copy'
import type { Machine } from '@/household/inventory-types'
import { StepBlock, StepChoiceList, answerFullness, drumFullnessLocally, dryerChoices, reviewSwipe, stepView, waitsForFullness, whyLabel, type MachineFacts, type MachineStepAction } from '@/laundry/machine-step'

test('review swipes require a deliberate horizontal gesture', () => {
  expect(reviewSwipe(60, 10)).toBe('previous')
  expect(reviewSwipe(-60, 10)).toBe('next')
  expect(reviewSwipe(20, 0)).toBeNull()
  expect(reviewSwipe(60, 80)).toBeNull()
})

test('step progress labels its own instruction count and falls back safely for unknown counts', () => {
  const render = (progress: string) => renderToStaticMarkup(createElement(StepBlock, { titleId: 'step', eyebrow: 'Before clothes', title: 'Pour into the empty drum', progress }))
  expect(render('2 of 5')).toContain('Step 2 of 5')
  expect(render('2 of 5')).toContain('repeat(5, minmax(0, 1fr))')
  expect(render('unknown')).not.toContain('grid-template-columns')
  expect(render('0 of 5')).not.toContain('grid-template-columns')
})

const facts: MachineFacts = {
  doorLocks: true,
  cycle: 'normal',
  cycleMinutes: 34,
  washerName: 'Speed Queen washer 3',
  drying: { status: 'ready', dryerName: 'Speed Queen dryer 2', heat: 'low', heatLabel: 'Low Temp', minutes: 45 },
}

const task = (name: string, extra: Partial<MachineStepAction> = {}): MachineStepAction => ({
  id: name, kind: 'task', task: name, phase: name, title: 'Load the 6 garments', detail: null, supplyId: '', supplyName: null, dose: null, placement: '', ...extra,
})

const dose = (extra: Partial<MachineStepAction> = {}): MachineStepAction => ({
  id: 'tide', kind: 'treatment', phase: 'dispenser', supplyId: 'tide', supplyName: 'Tide Original', dose: { amount: 1, unit: 'cap', mark: 'Line 3' }, placement: 'detergent_compartment', ...extra,
})

test('the washer steps read in the order you do them, each with one button', () => {
  expect(stepView(task('load'), facts)).toMatchObject({ kind: 'task', eyebrow: 'Clothes', title: 'Put the clothes in', primary: 'They’re in' })
  expect(stepView(task('drum_fullness'), facts)).toMatchObject({ kind: 'fullness', machine: 'washer', title: 'How full is the drum?' })
  expect(stepView(dose(), facts)).toMatchObject({ kind: 'dose', title: 'Tide Original', primary: 'Done' })
  expect(stepView(task('close'), facts)).toMatchObject({ title: 'Close the door', primary: 'The door is closed' })
  expect(stepView(task('start'), facts)).toMatchObject({ title: 'Press Start', figure: '34 min', note: 'Normal', primary: 'I’ve started Speed Queen washer 3' })
})

test('a pretreatment identifies its garment before loading rather than a washer compartment', () => {
  expect(stepView(dose({ phase: 'drum', placement: 'manual', textileId: 'shirt', textileName: 'Cotton shirt', temperatureC: 20, timing: 'Test label directions' }), facts)).toMatchObject({
    kind: 'dose', note: 'Apply to Cotton shirt before loading',
  })
})

test('preparation shows the accepted setting before Start while retaining the door instruction', () => {
  const accepted = { ...facts, preparationSettings: 'normal cycle, 30 °C' }
  expect(stepView(task('close', { detail: 'It stays locked until the cycle ends.' }), accepted)).toMatchObject({
    eyebrow: 'Settings', title: 'Choose Normal cycle, 30 °C', note: 'Then close the door. It stays locked until the cycle ends.', primary: 'Done · next step',
  })
  expect(stepView(task('close'), { ...accepted, doorLocks: false })).toMatchObject({ note: 'Then close the lid.' })
  expect(stepView(task('close'), { ...facts, preparationSettings: ' ' })).toMatchObject({ title: 'Close the door' })
  expect(stepView(task('start', { detail: 'Normal · 30°C · $2.50 recorded wash price' }), facts)).toMatchObject({ note: 'Normal · 30°C · $2.50 recorded wash price' })
})

test('Start without a recorded cycle time says to tap when it is done, and invents no minutes', () => {
  expect(stepView(task('start'), { ...facts, cycleMinutes: null })).toMatchObject({ figure: null, note: 'Normal · No cycle time on record: tap when it’s done.' })
})

test('a dose that waits for how full the drum is asks that first; one into the empty drum asks it ahead', () => {
  const waiting = dose({ dose: { amount: 0, unit: 'at_machine' } })
  expect(waitsForFullness(waiting)).toBe(true)
  expect(stepView(waiting, facts)).toMatchObject({ kind: 'fullness', title: 'How full is the drum?', note: 'Tide Original' })
  expect(stepView({ ...waiting, phase: 'drum' }, facts).title).toBe('How full will the drum be?')
  expect(waitsForFullness(dose())).toBe(false)
})

test('the dryer: pull out the hang items, the heat in the dryer’s own words, then All dry', () => {
  const garments = [{ textileId: 'a', method: 'line_dry' }, { textileId: 'b', method: 'dry_flat' }]
  expect(stepView(task('hold_out', { garments }), facts)).toMatchObject({ eyebrow: 'Hang', title: 'Pull out the hang items', note: '2 laundry items stay out of the dryer', primary: 'They’re out' })
  expect(stepView(task('dryer_load', { garments: [garments[0]!] }), facts)).toMatchObject({ title: 'Into the dryer', note: '1 laundry item' })
  expect(stepView(task('dryer_fullness'), facts)).toMatchObject({ kind: 'fullness', machine: 'dryer', title: 'How full is the dryer?' })
  expect(stepView(task('dryer_start'), facts)).toMatchObject({ title: 'Start the dryer', figure: 'Low Temp', note: '45 min', primary: 'Dryer started' })
  expect(stepView(task('dryer_unload'), facts)).toMatchObject({ title: 'Collect from the dryer', primary: 'All dry' })
})

test('a dryer without its own heat words falls back to plain heat, and without minutes asks for a dryness check', () => {
  const plain = { ...facts, drying: { ...facts.drying!, heatLabel: null, minutes: null } }
  expect(stepView(task('dryer_start'), plain)).toMatchObject({ figure: 'Low heat', note: 'Finish time not recorded. Check dryness when it finishes.' })
})

test('a load that only hangs says to take it out and hang it', () => {
  expect(stepView(task('hold_out'), { ...facts, drying: { ...facts.drying!, status: 'none' } })).toMatchObject({ title: 'Take it out and hang it', primary: 'It’s hanging' })
})

const machine = (machineId: string, name: string, applianceType = 'tumble_dryer', archived = false) =>
  ({ machineId, name, applianceType, location: 'shared', archived, heatSettings: [], supportedCycles: [], placements: [], cycleMinutes: {} }) as unknown as Machine

test('Which dryer? offers the planned dryer and its identical siblings, and nothing when there is one', () => {
  const machines = [machine('d1', 'Speed Queen dryer 1'), machine('d2', 'Speed Queen dryer 2'), machine('w1', 'Speed Queen washer 1', 'front_load_washer'), machine('d3', 'Speed Queen dryer 3', 'tumble_dryer', true)]
  expect(dryerChoices('d1', machines).map((entry) => entry.machineId)).toEqual(['d1', 'd2'])
  expect(dryerChoices('d1', [machine('d1', 'Dryer')])).toEqual([])
  expect(dryerChoices(null, machines)).toEqual([])
})

function storeWith(detail: Record<string, unknown>) {
  let value: unknown = detail
  const store = { getQuery: () => value, setQuery: (_query: unknown, _args: unknown, next: unknown) => { value = next }, getAllQueries: () => [] }
  return { store: store as unknown as Parameters<typeof drumFullnessLocally>[0], read: () => value as { drumFullness: unknown; dryerFullness: unknown; actions: Array<Record<string, unknown> & { id: string; status: string }> } }
}

const candidate = (size: string, amount: number, ruleId = `r-${size}`) => ({ size, ruleId, row: null, rowText: `${size} load`, dose: { amount, unit: 'cap', mark: 'Line 1' } })
const waitingDose = (id: string, machine: 'washer' | 'dryer', candidates: unknown[]) => ({
  id, kind: 'treatment', phase: machine === 'washer' ? 'dispenser' : 'dryer_drum', status: 'pending', supplyId: id,
  dose: { amount: 0, unit: 'at_machine' }, atMachine: { machine, context: {}, candidates },
})
const fullnessDetail = () => ({
  drumFullness: null,
  dryerFullness: null,
  actions: [
    { id: 'load', kind: 'task', task: 'load', status: 'confirmed' },
    { id: 'drum', kind: 'task', task: 'drum_fullness', status: 'pending' },
    waitingDose('tide', 'washer', [candidate('small', 1), candidate('large', 2)]),
    waitingDose('oxi', 'washer', [candidate('large', 1, 'a'), candidate('large', 2, 'b')]),
    { id: 'dryer', kind: 'task', task: 'dryer_fullness', status: 'pending' },
    waitingDose('sheets', 'dryer', [candidate('large', 2)]),
  ],
})
const fullnessSession = 's1' as Parameters<typeof drumFullnessLocally>[1]['sessionId']

test('how full the drum is shows at once with no signal: the step moves on and a dose with one row at that size appears', () => {
  const { store, read } = storeWith(fullnessDetail())
  drumFullnessLocally(store, { sessionId: fullnessSession, machine: 'washer', size: 'large' })
  const after = read()
  expect(after.drumFullness).toBe('large')
  expect(after.dryerFullness).toBeNull()
  const byId = new Map(after.actions.map((action) => [action.id, action]))
  expect(byId.get('drum')?.status).toBe('confirmed')
  expect(byId.get('tide')).toMatchObject({ status: 'pending', dose: { amount: 2, unit: 'cap' }, atMachine: { resolvedSize: 'large', lineText: 'large load' } })
  // Two rows fit: nothing is guessed, it waits for the server's question.
  expect(byId.get('oxi')).toMatchObject({ dose: { amount: 0, unit: 'at_machine' } })
  expect((byId.get('oxi')?.atMachine as { resolvedSize?: string }).resolvedSize).toBeUndefined()
  // The dryer is its own question.
  expect(byId.get('dryer')?.status).toBe('pending')
  expect(byId.get('sheets')).toMatchObject({ dose: { unit: 'at_machine' } })
})

test('picking a different size before Start puts a dose no row fits back to waiting', () => {
  const { store, read } = storeWith(fullnessDetail())
  drumFullnessLocally(store, { sessionId: fullnessSession, machine: 'washer', size: 'large' })
  drumFullnessLocally(store, { sessionId: fullnessSession, machine: 'washer', size: 'medium' })
  const tide = read().actions.find((action) => action.id === 'tide')
  expect(read().drumFullness).toBe('medium')
  expect(tide).toMatchObject({ dose: { amount: 0, unit: 'at_machine' } })
  expect((tide?.atMachine as { resolvedSize?: string }).resolvedSize).toBeUndefined()
})

test('how full the dryer is settles only the dryer\'s doses', () => {
  const { store, read } = storeWith(fullnessDetail())
  drumFullnessLocally(store, { sessionId: fullnessSession, machine: 'dryer', size: 'large' })
  const byId = new Map(read().actions.map((action) => [action.id, action]))
  expect(read().dryerFullness).toBe('large')
  expect(byId.get('dryer')?.status).toBe('confirmed')
  expect(byId.get('drum')?.status).toBe('pending')
  expect(byId.get('sheets')).toMatchObject({ dose: { amount: 2, unit: 'cap' } })
  expect(byId.get('tide')).toMatchObject({ dose: { unit: 'at_machine' } })
})

test('a "How full?" answer the server refuses hands the reason to the screen, which outlives the step', async () => {
  const events: string[] = []
  await answerFullness(() => Promise.reject(new ConvexError({ code: 'conflict', message: 'The machine has already started' })), {
    answered: () => events.push('answered'),
    refused: (reason) => events.push(`refused ${reason}`),
  })
  // The earlier reason is cleared when the answer is sent, then the new one arrives.
  expect(events).toEqual(['refused null', 'refused The machine has already started'])

  const accepted: string[] = []
  await answerFullness(() => Promise.resolve({ steps: [] }), {
    answered: (steps) => accepted.push(`answered ${steps.length}`),
    refused: (reason) => accepted.push(`refused ${reason}`),
  })
  expect(accepted).toEqual(['refused null', 'answered 0'])
})

test('departures and recovery are one quiet "Something different?" row, omitted when there are none', () => {
  const choice = (key: string, label: string) => ({ key, label, onClick: () => {} })
  const html = renderToStaticMarkup(createElement(StepBlock, {
    titleId: 'step', eyebrow: 'Detergent', title: 'Tide Original',
    primary: { label: 'Done · next step', onClick: () => {} },
    options: [choice('amount', 'Used a different amount'), choice('skip', 'Skip')],
    recovery: [choice('switch', 'Ran out? Switch product'), choice('problem', 'Machine problem?')],
  }))
  expect(html).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*aria-expanded="false"[^>]*>.*Something different\?/)
  expect(html).toContain('id="step-options"')
  // The choices live in the sheet, not on the step; there is no stack of buttons or recovery group.
  expect(html).not.toContain('Ran out? Switch product')
  expect(html).not.toContain('<fieldset')
  expect(html).not.toContain('Step options')

  const bare = renderToStaticMarkup(createElement(StepBlock, { titleId: 'step', eyebrow: 'Start', title: 'Press Start', options: [], recovery: [] }))
  expect(bare).not.toContain('Something different?')
})

test('the sheet lists every option and recovery as one list of rows, each named by its own words', () => {
  const calls: string[] = []
  const choice = (key: string, label: string) => ({ key, label, onClick: () => { calls.push(key) } })
  const choices = [choice('amount', 'Used a different amount'), choice('skip', 'Skip'), choice('switch', 'Ran out? Switch product'), choice('problem', 'Machine problem?')]
  const html = renderToStaticMarkup(createElement(StepChoiceList, { choices, onPick: (picked) => picked.onClick() }))
  expect(html.match(/<li/g)).toHaveLength(4)
  for (const label of ['Used a different amount', 'Skip', 'Ran out? Switch product', 'Machine problem?']) expect(html).toContain(`aria-label="${label}"`)
  expect(html).toContain(machineStepText.hints.amount)
  expect([...choices].map((entry) => html.indexOf(`aria-label="${entry.label}"`))).toEqual([...choices].map((entry) => html.indexOf(`aria-label="${entry.label}"`)).sort((a, b) => a - b))
})

test('the why link is named by what it explains', () => {
  expect(whyLabel({ placement: 'direct_to_drum', phase: 'drum' })).toBe('Why here?')
  expect(whyLabel({ placement: 'direct_to_drum', phase: 'cycle' })).toBe('Why now?')
})
