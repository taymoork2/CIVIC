import { expect, test } from '@playwright/test'
import { api } from '../src/api'
import { addClothes, careLabel, convexAs, createHousehold, freshPage, signUp } from './flows'

test.use({ locale: 'en-US' })

test('empty Laundry keeps one intake through the first save, repeats, keeps answers on Back and asks before discarding', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await signUp(page, 'intake', 'Ivy Intake')
  await createHousehold(page)
  await page.getByRole('navigation').getByRole('link', { name: /^Laundry/ }).click()
  await page.getByRole('button', { name: 'Add clothes to wash', exact: true }).click()
  const sheet = page.getByRole('dialog')

  // Type first, as recognizable tiles with no hangers; Back keeps the picked type and typed answers.
  await expect(sheet.getByRole('heading', { name: 'What is it?' })).toBeVisible()
  await sheet.getByRole('button', { name: 'T-shirt', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: details', exact: true }).click()
  await sheet.getByLabel('Quantity', { exact: true }).fill('2')
  await sheet.getByRole('button', { name: 'Back', exact: true }).click()
  await sheet.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(sheet.getByRole('button', { name: 'T-shirt', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('button', { name: 'Next: whose', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: details', exact: true }).click()
  await expect(sheet.getByLabel('Quantity', { exact: true })).toHaveValue('2')
  await sheet.getByRole('button', { name: 'Next: fabric', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: color', exact: true }).click()
  await sheet.getByRole('radio', { name: 'White', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: where from', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: dye', exact: true }).click()
  await sheet.getByRole('radio', { name: 'New, not washed yet', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: care label', exact: true }).click()
  await careLabel(sheet, 'Cold', 'Low heat')
  await sheet.getByRole('radio', { name: 'No stains', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: review', exact: true }).click()
  await expect(sheet.getByRole('radio', { name: 'Needs washing', exact: true })).toBeChecked()
  await sheet.getByRole('button', { name: 'Save item', exact: true }).click()

  // E03: the empty hamper fills behind the same open intake, and the result stays visible.
  await expect(sheet.getByRole('status')).toHaveText('2 white tees added to the hamper')
  // The page behind the open sheet is inert, so it is checked by its visible text.
  await expect(page.getByText('In the hamper', { exact: true })).toBeVisible()
  await expect(sheet.getByRole('heading', { name: 'First items added', exact: true })).toBeVisible()

  // Same again, another color: type, count and care come along; first wash is asked again.
  await sheet.getByRole('button', { name: /^Another color/ }).click()
  await sheet.getByRole('radio', { name: 'Black', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: where from', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: dye', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: care label', exact: true }).click()
  await expect(sheet.getByRole('group', { name: 'Washtub on the tag' }).getByRole('button', { name: 'Cold', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await careLabel(sheet, 'Cold', 'Low heat')
  await sheet.getByRole('radio', { name: 'No stains', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: review', exact: true }).click()
  await sheet.getByRole('button', { name: 'Save item', exact: true }).click()

  await expect(sheet.getByRole('heading', { name: 'Saved', exact: true })).toBeVisible()
  await expect(sheet.getByRole('heading', { name: 'First items added', exact: true })).toHaveCount(0)
  await expect(sheet.locator('[data-completion-mark]')).toHaveCSS('animation-name', 'none')
  await expect(sheet.getByRole('status')).toHaveText('2 black tees added to the hamper')
  await expect(sheet.locator('.sheet-sub')).toHaveText('4 added')

  // Add another starts a new type with care blank; closing with an answer asks first.
  await sheet.getByRole('button', { name: /^Add something else/ }).click()
  await sheet.getByRole('button', { name: 'Socks', exact: true }).click()
  await sheet.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('alertdialog', { name: 'Discard your changes?', exact: true }).getByRole('button', { name: 'Keep editing', exact: true })).toBeVisible()
  await page.getByRole('alertdialog', { name: 'Discard your changes?', exact: true }).getByRole('button', { name: 'Keep editing', exact: true }).click()
  await expect(sheet.getByRole('heading', { name: 'Whose is it?' })).toBeVisible()
  await sheet.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('alertdialog', { name: 'Discard your changes?', exact: true }).getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Stored facts: four pieces in the hamper; "new" only where it was said, unknown stays unknown.
  const { client, householdId } = await convexAs(page)
  const { textiles } = await client.query(api.inventory.list, { householdId })
  expect(textiles.map((textile) => [textile.name, textile.status, textile.firstWash]).sort()).toEqual([
    ['Black T-shirt', 'dirty', null], ['Black T-shirt', 'dirty', null],
    ['White T-shirt', 'dirty', true], ['White T-shirt', 'dirty', true],
  ])
})

test('searching clothing picks a specific article, names the garment by it and saves its care type', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await signUp(page, 'intake-search', 'Sid Search')
  await createHousehold(page)
  await page.getByRole('navigation').getByRole('link', { name: /^Laundry/ }).click()
  await page.getByRole('button', { name: 'Add clothes to wash', exact: true }).click()
  const sheet = page.getByRole('dialog')

  // Typing replaces the type tiles with matching articles, each with its care type.
  await expect(sheet.getByRole('heading', { name: 'What is it?' })).toBeVisible()
  await sheet.getByRole('searchbox', { name: 'Search items' }).fill('hood')
  await expect(sheet.getByRole('button', { name: 'T-shirt', exact: true })).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Hoodie, Sweater', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: details', exact: true }).click()
  await expect(sheet.getByText('Leave blank for a name like “Gray hoodie”.', { exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: 'Next: fabric', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: color', exact: true }).click()
  await sheet.getByRole('radio', { name: 'Gray', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: where from', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: dye', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: care label', exact: true }).click()
  await careLabel(sheet, 'Cold', 'Low heat')
  await sheet.getByRole('radio', { name: 'No stains', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: review', exact: true }).click()
  await sheet.getByRole('button', { name: 'Save item', exact: true }).click()
  await expect(sheet.getByRole('status')).toHaveText('1 gray hoodie added to the hamper')
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const { client, householdId } = await convexAs(page)
  const { textiles } = await client.query(api.inventory.list, { householdId })
  expect(textiles.map((textile) => [textile.name, textile.kind, textile.status])).toEqual([['Gray hoodie', 'sweater', 'dirty']])
})

test('an old, set-in stain is saved as a known mark that holds nothing up, and can be sent to treat', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await signUp(page, 'intake-mark', 'Mo Mark')
  await createHousehold(page)
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Closet', exact: true }).click()
  await page.getByRole('button', { name: 'Add clothes', exact: true }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: 'T-shirt', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: details', exact: true }).click()
  await sheet.getByLabel('Name', { exact: true }).fill('Work tee')
  await sheet.getByRole('button', { name: 'Next: fabric', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: color', exact: true }).click()
  await sheet.getByRole('radio', { name: 'White', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: where from', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: dye', exact: true }).click()
  await sheet.getByRole('radio', { name: 'Washed without dye running', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: care label', exact: true }).click()
  await careLabel(sheet, 'Cold', 'Low heat')


  // An old stain is asked about, said plainly, and keeps the garment where it was going.
  await sheet.getByRole('radio', { name: 'Food or drink', exact: true }).click()
  await sheet.getByRole('radio', { name: 'Old, set in', exact: true }).click()
  await expect(sheet.getByText('May not come out. Saved as a known mark; washing can continue.', { exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: 'Next: review', exact: true }).click()
  await sheet.getByRole('radio', { name: 'Ready to wear', exact: true }).click()
  await sheet.getByRole('button', { name: 'Save item', exact: true }).click()
  await expect(sheet.getByRole('status').first()).toContainText('added')
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const { client, householdId } = await convexAs(page)
  const saved = (await client.query(api.inventory.list, { householdId })).textiles
  expect(saved.map((textile) => [textile.name, textile.status, textile.flag ?? null, textile.knownStain?.reason ?? null])).toEqual([['Work tee', 'clean', null, 'food']])

  // The record names the mark and offers to try treating it, without promising it comes out.
  await page.getByRole('button', { name: /^Work tee,/ }).click()
  const record = page.getByRole('dialog')
  await expect(record.getByText('Old food stain')).toBeVisible()
  await record.getByRole('button', { name: 'Try treating it at the next wash', exact: true }).click()
  await expect(page.getByText('It’s in the hamper to try treating. It may not come out.', { exact: true })).toBeVisible()
  const treated = (await client.query(api.inventory.list, { householdId })).textiles
  expect(treated.map((textile) => [textile.status, textile.flag?.reasons ?? null, textile.knownStain ?? null])).toEqual([['dirty', ['food'], null]])
})

// Keep the former inventory spec's locale when sharing the intake file.
test.describe(() => {
  test.use({ locale: 'en-GB' })

  test('new and previously washed matching clothes save to the hamper and survive reload', async ({ browser }) => {
    const page = await freshPage(browser)
    try {
      await page.setViewportSize({ width: 390, height: 900 })
      await signUp(page, 'inventory-intake-fixture', 'Synthetic Intake')
      await createHousehold(page)
      await addClothes(page, { name: 'New navy tees — synthetic', color: 'Navy', count: 3, firstWash: true })
      await addClothes(page, { name: 'Worn white tees — synthetic', count: 2, firstWash: false })
      const { client, householdId } = await convexAs(page)
      const before = await client.query(api.inventory.list, { householdId })
      expect(before.textiles).toHaveLength(5)
      const newClothes = before.textiles.filter((piece) => piece.name === 'New navy tees — synthetic')
      const wornClothes = before.textiles.filter((piece) => piece.name === 'Worn white tees — synthetic')
      expect(newClothes).toHaveLength(3)
      expect(wornClothes).toHaveLength(2)
      for (const piece of newClothes) expect(piece).toMatchObject({ status: 'dirty', firstWash: true, dyeRun: 'new', color: 'Navy', care: { washMethod: 'machine', maxTemperatureC: 30, dryHeat: 'low' } })
      for (const piece of wornClothes) expect(piece).toMatchObject({ status: 'dirty', firstWash: false, dyeRun: 'fast', color: 'White' })
      const ids = before.textiles.map((piece) => piece.textileId).sort()
      await page.reload()
      await expect(page.getByRole('button', { name: /^New navy tees — synthetic,/ })).toBeVisible()
      await expect(page.getByRole('button', { name: /^Worn white tees — synthetic,/ })).toBeVisible()
      const after = await client.query(api.inventory.list, { householdId })
      expect(after.textiles.map((piece) => piece.textileId).sort()).toEqual(ids)
      expect(after.textiles).toEqual(before.textiles)
      await page.getByRole('navigation').getByRole('link', { name: /^Laundry/ }).click()
      await expect(page.getByRole('button', { name: /^New navy tees — synthetic,/ })).toContainText('3 of 3 selected')
      await expect(page.getByRole('button', { name: /^Worn white tees — synthetic,/ })).toContainText('2 of 2 selected')
      await expect(page.getByRole('button', { name: 'Sort 5 pieces into loads', exact: true })).toBeVisible()
    } finally { await page.context().close() }
  })
})
