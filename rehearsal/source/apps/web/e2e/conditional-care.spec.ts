import { expect, test } from '@playwright/test'
import { api } from '../src/api'
import { addClothes, addMachines, addProductAndWasher, convexAs, createHousehold, finishSession, freshPage, signUp, openAdvanced } from './flows'

// Root runs the integrated seams on an isolated runtime. Every label, garment and machine is synthetic.
test('checked first-wash separation expires after recorded washing and keeps immutable source history', async ({ browser }, testInfo) => {
  const page = await freshPage(browser)
  try {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await signUp(page, 'conditional-care', 'Lee First Wash')
    await createHousehold(page)
    await addProductAndWasher(page)
    await addMachines(page, { kind: 'Dryer', name: 'Laundry room dryer', count: 1, minutes: '45', heat: { 'Low heat': 'Delicates' } })
    await addClothes(page, { name: 'Synthetic new tee', firstWash: true })
    await addClothes(page, { name: 'Synthetic washed tee', firstWash: false })
    const { client, householdId } = await convexAs(page)
    const inventory = await client.query(api.inventory.list, { householdId })
    const newId = inventory.textiles.find((entry) => entry.name === 'Synthetic new tee')!.textileId
    const washedId = inventory.textiles.find((entry) => entry.name === 'Synthetic washed tee')!.textileId
    await client.mutation(api.inventory.saveRule, { supplyId: inventory.supplies[0]!.supplyId, dose: { amount: 30, unit: 'ml' }, stage: 'wash', placement: 'detergent_compartment', timing: 'before starting', provenance: { source: 'Synthetic pack directions', confidence: 'verified' } })
    const planned = async (selectedTextileIds = [newId, washedId]) => {
      const { planId } = await client.mutation(api.plans.recompute, { householdId, selectedTextileIds, clientInputHash: 'conditional-care-browser' })
      return (await client.query(api.plans.get, { planId }))!
    }
    await page.getByRole('button', { name: /^Synthetic new tee(?:,|\s|$)/ }).click()
    await page.getByRole('tab', { name: 'Care', exact: true }).click()
    await openAdvanced(page, 'Care')
    await page.getByRole('button', { name: 'Label notes', exact: true }).click()
    await page.getByRole('dialog').last().getByLabel('Label section', { exact: true }).selectOption('washing')
    const label = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Label notes', exact: true }) })
    const wording = 'Wash separately for the first wash only'
    const source = 'Synthetic sewn label, front and reverse'
    await label.getByLabel('Where you read it', { exact: true }).fill(source)
    await label.getByLabel('Symbol system or edition, if known', { exact: true }).fill('Synthetic edition')
    await label.getByLabel('Additional wash settings or product requirements', { exact: true }).fill(wording)
    const line = label.locator('fieldset').filter({ has: page.locator('legend').filter({ hasText: wording }) }).last()
    await line.getByLabel('Add a supported condition', { exact: true }).selectOption('wash_alone_first_wash')
    const checked = line.getByRole('checkbox', { name: 'I’ve checked that these conditions cover this entire source line', exact: true })
    await expect(checked).not.toBeChecked()
    await label.getByRole('button', { name: 'Save label', exact: true }).click()
    await expect(label).toHaveCount(0)
    expect((await planned()).result.loads.every((load) => !load.textileIds.includes(newId))).toBe(true)
    await openAdvanced(page, 'Care')
    await page.getByRole('button', { name: 'Label notes', exact: true }).click()
    await page.getByRole('dialog').last().getByLabel('Label section', { exact: true }).selectOption('washing')
    await checked.check()
    await page.screenshot({ path: testInfo.outputPath('first-wash-label-phone.png') })
    await label.getByRole('button', { name: 'Save label', exact: true }).click()
    await expect(label).toHaveCount(0)
    await page.getByRole('dialog').last().getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Edit item details', exact: true })).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Synthetic new tee(?:,|\s|$)/ })).toBeVisible()
    await page.reload()
    const before = await client.query(api.inventory.list, { householdId })
    const original = before.textiles.find((entry) => entry.textileId === newId)!.care!.instructions!
    expect(original).toMatchObject({ source, symbolSystem: 'Synthetic edition', washing: [wording], washingRequirements: [{ wording, checked: true, requirements: [{ kind: 'wash_alone_first_wash' }] }] })
    const separated = await planned()
    expect(separated.result.status).toBe('ready')
    expect(separated.result.loads).toHaveLength(2)
    expect(separated.result.loads.every((load) => load.textileIds.length === 1)).toBe(true)
    const first = await planned([newId])
    const load = first.result.loads[0]!
    await client.mutation(api.plans.confirmRecipe, { planId: first.planId, loadId: load.id, machineId: inventory.machines.find((entry) => entry.machineId === load.machineId)!.machineId })
    const { sessionId } = await client.mutation(api.execution.start, { planId: first.planId, loadId: load.id, idempotencyKey: 'conditional-first-wash' })
    await page.goto(`/session/${sessionId}`)
    await page.getByRole('button', { name: 'Start preparation', exact: true }).click()
    await expect(page.getByText(wording, { exact: true })).toBeVisible()
    await finishSession(page)
    const records = await client.query(api.sessions.washRecordsForTextile, { textileId: newId })
    expect(records[0]?.activityContext?.garment?.firstWashState).toBe('unwashed')
    expect(records[0]?.activityContext?.garment?.care?.instructions).toEqual(original)
    await client.mutation(api.closet.flagDirty, { textileIds: [newId], reasons: ['worn'], soilLevel: 'normal' })
    const later = await planned()
    expect(later.result.status).toBe('ready')
    expect(later.result.loads).toHaveLength(1)
    expect(later.result.loads[0]!.textileIds).toEqual(expect.arrayContaining([newId, washedId]))
    expect(later.result.loads[0]!.labelPreparation?.some((entry) => entry.wording === wording) ?? false).toBe(false)
    await client.mutation(api.inventory.setCareInstructions, { textileId: newId, instructions: null, expectedInstructions: original })
    expect((await client.query(api.sessions.washRecordsForTextile, { textileId: newId }))[0]?.activityContext?.garment?.care?.instructions).toEqual(original)
  } finally {
    await page.context().close()
  }
})
