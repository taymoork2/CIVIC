import { expect, test } from '@playwright/test'
import { api } from '../src/api'
import { convexAs, createHousehold, signUp } from './flows'

for (const corrected of [false, true]) test(`a partial cap-mark dose survives phone reload and ${corrected ? 'an actual fill-level correction' : 'step confirmation'}`, async ({ browser }, testInfo) => {
  const context = await browser.newContext({ locale: 'en-US' })
  const page = await context.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await signUp(page, `partial-mark-${corrected}`, 'Synthetic Partial Mark')
  await createHousehold(page)
  const { client, householdId } = await convexAs(page)
  const provenance = { source: 'synthetic partial-mark label', confidence: 'verified' as const }
  const textileId = await client.mutation(api.inventory.createTextile, { householdId, name: 'Synthetic cotton tee', color: 'White', colorGroup: 'light', firstWash: false })
  await client.mutation(api.inventory.updateTextile, { textileId, kind: 't_shirt', status: 'dirty', soilLevel: 'normal' })
  await client.mutation(api.inventory.setCare, { textileId, material: 'cotton', washMethod: 'machine', cycle: 'normal', maxTemperatureC: 40, restrictions: [], provenance })
  const supplyId = await client.mutation(api.inventory.createSupply, { householdId, name: 'Synthetic marked detergent', kind: 'chemical', use: 'detergent',
    formulation: { form: 'liquid', highEfficiencyCompatible: true }, measure: { kind: 'cap', marks: [{ label: 'Bar 1', amount: 39, unit: 'ml' }] },
    safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] }, provenance })
  const machineId = await client.mutation(api.inventory.createMachine, { householdId, name: 'Synthetic washer', applianceType: 'top_load_washer', highEfficiency: true,
    capacityUnits: 8, capacityConfidence: 'verified', supportedCycles: ['normal'], placements: ['detergent_compartment', 'direct_to_drum'], cycleMinutes: { normal: 40 }, provenance })
  const initial = await client.mutation(api.plans.recompute, { householdId, selectedTextileIds: [textileId], clientInputHash: 'partial-mark-browser' })
  await page.goto(`/laundry?plan=${initial.planId}`)
  await page.getByRole('group', { name: /^Needs confirmation:/ }).getByRole('button', { name: 'Check the pack', exact: true }).click()
  await page.getByRole('radio', { name: 'Bar 1', exact: true }).click()
  await page.getByRole('button', { name: 'Less than the line?', exact: true }).click()
  const fillLevel = page.getByLabel('Fill level (% of Bar 1)', { exact: true })
  await expect(fillLevel).toHaveValue('100')
  await fillLevel.fill('101')
  await expect(page.getByRole('button', { name: 'Pick an answer', exact: true })).toBeDisabled()
  await fillLevel.fill('80')
  // No size is known yet: the line covers every load only when the person says so.
  await expect(page.getByRole('button', { name: 'Pick an answer', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Yes', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('partial-mark-entry-phone.png'), fullPage: true })
  await page.getByRole('button', { name: 'Update plan', exact: true }).click()
  await expect.poll(() => new URL(page.url()).searchParams.get('plan')).not.toBe(initial.planId)
  const planId = new URL(page.url()).searchParams.get('plan') as typeof initial.planId
  const plan = (await client.query(api.plans.get, { planId }))!
  expect(plan.result.status).toBe('ready')
  expect(plan.result.loads[0]!.treatments[0]!.dose.fractionOfMark).toBe(0.8)
  const loadId = plan.result.loads[0]!.id
  await client.mutation(api.plans.confirmRecipe, { planId, loadId, machineId })
  const { sessionId } = await client.mutation(api.execution.start, { planId, loadId, idempotencyKey: 'partial-mark-browser' })
  for (let index = 0; index < 12; index++) {
    const detail = await client.query(api.execution.sessionDetail, { sessionId })
    const step = detail.actions.find((action) => action.status === 'pending')!
    if (step.kind === 'treatment') break
    await client.mutation(api.actions.recordAction, { sessionId, actionId: step.id, status: 'confirmed' })
  }
  await page.goto(`/session/${sessionId}`)
  const start = page.getByRole('button', { name: 'Start preparation', exact: true })
  const current = page.locator('.machine-step')
  await expect(start.or(current)).toBeVisible()
  if (await start.isVisible()) await start.click()
  await expect(current).toContainText('4/5 of Bar 1')
  await expect(current).not.toContainText('39 ml')
  await page.reload()
  await expect(current).toContainText('4/5 of Bar 1')
  await page.screenshot({ path: testInfo.outputPath('partial-mark-phone.png'), fullPage: true })
  if (corrected) {
    // Departures from the instruction sit behind "Something different?", apart from the primary Done.
    await page.getByRole('button', { name: 'Something different?', exact: true }).click()
    await page.getByRole('dialog', { name: 'Something different?' }).getByRole('button', { name: 'Used a different amount', exact: true }).click()
    await expect(page.getByLabel('Fill level (% of Bar 1)', { exact: true })).toHaveValue('80')
    await page.getByLabel('Fill level (% of Bar 1)', { exact: true }).fill('100')
    await page.screenshot({ path: testInfo.outputPath('partial-mark-correction-phone.png'), fullPage: true })
    await page.getByRole('button', { name: 'Save', exact: true }).click()
  } else await page.getByRole('button', { name: 'Done · next step', exact: true }).click()
  await expect.poll(async () => (await client.query(api.execution.sessionDetail, { sessionId })).usage.find((use) => use.supplyId === supplyId)?.fractionOfMark).toBe(corrected ? 1 : 0.8)
  await expect(current).not.toContainText('Synthetic marked detergent')
  await current.focus()
  await current.press('ArrowLeft')
  await expect(current).toContainText('Synthetic marked detergent')
  if (corrected) {
    await expect(current).toContainText('Fill the cap to Bar 1')
    await expect(current).not.toContainText('4/5')
  } else await expect(current).toContainText('4/5 of Bar 1')
  await page.screenshot({ path: testInfo.outputPath('partial-mark-recorded-phone.png'), fullPage: true })
  await page.context().close()
})
