import { expect, test } from '@playwright/test'
import { api } from '../src/api'
import { addBottle, addClothes, addProductAndWasher, convexAs, createHousehold, freshPage, signUp, openAdvanced } from './flows'

// Synthetic source/label facts on the isolated backend; no owned-pack or efficacy claim.
test('exact capability intake and optional-product choices survive reload without selecting shelf stock', async ({ browser }, testInfo) => {
  const page = await freshPage(browser)
  try {
    await page.setViewportSize({ width: 390, height: 900 })
    await signUp(page, 'product-benefits', 'Blair Benefits')
    await createHousehold(page)
    await addProductAndWasher(page)
    await addClothes(page, { name: 'Benefit test tee' })
    await addBottle(page, 'Synthetic booster', ['1'], 'Booster')
    await page.getByRole('button', { name: /Synthetic booster/ }).click()
    const bottle = page.getByRole('dialog')
    await bottle.getByRole('button', { name: 'Edit details', exact: true }).click()
    await bottle.getByRole('tab', { name: 'Contents', exact: true }).click()
    await openAdvanced(bottle)
    const fact = bottle.locator('fieldset').filter({ has: page.locator('legend', { hasText: /^Protease enzyme$/ }) })
    await fact.getByLabel('What the source says about protease enzyme').selectOption('present')
    for (const [name, value] of [['Exact variant and pack code', 'Synthetic booster TEST-PACK'], ['Market', 'Test market'], ['Pack revision or ingredient-list version', 'test-revision-1'], ['Pack or manufacturer source', 'Synthetic capability disclosure'], ['Date checked', '2026-10-03']]) await fact.getByLabel(name!, { exact: true }).fill(value!)
    await bottle.getByRole('button', { name: 'Save', exact: true }).click()
    // Saving an existing product returns to its record on the same tab; the drawer stays open.
    await expect(bottle.getByRole('button', { name: 'Edit details', exact: true })).toBeVisible()
    await bottle.getByRole('button', { name: 'Close', exact: true }).first().click()
    await expect(bottle).toHaveCount(0)
    await page.reload()
    await page.getByRole('button', { name: /Synthetic booster/ }).click()
    await page.getByRole('button', { name: 'Edit details', exact: true }).click()
    await page.getByRole('tab', { name: 'Contents', exact: true }).click()
    await openAdvanced(page)
    await expect(page.getByLabel('What the source says about protease enzyme')).toHaveValue('present')
    await expect(page.getByLabel('Exact variant and pack code')).toHaveValue('Synthetic booster TEST-PACK')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Edit details', exact: true })).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
    // Closing the sheet updates the address; let it settle before moving to another tab.
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page).not.toHaveURL(/product=/)

    const { client, householdId } = await convexAs(page)
    const inventory = await client.query(api.inventory.list, { householdId })
    const booster = inventory.supplies.find((entry) => entry.name === 'Synthetic booster')!
    const detergent = inventory.supplies.find((entry) => entry.use === 'detergent')!
    for (const [supplyId, placement] of [[detergent.supplyId, 'detergent_compartment'], [booster.supplyId, 'direct_to_drum']] as const) await client.mutation(api.inventory.saveRule, { supplyId, dose: { amount: 10, unit: 'ml' }, stage: 'wash', placement, timing: 'before cycle start', provenance: { source: 'Synthetic test label', confidence: 'verified' } })
    await page.getByRole('navigation').getByRole('link', { name: /^Laundry/ }).click()
    await page.getByRole('button', { name: 'Sort 1 piece into loads', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Whites load', exact: true })).toBeVisible()
    const benefits = page.getByRole('region', { name: 'Optional product benefit' })
    const choose = benefits.getByRole('checkbox', { name: 'Use Synthetic booster', exact: true })
    await expect(choose).not.toBeChecked()
    await expect(benefits).toContainText('Added only when selected')
    await expect(benefits).toContainText('No addition needed')
    await benefits.getByLabel('Goal for this wash').selectOption('visible_stain')
    await expect(benefits.getByLabel('Goal for this wash')).toHaveValue('visible_stain')
    // This controlled checkbox updates after the server recomputes the recipe.
    await choose.click()
    await expect(choose).toBeChecked()
    await expect(benefits).toContainText('Possible benefit')
    await page.reload()
    await expect(choose).toBeChecked()
    await expect(benefits.getByLabel('Goal for this wash')).toHaveValue('visible_stain')
    await benefits.getByText('Evidence for Synthetic booster', { exact: true }).click()
    await expect(benefits).toContainText('Synthetic capability disclosure')
    for (const [name, width, scale, theme] of [['phone', 390, 1, 'light'], ['narrow-dark-large', 320, 2, 'dark'], ['wide', 1024, 1, 'light']] as const) {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      await page.evaluate((scale) => { document.documentElement.style.fontSize = `${16 * scale}px` }, scale)
      // Let the new viewport and font size lay out before measuring.
      await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
      expect(await benefits.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      await benefits.scrollIntoViewIfNeeded()
      await page.screenshot({ path: testInfo.outputPath(`product-benefits-${name}.png`) })
      const source = benefits.getByText('Synthetic capability disclosure', { exact: true })
      await source.scrollIntoViewIfNeeded()
      const sourceBounds = (await source.boundingBox())!
      const actionBounds = (await page.getByRole('button', { name: 'I’m at the laundry room', exact: true }).boundingBox())!
      expect(sourceBounds.y + sourceBounds.height).toBeLessThanOrEqual(actionBounds.y)
      await page.screenshot({ path: testInfo.outputPath(`product-benefits-${name}-source.png`) })
    }
    await choose.focus()
    await page.keyboard.press('Space')
    await expect(choose).not.toBeChecked()
    await expect(benefits).toContainText('Added only when selected')
    await page.reload()
    await expect(choose).not.toBeChecked()
    const plans = await client.query(api.plans.upNext, { householdId })
    expect(plans?.loads[0]?.treatments.map((step) => step.supplyId)).toEqual([detergent.supplyId])
  } finally { await page.context().close() }
})
