import { renderToStaticMarkup } from '@/test/markup'
import { expect, test } from 'vitest'

import { HomeDock, homeDockStep, homeDockTaskKey } from '@/home/home-dock'
import { hubState } from '@/home/hub-state'

const now = new Date(2026, 8, 27, 15, 55).getTime()
const link = (target: { to: string }, { className, children }: { className: string; children: React.ReactNode }) => <a className={className} href={target.to}>{children}</a>

test('hanging clothes are drying until the user confirms they are dry', () => {
  expect(homeDockStep({ kind: 'drying', count: 4, sessionIds: ['s'] })).toMatchObject({ title: 'Hanging to dry', button: 'Check dryness', target: { to: 'drying' } })
  expect(homeDockStep({ kind: 'drying', count: 4, sessionIds: ['s'], runId: 'air-run' }).target).toEqual({ to: 'drying', run: 'air-run' })
})

test('dismissal identifies the current task and uses a sibling control outside its link', () => {
  const state = { kind: 'drying' as const, count: 4, sessionIds: ['s'] }
  expect(homeDockTaskKey(state)).toBe(homeDockTaskKey({ ...state }))
  expect(homeDockTaskKey(state)).not.toBe(homeDockTaskKey({ ...state, count: 3 }))
  expect(homeDockTaskKey(state)).not.toBe(homeDockTaskKey({ ...state, sessionIds: ['other'] }))
  const markup = renderToStaticMarkup(<HomeDock state={state} renderLink={link} onDismiss={() => {}} />)
  expect(markup).toContain('aria-label="Dismiss Hanging to dry reminder"')
  expect(markup.match(/<a\b[^>]*>[\s\S]*?<\/a>/)?.[0]).not.toContain('<button')
})

test('urgent move has the machine and dot together, its clock and the next-step button', () => {
  const state = { kind: 'finished' as const, row: { sessionId: 's', machine: 'Top-loader 3', name: 'gym clothes', stage: 'wash_done' as const, doneAt: now - 3 * 60_000 }, toDryer: true, rows: [] }
  const markup = renderToStaticMarkup(<HomeDock state={state} renderLink={link} />)
  expect(homeDockStep(state).button).toBe('Next step')
  expect(markup).toContain('Up next')
  expect(markup).toContain('Top-loader 3')
  expect(markup).toContain('washed 3:52')
  expect(markup).toContain('Move the gym clothes')
  expect(markup).not.toContain('<button')
})

test('dry load is urgent; start and wait are calm with their own buttons', () => {
  const dry = { kind: 'finished' as const, row: { sessionId: 's', machine: 'Dryer 2', name: 'sheets', stage: 'dry' as const, doneAt: now - 3 * 60_000 }, toDryer: false, rows: [] }
  expect(homeDockStep(dry)).toMatchObject({ urgent: true, clock: 'check time 3:52', title: 'Check the sheets', detail: 'Check whether the pieces are dry.', button: 'Check dryness' })
  const start = { kind: 'pass' as const, planId: 'p', number: 1, count: 2, ready: true, name: 'towels', things: 14 }
  expect(homeDockStep(start)).toMatchObject({ urgent: false, title: 'Start the towels', button: 'Start' })
  const wait = { kind: 'running' as const, rows: [{ sessionId: 's', machine: 'Dryer 2', stage: 'drying' as const, doneAt: now + 17 * 60_000 }], next: null }
  expect(homeDockStep(wait)).toMatchObject({ title: 'Check around 4:12', button: 'Open load' })
})

test('move detail uses recorded heat, duration and price', () => {
  const state = { kind: 'finished' as const, row: { sessionId: 's', machine: 'Washer 2', stage: 'wash_done' as const, doneAt: now, heat: 'Normal heat', dryMinutes: 45, price: '$2.00' }, toDryer: true, rows: [] }
  expect(homeDockStep(state).detail).toBe('Normal heat · about 45 min · $2.00')
})

test('the hamper step names the count in plain words; the button keeps its accessible name for the e2e test', () => {
  const hamper = { kind: 'hamper' as const, count: 2, loads: 1 }
  expect(homeDockStep(hamper)).toMatchObject({ title: '2 waiting to wash', button: 'Review clothes', target: { to: 'laundry' } })
  expect(homeDockStep(hamper, true)).toMatchObject({ title: 'Everything is set aside', button: 'Add clothes' })
})

test('next load uses its saved garment and bottle line', () => {
  const state = hubState({ hamper: { count: 0, loads: null }, sessions: [], hanging: { count: 0, sessionIds: [] },
    textileNames: new Map([['t1', 'towels']]), plan: { planId: 'p', loads: [{ sessionId: null, startable: true, textileIds: ['t1'], treatments: [{ supplyName: 'Tide', dose: { mark: 'line 3' } }] }] } }, now)
  expect(homeDockStep(state)).toMatchObject({ title: 'Start the towels', detail: 'Tide to line 3 · 1 laundry item', button: 'Start' })
})

test('the dock uses a load number for a mixed pile and lowercases a garment name in a sentence', () => {
  expect(homeDockStep({ kind: 'pass', planId: 'p', number: 2, count: 3, ready: true, name: '13 laundry items', things: 13 }))
    .toMatchObject({ title: 'Start load 2', detail: '13 laundry items' })
  expect(homeDockStep({ kind: 'pass', planId: 'p', number: 1, count: 1, ready: true, name: 'Dark pants', things: 2 }))
    .toMatchObject({ title: 'Start the dark pants', detail: '2 laundry items' })
})
