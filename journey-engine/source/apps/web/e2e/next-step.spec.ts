import { expect, test } from '@playwright/test'
import type { Id } from '@convex/_generated/dataModel'
import { api } from '../src/api'
import { convexAs, createHousehold, signUp } from './flows'

test.use({ locale: 'en-US' })

// One washer and one dryer at home, the dryer with no recorded time. Load 1 dries for 120 minutes;
// load 2 (a 30-minute wash) is held back so it ends with the dryer, and "Dryer says" re-times it.
test('at home the next wash is held back while the dryer runs long, and the dryer minutes come from the machine, never a blunt question', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await signUp(page, 'next-step', 'Sam Next')
  await createHousehold(page, 'At home')
  const { client, householdId } = await convexAs(page)
  const evidence = { source: 'Synthetic machine plate', confidence: 'verified' as const }
  const washer = await client.mutation(api.inventory.createMachine, { householdId, name: 'Home washer', applianceType: 'top_load_washer', location: 'home', highEfficiency: false,
    capacityUnits: 20, capacityConfidence: 'verified', supportedCycles: ['normal'], placements: ['direct_to_drum'], cycleMinutes: { normal: 30 }, provenance: evidence })
  const dryer = await client.mutation(api.inventory.createMachine, { householdId, name: 'Home dryer', applianceType: 'tumble_dryer', location: 'home',
    capacityUnits: 20, capacityConfidence: 'verified', heatSettings: [{ heat: 'high', label: 'Hot' }, { heat: 'low', label: 'Delicate' }], provenance: evidence })
  const detergent = await client.mutation(api.inventory.createSupply, { householdId, name: 'Synthetic HE liquid', kind: 'chemical', use: 'detergent',
    safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] }, formulation: { name: 'HE liquid', form: 'liquid', highEfficiencyCompatible: true }, provenance: evidence })
  await client.mutation(api.inventory.saveRule, { supplyId: detergent, dose: { amount: 30, unit: 'ml' }, stage: 'wash', placement: 'direct_to_drum', timing: 'before loading garments', provenance: evidence })
  const garment = async (name: string) => {
    const textileId = await client.mutation(api.inventory.createTextile, { householdId, name, color: 'White', colorGroup: 'light', firstWash: false })
    await client.mutation(api.inventory.setCare, { textileId, material: 'cotton', washMethod: 'machine', cycle: 'normal', maxTemperatureC: 40, restrictions: [], dryMethod: 'tumble_dry', dryHeat: 'high', provenance: evidence })
    return textileId
  }
  const wash = async (textileId: Id<'textiles'>, key: string) => {
    const { planId } = await client.mutation(api.plans.recompute, { householdId, selectedTextileIds: [textileId], clientInputHash: key })
    const loadId = (await client.query(api.plans.get, { planId }))!.result.loads[0]!.id
    await client.mutation(api.plans.confirmRecipe, { planId, loadId, machineId: washer })
    const { sessionId } = await client.mutation(api.execution.start, { planId, loadId, idempotencyKey: key })
    for (let step = 0; step < 30; step++) {
      const detail = await client.query(api.execution.sessionDetail, { sessionId })
      const action = detail.actions.find((entry) => entry.status === 'pending' && !entry.phase.startsWith('dryer'))
      if (action === undefined) break
      if (action.kind === 'task' && action.task === 'drum_fullness') await client.mutation(api.execution.recordDrumFullness, { sessionId, machine: 'washer', size: 'medium' })
      else if (action.kind === 'task') await client.mutation(api.actions.recordAction, { sessionId, actionId: action.id, status: 'confirmed', ...(action.task === 'start' ? { minutes: 30 } : {}) })
      else await client.mutation(api.actions.recordAction, { sessionId, actionId: action.id, status: 'skipped' })
    }
    await client.mutation(api.execution.washFinished, { sessionId })
    return sessionId
  }

  // Load 1 into the dryer for 120 minutes; load 2 planned, not started.
  const first = await wash(await garment('Synthetic long towel'), 'next-step-first')
  await client.mutation(api.dryingQueue.queueFromWasher, { sessionId: first })
  const queued = (await client.query(api.dryingQueue.queue, { householdId })).pieces.map((piece) => piece.pieceId)
  await client.mutation(api.dryingQueue.startDryer, { householdId, pieceIds: queued, dryerId: dryer, minutes: 120 })
  const nextTee = await garment('Synthetic next tee')
  await client.mutation(api.plans.recompute, { householdId, selectedTextileIds: [nextTee], clientInputHash: 'next-step-second' })

  await page.goto('/laundry')
  const next = page.getByRole('region', { name: 'Next' })
  // The load to start has no dryer time on record: nothing asks for a number and there is no clock (invariant 11).
  await expect(page.getByRole('region', { name: 'How long do your machines take?' })).toHaveCount(0)
  await expect(page.getByText('How long do your machines take?')).toHaveCount(0)
  await expect(next).toHaveCount(0)
  await page.setViewportSize({ width: 320, height: 640 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.screenshot({ path: testInfo.outputPath('next-step-ask-320.png'), fullPage: true })
  // The dryer's recorded program time is the source: with it on record, the clock comes back.
  await client.mutation(api.inventory.updateMachine, { machineId: dryer, cycleMinutes: { timed: 60 }, provenance: evidence })
  await client.mutation(api.plans.recompute, { householdId, selectedTextileIds: [nextTee], clientInputHash: 'next-step-third' })
  await page.reload()

  await expect(next.getByRole('heading', { name: /^Start load 1 at about \d{1,2}:\d{2} [AP]M$/ })).toBeVisible()
  await expect(next).toContainText(/about \d{1,2}:\d{2} [AP]M, with the dryer/)
  await expect(next).toContainText(/We’ll remind you at about \d{1,2}:\d{2}/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.screenshot({ path: testInfo.outputPath('next-step-held-320.png'), fullPage: true })

  // "Dryer says: 40 min": the dryer ends sooner, so the wash starts now and may wait about 10 min.
  await next.getByLabel('Dryer says', { exact: true }).fill('40')
  await next.getByRole('button', { name: 'Save dryer time', exact: true }).click()
  await expect(next.getByRole('heading', { name: 'Start load 1 now' })).toBeVisible()
  await expect(next).toContainText('it may wait about 10 min for the dryer')
  await page.screenshot({ path: testInfo.outputPath('next-step-now-320.png'), fullPage: true })
  await page.reload()
  await expect(page.getByRole('region', { name: 'How long do your machines take?' })).toHaveCount(0)

  // Home says the same next step, with Start.
  await page.goto('/')
  await expect(page.getByText('Start load 1 now').first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.screenshot({ path: testInfo.outputPath('next-step-home-320.png') })
})
