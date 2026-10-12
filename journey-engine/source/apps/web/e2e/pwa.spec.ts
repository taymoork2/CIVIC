import { expect, test } from '@playwright/test'

import { addClothes, addProductAndWasher, createHousehold, email, planAndStart, signInAs } from './flows'

// The service worker registers only in production builds: run against `vite build` + `vite preview`
// or a deployed preview with WASHCLOSET_E2E_PWA=1.
test.skip(process.env.WASHCLOSET_E2E_PWA !== '1', 'requires a production build')

test('installed app branding and its new icons are available offline', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('A Laundered Closet')
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/icons/laundered-closet.svg')
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icons/laundered-closet-apple-touch.png')
  const manifest = await (await page.request.get('/manifest.webmanifest')).json()
  expect(manifest).toMatchObject({ id: '/', name: 'A Laundered Closet', display: 'standalone' })
  expect(manifest.icons).toEqual([
    { src: '/icons/laundered-closet-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/laundered-closet-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icons/laundered-closet-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ])
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
  const cached = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    const entries = await Promise.all((await caches.keys()).map(async (name) => ({ name, paths: (await (await caches.open(name)).keys()).map((request) => new URL(request.url).pathname) })))
    return { worker: registration.active?.scriptURL, entries }
  })
  expect(cached.worker).toContain('/service-worker.js?build=')
  const paths = cached.entries.flatMap((entry) => entry.paths)
  for (const icon of [...manifest.icons, { src: '/icons/laundered-closet.svg' }, { src: '/icons/laundered-closet-apple-touch.png' }]) expect(paths).toContain(icon.src)
  expect(paths.some((path) => path.startsWith('/api/'))).toBe(false)
  const fontPaths: string[] = (await (await page.request.get('/offline-assets.json')).json()).filter((path: string) => path.endsWith('.woff2'))
  expect(fontPaths).toHaveLength(3)
  for (const path of fontPaths) expect(paths).toContain(path)
  await page.context().setOffline(true)
  const offlineFonts = await page.evaluate(async () => {
    const faces = await Promise.all(['400 16px "Source Sans 3"', '400 22px "Source Serif 4"', 'italic 400 22px "Source Serif 4"'].map((font) => document.fonts.load(font)))
    return faces.map((loaded) => loaded.map((face) => face.status))
  })
  expect(offlineFonts).toEqual([['loaded'], ['loaded'], ['loaded']])
  for (const icon of manifest.icons) {
    const dimensions = await page.evaluate(async (src) => {
      const image = new Image()
      image.src = src
      await image.decode()
      return `${image.naturalWidth}x${image.naturalHeight}`
    }, icon.src)
    expect(dimensions).toBe(icon.sizes)
  }
})

test('U8/AE4: static-only caches, an offline checklist, and purge on sign-out', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  // Cover first installation while already signed in, not only a public first visit.
  await page.route('**/service-worker.js*', (route) => route.abort('failed'))
  await page.goto('/')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')

  await signInAs(page, 'pwa', 'Pia Pwa')
  await createHousehold(page)
  await addProductAndWasher(page)
  await addClothes(page, { name: 'White hoodie', kind: 'sweater' })
  const sessionUrl = await planAndStart(page, 1)
  // Record the first preparation step so reopening restores the next step rather than Chemistry.
  await page.getByRole('button', { name: 'Done · next step', exact: true }).click()
  await expect.poll(() => page.evaluate(() => {
    const copies = JSON.parse(localStorage.getItem('washcloset:private:sessions') ?? '[]')
    return copies.some((copy: { actions: Array<{ status: string }> }) => copy.actions.some((action) => action.status === 'confirmed'))
  })).toBe(true)
  const nextStep = await page.locator('.machine-step-title').textContent()
  expect(nextStep).toBeTruthy()
  await page.unroute('**/service-worker.js*')
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/service-worker.js?build=trial-signed-in-install')
    await navigator.serviceWorker.ready
  })
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)

  // Nothing private is in Cache Storage: only same-origin static files and neutral page shells.
  const cached = await page.evaluate(async () => {
    const entries: Array<{ url: string; body: string }> = []
    for (const name of await caches.keys()) {
      const cache = await caches.open(name)
      for (const request of await cache.keys()) {
        const response = await cache.match(request)
        const html = response?.headers.get('content-type')?.includes('text/html') ?? false
        entries.push({ url: request.url, body: html ? await response!.text() : '' })
      }
    }
    return entries
  })
  expect(cached.length).toBeGreaterThan(0)
  expect(cached.some((entry) => new URL(entry.url).pathname.startsWith('/assets/index-') && entry.url.endsWith('.js'))).toBe(true)
  for (const entry of cached) {
    expect(new URL(entry.url).origin).toBe(new URL(page.url()).origin)
    expect(entry.url).not.toContain('/api/')
    for (const secret of [email('pwa'), 'Pia’s home', 'White hoodie', 'Tide HE liquid', 'Pia Pwa']) expect(entry.body).not.toContain(secret)
  }

  // Offline: the neutral shell loads and the last-synced checklist is shown read-only.
  await context.setOffline(true)
  await page.goto(sessionUrl)
  await expect(page.getByText(/^You’re offline\. This is the load as of/)).toBeVisible()
  await expect(page.getByRole('heading', { name: nextStep!, exact: true })).toBeVisible()
  // A step shows its one instruction, not the load's clothes; the offline copy still holds them.
  expect(await page.evaluate(() => localStorage.getItem('washcloset:private:sessions') ?? '')).toContain('White hoodie')
  expect(await page.evaluate(() => {
    const copies = JSON.parse(localStorage.getItem('washcloset:private:sessions') ?? '[]')
    return copies.some((copy: { actions: Array<{ supplyName: string | null; dose: unknown }> }) => copy.actions.some((action) => action.supplyName === 'Tide HE liquid' && action.dose !== null))
  })).toBe(true)
  await expect(page.getByText('Reconnect to record this step.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Done · next step', exact: true })).toBeDisabled()

  // Reconnect: the live checklist returns from the server.
  await context.setOffline(false)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Done · next step', exact: true })).toBeEnabled()

  // Signing out purges the device-local projection.
  expect(await page.evaluate(() => localStorage.getItem('washcloset:private:sessions'))).not.toBeNull()
  await page.getByRole('link', { name: 'Back to Laundry' }).click()
  await page.getByRole('link', { name: 'Me', exact: true }).click()
  await page.getByRole('button', { name: /^Account / }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.getByRole('dialog', { name: 'Sign out?', exact: true }).getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('washcloset:private:')))).toEqual([])
  await context.close()
})
