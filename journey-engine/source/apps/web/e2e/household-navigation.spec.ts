import { expect, test } from '@playwright/test'
import { createHousehold, signUp } from './flows'

test('Household starts with People, while explicit sections survive reload and Back', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { pageSnapshots: 0 })
    const start = document.startViewTransition?.bind(document)
    if (start) document.startViewTransition = (...args) => { (window as any).pageSnapshots++; return start(...args) }
  })
  await page.setViewportSize({ width: 393, height: 852 })
  await signUp(page, 'household-tabs', 'Household Test')
  await createHousehold(page)
  await page.evaluate(() => localStorage.setItem('washcloset:private:household-section', JSON.stringify('bottles')))
  await page.goto('/household')
  const tabs = page.getByRole('group', { name: 'Show', exact: true }).getByRole('button')
  await expect(tabs).toHaveText(['People', 'Appliances', 'Products'])
  const people = page.getByRole('button', { name: 'People', exact: true })
  const products = page.getByRole('button', { name: 'Products', exact: true })
  const appliances = page.getByRole('button', { name: 'Appliances', exact: true })
  await expect(people).toHaveAttribute('aria-pressed', 'true')
  await products.click()
  await expect(page).toHaveURL(/section=bottles/)
  await page.reload()
  await expect(products).toHaveAttribute('aria-pressed', 'true')
  const navigation = page.getByRole('navigation', { name: 'Primary navigation' })
  for (const name of ['Me', 'Closet', 'Household', 'Home']) {
    await navigation.getByRole('link', { name, exact: true }).click()
    expect(await page.evaluate(() => (window as any).pageSnapshots)).toBe(0)
  }
  await page.goto('/household?section=bottles')
  await navigation.getByRole('link', { name: 'Home', exact: true }).click()
  await page.goBack()
  await expect(products).toHaveAttribute('aria-pressed', 'true')
  await navigation.getByRole('link', { name: 'Home', exact: true }).click()
  await navigation.getByRole('link', { name: 'Household', exact: true }).click()
  await expect(people).toHaveAttribute('aria-pressed', 'true')
  await page.goto('/household?machine=missing')
  await expect(appliances).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Return to appliances', exact: true }).click()
  await expect(page).toHaveURL(/section=machines/)
  const authenticated = page.waitForResponse((response) => response.url().endsWith('/api/auth/convex/token') && response.status() === 200)
  await page.goto('/household?product=missing')
  await authenticated
  await expect(products).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Return to products', exact: true }).click()
  await expect(page).toHaveURL(/section=bottles/)
  await page.goto('/household?section=invalid')
  await expect(people).toHaveAttribute('aria-pressed', 'true')
})
