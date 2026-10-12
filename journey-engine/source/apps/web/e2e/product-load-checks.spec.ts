import { expect, test, type Page } from '@playwright/test'
import manifest from '../../../docs/research/owner-product-integration/tide-additions/output/manifest.json' with { type: 'json' }
import { api } from '../src/api'
import { addBottle, addClothes, addMachines, convexAs, createHousehold, finishSession, signUp, openAdvanced } from './flows'

// Public references are reviewed on the isolated target. Every holding and physical check is synthetic.
async function pinDirections(page: Page, name: string, key: string, option: string) {
  const entry = manifest.entries.find((candidate) => candidate.variant.key === key)!
  await page.getByRole('button', { name: new RegExp(name) }).click()
  await page.getByRole('button', { name: 'Edit details', exact: true }).click()
  await openAdvanced(page, 'More')
  await page.getByRole('button', { name: 'Find manufacturer details', exact: true }).click()
  const reference = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Source details', exact: true }) })
  await reference.getByLabel('Brand printed on the item').fill('Tide')
  await reference.getByRole('button', { name: 'Find details', exact: true }).click()
  await reference.getByLabel('Product and exact variant').selectOption({ label: `${entry.product.name} · ${entry.variant.name} · ${entry.variant.market} · ${entry.variant.packIdentifier}` })
  for (const category of ['Product use', 'Directions', 'Restrictions']) {
    const facts = reference.getByRole('checkbox', { name: new RegExp(`^${category}:`) })
    await expect(facts.first()).toBeVisible()
    for (const fact of await facts.all()) await fact.check()
  }
  await reference.getByLabel('Market', { exact: true }).fill(entry.variant.market)
  await reference.getByLabel('Pack or model identifier', { exact: true }).fill(entry.variant.packIdentifier)
  await reference.getByLabel('Label revision', { exact: true }).fill(entry.labelRevision)
  await reference.getByRole('button', { name: 'Save reference', exact: true }).click()
  await expect(reference).toHaveCount(0)
  await openAdvanced(page, 'More')
  await page.getByRole('button', { name: 'Review source directions', exact: true }).click()
  const directions = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Source directions', exact: true }) })
  await directions.getByLabel('Directions to apply', { exact: true }).selectOption(option)
  await directions.getByLabel('Pack market', { exact: true }).fill(entry.variant.market)
  await directions.getByLabel('Exact pack identifier', { exact: true }).fill(entry.variant.packIdentifier)
  await directions.getByLabel('Checked label revision', { exact: true }).fill(entry.labelRevision)
  await directions.getByRole('checkbox', { name: /I checked this actual pack/ }).check()
  if (option !== 'tide-pods') await directions.getByRole('checkbox', { name: /Use these rows for ordinary fill only/ }).check()
  // Each fact is explicitly checked in this synthetic source-fidelity journey.
  for (const fact of await directions.getByRole('checkbox', { name: /^I checked:/ }).all()) await fact.check()
  await directions.getByRole('checkbox', { name: /Replace this product’s saved dose rows/ }).check()
  await directions.getByRole('button', { name: 'Replace saved directions', exact: true }).click()
  await expect(directions).toHaveCount(0)
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

for (const variant of ['free-gentle', 'pods'] as const) {
  test(`${variant}: explicit load checks reach preparation, actual use and immutable history`, async ({ browser }, testInfo) => {
    const page = await (await browser.newContext({ locale: 'en-US' })).newPage()
    await page.setViewportSize({ width: 390, height: 844 })
    await signUp(page, `load-check-${variant}`, 'Drew Product')
    await createHousehold(page)
    const name = `Synthetic Tide ${variant}`
    await addBottle(page, name, ['2', '3', '5'])
    await pinDirections(page, name, `owner-reference:tide-${variant === 'pods' ? 'pods-spring-meadow-032503' : 'free-gentle-235843'}:us`, variant === 'pods' ? 'tide-pods' : 'tide-free-gentle-standard')
    await addMachines(page, { kind: 'Washer', name: 'Laundry room washer', count: 1, he: 'No', slots: [], minutes: '40' })
    await addMachines(page, { kind: 'Dryer', name: 'Laundry room dryer', count: 1, minutes: '45', heat: { 'Low heat': 'Delicates' } })
    await addClothes(page, { name: 'Synthetic product-check tee', firstWash: false })
    const { client, householdId } = await convexAs(page)
    const inventory = await client.query(api.inventory.list, { householdId })
    const textileId = inventory.textiles.find((entry) => entry.name === 'Synthetic product-check tee')!.textileId
    const supplyId = inventory.supplies.find((entry) => entry.name === name)!.supplyId
    const machineId = inventory.machines.find((entry) => entry.name === 'Laundry room washer')!.machineId
    await client.mutation(api.inventory.updateMachine, { machineId, placements: ['direct_to_drum'] })
    await client.mutation(api.inventory.updateSupply, { supplyId, safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [], factSource: 'Synthetic exact pack' } })
    await page.getByRole('navigation').getByRole('link', { name: /^Laundry/ }).click()
    await page.getByRole('button', { name: 'Sort 1 piece into loads', exact: true }).click()
    await page.getByRole('button', { name: 'Check the pack', exact: true }).first().click()
    await expect(page.getByRole('heading', { level: 1, name: 'Check product for this load', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Check this product for this load', exact: true })).toContainText('86 °F')
    await expect(page.getByRole('button', { name: 'Pick an answer', exact: true })).toBeDisabled()
    if (variant === 'pods') {
      await expect(page.getByRole('radio', { checked: true })).toHaveCount(0)
      await page.getByRole('radio', { name: 'Standard load', exact: true }).click()
    } else {
      const check = page.getByRole('checkbox', { name: /I checked these clothes for colorfastness/ })
      await expect(check).not.toBeChecked()
      await check.check()
    }
    await page.screenshot({ path: testInfo.outputPath(`${variant}-load-check.png`), fullPage: true })
    await page.getByRole('button', { name: 'Update plan', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Whites load', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Check the pack', exact: true })).toHaveCount(0)
    await page.reload()
    await page.getByRole('button', { name: 'I’m at the laundry room', exact: true }).click()
    await page.getByRole('button', { name: /^Confirm recipe for / }).click()
    await page.getByRole('button', { name: 'See what goes in', exact: true }).click()
    await page.getByRole('button', { name: 'Start preparation', exact: true }).click()
    if (variant === 'free-gentle') {
      const step = page.locator('section.machine-step').first()
      await expect(step.getByText('How full will the drum be?', { exact: true })).toBeVisible()
      await step.getByRole('button', { name: 'Half', exact: true }).click()
      await expect(step.getByText('How full will the drum be?', { exact: true })).toHaveCount(0)
    }
    await finishSession(page)
    const records = await client.query(api.sessions.washRecordsForTextile, { textileId })
    expect(records).toHaveLength(1)
    const actual = records[0]!.activityContext?.products?.find((entry) => entry.supplyId === supplyId)!
    expect(actual).toMatchObject(variant === 'pods' ? { amount: 2, unit: 'pod' } : { amount: 1, unit: 'cap', mark: 'Bar 2', target: 'below' })
    expect(actual).not.toHaveProperty('fractionOfMark')
    const captured = records[0]!.activityContext?.treatments?.find((entry) => entry.supplyId === supplyId)!
    expect(captured.productConfirmation).toMatchObject(variant === 'pods' ? { sourceLoadCategory: 'standard' } : { colorfastnessChecked: true })
    await page.context().close()
  })
}
