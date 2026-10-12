import { expect, test } from '@playwright/test'
import { api } from '../src/api'
import { addClothes, addProductAndWasher, convexAs, createHousehold, freshPage, signUp, openAdvanced } from './flows'

test('checked like-color instructions use recorded color and intensity through reload', async ({ browser }, testInfo) => {
  const page = await freshPage(browser)
  try {
    await page.setViewportSize({ width: 390, height: 844 })
    await signUp(page, 'care-grouping', 'Jordan Colors')
    await createHousehold(page)
    await addProductAndWasher(page)
    await addClothes(page, { name: 'Synthetic red tee', color: 'Red' })
    await addClothes(page, { name: 'Synthetic blue tee', color: 'Blue' })
    const { client, householdId } = await convexAs(page)
    const inventory = await client.query(api.inventory.list, { householdId })
    const redId = inventory.textiles.find((entry) => entry.name === 'Synthetic red tee')!.textileId
    const blueId = inventory.textiles.find((entry) => entry.name === 'Synthetic blue tee')!.textileId
    await client.mutation(api.inventory.updateTextile, { textileId: redId, color: 'Red', colorGroup: 'saturated' })
    await client.mutation(api.inventory.updateTextile, { textileId: blueId, color: 'Blue', colorGroup: 'saturated' })
    await client.mutation(api.inventory.saveRule, { supplyId: inventory.supplies[0]!.supplyId, dose: { amount: 30, unit: 'ml' }, stage: 'wash', placement: 'detergent_compartment', timing: 'before starting', provenance: { source: 'Synthetic pack directions', confidence: 'verified' } })
    const planned = async () => {
      const { planId } = await client.mutation(api.plans.recompute, { householdId, selectedTextileIds: [redId, blueId], clientInputHash: 'care-grouping-browser' })
      return (await client.query(api.plans.get, { planId }))!
    }
    await page.getByRole('button', { name: /^Synthetic red tee(?:,|\s|$)/ }).click()
    await page.getByRole('tab', { name: 'Care', exact: true }).click()
    await openAdvanced(page, 'Care')
    await page.getByRole('button', { name: 'Label notes', exact: true }).click()
    await page.getByRole('dialog').last().getByLabel('Label section', { exact: true }).selectOption('washing')
    const label = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Label notes', exact: true }) })
    const wording = 'Wash with like colors'
    await label.getByLabel('Where you read it', { exact: true }).fill('Synthetic sewn label, both sides')
    await label.getByLabel('Additional wash settings or product requirements', { exact: true }).fill(wording)
    const line = label.locator('fieldset').filter({ has: page.locator('legend').filter({ hasText: wording }) }).last()
    await line.getByLabel('Add a supported condition', { exact: true }).selectOption('wash_with_like_colors')
    const checked = line.getByRole('checkbox', { name: 'I’ve checked that these conditions cover this entire source line', exact: true })
    await expect(checked).not.toBeChecked()
    await label.getByRole('button', { name: 'Save label', exact: true }).click()
    await expect(label).toHaveCount(0)
    expect((await planned()).result.loads.every((load) => !load.textileIds.includes(redId))).toBe(true)
    await openAdvanced(page, 'Care')
    await page.getByRole('button', { name: 'Label notes', exact: true }).click()
    await page.getByRole('dialog').last().getByLabel('Label section', { exact: true }).selectOption('washing')
    await checked.check()
    await page.screenshot({ path: testInfo.outputPath('like-colors-label-phone.png') })
    await label.getByRole('button', { name: 'Save label', exact: true }).click()
    await expect(label).toHaveCount(0)
    await page.getByRole('dialog').last().getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Edit item details', exact: true })).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Synthetic red tee(?:,|\s|$)/ })).toBeVisible()
    await page.reload()
    const separate = await planned()
    expect(separate.result.status).toBe('ready')
    expect(separate.result.loads).toHaveLength(2)
    await client.mutation(api.inventory.updateTextile, { textileId: blueId, color: 'Red', colorGroup: 'saturated' })
    expect((await planned()).result.loads).toHaveLength(1)
    await client.mutation(api.inventory.updateTextile, { textileId: blueId, color: 'Red', colorGroup: 'light' })
    expect((await planned()).result.loads).toHaveLength(2)
    await client.mutation(api.inventory.updateTextile, { textileId: blueId, color: '', colorGroup: 'saturated' })
    expect((await planned()).result.loads).toHaveLength(2)
  } finally {
    await page.context().close()
  }
})
