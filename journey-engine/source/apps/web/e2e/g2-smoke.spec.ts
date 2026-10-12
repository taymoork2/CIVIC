import { expect, test } from '@playwright/test'
import { addClothes, createHousehold, signUp } from './flows'

test('a new person creates a household and adds a first piece through the one staged intake', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signUp(page, 'first-piece', 'Nia New')
  await createHousehold(page)
  await addClothes(page, { name: 'First black tee', color: 'Black' })
  await page.reload()
  await expect(page.getByRole('button', { name: /^First black tee,/ })).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: /^Laundry/ }).click()
  await expect(page.getByText(/^1 of 1 selected(?: ·|$)/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sort 1 piece into loads', exact: true })).toBeEnabled()
})
