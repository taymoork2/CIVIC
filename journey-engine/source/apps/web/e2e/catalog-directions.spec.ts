import { expect, test, type Locator } from '@playwright/test'
import manifest from '../../../docs/research/owner-product-integration/output/manifest.json' with { type: 'json' }
import { api } from '../src/api'
import { addBottle, convexAs, createHousehold, freshPage, signUp, openAdvanced } from './flows'

// Root prerequisite: ingest/review the exact committed public owner packet on the isolated backend.
// All holdings/checks below are synthetic. This journey does not establish an actual pack match.
const tide = manifest.entries.find((entry) => entry.variant.key === 'owner-reference:tide-original-liquid-121108:us')!

async function checkTide(sheet: Locator) {
  await sheet.getByLabel('Directions to apply', { exact: true }).selectOption('tide-he')
  await sheet.getByLabel('Pack market', { exact: true }).fill(tide.variant.market)
  await sheet.getByLabel('Exact pack identifier', { exact: true }).fill(tide.variant.packIdentifier)
  await sheet.getByLabel('Checked label revision', { exact: true }).fill(tide.labelRevision)
  await sheet.getByRole('checkbox', { name: /I checked this actual pack/ }).check()
  await sheet.getByRole('checkbox', { name: /Use these rows for ordinary fill only/ }).check()
  for (const name of ['I checked: Main-wash directions.', 'I checked: Product use.', 'I checked: Handling precautions.']) await sheet.getByRole('checkbox', { name, exact: true }).check()
}

test('pinned Tide source requires physical/fact/replacement checks, preserves cancellation and stale edits, then saves native doses', async ({ browser }, testInfo) => {
  const page = await freshPage(browser)
  await page.setViewportSize({ width: 390, height: 844 })
  await signUp(page, 'source-directions', 'Casey Directions')
  await createHousehold(page)
  const name = 'Synthetic source-directions bottle'
  await addBottle(page, name, ['1'])
  const { client, householdId } = await convexAs(page)
  const supply = (await client.query(api.inventory.list, { householdId })).supplies.find((entry) => entry.name === name)!
  await client.mutation(api.inventory.saveLabelDirections, { supplyId: supply.supplyId, measure: { kind: 'cap', marks: [{ label: '1' }] }, stage: 'wash', placement: 'detergent_compartment', timing: 'synthetic previous directions',
    rows: [{ cells: [{ amount: 1, unit: 'cap', mark: '1' }] }], provenance: { source: 'synthetic test label', confidence: 'observed' } })
  const current = async () => (await client.query(api.inventory.list, { householdId })).supplies.find((entry) => entry.supplyId === supply.supplyId)!
  const original = (await current()).rules
  await page.getByRole('button', { name: new RegExp(name) }).click()
  await page.getByRole('button', { name: 'Edit details', exact: true }).click()
  await openAdvanced(page, 'More')
  await page.getByRole('button', { name: 'Find manufacturer details', exact: true }).click()
  const reference = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Source details', exact: true }) })
  await reference.getByLabel('Brand printed on the item').fill('Tide')
  await reference.getByRole('button', { name: 'Find details', exact: true }).click()
  await reference.getByLabel('Product and exact variant').selectOption({ label: `${tide.product.name} · ${tide.variant.name} · ${tide.variant.market} · ${tide.variant.packIdentifier}` })
  await reference.getByRole('checkbox', { name: /^Product use:/ }).check()
  await reference.getByRole('checkbox', { name: /^Directions:/ }).check()
  await reference.getByRole('checkbox', { name: /^Restrictions:/ }).check()
  await reference.getByLabel('Market', { exact: true }).fill(tide.variant.market)
  await reference.getByLabel('Pack or model identifier', { exact: true }).fill(tide.variant.packIdentifier)
  await reference.getByLabel('Label revision', { exact: true }).fill(tide.labelRevision)
  await reference.getByRole('button', { name: 'Save reference', exact: true }).click()
  expect((await current()).rules).toEqual(original)

  const open = async () => { await openAdvanced(page, 'More'); await page.getByRole('button', { name: 'Review source directions', exact: true }).click() }
  const directions = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Source directions', exact: true }) })
  await open()
  await expect(directions.getByRole('button', { name: 'Replace saved directions', exact: true })).toBeDisabled()
  await checkTide(directions)
  await expect(directions.getByRole('button', { name: 'Replace saved directions', exact: true })).toBeDisabled()
  await directions.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(directions).toHaveCount(0)
  expect((await current()).rules).toEqual(original)

  await open()
  await checkTide(directions)
  await directions.getByRole('checkbox', { name: /Replace this product’s saved dose rows/ }).check()
  await expect(directions.getByRole('button', { name: 'Replace saved directions', exact: true })).toBeEnabled()
  await client.mutation(api.inventory.saveRule, { supplyId: supply.supplyId, ruleId: original[0]!.ruleId, dose: { amount: 2, unit: 'cap', mark: '1' }, stage: 'wash', placement: 'detergent_compartment', timing: 'synthetic concurrent correction', provenance: { source: 'synthetic test label', confidence: 'observed' } })
  await expect(directions.getByRole('alert')).toContainText('changed')
  await expect(directions.getByRole('button', { name: 'Replace saved directions', exact: true })).toBeDisabled()
  await expect(directions.getByLabel('Exact pack identifier', { exact: true })).toHaveValue(tide.variant.packIdentifier)
  await directions.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(directions).toHaveCount(0)
  expect((await current()).rules[0]?.dose.amount).toBe(2)

  await open()
  await checkTide(directions)
  await directions.getByRole('checkbox', { name: /Replace this product’s saved dose rows/ }).check()
  await expect(directions).toContainText('4/5 of bar 1')
  await expect(directions).toContainText('4/5 of bar 3')
  for (const [label, width, scale, theme] of [['phone', 390, 1, 'light'], ['narrow-dark-large', 320, 2, 'dark'], ['wide', 1024, 1, 'light']] as const) {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ colorScheme: theme })
    await page.evaluate((scale) => { document.documentElement.style.fontSize = `${16 * scale}px` }, scale)
    expect(await directions.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`source-directions-${label}.png`), fullPage: true })
  }
  await directions.getByRole('button', { name: 'Replace saved directions', exact: true }).click()
  await expect(directions).toHaveCount(0)
  const applied = await current()
  expect(applied.catalogBinding?.revisionId).toBeDefined()
  expect(applied.rules.map((rule) => rule.dose)).toEqual([
    { amount: 1, unit: 'cap', mark: 'Bar 1', fractionOfMark: 0.8 },
    { amount: 1, unit: 'cap', mark: 'Bar 3', fractionOfMark: 0.8 },
    { amount: 1, unit: 'cap', mark: 'Bar 5' },
  ])
  expect(applied.rules.every((rule) => rule.provenance.source.startsWith('catalog-directions:'))).toBe(true)
  await page.reload()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  expect((await current()).rules).toEqual(applied.rules)
  await page.context().close()
})
