import { expect, test, vi } from 'vitest'

import { renderToStaticMarkup } from '@/test/markup'
import { DiscardChecksCallout, Drying, DryingView, midRunPiece, pieceNames, runMark, stainAnswerNote, hasUnsavedChecks, planBack, dryByCount, liveCheckDraft, withCheckDraft, dryingRequirementsReady, pieceGroups, putAwayGroups, requiresDryingAcknowledgment, dryerLoadView, dryerSetting, fitCaption, matchDryer, type CheckDraft, type CheckDrafts, type DryingQueue, type DryingScreen } from '@/drying/drying-view'
import { assertPlainCopy } from '@/kit/test-copy'
import { midCheckText } from '@/copy-drying'
import { dryerContextSuggestion } from '@washcloset/planner'

const queryState = vi.hoisted(() => ({ value: [] as unknown, reasking: false, asked: 0 }))
vi.mock('convex/react', async (original) => {
  const { useState } = await import('react')
  return {
    ...await original<typeof import('convex/react')>(),
    useMutation: () => async () => null,
    // `reasking`: the queue query answers once, then re-asks (new arguments) and is undefined while it loads.
    useQuery: (_query: unknown, args: unknown) => {
      if (!queryState.reasking || typeof args !== 'object' || args === null || !('combine' in args)) return queryState.value
      const [loaded, setLoaded] = useState(false)
      queryState.asked += 1
      if (!loaded) { setLoaded(true); return queryState.value }
      return undefined
    },
  }
})

const piece = (pieceId: string, name: string, washerName: string, extra: Partial<DryingQueue['pieces'][number]> = {}): DryingQueue['pieces'][number] => ({
  pieceId: pieceId as never, textileId: `t-${pieceId}` as never, name, kind: 'towel', color: 'White', colorGroup: 'light', washerName, status: 'queued', queuedAt: 0,
  own: false, need: null, label: 'tumble_dry', method: 'tumble', source: 'label', evidence: 'allowed', preference: null, dried: null,
  maxHeat: 'high', hold: null, bulkUnits: 2, dryingRunId: null, driedIn: null, ...extra,
})

const dryers: DryingQueue['dryers'] = [
  { machineId: 'd4' as never, name: 'Dryer 4', location: 'shared', capacityUnits: 4, heatSettings: [{ heat: 'high', label: 'Hot' }, { heat: 'low', label: 'Delicate' }], pricePerStart: null },
  { machineId: 'd9' as never, name: 'Dryer 9', location: 'shared', capacityUnits: null, heatSettings: [{ heat: 'high', label: 'Hot' }], pricePerStart: null },
]

const queue = (extra: Partial<DryingQueue> = {}): DryingQueue => ({
  pieces: [piece('p1', 'Bath towel', 'Washer 3'), piece('p2', 'Hand towel', 'Washer 5'), piece('p3', 'Beach towel', 'Washer 3'), piece('p4', 'Silk top', 'Washer 3', { maxHeat: 'low', bulkUnits: 1, kind: 'shirt' }), piece('p5', 'Wool jumper', 'Washer 5', { maxHeat: null, hold: 'dry_flat', kind: 'sweater', label: 'dry_flat', method: 'flat' }), piece('p6', 'Knit cardigan', 'Washer 5', { maxHeat: null, hold: 'do_not_tumble_dry', kind: 'sweater', label: 'do_not_tumble_dry', method: 'tumble', source: 'once', evidence: 'conflict', need: 'today' })],
  plan: {
    loads: [
      { heat: null, pieceIds: ['p6'], bulkUnits: 2, capacityUnits: null, fit: 'not_checked', sources: ['Washer 5'], need: 'today' },
      { heat: 'low', pieceIds: ['p4'], bulkUnits: 1, capacityUnits: null, fit: 'not_checked', sources: ['Washer 3'], need: null },
      { heat: 'high', pieceIds: ['p1', 'p2', 'p3'], bulkUnits: 6, capacityUnits: null, fit: 'not_checked', sources: ['Washer 3', 'Washer 5'], need: null },
    ],
    natural: [{ pieceId: 'p5', method: 'flat' }],
    unset: [],
    mixedHeats: true,
  },
  capacityUnits: null,
  capacities: [],
  homeDryerId: null,
  homeDryerSessionId: null,
  hangingDryers: [],
  equipment: { tumble: true, heated_hanging: false },
  dryers: dryers.map((dryer) => ({ ...dryer, capacityUnits: null })),
  runs: [],
  ...extra,
})

const render = (screen: DryingScreen, data = queue(), drafts: CheckDrafts = {}) => renderToStaticMarkup(
  <DryingView queue={data} householdId="home" now={0} onBack={() => undefined} combine={false} onCombine={() => undefined} onCapacity={() => undefined} initialScreen={screen} initialDrafts={drafts} />,
)

test('matched flat shade and drip instructions require method, recorded extraction and explicit place confirmations', () => {
  const instructions = { source: 'Synthetic checked sewn label', preparation: [], washing: [], beforeDrying: [], drying: ['Drip dry flat in shade away from direct heat'], afterDrying: [], ironing: [],
    dryingRequirements: [{ wording: 'Drip dry flat in shade away from direct heat', checked: true, requirements: [{ kind: 'dry_flat' as const }, { kind: 'drip_dry' as const }, { kind: 'shade' as const }, { kind: 'no_direct_heat' as const }] }],
  }
  const flat = piece('flat', 'Source-bound knit', 'Washer 3', { method: 'flat', maxHeat: null, noSpinRecorded: true, instructions, instructionRevision: 'synthetic-revision' })
  const context = { shade: true, drip: true, noDirectHeat: true }
  expect(requiresDryingAcknowledgment([flat])).toBe(true)
  expect(dryingRequirementsReady([flat])).toBe(false)
  expect(dryingRequirementsReady([flat], 'flat', context)).toBe(true)
  expect(dryingRequirementsReady([flat], 'tumble', context)).toBe(false)
  expect(dryingRequirementsReady([{ ...flat, noSpinRecorded: undefined }], 'flat', context)).toBe(false)
  expect(dryingRequirementsReady([{ ...flat, instructions: { ...instructions, drying: ['Changed conditional wording'] } }], 'flat', context)).toBe(false)
  const data = queue({ pieces: [flat], plan: { loads: [], natural: [{ pieceId: 'flat', method: 'flat' }], unset: [], mixedHeats: false } })
  const markup = render({ kind: 'plan' }, data)
  expect(markup).toContain('This drying place is in shade')
  expect(markup).toContain('This drying place is away from direct heat')
  expect(markup).toContain('These pieces are drying without extraction or wringing')
  expect(markup).toContain('I’ve followed these label instructions')
  expect(markup).toContain(instructions.drying[0])
  expect(markup).toMatch(/<button[^>]*aria-label="Lay 1 piece flat to dry"[^>]*disabled[^>]*>Start drying<\/button>/)
})

test('a reviewed product-only drying restriction permits tumble with a required source acknowledgment', () => {
  const instructions = { source: 'Synthetic label', preparation: [], washing: [], beforeDrying: [], drying: ['No dryer sheets'], afterDrying: [], ironing: [],
    dryingRequirements: [{ wording: 'No dryer sheets', checked: true, requirements: [{ kind: 'no_dryer_sheets' as const }] }],
  }
  const p = piece('p', 'Tee', 'Washer', { instructions })
  expect(dryingRequirementsReady([p], 'tumble')).toBe(true)
  expect(requiresDryingAcknowledgment([p])).toBe(true)
  expect(dryingRequirementsReady([{ ...p, instructions: { ...instructions, dryingRequirements: undefined } }], 'tumble')).toBe(false)
})

test('dryer loads are planned apart from wash loads: by heat, across washers, unknown capacity never assumed', () => {
  const markup = render({ kind: 'plan' })
  expect(markup).toContain('6 pieces waiting to dry')
  expect(markup).toContain('from Washer 3')
  expect(markup).not.toContain('aria-label="Air dry')
  expect(markup).toContain('Dryer capacity unknown · fit not checked')
  // A do-not-tumble piece tumbled this time plans first (needed today) and never gets an assumed heat.
  expect(markup).toContain('Heat not set by label')
  expect(markup).toContain('Clothes')
  expect(markup).toContain('Towels')
  expect(markup).not.toContain('Load 1 ·')
  expect(markup).toContain('aria-expanded="false"')
  expect(markup).toContain('This time only · differs from label')
  expect(markup).toContain('Needed today')
  expect(markup).toContain('Low heat')
  expect(markup).toContain('High heat')
  expect(markup).toContain('3 pieces · fit not checked')
  expect(markup).toContain('from Washer 5')
  // Preparation is offered before the clothes; it never becomes a garment row.
  expect(markup.match(/Load into a dryer/g)).toHaveLength(3)
  expect(markup.indexOf('Load into a dryer')).toBeLessThan(markup.indexOf('aria-label="Knit cardigan,'))
  expect(markup).not.toContain('Enter its number at the machine')
  expect(markup).toContain('Load options')
  expect(markup).toContain('Wool jumper')
  expect(markup).toContain('Lay flat')
  expect(markup).toContain('from Washer 5 · Dry flat')
  expect(markup).toContain('Lay 1 piece flat to dry')
  assertPlainCopy(markup)
})

test('at home the one dryer is used, and loads say so', () => {
  const home = queue({ homeDryerId: 'd4' as never, dryers: [{ ...dryers[0]!, location: null }] })
  const markup = render({ kind: 'plan' }, home)
  expect(markup).toContain('Load into Dryer 4')
  expect(markup).not.toContain('Your dryer')
  expect(markup).not.toContain('Dryer capacity unknown')
})

test('matching pieces show a count in the facts, without making it part of the garment name', () => {
  const data = queue({
    pieces: ['a', 'b', 'c'].map((id) => piece(id, 'Bath towel', 'Washer 3', { textileId: 'same-towel' as never })),
    plan: { loads: [{ heat: 'high', pieceIds: ['a', 'b', 'c'], bulkUnits: 6, capacityUnits: null, fit: 'not_checked', sources: ['Washer 3'], need: null }], natural: [], unset: [], mixedHeats: false },
  })
  const markup = render({ kind: 'plan' }, data)
  expect(markup).toContain('Bath towel')
  expect(markup).toContain('3 pieces · from Washer 3')
  expect(markup).not.toContain('Bath towel ×3')
})

test('an altered drying method is distinct from the recorded label, and running names do not repeat per piece', () => {
  const first = piece('a', 'Cotton tee', 'Washer 3', { method: 'rack_line', source: 'once', evidence: 'not_specified', maxHeat: 'low' })
  const data = queue({ pieces: [first], plan: { loads: [], natural: [{ pieceId: 'a', method: 'rack_line' }], unset: [], mixedHeats: false } })
  expect(render({ kind: 'plan' }, data)).toContain('Hang to dry · Label: Tumble dry, low heat · This time only')
  const running = queue({ pieces: [first, { ...first, pieceId: 'b' as never }].map((entry) => ({ ...entry, status: 'drying', dryingRunId: 'run' as never })),
    plan: { loads: [], natural: [], unset: [], mixedHeats: false },
    runs: [{ runId: 'run' as never, dryerId: null, reminded: false, kind: 'air', method: 'rack_line', startedAt: 0, minutes: null, pieceIds: ['a', 'b'] as never, dryerName: null, heatLabel: null }] })
  const markup = render({ kind: 'plan' }, running)
  expect(markup).toContain('2 pieces · Cotton tee')
  expect(markup).not.toContain('Cotton tee, Cotton tee')
})

test('the dryer screen asks which dryer first, then lists what goes in; only this load\'s overflow stays queued', () => {
  const asking = render({ kind: 'dryer', number: 2, heat: 'high', pieceIds: ['p1', 'p2', 'p3'] }, queue({ dryers }))
  expect(asking.indexOf('Which dryer?')).toBeLessThan(asking.indexOf('Which dryer are you using?'))
  // The number field leads. Without dryers this household used, nothing is "Previously used"; a room of two lists both plainly.
  expect(asking.indexOf('Which dryer are you using?')).toBeLessThan(asking.indexOf('aria-label="Dryers"'))
  expect(asking).not.toContain('Previously used')
  expect(asking).toContain('inputMode="numeric"')
  expect(asking.indexOf('aria-label="Dryers"')).toBeLessThan(asking.indexOf('Going into this dryer'))
  expect(asking).toContain('Shortcuts only. Nothing is assumed free or reserved.')
  expect(asking).toContain('Enter the dryer you are using')

  // Dryer 4 holds two of the three towels: one stays queued. The silk top (another load) is not listed.
  const loading = render({ kind: 'dryer', number: 2, heat: 'high', pieceIds: ['p1', 'p2', 'p3'], dryerId: 'd4' }, queue({ dryers }))
  expect(loading).toContain('Dryer 4 is full. 1 piece stays queued for the next dryer.')
  expect(loading).toContain('Going into this dryer')
  expect(loading).toContain('Won&#x27;t fit · stays queued')
  expect(loading.indexOf('Hand towel')).toBeLessThan(loading.indexOf('Won&#x27;t fit'))
  expect(loading.indexOf('Beach towel')).toBeGreaterThan(loading.indexOf('Won&#x27;t fit'))
  expect(loading).not.toContain('Silk top')
  expect(loading).not.toContain('Still queued')
  expect(loading).toContain('from Washer 5')
  expect(loading).toContain('Load 2 pieces into Dryer 4')
  expect(loading).toContain('Choose Hot')
  expect(loading).not.toContain('No special clothing loading order recorded')
  // Routine guidance is collapsed and outside every clothing list, so it cannot clip its corners.
  expect(loading).toContain('About load size and heat')
  const lists = loading.match(/<ul\b[\s\S]*?<\/ul>/g) ?? []
  expect(lists.some((list) => list.includes('Fit is an estimate'))).toBe(false)
  expect(loading).not.toContain('<details open')
  expect(loading).toContain('I&#x27;ve started Dryer 4')
  // The step's price uses the app's money format, the same as the Take out early note.
  expect(render({ kind: 'dryer', number: 2, heat: 'high', pieceIds: ['p1', 'p2', 'p3'], dryerId: 'd4' }, queue({ dryers: dryers.map((dryer) => ({ ...dryer, pricePerStart: 1.5 })) }))).toContain('Pay $1.50 if asked')
  assertPlainCopy(loading)

  const unknown = render({ kind: 'dryer', number: 2, heat: 'high', pieceIds: ['p1', 'p2', 'p3'], dryerId: 'd9' }, queue({ dryers }))
  expect(unknown).toContain('Dryer 9 has no recorded capacity · fit not checked.')
  expect(unknown).toContain('3 pieces · fit not checked')
  expect(unknown).not.toContain('Won&#x27;t fit')
})

test('put away is partial and keeps the washer and the dryer', () => {
  const data = queue({ pieces: [piece('p1', 'Bath towel', 'Washer 3', { status: 'dry', driedIn: 'Dryer 4' }), piece('p2', 'Hand towel', 'Washer 5', { status: 'queued' })] })
  const markup = render({ kind: 'putaway' }, data)
  expect(markup).toContain('Washer 3 → Dryer 4')
  expect(markup).toContain('Put away 1 piece')
  expect(markup).toContain('Not dry yet')
  expect(markup).toContain('from Washer 5 · in the drying queue')
  // The header summary covers only the dry pieces; putting away stays the footer's own tap.
  expect(markup).toContain('aria-label="This load"')
  expect(markup).toContain('To put away')
  expect(markup).toContain('From Washer 3<')
})

test('a dryness check opens with the load card, keeping every wash its run combines', () => {
  const pieces = [piece('a', 'Bath towel', 'Washer 3', { status: 'drying', dryingRunId: 'run' as never }), piece('b', 'Bath towel', 'Washer 3', { status: 'drying', dryingRunId: 'run' as never }), piece('c', 'Hand towel', 'Washer 5', { status: 'drying', dryingRunId: 'run' as never })]
  const data = queue({ pieces, dryers,
    runs: [{ runId: 'run' as never, dryerId: null, reminded: false, kind: 'dryer', method: null, startedAt: 0, minutes: 40, pieceIds: ['a', 'b', 'c'] as never, dryerName: 'Dryer 4', heatLabel: 'Hot' }] })
  const markup = render({ kind: 'check', runId: 'run' }, data)
  expect(markup).toContain('aria-label="This load"')
  expect(markup).toContain('from Washer 3')
  expect(markup).toContain('from Washer 5')
  expect(markup).toContain('Step 3 of 4: Dry')
  expect(markup).toContain('Is it dry?')
  // Confirming dryness is the footer's one button; the summary adds no action of its own.
  const summary = markup.slice(markup.indexOf('aria-label="This load"'), markup.indexOf('</section>', markup.indexOf('aria-label="This load"')))
  expect(summary).not.toMatch(/<a |<button/)
  expect(markup).toContain('Put away 3 dry pieces')
  assertPlainCopy(markup)
})

test('a dryness check counts matching pieces: the first n are dry, the rest stay damp', () => {
  const tees = ['a', 'b'].map((id) => piece(id, 'White T-shirt', 'Washer 3', { kind: 't_shirt', status: 'drying', dryingRunId: 'run' as never }))
  const towel = piece('c', 'Bath towel', 'Washer 3', { status: 'drying', dryingRunId: 'run' as never })
  const data = queue({ pieces: [...tees, towel], dryers,
    runs: [{ runId: 'run' as never, dryerId: null, reminded: false, kind: 'dryer', method: null, startedAt: 0, minutes: 40, pieceIds: ['a', 'b', 'c'] as never, dryerName: 'Dryer 4', heatLabel: 'Hot' }] })
  const markup = render({ kind: 'check', runId: 'run' }, data)
  // Two matching tees are one row with a "Dry n of m" stepper; the single towel is a checklist item.
  expect(markup).toContain('White T-shirt ×2')
  expect(markup).toContain('Dry 2 of 2 · from Washer 3')
  expect(markup).toContain('aria-label="More dry White T-shirt"')
  expect(markup.match(/role="checkbox"/g)).toHaveLength(1)
  expect(markup).not.toContain('Check individual pieces')
  expect(markup).toContain('Put away 3 dry pieces')
  assertPlainCopy(markup)

  // One damp tee of two: the first tee is dry, the second stays damp with the towel still dry.
  const groups = pieceGroups([...tees, towel])
  const dry = dryByCount(groups, { a: 1 })
  expect(dry.map((entry) => entry.pieceId)).toEqual(['a', 'c'])
  expect(dryByCount(groups, { a: 0, c: 0 })).toEqual([])
  expect(dryByCount(groups, { a: 5 }).map((entry) => entry.pieceId), 'counts never exceed the group').toEqual(['a', 'b', 'c'])
})

test('an unsaved dryness check is kept per run across Back, marked on the plan, and cleared only by submit or discard', () => {
  const tees = ['a', 'b'].map((id) => piece(id, 'White T-shirt', 'Washer 3', { kind: 't_shirt', status: 'drying', dryingRunId: 'run' as never }))
  const towel = piece('c', 'Bath towel', 'Washer 3', { status: 'drying', dryingRunId: 'run' as never })
  const data = queue({ pieces: [...tees, towel], dryers, plan: { loads: [], natural: [], unset: [], mixedHeats: false },
    runs: [{ runId: 'run' as never, dryerId: null, reminded: false, kind: 'dryer', method: null, startedAt: -60 * 60_000, minutes: 40, pieceIds: ['a', 'b', 'c'] as never, dryerName: 'Dryer 4', heatLabel: 'Hot' }] })
  // One tee damp and 15 more minutes, answered before Back: DryingView holds it by run.
  const draft: CheckDraft = { counts: { a: { dry: 1, of: 2 } }, minutes: '15' }
  const drafts = withCheckDraft({}, 'run', draft)
  expect(drafts).toEqual({ run: draft })

  const plan = render({ kind: 'plan' }, data, drafts)
  expect(plan).toContain('Unsaved check · 3 pieces')
  expect(render({ kind: 'plan' }, data), 'no draft, no mark').not.toContain('Unsaved check')

  // Reopening the run restores the answers; discarding needs a tap and a confirmation, so none shows yet.
  const reopened = render({ kind: 'check', runId: 'run' }, data, drafts)
  expect(reopened).toContain('Dry 1 of 2 · from Washer 3')
  expect(reopened).toMatch(/id="extra-minutes"[^>]*value="15"/)
  expect(reopened).toContain('Put away 2 · keep 1 drying')
  expect(reopened).toContain('Discard check')
  expect(reopened).not.toContain('Discard your changes?')
  expect(reopened).not.toContain('This load changed')
  assertPlainCopy(reopened)
  expect(render({ kind: 'check', runId: 'run' }, data), 'nothing to discard').not.toContain('Discard check')

  // Submit and the confirmed discard both clear the run's draft; other runs keep theirs.
  expect(withCheckDraft({ ...drafts, other: draft }, 'run', null)).toEqual({ other: draft })
  expect(withCheckDraft(drafts, 'run', { counts: {}, minutes: '' }), 'back to all dry is no draft').toEqual({})
})

test('a draft is revalidated against the live run: gone groups drop and resized groups clamp', () => {
  const tees = ['a', 'b', 'c'].map((id) => piece(id, 'White T-shirt', 'Washer 3', { kind: 't_shirt', status: 'drying', dryingRunId: 'run' as never }))
  const draft: CheckDraft = { counts: { a: { dry: 2, of: 3 }, gone: { dry: 0, of: 1 } }, minutes: '' }
  const shrunk = liveCheckDraft(draft, pieceGroups(tees.slice(0, 2)))
  expect(shrunk).toEqual({ draft: { counts: {}, minutes: '' }, changed: true })
  const same = liveCheckDraft({ counts: { a: { dry: 2, of: 3 } }, minutes: '20' }, pieceGroups(tees))
  expect(same).toEqual({ draft: { counts: { a: { dry: 2, of: 3 } }, minutes: '20' }, changed: false })
  const stale = liveCheckDraft({ counts: { a: { dry: 1, of: 3 } }, minutes: '' }, pieceGroups(tees.slice(0, 2)))
  expect(stale).toEqual({ draft: { counts: { a: { dry: 1, of: 2 } }, minutes: '' }, changed: true })

  const data = queue({ pieces: tees.slice(0, 2), dryers,
    runs: [{ runId: 'run' as never, dryerId: null, reminded: false, kind: 'dryer', method: null, startedAt: 0, minutes: 40, pieceIds: ['a', 'b'] as never, dryerName: 'Dryer 4', heatLabel: 'Hot' }] })
  const markup = render({ kind: 'check', runId: 'run' }, data, { run: { counts: { a: { dry: 1, of: 3 } }, minutes: '' } })
  expect(markup).toContain('This load changed since your check')
  expect(markup).toContain('Dry 1 of 2 · from Washer 3')
})

test('put-away rows group matching pieces by washer and dryer, and not-dry rows use the same groups', () => {
  const tee = (id: string, extra: Partial<DryingQueue['pieces'][number]> = {}) => piece(id, 'White T-shirt', 'Washer 3', { kind: 't_shirt', status: 'dry', driedIn: 'Dryer 4', ...extra })
  // Separate inventory records (different textileIds) of one tee are one row.
  expect(putAwayGroups([tee('a'), tee('b', { color: 'white' })]).map((group) => group.pieces.length)).toEqual([2])
  expect(putAwayGroups([tee('a'), tee('b', { driedIn: 'Dryer 9' })]), 'dryer').toHaveLength(2)
  expect(putAwayGroups([tee('a'), tee('b', { washerName: 'Washer 5' })]), 'washer').toHaveLength(2)
  expect(putAwayGroups([tee('a', { status: 'queued', driedIn: null }), tee('b', { status: 'drying', driedIn: null, dryingRunId: 'run' as never })]), 'where it is').toHaveLength(2)

  const data = queue({ pieces: [tee('a'), tee('b'), tee('c', { status: 'queued', driedIn: null }), tee('d', { status: 'queued', driedIn: null })] })
  const markup = render({ kind: 'putaway' }, data)
  expect(markup).toContain('2 of 2 · Washer 3 → Dryer 4')
  expect(markup).toContain('Put away 2')
  expect(markup).toContain('2 pieces · from Washer 3 · in the drying queue')
})

test('the recorded program is offered as a suggestion while actual timer entry remains blank', () => {
  const screen: DryingScreen = { kind: 'dryer', number: 1, heat: 'high', pieceIds: ['p1'], dryerId: 'd4' }
  const data = queue({ dryers: [{ ...dryers[0]!, programTime: { durationMinutes: 45, confidence: 'observed' } }] })
  const markup = render(screen, data)
  expect(markup).toContain('Use suggested 45 min')
  expect(markup).toContain('remaining moisture')
  expect(markup).toMatch(/id="dryer-minutes"[^>]*value=""/)
  expect(markup).not.toMatch(/id="dryer-minutes"[^>]*value="45"/)
  const unknown = render(screen, queue({ dryers }))
  expect(unknown).not.toContain('Use suggested')
  expect(unknown).toContain('No checked program time is recorded')
})

test('helpers: labels match by words or number, fit is reported honestly, heat in the dryer\'s words', () => {
  expect(matchDryer(dryers, '4')).toBe('d4')
  expect(matchDryer(dryers, 'dryer 9')).toBe('d9')
  expect(matchDryer(dryers, '12')).toBeNull()
  expect(fitCaption(3, 'fits')).toBe('3 pieces')
  expect(fitCaption(1, 'not_checked')).toBe('1 piece · fit not checked')
  expect(dryerLoadView([{ pieceId: 'a', bulkUnits: 2 }, { pieceId: 'b', bulkUnits: 2 }, { pieceId: 'c', bulkUnits: 2 }] as never, { capacityUnits: 4 })).toEqual({ going: ['a', 'b'], staying: ['c'], fit: 'fits' })
  expect(dryerSetting(dryers[0]!, 'medium')).toBe('Delicate')
  expect(dryerSetting(dryers[1]!, 'low')).toBeNull()
  // A low tag takes the cooler heated button unless the Low button's documented temperature (sent with the queue) is 140 F or less.
  const hot = { heatSettings: [{ heat: 'delicate' as const, label: 'Delicates' }, { heat: 'low' as const, label: 'Low' }] }
  expect(dryerSetting(hot, 'low')).toBe('Delicates')
  expect(dryerSetting({ heatSettings: [hot.heatSettings[0]!, { ...hot.heatSettings[1]!, tempF: 140 }] }, 'low')).toBe('Low')
})

test('private context explains a refinement and a sensor fallback without filling the actual timer', () => {
  const context = { key: 'synthetic-checked-context', pieceCount: 1, bulkUnits: 2, capacityUnits: 4, capacityConfidence: 'observed',
    extraction: [{ washerId: 'washer', cycle: 'Normal', source: 'Checked washer guide', spinRpm: 800, spinMinutes: 4 }] }
  const suggestion = dryerContextSuggestion({ durationMinutes: 60, confidence: 'observed', mode: 'fixed' }, context,
    [35, 40, 45].map((minutes, index) => ({ contextKey: context.key, runId: `run-${index}`, washIds: [`wash-${index}`], minutes, completedAt: 10, result: 'unchanged' as const })),
    { enabled: true, resetAt: 0, historyTruncated: false, negativeHistoryTruncated: false, now: 11 })
  const props = { queue: queue({ dryers }), householdId: 'home', now: 0, onBack: () => undefined, combine: false, onCombine: () => undefined, onCapacity: () => undefined,
    initialScreen: { kind: 'dryer' as const, number: 1, heat: 'high' as const, pieceIds: ['p1'], dryerId: 'd4' } }
  const markup = renderToStaticMarkup(<DryingView {...props} durationSuggestion={suggestion} />)
  expect(markup).toContain('Use suggested 40 min')
  expect(markup).toContain('3 independent comparable drying outcomes')
  expect(markup).toContain('About this starting suggestion')
  expect(markup).toContain('aria-expanded="false"')
  expect(markup).toMatch(/id="dryer-minutes"[^>]*value=""/)
  const unavailable = renderToStaticMarkup(<DryingView {...props} durationSuggestion={dryerContextSuggestion({ durationMinutes: 60, confidence: 'observed', mode: 'sensor' }, context, [], { enabled: true, resetAt: 0, historyTruncated: false, negativeHistoryTruncated: false, now: 11 })} />)
  expect(unavailable).toContain('sensor program')
  expect(unavailable).not.toContain('Use suggested')
  expect(unavailable).toMatch(/id="dryer-minutes"[^>]*value=""/)
  assertPlainCopy(markup)
  const sensorDryer = { ...dryers[0]!, programTime: { durationMinutes: 60, confidence: 'observed' as const, mode: 'sensor' as const } }
  const pending = renderToStaticMarkup(<DryingView {...props} queue={queue({ dryers: [sensorDryer] })} />)
  expect(pending).toContain('sensor program')
  expect(pending).not.toContain('Use suggested')
  queryState.value = undefined
  try {
    const loading = renderToStaticMarkup(<DryingView {...props} queue={queue({ dryers: [{ ...dryers[0]!, programTime: { durationMinutes: 60, confidence: 'observed' } }] })} />)
    expect(loading).toContain('Checking recorded load context and your private outcomes')
    expect(loading).not.toContain('Use suggested')
    expect(loading).toMatch(/id="dryer-minutes"[^>]*value=""/)
  } finally { queryState.value = [] }
})

test('matching pieces from separate garments share one plan row with a count', () => {
  // Screenshot 170: two separate inventory records of one white tee, from the same washer.
  const tees = [piece('a', 'White T-shirt', 'Washer 3', { kind: 't_shirt', color: 'Grey' }), piece('b', 'white  t-shirt', 'Washer 3', { kind: 't_shirt', color: 'Gray' })]
  expect(pieceGroups(tees).map((group) => group.map((entry) => entry.pieceId))).toEqual([['a', 'b']])
  const data = queue({ pieces: tees, plan: { loads: [{ heat: 'high', pieceIds: ['a', 'b'], bulkUnits: 4, capacityUnits: null, fit: 'not_checked', sources: ['Washer 3'], need: null }], natural: [], unset: [], mixedHeats: false } })
  const markup = render({ kind: 'plan' }, data)
  expect(markup.match(/aria-label="White T-shirt, [^"]*"/g)).toEqual(['aria-label="White T-shirt, 2 pieces · from Washer 3 · Tumble dry allowed"'])
})

test('matching pieces split on any drying fact that genuinely differs', () => {
  const base = (id: string, extra: Partial<DryingQueue['pieces'][number]> = {}) => piece(id, 'White T-shirt', 'Washer 3', { kind: 't_shirt', ...extra })
  const split = (other: Partial<DryingQueue['pieces'][number]>) => pieceGroups([base('a'), base('b', other)]).length
  expect(split({})).toBe(1)
  expect(split({ washerName: 'Washer 5' }), 'washer').toBe(2)
  expect(split({ method: 'rack_line', source: 'once' }), 'method').toBe(2)
  expect(split({ method: 'rack_line', source: 'preference', preference: 'rack_line' }), 'remembered method').toBe(2)
  expect(split({ maxHeat: 'low' }), 'label').toBe(2)
  expect(split({ instructionRevision: 'other-wording' }), 'instructions').toBe(2)
  expect(split({ need: 'today' }), 'priority').toBe(2)
  expect(split({ status: 'drying', dryingRunId: 'run' as never }), 'run').toBe(2)
  expect(split({ status: 'dry', driedIn: 'Dryer 4' }), 'dried in').toBe(2)
  expect(split({ own: true }), 'own load').toBe(2)
  expect(split({ guest: true }), 'guest garment').toBe(2)
  expect(split({ color: 'Black' }), 'identity').toBe(2)
  const routine = { routineRevision: 1, routineLabelHash: 'h' }
  expect(pieceGroups([base('a', { ...routine, routineOwner: 0 }), base('b', { ...routine, routineOwner: 0 })]), 'one owner\'s routine pieces').toHaveLength(1)
  expect(pieceGroups([base('a', { ...routine, routineOwner: 0 }), base('b', { ...routine, routineOwner: 1 })]), 'two owners\' identical routine pieces stay separate rows').toHaveLength(2)
  expect(pieceGroups([base('a', { name: null }), base('b', { name: null })]), 'unknown garments never merge').toHaveLength(2)
})

test('the needed-soon callout and label instructions use the same matching groups', () => {
  const instructions = { source: 'Synthetic label', preparation: [], washing: [], beforeDrying: ['Reshape while damp'], drying: [], afterDrying: [], ironing: [] }
  const tees = ['a', 'b'].map((id) => piece(id, 'White T-shirt', 'Washer 3', { kind: 't_shirt', method: 'rack_line', source: 'once', need: 'today', instructions, instructionRevision: 'r1' }))
  const data = queue({ pieces: tees, plan: { loads: [], natural: tees.map((entry) => ({ pieceId: entry.pieceId, method: 'rack_line' as const })), unset: [], mixedHeats: false } })
  const markup = render({ kind: 'plan' }, data)
  expect(markup).toContain('White T-shirt ×2')
  expect(markup.match(/Reshape while damp/g)).toHaveLength(1)
})

test('leaving the drying page with an unsaved dryness check asks Keep editing or Discard first', () => {
  const drafts: CheckDrafts = { run1: { counts: { a: { dry: 1, of: 2 } }, minutes: '' } }
  const asked: string[] = []
  planBack(drafts, () => asked.push('left'), () => asked.push('confirm'))
  planBack({}, () => asked.push('left'), () => asked.push('confirm'))
  expect(asked).toEqual(['confirm', 'left'])
  expect(hasUnsavedChecks(drafts)).toBe(true)
  expect(hasUnsavedChecks({})).toBe(false)
  const markup = renderToStaticMarkup(<DiscardChecksCallout onKeep={() => undefined} onDiscard={() => undefined} />)
  expect(markup).toContain('Discard your changes?')
  expect(markup).toContain('Keep editing')
  expect(markup).toContain('>Discard<')
  expect(markup).not.toMatch(/saved/i)
})

test('"Stain gone?" says the dryer is fine only when a hold was released', () => {
  expect(stainAnswerNote('gone', 1)).toBe('It can go in the dryer now, as its label allows.')
  expect(stainAnswerNote('gone', 0)).toBeNull()
  expect(stainAnswerNote('still_there', 0)).toContain('keeps air drying')
})

test('a shared room\'s "Which dryer?" offers "None free" even once a dryer is picked; a home dryer never does', () => {
  expect(render({ kind: 'dryer', number: 2, heat: 'high', pieceIds: ['p1', 'p2', 'p3'] }, queue({ dryers }))).toContain('None free')
  expect(render({ kind: 'dryer', number: 2, heat: 'high', pieceIds: ['p1', 'p2', 'p3'], dryerId: 'd4' }, queue({ dryers }))).toContain('None free')
  const home = [{ ...dryers[0]!, location: 'home' as const }]
  expect(render({ kind: 'dryer', number: 2, heat: 'high', pieceIds: ['p1', 'p2', 'p3'] }, queue({ dryers: home, homeDryerId: 'd4' as never }))).not.toContain('None free')
})

test('the dryer sharing line: offered beside "Separate by heat", worded by fit, money only per start, tees can hang', () => {
  const tee = piece('t1', 'Blue tee', 'Washer 3', { kind: 't_shirt', maxHeat: 'low', bulkUnits: 0.5 })
  const towel = piece('w1', 'Bath towel', 'Washer 3', { maxHeat: 'medium', bulkUnits: 1 })
  const share = { separate: 2, together: 1, heat: 'low' as const, knitIds: ['t1'] }
  const base = queue({ pieces: [tee, towel], plan: { loads: [
    { heat: 'low', pieceIds: ['t1'], bulkUnits: 0.5, capacityUnits: 4, fit: 'fits', sources: ['Washer 3'], need: null },
    { heat: 'medium', pieceIds: ['w1'], bulkUnits: 1, capacityUnits: 4, fit: 'fits', sources: ['Washer 3'], need: null },
  ], natural: [], unset: [], mixedHeats: true }, capacityUnits: 4, capacities: [4] })
  expect(render({ kind: 'plan' }, base)).not.toContain('dryer run instead of')

  const shared = { ...base, share, dryers: [{ ...dryers[0]!, pricePerStart: 0.5, programTime: { durationMinutes: 45, confidence: 'observed' as const, mode: 'fixed' as const } }] }
  const markup = render({ kind: 'plan' }, shared)
  expect(markup).toContain('Should fit in 1 dryer run instead of 2')
  expect(markup).toContain('All on low heat. Heavier pieces may need more time.')
  expect(markup).toContain('($0.50 less to start)')
  expect(markup).toContain('Tees can shrink if they tumble the whole time.')
  expect(markup).toContain('>Hang the tees</button>')
  // Never preselected: today's default stays "Separate by heat".
  expect(markup.match(/<button[^>]*>Separate by heat<\/button>/)?.[0]).toContain('aria-checked="true"')
  expect(markup.match(/<button[^>]*>All on low heat<\/button>/)?.[0]).toContain('aria-checked="false"')
  assertPlainCopy(markup)

  // Time-block pricing (the owner's 16-minute dryers): no money line at all.
  const block = render({ kind: 'plan' }, { ...shared, dryers: [{ ...shared.dryers[0]!, blockMinutes: 16 }] })
  expect(block).toContain('1 dryer run instead of 2')
  expect(block).not.toContain('less to start')
  expect(block).not.toContain('block')
  // A sensor program: runs only, and the heavier pieces may come out damp.
  const sensor = render({ kind: 'plan' }, { ...shared, dryers: [{ ...shared.dryers[0]!, programTime: { durationMinutes: 60, confidence: 'observed' as const, mode: 'sensor' as const } }] })
  expect(sensor).not.toContain('less to start')
  expect(sensor).toContain('Heavier pieces may come out damp.')
  // A checked size says the count plainly; no size says the fit was not checked. No knit: no hang offer.
  expect(render({ kind: 'plan' }, { ...shared, dryers: [{ ...shared.dryers[0]!, capacityConfidence: 'observed' }] })).toContain('>1 dryer run instead of 2<')
  const unchecked = render({ kind: 'plan' }, { ...shared, capacityUnits: null, share: { ...share, knitIds: [] } })
  expect(unchecked).toContain('1 dryer run instead of 2 · fit not checked')
  expect(unchecked).not.toContain('Hang the')
})

test('the mid-run check: counted down on the row, opened before the end with the named pieces first, three answers and no extra minutes', () => {
  const tee = piece('a', 'Blue tee', 'Washer 3', { kind: 't_shirt', bulkUnits: 0.5, status: 'drying', dryingRunId: 'run' as never })
  const towel = piece('c', 'Bath towel', 'Washer 3', { status: 'drying', dryingRunId: 'run' as never })
  const check = { at: 25 * 60_000, atMinute: 25, pieceIds: ['a'] as never, reasons: ['knit'], missed: false }
  const run = { runId: 'run' as never, dryerId: 'd4' as never, reminded: false, kind: 'dryer' as const, method: 'tumble' as const, startedAt: 0, minutes: 50, pieceIds: ['a', 'c'] as never, dryerName: 'Dryer 4', heatLabel: 'Hot', check }
  const data = queue({ pieces: [towel, tee], dryers: dryers.map((dryer) => ({ ...dryer, pricePerStart: 0.5 })), plan: { loads: [], natural: [], unset: [], mixedHeats: false }, runs: [run] })
  expect(runMark(run, 'Blue tee', 13 * 60_000)).toBe('Check in 12 min')
  expect(runMark(run, 'Blue tee', 26 * 60_000)).toBe('Check now: Blue tee')
  expect(runMark({ ...run, check: { ...check, missed: true } }, 'Blue tee', 26 * 60_000)).toBe('24 min left')
  expect(runMark(run, 'Blue tee', 51 * 60_000)).toBe('Time is up')
  expect(runMark({ ...run, check: undefined }, '', 26 * 60_000)).toBe('24 min left')
  expect(pieceNames([tee, tee, towel])).toBe('Blue tee, Bath towel')
  // The tag's heat, not My routine's, decides who is taken out.
  expect(midRunPiece(piece('r', 'Jeans', 'W', { maxHeat: 'high', labelMaxHeat: 'medium', routine: { method: 'tumble', heat: 'high' } as never }))).toMatchObject({ labelHeat: 'medium', routine: true })
  expect(midRunPiece(tee)).toEqual({ id: 'a', bulkUnits: 0.5, kind: 't_shirt', labelHeat: 'high', routine: false })

  const markup = renderToStaticMarkup(<DryingView queue={data} householdId="home" now={26 * 60_000} onBack={() => undefined} combine={false} onCombine={() => undefined} onCapacity={() => undefined} initialScreen={{ kind: 'check', runId: 'run' }} />)
  expect(markup).toContain('Take out early')
  // One plain instruction first, from what is chosen: the named tee hangs, the towel stays in.
  expect(markup).toContain('Take out the Blue tee and hang it. Leave the Bath towel in, Dryer 4 keeps going.')
  expect(markup.indexOf('Take out the Blue tee')).toBeLessThan(markup.indexOf('Take out now'))
  // The piece to take out shows what happens to it, with a small Change; the towel is one line, not a three-way choice.
  expect(markup).toContain('Hang it · from Washer 3')
  expect(markup).toContain('Bath towel stays in')
  expect(markup).not.toContain('aria-checked')
  expect(markup).toContain('>Change</button>')
  // The closing line says on what, and the price when the dryer has one, as one text string.
  expect(markup).toMatch(/<p[^>]*>Then close the door and press Start on Dryer 4\. Pay \$0\.50 if asked<\/p>/)
  // Each row sits in its own list item: no <li> inside another.
  expect(markup).toContain('<li')
  expect(markup).not.toMatch(/<li\b(?:(?!<\/li>)[\s\S])*<li\b/)
  expect(markup).toContain('Done, dryer keeps going')
  expect(markup).not.toContain('extra-minutes')
  expect(markup).not.toMatch(/damage|unsafe|too hot/i)
  assertPlainCopy(markup)

  // At or after the end it is today's check: named pieces first, and a missed check says knits may have shrunk.
  const late = renderToStaticMarkup(<DryingView queue={data} householdId="home" now={51 * 60_000} onBack={() => undefined} combine={false} onCombine={() => undefined} onCapacity={() => undefined} initialScreen={{ kind: 'check', runId: 'run' }} />)
  expect(late).toContain('Is it dry?')
  expect(late).toContain('The early check was missed. Tees may have shrunk a little; check the fit when you put them away.')
  const rows = late.indexOf('In Dryer 4')
  expect(late.indexOf('>Blue tee<', rows)).toBeGreaterThan(rows)
  expect(late.indexOf('>Blue tee<', rows)).toBeLessThan(late.indexOf('>Bath towel<', rows))
  assertPlainCopy(late)
})

test('the early-check callout says plainly when the reminder comes and what for', () => {
  expect(midCheckText.callout('White cotton tee', 25)).toBe('We’ll remind you in about 25 min to take out the White cotton tee.')
})

test('re-asking the queue (heat combining or dryer size changed) keeps the drying screen, not a loading gate that drops unsaved checks', () => {
  Object.assign(queryState, { value: queue(), reasking: true, asked: 0 })
  try {
    const markup = renderToStaticMarkup(<Drying householdId="home" now={0} onBack={() => undefined} />)
    expect(queryState.asked, 'the query answered, then re-asked').toBe(2)
    expect(markup).not.toContain('Loading')
    expect(markup).toContain('Bath towel')
  } finally {
    Object.assign(queryState, { value: [], reasking: false })
  }
})

test('while a changed combine or size choice reloads, no dryer, hanger, line, flat or share start comes from the stale plan', () => {
  const tee = piece('t1', 'Blue tee', 'Washer 3', { kind: 't_shirt', maxHeat: 'low', bulkUnits: 0.5 })
  const towel = piece('w1', 'Bath towel', 'Washer 3', { maxHeat: 'medium', bulkUnits: 1 })
  const sweater = piece('h1', 'Hung sweater', 'Washer 3', { method: 'heated_hanging', label: 'dry_flat', maxHeat: null })
  const shirt = piece('l1', 'Line shirt', 'Washer 3', { method: 'rack_line', maxHeat: null })
  const flat = piece('f1', 'Flat knit', 'Washer 3', { method: 'flat', label: 'dry_flat', maxHeat: null })
  const data = queue({ pieces: [tee, towel, sweater, shirt, flat], hangingDryers: [{ machineId: 'hang' as never, name: 'Hanger' }], dryers: [{ ...dryers[0]!, programTime: { durationMinutes: 45, confidence: 'observed' as const, mode: 'fixed' as const } }],
    capacityUnits: 4, capacities: [4], share: { separate: 2, together: 1, heat: 'low' as const, knitIds: ['t1'] },
    plan: { loads: [
      { heat: 'low', pieceIds: ['t1'], bulkUnits: 0.5, capacityUnits: 4, fit: 'fits', sources: ['Washer 3'], need: null },
      { heat: 'medium', pieceIds: ['w1'], bulkUnits: 1, capacityUnits: 4, fit: 'fits', sources: ['Washer 3'], need: null },
    ], natural: [{ pieceId: 'h1', method: 'heated_hanging' }, { pieceId: 'l1', method: 'rack_line' }, { pieceId: 'f1', method: 'flat' }], unset: [], mixedHeats: true } })
  const buttons = (markup: string, names: RegExp) => (markup.match(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<\/button>/g) ?? []).filter((button) => names.test(button))
  const disabled = (button: string) => /\bdisabled\b/.test(button.slice(0, button.indexOf('>')))
  const start = /Load into|Start drying|Hang the tees/
  const view = (reloading: boolean, screen: DryingScreen = { kind: 'plan' }) => renderToStaticMarkup(
    <DryingView queue={data} householdId="home" now={0} onBack={() => undefined} combine={false} onCombine={() => undefined} onCapacity={() => undefined} reloading={reloading} initialScreen={screen} />,
  )
  // Two dryer loads, hanger, line, flat and the share line's hang button all start enabled.
  const open = buttons(view(false), start)
  expect(open.length).toBe(6)
  expect(open.some(disabled)).toBe(false)
  const stale = buttons(view(true), start)
  expect(stale.length).toBe(6)
  expect(stale.every(disabled)).toBe(true)
  // The dryer screen's own start button is disabled while reloading (minutes are typed, so static markup cannot show it enabled).
  const dryerScreen: DryingScreen = { kind: 'dryer', number: 2, heat: 'medium', pieceIds: ['w1'], dryerId: 'd4' }
  const started = /started Dryer 4/
  const blocked = buttons(view(true, dryerScreen), started)
  expect(blocked.length).toBe(1)
  expect(disabled(blocked[0]!)).toBe(true)
})
