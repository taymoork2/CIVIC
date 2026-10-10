import { expect, test, type Page } from '@playwright/test'
import type { Id } from '@convex/_generated/dataModel'
import { api } from '../src/api'
import { convexAs, createHousehold, signUp } from './flows'

test.use({ locale: 'en-US' })

/** The owner's kind of room, small: 3 washers and 3 identical dryers, shared, and a plan of several loads. */
async function sharedRoom(page: Page, name: string) {
  await page.setViewportSize({ width: 393, height: 852 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await signUp(page, name, 'Sky Shared')
  await createHousehold(page)
  const { client, householdId } = await convexAs(page)
  const evidence = { source: 'Synthetic machine plate', confidence: 'verified' as const }
  const washers = []
  for (const number of [1, 2, 3]) {
    washers.push(await client.mutation(api.inventory.createMachine, { householdId, name: `Washer ${number}`, applianceType: 'top_load_washer', location: 'shared', highEfficiency: false,
      capacityUnits: 20, capacityConfidence: 'verified', supportedCycles: ['normal'], placements: ['direct_to_drum'], cycleMinutes: { normal: 47 }, provenance: evidence }))
  }
  for (const number of [1, 2, 3]) {
    await client.mutation(api.inventory.createMachine, { householdId, name: `Dryer ${number}`, applianceType: 'tumble_dryer', location: 'shared',
      capacityUnits: 20, capacityConfidence: 'verified', heatSettings: [{ heat: 'high', label: 'Hot' }, { heat: 'low', label: 'Delicate' }], provenance: evidence })
  }
  const detergent = await client.mutation(api.inventory.createSupply, { householdId, name: 'Synthetic HE liquid', kind: 'chemical', use: 'detergent',
    safety: { bleachKind: 'none', incompatibleSupplyIds: [], incompatibleMaterials: [] }, formulation: { name: 'HE liquid', form: 'liquid', highEfficiencyCompatible: true }, provenance: evidence })
  await client.mutation(api.inventory.saveRule, { supplyId: detergent, dose: { amount: 30, unit: 'ml' }, stage: 'wash', placement: 'direct_to_drum', timing: 'before loading garments', provenance: evidence })
  // New dark pieces wash alone, so the plan has several loads.
  const garment = async (name: string, color: string, colorGroup: 'white' | 'black' | 'saturated' | 'medium') => {
    const textileId = await client.mutation(api.inventory.createTextile, { householdId, name, color, colorGroup, firstWash: colorGroup !== 'white' })
    await client.mutation(api.inventory.setCare, { textileId, material: 'cotton', washMethod: 'machine', cycle: 'normal', maxTemperatureC: 40, restrictions: [], dryMethod: 'tumble_dry', dryHeat: 'high', provenance: evidence })
    return textileId
  }
  const ids = [await garment('Synthetic white tee', 'White', 'white'), await garment('Synthetic black jeans', 'Black', 'black'), await garment('Synthetic red tee', 'Red', 'saturated')]
  const { planId } = await client.mutation(api.plans.recompute, { householdId, selectedTextileIds: ids, clientInputHash: name })
  const plan = (await client.query(api.plans.get, { planId }))!
  expect(plan.result.loads.length).toBeGreaterThanOrEqual(2)

  return { client, householdId, washers, planId, plan }
}

/** One wash through the API up to its dryer steps; `finished`: the washer's finish confirmed too (else its own dryer step is next). */
async function washToDryer(client: Awaited<ReturnType<typeof convexAs>>['client'], planId: Id<'plans'>, loadId: string, machineId: Id<'machines'>, key: string, finished = true) {
  await client.mutation(api.plans.confirmRecipe, { planId, loadId, machineId })
  const { sessionId } = await client.mutation(api.execution.start, { planId, loadId, machineId, idempotencyKey: key })
  for (let step = 0; step < 30; step++) {
    const detail = await client.query(api.execution.sessionDetail, { sessionId })
    const action = detail.actions.find((entry) => entry.status === 'pending' && !entry.phase.startsWith('dryer'))
    if (action === undefined) break
    if (action.kind === 'task' && action.task === 'drum_fullness') await client.mutation(api.execution.recordDrumFullness, { sessionId, machine: 'washer', size: 'medium' })
    // Not confirmed finished: started 2 minutes ago for 1 minute, so its time ran out and the dryer step is next.
    else if (action.kind === 'task') await client.mutation(api.actions.recordAction, { sessionId, actionId: action.id, status: 'confirmed', ...(action.task !== 'start' ? {} : finished ? { minutes: 47 } : { minutes: 1, at: Date.now() - 2 * 60_000 }) })
    else await client.mutation(api.actions.recordAction, { sessionId, actionId: action.id, status: 'skipped' })
  }
  if (finished) await client.mutation(api.execution.washFinished, { sessionId })
  return sessionId
}

// A shared room like the owner's trial room: several washers and dryers, no machine status. At the start
// of a pass, "Washers free" and "Dryers free" size the first washes (design 11); "None free" at the
// dryer leads to "Hang them · Wait".
test('a shared room asks what is free at the start, starts one wash per free dryer, and "None free" offers hang or wait', async ({ page }, testInfo) => {
  const { client, washers, planId, plan } = await sharedRoom(page, 'shared-start')
  // Two quick answers in the footer, under the thumb.
  await page.goto('/laundry')
  const footer = page.locator('[data-slot=task-footer]')
  await expect(footer.getByText('What’s free right now?')).toBeVisible()
  await page.setViewportSize({ width: 320, height: 640 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.screenshot({ path: testInfo.outputPath('shared-start-ask-320.png') })
  await footer.getByRole('radiogroup', { name: 'Washers free' }).getByRole('radio', { name: '3+', exact: true }).click()
  await footer.getByRole('radiogroup', { name: 'Dryers free' }).getByRole('radio', { name: '1', exact: true }).click()
  // One tumble load per free dryer; "Start all" is the person's choice. No clock time anywhere.
  await expect(page.getByRole('status').filter({ hasText: 'Start 1 wash now.' })).toContainText('One for each free dryer, plus loads that hang to dry.')
  await expect(page.getByText('Start now', { exact: true })).toHaveCount(1)
  await expect(page.getByText('Later', { exact: true })).toHaveCount(plan.result.loads.length - 1)
  await expect(page.locator('main')).not.toContainText(/about \d{1,2}:\d{2}/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.screenshot({ path: testInfo.outputPath('shared-start-picks-320.png') })
  const all = Math.min(3, plan.result.loads.length)
  await page.getByRole('button', { name: 'Load options', exact: true }).click()
  await page.getByRole('button', { name: `Start all ${all} now`, exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: `Start ${all} washes now.` })).toContainText('Some may have to wait for a dryer, or hang them.')
  await expect(page.getByText('Start now', { exact: true })).toHaveCount(all)
  // Kept on this phone across a reload, never sent anywhere.
  await page.reload()
  await expect(page.getByRole('status').filter({ hasText: `Start ${all} washes now.` })).toBeVisible()

  // The Up next row opens the first load; "Which washer?" is still asked at the machine, in number order.
  await page.getByRole('button', { name: /Open .+ load$/ }).click()
  await expect(page).toHaveURL(/plan|load/)

  // Wash one load through the API, move it to the drying queue: the counts are spent.
  const sessionId = await washToDryer(client, planId, plan.result.loads[0]!.id, washers[0]!, 'shared-start-first')
  await client.mutation(api.dryingQueue.queueFromWasher, { sessionId })

  // "Which dryer?" with none free: hang them, or wait. Nothing is called free or available.
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto('/drying')
  await page.getByRole('button', { name: 'Load into a dryer' }).first().click()
  await page.getByRole('button', { name: 'None free', exact: true }).click()
  await expect(page.getByText('No dryer free right now. Hang them, or wait for one.')).toBeVisible()
  await expect(page.locator('main')).not.toContainText(/\b(free|available) dryer\b/i)
  await page.setViewportSize({ width: 320, height: 640 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.screenshot({ path: testInfo.outputPath('shared-none-free-320.png') })
  await page.getByRole('button', { name: 'Wait for one', exact: true }).click()
  await expect(page.getByText('Waiting for a dryer. They stay on this page.')).toBeVisible()
  // Home: the washed pieces waiting to dry come first, and the plan's next load can still start on another
  // washer (a finished wash keeps its plan's loads still to start, numbered in wash order).
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto('/')
  const hero = page.locator('.home-hero')
  await expect(hero).toContainText(/washed (piece|pieces) waiting to dry/)
  await expect(hero.getByRole('link', { name: 'Start load 2', exact: true })).toBeVisible()
  await expect(hero.getByRole('link', { name: 'Plan laundry', exact: true })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('shared-wet-next-home-393.png'), fullPage: true })
  await page.setViewportSize({ width: 320, height: 640 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.screenshot({ path: testInfo.outputPath('shared-wet-next-home-320.png'), fullPage: true })
  // The dock above the tabs: the same two actions under the thumb, and no line said twice.
  await page.goto('/closet')
  const dock = page.locator('.home-dock')
  await expect(dock.getByRole('link', { name: /Start load 2/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.screenshot({ path: testInfo.outputPath('shared-wet-dock-320.png') })
  await page.goto('/drying')
  await page.getByRole('button', { name: 'Load into a dryer' }).first().click()
  await page.getByRole('button', { name: 'None free', exact: true }).click()
  await page.getByRole('button', { name: 'Hang them', exact: true }).click()
  await expect(page.getByText(/hanging to dry/)).toBeVisible()

  // The first wash is done: the start-of-pass counts are not used again.
  await page.goto('/laundry')
  await expect(page.getByText('What’s free right now?')).toHaveCount(0)
  await expect(page.getByText('Start now', { exact: true })).toHaveCount(0)
})

test('a first shared-room start from Home or the dock goes through "What’s free right now?"', async ({ page }, testInfo) => {
  await sharedRoom(page, 'shared-start-home')
  await page.goto('/')
  await page.locator('.home-hero').getByRole('link', { name: 'Open wash plan', exact: true }).click()
  await expect(page).toHaveURL(/\/laundry$/)
  const footer = page.locator('[data-slot=task-footer]')
  await expect(footer.getByText('What’s free right now?')).toBeVisible()
  await page.goto('/closet')
  await page.locator('.home-dock').getByRole('link', { name: /Start/ }).click()
  await expect(page).toHaveURL(/\/laundry$/)
  await expect(footer.getByText('What’s free right now?')).toBeVisible()
  await page.setViewportSize({ width: 320, height: 640 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.screenshot({ path: testInfo.outputPath('shared-start-from-home-320.png') })
  // Answered once, Start goes straight to the plan again.
  await footer.getByRole('button', { name: 'Skip', exact: true }).click()
  await page.goto('/')
  await page.locator('.home-hero').getByRole('link', { name: 'Open wash plan', exact: true }).click()
  await expect(page).toHaveURL(/plan/)
})

test('"None free" at a wash’s own dryer step leads to hang them or wait', async ({ page }, testInfo) => {
  const { client, washers, planId, plan } = await sharedRoom(page, 'shared-none-free-step')
  const first = await washToDryer(client, planId, plan.result.loads[0]!.id, washers[0]!, 'none-free-first', false)
  await page.goto(`/session/${first}`)
  await expect(page.getByRole('heading', { level: 2, name: 'Which dryer?', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'None free', exact: true }).click()
  await expect(page.getByText('No dryer free right now. Hang them, or wait for one.')).toBeVisible()
  await expect(page.locator('main')).not.toContainText(/Step \d+ of \d+ · Dryer \d+/)
  await expect(page.getByRole('button', { name: 'Start dryer', exact: true })).toHaveCount(0)
  await expect(page.locator('main')).not.toContainText(/\b(free|available) dryer\b/i)
  await page.setViewportSize({ width: 320, height: 640 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.screenshot({ path: testInfo.outputPath('shared-none-free-step-320.png') })
  await page.getByRole('button', { name: 'Wait for one', exact: true }).click()
  await expect(page).toHaveURL(/\/drying/)
  await expect(page.getByRole('button', { name: 'Load into a dryer' }).first()).toBeVisible()

  // The plan kept its next load; its wash ends too, and this time the pieces hang.
  await page.setViewportSize({ width: 393, height: 852 })
  const second = await washToDryer(client, planId, plan.result.loads[1]!.id, washers[1]!, 'none-free-second', false)
  await page.goto(`/session/${second}`)
  await page.getByRole('button', { name: 'None free', exact: true }).click()
  await page.getByRole('button', { name: 'Hang them', exact: true }).click()
  await expect(page).toHaveURL(/\/drying/)
  await expect(page.getByRole('button', { name: /^Hang to dry / })).toBeVisible()
})
