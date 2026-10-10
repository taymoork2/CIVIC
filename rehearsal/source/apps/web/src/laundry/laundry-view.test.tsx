import { renderToStaticMarkup, renderWithConvex } from '@/test/markup'
import { ConvexError } from 'convex/values'
import { expect, test } from 'vitest'

import type { HubState } from '@/home/hub-state'
import type { Inventory, Textile } from '@/household/inventory-types'
import { emptyPass, type Pass, type PlanLoad, type PlanQuestion, type StoredPlan } from '@/laundry/laundry-pass'
import {
  LaundryView, PlanWasherSheet, WhichWasherSheet, cleanerRowLine, hamperHeading, hamperPiles, hamperRowLine, hamperRowView, hubSummaryLine, laundryPipeline, pileLabel, pipelineStatusLine, tagChecked, householdActions, kindTileLabel, moveRefusalToast, notInLoads, planPass, recomputeArgs, machineNumber, startedWasherLabel, washerChoices, washerTiles, startAtTap, startedLine, opensStartedLoad,
  washCountDelta, hamperIntake, pickedWasher, washerPickKey, type Choosing, type LaundryCalls, type LaundryViewProps,
} from '@/laundry/laundry-view'
import { roomGroups } from '@/household/room-choices'
import { assertPlainCopy, readableText } from '@/kit/test-copy'
import { homeClock } from '@/home/home-clock'
import { AddClothesFlow } from '@/closet/add-clothes'
import { isValidElement, type ComponentProps } from 'react'

const day = 86_400_000
// A Sunday afternoon.
const now = new Date(2026, 8, 27, 15).getTime()

let next = 0
const textile = (overrides: Partial<Textile> = {}): Textile => ({
  textileId: `t${(next += 1)}` as Textile['textileId'],
  name: 'Navy tee',
  color: null,
  colorGroup: 'dark',
  bulkUnits: null,
  firstWash: false,
  status: 'dirty',
  soilLevel: 'normal',
  inLoad: null,
  washCount: 2,
  fromFixture: false,
  kind: 't_shirt',
  wearerId: 'sam' as Textile['wearerId'],
  occasions: null,
  flag: null,
  statusSince: now - 2 * day,
  lastWornAt: null,
  wearsSinceClean: 0,
  lastCleanedAt: null,
  cleanerNote: null,
  cleanerPickupBy: null,
  identity: null,
  guest: false,
  createdAt: now - 90 * day,
  care: null,
  ...overrides,
})

const flag = (overrides: Partial<NonNullable<Textile['flag']>> = {}) => ({ reasons: ['worn'], flaggedBy: 'me', flaggedAt: now - day, ...overrides }) as NonNullable<Textile['flag']>

const jersey = textile({ textileId: 'jersey' as never, name: 'Soccer jersey', soilLevel: 'heavy', flag: flag({ reasons: ['mud_grass'], stainNote: 'left knee', neededBy: now + day, flaggedBy: 'sam-key' }) })
const jeans = textile({ textileId: 'jeans' as never, name: 'Leo’s jeans', kind: 'pants', wearerId: 'leo' as never })
const towel = textile({ textileId: 'towel' as never, name: 'Bath towel', kind: 'towel', colorGroup: 'white', wearerId: null, soilLevel: null })
const silk = textile({ textileId: 'silk' as never, name: 'Silk blouse', kind: 'shirt', care: { washMethod: 'hand_wash' } as never, statusSince: now - 7 * day })
const blazer = textile({ textileId: 'blazer' as never, name: 'Navy blazer', kind: 'suit', status: 'needs_dry_clean' })
const coat = textile({ textileId: 'coat' as never, name: 'Wool coat', kind: 'outerwear', status: 'at_cleaner', statusSince: now - 15 * day, cleanerPickupBy: now + 3 * day })
const ready = textile({ textileId: 'ready' as never, name: 'Work shirt', status: 'clean', soilLevel: null })

const wearers = [
  { wearerId: 'sam', name: 'Sam', kind: 'child', principalKey: 'sam-key' },
  { wearerId: 'leo', name: 'Leo', kind: 'child', principalKey: null },
  { wearerId: 'me', name: 'Alex', kind: 'adult', principalKey: 'me' },
] as unknown as Inventory['wearers']

const inventory = (overrides: Partial<Inventory> = {}): Inventory => ({
  planning: {},
  wearers,
  textiles: [jersey, jeans, towel, silk, blazer, coat, ready],
  supplies: [{ supplyId: 'tide', name: 'Tide', kind: 'detergent', use: 'detergent', measure: { kind: 'cap', marks: [{ label: '1' }, { label: '3' }] }, rules: [{ ruleId: 'r3', row: 3, rowText: 'Heavily soiled' }] }],
  machines: [{ machineId: 'washer', name: 'Washer' }, { machineId: 'dryer', name: 'Dryer' }],
  ...overrides,
}) as unknown as Inventory

// ---- Words ------------------------------------------------------------------------------

test('the hamper heading counts laundry items and, when there is a plan to count from, about how many loads', () => {
  expect(hamperHeading({ count: 14, loads: 2 })).toBe('14 laundry items · about 2 loads')
  expect(hamperHeading({ count: 1, loads: 1 })).toBe('1 laundry item · about 1 load')
  expect(hamperHeading({ count: 14, loads: null })).toBe('14 laundry items')
  expect(hamperHeading({ count: 0, loads: null })).toBe('The hamper is empty')
})

test('a hamper row says how dirty, what happened, when it is needed and who flagged it', () => {
  const row = hamperRowView(jersey, now, wearers, 'me')
  expect(row).toEqual({ name: 'Soccer jersey', soil: 'heavy', what: 'grass or mud, left knee', from: 'from Sam', neededBy: 'tomorrow' })
  expect(hamperRowLine(row)).toBe('Soccer jersey · Very dirty · grass or mud, left knee · needed tomorrow · from Sam')
  // Never "from" the person looking, nor from someone who is not a wearer here.
  expect(hamperRowView(jersey, now, wearers, 'sam-key').from).toBeNull()
  expect(hamperRowView({ ...jersey, flag: flag({ flaggedBy: 'stranger' }) }, now, wearers, 'me').from).toBeNull()
  expect(hamperRowLine(hamperRowView(towel, now, wearers, 'me'))).toBe('Bath towel')
  // Overdue still reads today.
  expect(hamperRowView({ ...jersey, flag: flag({ neededBy: now - 2 * day }) }, now, wearers, 'me').neededBy).toBe('today')
})

test('identical garments make one pile with a count, the dirtiest soil and how many tags are unread', () => {
  const tee = (id: string, overrides: Partial<Textile> = {}) => textile({ textileId: id as never, name: 'Black tee', color: 'black', colorGroup: 'dark', kind: 't_shirt', soilLevel: 'normal', ...overrides })
  const machineCare = { status: 'confirmed', washMethod: 'machine', dryMethod: 'tumble_dry', restrictions: [] } as never
  const rows = [
    tee('t1', { care: machineCare }),
    tee('t2', { care: machineCare, soilLevel: 'heavy', flag: flag({ neededBy: now + 3 * day }) }),
    tee('t3', { name: 'black tee ', care: machineCare, flag: flag({ neededBy: now + day }) }),
    tee('t4', { care: { washMethod: 'machine', restrictions: [] } as never }),
    textile({ textileId: 'j1' as never, name: 'Jeans', kind: 'pants', soilLevel: 'light', care: { status: 'confirmed', washMethod: 'dry_clean_only', restrictions: [] } as never }),
  ]
  const [tees, jeans] = hamperPiles(rows, now, wearers, 'me')
  expect(tees).toMatchObject({ name: 'Black tee', count: 4, textileIds: ['t1', 't2', 't3', 't4'], soil: 'heavy', soilSame: false, tagUnchecked: 1, neededBy: 'tomorrow' })
  expect(pileLabel(tees!)).toBe('Black tee, 4, Very dirty, 1 tag not checked, worn or used, needed tomorrow')
  expect(jeans).toMatchObject({ count: 1, soil: 'light', soilSame: true, tagUnchecked: 0 })
  expect(pileLabel(jeans!)).toBe('Jeans, A little, tag checked')
})

test('a tag counts as read only with a way to wash, and for the machine a dryer answer', () => {
  expect(tagChecked(null)).toBe(false)
  expect(tagChecked({ washMethod: 'unknown' } as never)).toBe(false)
  expect(tagChecked({ washMethod: 'machine' } as never)).toBe(false)
  expect(tagChecked({ washMethod: 'machine', dryMethod: 'unknown' } as never)).toBe(false)
  expect(tagChecked({ status: 'needs_confirmation', washMethod: 'machine', dryMethod: 'line_dry' } as never)).toBe(false)
  expect(tagChecked({ status: 'confirmed', washMethod: 'machine', dryMethod: 'line_dry' } as never)).toBe(true)
  expect(tagChecked({ status: 'confirmed', washMethod: 'dry_clean_only' } as never)).toBe(true)
})

test('a waiting group shows its selected wash quantity and inline Laundry preparation', () => {
  const tees = ['a', 'b', 'c'].map((id) => textile({ textileId: id as never, name: 'Black tee', kind: 't_shirt', soilLevel: 'normal' }))
  const markup = render({
    inventory: inventory({ textiles: tees }),
    draft: { selectedTextileIds: ['a', 'b'], seenTextileIds: ['a', 'b', 'c'] },
    initialSheet: { kind: 'garment', textileIds: ['a', 'b', 'c'] },
  })
  expect(markup).toContain('Black tee')
  expect(markup).toContain('Wash now')
  expect(markup).toContain('2 of 3')
  expect(markup).toContain('2 items selected. Anything you don’t choose stays in the hamper.')
  expect(markup).toContain('Add stains or a note')
  expect(markup).not.toContain('Save care details')
  expect(markup).not.toContain('Update care details')
  expect(markup).toContain('Remove from hamper')
  expect(markup).not.toContain('How many go in this time?')
  assertPlainCopy(markup)
})

test('changing a wash count keeps existing picks and changes only the difference', () => {
  expect(washCountDelta(['a', 'b', 'c'], ['a', 'c'], 1)).toEqual({ ids: ['c'], setAside: true })
  expect(washCountDelta(['a', 'b', 'c'], ['a', 'c'], 3)).toEqual({ ids: ['b'], setAside: false })
})

test('a row at the cleaner says since when and the pick-up day', () => {
  expect(cleanerRowLine(coat, now)).toBe('Wool coat · since Sep 12 · pick up Wed')
  expect(cleanerRowLine({ ...coat, cleanerPickupBy: null }, now)).toBe('Wool coat · since Sep 12')
})

const load = (overrides: Partial<PlanLoad> = {}): PlanLoad => ({
  id: 'load-001', textileIds: ['jeans'], owners: [], bulkUnits: 1, capacityUnits: 14, machineId: 'washer', machineModelId: null, cycle: 'normal', temperatureC: 30,
  treatments: [{ supplyId: 'tide', dose: { amount: 1, unit: 'cap', mark: '3' }, measurementCue: null, stage: 'main_wash', placement: 'detergent_compartment', timing: null, rationale: 'SENTINEL rationale', source: 'SENTINEL source', confirmation: 'confirmed', marks: ['1', '3'], ruleId: 'r3' }],
  status: 'ready', loadSize: null, soilLevel: 'normal', washerClass: null, drying: null,
  ...overrides,
}) as PlanLoad


const reason = (id: string, code: string, details: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ id, code, priority: 1, textileIds: [], details: { ...details, message: 'SENTINEL message' }, ...extra })

test('not in these loads: each garment with plain words, and what the household needs to add', () => {
  const result = {
    exclusions: [
      { textileId: 'blazer', reasonIds: ['veto'], reasonCodes: [] },
      { textileId: 'gone', reasonIds: ['odd', 'big'], reasonCodes: [] },
      { textileId: 'jeans', reasonIds: ['odd'], reasonCodes: [] },
    ],
    reasons: [
      reason('veto', 'care_prohibition', { method: 'dry_clean_only' }),
      reason('odd', 'something_new', {}),
      reason('big', 'capacity_limit', { cause: 'textile_exceeds_all_machine_capacity' }),
      reason('washer', 'needs_confirmation', { cause: 'insufficient_machine_evidence' }),
      reason('product', 'needs_confirmation', { cause: 'insufficient_product_evidence' }),
      reason('again', 'needs_confirmation', { cause: 'insufficient_machine_evidence' }),
    ],
  } as unknown as StoredPlan['result']
  const names = { garment: (id: string) => ({ blazer: 'Navy blazer', jeans: 'Leo’s jeans' })[id] ?? 'Guest item', product: () => null }
  expect(notInLoads(result, names)).toEqual([
    { textileId: 'blazer', text: 'Navy blazer: Dry clean only' },
    { textileId: 'gone', text: 'Guest item: Too big for the washer' },
    { textileId: 'jeans', text: 'Leo’s jeans: Needs a closer look' },
  ])
  expect(householdActions(result.reasons)).toEqual([{ kind: 'add_washer', label: 'Add a washer' }, { kind: 'add_product', label: 'Add a product' }])
})

test('a refused move gives its plain reason; an honoured one says nothing', () => {
  const reasons = [reason('r', 'pin_refused', { cause: 'care_cycle', group: 2, loadCycle: 'normal', loadTemperatureC: 40 }, { textileIds: ['sweater'] })] as unknown as StoredPlan['result']['reasons']
  expect(moveRefusalToast(reasons, 'sweater', 2, 'wool sweater')).toBe("The wool sweater can't go in a warm, normal load")
  expect(moveRefusalToast(reasons, 'sweater', 1, 'wool sweater')).toBeNull()
})

test('every recompute in a pass sends its selection and pass; a new Make loads sends none of the pass', () => {
  const pass: Pass = {
    mode: 'normal',
    loadPins: [{ textileId: 'jeans' as never, group: 1 }],
    dismissedQuestions: [{ kind: 'label_row', subjectId: 'tide', context: { soilLevel: 'heavy' }, answer: 'label_doesnt_say' }, { kind: 'label_row', subjectId: 'gone', context: {}, answer: 'depends_on_size' }],
    excludedSupplyIds: [],
  }
  const stored = { textileIds: ['jersey', 'jeans', 'ready'], pass, result: { loads: [], exclusions: [] } } as unknown as StoredPlan
  const { selection, pass: carried } = planPass(stored)
  const args = recomputeArgs('h1', selection, carried, inventory(), 'hash')
  // Only garments still waiting in the hamper; answers about a product that is gone are dropped.
  expect(args).toEqual({
    householdId: 'h1',
    selectedTextileIds: ['jersey', 'jeans'],
    clientInputHash: 'hash',
    loadPins: [{ textileId: 'jeans', group: 1 }],
    dismissedQuestions: [{ kind: 'label_row', subjectId: 'tide', context: { soilLevel: 'heavy' }, answer: 'label_doesnt_say' }],
  })
  // Make loads again: a new pass, so a question set aside last time is asked again.
  expect(recomputeArgs('h1', selection, emptyPass, inventory(), 'make-loads')).toEqual({ householdId: 'h1', selectedTextileIds: ['jersey', 'jeans'], clientInputHash: 'make-loads' })
  expect(recomputeArgs('h1', ['ready', 'silk'], emptyPass, inventory(), 'hash')).toBeNull()
  // A plan stored before selections were kept is planned again from its own garments.
  expect(planPass({ textileIds: null, pass: emptyPass, result: { loads: [{ textileIds: ['jeans'] }], exclusions: [{ textileId: 'jersey' }] } } as unknown as StoredPlan).selection).toEqual(['jeans', 'jersey'])
})

// ---- The screen ----------------------------------------------------------------------------

const never = async () => {
  throw new Error('not in a static render')
}
const calls = new Proxy({}, { get: () => never }) as unknown as LaundryCalls

/** A plan whose planner sentences are sentinels: none of them may reach the screen. */
const storedPlan = (overrides: Partial<StoredPlan> = {}, loads: PlanLoad[] = [load(), load({ id: 'load-002', textileIds: ['jersey'], soilLevel: 'heavy' })]): StoredPlan => ({
  loadStates: loads.map((entry) => ({ loadId: entry.id, startable: true, blockingReasonIds: [], blockedItems: [], sessionId: null, confirmedMachineId: null })),
  planId: 'p1',
  householdId: 'h1',
  status: 'ready',
  plannerVersion: 'planner-v2.1',
  inputHash: 'hash',
  textileIds: ['jersey', 'jeans', 'towel'],
  pass: emptyPass,
  machines: [{ machineId: 'washer', name: 'Washer', location: 'home', pricePerStart: null, applianceType: 'front_load_washer' }],
  createdAt: now,
  result: {
    plannerVersion: 'planner-v2.1',
    mode: 'normal',
    inputSnapshot: {},
    inputHash: 'hash',
    status: 'ready',
    loads,
    exclusions: [{ textileId: 'towel', reasonIds: ['big'], reasonCodes: ['capacity_limit'] }],
    cost: { currency: 'USD', washer: 0, dryer: 0, supplies: 0, total: 0 },
    warnings: ['SENTINEL warning'],
    reasons: [reason('big', 'capacity_limit', { cause: 'textile_exceeds_all_machine_capacity' }, { textileIds: ['towel'] }), reason('sep', 'preference_applied', { cause: 'soil_separation' }, { loadId: 'load-002' })],
    explanations: [{ reasonId: 'big', code: 'capacity_limit', text: 'SENTINEL explanation' }],
  },
  ...overrides,
}) as unknown as StoredPlan

const labelQuestion = { kind: 'label_row', key: { kind: 'label_row', subjectId: 'tide', context: { soilLevel: 'heavy' } }, subjectIds: [], context: { loadId: 'load-002', soilLevel: 'heavy', stage: 'washer' }, product: { supplyId: 'tide', name: 'Tide', use: 'detergent', measure: { kind: 'cap', marks: [{ label: '1' }, { label: '3' }] } } } as unknown as PlanQuestion
const logoQuestion = { kind: 'washer_he', key: { kind: 'washer_he', subjectId: 'washer', context: {} }, subjectIds: [], context: { stage: 'washer' }, machine: { machineId: 'washer', name: 'Washer' } } as unknown as PlanQuestion

test('a blocked wash shows each problem under its source with that source\'s actions, and left-out garments as rows', () => {
  const plan = storedPlan({
    loadStates: [
      { loadId: 'load-001', startable: true, blockingReasonIds: [], blockedItems: [], sessionId: null, confirmedMachineId: null },
      { loadId: 'load-002', startable: false, blockingReasonIds: ['restrict'], blockedItems: [{ reasonId: 'restrict', source: { kind: 'product', id: 'tide' }, kind: 'conflict', blocking: true, textileIds: ['jersey'] }], sessionId: null, confirmedMachineId: null },
    ],
    excludedItems: [{ reasonId: 'big', source: { kind: 'garment', id: 'towel' }, kind: 'confirm', blocking: false, textileIds: ['towel'] }],
    result: { ...storedPlan().result, reasons: [...storedPlan().result.reasons, reason('restrict', 'product_restriction', { cause: 'garment_product_conflict' }, { loadId: 'load-002' })] },
  } as never)
  const markup = render({ planId: 'p1', plan, questions: [] })
  expect(readableText(markup)).toContain('1 to resolve before washing')
  expect(markup).toContain('can&#x27;t be used with Soccer jersey')
  expect(markup).toContain('Use another product')
  expect(markup).toContain('Leave Soccer jersey out')
  expect(readableText(markup)).toContain('1 of 1 to resolve')
  expect(markup).toContain('Too big for the washer')
  expect(markup).not.toMatch(/override/i)
  assertPlainCopy(markup)
})

const render = (overrides: Partial<LaundryViewProps> = {}, privateQueries = false) => (privateQueries ? renderWithConvex : renderToStaticMarkup)(
  <LaundryView
    now={now}
    householdId="h1"
    viewerKey="me"
    inventory={inventory()}
    hamper={{ count: 3, loads: 2 }}
    draft={null}
    onDraft={() => undefined}
    planId={null}
    plan={undefined}
    questions={undefined}
    calls={calls}
    onPlan={() => undefined}
    onSession={() => undefined}
    {...overrides}
  />,
)

const sentinels = /SENTINEL/

test('the load review mounts one main optional-product display with a private loading fallback', () => {
  const addition = { supplyId: 'boost', status: 'unknown', compatibility: 'unknown', reason: 'Exact optional benefit unknown.', evidence: [], policyVersion: '1' } as const
  const plan = storedPlan({}, [load({ productRecommendations: [addition] })])
  const output = render({ planId: 'p1', plan, questions: [], inventory: inventory({ supplies: [...inventory().supplies, { supplyId: 'boost', name: 'Optional booster' } as never] }) }, true)
  expect(output.match(/Any extra product\?/g)).toHaveLength(1)
  expect(output).toContain('Loading private suggestions. Showing recorded product evidence.')
  expect(output).toContain('Use Optional booster')
  expect(output).toContain('Compare Optional booster')
  expect(output).toContain('Added only when selected, after checking the label, dose and compatibility.')
  expect(output).not.toContain('Reported improvement')
  expect(plan.result.loads[0]!.treatments).toEqual(load().treatments)
})

test('Laundry shows counted garment controls and preserves hand-wash and dry-cleaning routes', () => {
  const markup = render()
  const words = readableText(markup)
  expect(markup).toMatch(/<h1[^>]*>Laundry<\/h1>/)
  expect(markup).toContain('aria-label="Plan your wash"')
  expect(words).toContain('3 pieces selected')
  expect(words).toContain('In the hamper')
  expect(words).toContain('Soccer jersey 1 of 1 selected · needed tomorrow')
  expect(markup).toContain('aria-label="Fewer Soccer jersey"')
  expect(words).toContain('Hand wash (1) Silk blouse')
  expect(words).toContain('Washed by hand')
  expect(words).toContain('Needs to go (1)')
  expect(words).toContain('At the cleaner (1)')
  expect(markup).toMatch(/<button[^>]*>Sort 3 pieces into loads<\/button>/)
  expect(words).not.toContain('Wash now')
  assertPlainCopy(markup)
})

test('unselected clothes stay visible and can be added directly; an empty selection cannot be planned', () => {
  const partial = render({ draft: { selectedTextileIds: ['jersey', 'towel'], seenTextileIds: ['jersey', 'jeans', 'towel'] } })
  expect(readableText(partial)).toContain('Leo’s jeans')
  expect(partial).toContain('aria-label="More Leo’s jeans"')
  expect(readableText(partial)).toContain('0 of 1 selected')
  expect(partial).toContain('aria-label="Fewer Soccer jersey"')
  expect(partial).not.toContain('Skipped this time')
  const none = render({ draft: { selectedTextileIds: [], seenTextileIds: ['jersey', 'jeans', 'towel'] } })
  expect(none).toMatch(/<button[^>]*disabled=""[^>]*>Select pieces to sort/)
  expect(readableText(none)).toContain('0 of 1 selected')
  expect(readableText(none)).toContain('Choose clothes to wash')
  expect(none.match(/aria-label="Fewer [^"]+" disabled=""/g)).toHaveLength(3)
  expect(none).not.toContain('aria-label="Leave Soccer jersey out of this wash"')
  expect(readableText(none)).toContain('In the hamper')
})

test('empty Laundry offers direct intake and existing closet clothes', () => {
  const markup = render({ hamper: { count: 0, loads: null }, inventory: inventory({ textiles: [ready], machines: [], supplies: [] }) })
  expect(markup).toContain('Your hamper is clear')
  expect(markup).not.toContain('data-slot="empty-description"')
  expect(markup).toContain('Add clothes to wash</button>')
  expect(markup).toContain('Choose from closet</a>')
  expect(markup).not.toContain('18 clothes and linens to wash')
  expect(markup).not.toContain('laundry-example')
  expect(markup).not.toContain('setup-list')
  expect(markup).not.toContain('>Flag something dirty</button>')
  // Nothing else competes with the block: no segments, no count, no Plan laundry.
  expect(markup).not.toContain('class="segment"')
  expect(markup).not.toContain('wash-count')
  expect(markup).not.toContain('primary-dock')
  assertPlainCopy(markup)
})

test('the hamper slot opens the staged intake in the hamper, with first run as captured when it opened', () => {
  const slot = hamperIntake('h1', true, () => undefined)
  expect(isValidElement(slot) && slot.type).toBe(AddClothesFlow)
  expect((slot as { props: ComponentProps<typeof AddClothesFlow> }).props).toMatchObject({ householdId: 'h1', mode: { kind: 'add', target: 'hamper' }, firstRun: true })
  // The sheet carries the first-run answer it opened with, in the empty and the filled hamper alike.
  const opened: boolean[] = []
  const addToHamper = (_onClose: () => void, firstRun: boolean) => { opened.push(firstRun); return <p>staged intake</p> }
  const empty = render({ hamper: { count: 0, loads: null }, inventory: inventory({ textiles: [], machines: [], supplies: [] }), initialSheet: { kind: 'add_hamper', firstRun: true }, addToHamper })
  const filled = render({ initialSheet: { kind: 'add_hamper', firstRun: true }, addToHamper })
  for (const markup of [empty, filled]) expect(markup).toContain('<p>staged intake</p>')
  expect(opened).toEqual([true, true])
  render({ initialSheet: { kind: 'add_hamper' }, addToHamper })
  expect(opened.at(-1)).toBe(false)
})

test('empty Laundry keeps the same first action even if machines and products are already saved', () => {
  const markup = render({ hamper: { count: 0, loads: null }, inventory: inventory({ textiles: [], machines: [{ machineId: 'w', name: 'Washer', applianceType: 'front_load_washer' }] as never, supplies: [{ supplyId: 's', name: 'Pods', use: 'pods', archived: false, rules: [] }] as never }) })
  expect(markup).toContain('Your hamper is clear')
  expect(markup).toContain('Add clothes to wash')
  expect(markup).not.toContain('setup-list')
})

test('dry cleaning keeps the hub from being empty: its list shows under the block, with no setup list', () => {
  const markup = render({ initialSheet: { kind: 'browse' }, hamper: { count: 0, loads: null }, inventory: inventory({ textiles: [blazer] }) })
  expect(readableText(markup)).toContain('Needs to go (1) Navy blazer')
  expect(markup).not.toContain('setup-list')
})

test('Laundry keeps garment selection available with each hub state', () => {
  const rows = [
    { sessionId: 's1', machine: 'Washer 2', stage: 'washing' as const, doneAt: now },
    { sessionId: 's2', machine: 'Dryer 1', stage: 'drying' as const, doneAt: null },
  ]
  const hubs: HubState[] = [
    { kind: 'hamper', count: 38, loads: 4 },
    { kind: 'pass', planId: 'p1', number: 1, count: 4, ready: true },
    { kind: 'running', rows, next: null },
    { kind: 'finished', row: { sessionId: 's1', machine: 'Washer 2', stage: 'wash_done', doneAt: now }, toDryer: true, rows: [] },
    { kind: 'drying', count: 7, sessionIds: ['s3'] },
  ]
  for (const hub of hubs) {
    const markup = render({ hub })
    expect(readableText(markup)).toContain('Soccer jersey')
    expect(markup).toContain('aria-label="Fewer Soccer jersey"')
    expect(readableText(markup)).toMatch(/Sort 3 pieces into loads|Sort again/)
    assertPlainCopy(markup)
  }
})

test('dry cleaning: what needs to go and what is at the cleaner, picked with a tap', () => {
  const markup = render({ initialSheet: { kind: 'browse' }, initialSegment: 'dry_cleaning' })
  expect(markup).toContain('Needs to go (1)')
  expect(markup).toContain('At the cleaner (1)')
  expect(markup).toContain('role="checkbox" aria-checked="false"')
  expect(readableText(markup)).toContain('Navy blazer')
  expect(readableText(markup)).toContain('Wool coat since Sep 12 · pick up Wed')
  assertPlainCopy(markup)
})

test('planning opens one load review with its products and washer, without silently answering questions', () => {
  const markup = render({ planId: 'p1', plan: storedPlan(), questions: [labelQuestion, logoQuestion] })
  const words = readableText(markup)
  expect(words).toContain('Darks load')
  expect(words).toContain('Products From saved records Tide')
  expect(words).toContain('Washer Household washer')
  expect(markup).toContain('aria-label="Back to Laundry"')
  expect(markup).not.toContain('Grab the Tide bottle.')
  expect(markup).not.toContain('Does Washer have this logo?')
  expect(markup).not.toMatch(sentinels)
  assertPlainCopy(markup)
  const unknown: PlanQuestion = { kind: 'care_unknown', key: { kind: 'care_unknown', subjectId: 'jersey', context: {} }, subjectIds: ['jersey'], context: {} }
  const waiting = render({ planId: 'p1', plan: storedPlan({ result: { ...storedPlan().result, loads: [] } }), questions: [unknown] })
  expect(readableText(waiting)).toContain('Check care label')
  expect(waiting).not.toContain('Start load')
})

test('the load needed soonest opens first and explains excluded pieces without planner sentences', () => {
  const markup = render({ planId: 'p1', plan: storedPlan(), questions: [] })
  const words = readableText(markup)
  expect(words).toContain('Soccer jersey')
  expect(words).not.toContain('Leo’s jeans')
  expect(words).toContain('Why together: all very dirty')
  expect(words).toContain('Bath towel: Too big for the washer')
  expect(markup).not.toContain('Start load')
  expect(markup).not.toMatch(sentinels)
  assertPlainCopy(markup)
})

test('a pinned arrangement keeps its loads, shown in the wash order Home and the dock number them by', () => {
  const pinned = storedPlan({ pass: { ...emptyPass, loadPins: [{ textileId: 'jeans' as never, group: 1 }, { textileId: 'jersey' as never, group: 2 }] } })
  const words = readableText(render({ planId: 'p1', plan: pinned, questions: [] }))
  // The muddy jersey cannot wait, so its load opens first, as the hub would offer it.
  expect(words).toContain('Soccer jersey')
  expect(words).not.toContain('Leo’s jeans')
  expect(words).toContain('Why together: you put these together')
})

test('a started load opens its session while another load remains ready for the shared room', () => {
  const shared = storedPlan({
    machines: [{ machineId: 'washer', name: 'Machine 12', location: 'shared', pricePerStart: 3, applianceType: 'front_load_washer' }] as never,
    loadStates: [{ loadId: 'load-001', startable: false, startableMachineIds: [], blockingReasonIds: [], blockedItems: [], sessionId: 's1' as never, confirmedMachineId: null }, { loadId: 'load-002', startable: true, startableMachineIds: ['washer'], blockingReasonIds: [], blockedItems: [], sessionId: null, confirmedMachineId: null }],
  })
  const markup = render({ planId: 'p1', plan: shared, questions: [], initialSheet: { kind: 'running', sessionId: 's1' } })
  expect(readableText(markup)).toContain('Soccer jersey')
  expect(readableText(markup)).toContain('I’m at the laundry room')
  expect(markup).not.toMatch(sentinels)
})

test('which washer: only when the load’s washer has identical siblings, numbered as on the machines', () => {
  const washer = (machineId: string, name: string, extra: Record<string, unknown> = {}) => ({ machineId, name, applianceType: 'front_load_washer', location: 'shared', archived: false, heatSettings: [], supportedCycles: ['normal'], placements: ['detergent_compartment'], cycleMinutes: { normal: 40 }, ...extra }) as unknown as Inventory['machines'][number]
  const machines = [washer('w1', 'Speed Queen washer 1'), washer('w2', 'Speed Queen washer 2'), washer('w3', 'Speed Queen washer 3', { archived: true }), washer('home', 'Washer', { location: 'home' }), washer('d1', 'Speed Queen washer 4', { applianceType: 'tumble_dryer' })]
  expect(washerChoices('w2', machines).map((machine) => machine.machineId)).toEqual(['w1', 'w2'])
  expect(washerChoices('home', machines)).toEqual([])
  expect(washerChoices(null, machines)).toEqual([])
  expect(washerChoices('w1', machines.slice(0, 1))).toEqual([])
  expect(machineNumber('Speed Queen washer 3', 0)).toBe('3')
  expect(machineNumber('Speed Queen #12', 0)).toBe('12')
  expect(machineNumber('Washer', 1)).toBe('2')
})

test('which washer: physical order always, "Yours" marked but never blocked', () => {
  const washer = (machineId: string, name: string) => ({ machineId, name, applianceType: 'front_load_washer', location: 'shared', archived: false }) as unknown as Inventory['machines'][number]
  const washers = [washer('w1', 'Speed Queen washer 1'), washer('w2', 'Speed Queen washer 2'), washer('w3', 'Speed Queen washer 3')]
  const now = Date.UTC(2026, 8, 27, 15)
  const row = (machine: string, stage: 'washing' | 'wash_done' | 'drying', doneAt: number | null) => ({ sessionId: `s-${machine}`, machine, stage, doneAt })
  const hub = { kind: 'running' as const, next: null, rows: [row('Speed Queen washer 1', 'washing', now + 34 * 60_000), row('Speed Queen washer 2', 'drying', now + 10 * 60_000)] }
  const tiles = washerTiles(washers, hub, now)
  // Painted order is kept as given, never resorted by availability.
  expect(tiles.map((tile) => [tile.washer.machineId, tile.number, tile.yours])).toEqual([
    ['w1', '1', { left: '34 min left' }],
    ['w2', '2', null],
    ['w3', '3', null],
  ])
  // A finished load still in its washer keeps it marked "Yours" even with no time left to show.
  const finished = { kind: 'finished' as const, row: row('Speed Queen washer 3', 'wash_done', null), toDryer: false, rows: [] }
  expect(washerTiles(washers, finished, now).map((tile) => [tile.washer.machineId, tile.yours])).toEqual([['w1', null], ['w2', null], ['w3', { left: null }]])
  // Yesterday's load, never finished in the app: still marked "Yours", still tappable (nothing is ever locked).
  const stale = { kind: 'running' as const, next: null, rows: [row('Speed Queen washer 1', 'washing', null), row('Speed Queen washer 2', 'washing', null), row('Speed Queen washer 3', 'washing', now - 60_000)] }
  expect(washerTiles(washers, stale, now).every((tile) => tile.yours !== null)).toBe(true)
  expect(washerTiles(washers, undefined, now).every((tile) => tile.yours === null)).toBe(true)
})

test('a plan that changed offers to update the loads with the same garments and answers', () => {
  const markup = render({ planId: 'p1', plan: storedPlan({ status: 'stale' }), questions: [] })
  expect(markup).toContain('>Something changed, tap to update the loads</button>')
  const replaced = render({ planId: 'p1', plan: null, questions: [] })
  expect(replaced).toContain('Something changed, tap to update the loads')
  expect(render({ planId: 'p1', plan: undefined, questions: undefined })).toContain('Loading your loads')
})

test('no washer yet: the pass offers "Add your washer" right there, and the hamper ends with Add dirty clothes', () => {
  const noWasher = storedPlan({}, [])
  const plan = { ...noWasher, result: { ...noWasher.result, exclusions: [], reasons: [reason('washer', 'needs_confirmation', { cause: 'insufficient_machine_evidence' })] } } as unknown as StoredPlan
  const inline = render({ planId: 'p1', plan, questions: [], addWasher: () => null })
  expect(readableText(inline)).toContain('Add your washer')
  expect(inline).not.toContain('href="/household"')
  assertPlainCopy(inline)
  // Without the sheet, the same action links to Household.
  expect(render({ planId: 'p1', plan, questions: [] })).toMatch(/<a class="button secondary" href="\/household">Add a washer<\/a>/)

  // No detergent yet: "Add your detergent" opens the bottle sheet right there.
  const noProduct = { ...plan, result: { ...plan.result, reasons: [reason('product', 'needs_confirmation', { cause: 'insufficient_product_evidence' })] } } as unknown as StoredPlan
  const bottle = render({ planId: 'p1', plan: noProduct, questions: [], addBottle: () => null })
  expect(readableText(bottle)).toContain('Add your detergent')
  expect(bottle).not.toContain('href="/household"')
  assertPlainCopy(bottle)
  expect(render({ planId: 'p1', plan: noProduct, questions: [] })).toMatch(/<a class="button secondary" href="\/household">Add a product<\/a>/)

  expect(render({ addToHamper: () => null })).not.toContain('hamper-add')
})

test('missing setup is shown once while garment and recorded-equipment problems stay visible', () => {
  const base = storedPlan({}, [])
  const plan = { ...base, excludedItems: [
    { reasonId: 'missing-washer', source: { kind: 'washer', id: 'missing-washer' }, kind: 'confirm', blocking: true },
    { reasonId: 'missing-product', source: { kind: 'product', id: 'missing-product' }, kind: 'confirm', blocking: true },
    { reasonId: 'fragile', source: { kind: 'garment', id: 'jeans' }, kind: 'conflict', blocking: true },
  ], result: { ...base.result, exclusions: [{ textileId: 'jeans', reasonIds: ['fragile'], reasonCodes: [] }], reasons: [
    reason('missing-washer', 'needs_confirmation', { cause: 'insufficient_machine_evidence' }),
    reason('missing-product', 'needs_confirmation', { cause: 'insufficient_product_evidence' }),
    reason('fragile', 'care_prohibition', { method: 'dry_clean_only' }, { textileIds: ['jeans'] }),
  ] } } as unknown as StoredPlan
  const markup = readableText(render({ planId: 'p1', plan, questions: [], inventory: inventory({ machines: [], supplies: [] }), addWasher: () => null, addBottle: () => null }))
  expect(markup.match(/Add your washer/g)).toHaveLength(1)
  expect(markup.match(/Add your detergent/g)).toHaveLength(1)
  expect(markup).not.toContain('Add your washer first')
  expect(markup).not.toContain('Add a detergent first')
  expect(markup).toContain('Leo’s jeans')
  expect(markup).toContain('Dry clean only')
  expect(markup).toContain('Not in these washes (1)')
  const recorded = { ...plan, excludedItems: plan.excludedItems!.map((item) => ({ ...item, source: item.source.kind === 'washer' ? { ...item.source, id: 'washer' } : item.source.kind === 'product' ? { ...item.source, id: 'tide' } : item.source })) } as StoredPlan
  const existing = readableText(render({ planId: 'p1', plan: recorded, questions: [] }))
  expect(existing).toContain('Not in these washes (3)')
  expect(existing).toContain('Add your washer first')
  expect(existing).toContain('Confirm Tide’s label first')
})

test('add_washer: the plan row opens the shared appliance editor at where it is and its door', () => {
  const noWasher = storedPlan({}, [])
  const plan = { ...noWasher, result: { ...noWasher.result, exclusions: [], reasons: [reason('washer', 'needs_confirmation', { cause: 'insufficient_machine_evidence' })] } } as unknown as StoredPlan
  const row = readableText(render({ planId: 'p1', plan, questions: [], addWasher: () => null }))
  expect(row).toContain('Start with its door type')
  expect(row).not.toContain('logo')
  const sheet = renderWithConvex(<PlanWasherSheet householdId="h1" savedPlace="home" onClose={() => undefined} onSaved={() => undefined} />)
  expect(sheet).toContain('Front or top loading?')
  // The household washes in one place and the sheet is for a washer: it asks neither where nor washer or dryer.
  expect(sheet).not.toContain('Where is it?')
  expect(sheet).not.toContain('Washer or dryer?')
  expect(sheet).toContain('>Door<')
  expect(sheet).not.toContain('Washer details (optional)')
  expect(sheet).not.toContain('One question')
  expect(sheet).not.toContain('Not sure yet')
  expect(sheet).toContain('aria-label="Form progress"')
  expect(sheet).toMatch(/<button type="button"[^>]*disabled=""[^>]*>Next</)
  expect(sheet).toContain('aria-label="Close"')
  assertPlainCopy(sheet)
})

test('Start shows the load as started at the tap, before the server answers, and opens it when it does', async () => {
  const events: string[] = []
  let answer: (value: { sessionId: string }) => void = () => {}
  const call = () => new Promise<{ sessionId: string }>((resolve) => { answer = resolve })
  const done = startAtTap(call, {
    started: () => events.push('started'),
    settled: () => events.push('settled'),
    opened: (sessionId) => events.push(`opened ${sessionId}`),
    failed: (message) => events.push(`failed ${message}`),
  })
  // No signal: the server has not answered, and the load already shows as started.
  expect(events).toEqual(['started'])
  answer({ sessionId: 's1' })
  await done
  expect(events).toEqual(['started', 'settled', 'opened s1'])
})

test('a start answered after the person left the pass does not pull them to the load', () => {
  expect(opensStartedLoad('p1', 'p1', 0)).toBe(true)
  // Another start still waiting: this one stays on the pass with its Open button.
  expect(opensStartedLoad('p1', 'p1', 1)).toBe(false)
  // On the Closet tab (Laundry unmounted) or on another plan.
  expect(opensStartedLoad(null, 'p1', 0)).toBe(false)
  expect(opensStartedLoad('p2', 'p1', 0)).toBe(false)
})

test('a start the server refuses puts the load back and says why', async () => {
  const events: string[] = []
  await startAtTap(() => Promise.reject(new ConvexError({ code: 'stale', message: 'These loads changed. Tap to update them.' })), {
    started: () => events.push('started'),
    settled: () => events.push('settled'),
    opened: (sessionId) => events.push(`opened ${sessionId}`),
    failed: (message) => events.push(`failed ${message}`),
  })
  expect(events).toEqual(['started', 'settled', 'failed These loads changed. Tap to update them.'])
})

test('a load started at the tap says when, from the phone\'s time', () => {
  const at = new Date(2026, 8, 27, 15, 4).getTime()
  const line = startedLine(at)
  expect(line).toContain(new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(at))
  expect(line.startsWith('Started at ')).toBe(true)
  assertPlainCopy(line)
})

// ---- Which washer?: mixed shared rooms (W2) ------------------------------------------------

const roomWasher = (machineId: string, name: string, extra: Record<string, unknown> = {}) => ({
  machineId, name, applianceType: 'front_load_washer', highEfficiency: true, location: 'shared', archived: false, pricePerStart: 2,
  placements: ['detergent_compartment', 'softener_compartment', 'bleach_compartment'], cycleMinutes: { normal: { durationMinutes: 35 } },
  ...extra,
}) as unknown as Inventory['machines'][number]

const frontLoaders = [1, 2].map((n) => roomWasher(`front${n}`, `Front-loader ${n}`))
const topLoaders = [1, 2].map((n) => roomWasher(`top${n}`, `Top-loader ${n}`, { applianceType: 'top_load_washer', highEfficiency: false, placements: ['direct_to_drum'], cycleMinutes: { normal: { durationMinutes: 47 } } }))
const roomMachines = [...frontLoaders, ...topLoaders]

const mixedLoad = (overrides: Partial<PlanLoad> = {}): PlanLoad => load({
  machineId: 'front1',
  roomMachineIds: ['front1', 'front2'],
  alternates: [{
    machineId: 'top1',
    machineIds: ['top1', 'top2'],
    applianceType: 'top_load_washer',
    washerClass: 'standard',
    capacityUnits: 11.5,
    cycle: 'normal',
    temperatureC: 30,
    treatments: [{ supplyId: 'tide', dose: { amount: 1, unit: 'cap', mark: '1' }, measurementCue: null, stage: 'main_wash', placement: 'direct_to_drum', timing: 'before loading the clothes', rationale: '', source: '', confirmation: 'confirmed', marks: ['1', '3'], ruleId: 'r1' }],
    status: 'ready',
    problems: [],
  }],
  ...overrides,
} as never)

test('roomGroups feeds the sheet: a mixed room gives own-first groups with prices', () => {
  const groups = roomGroups(mixedLoad(), roomMachines, ['front1', 'front2', 'top1', 'top2'])
  expect(groups.map((group) => group.title)).toEqual(['Front-loaders', 'Top-loaders'])
  const choosing: Choosing = { loadId: 'load-001', number: 1, groups, step: { kind: 'pick' } }
  const markup = renderToStaticMarkup(
    <WhichWasherSheet choosing={choosing} load={mixedLoad()} pending={false} product={() => 'Tide'} onClose={() => undefined} onStep={() => undefined} onPick={() => undefined} />,
  )
  expect(markup).toContain('Front-loaders')
  expect(markup).toContain('Top-loaders')
  expect(markup.match(/\$2\.00/g)?.length).toBe(2)
  expect(markup).toContain('door locks, drawer')
  expect(markup).toContain('lid, no drawer')
  expect(markup).toContain('No number on it?')
  assertPlainCopy(markup)
})

test('a ready alternate’s confirm step shows what changes and a Use button', () => {
  const groups = roomGroups(mixedLoad(), roomMachines, ['front1', 'front2', 'top1', 'top2'])
  const altGroup = groups.find((group) => !group.own)!
  const choosing: Choosing = { loadId: 'load-001', number: 1, groups, step: { kind: 'confirm', group: altGroup, machineId: 'top1', numberSkipped: false } }
  const markup = renderToStaticMarkup(
    <WhichWasherSheet choosing={choosing} load={mixedLoad()} pending={false} product={() => 'Tide'} onClose={() => undefined} onStep={() => undefined} onPick={() => undefined} />,
  )
  expect(markup).toContain('Top-loader 1 takes different steps')
  expect(markup).toContain('Tide:')
  expect(markup).toContain('>Use 1<')
  expect(markup).toContain('Pick another')
  assertPlainCopy(markup)
})

test('a blocked alternate’s confirm step shows the reason and no Use button', () => {
  const groups = roomGroups(mixedLoad({
    alternates: [{
      machineId: 'top1', machineIds: ['top1', 'top2'], applianceType: 'top_load_washer', washerClass: 'standard', capacityUnits: 11.5, cycle: 'normal', temperatureC: 30,
      treatments: [], status: 'too_full', problems: [],
    }],
  } as never), roomMachines, ['front1', 'front2'])
  const altGroup = groups.find((group) => !group.own)!
  expect(altGroup.startable).toBe(false)
  const choosing: Choosing = { loadId: 'load-001', number: 1, groups, step: { kind: 'confirm', group: altGroup, machineId: 'top1', numberSkipped: false } }
  const markup = renderToStaticMarkup(
    <WhichWasherSheet choosing={choosing} load={mixedLoad()} pending={false} product={() => 'Tide'} onClose={() => undefined} onStep={() => undefined} onPick={() => undefined} />,
  )
  expect(markup).toContain('Too full for a top-loader. Try a front-loader.')
  expect(markup).not.toContain('>Use ')
  expect(markup).toContain('Pick another')
  assertPlainCopy(markup)
})

test('"No number on it?" in a mixed room offers a kind tile per class', () => {
  const groups = roomGroups(mixedLoad(), roomMachines, ['front1', 'front2', 'top1', 'top2'])
  const choosing: Choosing = { loadId: 'load-001', number: 1, groups, step: { kind: 'skip' } }
  const markup = renderToStaticMarkup(
    <WhichWasherSheet choosing={choosing} load={mixedLoad()} pending={false} product={() => 'Tide'} onClose={() => undefined} onStep={() => undefined} onPick={() => undefined} />,
  )
  expect(markup).toContain('Door in front')
  expect(markup).toContain('Lid on top')
  expect(kindTileLabel(groups[0]!)).toBe('Door in front')
  expect(kindTileLabel(groups[1]!)).toBe('Lid on top')
})

test('the started label names the washer, or its kind when the number was skipped', () => {
  expect(startedWasherLabel({ at: now, machineId: 'top1' }, roomMachines)).toBe('Top-loader 1')
  expect(startedWasherLabel({ at: now, machineId: 'top1', numberSkipped: true }, roomMachines)).toBe('a top-loader')
  expect(startedWasherLabel({ at: now, machineId: 'front1', numberSkipped: true }, roomMachines)).toBe('a front-loader')
  expect(startedWasherLabel({ at: now }, roomMachines)).toBe('the washer')
})

// ---- Home "Steps for" toggle and the other class's note (W4) ---------------------------------

test('a plan with alternates offers "Steps for" at home; the toggle names each class', () => {
  const shared = storedPlan({}, [mixedLoad()])
  const markup = render({ planId: 'p1', plan: shared, questions: [], inventory: inventory({ machines: [...frontLoaders, ...topLoaders] as never }) })
  expect(markup).toContain('Steps for:')
  expect(markup).toContain('>Front-loaders<')
  expect(markup).toContain('>Top-loaders<')
  assertPlainCopy(markup)
  // No alternates anywhere: the default fixture (single home washer) shows no toggle.
  expect(render({ planId: 'p1', plan: storedPlan(), questions: [] })).not.toContain('Steps for:')
})

test('the laundry pipeline buckets by where a garment is right now, not the closet at large', () => {
  const waiting = textile({ textileId: 'p1' as never, name: 'Tee' })
  const washing = textile({ textileId: 'p2' as never, name: 'Jeans', inLoad: 's1' as never })
  const drying = textile({ textileId: 'p3' as never, name: 'Towel', inLoad: 's2' as never })
  const hanging = textile({ textileId: 'p4' as never, name: 'Sheet', status: 'hanging', inLoad: null })
  const guestItem = textile({ textileId: 'p5' as never, name: 'Guest tee', guest: true })
  const done = textile({ textileId: 'p6' as never, name: 'Shirt', status: 'clean' })
  const hub: HubState = { kind: 'running', next: null, rows: [
    { sessionId: 's1', machine: 'Washer 1', stage: 'washing', doneAt: now + 10 * 60_000 },
    { sessionId: 's2', machine: 'Dryer 1', stage: 'drying', doneAt: now + 5 * 60_000 },
  ] }
  const pipeline = laundryPipeline([waiting, washing, drying, hanging, guestItem, done], hub, now, wearers, null)
  expect(pipeline.counts).toEqual({ hamper: 2, washing: 1, drying: 2 })
  expect(pipelineStatusLine(pipeline.counts)).toBe('2 waiting to wash · 1 in the wash · 2 drying')
  expect(pipeline.tiles.map((tile) => [tile.state, tile.name])).toEqual([['hamper', 'Tee'], ['hamper', 'Guest tee'], ['washing', 'Jeans'], ['drying', 'Towel'], ['drying', 'Sheet']])
  // Nothing running, nothing waiting: the card says so rather than showing nothing.
  expect(pipelineStatusLine({ hamper: 0, washing: 0, drying: 0 })).toBe('Everything is clean')
})

test('the hub summary line: the hamper count, or running loads with an all-dry estimate', () => {
  expect(hubSummaryLine({ kind: 'hamper', count: 10, loads: 2 })).toBe('10 laundry items waiting to wash')
  expect(hubSummaryLine({ kind: 'drying', count: 3, sessionIds: [] })).toBe('3 laundry items drying')
  expect(hubSummaryLine({ kind: 'empty' })).toBeNull()
  // A load still washing folds in its own drying time for the estimate; one already drying uses its own finish.
  const running: HubState = { kind: 'running', next: null, rows: [
    { sessionId: 's1', machine: 'Washer 1', stage: 'washing', doneAt: now + 20 * 60_000, hasDrying: true, dryMinutes: 40 },
    { sessionId: 's2', machine: 'Dryer 1', stage: 'drying', doneAt: now + 10 * 60_000 },
  ] }
  // Same clock as the band and dock beside it (no AM/PM), so one screen never shows two formats.
  expect(hubSummaryLine(running)).toBe(`2 loads running · all dry ~${homeClock(now + 60 * 60_000)}`)
})

test('a load whose other class is blocked shows a quiet note; Start stays enabled', () => {
  const blockedAlt = mixedLoad({
    alternates: [{
      machineId: 'top1', machineIds: ['top1', 'top2'], applianceType: 'top_load_washer', washerClass: 'standard', capacityUnits: 11.5, cycle: 'normal', temperatureC: 30,
      treatments: [], status: 'too_full', problems: [],
    }],
  } as never)
  const shared = storedPlan({ loadStates: [{ loadId: 'load-001', startable: true, startableMachineIds: ['front1', 'front2'], blockingReasonIds: [], blockedItems: [], sessionId: null, confirmedMachineId: null }] }, [blockedAlt])
  const markup = render({ planId: 'p1', plan: shared, questions: [], inventory: inventory({ machines: [...frontLoaders, ...topLoaders] as never }) })
  expect(readableText(markup)).toContain('Top-loaders: Too full for a top-loader. Try a front-loader.')
  // The note is purely informational: with two washers at home, the person says which one, enabled.
  expect(markup).toContain('>I’m at the laundry room</button>')
})

test('the Laundry garment record opens Edit over itself, as Closet does, so Cancel and Save return to it', async () => {
  // Read from disk: a static check of the one record/edit contract. The app has no Node types.
  const nodeFs = 'node:fs'
  const { readFileSync } = await import(/* @vite-ignore */ nodeFs) as { readFileSync: (path: URL, encoding: 'utf8') => string }
  const source = readFileSync(new URL('./laundry-view.tsx', import.meta.url), 'utf8')
  const garmentCase = source.slice(source.indexOf("    case 'garment': {"), source.indexOf("    case 'flag': {", source.indexOf("    case 'garment': {")))
  expect(garmentCase).toContain('<GarmentSheet')
  expect(garmentCase).toMatch(/renderEdit=\{\(edit, close\) => <AddClothesFlow householdId=\{householdId\} mode=\{edit\} onClose=\{close\} \/>\}/)
})

test('a washer pick does not carry over to a regrouped load that kept its id', () => {
  const whites = load({ textileIds: ['shirt', 'towel'] })
  const chosen = new Map([[washerPickKey(whites), { machineId: 'washer-7', numberSkipped: false }]])
  // Same clothes in another order keep the pick.
  expect(pickedWasher(load({ id: 'load-002', textileIds: ['towel', 'shirt'] }), [], [], chosen.get(washerPickKey(load({ textileIds: ['towel', 'shirt'] }))), null)).toEqual({ machineId: 'washer-7', numberSkipped: false })
  // An update regroups load-001 with other clothes: nothing is shown as picked.
  const regrouped = load({ textileIds: ['jeans'] })
  expect(pickedWasher(regrouped, [], [], chosen.get(washerPickKey(regrouped)), null)).toBeNull()
})

test('the Laundry tab leads with one Today card whose Up next row opens the load, with Sort again behind the menu', () => {
  const markup = render({ hub: { kind: 'pass', planId: 'p1', number: 1, count: 4, ready: true } })
  const words = readableText(markup)
  expect(words).toContain('Today')
  expect(words).toContain('4 loads')
  expect(words).toContain('Up next')
  expect(markup).toContain('aria-label="Load options"')
  expect(words).not.toMatch(/\bBack\b/)
  expect(markup).not.toMatch(/Open [^<]* load<\/button>[^]*task-footer/)
})
