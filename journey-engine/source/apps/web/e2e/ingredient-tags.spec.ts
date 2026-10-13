import { expect, test } from '@playwright/test'
import { api } from '../src/api'
import { convexAs, createHousehold, freshPage, openHousehold, signUp } from './flows'

test('ingredient chips save separate names, preserve punctuation, and retain an unfinished draft', async ({ browser }) => {
  const page = await freshPage(browser)
  try {
    await page.setViewportSize({ width: 393, height: 852 })
    await signUp(page, 'ingredient-chips', 'Synthetic Owner')
    await createHousehold(page)
    await openHousehold(page, 'People')
    await page.getByRole('button', { name: /^Add clothing profile\b/ }).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByLabel('Name', { exact: true }).fill('Ingredient profile')
    await sheet.getByRole('tab', { name: 'Products', exact: true }).click()
    const input = sheet.getByRole('textbox', { name: 'Ingredients to avoid', exact: true })
    const save = sheet.getByRole('button', { name: 'Save person', exact: true })
    const commaName = '1,2-benzisothiazolin-3-one'
    const longName = 'Sodium lauryl ether sulfate (ethoxylated)'
    await input.fill(commaName)
    await expect(save).toBeDisabled()
    await input.press('Enter')
    await expect(sheet.getByRole('button', { name: commaName, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await input.fill(longName)
    await sheet.getByRole('button', { name: 'Add', exact: true }).click()
    await input.fill(commaName.toUpperCase())
    await input.press('Enter')
    await expect(sheet.getByRole('button', { name: commaName, exact: true })).toHaveCount(1)
    await expect(input).toHaveValue('')
    await save.click()
    await expect(sheet).toHaveCount(0)
    const { client, householdId } = await convexAs(page)
    const saved = (await client.query(api.inventory.list, { householdId })).wearers.find((person) => person.name === 'Ingredient profile')!
    expect(saved.requirements?.avoidIngredients).toEqual([commaName, longName])

    await page.reload()
    await openHousehold(page, 'People')
    await page.getByRole('button', { name: /^Open Ingredient profile\./ }).click()
    const pencil = page.getByRole('button', { name: 'Edit clothing profile', exact: true, includeHidden: true })
    await page.getByRole('button', { name: 'Edit clothing profile', exact: true }).click()
    await expect(pencil).toBeVisible()
    await expect(pencil).toBeDisabled()
    await sheet.getByRole('tab', { name: 'Products', exact: true }).click()
    await expect(sheet.getByRole('button', { name: commaName, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(sheet.getByRole('button', { name: longName, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await input.fill('lanolin')
    await expect(save).toBeDisabled()
    await sheet.getByRole('button', { name: 'Close', exact: true }).click()
    await page.getByRole('alertdialog', { name: 'Discard your changes?', exact: true }).getByRole('button', { name: 'Keep editing', exact: true }).click()
    await expect(pencil).toBeDisabled()
    await expect(input).toHaveValue('lanolin')
    await sheet.getByRole('tab', { name: 'Access', exact: true }).click()
    await sheet.getByRole('button', { name: 'Remove person', exact: true }).click()
    await expect(pencil).toBeVisible()
    await expect(pencil).toBeDisabled()
    await sheet.getByRole('button', { name: 'Keep person', exact: true }).click()
    await sheet.getByRole('tab', { name: 'Products', exact: true }).click()
    await expect(input).toHaveValue('lanolin')
    await input.fill('')
    await sheet.getByRole('button', { name: longName, exact: true }).click()
    await save.click()
    await expect(pencil).toBeEnabled()
    await sheet.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(sheet).toHaveCount(0)
    const updated = (await client.query(api.inventory.list, { householdId })).wearers.find((person) => person.wearerId === saved.wearerId)!
    expect(updated.requirements?.avoidIngredients).toEqual([commaName])
  }
  finally { await page.context().close() }
})
