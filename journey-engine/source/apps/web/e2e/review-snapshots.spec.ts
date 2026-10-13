import { expect, test } from '@playwright/test'

test.use({ trace: 'off', viewport: { width: 1440, height: 1000 } })
test.skip(process.env.WASHCLOSET_REVIEW_E2E !== '1', 'Run against an isolated review server.')

test('an unmounted preview retries a transient module import failure without replacing a live draft', async ({ page }) => {
  let failed = false
  // Towel scenarios mount through the towel runtime adapter.
  await page.route('**/src/review/adapters/laundry-towel.tsx', async (route) => {
    if (!failed) { failed = true; await route.abort(); return }
    await route.continue()
  })
  await page.goto('/review')
  await page.goto('/review-frame.html?scenario=intake.towel.fabric')
  await expect(page.getByLabel('Other material 1', { exact: true })).toBeVisible()
  expect(failed).toBe(true)
  expect(new URL(page.url()).searchParams.get('mountRetry')).toBe('1')
})

test('automatic refresh retains the old image and retries a transient snapshot failure', async ({ page }) => {
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 1, height: 1 } })
  let version = '5'.repeat(64), failed = '', release!: () => void
  const attempts = new Map<string, number>(), held = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/api/review/index', async (route) => {
    const response = await route.fetch(), index = await response.json()
    index.revision.source = version; index.fixtureSource = version
    await route.fulfill({ response, json: index })
  })
  await page.route('**/api/review/coverage', async (route) => {
    const response = await route.fetch(), coverage = await response.json(); coverage.source = version
    await route.fulfill({ response, json: coverage })
  })
  await page.route('**/api/review/fixture.png?*', async (route) => {
    const params = new URL(route.request().url()).searchParams
    if (params.has('cached')) { await route.fulfill({ status: 404 }); return }
    if (params.get('source') === '6'.repeat(64)) {
      const screen = params.get('screen')!; attempts.set(screen, (attempts.get(screen) ?? 0) + 1)
      await held
      if (!failed) { failed = screen; await route.fulfill({ status: 503 }); return }
    }
    await route.fulfill({ contentType: 'image/png', body: png })
  })
  try {
    await page.goto('/review?scenario=intake.towel.fabric')
    const picture = page.locator('.app-screen-picture .rh-fixture-picture').filter({ has: page.locator('img') }).first()
    await expect(picture.locator('img')).toBeVisible()
    const previous = await picture.locator('img').getAttribute('src')
    version = '6'.repeat(64)
    await expect(picture).toHaveAttribute('data-snapshot-stale', 'true', { timeout: 15_000 })
    await expect(picture.locator('img')).toHaveAttribute('src', previous!)
    release()
    await expect.poll(() => failed && attempts.get(failed), { timeout: 15_000 }).toBeGreaterThan(1)
    await expect(picture).not.toHaveAttribute('data-snapshot-stale', 'true')
    await expect(picture.locator('img')).not.toHaveAttribute('src', previous!)
  } finally { release(); await page.unrouteAll({ behavior: 'wait' }) }
})

test('only visible snapshots load; blocked images never block navigation or Play', async ({ page }) => {
  const requested: string[] = []
  let batches = 0
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/api/review/snapshots', async (route) => { batches++; await route.fulfill({ status: 500 }) })
  await page.route('**/api/review/fixture.png?*', async (route) => {
    if (new URL(route.request().url()).searchParams.has('cached')) { await route.fulfill({ status: 404 }); return }
    requested.push(new URL(route.request().url()).searchParams.get('screen')!)
    await held
    await route.fulfill({ status: 503 })
  })
  try {
    await page.goto('/review?scenario=intake.towel.fabric')
    await expect(page.getByRole('navigation', { name: 'Canvas location' })).toContainText('Fabric')
    await expect.poll(() => requested.length).toBeGreaterThan(0)
    expect(requested.length).toBeLessThan(8)
    expect(requested).not.toContain('family.putaway')
    expect(batches).toBe(0)
    await expect(page.getByText('Preparing snapshots…', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.frameLocator('iframe[title="Live towel journey"]').getByLabel('Other material 1', { exact: true })).toBeVisible()
    const outline = page.getByRole('complementary', { name: 'App flow navigator' })
    await outline.getByRole('button', { name: /Family laundry day/ }).click()
    await expect.poll(() => requested.some((id) => id.startsWith('family.'))).toBe(true)
    await page.getByRole('navigation', { name: 'Canvas location' }).getByRole('button', { name: 'App', exact: true }).click()
    await page.getByRole('button', { name: 'Review', exact: true }).click()
    await page.getByRole('button', { name: 'Comment on selection' }).click()
    await page.getByLabel('What should change?').fill('QA: save this map without waiting for its images.')
    await page.getByRole('button', { name: 'Save review', exact: true }).click()
    await expect(page.getByText('Review saved with its target and frozen evidence.', { exact: true })).toBeVisible()
    release()
    expect(batches).toBe(0)
    await expect(page.getByText('Retrying snapshot…').first()).toBeVisible()
  } finally { release(); await page.unrouteAll({ behavior: 'wait' }) }
})
