import type { ComponentProps, ReactNode } from 'react'
import { renderToStaticMarkup } from '@/test/markup'
import { expect, test, vi } from 'vitest'

vi.mock('@tanstack/react-router', async (original) => ({
  ...await original<typeof import('@tanstack/react-router')>(),
  Link: ({ to, search, params: _params, viewTransition: _viewTransition, ...props }: ComponentProps<'a'> & { to: string; search?: Record<string, string>; params?: unknown; viewTransition?: boolean }) =>
    <a {...props} href={to + (search && Object.keys(search).length ? `?${new URLSearchParams(search)}` : '')} />,
}))

import { HomeOverview, type HomeGuidanceInput } from '@/routes/index'
import type { Inventory, Textile } from '@/household/inventory-types'
import type { Today } from '@/closet/closet-view'
import type { HubState } from '@/home/hub-state'
import { homeHeroView } from '@/home/home-hero'
import { HomeCareOverview } from '@/home/home-sections'

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

test('outfit picking needs distinct ready garment choices, not identical quantities', () => {
  const ready = [garment('1', { status: 'clean' }), garment('2', { status: 'clean' }), garment('3', { status: 'clean' })]
  const outfit = <span>Outfit choices</span>
  expect(render(ready, ready, { kind: 'empty' }, outfit)).not.toContain('Outfit choices')
  const distinct = [ready[0]!, garment('4', { status: 'clean', name: 'Jeans', kind: 'pants' }), garment('5', { status: 'clean', name: 'Shirt', kind: 'shirt' })]
  expect(render(distinct, distinct, { kind: 'empty' }, outfit)).toContain('Outfit choices')
})

test('an all-dirty closet offers laundry without presenting dirty clothes as ready', () => {
  const markup = render([garment('1', { identity: { brand: 'AS Colour' } }), garment('2', { identity: { brand: 'AS Colour' } })])
  expect(markup).toContain('2 pieces in the hamper')
  expect(markup).toContain('Sort into loads')
  expect(markup).toContain('aria-label="0 Ready, 2 Hamper, 0 Washing"')
  expect(markup).not.toContain('id="home-ready"')
})

test('ready previews count matching pieces and keep named colors apart', () => {
  const ready = [garment('1', { status: 'clean' }), garment('2', { status: 'clean' }), garment('3', { status: 'clean', color: 'Forest' })]
  const markup = render([...ready, garment('4', { name: 'Dirty shorts', kind: 'shorts' })], ready)
  expect(markup).toMatch(/<h2 id="home-ready"[^>]*>Ready to wear<\/h2>/)
  expect(markup).toContain('aria-label="Crew tee, Navy, 2 pieces, Ready to wear"')
  expect(markup).toContain('aria-label="Crew tee, Forest, 1 piece, Ready to wear"')
  expect(markup).not.toContain('Dirty shorts')
  expect(markup).toContain('href="/closet?section=ready"')
  expect(markup).not.toContain('>AS Colour</span>')
  expect(markup).not.toContain('title="2 ready"')
  expect(markup).not.toContain('title="1 ready"')
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

test('ready tags appear before the clothing gallery, using only tags on ready clothes', () => {
  const ready = [garment('1', { status: 'clean', tags: ['Weekend outfit'] })]
  const markup = render([...ready, garment('2', { tags: ['Work'] })], ready)
  expect(markup).toContain('>Weekend outfit</button>')
  expect(markup).not.toContain('>Work</button>')
  expect(markup.indexOf('aria-label="Filter by tag"')).toBeLessThan(markup.indexOf('aria-label="Ready to wear pages"'))
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
