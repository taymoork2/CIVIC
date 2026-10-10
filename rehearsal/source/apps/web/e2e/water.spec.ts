import { expect, test } from '@playwright/test'
import { createHousehold, openHousehold, signUp, topDialog } from './flows'

test('water is set from a ZIP, the bill and the town, and a strip reading overrides it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signUp(page, 'water', 'Wren Water')
  await createHousehold(page, 'At home')
  await openHousehold(page, 'Appliances')
  await page.getByRole('button', { name: /^Water: Not set/ }).click()

  const sheet = topDialog(page)
  await sheet.getByLabel('What’s your ZIP code?').fill('94526')
  await sheet.getByRole('button', { name: 'Continue', exact: true }).click()
  // Danville's ZIP has one water company, so only the town is asked.
  await expect(sheet.getByRole('button', { name: 'EBMUD (East Bay MUD)' })).toHaveCount(0)
  await sheet.getByLabel('Which town is your home in?').selectOption({ label: 'Danville' })
  await sheet.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(sheet.getByText('EBMUD, Danville')).toBeVisible()
  await expect(sheet.getByText('Soft', { exact: true })).toBeVisible()

  await sheet.getByRole('button', { name: 'Have a test strip or water report?', exact: true }).click()
  await sheet.getByRole('button', { name: 'From a test strip', exact: true }).click()
  await sheet.getByLabel('Reading', { exact: true }).fill('9')
  await sheet.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(sheet.getByText('Hard', { exact: true })).toBeVisible()
  await expect(sheet.getByText(/^Strip reading, /)).toBeVisible()
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Water: Hard\. Strip reading, / })).toBeVisible()
})

test('an unlisted ZIP offers no EBMUD, a report needs its year, and a softener without a strip stays not known', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signUp(page, 'water-unlisted', 'Uma Unlisted')
  await createHousehold(page, 'At home')
  await openHousehold(page, 'Appliances')
  await page.getByRole('button', { name: /^Water: Not set/ }).click()

  const sheet = topDialog(page)
  await sheet.getByLabel('What’s your ZIP code?').fill('1000')
  await sheet.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(sheet.getByRole('alert')).toHaveText('A ZIP code is five digits.')
  await expect(sheet.getByLabel('What’s your ZIP code?')).toHaveAttribute('aria-invalid', 'true')
  await sheet.getByLabel('What’s your ZIP code?').fill('10001')
  await sheet.getByRole('button', { name: 'Continue', exact: true }).click()
  // No company is asked for a ZIP we don't list: straight to the result.
  await expect(sheet.getByText('We don’t have your water company yet. A strip reading still works.')).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'EBMUD (East Bay MUD)' })).toHaveCount(0)
  await expect(sheet.getByText('Not known', { exact: true })).toBeVisible()
  await expect(sheet.getByText('Water company not listed')).toBeVisible()

  await sheet.getByRole('button', { name: 'Have a test strip or water report?', exact: true }).click()
  await sheet.getByRole('button', { name: 'From my water report', exact: true }).click()
  await sheet.getByLabel('Reading', { exact: true }).fill('40')
  await sheet.getByLabel('Unit', { exact: true }).selectOption('mg_l')
  await sheet.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(sheet.getByRole('alert')).toHaveText('Enter the year printed on the report.')
  await sheet.getByLabel('Year of the report', { exact: true }).fill(String(new Date().getFullYear() - 1))
  await sheet.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(sheet.getByText('Soft', { exact: true })).toBeVisible()

  await sheet.getByRole('button', { name: 'Have a test strip or water report?', exact: true }).click()
  await sheet.getByRole('button', { name: 'I have a water softener', exact: true }).click()
  await sheet.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(sheet.getByText('Not known', { exact: true })).toBeVisible()
  await expect(sheet.getByText('Softener, no strip reading')).toBeVisible()
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Water: Not known. Softener, no strip reading. Change' })).toBeVisible()
})
