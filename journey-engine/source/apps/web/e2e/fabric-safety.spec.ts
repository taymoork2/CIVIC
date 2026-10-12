import { expect, test } from '@playwright/test'
import { addProductAndWasher, answerCards, createHousehold, signUp } from './flows'

test.use({ locale: 'en-US' })

for (const minorFiber of [null, 'Wool', 'Cashmere'] as const) {
test(`a ${minorFiber === null ? 'wool garment' : `95% cotton / 5% ${minorFiber} blend`} entered at intake never uses a detergent with unrecorded enzymes`, async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await signUp(page, `fabric-${minorFiber ?? 'pure'}`, 'Fran Fabric')
  await createHousehold(page)
  await addProductAndWasher(page)

  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Closet', exact: true }).click()
  await page.getByRole('button', { name: 'Add clothes', exact: true }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: 'Sweater', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: details', exact: true }).click()
  await sheet.getByLabel('Name', { exact: true }).fill('Wool sweater')
  await sheet.getByRole('button', { name: 'Next: fabric', exact: true }).click()
  // Fabric comes from the label, on its own step; wool changes which detergents are safe.
  if (minorFiber === null) await sheet.getByRole('checkbox', { name: 'Wool', exact: true }).click()
  else {
    await sheet.getByRole('checkbox', { name: 'Cotton', exact: true }).click()
    if (minorFiber === 'Cashmere') await sheet.getByRole('button', { name: 'More fibers', exact: true }).click()
    await sheet.getByRole('checkbox', { name: minorFiber === 'Wool' ? 'Wool' : 'Other', exact: true }).click()
    if (minorFiber === 'Cashmere') await sheet.getByLabel('Other material', { exact: true }).fill('Cashmere')
    await sheet.getByLabel('Cotton percentage', { exact: true }).fill('95')
    await sheet.getByLabel(`${minorFiber === 'Wool' ? 'Wool' : 'Other'} percentage`, { exact: true }).fill('5')
  }
  await sheet.getByRole('button', { name: 'Next: color', exact: true }).click()
  await sheet.getByRole('radio', { name: 'White', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: where from', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: dye', exact: true }).click()
  await sheet.getByRole('radio', { name: 'Washed without dye running', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: care label', exact: true }).click()
  await sheet.getByRole('group', { name: 'Washtub on the tag' }).getByRole('button', { name: 'Cold, delicate', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next', exact: true }).click()
  await sheet.getByRole('radio', { name: /Tag doesn.t say/ }).click()
  await sheet.getByRole('button', { name: 'Next', exact: true }).click()
  await sheet.getByRole('radio', { name: 'Low heat', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next', exact: true }).click()
  await sheet.getByRole('radio', { name: 'No stains', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next: review', exact: true }).click()
  await sheet.getByRole('radio', { name: 'Needs washing', exact: true }).click()
  await sheet.getByRole('button', { name: 'Save item', exact: true }).click()
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()

  // Details holds the recorded composition; Care uses it for planning.
  await page.getByRole('button', { name: /^Wool sweater,/ }).click()
  await page.getByRole('dialog').getByRole('tab', { name: 'Details', exact: true }).click()
  await expect(page.getByRole('dialog').getByText(minorFiber === null ? 'Wool' : `95% cotton, 5% ${minorFiber === 'Wool' ? 'wool' : 'Cashmere'}`, { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('navigation').getByRole('link', { name: /^Laundry/ }).click()
  await page.getByRole('button', { name: 'Sort 1 piece into loads', exact: true }).click()
  await answerCards(page)
  // Tide HE liquid has no recorded enzyme facts, so the sweater waits in the hamper and the plan offers a wool-safe detergent.
  await expect(page.getByText(/Waits for a wool-safe detergent/).first()).toBeVisible()
  const options = page.getByRole('list', { name: /^Options for Wool sweater/ })
  await expect(options.getByRole('button', { name: 'Add a wool-safe detergent' })).toBeVisible()
  // The unknown bottle can be matched to its exact pack from the held row; that opens the pack lookup on its sheet.
  await options.getByRole('button', { name: "Find this bottle's exact pack" }).click()
  await expect(page.getByRole('dialog').getByText('Source details')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'I’m at the laundry room', exact: true })).toHaveCount(0)
})
}
