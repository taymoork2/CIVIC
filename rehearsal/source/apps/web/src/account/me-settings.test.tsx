import { renderToStaticMarkup } from '@/test/markup'
import { expect, test, vi } from 'vitest'
import type { ComponentProps } from 'react'

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-router')>(),
  Link: ({ to, ...props }: ComponentProps<'a'> & { to: string }) => <a href={to} {...props} />,
}))

import { currentTab } from '@/kit/app-shell'
import { Profile, completedHistory } from '@/routes/me'
import { SettingsPage } from '@/routes/settings'
import { assertPlainCopy } from '@/kit/test-copy'

const day = 24 * 60 * 60 * 1000
const now = Date.UTC(2026, 8, 27, 12)
const sessionId = 'history' as Parameters<typeof completedHistory>[0][number]['sessionId']
const row = { sessionId, machineName: null, textileCount: 4, garments: [{ name: 'White tee', color: 'White' }, { name: 'White tee', color: 'White' }] }

test('care history is newest first and excludes running, cancelled and future records', () => {
  const records = completedHistory([
    { ...row, status: 'completed', completedAt: now - day },
    { ...row, status: 'completed', completedAt: now - 2 * day },
    { ...row, status: 'running', completedAt: null },
    { ...row, status: 'cancelled', completedAt: now },
    { ...row, status: 'completed', completedAt: now + day },
  ], now)
  expect(records.map((record) => record.completedAt)).toEqual([now - day, now - 2 * day])
  expect(records.map((record) => record.title)).toEqual(['White tee', 'White tee'])
  expect(completedHistory([{ ...row, garments: [], status: 'completed', completedAt: now }], now)[0]?.title).toBe('Completed load')
})

test('history uses only the exact wash price and distinguishes missing, loading and zero prices', () => {
  const records = [{ ...row, status: 'completed' as const, completedAt: now }]
  expect(completedHistory(records, now)[0]?.washPrice).toBeUndefined()
  expect(completedHistory(records, now, [])[0]?.washPrice).toBeNull()
  expect(completedHistory(records, now, [{ id: `wash:${sessionId}`, price: 0 }, { id: `dryer:${sessionId}`, price: 5 }])[0]?.washPrice).toBe(0)
  expect(completedHistory(records, now, [{ id: `dryer:${sessionId}`, price: 5 }])[0]?.washPrice).toBeNull()
})

test('Me places Account above Settings and keeps credential operations on their own screen', () => {
  const markup = renderToStaticMarkup(<Profile name="Taymoor" email="me@example.com" householdName="Home" role="owner" onAccount={() => {}} onSettings={() => {}} />)
  for (const text of ['Taymoor', 'me@example.com', 'Owner', 'No completed loads yet']) expect(markup).toContain(text)
  expect(markup).not.toContain('Your finished loads will appear here.')
  expect(markup).toContain('href="/laundry"')
  expect(markup).toContain('Go to Laundry')
  expect(markup).toContain('Home · Owner')
  expect(markup.indexOf('>Account<')).toBeLessThan(markup.indexOf('>Settings<'))
  for (const text of ['Change password', 'Sign out', 'Delete account', 'Hide laundry costs']) expect(markup).not.toContain(text)
  assertPlainCopy(markup)
})

test('completed history is the first Me action and never invents a new wash entry', () => {
  const html = renderToStaticMarkup(<Profile name="Taymoor" email="me@example.com" householdName="Home" role="member" history={[{ sessionId, title: 'White tee', textileCount: 4, completedAt: now }]} onAccount={() => {}} onSettings={() => {}} onOpenWash={() => {}} />)
  expect(html.indexOf('White tee')).toBeLessThan(html.indexOf('>Account<'))
  expect(html.indexOf('Review latest load')).toBeLessThan(html.indexOf('White tee'))
  expect(html).not.toContain('Go to Laundry')
  expect(html).not.toContain('No completed loads yet')
})

test('Me offers paged older history instead of claiming the recent feed is all history', () => {
  const html = renderToStaticMarkup(<Profile name="Pat" email={null} householdName="Home" role="member" history={[{ sessionId, title: 'Tee', textileCount: 1, completedAt: now }]} canLoadMore onLoadMore={() => {}} onAccount={() => {}} onSettings={() => {}} />)
  expect(html).toContain('Older loads')
  expect(html).not.toContain('Show all')
})

test('Settings contains device preferences and truthful alert availability, without account actions', () => {
  const markup = renderToStaticMarkup(<SettingsPage back={<a href="/me" aria-label="Back to Me">back</a>} />)
  expect(markup).toMatch(/<h1[^>]*>Settings<\/h1>/)
  expect(markup).toContain('href="/me" aria-label="Back to Me"')
  for (const text of ['System', 'Light', 'Dark', 'Motion', 'Reduce', 'Full', 'Automatic', 'US', 'Metric', 'Timer alerts in the app']) expect(markup).toContain(text)
  expect(markup).toContain('role="radiogroup"')
  expect(markup).toContain('Reminders while the app is open.')
  for (const text of ['Change password', 'Sign out', 'Delete account', 'Navigation style']) expect(markup).not.toContain(text)
  assertPlainCopy(markup)
})

test('Settings and Account keep Me selected in navigation', () => {
  expect(currentTab('/settings')).toBe('/me')
  expect(currentTab('/account')).toBe('/me')
  expect(currentTab('/me')).toBe('/me')
  expect(currentTab('/settingsx')).toBeNull()
})
