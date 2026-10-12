import { expect, test } from '@playwright/test'
import { api } from '../src/api'
import { addMachines, convexAs, createHousehold, openHousehold, signUp } from './flows'

test('garment fact edits stay focused and preserve other facts through save and reload', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await signUp(page, 'focused-edit', 'Focused Test')
  await createHousehold(page)
  const { client, householdId } = await convexAs(page)
  const ids = await client.mutation(api.inventory.createTextiles, { householdId, name: 'Focused tee', quantity: 1, kind: 'shirt', status: 'clean', bulkUnits: 1, color: 'White', colorGroup: 'light', dyeRun: 'fast', tags: ['Work'] })
  const before = (await client.query(api.inventory.list, { householdId })).textiles[0]!
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Closet', exact: true }).click()
  await page.getByRole('button', { name: /^Focused tee,/ }).click()
  const record = page.getByRole('dialog').first()
  const pencil = page.getByRole('button', { name: 'Edit item details', exact: true, includeHidden: true })
  await expect(pencil).toBeEnabled()
  await record.getByRole('tab', { name: 'Details', exact: true }).click()
  await record.getByRole('button', { name: /^Brand/ }).click()
  const editor = page.getByRole('dialog').last()
  await expect(editor.getByRole('heading', { name: 'Brand and size', exact: true })).toBeVisible()
  await expect(pencil).toBeVisible()
  await expect(pencil).toBeDisabled()
  await expect(pencil).toHaveCSS('opacity', '0.45')
  await expect(editor.getByLabel('Brand', { exact: true })).toBeFocused()
  await expect(editor.getByLabel('Color', { exact: true })).toHaveCount(0)
  await expect(editor.getByRole('textbox', { name: 'Tags', exact: true })).toHaveCount(0)
  await editor.getByLabel('Brand', { exact: true }).fill('Test brand')
  await editor.getByLabel('Size', { exact: true }).fill('34DD')
  for (const width of [320, 1200, 393]) {
    await page.setViewportSize({ width, height: 852 })
    expect(await editor.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  }
  await page.screenshot({ path: test.info().outputPath('focused-brand-phone.png') })
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(pencil).toBeEnabled()
  await expect(record.getByRole('tab', { name: 'Details', exact: true })).toHaveAttribute('aria-selected', 'true')
  const after = (await client.query(api.inventory.list, { householdId })).textiles[0]!
  expect(after).toEqual({ ...before, identity: { ...before.identity, brand: 'Test brand', size: '34DD' } })
  await record.getByRole('button', { name: /^Quantity/ }).click()
  await expect(editor.getByRole('heading', { name: 'Quantity', exact: true })).toBeVisible()
  await expect(pencil).toBeVisible()
  await expect(pencil).toBeDisabled()
  await expect(editor.getByLabel(/matching pieces/)).toBeFocused()
  await expect(editor.getByLabel('Brand', { exact: true })).toHaveCount(0)
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(pencil).toBeEnabled()
  await record.getByRole('button', { name: /^Whose/ }).click()
  await expect(editor.getByRole('heading', { name: 'Belongs to', exact: true })).toBeVisible()
  await editor.evaluate(async (element) => { await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined))) })
  await expect(pencil).toBeVisible()
  await expect(pencil).toBeDisabled()
  await page.screenshot({ path: test.info().outputPath('quick-edit-pencil-phone.png') })
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(pencil).toBeEnabled()
  await record.getByRole('button', { name: /^Tags/ }).click()
  await expect(editor.getByRole('heading', { name: 'Tags', exact: true })).toBeVisible()
  await expect(pencil).toBeVisible()
  await expect(pencil).toBeDisabled()
  await editor.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(pencil).toBeEnabled()
  await page.reload()
  await expect(page.getByRole('dialog', { name: 'Focused tee', exact: true })).toBeVisible()
  await record.getByRole('tab', { name: 'Details', exact: true }).click()
  await expect(record.getByRole('button', { name: /^Brand/ })).toContainText('Test brand')
  expect((await client.query(api.inventory.list, { householdId })).textiles.map((piece) => piece.textileId)).toEqual(ids)
})

test('appliance location, specifications and checked programs open in their editor sections', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await signUp(page, 'flat-machine', 'Machine Test')
  await createHousehold(page)
  await openHousehold(page, 'Appliances')
  await addMachines(page, { kind: 'Washer', name: 'Focused washer', count: 1 })
  const { client, householdId } = await convexAs(page)
  const before = (await client.query(api.inventory.list, { householdId })).machines[0]!
  await page.getByRole('button', { name: /^Focused washer/ }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: /^Location/ }).click()
  await expect(sheet.getByRole('group', { name: 'Where is it?', exact: true })).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Shared room', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(sheet.getByLabel('Model number', { exact: true })).toHaveCount(0)
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme as 'light' | 'dark' })
    await sheet.evaluate(async (element) => { await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined))) })
    await page.screenshot({ path: test.info().outputPath(`appliance-location-${theme}.png`) })
  }
  await sheet.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect((await client.query(api.inventory.list, { householdId })).machines[0]).toEqual(before)
  await sheet.getByRole('button', { name: /^Location/ }).click()
  await sheet.getByRole('button', { name: 'At home', exact: true }).click()
  await sheet.getByRole('button', { name: 'Save washer', exact: true }).click()
  await expect(sheet.getByRole('button', { name: /^Location/ })).toContainText('At home')
  expect((await client.query(api.inventory.list, { householdId })).machines[0]).toEqual({ ...before, location: 'home' })
  await page.reload()
  await expect(sheet.getByRole('button', { name: /^Location/ })).toContainText('At home')
  await sheet.getByRole('button', { name: /^Location/ }).click()
  await expect(sheet.getByRole('button', { name: 'At home', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('button', { name: 'Shared room', exact: true }).click()
  await sheet.getByRole('button', { name: 'Save washer', exact: true }).click()
  await expect(sheet.getByRole('button', { name: /^Location/ })).toContainText('Shared room')
  expect((await client.query(api.inventory.list, { householdId })).machines[0]).toEqual(before)
  for (const [row, control] of [
    ['Loading', 'Door'],
    ['High efficiency', 'Do you see this logo on it?'],
    ['Softener compartment', 'Slots you see'],
  ]) {
    await sheet.getByRole('button', { name: new RegExp(`^${row}`) }).click()
    await expect(sheet.getByRole('group', { name: control, exact: true })).toBeVisible()
    await sheet.getByRole('button', { name: 'Cancel', exact: true }).click()
  }
  for (const [row, control] of [
    ['Normal cycle', 'Minutes for a normal wash'],
    ['Price', 'Number or label as printed'],
    ['Capacity', 'Drum size in cu. ft.'],
    ['Model', 'Model number'],
  ]) {
    await sheet.getByRole('button', { name: new RegExp(`^${row}`) }).click()
    await expect(sheet.getByLabel(control, { exact: true })).toBeVisible()
    await sheet.getByRole('button', { name: 'Cancel', exact: true }).click()
  }
  await sheet.getByRole('button', { name: 'Edit settings', exact: true }).click()
  await expect(sheet.getByRole('group', { name: 'Where is it?', exact: true })).toBeVisible()
  await sheet.getByRole('tab', { name: 'More', exact: true }).click()
  await expect(sheet.getByRole('group', { name: 'Model and drum size', exact: true })).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Advanced', exact: true })).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: 'Find manufacturer details', exact: true })).toBeVisible()
  await expect(sheet.getByLabel('Model number', { exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: 'Cancel', exact: true }).click()
  await sheet.getByRole('button', { name: 'Edit settings', exact: true }).click()
  await sheet.getByRole('tab', { name: 'Programs', exact: true }).click()
  await expect(sheet.getByRole('group', { name: 'Checked wash programs and options', exact: true })).toBeVisible()
  await expect(sheet.getByLabel('Checked program and selected options').first()).toBeVisible()
  await expect(sheet.getByLabel('Rinse contact minutes', { exact: true })).toBeHidden()
  await sheet.getByRole('tab', { name: 'Sanitizer', exact: true }).click()
  await expect(sheet.getByLabel('Rinse contact minutes', { exact: true })).toBeVisible()
})
