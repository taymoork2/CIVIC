import { expect, test } from '@playwright/test'
import { api } from '../src/api'
import { addClothes, addMachines, addProductAndWasher, convexAs, createHousehold, freshPage, planAndStart, signUp } from './flows'

test('sensor context never offers a precise timer and preserves manual minutes through live updates', async ({ browser }) => {
  const page = await freshPage(browser)
  try {
    await signUp(page, 'dryer-context', 'Dana Context')
    await createHousehold(page)
    await addProductAndWasher(page)
    await addMachines(page, { kind: 'Dryer', name: 'Sensor dryer', count: 1, minutes: '45', programMode: 'sensor', heat: { 'Low heat': 'Delicates' } })
    await addClothes(page, { name: 'Context tee' })
    const { client, householdId } = await convexAs(page)
    const inventory = await client.query(api.inventory.list, { householdId })
    const dryer = inventory.machines.find((machine) => machine.name === 'Sensor dryer')!
    expect(dryer.cycleMinutes.timed?.mode).toBe('sensor')
    await planAndStart(page, 1)
    // Follow only the wash; the helper's full finish path deliberately expects a fixed suggestion.
    for (let index = 0; index < 24; index++) {
      const move = page.getByRole('button', { name: 'Move to drying queue', exact: true })
      if (await move.isVisible()) { await move.click(); break }
      const next = page.getByRole('button', { name: 'Done · next step', exact: true })
      if (await next.isVisible()) { await next.click(); continue }
      const minutes = page.getByLabel(/^Minutes shown on /)
      if (await minutes.isVisible()) { await minutes.fill('40'); await page.getByRole('button', { name: /^I’ve started / }).click(); continue }
      const fullness = page.getByRole('button', { name: 'Half', exact: true })
      if (await fullness.isVisible()) { await fullness.click(); continue }
      const finished = page.getByRole('button', { name: /has finished$/ })
      if (await finished.isVisible()) { await finished.click(); continue }
      throw new Error('Unexpected wash step in dryer context case')
    }
    await page.getByRole('button', { name: /Load into/ }).first().click()
    // The room's only dryer is used without asking.
    const field = page.getByLabel('Minutes on Sensor dryer', { exact: true })
    await expect(field).toHaveValue('')
    await expect(page.getByText(/This is a sensor program/)).toBeVisible()
    await expect(page.getByRole('button', { name: /^Use suggested/ })).toHaveCount(0)
    await field.fill('37')
    await field.focus()
    await client.mutation(api.inventory.updateMachine, { machineId: dryer.machineId, capacityUnits: 8, capacityConfidence: 'observed' })
    await expect(field).toHaveValue('37')
    await expect(field).toBeFocused()
    await page.getByRole('button', { name: 'About this starting suggestion', exact: true }).click()
    await expect(page.getByText('No fixed program baseline is available.')).toBeVisible()
    await expect(field).toHaveValue('37')
    await page.getByRole('button', { name: /^I.ve started Sensor dryer/ }).click()
    const queue = await client.query(api.dryingQueue.queue, { householdId })
    expect(queue.runs[0]?.minutes).toBe(37)
  } finally { await page.context().close() }
})
