import { renderToStaticMarkup } from '@/test/markup'
import { expect, test } from 'vitest'

import { AppShell, currentTab, isFocusPath, navigationItems, showsNavigation } from '@/kit/app-shell'
import manifestText from '../../public/manifest.webmanifest?raw'

test('the web manifest describes the stable product identity and local icons', () => {
  const manifest = JSON.parse(manifestText) as {
    name: string
    short_name: string
    description: string
    start_url: string
    scope: string
    display: string
    theme_color: string
    background_color: string
    icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>
  }

  expect(manifest).toMatchObject({
    name: 'A Laundered Closet',
    short_name: 'Laundered Closet',
    description: expect.any(String),
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: '#f7f5ee',
    background_color: '#f7f5ee',
  })
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        src: '/icons/laundered-closet-192.png',
        sizes: '192x192',
        type: 'image/png',
      }),
      expect.objectContaining({
        src: '/icons/laundered-closet-512.png',
        sizes: '512x512',
        type: 'image/png',
      }),
      expect.objectContaining({
        src: '/icons/laundered-closet-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      }),
    ]),
  )

  expect(manifest.icons).toHaveLength(3)
})

test('the shell provides accessible navigation and a neutral main landmark', () => {
  const markup = renderToStaticMarkup(
    <AppShell
      navigation={<ul>{navigationItems.map((item) => <li key={item.to}><a href={item.to} aria-current={item.to === '/' ? 'page' : undefined}>{item.label}</a></li>)}</ul>}
      status={<span>Online</span>}
    >
      <p>Loading WashCloset…</p>
    </AppShell>,
  )

  expect(markup).toContain('href="#main-content"')
  expect(markup).toContain('aria-label="Primary navigation"')
  expect(markup).toContain('aria-current="page"')
  expect(markup).toContain('WashCloset')
  expect(markup).toContain('href="/closet"')
  expect(markup).toContain('id="main-content"')
  expect(markup).toContain('inert=""')
  // The top is for reading: the wordmark is not a link, and the tabs come after the content.
  expect(markup).not.toContain('href="/" aria-label')
  expect(markup.indexOf('id="main-content"')).toBeLessThan(markup.indexOf('aria-label="Primary navigation"'))
})

test('five tabs: Home, Closet, Laundry, Household and Me', () => {
  expect(navigationItems).toEqual([
    { label: 'Home', to: '/' },
    { label: 'Closet', to: '/closet' },
    { label: 'Laundry', to: '/laundry' },
    { label: 'Household', to: '/household' },
    { label: 'Me', to: '/me' },
  ])
  expect(currentTab('/')).toBe('/')
  expect(currentTab('/laundry')).toBe('/laundry')
  expect(currentTab('/closet')).toBe('/closet')
  expect(currentTab('/closet/shirts')).toBe('/closet')
  expect(currentTab('/closets')).toBeNull()
  expect(currentTab('/household')).toBe('/household')
  expect(currentTab('/me')).toBe('/me')
  expect(currentTab('/session/abc')).toBeNull()
})

test('there is no global +: adding lives inside each tab', () => {
  const markup = renderToStaticMarkup(<AppShell navigation={<ul />}><p>Laundry</p></AppShell>)
  expect(markup).not.toContain('add-button')
  expect(markup).not.toContain('Add something')
})

test('signed out renders no navigation; signed in past first run renders all five tabs', () => {
  const tabs = <ul>{navigationItems.map((item) => <li key={item.to}><a href={item.to}>{item.label}</a></li>)}</ul>
  const signedOut = renderToStaticMarkup(<AppShell dock={<p>Next step</p>}><p>Sign in</p></AppShell>)
  expect(signedOut).not.toContain('Primary navigation')
  expect(signedOut).not.toContain('Next step')
  expect(signedOut).toContain('A Laundered Closet')
  expect(signedOut.match(/your closet, cared for\./g)).toHaveLength(1)
  const signedIn = renderToStaticMarkup(<AppShell navigation={tabs} dock={<p>Next step</p>}><p>Laundry</p></AppShell>)
  expect(signedIn).toContain('aria-label="Primary navigation"')
  for (const label of ['Home', 'Laundry', 'Closet', 'Household', 'Me']) expect(signedIn).toContain(`>${label}</a>`)
  expect(signedIn).toContain('Next step')
  expect(signedIn).not.toContain('your closet, cared for.')
  expect(signedIn.match(/A Laundered Closet/g)).toHaveLength(1)

  expect(showsNavigation({ signedIn: false, household: undefined })).toBe(false)
  // Still checking, or in first run: no navigation yet.
  expect(showsNavigation({ signedIn: true, household: undefined })).toBe(false)
  expect(showsNavigation({ signedIn: true, household: false })).toBe(false)
  expect(showsNavigation({ signedIn: true, household: true })).toBe(true)
})

test('focus mode: at the machine and inside an open pass, not on the hamper', () => {
  expect(isFocusPath('/drying', {})).toBe(true)
  expect(isFocusPath('/session/abc', {})).toBe(true)
  expect(isFocusPath('/laundry', { plan: 'p1' })).toBe(true)
  for (const path of ['/sign-in', '/create-account', '/forgot-password', '/setup', '/join/code']) {
    expect(isFocusPath(path, {})).toBe(true)
  }
  expect(isFocusPath('/', {})).toBe(false)
  expect(isFocusPath('/closet', { plan: 'p1' })).toBe(false)
  const focused = renderToStaticMarkup(<AppShell navigation={<ul />} dock={<p>Next step</p>} focus><p>Pass</p></AppShell>)
  expect(focused).toContain('app-shell is-focus')
  expect(focused).not.toContain('Next step')
})
