import { expect, test } from '@playwright/test'

test.use({ trace: 'off' })
test.skip(process.env.WASHCLOSET_REVIEW_E2E !== '1' || !process.env.REHEARSAL_APP_ROOT, 'Run explicitly against a linked synthetic review server.')
test.beforeEach(async ({ page }) => {
  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === new URL(process.env.WASHCLOSET_E2E_BASE_URL!).origin && (request.method() === 'GET' || ['/api/review/snapshots', '/api/review/runtime'].includes(url.pathname))) await route.continue()
    else await route.abort()
  })
})

test('a stale thumbnail never blocks Play or replaces the open linked draft', async ({ page }) => {
  let attempts = 0
  await page.route('**/api/review/fixture.png?*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('screen') !== 'fabric') return route.continue()
    attempts++
    if (attempts === 1) return route.fulfill({ status: 409, json: { error: 'Source changed during capture' } })
    await route.continue()
  })
  await page.goto('/review?scenario=intake.towel.fabric')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  const frame = page.frameLocator('iframe[title="Live towel journey"]')
  await frame.getByLabel('Other material 1', { exact: true }).fill('Keep this linked draft')
  expect(attempts).toBeGreaterThanOrEqual(1)
  await expect(frame.getByLabel('Other material 1', { exact: true })).toHaveValue('Keep this linked draft')
  await expect(page.locator('.rehearsal')).toHaveAttribute('data-application-root', process.env.REHEARSAL_APP_ROOT!)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('linked app presenters retain towel inputs, recording and proposal edits', async ({ page }) => {
  await page.goto('/review-frame.html?scenario=intake.towel.fabric&journey=towel')
  await expect(page.getByRole('heading', { name: 'What’s it made of?' })).toBeVisible()
  const index = await (await page.request.get('/api/review/index')).json()
  expect(index.connection.applicationRoot).toBe(process.env.REHEARSAL_APP_ROOT)
  expect(index.connection.mode).toBe('read-only-linked-checkout')
  await page.getByLabel('Other material 1', { exact: true }).fill('Retained linked cotton')
  await page.evaluate(() => window.towelJourney!.setPresentation({ fabric: { title: 'Linked proposal', action: 'Try this composition', color: '#123456' } }, 42))
  await expect(page.getByRole('heading', { name: 'Linked proposal' })).toBeVisible()
  await expect(page.getByLabel('Other material 1', { exact: true })).toHaveValue('Retained linked cotton')
  await page.getByRole('button', { name: 'Try this composition', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Color', exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.towelJourney!.state()?.draft.material)).toContain('Retained linked cotton')
  expect(await page.evaluate(() => window.towelJourney!.state()?.screen)).toBe('color')
  await expect(page.getByRole('heading', { name: 'Preview unavailable' })).toHaveCount(0)
})

test('both origin branches use linked screens and care substeps remain addressable', async ({ page }) => {
  for (const branch of ['', '&branch=pre-owned']) {
    await page.goto(`/review-frame.html?scenario=intake.towel.origin&journey=towel${branch}`)
    await expect(page.getByRole('heading', { name: 'Where is it from?' })).toBeVisible()
    await page.getByRole('button', { name: /Next:/ }).click()
    expect(await page.evaluate(() => window.towelJourney!.state()?.screen)).toBe(branch ? 'care:wash' : 'dye')
  }
  await page.goto('/review-frame.html?scenario=intake.towel.care&care=bleach&journey=towel')
  await expect(page.getByRole('heading', { name: 'Can it be bleached?' })).toBeVisible()
  expect(await page.evaluate(() => window.towelJourney!.state()?.screen)).toBe('care:bleach')
})
