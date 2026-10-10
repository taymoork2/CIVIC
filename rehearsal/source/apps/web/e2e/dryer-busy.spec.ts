import { expect, test } from '@playwright/test'
import type { Id } from '@convex/_generated/dataModel'
import { api } from '../src/api'
import { convexAs, createHousehold, signUp } from './flows'

test.use({ locale: 'en-US' })

// One washer and one dryer at home. Load 1 dries; load 2's wash ends while the dryer still runs it.
test('two loads at home: the second wash ends while the dryer runs, and the hub says the dryer is busy', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await signUp(page, 'dryer-busy', 'Sam Busy')
  await createHousehold(page, 'At home')
  const { client, householdId } = await convexAs(page)
  const evidence = { source: 'Synthetic machine plate', confidence: 'verified' as const }
  const washer = await client.mutation(api.inventory.createMachine, { householdId, name: 'Home washer', applianceType: 'top_load_washer', location: 'home', highEfficiency: false,
    capacityUnits: 20, capacityConfidence: 'verified', supportedCycles: ['normal'], placements: ['direct_to_drum'], cycleMinutes: { normal: 40 }, provenance: evidence })
  const dryer = await client.mutation(api.inventory.createMachine, { householdId, name: 'Home dryer', applianceType: 'tumble_dryer', location: 'home',
    capacityUnits: 20, capacityConfidence: 'verified', heatSettings: [{ heat: 'high', label: 'Hot' }, { heat: 'low', label: 'Delicate' }], cycleMinutes: { timed: 60 }, provenance: evidence })
  const detergent = await client.mutation(api.inventory.createSupply, { householdId, name: 'Synthetic HE liquid', kind: 'chemical', use: 'detergent',
    safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] }, formulation: { name: 'HE liquid', form: 'liquid', highEfficiencyCompatible: true }, provenance: evidence })
  await client.mutation(api.inventory.saveRule, { supplyId: detergent, dose: { amount: 30, unit: 'ml' }, stage: 'wash', placement: 'direct_to_drum', timing: 'before loading garments', provenance: evidence })
  const garment = async (name: string, dryMethod: 'tumble_dry' | 'dry_flat' = 'tumble_dry') => {
    const textileId = await client.mutation(api.inventory.createTextile, { householdId, name, color: 'White', colorGroup: 'light', firstWash: false })
    await client.mutation(api.inventory.setCare, { textileId, material: 'cotton', washMethod: 'machine', cycle: 'normal', maxTemperatureC: 40, restrictions: [], dryMethod, ...(dryMethod === 'tumble_dry' ? { dryHeat: 'high' as const } : {}), provenance: evidence })
    return textileId
  }

  /** One wash through the API: every wash step recorded, then the washer's finish. */
  const wash = async (textileId: Id<'textiles'> | Id<'textiles'>[], key: string) => {
    const { planId } = await client.mutation(api.plans.recompute, { householdId, selectedTextileIds: Array.isArray(textileId) ? textileId : [textileId], clientInputHash: key })
    const loadId = (await client.query(api.plans.get, { planId }))!.result.loads[0]!.id
    await client.mutation(api.plans.confirmRecipe, { planId, loadId, machineId: washer })
    const { sessionId } = await client.mutation(api.execution.start, { planId, loadId, idempotencyKey: key })
    for (let step = 0; step < 30; step++) {
      const detail = await client.query(api.execution.sessionDetail, { sessionId })
      const action = detail.actions.find((entry) => entry.status === 'pending' && !entry.phase.startsWith('dryer') && entry.phase !== 'hold_out')
      if (action === undefined) break
      if (action.kind === 'task' && action.task === 'drum_fullness') await client.mutation(api.execution.recordDrumFullness, { sessionId, machine: 'washer', size: 'medium' })
      else if (action.kind === 'task') await client.mutation(api.actions.recordAction, { sessionId, actionId: action.id, status: 'confirmed', ...(action.task === 'start' ? { minutes: 40 } : {}) })
      else await client.mutation(api.actions.recordAction, { sessionId, actionId: action.id, status: 'skipped' })
    }
    await client.mutation(api.execution.washFinished, { sessionId })
    return sessionId
  }

  // Load 1 goes into the dryer for 60 minutes.
  const first = await wash(await garment('Synthetic busy towel'), 'dryer-busy-first')
  await client.mutation(api.dryingQueue.queueFromWasher, { sessionId: first })
  const queued = (await client.query(api.dryingQueue.queue, { householdId })).pieces.map((piece) => piece.pieceId)
  await client.mutation(api.dryingQueue.startDryer, { householdId, pieceIds: queued, dryerId: dryer, minutes: 60 })
  // A second start on the same home dryer is refused, with the reason.
  await expect(client.mutation(api.dryingQueue.startDryer, { householdId, pieceIds: queued, dryerId: dryer, minutes: 60 })).rejects.toThrow()

  // Load 2's wash ends while the dryer runs.
  const second = await wash(await garment('Synthetic busy tee'), 'dryer-busy-second')

  // Home: the hub says the dryer is busy, never "move them to a dryer".
  await page.goto('/')
  const hero = page.getByRole('region', { name: /Dryer busy until about \d{1,2}:\d{2}/ })
  await expect(hero).toBeVisible()
  await expect(page.getByText('Hang them, or wait for the dryer.', { exact: false }).first()).toBeVisible()
  await expect(page.getByText(/move them to a dryer/i)).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('dryer-busy-home-393.png'), fullPage: true })
  await page.setViewportSize({ width: 320, height: 640 })
  await expect(hero).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.screenshot({ path: testInfo.outputPath('dryer-busy-home-320.png') })

  // The load: Hang them · Wait for the dryer. Wait moves it to the queue and sets the reminder.
  await page.setViewportSize({ width: 393, height: 852 })
  await hero.getByRole('link', { name: 'Hang or wait', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/session/${second}`))
  const busy = page.getByRole('status').filter({ hasText: /^Dryer busy until about/ })
  await expect(busy.getByRole('button', { name: 'Hang them', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('dryer-busy-load-393.png'), fullPage: true })
  await page.setViewportSize({ width: 320, height: 640 })
  await busy.scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.screenshot({ path: testInfo.outputPath('dryer-busy-load-320.png') })
  await page.setViewportSize({ width: 393, height: 852 })
  await busy.getByRole('button', { name: 'Wait for the dryer', exact: true }).click()
  await expect(page).toHaveURL(/\/drying(?:\?|$)/)
  const waiting = page.getByRole('status').filter({ hasText: /^Dryer busy until about/ })
  await expect(waiting).toContainText(/We'll remind you at about \d{1,2}:\d{2}/)
  await expect(waiting.getByRole('button', { name: 'Wait for the dryer', exact: true })).toHaveCount(0)
  // The dryer can't be loaded again until load 1 is out; the button says why.
  await expect(page.getByRole('button', { name: /^Dryer busy until about/ })).toBeDisabled()
  await page.screenshot({ path: testInfo.outputPath('dryer-busy-drying-393.png'), fullPage: true })
  await page.setViewportSize({ width: 320, height: 640 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.screenshot({ path: testInfo.outputPath('dryer-busy-drying-320.png') })

  // Back home, the wet load stays the next step: no "Start" for another wash while it waits.
  await page.goto('/')
  await expect(page.getByRole('region', { name: /Dryer busy until about/ })).toBeVisible()

  // Load 3 (a tee and a dry-flat sweater) ends while the dryer still runs: "Hang them" from the load page
  // hangs the tee; the sweater is never put on a rack or line and still waits on the drying page.
  const third = await wash([await garment('Synthetic rack tee'), await garment('Synthetic flat sweater', 'dry_flat')], 'dryer-busy-third')
  await page.goto(`/session/${third}`)
  const held = page.getByRole('status').filter({ hasText: /^Dryer busy until about/ })
  await held.getByRole('button', { name: 'Hang them', exact: true }).click()
  await expect(page).toHaveURL(/\/drying(?:\?|$)/)
  await expect(page.getByText('Synthetic flat sweater').first()).toBeVisible()
  const pieces = (await client.query(api.dryingQueue.queue, { householdId })).pieces
  expect(pieces.find((piece) => piece.name === 'Synthetic flat sweater')?.status).toBe('queued')
  expect(pieces.find((piece) => piece.name === 'Synthetic rack tee')?.status).toBe('drying')
})
