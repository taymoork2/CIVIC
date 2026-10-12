import { expect, test } from '@playwright/test'
import { api } from '../src/api'
import { addBottle, addClothes, addMachines, convexAs, createHousehold, freshPage, openHousehold, signUp } from './flows'

test('rinse label and program observations round-trip through intake and gate the recipe', async ({ browser }) => {
  const page = await freshPage(browser)
  try {
    await signUp(page, 'sanitizer', 'Sam Sanitizer')
    await createHousehold(page)
    await addBottle(page, 'Synthetic detergent', ['1'])
    await addMachines(page, { kind: 'Washer', name: 'Laundry room washer', count: 1, minutes: '40', slots: ['Detergent', 'Softener'] })
    await addClothes(page, { name: 'Contact test tee' })
    await openHousehold(page, 'Products')
    await addBottle(page, 'Synthetic rinse sanitizer', ['1'], 'Rinse sanitizer')
    await page.getByRole('button', { name: /^Synthetic rinse sanitizer/ }).click()
    const product = page.getByRole('dialog')
    await product.getByRole('button', { name: 'Edit details', exact: true }).click()
    await product.getByRole('tab', { name: 'Directions', exact: true }).click()
    await product.getByRole('tab', { name: 'Sanitizing', exact: true }).click()
    await product.getByRole('checkbox', { name: 'Label gives a rinse sanitizing route', exact: true }).check()
    await expect(product.getByLabel('Label’s minimum rinse contact time (minutes)', { exact: true })).toHaveValue('')
    await product.getByLabel('Exact sanitizing variant, market and pack', { exact: true }).fill('Synthetic exact pack, test market')
    await product.getByLabel('Label’s minimum rinse contact time (minutes)', { exact: true }).fill('16')
    await product.getByLabel('Rinse sanitizing label source', { exact: true }).fill('Synthetic label for acceptance test')
    await product.getByRole('button', { name: 'Save', exact: true }).click()
    await product.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(product).toHaveCount(0)

    const { client, householdId } = await convexAs(page)
    const inventory = await client.query(api.inventory.list, { householdId })
    const sanitizer = inventory.supplies.find((supply) => supply.name === 'Synthetic rinse sanitizer')!
    const detergent = inventory.supplies.find((supply) => supply.name === 'Synthetic detergent')!
    expect(sanitizer.safety?.sanitizing).toMatchObject({ minimumContactMinutes: 16, formulation: 'Synthetic exact pack, test market' })
    // Synthetic dose for the test; this is not a real-product recommendation.
    await client.mutation(api.inventory.saveRule, { supplyId: sanitizer.supplyId, dose: { amount: 10, unit: 'ml' }, stage: 'rinse', placement: 'softener_compartment', timing: 'before starting', provenance: { source: 'Synthetic test label', confidence: 'verified' } })
    await client.mutation(api.inventory.saveRule, { supplyId: detergent.supplyId, dose: { amount: 10, unit: 'ml' }, stage: 'wash', placement: 'detergent_compartment', timing: 'before starting', provenance: { source: 'Synthetic test label', confidence: 'verified' } })
    const textileIds = inventory.textiles.map((textile) => textile.textileId)
    const compute = async () => {
      const { planId } = await client.mutation(api.plans.recompute, { householdId, selectedTextileIds: textileIds, optionalSupplyIds: [sanitizer.supplyId], clientInputHash: 'contact-test' })
      return client.query(api.plans.get, { planId })
    }
    const blocked = await compute()
    expect(blocked?.status).toBe('needs_confirmation')
    expect(blocked?.result.reasons.some((reason) => reason.details.cause === 'sanitizer_contact_time')).toBe(true)

    await openHousehold(page, 'Appliances')
    await page.getByRole('button', { name: /Laundry room washer/ }).click()
    await page.getByRole('button', { name: 'Edit settings', exact: true }).click()
    await page.getByRole('tab', { name: 'Sanitizer', exact: true }).click()
    const machine = page.getByRole('dialog')
    await expect(machine.getByLabel('Rinse contact minutes', { exact: true })).toHaveValue('')
    await machine.getByRole('group', { name: 'Sanitizer release used for this contact time' }).getByRole('button', { name: 'Softener compartment', exact: true }).click()
    await machine.getByLabel('Rinse contact minutes', { exact: true }).fill('16')
    await machine.getByLabel('Where the program contact time was checked', { exact: true }).fill('Synthetic observed release-to-drain interval')
    await machine.getByRole('button', { name: 'Save washer', exact: true }).click()
    await expect(page.getByRole('button', { name: /Rinse contact time for sanitizer/ })).toHaveCount(0)
    expect((await compute())?.status).toBe('ready')
    const saved = await client.query(api.inventory.list, { householdId })
    expect(saved.machines[0]?.rinseContact?.normal).toMatchObject({ minutes: 16, placement: 'softener_compartment', source: 'Synthetic observed release-to-drain interval' })
  } finally {
    await page.context().close()
  }
})
