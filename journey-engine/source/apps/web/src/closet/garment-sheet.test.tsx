import { renderWithConvex as renderToStaticMarkup } from '@/test/markup'
import { expect, test, vi } from 'vitest'
import type { ComponentProps, ReactNode } from 'react'

import { DroppedOffSheet, GarmentSheet, markTreatToast, garmentSheetView, hamperActionMembers, laundryCareGroups, steamAnswer, type GarmentCalls, type GarmentSheetFacts } from '@/closet/garment-sheet'
import type { Care, Textile } from '@/household/inventory-types'
import { assertPlainCopy } from '@/kit/test-copy'
import { garmentCategoryPhoto } from '@/kit/garment-icon'

// The Facts rows each record shows, kept so a test can tap a row's Edit outside the static render.
const shownFacts = vi.hoisted(() => [] as { key: string; onEdit?: () => void }[][])
vi.mock('@/closet/closet-parts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/closet/closet-parts')>()
  return { ...actual, Facts: (props: ComponentProps<typeof actual.Facts>) => { shownFacts.push([...props.rows]); return actual.Facts(props) } }
})

const day = 86_400_000

test('photo-led records use matching category artwork without changing other garment identity', () => {
  expect(garmentCategoryPhoto('t_shirt', 'white')).toBe('/design/ivory-tee.png')
  expect(garmentCategoryPhoto('t_shirt', 'dark')).toBeUndefined()
  expect(garmentCategoryPhoto('towel', 'white')).toBeUndefined()
  const markup = renderToStaticMarkup(<GarmentSheet facts={facts([textile({ name: 'White tee', colorGroup: 'white' })])} calls={calls} onClose={() => undefined} onDone={() => undefined} onNext={() => undefined} />)
  expect(markup).toContain('has-photo-header')
  expect(markup).toContain('/design/ivory-tee.png')
  expect(markup).toContain('Edit item details')
})

test('saved owned garment records offer a header edit, while guest and planning records do not', () => {
  const render = (guest: boolean, planning?: ComponentProps<typeof GarmentSheet>['planning']) => renderToStaticMarkup(<GarmentSheet facts={facts([textile({ guest })])} calls={calls} planning={planning} onClose={() => undefined} onDone={() => undefined} onNext={() => undefined} />)
  expect(render(false)).toContain('aria-label="Edit item details"')
  expect(render(true)).not.toContain('aria-label="Edit item details"')
  expect(render(false, { selectedIds: [], onGroupCountChange: () => undefined })).not.toContain('aria-label="Edit item details"')
})
const now = new Date(2026, 8, 27, 15).getTime()
const time = (timestamp: number) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(timestamp)

const care = (overrides: Partial<Care> = {}): Care => ({
  material: null,
  washMethod: 'machine',
  cycle: 'normal',
  maxTemperatureC: 30,
  restrictions: [],
  dryMethod: 'tumble_dry',
  dryMethodInferred: false,
  dryHeat: null,
  ironSteam: 'allowed',
  status: 'confirmed',
  provenance: { source: 'tag_taps', confidence: 'observed' },
  ...overrides,
})

let next = 0
const textile = (overrides: Partial<Textile> = {}): Textile => ({
  textileId: `t${(next += 1)}` as Textile['textileId'],
  name: 'Soccer jersey',
  color: null,
  colorGroup: 'saturated',
  bulkUnits: null,
  firstWash: false,
  status: 'clean',
  soilLevel: null,
  inLoad: null,
  washCount: 1,
  fromFixture: false,
  kind: 't_shirt',
  wearerId: 'sam' as Textile['wearerId'],
  occasions: null,
  flag: null,
  statusSince: now - day,
  lastWornAt: now - day,
  wearsSinceClean: 0,
  lastCleanedAt: null,
  cleanerNote: null,
  cleanerPickupBy: null,
  identity: null,
  guest: false,
  createdAt: now - 30 * day,
  care: care(),
  ...overrides,
})

const facts = (members: Textile[], overrides: Partial<GarmentSheetFacts> = {}): GarmentSheetFacts => ({ members, wearerName: 'Sam', now, notWornDays: 90, doneAt: null, hangingSessionId: null, ...overrides })
const labels = (view: ReturnType<typeof garmentSheetView>) => view.actions.map((action) => action.label)

test('hamper actions isolate eligible pieces in a mixed record and exclude running loads', () => {
  const ready = textile()
  const hamper = textile({ status: 'dirty' })
  const washing = textile({ status: 'dirty', inLoad: 'running' as Textile['inLoad'] })
  const held = textile({ inLoad: 'running' as Textile['inLoad'] })
  const refreshing = textile({ status: 'needs_refresh' })
  const cleaner = textile({ status: 'at_cleaner' })
  const pieces = [hamper, washing, ready, held, refreshing, cleaner]
  expect(hamperActionMembers('dirty', pieces)).toEqual([ready])
  expect(hamperActionMembers('unflag', pieces)).toEqual([hamper])
  expect(hamperActionMembers('dirty', [hamper, washing])).toEqual([])
  expect(hamperActionMembers('unflag', [ready, refreshing])).toEqual([])
})

test('title, whose and colour, and the info lines', () => {
  const view = garmentSheetView(facts([textile({ wearsSinceClean: 2, lastWornAt: new Date(2026, 5, 3).getTime() })]))
  expect(view.title).toBe('Soccer jersey')
  expect(view.subtitle).toBe('Sam · Bright')
  expect(view.lines).toEqual(['Worn 2× since washed', 'Not worn since June'])
  expect(garmentSheetView(facts([textile({ wearerId: null })], { wearerName: null })).subtitle).toBe('Shared item · Bright')
})

test('a refresh need is available regardless of the tag; methods are checked later', () => {
  expect(labels(garmentSheetView(facts([textile()])))).toEqual(['Needs washing', 'Needs a refresh'])
  const refused = garmentSheetView(facts([textile({ care: care({ ironSteam: 'not_allowed' }) })])).actions[1]
  expect(refused).toEqual({ id: 'refresh', label: 'Needs a refresh' })
  const legacy = garmentSheetView(facts([textile({ care: care({ ironSteam: null, restrictions: ['Do not iron'] }) })])).actions[1]
  expect(legacy?.disabled).toBeUndefined()
  const unknown = garmentSheetView(facts([textile({ care: care({ ironSteam: null }) })])).actions[1]
  expect(unknown).toEqual({ id: 'refresh', label: 'Needs a refresh' })
  expect(steamAnswer([textile({ care: null })])).toBe('unknown')
  expect(steamAnswer([textile({ care: care({ ironSteam: 'allowed', ironHeat: 'low' }) })])).toBe('unknown')
  expect(steamAnswer([textile({ care: care({ steamPermission: 'allowed' }) })])).toBe('allowed')
  expect(steamAnswer([textile({ care: care({ steamPermission: 'not_allowed' }) })])).toBe('not_allowed')
  expect(steamAnswer([])).toBe('unknown')
})

test('every other state has its own buttons and status line', () => {
  const dirty = garmentSheetView(facts([textile({ status: 'dirty', soilLevel: 'heavy', flag: { reasons: ['mud_grass'], neededBy: now + 2 * day, flaggedBy: 'x', flaggedAt: now } })]))
  expect(dirty.lines).toEqual(['Waiting to wash · Grass or mud · Very dirty · needed Tue'])
  expect(labels(dirty)).toEqual(['Update care details', 'Washed it another way'])

  const refresh = garmentSheetView(facts([textile({ status: 'needs_refresh', care: care({ ironSteam: null }) })]))
  expect(refresh.actions).toEqual([{ id: 'refreshed', label: 'Refreshed' }, { id: 'wash_instead', label: 'Wash it instead' }])

  expect(labels(garmentSheetView(facts([textile({ status: 'needs_dry_clean' })])))).toEqual(['Dropped off'])
  const cleaner = garmentSheetView(facts([textile({ status: 'at_cleaner', statusSince: now - 15 * day, cleanerPickupBy: now + 8 * day })]))
  expect(cleaner.lines).toEqual(['At the cleaner since Sep 12 · pick up Oct 5'])
  expect(labels(cleaner)).toEqual(['Picked up'])

  const hanging = garmentSheetView(facts([textile({ status: 'hanging' })], { hangingSessionId: 's1' }))
  expect(hanging.lines).toEqual(['Hanging to dry since yesterday'])
  expect(hanging.actions).toEqual([{ id: 'all_dry', label: 'All dry', hint: 'Marks everything from that load as dry' }])

  const washing = garmentSheetView(facts([textile({ status: 'dirty', inLoad: 's2' as Textile['inLoad'] })], { doneAt: now + 3_600_000 }))
  expect(washing.lines).toEqual([`In the wash · done at ${time(now + 3_600_000)}`])
  expect(labels(washing)).toEqual(['Open'])
})

const calls = {} as GarmentCalls

test('Closet offers saved details and edit beside inventory facts, without ambiguous global quantities', () => {
  const markup = renderToStaticMarkup(<GarmentSheet facts={facts([textile({ care: care({ ironSteam: null }) }), textile()])} calls={calls} onClose={() => undefined} onDone={() => undefined} onNext={() => undefined} />)
  expect(markup).toContain('has-icon-header')
  expect(markup).toMatch(/class="sheet-header-art"[^>]*aria-hidden="true"><span class="sheet-media"><span class="garment-icon"/)
  expect(markup).not.toContain('<img')
  expect(markup).toContain('aria-label="Close"')
  expect(markup).toContain('<h2 id=')
  expect(markup).toContain('Bright · T-shirt · Sam')
  expect(markup).toContain('2 matching pieces')
  expect(markup).not.toContain('Next item')
  expect(markup).toContain('aria-label="Garment record"')
  expect(markup).not.toContain('How many are you changing?')
  expect(markup).toContain('Add to hamper')
  expect(markup).not.toContain('Pieces to update')
  expect(markup).toContain('Care label')
  expect(markup).not.toContain('Prepare for washing')
  expect(markup).toContain('>Details</button>')
  expect(markup).toContain('>History</button>')
  expect(markup).not.toContain('Check the tag for an iron symbol before steaming')
  expect(markup).toContain('Different care instructions')
  // The departure from Add to hamper is one quiet row, not a second button.
  expect(markup).toMatch(/data-garment-action="refresh:[^"]*"[^>]*>(?:(?!<\/button>).)*Needs a refresh/)
  assertPlainCopy(markup)
  const washing = renderToStaticMarkup(<GarmentSheet facts={facts([textile({ status: 'dirty', inLoad: 's2' as Textile['inLoad'] })])} calls={calls} onClose={() => undefined} onDone={() => undefined} onNext={() => undefined} />)
  expect(washing).toContain('href="/session/s2"')
})

test('saved records show grouped label notes without catalog or configuration controls', () => {
  const notes = (source: string) => ({ source, preparation: ['Turn inside out'], washing: [], beforeDrying: [], drying: [], afterDrying: [], ironing: [] })
  const bothPanels = (panels: { details: ReactNode; care: ReactNode }) => <>{panels.details}{panels.care}</>
  const render = (members: Textile[]) => renderToStaticMarkup(<GarmentSheet facts={facts(members)} calls={calls} renderRecord={bothPanels} onClose={() => undefined} onDone={() => undefined} onNext={() => undefined} />)
  const same = render([textile({ name: 'Oxford shirt', care: care({ instructions: notes('Sewn label') }) }), textile({ name: 'Oxford shirt', care: care({ instructions: notes('Sewn label') }) })])
  expect(same.match(/Source: Sewn label/g)).toHaveLength(1)
  expect(same.match(/Turn inside out/g)).toHaveLength(1)
  expect(same).not.toMatch(/Find manufacturer details|Record print details|role="switch"/)
  expect(same).not.toMatch(/Matching piece \d|piece · /)
  const differing = render([textile({ name: 'Oxford shirt', care: care({ instructions: notes('Sewn label') }) }), textile({ name: 'Oxford shirt', care: care({ instructions: notes('Maker website') }) }), textile({ name: 'Oxford shirt', care: care({ instructions: notes('Sewn label') }) })])
  expect(differing).toContain('2 pieces · label notes from Sewn label')
  expect(differing).toContain('1 piece · label notes from Maker website')
  expect(differing.match(/Source: Sewn label|Source: Maker website/g)).toHaveLength(2)
  expect(differing).not.toContain('Find manufacturer details')
  expect(differing).not.toMatch(/Matching piece \d/)
})

test('a washed stain asks "Stain gone?", then offers what next by fabric, with the cleaner first for delicate pieces', () => {
  const check = (answer?: 'lighter' | 'still_there' | 'worse', washes = 1) => ({ reason: 'food' as const, kind: 'protein' as const, tried: ['Stain spray'], washes, washedAt: now, ...(answer === undefined ? {} : { answer }) })
  const stainCalls: GarmentCalls = { ...calls, answerStainCheck: async (args) => ({ changed: args.textileIds.length }), resolveStain: async (args) => ({ changed: args.textileIds.length, skipped: 0 }), retire: async (args) => ({ changed: args.textileIds.length }) }
  const bothPanels = (panels: { details: ReactNode; care: ReactNode }) => <>{panels.details}{panels.care}</>
  const sheet = (members: Textile[], useCalls = stainCalls) => renderToStaticMarkup(<GarmentSheet facts={facts(members)} calls={useCalls} renderRecord={bothPanels} onClose={() => undefined} onDone={() => undefined} onNext={() => undefined} />)

  shownFacts.length = 0
  const asking = sheet([textile({ name: 'Work shirt', stainCheck: check() })])
  expect(shownFacts.flat().find((row) => row.key === 'stain-check')).toMatchObject({ label: 'Stain check', value: 'Food stain · not checked yet after 1 wash' })
  expect(shownFacts.flat().find((row) => row.key === 'stain-tried')).toMatchObject({ label: 'Pretreated with', value: 'Stain spray' })
  for (const answer of ['Gone', 'Lighter', 'Still there']) expect(asking).toContain(`>${answer}</button>`)
  expect(asking).not.toContain('Take it to a cleaner')
  assertPlainCopy(asking)

  // A sturdy fabric gets one more try, with a hint that a cleaner is safest for a valuable piece.
  const stayed = sheet([textile({ name: 'Work shirt', care: care({ material: 'cotton' }), stainCheck: check('still_there') })])
  expect(stayed.indexOf('Try once more')).toBeLessThan(stayed.indexOf('Take it to a cleaner'))
  expect(stayed).toContain('For a valuable piece, a cleaner is safest.')
  for (const choice of ['Keep as a known mark', 'Retire it']) expect(stayed).toContain(`>${choice}</span>`)
  // Four steps are one grouped list, the final one last.
  expect(stayed).toContain('aria-label="What next?"')
  expect(stayed.indexOf('Keep as a known mark')).toBeLessThan(stayed.indexOf('Retire it'))
  // An answered stain can still be marked gone, after a cleaner or a closer look; it is not asked again as lighter.
  expect(stayed).toContain('>Gone</button>')
  expect(stayed).not.toContain('>Lighter</button>')
  // Worse after a wash: the cleaner first and no home try, even on a sturdy fabric.
  const worse = sheet([textile({ name: 'Work shirt', care: care({ material: 'cotton' }), stainCheck: check('worse') })])
  expect(worse).not.toContain('Try once more')
  expect(worse.indexOf('Take it to a cleaner')).toBeLessThan(worse.indexOf('Keep as a known mark'))
  expect(worse).toContain('It got worse after washing, so a cleaner is the safest next step.')
  // Back in the hamper for wear, the open stain still shows with what to do next.
  const worn = sheet([textile({ name: 'Work shirt', status: 'dirty', flag: { reasons: ['worn'], flaggedBy: 'member', flaggedAt: now }, care: care({ material: 'cotton' }), stainCheck: check('worse') })])
  expect(worn).toContain('>Take it to a cleaner</span>')
  expect(worn).not.toContain('Try once more')
  // After its tries, no third attempt.
  expect(sheet([textile({ name: 'Work shirt', care: care({ material: 'cotton' }), stainCheck: check('still_there', 2) })])).not.toContain('Try once more')
  // Silk, wool, rayon and dry-clean-only pieces lead with the cleaner, say why, and get no home retry.
  for (const fabric of [{ material: 'silk' }, { material: 'wool' }, { material: 'rayon' }, { material: 'cotton', washMethod: 'dry_clean_only' as const }]) {
    const delicate = sheet([textile({ name: 'Blouse', care: care(fabric), stainCheck: check('still_there') })])
    expect(delicate).not.toContain('Try once more')
    expect(delicate.indexOf('Take it to a cleaner')).toBeLessThan(delicate.indexOf('Keep as a known mark'))
    expect(delicate).toContain('Silk, wool, rayon and dry-clean-only pieces are safest with a cleaner.')
  }
  // With no fabric recorded, there is no home retry until it is.
  const unknown = sheet([textile({ name: 'Work shirt', stainCheck: check('still_there') })])
  expect(unknown).not.toContain('Try once more')
  expect(unknown).toContain('Record every fiber to see whether one more try at home is safe.')
  assertPlainCopy(unknown)
  expect(sheet([textile({ name: 'Work shirt', care: care({ material: 'other' }), stainCheck: check('still_there') })])).toContain('Record every fiber to see whether one more try at home is safe.')
  // What the app recorded as tried reads as product names.
  shownFacts.length = 0
  sheet([textile({ name: 'Work shirt', stainCheck: { ...check('still_there'), tried: [{ name: 'Enzyme spray', supplyId: 's1', chemistry: 'protease', washedOut: true }, 'Dish soap'] } })])
  expect(shownFacts.flat().find((row) => row.key === 'stain-check')).toMatchObject({ value: 'Food stain · still there after 1 wash' })
  expect(shownFacts.flat().find((row) => row.key === 'stain-tried')).toMatchObject({ value: 'Enzyme spray, Dish soap' })
  // On matching pieces, the row and the question say how many pieces the answer covers.
  shownFacts.length = 0
  const matching = sheet([textile({ name: 'Tee', stainCheck: check() }), textile({ name: 'Tee', stainCheck: check() }), textile({ name: 'Tee' })])
  expect(shownFacts.flat().find((row) => row.key === 'stain-check')).toMatchObject({ value: 'Food stain · on 2 of 3 · not checked yet after 1 wash' })
  expect(shownFacts.flat().find((row) => row.key === 'stain-tried')).toMatchObject({ value: 'Stain spray' })
  expect(matching).toContain('Stain gone on 2 of 3?')
  // Still drying: decide once it is dry. A preview without calls only shows the row.
  expect(sheet([textile({ name: 'Work shirt', status: 'hanging', stainCheck: check('lighter') })])).not.toContain('Keep as a known mark')
  expect(sheet([textile({ name: 'Work shirt', stainCheck: check() })], calls)).not.toContain('Stain gone?')
})

test('a known mark shows on the care tab with treat and remove actions for the marked pieces', async () => {
  const mark = { reason: 'food' as const, kind: 'unknown' as const, recordedAt: now }
  const marked = [textile({ name: 'Linen shirt', knownStain: mark }), textile({ name: 'Linen shirt', knownStain: mark })]
  const members = [...marked, textile({ name: 'Linen shirt' })]
  const treated: unknown[] = []
  const removed: unknown[] = []
  const markCalls: GarmentCalls = { ...calls, treatKnownStain: async (args) => { treated.push(args); return { changed: args.textileIds.length, toDryClean: [] } }, removeKnownStain: async (args) => { removed.push(args); return { changed: args.textileIds.length } } }
  const bothPanels = (panels: { details: ReactNode; care: ReactNode }) => <>{panels.details}{panels.care}</>
  shownFacts.length = 0
  const markup = renderToStaticMarkup(<GarmentSheet facts={facts(members)} calls={markCalls} renderRecord={bothPanels} onClose={() => undefined} onDone={() => undefined} onNext={() => undefined} />)
  expect(shownFacts.flat().find((row) => row.key === 'mark')).toMatchObject({ label: 'Known mark', value: 'Old food stain · on 2 of 3' })
  expect(markup).toContain('>Try treating it at the next wash</button>')
  expect(markup).toContain('>Remove mark</button>')
  expect(markup).toContain('Old stains may not come out, even after treating.')
  assertPlainCopy(markup)
  // Without the calls (a preview), the mark is shown but offers nothing.
  const bare = renderToStaticMarkup(<GarmentSheet facts={facts(marked)} calls={calls} renderRecord={bothPanels} onClose={() => undefined} onDone={() => undefined} onNext={() => undefined} />)
  expect(bare).not.toContain('Remove mark')
  // No mark, no row.
  shownFacts.length = 0
  renderToStaticMarkup(<GarmentSheet facts={facts([textile()])} calls={markCalls} renderRecord={bothPanels} onClose={() => undefined} onDone={() => undefined} onNext={() => undefined} />)
  expect(shownFacts.flat().some((row) => row.key === 'mark')).toBe(false)
  // Pieces in a running load can't be treated, so treat is hidden; remove stays.
  const busy = renderToStaticMarkup(<GarmentSheet facts={facts(marked.map((member) => ({ ...member, inLoad: 'session-1' as Textile['inLoad'] })))} calls={markCalls} renderRecord={bothPanels} onClose={() => undefined} onDone={() => undefined} onNext={() => undefined} />)
  expect(busy).not.toContain('Try treating it at the next wash')
  expect(busy).toContain('>Remove mark</button>')
  expect(markTreatToast(0, 0)).toBeNull()
  expect(markTreatToast(2, 0)).toBe('2 items are in the hamper to try treating. It may not come out.')
  expect(markTreatToast(1, 1)).toBe('It’s on the dry cleaning list. It may not come out.')
})

test('a stored Grey reads as Gray in the kicker and color fact', () => {
  shownFacts.length = 0
  const markup = renderToStaticMarkup(<GarmentSheet facts={facts([textile({ name: 'Grey tee', color: 'Grey', colorGroup: 'medium' })])} calls={calls} renderRecord={(panels) => panels.details} onClose={() => undefined} onDone={() => undefined} onNext={() => undefined} />)
  expect(markup).toContain('Gray · T-shirt · Sam')
  expect(shownFacts.flat().find((row) => row.key === 'color')).toMatchObject({ value: 'Gray' })
})

test('a record row opens Edit at its answer, over the record when the Closet supplies the editor', () => {
  const members = [textile(), textile()]
  const tap = (key: string) => shownFacts.flat().find((row) => row.key === key)!.onEdit!()
  const handed: unknown[] = []
  shownFacts.length = 0
  const bothPanels = (panels: { details: ReactNode; care: ReactNode }) => <>{panels.details}{panels.care}</>
  renderToStaticMarkup(<GarmentSheet facts={facts(members)} calls={calls} renderRecord={bothPanels} onClose={() => undefined} onDone={() => undefined} onNext={(next) => handed.push(next)} />)
  const textileIds = members.map((member) => member.textileId)
  for (const key of ['type', 'whose', 'color', 'dye', 'quantity', 'sort', 'tags']) tap(key)
  // Without an editor slot, Edit is handed back to replace the record (Laundry's route).
  expect(handed).toEqual([
    { kind: 'edit', textileIds, focusField: 'kind' },
    { kind: 'edit', textileIds, focusField: 'whose' },
    { kind: 'edit', textileIds, focusField: 'color' },
    { kind: 'edit', textileIds, focusField: 'dyeRun' },
    { kind: 'edit', textileIds, focusField: 'quantity' },
    { kind: 'edit', textileIds, focusField: 'color' },
    { kind: 'edit', textileIds },
  ])

  // With the Closet's editor, the record stays and nothing replaces it; the editor is not open until a row is tapped.
  const opened: unknown[] = []
  handed.length = 0
  shownFacts.length = 0
  const markup = renderToStaticMarkup(<GarmentSheet facts={facts(members)} calls={calls} renderRecord={bothPanels} renderEdit={(edit) => { opened.push(edit); return <p>Editor</p> }} onClose={() => undefined} onDone={() => undefined} onNext={(next) => handed.push(next)} />)
  expect(markup).not.toContain('<p>Editor</p>')
  tap('color')
  expect(handed).toEqual([])
})

test('a waiting Closet item links to Laundry and records care done outside the app', () => {
  const markup = renderToStaticMarkup(<GarmentSheet facts={facts([textile({ textileId: 't123' as Textile['textileId'], status: 'dirty' })])} calls={calls} onClose={() => undefined} onDone={() => undefined} onNext={() => undefined} />)
  expect(markup).toContain('href="/laundry?item=t123"')
  expect(markup).toContain('1 in the hamper')
  expect(markup).not.toContain('Update care details')
  expect(markup).not.toContain('Washed it another way')
  expect(markup).toContain('Record a wash')
  expect(markup).toContain('Remove from hamper')
  expect(markup).not.toContain('Needs a refresh')
})

test('unchecked care is one compact reminder, with the checking action preserved', () => {
  const markup = renderToStaticMarkup(<GarmentSheet facts={facts([textile({ identity: { brand: 'AS Colour' }, status: 'dirty', care: care({ status: 'needs_confirmation' }) })])} calls={calls} onClose={() => undefined} onDone={() => undefined} onNext={() => undefined} />)
  expect(markup).toContain('Bright · T-shirt · Sam')
  expect(markup).toContain('1 in the hamper')
  expect(markup).toContain('>Check care label</button>')
  expect(markup.match(/>Care label not checked</g)).toHaveLength(1)
  expect(markup).not.toContain('>Needs confirmation</')
  expect(markup).not.toContain('role="alert"')
})

test('Laundry shows wash quantities and named needs, with care editing on demand', () => {
  const members = [textile({ status: 'dirty', soilLevel: 'heavy', flag: { reasons: ['food'], neededBy: now + day, stainNote: 'Sleeve', flaggedBy: 'x', flaggedAt: now } }), textile({ status: 'dirty' })]
  const markup = renderToStaticMarkup(<GarmentSheet facts={facts(members)} calls={calls} planning={{ selectedIds: [members[0]!.textileId], onGroupCountChange: () => undefined }} onClose={() => undefined} onDone={() => undefined} onNext={() => undefined} />)
  expect(markup).toContain('Wash now')
  expect(markup).toContain('Food or drink · Sleeve')
  expect(markup).toContain('Everyday wear')
  expect(markup).toContain('Edit stains and notes')
  expect(markup).toContain('Add stains or a note')
  expect(markup).not.toContain('How dirty?')
  expect(markup).not.toContain('Save care details')
  expect(markup).toContain('>Done</button>')
  expect(markup).toContain('Remove from hamper')
  expect(markup).toContain('1 item selected. Anything you don’t choose stays in the hamper.')
  expect(markup).not.toContain('Piece 1')
  expect(markup).not.toContain('In this wash')
  expect(markup).not.toContain('Record a wash')
  expect(markup).not.toContain('Pieces to update')
  expect(markup).not.toContain('Update care details')
  expect(markup).not.toContain('<dt>Wash history</dt>')
})

test('care groups keep identical needs together across purchase and wash histories', () => {
  const members = [textile({ status: 'dirty', firstWash: true, washCount: 0 }), textile({ status: 'dirty', washCount: 8, createdAt: now - 200 * day })]
  const groups = laundryCareGroups(members, now)
  expect(groups).toHaveLength(1)
  expect(groups[0]!.members.map((member) => member.textileId)).toEqual(members.map((member) => member.textileId))
  expect(members.map((member) => member.washCount)).toEqual([0, 8])
})

test('different stains, locations, soil and deadlines stay in separate care groups', () => {
  const flag: NonNullable<Textile['flag']> = { reasons: ['food'], stainNote: 'Collar', flaggedBy: 'x', flaggedAt: now }
  const members = [textile({ status: 'dirty', flag }), textile({ status: 'dirty', flag: { ...flag, reasons: ['worn', 'food'] } }), textile({ status: 'dirty', flag: { ...flag, stainNote: 'Sleeve' } }), textile({ status: 'dirty', flag: { ...flag, neededBy: now + day } }), textile({ status: 'dirty', flag, soilLevel: 'light' })]
  const groups = laundryCareGroups(members, now)
  expect(groups.map((group) => group.members.map((member) => member.textileId))).toEqual([members.slice(0, 2).map((member) => member.textileId), [members[2]!.textileId], [members[3]!.textileId], [members[4]!.textileId]])
  expect(groups[1]!.label).toContain('Sleeve')
  expect(groups[2]!.label).toContain('Needed')
})

test('matching packs stay one quantity group regardless of purchase dates or past washes', () => {
  const members = Array.from({ length: 10 }, (_, index) => textile({ textileId: `shirt-${index}` as Textile['textileId'], status: 'dirty', createdAt: now - (index < 5 ? 200 : 2) * day, washCount: index < 5 ? 8 : 0, firstWash: index >= 5 }))
  expect(laundryCareGroups(members, now)).toHaveLength(1)
  expect(laundryCareGroups(members, now)[0]!.members).toHaveLength(10)
  const markup = renderToStaticMarkup(<GarmentSheet facts={facts(members)} calls={calls} onClose={() => undefined} onDone={() => undefined} onNext={() => undefined} />)
  expect(markup).toContain('10 matching pieces')
  expect(markup).toContain('10 in the hamper')
  expect(markup).not.toContain('Different histories')
  expect(markup).not.toContain('Piece 1')
})

test('Dropped off asks for an optional note and pick-up day', () => {
  const markup = renderToStaticMarkup(<DroppedOffSheet garments={[{ textileId: 't1', name: 'Navy blazer' }]} now={now} dropped={async () => ({ changed: 1, skipped: 0 })} onClose={() => undefined} onDone={() => undefined} />)
  expect(markup).toContain('Note (optional)')
  expect(markup).toContain('placeholder="Tell them about the stain"')
  expect(markup).toContain('Pick up by (optional)')
  expect(markup).toContain('type="date"')
  assertPlainCopy(markup)
  // A stain sent to the cleaner shows its note, ready to hand over.
  const note = 'Food or drink stain after 1 wash. Tried Enzyme spray.'
  expect(renderToStaticMarkup(<DroppedOffSheet garments={[{ textileId: 't1', name: 'Navy blazer', cleanerNote: note }]} now={now} dropped={async () => ({ changed: 1, skipped: 0 })} onClose={() => undefined} onDone={() => undefined} />)).toContain(`value="${note}"`)
})
