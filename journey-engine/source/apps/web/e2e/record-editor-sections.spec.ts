import { expect, test } from '@playwright/test'
import { api } from '../src/api'
import { convexAs, createHousehold, openHousehold, signUp, topDialog } from './flows'

test('record editors group fields, retain drafts across tabs and keep configuration out of summaries', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await signUp(page, 'editor-sections', 'Synthetic Editor')
  await createHousehold(page, 'At home')
  const { client, householdId } = await convexAs(page)
  const provenance = { source: 'Synthetic editor check', confidence: 'user-supplied' as const }
  await client.mutation(api.inventory.createTextiles, { householdId, name: 'Editor towel', kind: 'towel', quantity: 2, status: 'clean', material: 'cotton', tag: { washMethod: 'machine', cycle: 'normal', maxTemperatureC: 40, bleach: 'non_chlorine', dryMethod: 'tumble_dry', dryHeat: 'medium' } })
  await client.mutation(api.inventory.createWearer, { householdId, name: 'Editor profile', kind: 'child' })
  await client.mutation(api.inventory.createSupply, { householdId, name: 'Editor liquid', kind: 'chemical', use: 'detergent', formulation: { name: 'Editor liquid', form: 'liquid' }, provenance })
  await client.mutation(api.inventory.createSupply, { householdId, name: 'Editor pods', kind: 'chemical', use: 'detergent', formulation: { name: 'Editor pods', form: 'pods' }, provenance })
  await client.mutation(api.inventory.createMachines, { householdId, name: 'Editor washer', count: 1, applianceType: 'front_load_washer', location: 'home', provenance })
  await client.mutation(api.inventory.setWater, { householdId, water: { zip: '94610', utility: 'ebmud', area: 'oakland', source: 'lookup' } })
  const cases = [
    ['item', null, /^Editor towel,/, 'Edit item details', ['Details', 'Fabric', 'Care', 'More'], 'Name'],
    ['profile', 'People', /^Open Editor profile\./, 'Edit clothing profile', ['Person', 'Products', 'Access'], 'Name'],
    ['product', 'Products', /^Editor liquid/, 'Edit details', ['Facts', 'Contents', 'Directions', 'More'], 'Product name'],
    ['product-pods', 'Products', /^Editor pods/, 'Edit details', ['Facts', 'Contents', 'Directions', 'More'], 'Product name'],
    ['appliance', 'Appliances', /^Editor washer/, 'Edit settings', ['Details', 'Programs', 'Sanitizer', 'More'], 'Number or label as printed'],
    ['water', 'Appliances', /^Water:/, 'Edit water details', ['Location', 'Reading'], 'What’s your ZIP code?'],
  ] as const
  for (const [kind, section, row, editLabel, tabs, fieldLabel] of cases) {
    if (section === null) await page.goto('/closet')
    else await openHousehold(page, section)
    await page.getByRole('main').getByRole('button', { name: row }).click()
    const sheet = topDialog(page)
    await expect(sheet.getByRole('switch')).toHaveCount(0)
    await expect(sheet.getByRole('button', { name: /Find manufacturer details|Record print details|Link account|Add details|Have a test strip/ })).toHaveCount(0)
    await sheet.getByRole('button', { name: editLabel, exact: true }).click()
    const field = sheet.getByLabel(fieldLabel, { exact: true })
    const original = await field.inputValue()
    await field.fill(kind === 'water' ? '10001' : `${original} draft`)
    for (const [width, scale, theme] of [[393, 1, 'light'], [320, 2, 'dark'], [1200, 1, 'light']] as const) {
      await page.setViewportSize({ width, height: 852 })
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px` }, scale)
      for (const tab of tabs) {
        await sheet.getByRole('tab', { name: tab, exact: true }).click()
        await expect(sheet.getByRole('tab', { name: tab, exact: true })).toHaveAttribute('aria-selected', 'true')
        await expect(sheet.locator('[data-slot="collapsible-trigger"], summary')).toHaveCount(0)
        if (kind.startsWith('product') && tab === 'Directions') {
          await expect(sheet.getByLabel('Do not use on these materials', { exact: true })).toBeVisible()
          await expect(sheet.getByLabel('Safety section', { exact: true })).toHaveCount(0)
        }
        expect(await sheet.getByRole('tab', { name: tab, exact: true }).evaluate(node => node.clientHeight < parseFloat(getComputedStyle(node).fontSize) * 4), `${kind} ${tab} label stays readable`).toBe(true)
        expect(await sheet.evaluate(node => node.scrollWidth <= node.clientWidth), `${kind} ${tab} ${width}`).toBe(true)
        expect(await sheet.locator('[role=tabpanel]:not([hidden]) fieldset').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth)), `${kind} ${tab} sections wrap at ${width}`).toBe(true)
        const panel = sheet.getByRole('tabpanel', { name: tab, exact: true })
        await expect(panel).toBeVisible()
        const firstControl = panel.locator('input:not([aria-hidden="true"]):visible, select:visible, button:visible, [role="checkbox"]:visible, [role="switch"]:visible').first()
        await firstControl.scrollIntoViewIfNeeded()
        await expect(firstControl).toBeInViewport()
        if (kind === 'appliance' && tab !== 'Details' || kind.startsWith('product') && tab === 'Directions' || kind === 'item' && tab === 'Fabric') {
          await page.screenshot({ path: test.info().outputPath(`${kind}-${tab.toLowerCase()}-${width}-${theme}.png`), animations: 'disabled' })
        }
      }
      await sheet.getByRole('tab', { name: tabs[0], exact: true }).click()
      await expect(field).toHaveValue(kind === 'water' ? '10001' : `${original} draft`)
      await page.screenshot({ path: test.info().outputPath(`${kind}-editor-${width}-${theme}.png`), animations: 'disabled' })
    }
    await sheet.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.getByRole('alertdialog', { name: 'Discard your changes?', exact: true }).getByRole('button', { name: 'Keep editing', exact: true }).click()
    await expect(field).toHaveValue(kind === 'water' ? '10001' : `${original} draft`)
    await field.fill(original)
    await sheet.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(sheet.getByRole('button', { name: editLabel, exact: true })).toBeVisible()
    await sheet.getByRole('button', { name: 'Close', exact: true }).click()
    await page.evaluate(() => { document.documentElement.style.fontSize = '' })
    await page.setViewportSize({ width: 393, height: 852 })
  }
})

test('item visibility is staged, guarded on discard and saved only for its permitted pieces', async ({ page }) => {
  await signUp(page, 'staged-privacy', 'Synthetic Privacy')
  await createHousehold(page)
  const { client, householdId } = await convexAs(page)
  await client.mutation(api.inventory.createTextiles, { householdId, name: 'Private edit tees', kind: 'shirt', quantity: 2, status: 'clean' })
  await page.goto('/closet')
  await page.getByRole('button', { name: /^Private edit tees,/ }).click()
  const sheet = topDialog(page)
  const privateValues = async () => (await client.query(api.inventory.list, { householdId })).textiles.map(piece => piece.private)
  const original = await privateValues()
  await sheet.getByRole('button', { name: 'Edit item details', exact: true }).click()
  await sheet.getByRole('tab', { name: 'More', exact: true }).click()
  await sheet.getByRole('switch', { name: 'Private', exact: true }).click()
  expect(await privateValues()).toEqual(original)
  await sheet.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('alertdialog', { name: 'Discard your changes?', exact: true }).getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(sheet.getByRole('button', { name: 'Edit item details', exact: true })).toBeVisible()
  expect(await privateValues()).toEqual(original)
  await sheet.getByRole('button', { name: 'Edit item details', exact: true }).click()
  await sheet.getByRole('tab', { name: 'More', exact: true }).click()
  await sheet.getByRole('switch', { name: 'Private', exact: true }).click()
  await sheet.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(sheet.getByRole('button', { name: 'Edit item details', exact: true })).toBeVisible()
  expect(await privateValues()).toEqual([true, true])
})
