import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

test.use({ trace: 'off', viewport: { width: 393, height: 852 } })
test.skip(process.env.WASHCLOSET_REVIEW_E2E !== '1', 'Run against the isolated preview connected to the released Laundry presenters.')
test.beforeEach(async ({ page }) => {
  await page.route('**/*', async (route) => {
    const request = route.request()
    if (new URL(request.url()).origin === new URL(process.env.WASHCLOSET_E2E_BASE_URL!).origin && request.method() === 'GET') await route.continue()
    else await route.abort()
  })
  await page.goto('/review')
})
const care = async (page: import('@playwright/test').Page) => page.evaluate(() => {
  const data = window.reviewPreview!.data() as { textiles: unknown; runs: unknown }
  return { textiles: data.textiles, runs: data.runs }
})

test('the real reminder dismisses only the task, restores focus and keeps Home access to its exact check', async ({ page }) => {
  await page.goto('/review-frame.html?scenario=route.home.reminder-visible')
  const dismiss = page.getByRole('button', { name: /Dismiss.*Hanging/i })
  await expect(dismiss).toBeVisible()
  await expect.poll(() => page.locator('img[src="/design/care-complete.webp"]').evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await expect(page.locator('.home-dock a')).toHaveAttribute('href', '/drying?run=preview-rehearsal-air-1')
  const before = await care(page)
  await page.screenshot({ path: resolve('../..', '.review-data/reminder-visible.png') })
  await dismiss.click()
  await expect(page.locator('.home-dock')).toHaveCount(0)
  await expect(page.locator('#main-content')).toBeFocused()
  expect(await care(page)).toEqual(before)
  await page.screenshot({ path: resolve('../..', '.review-data/reminder-dismissed.png') })
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  const check = page.locator('a[href="/drying?run=preview-rehearsal-air-1"]')
  await expect(check).toBeVisible()
  await check.click()
  await expect(page.getByRole('heading', { name: 'Is it dry?', exact: true })).toBeVisible()
  expect(await care(page)).toEqual(before)
  await page.getByRole('button', { name: 'Drying', exact: true }).click()
  await page.getByRole('button', { name: /^(Back to )?Laundry$/ }).click()
  await expect(page.getByRole('heading', { name: 'Laundry', exact: true })).toBeVisible()
  expect(await care(page)).toEqual(before)
})

test('a changed run/count reappears after dismissal and opens that run without recording dryness', async ({ page }) => {
  await page.goto('/review-frame.html?scenario=route.home.reminder-dismissed')
  await expect(page.getByRole('heading', { name: 'Closet', exact: true })).toBeVisible()
  await expect(page.locator('.home-dock')).toHaveCount(0)
  await page.getByText('Reminder fixture conditions', { exact: true }).click()
  await page.getByRole('button', { name: 'Change synthetic drying task' }).click()
  const link = page.locator('.home-dock a')
  await expect(link).toHaveAttribute('href', '/drying?run=preview-rehearsal-air-2')
  const before = await care(page)
  expect((before.textiles as unknown[]).length).toBe(3)
  await page.screenshot({ path: resolve('../..', '.review-data/reminder-changed.png') })
  await link.click()
  await expect(page.getByRole('heading', { name: 'Is it dry?', exact: true })).toBeVisible()
  expect(await care(page)).toEqual(before)
  await page.screenshot({ path: resolve('../..', '.review-data/reminder-check.png') })
})
