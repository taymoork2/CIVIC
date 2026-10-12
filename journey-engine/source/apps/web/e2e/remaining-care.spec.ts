import { expect, test } from '@playwright/test'
import { api } from '../src/api'
import { addClothes, addMachines, addProductAndWasher, answerCards, convexAs, createHousehold, finishSession, freshPage, openHousehold, signUp, openAdvanced } from './flows'

// Root runs this on an isolated integration deployment. Every source and fact is synthetic.
test('checked mechanical severity and detergent requirements survive editing and reach required steps and history', async ({ browser }, testInfo) => {
  const page = await freshPage(browser)
  try {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await signUp(page, 'remaining-care', 'Robin Care')
    await createHousehold(page)
    await addProductAndWasher(page)
    await addMachines(page, { kind: 'Dryer', name: 'Laundry room dryer', count: 1, minutes: '45', heat: { 'Low heat': 'Delicates' } })
    await addClothes(page, { name: 'Synthetic remaining care tee', firstWash: false })
    const { client, householdId } = await convexAs(page)
    const inventory = await client.query(api.inventory.list, { householdId })
    const textileId = inventory.textiles.find((entry) => entry.name === 'Synthetic remaining care tee')!.textileId
    const supplyId = inventory.supplies[0]!.supplyId
    const machineId = inventory.machines.find((entry) => entry.name === 'Laundry room washer')!.machineId
    await client.mutation(api.inventory.saveRule, { supplyId, dose: { amount: 30, unit: 'ml' }, stage: 'wash', placement: 'detergent_compartment', timing: 'before starting', provenance: { source: 'Synthetic exact pack directions', confidence: 'verified' } })

    await page.getByRole('button', { name: /^Synthetic remaining care tee(?:,|\s|$)/ }).click()
    await page.getByRole('tab', { name: 'Care', exact: true }).click()
    await openAdvanced(page, 'Care')
    await page.getByRole('button', { name: 'Label notes', exact: true }).click()
    const label = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Label notes', exact: true }) })
    const wording = 'Very mild process; use fragrance-free, dye-free detergent without bleach'
    await label.getByLabel('Where you read it', { exact: true }).fill('Synthetic sewn label, front and reverse')
    await label.getByLabel('Before washing', { exact: true }).fill('Close the removable liner’s zipper; turn decorated surface inside out')
    await label.getByLabel('Label section', { exact: true }).selectOption('beforeDrying')
    await label.getByLabel('Before drying', { exact: true }).fill('Reshape the sleeves while damp')
    await label.getByLabel('Label section', { exact: true }).selectOption('afterDrying')
    await label.getByLabel('When checking or removing it', { exact: true }).fill('Remove promptly; smooth before folding')
    await label.getByLabel('Label section', { exact: true }).selectOption('washing')
    await label.getByLabel('Additional wash settings or product requirements', { exact: true }).fill(wording)
    const line = label.locator('fieldset').filter({ has: page.locator('legend').filter({ hasText: wording }) }).last()
    await line.getByLabel('Add a supported condition', { exact: true }).selectOption('maximum_mechanical_severity')
    await expect(label.getByRole('button', { name: 'Save label', exact: true })).toBeDisabled()
    await line.getByLabel('Maximum mechanical severity', { exact: true }).selectOption('very_mild')
    for (const kind of ['detergent_fragrance_free', 'detergent_dye_free', 'detergent_bleach_free']) await line.getByLabel('Add a supported condition', { exact: true }).selectOption(kind)
    await line.getByRole('checkbox', { name: 'I’ve checked that these conditions cover this entire source line', exact: true }).check()
    await label.getByRole('button', { name: 'Save label', exact: true }).click()
    await expect(label).toHaveCount(0)
    await page.getByRole('dialog').last().getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Edit item details', exact: true })).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const planned = async () => {
      const { planId } = await client.mutation(api.plans.recompute, { householdId, selectedTextileIds: [textileId], clientInputHash: 'remaining-care-browser' })
      return (await client.query(api.plans.get, { planId }))!
    }
    expect((await planned()).result.loads).toHaveLength(0)

    await openHousehold(page, 'Machines')
    await page.getByRole('button', { name: /^Laundry room washer/ }).click()
    const machine = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Laundry room washer', exact: true }) })
    await machine.getByRole('button', { name: 'Edit settings', exact: true }).click()
    await machine.getByRole('tab', { name: 'Programs', exact: true }).click()
    const normal = machine.getByRole('group', { name: 'Normal care', exact: true })
    await normal.getByLabel('Checked program and selected options', { exact: true }).fill('Synthetic Gentle with checked options')
    await normal.getByLabel('Where these settings were checked', { exact: true }).fill('Synthetic exact model manual and controls')
    await expect(normal.getByLabel('Checked mechanical severity', { exact: true })).toHaveValue('')
    await normal.getByLabel('Checked mechanical severity', { exact: true }).selectOption('very_mild')
    await machine.getByRole('button', { name: 'Save washer', exact: true }).click()
    // Saving an existing appliance returns to its record; Close dismisses the drawer.
    await expect(machine.getByRole('button', { name: 'Edit settings', exact: true })).toBeVisible()
    await machine.getByRole('button', { name: 'Close', exact: true }).first().click()
    await expect(machine).toHaveCount(0)
    expect((await planned()).result.status, 'Unknown detergent contents cannot meet a positive requirement').not.toBe('ready')
    await client.mutation(api.inventory.updateSupply, { supplyId, safety: { bleachKind: 'none', fragrance: 'free', dye: 'free', incompatibleSupplyIds: [], incompatibleMaterials: [], factSource: 'Synthetic exact pack' } })
    expect((await planned()).result.status).toBe('ready')
    await page.reload()
    const saved = await client.query(api.inventory.list, { householdId })
    expect(saved.machines.find((entry) => entry.machineId === machineId)?.washProcesses?.normal?.mechanicalSeverity).toBe('very_mild')

    await page.getByRole('navigation').getByRole('link', { name: /^Laundry/ }).click()
    await page.getByRole('button', { name: 'Load options' }).click()
    await page.getByRole('button', { name: 'Sort again', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Whites load', exact: true })).toBeVisible()
    await answerCards(page)
    await page.getByRole('button', { name: 'I’m at the laundry room', exact: true }).click()
    await page.getByRole('button', { name: /^Confirm recipe for / }).click()
    await page.getByRole('button', { name: 'See what goes in', exact: true }).click()
    await page.getByRole('button', { name: 'Start preparation', exact: true }).click()
    await expect(page.getByText('Close the removable liner’s zipper; turn decorated surface inside out', { exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('remaining-care-preparation.png') })
    await finishSession(page)
    const records = await client.query(api.sessions.washRecordsForTextile, { textileId })
    expect(records[0]?.activityContext?.washer?.washProcesses?.normal?.mechanicalSeverity).toBe('very_mild')
    expect(records[0]?.activityContext?.garment?.care?.instructions?.washing).toEqual([wording])
    expect(records[0]?.drying?.instructions).toMatchObject({ beforeDrying: ['Reshape the sleeves while damp'], afterDrying: ['Remove promptly; smooth before folding'] })
  } finally {
    await page.context().close()
  }
})
