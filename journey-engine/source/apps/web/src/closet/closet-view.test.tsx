import { glanceCounts } from '@/closet/closet-glance'
import { renderWithConvex as renderToStaticMarkup } from '@/test/markup'
import { expect, test, vi } from 'vitest'
import type { ComponentProps } from 'react'

import { ClosetView, chosenWearer, hangerLabel, hangingSession, matchesClosetSearch, needsYouView, topSlotView, wearerChipFrom, wearerChipValue, type Attention, type ClosetCalls, type ClosetViewProps, type Sessions, type Today } from '@/closet/closet-view'
import { closetRails } from '@/closet/closet-groups'
import { consolidatedClosetTiles } from '@/closet/closet-view'
import type { Textile } from '@/household/inventory-types'
import { assertPlainCopy, readableText } from '@/kit/test-copy'
import { WornChip } from '@/kit/ui'

// The editor slot each record is given, kept so a test can open Edit outside the static render.
const recordEditors = vi.hoisted(() => [] as unknown[])
vi.mock('@/closet/garment-sheet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/closet/garment-sheet')>()
  return { ...actual, GarmentSheet: (props: ComponentProps<typeof actual.GarmentSheet>) => { recordEditors.push(props.renderEdit); return actual.GarmentSheet(props) } }
})

const day = 86_400_000
const hour = 3_600_000
// A Sunday afternoon.
const now = new Date(2026, 8, 27, 15).getTime()
const time = (timestamp: number) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(timestamp)

let next = 0
const textile = (overrides: Partial<Textile> = {}): Textile => ({
  textileId: `t${(next += 1)}` as Textile['textileId'],
  name: 'Navy tee',
  color: 'Navy',
  colorGroup: 'dark',
  bulkUnits: null,
  firstWash: false,
  status: 'clean',
  soilLevel: null,
  inLoad: null,
  washCount: 3,
  fromFixture: false,
  kind: 't_shirt',
  wearerId: 'sam' as Textile['wearerId'],
  occasions: null,
  flag: null,
  statusSince: now - 2 * day,
  lastWornAt: now - day,
  wearsSinceClean: 0,
  lastCleanedAt: now - 3 * day,
  cleanerNote: null,
  cleanerPickupBy: null,
  identity: null,
  guest: false,
  createdAt: now - 200 * day,
  care: null,
  ...overrides,
})

const wearers = [
  { wearerId: 'sam', name: 'Sam', kind: 'child', principalKey: null },
  { wearerId: 'alex', name: 'Alex', kind: 'adult', principalKey: 'me' },
] as unknown as ClosetViewProps['inventory']['wearers']

const today = (overrides: Partial<Today> = {}): Today => ({
  ready: [],
  readyCount: 2,
  notReadyForOccasion: [],
  notReady: { dirty: 1, in_wash: 0, hanging: 0, needs_dry_clean: 0, at_cleaner: 0, needs_refresh: 0 },
  notWornDays: 90,
  ...overrides,
})

const attention = (overrides: Partial<Attention> = {}): Attention => ({ hamper: { count: 0, loads: null, handWash: 0 }, top: null, cards: [], ...overrides })

const facts = { status: 'running' as const, machineStartedAt: null, washFinishAt: null, washFinishedAt: null, dryerStartedAt: null, dryMinutes: null, hasDrying: false, dryerStepRecorded: false, dryerUnloaded: false }

const resolved = async () => ({ changed: 1, skipped: 0 })
const calls = {
  markWorn: resolved,
  setRefresh: resolved,
  unflag: resolved,
  refreshed: resolved,
  pickedUp: resolved,
  allDry: async () => ({ changed: 1 }),
  droppedAtCleaner: resolved,
  flagDirty: async () => ({ changed: 1, skipped: 0, toDryClean: [], alerted: false }),
  washedElsewhere: resolved,
} as unknown as ClosetCalls

const render = (overrides: Partial<ClosetViewProps> = {}) => renderToStaticMarkup(
  <ClosetView
    now={now}
    attention={attention()}
    today={today()}
    inventory={{ textiles: [textile(), textile({ name: 'Jeans', kind: 'pants', wearsSinceClean: 2 }), textile({ name: 'Soccer jersey', status: 'dirty', soilLevel: 'heavy' })], wearers }}
    sessions={[]}
    meWearerId="alex"
    wearerChip="everyone"
    onWearerChip={() => undefined}
    calls={calls}
    addClothes={() => null}
    {...overrides}
  />,
)

/** The profile selector is visible above the garment groups. */
const scopeSelect = (markup: string) => /<select[^>]*aria-label="Whose clothes"[^>]*>[\s\S]*?<\/select>/.exec(markup)?.[0] ?? ''
const chosenCircle = (markup: string) => /<option value="[^"]+" selected="">([^<]+)<\/option>/.exec(scopeSelect(markup))?.[1]

test('Closet search matches garment details and wearer without matching unrelated clothes', () => {
  const [rail] = closetRails([textile({ identity: { brand: 'AS Colour', size: 'M', styleNumber: '5001R' } })], ['sam'], {}, now, 90)
  const tile = rail!.sections[0]!.tiles[0]!
  expect(matchesClosetSearch(tile, 'Sam', '  5001r ')).toBe(true)
  expect(matchesClosetSearch(tile, 'Sam', 'as colour')).toBe(true)
  expect(matchesClosetSearch(tile, 'Sam', 'sam')).toBe(true)
  expect(matchesClosetSearch(tile, 'Sam', 'jeans')).toBe(false)
})

test('Saved search finds only recorded fibers, qualifiers and construction without changing care', () => {
  const item = textile({ care: { material: '90% cotton, 10% spandex', fabricDetails: { fibers: [{ fiber: 'cotton', details: ['Supima'] }], construction: ['Jersey'], finishes: ['Pre-shrunk'] } } as Textile['care'] })
  const before = JSON.stringify(item)
  const tile = closetRails([item], ['sam'], {}, now, 90)[0]!.sections[0]!.tiles[0]!
  for (const word of ['supima', 'cotton', 'elastane', 'spandex', 'jersey', 'pre-shrunk']) expect(matchesClosetSearch(tile, '', word)).toBe(true)
  for (const word of ['silk', 'Henley', 'Egyptian']) expect(matchesClosetSearch(tile, '', word)).toBe(false)
  expect(JSON.stringify(item)).toBe(before)
})

test('Trash stays reachable from Closet and offers recovery before deletion', () => {
  const trash = [{ textileId: 't9' as never, name: 'Old tee', color: 'Blue', deleteAt: now + day }]
  expect(render({ trash })).toContain('Trash · 1')
  const sheet = render({ trash, initialSheet: { kind: 'trash' } })
  expect(sheet).toContain('Old tee')
  expect(sheet).toContain('Restore')
})

test('the top slot says what is running, needed, wet or waiting, with its one button', () => {
  expect(topSlotView({ kind: 'running', sessionId: 's1' as never, facts }, now)).toMatchObject({ title: 'Load started', button: 'Open', link: { to: 'session', sessionId: 's1' } })
  const washing = { ...facts, machineStartedAt: now - hour, washFinishAt: now + hour }
  expect(topSlotView({ kind: 'running', sessionId: 's1' as never, facts: washing }, now).title).toBe(`Washing · done at ${time(now + hour)}`)
  expect(topSlotView({ kind: 'running', sessionId: 's1' as never, facts: { ...washing, washFinishAt: null } }, now).title).toBe('Washing')
  expect(topSlotView({ kind: 'running', sessionId: 's1' as never, facts: { ...washing, washFinishAt: now - 1 } }, now).title).toBe('Wash is done. Time to move it')
  const drying = { ...washing, hasDrying: true, dryerStartedAt: now - hour, dryMinutes: 90 }
  expect(topSlotView({ kind: 'running', sessionId: 's1' as never, facts: drying }, now).title).toBe(`Drying · check at ${time(now + 30 * 60_000)}`)
  expect(topSlotView({ kind: 'running', sessionId: 's1' as never, facts: { ...drying, dryMinutes: null } }, now).title).toBe('Drying')
  expect(topSlotView({ kind: 'running', sessionId: 's1' as never, facts: { ...drying, dryerUnloaded: true } }, now).title).toBe('Check dryness')

  expect(topSlotView({ kind: 'needed', textileId: 't1' as never, name: 'Soccer jersey', neededBy: now + 3 * hour }, now)).toEqual({ title: 'Soccer jersey is needed today', link: { to: 'laundry' }, button: 'Plan laundry', tone: 'hamper' })
  expect(topSlotView({ kind: 'needed', textileId: 't1' as never, name: 'Soccer jersey', neededBy: now + day }, now).title).toBe('Soccer jersey is needed tomorrow')
  expect(topSlotView({ kind: 'wet', count: 1, name: 'Swimsuit', since: now - day }, now).title).toBe('Wet Swimsuit since yesterday')
  expect(topSlotView({ kind: 'wet', count: 3, since: now - 2 * day }, now).title).toBe('Wet 3 laundry items since Fri')
  expect(topSlotView({ kind: 'hamper', count: 14, loads: 2 }, now).title).toBe('14 laundry items · about 2 washes')
  expect(topSlotView({ kind: 'hamper', count: 1, loads: 1 }, now).title).toBe('1 laundry item · about 1 wash')
  // No current plan: the load estimate is left out, never guessed.
  expect(topSlotView({ kind: 'hamper', count: 14, loads: null }, now).title).toBe('14 laundry items')
})

test('the top slot is docked low with its button, and absent when nothing needs you', () => {
  const markup = render({ attention: attention({ top: { kind: 'wet', count: 3, since: now - day } }) })
  expect(markup).toContain('<div class="primary-dock"><section class="now-card closet-now')
  expect(markup).toContain('<p class="closet-now-title">Wet 3 laundry items since yesterday</p><a class="button" href="/laundry">Plan laundry</a>')
  expect(render()).not.toContain('primary-dock')
  // The hamper and running loads are laundry day's next step: the dock above the tabs has them.
  expect(render({ attention: attention({ top: { kind: 'hamper', count: 3, loads: null } }) })).not.toContain('primary-dock')
})

test('Needs you cards: one line and one button each', () => {
  const nameOf = (id: string) => ({ t1: 'Swimsuit', t2: 'Navy blazer' })[id] ?? null
  expect(needsYouView({ kind: 'hanging', sessionId: 's1' as never, since: now - hour }, now, nameOf)).toEqual({ text: 'Today’s load is hanging to dry', action: 'all_dry' })
  expect(needsYouView({ kind: 'hanging', sessionId: 's1' as never, since: now - day }, now, nameOf).text).toBe('Yesterday’s load is hanging to dry')
  expect(needsYouView({ kind: 'hanging', sessionId: 's1' as never, since: now - 3 * day }, now, nameOf).text).toBe('Thu’s load is hanging to dry')
  expect(needsYouView({ kind: 'wet', textileIds: ['t1' as never], since: now - 2 * day }, now, nameOf)).toEqual({ text: 'Wet Swimsuit has been in the hamper since Fri', action: 'make_loads' })
  expect(needsYouView({ kind: 'hamper', count: 5, since: now - 8 * day }, now, nameOf)).toEqual({ text: '5 laundry items have been in the hamper since Sep 19', action: 'make_loads' })
  expect(needsYouView({ kind: 'cleaner', textileIds: ['t2' as never], since: now - 15 * day }, now, nameOf)).toEqual({ text: 'Navy blazer at the cleaner since Sep 12', action: 'picked_up' })

  const markup = render({ attention: attention({ cards: [{ kind: 'hanging', sessionId: 's1' as never, since: now - day }, { kind: 'hamper', count: 2, since: now - 8 * day }] }) })
  // Each card is one row you tap; screen readers hear its whole text, then its action.
  expect(markup).toMatch(/<button type="button" class="[^"]*">(?:(?!aria-label|<\/button>).)*Yesterday’s load is hanging to dry(?:(?!aria-hidden|<\/button>).)*All dry/)
  expect(markup).toMatch(/<a class="[^"]*" href="\/laundry">(?:(?!aria-hidden|<\/a>).)*2 laundry items have been in the hamper since Sep 19(?:(?!aria-hidden|<\/a>).)*Plan laundry/)
})

test('filters with no match offer a reset', () => {
  const markup = render({ initialFilters: { kinds: ['suit'], tags: ['Work'] } })
  expect(markup).toContain('Work')
  expect(markup).toContain('No clothes match your search or filters.')
  expect(markup).toContain('>Reset filters</button>')
})

test('garment rows show owner, count and care state without a false hanger', () => {
  const markup = render({
    inventory: {
      wearers,
      textiles: [
        textile(),
        textile({ wearsSinceClean: 3 }),
        textile({ name: 'Soccer jersey', status: 'dirty' }),
        textile({ name: 'Bath towel', kind: 'towel', wearerId: null, colorGroup: 'white' }),
        textile({ name: 'Guest shirt', guest: true, wearerId: null }),
      ],
    },
  })
  expect(chosenCircle(markup)).toBe('Everyone')
  expect(markup).toContain('2 ready')
  expect(markup).toContain('1 hamper')
  expect(markup).toContain('aria-label="Sam, Navy tee, 2, ready, worn 3 times since washed, Needs label"')
  expect(markup).toContain('Navy · Sam · 2 ready')
  expect(markup).toContain('Navy tee ×2')
  expect(markup).toContain('aria-label="Sam, Soccer jersey, waiting to wash, Needs label"')
  expect(markup).toContain('class="garment-icon"')
  expect(markup).toContain('data-colour="dark"')
  expect(markup.match(/class="record-row"[\s\S]*?<\/li>/g)?.join('')).not.toContain('<img')
  expect(markup).not.toContain('garment-hook')
  expect(markup).not.toContain('Guest shirt')
  assertPlainCopy(markup)
})

test('overview consolidates matching states but care choices keep colours and wearers apart', () => {
  const garments = [textile({textileId:'a' as never}),textile({textileId:'b' as never,status:'dirty'}),textile({color:'Red'}),textile({wearerId:'alex' as never})]
  const rows = closetRails(garments, ['sam','alex'], {}, now, 90).flatMap((rail)=>rail.sections.flatMap((section)=>section.tiles.map((tile)=>({tile,owner:rail.wearerId??''}))))
  const groups = consolidatedClosetTiles(rows)
  expect(groups).toHaveLength(3)
  const navy = groups.find((group)=>group.tile.members.some((member)=>member.textileId==='a'))!
  expect(navy.tile.members.map((member)=>member.textileId)).toEqual(['a','b'])
  expect(navy.states.map((state)=>[state.state,state.members.length])).toEqual([['ready',1],['dirty',1]])
  const markup=render({inventory:{textiles:garments,wearers},initialSheet:{kind:'group',textileIds:['a','b']}})
  expect(markup).toContain('2 matching pieces')
  expect(markup).toContain('1 ready')
  expect(markup).toContain('1 in the hamper')
  expect(markup).not.toContain('>Needs washing</strong>')
  expect(markup).toContain('href="/laundry?item=b"')
  expect(markup).not.toContain('2 in the hamper')
})

test('a one-wearer household puts shared items in the same ready list', () => {
  // Mirrors hamperGroups' fix in laundry-pass.test.ts: a one-wearer household has nobody to share
  // with, so the towel with no wearer set hangs as Sam's, not on a separate "Shared" rail.
  const markup = render({
    inventory: {
      wearers: wearers.slice(0, 1),
      textiles: [textile(), textile({ name: 'Bath towel', kind: 'towel', wearerId: null, colorGroup: 'white' })],
    },
  })
  expect(markup).not.toContain('Shared (towels, sheets)')
  expect(chosenCircle(markup)).toBe('Everyone')
  expect(markup).toContain('aria-label="Navy tee, ready, Needs label"')
  expect(markup).toContain('aria-label="Bath towel, ready, Needs label"')
})

test('not-worn age remains in the garment’s accessible name', () => {
  const old = { lastWornAt: new Date(2026, 5, 10).getTime(), lastCleanedAt: null }
  const markup = render({ inventory: { wearers, textiles: [textile({ name: 'Linen shirt', kind: 'shirt', ...old })] } })
  expect(markup).toContain('aria-label="Linen shirt, ready, not worn since June, Needs label"')
  expect(markup).not.toContain('Needs you')
  // Never worn or washed: counted from when it was added.
  const added = render({ inventory: { wearers, textiles: [textile({ name: 'New coat', lastWornAt: null, lastCleanedAt: null, createdAt: now - 100 * day })] } })
  expect(added).toContain('not worn since June')
  const fresh = render({ inventory: { wearers, textiles: [textile({ name: 'New coat', lastWornAt: null, lastCleanedAt: null, createdAt: now - 3 * day })] } })
  expect(fresh).not.toContain('not worn since')
})

test('owner stays visible and grouping stays in the management control, with no duplicate personal profile', () => {
  const markup = render({ initialFilters: { kinds: ['shirt'], tags: [] } })
  const profiles = scopeSelect(markup)
  const at = (name: string) => profiles.indexOf(`>${name}</option>`)
  expect(at('Me')).toBeGreaterThan(-1)
  expect(at('Me')).toBeLessThan(at('Sam'))
  expect(at('Sam')).toBeLessThan(at('Shared'))
  expect(at('Shared')).toBeLessThan(at('Everyone'))
  expect(markup).not.toContain('aria-label="Family closets"')
  expect(profiles).not.toContain('Alex')
  expect(markup).not.toContain('Whose clothes<select>')
  expect(markup.indexOf('aria-label="Closet filters and management"')).toBeLessThan(markup.indexOf('aria-label="Group clothes by"'))
  expect(markup.indexOf('aria-label="Whose clothes"')).toBeLessThan(markup.indexOf('aria-label="Manage closet"'))
  expect(markup).toContain('aria-label="Manage closet"')
  expect(readableText(markup)).toContain('by type')
  expect(markup).toContain('care-feature')
  expect(markup).toContain('aria-label="Your clothes at a glance"')
  expect(markup).not.toContain('Any occasion')
})

test('profile filters round-trip including shared clothes', () => {
  expect(chosenWearer('everyone', 'alex', ['alex'])).toBeUndefined()
  expect(chosenWearer('me', 'alex', ['alex'])).toBe('alex')
  expect(chosenWearer('me', null, ['alex'])).toBeUndefined()
  expect(chosenWearer({ wearerId: 'sam' }, null, ['alex', 'sam'])).toBe('sam')
  expect(chosenWearer({ wearerId: 'gone' }, null, ['alex'])).toBeUndefined()
  expect(chosenWearer('shared', 'alex', ['alex'])).toBeNull()
  for (const chip of ['everyone', 'me', 'shared', { wearerId: 'sam' }] as const) expect(wearerChipFrom(wearerChipValue(chip))).toEqual(chip)
})

test('personal, family and shared closets show only their clothes and their readiness counts', () => {
  const inventory = { wearers, textiles: [textile({ name: 'Personal shirt', wearerId: 'alex' as never }), textile({ name: 'Sam shirt' }), textile({ name: 'Shared towel', wearerId: null }), textile({ name: 'Old owner towel', wearerId: 'gone' as never })] }
  const mine = render({ inventory, wearerChip: 'me' })
  expect(mine).toContain('Closet</h1>')
  expect(mine).toContain('aria-label="Personal shirt, ready, Needs label"')
  expect(mine).not.toContain('aria-label="Sam shirt, ready, Needs label"')
  expect(mine).toContain('1 ready')
  const shared = render({ inventory, wearerChip: 'shared' })
  expect(chosenCircle(shared)).toBe('Shared')
  expect(shared).toContain('aria-label="Shared towel, ready, Needs label"')
  expect(shared).toContain('aria-label="Old owner towel, ready, Needs label"')
  expect(shared).not.toContain('aria-label="Personal shirt, ready, Needs label"')
  expect(shared.match(/, ready, Needs label"/g)).toHaveLength(2)
  const unlinked = render({ inventory, wearerChip: 'me', meWearerId: null })
  expect(unlinked).toContain('Choose your clothing profile to see your clothes here.')
  expect(unlinked).not.toContain('aria-label="Personal shirt, ready, Needs label"')
  expect(unlinked).not.toContain('aria-label="Sam shirt, ready, Needs label"')
})

test('empty closet and not-ready garments have clear states', () => {
  const empty = render({ inventory: { wearers, textiles: [textile({ guest: true })] } })
  expect(empty).toContain('Start your closet')
  expect(empty).not.toContain('Example of a closet with clean clothes')
  expect(empty).toContain('aria-label="Manage closet"')
  expect(empty).toContain('aria-label="Add clothes"')
  const none = render({ today: today({ readyCount: 0 }), inventory: { wearers, textiles: [textile({ status: 'hanging' })] } })
  expect(none).not.toContain(', ready"')
  expect(none).toContain('aria-label="Navy tee, hanging to dry, Needs label"')
})

test('a hanging garment dries with the latest finished load that washed it', () => {
  const session = (sessionId: string, completedAt: number | null, status = 'completed', textileIds = ['t1']) => ({ sessionId, completedAt, status, textileIds }) as unknown as Sessions[number]
  const sessions = [session('s3', null, 'running'), session('s2', now - hour), session('s1', now - day), session('s0', now, 'completed', ['t2'])]
  expect(hangingSession(sessions, 't1')).toBe('s2')
  expect(hangingSession(sessions, 't9')).toBeNull()
})

test('hanger words', () => {
  const [rail] = closetRails([textile({ status: 'at_cleaner' })], ['sam'], {}, now, 90)
  expect(hangerLabel(rail!.sections[0]!.tiles[0]!, now)).toBe('Navy tee, at the cleaner')
  expect(renderToStaticMarkup(<WornChip times={1} />)).toContain('Worn 1 time since washed')
})

test('the Closet and its sheets use plain words', () => {
  const textiles = [
    textile({ textileId: 'a' as never }),
    textile({ textileId: 'b' as never, status: 'dirty', soilLevel: 'heavy', flag: { reasons: ['mud_grass'], neededBy: now + day, flaggedBy: 'x', flaggedAt: now } }),
    textile({ textileId: 'c' as never, status: 'needs_refresh' }),
  ]
  const base = { inventory: { wearers, textiles }, attention: attention({ top: { kind: 'hamper', count: 1, loads: 1 }, cards: [{ kind: 'cleaner', textileIds: ['a' as never], since: now - 9 * day }] }) }
  assertPlainCopy(render(base))
  for (const sheet of [
    { kind: 'garment', textileIds: ['a'] },
    { kind: 'garment', textileIds: ['b'] },
    { kind: 'garment', textileIds: ['c'] },
    { kind: 'flag', textileIds: ['a'], mode: 'dirty' },
    { kind: 'flag', textileIds: ['b'], mode: 'change' },
    { kind: 'washed', textileIds: ['b'] },
    { kind: 'dropped', textileIds: ['a'] },
  ] as const) {
    const markup = render({ ...base, initialSheet: sheet })
    expect(markup).toMatch(/<div role="dialog" aria-modal="true"[^>]* class="sheet/)
    assertPlainCopy(markup)
  }
})

test('Add clothes and Edit open the Add clothes sheet the live Closet supplies', () => {
  const asked: unknown[] = []
  const addClothes: ClosetViewProps['addClothes'] = (mode) => {
    asked.push(mode)
    return <p>Add clothes sheet</p>
  }
  expect(render({ addClothes, initialSheet: { kind: 'add' }, inventory: { wearers, textiles: [] } })).toContain('<p>Add clothes sheet</p>')
  expect(render({ addClothes, initialSheet: { kind: 'edit', textileIds: ['t1'] } })).toContain('<p>Add clothes sheet</p>')
  expect(asked).toEqual([{ kind: 'add', target: 'closet' }, { kind: 'edit', textileIds: ['t1'] }])
})

test('Edit from a record opens the Closet’s editor over it, so closing returns to the record', () => {
  const addClothes: ClosetViewProps['addClothes'] = (_mode, onClose) => <button type="button" onClick={onClose}>Editor</button>
  recordEditors.length = 0
  const tee = textile({ textileId: 'edit-me' as Textile['textileId'] })
  const markup = render({ addClothes, inventory: { wearers, textiles: [tee] }, initialSheet: { kind: 'garment', textileIds: ['edit-me'] } })
  // The record is open and the editor is not, until a row asks for it.
  expect(markup).toContain('aria-label="Garment record"')
  expect(markup).not.toContain('>Editor</button>')
  expect(recordEditors).toEqual([addClothes])
})

test('Add clothes lives in the Closet, for the person selected', () => {
  let asked: unknown = null
  const addClothes = (mode: unknown) => { asked = mode; return null }
  expect(render({ addClothes: undefined })).not.toContain('> Add clothes</button>')
  expect(render({ addClothes })).toContain('aria-label="Add clothes"')
  expect(render({ addClothes, wearerChip: 'me' })).toContain('aria-label="Add clothes"')
  render({ addClothes, wearerChip: 'me', initialSheet: { kind: 'add' } })
  expect(asked).toEqual({ kind: 'add', target: 'closet', whose: { wearerId: 'alex' } })
  render({ addClothes, initialSheet: { kind: 'add' } })
  expect(asked).toEqual({ kind: 'add', target: 'closet' })
})

test('Closet leads with a live summary and retains search, owner scope and one Add action', () => {
  const textiles = [textile(), textile({ name: 'Tank' }), textile({ name: 'Jersey', status: 'dirty' }), textile({ name: 'Blazer', status: 'needs_dry_clean' }), textile({ name: 'Socks', status: 'hanging' })]
  expect(glanceCounts(textiles)).toEqual({ ready: 2, laundry: 1, hamper: 1, care: 1 })
  const markup = render({ inventory: { textiles, wearers } })
  expect(markup).toContain('aria-label="Your clothes at a glance"')
  for (const word of ['Ready', 'In the laundry', 'In the hamper', 'Needs care']) expect(markup).toContain(`>${word}</span>`)
  expect(markup).toContain('aria-label="Whose clothes"')
  expect(markup).not.toContain('>Whose clothes</label>')
  expect(markup.indexOf('type="search"')).toBeLessThan(markup.indexOf('aria-label="Manage closet"'))
  expect(markup.indexOf('aria-label="Your clothes at a glance"')).toBeLessThan(markup.indexOf('type="search"'))
  expect(markup.match(/aria-label="Add clothes"/g)).toHaveLength(1)
  assertPlainCopy(markup)
})
