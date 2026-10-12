import type { ComponentProps, ReactNode } from 'react'
import { renderToStaticMarkup } from '@/test/markup'
import { expect, test, vi } from 'vitest'

vi.mock('@tanstack/react-router', async (original) => ({
  ...await original<typeof import('@tanstack/react-router')>(),
  Link: ({ to, search, params: _params, viewTransition: _viewTransition, ...props }: ComponentProps<'a'> & { to: string; search?: Record<string, string>; params?: unknown; viewTransition?: boolean }) =>
    <a {...props} href={to + (search && Object.keys(search).length ? `?${new URLSearchParams(search)}` : '')} />,
}))

import { HomeOverview, type HomeGuidanceInput } from '@/home/home-page'
import type { Inventory, Textile } from '@/household/inventory-types'
import type { Today } from '@/closet/closet-view'
import type { HubState } from '@/home/hub-state'
import { homeHeroView } from '@/home/home-hero'
import { HomeCareOverview, HomeHero } from '@/home/home-sections'

test('hero headings carry the state; only a timed load needs a separate stage badge', () => {
  const facts = { garmentGroups: 2, pieces: 2, only: null }
  const states: HubState[] = [{ kind: 'empty' }, { kind: 'drying', count: 2, sessionIds: ['wash'], runId: 'air' }, { kind: 'hamper', count: 2, loads: null },
    { kind: 'running', next: null, rows: [{ sessionId: 'wash', machine: 'Washer', stage: 'washing', doneAt: null }] },
    { kind: 'running', next: null, rows: [{ sessionId: 'wash', machine: 'Washer', stage: 'washing', startedAt: -120_000, doneAt: -60_000 }] }]
  const markup = (state: HubState) => renderToStaticMarkup(<HomeHero view={homeHeroView(state, facts, 0)} renderLink={(_, { ariaLabel, ...props }) => <a href="/laundry" aria-label={ariaLabel} {...props} />} />)
  for (const state of states) expect(markup(state)).not.toMatch(/>(Nothing waiting|Drying|Washing|Waiting|Ready)<\/span>/)
  for (const stage of ['washing', 'drying'] as const) {
    const result = markup({ kind: 'running', next: null, rows: [{ sessionId: 'wash', machine: 'Machine', stage, startedAt: -60_000, doneAt: 60_000 }] })
    expect(result).toContain(stage === 'washing' ? '>Washing</span>' : '>Drying</span>')
  }
})

test('the care summary is one target with a separate care-details action', () => {
  const markup = renderToStaticMarkup(<HomeCareOverview title="Care overview" caption="23 pieces"
    counts={[{ key: 'ready', label: 'Ready', count: 13, dot: 'bg-ready' }, { key: 'hamper', label: 'Hamper', count: 9, dot: 'bg-hamper' }, { key: 'washing', label: 'Washing', count: 0, dot: 'bg-washing' }, { key: 'refresh', label: 'Refresh', count: 1, dot: 'bg-hamper' }]}
    labelFlag={{ text: 'Check care labels', target: { to: 'closet' } }}
    renderLink={(_, { ariaLabel, ...props }) => <a href="/closet" aria-label={ariaLabel} {...props} />} />)
  const links = markup.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? []
  expect(links).toHaveLength(2)
  expect(links[0]).toContain('aria-label="13 Ready, 9 Hamper, 0 Washing, 1 Refresh"')
  expect(links[0]).toContain('>Refresh</span>')
  expect(links[0]).not.toContain('Check care labels')
  expect(links[1]).toContain('Check care labels')
  expect(links[0]).toContain('width:56.52173913043478%')
  expect(links[0]).toContain('width:0%')
  const empty = renderToStaticMarkup(<HomeCareOverview title="Care overview" caption="0 pieces" counts={[{ key: 'ready', label: 'Ready', count: 0, dot: 'bg-ready' }]} labelFlag={null} renderLink={(_, props) => <a href="/closet" {...props} />} />)
  expect(empty).not.toContain('NaN')
  expect(empty).toContain('width:0%')
})

test('Home reports hamper pieces instead of presenting zero planned loads as a wash estimate', () => {
  const view = homeHeroView({ kind: 'hamper', count: 9, loads: 0 }, { garmentGroups: 2, pieces: 9, only: null }, 0)
  expect(view.title).toBe('9 pieces in the hamper')
  expect(view.primary?.label).toBe('Sort into loads')
})

test('a blocked Home hero names the recorded source and its remedy, without offering Start', () => {
  const view = homeHeroView({ kind: 'pass', planId: 'plan', number: 1, count: 2, ready: false,
    blocker: { source: 'product', name: 'Recorded detergent', code: 'needs_confirmation', details: { cause: 'product_safety_needed' } },
  }, { garmentGroups: 2, pieces: 4, only: null }, 0)
  expect(view.detail).toBe('Check whether Recorded detergent contains bleach before using it.')
  expect(view.primary?.target).toEqual({ to: 'plan', planId: 'plan' })
  expect(view.primary?.label).not.toMatch(/Start/i)
})

const garment = (id: string, overrides: Partial<Textile> = {}) => ({
  textileId: id, name: 'Crew tee', kind: 't_shirt', color: 'Navy', colorGroup: 'dark',
  wearerId: 'demo', occasions: [], status: 'dirty', guest: false, inLoad: null, care: null,
  flag: null, soilLevel: 'normal', statusSince: 0, washCount: 0, firstWash: false,
  bulkUnits: null, fromFixture: false, lastWornAt: null, wearsSinceClean: 0,
  lastCleanedAt: null, cleanerNote: null, cleanerPickupBy: null, identity: null, createdAt: 0,
  ...overrides,
} as Textile)

function render(textiles: Textile[], ready: Textile[] = [], state: HubState = { kind: 'hamper', count: textiles.length - ready.length, loads: null }, outfit?: ReactNode, guidance?: HomeGuidanceInput, supplies: unknown[] = []) {
  const today = {
    ready: ready.map((textile) => ({ ...textile, _id: textile.textileId })), readyCount: ready.length,
    notReady: { dirty: textiles.length - ready.length, in_wash: 0, hanging: 0, needs_dry_clean: 0, at_cleaner: 0, needs_refresh: 0 },
    notReadyForOccasion: [], notWornDays: 90,
  } as Today
  return renderToStaticMarkup(<HomeOverview inventory={{ textiles, wearers: [], machines: [], supplies } as unknown as Inventory}
    today={today} state={state} now={0} outfit={outfit} guidance={guidance} />)
}

test('outfit planning remains reachable without an arbitrary three-item threshold', () => {
  const ready = [garment('1', { status: 'clean' }), garment('2', { status: 'clean' }), garment('3', { status: 'clean' })]
  const outfit = <span>Outfit choices</span>
  expect(render(ready, ready, { kind: 'empty' }, outfit)).toContain('Choose today’s outfit')
  const distinct = [ready[0]!, garment('4', { status: 'clean', name: 'Jeans', kind: 'pants' }), garment('5', { status: 'clean', name: 'Shirt', kind: 'shirt' })]
  expect(render(distinct, distinct, { kind: 'empty' }, outfit)).toContain('Choose today’s outfit')
  expect(render(distinct, distinct, { kind: 'empty' }, outfit)).not.toContain('Outfit choices')
})

test('an all-dirty closet offers laundry without presenting dirty clothes as ready', () => {
  const markup = render([garment('1', { identity: { brand: 'AS Colour' } }), garment('2', { identity: { brand: 'AS Colour' } })])
  expect(markup).toContain('2 pieces in the hamper')
  expect(markup).toContain('Sort into loads')
  expect(markup).toContain('aria-label="0 Ready, 2 Hamper, 0 Washing"')
  expect(markup).not.toContain('id="home-ready"')
})

test('Home keeps the next task, zero counts, quick actions and a bounded ready preview', () => {
  const ready = [garment('1', { status: 'clean' }), garment('2', { status: 'clean' }), garment('3', { status: 'clean', color: 'Forest' })]
  const markup = render([...ready, garment('4', { name: 'Dirty shorts', kind: 'shorts' })], ready)
  expect(markup).toContain('Sort into loads')
  expect(markup).toContain('aria-label="3 Ready, 1 Hamper, 0 Washing"')
  expect(markup).toContain('id="home-ready"')
  expect(markup).toContain('Quick links')
  expect(markup).not.toContain('Dirty shorts')
  expect(markup).toContain('href="/closet"')
  expect(markup).not.toContain('>AS Colour</span>')
  expect(markup).toContain('aria-label="Crew tee, 2 ready"')
})

test('a closet with only guest items does not show an owned-clothes overview or gallery', () => {
  const markup = render([garment('guest', { guest: true })])
  expect(markup).not.toContain('care-overview-title')
  expect(markup).not.toContain('id="home-ready"')
})

test('care review opens the first owned garment needing label confirmation', () => {
  const confirmed = garment('confirmed', { care: { status: 'confirmed' } as Textile['care'] })
  const unchecked = garment('unchecked')
  const markup = render([garment('guest', { guest: true }), confirmed, unchecked])
  expect(markup).toContain('href="/closet?item=unchecked&amp;returnTo=home"')
  expect(markup).toContain('Check care labels')
  expect(render([confirmed])).not.toContain('Check care labels')
})

test('Home identifies the active dryer instead of presenting its clothes as ready', () => {
  const markup = render([garment('1', { inLoad: 'load' as Textile['inLoad'] })], [], {
    kind: 'running', next: null, rows: [{ sessionId: 'load', machine: 'Dryer', stage: 'drying', doneAt: null }],
  })
  expect(markup).toContain('Dryer · Drying')
  expect(markup).not.toContain('id="home-ready"')
})

test('Home leaves clothing and tag browsing to Closet', () => {
  const ready = [garment('1', { status: 'clean', tags: ['Weekend outfit'] })]
  const markup = render([...ready, garment('2', { tags: ['Work'] })], ready)
  expect(markup).not.toContain('>Weekend outfit</button>')
  expect(markup).not.toContain('>Work</button>')
  expect(markup).not.toContain('aria-label="Filter by tag"')
})

const guidance = (status: HomeGuidanceInput['status']): HomeGuidanceInput => ({ status, pending: false, onResume: () => undefined })

test('a hero that already leads with a care task suppresses Resume; otherwise Resume names the task', () => {
  const clothes = [garment('1'), garment('2')]
  const started = guidance({ status: 'started', stage: 'clothes' })
  expect(render(clothes, [], undefined, undefined, started)).not.toContain('Continue adding clothes')
  const calm = render(clothes.map((textile) => ({ ...textile, status: 'clean' })), [], { kind: 'empty' }, undefined, started)
  expect(calm).toMatch(/<button[^>]*>[\s\S]*Continue adding clothes[\s\S]*<\/button>/)
  expect(calm).not.toContain('first-load guidance')
})

test('Replay is a quiet text link to the chooser, never a primary or outline button', () => {
  const markup = render([garment('1')], [], { kind: 'empty' }, undefined, guidance({ status: 'completed', stage: 'laundry' }))
  const link = markup.match(/<a\b[^>]*>Replay first-load guidance<\/a>/)?.[0]
  expect(link).toContain('href="/setup?replay=true"')
  expect(link).toContain('home-replay')
  expect(link).not.toMatch(/\bbutton\b/)
  expect(markup).not.toMatch(/<button[^>]*>Replay/)
})

test('the setup card opens the one /setup checklist', () => {
  const markup = render([garment('1')], [], { kind: 'empty' })
  expect(markup).toMatch(/<a[^>]*href="\/setup"[^>]*>[\s\S]*?Household setup/)
  expect(markup).not.toContain('href="/household')
})
