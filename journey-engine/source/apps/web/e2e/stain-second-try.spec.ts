import { expect, test } from '@playwright/test'
import { api } from '../src/api'
import { addProductAndWasher, convexAs, createHousehold, finishSession, freshPage, signUp } from './flows'

test.use({ locale: 'en-US' })

// Disposable account and synthetic label facts; not a real product recommendation.
test('a stain that stayed gets one more try with a different product on the next plan', async ({ browser }, testInfo) => {
  const page = await freshPage(browser)
  await page.setViewportSize({ width: 390, height: 844 })
  await signUp(page, 'stain-retry', 'Sam Stain')
  await createHousehold(page)
  await addProductAndWasher(page)

  // The fabric comes from the label at intake: cotton allows one more home try.
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Closet', exact: true }).click()
  await page.getByRole('button', { name: 'Add clothes', exact: true }).click()
  const add = page.getByRole('dialog')
  await add.getByRole('button', { name: 'T-shirt', exact: true }).click()
  await add.getByRole('button', { name: 'Next: details', exact: true }).click()
  await add.getByLabel('Name', { exact: true }).fill('Stained cotton tee')
  await add.getByRole('button', { name: 'Next: fabric', exact: true }).click()
  await add.getByRole('group', { name: 'What’s it made of?', exact: true }).getByRole('checkbox', { name: 'Cotton', exact: true }).click()
  await add.getByRole('button', { name: 'Next: color', exact: true }).click()
  await add.getByRole('radio', { name: 'White', exact: true }).click()
  await add.getByRole('button', { name: 'Next: where from', exact: true }).click()
  await add.getByRole('button', { name: 'Next: dye', exact: true }).click()
  await add.getByRole('radio', { name: 'Washed without dye running', exact: true }).click()
  await add.getByRole('button', { name: 'Next: care label', exact: true }).click()
  await add.getByRole('group', { name: 'Washtub on the tag' }).getByRole('button', { name: 'Cold', exact: true }).click()
  await add.getByRole('button', { name: 'Next', exact: true }).click()
  await add.getByRole('radio', { name: /Tag doesn.t say/ }).click()
  await add.getByRole('button', { name: 'Next', exact: true }).click()
  await add.getByRole('radio', { name: 'Low heat', exact: true }).click()
  await add.getByRole('button', { name: 'Next', exact: true }).click()
  await add.getByRole('radio', { name: 'No stains', exact: true }).click()
  await add.getByRole('button', { name: 'Next: review', exact: true }).click()
  await add.getByRole('radio', { name: 'Needs washing', exact: true }).click()
  await add.getByRole('button', { name: 'Save item', exact: true }).click()
  await add.getByRole('button', { name: 'Done', exact: true }).click()

  const { client, householdId } = await convexAs(page)
  const inventory = await client.query(api.inventory.list, { householdId })
  const tee = inventory.textiles.find((entry) => entry.name === 'Stained cotton tee')!
  const detergent = inventory.supplies[0]!
  expect(tee.care?.material).toBe('cotton')
  await client.mutation(api.inventory.saveRule, { supplyId: detergent.supplyId, dose: { amount: 30, unit: 'ml' }, stage: 'wash', placement: 'detergent_compartment', timing: 'Synthetic wash directions', provenance: { source: 'synthetic label', confidence: 'observed' } })
  const pretreat = (name: string, stainChemistry: 'protease' | 'oxygen_bleach') => client.mutation(api.inventory.createSupply, { householdId, name, kind: 'chemical',
    formulation: { form: 'liquid' }, safety: { bleachKind: stainChemistry === 'oxygen_bleach' ? 'oxygen' : 'none', incompatibleSupplyIds: [], incompatibleMaterials: [], pretreatment: {
      stainChemistry, stainKinds: ['protein'], dose: { amount: 10, unit: 'ml' }, timing: 'Synthetic label directions', safeMaterials: ['cotton'], maximumTemperatureC: 30, maximumPH: 8,
    } }, provenance: { source: `${name} synthetic label`, confidence: 'verified' } })
  const enzyme = await pretreat('Synthetic enzyme spray', 'protease')
  await client.mutation(api.closet.flagDirty, { textileIds: [tee.textileId], reasons: ['food'], soilLevel: 'normal', stainReport: { kind: 'protein', priorTreatmentAttempts: [] } })

  // First wash with the enzyme spray.
  const planned = await client.mutation(api.plans.recompute, { householdId, selectedTextileIds: [tee.textileId], pretreatmentChoices: [{ textileId: tee.textileId, supplyId: enzyme }], clientInputHash: 'stain-first-try' })
  const load = (await client.query(api.plans.get, { planId: planned.planId }))!.result.loads[0]!
  await client.mutation(api.plans.confirmRecipe, { planId: planned.planId, loadId: load.id, machineId: inventory.machines[0]!.machineId })
  const { sessionId } = await client.mutation(api.execution.start, { planId: planned.planId, loadId: load.id, idempotencyKey: 'stain-first-try' })
  await page.goto(`/session/${sessionId}`)
  await page.getByRole('button', { name: 'Start preparation', exact: true }).click()
  await finishSession(page)

  // "Stain gone?" says still there; once it is dry, "Try once more" sends it back with what was tried.
  await page.goto(`/closet?item=${tee.textileId}`)
  await page.getByRole('tab', { name: 'Care', exact: true }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('Synthetic enzyme spray', { exact: true })).toBeVisible()
  await sheet.getByRole('group', { name: 'Stain gone?' }).getByRole('button', { name: 'Still there', exact: true }).click()
  await expect(page.getByText(/Keep it out of the dryer/)).toBeVisible()
  await page.getByRole('button', { name: /^Stained cotton tee,/ }).click()
  await page.getByRole('tab', { name: 'Care', exact: true }).click()
  const next = sheet.getByRole('group', { name: 'What next?' })
  await expect(next).toBeVisible()
  await expect(next.getByText('For a valuable piece, a cleaner is safest.', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('stain-what-next-phone.png'), fullPage: true })
  await next.getByRole('button', { name: 'Try once more', exact: true }).click()
  await expect(page.getByText('In the hamper for one more try with something different.')).toBeVisible()

  // The next plan does not ask what was mixed: it proposes a different, label-backed treatment.
  const oxygen = await pretreat('Synthetic oxygen soak', 'oxygen_bleach')
  const second = await client.mutation(api.plans.recompute, { householdId, selectedTextileIds: [tee.textileId], clientInputHash: 'stain-second-try' })
  const reasons = (await client.query(api.plans.get, { planId: second.planId }))!.result.reasons
  expect(reasons.map((reason) => reason.details.cause)).not.toContain('unknown_stain_report')
  expect(reasons.find((reason) => reason.details.cause === 'pretreatment_choice_needed')?.supplyId).toBe(oxygen)
  await page.goto('/laundry')
  await page.getByRole('button', { name: /Open whites load$/ }).click()
  await expect(page.getByRole('button', { name: 'Pretreat with Synthetic oxygen soak' }).first()).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('stain-second-try-phone.png'), fullPage: true })
  await page.context().close()
})
