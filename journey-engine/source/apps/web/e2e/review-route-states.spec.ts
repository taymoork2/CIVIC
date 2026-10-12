import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

test.use({ trace: 'off', viewport: { width: 393, height: 852 } })
test.skip(process.env.WASHCLOSET_REVIEW_E2E !== '1', 'Run against an isolated synthetic review server.')
test.beforeEach(async ({ page }) => {
  // The route adapter must never contact a household backend.
  await page.route('**/*', async (route) => {
    const request = route.request()
    if (new URL(request.url()).origin === new URL(process.env.WASHCLOSET_E2E_BASE_URL!).origin && request.method() === 'GET') await route.continue()
    else await route.abort()
  })
})
test.afterEach(async ({ page }) => {
  await expect(page.getByText('Something went wrong!', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Preview unavailable', exact: true })).toHaveCount(0)
})

test('first-use Add clothes opens the actual chooser and cancel restores Home', async ({ page }) => {
  await page.goto('/review-frame.html?scenario=legacy.home-empty')
  await page.getByRole('link', { name: 'Add your first garment', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'What is it?', exact: true })).toBeVisible()
  await page.screenshot({ path: resolve('../..', '.review-data/route.closet.add-choose.png') })
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome', exact: true })).toBeVisible()
})

test('an in-load garment opens its running wash, returns to the item and can confirm washer finish', async ({ page }) => {
  await page.goto('/review-frame.html?scenario=route.closet.running')
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Back to Closet', exact: true })).toBeVisible()
  await page.screenshot({ path: resolve('../..', '.review-data/route.laundry.session-closet.png') })
  await page.getByRole('button', { name: 'Back to Closet', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('White cotton tee')
  await expect(page.getByRole('button', { name: 'Open', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await page.getByRole('button', { name: /Washer.*done|Washer.*finished|Wash.*done/i }).click()
  await expect(page.getByRole('button', { name: 'Move to drying queue', exact: true })).toBeEnabled()
  await page.goto('/review-frame.html?scenario=legacy.closet-record')
  await expect(page.getByRole('button', { name: 'Open', exact: true })).toHaveCount(0)
})

test('the hamper drawer keeps its quantity inputs and returns to the originating Closet item', async ({ page }) => {
  await page.goto('/review-frame.html?scenario=legacy.closet-record')
  await page.getByRole('button', { name: /in the hamper/i }).click()
  const drawer = page.getByRole('dialog')
  await expect(drawer).toBeVisible()
  await drawer.getByRole('region', { name: 'Food or drink', exact: true }).getByRole('button', { name: 'Less: Wash now', exact: true }).click()
  await expect(drawer).toContainText('1 of 2')
  await expect(page.locator('h1')).toHaveText('Laundry')
  await page.screenshot({ path: resolve('../..', '.review-data/route.laundry.hamper-item.png') })
  await drawer.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.locator('h1')).toHaveText('Closet')
  await expect(page.getByRole('dialog')).toContainText('White cotton tee')
})

test('washer transfer succeeds locally and Back retains the queued pieces in Laundry', async ({ page }) => {
  await page.goto('/review-frame.html?scenario=route.laundry.washed')
  await page.getByRole('button', { name: 'Move to drying queue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Drying', exact: true })).toBeVisible()
  await expect(page.getByText('2 pieces · from Washer 14 · Tumble dry, low heat', { exact: true })).toBeVisible()
  await page.screenshot({ path: resolve('../..', '.review-data/route.drying.washer-queued.png') })
  await page.getByRole('button', { name: 'Back to Laundry', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Laundry', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /2 pieces drying/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'In the hamper', exact: true })).toHaveCount(0)
})

test('failed, offline and read-only transfers stay on the washed screen; a failed transfer can retry', async ({ page }) => {
  for (const condition of ['condition=offline', 'readOnly=1']) {
    await page.goto(`/review-frame.html?scenario=route.laundry.washed&${condition}`)
    await expect(page.getByRole('button', { name: 'Move to drying queue', exact: true })).toBeDisabled()
  }
  await page.goto('/review-frame.html?scenario=route.laundry.washed&condition=save-error')
  await page.getByRole('button', { name: 'Move to drying queue', exact: true }).click()
  await expect(page.getByText(/Synthetic washer transfer failed/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Drying', exact: true })).toHaveCount(0)
  await page.evaluate(() => window.reviewPreview!.retryWrites())
  await page.getByRole('button', { name: 'Move to drying queue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Drying', exact: true })).toBeVisible()
})

test('completed wash opens the actual History tab and restores the completed wash and Me origin', async ({ page }) => {
  await page.goto('/review-frame.html?scenario=legacy.laundry-completed')
  await page.getByRole('link', { name: /White cotton tee/ }).click()
  await expect(page.getByRole('tab', { name: 'History', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('dialog')).toContainText('Washer 14')
  await expect(page.getByRole('dialog')).toContainText('Low heat, 40 min')
  await page.screenshot({ path: resolve('../..', '.review-data/route.closet.history.png') })
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'White cotton tees, done.', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Back to Me', exact: true }).last().click()
  await expect(page.getByRole('heading', { name: 'Me', exact: true })).toBeVisible()
})
