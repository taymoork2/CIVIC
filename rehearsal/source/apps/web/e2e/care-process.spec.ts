import { expect, test } from '@playwright/test'
import { api } from '../src/api'
import { addClothes, addProductAndWasher, convexAs, createHousehold, freshPage, planAndStart, signUp, openAdvanced } from './flows'

// Root runs this on its isolated integration deployment. All facts are synthetic.
test('checked care process reaches required washing steps and acknowledged drip-flat drying history', async ({ browser }, testInfo) => {
  const page = await freshPage(browser)
  try {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await signUp(page, 'care-process', 'Casey Process')
    await createHousehold(page)
    await addProductAndWasher(page)
    await addClothes(page, { name: 'Synthetic process tee', firstWash: false })
    const { client, householdId } = await convexAs(page)
    const inventory = await client.query(api.inventory.list, { householdId })
    const washer = inventory.machines[0]!
    await client.mutation(api.inventory.updateMachine, { machineId: washer.machineId, capacityUnits: 8, capacityConfidence: 'verified',
      washProcesses: { normal: { programLabel: 'Synthetic Normal / Extra Rinse / No Spin', source: 'Synthetic exact-model manual and controls', extraRinses: 1, rinseTemperatureC: 20, spinRpm: 0, spinMinutes: 0 } } })
    await page.getByRole('button', { name: /^Synthetic process tee,/ }).click()
    await page.getByRole('tab', { name: 'Care', exact: true }).click()
    await openAdvanced(page, 'Care')
    await page.getByRole('button', { name: 'Label notes', exact: true }).click()
    const label = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Label notes', exact: true }) })
    await label.getByLabel('Where you read it', { exact: true }).fill('Synthetic sewn label, front and reverse')
    const washWording = 'Maximum half drum, one extra rinse, no spin'
    const dryWording = 'Drip dry flat in shade away from direct heat'
    await label.getByLabel('Label section', { exact: true }).selectOption('washing')
    await label.getByLabel('Additional wash settings or product requirements', { exact: true }).fill(washWording)
    const wash = label.locator('fieldset').filter({ has: page.locator('legend').filter({ hasText: washWording }) }).last()
    for (const [kind, value, field] of [['maximum_fill_fraction', '0.5', 'Maximum drum fill (fraction, for example 0.5)'], ['extra_rinses', '1', 'Minimum additional rinses'], ['no_spin', null, null]] as const) {
      await wash.getByLabel('Add a supported condition', { exact: true }).selectOption(kind)
      if (value !== null) await wash.getByLabel(field!, { exact: true }).fill(value)
    }
    await wash.getByRole('checkbox', { name: 'I’ve checked that these conditions cover this entire source line', exact: true }).check()
    await label.getByLabel('Label section', { exact: true }).selectOption('drying')
    await label.getByLabel('Additional dryer or drying settings', { exact: true }).fill(dryWording)
    const dry = label.locator('fieldset').filter({ has: page.locator('legend').filter({ hasText: dryWording }) }).last()
    for (const kind of ['dry_flat', 'drip_dry', 'shade', 'no_direct_heat']) await dry.getByLabel('Add a supported condition', { exact: true }).selectOption(kind)
    await dry.getByRole('checkbox', { name: 'I’ve checked that these conditions cover this entire source line', exact: true }).check()
    await label.getByRole('button', { name: 'Save label', exact: true }).click()
    await page.reload()
    await page.getByRole('tab', { name: 'Care', exact: true }).click()
    await expect(page.getByText(washWording, { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await planAndStart(page, 1)
    const sessionUrl = page.url()
    const step = page.locator('section.machine-step').first()
    let sawProgram = false
    for (let i = 0; i < 24; i += 1) {
      const washing = page.getByRole('heading', { level: 1, name: 'Washing', exact: true })
      if (await washing.isVisible()) break
      await expect(step).toBeVisible()
      const before = await step.textContent()
      sawProgram ||= before?.includes('Synthetic Normal / Extra Rinse / No Spin') === true
      const next = page.getByRole('button', { name: 'Done · next step', exact: true })
      if (await next.isVisible()) await next.click()
      else if (await step.getByRole('button', { name: 'Half', exact: true }).isVisible()) await step.getByRole('button', { name: 'Half', exact: true }).click()
      else if (await page.getByRole('button', { name: /^I’ve started / }).isVisible()) {
        await page.getByLabel(/^Minutes shown on /).fill('40')
        await page.getByRole('button', { name: /^I’ve started / }).click()
      } else throw new Error(`Unexpected care-process step: ${before}`)
      await expect.poll(async () => await washing.isVisible() || await step.textContent().catch(() => before) !== before).toBe(true)
    }
    expect(sawProgram).toBe(true)
    await page.getByRole('button', { name: /has finished$/ }).click()
    await page.getByRole('button', { name: 'Move to drying queue', exact: true }).click()
    const start = page.getByRole('button', { name: 'Lay 1 piece flat to dry', exact: true })
    await expect(start).toBeDisabled()
    for (const wording of ['This drying place is in shade', 'This drying place is away from direct heat', 'These pieces are drying without extraction or wringing']) await page.getByRole('checkbox', { name: wording, exact: true }).check()
    const acknowledged = page.getByRole('checkbox', { name: 'I’ve followed these label instructions', exact: true })
    await acknowledged.check()
    await expect(start).toBeEnabled()
    const awayFromHeat = page.getByRole('checkbox', { name: 'This drying place is away from direct heat', exact: true })
    await awayFromHeat.uncheck()
    await expect(start).toBeDisabled()
    await awayFromHeat.check()
    await expect(start).toBeDisabled()
    await acknowledged.check()
    for (const [name, width, scale, theme] of [['phone', 390, 1, 'light'], ['narrow-dark-large', 320, 2, 'dark']] as const) {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      await page.evaluate((scale) => { document.documentElement.style.fontSize = `${16 * scale}px` }, scale)
      expect(await page.locator('main').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`care-process-${name}.png`), fullPage: true })
    }
    await start.click()
    await page.getByRole('button', { name: /^Lay flat/ }).click()
    await page.getByRole('button', { name: /^Put away / }).click()
    await page.getByRole('button', { name: /^Put away 1 piece/ }).click()
    const textileId = inventory.textiles.find((textile) => textile.name === 'Synthetic process tee')!.textileId
    const records = await client.query(api.sessions.washRecordsForTextile, { textileId })
    expect(records[0]?.drying).toMatchObject({ outcome: 'left_hanging', method: 'flat', instructions: { drying: [dryWording] }, process: { shade: true, noDirectHeat: true, drip: true } })
    expect(records[0]?.activityContext?.washer?.washProcesses?.normal?.spinRpm).toBe(0)
    expect(sessionUrl).toContain('/session/')
  } finally {
    await page.context().close()
  }
})
