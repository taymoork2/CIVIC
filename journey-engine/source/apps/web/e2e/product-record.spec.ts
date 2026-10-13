import { expect, test } from '@playwright/test'
import { addBottle, addMachines, createHousehold, openHousehold, signUp } from './flows'

test.use({ locale: 'en-US' })

const forms = ['Liquid', 'Pods', 'Powder', 'Scent beads', 'Dryer sheets', 'Dryer balls', 'Dispenser'] as const

// Actual Household routes; the product and washer are synthetic.
test('the product form grid keeps marks only for forms that take them', async ({ page }) => {
  await signUp(page, 'product-grid', 'Synthetic Product Grid')
  await createHousehold(page)
  await openHousehold(page, 'Products')
  await page.getByRole('button', { name: 'Add a product' }).click()
  const bottle = page.getByRole('dialog').last()
  const grid = bottle.getByRole('group', { name: 'Product type', exact: true })
  await expect(grid.getByRole('button')).toHaveCount(forms.length)
  for (const form of forms) await expect(grid.getByRole('button', { name: form, exact: true })).toHaveAttribute('aria-pressed', 'false')
  const toMarks = async () => {
    await bottle.getByRole('button', { name: 'Next', exact: true }).click()
    if (await bottle.getByRole('button', { name: 'Detergent', exact: true }).isVisible()) {
      await bottle.getByRole('button', { name: 'Detergent', exact: true }).click()
      await bottle.getByRole('button', { name: 'Next', exact: true }).click()
    }
    await bottle.getByLabel('Product name', { exact: true }).fill('Synthetic grid detergent')
    await bottle.getByRole('button', { name: 'Next', exact: true }).click()
  }
  const toForm = async () => {
    for (let back = 0; back < 4 && !await grid.isVisible(); back++) await bottle.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(grid).toBeVisible()
  }
  await grid.getByRole('button', { name: 'Liquid', exact: true }).click()
  await toMarks()
  const mark = (label: string) => bottle.getByRole('button', { name: label, exact: true })
  await mark('1').click()
  await mark('3').click()
  await toForm()
  await grid.getByRole('button', { name: 'Powder', exact: true }).focus()
  await page.keyboard.press('Space')
  await expect(grid.locator('[aria-pressed="true"]')).toHaveCount(1)
  await toMarks()
  await expect(mark('1')).toHaveAttribute('aria-pressed', 'true')
  await expect(mark('3')).toHaveAttribute('aria-pressed', 'true')
  await toForm()
  await grid.getByRole('button', { name: 'Pods', exact: true }).click()
  await toMarks()
  await expect(mark('1')).toHaveCount(0)
  await toForm()
  await grid.getByRole('button', { name: 'Liquid', exact: true }).click()
  await toMarks()
  await expect(mark('1')).toHaveAttribute('aria-pressed', 'false')
  await expect(mark('3')).toHaveAttribute('aria-pressed', 'false')
  await bottle.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('alertdialog', { name: 'Discard your changes?', exact: true }).getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(bottle).toHaveCount(0)
})

test('a product row opens the editor at its section and Cancel and Save return to it', async ({ page }) => {
  await signUp(page, 'product-record', 'Synthetic Product Record')
  await createHousehold(page)
  await addBottle(page, 'Synthetic record detergent', ['1', '3', '5'])
  await page.getByRole('main').getByRole('button', { name: /Synthetic record detergent/ }).click()
  const record = page.getByRole('dialog', { name: 'Synthetic record detergent' })
  const directions = record.getByRole('tab', { name: 'Directions', exact: true })
  const row = record.getByRole('button', { name: /^Label directions/ })
  const save = record.getByRole('button', { name: 'Save', exact: true })
  const edit = record.getByRole('button', { name: 'Edit details', exact: true })
  await directions.click()
  await row.click()
  await expect(save).toBeVisible()
  await expect(directions).toHaveAttribute('aria-selected', 'true')
  await expect(record.getByRole('group', { name: 'Marks on the cap · 1, 3, 5', exact: true })).toBeVisible()
  await expect(record.getByLabel('Do not use on these materials', { exact: true })).toBeVisible()

  await record.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(save).toHaveCount(0)
  await expect(edit).toBeVisible()
  await expect(directions).toHaveAttribute('aria-selected', 'true')
  await expect(row).toBeVisible()

  await row.click()
  await expect(save).toBeVisible()
  await save.click()
  // A saved edit returns to the same record and section; the drawer stays open.
  await expect(save).toHaveCount(0)
  await expect(record).toBeVisible()
  await expect(edit).toBeVisible()
  await expect(directions).toHaveAttribute('aria-selected', 'true')
  await expect(row).toBeVisible()
})

test('an appliance Capacity row opens the editor at the drum size', async ({ page }) => {
  await signUp(page, 'appliance-capacity', 'Synthetic Appliance Capacity')
  await createHousehold(page)
  await addMachines(page, { kind: 'Washer', name: 'Laundry room washer', count: 1, price: '2.50', minutes: '40' })
  await page.getByRole('button', { name: /^Laundry room washer/ }).click()
  const machine = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Laundry room washer', exact: true }) })
  await machine.getByRole('button', { name: /^Capacity/ }).click()
  const drum = machine.getByLabel('Drum size in cu. ft.', { exact: true })
  await expect(drum).toBeVisible()
  await expect(drum).toBeFocused()
  await expect(machine.getByRole('button', { name: 'Save washer', exact: true })).toBeVisible()
})
